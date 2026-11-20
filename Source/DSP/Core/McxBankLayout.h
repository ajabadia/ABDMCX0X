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
    std::uint8_t bankMuteMask { 0 };
    std::uint8_t bankSoloMask { 0 };
    std::array<std::string, kMaxBanks> bankNames {};

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
        bankMuteMask = 0;
        bankSoloMask = 0;
        for (auto& name : bankNames)
            name.clear();
    }

    [[nodiscard]] static std::string sanitizeBankName(std::string_view raw)
    {
        std::string cleaned;
        cleaned.reserve(raw.size());
        for (const char ch : raw)
        {
            const unsigned char uch = static_cast<unsigned char>(ch);
            if (uch >= 0x20u && uch != 0x7Fu)
                cleaned.push_back(ch);
        }
        const auto isSpace = [](char ch) noexcept { return ch == ' ' || ch == '\t'; };
        std::size_t start = 0;
        while (start < cleaned.size() && isSpace(cleaned[start]))
            ++start;
        std::size_t end = cleaned.size();
        while (end > start && isSpace(cleaned[end - 1]))
            --end;
        std::string trimmed = cleaned.substr(start, end - start);
        constexpr std::size_t kMaxBytes = 24;
        if (trimmed.size() > kMaxBytes)
        {
            std::size_t cut = kMaxBytes;
            while (cut > 0 && (static_cast<unsigned char>(trimmed[cut]) & 0xC0u) == 0x80u)
                --cut;
            trimmed.resize(cut);
            while (!trimmed.empty() && isSpace(trimmed.back()))
                trimmed.pop_back();
        }
        return trimmed;
    }

    static void appendJsonEscaped(std::ostringstream& os, std::string_view text)
    {
        for (const char ch : text)
        {
            const unsigned char uch = static_cast<unsigned char>(ch);
            if (ch == '\\') os << "\\\\";
            else if (ch == '"') os << "\\\"";
            else if (ch == '\n') os << "\\n";
            else if (ch == '\r') os << "\\r";
            else if (ch == '\t') os << "\\t";
            else if (uch >= 0x20u && uch != 0x7Fu) os << ch;
        }
    }

    [[nodiscard]] bool isBankMuted(int bankIdx) const noexcept
    {
        if (bankIdx < 0 || bankIdx >= kMaxBanks) return false;
        return (bankMuteMask & static_cast<std::uint8_t>(1u << bankIdx)) != 0u;
    }

    void setBankMuted(int bankIdx, bool muted) noexcept
    {
        if (bankIdx < 0 || bankIdx >= kMaxBanks) return;
        const std::uint8_t bit = static_cast<std::uint8_t>(1u << bankIdx);
        if (muted) bankMuteMask |= bit;
        else bankMuteMask &= static_cast<std::uint8_t>(~bit);
    }

    [[nodiscard]] bool isBankSoloed(int bankIdx) const noexcept
    {
        if (bankIdx < 0 || bankIdx >= kMaxBanks) return false;
        return (bankSoloMask & static_cast<std::uint8_t>(1u << bankIdx)) != 0u;
    }

    void setBankSoloed(int bankIdx, bool soloed) noexcept
    {
        if (bankIdx < 0 || bankIdx >= kMaxBanks) return;
        const std::uint8_t bit = static_cast<std::uint8_t>(1u << bankIdx);
        if (soloed) bankSoloMask |= bit;
        else bankSoloMask &= static_cast<std::uint8_t>(~bit);
    }

    [[nodiscard]] int findBankOfPart(int partId) const noexcept
    {
        if (partId < 0 || partId >= kMaxParts) return -1;
        const int bCount = std::clamp(bankCount, 1, kMaxBanks);
        for (int b = 0; b < bCount; ++b)
        {
            for (int s = 0; s < kSlotsPerBank; ++s)
            {
                if (static_cast<int>(slots[static_cast<std::size_t>(b)][static_cast<std::size_t>(s)]) == partId)
                    return b;
            }
        }
        return -1;
    }

    [[nodiscard]] const std::string& bankName(int bankIdx) const noexcept
    {
        static const std::string kEmpty;
        if (bankIdx < 0 || bankIdx >= kMaxBanks) return kEmpty;
        return bankNames[static_cast<std::size_t>(bankIdx)];
    }

    void setBankName(int bankIdx, std::string_view name)
    {
        if (bankIdx < 0 || bankIdx >= kMaxBanks) return;
        bankNames[static_cast<std::size_t>(bankIdx)] = sanitizeBankName(name);
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
           << static_cast<unsigned int>((pinnedMask >> 48) & 0xFFFFull) << "]"
           << ",\"bankMuteMask\":" << static_cast<unsigned int>(bankMuteMask)
           << ",\"bankSoloMask\":" << static_cast<unsigned int>(bankSoloMask)
           << ",\"bankNames\":[";
        for (int b = 0; b < bCount; ++b)
        {
            if (b > 0) os << ',';
            os << '"';
            appendJsonEscaped(os, bankNames[static_cast<std::size_t>(b)]);
            os << '"';
        }
        os << "]}";
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

        const auto nextBankMute = static_cast<std::uint8_t>(std::clamp(root.getInt("bankMuteMask", 0), 0, 255));
        const auto nextBankSolo = static_cast<std::uint8_t>(std::clamp(root.getInt("bankSoloMask", 0), 0, 255));
        std::array<std::string, kMaxBanks> nextNames {};
        if (const auto* namesArr = root.find("bankNames"); namesArr && namesArr->isArray())
        {
            const int lim = std::min(kMaxBanks, static_cast<int>(namesArr->arrVal.size()));
            for (int b = 0; b < lim; ++b)
            {
                const auto& item = namesArr->arrVal[static_cast<std::size_t>(b)];
                if (item.isString())
                    nextNames[static_cast<std::size_t>(b)] = sanitizeBankName(item.strVal);
            }
        }

        bankCount = parsedBankCount;
        activeBank = std::clamp(root.getInt("activeBank", 0), 0, bankCount - 1);
        slots = nextSlots;
        pinnedMask = nextPinned;
        bankMuteMask = nextBankMute;
        bankSoloMask = nextBankSolo;
        bankNames = std::move(nextNames);
        return true;
    }
};

} // namespace abdmcx
