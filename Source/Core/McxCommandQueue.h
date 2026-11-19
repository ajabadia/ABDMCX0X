#pragma once

#include "McxParamRouter.h"
#include "McxRackCommands.h"
#include "../DSP/Core/McxEngine.h"
#include "../Sequencer/McxPatternSequencer.h"
#include "../Sequencer/McxSongAndScenes.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <string_view>
#include <type_traits>

namespace abdmcx
{

struct McxUiCommand
{
    enum class Type : std::uint8_t
    {
        PartNoteOn = 0,
        PartNoteOff,
        AllNotesOff,
        SetPartParam,
        SetPartRoute,
        SetMasterVolume,
        SetTempoBpm,
        SetSendBusMute,
        SetApvtsParam,
        SetTransportPlay,
        SetSequencerBars,
        SetSequencerGroove,
        SetMidiClockEnabled,
        SetPartEngineType,
        LoadPartFactoryPreset,
        SetPartEngineParamByKey,
        TriggerScene,
        CaptureScene,
        UpdateScene,
        SetSongMode,
        SetSongLoop,
        JumpSongBlock,
        SetRackSlotEngine,
        SetRackSlotName,
        RemoveRackSlot,
        MoveRackSlot,
        SetRackSlotBypass,
        SetRackSlotParams,
        SetRackSlotParamByKey,
        SetRackSlotPreset,
        SetRackSlotDucking,
        SetPartInsertSlot,
        SetSendSlotTarget,
        SetSlotChainTarget,
        ResetToFactory
    };

    Type type { Type::AllNotesOff };
    std::uint8_t partIdx { 0 };
    std::uint8_t argU8 { 0 };
    std::uint8_t argU8b { 0 };
    std::int16_t paramId { -1 };
    float value { 0.0f };
    std::uint8_t argU8c { 0 };
    std::uint16_t argU16 { 0 };
    float value2 { 0.0f };
    float value3 { 1.0f };
    char key[40] {};

    static McxUiCommand makeKeyed(Type t, std::uint8_t a8, std::int16_t pid, float v, std::string_view str) noexcept
    {
        McxUiCommand cmd {};
        cmd.type = t;
        cmd.argU8 = a8;
        cmd.paramId = pid;
        cmd.value = v;
        const std::size_t len = std::min(str.size(), sizeof(cmd.key) - 1);
        if (len > 0) std::memcpy(cmd.key, str.data(), len);
        cmd.key[len] = '\0';
        return cmd;
    }

    static McxUiCommand makeEngineParamByKey(int partIndex, std::string_view paramKey, float val) noexcept
    {
        McxUiCommand cmd {};
        cmd.type = Type::SetPartEngineParamByKey;
        cmd.partIdx = static_cast<std::uint8_t>(std::clamp(partIndex, 0, McxEngine::kNumParts - 1));
        cmd.value = val;
        const std::size_t len = std::min(paramKey.size(), sizeof(cmd.key) - 1);
        if (len > 0) std::memcpy(cmd.key, paramKey.data(), len);
        cmd.key[len] = '\0';
        return cmd;
    }

    static McxUiCommand makeUpdateScene(int sceneIdx, std::uint16_t muteMask, int transpose, std::string_view name) noexcept
    {
        McxUiCommand cmd {};
        cmd.type = Type::UpdateScene;
        cmd.argU8 = static_cast<std::uint8_t>(std::clamp(sceneIdx, 0, McxSongAndScenes::kNumScenes - 1));
        cmd.argU16 = muteMask;
        cmd.paramId = static_cast<std::int16_t>(std::clamp(transpose, -24, 24));
        const std::size_t len = std::min(name.size(), sizeof(cmd.key) - 1);
        if (len > 0) std::memcpy(cmd.key, name.data(), len);
        cmd.key[len] = '\0';
        return cmd;
    }
};

static_assert(std::is_trivially_copyable_v<McxUiCommand>,
              "McxUiCommand must remain trivially copyable for lock-free SPSC queues");

/**
 * @brief Lock-free SPSC command ring buffer (UI/Message thread -> Audio thread).
 * Eliminates cross-thread mutation races and preserves exact partIdx without 4-bit MIDI channel folding.
 */
template <std::size_t Capacity = 1024>
class McxCommandQueue
{
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be a power of two");
    static_assert(Capacity >= 16, "Capacity must be at least 16");

public:
    static constexpr std::size_t kCapacity = Capacity;
    static constexpr std::size_t kMask = Capacity - 1;

