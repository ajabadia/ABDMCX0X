#pragma once

#include "../Core/McxTypes.h"
#include "McxRackChassis.h"
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

    void setSendBusMute(int busIdx, bool muted) noexcept
    {
        if (busIdx >= 0 && busIdx < 4) sendBusMutes_[static_cast<std::size_t>(busIdx)] = muted;
        rack_.setSendBusMute(busIdx, muted);
    }
    [[nodiscard]] bool isSendBusMuted(int busIdx) const noexcept
    {
        return (busIdx >= 0 && busIdx < 4) ? sendBusMutes_[static_cast<std::size_t>(busIdx)] : rack_.isSendBusMuted(busIdx);
    }
    [[nodiscard]] bool isSendBusMute(int busIdx) const noexcept { return isSendBusMuted(busIdx); }

    void setSendSlotTarget(int busIdx, int slotIdx) noexcept;
    [[nodiscard]] int getSendSlotTarget(int busIdx) const noexcept;
    void setSendReturnGain(int busIdx, float gain) noexcept;
    [[nodiscard]] float getSendReturnGain(int busIdx) const noexcept;

    [[nodiscard]] abd::dsp::DspMultiBusFxRack::Telemetry getTelemetry() const noexcept
    {
        auto t = rack_.getTelemetry();
        t.peakSendA = sendPeaks_[0];
        t.peakSendB = sendPeaks_[1];
        t.peakSendC = sendPeaks_[2];
        t.peakSendD = sendPeaks_[3];
        return t;
    }
    [[nodiscard]] ActiveSendLabels getActiveSendLabels() const noexcept;

    [[nodiscard]] abd::dsp::DspMultiBusFxRack& getRack() noexcept { return rack_; }
    [[nodiscard]] const abd::dsp::DspMultiBusFxRack& getRack() const noexcept { return rack_; }

    [[nodiscard]] McxRackChassis& getChassis() noexcept { return chassis_; }
    [[nodiscard]] const McxRackChassis& getChassis() const noexcept { return chassis_; }

    void moveRackSlot(int fromIdx, int toIdx) noexcept;
    void removeRackSlot(int slotIdx) noexcept;

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
                      const ControlFrame& ctrl = {},
                      std::uint8_t excludedSlotMask = 0) noexcept;

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
    McxRackChassis chassis_ {};

    std::array<int, 4> sendSlotTargets_ { 0, 1, -1, -1 };
    std::array<float, 4> sendReturns_ { 1.0f, 1.0f, 1.0f, 1.0f };
    std::array<float, 4> sendPeaks_ {};
    std::array<bool, 4> sendBusMutes_ { false, false, false, false };
    std::array<float, kMaxChunk> slotInL_ {}, slotInR_ {};
    std::array<float, kMaxChunk> slotOutL_ {}, slotOutR_ {};
    std::array<float, kMaxChunk> chainOutL_ {}, chainOutR_ {};
};

} // namespace abdmcx
