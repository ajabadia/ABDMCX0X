#pragma once

#include "PluginProcessor.h"
#include "../Sequencer/McxSongAndScenes.h"
#include "../Sequencer/McxSongJsonCodec.h"
#include <WebView2Bridge/JuceWebView2Component.h>
#include <juce_core/juce_core.h>

namespace abdmcx
{

[[nodiscard]] inline juce::var buildSongAndScenesStatePayload(const McxEngine& engine)
{
    juce::DynamicObject::Ptr payload = new juce::DynamicObject();
    payload->setProperty("type", "songScenesState");
    payload->setProperty("stateJson", juce::String(serializeSongAndScenesJson(engine.songAndScenes())));
    return juce::var(payload.get());
}

inline void applySongBlocksFromDynamicObject(McxEngine& engine, const juce::DynamicObject& obj) noexcept
{
    auto& ss = engine.songAndScenes();
    ss.clearStagingBlocks();
    if (const auto blocksVar = obj.getProperty("blocks"); blocksVar.isArray())
    {
        if (const auto* arr = blocksVar.getArray())
        {
            for (const auto& item : *arr)
            {
                const auto* bObj = item.getDynamicObject();
                if (bObj == nullptr) continue;
                (void)ss.addStagingBlock(
                    static_cast<int>(bObj->getProperty("sceneIndex")),
                    static_cast<int>(bObj->getProperty("bars")),
                    static_cast<int>(bObj->getProperty("transposeOffset")));
            }
        }
    }
    const bool loop = obj.hasProperty("loop") ? static_cast<bool>(obj.getProperty("loop")) : true;
    ss.commitStagingBlocks(loop);
}

inline bool handleSongAndScenesJsEvent(McxAudioProcessor& proc,
                                       abd::webview2::JuceWebView2Component* web,
                                       const juce::String& type,
                                       const juce::DynamicObject& obj)
{
    if (type == "getSongScenesState")
    {
        if (web != nullptr)
            web->emitEventIfBrowserIsVisible("onNativeTelemetry", buildSongAndScenesStatePayload(proc.engine()));
        return true;
    }
    if (type == "triggerScene")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::TriggerScene;
        cmd.argU8 = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("sceneIndex")), 0, McxSongAndScenes::kNumScenes - 1));
        cmd.argU8b = static_cast<std::uint8_t>(static_cast<bool>(obj.getProperty("immediate")) ? 1 : 0);
        proc.enqueueUiCommand(cmd);
        return true;
    }
    if (type == "captureScene")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::CaptureScene;
        cmd.argU8 = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("sceneIndex")), 0, McxSongAndScenes::kNumScenes - 1));
        proc.enqueueUiCommand(cmd);
        proc.markSongStateDirty();
        return true;
    }
    if (type == "updateScene")
    {
        const int idx = static_cast<int>(obj.getProperty("sceneIndex"));
        std::uint64_t mask = static_cast<std::uint64_t>(std::clamp<int>(static_cast<int>(obj.getProperty("muteMask")), 0, 65535));
        if (const auto m64 = obj.getProperty("muteMask64"); m64.isArray())
        {
            if (const auto* arr = m64.getArray())
            {
                mask = 0ull;
                for (int w = 0; w < 4 && w < arr->size(); ++w)
                {
                    const std::uint64_t word = static_cast<std::uint64_t>(std::clamp<int>(static_cast<int>((*arr)[w]), 0, 65535));
                    mask |= (word << (w * 16));
                }
            }
        }
        const int tr = static_cast<int>(obj.getProperty("transpose"));
        const auto nameStr = obj.getProperty("name").toString().toStdString();
        proc.enqueueUiCommand(McxUiCommand::makeUpdateScene(idx, mask, tr, nameStr));
        proc.markSongStateDirty();
        return true;
    }
    if (type == "setSongMode")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::SetSongMode;
        cmd.argU8 = static_cast<std::uint8_t>(static_cast<bool>(obj.getProperty("enabled")) ? 1 : 0);
        proc.enqueueUiCommand(cmd);
        proc.markSongStateDirty();
        return true;
    }
    if (type == "setSongLoop")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::SetSongLoop;
        cmd.argU8 = static_cast<std::uint8_t>(static_cast<bool>(obj.getProperty("loop")) ? 1 : 0);
        proc.enqueueUiCommand(cmd);
        return true;
    }
    if (type == "jumpSongBlock")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::JumpSongBlock;
        cmd.paramId = static_cast<std::int16_t>(static_cast<int>(obj.getProperty("blockIndex")));
        cmd.argU8 = static_cast<std::uint8_t>(static_cast<bool>(obj.getProperty("immediate")) ? 1 : 0);
        proc.enqueueUiCommand(cmd);
        return true;
    }
    if (type == "setSongArrangement")
    {
        applySongBlocksFromDynamicObject(proc.engine(), obj);
        if (web != nullptr)
            web->emitEventIfBrowserIsVisible("onNativeTelemetry", buildSongAndScenesStatePayload(proc.engine()));
        return true;
    }
    return false;
}

} // namespace abdmcx
