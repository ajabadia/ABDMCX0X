#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "../Core/McxBankLoader.h"
#include "../Core/McxFactoryBank.h"
#include "../Core/McxParamRouter.h"
#include "../State/McxApvtsApplier.h"

#include <algorithm>
#include <cmath>
#include <string_view>

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
    if (contractsDir.isDirectory()) { hardwareBridge_.loadContractsDirectory(contractsDir.getFullPathName().toStdString()); return; }
#endif
    const auto exeDir = juce::File::getSpecialLocation(juce::File::currentExecutableFile).getParentDirectory();
    if (const auto sib = exeDir.getChildFile("Contracts"); sib.isDirectory()) {
        hardwareBridge_.loadContractsDirectory(sib.getFullPathName().toStdString());
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
    uiCommandQueue_.clear();
    syncHostLatencyReport();
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

    // Drain lock-free UI/WebView commands on audio thread (exact partIdx, zero allocations)
    drainCommandQueue(uiCommandQueue_, engine_, [this](std::uint32_t idx, float v) noexcept {
        applyApvtsIndexToEngine(idx, v);
    });

    // Sync host tempo if available
    if (auto* playHead = getPlayHead()) {
        if (const auto pos = playHead->getPosition(); pos.hasValue() && pos->getBpm().hasValue()) {
            engine_.setTempoBpm(*pos->getBpm());
        }
    }

    // Process incoming DAW MIDI (notes -> engine, CCs/NRPNs/SysEx -> hardwareBridge without double-trigger)
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
            msg.getRawData(), static_cast<std::size_t>(msg.getRawDataSize()), false);
    }
    // Clear inbound buffer before emitting outbound MIDI to prevent VST3 host echo/feedback loops
    midiMessages.clear();

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

    const auto pPeaks = engine_.getPartPeaks();
    const auto pMidiPeaks = engine_.getPartMidiPeaks();
    for (std::size_t p = 0; p < 16; ++p) {
        lastPartPeaks_[p].store(pPeaks[p], std::memory_order_relaxed);
        lastPartMidiPeaks_[p].store(pMidiPeaks[p], std::memory_order_relaxed);
    }

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
    uiCommandQueue_.push({ McxUiCommand::Type::PartNoteOn, static_cast<std::uint8_t>(std::clamp(partIdx, 0, McxEngine::kNumParts - 1)),
                           static_cast<std::uint8_t>(std::clamp(midiNote, 0, 127)), 0, -1, std::clamp(velocity, 0.01f, 1.0f) });
}
void McxAudioProcessor::enqueueUiNoteOff(int partIdx, int midiNote) {
    uiCommandQueue_.push({ McxUiCommand::Type::PartNoteOff, static_cast<std::uint8_t>(std::clamp(partIdx, 0, McxEngine::kNumParts - 1)),
                           static_cast<std::uint8_t>(std::clamp(midiNote, 0, 127)), 0, -1, 0.0f });
}
void McxAudioProcessor::enqueueUiAllNotesOff() {
    uiCommandQueue_.push({ McxUiCommand::Type::AllNotesOff, 0, 0, 0, -1, 0.0f });
}
void McxAudioProcessor::enqueuePartRoute(int partIdx, int routeMode, int midiChannel, int midiPort, int kind) {
    uiCommandQueue_.push({ McxUiCommand::Type::SetPartRoute, static_cast<std::uint8_t>(std::clamp(partIdx, 0, McxEngine::kNumParts - 1)),
                           static_cast<std::uint8_t>(std::clamp(routeMode, 0, 2)), static_cast<std::uint8_t>(std::clamp(midiChannel, 0, 16)),
                           static_cast<std::int16_t>(midiPort), static_cast<float>(kind) });
}
void McxAudioProcessor::applyWebParam(int partIdx, int paramId, float value) {
    if (partIdx >= 0 && partIdx < McxEngine::kNumParts)
        focusedPartIndex_.store(static_cast<uint32_t>(partIdx), std::memory_order_relaxed);
    uiCommandQueue_.push({ McxUiCommand::Type::SetPartParam, static_cast<std::uint8_t>(std::clamp(partIdx, 0, McxEngine::kNumParts - 1)),
                           0, 0, static_cast<std::int16_t>(paramId), value });
}
void McxAudioProcessor::setMasterVolumeLinear(float linearGain) {
    uiCommandQueue_.push({ McxUiCommand::Type::SetMasterVolume, 0, 0, 0, -1, linearGain });
}
void McxAudioProcessor::setTempoBpm(double bpm) {
    uiCommandQueue_.push({ McxUiCommand::Type::SetTempoBpm, 0, 0, 0, -1, static_cast<float>(bpm) });
}
void McxAudioProcessor::setSendBusMute(int busIdx, bool muted) {
    uiCommandQueue_.push({ McxUiCommand::Type::SetSendBusMute, 0, static_cast<std::uint8_t>(std::clamp(busIdx, 0, 3)), 0, -1, muted ? 1.0f : 0.0f });
}
void McxAudioProcessor::setLiveZeroLatency(bool enabled) {
    hardwareBridge_.getLatencyCompensator().setLiveZeroLatency(enabled);
    syncHostLatencyReport();
}
void McxAudioProcessor::syncHostLatencyReport() {
    setLatencySamples(static_cast<int>(hardwareBridge_.getLatencyCompensator().getEffectiveDelaySamples()));
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

    const auto& fx = const_cast<McxEngine&>(engine_).getOutputAndFx();
    const auto t = fx.getTelemetry();
    snap.peakSendA = t.peakSendA; snap.peakSendB = t.peakSendB;
    snap.peakSendC = t.peakSendC; snap.peakSendD = t.peakSendD;
    snap.limiterGrDb = t.limiterGainReductionDb;
    for (int b = 0; b < 4; ++b) snap.sendBusMutes[static_cast<std::size_t>(b)] = fx.isSendBusMuted(b);
    const auto l = fx.getActiveSendLabels();
    snap.sendNameA = l.sendA; snap.sendNameB = l.sendB;
    snap.sendNameC = l.sendC; snap.sendNameD = l.sendD;
    snap.lfoPhase = (snap.activeVoices > 0) ? 1.0f : 0.0f;
    for (std::size_t p = 0; p < 16; ++p) {
        snap.partPeaks[p] = lastPartPeaks_[p].load(std::memory_order_relaxed);
        snap.partMidiPeaks[p] = lastPartMidiPeaks_[p].load(std::memory_order_relaxed);
    }
    return snap;
}

