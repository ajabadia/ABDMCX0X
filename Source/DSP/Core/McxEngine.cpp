#include "McxEngine.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

namespace
{
constexpr double kTwoPi = 6.28318530717958647692;
} // namespace

McxEngine::McxEngine() noexcept
    : parts_(static_cast<std::size_t>(kNumParts)),
      voices_(static_cast<std::size_t>(kMaxVoices))
{
    for (int i = 0; i < kNumParts; ++i)
    {
        auto& p = parts_[static_cast<std::size_t>(i)];
        p.midiChannel = static_cast<std::uint8_t>(i + 1);
        p.partials[0].enabled = true;
        p.drumRemapper.initIdentity();
    }

    parts_[0].enabled = true;
    parts_[0].isDrumKit = false;

    parts_[9].enabled = true;
    parts_[9].isDrumKit = true;
}

void McxEngine::prepare(double sampleRate) noexcept
{
    sampleRate_ = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    for (auto& p : parts_)
        p.arp.prepare(sampleRate_);
    for (auto& v : voices_)
        v.prepare(sampleRate_);
    outputAndFx_.prepare(sampleRate_);
    reset();
}

void McxEngine::reset() noexcept
{
    testTonePhase_ = 0.0;
    noteCounter_ = 0;
    fxTailSamplesLeft_ = 0;
    mirrorRouter_.clear();
    outputAndFx_.reset();
    for (auto& v : voices_)
        v.reset();
    for (auto& p : parts_)
    {
        p.arp.reset();
        for (auto& slot : p.drumSlots)
            slot.activeSounding = false;
    }
}

void McxEngine::setFocusedPart(int partIndex) noexcept { focusedPartIndex_ = std::clamp(partIndex, 0, kNumParts - 1); }

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

void McxEngine::setPartialBudget(int maxPartials) noexcept { partialBudget_ = std::clamp(maxPartials, 1, kMaxVoices * 4); }
void McxEngine::setAccentAmount(float accent01) noexcept { accentAmount_ = std::clamp(accent01, 0.0f, 1.0f); }
void McxEngine::setMasterVolume(float gain) noexcept { masterGain_ = std::clamp(gain, 0.0f, 2.0f); }

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

void McxEngine::processAudio(float* left, float* right, int numSamples) noexcept
{
    if (!left || !right || numSamples <= 0)
        return;

    std::fill_n(left, numSamples, 0.0f);
    std::fill_n(right, numSamples, 0.0f);

    for (int partIdx = 0; partIdx < kNumParts; ++partIdx)
    {
        auto& p = parts_[static_cast<std::size_t>(partIdx)];
        if (!p.enabled || !p.arp.isEnabled())
            continue;

        p.arp.generate(numSamples, [this, partIdx](const abd::synth::GrooveArpeggiator::NoteEvent& ev) {
            if (ev.isNoteOn)
            {
                const float evAccent = std::max(accentAmount_, std::clamp((ev.velocity - 0.85f) * 3.0f, 0.0f, 1.0f));
                triggerInternalVoice(partIdx, ev.note, ev.velocity, evAccent);
            }
            else
            {
                releaseInternalVoice(partIdx, ev.note);
            }
        });
    }

    int offset = 0;
    while (offset < numSamples)
    {
        const int chunk = std::min(McxOutputAndFx::kMaxChunk, numSamples - offset);
        std::fill_n(dryL_.data(), chunk, 0.0f);
        std::fill_n(dryR_.data(), chunk, 0.0f);
        std::fill_n(choL_.data(), chunk, 0.0f);
        std::fill_n(choR_.data(), chunk, 0.0f);
        std::fill_n(revL_.data(), chunk, 0.0f);
        std::fill_n(revR_.data(), chunk, 0.0f);

        bool anyVoiceActive = false;
        for (int i = 0; i < maxPolyphony_; ++i)
        {
            auto& v = voices_[static_cast<std::size_t>(i)];
            if (!v.isActive())
                continue;
            anyVoiceActive = true;
            const auto& p = parts_[static_cast<std::size_t>(std::clamp(v.getPartIndex(), 0, kNumParts - 1))];
            v.processBlock(dryL_.data(), dryR_.data(), revL_.data(), revR_.data(), choL_.data(), choR_.data(), chunk, buildVoiceConfig(p));
        }

        const bool toneOn = diagnosticTestTone_.load(std::memory_order_acquire);
        if (toneOn)
        {
            const double inc = 440.0 / sampleRate_;
            for (int i = 0; i < chunk; ++i)
            {
                const float tone = static_cast<float>(std::sin(kTwoPi * testTonePhase_)) * 0.25f;
                testTonePhase_ += inc;
                if (testTonePhase_ >= 1.0) testTonePhase_ -= 1.0;
                dryL_[static_cast<std::size_t>(i)] += tone;
                dryR_[static_cast<std::size_t>(i)] += tone;
            }
        }

        if (anyVoiceActive || toneOn || fxTailSamplesLeft_ > 0)
        {
            if (anyVoiceActive)
                fxTailSamplesLeft_ = static_cast<int>(sampleRate_ * 2.5);
            else if (fxTailSamplesLeft_ > 0)
                fxTailSamplesLeft_ = std::max(0, fxTailSamplesLeft_ - chunk);

            outputAndFx_.processChunk(
                dryL_.data(), dryR_.data(), choL_.data(), choR_.data(), revL_.data(), revR_.data(),
                chunk, toneOn ? 1.0f : masterGain_);
            for (int i = 0; i < chunk; ++i)
            {
                left[offset + i] = dryL_[static_cast<std::size_t>(i)];
                right[offset + i] = dryR_[static_cast<std::size_t>(i)];
            }
        }

        offset += chunk;
    }
}

float McxEngine::quantizeOutputSample(float x, McxOutputCharacter character) noexcept
{
    return McxOutputAndFx::quantizeSample(x, character);
}

} // namespace abdmcx
