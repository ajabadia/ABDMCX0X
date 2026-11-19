#pragma once

#include "PluginProcessor.h"
#include <juce_core/juce_core.h>
#include <algorithm>

namespace abdmcx
{

inline bool handleRackJsEvent(McxAudioProcessor& proc, const juce::String& type, const juce::DynamicObject& obj)
{
    if (type == "setRackSlot")
    {
        const auto slot = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("slot")), 0, 7));
        const auto engine = static_cast<std::int16_t>(static_cast<int>(obj.getProperty("engine")));
        const auto name = obj.getProperty("name").toString().toStdString();
        proc.enqueueUiCommand(McxUiCommand::makeKeyed(McxUiCommand::Type::SetRackSlotEngine, slot, engine, 0.0f, name));
        return true;
    }
    if (type == "setRackSlotName")
    {
        const auto slot = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("slot")), 0, 7));
        const auto name = obj.getProperty("name").toString().toStdString();
        proc.enqueueUiCommand(McxUiCommand::makeKeyed(McxUiCommand::Type::SetRackSlotName, slot, -1, 0.0f, name));
        return true;
    }
    if (type == "removeRackSlot")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::RemoveRackSlot;
        cmd.argU8 = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("slot")), 0, 7));
        proc.enqueueUiCommand(cmd);
        return true;
    }
    if (type == "moveRackSlot")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::MoveRackSlot;
        cmd.argU8 = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("from")), 0, 7));
        cmd.argU8b = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("to")), 0, 7));
        proc.enqueueUiCommand(cmd);
        return true;
    }
    if (type == "setRackBypass")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::SetRackSlotBypass;
        cmd.argU8 = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("slot")), 0, 7));
        cmd.value = static_cast<bool>(obj.getProperty("bypass")) ? 1.0f : 0.0f;
        proc.enqueueUiCommand(cmd);
        return true;
    }
    if (type == "setRackParams")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::SetRackSlotParams;
        cmd.argU8 = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("slot")), 0, 7));
        cmd.value = static_cast<float>(obj.getProperty("p1"));
        cmd.value2 = static_cast<float>(obj.getProperty("p2"));
        cmd.value3 = obj.hasProperty("mix") ? static_cast<float>(obj.getProperty("mix")) : 1.0f;
        proc.enqueueUiCommand(cmd);
        return true;
    }
    if (type == "setRackParamByKey")
    {
        const auto slot = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("slot")), 0, 7));
        const auto keyStr = obj.getProperty("key").toString().toStdString();
        const float value = static_cast<float>(obj.getProperty("value"));
        proc.enqueueUiCommand(McxUiCommand::makeKeyed(McxUiCommand::Type::SetRackSlotParamByKey, slot, -1, value, keyStr));
        return true;
    }
    if (type == "setRackPreset")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::SetRackSlotPreset;
        cmd.argU8 = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("slot")), 0, 7));
        cmd.paramId = static_cast<std::int16_t>(static_cast<int>(obj.getProperty("preset")));
        proc.enqueueUiCommand(cmd);
        return true;
    }
    if (type == "setRackDucking")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::SetRackSlotDucking;
        cmd.argU8 = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("slot")), 0, 7));
        cmd.argU8b = static_cast<bool>(obj.getProperty("enabled")) ? 1 : 0;
        cmd.value = obj.hasProperty("amount") ? static_cast<float>(obj.getProperty("amount")) : 0.6f;
        proc.enqueueUiCommand(cmd);
        return true;
    }
    if (type == "setPartInsert")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::SetPartInsertSlot;
        cmd.partIdx = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("part")), 0, McxEngine::kNumParts - 1));
        cmd.paramId = static_cast<std::int16_t>(static_cast<int>(obj.getProperty("slot")));
        proc.enqueueUiCommand(cmd);
        return true;
    }
    if (type == "setSendSlotTarget")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::SetSendSlotTarget;
        cmd.argU8 = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("bus")), 0, 3));
        cmd.paramId = static_cast<std::int16_t>(static_cast<int>(obj.getProperty("slot")));
        proc.enqueueUiCommand(cmd);
        return true;
    }
    if (type == "setSlotChainTarget")
    {
        McxUiCommand cmd {};
        cmd.type = McxUiCommand::Type::SetSlotChainTarget;
        cmd.argU8 = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(obj.getProperty("slot")), 0, 7));
        cmd.paramId = static_cast<std::int16_t>(static_cast<int>(obj.getProperty("target")));
        proc.enqueueUiCommand(cmd);
        return true;
    }
    return false;
}

} // namespace abdmcx
