#include "../Source/Core/McxBankManagerBridge.h"
#include "../Source/DSP/Core/McxEngine.h"
#include "../Source/Hardware/McxHardwareBridge.h"
#include "../Source/Hardware/McxLatencyCompensator.h"
#include "../Source/MIDI/McxMidiOutQueue.h"

#include <cmath>
#include <cstdio>
#include <vector>

namespace
{
int gPassed = 0;
int gFailed = 0;

void check(bool condition, const char* label)
{
    if (condition)
    {
        ++gPassed;
        std::printf("  [PASS] %s\n", label);
    }
    else
    {
        ++gFailed;
        std::printf("  [FAIL] %s\n", label);
    }
}
} // namespace

int main()
{
    using namespace abdmcx;
    std::printf("=== ABDMCX0X Phase 2 Live Hardware Bridge & BankManager Tests ===\n");

    // 1. McxMidiOutQueue SPSC Ring Buffer Verification
    {
        McxMidiOutQueue<32> queue;
        check(queue.empty() && queue.size() == 0, "Queue initializes empty");

        for (int i = 0; i < 32; ++i)
        {
            McxMidiOutMessage m {};
            m.length = 3;
            m.bytes[0] = 0x90;
            m.bytes[1] = static_cast<std::uint8_t>(i);
            m.bytes[2] = 100;
            const bool ok = queue.push(m);
            if (i < 32)
                check(ok, "Queue accepts items up to capacity");
        }

        // 33rd push should fail (overflow protection)
        McxMidiOutMessage overflowMsg {};
        overflowMsg.length = 1;
        check(!queue.push(overflowMsg), "Queue rejects 33rd push on capacity 32");

        // Batch pop 10 items
        McxMidiOutMessage batch[16] {};
        const std::size_t popped = queue.popBatch(batch, 10);
        check(popped == 10 && batch[0].bytes[1] == 0 && batch[9].bytes[1] == 9,
              "Queue popBatch correctly pops ordered contiguous slice");

        // Single pop the remaining
        McxMidiOutMessage single {};
        int count = 0;
        while (queue.pop(single))
            ++count;
        check(count == 22 && queue.empty(), "Queue pops remaining 22 items and returns to empty");
    }

    // 2. Part Routing (INT, EXT, BOTH) in McxHardwareBridge
    {
        McxEngine engine;
        engine.prepare(44100.0);
        McxHardwareBridge bridge(engine);

        // Part 0: Internal only
        engine.part(0).routeMode = McxPartRouteMode::Internal;
        bridge.routeNoteOn(0, 60, 0.8f);
        check(engine.getActiveVoiceCount() == 1 && bridge.getOutboundQueue().empty(),
              "Internal mode allocates DSP voice and produces 0 outbound MIDI messages");
        bridge.routeNoteOff(0, 60);

        // Part 1: External MIDI only
        engine.part(1).routeMode = McxPartRouteMode::ExternalMidi;
        engine.part(1).midiChannel = 2;
        bridge.routeNoteOn(1, 62, 0.9f);
        check(engine.getActiveVoiceCount() == 0 && bridge.getOutboundQueue().size() == 1,
              "External mode bypasses voice allocation and queues outbound MIDI message");

        McxMidiOutMessage extMsg {};
        bridge.getOutboundQueue().pop(extMsg);
        check(extMsg.bytes[0] == 0x91 && extMsg.bytes[1] == 62 && extMsg.bytes[2] == 114,
              "External Note-On matches Channel 2 (0x91) and scaled velocity 114");

        // Part 2: Both A/B
        engine.part(2).routeMode = McxPartRouteMode::BothAB;
        engine.part(2).midiChannel = 3;
        bridge.routeNoteOn(2, 64, 0.75f);
        check(engine.getActiveVoiceCount() == 1 && bridge.getOutboundQueue().size() == 1,
              "BothAB mode triggers internal voice AND pushes outbound MIDI message simultaneously");
    }

    // 3. Latency Compensation Delay Line
    {
        McxLatencyCompensator comp;
        comp.prepare(44100.0);
        comp.setLatencyMs(10.0f); // 10 ms @ 44.1kHz = 441 samples
        check(comp.getDelaySamples() == 441, "Latency compensator calculates exact sample delay (441 samples)");

        std::vector<float> l(1000, 0.0f);
        std::vector<float> r(1000, 0.0f);
        l[0] = 1.0f; // Unit impulse at t=0
        r[0] = 0.5f;

        comp.process(l.data(), r.data(), 1000);
        check(l[0] == 0.0f && l[441] == 1.0f && r[441] == 0.5f,
              "Latency compensator accurately shifts stereo impulse by exactly 441 samples");
    }

    // 4. Boss DR-5 & Roland MC-303 Outbound and Inbound Parameter Mirroring
    {
        McxEngine engine;
        engine.prepare(44100.0);
        McxHardwareBridge bridge(engine);

        // Outbound DR-5 CC & Drum Key NRPNs
        bridge.setHardwareTarget(McxHardwareTarget::BossDr5);
        auto& drumPart = engine.part(9); // Track 10
        drumPart.routeMode = McxPartRouteMode::ExternalMidi;
        drumPart.midiChannel = 10;
        drumPart.isDrumPart = true;
        drumPart.drumRemapper.slotToExternal[36] = 36; // Kick

        // Route Track Volume (CC7), Pan (CC10), Reverb (CC91)
        bridge.routePartVolume(9, 0.8f);
        bridge.routePartPan(9, 0.5f);
        bridge.routePartReverb(9, 0.4f);

        // Route Drum Slot TVA Level (NRPN 26) & Reverb Send (NRPN 29)
        bridge.routeDrumSlotParam(9, 36, 1, 0.95f); // Level
        bridge.routeDrumSlotParam(9, 36, 3, 0.5f);  // Reverb

        std::vector<McxMidiOutMessage> drained;
        bridge.drainOutboundQueue([&](const std::uint8_t* b, std::size_t n) {
            McxMidiOutMessage m {};
            m.length = static_cast<std::uint8_t>(n);
            for (std::size_t i = 0; i < n; ++i) m.bytes[i] = b[i];
            drained.push_back(m);
        });

        // 3 CCs (Vol, Pan, Rev) + 2 NRPNs (Level: CC99,98,6 + Rev: CC99,98,6) = 9 messages total
        check(drained.size() == 9, "Drained 9 outbound MIDI messages for DR-5 CCs and GS Drum NRPNs");
        check(drained[0].bytes[1] == 7 && drained[1].bytes[1] == 10 && drained[2].bytes[1] == 91,
              "Outbound CCs correctly formatted CC7, CC10, CC91 on Track 10");

        // Check strict Roland NRPN order: CC99=26 -> CC98=36 -> CC6=120
        check(drained[3].bytes[1] == 99 && drained[3].bytes[2] == 26 &&
              drained[4].bytes[1] == 98 && drained[4].bytes[2] == 36 &&
              drained[5].bytes[1] == 6  && drained[5].bytes[2] == 120,
              "GS Drum Level NRPN follows strict Roland order: CC99(26) -> CC98(36) -> CC6(120)");

        // Inbound MIDI Parsing: Boss DR-5 sends NRPN CC99=24, CC98=36, CC6=70 (Coarse Pitch)
        // Status 0xB9 (Ch 10 CC)
        const std::uint8_t inboundNrpn[] = { 0xB9, 99, 24, 0xB9, 98, 36, 0xB9, 6, 70 };
        bridge.processInboundMidiBuffer(inboundNrpn, sizeof(inboundNrpn));
        check(drumPart.drumSlots[36].pitchKeyTrack == 3.0f,
              "Inbound DR-5 GS Drum Pitch NRPN (CC99=24, CC98=36, CC6=70) updates slot pitch to +3.0 semitones");

        // Inbound MIDI Parsing: Roland MC-303 sends Cutoff NRPN CC99=1, CC98=32, CC6=64 on Ch 1
        auto& synthPart = engine.part(0);
        synthPart.midiChannel = 1;
        const std::uint8_t mc303Inbound[] = { 0xB0, 99, 1, 0xB0, 98, 32, 0xB0, 6, 64 };
        bridge.processInboundMidiBuffer(mc303Inbound, sizeof(mc303Inbound));
        check(synthPart.partials[0].cutoffHz > 400.0f && synthPart.partials[0].cutoffHz < 2000.0f,
              "Inbound MC-303 TVF Cutoff NRPN (CC99=1, CC98=32, CC6=64) updates synth partial filter cutoff");
    }

    // 5. McxBankManagerBridge JSON State Persistence & Roland SysEx Generation
    {
        McxEngine engA;
        engA.prepare(44100.0);
        McxHardwareBridge brA(engA);
        engA.setMachinePersona(McxMachinePersona::RolandMc303);
        engA.setOutputCharacter(McxOutputCharacter::Rompler16Bit);
        brA.setHardwareTarget(McxHardwareTarget::BossDr5);
        brA.getLatencyCompensator().setLatencyMs(4.5f);

        auto& p0 = engA.part(0);
        p0.level = 0.88f;
        p0.pan = -0.35f;
        p0.structureMode = McxStructureMode::RingMod12;
        p0.partials[0].enabled = true;
        p0.partials[0].vaWaveform = 4; // SuperSaw
        p0.partials[0].cutoffHz = 5500.0f;

        const std::string json = McxBankManagerBridge::serializeToJson(engA, brA, "Boss DR-5 Test Patch");
        check(!json.empty() && json.find("abd_mcx0x_preset_v1") != std::string::npos,
              "BankManagerBridge serializes full state to valid abd_mcx0x_preset_v1 JSON");

        // Deserialize into clean engine B
        McxEngine engB;
        engB.prepare(44100.0);
        McxHardwareBridge brB(engB);
        const bool deserialized = McxBankManagerBridge::deserializeFromJson(engB, brB, json);
        check(deserialized, "BankManagerBridge successfully deserializes preset JSON");
        check(engB.getPersonaSpec().persona == McxMachinePersona::RolandMc303,
              "Deserialized state preserves RolandMc303 persona");
        check(engB.getOutputCharacter() == McxOutputCharacter::Rompler16Bit,
              "Deserialized state preserves Rompler16Bit DAC character");
        check(std::abs(brB.getLatencyCompensator().getLatencyMs() - 4.5f) < 0.01f,
              "Deserialized state preserves 4.5ms latency compensation");
        check(std::abs(engB.part(0).level - 0.88f) < 0.01f && engB.part(0).structureMode == McxStructureMode::RingMod12,
              "Deserialized state preserves Part 0 level (0.88) and RingMod12 structure");
        check(engB.part(0).partials[0].vaWaveform == 4 && std::abs(engB.part(0).partials[0].cutoffHz - 5500.0f) < 5.0f,
              "Deserialized state preserves Partial 0 SuperSaw waveform and 5500Hz cutoff");

        // Roland SysEx DT1 generation test (Boss DR-5 Track Dump)
        const auto syx = McxBankManagerBridge::buildBossDr5TrackDump(0, 100, 64, 40, 0x10);
        check(syx.size() == 11, "Boss DR-5 Track Dump generates exact 11-byte DT1 SysEx message");
        check(syx[0] == 0xF0 && syx[1] == 0x41 && syx[2] == 0x10 && syx[3] == 0x42 && syx[4] == 0x12,
              "SysEx header contains Roland ID (0x41), Device 0x10, DR-5 Model ID (0x42), DT1 command (0x12)");
        check(syx[10] == 0xF7, "SysEx ends with 0xF7 EOX terminator");

        // Verify checksum: address { 0x40, 0x00, 0x00 }, data { 100, 64, 40 }
        // sum = 0x40 + 0 + 0 + 100 + 64 + 40 = 64 + 204 = 268 = 0x10C
        // sum & 0x7F = 0x0C = 12
        // (0x80 - 12) & 0x7F = 116 = 0x74
        check(syx[9] == 0x74, "Roland 7-bit checksum matches exact specification (0x74)");
    }

    std::printf("\n=== Results: %d passed, %d failed ===\n", gPassed, gFailed);
    return (gFailed == 0) ? 0 : 1;
}
