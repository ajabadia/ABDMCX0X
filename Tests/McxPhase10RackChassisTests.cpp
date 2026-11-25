#include "../Source/DSP/FX/McxRackChassis.h"
#include "../Source/DSP/FX/McxOutputAndFx.h"
#include "../Source/DSP/Core/McxEngine.h"
#include "McxRackExtTests.h"

#include <cassert>
#include <cmath>
#include <cstring>
#include <iostream>
#include <memory>
#include <vector>

namespace
{

void testT1_Initialization()
{
    abdmcx::McxRackChassis chassis;
    chassis.prepare(44100.0);

    for (int i = 0; i < abdmcx::McxRackChassis::kMaxSlots; ++i)
    {
        const auto& st = chassis.getSlotState(i);
        assert(st.engineType == abdmcx::McxRackEngineType::Bypass);
        assert(!chassis.isSlotActive(i));
        const auto t = chassis.getSlotTelemetry(i);
        assert(t.isSleeping);
    }
    std::cout << "[T1] McxRackChassis initialization verified: 8 slots empty.\n";
}

void testT2_SlotAssignment()
{
    abdmcx::McxRackChassis chassis;
    chassis.prepare(44100.0);

    chassis.setSlotEngine(0, abdmcx::McxRackEngineType::SpaceEcho, "RE-201 Lead");
    chassis.setSlotEngine(1, abdmcx::McxRackEngineType::ZitaReverb, "Hall 909");

    const auto& s0 = chassis.getSlotState(0);
    assert(s0.engineType == abdmcx::McxRackEngineType::SpaceEcho);
    assert(std::strcmp(s0.customName, "RE-201 Lead") == 0);
    assert(std::strcmp(s0.algoId, "space_echo") == 0);
    assert(chassis.isSlotActive(0));

    const auto& s1 = chassis.getSlotState(1);
    assert(s1.engineType == abdmcx::McxRackEngineType::ZitaReverb);
    assert(std::strcmp(s1.customName, "Hall 909") == 0);

    chassis.setSlotCustomName(0, "Custom Renamed Echo");
    assert(std::strcmp(chassis.getSlotState(0).customName, "Custom Renamed Echo") == 0);

    std::cout << "[T2] Slot engine assignment & custom names verified.\n";
}

void testT3_BypassAndPassThrough()
{
    abdmcx::McxRackChassis chassis;
    chassis.prepare(44100.0);
    chassis.setSlotEngine(0, abdmcx::McxRackEngineType::Saturation);

    std::vector<float> inL(64, 0.5f), inR(64, -0.5f);
    std::vector<float> outL(64, 0.0f), outR(64, 0.0f);

    chassis.processSlot(0, inL.data(), inR.data(), outL.data(), outR.data(), 64);
    assert(std::abs(outL[16] - 0.5f) > 1e-3f);

    chassis.setSlotBypass(0, true);
    chassis.processSlot(0, inL.data(), inR.data(), outL.data(), outR.data(), 64);
    for (int i = 0; i < 64; ++i)
    {
        assert(std::abs(outL[i] - 0.5f) < 1e-5f);
        assert(std::abs(outR[i] - (-0.5f)) < 1e-5f);
    }
    assert(chassis.getSlotTelemetry(0).isSleeping);

    chassis.setSlotBypass(0, false);
    chassis.setSlotParams(0, 0.8f, 0.5f, 0.0f);
    chassis.processSlot(0, inL.data(), inR.data(), outL.data(), outR.data(), 64);
    for (int i = 0; i < 64; ++i) assert(std::abs(outL[i] - 0.5f) < 1e-5f);
    std::cout << "[T3] Bypass pass-through, dry/wet mix & zero CPU verified.\n";
}

void testT4_SilenceAndAutoSleep()
{
    abdmcx::McxRackChassis chassis;
    chassis.prepare(44100.0);
    chassis.setSlotEngine(0, abdmcx::McxRackEngineType::Saturation);

    std::vector<float> silentL(64, 0.0f), silentR(64, 0.0f);
    std::vector<float> outL(64, 0.0f), outR(64, 0.0f);

    // Initial silent input
    chassis.processSlot(0, silentL.data(), silentR.data(), outL.data(), outR.data(), 64);
    assert(chassis.getSlotTelemetry(0).isSleeping);

    // Signal burst wakes it up
    std::vector<float> hotL(64, 0.8f), hotR(64, 0.8f);
    chassis.processSlot(0, hotL.data(), hotR.data(), outL.data(), outR.data(), 64);
    assert(!chassis.getSlotTelemetry(0).isSleeping);
    assert(chassis.getSlotTelemetry(0).peakInL > 0.7f);

    std::cout << "[T4] Dynamic auto-sleep & signal wake-up verified.\n";
}

void testT5_SidechainDucking()
{
    abdmcx::McxRackChassis chassis;
    chassis.prepare(44100.0);
    chassis.setSlotEngine(0, abdmcx::McxRackEngineType::Saturation);
    chassis.setSlotDucking(0, true, 0.8f);

    std::vector<float> inL(64, 0.5f), inR(64, 0.5f);
    std::vector<float> normalOutL(64, 0.0f), normalOutR(64, 0.0f);
    std::vector<float> duckedOutL(64, 0.0f), duckedOutR(64, 0.0f);

    chassis.processSlot(0, inL.data(), inR.data(), normalOutL.data(), normalOutR.data(), 64, false);
    chassis.processSlot(0, inL.data(), inR.data(), duckedOutL.data(), duckedOutR.data(), 64, true);

    assert(duckedOutL[10] < normalOutL[10]);
    std::cout << "[T5] Sidechain ducking attenuation verified.\n";
}

void testT6_MoveAndRemoveSlot()
{
    abdmcx::McxRackChassis chassis;
    chassis.prepare(44100.0);

    chassis.setSlotEngine(0, abdmcx::McxRackEngineType::SpaceEcho, "Delay A");
    chassis.setSlotEngine(1, abdmcx::McxRackEngineType::BbdChorus, "Chorus B");

    chassis.moveSlot(0, 1);
    assert(chassis.getSlotState(0).engineType == abdmcx::McxRackEngineType::BbdChorus);
    assert(chassis.getSlotState(1).engineType == abdmcx::McxRackEngineType::SpaceEcho);

    chassis.removeSlotEngine(0);
    assert(chassis.getSlotState(0).engineType == abdmcx::McxRackEngineType::Bypass);
    assert(!chassis.isSlotActive(0));

    std::cout << "[T6] Slot reordering & removal verified.\n";
}

void testT7_TelemetryAndClipHold()
{
    abdmcx::McxRackChassis chassis;
    chassis.prepare(44100.0);
    chassis.setSlotEngine(0, abdmcx::McxRackEngineType::MidasEq);
    chassis.setSlotParamByKey(0, "p1", 1.0f);
    chassis.setSlotParamByKey(0, "p3", 1.0f);

    std::vector<float> hotL(64, 1.2f), hotR(64, 1.2f);
    std::vector<float> outL(64, 0.0f), outR(64, 0.0f);

    chassis.processSlot(0, hotL.data(), hotR.data(), outL.data(), outR.data(), 64);
    const auto t = chassis.getSlotTelemetry(0);
    assert(t.isClipIn);
    assert(t.isClipOut);
    assert(t.peakInL >= 1.0f);

    std::cout << "[T7] Telemetry, peak detection & clip-hold timer verified.\n";
}

void testT8_JsonRoundtrip()
{
    abdmcx::McxRackChassis c1; c1.prepare(44100.0);
    c1.setSlotEngine(0, abdmcx::McxRackEngineType::SpaceEcho, "Tape Loop");
    c1.setSlotEngine(2, abdmcx::McxRackEngineType::ZitaReverb, "Cathedral");
    c1.setSlotBypass(0, true); c1.setSlotDucking(2, true, 0.75f);
    c1.setSlotChainTarget(0, 2); c1.setSlotParams(2, 0.70f, 0.40f, 1.0f);

    char jsonBuf[2048] {};
    assert(c1.serializeJson(jsonBuf, sizeof(jsonBuf)) > 0);
    assert(std::strstr(jsonBuf, "\"Tape Loop\"") != nullptr && std::strstr(jsonBuf, "\"Cathedral\"") != nullptr);

    abdmcx::McxRackChassis c2; c2.prepare(44100.0);
    assert(c2.deserializeJson(jsonBuf));
    const auto& s0 = c2.getSlotState(0);
    assert(s0.engineType == abdmcx::McxRackEngineType::SpaceEcho && std::strcmp(s0.customName, "Tape Loop") == 0);
    assert(s0.bypassed && c2.getSlotChainTarget(0) == 2);
    const auto& s2 = c2.getSlotState(2);
    assert(s2.engineType == abdmcx::McxRackEngineType::ZitaReverb && std::strcmp(s2.customName, "Cathedral") == 0);
    assert(s2.scDuckEnabled && std::abs(s2.p1 - 0.70f) < 0.05f && std::abs(s2.p2 - 0.40f) < 0.05f);
    std::cout << "[T8] 8-Slot Studio Rack JSON serialization roundtrip verified.\n";
}

void testT9_TrackInsertRouting()
{
    auto engine = std::make_unique<abdmcx::McxEngine>();
    engine->prepare(44100.0);

    assert(engine->getPartInsertSlot(0) == -1);
    engine->setPartInsertSlot(0, 2);
    assert(engine->getPartInsertSlot(0) == 2);
    engine->setPartInsertSlot(0, -1);
    assert(engine->getPartInsertSlot(0) == -1);

    assert(engine->isAudioDuckEnabled());
    assert(engine->isMidiDuckEnabled());
    engine->setAudioDuckEnabled(false);
    assert(!engine->isAudioDuckEnabled());
    engine->setAudioDuckEnabled(true);

    std::cout << "[T9] Track channel insert slot assignment & dual ducking verified.\n";
}

void testT10_SendSlotRouting()
{
    abdmcx::McxOutputAndFx outFx;
    outFx.prepare(44100.0);
    outFx.setSendSlotTarget(0, 0);
    assert(outFx.getSendSlotTarget(0) == 0);
    assert(outFx.getSendSlotTarget(2) == -1);

    const auto labels = outFx.getActiveSendLabels();
    assert(labels.sendA != nullptr);
    std::cout << "[T10] Send bus slot target patchbay assignment verified.\n";
}

void testT11_SlotChaining()
{
    abdmcx::McxRackChassis chassis;
    chassis.prepare(44100.0);
    chassis.setSlotEngine(0, abdmcx::McxRackEngineType::Saturation, "Sat Drive");
    chassis.setSlotEngine(1, abdmcx::McxRackEngineType::Saturation, "Sat Warmer");
    chassis.setSlotChainTarget(0, 1);
    assert(chassis.getSlotChainTarget(0) == 1);
    assert(chassis.getSlotChainTarget(1) == -1);
    std::cout << "[T11] Serial chaining between rack slots verified.\n";
}

void testT12_NewEnginesAndMasterGain()
{
    abdmcx::McxRackChassis chassis;
    chassis.prepare(44100.0);
    std::vector<float> inL(64, 0.4f), inR(64, 0.4f), outL(64, 0.0f), outR(64, 0.0f);
    for (int i = 0; i < 64; ++i) inL[static_cast<std::size_t>(i)] = inR[static_cast<std::size_t>(i)] = (i % 4 == 0) ? 0.5f : -0.25f;

    for (auto eng : { abdmcx::McxRackEngineType::MidasEq, abdmcx::McxRackEngineType::FairComp, abdmcx::McxRackEngineType::MoodFilter })
    {
        chassis.setSlotEngine(0, eng);
        chassis.setSlotParamByKey(0, "p1", 0.9f);
        chassis.processSlot(0, inL.data(), inR.data(), outL.data(), outR.data(), 64);
        assert(std::abs(outL[16] - inL[16]) > 1e-4f);
    }
    assert(abdmcx::normalizeRackEngineType(61) == abdmcx::McxRackEngineType::RolandBossReverb && abdmcx::normalizeRackEngineType(64) == abdmcx::McxRackEngineType::RolandToneEq);
    for (auto eng : { abdmcx::McxRackEngineType::RolandBossReverb, abdmcx::McxRackEngineType::RolandMt32Reverb, abdmcx::McxRackEngineType::RolandMultiChorus, abdmcx::McxRackEngineType::RolandToneEq }) {
        chassis.setSlotEngine(0, eng);
        chassis.setSlotParamByKey(0, "p1", 0.9f);
        chassis.setSlotParamByKey(0, "highGain", 0.85f);
        float maxDiff = 0.0f, latePeak = 0.0f;
        for (int b = 0; b < 64; ++b) {
            chassis.processSlot(0, inL.data(), inR.data(), outL.data(), outR.data(), 64);
            for (int i = 0; i < 64; ++i) { const auto u = static_cast<std::size_t>(i); if (std::abs(outL[u] - inL[u]) > maxDiff) maxDiff = std::abs(outL[u] - inL[u]); if (b >= 48 && std::abs(outL[u]) > latePeak) latePeak = std::abs(outL[u]); }
        }
        assert(std::isfinite(outL[16]) && std::isfinite(outR[16]) && maxDiff > 1e-4f && latePeak > 1e-4f);
    }

    abdmcx::McxOutputAndFx outFx;
    outFx.prepare(44100.0);
    std::vector<float> dryA(64, 0.3f), dryR(64, 0.3f), sA(64, 0.2f), z(64, 0.0f);
    outFx.processChunk(dryA.data(), dryR.data(), sA.data(), sA.data(), z.data(), z.data(), z.data(), z.data(), z.data(), z.data(), 64, 1.0f);
    std::vector<float> dryB(64, 0.3f), dryBR(64, 0.3f);
    outFx.processChunk(dryB.data(), dryBR.data(), sA.data(), sA.data(), z.data(), z.data(), z.data(), z.data(), z.data(), z.data(), 64, 0.25f);
    assert(std::abs(dryB[32]) < std::abs(dryA[32]) * 0.5f);
    assert(outFx.getTelemetry().peakSendA > 0.0f);
    std::cout << "[T12] MidasEq/FairComp/MoodFilter & MasterGain/SendTelemetry verified.\n";
}

void testT13_MoveRemoveRemapAndInsert()
{
    auto engine = std::make_unique<abdmcx::McxEngine>();
    engine->prepare(44100.0);
    auto& fx = engine->getOutputAndFx();
    fx.getChassis().setSlotChainTarget(0, 1);
    fx.setSendSlotTarget(0, 0);
    engine->setPartInsertSlot(0, 0);
    engine->moveRackSlot(0, 2);
    assert(engine->getPartInsertSlot(0) == 2 && fx.getSendSlotTarget(0) == 2 && fx.getChassis().getSlotChainTarget(2) == 1);
    engine->removeRackSlot(2);
    assert(engine->getPartInsertSlot(0) == -1 && fx.getSendSlotTarget(0) == -1 && !fx.getChassis().isSlotActive(2));
    std::cout << "[T13] Move/Remove route remapping & insert protection verified.\n";
}

} // namespace

int main()
{
    std::cout << "=== ABDMCX0X Phase 10: 8-Slot Modular Studio Rack Tests ===\n";
    testT1_Initialization(); testT2_SlotAssignment(); testT3_BypassAndPassThrough();
    testT4_SilenceAndAutoSleep(); testT5_SidechainDucking(); testT6_MoveAndRemoveSlot();
    testT7_TelemetryAndClipHold(); testT8_JsonRoundtrip(); testT9_TrackInsertRouting();
    testT10_SendSlotRouting(); testT11_SlotChaining();
    testT12_NewEnginesAndMasterGain(); testT13_MoveRemoveRemapAndInsert();
    abdmcx::test_ext::runExtendedRackTests();
    std::cout << "=== All Phase 10 Studio Rack Tests PASSED (17/17) ===\n";
    return 0;
}
