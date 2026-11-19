#pragma once

#include "../DSP/Core/McxEngine.h"
#include <juce_audio_basics/juce_audio_basics.h>

namespace abdmcx
{

/**
 * @brief Syncs JUCE AudioPlayHead transport state (BPM, playing, PPQ) to McxEngine sequencer & MIDI clock.
 */
inline void syncHostPlayHeadToEngine(juce::AudioPlayHead* playHead, McxEngine& engine) noexcept
{
    if (playHead == nullptr)
        return;

    const auto pos = playHead->getPosition();
    if (!pos.hasValue())
        return;

    const double bpm = pos->getBpm().hasValue() ? *pos->getBpm() : 0.0;
    const bool ppqValid = pos->getPpqPosition().hasValue();
    const double ppqPos = ppqValid ? *pos->getPpqPosition() : 0.0;
    engine.syncHostTransport(pos->getIsPlaying(), bpm, ppqPos, ppqValid);
}

} // namespace abdmcx
