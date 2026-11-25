#pragma once

#include "../DSP/Core/McxEngine.h"
#include "../Sequencer/McxPatternSequencer.h"
#include "McxParamRouterExt.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace abdmcx
{

inline void setAllPartialsEngineParam(IMcxSoundEngine* se, const char* const (&keys)[4], float value) noexcept
{
    if (se == nullptr) return;
    for (const char* k : keys)
        (void)se->setParamByKey(k, value);
}

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
    auto* se = engine.getPartSoundEngine(partIdx);
    switch (paramId)
    {
    case 0: // Filter Cutoff (Hz from normalized 0..1)
        setAllPartialsEngineParam(se, {"p1.cutoffHz", "p2.cutoffHz", "p3.cutoffHz", "p4.cutoffHz"},
            20.0f * std::pow(1000.0f, std::clamp(value, 0.0f, 1.0f)));
        break;
    case 1: // Filter Resonance (0..1)
        setAllPartialsEngineParam(se, {"p1.resonance", "p2.resonance", "p3.resonance", "p4.resonance"},
            std::clamp(value, 0.0f, 0.98f));
        break;
    case 2: // Amp Attack ms (0..1)
        setAllPartialsEngineParam(se, {"p1.amp.t1Ms", "p2.amp.t1Ms", "p3.amp.t1Ms", "p4.amp.t1Ms"},
            0.5f + (value * value * 2500.0f));
        break;
    case 3: // Amp Decay ms (0..1)
        setAllPartialsEngineParam(se, {"p1.amp.t2Ms", "p2.amp.t2Ms", "p3.amp.t2Ms", "p4.amp.t2Ms"},
            10.0f + (value * 4000.0f));
        break;
    case 4: // Amp Sustain Level (0..1)
        setAllPartialsEngineParam(se, {"p1.amp.l3", "p2.amp.l3", "p3.amp.l3", "p4.amp.l3"},
            std::clamp(value, 0.0f, 1.0f));
        break;
    case 5: // Amp Release ms (0..1)
        setAllPartialsEngineParam(se, {"p1.amp.t4Ms", "p2.amp.t4Ms", "p3.amp.t4Ms", "p4.amp.t4Ms"},
            10.0f + (value * 5000.0f));
        break;
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
        const float fm = static_cast<float>(std::clamp(static_cast<int>(value), 0, 5));
        if (se != nullptr) (void)se->setParamByKey("filter.model", fm);
        setAllPartialsEngineParam(se, {"p1.filterModel", "p2.filterModel", "p3.filterModel", "p4.filterModel"}, fm);
        break;
    }
    case 14: // Structure Mode (0..3)
        if (se != nullptr) (void)se->setParamByKey("structure", static_cast<float>(std::clamp(static_cast<int>(value), 0, 3)));
        break;
    case 15: // Vector X (-1..+1)
        if (se != nullptr) (void)se->setParamByKey("vector.x", std::clamp(value, -1.0f, 1.0f));
        break;
    case 16: // Vector Y (-1..+1)
        if (se != nullptr) (void)se->setParamByKey("vector.y", std::clamp(value, -1.0f, 1.0f));
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
    case 47: p.delaySend = std::clamp(value, 0.0f, 1.0f); break;
    case 48: p.auxSend = std::clamp(value, 0.0f, 1.0f); break;
    case 49: p.reverbSendPre = (value >= 0.5f); break;
    case 50: p.chorusSendPre = (value >= 0.5f); break;
    case 51: p.delaySendPre = (value >= 0.5f); break;
    case 52: p.auxSendPre = (value >= 0.5f); break;
    case 53: // Part Pitch Coarse (-24..+24 semitones)
    {
        const float coarse = static_cast<float>(std::clamp(static_cast<int>(value), -24, 24));
        setAllPartialsEngineParam(se, {"p1.coarse", "p2.coarse", "p3.coarse", "p4.coarse"}, coarse);
        if (se != nullptr) { (void)se->setParamByKey("u.keyShift", coarse); (void)se->setParamByKey("l.keyShift", coarse); (void)se->setParamByKey("coarse", coarse); }
        break;
    }
    case 54: // Part Pitch Fine (-50..+50 cents)
    {
        const float fine = std::clamp(value, -50.0f, 50.0f);
        setAllPartialsEngineParam(se, {"p1.fine", "p2.fine", "p3.fine", "p4.fine"}, fine);
        if (se != nullptr) {
            (void)se->setParamByKey("u.masterFine", 50.0f + fine); (void)se->setParamByKey("l.masterFine", 50.0f + fine);
            (void)se->setParamByKey("tuningA4", std::clamp(440.0f * std::pow(2.0f, fine / 1200.0f), 432.0f, 448.0f));
            (void)se->setParamByKey("fine", fine);
        }
        break;
    }
    case 55:
        if (se != nullptr) {
            const float on = (value >= 0.5f) ? 1.0f : 0.0f;
            (void)se->setParamByKey("porta.enabled", on); (void)se->setParamByKey("portaSwitch", on);
            if (on < 0.5f) (void)se->setParamByKey("glide", 0.0f);
        }
        break;
    case 56:
        if (se != nullptr) {
            const float ms = std::clamp(value, 0.0f, 5000.0f);
            (void)se->setParamByKey("porta.timeMs", ms); (void)se->setParamByKey("portaTime", std::clamp(ms * 0.05f, 0.0f, 100.0f));
            (void)se->setParamByKey("glide", std::clamp(ms, 0.0f, 2000.0f)); (void)se->setParamByKey("slide", std::clamp(ms, 2.0f, 360.0f));
        }
        break;
    case 57:
        if (se != nullptr) {
            const float leg = (value >= 0.5f) ? 1.0f : 0.0f;
            (void)se->setParamByKey("porta.legato", leg); (void)se->setParamByKey("portaMode", leg);
        }
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
        const auto step = p.arp.getStep(sIdx);
        engine.sequencer().setStep(partIdx, sIdx, on, (step.velocityScale > 1.1f) ? 118 : 96, step.tie, p.isDrumKit ? 36 : 60);
        break;
    }
    case 60: // Part Step Accent Toggle (stepIdx * 10 + (accent ? 1 : 0))
    {
        const int sIdx = std::clamp(static_cast<int>(value) / 10, 0, 15);
        auto step = p.arp.getStep(sIdx);
        step.velocityScale = ((static_cast<int>(value) % 10) != 0) ? 1.5f : 1.0f;
        p.arp.setStep(sIdx, step);
        engine.sequencer().setStep(partIdx, sIdx, step.active, (step.velocityScale > 1.1f) ? 118 : 96, step.tie, p.isDrumKit ? 36 : 60);
        break;
    }
    case 61: // Part Step Slide Toggle (stepIdx * 10 + (slide ? 1 : 0))
    {
        const int sIdx = std::clamp(static_cast<int>(value) / 10, 0, 15);
        auto step = p.arp.getStep(sIdx);
        step.tie = ((static_cast<int>(value) % 10) != 0);
        p.arp.setStep(sIdx, step);
        engine.sequencer().setStep(partIdx, sIdx, step.active, (step.velocityScale > 1.1f) ? 118 : 96, step.tie, p.isDrumKit ? 36 : 60);
        break;
    }
    case 62: if (se != nullptr) se->setParamByKey("filter2.enabled", (value >= 0.5f) ? 1.0f : 0.0f); break;
    case 63: if (se != nullptr) se->setParamByKey("filter2.model", static_cast<float>(std::clamp(static_cast<int>(value), 0, 5))); break;
    case 64: if (se != nullptr) se->setParamByKey("filter2.mode", static_cast<float>(std::clamp(static_cast<int>(value), 0, 3))); break;
    case 65: if (se != nullptr) se->setParamByKey("filter2.cutoffHz", 20.0f * std::pow(1000.0f, std::clamp(value, 0.0f, 1.0f))); break;
    case 66: if (se != nullptr) se->setParamByKey("filter2.resonance", std::clamp(value, 0.0f, 0.98f)); break;
    case 67:
        setAllPartialsEngineParam(se, {"p1.filterMode", "p2.filterMode", "p3.filterMode", "p4.filterMode"},
            static_cast<float>(std::clamp(static_cast<int>(value), 0, 3)));
        break;
    default:
        applyWebPartParamExt(engine, partIdx, paramId, value);
        break;
    }
}

inline void routePartParam(McxEngine& engine, int partIdx, int paramId, float value) noexcept
{
    applyWebPartParam(engine, partIdx, paramId, value);
}

} // namespace abdmcx
