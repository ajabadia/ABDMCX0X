#pragma once

#include "../DSP/Core/McxEngine.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace abdmcx
{

/**
 * @brief Single-source-of-truth parameter router shared identically between
 * WebAssembly (WasmBridge.cpp) and JUCE 9 Native (PluginProcessor.cpp).
 * Zero JUCE dependency, zero allocations, 100% RT-safe.
 */
inline void applyWebPartParam(McxEngine& engine, int partIdx, int paramId, float value) noexcept
{
    if (partIdx < 0 || partIdx >= McxEngine::kNumParts)
        return;

    auto& p = engine.part(partIdx);
    switch (paramId)
    {
    case 0: // Filter Cutoff (Hz from normalized 0..1)
    {
        const float hz = 20.0f * std::pow(1000.0f, std::clamp(value, 0.0f, 1.0f));
        for (auto& partial : p.partials) partial.cutoffHz = hz;
        break;
    }
    case 1: // Filter Resonance (0..1)
    {
        const float res = std::clamp(value, 0.0f, 0.98f);
        for (auto& partial : p.partials) partial.resonance = res;
        break;
    }
    case 2: // Amp Attack ms (0..1)
    {
        const float attackMs = 0.5f + (value * value * 2500.0f);
        for (auto& partial : p.partials) partial.ampEnv.t1Ms = attackMs;
        break;
    }
    case 3: // Amp Decay ms (0..1)
    {
        const float decayMs = 10.0f + (value * 4000.0f);
        for (auto& partial : p.partials) partial.ampEnv.t2Ms = decayMs;
        break;
    }
    case 4: // Amp Sustain Level (0..1)
    {
        const float sus = std::clamp(value, 0.0f, 1.0f);
        for (auto& partial : p.partials) partial.ampEnv.l3 = sus;
        break;
    }
    case 5: // Amp Release ms (0..1)
    {
        const float relMs = 10.0f + (value * 5000.0f);
        for (auto& partial : p.partials) partial.ampEnv.t4Ms = relMs;
        break;
    }
    case 6: // Part Level (0..1)
        p.level = std::clamp(value, 0.0f, 1.0f);
        break;
    case 7: // Part Pan (-1..+1)
        p.pan = std::clamp(value, -1.0f, 1.0f);
        break;
    case 8: // Reverb Send (0..1)
        p.reverbSend = std::clamp(value, 0.0f, 1.0f);
        break;
    case 9: // Chorus Send (0..1)
        p.chorusSend = std::clamp(value, 0.0f, 1.0f);
        break;
    case 10: // Part Route Mode (0=INT, 1=EXT, 2=BOTH)
        p.routeMode = static_cast<McxPartRouteMode>(std::clamp(static_cast<int>(value), 0, 2));
        break;
    case 11: // Machine Persona (0=FreeSuper, 1=MC-303, ..., 7=BossDr5)
        engine.setMachinePersona(static_cast<McxMachinePersona>(std::clamp(static_cast<int>(value), 0, 7)));
        break;
    case 12: // Output Character (0=HD, 1=16bit, 2=12bit)
        engine.setOutputCharacter(static_cast<McxOutputCharacter>(std::clamp(static_cast<int>(value), 0, 2)));
        break;
    case 13: // Filter Model (0..5)
    {
        const auto fm = static_cast<McxFilterModel>(std::clamp(static_cast<int>(value), 0, 5));
        p.filterModel = fm;
        for (auto& partial : p.partials) partial.filterModel = fm;
        break;
    }
    case 14: // Structure Mode (0..3)
        p.structureMode = static_cast<McxStructureMode>(std::clamp(static_cast<int>(value), 0, 3));
        break;
    case 15: // Vector X (-1..+1)
        p.vectorX = std::clamp(value, -1.0f, 1.0f);
        break;
    case 16: // Vector Y (-1..+1)
        p.vectorY = std::clamp(value, -1.0f, 1.0f);
        break;
    case 17: // Reverb/Delay Macro (0..7)
        engine.getOutputAndFx().setReverbMacro(static_cast<int>(value));
        break;
    case 18: // Chorus/Flanger Macro (0..7)
        engine.getOutputAndFx().setChorusMacro(static_cast<int>(value));
        break;
    case 19: // Reverb Time / Delay Time (0..1)
        engine.getOutputAndFx().setReverbTimeNorm(value);
        break;
    case 20: // Chorus / Flanger Rate (0..1)
        engine.getOutputAndFx().setChorusRateNorm(value);
        break;
    case 21: // Diagnostic Probe Bitmask (bits 1..30) or 0=Off
        engine.setFocusedPart(partIdx);
        engine.getDiagnosticProbe().setEnabledMask(static_cast<std::uint64_t>(std::max(0, static_cast<int>(value))));
        break;
    case 22: // Diagnostic Signal Probe Frequency Hz
        engine.getDiagnosticProbe().setFrequencyHz(value);
        break;
    case 23: // Diagnostic Signal Probe Level (0..1)
        engine.getDiagnosticProbe().setLevel(value);
        break;
    case 24: // Diagnostic Signal Probe Waveform (0=Sine, 1=Saw, 2=Noise, 3=Impulse)
        engine.getDiagnosticProbe().setWaveform(static_cast<abd::synth::ProbeWaveform>(static_cast<int>(value)));
        break;
    case 25: // Part Kind (0=Chromatic, 1=DrumMap)
        engine.setPartKind(partIdx, (static_cast<int>(value) == 1) ? McxPartKind::DrumMap : McxPartKind::Chromatic);
        break;
    case 26: // Part MIDI Channel (1..16)
        p.midiChannel = static_cast<std::uint8_t>(std::clamp(static_cast<int>(value), 1, 16));
        break;
    case 27: // Part Mute (0/1)
        p.mute = (value >= 0.5f);
        break;
    case 28: // Part Solo (0/1)
        p.solo = (value >= 0.5f);
        break;
    case 29: // Part Follow Global Transpose (0/1)
        p.followGlobalTranspose = (value >= 0.5f) && (p.kind == McxPartKind::Chromatic);
        break;
    case 30: // Global Max Polyphony (1..64)
        engine.setMaxPolyphony(static_cast<int>(value));
        break;
    case 31: // Global Master Tune A4 Hz (415..466)
        engine.setMasterTuneHz(value);
        break;
    case 32: // Global Standalone BPM (40..240)
        engine.setMasterTempoBpm(std::clamp(value, 40.0f, 240.0f));
        break;
    default:
        break;
    }
}

} // namespace abdmcx
