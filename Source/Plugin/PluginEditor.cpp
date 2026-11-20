#include "PluginEditor.h"
#include "McxEditorBridgeHelpers.h"
#include "McxEngineBridgeHelpers.h"
#include "McxSongBridgeHelpers.h"
#include "McxRackBridgeHelpers.h"
#include "McxSessionStateBuilder.h"
#include "McxEditorWebViewHelpers.h"

namespace abdmcx {

McxAudioProcessorEditor::McxAudioProcessorEditor(McxAudioProcessor& p)
    : AudioProcessorEditor(&p), processor_(p) {
    abd::webview2::JuceWebView2Component::EventListeners listeners;
    listeners["mcxEvent"] = [this](const juce::var& msg) { handleJsEvent(msg); };

    webComponent_ = std::make_unique<abd::webview2::JuceWebView2Component>(
        editor_webview::mcxResourceProvider,
        std::move(listeners),
        "ms2000",
        abd::webview2::JuceWebView2Component::NativeFunctions{},
        editor_webview::getPidIsolatedWebView2Folder(),
        editor_webview::resolveInitialUrl()
    );

    addAndMakeVisible(*webComponent_);

    setResizable(true, true);
    setResizeLimits(960, 600, 2560, 1440);
    setSize(1280, 720);
    if (webComponent_ != nullptr) {
        webComponent_->setBounds(getLocalBounds());
    }

    startTimerHz(30);
}

McxAudioProcessorEditor::~McxAudioProcessorEditor() {
    stopTimer();
    webComponent_.reset();
}

void McxAudioProcessorEditor::paint(juce::Graphics& g) {
    g.fillAll(juce::Colour(0xff0a1118));
}

void McxAudioProcessorEditor::resized() {
    if (webComponent_ != nullptr) {
        webComponent_->setBounds(getLocalBounds());
    }
}

void McxAudioProcessorEditor::timerCallback() {
    if (!isUiReady_ || webComponent_ == nullptr) return;
    if (const auto dirtyMask = processor_.consumePendingEngineStateMask(); dirtyMask != 0ull) {
        for (int p = 0; p < McxEngine::kNumParts; ++p) {
            if ((dirtyMask & (1ull << p)) != 0ull) {
                webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", buildPartPresetsPayload(processor_.engine(), p));
                webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", buildPartEngineStatePayload(processor_.engine(), p));
            }
        }
    }
    if (processor_.consumeSongStateDirty()) {
        webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", buildSongAndScenesStatePayload(processor_.engine()));
    }
    if (processor_.consumeSessionStateDirty()) { const juce::ScopedLock sl(processor_.engineLock()); webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", buildSessionStatePayload(processor_.engine())); }
    const auto snap = processor_.readTelemetrySnapshot();
    if (snap.activeVoices == 0 && ++gcTickCounter_ >= 30) {
        gcTickCounter_ = 0;
        (void)processor_.collectUnusedWaves();
    }
    webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", buildTelemetryPayload(snap));
}

void McxAudioProcessorEditor::emitSystemSettings() {
    if (webComponent_ == nullptr) return;
    const auto& s = processor_.systemSettings();
    juce::DynamicObject::Ptr obj = new juce::DynamicObject();
    obj->setProperty("type", "systemSettings");
    obj->setProperty("workingDirectory", juce::String(s.workingDirectory));
    obj->setProperty("maxPolyphony", s.maxPolyphony);
    obj->setProperty("masterTuneHz", s.masterTuneHz);
    obj->setProperty("standaloneBpm", s.standaloneBpm);
    obj->setProperty("themeFamily", juce::String(s.themeFamily));
    obj->setProperty("colorScheme", juce::String(s.colorScheme));
    obj->setProperty("locale", juce::String(s.locale));
    webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", juce::var(obj.get()));
}

void McxAudioProcessorEditor::handleJsEvent(const juce::var& msg) {
    if (!msg.isObject()) return;
    auto* obj = msg.getDynamicObject();
    if (!obj) return;

    const auto type = obj->getProperty("type").toString();

    if (type == "uiReady") {
        isUiReady_ = true; emitSystemSettings();
        processor_.nativeMidiRouter().refreshDevices();
        webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", processor_.nativeMidiRouter().buildDevicesPayload(processor_.isStandaloneApp()));
        const juce::ScopedLock sl(processor_.engineLock());
        webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", buildEngineCatalogPayload(processor_.engine()));
        webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", buildPartPresetsPayload(processor_.engine(), 0));
        webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", buildPartEngineStatePayload(processor_.engine(), 0));
        webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", buildSongAndScenesStatePayload(processor_.engine()));
        webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", buildSessionStatePayload(processor_.engine()));
        webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", buildLibraryCatalogPayload(processor_.libraryService()));
        return;
    }
    if (handleSequencerJsEvent(processor_, type, *obj)) {
        return;
    }
    if (handleEngineAndBankJsEvent(processor_, webComponent_.get(), type, *obj)) {
        return;
    }
    if (handleSongAndScenesJsEvent(processor_, webComponent_.get(), type, *obj)) {
        return;
    }
    if (handleRackJsEvent(processor_, type, *obj)) {
        return;
    }
    if (type == "noteOn") {
        const int part = static_cast<int>(obj->getProperty("part"));
        const int note = static_cast<int>(obj->getProperty("note"));
        const float vel = static_cast<float>(obj->getProperty("velocity"));
        processor_.enqueueUiNoteOn(part, note, vel > 1.0f ? vel / 127.0f : vel);
        return;
    }
    if (type == "noteOff") {
        processor_.enqueueUiNoteOff(static_cast<int>(obj->getProperty("part")),
                                    static_cast<int>(obj->getProperty("note")));
        return;
    }
    if (type == "allNotesOff") {
        processor_.enqueueUiAllNotesOff();
        return;
    }
    if (type == "setParam") {
        const int part = static_cast<int>(obj->getProperty("part"));
        const float value = static_cast<float>(obj->getProperty("value"));
        if (obj->hasProperty("paramId")) {
            processor_.applyWebParam(part, static_cast<int>(obj->getProperty("paramId")), value);
        } else {
            const auto paramId = obj->getProperty("id").toString();
            if (auto* param = processor_.apvts().getParameter(paramId)) {
                param->setValueNotifyingHost(param->convertTo0to1(value));
            }
        }
        return;
    }
    if (type == "setMasterVolume") {
        processor_.setMasterVolumeLinear(static_cast<float>(obj->getProperty("volume")));
        return;
    }
    if (type == "setSendBusMute") {
        processor_.setSendBusMute(static_cast<int>(obj->getProperty("bus")),
                                  static_cast<bool>(obj->getProperty("mute")));
        return;
    }
    if (type == "setTempo") {
        processor_.setTempoBpm(static_cast<double>(obj->getProperty("bpm")));
        return;
    }
    if (type == "resetToFactory") {
        const int p = obj->hasProperty("part") ? static_cast<int>(obj->getProperty("part")) : 0;
        processor_.enqueueResetToFactory(p);
        return;
    }
    if (type == "loadBankBase64") {
        const auto b64 = obj->getProperty("base64").toString();
        juce::MemoryOutputStream decoded;
        const bool decodedOk = juce::Base64::convertFromBase64(decoded, b64);
        const bool loadedOk = decodedOk && processor_.loadBankFromMemory(
            static_cast<const std::uint8_t*>(decoded.getData()), decoded.getDataSize());
        juce::DynamicObject::Ptr reply = new juce::DynamicObject();
        reply->setProperty("type", "bankLoaded");
        reply->setProperty("ok", loadedOk);
        reply->setProperty("sizeBytes", static_cast<int>(decoded.getDataSize()));
        webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", juce::var(reply.get()));
        return;
    }
    if (type == "updateSystemSettings") {
        auto next = processor_.systemSettings();
        if (obj->hasProperty("workingDirectory")) next.workingDirectory = obj->getProperty("workingDirectory").toString().toStdString();
        if (obj->hasProperty("maxPolyphony")) next.maxPolyphony = static_cast<int>(obj->getProperty("maxPolyphony"));
        if (obj->hasProperty("masterTuneHz")) next.masterTuneHz = static_cast<float>(obj->getProperty("masterTuneHz"));
        if (obj->hasProperty("standaloneBpm")) next.standaloneBpm = static_cast<float>(obj->getProperty("standaloneBpm"));
        if (obj->hasProperty("themeFamily")) next.themeFamily = obj->getProperty("themeFamily").toString().toStdString();
        if (obj->hasProperty("colorScheme")) next.colorScheme = obj->getProperty("colorScheme").toString().toStdString();
        if (obj->hasProperty("locale")) next.locale = obj->getProperty("locale").toString().toStdString();
        processor_.updateSystemSettings(next);
        emitSystemSettings();
        return;
    }
    if (type == "chooseWorkingDir") {
        const juce::File initial(processor_.systemSettings().workingDirectory);
        folderChooser_ = std::make_unique<juce::FileChooser>("Select ABDMCX0X Working Directory (AxionikDB compatible)", initial);
        auto flags = juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectDirectories;
        folderChooser_->launchAsync(flags, [this](const juce::FileChooser& fc) {
            const auto chosen = fc.getResult();
            if (chosen.isDirectory()) {
                auto next = processor_.systemSettings();
                next.workingDirectory = chosen.getFullPathName().toStdString();
                processor_.updateSystemSettings(next);
                emitSystemSettings();
            }
        });
    }
}

} // namespace abdmcx
