#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "../Core/McxFactoryBank.h"
#include "../Core/McxParamRouter.h"
#include "../State/McxApvtsApplier.h"
#include "McxHostTransportSync.h"
#include "McxPatternJsonAdapter.h"
#include "McxProcessorStateHelpers.h"

#include <algorithm>
#include <cmath>
#include <string_view>

namespace abdmcx {

namespace {
struct TryLockGuard {
    const juce::CriticalSection& lock;
    bool locked;
    explicit TryLockGuard(const juce::CriticalSection& l) noexcept : lock(l), locked(l.tryEnter()) {}
    ~TryLockGuard() noexcept { if (locked) lock.exit(); }
};
} // namespace

McxAudioProcessor::McxAudioProcessor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      apvts_(*this, nullptr, "Parameters", createMcxParameterLayout()),
      hardwareBridge_(engine_) {
    McxFactoryBank::applyFactoryDefaults(engine_);
    settings_.loadFromDisk();
    updateSystemSettings(settings_);
    hydrateSharedContracts();

    for (const auto& desc : kParameterDescriptors) apvts_.addParameterListener(desc.id, this);
}

McxAudioProcessor::~McxAudioProcessor() {
    for (const auto& desc : kParameterDescriptors) apvts_.removeParameterListener(desc.id, this);
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
    hardwareBridge_.prepare(sr);
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
    for (int i = getTotalNumInputChannels(); i < totalOut; ++i) buffer.clear(i, 0, numSamples);

    const TryLockGuard rtLock(engineMutex_);
    if (!rtLock.locked) {
        buffer.clear();
        midiMessages.clear();
        return;
    }

    // Drain lock-free UI/WebView commands on audio thread (exact partIdx, zero allocations)
    drainCommandQueue(uiCommandQueue_, engine_, [this](std::uint32_t idx, float v) noexcept {
        applyApvtsIndexToEngine(idx, v);
    }, &pendingEngineStateMask_);

    // Sync DAW host transport (BPM, playing, PPQ seek) when available
    syncHostPlayHeadToEngine(getPlayHead(), engine_);

    // Process incoming DAW MIDI on Port 0 (notes -> engine, CCs/NRPNs/SysEx -> hardwareBridge without double-trigger)
    for (const auto metadata : midiMessages) {
        const auto msg = metadata.getMessage();
        const int ch1to16 = std::clamp(msg.getChannel(), 1, 16);
        if (msg.isNoteOn()) {
            engine_.routeMidiPortChannelNoteOn(0, ch1to16, msg.getNoteNumber(), msg.getFloatVelocity(), metadata.samplePosition);
        } else if (msg.isNoteOff()) {
            engine_.routeMidiPortChannelNoteOff(0, ch1to16, msg.getNoteNumber(), metadata.samplePosition);
        } else if (msg.isController()) {
            engine_.routeMidiPortChannelCc(0, ch1to16, msg.getControllerNumber(), msg.getControllerValue());
        } else if (msg.isAllNotesOff() || msg.isAllSoundOff()) {
            engine_.allNotesOff();
        }
        hardwareBridge_.processInboundMidiBuffer(
            msg.getRawData(), static_cast<std::size_t>(msg.getRawDataSize()), false, 0);
    }
    // Clear inbound buffer before emitting outbound MIDI to prevent VST3 host echo/feedback loops
    midiMessages.clear();

    // Drain any explicitly enabled real physical MIDI input devices (Ports 1..31)
    nativeMidiRouter_.drainInboundToEngine(engine_, hardwareBridge_);

    // Render internal DSP audio
    float* left = buffer.getWritePointer(0);
    float* right = totalOut > 1 ? buffer.getWritePointer(1) : left;
    engine_.processAudio(left, right, numSamples);
    hardwareBridge_.advanceBlock(numSamples);
    hardwareBridge_.getLatencyCompensator().process(left, right, numSamples);

    // Update lock-free telemetry snapshot (zero locks, zero allocations)
    float peakL = 0.0f, peakR = 0.0f;
    for (int i = 0; i < numSamples; ++i) {
        peakL = std::max(peakL, std::abs(left[i]));
        peakR = std::max(peakR, std::abs(right[i]));
    }
    lastPeakL_.store(peakL, std::memory_order_relaxed);
    lastPeakR_.store(peakR, std::memory_order_relaxed);
    lastActiveVoices_.store(engine_.getActiveVoiceCount(), std::memory_order_relaxed);

    const auto pPeaks = engine_.getPartPeaks();
    const auto pMidiPeaks = engine_.getPartMidiPeaks();
    for (std::size_t p = 0; p < static_cast<std::size_t>(McxEngine::kNumParts); ++p) {
        lastPartPeaks_[p].store(pPeaks[p], std::memory_order_relaxed);
        lastPartMidiPeaks_[p].store(pMidiPeaks[p], std::memory_order_relaxed);
    }

    const int writeIdx = 1 - scopeReadBufferIndex_.load(std::memory_order_relaxed);
    auto& dst = scopeBuffers_[static_cast<std::size_t>(writeIdx)];
    const int copyN = std::min(numSamples, 128);
    for (int i = 0; i < copyN; ++i) dst[static_cast<std::size_t>(i)] = left[i];
    for (int i = copyN; i < 128; ++i) dst[static_cast<std::size_t>(i)] = 0.0f;
    scopeReadBufferIndex_.store(writeIdx, std::memory_order_release);

    // Route outbound MIDI strictly by target port (0 = DAW Host, 1..31 = real OS MIDI output; realtime clock broadcasts to active outs)
    McxMidiOutMessage outMsg{};
    while (hardwareBridge_.getOutboundQueue().pop(outMsg)) {
        if (outMsg.length > 0 && outMsg.length <= sizeof(outMsg.bytes)) {
            const int samplePos = std::clamp(outMsg.sampleOffset, 0, std::max(0, numSamples - 1));
            const bool isRealtime = (outMsg.length == 1 && outMsg.bytes[0] >= 0xF8u);
            if (outMsg.portIndex == 0 || isRealtime)
                midiMessages.addEvent(juce::MidiMessage(outMsg.bytes, static_cast<int>(outMsg.length)), samplePos);
            if (outMsg.portIndex >= 1 || isRealtime)
                nativeMidiRouter_.enqueueOutbound(outMsg);
        }
    }
}

void McxAudioProcessor::enqueueUiNoteOn(int partIdx, int midiNote, float velocity) {
    uiCommandQueue_.push({ McxUiCommand::Type::PartNoteOn, static_cast<std::uint8_t>(std::clamp(partIdx, 0, McxEngine::kNumParts - 1)), static_cast<std::uint8_t>(std::clamp(midiNote, 0, 127)), 0, -1, std::clamp(velocity, 0.01f, 1.0f) });
}
void McxAudioProcessor::enqueueUiNoteOff(int partIdx, int midiNote) {
    uiCommandQueue_.push({ McxUiCommand::Type::PartNoteOff, static_cast<std::uint8_t>(std::clamp(partIdx, 0, McxEngine::kNumParts - 1)), static_cast<std::uint8_t>(std::clamp(midiNote, 0, 127)), 0, -1, 0.0f });
}
void McxAudioProcessor::enqueueUiAllNotesOff() { uiCommandQueue_.push({ McxUiCommand::Type::AllNotesOff, 0, 0, 0, -1, 0.0f }); }
void McxAudioProcessor::enqueuePartRoute(int partIdx, int routeMode, int midiChannel, int midiPort, int kind) {
    uiCommandQueue_.push({ McxUiCommand::Type::SetPartRoute, static_cast<std::uint8_t>(std::clamp(partIdx, 0, McxEngine::kNumParts - 1)), static_cast<std::uint8_t>(std::clamp(routeMode, 0, 2)), static_cast<std::uint8_t>(std::clamp(midiChannel, 0, 16)), static_cast<std::int16_t>(midiPort), static_cast<float>(kind) });
}
void McxAudioProcessor::applyWebParam(int partIdx, int paramId, float value) {
    if (partIdx >= 0 && partIdx < McxEngine::kNumParts) focusedPartIndex_.store(static_cast<uint32_t>(partIdx), std::memory_order_relaxed);
    uiCommandQueue_.push({ McxUiCommand::Type::SetPartParam, static_cast<std::uint8_t>(std::clamp(partIdx, 0, McxEngine::kNumParts - 1)), 0, 0, static_cast<std::int16_t>(paramId), value });
}
void McxAudioProcessor::setMasterVolumeLinear(float linearGain) { uiCommandQueue_.push({ McxUiCommand::Type::SetMasterVolume, 0, 0, 0, -1, linearGain }); }
void McxAudioProcessor::setTempoBpm(double bpm) { uiCommandQueue_.push({ McxUiCommand::Type::SetTempoBpm, 0, 0, 0, -1, static_cast<float>(bpm) }); }
void McxAudioProcessor::setSendBusMute(int busIdx, bool muted) { uiCommandQueue_.push({ McxUiCommand::Type::SetSendBusMute, 0, static_cast<std::uint8_t>(std::clamp(busIdx, 0, 3)), 0, -1, muted ? 1.0f : 0.0f }); }
void McxAudioProcessor::setLiveZeroLatency(bool enabled) { hardwareBridge_.getLatencyCompensator().setLiveZeroLatency(enabled); syncHostLatencyReport(); }
void McxAudioProcessor::enqueueTransportPlay(bool playing, bool resetToZero) { uiCommandQueue_.push({ McxUiCommand::Type::SetTransportPlay, 0, static_cast<std::uint8_t>(playing ? 1 : 0), static_cast<std::uint8_t>(resetToZero ? 1 : 0), -1, 0.0f }); }
void McxAudioProcessor::enqueueSequencerBars(int bars) { uiCommandQueue_.push({ McxUiCommand::Type::SetSequencerBars, 0, 0, 0, static_cast<std::int16_t>(std::clamp(bars, 1, 32)), 0.0f }); }
void McxAudioProcessor::enqueueSequencerGroove(int partIdx, int mode, int algorithm, int resolution, float swing50to75) {
    uiCommandQueue_.push({ McxUiCommand::Type::SetSequencerGroove, static_cast<std::uint8_t>(std::clamp(partIdx, 0, McxEngine::kNumParts - 1)), static_cast<std::uint8_t>(mode), static_cast<std::uint8_t>(algorithm), static_cast<std::int16_t>(partIdx < 0 ? -1 : partIdx), swing50to75, static_cast<std::uint8_t>(resolution) });
}
void McxAudioProcessor::uploadPartPattern(int partIdx, const juce::DynamicObject& obj) { applyPatternDtoToEngine(engine_, partIdx, obj); }
void McxAudioProcessor::enqueuePartEngineType(int partIdx, int typeIndex) { uiCommandQueue_.push({ McxUiCommand::Type::SetPartEngineType, static_cast<std::uint8_t>(std::clamp(partIdx, 0, McxEngine::kNumParts - 1)), 0, 0, static_cast<std::int16_t>(typeIndex), 0.0f }); }
void McxAudioProcessor::enqueueLoadFactoryPreset(int partIdx, int presetIndex) { uiCommandQueue_.push({ McxUiCommand::Type::LoadPartFactoryPreset, static_cast<std::uint8_t>(std::clamp(partIdx, 0, McxEngine::kNumParts - 1)), 0, 0, static_cast<std::int16_t>(presetIndex), 0.0f }); }
void McxAudioProcessor::enqueuePartEngineParam(int partIdx, std::string_view key, float value) { uiCommandQueue_.push(McxUiCommand::makeEngineParamByKey(partIdx, key, value)); }
void McxAudioProcessor::markEngineStateDirty(int partIdx) noexcept { pendingEngineStateMask_.fetch_or(1ull << std::clamp(partIdx, 0, McxEngine::kNumParts - 1), std::memory_order_release); }
void McxAudioProcessor::setPartMidiDevice(int partIdx, bool isOutput, int portIndex, const std::string& deviceName) {
    const int clampedPart = std::clamp(partIdx, 0, McxEngine::kNumParts - 1);
    {
        const juce::ScopedLock sl(engineMutex_);
        auto& p = engine_.part(clampedPart);
        if (isOutput) {
            p.midiPortIndex = static_cast<std::uint8_t>(std::clamp(portIndex, 0, 31));
            p.setMidiOutDeviceName(deviceName);
        } else {
            p.midiInPortIndex = static_cast<std::int16_t>(std::clamp(portIndex, -1, 31));
            p.setMidiInDeviceName(deviceName);
        }
    }
    if (isOutput && portIndex >= 1) (void)nativeMidiRouter_.ensureOutputOpenByPortIndex(portIndex);
    else if (!isOutput && portIndex >= 1) (void)nativeMidiRouter_.ensureInputOpenByPortIndex(portIndex);
}
void McxAudioProcessor::flushPendingUiCommandsLocked() noexcept {
    drainCommandQueue(uiCommandQueue_, engine_, [this](std::uint32_t idx, float v) noexcept {
        applyApvtsIndexToEngine(idx, v);
    }, &pendingEngineStateMask_);
}

std::size_t McxAudioProcessor::collectUnusedWaves() noexcept { const juce::ScopedLock sl(engineMutex_); return engine_.collectUnusedWaves(); }
int McxAudioProcessor::mountBankFromMemory(const std::uint8_t* data, std::size_t sizeBytes, const std::string& bankId) { return multiBankManager_.mountBankFromMemory(data, sizeBytes, bankId, true, &engine_.wavePool()); }
int McxAudioProcessor::mountBankFromFile(const std::string& filePath) { return multiBankManager_.mountBankFromFile(filePath, {}, &engine_.wavePool()); }
bool McxAudioProcessor::loadIndexedBankTone(int bankSlot, int toneIdx, int partIdx) { const juce::ScopedLock sl(engineMutex_); const bool ok = multiBankManager_.loadToneToPart(bankSlot, toneIdx, engine_, partIdx); if (ok) markEngineStateDirty(partIdx); return ok; }
bool McxAudioProcessor::loadIndexedBankKit(int bankSlot, int kitIdx, int partIdx) { const juce::ScopedLock sl(engineMutex_); const bool ok = multiBankManager_.loadDrumKitToPart(bankSlot, kitIdx, engine_, partIdx); if (ok) markEngineStateDirty(partIdx); return ok; }
bool McxAudioProcessor::assignIndexedBankWave(int bankSlot, int waveIdx, bool isDrumSlot, int targetIdx, int partIdx) { const juce::ScopedLock sl(engineMutex_); const bool ok = multiBankManager_.assignWaveToPart(bankSlot, waveIdx, isDrumSlot, targetIdx, engine_, partIdx); if (ok) markEngineStateDirty(partIdx); return ok; }
void McxAudioProcessor::syncHostLatencyReport() { setLatencySamples(static_cast<int>(hardwareBridge_.getLatencyCompensator().getEffectiveDelaySamples())); }
void McxAudioProcessor::resetToFactory() { const juce::ScopedLock sl(engineMutex_); engine_.reset(); McxFactoryBank::applyFactoryDefaults(engine_); markSessionStateDirty(); }
void McxAudioProcessor::enqueueResetToFactory(int partIdx) {
    uiCommandQueue_.push({ McxUiCommand::Type::ResetToFactory, static_cast<std::uint8_t>(std::clamp(partIdx, 0, McxEngine::kNumParts - 1)), 0, 0, -1, 0.0f });
    markSongStateDirty(); markSessionStateDirty();
}

bool McxAudioProcessor::loadBankFromMemory(const std::uint8_t* data, std::size_t sizeBytes) {
    const int slot = mountBankFromMemory(data, sizeBytes);
    const auto* bank = multiBankManager_.getBank(slot);
    if (bank == nullptr) return false;
    const juce::ScopedLock sl(engineMutex_);
    engine_.allNotesOff();
    if (bank->getDrumKitCount() > 0) (void)loadIndexedBankKit(slot, 0, 9);
    const int toneCount = bank->getToneCount();
    const int activeInitial = std::min(16, McxEngine::kNumParts);
    for (int i = 0; i < activeInitial; ++i)
        if (i != 9 && i < toneCount) (void)loadIndexedBankTone(slot, i, i);
    pendingEngineStateMask_.store(0xFFFFull, std::memory_order_release);
    markSessionStateDirty();
    return true;
}

McxTelemetrySnapshot McxAudioProcessor::readTelemetrySnapshot() const noexcept {
    const TryLockGuard telLock(engineMutex_);
    if (!telLock.locked) return McxTelemetrySnapshot {};
    const int readIdx = scopeReadBufferIndex_.load(std::memory_order_acquire);
    return captureEngineTelemetry(
        engine_, static_cast<int>(focusedPartIndex_.load(std::memory_order_relaxed)),
        currentSampleRate_.load(std::memory_order_acquire), lastPeakL_.load(std::memory_order_relaxed),
        lastPeakR_.load(std::memory_order_relaxed), lastActiveVoices_.load(std::memory_order_relaxed),
        scopeBuffers_[static_cast<std::size_t>(readIdx)], lastPartPeaks_, lastPartMidiPeaks_);
}

void McxAudioProcessor::updateSystemSettings(const McxSystemSettings& next) {
    settings_ = next;
    settings_.maxPolyphony = std::clamp(settings_.maxPolyphony, 8, 64);
    settings_.masterTuneHz = std::clamp(settings_.masterTuneHz, 415.0f, 466.0f);
    settings_.standaloneBpm = std::clamp(settings_.standaloneBpm, 40.0f, 240.0f);
    if (!settings_.workingDirectory.empty()) { McxSystemSettings::ensureWorkingDirScaffold(settings_.workingDirectory); libraryService_.scanWorkingDir(settings_.workingDirectory); }
    {
        const juce::ScopedLock sl(engineMutex_);
        engine_.setMaxPolyphony(settings_.maxPolyphony);
        engine_.setMasterTuneHz(settings_.masterTuneHz);
        engine_.setMasterTempoBpm(settings_.standaloneBpm);
    }
    settings_.saveToDisk();
}

juce::AudioProcessorEditor* McxAudioProcessor::createEditor() { return new McxAudioProcessorEditor(*this); }

void McxAudioProcessor::getStateInformation(juce::MemoryBlock& destData) {
    const juce::ScopedLock sl(engineMutex_);
    flushPendingUiCommandsLocked();
    const auto root = serializeProcessorStateTree(apvts_, engine_, hardwareBridge_);
    if (auto xml = root.createXml()) copyXmlToBinary(*xml, destData);
}

void McxAudioProcessor::setStateInformation(const void* data, int sizeInBytes) {
    auto xmlState = getXmlFromBinary(data, sizeInBytes);
    if (!xmlState) return;
    auto tree = juce::ValueTree::fromXml(*xmlState);
    if (!tree.isValid()) return;
    if (tree.hasType(apvts_.state.getType())) { apvts_.replaceState(tree); return; }
    {
        const juce::ScopedLock sl(engineMutex_);
        if (deserializeProcessorStateTree(tree, apvts_, engine_, hardwareBridge_))
            syncHostLatencyReport();
        nativeMidiRouter_.reconcileEngineDeviceNames(engine_);
    }
    pendingEngineStateMask_.store(~0ull, std::memory_order_release);
    markSongStateDirty();
    markSessionStateDirty();
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

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new abdmcx::McxAudioProcessor(); }
