#include "McxOutputAndFx.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

void McxOutputAndFx::prepare(double sampleRate) noexcept
{
    sampleRate_ = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    rack_.prepare(sampleRate_);
    chassis_.prepare(sampleRate_);
    if (!chassis_.isSlotActive(0)) chassis_.setSlotEngine(0, McxRackEngineType::SpaceEcho, "RE-201 Lead Echo");
    if (!chassis_.isSlotActive(1)) chassis_.setSlotEngine(1, McxRackEngineType::ZitaReverb, "Zita Hall Space");
    rack_.getReverb().setMixNorm(1.0f);

    setReverbMacro(reverbMacro_);
    setChorusMacro(chorusMacro_);
    setSendReturns(chorusMix_, delayMix_, reverbMix_, auxMix_);
    reset();
}

void McxOutputAndFx::reset() noexcept
{
    rack_.reset();
    chassis_.reset();
    sendPeaks_.fill(0.0f);
}

void McxOutputAndFx::moveRackSlot(int fromIdx, int toIdx) noexcept
{
    if (fromIdx < 0 || fromIdx >= McxRackChassis::kMaxSlots || toIdx < 0 || toIdx >= McxRackChassis::kMaxSlots || fromIdx == toIdx)
        return;
    chassis_.moveSlot(fromIdx, toIdx);
    for (int b = 0; b < 4; ++b)
    {
        auto& tgt = sendSlotTargets_[static_cast<std::size_t>(b)];
        if (tgt == fromIdx) tgt = toIdx;
        else if (tgt == toIdx) tgt = fromIdx;
    }
}

void McxOutputAndFx::removeRackSlot(int slotIdx) noexcept
{
    if (slotIdx < 0 || slotIdx >= McxRackChassis::kMaxSlots)
        return;
    chassis_.removeSlotEngine(slotIdx);
    for (int b = 0; b < 4; ++b)
    {
        auto& tgt = sendSlotTargets_[static_cast<std::size_t>(b)];
        if (tgt == slotIdx) tgt = -1;
    }
}

void McxOutputAndFx::setSendReturns(float chorusMix, float delayMix, float reverbMix, float auxMix) noexcept
{
    chorusMix_ = std::clamp(chorusMix, 0.0f, 1.5f);
    delayMix_  = std::clamp(delayMix, 0.0f, 1.5f);
    reverbMix_ = std::clamp(reverbMix, 0.0f, 1.5f);
    auxMix_    = std::clamp(auxMix, 0.0f, 1.5f);

    rack_.setReturns(reverbMix_, chorusMix_, delayMix_, auxMix_);
}

void McxOutputAndFx::setReverbMacro(int macroId0to7) noexcept
{
    using Profile = abd::dsp::RolandGsMc303FxProfile;
    reverbMacro_ = std::clamp(macroId0to7, 0, Profile::kNumReverbVariants - 1);
    const auto* v = Profile::findReverb(reverbMacro_);
    if (!v) return;

    if (v->engine == Profile::ReverbEngineKind::ZitaReverb)
    {
        rack_.setSlotEngine(0, abd::dsp::DspMultiBusFxRack::SlotEngine::ReverbZita);
        rack_.getReverb().setSizeNorm(v->sizeNorm);
        rack_.getReverb().setDecayNorm(v->decayNorm);
        rack_.getReverb().setDampingNorm(v->dampingNorm);
    }
    else
    {
        rack_.setSlotEngine(0, abd::dsp::DspMultiBusFxRack::SlotEngine::DelayStereo);
        rack_.getDelay().setMode(v->engine == Profile::ReverbEngineKind::PanPingPongDelay
                                    ? abd::dsp::DspStereoDelay::kPingPong
                                    : abd::dsp::DspStereoDelay::kStereo);
        rack_.getDelay().setTimeNorm(v->delayTimeNorm);
        rack_.getDelay().setFeedbackLNorm(v->decayNorm);
        rack_.getDelay().setFeedbackRNorm(v->decayNorm);
    }
}

void McxOutputAndFx::setChorusMacro(int macroId0to7) noexcept
{
    using Profile = abd::dsp::RolandGsMc303FxProfile;
    chorusMacro_ = std::clamp(macroId0to7, 0, Profile::kNumChorusVariants - 1);
    const auto* v = Profile::findChorus(chorusMacro_);
    if (!v) return;

    if (v->engine == Profile::ChorusEngineKind::StereoChorus)
    {
        rack_.setSlotEngine(1, abd::dsp::DspMultiBusFxRack::SlotEngine::ChorusStereo);
        rack_.getChorus().setSpeedNorm(v->rateNorm);
        rack_.getChorus().setWidthLNorm(v->depthNorm);
        rack_.getChorus().setWidthRNorm(v->depthNorm);
    }
    else if (v->engine == Profile::ChorusEngineKind::Flanger)
    {
        rack_.setSlotEngine(1, abd::dsp::DspMultiBusFxRack::SlotEngine::FlangerStereo);
        rack_.getFlanger().setRateNorm(v->rateNorm);
        rack_.getFlanger().setDepthLNorm(v->depthNorm);
        rack_.getFlanger().setDepthRNorm(v->depthNorm);
        rack_.getFlanger().setBaseDelayLNorm(v->baseDelayNorm);
        rack_.getFlanger().setBaseDelayRNorm(v->baseDelayNorm);
        rack_.getFlanger().setFeedbackNorm(v->feedbackNorm);
    }
    else
    {
        rack_.setSlotEngine(1, abd::dsp::DspMultiBusFxRack::SlotEngine::DelayStereo);
        rack_.getDelay().setMode(abd::dsp::DspStereoDelay::kStereo);
        rack_.getDelay().setTimeNorm(v->baseDelayNorm);
        rack_.getDelay().setFeedbackLNorm(v->feedbackNorm);
        rack_.getDelay().setFeedbackRNorm(v->feedbackNorm);
    }
}

