#pragma once

#include "SynthCore/MiniJsonParser.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <sstream>
#include <string>
#include <string_view>

namespace abdmcx
{

/**
 * @brief Visual 8x8 Bank Layout State (up to 8 banks of 8 slots -> stable DSP partId 0..63 or -1).
 * JUCE-free header-only model persisted in presets & sessions alongside 64-bit pin mask.
 */
struct McxBankLayoutState
{
    static constexpr int kMaxBanks = 8;
    static constexpr int kSlotsPerBank = 8;
    static constexpr int kMaxParts = 64;

    int bankCount { 2 };
    int activeBank { 0 };
    std::array<std::array<std::int8_t, kSlotsPerBank>, kMaxBanks> slots {};
    std::uint64_t pinnedMask { 0x000000000000FFFFull };

    McxBankLayoutState() noexcept { initDefault(); }

    void initDefault() noexcept
    {
        bankCount = 2;
        activeBank = 0;
        for (auto& bank : slots)
            bank.fill(-1);
        for (int s = 0; s < kSlotsPerBank; ++s)
        {
            slots[0][static_cast<std::size_t>(s)] = static_cast<std::int8_t>(s);
            slots[1][static_cast<std::size_t>(s)] = static_cast<std::int8_t>(8 + s);
        }
        pinnedMask = 0x000000000000FFFFull;
    }

    [[nodiscard]] bool isPinned(int partId) const noexcept
    {
        if (partId < 0 || partId >= kMaxParts) return false;
        return (pinnedMask & (1ull << partId)) != 0ull;
    }

    void setPinned(int partId, bool pinned) noexcept
    {
        if (partId < 0 || partId >= kMaxParts) return;
        const std::uint64_t bit = (1ull << partId);
        if (pinned) pinnedMask |= bit;
        else pinnedMask &= ~bit;
    }

    [[nodiscard]] std::uint64_t usedPartsMask() const noexcept
    {
        std::uint64_t mask = 0ull;
        const int bCount = std::clamp(bankCount, 1, kMaxBanks);
        for (int b = 0; b < bCount; ++b)
        {
            for (int s = 0; s < kSlotsPerBank; ++s)
            {
                const int id = static_cast<int>(slots[static_cast<std::size_t>(b)][static_cast<std::size_t>(s)]);
                if (id >= 0 && id < kMaxParts)
                    mask |= (1ull << id);
            }
        }
        return mask;
    }

    [[nodiscard]] std::string serializeJson() const
    {
        const int bCount = std::clamp(bankCount, 1, kMaxBanks);
        const int act = std::clamp(activeBank, 0, bCount - 1);
        std::ostringstream os;
        os << "{\"bankCount\":" << bCount
           << ",\"activeBank\":" << act
           << ",\"banks\":[";
        for (int b = 0; b < bCount; ++b)
        {
            if (b > 0) os << ',';
            os << '[';
            for (int s = 0; s < kSlotsPerBank; ++s)
            {
                if (s > 0) os << ',';
                os << static_cast<int>(slots[static_cast<std::size_t>(b)][static_cast<std::size_t>(s)]);
            }
            os << ']';
        }
        os << "],\"pinnedMask64\":["
           << static_cast<unsigned int>((pinnedMask >> 0) & 0xFFFFull) << ','
           << static_cast<unsigned int>((pinnedMask >> 16) & 0xFFFFull) << ','
           << static_cast<unsigned int>((pinnedMask >> 32) & 0xFFFFull) << ','
           << static_cast<unsigned int>((pinnedMask >> 48) & 0xFFFFull) << "]}";
        return os.str();
    }

    bool deserializeJson(std::string_view jsonText)
    {
        if (jsonText.empty()) return false;
        abd::synth::json::JsonValue root;
        if (!abd::synth::json::parseJson(jsonText, root) || !root.isObject())
            return false;

        const auto* banksVal = root.find("banks");
        if (banksVal == nullptr || !banksVal->isArray() || banksVal->arrVal.empty())
            return false;

        std::array<std::array<std::int8_t, kSlotsPerBank>, kMaxBanks> nextSlots {};
        for (auto& bRow : nextSlots) bRow.fill(-1);

        const int arrCount = static_cast<int>(banksVal->arrVal.size());
        const int parsedBankCount = std::clamp(root.getInt("bankCount", arrCount), 1, std::min(kMaxBanks, arrCount));
        std::uint64_t seenMask = 0ull;

        for (int b = 0; b < parsedBankCount; ++b)
        {
            const auto& rowVal = banksVal->arrVal[static_cast<std::size_t>(b)];
            if (!rowVal.isArray()) continue;
            const int lim = std::min(kSlotsPerBank, static_cast<int>(rowVal.arrVal.size()));
            for (int s = 0; s < lim; ++s)
            {
                const auto& cell = rowVal.arrVal[static_cast<std::size_t>(s)];
                if (!cell.isNumber()) continue;
                const int pid = static_cast<int>(cell.numVal);
                if (pid >= 0 && pid < kMaxParts)
                {
                    const std::uint64_t bit = (1ull << pid);
                    if ((seenMask & bit) == 0ull)
                    {
                        seenMask |= bit;
                        nextSlots[static_cast<std::size_t>(b)][static_cast<std::size_t>(s)] = static_cast<std::int8_t>(pid);
                    }
                }
            }
        }

        std::uint64_t nextPinned = 0x000000000000FFFFull;
        if (const auto* pinArr = root.find("pinnedMask64"); pinArr && pinArr->isArray())
        {
            nextPinned = 0ull;
            const int words = std::min(4, static_cast<int>(pinArr->arrVal.size()));
            for (int w = 0; w < words; ++w)
            {
                const auto& item = pinArr->arrVal[static_cast<std::size_t>(w)];
                if (!item.isNumber()) continue;
                const std::uint64_t word = static_cast<std::uint64_t>(std::clamp(static_cast<int>(item.numVal), 0, 65535));
                nextPinned |= (word << (w * 16));
            }
        }

        bankCount = parsedBankCount;
        activeBank = std::clamp(root.getInt("activeBank", 0), 0, bankCount - 1);
        slots = nextSlots;
        pinnedMask = nextPinned;
        return true;
    }
};

} // namespace abdmcx
