#pragma once

#include <array>
#include <cstdint>
#include <type_traits>

namespace abdmcx
{

enum class McxOscSourceKind : std::uint8_t
{
    SpectralDdsp = 0,
    PcmZone,
    VaOsc,
    Fm2Op,
    AxionikSurface,
    DwgsWavetable
};

enum class McxPartKind : std::uint8_t
{
    Chromatic = 0,
    DrumMap
};

enum class McxStructureMode : std::uint8_t
{
    Parallel = 0,
    RingMod12,
    Booster12,
    Vector2D
};

enum class McxFilterModel : std::uint8_t
{
    SvfClean = 0,
    RolandTvfZdf,
    Ms20Acid,
    LadderDrive,
    ZPlaneMorph,
    RolandTc6116Tvf
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

enum class McxDrumMapMode : std::uint8_t
{
    GmStandard = 0,
    RolandGsMc,
    YamahaXgXs,
    KorgAi2N5,
    HardwareNative,
    ProprietaryCustom
};

enum class McxDrumTriggerMode : std::uint8_t
{
    OneShot = 0,
    Gated
};

struct McxEnv4T4L
{
    float l0 { 0.0f };
    float t0Ms { 0.0f };
    float t1Ms { 5.0f };
    float t2Ms { 40.0f };
    float t3Ms { 180.0f };
    float t4Ms { 250.0f };
    float l1 { 1.0f };
    float l2 { 0.8f };
    float l3 { 0.65f };
    float l4 { 0.0f };
    std::uint8_t rateT1 { 100 };
    std::uint8_t rateT2 { 70 };
    std::uint8_t rateT3 { 50 };
    std::uint8_t rateT4 { 60 };
    bool useRomLut { false };
};

struct McxPartialConfig
{
    bool enabled { false };
    McxOscSourceKind sourceKind { McxOscSourceKind::VaOsc };
    McxFilterModel filterModel { McxFilterModel::RolandTc6116Tvf };
    std::uint8_t vaWaveform { 0 }; // 0=Saw, 1=Pulse/Square, 2=Tri, 3=Sine, 4=SuperSaw, 5=Noise
    float pulseWidth { 0.5f };
    float level { 0.85f };
    float pan { 0.0f };
    std::int8_t coarseSemitones { 0 };
    float fineCents { 0.0f };
    float cutoffHz { 12000.0f };
    float resonance { 0.15f };
    float zplaneMorph { 0.0f };
    float drive { 0.0f };
    std::uint8_t velLo { 0 };
    std::uint8_t velHi { 127 };
    std::uint8_t filterMode { 0 }; // 0=LPF, 1=HPF, 2=BPF, 3=Bypass
    std::uint8_t velCurveIndex { 0 };
    std::uint16_t altStartOffset { 0 };
    float loopTuneCents { 0.0f };
    bool pingPongLoop { false };
    bool oneShotMode { false };
    float pitchEnvSemitones { 0.0f };
    float filterEnvOctaves { 2.0f };
    McxEnv4T4L ampEnv {};
    McxEnv4T4L filterEnv {};
    McxEnv4T4L pitchEnv {};
    const float* externalSampleData { nullptr };
    int externalSampleLength { 0 };
    int externalLoopStart { 0 };
    int externalLoopEnd { 0 };
};

struct McxDrumSlotConfig
{
    std::uint8_t muteGroup { 0 };
    std::uint8_t coarseKey { 60 };
    McxDrumTriggerMode triggerMode { McxDrumTriggerMode::OneShot };
    float level { 1.0f };
    float pan { 0.0f };
    float reverbSend { 0.25f };
    float chorusSend { 0.0f };
    float cutoffHzOverride { 14000.0f };
    float resonanceOverride { 0.1f };
    float decayMs { 280.0f };
    float pitchKeyTrack { 0.0f };
    bool activeSounding { false };
    const float* externalSampleData { nullptr };
    int externalSampleLength { 0 };
    int externalLoopStart { 0 };
    int externalLoopEnd { 0 };
};

struct McxDrumNoteRemapper
{
    std::array<std::uint8_t, 128> inputToSlot {};
    std::array<std::uint8_t, 128> slotToExternal {};

    void initIdentity() noexcept
    {
        for (int i = 0; i < 128; ++i)
        {
            inputToSlot[static_cast<std::size_t>(i)] = static_cast<std::uint8_t>(i);
            slotToExternal[static_cast<std::size_t>(i)] = static_cast<std::uint8_t>(i);
        }
    }
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
    std::uint8_t length { 0 };
    std::uint8_t bytes[16] {};
    std::int32_t sampleOffset { 0 };
};

static_assert(std::is_trivially_copyable_v<McxEnv4T4L>, "McxEnv4T4L must be POD/RT-safe");
static_assert(std::is_trivially_copyable_v<McxPartialConfig>, "McxPartialConfig must be POD/RT-safe");
static_assert(std::is_trivially_copyable_v<McxDrumSlotConfig>, "McxDrumSlotConfig must be POD/RT-safe");
static_assert(std::is_trivially_copyable_v<McxDrumNoteRemapper>, "McxDrumNoteRemapper must be POD/RT-safe");
static_assert(std::is_trivially_copyable_v<McxMidiOutMessage>,
              "McxMidiOutMessage must remain trivially copyable for SPSC queues");

} // namespace abdmcx
