#include "../Source/Core/McxBankManagerBridge.h"
#include "../Source/DSP/Core/McxEngine.h"
#include "../Source/DSP/FX/McxOutputAndFx.h"
#include "../Source/DSP/FX/McxRackChassis.h"
#include "../Source/Hardware/McxHardwareBridge.h"

#include <algorithm>
#include <array>
#include <cassert>
#include <cmath>
#include <cstring>
#include <iostream>
#include <memory>
#include <vector>

namespace
{

class TestPulseEngine final : public abd::engines::ISoundEngine
{
public:
    void prepare(double sr, int) noexcept override { sampleRate_ = (sr > 1000.0) ? sr : 44100.0; reset(); }
    void reset() noexcept override { sounding_ = false; phase_ = 0.0; }
    const char* getEngineTypeId() const noexcept override { return "test_pulse"; }
    const char* getEngineDisplayName() const noexcept override { return "Test Pulse"; }
    bool supportsDrumMode() const noexcept override { return false; }
    abd::engines::EngineDescriptor getDescriptor() const noexcept override { return { getEngineTypeId(), getEngineDisplayName(), false, false, 4 }; }
    int getFactoryPresetCount() const noexcept override { return 1; }
    const char* getFactoryPresetName(int) const noexcept override { return "Pulse"; }
    bool loadFactoryPreset(int i) noexcept override { return i == 0; }
    const char* getCurrentPresetName() const noexcept override { return "Pulse"; }
    const abd::engines::EngineControlInputDescriptor* getControlInputDescriptors(std::size_t& n) const noexcept override { n = 0; return nullptr; }
    void setControlInputs(const float*, std::size_t) noexcept override {}
    void clearControlInputs() noexcept override {}
    void setTransportContext(const abd::engines::EngineTransportContext&) noexcept override {}
    void noteOn(int, float, float) noexcept override { sounding_ = true; }
    void noteOff(int) noexcept override { sounding_ = false; }
    void allNotesOff() noexcept override { sounding_ = false; }
    bool renderBlock(float* outL, float* outR, int n) noexcept override
    {
        if (!sounding_ || n <= 0) return false;
        const double inc = 220.0 / sampleRate_;
        for (int i = 0; i < n; ++i)
        {
            const float s = 0.35f * static_cast<float>(std::sin(2.0 * 3.14159265358979323846 * phase_));
            outL[i] = outR[i] = s;
            phase_ += inc;
            if (phase_ >= 1.0) phase_ -= 1.0;
        }
        return true;
    }

private:
    double sampleRate_ { 44100.0 };
    double phase_ { 0.0 };
    bool sounding_ { false };
};

float maxAbs(const std::vector<float>& v) noexcept
{
    float m = 0.0f;
    for (float x : v)
    {
        assert(std::isfinite(x));
        m = std::max(m, std::abs(x));
    }
    return m;
}

void testT1_SlotBypassAndDryWetBlend()
{
    abdmcx::McxRackChassis chassis;
    chassis.prepare(44100.0);
    chassis.setSlotEngine(0, abdmcx::McxRackEngineType::Saturation);

    const std::vector<float> inL(64, 0.5f), inR(64, -0.5f);
    std::vector<float> wetL(64, 0.0f), wetR(64, 0.0f);
    std::vector<float> dryL(64, 0.0f), dryR(64, 0.0f);
    std::vector<float> mixL(64, 0.0f), mixR(64, 0.0f);

    chassis.reset();
    chassis.setSlotParams(0, 0.9f, 0.5f, 1.0f);
    chassis.processSlot(0, inL.data(), inR.data(), wetL.data(), wetR.data(), 64);
    assert(std::abs(wetL[16] - inL[16]) > 1e-3f);

    chassis.reset();
    chassis.setSlotParams(0, 0.9f, 0.5f, 0.0f);
    chassis.processSlot(0, inL.data(), inR.data(), dryL.data(), dryR.data(), 64);
    for (int i = 0; i < 64; ++i)
        assert(std::abs(dryL[static_cast<std::size_t>(i)] - inL[static_cast<std::size_t>(i)]) < 1e-5f);

    chassis.reset();
    chassis.setSlotParams(0, 0.9f, 0.5f, 0.5f);
    chassis.processSlot(0, inL.data(), inR.data(), mixL.data(), mixR.data(), 64);
    for (int i = 0; i < 64; ++i)
    {
        const float expected = 0.5f * inL[static_cast<std::size_t>(i)] + 0.5f * wetL[static_cast<std::size_t>(i)];
        assert(std::abs(mixL[static_cast<std::size_t>(i)] - expected) < 1e-5f);
    }

    chassis.setSlotBypass(0, true);
    chassis.processSlot(0, inL.data(), inR.data(), wetL.data(), wetR.data(), 64);
    for (int i = 0; i < 64; ++i)
    {
        assert(std::abs(wetL[static_cast<std::size_t>(i)] - inL[static_cast<std::size_t>(i)]) < 1e-5f);
        assert(std::abs(wetR[static_cast<std::size_t>(i)] - inR[static_cast<std::size_t>(i)]) < 1e-5f);
    }
    assert(chassis.getSlotTelemetry(0).isSleeping);
    std::cout << "[T1] Slot bypass pass-through & exact 0/50/100% dry/wet blend verified.\n";
}

void testT2_MasterGainWithRoutedRackAndMultiBusSends()
{
    abdmcx::McxOutputAndFx fxFull, fxQuarter;
    fxFull.prepare(44100.0);
    fxQuarter.prepare(44100.0);
    fxFull.setSendSlotTarget(0, 0); fxFull.setSendSlotTarget(1, 1);
    fxQuarter.setSendSlotTarget(0, 0); fxQuarter.setSendSlotTarget(1, 1);

    std::vector<float> l1(64, 0.15f), r1(64, 0.15f), l2(64, 0.15f), r2(64, 0.15f);
    const std::vector<float> sA(64, 0.30f), sB(64, 0.25f), sC(64, 0.20f), sD(64, 0.15f);
    fxFull.processChunk(l1.data(), r1.data(), sA.data(), sA.data(), sB.data(), sB.data(), sC.data(), sC.data(), sD.data(), sD.data(), 64, 1.0f);
    fxQuarter.processChunk(l2.data(), r2.data(), sA.data(), sA.data(), sB.data(), sB.data(), sC.data(), sC.data(), sD.data(), sD.data(), 64, 0.25f);

    assert(maxAbs(l2) < maxAbs(l1) * 0.5f);
    const auto tel = fxFull.getTelemetry();
    assert(tel.peakSendA > 0.25f && tel.peakSendB > 0.20f && tel.peakSendC > 0.15f && tel.peakSendD > 0.10f);

    abdmcx::McxOutputAndFx fxOpen, fxMuted;
    fxOpen.prepare(44100.0); fxMuted.prepare(44100.0);
    fxOpen.getChassis().setSlotEngine(0, abdmcx::McxRackEngineType::Saturation);
    fxMuted.getChassis().setSlotEngine(0, abdmcx::McxRackEngineType::Saturation);
    fxOpen.setSendSlotTarget(0, 0); fxMuted.setSendSlotTarget(0, 0);
    fxMuted.setSendBusMute(0, true);

    std::vector<float> outOpenL(64, 0.0f), outOpenR(64, 0.0f), outMutL(64, 0.0f), outMutR(64, 0.0f), z(64, 0.0f);
    fxOpen.processChunk(outOpenL.data(), outOpenR.data(), sA.data(), sA.data(), z.data(), z.data(), z.data(), z.data(), z.data(), z.data(), 64, 1.0f);
    fxMuted.processChunk(outMutL.data(), outMutR.data(), sA.data(), sA.data(), z.data(), z.data(), z.data(), z.data(), z.data(), z.data(), 64, 1.0f);
    assert(maxAbs(outOpenL) > 0.05f && maxAbs(outMutL) < 1e-6f);
    std::cout << "[T2] Routed masterGain scaling, Multi-Bus A..D telemetry & send mute verified.\n";
}

void testT3_DirectInsertNoDoubleProcessAndTail()
{
    abdmcx::McxOutputAndFx fx;
    fx.prepare(44100.0);
    fx.getChassis().setSlotEngine(0, abdmcx::McxRackEngineType::Saturation);
    fx.setSendSlotTarget(0, 0);

    std::vector<float> dryL(64, 0.0f), dryR(64, 0.0f), sA(64, 0.4f), z(64, 0.0f);
    fx.processChunk(dryL.data(), dryR.data(), sA.data(), sA.data(), z.data(), z.data(), z.data(), z.data(), z.data(), z.data(), 64, 1.0f, {}, static_cast<std::uint8_t>(1u << 0));
    assert(fx.getChassis().getSlotTelemetry(0).isSleeping && fx.getChassis().getSlotTelemetry(0).peakOutL == 0.0f);

    fx.processChunk(dryL.data(), dryR.data(), sA.data(), sA.data(), z.data(), z.data(), z.data(), z.data(), z.data(), z.data(), 64, 1.0f, {}, 0);
    assert(!fx.getChassis().getSlotTelemetry(0).isSleeping && fx.getChassis().getSlotTelemetry(0).peakOutL > 0.0f);

    auto engine = std::make_unique<abdmcx::McxEngine>();
    engine->prepare(44100.0);
    TestPulseEngine pulseEng;
    engine->setPartSoundEngine(0, &pulseEng);
    engine->part(0).reverbSend = engine->part(0).chorusSend = engine->part(0).delaySend = engine->part(0).auxSend = 0.0f;
    engine->getOutputAndFx().getChassis().setSlotEngine(0, abdmcx::McxRackEngineType::ZitaReverb);
    engine->setPartInsertSlot(0, 0);

    pulseEng.noteOn(60, 0.9f, 0.0f);
    std::vector<float> eL(2048, 0.0f), eR(2048, 0.0f);
    engine->processAudio(eL.data(), eR.data(), 2048);
    assert(engine->getOutputAndFx().getChassis().hasSlotActivity(0));

    pulseEng.allNotesOff();
    assert(!pulseEng.renderBlock(eL.data(), eR.data(), 64));
    std::vector<float> tailL(256, 0.0f), tailR(256, 0.0f);
    engine->processAudio(tailL.data(), tailR.data(), 256);
    assert(maxAbs(tailL) > 1e-5f);
    engine->setPartSoundEngine(0, nullptr);
    std::cout << "[T3] Excluded insert double-process guard & direct insert tail on silent voice verified.\n";
}

void testT4_ReorderAndRemoveSlotRemapsAllRoutes()
{
    auto engine = std::make_unique<abdmcx::McxEngine>();
    engine->prepare(44100.0);
    auto& fx = engine->getOutputAndFx();
    fx.getChassis().setSlotEngine(2, abdmcx::McxRackEngineType::Saturation);
    fx.getChassis().setSlotChainTarget(0, 1);
    fx.setSendSlotTarget(0, 0);
    fx.setSendSlotTarget(1, 1);
    engine->setPartInsertSlot(0, 0);
    engine->setPartInsertSlot(1, 2);

    engine->moveRackSlot(0, 2);
    assert(engine->getPartInsertSlot(0) == 2 && engine->getPartInsertSlot(1) == 0);
    assert(fx.getSendSlotTarget(0) == 2 && fx.getSendSlotTarget(1) == 1);
    assert(fx.getChassis().getSlotChainTarget(2) == 1);

    engine->removeRackSlot(1);
    assert(fx.getSendSlotTarget(1) == -1 && fx.getChassis().getSlotChainTarget(2) == -1);
    engine->removeRackSlot(2);
    assert(engine->getPartInsertSlot(0) == -1 && fx.getSendSlotTarget(0) == -1 && !fx.getChassis().isSlotActive(2));
    std::cout << "[T4] Move & remove rack slot remapping across inserts, sends & chains verified.\n";
}

void testT5_BankJsonRoundtripPreservesRouting()
{
    auto e1 = std::make_unique<abdmcx::McxEngine>();
    e1->prepare(44100.0);
    abdmcx::McxHardwareBridge hb1(*e1);
    e1->setMasterVolume(0.62f);
    e1->setGlobalTranspose(-5);
    e1->getOutputAndFx().setUiTopology(3);
    e1->getOutputAndFx().setSendSlotTarget(2, 4);
    e1->part(2).insertSlot = 3;
    e1->part(2).routeMode = abdmcx::McxPartRouteMode::BothAB;
    e1->part(2).midiPortIndex = 2;
    e1->setPartPresetName(2, "Acid Lead");

    const std::string json = abdmcx::McxBankManagerBridge::serializeToJson(*e1, hb1, "P4Test");
    auto e2 = std::make_unique<abdmcx::McxEngine>();
    e2->prepare(44100.0);
    abdmcx::McxHardwareBridge hb2(*e2);
    assert(abdmcx::McxBankManagerBridge::deserializeFromJson(*e2, hb2, json));

    assert(std::abs(e2->getMasterVolume() - 0.62f) < 1e-3f);
    assert(e2->getTransposer().getTransposeSemitones() == -5);
    assert(e2->getOutputAndFx().getUiTopology() == 3 && e2->getOutputAndFx().getSendSlotTarget(2) == 4);
    assert(e2->part(2).insertSlot == 3 && e2->part(2).routeMode == abdmcx::McxPartRouteMode::BothAB);
    assert(e2->part(2).midiPortIndex == 2 && std::strcmp(e2->getPartDisplayPresetName(2), "Acid Lead") == 0);
    std::cout << "[T5] BankManager JSON roundtrip preserving rack, insert & route metadata verified.\n";
}

} // namespace

int main()
{
    std::cout << "=== ABDMCX0X Phase 11: Sanitization P0-P1 Regression Tests ===\n";
    testT1_SlotBypassAndDryWetBlend();
    testT2_MasterGainWithRoutedRackAndMultiBusSends();
    testT3_DirectInsertNoDoubleProcessAndTail();
    testT4_ReorderAndRemoveSlotRemapsAllRoutes();
    testT5_BankJsonRoundtripPreservesRouting();
    std::cout << "=== All Phase 11 Sanitization Regression Tests PASSED (5/5) ===\n";
    return 0;
}