void McxOutputAndFx::setReverbTimeNorm(float norm) noexcept
{
    using Profile = abd::dsp::RolandGsMc303FxProfile;
    const float n = std::clamp(norm, 0.0f, 1.0f);
    const auto* v = Profile::findReverb(reverbMacro_);
    if (!v || v->engine == Profile::ReverbEngineKind::ZitaReverb)
        rack_.getReverb().setDecayNorm(n);
    else
        rack_.getDelay().setTimeNorm(n);
}

void McxOutputAndFx::setChorusRateNorm(float norm) noexcept
{
    using Profile = abd::dsp::RolandGsMc303FxProfile;
    const float n = std::clamp(norm, 0.0f, 1.0f);
    const auto* v = Profile::findChorus(chorusMacro_);
    if (!v || v->engine == Profile::ChorusEngineKind::StereoChorus)
        rack_.getChorus().setSpeedNorm(n);
    else if (v->engine == Profile::ChorusEngineKind::Flanger)
        rack_.getFlanger().setRateNorm(n);
    else
        rack_.getDelay().setTimeNorm(std::clamp(n * 0.35f, 0.02f, 0.35f));
}

void McxOutputAndFx::setDelayTempoSyncBpm(float bpm) noexcept
{
    const float safeBpm = std::clamp(bpm, 30.0f, 300.0f);
    const float ms = std::clamp(45000.0f / safeBpm, 20.0f, 513.0f);
    const float norm = std::clamp((ms - 20.0f) / 493.0f, 0.05f, 1.0f);
    rack_.getDelay().setTimeNorm(norm);
}

void McxOutputAndFx::setSendSlotTarget(int busIdx, int slotIdx) noexcept
{
    if (busIdx >= 0 && busIdx < 4)
        sendSlotTargets_[static_cast<std::size_t>(busIdx)] = (slotIdx >= 0 && slotIdx < McxRackChassis::kMaxSlots) ? slotIdx : -1;
}

int McxOutputAndFx::getSendSlotTarget(int busIdx) const noexcept
{
    return (busIdx >= 0 && busIdx < 4) ? sendSlotTargets_[static_cast<std::size_t>(busIdx)] : -1;
}

void McxOutputAndFx::setSendReturnGain(int busIdx, float gain) noexcept
{
    if (busIdx >= 0 && busIdx < 4) sendReturns_[static_cast<std::size_t>(busIdx)] = std::clamp(gain, 0.0f, 2.0f);
}

float McxOutputAndFx::getSendReturnGain(int busIdx) const noexcept
{
    return (busIdx >= 0 && busIdx < 4) ? sendReturns_[static_cast<std::size_t>(busIdx)] : 1.0f;
}

McxOutputAndFx::ActiveSendLabels McxOutputAndFx::getActiveSendLabels() const noexcept
{
    using Profile = abd::dsp::RolandGsMc303FxProfile;
    ActiveSendLabels l {};
    auto getLabel = [&](int bus, const char* fallback) -> const char* {
        const int s = sendSlotTargets_[static_cast<std::size_t>(bus)];
        if (s >= 0 && s < McxRackChassis::kMaxSlots && chassis_.isSlotActive(s)) {
            const auto& st = chassis_.getSlotState(s);
            return (st.customName[0] != '\0') ? st.customName : getRackEngineName(st.engineType).data();
        }
        return fallback;
    };
    const auto* r = Profile::findReverb(reverbMacro_);
    const auto* c = Profile::findChorus(chorusMacro_);
    l.sendA = getLabel(0, r ? r->name : "Reverb");
    l.sendB = getLabel(1, c ? c->name : "Chorus");
    l.sendC = getLabel(2, "Stereo Delay");
    l.sendD = getLabel(3, "Saturation");
    return l;
}

float McxOutputAndFx::quantizeSample(float x, McxOutputCharacter character) noexcept
{
    if (character == McxOutputCharacter::HdStudio) return x;
    const float clamped = std::clamp(x, -1.0f, 1.0f);
    const float levels = (character == McxOutputCharacter::Sampler12Bit) ? 2048.0f : 32768.0f;
    return std::round(clamped * levels) / levels;
}

