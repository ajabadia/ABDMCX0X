#pragma once

#include "../DSP/Core/McxEngine.h"
#include "SynthEngines/StructuredRompler/RomplerFactoryPatches.h"

namespace abdmcx
{

/**
 * Groovebox adapter over abd::rompler::RomplerFactoryPatches.
 * Populates a track's StructuredRomplerEngine with factory kits/tones
 * and sets Groovebox-level mixer defaults (level, sends, MIDI channel).
 */
struct McxFactoryBank
{
    static constexpr int kNumFactoryKits  = abd::rompler::RomplerFactoryPatches::kNumFactoryKits;
    static constexpr int kNumFactoryTones = abd::rompler::RomplerFactoryPatches::kNumFactoryTones;

    static const char* getKitName(int index) noexcept
    {
        return abd::rompler::RomplerFactoryPatches::getKitName(index);
    }

    static const char* getToneName(int index) noexcept
    {
        return abd::rompler::RomplerFactoryPatches::getToneName(index);
    }

    static void initFactoryDrumKit(McxPartState& p, int kitIndex = 0) noexcept
    {
        abd::rompler::RomplerFactoryPatches::applyFactoryDrumKit(p.romplerEngine(), kitIndex);
        p.isDrumKit = true;
        p.kind = McxPartKind::DrumMap;
        p.level = 0.90f;
        p.pan = 0.0f;
        p.reverbSend = 0.20f;
        p.chorusSend = 0.05f;
        p.romplerEngine().patch().level = 1.0f;
        p.romplerEngine().patch().pan = 0.0f;
    }

    static void initFactoryTone(McxPartState& p, int toneIndex) noexcept
    {
        abd::rompler::RomplerFactoryPatches::applyFactoryTone(p.romplerEngine(), toneIndex);
        p.isDrumKit = false;
        p.kind = McxPartKind::Chromatic;
        p.level = 0.85f;
        p.pan = 0.0f;
        const int idx = ((toneIndex % kNumFactoryTones) + kNumFactoryTones) % kNumFactoryTones;
        p.reverbSend = (idx == 2) ? 0.45f : ((idx == 5) ? 0.50f : ((idx == 7) ? 0.60f : 0.25f));
        p.chorusSend = (idx == 1) ? 0.40f : ((idx == 2) ? 0.50f : 0.10f);
        p.romplerEngine().patch().level = 1.0f;
        p.romplerEngine().patch().pan = 0.0f;
    }

    static void applyFactoryDefaults(McxEngine& engine) noexcept
    {
        initFactoryDrumKit(engine.part(9), 0);
        engine.part(9).midiChannel = 10;
        for (int i = 0; i < McxEngine::kNumParts; ++i)
        {
            if (i == 9)
                continue;
            initFactoryTone(engine.part(i), i);
            engine.part(i).midiChannel = static_cast<std::uint8_t>(i + 1);
        }
    }
};

} // namespace abdmcx
