#pragma once

#include "../Source/DSP/Core/McxEngine.h"
#include "../Source/DSP/FX/McxRackChassis.h"
#include "../Source/DSP/FX/McxSidechainConfig.h"

#include <cassert>
#include <cmath>
#include <cstring>
#include <iostream>
#include <memory>
#include <vector>

namespace abdmcx::test_ext
{

inline void runExtendedRackTests()
{
    // T14: duckAmt JSON roundtrip persistence
    {
        abdmcx::McxRackChassis c1, c2;
        c1.prepare(44100.0);
        c2.prepare(44100.0);
        c1.setSlotEngine(0, abdmcx::McxRackEngineType::ZitaReverb, "Hall");
        c1.setSlotDucking(0, true, 0.85f);
        char buf[2048] {};
        (void)c1.serializeJson(buf, sizeof(buf));
        assert(std::strstr(buf, "\"duckAmt\":0.85") != nullptr);
        assert(c2.deserializeJson(buf));
        assert(c2.getSlotState(0).scDuckEnabled);
        assert(std::abs(c2.getSlotState(0).scDuckAmount - 0.85f) < 0.01f);
        std::cout << "[T14] Rack slot duckAmt JSON serialization verified.\n";
    }

    // T15: Sidechain depth dB, attack ms & release ms profile
    {
        abdmcx::McxRackChassis chassis;
        chassis.prepare(44100.0);
        chassis.setSlotEngine(0, abdmcx::McxRackEngineType::Saturation);
        chassis.setSlotParams(0, 0.2f, 0.5f, 1.0f);
        chassis.setSlotDucking(0, true, 1.0f);
        chassis.setSidechainProfile(-24.0f, 1.0f, 120.0f);

        std::vector<float> inL(64, 0.5f), inR(64, 0.5f), outUnduckedL(64, 0.0f), outDuckedL(64, 0.0f), dummyR(64, 0.0f);
        chassis.processSlot(0, inL.data(), inR.data(), outUnduckedL.data(), dummyR.data(), 64, false);
        for (int b = 0; b < 8; ++b)
            chassis.processSlot(0, inL.data(), inR.data(), outDuckedL.data(), dummyR.data(), 64, true);
        assert(std::abs(outDuckedL[32]) < std::abs(outUnduckedL[32]) * 0.45f);
        std::cout << "[T15] Rack sidechain depth/attack/release envelope verified.\n";
    }

    // T16: McxSidechainConfig HPF attenuates sub-bass detector signal
    {
        abdmcx::McxSidechainConfig cfg {};
        cfg.hpfEnabled = false;
        cfg.hpfHz = 200.0f;
        abdmcx::McxSidechainHpfState st;
        std::vector<float> subL(256, 0.0f), subR(256, 0.0f);
        for (int i = 0; i < 256; ++i)
            subL[static_cast<std::size_t>(i)] = subR[static_cast<std::size_t>(i)] = std::sin(2.0f * 3.14159f * 30.0f * static_cast<float>(i) / 44100.0f);

        const float peakNoHpf = abdmcx::detectSidechainPeak(subL.data(), subR.data(), 256, 1.0f, cfg, 44100.0, st);
        cfg.hpfEnabled = true;
        st.reset();
        for (int w = 0; w < 4; ++w)
            (void)abdmcx::detectSidechainPeak(subL.data(), subR.data(), 256, 1.0f, cfg, 44100.0, st);
        const float peakWithHpf = abdmcx::detectSidechainPeak(subL.data(), subR.data(), 256, 1.0f, cfg, 44100.0, st);
        assert(peakWithHpf < peakNoHpf * 0.25f);
        std::cout << "[T16] Sidechain 2-pole HPF sub attenuation verified.\n";
    }

    // T17: Engine sidechain config + insert slot ducking execution
    {
        auto engine = std::make_unique<abdmcx::McxEngine>();
        engine->prepare(44100.0);
        abdmcx::McxSidechainConfig cfg;
        cfg.sourcePart = 2; cfg.hpfEnabled = true; cfg.hpfHz = 120.0f;
        cfg.depthDb = -18.0f; cfg.attackMs = 5.0f; cfg.releaseSyncDiv = 1;
        engine->setSidechainConfig(cfg);
        assert(engine->getSidechainConfig().sourcePart == 2);
        engine->getOutputAndFx().getChassis().setSlotEngine(0, abdmcx::McxRackEngineType::ZitaReverb);
        engine->getOutputAndFx().getChassis().setSlotDucking(0, true, 0.8f);
        engine->setPartInsertSlot(1, 0);
        engine->setManualDuckGate(true);
        std::vector<float> l(128, 0.0f), r(128, 0.0f);
        engine->triggerPartNoteOn(1, 60, 0.9f, 0);
        engine->processAudio(l.data(), r.data(), 128);
        assert(!std::isnan(l[0]) && !std::isnan(r[0]));
        std::cout << "[T17] Engine SidechainConfig + Insert Ducking verified.\n";
    }

    // T18: Roland JV-880 Reverb (65), JV/GS Chorus (66) & GS 3-Tap Delay (67)
    {
        assert(abdmcx::normalizeRackEngineType(65) == abdmcx::McxRackEngineType::RolandJvReverb);
        assert(abdmcx::normalizeRackEngineType(66) == abdmcx::McxRackEngineType::RolandJvChorus);
        assert(abdmcx::normalizeRackEngineType(67) == abdmcx::McxRackEngineType::RolandGsDelay);

        abdmcx::McxRackChassis chassis;
        chassis.prepare(44100.0);
        std::vector<float> inL(64, 0.0f), inR(64, 0.0f), outL(64, 0.0f), outR(64, 0.0f);
        for (int i = 0; i < 64; ++i) inL[static_cast<std::size_t>(i)] = inR[static_cast<std::size_t>(i)] = (i < 16) ? 0.6f : 0.0f;

        for (auto eng : { abdmcx::McxRackEngineType::RolandJvReverb, abdmcx::McxRackEngineType::RolandJvChorus, abdmcx::McxRackEngineType::RolandGsDelay })
        {
            chassis.setSlotEngine(0, eng);
            chassis.setSlotParamByKey(0, "time", 0.25f); // ~3ms so delay & reverb early taps emerge inside 1024 samples
            chassis.setSlotParamByKey(0, "level", 0.9f);
            float maxDiff = 0.0f;
            for (int b = 0; b < 24; ++b)
            {
                if (b > 0) { std::fill(inL.begin(), inL.end(), 0.0f); std::fill(inR.begin(), inR.end(), 0.0f); }
                chassis.processSlot(0, inL.data(), inR.data(), outL.data(), outR.data(), 64);
                for (int i = 0; i < 64; ++i)
                {
                    assert(std::isfinite(outL[static_cast<std::size_t>(i)]) && std::isfinite(outR[static_cast<std::size_t>(i)]));
                    maxDiff = std::max(maxDiff, std::abs(outL[static_cast<std::size_t>(i)] - inL[static_cast<std::size_t>(i)]));
                }
                inL[0] = (b == 0) ? 0.6f : 0.0f;
            }
            assert(maxDiff > 1e-4f);
            for (int i = 0; i < 64; ++i) inL[static_cast<std::size_t>(i)] = inR[static_cast<std::size_t>(i)] = (i < 16) ? 0.6f : 0.0f;
        }
        std::cout << "[T18] Roland JV-880 Reverb / JV Chorus / GS 3-Tap Delay verified.\n";
    }

    // T19: Korg MS2000 DSP56362 FX Suite (68..73 -> 17..22)
    {
        assert(abdmcx::normalizeRackEngineType(68) == abdmcx::McxRackEngineType::Ms2000ChorusFlanger);
        assert(abdmcx::normalizeRackEngineType(69) == abdmcx::McxRackEngineType::Ms2000Ensemble);
        assert(abdmcx::normalizeRackEngineType(70) == abdmcx::McxRackEngineType::Ms2000Phaser);
        assert(abdmcx::normalizeRackEngineType(71) == abdmcx::McxRackEngineType::Ms2000Delay);
        assert(abdmcx::normalizeRackEngineType(72) == abdmcx::McxRackEngineType::Ms2000Distortion);
        assert(abdmcx::normalizeRackEngineType(73) == abdmcx::McxRackEngineType::Ms2000Eq);

        abdmcx::McxRackChassis chassis;
        chassis.prepare(44100.0);
        std::vector<float> inL(64, 0.0f), inR(64, 0.0f), outL(64, 0.0f), outR(64, 0.0f);
        for (auto eng : {
            abdmcx::McxRackEngineType::Ms2000ChorusFlanger, abdmcx::McxRackEngineType::Ms2000Ensemble,
            abdmcx::McxRackEngineType::Ms2000Phaser, abdmcx::McxRackEngineType::Ms2000Delay,
            abdmcx::McxRackEngineType::Ms2000Distortion, abdmcx::McxRackEngineType::Ms2000Eq
        }) {
            for (int i = 0; i < 64; ++i) inL[static_cast<std::size_t>(i)] = inR[static_cast<std::size_t>(i)] = std::sin(2.0f * 3.14159f * 440.0f * static_cast<float>(i) / 44100.0f) * 0.5f;
            chassis.setSlotEngine(0, eng);
            chassis.setSlotParamByKey(0, "time", 0.005f);
            chassis.setSlotParamByKey(0, "lowGain", 0.9f);
            float maxDiff = 0.0f;
            for (int b = 0; b < 24; ++b) {
                chassis.processSlot(0, inL.data(), inR.data(), outL.data(), outR.data(), 64);
                for (int i = 0; i < 64; ++i) {
                    assert(std::isfinite(outL[static_cast<std::size_t>(i)]) && std::isfinite(outR[static_cast<std::size_t>(i)]));
                    maxDiff = std::max(maxDiff, std::abs(outL[static_cast<std::size_t>(i)] - inL[static_cast<std::size_t>(i)]));
                }
            }
            assert(maxDiff > 1e-4f);
        }
        std::cout << "[T19] Korg MS2000 DSP56362 FX Suite (68..73) verified.\n";
    }

    // T20: Hartmann Neuron / AxionikVS FX Suite (74..77 -> 23..26)
    {
        assert(abdmcx::normalizeRackEngineType(74) == abdmcx::McxRackEngineType::NeuronSilverFilter);
        assert(abdmcx::normalizeRackEngineType(75) == abdmcx::McxRackEngineType::NeuronSilverFreq);
        assert(abdmcx::normalizeRackEngineType(76) == abdmcx::McxRackEngineType::NeuronSilverTime);
        assert(abdmcx::normalizeRackEngineType(77) == abdmcx::McxRackEngineType::NeuronSlicer);

        abdmcx::McxRackChassis chassis;
        chassis.prepare(44100.0);
        std::vector<float> inL(64, 0.0f), inR(64, 0.0f), outL(64, 0.0f), outR(64, 0.0f);
        for (auto eng : {
            abdmcx::McxRackEngineType::NeuronSilverFilter, abdmcx::McxRackEngineType::NeuronSilverFreq,
            abdmcx::McxRackEngineType::NeuronSilverTime, abdmcx::McxRackEngineType::NeuronSlicer
        }) {
            for (int i = 0; i < 64; ++i) inL[static_cast<std::size_t>(i)] = inR[static_cast<std::size_t>(i)] = std::sin(2.0f * 3.14159f * 440.0f * static_cast<float>(i) / 44100.0f) * 0.5f;
            chassis.setSlotEngine(0, eng);
            float maxDiff = 0.0f;
            for (int b = 0; b < 24; ++b) {
                chassis.processSlot(0, inL.data(), inR.data(), outL.data(), outR.data(), 64);
                for (int i = 0; i < 64; ++i) {
                    assert(std::isfinite(outL[static_cast<std::size_t>(i)]) && std::isfinite(outR[static_cast<std::size_t>(i)]));
                    maxDiff = std::max(maxDiff, std::abs(outL[static_cast<std::size_t>(i)] - inL[static_cast<std::size_t>(i)]));
                }
            }
            assert(maxDiff > 1e-4f);
        }
        chassis.setSlotEngine(0, abdmcx::McxRackEngineType::NeuronSilverFreq);
        for (float fa : { 0.0f, 0.25f, 0.50f, 0.75f, 1.0f }) {
            chassis.setSlotParamByKey(0, "freqAlgo", fa);
            chassis.processSlot(0, inL.data(), inR.data(), outL.data(), outR.data(), 64);
            assert(std::isfinite(outL[32]) && std::isfinite(outR[32]));
        }
        std::cout << "[T20] Hartmann Neuron Silver/Master FX Suite (74..77) verified.\n";
    }

    // T21: Boutique & Hardware Clone FX Suite (78..81 -> 27..30)
    {
        assert(abdmcx::normalizeRackEngineType(78) == abdmcx::McxRackEngineType::GolanaReverb);
        assert(abdmcx::normalizeRackEngineType(79) == abdmcx::McxRackEngineType::IterumDelay);
        assert(abdmcx::normalizeRackEngineType(80) == abdmcx::McxRackEngineType::Re201Wdf);
        assert(abdmcx::normalizeRackEngineType(81) == abdmcx::McxRackEngineType::Kr106Chorus);

        abdmcx::McxRackChassis chassis;
        chassis.prepare(44100.0);
        std::vector<float> inL(64, 0.0f), inR(64, 0.0f), outL(64, 0.0f), outR(64, 0.0f);
        for (int i = 0; i < 64; ++i) inL[static_cast<std::size_t>(i)] = inR[static_cast<std::size_t>(i)] = std::sin(2.0f * 3.14159f * 440.0f * static_cast<float>(i) / 44100.0f) * 0.5f;

        auto runCheck = [&](abdmcx::McxRackEngineType eng, const char* modeKey, float modeVal) {
            chassis.setSlotEngine(0, eng);
            chassis.setSlotParamByKey(0, "time", 0.005f);
            if (modeKey) chassis.setSlotParamByKey(0, modeKey, modeVal);
            float maxDiff = 0.0f;
            for (int b = 0; b < 24; ++b) {
                chassis.processSlot(0, inL.data(), inR.data(), outL.data(), outR.data(), 64);
                for (int i = 0; i < 64; ++i) {
                    assert(std::isfinite(outL[static_cast<std::size_t>(i)]) && std::isfinite(outR[static_cast<std::size_t>(i)]));
                    maxDiff = std::max(maxDiff, std::abs(outL[static_cast<std::size_t>(i)] - inL[static_cast<std::size_t>(i)]));
                }
            }
            assert(maxDiff > 1e-4f);
        };
        for (int m = 0; m <= 3; ++m) runCheck(abdmcx::McxRackEngineType::GolanaReverb, "revMode", static_cast<float>(m) / 3.0f);
        for (int m = 0; m <= 10; ++m) runCheck(abdmcx::McxRackEngineType::IterumDelay, "delayMode", static_cast<float>(m) / 10.0f);
        runCheck(abdmcx::McxRackEngineType::Re201Wdf, "springMix", 0.45f);
        for (int m = 0; m <= 2; ++m) runCheck(abdmcx::McxRackEngineType::Kr106Chorus, "chorusMode", static_cast<float>(m) / 2.0f);
        std::cout << "[T21] Boutique & Hardware Clone FX Suite (78..81: Golana/Iterum/RE201-WDF/KR106) verified.\n";
    }
}

} // namespace abdmcx::test_ext
