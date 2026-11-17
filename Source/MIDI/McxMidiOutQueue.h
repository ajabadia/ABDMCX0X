#pragma once

#include "../DSP/Core/McxTypes.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <new>

namespace abdmcx
{

/**
 * @brief Lock-free Single-Producer Single-Consumer (SPSC) ring buffer for McxMidiOutMessage.
 * Safe for audio thread producer and background/hardware MIDI thread consumer.
 * Zero heap allocation, power-of-2 capacity, cache-line aligned heads.
 */
template <std::size_t Capacity = 1024>
class McxMidiOutQueue
{
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be a power of two");
    static_assert(Capacity >= 16, "Capacity must be at least 16");

public:
    static constexpr std::size_t kCapacity = Capacity;
    static constexpr std::size_t kMask = Capacity - 1;

    McxMidiOutQueue() noexcept
    {
        writeHead_.store(0, std::memory_order_relaxed);
        readHead_.store(0, std::memory_order_relaxed);
    }

    ~McxMidiOutQueue() = default;
    McxMidiOutQueue(const McxMidiOutQueue&) = delete;
    McxMidiOutQueue& operator=(const McxMidiOutQueue&) = delete;

    /**
     * @brief Audio thread (Producer) pushes a MIDI message.
     * @return true if successfully pushed, false if queue is full (overflow).
     */
    bool push(const McxMidiOutMessage& msg) noexcept
    {
        const std::size_t currentWrite = writeHead_.load(std::memory_order_relaxed);
        const std::size_t currentRead = readHead_.load(std::memory_order_acquire);

        if ((currentWrite - currentRead) >= Capacity)
            return false; // Queue full

        buffer_[currentWrite & kMask] = msg;
        writeHead_.store(currentWrite + 1, std::memory_order_release);
        return true;
    }

    /**
     * @brief Background/MIDI thread (Consumer) pops a single message.
     * @return true if a message was popped, false if queue was empty.
     */
    bool pop(McxMidiOutMessage& outMsg) noexcept
    {
        const std::size_t currentRead = readHead_.load(std::memory_order_relaxed);
        const std::size_t currentWrite = writeHead_.load(std::memory_order_acquire);

        if (currentRead == currentWrite)
            return false; // Queue empty

        outMsg = buffer_[currentRead & kMask];
        readHead_.store(currentRead + 1, std::memory_order_release);
        return true;
    }

    /**
     * @brief Pops up to maxCount messages into dest array.
     * @return Number of messages popped.
     */
    std::size_t popBatch(McxMidiOutMessage* dest, std::size_t maxCount) noexcept
    {
        if (!dest || maxCount == 0)
            return 0;

        const std::size_t currentRead = readHead_.load(std::memory_order_relaxed);
        const std::size_t currentWrite = writeHead_.load(std::memory_order_acquire);
        const std::size_t available = currentWrite - currentRead;
        const std::size_t toPop = std::min(maxCount, available);

        for (std::size_t i = 0; i < toPop; ++i)
        {
            dest[i] = buffer_[(currentRead + i) & kMask];
        }

        if (toPop > 0)
            readHead_.store(currentRead + toPop, std::memory_order_release);

        return toPop;
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
    std::array<McxMidiOutMessage, Capacity> buffer_ {};

    // Cache-line alignment to avoid false sharing between producer and consumer cores
    alignas(64) std::atomic<std::size_t> writeHead_ { 0 };
    alignas(64) std::atomic<std::size_t> readHead_ { 0 };
};

} // namespace abdmcx
