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

IMcxSoundEngine* McxEngine::getPartSoundEngine(int partIndex) noexcept
{
    return engineSlots_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))];
}

void McxEngine::setPartSoundEngine(int partIndex, IMcxSoundEngine* customEngine) noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    const auto uIdx = static_cast<std::size_t>(idx);
    if (engineSlots_[uIdx] != nullptr)
        engineSlots_[uIdx]->allNotesOff();

    engineSlots_[uIdx] = (customEngine != nullptr) ? customEngine : &romplerEngines_[uIdx];
    engineSlots_[uIdx]->prepare(sampleRate_, McxOutputAndFx::kMaxChunk);
    cacheSemanticDestIds(idx);
    lastSemanticOffsets_[uIdx] = McxTrackSemanticOffsets {};
}

McxTrackModRouter& McxEngine::modRouter(int partIndex) noexcept
{
    return modRouters_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))];
}

const McxTrackModRouter& McxEngine::modRouter(int partIndex) const noexcept
{
    return modRouters_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))];
}

void McxEngine::cacheSemanticDestIds(int partIdx) noexcept
{
    const auto uIdx = static_cast<std::size_t>(partIdx);
    const IMcxSoundEngine* eng = engineSlots_[uIdx];
    auto& ids = semanticDestIds_[uIdx];
    if (eng == nullptr)
    {
        ids = CachedSemanticIds {};
        return;
    }
    ids.cutoff  = eng->findInputByRole(abd::synth::role::kFilterCutoff);
    ids.reso    = eng->findInputByRole(abd::synth::role::kFilterResonance);
    ids.attack  = eng->findInputByRole(abd::synth::role::kAmpEnvAttack);
    ids.decay   = eng->findInputByRole(abd::synth::role::kAmpEnvDecay);
    ids.sustain = eng->findInputByRole(abd::synth::role::kAmpEnvSustain);
    ids.release = eng->findInputByRole(abd::synth::role::kAmpEnvRelease);
    ids.vibrato = eng->findInputByRole(abd::synth::role::kLfo1Depth);
}

void McxEngine::syncPartEngineControl(int partIdx) noexcept
{
    const auto uIdx = static_cast<std::size_t>(partIdx);
    auto& p = parts_[uIdx];
    IMcxSoundEngine* eng = engineSlots_[uIdx];
    if (eng == nullptr)
        return;

    auto& rompler = romplerEngines_[uIdx];
    rompler.setDrumMode(p.isDrumKit);
    rompler.patch().level = 1.0f;
    rompler.patch().pan = 0.0f;

    eng->setTransportContext({ static_cast<double>(masterTempoBpm_), masterTuneSemitones_, p.pitchBendSemitones });

    const auto& o = p.semanticOffsets;
    auto& prev = lastSemanticOffsets_[uIdx];
    auto& mr = modRouters_[uIdx];
    const auto& ids = semanticDestIds_[uIdx];

    if (o.cutoffOctaves != prev.cutoffOctaves) mr.setDirectOffset(ids.cutoff, o.cutoffOctaves);
    if (o.resonance != prev.resonance)         mr.setDirectOffset(ids.reso, o.resonance);
    if (o.envAttack != prev.envAttack)         mr.setDirectOffset(ids.attack, o.envAttack);
    if (o.envDecay != prev.envDecay)           mr.setDirectOffset(ids.decay, o.envDecay);
    if (o.envSustain != prev.envSustain)       mr.setDirectOffset(ids.sustain, o.envSustain);
    if (o.envRelease != prev.envRelease)       mr.setDirectOffset(ids.release, o.envRelease);
    if (o.vibratoDepth != prev.vibratoDepth)   mr.setDirectOffset(ids.vibrato, o.vibratoDepth);
    prev = o;

    mr.applyTo(*eng);
}

void McxEngine::setMachinePersona(McxMachinePersona persona) noexcept
{
    persona_ = persona;
    personaSpec_ = getMachinePersonaSpec(persona);
    maxPolyphony_ = std::clamp<int>(personaSpec_.defaultVoiceLimit, 1, kMaxVoices);
    partialBudget_ = std::clamp<int>(personaSpec_.defaultPartialBudget, 1, kMaxVoices * 4);
    romplerPool_.setMaxPolyphony(maxPolyphony_);
    romplerPool_.setPartialBudget(partialBudget_);
    setOutputCharacter(personaSpec_.defaultDac);

    for (auto& rompler : romplerEngines_)
    {
        rompler.patch().forcePartFilterModel = personaSpec_.locksLimits;
        rompler.patch().maxPartialsAllowed = personaSpec_.locksLimits ? static_cast<int>(personaSpec_.maxPartialsPerTone) : 4;
        if (personaSpec_.locksLimits)
        {
            rompler.patch().filterModel = personaSpec_.defaultFilter;
            rompler.drumKit().drumMapMode = personaSpec_.defaultDrumMapMode;
        }
    }
}

