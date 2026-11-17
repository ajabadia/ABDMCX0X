// ============================================================================
// ABDMCX0X — ParameterRegistry.gen.h
// AUTOGENERADO POR Scripts/registry_generator.js — NO EDITAR MANUALMENTE
// ============================================================================

#pragma once

#include <cstdint>
#include <cstddef>
#include <string_view>
#include <array>

namespace abdmcx {

constexpr size_t kNumParameters = 26;

namespace ParamIdx {
    inline constexpr uint32_t MasterVolumeDb = 0;
    inline constexpr uint32_t OutputCharacter = 1;
    inline constexpr uint32_t FocusedPartIndex = 2;
    inline constexpr uint32_t PartRouteMode = 3;
    inline constexpr uint32_t PartLevel = 4;
    inline constexpr uint32_t PartPan = 5;
    inline constexpr uint32_t PartFilterModel = 6;
    inline constexpr uint32_t TvfCutoffOffset = 7;
    inline constexpr uint32_t TvfResonanceOffset = 8;
    inline constexpr uint32_t ZplaneMorph = 9;
    inline constexpr uint32_t EnvAttackOffset = 10;
    inline constexpr uint32_t EnvDecayOffset = 11;
    inline constexpr uint32_t EnvReleaseOffset = 12;
    inline constexpr uint32_t PartReverbSend = 13;
    inline constexpr uint32_t PartChorusSend = 14;
    inline constexpr uint32_t PartDrive = 15;
    inline constexpr uint32_t VectorX = 16;
    inline constexpr uint32_t VectorY = 17;
    inline constexpr uint32_t ArpEnabled = 18;
    inline constexpr uint32_t ArpMotif = 19;
    inline constexpr uint32_t ArpResolution = 20;
    inline constexpr uint32_t ArpSwing = 21;
    inline constexpr uint32_t MachinePersona = 22;
    inline constexpr uint32_t PolyphonyVoices = 23;
    inline constexpr uint32_t PartialBudgetMode = 24;
    inline constexpr uint32_t DrumMapMode = 25;
} // namespace ParamIdx

namespace ParamId {
    inline constexpr const char* MasterVolumeDb = "masterVolumeDb";
    inline constexpr const char* OutputCharacter = "outputCharacter";
    inline constexpr const char* FocusedPartIndex = "focusedPartIndex";
    inline constexpr const char* PartRouteMode = "partRouteMode";
    inline constexpr const char* PartLevel = "partLevel";
    inline constexpr const char* PartPan = "partPan";
    inline constexpr const char* PartFilterModel = "partFilterModel";
    inline constexpr const char* TvfCutoffOffset = "tvfCutoffOffset";
    inline constexpr const char* TvfResonanceOffset = "tvfResonanceOffset";
    inline constexpr const char* ZplaneMorph = "zplaneMorph";
    inline constexpr const char* EnvAttackOffset = "envAttackOffset";
    inline constexpr const char* EnvDecayOffset = "envDecayOffset";
    inline constexpr const char* EnvReleaseOffset = "envReleaseOffset";
    inline constexpr const char* PartReverbSend = "partReverbSend";
    inline constexpr const char* PartChorusSend = "partChorusSend";
    inline constexpr const char* PartDrive = "partDrive";
    inline constexpr const char* VectorX = "vectorX";
    inline constexpr const char* VectorY = "vectorY";
    inline constexpr const char* ArpEnabled = "arpEnabled";
    inline constexpr const char* ArpMotif = "arpMotif";
    inline constexpr const char* ArpResolution = "arpResolution";
    inline constexpr const char* ArpSwing = "arpSwing";
    inline constexpr const char* MachinePersona = "machinePersona";
    inline constexpr const char* PolyphonyVoices = "polyphonyVoices";
    inline constexpr const char* PartialBudgetMode = "partialBudgetMode";
    inline constexpr const char* DrumMapMode = "drumMapMode";
} // namespace ParamId

enum class WireType : uint8_t { None, CC, Nrpn, SysEx };

struct ParamDescriptor {
    uint32_t index;
    const char* id;
    const char* name;
    const char* group;
    const char* scope; // global or part
    const char* semanticRole;
    float minValue;
    float maxValue;
    float defaultValue;
    WireType wire;
    int16_t ccNumber;
    int16_t nrpnMsb;
    int16_t nrpnLsb;
};

inline constexpr std::array<ParamDescriptor, kNumParameters> kParameterDescriptors = {{
    { 0, "masterVolumeDb", "Master Volume", "Master", "global", "MasterVolume", 0.0f, 127.0f, 100.0f, WireType::CC, 7, -1, -1 },
    { 1, "outputCharacter", "Output DAC Character", "Master", "global", "OutputDacCharacter", 0.0f, 2.0f, 1.0f, WireType::None, -1, -1, -1 },
    { 2, "focusedPartIndex", "Focused Part Index", "PartMixer", "global", "FocusedPartIndex", 0.0f, 15.0f, 0.0f, WireType::None, -1, -1, -1 },
    { 3, "partRouteMode", "Part Audio/MIDI Route", "PartMixer", "part", "PartRouteMode", 0.0f, 2.0f, 0.0f, WireType::None, -1, -1, -1 },
    { 4, "partLevel", "Part Level", "PartMixer", "part", "PartLevel", 0.0f, 127.0f, 100.0f, WireType::CC, 7, -1, -1 },
    { 5, "partPan", "Part Pan", "PartMixer", "part", "MasterPan", 0.0f, 127.0f, 64.0f, WireType::CC, 10, -1, -1 },
    { 6, "partFilterModel", "Filter Model", "Filter", "part", "FilterModel", 0.0f, 5.0f, 5.0f, WireType::None, -1, -1, -1 },
    { 7, "tvfCutoffOffset", "Filter Cutoff", "Filter", "part", "FilterCutoff", 14.0f, 114.0f, 64.0f, WireType::Nrpn, -1, 1, 32 },
    { 8, "tvfResonanceOffset", "Filter Resonance", "Filter", "part", "FilterResonance", 14.0f, 114.0f, 64.0f, WireType::Nrpn, -1, 1, 33 },
    { 9, "zplaneMorph", "Z-Plane Frame Morph", "Filter", "part", "FilterMorph", 0.0f, 127.0f, 0.0f, WireType::CC, 70, -1, -1 },
    { 10, "envAttackOffset", "Env Attack Offset", "Envelopes", "part", "AmpEnvAttack", 14.0f, 114.0f, 64.0f, WireType::Nrpn, -1, 1, 99 },
    { 11, "envDecayOffset", "Env Decay Offset", "Envelopes", "part", "AmpEnvDecay", 14.0f, 114.0f, 64.0f, WireType::Nrpn, -1, 1, 100 },
    { 12, "envReleaseOffset", "Env Release Offset", "Envelopes", "part", "AmpEnvRelease", 14.0f, 114.0f, 64.0f, WireType::Nrpn, -1, 1, 102 },
    { 13, "partReverbSend", "Reverb Send", "Effects", "part", "ReverbSend", 0.0f, 127.0f, 40.0f, WireType::CC, 91, -1, -1 },
    { 14, "partChorusSend", "Chorus / Delay Send", "Effects", "part", "ChorusSend", 0.0f, 127.0f, 0.0f, WireType::CC, 93, -1, -1 },
    { 15, "partDrive", "Voice Overdrive", "Effects", "part", "SaturationDrive", 0.0f, 127.0f, 0.0f, WireType::None, -1, -1, -1 },
    { 16, "vectorX", "Vector Joystick X", "Voice", "part", "VectorX", -64.0f, 63.0f, 0.0f, WireType::None, -1, -1, -1 },
    { 17, "vectorY", "Vector Joystick Y", "Voice", "part", "VectorY", -64.0f, 63.0f, 0.0f, WireType::None, -1, -1, -1 },
    { 18, "arpEnabled", "Groove Arp Enable", "Arpeggiator", "part", "ArpEnable", 0.0f, 1.0f, 0.0f, WireType::None, -1, -1, -1 },
    { 19, "arpMotif", "Groove Arp Motif", "Arpeggiator", "part", "ArpMotif", 0.0f, 11.0f, 0.0f, WireType::None, -1, -1, -1 },
    { 20, "arpResolution", "Groove Arp Resolution", "Arpeggiator", "part", "ArpResolution", 0.0f, 15.0f, 3.0f, WireType::None, -1, -1, -1 },
    { 21, "arpSwing", "Groove Arp Swing", "Arpeggiator", "part", "ArpSwing", -100.0f, 100.0f, 0.0f, WireType::None, -1, -1, -1 },
    { 22, "machinePersona", "Machine Persona Mode", "Master", "global", "MachinePersona", 0.0f, 6.0f, 0.0f, WireType::None, -1, -1, -1 },
    { 23, "polyphonyVoices", "Dynamic Polyphony Voices", "Master", "global", "PolyphonyLimit", 1.0f, 64.0f, 64.0f, WireType::None, -1, -1, -1 },
    { 24, "partialBudgetMode", "Partial Budget Mode", "Master", "global", "PartialBudgetMode", 0.0f, 3.0f, 0.0f, WireType::None, -1, -1, -1 },
    { 25, "drumMapMode", "Drum Map Layout Mode", "DrumRack", "part", "DrumMapMode", 0.0f, 5.0f, 1.0f, WireType::None, -1, -1, -1 },
}};

} // namespace abdmcx
