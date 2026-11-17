#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "ParameterRegistry.gen.h"

namespace abdmcx {

inline juce::AudioProcessorValueTreeState::ParameterLayout createMcxParameterLayout() {
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;
    params.reserve(kNumParameters);

    // Global parameters
    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::MasterVolumeDb, 1),
        "Master Volume",
        juce::NormalisableRange<float>(-60.0f, 6.0f, 0.1f),
        0.0f
    ));

    params.push_back(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID(ParamId::OutputCharacter, 1),
        "Output Character",
        juce::StringArray{ "HD Studio (32-bit)", "90s Rompler (16-bit)", "Vintage Sampler (12-bit)" },
        1
    ));

    params.push_back(std::make_unique<juce::AudioParameterInt>(
        juce::ParameterID(ParamId::FocusedPartIndex, 1),
        "Focused Part Index",
        0, 15, 0
    ));

    params.push_back(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID(ParamId::MachinePersona, 1),
        "Machine Persona",
        juce::StringArray{
            "Free / Super Mode",
            "Roland MC-303 (28-Partial)",
            "Roland MC-505 / D-2",
            "Yamaha CS2x / XG",
            "Korg N5 / AI2",
            "E-mu Orbit / Carnival",
            "Quasimidi Rave-O-Lution 309"
        },
        0
    ));

    params.push_back(std::make_unique<juce::AudioParameterInt>(
        juce::ParameterID(ParamId::PolyphonyVoices, 1),
        "Polyphony Voices",
        1, 64, 64
    ));

    params.push_back(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID(ParamId::PartialBudgetMode, 1),
        "Partial Budget Mode",
        juce::StringArray{
            "Unlimited (Zero-Idle CPU)",
            "MC-303 Authentic (28 Partials)",
            "MC-505 / CS2x (64 Partials)",
            "Vintage 32-Partial"
        },
        0
    ));

    // Proxied Focused Part Parameters
    params.push_back(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID(ParamId::PartRouteMode, 1),
        "Part Route Mode",
        juce::StringArray{ "INT (Internal)", "EXT (MIDI Hardware)", "BOTH (A/B Mirror)" },
        0
    ));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::PartLevel, 1),
        "Part Level",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f),
        0.8f
    ));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::PartPan, 1),
        "Part Pan",
        juce::NormalisableRange<float>(-1.0f, 1.0f, 0.01f),
        0.0f
    ));

    params.push_back(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID(ParamId::PartFilterModel, 1),
        "Filter Model",
        juce::StringArray{
            "SVF Clean", "Roland TVF ZDF", "MS-20 Acid",
            "Ladder Drive", "Z-Plane Morph", "Roland TC6116 TVF"
        },
        5
    ));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::TvfCutoffOffset, 1),
        "Filter Cutoff Offset",
        juce::NormalisableRange<float>(-50.0f, 50.0f, 0.5f),
        0.0f
    ));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::TvfResonanceOffset, 1),
        "Filter Resonance Offset",
        juce::NormalisableRange<float>(-50.0f, 50.0f, 0.5f),
        0.0f
    ));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::ZplaneMorph, 1),
        "Z-Plane Morph",
        juce::NormalisableRange<float>(0.0f, 1.0f, 0.01f),
        0.0f
    ));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::EnvAttackOffset, 1),
        "Env Attack Offset",
        juce::NormalisableRange<float>(-50.0f, 50.0f, 0.5f),
        0.0f
    ));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::EnvDecayOffset, 1),
        "Env Decay Offset",
        juce::NormalisableRange<float>(-50.0f, 50.0f, 0.5f),
        0.0f
    ));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::EnvReleaseOffset, 1),
        "Env Release Offset",
        juce::NormalisableRange<float>(-50.0f, 50.0f, 0.5f),
        0.0f
    ));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::PartReverbSend, 1),
        "Reverb Send",
        juce::NormalisableRange<float>(0.0f, 100.0f, 0.5f),
        30.0f
    ));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::PartChorusSend, 1),
        "Chorus Send",
        juce::NormalisableRange<float>(0.0f, 100.0f, 0.5f),
        0.0f
    ));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::PartDrive, 1),
        "Voice Drive",
        juce::NormalisableRange<float>(0.0f, 100.0f, 0.5f),
        0.0f
    ));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::VectorX, 1),
        "Vector Joystick X",
        juce::NormalisableRange<float>(-1.0f, 1.0f, 0.01f),
        0.0f
    ));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::VectorY, 1),
        "Vector Joystick Y",
        juce::NormalisableRange<float>(-1.0f, 1.0f, 0.01f),
        0.0f
    ));

    params.push_back(std::make_unique<juce::AudioParameterBool>(
        juce::ParameterID(ParamId::ArpEnabled, 1),
        "Groove Arp Enable",
        false
    ));

    params.push_back(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID(ParamId::ArpMotif, 1),
        "Groove Arp Motif",
        juce::StringArray{
            "Up", "Down", "Alt1", "Alt2", "Random", "Chord",
            "AsPlayed", "UpDownInv", "BassPlusChord", "OctaveJump", "StrumUp", "StrumDown"
        },
        0
    ));

    params.push_back(std::make_unique<juce::AudioParameterInt>(
        juce::ParameterID(ParamId::ArpResolution, 1),
        "Groove Arp Resolution",
        0, 15, 3
    ));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID(ParamId::ArpSwing, 1),
        "Groove Arp Swing",
        juce::NormalisableRange<float>(-100.0f, 100.0f, 1.0f),
        0.0f
    ));

    params.push_back(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID(ParamId::DrumMapMode, 1),
        "Drum Map Mode",
        juce::StringArray{
            "GM Standard (35..81)",
            "Roland GS / MC-303 (11..127)",
            "Yamaha XG / XS / CS2x (13..100)",
            "Korg AI2 / N5 (24..85)",
            "Hardware Native",
            "Proprietary Custom (0..127)"
        },
        1
    ));

    return { params.begin(), params.end() };
}

} // namespace abdmcx
