#include "McxEngine.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

int McxEngine::getActiveVoiceCount() const noexcept
{
    return romplerPool_.getActiveVoiceCount();
}

int McxEngine::getActivePartialCount() const noexcept
{
    return romplerPool_.getActivePartialCount();
}

void McxEngine::setMasterTuneHz(float a4Hz) noexcept
{
    masterTuneHz_ = std::clamp(a4Hz, 415.0f, 466.0f);
    masterTuneSemitones_ = 12.0f * std::log2(masterTuneHz_ / 440.0f);
}

void McxEngine::setPartKind(int partIndex, McxPartKind kind) noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    auto& p = part(idx);
    p.kind = kind;
    p.isDrumKit = (kind == McxPartKind::DrumMap);
    p.followGlobalTranspose = (kind == McxPartKind::Chromatic);
    romplerEngines_[static_cast<std::size_t>(idx)].setDrumMode(p.isDrumKit);
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
            triggerPartNoteOn(i, note, velocity, sampleOffset);
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
            releasePartNoteOff(i, note, sampleOffset);
    }
}

void McxEngine::allNotesOff() noexcept
{
    for (int i = 0; i < kNumParts; ++i)
    {
        const auto idx = static_cast<std::size_t>(i);
        if (engineSlots_[idx] != nullptr)
            engineSlots_[idx]->allNotesOff();

        auto& p = parts_[idx];
        p.arp.reset();
        if (outboundQueue_ != nullptr && HardwareMirrorRouter::routesToExternal(p.routeMode))
        {
            for (std::size_t n = 0; n < 128; ++n)
            {
                if (p.latchedNoteMap[n] >= 0)
                    emitExternalNoteOff(-1, p, static_cast<int>(p.latchedNoteMap[n]), 0);
            }
            outboundQueue_->push(HardwareMirrorRouter::makeCc(p.midiChannel, 123, 0, 0, p.midiPortIndex));
        }
        p.latchedNoteMap.fill(-1);
        for (auto& slot : p.drumSlots)
            slot.activeSounding = false;
    }
    partMidiPeaks_.fill(0.0f);
}

void McxEngine::triggerInternalVoice(int partIdx, int inputNote, float velocity, float eventAccent) noexcept
{
    const int idx = std::clamp(partIdx, 0, kNumParts - 1);
    IMcxSoundEngine* eng = engineSlots_[static_cast<std::size_t>(idx)];
    if (eng == nullptr)
        return;

    syncPartEngineControl(idx);
    eng->noteOn(inputNote, velocity, eventAccent);
    fxTailSamplesLeft_ = static_cast<int>(sampleRate_ * 2.5);
}

void McxEngine::releaseInternalVoice(int partIdx, int inputNote) noexcept
{
    const int idx = std::clamp(partIdx, 0, kNumParts - 1);
    IMcxSoundEngine* eng = engineSlots_[static_cast<std::size_t>(idx)];
    if (eng == nullptr)
        return;

    romplerEngines_[static_cast<std::size_t>(idx)].setDrumMode(parts_[static_cast<std::size_t>(idx)].isDrumKit);
    eng->noteOff(inputNote);
}

} // namespace abdmcx