void McxOutputAndFx::processChunk(float* dryL, float* dryR, const float* sendAL, const float* sendAR,
                                  const float* sendBL, const float* sendBR, const float* sendCL, const float* sendCR,
                                  const float* sendDL, const float* sendDR, int numSamples, float masterGain,
                                  const ControlFrame& ctrl, std::uint8_t excludedSlotMask) noexcept
{
    const int n = std::min(numSamples, kMaxChunk);
    const bool duckActive = (ctrl.gates[0] > 0.5f), killFx = (ctrl.gates[3] > 0.5f);
    const float* inLPtrs[4] = { sendAL, sendBL, sendCL, sendDL };
    const float* inRPtrs[4] = { sendAR, sendBR, sendCR, sendDR };
    for (int b = 0; b < 4; ++b)
    {
        float pBus = 0.0f;
        if (inLPtrs[b] && inRPtrs[b])
            for (int i = 0; i < n; ++i) pBus = std::max(pBus, std::max(std::abs(inLPtrs[b][i]), std::abs(inRPtrs[b][i])));
        sendPeaks_[static_cast<std::size_t>(b)] = std::max(pBus, sendPeaks_[static_cast<std::size_t>(b)] * 0.90f);
    }

    bool busHandledByChassis[4] { false, false, false, false };
    int busTargetSlot[4] { -1, -1, -1, -1 };
    for (int b = 0; b < 4; ++b)
    {
        if (sendBusMutes_[static_cast<std::size_t>(b)]) continue;
        const int target = sendSlotTargets_[static_cast<std::size_t>(b)];
        if (target < 0 || target >= McxRackChassis::kMaxSlots || !chassis_.isSlotActive(target)) continue;
        if ((excludedSlotMask & static_cast<std::uint8_t>(1u << target)) != 0 || !inLPtrs[b] || !inRPtrs[b]) continue;
        busHandledByChassis[b] = true;
        busTargetSlot[b] = target;
    }

    std::uint8_t processedMask = excludedSlotMask;
    for (int s = 0; s < McxRackChassis::kMaxSlots; ++s)
    {
        if ((processedMask & static_cast<std::uint8_t>(1u << s)) != 0) continue;
        bool hasBus = false;
        for (int b = 0; b < 4; ++b) if (busTargetSlot[b] == s) { hasBus = true; break; }
        if (!hasBus) continue;

        std::fill_n(slotInL_.data(), n, 0.0f); std::fill_n(slotInR_.data(), n, 0.0f);
        if (!killFx)
        {
            for (int b = 0; b < 4; ++b)
            {
                if (busTargetSlot[b] != s) continue;
                const float ret = sendReturns_[static_cast<std::size_t>(b)];
                const float *sL = inLPtrs[b], *sR = inRPtrs[b];
                for (int i = 0; i < n; ++i) { slotInL_[i] += sL[i] * ret; slotInR_[i] += sR[i] * ret; }
            }
        }
        processedMask |= static_cast<std::uint8_t>(1u << s);
        chassis_.processSlot(s, slotInL_.data(), slotInR_.data(), slotOutL_.data(), slotOutR_.data(), n, duckActive);

        const int chainTarget = chassis_.getSlotChainTarget(s);
        if (chainTarget >= 0 && chainTarget < McxRackChassis::kMaxSlots && chassis_.isSlotActive(chainTarget)
            && (processedMask & static_cast<std::uint8_t>(1u << chainTarget)) == 0)
        {
            processedMask |= static_cast<std::uint8_t>(1u << chainTarget);
            chassis_.processSlot(chainTarget, slotOutL_.data(), slotOutR_.data(), chainOutL_.data(), chainOutR_.data(), n, duckActive);
            for (int i = 0; i < n; ++i) { dryL[i] += chainOutL_[i]; dryR[i] += chainOutR_[i]; }
        }
        else
            for (int i = 0; i < n; ++i) { dryL[i] += slotOutL_[i]; dryR[i] += slotOutR_[i]; }
    }

    rack_.processMultiBus(
        dryL, dryR,
        (busHandledByChassis[0] || sendBusMutes_[0]) ? nullptr : sendAL, (busHandledByChassis[0] || sendBusMutes_[0]) ? nullptr : sendAR,
        (busHandledByChassis[1] || sendBusMutes_[1]) ? nullptr : sendBL, (busHandledByChassis[1] || sendBusMutes_[1]) ? nullptr : sendBR,
        (busHandledByChassis[2] || sendBusMutes_[2]) ? nullptr : sendCL, (busHandledByChassis[2] || sendBusMutes_[2]) ? nullptr : sendCR,
        (busHandledByChassis[3] || sendBusMutes_[3]) ? nullptr : sendDL, (busHandledByChassis[3] || sendBusMutes_[3]) ? nullptr : sendDR,
        n, masterGain, ctrl);

    if (character_ != McxOutputCharacter::HdStudio && dryL && dryR)
        for (int i = 0; i < n; ++i) { dryL[i] = quantizeSample(dryL[i], character_); dryR[i] = quantizeSample(dryR[i], character_); }
}

} // namespace abdmcx
