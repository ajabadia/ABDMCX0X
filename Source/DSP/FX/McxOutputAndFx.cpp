#include "McxOutputAndFx.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

McxOutputAndFx::McxOutputAndFx()
    : fx_(std::make_unique<FxBuffers>())
{
}

void McxOutputAndFx::prepare(double sampleRate) noexcept
{
    sampleRate_ = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    if (!fx_) return;

    fx_->chorus.prepare(sampleRate_);
    fx_->flanger.prepare(sampleRate_);
    fx_->delay.prepare(sampleRate_);
    fx_->reverb.prepare(sampleRate_);
    fx_->reverb.setMixNorm(1.0f);

    setReverbMacro(reverbMacro_);
    setChorusMacro(chorusMacro_);
    reset();
}

void McxOutputAndFx::reset() noexcept
{
    if (!fx_) return;
    fx_->chorus.reset();
    fx_->flanger.reset();
    fx_->delay.reset();
    fx_->reverb.reset();
    holdL_ = 0.0f;
    holdR_ = 0.0f;
    holdCounter_ = 0;
}

void McxOutputAndFx::setSendReturns(float chorusMix, float delayMix, float reverbMix) noexcept
{
    chorusMix_ = std::clamp(chorusMix, 0.0f, 1.0f);
    delayMix_ = std::clamp(delayMix, 0.0f, 1.0f);
    reverbMix_ = std::clamp(reverbMix, 0.0f, 1.0f);
}

void McxOutputAndFx::setReverbMacro(int macroId0to7) noexcept
{
    using Profile = abd::dsp::RolandGsMc303FxProfile;
    reverbMacro_ = std::clamp(macroId0to7, 0, Profile::kNumReverbVariants - 1);
    const auto* v = Profile::findReverb(reverbMacro_);
    if (!v || !fx_) return;

    if (v->engine == Profile::ReverbEngineKind::ZitaReverb)
    {
        fx_->reverb.setSizeNorm(v->sizeNorm);
        fx_->reverb.setDecayNorm(v->decayNorm);
        fx_->reverb.setDampingNorm(v->dampingNorm);
    }
    else
    {
        fx_->delay.setMode(v->engine == Profile::ReverbEngineKind::PanPingPongDelay
                               ? abd::dsp::DspStereoDelay::kPingPong
                               : abd::dsp::DspStereoDelay::kStereo);
        fx_->delay.setTimeNorm(v->delayTimeNorm);
        fx_->delay.setFeedbackLNorm(v->decayNorm);
        fx_->delay.setFeedbackRNorm(v->decayNorm);
    }
}

void McxOutputAndFx::setChorusMacro(int macroId0to7) noexcept
{
    using Profile = abd::dsp::RolandGsMc303FxProfile;
    chorusMacro_ = std::clamp(macroId0to7, 0, Profile::kNumChorusVariants - 1);
    const auto* v = Profile::findChorus(chorusMacro_);
    if (!v || !fx_) return;

    if (v->engine == Profile::ChorusEngineKind::StereoChorus)
    {
        fx_->chorus.setSpeedNorm(v->rateNorm);
        fx_->chorus.setWidthLNorm(v->depthNorm);
        fx_->chorus.setWidthRNorm(v->depthNorm);
    }
    else if (v->engine == Profile::ChorusEngineKind::Flanger)
    {
        fx_->flanger.setRateNorm(v->rateNorm);
        fx_->flanger.setDepthLNorm(v->depthNorm);
        fx_->flanger.setDepthRNorm(v->depthNorm);
        fx_->flanger.setBaseDelayLNorm(v->baseDelayNorm);
        fx_->flanger.setBaseDelayRNorm(v->baseDelayNorm);
        fx_->flanger.setFeedbackNorm(v->feedbackNorm);
    }
    else
    {
        fx_->delay.setMode(abd::dsp::DspStereoDelay::kStereo);
        fx_->delay.setTimeNorm(v->baseDelayNorm);
        fx_->delay.setFeedbackLNorm(v->feedbackNorm);
        fx_->delay.setFeedbackRNorm(v->feedbackNorm);
    }
}

