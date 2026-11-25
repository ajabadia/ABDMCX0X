#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include <WebView2Bridge/JuceWebView2Component.h>
#include "PluginProcessor.h"

namespace abdmcx {

class McxAudioProcessorEditor : public juce::AudioProcessorEditor,
                                private juce::Timer {
public:
    explicit McxAudioProcessorEditor(McxAudioProcessor&);
    ~McxAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;
    void handleJsEvent(const juce::var& msg);
    void emitSystemSettings();

    McxAudioProcessor& processor_;
    std::unique_ptr<abd::webview2::JuceWebView2Component> webComponent_;
    std::unique_ptr<juce::FileChooser> folderChooser_;
    std::unique_ptr<juce::FileChooser> exportChooser_;
    bool isUiReady_{false};
    int gcTickCounter_{0};
    std::string lastDetectedHwProfileId_{"generic_midi"};

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(McxAudioProcessorEditor)
};

} // namespace abdmcx
