#pragma once

#include "../DSP/Core/McxEngine.h"
#include "SynthEngines/StructuredRompler/RomplerBankLoader.h"

#if defined(JUCE_VERSION) || defined(JUCE_CORE_H_INCLUDED)
#include <juce_core/juce_core.h>
#endif

#include <cstddef>
#include <string>

namespace abdmcx
{

using McxLoadedWave     = abd::rompler::LoadedWave;
using McxLoadedTone     = abd::rompler::LoadedTone;
using McxLoadedDrumSlot = abd::rompler::LoadedDrumSlot;
using McxLoadedDrumKit  = abd::rompler::LoadedDrumKit;

/**
 * Groovebox adapter over abd::rompler::RomplerBankLoader.
 * Applies loaded tones and drum kits to a track's StructuredRomplerEngine
 * while keeping mixer gain/pan normalized inside the Rompler so McxChannelStrip
 * owns track mix stage without double-attenuation.
 */
class McxBankLoader : public abd::rompler::RomplerBankLoader
{
public:
#if defined(JUCE_VERSION) || defined(JUCE_CORE_H_INCLUDED)
    bool loadFromFile(const juce::File& file)
    {
        if (!file.existsAsFile())
            return false;
        juce::MemoryBlock mb;
        if (!file.loadFileAsData(mb))
            return false;
        return loadFromMemory(mb.getData(), mb.getSize());
    }
#endif

    bool applyToneToPart(int toneIndex, McxPartState& part) const noexcept
    {
        auto& rompler = part.romplerEngine();
        if (!applyTone(toneIndex, rompler))
            return false;
        part.isDrumKit = false;
        part.kind = McxPartKind::Chromatic;
        rompler.patch().level = 1.0f;
        rompler.patch().pan = 0.0f;
        return true;
    }

    bool applyDrumKitToPart(int kitIndex, McxPartState& part) const noexcept
    {
        auto& rompler = part.romplerEngine();
        if (!applyDrumKit(kitIndex, rompler))
            return false;
        part.isDrumKit = true;
        part.kind = McxPartKind::DrumMap;
        rompler.patch().level = 1.0f;
        rompler.patch().pan = 0.0f;
        return true;
    }
};

} // namespace abdmcx