    McxCommandQueue() noexcept
    {
        writeHead_.store(0, std::memory_order_relaxed);
        readHead_.store(0, std::memory_order_relaxed);
    }

    McxCommandQueue(const McxCommandQueue&) = delete;
    McxCommandQueue& operator=(const McxCommandQueue&) = delete;

    bool push(const McxUiCommand& cmd) noexcept
    {
        const std::size_t w = writeHead_.load(std::memory_order_relaxed);
        const std::size_t r = readHead_.load(std::memory_order_acquire);
        if ((w - r) >= Capacity)
            return false;

        buffer_[w & kMask] = cmd;
        writeHead_.store(w + 1, std::memory_order_release);
        return true;
    }

    bool pop(McxUiCommand& outCmd) noexcept
    {
        const std::size_t r = readHead_.load(std::memory_order_relaxed);
        const std::size_t w = writeHead_.load(std::memory_order_acquire);
        if (r == w)
            return false;

        outCmd = buffer_[r & kMask];
        readHead_.store(r + 1, std::memory_order_release);
        return true;
    }

    [[nodiscard]] std::size_t size() const noexcept
    {
        const std::size_t r = readHead_.load(std::memory_order_relaxed);
        const std::size_t w = writeHead_.load(std::memory_order_relaxed);
        return (w >= r) ? (w - r) : 0;
    }

    [[nodiscard]] bool empty() const noexcept
    {
        return readHead_.load(std::memory_order_relaxed) == writeHead_.load(std::memory_order_relaxed);
    }

