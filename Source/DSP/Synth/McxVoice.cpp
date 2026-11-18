#include "McxVoice.h"
#include "../Core/McxRomTables.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

void McxVoice::prepare(double sampleRate) noexcept
{
    for (auto& u : units_)
    {
        u.exciter.prepare(sampleRate);
        u.filter.prepare(sampleRate);
        u.pitchEnv.prepare(sampleRate);
        u.filterEnv.prepare(sampleRate);
        u.ampEnv.prepare(sampleRate);
    }
    reset();
}

void McxVoice::reset() noexcept
{
    active_ = false;
    heldByKey_ = false;
    partIndex_ = -1;
    midiNote_ = -1;
    drumSlotNote_ = -1;
    drumMuteGroup_ = 0;
    lastLevelEstimate_ = 0.0f;

    for (auto& u : units_)
    {
        u.enabledInVoice = false;
        u.exciter.reset();
        u.filter.reset();
        u.pitchEnv.reset();
        u.filterEnv.reset();
        u.ampEnv.reset();
        u.cutoffOverrideHz = -1.0f;
        u.resOverride = -1.0f;
        u.releaseMsOverride = -1.0f;
    }
}

void McxVoice::noteOnMelodic(int partIdx, int midiNote, float velocity01, float accent01,
                             const McxVoiceRenderConfig& cfg, std::uint64_t timestamp) noexcept
{
    reset();
    isDrumVoice_ = false;
    heldByKey_ = true;
    partIndex_ = partIdx;
    midiNote_ = std::clamp(midiNote, 0, 127);
    drumTriggerMode_ = McxDrumTriggerMode::Gated;
    timestamp_ = timestamp;
    voiceReverbSend_ = cfg.reverbSend;
    voiceChorusSend_ = cfg.chorusSend;
    voiceSlotLevel_ = 1.0f;

    const int midiVel = std::clamp(static_cast<int>(std::lround(velocity01 * 127.0f)), 1, 127);
    const float kfScale = std::pow(2.0f, static_cast<float>(midiNote_ - 60) / 36.0f);
    const int limit = std::clamp(cfg.maxPartialsAllowed, 1, kMaxPartials);

    int enabledCount = 0;
    for (int i = 0; i < kMaxPartials && enabledCount < limit; ++i)
    {
        const auto& pc = cfg.partials[static_cast<std::size_t>(i)];
        if (!pc.enabled || midiVel < pc.velLo || midiVel > pc.velHi)
            continue;

        auto& u = units_[static_cast<std::size_t>(i)];
        u.enabledInVoice = true;
        u.velScaled = McxRomTables::applyVelocityAndAccent(velocity01, pc.velCurveIndex, accent01);
        if (pc.externalSampleData != nullptr && pc.externalSampleLength > 0)
            u.exciter.setExternalTable(pc.externalSampleData, pc.externalSampleLength, pc.externalLoopStart, pc.externalLoopEnd);
        u.exciter.noteOn(pc, static_cast<float>(midiNote_) + cfg.masterTuneSemitones);
        u.pitchEnv.noteOn(pc.pitchEnv, 1.0f, accent01, kfScale);
        u.filterEnv.noteOn(pc.filterEnv, std::clamp(u.velScaled, 0.2f, 1.35f), accent01, kfScale);
        u.ampEnv.noteOn(pc.ampEnv, u.velScaled, accent01, kfScale);
        ++enabledCount;
    }
    active_ = (enabledCount > 0);
}

