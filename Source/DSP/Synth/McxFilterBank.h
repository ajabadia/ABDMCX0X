#pragma once

#include "../Core/McxTypes.h"
#include "DspCore/DspFilterTpt.h"
#include "DspCore/DspJunoVCF.h"
#include "DspCore/DspKorgMS20.h"
#include "DspCore/DspMoogLadder.h"

namespace abdmcx
{

/**
 * @brief Hot-swappable per-partial multi-character filter bank reusing ABDShared::DspCore
 * plus a clean-room Roland TC6116AF 2-pole saturating Chamberlin SVF and E-mu style Z-Plane Morph.
 */
class McxFilterBank
{
public:
    void prepare(double sampleRate) noexcept;
    void reset() noexcept;

    void setParameters(McxFilterModel model,
                       std::uint8_t filterMode,
                       float cutoffHz,
                       float resonance01,
                       float zplaneMorph01,
                       float drive01) noexcept;

    float processSample(float input) noexcept;

    [[nodiscard]] McxFilterModel getModel() const noexcept { return model_; }
    [[nodiscard]] float getCutoffHz() const noexcept { return cutoffHz_; }

private:
    float processTc6116Tvf(float input) noexcept;
    float processZPlaneMorph(float input) noexcept;
    static float saturate20Bit(float x) noexcept;

    double sampleRate_ { 44100.0 };
    McxFilterModel model_ { McxFilterModel::RolandTc6116Tvf };
    std::uint8_t filterMode_ { 0 }; // 0=LPF, 1=HPF, 2=BPF, 3=Bypass

    float cutoffHz_ { 12000.0f };
    float resonance_ { 0.15f };
    float morph_ { 0.0f };
    float drive_ { 0.0f };

    // Shared ABDShared::DspCore filter engines
    abd::dsp::FilterTpt svfClean_ {};
    abd::dsp::JunoVCF_ZDF rolandZdf_ {};
    abd::dsp::KorgMS20VCF ms20Acid_ {};
    abd::dsp::MoogLadderVCF ladderDrive_ {};
    abd::dsp::FilterTpt zplaneStageA_ {};
    abd::dsp::FilterTpt zplaneStageB_ {};

    // Clean-room TC6116AF digital Chamberlin SVF state (unit-delay integrators)
    float tcLpState_ { 0.0f };
    float tcBpState_ { 0.0f };
    float tcF_ { 0.5f };
    float tcQInv_ { 1.414f };
};

} // namespace abdmcx
