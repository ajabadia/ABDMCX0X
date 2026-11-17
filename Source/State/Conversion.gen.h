// ============================================================================
// ABDMCX0X — Conversion.gen.h
// Helpers de conversión y normalización de parámetros
// ============================================================================

#pragma once

#include "ParameterRegistry.gen.h"
#include <algorithm>
#include <cmath>

namespace abdmcx {

inline float rawToNormalized(uint32_t paramIdx, float raw) noexcept {
    if (paramIdx >= kNumParameters) return 0.0f;
    const auto& desc = kParameterDescriptors[paramIdx];
    if (desc.maxValue <= desc.minValue) return 0.0f;
    return std::clamp((raw - desc.minValue) / (desc.maxValue - desc.minValue), 0.0f, 1.0f);
}

inline float normalizedToRaw(uint32_t paramIdx, float norm) noexcept {
    if (paramIdx >= kNumParameters) return 0.0f;
    const auto& desc = kParameterDescriptors[paramIdx];
    return desc.minValue + std::clamp(norm, 0.0f, 1.0f) * (desc.maxValue - desc.minValue);
}

inline float dbToGain(float db) noexcept {
    return (db <= -59.0f) ? 0.0f : std::pow(10.0f, db * 0.05f);
}

inline float gainToDb(float gain) noexcept {
    return (gain <= 0.0001f) ? -60.0f : 20.0f * std::log10(gain);
}

} // namespace abdmcx
