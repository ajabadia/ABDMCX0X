#pragma once

#include "../Core/McxTypes.h"
#include "DspEffects/DspFlanger.h"
#include "DspEffects/DspStereoChorus.h"
#include "DspEffects/DspStereoDelay.h"
#include "DspEffects/DspZitaReverb.h"
#include "DspEffects/MasterSafetyLimiter.h"
#include "DspEffects/profiles/RolandGsMc303FxProfile.h"

#include <array>
#include <memory>

namespace abdmcx
{

/**
 * @brief Master Send FX chain reusing ABDShared::DspEffects (DspStereoChorus, DspFlanger,
 * DspStereoDelay, DspZitaReverb) driven by RolandGsMc303FxProfile macros, plus swappable
 * DAC output quantization/flavor (HD Studio, 90s 16-bit, Vintage 12-bit).
 * FX delay buffers are heap-owned via unique_ptr (allocated once at construction, keeping
 * stack footprint tiny for DAWs & WASM). Strictly zero heap allocations on process().
 */
class McxOutputAndFx
{
public:
    static constexpr int kMaxChunk = 256;

    McxOutputAndFx();
    ~McxOutputAndFx() = default;
    McxOutputAndFx(const McxOutputAndFx&) = delete;
    McxOutputAndFx& operator=(const McxOutputAndFx&) = delete;

    void prepare(double sampleRate) noexcept;
    void reset() noexcept;

    void setSendReturns(float chorusMix, float delayMix, float reverbMix) noexcept;
    void setReverbMacro(int macroId0to7) noexcept;
    void setChorusMacro(int macroId0to7) noexcept;
    void setReverbTimeNorm(float norm) noexcept;
    void setChorusRateNorm(float norm) noexcept;
    void setDelayTempoSyncBpm(float bpm) noexcept;

    [[nodiscard]] int getReverbMacro() const noexcept { return reverbMacro_; }
    [[nodiscard]] int getChorusMacro() const noexcept { return chorusMacro_; }

    void setOutputCharacter(McxOutputCharacter character) noexcept { character_ = character; }
    [[nodiscard]] McxOutputCharacter getOutputCharacter() const noexcept { return character_; }

    void setLimiterEnabled(bool enabled) noexcept { limiter_.setEnabled(enabled); }
    void setLimiterCeilingDb(float db) noexcept { limiter_.setCeilingDb(db); }
    [[nodiscard]] const abd::dsp::MasterSafetyLimiter& getLimiter() const noexcept { return limiter_; }
    [[nodiscard]] abd::dsp::MasterSafetyLimiter& getLimiter() noexcept { return limiter_; }

    void processChunk(float* dryL,
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
                      float masterGain) noexcept;

    void processChunk(float* dryL,
                      float* dryR,
                      const float* choSendL,
                      const float* choSendR,
                      const float* revSendL,
                      const float* revSendR,
                      int numSamples,
                      float masterGain) noexcept
    {
        processChunk(dryL, dryR, revSendL, revSendR, choSendL, choSendR, nullptr, nullptr, nullptr, nullptr, numSamples, masterGain);
    }

    [[nodiscard]] static float quantizeSample(float x, McxOutputCharacter character) noexcept;

private:
    struct FxBuffers
    {
        abd::dsp::DspStereoChorus chorus {};
        abd::dsp::DspFlanger flanger {};
        abd::dsp::DspStereoDelay delay {};
        abd::dsp::DspZitaReverb reverb {};
        std::array<float, kMaxChunk> wetChoL {};
        std::array<float, kMaxChunk> wetChoR {};
        std::array<float, kMaxChunk> wetDelL {};
        std::array<float, kMaxChunk> wetDelR {};
        std::array<float, kMaxChunk> wetRevL {};
        std::array<float, kMaxChunk> wetRevR {};
    };

    double sampleRate_ { 44100.0 };
    McxOutputCharacter character_ { McxOutputCharacter::HdStudio };

    int reverbMacro_ { 3 }; // Default: Hall 1
    int chorusMacro_ { 1 }; // Default: Chorus 2
    float chorusMix_ { 0.35f };
    float delayMix_ { 0.25f };
    float reverbMix_ { 0.35f };
    float holdL_ { 0.0f };
    float holdR_ { 0.0f };
    int holdCounter_ { 0 };

    abd::dsp::MasterSafetyLimiter limiter_ {};
    std::unique_ptr<FxBuffers> fx_;
};

} // namespace abdmcx
