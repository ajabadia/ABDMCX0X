#include "../Source/DSP/Core/McxEngine.h"

#include <cmath>
#include <cstdio>

namespace
{
int gPassed = 0;
int gFailed = 0;

void check(bool condition, const char* label)
{
    if (condition)
    {
        ++gPassed;
        printf("  [PASS] %s\n", label);
    }
    else
    {
        ++gFailed;
        printf("  [FAIL] %s\n", label);
    }
}
} // namespace

int main()
{
    using namespace abdmcx;
    printf("=== ABDMCX0X Phase 0 Headless Tests ===\n");

    // 1. 16-part initialization, Focused-Part Proxy & 440 Hz diagnostic tone
    {
        McxEngine engine;
        engine.prepare(48000.0);

        check(engine.part(0).enabled && !engine.part(0).isDrumKit, "Part 0 enabled as Melodic Synth");
        check(engine.part(9).enabled && engine.part(9).isDrumKit && engine.part(9).midiChannel == 10,
              "Part 9 enabled as Channel 10 Drum Kit");
        check(!engine.part(1).enabled && !engine.part(15).enabled, "Unused parts default disabled (zero CPU)");

        engine.setFocusedPart(9);
        check(engine.getFocusedPart() == 9, "Focused-Part proxy switches cleanly to Part 9");
        engine.setFocusedPart(99);
        check(engine.getFocusedPart() == 15, "Focused-Part proxy clamps to [0..15]");

        float left[256] {}, right[256] {};
        engine.processAudio(left, right, 256);
        float maxSilent = 0.0f;
        for (int i = 0; i < 256; ++i)
            maxSilent = std::max(maxSilent, std::max(std::abs(left[i]), std::abs(right[i])));
        check(maxSilent == 0.0f, "Engine is silent when no test tone or notes play");

        engine.setDiagnosticTestToneEnabled(true);
        engine.processAudio(left, right, 256);
        float peak = 0.0f;
        bool finite = true;
        for (int i = 0; i < 256; ++i)
        {
            if (!std::isfinite(left[i]) || !std::isfinite(right[i])) finite = false;
            peak = std::max(peak, std::abs(left[i]));
        }
        check(finite && peak > 0.20f && peak < 0.30f, "Diagnostic 440 Hz test tone outputs ~0.25 finite peak");
    }

    // 2. Drum Kit muteGroup choke behavior
    {
        McxEngine engine;
        engine.prepare(48000.0);
        auto& kit = engine.part(9);
        kit.drumSlots[42].muteGroup = 1; // Closed Hi-Hat
        kit.drumSlots[46].muteGroup = 1; // Open Hi-Hat
        kit.drumSlots[36].muteGroup = 0; // Kick (independent)

        engine.triggerNote(9, 36, 1.0f);
        engine.triggerNote(9, 46, 0.9f);
        check(kit.drumSlots[36].activeSounding && kit.drumSlots[46].activeSounding,
              "Kick and Open Hi-Hat sound together before choke");

        engine.triggerNote(9, 42, 0.95f);
        check(!kit.drumSlots[46].activeSounding && kit.drumSlots[42].activeSounding,
              "Closed Hi-Hat (group 1) chokes Open Hi-Hat (group 1)");
        check(kit.drumSlots[36].activeSounding,
              "Independent Kick (group 0) remains sounding after hi-hat choke");
    }

    // 3. HardwareMirrorRouter strict NRPN order (CC99 -> CC98 -> CC6) & Roland DT1 Checksum
    {
        McxEngine engine;
        engine.prepare(48000.0);
        engine.part(0).routeMode = McxPartRouteMode::BothAB;
        engine.part(0).partials[0].cutoffHz = 12000.0f;
        engine.triggerNote(0, 60, 0.8f);

        const auto& router = engine.getMirrorRouter();
        check(router.size() == 3, "Melodic NRPN emits 3 sequential MIDI CC messages");
        check(router.at(0).bytes[0] == 0xB0 && router.at(0).bytes[1] == 99 && router.at(0).bytes[2] == 1,
              "Strict NRPN byte order #1: CC99 (MSB=1)");
        check(router.at(1).bytes[0] == 0xB0 && router.at(1).bytes[1] == 98 && router.at(1).bytes[2] == 32,
              "Strict NRPN byte order #2: CC98 (LSB=32 TVF Cutoff)");
        check(router.at(2).bytes[0] == 0xB0 && router.at(2).bytes[1] == 6 && router.at(2).bytes[2] >= 14,
              "Strict NRPN byte order #3: CC6 (Data Entry MSB after CC99/CC98)");

        engine.getMirrorRouter().clear();
        const std::uint8_t gsModel[1] = { 0x42 };
        const std::uint8_t gsResetAddr[3] = { 0x40, 0x00, 0x7F };
        const std::uint8_t gsResetData[1] = { 0x00 };
        check(engine.getMirrorRouter().emitRolandDt1SysEx(0x10, gsModel, 1, gsResetAddr, 3, gsResetData, 1),
              "Emit GS Reset DT1 SysEx (3-byte addr)");
        const auto& gsMsg = engine.getMirrorRouter().at(0);
        check(gsMsg.length == 11 && gsMsg.bytes[0] == 0xF0 && gsMsg.bytes[9] == 0x41 && gsMsg.bytes[10] == 0xF7,
              "GS Reset SysEx checksum exact (0x41)");

        engine.getMirrorRouter().clear();
        const std::uint8_t mc303Model[2] = { 0x00, 0x03 };
        const std::uint8_t revAddr[4] = { 0x00, 0x40, 0x01, 0x30 };
        const std::uint8_t revData[1] = { 0x06 }; // 0x40+0x01+0x30+0x06 = 0x77 -> 0x80 - 0x77 = 0x09
        check(engine.getMirrorRouter().emitRolandDt1SysEx(0x10, mc303Model, 2, revAddr, 4, revData, 1),
              "Emit MC-303 DT1 SysEx (4-byte addr)");
        const auto& mcMsg = engine.getMirrorRouter().at(0);
        check(mcMsg.length == 13 && mcMsg.bytes[11] == 0x09 && mcMsg.bytes[12] == 0xF7,
              "MC-303 2-byte model DT1 SysEx checksum exact (0x09)");
    }

    // 4. Output character quantizers & GrooveArpeggiator wiring
    {
        constexpr float tiny = 0.0002f;
        check(McxEngine::quantizeOutputSample(tiny, McxOutputCharacter::HdStudio) == tiny,
              "HdStudio output preserves full floating-point precision");
        check(McxEngine::quantizeOutputSample(tiny, McxOutputCharacter::Sampler12Bit) == 0.0f,
              "Sampler12Bit quantizes below 1/2048 LSB to zero");

        McxEngine arpEng;
        arpEng.prepare(44100.0);
        arpEng.part(9).arp.setEnabled(true);
        arpEng.part(9).arp.setMotif(abd::synth::GrooveArpMotif::Up);
        arpEng.part(9).arp.noteOn(36, 0.9f);
        float l[128] {}, r[128] {};
        arpEng.processAudio(l, r, 128);
        check(arpEng.part(9).drumSlots[36].activeSounding,
              "GrooveArpeggiator inside McxEngine triggers Drum slot cleanly");
    }

    printf("\n=== Results: %d passed, %d failed ===\n", gPassed, gFailed);
    return (gFailed == 0) ? 0 : 1;
}
