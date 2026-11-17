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

enum class McxControlMethod : std::uint8_t
{
    None = 0,
    MidiCc,
    Nrpn7Bit,
    Nrpn14Bit
};

struct McxParamControlMap
{
    McxControlMethod method { McxControlMethod::None };
    std::uint8_t controlNumber { 0 }; // CC number or NRPN MSB
    std::uint8_t subNumber { 0 };     // NRPN LSB
    float minVal { 0.0f };
    float maxVal { 127.0f };
    float defaultVal { 64.0f };
};

/**
 * @brief Data-driven hardware profile parsed from contract JSON.
 * Avoids any hardcoded synth-specific branching in engine or bridge logic.
 */
struct McxHardwareDeviceProfile
{
    std::string profileId { "generic_midi" };
    std::string displayName { "Generic MIDI Device" };
    std::uint8_t sysexDeviceId { 0x10 };
    std::uint8_t sysexModelId { 0x42 };
    bool useRolandChecksum { true };

    // Standard Multitimbral Part Controls
    McxParamControlMap partVolume { McxControlMethod::MidiCc, 7, 0, 0.0f, 127.0f, 100.0f };
    McxParamControlMap partPan { McxControlMethod::MidiCc, 10, 0, 0.0f, 127.0f, 64.0f };
    McxParamControlMap partReverb { McxControlMethod::MidiCc, 91, 0, 0.0f, 127.0f, 0.0f };
    McxParamControlMap partChorus { McxControlMethod::MidiCc, 93, 0, 0.0f, 127.0f, 0.0f };

    // Tone Synth Controls
    McxParamControlMap filterCutoff { McxControlMethod::MidiCc, 74, 0, 0.0f, 127.0f, 64.0f };
    McxParamControlMap filterResonance { McxControlMethod::MidiCc, 71, 0, 0.0f, 127.0f, 64.0f };
    McxParamControlMap envAttack { McxControlMethod::MidiCc, 73, 0, 0.0f, 127.0f, 64.0f };
    McxParamControlMap envDecay { McxControlMethod::MidiCc, 75, 0, 0.0f, 127.0f, 64.0f };
    McxParamControlMap envRelease { McxControlMethod::MidiCc, 72, 0, 0.0f, 127.0f, 64.0f };

    // Per-Key Drum NRPNs (GS standard or contract-defined)
    std::uint8_t drumPitchNrpnMsb { 24 };
    std::uint8_t drumLevelNrpnMsb { 26 };
    std::uint8_t drumPanNrpnMsb { 28 };
    std::uint8_t drumReverbNrpnMsb { 29 };
    std::uint8_t drumChorusNrpnMsb { 30 };

    static McxHardwareDeviceProfile makeGeneric() noexcept;
    static McxHardwareDeviceProfile makeRolandGs() noexcept;
    static McxHardwareDeviceProfile makeRolandMc() noexcept;
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
 * @brief Aseptic Live Hardware A/B Bridge and MIDI controller router.
 * Operates purely on McxHardwareDeviceProfile contracts without hardcoded synth models.
 */
class McxHardwareBridge
{
public:
    using MidiByteSink = std::function<void(const std::uint8_t* bytes, std::size_t count)>;

    explicit McxHardwareBridge(McxEngine& engine) noexcept;
    ~McxHardwareBridge() = default;

    // --- Contract & Profile ---
    void setProfile(const McxHardwareDeviceProfile& profile) noexcept;
    [[nodiscard]] const McxHardwareDeviceProfile& getProfile() const noexcept { return profile_; }
    void setProfileById(const std::string& profileId) noexcept;

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
    void dispatchMappedControl(std::uint8_t ch, const McxParamControlMap& map, float normalizedVal) noexcept;
    void handleCompleteInboundNrpn(int channel, int msb, int lsb, int dataVal) noexcept;

    McxEngine& engine_;
    McxHardwareDeviceProfile profile_;
    McxMidiOutQueue<1024> outQueue_;
    McxLatencyCompensator latencyComp_;
    McxInboundNrpnState nrpnState_;

    std::uint8_t runningStatus_ { 0 };
    std::uint8_t msgPending_[3] {};
    std::size_t msgPendingLen_ { 0 };
};

} // namespace abdmcx
