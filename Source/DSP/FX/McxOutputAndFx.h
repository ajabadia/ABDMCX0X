#pragma once

#include "../Core/McxTypes.h"
#include "DspEffects/DspMultiBusFxRack.h"
#include "DspEffects/profiles/RolandGsMc303FxProfile.h"

namespace abdmcx
{

/**
 * @brief Master Send & Master Insert FX chain for ABDMCX0X.
 * Wraps abd::dsp::DspMultiBusFxRack (4 send buses + dry, 4 topologies)
 * and exposes Roland GS MC-303 macro configurations plus vintage DAC quantization.
 */
class McxOutputAndFx
{
public:
    static constexpr int kMaxChunk = abd::dsp::DspMultiBusFxRack::kMaxChunk;
    using Topology = abd::dsp::DspMultiBusFxRack::Topology;

    McxOutputAndFx() = default;
    ~McxOutputAndFx() = default;
    McxOutputAndFx(const McxOutputAndFx&) = delete;
    McxOutputAndFx& operator=(const McxOutputAndFx&) = delete;

    void prepare(double sampleRate) noexcept;
    void reset() noexcept;

    void setTopology(Topology topo) noexcept { rack_.setTopology(topo); }
    [[nodiscard]] Topology getTopology() const noexcept { return rack_.getTopology(); }

    void setSendReturns(float chorusMix, float delayMix, float reverbMix, float auxMix = 1.0f) noexcept;
    void setCascadeInjections(float chorusToReverb, float delayToReverb) noexcept
    {
        rack_.setCascadeInjections(chorusToReverb, delayToReverb);
    }

    void setReverbMacro(int macroId0to7) noexcept;
    void setChorusMacro(int macroId0to7) noexcept;
    void setReverbTimeNorm(float norm) noexcept;
    void setChorusRateNorm(float norm) noexcept;
    void setDelayTempoSyncBpm(float bpm) noexcept;

    [[nodiscard]] int getReverbMacro() const noexcept { return reverbMacro_; }
    [[nodiscard]] int getChorusMacro() const noexcept { return chorusMacro_; }

    void setOutputCharacter(McxOutputCharacter character) noexcept { character_ = character; }
    [[nodiscard]] McxOutputCharacter getOutputCharacter() const noexcept { return character_; }

    void setLimiterEnabled(bool enabled) noexcept { rack_.getLimiter().setEnabled(enabled); }
    void setLimiterCeilingDb(float db) noexcept { rack_.getLimiter().setCeilingDb(db); }
    [[nodiscard]] const abd::dsp::MasterSafetyLimiter& getLimiter() const noexcept { return rack_.getLimiter(); }
    [[nodiscard]] abd::dsp::MasterSafetyLimiter& getLimiter() noexcept { return rack_.getLimiter(); }

    struct ActiveSendLabels
    {
        const char* sendA { "Reverb" };
        const char* sendB { "Chorus" };
        const char* sendC { "Stereo Delay" };
        const char* sendD { "Saturation" };
    };

    void setSendBusMute(int busIdx, bool muted) noexcept { rack_.setSendBusMute(busIdx, muted); }
    [[nodiscard]] bool isSendBusMuted(int busIdx) const noexcept { return rack_.isSendBusMuted(busIdx); }
    [[nodiscard]] bool isSendBusMute(int busIdx) const noexcept { return rack_.isSendBusMuted(busIdx); }
    [[nodiscard]] abd::dsp::DspMultiBusFxRack::Telemetry getTelemetry() const noexcept { return rack_.getTelemetry(); }
    [[nodiscard]] ActiveSendLabels getActiveSendLabels() const noexcept;

    [[nodiscard]] abd::dsp::DspMultiBusFxRack& getRack() noexcept { return rack_; }
    [[nodiscard]] const abd::dsp::DspMultiBusFxRack& getRack() const noexcept { return rack_; }

    using ControlFrame = abd::dsp::DspMultiBusFxRack::ControlFrame;

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
                      float masterGain,
                      const ControlFrame& ctrl = {}) noexcept;

    void processChunk(float* dryL,
                      float* dryR,
                      const float* choSendL,
                      const float* choSendR,
                      const float* revSendL,
                      const float* revSendR,
                      int numSamples,
                      float masterGain,
                      const ControlFrame& ctrl = {}) noexcept
    {
        processChunk(dryL, dryR, revSendL, revSendR, choSendL, choSendR, nullptr, nullptr, nullptr, nullptr, numSamples, masterGain, ctrl);
    }

    [[nodiscard]] static float quantizeSample(float x, McxOutputCharacter character) noexcept;

private:
    double sampleRate_ { 44100.0 };
    McxOutputCharacter character_ { McxOutputCharacter::HdStudio };

    int reverbMacro_ { 3 }; // Default: Hall 1
    int chorusMacro_ { 1 }; // Default: Chorus 2
    float chorusMix_ { 0.35f };
    float delayMix_ { 0.25f };
    float reverbMix_ { 0.35f };
    float auxMix_ { 1.0f };

    abd::dsp::DspMultiBusFxRack rack_ {};
};

} // namespace abdmcx
