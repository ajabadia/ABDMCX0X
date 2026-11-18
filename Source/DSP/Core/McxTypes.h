#pragma once

#include "SynthEngines/ISoundEngine.h"
#include "SynthEngines/TrackModRouter.h"
#include "SynthEngines/StructuredRompler/StructuredRomplerEngine.h"

#include <array>
#include <cstdint>
#include <type_traits>

namespace abdmcx
{

// Suite-level sound engine interface & track modulation router
using IMcxSoundEngine     = abd::engines::ISoundEngine;
using McxTrackModRouter   = abd::engines::TrackModRouter;

// Structured Rompler synthesis types & DSP primitives (hosted in ABDShared)
using McxOscSourceKind    = abd::rompler::OscSourceKind;
using McxStructureMode    = abd::rompler::StructureMode;
using McxFilterModel      = abd::rompler::FilterModel;
using McxDrumMapMode      = abd::rompler::DrumMapMode;
using McxDrumTriggerMode  = abd::rompler::DrumTriggerMode;
using McxEnv4T4L          = abd::rompler::Env4T4L;
using McxPartialConfig    = abd::rompler::PartialConfig;
using McxDrumSlotConfig   = abd::rompler::DrumSlotConfig;
using McxDrumNoteRemapper = abd::rompler::DrumNoteRemapper;
using McxEnvelope5Stage   = abd::rompler::RomplerEnvelope5Stage;
using McxFilterBank       = abd::rompler::RomplerFilterBank;
using McxPartialExciter   = abd::rompler::RomplerPartialExciter;
using McxVoice            = abd::rompler::RomplerVoice;

enum class McxPartKind : std::uint8_t
{
    Chromatic = 0,
    DrumMap
};

enum class McxOutputCharacter : std::uint8_t
{
    HdStudio = 0,
    Rompler16Bit,
    Sampler12Bit
};

enum class McxPartRouteMode : std::uint8_t
{
    Internal = 0,
    ExternalMidi,
    BothAB
};

enum class McxMachinePersona : std::uint8_t
{
    FreeSuper = 0,
    RolandMc303,
    RolandMc505,
    YamahaCs2x,
    KorgN5,
    EmuOrbit,
    Quasimidi309,
    BossDr5
};

struct McxMachinePersonaSpec
{
    McxMachinePersona persona { McxMachinePersona::FreeSuper };
    std::uint8_t maxPartialsPerTone { 4 };
    McxFilterModel defaultFilter { McxFilterModel::RolandTc6116Tvf };
    McxOutputCharacter defaultDac { McxOutputCharacter::HdStudio };
    std::uint16_t defaultVoiceLimit { 64 };
    std::uint16_t defaultPartialBudget { 256 };
    bool authenticPartialStealing { false };
    McxDrumMapMode defaultDrumMapMode { McxDrumMapMode::RolandGsMc };
    bool locksLimits { false };
};

[[nodiscard]] inline McxMachinePersonaSpec getMachinePersonaSpec(McxMachinePersona persona) noexcept
{
    switch (persona)
    {
        case McxMachinePersona::RolandMc303:
            return { persona, 2, McxFilterModel::RolandTc6116Tvf, McxOutputCharacter::Rompler16Bit, 28, 28, true, McxDrumMapMode::RolandGsMc, true };
        case McxMachinePersona::RolandMc505:
            return { persona, 4, McxFilterModel::RolandTvfZdf, McxOutputCharacter::Rompler16Bit, 64, 64, true, McxDrumMapMode::RolandGsMc, true };
        case McxMachinePersona::YamahaCs2x:
            return { persona, 2, McxFilterModel::SvfClean, McxOutputCharacter::HdStudio, 64, 64, false, McxDrumMapMode::YamahaXgXs, true };
        case McxMachinePersona::KorgN5:
            return { persona, 2, McxFilterModel::SvfClean, McxOutputCharacter::Rompler16Bit, 32, 64, false, McxDrumMapMode::KorgAi2N5, true };
        case McxMachinePersona::EmuOrbit:
            return { persona, 2, McxFilterModel::ZPlaneMorph, McxOutputCharacter::Rompler16Bit, 32, 32, false, McxDrumMapMode::HardwareNative, true };
        case McxMachinePersona::Quasimidi309:
            return { persona, 2, McxFilterModel::Ms20Acid, McxOutputCharacter::Rompler16Bit, 32, 32, false, McxDrumMapMode::HardwareNative, true };
        case McxMachinePersona::BossDr5:
            return { persona, 2, McxFilterModel::RolandTc6116Tvf, McxOutputCharacter::Rompler16Bit, 19, 19, true, McxDrumMapMode::RolandGsMc, true };
        case McxMachinePersona::FreeSuper:
        default:
            return { McxMachinePersona::FreeSuper, 4, McxFilterModel::RolandTc6116Tvf, McxOutputCharacter::HdStudio, 64, 256, false, McxDrumMapMode::ProprietaryCustom, false };
    }
}

struct McxMidiOutMessage
{
    std::uint8_t portIndex { 0 }; // 0 = DAW / Default, 1..N = Physical/Virtual MIDI ports
    std::uint8_t priority { 1 };  // 0 = Clock/Realtime, 1 = NoteOn/NoteOff, 2 = CC/NRPN/Mod
    std::uint8_t length { 0 };
    std::uint8_t bytes[32] {};
    std::int32_t sampleOffset { 0 };
};

struct McxTrackSemanticOffsets
{
    float cutoffOctaves { 0.0f }; // bipolar [-1..+1] -> +/-4 octaves non-destructive offset
    float resonance { 0.0f };     // bipolar [-1..+1] -> +/-0.5 additive offset
    float envAttack { 0.0f };     // bipolar [-1..+1] -> 2^(val*2) multiplicative scale
    float envDecay { 0.0f };      // bipolar [-1..+1] -> 2^(val*2) multiplicative scale
    float envSustain { 0.0f };    // bipolar [-1..+1] -> +/-0.5 additive offset
    float envRelease { 0.0f };    // bipolar [-1..+1] -> 2^(val*2) multiplicative scale
    float vibratoDepth { 0.0f };  // bipolar [-1..+1] -> additive LFO1 depth offset
};

static_assert(std::is_trivially_copyable_v<McxEnv4T4L>, "McxEnv4T4L must be POD/RT-safe");
static_assert(std::is_trivially_copyable_v<McxPartialConfig>, "McxPartialConfig must be POD/RT-safe");
static_assert(std::is_trivially_copyable_v<McxDrumSlotConfig>, "McxDrumSlotConfig must be POD/RT-safe");
static_assert(std::is_trivially_copyable_v<McxDrumNoteRemapper>, "McxDrumNoteRemapper must be POD/RT-safe");
static_assert(std::is_trivially_copyable_v<McxTrackSemanticOffsets>, "McxTrackSemanticOffsets must be POD/RT-safe");
static_assert(std::is_trivially_copyable_v<McxMidiOutMessage>,
              "McxMidiOutMessage must remain trivially copyable for SPSC queues");

} // namespace abdmcx
