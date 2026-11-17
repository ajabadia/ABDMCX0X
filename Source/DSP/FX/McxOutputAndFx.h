#pragma once

#include "../Core/McxTypes.h"
#include "DspEffects/DspStereoChorus.h"
#include "DspEffects/DspStereoDelay.h"
#include "DspEffects/DspZitaReverb.h"

#include <array>

namespace abdmcx
{

/**
 * @brief Master Send FX chain (Stereo Chorus, Stereo Delay, Zita Reverb via ABDShared::DspEffects)
 * plus swappable DAC output quantization/flavor (HD Studio, 90s 16-bit, Vintage 12-bit).
 * Strictly zero heap allocations on process().
 */
class McxOutputAndFx
{
public:
    static constexpr int kMaxChunk = 256;

    void prepare(double sampleRate) noexcept;
    void reset() noexcept;

    void setSendReturns(float chorusMix, float delayMix, float reverbMix) noexcept;
    void setDelayTempoSyncBpm(float bpm) noexcept;
    void setOutputCharacter(McxOutputCharacter character) noexcept { character_ = character; }
    [[nodiscard]] McxOutputCharacter getOutputCharacter() const noexcept { return character_; }

    void processChunk(float* dryL,
                      float* dryR,
                      const float* choSendL,
                      const float* choSendR,
                      const float* revSendL,
                      const float* revSendR,
                      int numSamples,
                      float masterGain) noexcept;

    [[nodiscard]] static float quantizeSample(float x, McxOutputCharacter character) noexcept;

private:
    double sampleRate_ { 44100.0 };
    McxOutputCharacter character_ { McxOutputCharacter::HdStudio };

    float chorusMix_ { 0.35f };
    float delayMix_ { 0.25f };
    float reverbMix_ { 0.35f };
    float holdL_ { 0.0f };
    float holdR_ { 0.0f };
    int holdCounter_ { 0 };

    abd::dsp::DspStereoChorus chorus_ {};
    abd::dsp::DspStereoDelay delay_ {};
    abd::dsp::DspZitaReverb reverb_ {};

    std::array<float, kMaxChunk> wetChoL_ {};
    std::array<float, kMaxChunk> wetChoR_ {};
    std::array<float, kMaxChunk> wetDelL_ {};
    std::array<float, kMaxChunk> wetDelR_ {};
    std::array<float, kMaxChunk> wetRevL_ {};
    std::array<float, kMaxChunk> wetRevR_ {};
};

} // namespace abdmcx
