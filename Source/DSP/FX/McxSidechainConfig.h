#pragma once

#include <algorithm>
#include <cmath>

namespace abdmcx
{

/**
 * @brief Configurable sidechain detection & envelope parameters for ducking across rack sends and inserts.
 */
struct McxSidechainConfig
{
    int sourcePart { -1 };      // -1 = Auto Drums (P10 + isDrumKit), 0..63 = dedicated key source part
    bool hpfEnabled { false };  // High-pass filter on sidechain detector input
    float hpfHz { 100.0f };     // 40..300 Hz
    float depthDb { -18.0f };   // -3..-48 dB max attenuation
    float attackMs { 5.0f };    // 1..100 ms
    float releaseMs { 180.0f }; // 20..1000 ms
    int releaseSyncDiv { 0 };   // 0=ms, 1=1/16, 2=1/8, 3=1/4
};

struct McxSidechainHpfState
{
    float prevIn1L { 0.0f }, prevIn1R { 0.0f }, out1L { 0.0f }, out1R { 0.0f };
    float prevIn2L { 0.0f }, prevIn2R { 0.0f }, out2L { 0.0f }, out2R { 0.0f };
    void reset() noexcept { prevIn1L = prevIn1R = out1L = out1R = prevIn2L = prevIn2R = out2L = out2R = 0.0f; }
};

[[nodiscard]] inline float resolveSidechainReleaseSec(const McxSidechainConfig& cfg, float bpm) noexcept
{
    const float safeBpm = std::max(20.0f, bpm);
    float ms = cfg.releaseMs;
    if (cfg.releaseSyncDiv == 1) ms = 15000.0f / safeBpm;
    else if (cfg.releaseSyncDiv == 2) ms = 30000.0f / safeBpm;
    else if (cfg.releaseSyncDiv == 3) ms = 60000.0f / safeBpm;
    return std::clamp(ms, 20.0f, 1500.0f) * 0.001f;
}

[[nodiscard]] inline float detectSidechainPeak(const float* inL, const float* inR, int n, float rawPeak,
                                               const McxSidechainConfig& cfg, double sr, McxSidechainHpfState& st) noexcept
{
    if (!cfg.hpfEnabled || !inL || !inR || n <= 0 || sr <= 100.0)
        return rawPeak;
    const float fc = std::clamp(cfg.hpfHz, 40.0f, 300.0f);
    const float alpha = 1.0f / (1.0f + (6.2831853f * fc / static_cast<float>(sr)));
    float peak = 0.0f;
    for (int i = 0; i < n; ++i)
    {
        const float xL = inL[i], xR = inR[i];
        st.out1L = alpha * (st.out1L + xL - st.prevIn1L); st.prevIn1L = xL;
        st.out1R = alpha * (st.out1R + xR - st.prevIn1R); st.prevIn1R = xR;
        st.out2L = alpha * (st.out2L + st.out1L - st.prevIn2L); st.prevIn2L = st.out1L;
        st.out2R = alpha * (st.out2R + st.out1R - st.prevIn2R); st.prevIn2R = st.out1R;
        peak = std::max(peak, std::max(std::abs(st.out2L), std::abs(st.out2R)));
    }
    return peak;
}

} // namespace abdmcx
