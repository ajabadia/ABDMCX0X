#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "../Core/McxBankLoader.h"
#include "../Core/McxFactoryBank.h"
#include "../Core/McxParamRouter.h"
#include "../State/Conversion.gen.h"

#include <algorithm>
#include <cmath>

namespace abdmcx {

McxAudioProcessor::McxAudioProcessor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts_(*this, nullptr, "Parameters", createMcxParameterLayout()),
      hardwareBridge_(engine_) {
    McxFactoryBank::applyFactoryDefaults(engine_);
    settings_.loadFromDisk();
    updateSystemSettings(settings_);
    hydrateSharedContracts();

    for (const auto& desc : kParameterDescriptors) {
        apvts_.addParameterListener(desc.id, this);
    }
}

McxAudioProcessor::~McxAudioProcessor() {
    for (const auto& desc : kParameterDescriptors) {
        apvts_.removeParameterListener(desc.id, this);
    }
}

void McxAudioProcessor::hydrateSharedContracts() {
#ifdef ABDSHARED_CONTRACTS_DIR
    const juce::File contractsDir(ABDSHARED_CONTRACTS_DIR);
    if (contractsDir.isDirectory()) {
        hardwareBridge_.loadContractsDirectory(contractsDir.getFullPathName().toStdString());
        return;
    }
#endif
    const auto exeDir = juce::File::getSpecialLocation(juce::File::currentExecutableFile).getParentDirectory();
    const auto siblingContracts = exeDir.getChildFile("Contracts");
    if (siblingContracts.isDirectory()) {
        hardwareBridge_.loadContractsDirectory(siblingContracts.getFullPathName().toStdString());
    }
}

bool McxAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo()
        || layouts.getMainOutputChannelSet() == juce::AudioChannelSet::mono();
}

void McxAudioProcessor::prepareToPlay(double sampleRate, int /*samplesPerBlock*/) {
    const double sr = sampleRate > 1000.0 ? sampleRate : 48000.0;
    currentSampleRate_.store(sr, std::memory_order_release);
    engine_.prepare(sr);
    hardwareBridge_.getLatencyCompensator().prepare(sr);
    uiMidiCollector_.reset(sr);
}

void McxAudioProcessor::releaseResources() {
    engine_.reset();
}

void McxAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) {
    juce::ScopedNoDenormals noDenormals;

    const int totalOut = getTotalNumOutputChannels();
    const int numSamples = buffer.getNumSamples();
    for (int i = getTotalNumInputChannels(); i < totalOut; ++i) {
        buffer.clear(i, 0, numSamples);
    }

    // Merge lock-free UI keyboard / drum pad MIDI events into the block
    uiMidiCollector_.removeNextBlockOfMessages(midiMessages, numSamples);

    // Sync host tempo if available
    if (auto* playHead = getPlayHead()) {
        if (const auto pos = playHead->getPosition(); pos.hasValue() && pos->getBpm().hasValue()) {
            engine_.setTempoBpm(*pos->getBpm());
        }
    }

    // Process incoming MIDI (DAW + UI + Hardware inbound)
    for (const auto metadata : midiMessages) {
        const auto msg = metadata.getMessage();
        const int ch1to16 = std::clamp(msg.getChannel(), 1, 16);
        if (msg.isNoteOn()) {
            engine_.routeMidiChannelNoteOn(ch1to16, msg.getNoteNumber(), msg.getFloatVelocity(), metadata.samplePosition);
        } else if (msg.isNoteOff()) {
            engine_.routeMidiChannelNoteOff(ch1to16, msg.getNoteNumber(), metadata.samplePosition);
        } else if (msg.isAllNotesOff() || msg.isAllSoundOff()) {
            engine_.allNotesOff();
        }
        hardwareBridge_.processInboundMidiBuffer(
            msg.getRawData(), static_cast<std::size_t>(msg.getRawDataSize()));
    }

    // Render internal DSP audio
    float* left = buffer.getWritePointer(0);
    float* right = totalOut > 1 ? buffer.getWritePointer(1) : left;
    engine_.processAudio(left, right, numSamples);

    hardwareBridge_.getLatencyCompensator().process(left, right, numSamples);

    // Update lock-free telemetry snapshot (zero locks, zero allocations)
    float peakL = 0.0f;
    float peakR = 0.0f;
    for (int i = 0; i < numSamples; ++i) {
        peakL = std::max(peakL, std::abs(left[i]));
        peakR = std::max(peakR, std::abs(right[i]));
    }
    lastPeakL_.store(peakL, std::memory_order_relaxed);
    lastPeakR_.store(peakR, std::memory_order_relaxed);
    lastActiveVoices_.store(engine_.getActiveVoiceCount(), std::memory_order_relaxed);

    const int writeIdx = 1 - scopeReadBufferIndex_.load(std::memory_order_relaxed);
    auto& dst = scopeBuffers_[static_cast<std::size_t>(writeIdx)];
    const int copyN = std::min(numSamples, 128);
    for (int i = 0; i < copyN; ++i) dst[static_cast<std::size_t>(i)] = left[i];
    for (int i = copyN; i < 128; ++i) dst[static_cast<std::size_t>(i)] = 0.0f;
    scopeReadBufferIndex_.store(writeIdx, std::memory_order_release);

    // Drain queued hardware mirror MIDI/NRPN/SysEx into host MIDI output
    McxMidiOutMessage outMsg{};
    while (hardwareBridge_.getOutboundQueue().pop(outMsg)) {
        if (outMsg.length > 0 && outMsg.length <= sizeof(outMsg.bytes)) {
            const int samplePos = std::clamp(outMsg.sampleOffset, 0, std::max(0, numSamples - 1));
            midiMessages.addEvent(juce::MidiMessage(outMsg.bytes, static_cast<int>(outMsg.length)), samplePos);
        }
    }
}

