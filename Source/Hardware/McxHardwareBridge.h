#pragma once

#include "../DSP/Core/McxEngine.h"
#include "../DSP/Core/McxTypes.h"
#include "../MIDI/HardwareMirrorRouter.h"
#include "../MIDI/McxMidiOutQueue.h"
#include "McxLatencyCompensator.h"
#include "SynthCore/HardwareProfileHydrator.h"

#include <array>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <string_view>
#include <vector>

namespace abdmcx
{

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
 * @brief 100% Aseptic Bidirectional Hardware A/B Bridge & MIDI Controller Router.
 * Operates exclusively on dynamically hydrated abd::synth::UniversalHardwareProfile JSON contracts
 * via CDD v2.0 Semantic Role hashes — zero hardcoded vendor models, CCs, or NRPNs in C++.
 */
class McxHardwareBridge
{
public:
    using MidiByteSink = std::function<void(const std::uint8_t* bytes, std::size_t count)>;
    using InboundSemanticCallback =
        std::function<void(std::uint8_t partIdx, std::uint64_t roleHash, float normalizedValue)>;

    explicit McxHardwareBridge(McxEngine& engine);
    ~McxHardwareBridge() = default;

    // --- Dynamic JSON Contract Registry & Auto-Detection (Non-RT) ---
    std::size_t loadContractsDirectory(const std::string& contractsDir);
    void registerProfile(abd::synth::UniversalHardwareProfile profile);
    bool loadProfileFromJsonString(std::string_view jsonText, std::string* outError = nullptr);
    bool loadProfileFromJsonFile(const std::string& filePath, std::string* outError = nullptr);

    void setProfile(const abd::synth::UniversalHardwareProfile& profile);
    void setProfileById(const std::string& profileId);
    bool autoDetectFromIdentityReply(const std::uint8_t* sysex, std::size_t length);
    bool autoDetectFromPortName(std::string_view portName);

    [[nodiscard]] const abd::synth::UniversalHardwareProfile& getProfile() const noexcept { return profile_; }
    [[nodiscard]] const std::vector<abd::synth::UniversalHardwareProfile>& getRegistry() const noexcept { return registry_; }

    void setInboundSemanticCallback(InboundSemanticCallback cb) { inboundSemanticCb_ = std::move(cb); }

    // --- Outbound Queue & Latency Compensation ---
    [[nodiscard]] McxMidiOutQueue<1024>& getOutboundQueue() noexcept { return outQueue_; }
    [[nodiscard]] const McxMidiOutQueue<1024>& getOutboundQueue() const noexcept { return outQueue_; }

    [[nodiscard]] McxLatencyCompensator& getLatencyCompensator() noexcept { return latencyComp_; }
    [[nodiscard]] const McxLatencyCompensator& getLatencyCompensator() const noexcept { return latencyComp_; }

    // --- Universal Semantic Outbound Routing (Audio / RT Thread Safe) ---
    void routeNoteOn(std::uint8_t partIdx, std::uint8_t note, float velocity, std::int32_t sampleOffset = 0) noexcept;
    void routeNoteOff(std::uint8_t partIdx, std::uint8_t note, std::int32_t sampleOffset = 0) noexcept;

    void routeSemanticParam(std::uint8_t partIdx, std::uint64_t roleHash, float normalizedValue) noexcept;
    void routeDrumSemanticParam(std::uint8_t partIdx,
                                std::uint8_t slotIdx,
                                std::uint64_t drumRoleHash,
                                float normalizedValue) noexcept;

    // --- Ergonomic Convenience Wrappers (delegate to routeSemanticParam) ---
    void routePartVolume(std::uint8_t partIdx, float normalizedLevel) noexcept;
    void routePartPan(std::uint8_t partIdx, float normalizedPan) noexcept;
    void routePartReverb(std::uint8_t partIdx, float normalizedReverb) noexcept;
    void routePartChorus(std::uint8_t partIdx, float normalizedChorus) noexcept;

    void routeDrumSlotParam(std::uint8_t partIdx,
                            std::uint8_t slotIdx,
                            std::uint8_t paramKind, // 0=Pitch, 1=Level, 2=Pan, 3=Reverb, 4=Chorus
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
    void dispatchBinding(std::uint8_t ch, const abd::synth::SemanticControlBinding& binding, float normalizedVal) noexcept;
    void applyInternalSemanticParam(std::uint8_t partIdx, std::uint64_t roleHash, float normalizedVal) noexcept;
    void applyInternalDrumParam(std::uint8_t partIdx,
                                std::uint8_t slotIdx,
                                std::uint64_t roleHash,
                                float normalizedVal,
                                int rawMidiByte) noexcept;
    void handleCompleteInboundNrpn(int channel, int msb, int lsb, int dataVal) noexcept;

    McxEngine& engine_;
    abd::synth::UniversalHardwareProfile profile_;
    std::vector<abd::synth::UniversalHardwareProfile> registry_;
    InboundSemanticCallback inboundSemanticCb_;

    McxMidiOutQueue<1024> outQueue_;
    McxLatencyCompensator latencyComp_;
    McxInboundNrpnState nrpnState_;

    std::uint8_t runningStatus_ { 0 };
    std::uint8_t msgPending_[3] {};
    std::size_t msgPendingLen_ { 0 };

    bool inSysEx_ { false };
    std::array<std::uint8_t, 64> sysexBuf_ {};
    std::size_t sysexLen_ { 0 };
};

} // namespace abdmcx
