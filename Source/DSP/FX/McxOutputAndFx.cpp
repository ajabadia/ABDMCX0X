#include "McxOutputAndFx.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

void McxOutputAndFx::prepare(double sampleRate) noexcept
{
    sampleRate_ = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    chorus_.prepare(sampleRate_);
    chorus_.setSpeedNorm(0.28f);
    chorus_.setWidthLNorm(0.45f);
    chorus_.setWidthRNorm(0.45f);

    delay_.prepare(sampleRate_);
    delay_.setMode(abd::dsp::DspStereoDelay::kPingPong);
    delay_.setTimeNorm(0.45f);
    delay_.setFeedbackLNorm(0.32f);
    delay_.setFeedbackRNorm(0.32f);

    reverb_.prepare(sampleRate_);
    reverb_.setSizeNorm(0.55f);
    reverb_.setDecayNorm(0.50f);
    reverb_.setDampingNorm(0.45f);
    reverb_.setMixNorm(1.0f);

    reset();
}

void McxOutputAndFx::reset() noexcept
{
    chorus_.reset();
    delay_.reset();
    reverb_.reset();
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

void McxOutputAndFx::setDelayTempoSyncBpm(float bpm) noexcept
{
    const float safeBpm = std::clamp(bpm, 30.0f, 300.0f);
    // Sync dotted-8th ~ 45000 / bpm ms mapped roughly onto DspStereoDelay normalized curve
    const float ms = std::clamp(45000.0f / safeBpm, 20.0f, 513.0f);
    const float norm = std::clamp((ms - 20.0f) / 493.0f, 0.05f, 1.0f);
    delay_.setTimeNorm(norm);
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
    const int n = std::clamp(numSamples, 0, kMaxChunk);
    if (n <= 0)
        return;

    chorus_.process(choSendL, choSendR, wetChoL_.data(), wetChoR_.data(), n);
    delay_.process(choSendL, choSendR, wetDelL_.data(), wetDelR_.data(), n);
    reverb_.process(revSendL, revSendR, wetRevL_.data(), wetRevR_.data(), n);

    for (int i = 0; i < n; ++i)
    {
        float l = (dryL[i] + wetChoL_[i] * chorusMix_ + wetDelL_[i] * delayMix_ + wetRevL_[i] * reverbMix_) * masterGain;
        float r = (dryR[i] + wetChoR_[i] * chorusMix_ + wetDelR_[i] * delayMix_ + wetRevR_[i] * reverbMix_) * masterGain;

        if (character_ == McxOutputCharacter::Sampler12Bit)
        {
            // Subtle 2-sample hold (vintage Akai/E-mu style 22-24 kHz DAC flavor)
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
            l = quantizeSample(std::tanh(l * 1.04f) * 0.96f, character_);
            r = quantizeSample(std::tanh(r * 1.04f) * 0.96f, character_);
        }

        dryL[i] = l;
        dryR[i] = r;
    }
}

} // namespace abdmcx
