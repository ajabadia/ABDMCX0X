#pragma once

#include "../DSP/Core/McxEngine.h"

namespace abdmcx
{

/**
 * @brief Factory sound presets and drum kit configurations built into ABDMCX0X.
 * Guarantees out-of-the-box playable instruments without requiring an external .abdbank file.
 */
class McxFactoryBank
{
public:
    static void applyFactoryDefaults(McxEngine& engine) noexcept;
    static void initFactoryDrumKit(McxPartState& drumPart, int kitIndex = 0) noexcept;
    static void initFactoryTone(McxPartState& tonePart, int toneIndex) noexcept;

    static constexpr int kNumFactoryKits = 4;
    static constexpr int kNumFactoryTones = 16;

    static const char* getKitName(int index) noexcept;
    static const char* getToneName(int index) noexcept;
};

} // namespace abdmcx
