#include "../Source/Core/McxBankManagerBridge.h"
#include "../Source/Core/McxCommandQueue.h"
#include "../Source/Core/McxParamRouter.h"
#include "../Source/DSP/Core/McxEngine.h"
#include "../Source/Hardware/McxHardwareBridge.h"
#include "../Source/MIDI/McxMidiModDecimator.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <memory>
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

float renderRmsL(abdmcx::McxEngine& eng, int samples)
{
    std::vector<float> l(static_cast<std::size_t>(samples), 0.0f);
    std::vector<float> r(static_cast<std::size_t>(samples), 0.0f);
    eng.processAudio(l.data(), r.data(), samples);
    double sum = 0.0;
    for (float x : l)
        sum += static_cast<double>(x) * static_cast<double>(x);
    return static_cast<float>(std::sqrt(sum / static_cast<double>(samples)));
}
} // namespace

int main()
{
    using namespace abdmcx;
    std::printf("=== ABDMCX0X Phase 6 Core Infrastructure & Root Fixes Tests ===\n");

    // 1. Real NoteOn/NoteOff MIDI Out with portIndex & dual MIDI peaks
    {
        auto engPtr = std::make_unique<McxEngine>(); auto& engine = *engPtr;
        engine.prepare(44100.0);
        McxHardwareBridge bridge(engine);

        auto& p1 = engine.part(1);
        p1.routeMode = McxPartRouteMode::ExternalMidi;
        p1.midiChannel = 3;
        p1.midiPortIndex = 2;

        engine.triggerPartNoteOn(1, 64, 0.8f, 12);
        engine.releasePartNoteOff(1, 64, 48);

        check(engine.getActiveVoiceCount() == 0, "ExternalMidi part allocates 0 internal DSP voices");
        check(engine.getPartMidiPeaks()[1] > 0.75f, "External NoteOn updates partMidiPeaks telemetry");

        McxMidiOutMessage mOn {}, mOff {};
        const bool ok1 = bridge.getOutboundQueue().pop(mOn);
        const bool ok2 = bridge.getOutboundQueue().pop(mOff);
        check(ok1 && ok2 &&
                  mOn.portIndex == 2 && mOn.bytes[0] == 0x92 && mOn.bytes[1] == 64 && mOn.sampleOffset == 12 &&
                  mOff.portIndex == 2 && mOff.bytes[0] == 0x82 && mOff.bytes[1] == 64 && mOff.sampleOffset == 48,
              "triggerPartNoteOn/Off emits real 0x90/0x80 with portIndex and sampleOffset");

        std::vector<float> l(512, 0.0f), r(512, 0.0f);
        for (int b = 0; b < 120; ++b)
            engine.processAudio(l.data(), r.data(), 512);
        check(engine.getPartMidiPeaks()[1] == 0.0f, "partMidiPeaks decays cleanly to 0.0 in silence");
    }

    // 2. McxCommandQueue preserves exact partIdx without 4-bit MIDI channel collision
    {
        auto engPtr = std::make_unique<McxEngine>(); auto& engine = *engPtr;
        engine.prepare(44100.0);
        McxHardwareBridge bridge(engine);
        McxCommandQueue<1024> cmdQueue;

        engine.part(0).routeMode = McxPartRouteMode::Internal;
        engine.part(0).midiChannel = 1;
        engine.part(1).routeMode = McxPartRouteMode::ExternalMidi;
        engine.part(1).midiChannel = 1; // Shares channel 1 with Part 0!

        cmdQueue.push({ McxUiCommand::Type::PartNoteOn, 1, 60, 0, -1, 0.9f });
        drainCommandQueue(cmdQueue, engine);

        check(engine.getActiveVoiceCount() == 0 && bridge.getOutboundQueue().size() == 1,
              "McxCommandQueue routes Part 1 (CH1 External) without triggering Part 0 (CH1 Internal)");
    }

    // 3. Anti-hanging-note latch map across live transpose/scale changes
    {
        auto engPtr = std::make_unique<McxEngine>(); auto& engine = *engPtr;
        engine.prepare(44100.0);
        McxHardwareBridge bridge(engine);

        engine.part(0).routeMode = McxPartRouteMode::BothAB;
        engine.part(0).followGlobalTranspose = true;
        engine.setGlobalTranspose(0);

        engine.triggerPartNoteOn(0, 60, 0.85f);
        engine.setGlobalTranspose(7); // Transpose +7 semitones while key 60 is still held!
        engine.releasePartNoteOff(0, 60);

        McxMidiOutMessage mOn {}, mOff {};
        bridge.getOutboundQueue().pop(mOn);
        bridge.getOutboundQueue().pop(mOff);

        std::vector<float> l(256, 0.0f), r(256, 0.0f);
        for (int b = 0; b < 60; ++b)
            engine.processAudio(l.data(), r.data(), 256);

        check(mOn.bytes[1] == 60 && mOff.bytes[1] == 60 && engine.getActiveVoiceCount() == 0,
              "latchedNoteMap releases exact NoteOn pitch internally and externally after live transpose");
    }

    // 4. GrooveArpeggiator on ExternalMidi part emits MIDI Out without internal voices
    {
        auto engPtr = std::make_unique<McxEngine>(); auto& engine = *engPtr;
        engine.prepare(44100.0);
        McxHardwareBridge bridge(engine);

        auto& p2 = engine.part(2);
        p2.routeMode = McxPartRouteMode::ExternalMidi;
        p2.midiChannel = 4;
        p2.arp.setEnabled(true);
        p2.arp.setMotif(abd::synth::GrooveArpMotif::Up);

        engine.triggerPartNoteOn(2, 60, 0.9f);
        std::vector<float> l(128, 0.0f), r(128, 0.0f);
        engine.processAudio(l.data(), r.data(), 128);

        McxMidiOutMessage arpMsg {};
        const bool gotArp = bridge.getOutboundQueue().pop(arpMsg);
        check(engine.getActiveVoiceCount() == 0 && gotArp && arpMsg.bytes[0] == 0x93 && arpMsg.bytes[1] == 60,
              "GrooveArpeggiator routes NoteOn to ExternalMidi queue without waking internal voices");
    }

    // 5. McxHardwareBridge: per-part contracts, interleaved NRPN channels, dispatchNotes=false
    {
        auto engPtr = std::make_unique<McxEngine>(); auto& engine = *engPtr;
        engine.prepare(44100.0);
        McxHardwareBridge bridge(engine);
        bridge.loadContractsDirectory(ABDSHARED_CONTRACTS_DIR);

        engine.part(0).routeMode = McxPartRouteMode::ExternalMidi;
        engine.part(0).midiChannel = 1;
        engine.part(0).midiPortIndex = 0;
        engine.part(1).routeMode = McxPartRouteMode::ExternalMidi;
        engine.part(1).midiChannel = 2;
        engine.part(1).midiPortIndex = 1;

        check(bridge.setPartHardwareProfile(0, "roland_mc303") && bridge.setPartHardwareProfile(1, "korg_ms2000"),
              "Per-part hardware contracts assigned cleanly (MC-303 on P0, MS2000 on P1)");

        bridge.routeSemanticParam(0, abd::synth::role::kFilterCutoff, 0.5f); // NRPN 1/32 (3 msgs)
        bridge.routeSemanticParam(1, abd::synth::role::kFilterCutoff, 0.5f); // CC 74 (1 msg, port 1)
        std::vector<McxMidiOutMessage> msgs; McxMidiOutMessage tmp {};
        while (bridge.getOutboundQueue().pop(tmp)) msgs.push_back(tmp);
        engine.part(3).routeMode = McxPartRouteMode::ExternalMidi;
        const bool syxSet = bridge.setPartHardwareProfile(3, "roland_d50");
        bridge.routeSemanticParam(3, abd::synth::role::kFilterCutoff, 0.5f);
        McxMidiOutMessage syxMsg {};
        const bool syxOk = bridge.getOutboundQueue().pop(syxMsg) && syxMsg.length == 11 && syxMsg.bytes[0] == 0xF0 && syxMsg.bytes[4] == 0x12 && syxMsg.bytes[10] == 0xF7;
        check(msgs.size() == 4 && msgs[0].bytes[1] == 99 && msgs[3].portIndex == 1 && msgs[3].bytes[1] == 74 && syxSet && syxOk,
              "Per-part contracts emit MC-303 NRPN, MS2000 CC74, and D-50 SysEx DT1 simultaneously");

        // Interleaved NRPN on Ch 1 (1/32 Cutoff) and Ch 3 (1/33 Resonance)
        engine.part(2).routeMode = McxPartRouteMode::ExternalMidi;
        engine.part(2).midiChannel = 3;
        bridge.setPartHardwareProfile(2, "roland_mc303");
        engine.part(0).partials[0].cutoffHz = 200.0f;
        engine.part(2).partials[0].resonance = 0.05f;

        const std::uint8_t interleaved[] = {
            0xB0, 99, 1,   0xB2, 99, 1,
            0xB0, 98, 32,  0xB2, 98, 33,
            0xB0, 6,  80,  0xB2, 6,  90
        };
        bridge.processInboundMidiBuffer(interleaved, sizeof(interleaved), false);
        check(engine.part(0).partials[0].cutoffHz > 1000.0f && engine.part(2).partials[0].resonance > 0.5f,
              "Inbound NRPN state isolated per channel (interleaved Ch1/Ch3 intact)");

        engine.part(0).routeMode = McxPartRouteMode::Internal;
        const std::uint8_t noteBytes[] = { 0x90, 60, 100 };
        bridge.processInboundMidiBuffer(noteBytes, sizeof(noteBytes), false);
        const int voicesBlocked = engine.getActiveVoiceCount();
        bridge.processInboundMidiBuffer(noteBytes, sizeof(noteBytes), true);
        check(voicesBlocked == 0 && engine.getActiveVoiceCount() == 1,
              "dispatchNotes=false prevents double-triggering in PluginProcessor while dispatchNotes=true keeps legacy path");
    }

    // 6. McxMidiModDecimator: rate limit, NRPN address cache, backpressure
    {
        McxMidiOutQueue<1024> q;
        McxMidiModDecimator dec;
        dec.prepare(44100.0);

        const bool firstNrpn = dec.submitNrpn(q, 0, 0, 1, 1, 32, 0.4f);
        const std::size_t firstCount = q.size();
        const bool tooSoon = dec.submitNrpn(q, 0, 0, 1, 1, 32, 0.7f); // within 55.6 ms -> dropped
        dec.advanceBlock(3000); // ~68 ms > 1/18 Hz
        const bool cachedNrpn = dec.submitNrpn(q, 0, 0, 1, 1, 32, 0.7f);
        const std::size_t totalAfterSecond = q.size();

        check(firstNrpn && firstCount == 3 && !tooSoon && cachedNrpn && totalAfterSecond == 4,
              "McxMidiModDecimator rate-limits to 18Hz and caches NRPN address (3 msgs -> 1 msg)");

        // Backpressure >= 75% (768/1024)
        for (std::size_t i = q.size(); i < 770; ++i)
            q.push(HardwareMirrorRouter::makeNoteOn(1, 60, 100));
        dec.advanceBlock(3000);
        const bool droppedUnderPressure = !dec.submitCc(q, 1, 0, 1, 74, 0.8f);
        check(droppedUnderPressure, "McxMidiModDecimator drops modulation under >=75% queue backpressure");
    }

    // 7. Non-destructive semanticOffsets, Stereo Biquad EQ fix, liveZeroLatency & Bank JSON roundtrip
    {
        auto engBaseP = std::make_unique<McxEngine>(), engModP = std::make_unique<McxEngine>();
        auto& engBase = *engBaseP; auto& engMod = *engModP;
        engBase.prepare(44100.0);
        engMod.prepare(44100.0);
        for (auto* e : { &engBase, &engMod })
        {
            e->part(0).reverbSend = 0.0f;
            e->part(0).chorusSend = 0.0f;
            e->part(0).partials[0].cutoffHz = 2000.0f;
            e->part(0).partials[0].resonance = 0.10f;
            e->part(0).partials[0].filterEnvOctaves = 0.0f;
        }
        routePartParam(engMod, 0, 82, -0.75f); // -3 octaves semantic cutoff offset (2000 Hz -> 250 Hz)
        engBase.triggerNote(0, 60, 0.9f);
        engMod.triggerNote(0, 60, 0.9f);
        const float rmsBase = renderRmsL(engBase, 512);
        const float rmsMod = renderRmsL(engMod, 512);
        check(engMod.part(0).partials[0].cutoffHz == 2000.0f && rmsMod > 0.001f && rmsMod < rmsBase * 0.75f,
              "McxTrackSemanticOffsets alters rendered filter cutoff without overwriting preset partials");

        McxChannelStrip strip; strip.prepare(44100.0);
        McxChannelStripParams sp {}; sp.eqEnabled = true; sp.eqLowGainDb = 6.0f;
        std::vector<float> l(64, 0.5f), r(64, 0.0f);
        strip.process(l.data(), r.data(), nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, 64, sp, true);
        sp.eqLowGainDb = -6.0f; float l1 = 0.0f, r1 = 0.0f;
        strip.process(&l1, &r1, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, 1, sp, true);
        check(r1 == 0.0f && l1 != 0.0f, "McxChannelStrip EQ update preserves independent R channel biquad state");

        McxLatencyCompensator comp; comp.prepare(44100.0); comp.setLatencyMs(10.0f); comp.setLiveZeroLatency(true);
        float impulseL[4] { 1.0f, 0.0f, 0.0f, 0.0f }, impulseR[4] { 1.0f, 0.0f, 0.0f, 0.0f };
        comp.process(impulseL, impulseR, 4);
        check(comp.getEffectiveDelaySamples() == 0 && impulseL[0] == 1.0f, "McxLatencyCompensator liveZeroLatency bypasses delay");

        auto srcP = std::make_unique<McxEngine>(), dstP = std::make_unique<McxEngine>();
        auto& src = *srcP; auto& dst = *dstP; src.prepare(44100.0);
        McxHardwareBridge brSrc(src), brDst(dst);
        src.part(0).midiPortIndex = 3; src.part(0).partials[0].sourceKind = McxOscSourceKind::Fm2Op;
        const std::string json = McxBankManagerBridge::serializeToJson(src, brSrc, "Roundtrip6");
        check(McxBankManagerBridge::deserializeFromJson(dst, brDst, json) && dst.part(0).midiPortIndex == 3,
              "McxBankManagerBridge roundtrips sourceKind and midiPortIndex");
    }
    {
        auto eP = std::make_unique<McxEngine>(); auto& e = *eP; e.prepare(44100.0);
        auto* eng = e.getPartSoundEngine(0);
        e.part(0).partials[0].cutoffHz = 4000.0f;
        const bool bound = eng != nullptr && std::string(eng->getEngineTypeId()) == "structured_rompler"
            && e.modRouter(0).bindRoleRoute(0, abd::engines::mod_src::kGlobalLfo1, *eng, abd::synth::role::kFilterCutoff, -0.9f);
        auto run = [&](float lfo, std::array<float, 256>& l) {
            e.reset(); e.modRouter(0).setSourceValue(abd::engines::mod_src::kGlobalLfo1, lfo);
            e.triggerPartNoteOn(0, 60, 0.9f); std::array<float, 256> r {}; e.processAudio(l.data(), r.data(), 256);
        };
        std::array<float, 256> a {}, b {}; run(0.0f, a); run(1.0f, b);
        float diff = 0.0f;
        for (int i = 0; i < 256; ++i) diff += (a[i] > b[i]) ? (a[i] - b[i]) : (b[i] - a[i]);
        check(bound && diff > 1e-4f && e.part(0).partials[0].cutoffHz == 4000.0f, "TrackModRouter modulates non-destructively");

        McxHardwareBridge hb(e); hb.loadContractsDirectory(ABDSHARED_CONTRACTS_DIR);
        e.selectPartEngineById(3, "jv880_synth"); e.part(3).midiInPortIndex = 0; e.part(3).midiChannel = 1;
        const std::uint8_t jvDt1[] = { 0xF0, 0x41, 0x10, 0x46, 0x12, 0x00, 0x08, 0x28, 0x4A, 0x40, 0x46, 0xF7 };
        float cutVal = 0.0f;
        hb.processInboundMidiBuffer(jvDt1, sizeof(jvDt1), false, 0);
        check(e.getPartEngineParamByKey(3, "p1.cutoffHz", cutVal) && cutVal > 1400.0f && cutVal < 1600.0f, "Inbound DT1 SysEx updates active JV-880");
    }

    std::printf("\n=== Results: %d passed, %d failed ===\n", gPassed, gFailed);
    return (gFailed == 0) ? 0 : 1;
}
