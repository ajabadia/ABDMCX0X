#pragma once

#include "McxParamRouter.h"
#include "../DSP/Core/McxEngine.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
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
        SetApvtsParam
    };

    Type type { Type::AllNotesOff };
    std::uint8_t partIdx { 0 };
    std::uint8_t argU8 { 0 };
    std::uint8_t argU8b { 0 };
    std::int16_t paramId { -1 };
    float value { 0.0f };
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
                              ApvtsHandler&& onApvtsParam) noexcept
{
    McxUiCommand cmd {};
    while (queue.pop(cmd))
    {
        const int partIdx = std::clamp<int>(static_cast<int>(cmd.partIdx), 0, McxEngine::kNumParts - 1);
        switch (cmd.type)
        {
            case McxUiCommand::Type::PartNoteOn:
                engine.triggerPartNoteOn(partIdx, static_cast<int>(cmd.argU8), cmd.value, 0);
                break;
            case McxUiCommand::Type::PartNoteOff:
                engine.releasePartNoteOff(partIdx, static_cast<int>(cmd.argU8), 0);
                break;
            case McxUiCommand::Type::AllNotesOff:
                engine.allNotesOff();
                break;
            case McxUiCommand::Type::SetPartParam:
                applyWebPartParam(engine, partIdx, static_cast<int>(cmd.paramId), cmd.value);
                break;
            case McxUiCommand::Type::SetPartRoute:
            {
                auto& p = engine.part(partIdx);
                p.routeMode = static_cast<McxPartRouteMode>(std::clamp<int>(static_cast<int>(cmd.argU8), 0, 2));
                if (cmd.argU8b >= 1 && cmd.argU8b <= 16)
                    p.midiChannel = cmd.argU8b;
                if (cmd.paramId >= 0)
                    p.midiPortIndex = static_cast<std::uint8_t>(std::clamp<int>(cmd.paramId, 0, 255));
                if (cmd.value >= 0.0f)
                    engine.setPartKind(partIdx, (cmd.value >= 0.5f) ? McxPartKind::DrumMap : McxPartKind::Chromatic);
                break;
            }
            case McxUiCommand::Type::SetMasterVolume:
                engine.setMasterVolume(std::clamp(cmd.value, 0.0f, 2.0f));
                break;
            case McxUiCommand::Type::SetTempoBpm:
                engine.setTempoBpm(std::clamp(static_cast<double>(cmd.value), 20.0, 300.0));
                break;
            case McxUiCommand::Type::SetSendBusMute:
                engine.getOutputAndFx().setSendBusMute(static_cast<int>(cmd.argU8), cmd.value >= 0.5f);
                break;
            case McxUiCommand::Type::SetApvtsParam:
                onApvtsParam(static_cast<std::uint32_t>(std::max<int>(0, cmd.paramId)), cmd.value);
                break;
            default:
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
