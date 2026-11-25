#pragma once

#include "PluginProcessor.h"
#include "../Core/McxMidiLearnDiskLibrary.h"
#include <WebView2Bridge/JuceWebView2Component.h>
#include <juce_core/juce_core.h>

#include <string>
#include <string_view>

namespace abdmcx
{

[[nodiscard]] inline std::string resolveFactoryMidiLearnDir()
{
#ifdef MCX_MIDILEARN_DIR
    const juce::File compiledDir(MCX_MIDILEARN_DIR);
    if (compiledDir.isDirectory()) return compiledDir.getFullPathName().toStdString();
#endif
    const auto exeDir = juce::File::getSpecialLocation(juce::File::currentExecutableFile).getParentDirectory();
    if (const auto sib = exeDir.getChildFile("MidiLearn"); sib.isDirectory())
        return sib.getFullPathName().toStdString();
    return {};
}

[[nodiscard]] inline juce::var buildMidiLearnProfilesPayload(const McxMidiLearnDiskLibrary& lib)
{
    juce::DynamicObject::Ptr payload = new juce::DynamicObject();
    payload->setProperty("type", "midiLearnProfiles");
    payload->setProperty("catalogJson", juce::String(lib.serializeCatalogJson()));
    return juce::var(payload.get());
}

[[nodiscard]] inline juce::var buildMidiLearnAutoDetectPayload(const McxMidiLearnDiskProfile& prof,
                                                               std::string_view reason,
                                                               std::string_view portName)
{
    juce::DynamicObject::Ptr payload = new juce::DynamicObject();
    payload->setProperty("type", "midiLearnAutoDetect");
    payload->setProperty("device", juce::String(prof.device));
    payload->setProperty("displayName", juce::String(prof.displayName));
    payload->setProperty("reason", juce::String(std::string(reason)));
    payload->setProperty("portName", juce::String(std::string(portName)));
    payload->setProperty("profileJson", juce::String(prof.rawJson));
    return juce::var(payload.get());
}

inline bool handleMidiLearnJsEvent(McxAudioProcessor& proc,
                                   abd::webview2::JuceWebView2Component* web,
                                   const juce::String& type,
                                   const juce::DynamicObject& obj)
{
    if (type == "getMidiLearnProfiles")
    {
        proc.rescanMidiLearnProfiles();
        if (web != nullptr)
            web->emitEventIfBrowserIsVisible("onNativeTelemetry", buildMidiLearnProfilesPayload(proc.midiLearnLibrary()));
        return true;
    }
    if (type == "saveMidiLearnProfile")
    {
        const auto dev = obj.getProperty("device").toString().toStdString();
        const auto rawJson = obj.getProperty("profileJson").toString().toStdString();
        const auto& wd = proc.systemSettings().workingDirectory;
        bool ok = false;
        if (!wd.empty())
        {
            const std::string dir = (std::filesystem::path(wd) / "MidiLearn").string();
            ok = proc.midiLearnLibrary().saveProfileToWorkingDir(dir, dev, rawJson);
            if (ok) proc.rescanMidiLearnProfiles();
        }
        if (web != nullptr)
        {
            web->emitEventIfBrowserIsVisible("onNativeTelemetry", buildMidiLearnProfilesPayload(proc.midiLearnLibrary()));
            juce::DynamicObject::Ptr reply = new juce::DynamicObject();
            reply->setProperty("type", "midiLearnSaved");
            reply->setProperty("ok", ok);
            reply->setProperty("device", juce::String(dev));
            web->emitEventIfBrowserIsVisible("onNativeTelemetry", juce::var(reply.get()));
        }
        return true;
    }
    return false;
}

} // namespace abdmcx
