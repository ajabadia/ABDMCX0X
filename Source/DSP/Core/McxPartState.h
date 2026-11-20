#pragma once

#include "McxTypes.h"
#include "SynthCore/GrooveArpeggiator.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <string_view>

namespace abdmcx
{

/**
 * @brief Per-part Groovebox workstation track state (mixer strip, MIDI/hardware
 * routing, modulation offsets, arpeggiator, and facade views into Rompler state).
 */
struct McxPartState
{
    explicit McxPartState(abd::rompler::StructuredRomplerEngine& rompler) noexcept
        : rompler_(&rompler)
    {
    }

    McxPartState(const McxPartState&) = delete;
    McxPartState& operator=(const McxPartState&) = delete;
    McxPartState(McxPartState&&) = delete;
    McxPartState& operator=(McxPartState&&) = delete;

    [[nodiscard]] abd::rompler::StructuredRomplerEngine& romplerEngine() noexcept { return *rompler_; }
    [[nodiscard]] const abd::rompler::StructuredRomplerEngine& romplerEngine() const noexcept { return *rompler_; }

    bool enabled { true };
    bool isDrumKit { false };
    McxPartKind kind { McxPartKind::Chromatic };
    std::uint8_t midiChannel { 1 };
    std::uint8_t keyLow { 0 };
    std::uint8_t keyHigh { 127 };
    bool mute { false };
    bool solo { false };
    bool followGlobalTranspose { true };
    McxPartRouteMode routeMode { McxPartRouteMode::Internal };
    std::uint8_t midiPortIndex { 0 };    // 0 = DAW/Host Out, 1..31 = Real OS MIDI Output
    std::int16_t midiInPortIndex { 0 };  // 0 = DAW/Host In, 1..31 = Real OS MIDI Input, -1 = Sequencer/Focused only
    char midiOutDeviceName[64] {};
    char midiInDeviceName[64] {};
    char customPresetName[48] {};

    void setMidiOutDeviceName(std::string_view name) noexcept
    {
        std::memset(midiOutDeviceName, 0, sizeof(midiOutDeviceName));
        const std::size_t n = std::min(name.size(), sizeof(midiOutDeviceName) - 1);
        if (n > 0) std::memcpy(midiOutDeviceName, name.data(), n);
    }

    void setMidiInDeviceName(std::string_view name) noexcept
    {
        std::memset(midiInDeviceName, 0, sizeof(midiInDeviceName));
        const std::size_t n = std::min(name.size(), sizeof(midiInDeviceName) - 1);
        if (n > 0) std::memcpy(midiInDeviceName, name.data(), n);
    }

    // Mixing Console Strip State (engine-agnostic)
    float level { 0.85f };
    float pan { 0.0f };
    float reverbSend { 0.25f }; // Send A
    float chorusSend { 0.10f }; // Send B
    float delaySend { 0.0f };   // Send C
    float auxSend { 0.0f };     // Send D
    bool reverbSendPre { false };
    bool chorusSendPre { false };
    bool delaySendPre { false };
    bool auxSendPre { false };
    int insertSlot { -1 }; // -1 = Bypass / None, 0..7 = Rack Slot 1..8

    bool eqEnabled { false };
    float eqLowFreqHz { 100.0f };
    float eqLowGainDb { 0.0f };
    float eqMidFreqHz { 1000.0f };
    float eqMidGainDb { 0.0f };
    float eqMidQ { 1.0f };
    float eqHighFreqHz { 8000.0f };
    float eqHighGainDb { 0.0f };
    bool driveEnabled { false };
    std::uint8_t driveType { 0 };
    float driveAmount { 0.0f };

    float pitchBendSemitones { 0.0f };
    McxTrackSemanticOffsets semanticOffsets {};
    std::array<std::int8_t, 128> latchedNoteMap {};
    abd::synth::GrooveArpeggiator arp {};

private:
    abd::rompler::StructuredRomplerEngine* rompler_;

public:
    // Direct reference views into the part's StructuredRomplerEngine patch & drum kit
    McxStructureMode& structureMode { rompler_->patch().structureMode };
    McxFilterModel& filterModel { rompler_->patch().filterModel };
    McxDrumMapMode& drumMapMode { rompler_->drumKit().drumMapMode };
    bool& filter2Enabled { rompler_->patch().filter2.enabled };
    McxFilterModel& filter2Model { rompler_->patch().filter2.model };
    std::uint8_t& filter2Mode { rompler_->patch().filter2.mode };
    float& filter2CutoffHz { rompler_->patch().filter2.cutoffHz };
    float& filter2Resonance { rompler_->patch().filter2.resonance };
    float& vectorX { rompler_->patch().vectorX };
    float& vectorY { rompler_->patch().vectorY };


    std::uint8_t& lfo1Shape { rompler_->patch().lfo1.shape };
    bool& lfo1Sync { rompler_->patch().lfo1.sync };
    std::uint8_t& lfo1Trigger { rompler_->patch().lfo1.trigger };
    float& lfo1Rate { rompler_->patch().lfo1.rate };
    float& lfo1DelayMs { rompler_->patch().lfo1.delayMs };
    float& lfo1Depth { rompler_->patch().lfo1.depth };
    std::uint8_t& lfo1Target { rompler_->patch().lfo1.target };

    std::uint8_t& lfo2Shape { rompler_->patch().lfo2.shape };
    bool& lfo2Sync { rompler_->patch().lfo2.sync };
    std::uint8_t& lfo2Trigger { rompler_->patch().lfo2.trigger };
    float& lfo2Rate { rompler_->patch().lfo2.rate };
    float& lfo2DelayMs { rompler_->patch().lfo2.delayMs };
    float& lfo2Depth { rompler_->patch().lfo2.depth };
    std::uint8_t& lfo2Target { rompler_->patch().lfo2.target };

    std::array<McxPartialConfig, 4>& partials { rompler_->patch().partials };
    std::array<McxDrumSlotConfig, 128>& drumSlots { rompler_->drumKit().slots };
    McxDrumNoteRemapper& drumRemapper { rompler_->drumKit().remapper };
};

} // namespace abdmcx
