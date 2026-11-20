#pragma once

#include "PluginProcessor.h"
#include "../Core/McxBankManagerBridge.h"
#include <juce_core/juce_core.h>
#include <algorithm>
#include <cmath>

namespace abdmcx
{

inline juce::var buildSessionStatePayload(const McxEngine& engine)
{
    juce::DynamicObject::Ptr obj = new juce::DynamicObject();
    const auto& fx = engine.getOutputAndFx();
    obj->setProperty("type", "sessionState");
    obj->setProperty("masterGain", engine.getMasterVolume());
    obj->setProperty("globalTranspose", engine.getTransposer().getTransposeSemitones());
    obj->setProperty("dacCharacter", static_cast<int>(engine.getOutputCharacter()));
    obj->setProperty("reverbMacro", fx.getReverbMacro());
    obj->setProperty("chorusMacro", fx.getChorusMacro());
    obj->setProperty("limiterEnabled", fx.isLimiterEnabled());
    obj->setProperty("limiterCeilingDb", fx.getLimiterCeilingDb());
    obj->setProperty("fxTopology", fx.getUiTopology());

    juce::Array<juce::var> targets;
    for (int b = 0; b < 4; ++b) targets.add(fx.getSendSlotTarget(b));
    obj->setProperty("sendTargets", targets);

    char rk[2048] {};
    fx.getChassis().serializeJson(rk, sizeof(rk));
    obj->setProperty("rackJson", juce::String(rk));
    obj->setProperty("bankLayoutJson", juce::String(engine.serializeBankLayoutJson()));

    juce::Array<juce::var> parts;
    for (int i = 0; i < McxEngine::kNumParts; ++i)
    {
        const auto& p = engine.part(i);
        juce::DynamicObject::Ptr po = new juce::DynamicObject();
        po->setProperty("index", i);
        po->setProperty("enabled", p.enabled);
        po->setProperty("name", juce::String(engine.getPartDisplayPresetName(i)));
        po->setProperty("kind", p.isDrumKit ? "drum_map" : "chromatic");
        po->setProperty("midiChannel", static_cast<int>(p.midiChannel));
        po->setProperty("midiPortIndex", static_cast<int>(p.midiPortIndex));
        po->setProperty("midiInPortIndex", static_cast<int>(p.midiInPortIndex));
        po->setProperty("midiOutDeviceName", juce::String(static_cast<const char*>(p.midiOutDeviceName)));
        po->setProperty("midiInDeviceName", juce::String(static_cast<const char*>(p.midiInDeviceName)));
        po->setProperty("routeMode", static_cast<int>(p.routeMode));
        po->setProperty("mute", p.mute);
        po->setProperty("solo", p.solo);
        po->setProperty("followTranspose", p.followGlobalTranspose);
        po->setProperty("engineTypeIndex", engine.getPartEngineTypeIndex(i));
        po->setProperty("engineTypeId", juce::String(engine.getPartEngineTypeId(i)));
        po->setProperty("partLevel", p.level);
        po->setProperty("partPan", p.pan);
        po->setProperty("reverbSend", p.reverbSend);
        po->setProperty("chorusSend", p.chorusSend);
        po->setProperty("delaySend", p.delaySend);
        po->setProperty("auxSend", p.auxSend);
        po->setProperty("sendAPre", p.reverbSendPre);
        po->setProperty("sendBPre", p.chorusSendPre);
        po->setProperty("sendCPre", p.delaySendPre);
        po->setProperty("sendDPre", p.auxSendPre);
        po->setProperty("insertSlot", p.insertSlot);
        po->setProperty("driveType", static_cast<int>(p.driveType));
        po->setProperty("driveAmount", p.driveAmount);
        po->setProperty("eqLowGain", p.eqLowGainDb);
        po->setProperty("eqMidGain", p.eqMidGainDb);
        po->setProperty("eqHighGain", p.eqHighGainDb);
        const float cutNorm = std::clamp(std::log(std::max(20.0f, p.partials[0].cutoffHz) / 20.0f) / std::log(1000.0f), 0.0f, 1.0f);
        po->setProperty("filterCutoff", cutNorm);
        po->setProperty("filterResonance", p.partials[0].resonance);
        po->setProperty("filterModel", static_cast<int>(p.filterModel));
        po->setProperty("structureMode", static_cast<int>(p.structureMode));
        po->setProperty("pitchCoarse", static_cast<int>(p.partials[0].coarseSemitones));
        po->setProperty("pitchFine", p.partials[0].fineCents);
        po->setProperty("lfo1Shape", static_cast<int>(p.lfo1Shape));
        po->setProperty("lfo1Sync", p.lfo1Sync);
        po->setProperty("lfo1Rate", p.lfo1Rate);
        po->setProperty("lfo1Depth", p.lfo1Depth);
        po->setProperty("lfo1Target", static_cast<int>(p.lfo1Target));
        po->setProperty("lfo2Shape", static_cast<int>(p.lfo2Shape));
        po->setProperty("lfo2Sync", p.lfo2Sync);
        po->setProperty("lfo2Rate", p.lfo2Rate);
        po->setProperty("lfo2Depth", p.lfo2Depth);
        po->setProperty("lfo2Target", static_cast<int>(p.lfo2Target));
        parts.add(juce::var(po.get()));
    }
    obj->setProperty("parts", parts);
    return juce::var(obj.get());
}

inline juce::var buildLibraryCatalogPayload(const McxLibraryService& lib)
{
    juce::DynamicObject::Ptr obj = new juce::DynamicObject();
    obj->setProperty("type", "libraryCatalog");
    obj->setProperty("catalogJson", juce::String(lib.serializeCatalogJson()));
    return juce::var(obj.get());
}

inline bool savePartPresetToDisk(McxAudioProcessor& proc, const juce::DynamicObject& obj)
{
    const int part = std::clamp<int>(static_cast<int>(obj.getProperty("part")), 0, McxEngine::kNumParts - 1);
    const auto name = obj.getProperty("name").toString().trim();
    const auto sublib = obj.getProperty("sublibrary").toString().trim();
    const int catId = static_cast<int>(obj.getProperty("categoryId"));
    if (name.isEmpty()) return false;

    std::string engineTypeId, engState;
    {
        const juce::ScopedLock sl(proc.engineLock());
        proc.engine().setPartPresetName(part, name.toRawUTF8());
        engineTypeId = proc.engine().getPartEngineTypeId(part);
        engState = proc.engine().serializePartEngineStateJson(part);
        proc.markEngineStateDirty(part);
        proc.markSessionStateDirty();
    }
    const auto wd = proc.systemSettings().workingDirectory;
    if (wd.empty()) return true;

    juce::DynamicObject::Ptr po = new juce::DynamicObject();
    po->setProperty("schema", "abd_mcx0x_part_v1");
    po->setProperty("name", name);
    po->setProperty("categoryId", catId);
    po->setProperty("engineTypeId", juce::String(engineTypeId));
    po->setProperty("engineStateJson", juce::String(engState));
    return proc.libraryService().savePartPresetJson(
        wd, sublib.isEmpty() ? "User" : sublib.toStdString(), name.toStdString(), catId,
        juce::JSON::toString(juce::var(po.get())).toStdString());
}

inline bool saveMultiPresetToDisk(McxAudioProcessor& proc, const juce::DynamicObject& obj)
{
    const auto name = obj.getProperty("name").toString().trim();
    const auto sublib = obj.getProperty("sublibrary").toString().trim();
    const int catId = static_cast<int>(obj.getProperty("categoryId"));
    const auto wd = proc.systemSettings().workingDirectory;
    if (name.isEmpty() || wd.empty()) return false;

    std::string json;
    {
        const juce::ScopedLock sl(proc.engineLock());
        json = McxBankManagerBridge::serializeToJson(proc.engine(), proc.hardwareBridge(), name.toStdString());
    }
    return proc.libraryService().saveMultiPresetJson(wd, sublib.isEmpty() ? "User" : sublib.toStdString(), name.toStdString(), catId, json);
}

inline bool loadCatalogItemFromDisk(McxAudioProcessor& proc, int part, const juce::String& itemId, const juce::String& filePath)
{
    const juce::ScopedLock sl(proc.engineLock());
    if (itemId.isNotEmpty() && proc.libraryService().loadCatalogItemOnDemand(itemId.toStdString(), proc.bankManager(), proc.engine(), part))
    {
        proc.markEngineStateDirty(part); proc.markSessionStateDirty();
        return true;
    }
    const juce::File f(filePath);
    if (!f.existsAsFile()) return false;
    const auto txt = f.loadFileAsString();
    if (filePath.endsWithIgnoreCase(".abdmulti"))
    {
        if (!McxBankManagerBridge::deserializeFromJson(proc.engine(), proc.hardwareBridge(), txt.toStdString())) return false;
        for (int i = 0; i < McxEngine::kNumParts; ++i) proc.markEngineStateDirty(i);
        proc.markSessionStateDirty();
        return true;
    }
    const auto parsed = juce::JSON::parse(txt);
    if (auto* po = parsed.getDynamicObject())
    {
        const auto typeId = po->getProperty("engineTypeId").toString().toStdString();
        const auto name = po->getProperty("name").toString();
        const auto engJson = po->getProperty("engineStateJson").toString().toStdString();
        if (!typeId.empty()) (void)proc.engine().selectPartEngineById(part, typeId.c_str());
        if (!engJson.empty()) (void)proc.engine().deserializePartEngineStateJson(part, engJson);
        if (name.isNotEmpty()) proc.engine().setPartPresetName(part, name.toRawUTF8());
        proc.markEngineStateDirty(part); proc.markSessionStateDirty();
        return true;
    }
    return false;
}

} // namespace abdmcx
