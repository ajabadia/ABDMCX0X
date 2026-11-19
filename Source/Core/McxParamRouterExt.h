#pragma once

#include "../DSP/Core/McxEngine.h"
#include "../Sequencer/McxPatternSequencer.h"

#include <algorithm>
#include <cstdint>

namespace abdmcx
{

inline void applyWebPartParamExt(McxEngine& engine, int partIdx, int paramId, float value) noexcept
{
    auto& p = engine.part(partIdx);
    switch (paramId)
    {
    case 68: p.lfo1Shape = static_cast<std::uint8_t>(std::clamp(static_cast<int>(value), 0, 7)); break;
    case 69: p.lfo1Sync = (value >= 0.5f); break;
    case 70: p.lfo1Trigger = static_cast<std::uint8_t>(std::clamp(static_cast<int>(value), 0, 2)); break;
    case 71: p.lfo1Rate = std::clamp(value, 0.01f, 1280.0f); break;
    case 72: p.lfo1DelayMs = std::clamp(value, 0.0f, 5000.0f); break;
    case 73: p.lfo1Depth = std::clamp(value, -1.0f, 1.0f); break;
    case 74: p.lfo1Target = static_cast<std::uint8_t>(std::clamp(static_cast<int>(value), 0, 5)); break;
    case 75: p.lfo2Shape = static_cast<std::uint8_t>(std::clamp(static_cast<int>(value), 0, 7)); break;
    case 76: p.lfo2Sync = (value >= 0.5f); break;
    case 77: p.lfo2Trigger = static_cast<std::uint8_t>(std::clamp(static_cast<int>(value), 0, 2)); break;
    case 78: p.lfo2Rate = std::clamp(value, 0.01f, 1280.0f); break;
    case 79: p.lfo2DelayMs = std::clamp(value, 0.0f, 5000.0f); break;
    case 80: p.lfo2Depth = std::clamp(value, -1.0f, 1.0f); break;
    case 81: p.lfo2Target = static_cast<std::uint8_t>(std::clamp(static_cast<int>(value), 0, 5)); break;
    case 82: p.semanticOffsets.cutoffOctaves = std::clamp(value, -1.0f, 1.0f); break;
    case 83: p.semanticOffsets.resonance = std::clamp(value, -1.0f, 1.0f); break;
    case 84: p.semanticOffsets.envAttack = std::clamp(value, -1.0f, 1.0f); break;
    case 85: p.semanticOffsets.envDecay = std::clamp(value, -1.0f, 1.0f); break;
    case 86: p.semanticOffsets.envSustain = std::clamp(value, -1.0f, 1.0f); break;
    case 87: p.semanticOffsets.envRelease = std::clamp(value, -1.0f, 1.0f); break;
    case 88: p.semanticOffsets.vibratoDepth = std::clamp(value, -1.0f, 1.0f); break;
    case 89: p.midiPortIndex = static_cast<std::uint8_t>(std::clamp(static_cast<int>(value), 0, 7)); break;
    case 90: engine.sequencer().setPartSwing50to75(partIdx, value); break;
    case 91: engine.setSequencerPlaying(value >= 0.5f, true); break;
    case 92: engine.sequencer().setBars(static_cast<int>(value)); break;
    case 93: engine.midiClock().setEnabled(value >= 0.5f); break;
    case 94: engine.sequencer().setRecording(value >= 0.5f); break;
    case 95: (void)engine.selectPartEngineType(partIdx, static_cast<int>(value)); break;
    case 96: (void)engine.loadPartFactoryPreset(partIdx, static_cast<int>(value)); break;
    case 97: p.driveType = static_cast<std::uint8_t>(std::clamp(static_cast<int>(value), 0, 3)); break;
    case 98: p.arp.setMotif(static_cast<abd::synth::GrooveArpMotif>(std::clamp(static_cast<int>(value), 0, 11))); break;
    case 99: p.arp.setSyncResolution(std::clamp(static_cast<int>(value), 0, 15)); break;
    case 100: p.arp.setOctaveRange(std::clamp(static_cast<int>(value), 1, 6)); break;
    case 101: p.arp.setGateTime(std::clamp(value, 0.05f, 1.0f)); break;
    case 102: p.arp.setSwingPercent(std::clamp((value - 0.5f) / 0.25f, -1.0f, 1.0f) * 100.0f); break;
    case 103: p.arp.setLatchMode(static_cast<abd::synth::GrooveLatchMode>(std::clamp(static_cast<int>(value), 0, 2))); break;
    default: break;
    }
}

} // namespace abdmcx