    void clear() noexcept
    {
        const std::size_t w = writeHead_.load(std::memory_order_relaxed);
        readHead_.store(w, std::memory_order_release);
    }

private:
    std::array<McxUiCommand, Capacity> buffer_ {};
    alignas(64) std::atomic<std::size_t> writeHead_ { 0 };
    alignas(64) std::atomic<std::size_t> readHead_ { 0 };
};

template <std::size_t Capacity, typename ApvtsHandler>
inline void drainCommandQueue(McxCommandQueue<Capacity>& queue,
                              McxEngine& engine,
                              ApvtsHandler&& onApvtsParam,
                              std::atomic<std::uint16_t>* dirtyPartStateMask = nullptr) noexcept
{
    McxUiCommand cmd {};
    while (queue.pop(cmd))
    {
        const int partIdx = std::clamp<int>(static_cast<int>(cmd.partIdx), 0, McxEngine::kNumParts - 1);
        switch (cmd.type)
        {
            case McxUiCommand::Type::PartNoteOn: engine.triggerPartNoteOn(partIdx, static_cast<int>(cmd.argU8), cmd.value, 0); break;
            case McxUiCommand::Type::PartNoteOff: engine.releasePartNoteOff(partIdx, static_cast<int>(cmd.argU8), 0); break;
            case McxUiCommand::Type::AllNotesOff: engine.allNotesOff(); break;
            case McxUiCommand::Type::SetPartParam: applyWebPartParam(engine, partIdx, static_cast<int>(cmd.paramId), cmd.value); break;
            case McxUiCommand::Type::SetPartRoute:
            {
                auto& p = engine.part(partIdx);
                p.routeMode = static_cast<McxPartRouteMode>(std::clamp<int>(static_cast<int>(cmd.argU8), 0, 2));
                if (cmd.argU8b >= 1 && cmd.argU8b <= 16) p.midiChannel = cmd.argU8b;
                if (cmd.paramId >= 0) p.midiPortIndex = static_cast<std::uint8_t>(std::clamp<int>(cmd.paramId, 0, 255));
                if (cmd.value >= 0.0f) engine.setPartKind(partIdx, (cmd.value >= 0.5f) ? McxPartKind::DrumMap : McxPartKind::Chromatic);
                break;
            }
            case McxUiCommand::Type::SetMasterVolume: engine.setMasterVolume(std::clamp(cmd.value, 0.0f, 2.0f)); break;
            case McxUiCommand::Type::SetTempoBpm: engine.setTempoBpm(std::clamp(static_cast<double>(cmd.value), 20.0, 300.0)); break;
            case McxUiCommand::Type::SetSendBusMute: engine.getOutputAndFx().setSendBusMute(static_cast<int>(cmd.argU8), cmd.value >= 0.5f); break;
            case McxUiCommand::Type::SetApvtsParam: onApvtsParam(static_cast<std::uint32_t>(std::max<int>(0, cmd.paramId)), cmd.value); break;
            case McxUiCommand::Type::SetTransportPlay: engine.setSequencerPlaying(cmd.argU8 != 0, cmd.argU8b != 0); break;
            case McxUiCommand::Type::SetSequencerBars: engine.sequencer().setBars(static_cast<int>(cmd.paramId)); break;
            case McxUiCommand::Type::SetSequencerGroove:
            {
                using GE = McxPatternSequencer::GrooveEngine;
                const int pTarget = (cmd.paramId < 0) ? -1 : partIdx;
                engine.sequencer().setPartGrooveMusical(
                    pTarget, static_cast<GE::Mode>(std::clamp<int>(cmd.argU8, 0, 2)),
                    static_cast<GE::Algorithm>(std::clamp<int>(cmd.argU8b, 0, 4)),
                    static_cast<GE::Resolution>(std::clamp<int>(cmd.argU8c, 0, 1)), cmd.value);
                break;
            }
            case McxUiCommand::Type::SetMidiClockEnabled: engine.midiClock().setEnabled(cmd.argU8 != 0); break;
            case McxUiCommand::Type::SetPartEngineType:
                (void)engine.selectPartEngineType(partIdx, static_cast<int>(cmd.paramId));
                if (dirtyPartStateMask != nullptr) dirtyPartStateMask->fetch_or(static_cast<std::uint16_t>(1u << partIdx), std::memory_order_release);
                break;
            case McxUiCommand::Type::LoadPartFactoryPreset:
                (void)engine.loadPartFactoryPreset(partIdx, static_cast<int>(cmd.paramId));
                if (dirtyPartStateMask != nullptr) dirtyPartStateMask->fetch_or(static_cast<std::uint16_t>(1u << partIdx), std::memory_order_release);
                break;
            case McxUiCommand::Type::SetPartEngineParamByKey:
            {
                std::size_t len = 0;
                while (len < sizeof(cmd.key) && cmd.key[len] != '\0') ++len;
                (void)engine.setPartEngineParamByKey(partIdx, std::string_view(cmd.key, len), cmd.value);
                break;
            }
            case McxUiCommand::Type::TriggerScene: engine.triggerScene(static_cast<int>(cmd.argU8), cmd.argU8b != 0); break;
            case McxUiCommand::Type::CaptureScene: engine.captureCurrentToScene(static_cast<int>(cmd.argU8)); break;
            case McxUiCommand::Type::UpdateScene:
                engine.songAndScenes().setScene(static_cast<int>(cmd.argU8), cmd.argU16, static_cast<int>(cmd.paramId), cmd.key[0] != '\0' ? cmd.key : nullptr);
                break;
            case McxUiCommand::Type::SetSongMode: engine.setSongModeEnabled(cmd.argU8 != 0); break;
            case McxUiCommand::Type::SetSongLoop: engine.setSongLoopEnabled(cmd.argU8 != 0); break;
            case McxUiCommand::Type::JumpSongBlock: engine.jumpSongBlock(static_cast<int>(cmd.paramId), cmd.argU8 != 0); break;
            default:
                executeRackOrSystemCommand(cmd, engine, dirtyPartStateMask);
                break;
        }
    }
}

template <std::size_t Capacity>
inline void drainCommandQueue(McxCommandQueue<Capacity>& queue, McxEngine& engine) noexcept
{
    drainCommandQueue(queue, engine, [](std::uint32_t, float) noexcept {});
}

} // namespace abdmcx
