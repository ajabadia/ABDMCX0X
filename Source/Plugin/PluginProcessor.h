#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_devices/juce_audio_devices.h>
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <string_view>
#include "../DSP/Core/McxEngine.h"
#include "../Hardware/McxHardwareBridge.h"
#include "../Core/McxBankManagerBridge.h"
#include "../Core/McxCommandQueue.h"
#include "../Core/McxLibraryService.h"
#include "../Core/McxMultiBankManager.h"
#include "../Core/McxSystemSettings.h"
#include "../State/ParameterRegistry.gen.h"
#include "../State/ParameterLayout.h"
#include "McxNativeMidiRouter.h"
#include "McxTelemetryReader.h"

namespace abdmcx {

class McxAudioProcessor : public juce::AudioProcessor,
                          public juce::AudioProcessorValueTreeState::Listener {
public:
    McxAudioProcessor();
    ~McxAudioProcessor() override;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;

    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "ABDMCX0X"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 2.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return "Default"; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    void parameterChanged(const juce::String& parameterID, float newValue) override;

    // Thread-safe WebUI control surface (called from Message/UI thread)
    void enqueueUiNoteOn(int partIdx, int midiNote, float velocity);
    void enqueueUiNoteOff(int partIdx, int midiNote);
    void enqueueUiAllNotesOff();
    void enqueuePartRoute(int partIdx, int routeMode, int midiChannel, int midiPort, int kind);
    void applyWebParam(int partIdx, int paramId, float value);
    void setMasterVolumeLinear(float linearGain);
    void setTempoBpm(double bpm);
    void setSendBusMute(int busIdx, bool muted);
    void setLiveZeroLatency(bool enabled);
    void enqueueTransportPlay(bool playing, bool resetToZero);
    void enqueueSequencerBars(int bars);
    void enqueueSequencerGroove(int partIdx, int mode, int algorithm, int resolution, float swing50to75);
    void uploadPartPattern(int partIdx, const juce::DynamicObject& obj);
    void enqueuePartEngineType(int partIdx, int typeIndex);
    void enqueueLoadFactoryPreset(int partIdx, int presetIndex);
    void enqueuePartEngineParam(int partIdx, std::string_view key, float value);
    void enqueueUiCommand(const McxUiCommand& cmd) { uiCommandQueue_.push(cmd); }
    void markSongStateDirty() noexcept { pendingSongStateDirty_.store(true, std::memory_order_release); }
    [[nodiscard]] bool consumeSongStateDirty() noexcept { return pendingSongStateDirty_.exchange(false, std::memory_order_acq_rel); }
    void markSessionStateDirty() noexcept { pendingSessionStateDirty_.store(true, std::memory_order_release); }
    [[nodiscard]] bool consumeSessionStateDirty() noexcept { return pendingSessionStateDirty_.exchange(false, std::memory_order_acq_rel); }
    void markEngineStateDirty(int partIdx) noexcept;
    [[nodiscard]] std::uint64_t consumePendingEngineStateMask() noexcept { return pendingEngineStateMask_.exchange(0ull, std::memory_order_acq_rel); }
    [[nodiscard]] bool isStandaloneApp() const noexcept { return wrapperType == wrapperType_Standalone; }
    [[nodiscard]] McxNativeMidiRouter& nativeMidiRouter() noexcept { return nativeMidiRouter_; }
    void setPartMidiDevice(int partIdx, bool isOutput, int portIndex, const std::string& deviceName);
    [[nodiscard]] McxLibraryService& libraryService() noexcept { return libraryService_; }
    [[nodiscard]] const juce::CriticalSection& engineLock() const noexcept { return engineMutex_; }
    std::size_t collectUnusedWaves() noexcept;
    int mountBankFromMemory(const std::uint8_t* data, std::size_t sizeBytes, const std::string& bankId = {});
    int mountBankFromFile(const std::string& filePath);
    bool loadIndexedBankTone(int bankSlot, int toneIdx, int partIdx);
    bool loadIndexedBankKit(int bankSlot, int kitIdx, int partIdx);
    void resetToFactory();
    void enqueueResetToFactory(int partIdx = 0);
    bool loadBankFromMemory(const std::uint8_t* data, std::size_t sizeBytes);
    McxTelemetrySnapshot readTelemetrySnapshot() const noexcept;
    const McxSystemSettings& systemSettings() const noexcept { return settings_; }
    void updateSystemSettings(const McxSystemSettings& next);

    [[nodiscard]] McxEngine& engine() noexcept { return engine_; }
    [[nodiscard]] const McxEngine& engine() const noexcept { return engine_; }
    [[nodiscard]] McxHardwareBridge& hardwareBridge() noexcept { return hardwareBridge_; }
    [[nodiscard]] McxMultiBankManager& bankManager() noexcept { return multiBankManager_; }
    [[nodiscard]] juce::AudioProcessorValueTreeState& apvts() noexcept { return apvts_; }

private:
    juce::AudioProcessorValueTreeState apvts_;
    McxEngine engine_;
    McxHardwareBridge hardwareBridge_;
    McxNativeMidiRouter nativeMidiRouter_;
    McxMultiBankManager multiBankManager_;
    McxLibraryService libraryService_{};
    McxSystemSettings settings_{};
    McxCommandQueue<1024> uiCommandQueue_;
    std::atomic<std::uint64_t> pendingEngineStateMask_{0ull};
    std::atomic<bool> pendingSongStateDirty_{false};
    std::atomic<bool> pendingSessionStateDirty_{false};
    mutable juce::CriticalSection engineMutex_{};

    std::atomic<uint32_t> focusedPartIndex_{0};
    std::atomic<double> currentSampleRate_{48000.0};
    std::atomic<float> lastPeakL_{0.0f};
    std::atomic<float> lastPeakR_{0.0f};
    std::atomic<int> lastActiveVoices_{0};
    std::array<std::atomic<float>, McxEngine::kNumParts> lastPartPeaks_{};
    std::array<std::atomic<float>, McxEngine::kNumParts> lastPartMidiPeaks_{};

    std::array<std::array<float, 128>, 2> scopeBuffers_{};
    std::atomic<int> scopeReadBufferIndex_{0};

    void applyApvtsIndexToEngine(std::uint32_t paramIdx, float value) noexcept;
    void syncHostLatencyReport();
    void hydrateSharedContracts();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(McxAudioProcessor)
};

} // namespace abdmcx
