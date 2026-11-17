#pragma once

#include "../DSP/Core/McxEngine.h"
#include "../DSP/Core/McxTypes.h"
#include "../MIDI/HardwareMirrorRouter.h"
#include "../MIDI/McxMidiOutQueue.h"
#include "McxLatencyCompensator.h"

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

namespace abdmcx
{

enum class McxHardwareTarget : std::uint8_t
{
    GenericMidi = 0,
    BossDr5,
    RolandMc303,
    RolandD2,
    RolandSc55,
    AbdMcx0x
};

struct McxInboundNrpnState
{
    int currentChannel { 1 };
    int nrpnMsb { -1 };
    int nrpnLsb { -1 };

    void reset() noexcept
    {
        nrpnMsb = -1;
        nrpnLsb = -1;
    }
};

/**
 * @brief Live Hardware A/B Bridge and MIDI controller router.
 * Connects McxEngine to external hardware (Boss DR-5, Roland MC-303, etc.)
 * with sample-accurate latency compensation, strict Roland NRPN order, and bidirectional sync.
 */
class McxHardwareBridge
{
public:
    using MidiByteSink = std::function<void(const std::uint8_t* bytes, std::size_t count)>;

    explicit McxHardwareBridge(McxEngine& engine) noexcept;
    ~McxHardwareBridge() = default;

    // --- Target Profile Selection ---
    void setHardwareTarget(McxHardwareTarget target) noexcept;
    [[nodiscard]] McxHardwareTarget getHardwareTarget() const noexcept { return target_; }
    void setHardwareTargetById(const std::string& profileId) noexcept;

    // --- Outbound Queue & Latency Compensation ---
    [[nodiscard]] McxMidiOutQueue<1024>& getOutboundQueue() noexcept { return outQueue_; }
    [[nodiscard]] const McxMidiOutQueue<1024>& getOutboundQueue() const noexcept { return outQueue_; }

    [[nodiscard]] McxLatencyCompensator& getLatencyCompensator() noexcept { return latencyComp_; }
    [[nodiscard]] const McxLatencyCompensator& getLatencyCompensator() const noexcept { return latencyComp_; }

    // --- Outbound Routing (Audio thread or Engine calls) ---
    void routeNoteOn(std::uint8_t partIdx, std::uint8_t note, float velocity, std::int32_t sampleOffset = 0) noexcept;
    void routeNoteOff(std::uint8_t partIdx, std::uint8_t note, std::int32_t sampleOffset = 0) noexcept;

    void routePartVolume(std::uint8_t partIdx, float normalizedLevel) noexcept;
    void routePartPan(std::uint8_t partIdx, float normalizedPan) noexcept;
    void routePartReverb(std::uint8_t partIdx, float normalizedReverb) noexcept;

    void routeDrumSlotParam(std::uint8_t partIdx,
                            std::uint8_t slotIdx,
                            std::uint8_t paramKind, // 0=Pitch, 1=Level, 2=Pan, 3=Reverb
                            float normalizedValue) noexcept;

    void routeSynthFilter(std::uint8_t partIdx, float cutoffNormalized, float resonanceNormalized) noexcept;
    void routeSynthEnvelope(std::uint8_t partIdx, float attackNorm, float decayNorm, float releaseNorm) noexcept;

    // --- Inbound MIDI Parsing (Hardware / MIDI Thread) ---
    void processInboundMidiByte(std::uint8_t byte) noexcept;
    void processInboundMidiBuffer(const std::uint8_t* data, std::size_t length) noexcept;
    bool processInboundCc(std::uint8_t channel1to16, std::uint8_t cc, std::uint8_t value) noexcept;

    // --- Queue Drainage to Hardware Backend ---
    std::size_t drainOutboundQueue(const MidiByteSink& sink) noexcept;

private:
    void sendCc(std::uint8_t ch1to16, std::uint8_t cc, std::uint8_t val) noexcept;
    void sendNrpn(std::uint8_t ch1to16, std::uint8_t msb, std::uint8_t lsb, std::uint8_t val) noexcept;
    void handleCompleteInboundNrpn(int channel, int msb, int lsb, int dataVal) noexcept;

    McxEngine& engine_;
    McxHardwareTarget target_ { McxHardwareTarget::BossDr5 };
    McxMidiOutQueue<1024> outQueue_;
    McxLatencyCompensator latencyComp_;
    McxInboundNrpnState nrpnState_;

    // Inbound running status parsing state
    std::uint8_t runningStatus_ { 0 };
    std::uint8_t msgPending_[3] {};
    std::size_t msgPendingLen_ { 0 };
};

} // namespace abdmcx
