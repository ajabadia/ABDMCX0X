#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <atomic>
#include "../DSP/Core/McxEngine.h"
#include "../Hardware/McxHardwareBridge.h"
#include "../Hardware/McxLatencyCompensator.h"
#include "../Core/McxBankManagerBridge.h"
#include "../MIDI/McxMidiOutQueue.h"
#include "../State/ParameterRegistry.gen.h"
#include "../State/ParameterLayout.h"

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

    [[nodiscard]] McxEngine& engine() noexcept { return engine_; }
    [[nodiscard]] const McxEngine& engine() const noexcept { return engine_; }
    [[nodiscard]] McxHardwareBridge& hardwareBridge() noexcept { return hardwareBridge_; }
    [[nodiscard]] McxBankManagerBridge& bankManagerBridge() noexcept { return bankManagerBridge_; }
    [[nodiscard]] juce::AudioProcessorValueTreeState& apvts() noexcept { return apvts_; }

private:
    juce::AudioProcessorValueTreeState apvts_;
    McxEngine engine_;
    McxHardwareBridge hardwareBridge_;
    McxLatencyCompensator compensator_;
    McxBankManagerBridge bankManagerBridge_;
    McxMidiOutQueue midiOutQueue_;

    std::atomic<uint32_t> focusedPartIndex_{0};

    void applyParameterToEngine(const juce::String& paramId, float value);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(McxAudioProcessor)
};

} // namespace abdmcx