void McxOutputAndFx::setReverbTimeNorm(float norm) noexcept
{
    using Profile = abd::dsp::RolandGsMc303FxProfile;
    if (!fx_) return;
    const float n = std::clamp(norm, 0.0f, 1.0f);
    const auto* v = Profile::findReverb(reverbMacro_);
    if (!v || v->engine == Profile::ReverbEngineKind::ZitaReverb)
        fx_->reverb.setDecayNorm(n);
    else
        fx_->delay.setTimeNorm(n);
}

void McxOutputAndFx::setChorusRateNorm(float norm) noexcept
{
    using Profile = abd::dsp::RolandGsMc303FxProfile;
    if (!fx_) return;
    const float n = std::clamp(norm, 0.0f, 1.0f);
    const auto* v = Profile::findChorus(chorusMacro_);
    if (!v || v->engine == Profile::ChorusEngineKind::StereoChorus)
        fx_->chorus.setSpeedNorm(n);
    else if (v->engine == Profile::ChorusEngineKind::Flanger)
        fx_->flanger.setRateNorm(n);
    else
        fx_->delay.setTimeNorm(std::clamp(n * 0.35f, 0.02f, 0.35f));
}

void McxOutputAndFx::setDelayTempoSyncBpm(float bpm) noexcept
{
    if (!fx_) return;
    const float safeBpm = std::clamp(bpm, 30.0f, 300.0f);
    const float ms = std::clamp(45000.0f / safeBpm, 20.0f, 513.0f);
    const float norm = std::clamp((ms - 20.0f) / 493.0f, 0.05f, 1.0f);
    fx_->delay.setTimeNorm(norm);
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
                                  const float* choSendL,
                                  const float* choSendR,
                                  const float* revSendL,
                                  const float* revSendR,
                                  int numSamples,
                                  float masterGain) noexcept
{
    using Profile = abd::dsp::RolandGsMc303FxProfile;
    const int n = std::clamp(numSamples, 0, kMaxChunk);
    if (n <= 0 || !fx_)
        return;

    const auto* choVar = Profile::findChorus(chorusMacro_);
    const auto* revVar = Profile::findReverb(reverbMacro_);

    if (choVar && choVar->engine == Profile::ChorusEngineKind::Flanger)
        fx_->flanger.process(choSendL, choSendR, fx_->wetChoL.data(), fx_->wetChoR.data(), n);
    else if (choVar && choVar->engine == Profile::ChorusEngineKind::ShortDelay)
        fx_->delay.process(choSendL, choSendR, fx_->wetChoL.data(), fx_->wetChoR.data(), n);
    else
        fx_->chorus.process(choSendL, choSendR, fx_->wetChoL.data(), fx_->wetChoR.data(), n);

    const bool revIsDelay = (revVar && revVar->engine != Profile::ReverbEngineKind::ZitaReverb);
    if (revIsDelay)
    {
        fx_->delay.process(revSendL, revSendR, fx_->wetRevL.data(), fx_->wetRevR.data(), n);
        fx_->wetDelL.fill(0.0f);
        fx_->wetDelR.fill(0.0f);
    }
    else
    {
        fx_->delay.process(choSendL, choSendR, fx_->wetDelL.data(), fx_->wetDelR.data(), n);
        fx_->reverb.process(revSendL, revSendR, fx_->wetRevL.data(), fx_->wetRevR.data(), n);
    }

    for (int i = 0; i < n; ++i)
    {
        float l = (dryL[i] + fx_->wetChoL[i] * chorusMix_ + fx_->wetDelL[i] * delayMix_ + fx_->wetRevL[i] * reverbMix_) * masterGain;
        float r = (dryR[i] + fx_->wetChoR[i] * chorusMix_ + fx_->wetDelR[i] * delayMix_ + fx_->wetRevR[i] * reverbMix_) * masterGain;

        l = std::tanh(l * 0.92f);
        r = std::tanh(r * 0.92f);

        if (character_ == McxOutputCharacter::Sampler12Bit)
        {
            if ((holdCounter_++ & 1) == 0)
            {
                holdL_ = quantizeSample(l, character_);
                holdR_ = quantizeSample(r, character_);
            }
            l = holdL_;
            r = holdR_;
        }
        else if (character_ == McxOutputCharacter::Rompler16Bit)
        {
            l = quantizeSample(l, character_);
            r = quantizeSample(r, character_);
        }

        dryL[i] = l;
        dryR[i] = r;
    }
}

} // namespace abdmcx