void McxAudioProcessor::enqueueUiNoteOn(int partIdx, int midiNote, float velocity) {
    const int ch = std::clamp(static_cast<int>(engine_.part(partIdx).midiChannel), 1, 16);
    const auto vel = std::clamp(velocity, 0.01f, 1.0f);
    auto msg = juce::MidiMessage::noteOn(ch, std::clamp(midiNote, 0, 127), vel);
    msg.setTimeStamp(juce::Time::getMillisecondCounterHiRes() * 0.001);
    uiMidiCollector_.addMessageToQueue(msg);
}

void McxAudioProcessor::enqueueUiNoteOff(int partIdx, int midiNote) {
    const int ch = std::clamp(static_cast<int>(engine_.part(partIdx).midiChannel), 1, 16);
    auto msg = juce::MidiMessage::noteOff(ch, std::clamp(midiNote, 0, 127));
    msg.setTimeStamp(juce::Time::getMillisecondCounterHiRes() * 0.001);
    uiMidiCollector_.addMessageToQueue(msg);
}

void McxAudioProcessor::enqueueUiAllNotesOff() {
    auto msg = juce::MidiMessage::allNotesOff(1);
    msg.setTimeStamp(juce::Time::getMillisecondCounterHiRes() * 0.001);
    uiMidiCollector_.addMessageToQueue(msg);
}

void McxAudioProcessor::applyWebParam(int partIdx, int paramId, float value) {
    if (partIdx >= 0 && partIdx < McxEngine::kNumParts) {
        focusedPartIndex_.store(static_cast<uint32_t>(partIdx), std::memory_order_relaxed);
    }
    applyWebPartParam(engine_, partIdx, paramId, value);
}

void McxAudioProcessor::setMasterVolumeLinear(float linearGain) {
    engine_.setMasterVolume(std::clamp(linearGain, 0.0f, 1.5f));
}

void McxAudioProcessor::setTempoBpm(double bpm) {
    engine_.setTempoBpm(std::clamp(bpm, 20.0, 300.0));
}

void McxAudioProcessor::resetToFactory() {
    engine_.reset();
    McxFactoryBank::applyFactoryDefaults(engine_);
}

bool McxAudioProcessor::loadBankFromMemory(const std::uint8_t* data, std::size_t sizeBytes) {
    if (!data || sizeBytes == 0) return false;
    McxBankLoader loader;
    if (!loader.loadFromMemory(data, sizeBytes)) return false;

    if (loader.getDrumKitCount() > 0) {
        loader.applyDrumKitToPart(0, engine_.part(9));
    }
    const int toneCount = loader.getToneCount();
    for (int i = 0; i < McxEngine::kNumParts; ++i) {
        if (i == 9) continue;
        if (i < toneCount) loader.applyToneToPart(i, engine_.part(i));
    }
    return true;
}

McxTelemetrySnapshot McxAudioProcessor::readTelemetrySnapshot() const noexcept {
    McxTelemetrySnapshot snap;
    snap.peakL = lastPeakL_.load(std::memory_order_relaxed);
    snap.peakR = lastPeakR_.load(std::memory_order_relaxed);
    snap.activeVoices = lastActiveVoices_.load(std::memory_order_relaxed);
    snap.focusedPart = static_cast<int>(focusedPartIndex_.load(std::memory_order_relaxed));
    snap.sampleRate = currentSampleRate_.load(std::memory_order_acquire);
    const int readIdx = scopeReadBufferIndex_.load(std::memory_order_acquire);
    snap.samplesL = scopeBuffers_[static_cast<std::size_t>(readIdx)];
    return snap;
}

void McxAudioProcessor::updateSystemSettings(const McxSystemSettings& next) {
    settings_ = next;
    settings_.maxPolyphony = std::clamp(settings_.maxPolyphony, 8, 64);
    settings_.masterTuneHz = std::clamp(settings_.masterTuneHz, 415.0f, 466.0f);
    settings_.standaloneBpm = std::clamp(settings_.standaloneBpm, 40.0f, 240.0f);
    if (!settings_.workingDirectory.empty()) {
        McxSystemSettings::ensureWorkingDirScaffold(settings_.workingDirectory);
    }
    engine_.setMaxPolyphony(settings_.maxPolyphony);
    engine_.setMasterTuneHz(settings_.masterTuneHz);
    engine_.setMasterTempoBpm(settings_.standaloneBpm);
    settings_.saveToDisk();
}

