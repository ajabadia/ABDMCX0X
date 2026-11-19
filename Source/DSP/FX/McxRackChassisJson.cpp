#include "McxRackChassis.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace abdmcx
{

namespace
{
int parseJsonInt(const char* block, const char* key, int fallback) noexcept
{
    if (!block || !key) return fallback;
    const char* p = std::strstr(block, key);
    if (!p) return fallback;
    return std::atoi(p + std::strlen(key));
}

float parseJsonFloat(const char* block, const char* key, float fallback) noexcept
{
    if (!block || !key) return fallback;
    const char* p = std::strstr(block, key);
    if (!p) return fallback;
    return static_cast<float>(std::atof(p + std::strlen(key)));
}
} // namespace

int McxRackChassis::serializeJson(char* outBuffer, int maxBytes) const noexcept
{
    if (!outBuffer || maxBytes <= 16) return 0;
    int written = std::snprintf(outBuffer, static_cast<std::size_t>(maxBytes), "{\"slots\":[");
    for (int i = 0; i < kMaxSlots; ++i)
    {
        const auto& s = states_[static_cast<std::size_t>(i)];
        const int n = std::snprintf(
            outBuffer + written, static_cast<std::size_t>(std::max(0, maxBytes - written)),
            "%s{\"idx\":%d,\"engine\":%d,\"algoId\":\"%s\",\"name\":\"%s\","
            "\"bypass\":%d,\"duck\":%d,\"chain\":%d,\"mix\":%.3f,"
            "\"p1\":%.3f,\"p2\":%.3f,\"p3\":%.3f,\"p4\":%.3f,\"p5\":%.3f,\"mode\":%d}",
            (i > 0 ? "," : ""), s.slotIndex, static_cast<int>(s.engineType), s.algoId, s.customName,
            s.bypassed ? 1 : 0, s.scDuckEnabled ? 1 : 0, s.chainTargetSlot, s.dryWetMix,
            s.p1, s.p2, s.p3, s.p4, s.p5, s.mode);
        if (n <= 0 || written + n >= maxBytes) break;
        written += n;
    }
    const int endN = std::snprintf(outBuffer + written, static_cast<std::size_t>(std::max(0, maxBytes - written)), "]}");
    return (endN > 0) ? (written + endN) : written;
}

bool McxRackChassis::deserializeJson(const char* jsonText) noexcept
{
    if (!jsonText || jsonText[0] == '\0') return false;
    for (int i = 0; i < kMaxSlots; ++i)
    {
        char pat[32];
        std::snprintf(pat, sizeof(pat), "\"idx\":%d", i);
        const char* p = std::strstr(jsonText, pat);
        if (!p) continue;

        const char* nextP = std::strstr(p + 6, "\"idx\":");
        const std::size_t blockLen = nextP ? static_cast<std::size_t>(nextP - p) : std::strlen(p);
        char block[512] {};
        const std::size_t copyLen = std::min(blockLen, sizeof(block) - 1);
        std::memcpy(block, p, copyLen);
        block[copyLen] = '\0';

        const int eng = parseJsonInt(block, "\"engine\":", 0);
        const int byp = parseJsonInt(block, "\"bypass\":", 0);
        const int duck = parseJsonInt(block, "\"duck\":", 0);
        const int chain = parseJsonInt(block, "\"chain\":", -1);
        const float mix = parseJsonFloat(block, "\"mix\":", 1.0f);
        const float p1 = parseJsonFloat(block, "\"p1\":", 0.5f);
        const float p2 = parseJsonFloat(block, "\"p2\":", 0.5f);
        const float p3 = parseJsonFloat(block, "\"p3\":", 0.5f);
        const float p4 = parseJsonFloat(block, "\"p4\":", 0.8f);
        const float p5 = parseJsonFloat(block, "\"p5\":", 0.5f);
        const int mode = parseJsonInt(block, "\"mode\":", 0);

        char name[32] = "";
        if (const char* nameP = std::strstr(block, "\"name\":\""))
        {
            if (const char* nameEnd = std::strchr(nameP + 8, '\"'))
            {
                const int len = std::min(static_cast<int>(sizeof(name) - 1), static_cast<int>(nameEnd - (nameP + 8)));
                std::memcpy(name, nameP + 8, static_cast<std::size_t>(len));
                name[len] = '\0';
            }
        }

        setSlotEngine(i, static_cast<McxRackEngineType>(eng), name[0] ? name : nullptr);
        auto& st = states_[static_cast<std::size_t>(i)];
        st.p3 = std::clamp(p3, 0.0f, 1.0f);
        st.p4 = std::clamp(p4, 0.0f, 1.0f);
        st.p5 = std::clamp(p5, 0.0f, 1.0f);
        st.mode = std::clamp(mode, 0, 15);
        setSlotChainTarget(i, chain);
        setSlotBypass(i, byp != 0);
        setSlotDucking(i, duck != 0, 0.6f);
        setSlotParams(i, p1, p2, mix);
    }
    return true;
}

} // namespace abdmcx