void McxVoice::noteOnDrum(int partIdx, int rawInputNote, int slotNote, float velocity01, float accent01,
                          const McxDrumSlotConfig& slotCfg, const McxVoiceRenderConfig& cfg,
                          std::uint64_t timestamp) noexcept
{
    reset();
    isDrumVoice_ = true;
    heldByKey_ = true;
    partIndex_ = partIdx;
    midiNote_ = std::clamp(rawInputNote, 0, 127);
    drumSlotNote_ = std::clamp(slotNote, 0, 127);
    drumMuteGroup_ = slotCfg.muteGroup;
    drumTriggerMode_ = slotCfg.triggerMode;
    timestamp_ = timestamp;
    voiceReverbSend_ = std::max(cfg.reverbSend, slotCfg.reverbSend);
    voiceChorusSend_ = std::max(cfg.chorusSend, slotCfg.chorusSend);
    voicePanOffset_ = slotCfg.pan;
    voiceSlotLevel_ = std::clamp(slotCfg.level, 0.0f, 1.5f);

    const float pitchedNote = static_cast<float>(slotCfg.coarseKey) +
                              slotCfg.pitchKeyTrack * static_cast<float>(slotNote - static_cast<int>(slotCfg.coarseKey));
    const int limit = std::clamp(cfg.maxPartialsAllowed, 1, kMaxPartials);

    int enabledCount = 0;
    for (int i = 0; i < kMaxPartials && enabledCount < limit; ++i)
    {
        const auto& pc = cfg.partials[static_cast<std::size_t>(i)];
        if (!pc.enabled)
            continue;

        auto& u = units_[static_cast<std::size_t>(i)];
        u.enabledInVoice = true;
        u.velScaled = McxRomTables::applyVelocityAndAccent(velocity01, pc.velCurveIndex, accent01);
        u.cutoffOverrideHz = slotCfg.cutoffHzOverride;
        u.resOverride = slotCfg.resonanceOverride;

        McxEnv4T4L drumAmp = pc.ampEnv;
        drumAmp.l0 = 0.0f;
        drumAmp.l1 = (pc.ampEnv.l1 > 0.05f) ? pc.ampEnv.l1 : 1.0f;
        drumAmp.l2 = (pc.ampEnv.l2 > 0.05f) ? pc.ampEnv.l2 : 0.8f;
        drumAmp.t1Ms = std::min(pc.ampEnv.t1Ms, 2.5f);
        drumAmp.t3Ms = std::max(10.0f, slotCfg.decayMs);
        drumAmp.t4Ms = std::max(15.0f, slotCfg.decayMs * 0.65f);
        drumAmp.l3 = (slotCfg.triggerMode == McxDrumTriggerMode::Gated) ? pc.ampEnv.l3 : 0.0f;

        McxPartialConfig drumPc = pc;
        McxEnv4T4L drumPitchEnv = pc.pitchEnv;
        const bool hasExternal = (slotCfg.externalSampleData != nullptr && slotCfg.externalSampleLength > 0) ||
                                 (pc.externalSampleData != nullptr && pc.externalSampleLength > 0);
        if (!hasExternal)
        {
            if (slotNote == 35 || slotNote == 36) { // Kick
                drumPc.vaWaveform = 3; drumPc.pitchEnvSemitones = 32.0f;
                drumPitchEnv = { 0.0f, 0.0f, 0.5f, 25.0f, 50.0f, 40.0f, 1.0f, 0.0f, 0.0f, 0.0f };
            } else if (slotNote == 38 || slotNote == 40) { // Snare
                drumPc.vaWaveform = (i == 0) ? 2 : 5; drumPc.pitchEnvSemitones = 12.0f;
                drumPitchEnv = { 0.0f, 0.0f, 0.5f, 15.0f, 30.0f, 20.0f, 1.0f, 0.0f, 0.0f, 0.0f };
            } else if (slotNote == 42 || slotNote == 44 || slotNote == 46) { // Hi-Hats
                drumPc.vaWaveform = 5; drumPc.filterMode = 1; drumPc.cutoffHz = 8000.0f;
            } else if (slotNote == 39) { // Clap
                drumPc.vaWaveform = 5; drumPc.filterMode = 2; drumPc.cutoffHz = 2800.0f;
            }
        }

        if (slotCfg.externalSampleData != nullptr && slotCfg.externalSampleLength > 0)
            u.exciter.setExternalTable(slotCfg.externalSampleData, slotCfg.externalSampleLength, slotCfg.externalLoopStart, slotCfg.externalLoopEnd);
        else if (pc.externalSampleData != nullptr && pc.externalSampleLength > 0)
            u.exciter.setExternalTable(pc.externalSampleData, pc.externalSampleLength, pc.externalLoopStart, pc.externalLoopEnd);

        u.exciter.noteOn(drumPc, pitchedNote);
        u.pitchEnv.noteOn(drumPitchEnv, 1.0f, accent01, 1.0f);
        u.filterEnv.noteOn(drumPc.filterEnv, u.velScaled, accent01, 1.0f);
        u.ampEnv.noteOn(drumAmp, u.velScaled, accent01, 1.0f);
        ++enabledCount;
    }
    active_ = (enabledCount > 0);
}

void McxVoice::noteOff() noexcept
{
    heldByKey_ = false;
    if (!active_ || (isDrumVoice_ && drumTriggerMode_ == McxDrumTriggerMode::OneShot))
        return;

    for (auto& u : units_)
    {
        if (u.enabledInVoice)
        {
            u.pitchEnv.noteOff();
            u.filterEnv.noteOff();
            u.ampEnv.noteOff();
        }
    }
}

void McxVoice::forceChoke() noexcept { reset(); }

bool McxVoice::isReleasing() const noexcept
{
    if (!active_) return false;
    for (const auto& u : units_)
        if (u.enabledInVoice && u.ampEnv.isReleasing()) return true;
    return false;
}

int McxVoice::getActivePartialCount() const noexcept
{
    if (!active_) return 0;
    int count = 0;
    for (const auto& u : units_)
        if (u.enabledInVoice && u.ampEnv.isActive()) ++count;
    return count;
}

