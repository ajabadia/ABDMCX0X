#pragma once

#include <cstddef>
#include <cstdint>
#include <type_traits>

namespace abdmcx
{
/** Fixed-capacity, RT-safe pad layer selector (no allocation, no STL containers). */
constexpr std::uint8_t kMaxLayers = 4;
constexpr int kInvalidPadLayer = -1;

enum class McxPadPlayMode : std::uint8_t
{
    VelocityZone = 0,
    RoundRobin = 1,
    Random = 2
};

struct McxPadLayer
{
    std::uint8_t velMin { 0 };
    std::uint8_t velMax { 127 };
    std::uint8_t sampleSlot { 0 };
    McxPadPlayMode playMode { McxPadPlayMode::VelocityZone };
};

struct McxPadLayerConfig
{
    std::uint8_t layerCount { 0 };
    std::uint8_t padIndex { 0 };
    McxPadLayer layers[kMaxLayers] {};
};

static_assert(std::is_trivially_copyable_v<McxPadLayer>);
static_assert(std::is_trivially_copyable_v<McxPadLayerConfig>);
static_assert(std::is_standard_layout_v<McxPadLayerConfig>);

namespace padlayerdetail
{
/** xorshift32; a zero seed is replaced by a fixed constant so it never sticks. */
inline std::uint32_t nextRandom(std::uint32_t& state) noexcept
{
    std::uint32_t x = state == 0u ? 0x9E3779B9u : state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    state = x;
    return x;
}

inline bool velocityInLayer(const McxPadLayer& layer, int vel) noexcept
{
    const int lo = layer.velMin < layer.velMax ? layer.velMin : layer.velMax;
    const int hi = layer.velMin < layer.velMax ? layer.velMax : layer.velMin;
    return vel >= lo && vel <= hi;
}
} // namespace padlayerdetail

/**
 * Returns the matching layer index (0..kMaxLayers-1) or kInvalidPadLayer.
 * Velocity is clamped to 0..127; reversed velocity bounds are accepted.
 * All matching layers share the play mode of the first match:
 *   VelocityZone -> lowest-index match, RoundRobin -> rrCounter % matches,
 *   Random -> xorshift32(rngState) % matches. Counters always advance on a hit.
 */
inline int selectPadLayer(const McxPadLayerConfig& cfg, int velocity127,
                          std::uint32_t& rrCounter, std::uint32_t& rngState) noexcept
{
    const int vel = velocity127 < 0 ? 0 : (velocity127 > 127 ? 127 : velocity127);
    int count = static_cast<int>(cfg.layerCount);
    if (count > static_cast<int>(kMaxLayers)) count = static_cast<int>(kMaxLayers);

    int matches[kMaxLayers] {};
    int matchCount = 0;
    for (int i = 0; i < count; ++i)
    {
        if (padlayerdetail::velocityInLayer(cfg.layers[i], vel)) matches[matchCount++] = i;
    }
    if (matchCount == 0) return kInvalidPadLayer;

    const McxPadPlayMode mode = cfg.layers[matches[0]].playMode;
    if (mode == McxPadPlayMode::RoundRobin)
    {
        const std::uint32_t pick = rrCounter++ % static_cast<std::uint32_t>(matchCount);
        return matches[static_cast<std::size_t>(pick)];
    }
    if (mode == McxPadPlayMode::Random)
    {
        const std::uint32_t pick = padlayerdetail::nextRandom(rngState) % static_cast<std::uint32_t>(matchCount);
        return matches[static_cast<std::size_t>(pick)];
    }
    return matches[0];
}

/** Convenience: sample slot of the selected layer, or kInvalidPadLayer on a miss. */
inline int selectPadSampleSlot(const McxPadLayerConfig& cfg, int velocity127,
                               std::uint32_t& rrCounter, std::uint32_t& rngState) noexcept
{
    const int layer = selectPadLayer(cfg, velocity127, rrCounter, rngState);
    return layer == kInvalidPadLayer ? kInvalidPadLayer : cfg.layers[layer].sampleSlot;
}
} // namespace abdmcx