juce::AudioProcessorEditor* McxAudioProcessor::createEditor() {
    return new McxAudioProcessorEditor(*this);
}

void McxAudioProcessor::getStateInformation(juce::MemoryBlock& destData) {
    juce::ValueTree root("ABDMCX0XState");
    root.addChild(apvts_.copyState(), -1, nullptr);
    root.setProperty("mcxPresetJson",
                     juce::String(McxBankManagerBridge::serializeToJson(engine_, hardwareBridge_, "Session")),
                     nullptr);
    if (auto xml = root.createXml()) copyXmlToBinary(*xml, destData);
}

void McxAudioProcessor::setStateInformation(const void* data, int sizeInBytes) {
    auto xmlState = getXmlFromBinary(data, sizeInBytes);
    if (!xmlState) return;
    auto tree = juce::ValueTree::fromXml(*xmlState);
    if (!tree.isValid()) return;

    if (tree.hasType(apvts_.state.getType())) {
        apvts_.replaceState(tree);
        return;
    }
    if (auto paramsTree = tree.getChildWithName(apvts_.state.getType()); paramsTree.isValid()) {
        apvts_.replaceState(paramsTree);
    }
    if (tree.hasProperty("mcxPresetJson")) {
        McxBankManagerBridge::deserializeFromJson(
            engine_, hardwareBridge_, tree.getProperty("mcxPresetJson").toString().toStdString());
    }
}

void McxAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue) {
    applyParameterToEngine(parameterID, newValue);
}

void McxAudioProcessor::applyParameterToEngine(const juce::String& paramId, float value) {
    if (paramId == ParamId::FocusedPartIndex) {
        focusedPartIndex_.store(static_cast<uint32_t>(std::clamp(static_cast<int>(value), 0, 15)));
        engine_.setFocusedPart(static_cast<int>(focusedPartIndex_.load()));
        return;
    }
    if (paramId == ParamId::MasterVolumeDb) { engine_.setMasterVolume(dbToGain(value)); return; }
    if (paramId == ParamId::OutputCharacter) { engine_.setOutputCharacter(static_cast<McxOutputCharacter>(static_cast<int>(value))); return; }
    if (paramId == ParamId::PartialBudgetMode) {
        const int idx = static_cast<int>(value);
        engine_.setPartialBudget(idx == 1 ? 28 : (idx == 2 ? 64 : (idx == 3 ? 32 : 128)));
        return;
    }
    if (paramId == ParamId::MachinePersona) { engine_.setMachinePersona(static_cast<McxMachinePersona>(static_cast<int>(value))); return; }
    if (paramId == ParamId::PolyphonyVoices) { engine_.setMaxPolyphony(static_cast<int>(value)); return; }

    auto& p = engine_.part(static_cast<int>(focusedPartIndex_.load()));
    if (paramId == ParamId::PartRouteMode) p.routeMode = static_cast<McxPartRouteMode>(static_cast<int>(value));
    else if (paramId == ParamId::PartLevel) p.level = std::clamp(value, 0.0f, 1.0f);
    else if (paramId == ParamId::PartPan) p.pan = std::clamp(value, -1.0f, 1.0f);
    else if (paramId == ParamId::PartFilterModel) {
        p.filterModel = static_cast<McxFilterModel>(std::clamp(static_cast<int>(value), 0, 5));
        for (auto& partial : p.partials) partial.filterModel = p.filterModel;
    } else if (paramId == ParamId::TvfCutoffOffset) {
        for (auto& partial : p.partials) partial.cutoffHz = std::clamp(12000.0f + value * 100.0f, 20.0f, 20000.0f);
    } else if (paramId == ParamId::TvfResonanceOffset) {
        for (auto& partial : p.partials) partial.resonance = std::clamp(0.15f + value * 0.01f, 0.0f, 0.98f);
    } else if (paramId == ParamId::ZplaneMorph) {
        for (auto& partial : p.partials) partial.zplaneMorph = value;
    } else if (paramId == ParamId::PartReverbSend) p.reverbSend = std::clamp(value * 0.01f, 0.0f, 1.0f);
    else if (paramId == ParamId::PartChorusSend) p.chorusSend = std::clamp(value * 0.01f, 0.0f, 1.0f);
    else if (paramId == ParamId::VectorX) p.vectorX = std::clamp(value, -1.0f, 1.0f);
    else if (paramId == ParamId::VectorY) p.vectorY = std::clamp(value, -1.0f, 1.0f);
    else if (paramId == ParamId::DrumMapMode) p.drumMapMode = static_cast<McxDrumMapMode>(static_cast<int>(value));
}

} // namespace abdmcx

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() {
    return new abdmcx::McxAudioProcessor();
}
