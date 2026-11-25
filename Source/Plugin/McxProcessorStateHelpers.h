#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_data_structures/juce_data_structures.h>

#include "../Core/McxBankManagerBridge.h"
#include "../DSP/Core/McxEngine.h"
#include "../Hardware/McxHardwareBridge.h"
#include "../Sequencer/McxSongAndScenes.h"
#include "../Sequencer/McxSongJsonCodec.h"

namespace abdmcx
{

/** @brief Serializes APVTS parameters, part/session JSON, song/scenes, and 8-slot rack JSON into one ValueTree. */
inline juce::ValueTree serializeProcessorStateTree(juce::AudioProcessorValueTreeState& apvts,
                                                   const McxEngine& engine,
                                                   const McxHardwareBridge& hardwareBridge)
{
    juce::ValueTree root("ABDMCX0XState");
    root.addChild(apvts.copyState(), -1, nullptr);
    root.setProperty("mcxPresetJson", juce::String(McxBankManagerBridge::serializeToJson(engine, hardwareBridge, "Session")), nullptr);
    root.setProperty("mcxSongScenesJson", juce::String(serializeSongAndScenesJson(engine.songAndScenes())), nullptr);
    char rk[4096] {};
    engine.getOutputAndFx().getChassis().serializeJson(rk, sizeof(rk));
    root.setProperty("mcxRackJson", juce::String(rk), nullptr);
    {
        const auto& sc = engine.getSidechainConfig();
        juce::DynamicObject::Ptr scObj = new juce::DynamicObject();
        scObj->setProperty("audioDuckEnabled", engine.isAudioDuckEnabled());
        scObj->setProperty("midiDuckEnabled", engine.isMidiDuckEnabled());
        scObj->setProperty("sourcePart", sc.sourcePart);
        scObj->setProperty("hpfEnabled", sc.hpfEnabled);
        scObj->setProperty("hpfHz", sc.hpfHz);
        scObj->setProperty("depthDb", sc.depthDb);
        scObj->setProperty("attackMs", sc.attackMs);
        scObj->setProperty("releaseMs", sc.releaseMs);
        scObj->setProperty("releaseSyncDiv", sc.releaseSyncDiv);
        root.setProperty("mcxSidechainJson", juce::JSON::toString(juce::var(scObj.get()), true), nullptr);
    }
    return root;
}

/** @brief Restores APVTS, session preset, song/scenes, and rack state; returns true if host latency should resync. */
inline bool deserializeProcessorStateTree(const juce::ValueTree& tree,
                                        juce::AudioProcessorValueTreeState& apvts,
                                        McxEngine& engine,
                                        McxHardwareBridge& hardwareBridge)
{
    bool needsLatencyResync = false;
    if (auto paramsTree = tree.getChildWithName(apvts.state.getType()); paramsTree.isValid())
        apvts.replaceState(paramsTree);
    if (tree.hasProperty("mcxPresetJson"))
    {
        McxBankManagerBridge::deserializeFromJson(engine, hardwareBridge, tree.getProperty("mcxPresetJson").toString().toStdString());
        needsLatencyResync = true;
    }
    if (tree.hasProperty("mcxSongScenesJson"))
        (void)deserializeSongAndScenesJson(engine.songAndScenes(), tree.getProperty("mcxSongScenesJson").toString().toStdString());
    if (tree.hasProperty("mcxRackJson"))
        engine.getOutputAndFx().getChassis().deserializeJson(tree.getProperty("mcxRackJson").toString().toRawUTF8());
    if (tree.hasProperty("mcxSidechainJson"))
    {
        const auto parsed = juce::JSON::parse(tree.getProperty("mcxSidechainJson").toString());
        if (auto* so = parsed.getDynamicObject())
        {
            if (so->hasProperty("audioDuckEnabled")) engine.setAudioDuckEnabled(static_cast<bool>(so->getProperty("audioDuckEnabled")));
            if (so->hasProperty("midiDuckEnabled")) engine.setMidiDuckEnabled(static_cast<bool>(so->getProperty("midiDuckEnabled")));
            McxSidechainConfig sc = engine.getSidechainConfig();
            if (so->hasProperty("sourcePart")) sc.sourcePart = static_cast<int>(so->getProperty("sourcePart"));
            if (so->hasProperty("hpfEnabled")) sc.hpfEnabled = static_cast<bool>(so->getProperty("hpfEnabled"));
            if (so->hasProperty("hpfHz")) sc.hpfHz = static_cast<float>(so->getProperty("hpfHz"));
            if (so->hasProperty("depthDb")) sc.depthDb = static_cast<float>(so->getProperty("depthDb"));
            if (so->hasProperty("attackMs")) sc.attackMs = static_cast<float>(so->getProperty("attackMs"));
            if (so->hasProperty("releaseMs")) sc.releaseMs = static_cast<float>(so->getProperty("releaseMs"));
            if (so->hasProperty("releaseSyncDiv")) sc.releaseSyncDiv = static_cast<int>(so->getProperty("releaseSyncDiv"));
            engine.setSidechainConfig(sc);
        }
    }
    return needsLatencyResync;
}

} // namespace abdmcx
