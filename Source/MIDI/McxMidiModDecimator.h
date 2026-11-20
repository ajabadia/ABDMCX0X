#pragma once

#include "HardwareMirrorRouter.h"
#include "McxMidiOutQueue.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>

namespace abdmcx
{

/**
 * @brief Zero-allocation adaptive MIDI modulation decimator (CC 35 Hz / NRPN 18 Hz).
 * Features per-slot delta hysteresis (>= 1), per-(port, channel) active NRPN address
 * caching (compressing consecutive updates from 9 bytes to 3 bytes), and queue
 * backpressure protection so clock and note events are never starved.
 */
class McxMidiModDecimator
{
public:
    static constexpr std::size_t kMaxPorts = 32;
    static constexpr std::size_t kMaxChannels = 16;
    static constexpr std::size_t kMaxSlots = 64;
    static constexpr double kCcRateHz = 35.0;
    static constexpr double kNrpnRateHz = 18.0;
    static constexpr double kNrpnRefreshSec = 0.50;

    void prepare(double sampleRate) noexcept
    {
        sampleRate_ = (sampleRate > 1000.0) ? sampleRate : 44100.0;
        ccIntervalSamples_ = std::max<std::uint32_t>(1u, static_cast<std::uint32_t>(std::lround(sampleRate_ / kCcRateHz)));
        nrpnIntervalSamples_ = std::max<std::uint32_t>(1u, static_cast<std::uint32_t>(std::lround(sampleRate_ / kNrpnRateHz)));
        nrpnRefreshSamples_ = std::max<std::uint32_t>(1u, static_cast<std::uint32_t>(std::lround(sampleRate_ * kNrpnRefreshSec)));
        reset();
    }

    void reset() noexcept
    {
        for (auto& s : slots_)
            s = SlotState {};
        for (auto& p : nrpnCache_)
            for (auto& c : p)
                c = NrpnCache {};
    }

    void advanceBlock(int numSamples) noexcept
    {
        if (numSamples <= 0)
            return;
        const auto dt = static_cast<std::uint32_t>(numSamples);
        for (auto& s : slots_)
            s.samplesSinceEmit = saturateAdd(s.samplesSinceEmit, dt);
        for (auto& p : nrpnCache_)
            for (auto& c : p)
                c.samplesSinceAddr = saturateAdd(c.samplesSinceAddr, dt);
    }

    void invalidateNrpnCache(std::uint8_t portIdx, std::uint8_t ch1to16) noexcept
    {
        if (portIdx >= kMaxPorts)
            return;
        const std::size_t ch = static_cast<std::size_t>(std::clamp<int>(ch1to16, 1, 16) - 1);
        nrpnCache_[portIdx][ch] = NrpnCache {};
    }

    template <std::size_t Cap>
    bool submitCc(McxMidiOutQueue<Cap>& outQueue,
                  std::size_t slotId,
                  std::uint8_t portIdx,
                  std::uint8_t ch1to16,
                  std::uint8_t cc,
                  float norm01,
                  std::int32_t sampleOffset = 0) noexcept
    {
        if (slotId >= kMaxSlots || hasBackpressure(outQueue, 1))
            return false;

        auto& slot = slots_[slotId];
        if (slot.hasEmitted && slot.samplesSinceEmit < ccIntervalSamples_)
            return false;

        const std::uint8_t byteVal = quantize7Bit(norm01);
        if (slot.hasEmitted && slot.lastByte == static_cast<int>(byteVal))
            return false;

        if (!outQueue.push(HardwareMirrorRouter::makeCc(ch1to16, cc, byteVal, sampleOffset, portIdx)))
            return false;

        slot.lastByte = static_cast<int>(byteVal);
        slot.samplesSinceEmit = 0;
        slot.hasEmitted = true;
        return true;
    }

