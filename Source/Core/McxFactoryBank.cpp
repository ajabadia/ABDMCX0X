#include "McxFactoryBank.h"
#include <algorithm>

namespace abdmcx
{

namespace
{
constexpr const char* kKitNames[McxFactoryBank::kNumFactoryKits] = {
    "90s Groove Kit",
    "HipHop / LoFi Kit",
    "SynthPop 80s Kit",
    "Industrial Acid Kit"
};

constexpr const char* kToneNames[McxFactoryBank::kNumFactoryTones] = {
    "TB-303 Acid Bass",
    "SuperSaw Rave Lead",
    "Juno Poly Pad",
    "Reso Sweep Synth",
    "Pizzicato Pluck",
    "FM Digital Bell",
    "Sub Techno Bass",
    "Noise Sweep FX",
    "Square Lead 80s",
    "Eurodance Bass",
    "Warm Brass Ensemble",
    "Sine Arp Staccato",
    "Detuned Saw Chord",
    "Electro Slap Bass",
    "Ambient Crystal Pad",
    "RingMod Percussion"
};
} // namespace

const char* McxFactoryBank::getKitName(int index) noexcept
{
    const int idx = std::clamp(index, 0, kNumFactoryKits - 1);
    return kKitNames[idx];
}

const char* McxFactoryBank::getToneName(int index) noexcept
{
    const int idx = std::clamp(index, 0, kNumFactoryTones - 1);
    return kToneNames[idx];
}

void McxFactoryBank::initFactoryDrumKit(McxPartState& p, int kitIndex) noexcept
{
    p.isDrumKit = true;
    p.level = 0.90f;
    p.pan = 0.0f;
    p.reverbSend = 0.20f;
    p.chorusSend = 0.05f;
    p.drumMapMode = McxDrumMapMode::RolandGsMc;

    // Reset all slots
    for (int i = 0; i < 128; ++i)
    {
        auto& s = p.drumSlots[static_cast<std::size_t>(i)];
        s.coarseKey = static_cast<std::uint8_t>(i);
        s.muteGroup = 0;
        s.triggerMode = McxDrumTriggerMode::OneShot;
        s.level = 0.85f;
        s.pan = 0.0f;
        s.reverbSend = 0.15f;
        s.chorusSend = 0.0f;
        s.cutoffHzOverride = 14000.0f;
        s.resonanceOverride = 0.1f;
        s.decayMs = 280.0f;
    }

    // Configure standard drum notes
    // Kick (36)
    p.drumSlots[36].cutoffHzOverride = (kitIndex == 3) ? 8000.0f : 12000.0f;
    p.drumSlots[36].decayMs = 350.0f;
    p.drumSlots[36].level = 1.0f;

    // Snare (38)
    p.drumSlots[38].cutoffHzOverride = 15000.0f;
    p.drumSlots[38].decayMs = 260.0f;
    p.drumSlots[38].reverbSend = 0.35f;

    // Closed Hi-Hat (42) & Open Hi-Hat (46) with muteGroup 1 choke
    p.drumSlots[42].muteGroup = 1;
    p.drumSlots[42].cutoffHzOverride = 16000.0f;
    p.drumSlots[42].decayMs = 60.0f;

    p.drumSlots[46].muteGroup = 1;
    p.drumSlots[46].cutoffHzOverride = 16000.0f;
    p.drumSlots[46].decayMs = 450.0f;

    // Clap (39)
    p.drumSlots[39].reverbSend = 0.40f;
    p.drumSlots[39].decayMs = 200.0f;

    // Configure Part's partial 0 as default drum excitation
    auto& pt = p.partials[0];
    pt.enabled = true;
    pt.sourceKind = McxOscSourceKind::VaOsc;
    pt.vaWaveform = (kitIndex == 1) ? 2 : 0; // Tri for LoFi, Saw for standard
    pt.cutoffHz = 16000.0f;
    pt.resonance = 0.12f;
    pt.filterModel = McxFilterModel::RolandTc6116Tvf;
}

void McxFactoryBank::initFactoryTone(McxPartState& p, int toneIndex) noexcept
{
    p.isDrumKit = false;
    p.level = 0.85f;
    p.pan = 0.0f;
    p.reverbSend = 0.25f;
    p.chorusSend = 0.10f;
    p.structureMode = McxStructureMode::Parallel;

    for (auto& pt : p.partials) pt.enabled = false;

    auto& p1 = p.partials[0];
    p1.enabled = true;
    p1.level = 0.85f;
    p1.filterModel = McxFilterModel::RolandTc6116Tvf;

    switch (toneIndex % kNumFactoryTones)
    {
        case 0: // TB-303 Acid Bass
            p1.sourceKind = McxOscSourceKind::VaOsc;
            p1.vaWaveform = 0; // Saw
            p1.cutoffHz = 3500.0f;
            p1.resonance = 0.65f;
            p1.ampEnv = { 0.0f, 0.0f, 1.0f, 30.0f, 120.0f, 80.0f, 1.0f, 0.7f, 0.0f, 0.0f };
            p1.filterEnv = { 0.0f, 0.0f, 1.0f, 25.0f, 100.0f, 60.0f, 1.0f, 0.8f, 0.0f, 0.0f };
            p1.filterEnvOctaves = 3.2f;
            break;

        case 1: // SuperSaw Rave Lead
            p1.sourceKind = McxOscSourceKind::VaOsc;
            p1.vaWaveform = 4; // SuperSaw
            p1.cutoffHz = 16000.0f;
            p1.resonance = 0.15f;
            p.chorusSend = 0.40f;
            break;

        case 2: // Juno Poly Pad
            p1.sourceKind = McxOscSourceKind::VaOsc;
            p1.vaWaveform = 1; // Pulse/Square
            p1.pulseWidth = 0.35f;
            p1.cutoffHz = 7500.0f;
            p1.resonance = 0.25f;
            p1.ampEnv = { 0.0f, 0.0f, 60.0f, 100.0f, 400.0f, 350.0f, 1.0f, 0.9f, 0.8f, 0.0f };
            p.chorusSend = 0.50f;
            p.reverbSend = 0.45f;
            break;

        case 3: // Reso Sweep Synth
            p1.sourceKind = McxOscSourceKind::VaOsc;
            p1.vaWaveform = 2; // Triangle
            p1.cutoffHz = 2200.0f;
            p1.resonance = 0.75f;
            p1.filterEnv = { 0.0f, 0.0f, 15.0f, 60.0f, 250.0f, 150.0f, 1.0f, 0.85f, 0.2f, 0.0f };
            p1.filterEnvOctaves = 4.0f;
            break;

        case 4: // Pizzicato Pluck
            p1.sourceKind = McxOscSourceKind::VaOsc;
            p1.vaWaveform = 1; // Square
            p1.pulseWidth = 0.5f;
            p1.cutoffHz = 9000.0f;
            p1.resonance = 0.2f;
            p1.ampEnv = { 0.0f, 0.0f, 2.0f, 20.0f, 90.0f, 60.0f, 1.0f, 0.5f, 0.0f, 0.0f };
            break;

        case 5: // FM Digital Bell
            p1.sourceKind = McxOscSourceKind::Fm2Op;
            p1.cutoffHz = 16000.0f;
            p1.resonance = 0.05f;
            p1.ampEnv = { 0.0f, 0.0f, 1.0f, 40.0f, 350.0f, 300.0f, 1.0f, 0.7f, 0.0f, 0.0f };
            p.reverbSend = 0.50f;
            break;

        case 6: // Sub Techno Bass
            p1.sourceKind = McxOscSourceKind::VaOsc;
            p1.vaWaveform = 3; // Sine
            p1.cutoffHz = 2000.0f;
            p1.resonance = 0.1f;
            p1.ampEnv = { 0.0f, 0.0f, 1.0f, 15.0f, 180.0f, 90.0f, 1.0f, 0.8f, 0.5f, 0.0f };
            break;

        case 7: // Noise Sweep FX
            p1.sourceKind = McxOscSourceKind::VaOsc;
            p1.vaWaveform = 5; // Noise
            p1.filterMode = 2; // BPF
            p1.cutoffHz = 4000.0f;
            p1.resonance = 0.6f;
            p.reverbSend = 0.60f;
            break;

        default:
            p1.sourceKind = McxOscSourceKind::VaOsc;
            p1.vaWaveform = 0;
            p1.cutoffHz = 12000.0f;
            p1.resonance = 0.2f;
            break;
    }
}

void McxFactoryBank::applyFactoryDefaults(McxEngine& engine) noexcept
{
    // Part 9 (Channel 10) = Standard Drum Kit
    initFactoryDrumKit(engine.part(9), 0);

    // Parts 0..8 and 10..15 = Melodic Factory Tones
    for (int i = 0; i < 16; ++i)
    {
        if (i == 9) continue;
        initFactoryTone(engine.part(i), i);
        engine.part(i).midiChannel = static_cast<std::uint8_t>(i + 1);
    }
}

} // namespace abdmcx
