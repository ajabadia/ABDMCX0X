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
    case 33: // Global Transpose Semitones (-24..+24)
        engine.setGlobalTranspose(static_cast<int>(std::clamp(value, -24.0f, 24.0f)));
        break;
    case 34: // Global Musical Scale (0..14)
        engine.getTransposer().setScale(static_cast<abd::synth::MusicalScale>(std::clamp(static_cast<int>(value), 0, static_cast<int>(abd::synth::MusicalScale::Count) - 1)));
        break;
    case 35: // Global Scale Root Note (0..11)
        engine.getTransposer().setRootNote(std::clamp(static_cast<int>(value), 0, 11));
        break;
    case 36: // Global Scale Quantize Enable (0/1)
        engine.getTransposer().setQuantizeEnabled(value >= 0.5f);
        break;
    case 37: // Channel Strip EQ Enabled (0/1)
        p.eqEnabled = (value >= 0.5f);
        break;
    case 38: // Channel Strip EQ Low Gain dB (-15..+15)
        p.eqLowGainDb = std::clamp(value, -15.0f, 15.0f);
        break;
    case 39: // Channel Strip EQ Low Freq Hz (30..500)
        p.eqLowFreqHz = std::clamp(value, 30.0f, 500.0f);
        break;
    case 40: // Channel Strip EQ Mid Gain dB (-15..+15)
        p.eqMidGainDb = std::clamp(value, -15.0f, 15.0f);
        break;
    case 41: // Channel Strip EQ Mid Freq Hz (100..8000)
        p.eqMidFreqHz = std::clamp(value, 100.0f, 8000.0f);
        break;
    case 42: // Channel Strip EQ Mid Q (0.3..5.0)
        p.eqMidQ = std::clamp(value, 0.3f, 5.0f);
        break;
    case 43: // Channel Strip EQ High Gain dB (-15..+15)
        p.eqHighGainDb = std::clamp(value, -15.0f, 15.0f);
        break;
    case 44: // Channel Strip EQ High Freq Hz (1000..18000)
        p.eqHighFreqHz = std::clamp(value, 1000.0f, 18000.0f);
        break;
    case 45: // Channel Strip Drive Enabled (0/1)
        p.driveEnabled = (value >= 0.5f);
        break;
    case 46: // Channel Strip Drive Amount (0..1)
        p.driveAmount = std::clamp(value, 0.0f, 1.0f);
        break;
    case 47: // Channel Strip Send C (Delay Send 0..1)
        p.delaySend = std::clamp(value, 0.0f, 1.0f);
        break;
    case 48: // Channel Strip Send D (Aux Send 0..1)
        p.auxSend = std::clamp(value, 0.0f, 1.0f);
        break;
    case 49: // Channel Strip Send A Pre/Post (0=Post, 1=Pre)
        p.reverbSendPre = (value >= 0.5f);
        break;
    case 50: // Channel Strip Send B Pre/Post (0=Post, 1=Pre)
        p.chorusSendPre = (value >= 0.5f);
        break;
    case 51: // Channel Strip Send C Pre/Post (0=Post, 1=Pre)
        p.delaySendPre = (value >= 0.5f);
        break;
    case 52: // Channel Strip Send D Pre/Post (0=Post, 1=Pre)
        p.auxSendPre = (value >= 0.5f);
        break;
    case 53: // Part Pitch Coarse (-24..+24 semitones)
    {
        const auto st = static_cast<std::int8_t>(std::clamp(static_cast<int>(value), -24, 24));
        for (auto& pt : p.partials) pt.coarseSemitones = st;
        break;
    }
    case 54: // Part Pitch Fine (-50..+50 cents)
    {
        const float cents = std::clamp(value, -50.0f, 50.0f);
        for (auto& pt : p.partials) pt.fineCents = cents;
        break;
    }
    case 55: // Part Portamento Enable (0/1)
        p.portamentoEnabled = (value >= 0.5f);
        break;
    case 56: // Part Portamento Time ms (0..1000)
        p.portamentoTimeMs = std::clamp(value, 0.0f, 1000.0f);
        break;
    case 57: // Part Portamento Legato Only (0/1)
        p.portamentoLegatoOnly = (value >= 0.5f);
        break;
    case 58: // Part Arp / Sequencer Enable (0/1)
        p.arp.setEnabled(value >= 0.5f);
        p.arp.setPatternMaskEnabled(true);
        p.arp.setPatternLength(16);
        break;
    case 59: // Part Step Mute Toggle (stepIdx * 10 + (on ? 1 : 0))
    {
        const int sIdx = std::clamp(static_cast<int>(value) / 10, 0, 15);
        const bool on = (static_cast<int>(value) % 10) != 0;
        p.arp.setStepActive(sIdx, on);
        break;
    }
    case 60: // Part Step Accent Toggle (stepIdx * 10 + (accent ? 1 : 0))
    {
        const int sIdx = std::clamp(static_cast<int>(value) / 10, 0, 15);
        const bool acc = (static_cast<int>(value) % 10) != 0;
        auto step = p.arp.getStep(sIdx);
        step.velocityScale = acc ? 1.5f : 1.0f;
        p.arp.setStep(sIdx, step);
        break;
    }
    case 61: // Part Step Slide Toggle (stepIdx * 10 + (slide ? 1 : 0))
    {
        const int sIdx = std::clamp(static_cast<int>(value) / 10, 0, 15);
        const bool slide = (static_cast<int>(value) % 10) != 0;
        auto step = p.arp.getStep(sIdx);
        step.tie = slide;
        p.arp.setStep(sIdx, step);
        break;
    }
    case 62: // Filter 2 Enabled (0/1)
        p.filter2Enabled = (value >= 0.5f);
        break;
    case 63: // Filter 2 Model (0..5: SvfClean, RolandTvfZdf, Ms20Acid, LadderDrive, ZPlaneMorph, RolandTc6116Tvf)
        p.filter2Model = static_cast<McxFilterModel>(std::clamp(static_cast<int>(value), 0, 5));
        break;
    case 64: // Filter 2 Mode (0=LPF, 1=HPF, 2=BPF, 3=Bypass)
        p.filter2Mode = static_cast<std::uint8_t>(std::clamp(static_cast<int>(value), 0, 3));
        break;
    case 65: // Filter 2 Cutoff (0..1 -> 20Hz..20kHz)
        p.filter2CutoffHz = 20.0f * std::pow(1000.0f, std::clamp(value, 0.0f, 1.0f));
        break;
    case 66: // Filter 2 Resonance (0..1)
        p.filter2Resonance = std::clamp(value, 0.0f, 0.98f);
        break;
    default:
        break;
    }
}

} // namespace abdmcx
