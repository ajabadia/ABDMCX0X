#include "McxEngine.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace abdmcx
{

int McxEngine::getActiveVoiceCount() const noexcept
{
    int count = 0;
    for (int i = 0; i < maxPolyphony_; ++i)
        if (voices_[static_cast<std::size_t>(i)].isActive()) ++count;
    return count;
}

int McxEngine::getActivePartialCount() const noexcept
{
    int count = 0;
    for (int i = 0; i < maxPolyphony_; ++i)
        count += voices_[static_cast<std::size_t>(i)].getActivePartialCount();
    return count;
}

int McxEngine::countNeededPartials(const McxPartState& p, float velocity01) const noexcept
{
    const int midiVel = std::clamp(static_cast<int>(std::lround(velocity01 * 127.0f)), 1, 127);
    const int limit = personaSpec_.locksLimits ? personaSpec_.maxPartialsPerTone : 4;
    int count = 0;
    for (int i = 0; i < 4 && count < limit; ++i)
    {
        const auto& pc = p.partials[static_cast<std::size_t>(i)];
        if (pc.enabled && (p.isDrumKit || (midiVel >= pc.velLo && midiVel <= pc.velHi)))
            ++count;
    }
    return std::max(1, count);
}

int McxEngine::findStealCandidate() const noexcept
{
    int bestIdx = -1;
    bool bestReleasing = false;
    float bestLevel = (std::numeric_limits<float>::max)();
    std::uint64_t bestAge = (std::numeric_limits<std::uint64_t>::max)();

    for (int i = 0; i < maxPolyphony_; ++i)
    {
        const auto& v = voices_[static_cast<std::size_t>(i)];
        if (!v.isActive()) continue;
        const bool rel = v.isReleasing();
        const float lvl = v.getLastLevelEstimate();
        const std::uint64_t age = v.getTimestamp();
        if (bestIdx < 0 || (rel && !bestReleasing) ||
            (rel == bestReleasing && (lvl < bestLevel - 1e-4f || (std::abs(lvl - bestLevel) <= 1e-4f && age < bestAge))))
        {
            bestIdx = i;
            bestReleasing = rel;
            bestLevel = lvl;
            bestAge = age;
        }
    }
    return bestIdx;
}

int McxEngine::allocateVoiceSlot(int requestedPartials) noexcept
{
    while (getActivePartialCount() + requestedPartials > partialBudget_)
    {
        const int stealIdx = findStealCandidate();
        if (stealIdx < 0) break;
        auto& stolen = voices_[static_cast<std::size_t>(stealIdx)];
        if (stolen.getPartIndex() >= 0 && stolen.getDrumSlotNote() >= 0)
            part(stolen.getPartIndex()).drumSlots[static_cast<std::size_t>(stolen.getDrumSlotNote())].activeSounding = false;
        stolen.forceChoke();
    }

    for (int i = 0; i < maxPolyphony_; ++i)
        if (!voices_[static_cast<std::size_t>(i)].isActive()) return i;

    const int victim = findStealCandidate();
    if (victim >= 0)
    {
        auto& stolen = voices_[static_cast<std::size_t>(victim)];
        if (stolen.getPartIndex() >= 0 && stolen.getDrumSlotNote() >= 0)
            part(stolen.getPartIndex()).drumSlots[static_cast<std::size_t>(stolen.getDrumSlotNote())].activeSounding = false;
        stolen.forceChoke();
        return victim;
    }
    return 0;
}

McxVoiceRenderConfig McxEngine::buildVoiceConfig(const McxPartState& p) const noexcept
{
    McxVoiceRenderConfig cfg;
    cfg.structureMode = p.structureMode;
    cfg.partLevel = p.level;
    cfg.partPan = p.pan;
    cfg.vectorX = p.vectorX;
    cfg.vectorY = p.vectorY;
    cfg.reverbSend = p.reverbSend;
    cfg.chorusSend = p.chorusSend;
    cfg.partials = p.partials;
    cfg.forcePartFilterModel = personaSpec_.locksLimits;
    cfg.forcedFilterModel = personaSpec_.defaultFilter;
    cfg.maxPartialsAllowed = personaSpec_.locksLimits ? personaSpec_.maxPartialsPerTone : 4;
    cfg.masterTuneSemitones = masterTuneSemitones_;
    cfg.portamentoEnabled = p.portamentoEnabled && !p.isDrumKit;
    cfg.portamentoTimeMs = p.portamentoTimeMs;
    cfg.lastNoteSemitones = p.lastNoteSemitones;
    return cfg;
}

void McxEngine::setMasterTuneHz(float a4Hz) noexcept
{
    masterTuneHz_ = std::clamp(a4Hz, 415.0f, 466.0f);
    masterTuneSemitones_ = 12.0f * std::log2(masterTuneHz_ / 440.0f);
}

void McxEngine::setPartKind(int partIndex, McxPartKind kind) noexcept
{
    auto& p = part(partIndex);
    p.kind = kind;
    p.isDrumKit = (kind == McxPartKind::DrumMap);
    p.followGlobalTranspose = (kind == McxPartKind::Chromatic);
    if (p.isDrumKit)
    {
        for (int n = 0; n < 128; ++n)
        {
            auto& slot = p.drumSlots[static_cast<std::size_t>(n)];
            if (slot.level <= 0.0f) slot.level = 0.9f;
            if (slot.decayMs <= 0.0f) slot.decayMs = 260.0f;
            if (slot.coarseKey == 0) slot.coarseKey = static_cast<std::uint8_t>(n);
        }
    }
}

bool McxEngine::isAnyPartSoloed() const noexcept
{
    for (const auto& p : parts_)
        if (p.solo) return true;
    return false;
}

bool McxEngine::isPartAudible(int partIndex) const noexcept
{
    const auto& p = part(partIndex);
    if (!p.enabled) return false;
    if (isAnyPartSoloed()) return p.solo;
    return !p.mute;
}

void McxEngine::routeMidiChannelNoteOn(int midiChannel1to16, int midiNote, float velocity, std::int32_t sampleOffset) noexcept
{
    const int ch = std::clamp(midiChannel1to16, 1, 16);
    const int note = std::clamp(midiNote, 0, 127);
    for (int i = 0; i < kNumParts; ++i)
    {
        const auto& p = parts_[static_cast<std::size_t>(i)];
        if (p.enabled && static_cast<int>(p.midiChannel) == ch && note >= p.keyLow && note <= p.keyHigh)
        {
            const int effNote = (p.followGlobalTranspose && !p.isDrumKit)
                                    ? transposer_.processNote(note)
                                    : note;
            triggerNote(i, effNote, velocity, sampleOffset);
        }
    }
}

void McxEngine::routeMidiChannelNoteOff(int midiChannel1to16, int midiNote, std::int32_t sampleOffset) noexcept
{
    const int ch = std::clamp(midiChannel1to16, 1, 16);
    const int note = std::clamp(midiNote, 0, 127);
    for (int i = 0; i < kNumParts; ++i)
    {
        const auto& p = parts_[static_cast<std::size_t>(i)];
        if (p.enabled && static_cast<int>(p.midiChannel) == ch && note >= p.keyLow && note <= p.keyHigh)
        {
            const int effNote = (p.followGlobalTranspose && !p.isDrumKit)
                                    ? transposer_.processNote(note)
                                    : note;
            releaseNote(i, effNote, sampleOffset);
        }
    }
}

void McxEngine::allNotesOff() noexcept
{
    for (auto& v : voices_)
        v.forceChoke();
    for (auto& p : parts_)
    {
        p.arp.reset();
        for (auto& slot : p.drumSlots)
            slot.activeSounding = false;
    }
}

void McxEngine::applyDrumMuteGroup(int partIdx, McxPartState& p, int slotNote) noexcept
{
    if (slotNote < 0 || slotNote >= 128)
        return;

    const auto& triggered = p.drumSlots[static_cast<std::size_t>(slotNote)];
    if (triggered.muteGroup != 0)
    {
        for (int n = 0; n < 128; ++n)
        {
            if (n != slotNote && p.drumSlots[static_cast<std::size_t>(n)].muteGroup == triggered.muteGroup)
                p.drumSlots[static_cast<std::size_t>(n)].activeSounding = false;
        }
        for (int i = 0; i < maxPolyphony_; ++i)
        {
            auto& v = voices_[static_cast<std::size_t>(i)];
            if (v.isActive() && v.getPartIndex() == partIdx && v.getDrumMuteGroup() == triggered.muteGroup)
                v.forceChoke();
        }
    }
    p.drumSlots[static_cast<std::size_t>(slotNote)].activeSounding = true;
}

void McxEngine::triggerInternalVoice(int partIdx, int inputNote, float velocity, float eventAccent) noexcept
{
    auto& p = part(partIdx);
    const int needed = countNeededPartials(p, velocity);
    const int voiceIdx = allocateVoiceSlot(needed);
    const auto cfg = buildVoiceConfig(p);
    ++noteCounter_;

    if (p.isDrumKit)
    {
        const int mappedSlot = static_cast<int>(p.drumRemapper.inputToSlot[static_cast<std::size_t>(inputNote)]);
        applyDrumMuteGroup(partIdx, p, mappedSlot);
        voices_[static_cast<std::size_t>(voiceIdx)].noteOnDrum(
            partIdx, inputNote, mappedSlot, velocity, eventAccent, p.drumSlots[static_cast<std::size_t>(mappedSlot)], cfg, noteCounter_);
    }
    else
    {
        voices_[static_cast<std::size_t>(voiceIdx)].noteOnMelodic(partIdx, inputNote, velocity, eventAccent, cfg, noteCounter_);
        p.lastNoteSemitones = static_cast<float>(inputNote);
    }
    fxTailSamplesLeft_ = static_cast<int>(sampleRate_ * 2.5);
}

void McxEngine::releaseInternalVoice(int partIdx, int inputNote) noexcept
{
    const auto& p = part(partIdx);
    const int mappedSlot = p.isDrumKit ? static_cast<int>(p.drumRemapper.inputToSlot[static_cast<std::size_t>(inputNote)]) : -1;
    for (int i = 0; i < maxPolyphony_; ++i)
    {
        auto& v = voices_[static_cast<std::size_t>(i)];
        if (v.isActive() && v.getPartIndex() == partIdx && v.isHeldByKey() && v.getMidiNote() == inputNote)
        {
            v.noteOff();
            if (p.isDrumKit && mappedSlot >= 0 && p.drumSlots[static_cast<std::size_t>(mappedSlot)].triggerMode == McxDrumTriggerMode::Gated)
                parts_[static_cast<std::size_t>(partIdx)].drumSlots[static_cast<std::size_t>(mappedSlot)].activeSounding = false;
        }
    }
}

} // namespace abdmcx
