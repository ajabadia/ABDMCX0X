#include "McxEngine.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

int McxEngine::getActiveVoiceCount() const noexcept
{
    return engineRegistry_.romplerPool().getActiveVoiceCount();
}

int McxEngine::getActivePartialCount() const noexcept
{
    return engineRegistry_.romplerPool().getActivePartialCount();
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
    engineRegistry_.rompler(idx).setDrumMode(p.isDrumKit);
}

void McxEngine::setPartEnabled(int partIndex, bool enabled) noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    const auto uIdx = static_cast<std::size_t>(idx);
    auto& p = parts_[uIdx];
    const bool wasEnabled = p.enabled;
    p.enabled = enabled;
    if (wasEnabled && !enabled)
    {
        if (engineSlots_[uIdx] != nullptr)
            engineSlots_[uIdx]->allNotesOff();
        if (outboundQueue_ != nullptr && HardwareMirrorRouter::routesToExternal(p.routeMode))
        {
            for (std::size_t n = 0; n < 128; ++n)
            {
                if (p.latchedNoteMap[n] >= 0)
                    emitExternalNoteOff(idx, p, static_cast<int>(p.latchedNoteMap[n]), 0);
            }
            outboundQueue_->push(HardwareMirrorRouter::makeCc(p.midiChannel, 123, 0, 0, p.midiPortIndex));
        }
        p.arp.reset();
        p.latchedNoteMap.fill(-1);
        for (auto& slot : p.drumSlots)
            slot.activeSounding = false;
        p.mute = false;
        p.solo = false;
        partPeaks_[uIdx] = 0.0f;
        partMidiPeaks_[uIdx] = 0.0f;
    }
}

bool McxEngine::setBankLayoutJson(std::string_view jsonText)
{
    if (!bankLayout_.deserializeJson(jsonText))
        return false;
    const std::uint64_t used = bankLayout_.usedPartsMask();
    for (int i = 0; i < kNumParts; ++i)
        setPartEnabled(i, (used & (1ull << i)) != 0ull);
    return true;
}

bool McxEngine::isAnyPartSoloed() const noexcept
{
    for (const auto& p : parts_)
        if (p.enabled && p.solo) return true;
    return false;
}

bool McxEngine::isPartAudible(int partIndex) const noexcept
{
    const auto& p = part(partIndex);
    if (!p.enabled) return false;
    if (isAnyPartSoloed()) return p.solo;
    return !p.mute;
}

void McxEngine::routeMidiPortChannelNoteOn(int midiInPortIdx, int midiChannel1to16, int midiNote, float velocity, std::int32_t sampleOffset) noexcept
{
    const int ch = std::clamp(midiChannel1to16, 1, 16);
    const int note = std::clamp(midiNote, 0, 127);
    for (int i = 0; i < kNumParts; ++i)
    {
        const auto& p = parts_[static_cast<std::size_t>(i)];
        if (p.enabled && static_cast<int>(p.midiInPortIndex) == midiInPortIdx
            && static_cast<int>(p.midiChannel) == ch && note >= p.keyLow && note <= p.keyHigh)
        {
            triggerPartNoteOn(i, note, velocity, sampleOffset);
        }
    }
}

void McxEngine::routeMidiPortChannelNoteOff(int midiInPortIdx, int midiChannel1to16, int midiNote, std::int32_t sampleOffset) noexcept
{
    const int ch = std::clamp(midiChannel1to16, 1, 16);
    const int note = std::clamp(midiNote, 0, 127);
    for (int i = 0; i < kNumParts; ++i)
    {
        const auto& p = parts_[static_cast<std::size_t>(i)];
        if (p.enabled && static_cast<int>(p.midiInPortIndex) == midiInPortIdx
            && static_cast<int>(p.midiChannel) == ch && note >= p.keyLow && note <= p.keyHigh)
        {
            releasePartNoteOff(i, note, sampleOffset);
        }
    }
}

void McxEngine::routeMidiPortChannelCc(int midiInPortIdx, int midiChannel1to16, int ccNumber, int ccValue) noexcept
{
    const int ch = std::clamp(midiChannel1to16, 1, 16);
    if (ccNumber == 64)
    {
        const bool down = (ccValue >= 64);
        for (int i = 0; i < kNumParts; ++i)
        {
            const auto& p = parts_[static_cast<std::size_t>(i)];
            if (p.enabled && static_cast<int>(p.midiInPortIndex) == midiInPortIdx && static_cast<int>(p.midiChannel) == ch)
                setPartSustainPedal(i, down);
        }
    }
}

void McxEngine::routeMidiChannelNoteOn(int midiChannel1to16, int midiNote, float velocity, std::int32_t sampleOffset) noexcept
{
    routeMidiPortChannelNoteOn(0, midiChannel1to16, midiNote, velocity, sampleOffset);
}

void McxEngine::routeMidiChannelNoteOff(int midiChannel1to16, int midiNote, std::int32_t sampleOffset) noexcept
{
    routeMidiPortChannelNoteOff(0, midiChannel1to16, midiNote, sampleOffset);
}

