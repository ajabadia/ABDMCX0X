#include "McxEngine.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

void McxEngine::setFocusedPart(int partIndex) noexcept
{
    focusedPartIndex_ = std::clamp(partIndex, 0, kNumParts - 1);
}

McxPartState& McxEngine::part(int partIndex) noexcept
{
    return parts_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))];
}

const McxPartState& McxEngine::part(int partIndex) const noexcept
{
    return parts_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))];
}

void McxEngine::setMachinePersona(McxMachinePersona persona) noexcept
{
    persona_ = persona;
    personaSpec_ = getMachinePersonaSpec(persona);
    maxPolyphony_ = std::clamp<int>(personaSpec_.defaultVoiceLimit, 1, kMaxVoices);
    partialBudget_ = std::clamp<int>(personaSpec_.defaultPartialBudget, 1, kMaxVoices * 4);
    setOutputCharacter(personaSpec_.defaultDac);

    if (personaSpec_.locksLimits)
    {
        for (auto& p : parts_)
        {
            p.filterModel = personaSpec_.defaultFilter;
            p.drumMapMode = personaSpec_.defaultDrumMapMode;
        }
    }
}

void McxEngine::setMaxPolyphony(int maxVoices) noexcept
{
    const int newLimit = std::clamp(maxVoices, 1, kMaxVoices);
    maxPolyphony_ = newLimit;
    for (int i = newLimit; i < kMaxVoices; ++i)
        voices_[static_cast<std::size_t>(i)].forceChoke();
}

void McxEngine::setPartialBudget(int maxPartials) noexcept
{
    partialBudget_ = std::clamp(maxPartials, 1, kMaxVoices * 4);
}

void McxEngine::setAccentAmount(float accent01) noexcept
{
    accentAmount_ = std::clamp(accent01, 0.0f, 1.0f);
}

void McxEngine::setMasterVolume(float gain) noexcept
{
    masterGain_ = std::clamp(gain, 0.0f, 2.0f);
}

void McxEngine::setFxMix(float chorusMix, float delayMix, float reverbMix) noexcept
{
    outputAndFx_.setSendReturns(chorusMix, delayMix, reverbMix);
}

void McxEngine::setOutputCharacter(McxOutputCharacter character) noexcept
{
    outputCharacter_ = character;
    outputAndFx_.setOutputCharacter(character);
}

void McxEngine::setMasterTempoBpm(float bpm) noexcept
{
    for (auto& p : parts_)
        p.arp.setTempoBPM(bpm);
    outputAndFx_.setDelayTempoSyncBpm(bpm);
}

void McxEngine::triggerNote(int partIndex, int midiNote, float velocity, std::int32_t sampleOffset) noexcept
{
    auto& p = part(partIndex);
    if (!p.enabled)
        return;

    const int clampedNote = std::clamp(midiNote, 0, 127);

    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
    {
        if (p.arp.isEnabled())
            p.arp.noteOn(clampedNote, velocity);
        else
            triggerInternalVoice(partIndex, clampedNote, velocity, accentAmount_);
    }

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
    {
        if (p.isDrumKit)
        {
            const int mappedSlot = static_cast<int>(p.drumRemapper.inputToSlot[static_cast<std::size_t>(clampedNote)]);
            const std::uint8_t extNote = p.drumRemapper.slotToExternal[static_cast<std::size_t>(mappedSlot)];
            const auto& slot = p.drumSlots[static_cast<std::size_t>(mappedSlot)];
            const auto levelByte = static_cast<std::uint8_t>(std::clamp(std::lround(slot.level * 127.0f), 0L, 127L));
            mirrorRouter_.emitDrumKeyNrpn(p.midiChannel, 26, extNote, levelByte, sampleOffset);
        }
        else
        {
            const auto cutoffByte = static_cast<std::uint8_t>(std::clamp(std::lround(p.partials[0].cutoffHz / 20000.0f * 100.0f + 14.0f), 14L, 114L));
            mirrorRouter_.emitNrpn(p.midiChannel, 1, 32, cutoffByte, sampleOffset);
        }
    }
}

void McxEngine::releaseNote(int partIndex, int midiNote, std::int32_t /*sampleOffset*/) noexcept
{
    auto& p = part(partIndex);
    if (!p.enabled)
        return;

    const int clampedNote = std::clamp(midiNote, 0, 127);
    if (p.arp.isEnabled())
        p.arp.noteOff(clampedNote);
    else if (HardwareMirrorRouter::routesToInternal(p.routeMode))
        releaseInternalVoice(partIndex, clampedNote);
}

float McxEngine::quantizeOutputSample(float x, McxOutputCharacter character) noexcept
{
    return McxOutputAndFx::quantizeSample(x, character);
}

} // namespace abdmcx
