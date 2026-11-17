#include "PluginEditor.h"

#if JUCE_WINDOWS
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#endif

namespace abdmcx {

namespace {

juce::File getAndPrepareWebView2UserDataFolder() {
#if JUCE_WINDOWS
    const auto pid = static_cast<uint32_t>(::GetCurrentProcessId());
#else
    const auto pid = static_cast<uint32_t>(juce::Time::getMillisecondCounter());
#endif

    auto baseFolder = juce::File::getSpecialLocation(juce::File::tempDirectory)
                          .getChildFile("ABDMCX0X_WebView2")
                          .getChildFile("pid_" + juce::String(pid));
    baseFolder.createDirectory();
    return baseFolder;
}

} // namespace

McxAudioProcessorEditor::McxAudioProcessorEditor(McxAudioProcessor& p)
    : AudioProcessorEditor(&p), processor_(p) {
    setSize(1024, 680);
    setResizable(true, true);
    setResizeLimits(800, 540, 1920, 1200);

    const auto userDataFolder = getAndPrepareWebView2UserDataFolder();

    webComponent_ = std::make_unique<abd::webview2::JuceWebView2Component>(
        userDataFolder,
        [this](const juce::var& msg) { handleJsEvent(msg); }
    );

    addAndMakeVisible(*webComponent_);

    // Cargar dev server o WebUI embebida
    juce::String devUrl = juce::SystemStats::getEnvironmentVariable("ABDMCX0X_DEV_URL", "").trim();
    if (devUrl.isNotEmpty()) {
        webComponent_->goToURL(devUrl);
    } else {
        auto indexHtml = juce::File::getCurrentWorkingDirectory()
                             .getChildFile("WebUI")
                             .getChildFile("dist")
                             .getChildFile("index.html");
        if (indexHtml.existsAsFile()) {
            webComponent_->goToURL(juce::URL(indexHtml).toString(true));
        } else {
            webComponent_->goToURL("http://localhost:5173");
        }
    }

    startTimerHz(30);
}

McxAudioProcessorEditor::~McxAudioProcessorEditor() {
    stopTimer();
    webComponent_.reset();
}

void McxAudioProcessorEditor::paint(juce::Graphics& g) {
    g.fillAll(juce::Colour(0xff18181b)); // Dark modern zinc background
}

void McxAudioProcessorEditor::resized() {
    if (webComponent_ != nullptr) {
        webComponent_->setBounds(getLocalBounds());
    }
}

void McxAudioProcessorEditor::timerCallback() {
    if (!isUiReady_ || webComponent_ == nullptr) return;

    // Telemetría periódica de voces activas y estado para WebUI
    uint32_t activeVoices = static_cast<uint32_t>(processor_.engine().getActiveVoiceCount());

    juce::DynamicObject::Ptr stateObj = new juce::DynamicObject();
    stateObj->setProperty("type", "telemetry");
    stateObj->setProperty("activeVoices", static_cast<int>(activeVoices));
    stateObj->setProperty("focusedPart", static_cast<int>(processor_.engine().getFocusedPart()));

    webComponent_->emitEventIfAvailable("onNativeTelemetry", juce::var(stateObj.get()));
}

void McxAudioProcessorEditor::handleJsEvent(const juce::var& msg) {
    if (!msg.isObject()) return;

    auto* obj = msg.getDynamicObject();
    if (!obj) return;

    auto type = obj->getProperty("type").toString();

    if (type == "uiReady") {
        isUiReady_ = true;
        return;
    }

    if (type == "setParam") {
        auto paramId = obj->getProperty("id").toString();
        float value = static_cast<float>(obj->getProperty("value"));
        if (auto* param = processor_.apvts().getParameter(paramId)) {
            param->setValueNotifyingHost(param->convertTo0to1(value));
        }
        return;
    }

    if (type == "triggerNote") {
        int note = static_cast<int>(obj->getProperty("note"));
        float vel = static_cast<float>(obj->getProperty("velocity")) / 127.0f;
        int part = static_cast<int>(obj->getProperty("part"));
        if (vel > 0.0f) {
            processor_.engine().triggerNote(part, note, vel);
        } else {
            processor_.engine().releaseNote(part, note);
        }
        return;
    }
}

} // namespace abdmcx