void McxAudioProcessor::updateSystemSettings(const McxSystemSettings& next) {
    settings_ = next;
    settings_.maxPolyphony = std::clamp(settings_.maxPolyphony, 8, 64);
    settings_.masterTuneHz = std::clamp(settings_.masterTuneHz, 415.0f, 466.0f);
    settings_.standaloneBpm = std::clamp(settings_.standaloneBpm, 40.0f, 240.0f);
    if (!settings_.workingDirectory.empty()) McxSystemSettings::ensureWorkingDirScaffold(settings_.workingDirectory);
    engine_.setMaxPolyphony(settings_.maxPolyphony); engine_.setMasterTuneHz(settings_.masterTuneHz);
    engine_.setMasterTempoBpm(settings_.standaloneBpm); settings_.saveToDisk();
}

juce::AudioProcessorEditor* McxAudioProcessor::createEditor() { return new McxAudioProcessorEditor(*this); }

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
        syncHostLatencyReport();
    }
}

void McxAudioProcessor::parameterChanged(const juce::String& parameterID, float newValue) {
    const std::string_view idView(parameterID.toRawUTF8());
    std::int16_t foundIdx = -1;
    for (const auto& d : kParameterDescriptors) {
        if (idView == d.id) { foundIdx = static_cast<std::int16_t>(d.index); break; }
    }
    if (foundIdx < 0) return;
    if (auto* mm = juce::MessageManager::getInstanceWithoutCreating(); mm != nullptr && mm->isThisTheMessageThread())
        uiCommandQueue_.push({ McxUiCommand::Type::SetApvtsParam, 0, 0, 0, foundIdx, newValue });
    else
        applyApvtsIndexToEngine(static_cast<std::uint32_t>(foundIdx), newValue);
}

void McxAudioProcessor::applyApvtsIndexToEngine(std::uint32_t paramIdx, float value) noexcept {
    applyApvtsParamIndex(engine_, focusedPartIndex_, paramIdx, value);
}

} // namespace abdmcx

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() {
    return new abdmcx::McxAudioProcessor();
}