void McxEngine::routeMidiChannelCc(int midiChannel1to16, int ccNumber, int ccValue) noexcept
{
    routeMidiPortChannelCc(0, midiChannel1to16, ccNumber, ccValue);
}

void McxEngine::setPartSustainPedal(int partIdx, bool down) noexcept
{
    if (partIdx >= 0 && partIdx < kNumParts)
    {
        auto* eng = engineSlots_[static_cast<std::size_t>(partIdx)];
        if (eng != nullptr)
            eng->setSustainPedal(down);
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
    kickDuckEnvelope_ = 0.0f;
    audioDuckEnvelope_ = 0.0f;
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

    if (eng == &engineRegistry_.rompler(idx))
        engineRegistry_.rompler(idx).setDrumMode(parts_[static_cast<std::size_t>(idx)].isDrumKit);
    eng->noteOff(inputNote);
}

void McxEngine::setPartPresetName(int partIndex, const char* name) noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    auto& p = parts_[static_cast<std::size_t>(idx)];
    p.customPresetName[0] = '\0';
    if (name != nullptr)
    {
        std::size_t i = 0;
        for (; i + 1 < sizeof(p.customPresetName) && name[i] != '\0'; ++i)
            p.customPresetName[i] = name[i];
        p.customPresetName[i] = '\0';
    }
    if (engineSlots_[static_cast<std::size_t>(idx)] == &engineRegistry_.rompler(idx))
        engineRegistry_.rompler(idx).setCurrentPresetName(name ? name : "");
}

const char* McxEngine::getPartDisplayPresetName(int partIndex) const noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    const char* engName = getPartCurrentPresetName(idx);
    if (engName != nullptr && engName[0] != '\0')
        return engName;
    return parts_[static_cast<std::size_t>(idx)].customPresetName;
}

void McxEngine::setFxGate(int gateIdx, bool active) noexcept
{
    if (gateIdx < 0 || gateIdx >= 4) return;
    fxGates_[static_cast<std::size_t>(gateIdx)] = active;
    if (gateIdx == 0) setManualDuckGate(active);
}

bool McxEngine::getFxGate(int gateIdx) const noexcept
{
    return (gateIdx >= 0 && gateIdx < 4) ? fxGates_[static_cast<std::size_t>(gateIdx)] : false;
}

float McxEngine::getFocusedLfoValue(int lfoIdx01) const noexcept
{
    return (lfoIdx01 == 1) ? lfoValueBipolar_[1] : lfoValueBipolar_[0];
}

void McxEngine::advanceFocusedLfoTelemetry(int numSamples) noexcept
{
    if (numSamples <= 0 || sampleRate_ <= 100.0) return;
    static constexpr float kSyncBeats[18] = {
        128.0f, 64.0f, 32.0f, 16.0f, 8.0f, 4.0f, 3.0f, 2.0f, 1.5f,
        1.0f, 0.75f, 0.5f, 1.0f / 3.0f, 0.375f, 0.25f, 1.0f / 6.0f, 0.125f, 0.0625f
    };
    const auto& fp = parts_[static_cast<std::size_t>(std::clamp(focusedPartIndex_, 0, kNumParts - 1))];
    const float dt = static_cast<float>(numSamples) / static_cast<float>(sampleRate_);
    const float bps = masterTempoBpm_ / 60.0f;

    auto stepLfo = [&](int i, bool sync, std::uint8_t shape, float rate) {
        const std::size_t u = static_cast<std::size_t>(i);
        const float freqHz = sync
            ? (bps / kSyncBeats[std::clamp(static_cast<int>(std::lround(rate)), 0, 17)])
            : std::clamp(rate, 0.005f, 1280.0f);
        float ph = lfoPhase01_[u] + freqHz * dt;
        const bool wrapped = (ph >= 1.0f);
        ph -= std::floor(ph);
        lfoPhase01_[u] = ph;
        if (shape == 0) lfoValueBipolar_[u] = std::sin(ph * 6.2831853f);
        else if (shape == 1) lfoValueBipolar_[u] = 1.0f - 4.0f * std::abs(ph - 0.5f);
        else if (shape == 2) lfoValueBipolar_[u] = (ph < 0.5f) ? 1.0f : -1.0f;
        else if (shape == 3) lfoValueBipolar_[u] = ph * 2.0f - 1.0f;
        else if (shape == 4) lfoValueBipolar_[u] = 1.0f - ph * 2.0f;
        else if (shape == 7) lfoValueBipolar_[u] = (ph < 0.25f) ? 1.0f : -1.0f;
        else if (wrapped || lfoValueBipolar_[u] == 0.0f) {
            lfoRng_ = lfoRng_ * 1664525u + 1013904223u;
            lfoValueBipolar_[u] = (static_cast<float>(lfoRng_ >> 16) / 32768.0f) - 1.0f;
        }
    };
    stepLfo(0, fp.lfo1Sync, fp.lfo1Shape, fp.lfo1Rate);
    stepLfo(1, fp.lfo2Sync, fp.lfo2Shape, fp.lfo2Rate);
}

} // namespace abdmcx
