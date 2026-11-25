#pragma once

#include "McxFactoryBank.h"
#include "../DSP/Core/McxEngine.h"

#include <algorithm>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <string_view>

namespace abdmcx
{

template <typename Cmd>
inline void executeRackOrSystemCommand(const Cmd& cmd,
                                       McxEngine& engine,
                                       std::atomic<std::uint64_t>* dirtyPartStateMask) noexcept
{
    using Type = typename Cmd::Type;
    auto& outFx = engine.getOutputAndFx();
    auto& chassis = outFx.getChassis();
    const int slot = static_cast<int>(cmd.argU8);

    std::size_t keyLen = 0;
    while (keyLen < sizeof(cmd.key) && cmd.key[keyLen] != '\0') ++keyLen;
    const std::string_view keyView(cmd.key, keyLen);

    switch (cmd.type)
    {
        case Type::SetRackSlotEngine:
            chassis.setSlotEngine(slot, static_cast<McxRackEngineType>(static_cast<int>(cmd.paramId)), keyLen > 0 ? cmd.key : nullptr);
            break;
        case Type::SetRackSlotName:
            chassis.setSlotCustomName(slot, cmd.key);
            break;
        case Type::RemoveRackSlot:
            engine.removeRackSlot(slot);
            break;
        case Type::MoveRackSlot:
            engine.moveRackSlot(slot, static_cast<int>(cmd.argU8b));
            break;
        case Type::SetRackSlotBypass:
            chassis.setSlotBypass(slot, cmd.value >= 0.5f);
            break;
        case Type::SetRackSlotParams:
            chassis.setSlotParams(slot, cmd.value, cmd.value2, cmd.value3);
            break;
        case Type::SetRackSlotParamByKey:
            chassis.setSlotParamByKey(slot, keyView, cmd.value);
            break;
        case Type::SetRackSlotPreset:
            chassis.setSlotPreset(slot, static_cast<int>(cmd.paramId));
            break;
        case Type::SetRackSlotDucking:
            chassis.setSlotDucking(slot, cmd.argU8b != 0, cmd.value);
            break;
        case Type::SetPartInsertSlot:
            engine.setPartInsertSlot(static_cast<int>(cmd.partIdx), static_cast<int>(cmd.paramId));
            break;
        case Type::SetSendSlotTarget:
            outFx.setSendSlotTarget(static_cast<int>(cmd.argU8), static_cast<int>(cmd.paramId));
            break;
        case Type::SetSlotChainTarget:
            chassis.setSlotChainTarget(slot, static_cast<int>(cmd.paramId));
            break;
        case Type::SetFxTopology:
            outFx.setUiTopology(static_cast<int>(cmd.paramId));
            break;
        case Type::SetFxCascade:
            outFx.setCascadeInjections(cmd.value, cmd.value2);
            break;
        case Type::SetFxGate:
            engine.setFxGate(static_cast<int>(cmd.argU8), cmd.value >= 0.5f);
            break;
        case Type::SetFxTempoSync:
            engine.setFxTempoSync(cmd.argU8 != 0);
            break;
        case Type::SetLimiterEnabled:
            outFx.setLimiterEnabled(cmd.argU8 != 0);
            break;
        case Type::SetLimiterCeilingDb:
            outFx.setLimiterCeilingDb(cmd.value);
            break;
        case Type::SetDuckMode:
            if (cmd.argU8 == 0) engine.setManualDuckGate(cmd.value >= 0.5f);
            else if (cmd.argU8 == 1) engine.setAudioDuckEnabled(cmd.value >= 0.5f);
            else if (cmd.argU8 == 2) engine.setMidiDuckEnabled(cmd.value >= 0.5f);
            break;
        case Type::SetSeqLoop:
            engine.sequencer().setLoopEnabled(cmd.argU8 != 0);
            break;
        case Type::SetPartPresetName:
            engine.setPartPresetName(static_cast<int>(cmd.partIdx), cmd.key);
            break;
        case Type::ResetToFactory:
        {
            engine.allNotesOff();
            outFx.reset();
            McxFactoryBank::applyFactoryDefaults(engine);
            if (dirtyPartStateMask != nullptr)
            {
                const int p = std::clamp<int>(static_cast<int>(cmd.partIdx), 0, McxEngine::kNumParts - 1);
                dirtyPartStateMask->fetch_or(1ull << p, std::memory_order_release);
            }
            break;
        }
        case Type::SeqSeekBars:
            engine.seekSequencerBars(static_cast<int>(cmd.paramId));
            break;
        case Type::SeqReturnToZero:
            engine.returnSequencerToZero();
            break;
        case Type::SetSeqRecordConfig:
            engine.setSequencerRecordConfig(
                static_cast<int>(cmd.argU8),
                static_cast<int>(cmd.argU8b),
                static_cast<int>(cmd.paramId));
            break;
        case Type::SetSidechainConfig:
        {
            McxSidechainConfig cfg;
            cfg.sourcePart = static_cast<int>(cmd.paramId);
            cfg.hpfEnabled = (cmd.argU8 != 0);
            cfg.hpfHz = cmd.value;
            cfg.depthDb = cmd.value2;
            cfg.attackMs = cmd.value3;
            cfg.releaseMs = static_cast<float>(cmd.argU64) * 0.1f;
            cfg.releaseSyncDiv = static_cast<int>(cmd.argU8b);
            engine.setSidechainConfig(cfg);
            break;
        }
        default:
            break;
    }
}

} // namespace abdmcx
