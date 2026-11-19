#pragma once

#include "PluginProcessor.h"
#include <WebView2Bridge/JuceWebView2Component.h>
#include <juce_core/juce_core.h>

namespace abdmcx
{

inline juce::var buildEngineCatalogPayload(const McxEngine& engine)
{
    juce::DynamicObject::Ptr payload = new juce::DynamicObject();
    payload->setProperty("type", "engineCatalog");

    juce::Array<juce::var> list;
    const int count = engine.getRegisteredEngineTypeCount();
    for (int i = 0; i < count; ++i)
    {
        const auto desc = engine.getRegisteredEngineDescriptor(i);
        juce::DynamicObject::Ptr item = new juce::DynamicObject();
        item->setProperty("index", i);
        item->setProperty("typeId", juce::String(desc.typeId ? desc.typeId : ""));
        item->setProperty("displayName", juce::String(desc.displayName ? desc.displayName : ""));
        item->setProperty("supportsDrumMode", desc.supportsDrumMode);
        item->setProperty("supportsBankArchives", desc.supportsBankArchives);
        item->setProperty("maxRecommendedInstances", desc.maxRecommendedInstances);
        list.add(juce::var(item.get()));
    }
    payload->setProperty("engines", list);
    return juce::var(payload.get());
}

inline juce::var buildPartPresetsPayload(const McxEngine& engine, int partIdx)
{
    const int part = std::clamp(partIdx, 0, McxEngine::kNumParts - 1);
    juce::DynamicObject::Ptr payload = new juce::DynamicObject();
    payload->setProperty("type", "partPresets");
    payload->setProperty("part", part);
    payload->setProperty("engineTypeIndex", engine.getPartEngineTypeIndex(part));
    payload->setProperty("engineTypeId", juce::String(engine.getPartEngineTypeId(part)));
    payload->setProperty("currentPreset", juce::String(engine.getPartCurrentPresetName(part)));

    juce::Array<juce::var> presets;
    const int count = engine.getPartFactoryPresetCount(part);
    for (int i = 0; i < count; ++i)
    {
        juce::DynamicObject::Ptr p = new juce::DynamicObject();
        p->setProperty("index", i);
        p->setProperty("name", juce::String(engine.getPartFactoryPresetName(part, i)));
        presets.add(juce::var(p.get()));
    }
    payload->setProperty("presets", presets);
    return juce::var(payload.get());
}

inline juce::var buildPartEngineStatePayload(const McxEngine& engine, int partIdx)
{
    const int part = std::clamp(partIdx, 0, McxEngine::kNumParts - 1);
    juce::DynamicObject::Ptr payload = new juce::DynamicObject();
    payload->setProperty("type", "partEngineState");
    payload->setProperty("part", part);
    payload->setProperty("engineTypeId", juce::String(engine.getPartEngineTypeId(part)));
    payload->setProperty("presetName", juce::String(engine.getPartCurrentPresetName(part)));
    payload->setProperty("stateJson", juce::String(engine.serializePartEngineStateJson(part)));
    return juce::var(payload.get());
}

inline bool handleEngineAndBankJsEvent(McxAudioProcessor& proc,
                                       abd::webview2::JuceWebView2Component* web,
                                       const juce::String& type,
                                       const juce::DynamicObject& obj)
{
    if (type == "getEngineCatalog")
    {
        if (web != nullptr) web->emitEventIfBrowserIsVisible("onNativeTelemetry", buildEngineCatalogPayload(proc.engine()));
        return true;
    }
    if (type == "getPartPresets")
    {
        const int part = static_cast<int>(obj.getProperty("part"));
        if (web != nullptr) web->emitEventIfBrowserIsVisible("onNativeTelemetry", buildPartPresetsPayload(proc.engine(), part));
        return true;
    }
    if (type == "setPartEngine")
    {
        const int part = static_cast<int>(obj.getProperty("part"));
        int typeIdx = obj.hasProperty("typeIndex") ? static_cast<int>(obj.getProperty("typeIndex")) : -1;
        if (typeIdx < 0 && obj.hasProperty("typeId"))
            typeIdx = proc.engine().engineRegistry().findEngineTypeIndex(obj.getProperty("typeId").toString().toRawUTF8());
        if (typeIdx >= 0) proc.enqueuePartEngineType(part, typeIdx);
        return true;
    }
    if (type == "loadFactoryPreset")
    {
        const int part = static_cast<int>(obj.getProperty("part"));
        const int presetIdx = static_cast<int>(obj.getProperty("presetIndex"));
        proc.enqueueLoadFactoryPreset(part, presetIdx);
        return true;
    }
    if (type == "setPartEngineParam")
    {
        const int part = static_cast<int>(obj.getProperty("part"));
        const auto keyStr = obj.getProperty("key").toString().toStdString();
        const float value = static_cast<float>(obj.getProperty("value"));
        proc.enqueuePartEngineParam(part, keyStr, value);
        return true;
    }
    if (type == "getPartEngineState")
    {
        const int part = static_cast<int>(obj.getProperty("part"));
        if (web != nullptr) web->emitEventIfBrowserIsVisible("onNativeTelemetry", buildPartEngineStatePayload(proc.engine(), part));
        return true;
    }
    if (type == "indexBankFile")
    {
        const int slot = proc.mountBankFromFile(obj.getProperty("filePath").toString().toStdString());
        juce::DynamicObject::Ptr reply = new juce::DynamicObject();
        reply->setProperty("type", "bankIndexed");
        reply->setProperty("slot", slot);
        reply->setProperty("ok", slot >= 0);
        if (web != nullptr) web->emitEventIfBrowserIsVisible("onNativeTelemetry", juce::var(reply.get()));
        return true;
    }
    if (type == "loadBankItemOnDemand")
    {
        const int part = static_cast<int>(obj.getProperty("part"));
        const int bankSlot = static_cast<int>(obj.getProperty("bankSlot"));
        const int itemIdx = static_cast<int>(obj.getProperty("itemIndex"));
        const bool isKit = obj.getProperty("kind").toString() == "drum_kit";
        const bool ok = isKit ? proc.loadIndexedBankKit(bankSlot, itemIdx, part)
                              : proc.loadIndexedBankTone(bankSlot, itemIdx, part);
        juce::DynamicObject::Ptr reply = new juce::DynamicObject();
        reply->setProperty("type", "bankItemLoaded");
        reply->setProperty("part", part);
        reply->setProperty("ok", ok);
        if (web != nullptr) web->emitEventIfBrowserIsVisible("onNativeTelemetry", juce::var(reply.get()));
        if (ok && web != nullptr) web->emitEventIfBrowserIsVisible("onNativeTelemetry", buildPartEngineStatePayload(proc.engine(), part));
        return true;
    }
    return false;
}

} // namespace abdmcx