void McxVoice::computeVectorWeights(float vx, float vy, std::array<float, 4>& weights) noexcept
{
    const float u = (std::clamp(vx, -1.0f, 1.0f) + 1.0f) * 0.5f;
    const float v = (std::clamp(vy, -1.0f, 1.0f) + 1.0f) * 0.5f;
    weights = { (1.0f - u) * (1.0f - v), u * (1.0f - v), (1.0f - u) * v, u * v };
}

void McxVoice::processBlock(float* dryL, float* dryR, float* revL, float* revR,
                            float* choL, float* choR, int numSamples,
                            const McxVoiceRenderConfig& cfg) noexcept
{
    if (!active_ || numSamples <= 0)
        return;

    std::array<float, 4> vecWeights { 1.0f, 1.0f, 1.0f, 1.0f };
    if (cfg.structureMode == McxStructureMode::Vector2D)
        computeVectorWeights(cfg.vectorX, cfg.vectorY, vecWeights);

    float peakTrack = 0.0f;
    for (int s = 0; s < numSamples; ++s)
    {
        std::array<float, 4> excL {}, excR {}, amp {};
        bool anyAlive = false;

        for (int i = 0; i < kMaxPartials; ++i)
        {
            auto& u = units_[static_cast<std::size_t>(i)];
            if (!u.enabledInVoice) continue;

            const float a = u.ampEnv.processSample();
            if (!u.ampEnv.isActive())
            {
                u.enabledInVoice = false;
                continue;
            }
            anyAlive = true;

            const auto& pc = cfg.partials[static_cast<std::size_t>(i)];
            const float pEnv = u.pitchEnv.processSample();
            const float fEnv = u.filterEnv.processSample();
            const float baseCutoff = (isDrumVoice_ && u.cutoffOverrideHz > 20.0f) ? u.cutoffOverrideHz : pc.cutoffHz;
            const float baseRes = (isDrumVoice_ && u.resOverride >= 0.0f) ? u.resOverride : pc.resonance;
            const float modCutoff = baseCutoff * std::pow(2.0f, fEnv * pc.filterEnvOctaves);
            const auto fModel = cfg.forcePartFilterModel ? cfg.forcedFilterModel : pc.filterModel;

            u.filter.setParameters(fModel, pc.filterMode, modCutoff, baseRes, pc.zplaneMorph, pc.drive);
            u.exciter.processStereo(pc, pEnv * pc.pitchEnvSemitones, excL[static_cast<std::size_t>(i)], excR[static_cast<std::size_t>(i)]);
            amp[static_cast<std::size_t>(i)] = a * pc.level * vecWeights[static_cast<std::size_t>(i)];
        }

        if (!anyAlive)
        {
            active_ = false;
            lastLevelEstimate_ = 0.0f;
            return;
        }

        if (cfg.structureMode == McxStructureMode::RingMod12 && units_[0].enabledInVoice && units_[1].enabledInVoice)
        {
            excL[0] *= excL[1];
            excR[0] *= excR[1];
            excL[1] = excR[1] = 0.0f;
        }
        else if (cfg.structureMode == McxStructureMode::Booster12 && units_[0].enabledInVoice && units_[1].enabledInVoice)
        {
            excL[1] = std::tanh(excL[1] + excL[0] * 2.4f);
            excR[1] = std::tanh(excR[1] + excR[0] * 2.4f);
            excL[0] *= 0.25f;
            excR[0] *= 0.25f;
        }

        float voiceL = 0.0f, voiceR = 0.0f;
        for (int i = 0; i < kMaxPartials; ++i)
        {
            auto& u = units_[static_cast<std::size_t>(i)];
            if (!u.enabledInVoice) continue;

            const auto idx = static_cast<std::size_t>(i);
            const float filtered = u.filter.processSample(0.5f * (excL[idx] + excR[idx]));
            const float panVal = std::clamp(cfg.partials[idx].pan + cfg.partPan + voicePanOffset_, -1.0f, 1.0f);
            float pL = 0.7f, pR = 0.7f;
            McxRomTables::panGains(panVal, pL, pR);

            const float gain = amp[idx] * cfg.partLevel * voiceSlotLevel_;
            voiceL += filtered * gain * pL;
            voiceR += filtered * gain * pR;
        }

        dryL[s] += voiceL;
        dryR[s] += voiceR;
        if (revL && revR) { revL[s] += voiceL * voiceReverbSend_; revR[s] += voiceR * voiceReverbSend_; }
        if (choL && choR) { choL[s] += voiceL * voiceChorusSend_; choR[s] += voiceR * voiceChorusSend_; }
        peakTrack = std::max(peakTrack, std::max(std::abs(voiceL), std::abs(voiceR)));
    }
    lastLevelEstimate_ = peakTrack;
}

} // namespace abdmcx
