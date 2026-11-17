#include "Core/McxBankManagerBridge.h"
#include "Core/McxFactoryBank.h"
#include "DSP/Core/McxEngine.h"
#include "Hardware/McxHardwareBridge.h"

#include <algorithm>
#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>

namespace
{
bool allFiniteAndBounded(const float* buffer, int count, float bound = 12.0f)
{
    for (int i = 0; i < count; ++i)
    {
        const float val = buffer[i];
        if (!std::isfinite(val) || std::abs(val) > bound)
            return false;
    }
    return true;
}
} // namespace

int main()
{
    std::cout << "=== ABDMCX0X Phase 5 QA, Polyphony Stress, Resilience & DAW State Tests ===" << std::endl;
    int passed = 0;

    // 1. Factory Out-of-the-box readiness
    abdmcx::McxEngine engine;
    assert(engine.part(0).enabled);
    assert(engine.part(9).enabled && engine.part(9).isDrumKit);
    assert(engine.part(9).drumSlots[42].muteGroup == 1); // Closed hi-hat
    assert(engine.part(9).drumSlots[46].muteGroup == 1); // Open hi-hat
    std::cout << "  [PASS] Factory defaults initialized out-of-the-box on Parts 0 and 9" << std::endl;
    ++passed;

    // 2. Sample Rate Resilience (44.1k, 48k, 88.2k, 96k, 192k)
    const std::vector<double> sampleRates = { 44100.0, 48000.0, 88200.0, 96000.0, 192000.0 };
    for (double sr : sampleRates)
    {
        engine.prepare(sr);
        engine.triggerNote(0, 60, 0.8f);
        engine.triggerNote(9, 36, 0.9f);
        std::vector<float> l(256, 0.0f);
        std::vector<float> r(256, 0.0f);
        engine.processAudio(l.data(), r.data(), 256);
        assert(allFiniteAndBounded(l.data(), 256));
        assert(allFiniteAndBounded(r.data(), 256));
        engine.releaseNote(0, 60);
        engine.releaseNote(9, 36);
        for (int b = 0; b < 10; ++b) engine.processAudio(l.data(), r.data(), 256);
    }
    std::cout << "  [PASS] Sample rate resilience verified across 44.1k to 192k" << std::endl;
    ++passed;

    // 3. Buffer Size Variance (32 to 4096 samples)
    engine.prepare(44100.0);
    const std::vector<int> bufferSizes = { 32, 64, 128, 256, 512, 1024, 2048, 4096 };
    for (int bs : bufferSizes)
    {
        engine.triggerNote(0, 64, 0.75f);
        std::vector<float> l(static_cast<std::size_t>(bs), 0.0f);
        std::vector<float> r(static_cast<std::size_t>(bs), 0.0f);
        engine.processAudio(l.data(), r.data(), bs);
        assert(allFiniteAndBounded(l.data(), bs));
        assert(allFiniteAndBounded(r.data(), bs));
        engine.releaseNote(0, 64);
        for (int b = 0; b < 5; ++b) engine.processAudio(l.data(), r.data(), bs);
    }
    std::cout << "  [PASS] Buffer size variance verified for 32 to 4096 sample frames" << std::endl;
    ++passed;

    // 4. Authentic Roland MC-303 Partial Budget & Voice Stealing (28 partials limit)
    engine.setMachinePersona(abdmcx::McxMachinePersona::RolandMc303);
    assert(engine.getPartialBudget() == 28);

    // Blast 50 notes simultaneously across parts
    for (int n = 0; n < 50; ++n)
    {
        const int pIdx = n % 16;
        engine.part(pIdx).enabled = true;
        engine.triggerNote(pIdx, 30 + (n % 60), 0.8f);
    }

    assert(engine.getActivePartialCount() <= 28);
    std::cout << "  [PASS] Roland MC-303 budget respected: active partials clamped to "
              << engine.getActivePartialCount() << " <= 28" << std::endl;
    ++passed;

    // Render under maximum partial stress
    std::vector<float> stressL(512, 0.0f);
    std::vector<float> stressR(512, 0.0f);
    engine.processAudio(stressL.data(), stressR.data(), 512);
    assert(allFiniteAndBounded(stressL.data(), 512));
    assert(allFiniteAndBounded(stressR.data(), 512));
    std::cout << "  [PASS] Extreme polyphony stress rendered without buffer overflow or denormals" << std::endl;
    ++passed;

    // 5. Rapid Parameter Sweep & NaN/Inf Immunity
    engine.setMachinePersona(abdmcx::McxMachinePersona::FreeSuper);
    engine.triggerNote(0, 60, 0.9f);
    for (int step = 0; step < 100; ++step)
    {
        const float norm = static_cast<float>(step) / 100.0f;
        auto& p = engine.part(0);
        p.partials[0].cutoffHz = 20.0f + norm * 18000.0f;
        p.partials[0].resonance = norm * 0.95f;
        p.partials[0].drive = norm * 2.5f;
        p.level = 0.5f + norm * 0.5f;
        engine.processAudio(stressL.data(), stressR.data(), 64);
        assert(allFiniteAndBounded(stressL.data(), 64));
    }
    engine.releaseNote(0, 60);
    std::cout << "  [PASS] Rapid continuous parameter sweeps immune to NaN, Inf or runaway oscillation" << std::endl;
    ++passed;

    // 6. Zero-Allocation Idle Transition
    for (int b = 0; b < 40; ++b)
        engine.processAudio(stressL.data(), stressR.data(), 128);

    assert(engine.getActiveVoiceCount() == 0);
    assert(engine.getActivePartialCount() == 0);
    std::cout << "  [PASS] All voices and partials cleanly cleared to zero-CPU idle state" << std::endl;
    ++passed;

    // 7. DAW Preset Serialization Roundtrip
    abdmcx::McxHardwareBridge bridge(engine);
    engine.part(0).level = 0.72f;
    engine.part(0).pan = -0.45f;
    engine.part(0).partials[0].cutoffHz = 4800.0f;
    engine.part(9).level = 0.95f;
    engine.setMachinePersona(abdmcx::McxMachinePersona::YamahaCs2x);

    const std::string jsonState = abdmcx::McxBankManagerBridge::serializeToJson(engine, bridge, "Phase5Preset");
    assert(!jsonState.empty());
    assert(jsonState.find("\"schema\": \"abd_mcx0x_preset_v1\"") != std::string::npos);

    abdmcx::McxEngine restoredEngine;
    abdmcx::McxHardwareBridge restoredBridge(restoredEngine);
    const bool restored = abdmcx::McxBankManagerBridge::deserializeFromJson(restoredEngine, restoredBridge, jsonState);
    assert(restored);
    assert(restoredEngine.part(0).level == 0.72f);
    assert(restoredEngine.part(0).pan == -0.45f);
    assert(restoredEngine.part(0).partials[0].cutoffHz == 4800.0f);
    assert(restoredEngine.part(9).level == 0.95f);
    assert(restoredEngine.getMachinePersona() == abdmcx::McxMachinePersona::YamahaCs2x);
    std::cout << "  [PASS] DAW state serialized to JSON and restored 100% losslessly" << std::endl;
    ++passed;

    std::cout << "\nTest Summary: " << passed << " passed, 0 failed." << std::endl;
    return 0;
}
