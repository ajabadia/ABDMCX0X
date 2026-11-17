#pragma once

#include "../Core/McxTypes.h"
#include "SynthCore/OscPolyBlep.h"

#include <cstdint>

namespace abdmcx
{

/**
 * @brief Dual-architecture stereo Partial exciter:
 *   - VA PolyBLEP (Saw, Pulse/PWM, Triangle, Sine, SuperSaw, Crisp Noise) via ABDShared::SynthCore
 *   - Clean-room De-Baked Wavetable / PCM Zone / FM 2-Op cycle player with forward/ping-pong loop,
 *     one-shot cutoff, alt-start attack skip, and post-first-loop loopTune retuning.
 */
class McxPartialExciter
{
public:
    static constexpr int kCycleTableSize = 256;

    McxPartialExciter() noexcept = default;

    void prepare(double sampleRate) noexcept;
    void reset() noexcept;

    void noteOn(const McxPartialConfig& cfg, float baseMidiNote) noexcept;
    void setFrequency(double hz, float loopTuneCents = 0.0f) noexcept;

    /** Optionally binds an external PCM/de-baked cycle buffer (must outlive voice note). Zero allocation. */
    void setExternalTable(const float* samples, int length, int loopStart, int loopEnd) noexcept;

    void processStereo(const McxPartialConfig& cfg, float pitchModSemitones, float& outL, float& outR) noexcept;

    [[nodiscard]] bool hasFinishedOneShot() const noexcept { return oneShotDone_; }

private:
    float processVaSample(const McxPartialConfig& cfg, double hz) noexcept;
    float processCycleSample(const McxPartialConfig& cfg, double baseHz) noexcept;

    double sampleRate_ { 44100.0 };
    float baseMidiNote_ { 60.0f };
    double baseFrequencyHz_ { 261.625565 };
    std::uint32_t rngState_ { 0x13572468u };

    abd::synth::OscPolyBlep oscMain_ {};
    abd::synth::OscPolyBlep oscDetuneA_ {};
    abd::synth::OscPolyBlep oscDetuneB_ {};

    const float* externalSamples_ { nullptr };
    int externalLen_ { 0 };
    int loopStart_ { 0 };
    int loopEnd_ { 0 };

    double tablePos_ { 0.0 };
    bool reverseDir_ { false };
    bool loopedOnce_ { false };
    bool oneShotDone_ { false };
    double fmModPhase_ { 0.0 };
};

} // namespace abdmcx