void McxEngine::setMaxPolyphony(int maxVoices) noexcept
{
    maxPolyphony_ = std::clamp(maxVoices, 1, kMaxVoices);
    romplerPool_.setMaxPolyphony(maxPolyphony_);
}

void McxEngine::setPartialBudget(int maxPartials) noexcept
{
    partialBudget_ = std::clamp(maxPartials, 1, kMaxVoices * 4);
    romplerPool_.setPartialBudget(partialBudget_);
}

void McxEngine::setAccentAmount(float accent01) noexcept { accentAmount_ = std::clamp(accent01, 0.0f, 1.0f); }
void McxEngine::setMasterVolume(float gain) noexcept { masterGain_ = std::clamp(gain, 0.0f, 2.0f); }
void McxEngine::setFxMix(float chorusMix, float delayMix, float reverbMix) noexcept { outputAndFx_.setSendReturns(chorusMix, delayMix, reverbMix); }

void McxEngine::setOutputCharacter(McxOutputCharacter character) noexcept
{
    outputCharacter_ = character;
    outputAndFx_.setOutputCharacter(character);
}

void McxEngine::setMasterTempoBpm(float bpm) noexcept
{
    masterTempoBpm_ = std::clamp(bpm, 20.0f, 300.0f);
    for (auto& p : parts_)
        p.arp.setTempoBPM(masterTempoBpm_);
    outputAndFx_.setDelayTempoSyncBpm(masterTempoBpm_);
}

void McxEngine::emitExternalNoteOn(int partIdx, const McxPartState& p, int note, float velocity, std::int32_t sampleOffset) noexcept
{
    const int clampedNote = std::clamp(note, 0, 127);
    const std::uint8_t outNote = p.isDrumKit
        ? p.drumRemapper.slotToExternal[static_cast<std::size_t>(p.drumRemapper.inputToSlot[static_cast<std::size_t>(clampedNote)])]
        : static_cast<std::uint8_t>(clampedNote);
    const float velClamped = std::clamp(velocity, 0.0f, 1.0f);
    const std::uint8_t velByte = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(std::lround(velClamped * 127.0f)), 1, 127));
    if (partIdx >= 0 && partIdx < kNumParts)
    {
        auto& mp = partMidiPeaks_[static_cast<std::size_t>(partIdx)];
        mp = std::max(mp, velClamped);
    }
    if (outboundQueue_ != nullptr)
        outboundQueue_->push(HardwareMirrorRouter::makeNoteOn(p.midiChannel, outNote, velByte, sampleOffset, p.midiPortIndex));
}

void McxEngine::emitExternalNoteOff(int /*partIdx*/, const McxPartState& p, int note, std::int32_t sampleOffset) noexcept
{
    const int clampedNote = std::clamp(note, 0, 127);
    const std::uint8_t outNote = p.isDrumKit
        ? p.drumRemapper.slotToExternal[static_cast<std::size_t>(p.drumRemapper.inputToSlot[static_cast<std::size_t>(clampedNote)])]
        : static_cast<std::uint8_t>(clampedNote);
    if (outboundQueue_ != nullptr)
        outboundQueue_->push(HardwareMirrorRouter::makeNoteOff(p.midiChannel, outNote, sampleOffset, p.midiPortIndex));
}

void McxEngine::dispatchNoteOnToOutputs(int partIdx, int note, float velocity, float eventAccent, std::int32_t sampleOffset) noexcept
{
    const auto& p = part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
        triggerInternalVoice(partIdx, note, velocity, eventAccent);
    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
        emitExternalNoteOn(partIdx, p, note, velocity, sampleOffset);
}

void McxEngine::dispatchNoteOffToOutputs(int partIdx, int note, std::int32_t sampleOffset) noexcept
{
    const auto& p = part(partIdx);
    if (HardwareMirrorRouter::routesToInternal(p.routeMode))
        releaseInternalVoice(partIdx, note);
    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
        emitExternalNoteOff(partIdx, p, note, sampleOffset);
}

