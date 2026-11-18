#include "McxOutputAndFx.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

void McxOutputAndFx::prepare(double sampleRate) noexcept
{
    sampleRate_ = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    rack_.prepare(sampleRate_);
    rack_.getReverb().setMixNorm(1.0f);

    setReverbMacro(reverbMacro_);
    setChorusMacro(chorusMacro_);
    setSendReturns(chorusMix_, delayMix_, reverbMix_, auxMix_);
    reset();
}

void McxOutputAndFx::reset() noexcept
{
    rack_.reset();
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

McxOutputAndFx::ActiveSendLabels McxOutputAndFx::getActiveSendLabels() const noexcept
{
    using Profile = abd::dsp::RolandGsMc303FxProfile;
    ActiveSendLabels l {};
    const auto* r = Profile::findReverb(reverbMacro_);
    if (r) l.sendA = r->name;
    const auto* c = Profile::findChorus(chorusMacro_);
    if (c) l.sendB = c->name;
    return l;
}

float McxOutputAndFx::quantizeSample(float x, McxOutputCharacter character) noexcept
{
    if (character == McxOutputCharacter::HdStudio)
        return x;

    const float clamped = std::clamp(x, -1.0f, 1.0f);
    const float levels = (character == McxOutputCharacter::Sampler12Bit) ? 2048.0f : 32768.0f;
    return std::round(clamped * levels) / levels;
}

void McxOutputAndFx::processChunk(float* dryL,
                                  float* dryR,
                                  const float* sendAL,
                                  const float* sendAR,
                                  const float* sendBL,
                                  const float* sendBR,
                                  const float* sendCL,
                                  const float* sendCR,
                                  const float* sendDL,
                                  const float* sendDR,
                                  int numSamples,
                                  float masterGain,
                                  const ControlFrame& ctrl) noexcept
{
    rack_.processMultiBus(dryL, dryR,
                          sendAL, sendAR,
                          sendBL, sendBR,
                          sendCL, sendCR,
                          sendDL, sendDR,
                          numSamples, masterGain, ctrl);

    if (character_ != McxOutputCharacter::HdStudio && dryL && dryR)
    {
        for (int i = 0; i < numSamples; ++i)
        {
            dryL[i] = quantizeSample(dryL[i], character_);
            dryR[i] = quantizeSample(dryR[i], character_);
        }
    }
}

} // namespace abdmcx
