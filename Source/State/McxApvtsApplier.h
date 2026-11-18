#pragma once

#include "../DSP/Core/McxEngine.h"
#include "Conversion.gen.h"
#include "ParameterRegistry.gen.h"

#include <algorithm>
#include <atomic>
#include <cstdint>

namespace abdmcx
{

/**
 * @brief Lock-free, JUCE-free APVTS parameter index applier for McxEngine.
 * Shared cleanly between direct audio-thread automation and UI command drainage.
 */
inline void applyApvtsParamIndex(McxEngine& engine,
                                 std::atomic<std::uint32_t>& focusedPartIndex,
                                 std::uint32_t paramIdx,
                                 float value) noexcept
{
    if (paramIdx == ParamIdx::FocusedPartIndex)
    {
        const auto clamped = static_cast<std::uint32_t>(std::clamp(static_cast<int>(value), 0, McxEngine::kNumParts - 1));
        focusedPartIndex.store(clamped, std::memory_order_relaxed);
        engine.setFocusedPart(static_cast<int>(clamped));
        return;
    }
    if (paramIdx == ParamIdx::MasterVolumeDb) { engine.setMasterVolume(dbToGain(value)); return; }
    if (paramIdx == ParamIdx::OutputCharacter) { engine.setOutputCharacter(static_cast<McxOutputCharacter>(static_cast<int>(value))); return; }
    if (paramIdx == ParamIdx::PartialBudgetMode)
    {
        const int idx = static_cast<int>(value);
        engine.setPartialBudget(idx == 1 ? 28 : (idx == 2 ? 64 : (idx == 3 ? 32 : 128)));
        return;
    }
    if (paramIdx == ParamIdx::MachinePersona) { engine.setMachinePersona(static_cast<McxMachinePersona>(static_cast<int>(value))); return; }
    if (paramIdx == ParamIdx::PolyphonyVoices) { engine.setMaxPolyphony(static_cast<int>(value)); return; }

    auto& p = engine.part(static_cast<int>(focusedPartIndex.load(std::memory_order_relaxed)));
    switch (paramIdx)
    {
        case ParamIdx::PartRouteMode: p.routeMode = static_cast<McxPartRouteMode>(std::clamp(static_cast<int>(value), 0, 2)); break;
        case ParamIdx::PartLevel: p.level = std::clamp(value, 0.0f, 1.0f); break;
        case ParamIdx::PartPan: p.pan = std::clamp(value, -1.0f, 1.0f); break;
        case ParamIdx::PartFilterModel:
            p.filterModel = static_cast<McxFilterModel>(std::clamp(static_cast<int>(value), 0, 5));
            for (auto& partial : p.partials) partial.filterModel = p.filterModel;
            break;
        case ParamIdx::TvfCutoffOffset: p.semanticOffsets.cutoffOctaves = std::clamp(value / 50.0f, -1.0f, 1.0f); break;
        case ParamIdx::TvfResonanceOffset: p.semanticOffsets.resonance = std::clamp(value / 50.0f, -1.0f, 1.0f); break;
        case ParamIdx::ZplaneMorph: for (auto& partial : p.partials) partial.zplaneMorph = value; break;
        case ParamIdx::EnvAttackOffset: p.semanticOffsets.envAttack = std::clamp(value / 50.0f, -1.0f, 1.0f); break;
        case ParamIdx::EnvDecayOffset: p.semanticOffsets.envDecay = std::clamp(value / 50.0f, -1.0f, 1.0f); break;
        case ParamIdx::EnvReleaseOffset: p.semanticOffsets.envRelease = std::clamp(value / 50.0f, -1.0f, 1.0f); break;
        case ParamIdx::PartReverbSend: p.reverbSend = std::clamp(value * 0.01f, 0.0f, 1.0f); break;
        case ParamIdx::PartChorusSend: p.chorusSend = std::clamp(value * 0.01f, 0.0f, 1.0f); break;
        case ParamIdx::PartDrive:
            p.driveAmount = std::clamp(value * 0.01f, 0.0f, 1.0f);
            p.driveEnabled = (p.driveAmount > 0.005f);
            break;
        case ParamIdx::VectorX: p.vectorX = std::clamp(value, -1.0f, 1.0f); break;
        case ParamIdx::VectorY: p.vectorY = std::clamp(value, -1.0f, 1.0f); break;
        case ParamIdx::DrumMapMode: p.drumMapMode = static_cast<McxDrumMapMode>(static_cast<int>(value)); break;
        default: break;
    }
}

} // namespace abdmcx