void McxEngine::triggerPartNoteOn(int partIndex, int inputNote, float velocity, std::int32_t sampleOffset) noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    auto& p = parts_[static_cast<std::size_t>(idx)];
    if (!p.enabled) return;

    const int rawIn = std::clamp(inputNote, 0, 127);
    const int effNote = (p.followGlobalTranspose && !p.isDrumKit) ? transposer_.processNote(rawIn) : rawIn;
    const int prevLatched = static_cast<int>(p.latchedNoteMap[static_cast<std::size_t>(rawIn)]);
    if (prevLatched >= 0 && prevLatched != effNote)
    {
        if (p.arp.isEnabled()) p.arp.noteOff(prevLatched);
        else dispatchNoteOffToOutputs(idx, prevLatched, sampleOffset);
    }
    p.latchedNoteMap[static_cast<std::size_t>(rawIn)] = static_cast<std::int8_t>(effNote);
    if (p.arp.isEnabled()) p.arp.noteOn(effNote, velocity);
    else dispatchNoteOnToOutputs(idx, effNote, velocity, accentAmount_, sampleOffset);
}

void McxEngine::releasePartNoteOff(int partIndex, int inputNote, std::int32_t sampleOffset) noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    auto& p = parts_[static_cast<std::size_t>(idx)];
    if (!p.enabled) return;

    const int rawIn = std::clamp(inputNote, 0, 127);
    int effNote = static_cast<int>(p.latchedNoteMap[static_cast<std::size_t>(rawIn)]);
    if (effNote < 0)
        effNote = (p.followGlobalTranspose && !p.isDrumKit) ? transposer_.processNote(rawIn) : rawIn;
    p.latchedNoteMap[static_cast<std::size_t>(rawIn)] = -1;
    if (p.arp.isEnabled()) p.arp.noteOff(effNote);
    else dispatchNoteOffToOutputs(idx, effNote, sampleOffset);
}

void McxEngine::triggerInternalNoteOnly(int partIndex, int midiNote, float velocity) noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    auto& p = parts_[static_cast<std::size_t>(idx)];
    if (!p.enabled || !HardwareMirrorRouter::routesToInternal(p.routeMode)) return;
    const int clampedNote = std::clamp(midiNote, 0, 127);
    if (p.arp.isEnabled()) p.arp.noteOn(clampedNote, velocity);
    else triggerInternalVoice(idx, clampedNote, velocity, accentAmount_);
}

void McxEngine::releaseInternalNoteOnly(int partIndex, int midiNote) noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    auto& p = parts_[static_cast<std::size_t>(idx)];
    if (!p.enabled || !HardwareMirrorRouter::routesToInternal(p.routeMode)) return;
    const int clampedNote = std::clamp(midiNote, 0, 127);
    if (p.arp.isEnabled()) p.arp.noteOff(clampedNote);
    else releaseInternalVoice(idx, clampedNote);
}

void McxEngine::triggerNote(int partIndex, int midiNote, float velocity, std::int32_t sampleOffset) noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    auto& p = parts_[static_cast<std::size_t>(idx)];
    if (!p.enabled) return;

    const int clampedNote = std::clamp(midiNote, 0, 127);
    if (p.arp.isEnabled()) p.arp.noteOn(clampedNote, velocity);
    else dispatchNoteOnToOutputs(idx, clampedNote, velocity, accentAmount_, sampleOffset);

    if (HardwareMirrorRouter::routesToExternal(p.routeMode))
    {
        if (p.isDrumKit)
        {
            const int mappedSlot = static_cast<int>(p.drumRemapper.inputToSlot[static_cast<std::size_t>(clampedNote)]);
            const std::uint8_t extNote = p.drumRemapper.slotToExternal[static_cast<std::size_t>(mappedSlot)];
            const auto& slot = p.drumSlots[static_cast<std::size_t>(mappedSlot)];
            const auto levelByte = static_cast<std::uint8_t>(std::clamp(std::lround(slot.level * 127.0f), 0L, 127L));
            mirrorRouter_.emitDrumKeyNrpn(p.midiChannel, 26, extNote, levelByte, sampleOffset, p.midiPortIndex);
        }
        else
        {
            const auto cutoffByte = static_cast<std::uint8_t>(std::clamp(std::lround(p.partials[0].cutoffHz / 20000.0f * 100.0f + 14.0f), 14L, 114L));
            mirrorRouter_.emitNrpn(p.midiChannel, 1, 32, cutoffByte, sampleOffset, p.midiPortIndex);
        }
    }
}

void McxEngine::releaseNote(int partIndex, int midiNote, std::int32_t sampleOffset) noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    auto& p = parts_[static_cast<std::size_t>(idx)];
    if (!p.enabled) return;

    const int clampedNote = std::clamp(midiNote, 0, 127);
    if (p.arp.isEnabled()) p.arp.noteOff(clampedNote);
    else dispatchNoteOffToOutputs(idx, clampedNote, sampleOffset);
}

float McxEngine::quantizeOutputSample(float x, McxOutputCharacter character) noexcept
{
    return McxOutputAndFx::quantizeSample(x, character);
}

} // namespace abdmcx
