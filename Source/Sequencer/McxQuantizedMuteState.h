#pragma once

#include <atomic>
#include <cstdint>

namespace abdmcx
{

struct McxQuantizedMuteTelemetry
{
    bool quantizeEnabled { false };
    std::uint32_t muteApplySeq { 0u };
    std::uint8_t appliedBankMuteMask { 0u };
    std::uint8_t queuedBankMuteMask { 0u };
    std::uint64_t queuedPartMuteMask { 0ull };
};

/**
 * @brief RT-safe, lock-free state for bar-quantized Track (64-bit) & Bank (8-bit) Mutes.
 * Pending toggles XOR their bit on UI trigger and are consumed atomically at bar boundary.
 */
class McxQuantizedMuteState
{
public:
    void reset() noexcept
    {
        quantizeEnabled_ = false;
        queuedPartToggleMask_ = 0ull;
        queuedBankToggleMask_ = 0u;
        pubQuantizeEnabled_.store(false, std::memory_order_relaxed);
        pubQueuedPartMask_.store(0ull, std::memory_order_relaxed);
        pubQueuedBankMask_.store(0u, std::memory_order_relaxed);
        pubAppliedBankMask_.store(0u, std::memory_order_relaxed);
        pubMuteApplySeq_.store(0u, std::memory_order_relaxed);
    }

    void setQuantizeEnabled(bool enabled) noexcept
    {
        quantizeEnabled_ = enabled;
        pubQuantizeEnabled_.store(enabled, std::memory_order_release);
    }

    [[nodiscard]] bool isQuantizeEnabled() const noexcept { return quantizeEnabled_; }

    bool queuePartToggle(int partIdx) noexcept
    {
        if (partIdx < 0 || partIdx >= 64) return false;
        const std::uint64_t bit = (1ull << static_cast<unsigned>(partIdx));
        queuedPartToggleMask_ ^= bit;
        pubQueuedPartMask_.store(queuedPartToggleMask_, std::memory_order_release);
        return (queuedPartToggleMask_ & bit) != 0ull;
    }

    bool queueBankToggle(int bankIdx) noexcept
    {
        if (bankIdx < 0 || bankIdx >= 8) return false;
        const std::uint8_t bit = static_cast<std::uint8_t>(1u << static_cast<unsigned>(bankIdx));
        queuedBankToggleMask_ ^= bit;
        pubQueuedBankMask_.store(queuedBankToggleMask_, std::memory_order_release);
        return (queuedBankToggleMask_ & bit) != 0u;
    }

    void clearPartBit(int partIdx) noexcept
    {
        if (partIdx < 0 || partIdx >= 64) return;
        queuedPartToggleMask_ &= ~(1ull << static_cast<unsigned>(partIdx));
        pubQueuedPartMask_.store(queuedPartToggleMask_, std::memory_order_release);
    }

    void clearBankBit(int bankIdx) noexcept
    {
        if (bankIdx < 0 || bankIdx >= 8) return;
        queuedBankToggleMask_ &= static_cast<std::uint8_t>(~(1u << static_cast<unsigned>(bankIdx)));
        pubQueuedBankMask_.store(queuedBankToggleMask_, std::memory_order_release);
    }

    void clearQueued() noexcept
    {
        queuedPartToggleMask_ = 0ull;
        queuedBankToggleMask_ = 0u;
        pubQueuedPartMask_.store(0ull, std::memory_order_release);
        pubQueuedBankMask_.store(0u, std::memory_order_release);
    }

    [[nodiscard]] bool hasPending() const noexcept
    {
        return queuedPartToggleMask_ != 0ull || queuedBankToggleMask_ != 0u;
    }

    bool consumePending(std::uint64_t& outPartMask, std::uint8_t& outBankMask) noexcept
    {
        if (!hasPending()) return false;
        outPartMask = queuedPartToggleMask_;
        outBankMask = queuedBankToggleMask_;
        clearQueued();
        return true;
    }

    void recordApplied(std::uint8_t appliedBankMuteMask) noexcept
    {
        pubAppliedBankMask_.store(appliedBankMuteMask, std::memory_order_release);
        pubMuteApplySeq_.fetch_add(1u, std::memory_order_release);
    }

    [[nodiscard]] McxQuantizedMuteTelemetry readTelemetry() const noexcept
    {
        return {
            pubQuantizeEnabled_.load(std::memory_order_acquire),
            pubMuteApplySeq_.load(std::memory_order_acquire),
            pubAppliedBankMask_.load(std::memory_order_acquire),
            pubQueuedBankMask_.load(std::memory_order_acquire),
            pubQueuedPartMask_.load(std::memory_order_acquire),
        };
    }

private:
    bool quantizeEnabled_ { false };
    std::uint64_t queuedPartToggleMask_ { 0ull };
    std::uint8_t queuedBankToggleMask_ { 0u };

    std::atomic<bool> pubQuantizeEnabled_ { false };
    std::atomic<std::uint32_t> pubMuteApplySeq_ { 0u };
    std::atomic<std::uint8_t> pubAppliedBankMask_ { 0u };
    std::atomic<std::uint8_t> pubQueuedBankMask_ { 0u };
    std::atomic<std::uint64_t> pubQueuedPartMask_ { 0ull };
};

} // namespace abdmcx
