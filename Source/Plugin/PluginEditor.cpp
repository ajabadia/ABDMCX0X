#include "PluginEditor.h"
#include <WebView2Bridge/WebView2ResourceProvider.h>

#if JUCE_WINDOWS
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#endif

namespace abdmcx {

namespace {

bool isDevServerReachable(const juce::URL& url) {
    const auto opts = juce::URL::InputStreamOptions(juce::URL::ParameterHandling::inAddress)
                          .withHttpRequestCmd("HEAD")
                          .withConnectionTimeoutMs(200)
                          .withNumRedirectsToFollow(0);
    auto stream = url.createInputStream(opts);
    if (stream == nullptr) return false;
    if (auto* webStream = dynamic_cast<juce::WebInputStream*>(stream.get())) {
        return webStream->getStatusCode() == 200;
    }
    return true;
}

juce::String resolveInitialUrl() {
    const auto envUrl = juce::SystemStats::getEnvironmentVariable("ABDMCX0X_DEV_URL", "").trim();
    if (envUrl.isNotEmpty() && envUrl != "0" && !envUrl.equalsIgnoreCase("off")) {
        return envUrl;
    }
    const juce::URL viteUrl("http://localhost:5330");
    if (isDevServerReachable(viteUrl)) {
        return "http://localhost:5330";
    }
    // Empty => JuceWebView2Component uses JUCE ResourceProvider root (WebUI/dist offline)
    return {};
}

juce::File getPidIsolatedWebView2Folder() {
#if JUCE_WINDOWS
    const auto pid = static_cast<uint32_t>(::GetCurrentProcessId());
#else
    const auto pid = static_cast<uint32_t>(juce::Time::getMillisecondCounter());
#endif
    juce::File baseDir;
    const auto envDir = juce::SystemStats::getEnvironmentVariable("WEBVIEW2_USER_DATA_FOLDER", "").trim();
    if (envDir.isNotEmpty()) {
        baseDir = juce::File(envDir);
    } else {
        baseDir = juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("ABDMCX0X_WebView2");
    }
    auto pidDir = baseDir.getChildFile("pid_" + juce::String(pid));
    pidDir.createDirectory();
    return pidDir;
}

juce::File locateWebUiRoot() {
    const auto exeDir = juce::File::getSpecialLocation(juce::File::currentExecutableFile).getParentDirectory();
    if (exeDir.getChildFile("WebUI").getChildFile("dist").isDirectory()) {
        return exeDir.getChildFile("WebUI");
    }
#ifdef ABDMCX0X_PROJECT_DIR
    const juce::File projWebUi = juce::File(ABDMCX0X_PROJECT_DIR).getChildFile("WebUI");
    if (projWebUi.isDirectory()) return projWebUi;
#endif
    const auto cwdWebUi = juce::File::getCurrentWorkingDirectory().getChildFile("WebUI");
    if (cwdWebUi.isDirectory()) return cwdWebUi;
    return exeDir.getChildFile("WebUI");
}

std::optional<juce::WebBrowserComponent::Resource> mcxResourceProvider(const juce::String& url) {
    const juce::String decodedPath = abd::webview2::normalizeResourcePath(url);
    if (decodedPath == "juce/juce.js" || decodedPath.endsWith("/juce.js")) {
        return std::nullopt;
    }
    const juce::File webUiDir = locateWebUiRoot();
    if (auto res = abd::webview2::resolveLocalDiskAsset(decodedPath, webUiDir)) {
        return res;
    }
    if (auto sharedRes = abd::webview2::resolveSharedAssetFile(decodedPath)) {
        return sharedRes;
    }
    return std::nullopt;
}

} // namespace

McxAudioProcessorEditor::McxAudioProcessorEditor(McxAudioProcessor& p)
    : AudioProcessorEditor(&p), processor_(p) {
    setSize(1280, 720);
    setResizable(true, true);
    setResizeLimits(960, 600, 2560, 1440);

    abd::webview2::JuceWebView2Component::EventListeners listeners;
    listeners["mcxEvent"] = [this](const juce::var& msg) { handleJsEvent(msg); };

    webComponent_ = std::make_unique<abd::webview2::JuceWebView2Component>(
        mcxResourceProvider,
        std::move(listeners),
        "ms2000",
        abd::webview2::JuceWebView2Component::NativeFunctions{},
        getPidIsolatedWebView2Folder(),
        resolveInitialUrl()
    );

    addAndMakeVisible(*webComponent_);
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

    const auto snap = processor_.readTelemetrySnapshot();
    juce::DynamicObject::Ptr payload = new juce::DynamicObject();
    payload->setProperty("type", "telemetry");
    payload->setProperty("peakL", snap.peakL);
    payload->setProperty("peakR", snap.peakR);
    payload->setProperty("activeVoices", snap.activeVoices);
    payload->setProperty("focusedPart", snap.focusedPart);
    payload->setProperty("sampleRate", snap.sampleRate);

    juce::Array<juce::var> samples;
    samples.ensureStorageAllocated(128);
    for (float s : snap.samplesL) samples.add(s);
    payload->setProperty("samplesL", samples);

    webComponent_->emitEventIfBrowserIsVisible("onNativeTelemetry", juce::var(payload.get()));
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
        isUiReady_ = true;
        emitSystemSettings();
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
    if (type == "setTempo") {
        processor_.setTempoBpm(static_cast<double>(obj->getProperty("bpm")));
        return;
    }
    if (type == "resetToFactory") {
        processor_.resetToFactory();
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