    template <std::size_t Cap>
    bool submitNrpn(McxMidiOutQueue<Cap>& outQueue,
                    std::size_t slotId,
                    std::uint8_t portIdx,
                    std::uint8_t ch1to16,
                    std::uint8_t msb,
                    std::uint8_t lsb,
                    float norm01,
                    std::int32_t sampleOffset = 0) noexcept
    {
        if (slotId >= kMaxSlots)
            return false;

        auto& slot = slots_[slotId];
        if (slot.hasEmitted && slot.samplesSinceEmit < nrpnIntervalSamples_)
            return false;

        const std::uint8_t byteVal = quantize7Bit(norm01);
        if (slot.hasEmitted && slot.lastByte == static_cast<int>(byteVal))
            return false;

        const std::uint8_t m7 = static_cast<std::uint8_t>(msb & 0x7Fu);
        const std::uint8_t l7 = static_cast<std::uint8_t>(lsb & 0x7Fu);
        const std::size_t ch = static_cast<std::size_t>(std::clamp<int>(ch1to16, 1, 16) - 1);
        const bool canCache = (portIdx < kMaxPorts);
        bool addrMatch = false;
        if (canCache)
        {
            const auto& cache = nrpnCache_[portIdx][ch];
            addrMatch = (cache.activeMsb == static_cast<int>(m7))
                     && (cache.activeLsb == static_cast<int>(l7))
                     && (cache.samplesSinceAddr < nrpnRefreshSamples_);
        }

        const std::size_t neededMsgs = addrMatch ? 1u : 3u;
        if (hasBackpressure(outQueue, neededMsgs))
            return false;

        if (!addrMatch)
        {
            if (!outQueue.push(HardwareMirrorRouter::makeCc(ch1to16, 99, m7, sampleOffset, portIdx)))
                return false;
            if (!outQueue.push(HardwareMirrorRouter::makeCc(ch1to16, 98, l7, sampleOffset, portIdx)))
                return false;
            if (canCache)
            {
                auto& cache = nrpnCache_[portIdx][ch];
                cache.activeMsb = static_cast<int>(m7);
                cache.activeLsb = static_cast<int>(l7);
                cache.samplesSinceAddr = 0;
            }
        }

        if (!outQueue.push(HardwareMirrorRouter::makeCc(ch1to16, 6, byteVal, sampleOffset, portIdx)))
            return false;

        slot.lastByte = static_cast<int>(byteVal);
        slot.samplesSinceEmit = 0;
        slot.hasEmitted = true;
        return true;
    }

private:
    struct SlotState
    {
        int lastByte { -1 };
        std::uint32_t samplesSinceEmit { 0 };
        bool hasEmitted { false };
    };

    struct NrpnCache
    {
        int activeMsb { -1 };
        int activeLsb { -1 };
        std::uint32_t samplesSinceAddr { 0 };
    };

    static std::uint32_t saturateAdd(std::uint32_t a, std::uint32_t b) noexcept
    {
        constexpr std::uint32_t kMax = 0x3FFFFFFFu;
        return (a >= kMax - b) ? kMax : (a + b);
    }

    static std::uint8_t quantize7Bit(float norm01) noexcept
    {
        const float clamped = std::clamp(norm01, 0.0f, 1.0f);
        return static_cast<std::uint8_t>(std::clamp(static_cast<int>(std::lround(clamped * 127.0f)), 0, 127));
    }

    template <std::size_t Cap>
    static bool hasBackpressure(const McxMidiOutQueue<Cap>& outQueue, std::size_t needed) noexcept
    {
        constexpr std::size_t kWatermark = (Cap * 3u) / 4u;
        const std::size_t cur = outQueue.size();
        return (cur >= kWatermark) || (cur + needed > Cap);
    }

    double sampleRate_ { 44100.0 };
    std::uint32_t ccIntervalSamples_ { 1260 };
    std::uint32_t nrpnIntervalSamples_ { 2450 };
    std::uint32_t nrpnRefreshSamples_ { 22050 };
    std::array<SlotState, kMaxSlots> slots_ {};
    std::array<std::array<NrpnCache, kMaxChannels>, kMaxPorts> nrpnCache_ {};
};

} // namespace abdmcx
