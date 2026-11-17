#include "McxEngine.h"
#include "../../Core/McxFactoryBank.h"

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

    McxFactoryBank::applyFactoryDefaults(*this);
    for (int i = 0; i < kNumParts; ++i)
    {
        auto& p = parts_[static_cast<std::size_t>(i)];
        p.enabled = true;
        setPartKind(i, (i == 9) ? McxPartKind::DrumMap : McxPartKind::Chromatic);
    }
}

void McxEngine::prepare(double sampleRate) noexcept
{
    sampleRate_ = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    for (auto& p : parts_)
        p.arp.prepare(sampleRate_);
    for (auto& v : voices_)
        v.prepare(sampleRate_);
    outputAndFx_.prepare(sampleRate_);
    diagProbe_.prepare(sampleRate_);
    diagFilter_.prepare(sampleRate_);
    reset();
}

void McxEngine::reset() noexcept
{
    noteCounter_ = 0;
    fxTailSamplesLeft_ = 0;
    mirrorRouter_.clear();
    outputAndFx_.reset();
    diagProbe_.reset();
    diagFilter_.reset();
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
            const int vPart = std::clamp(v.getPartIndex(), 0, kNumParts - 1);
            auto cfg = buildVoiceConfig(parts_[static_cast<std::size_t>(vPart)]);
            if (!isPartAudible(vPart)) cfg.partLevel = 0.0f;
            v.processBlock(dryL_.data(), dryR_.data(), revL_.data(), revR_.data(), choL_.data(), choR_.data(), chunk, cfg);
        }

        const bool injFilter = diagProbe_.isInjectingAt(4) || diagProbe_.isInjectingAt(5);
        const bool injPreFx = diagProbe_.isInjectingAt(3);
        const bool injPreMaster = diagProbe_.isInjectingAt(2);
        const bool injPostMaster = diagProbe_.isInjectingAt(1);
        const auto& fp = parts_[static_cast<std::size_t>(std::clamp(focusedPartIndex_, 0, kNumParts - 1))];

        if (injFilter || injPreFx || injPreMaster)
        {
            if (injFilter)
            {
                const auto& pt0 = fp.partials[0];
                diagFilter_.setParameters(fp.filterModel, pt0.filterMode, pt0.cutoffHz, pt0.resonance, pt0.zplaneMorph, pt0.drive);
            }
            for (int i = 0; i < chunk; ++i)
            {
                const float raw = diagProbe_.nextSample();
                const auto idx = static_cast<std::size_t>(i);
                if (injFilter)
                {
                    const float sf = diagFilter_.processSample(raw);
                    dryL_[idx] += sf; dryR_[idx] += sf;
                    choL_[idx] += sf * fp.chorusSend; choR_[idx] += sf * fp.chorusSend;
                    revL_[idx] += sf * fp.reverbSend; revR_[idx] += sf * fp.reverbSend;
                }
                if (injPreFx)
                {
                    dryL_[idx] += raw; dryR_[idx] += raw;
                    choL_[idx] += raw * fp.chorusSend; choR_[idx] += raw * fp.chorusSend;
                    revL_[idx] += raw * fp.reverbSend; revR_[idx] += raw * fp.reverbSend;
                }
                if (injPreMaster)
                {
                    dryL_[idx] += raw; dryR_[idx] += raw;
                }
            }
        }

        const bool runOutput = anyVoiceActive || injFilter || injPreFx || injPreMaster || fxTailSamplesLeft_ > 0;
        if (runOutput)
        {
            if (anyVoiceActive || injFilter || injPreFx)
                fxTailSamplesLeft_ = static_cast<int>(sampleRate_ * 2.5);
            else if (fxTailSamplesLeft_ > 0)
                fxTailSamplesLeft_ = std::max(0, fxTailSamplesLeft_ - chunk);

            outputAndFx_.processChunk(
                dryL_.data(), dryR_.data(), choL_.data(), choR_.data(), revL_.data(), revR_.data(),
                chunk, (injPreMaster && !anyVoiceActive && !injFilter && !injPreFx) ? 1.0f : masterGain_);
            for (int i = 0; i < chunk; ++i)
            {
                left[offset + i] = dryL_[static_cast<std::size_t>(i)];
                right[offset + i] = dryR_[static_cast<std::size_t>(i)];
            }
        }

        if (injPostMaster)
            diagProbe_.injectStereoBuffer(1, left + offset, right + offset, chunk, false);

        offset += chunk;
    }
}

float McxEngine::quantizeOutputSample(float x, McxOutputCharacter character) noexcept
{
    return McxOutputAndFx::quantizeSample(x, character);
}

} // namespace abdmcx
