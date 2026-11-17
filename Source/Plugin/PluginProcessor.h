#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_devices/juce_audio_devices.h>
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include "../DSP/Core/McxEngine.h"
#include "../Hardware/McxHardwareBridge.h"
#include "../Core/McxBankManagerBridge.h"
#include "../Core/McxSystemSettings.h"
#include "../State/ParameterRegistry.gen.h"
#include "../State/ParameterLayout.h"

namespace abdmcx {

struct McxTelemetrySnapshot {
    float peakL{0.0f};
    float peakR{0.0f};
    int activeVoices{0};
    int focusedPart{0};
    double sampleRate{48000.0};
    std::array<float, 128> samplesL{};
};

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
    void applyWebParam(int partIdx, int paramId, float value);
    void setMasterVolumeLinear(float linearGain);
    void setTempoBpm(double bpm);
    void resetToFactory();
    bool loadBankFromMemory(const std::uint8_t* data, std::size_t sizeBytes);
    McxTelemetrySnapshot readTelemetrySnapshot() const noexcept;
    const McxSystemSettings& systemSettings() const noexcept { return settings_; }
    void updateSystemSettings(const McxSystemSettings& next);

    [[nodiscard]] McxEngine& engine() noexcept { return engine_; }
    [[nodiscard]] const McxEngine& engine() const noexcept { return engine_; }
    [[nodiscard]] McxHardwareBridge& hardwareBridge() noexcept { return hardwareBridge_; }
    [[nodiscard]] juce::AudioProcessorValueTreeState& apvts() noexcept { return apvts_; }

private:
    juce::AudioProcessorValueTreeState apvts_;
    McxEngine engine_;
    McxHardwareBridge hardwareBridge_;
    McxSystemSettings settings_{};
    juce::MidiMessageCollector uiMidiCollector_;

    std::atomic<uint32_t> focusedPartIndex_{0};
    std::atomic<double> currentSampleRate_{48000.0};
    std::atomic<float> lastPeakL_{0.0f};
    std::atomic<float> lastPeakR_{0.0f};
    std::atomic<int> lastActiveVoices_{0};

    std::array<std::array<float, 128>, 2> scopeBuffers_{};
    std::atomic<int> scopeReadBufferIndex_{0};

    void applyParameterToEngine(const juce::String& paramId, float value);
    void hydrateSharedContracts();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(McxAudioProcessor)
};

} // namespace abdmcx
