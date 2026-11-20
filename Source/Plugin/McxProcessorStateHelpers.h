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
    char rk[2048] {};
    engine.getOutputAndFx().getChassis().serializeJson(rk, sizeof(rk));
    root.setProperty("mcxRackJson", juce::String(rk), nullptr);
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
    return needsLatencyResync;
}

} // namespace abdmcx
