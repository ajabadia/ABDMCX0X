#include "DSP/Core/McxEngine.h"
#include "MIDI/McxMidiOutQueue.h"
#include "Sequencer/McxPatternSequencer.h"
#include "Sequencer/McxSongAndScenes.h"
#include "Sequencer/McxSongJsonCodec.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <vector>

using namespace abdmcx;

namespace
{
int gPassed = 0;
int gFailed = 0;

void check(bool cond, const char* msg)
{
    if (cond) { ++gPassed; std::printf("  [PASS] %s\n", msg); }
    else { ++gFailed; std::printf("  [FAIL] %s\n", msg); }
}

void pumpAudio(McxEngine& e, int totalSamples)
{
    std::vector<float> l(256, 0.0f), r(256, 0.0f);
    for (int pos = 0; pos < totalSamples; pos += 256)
        e.processAudio(l.data(), r.data(), std::min(256, totalSamples - pos));
}

void drainNoteEvents(McxMidiOutQueue<1024>& q, int ch1to16, std::vector<int>& noteOns, std::vector<int>& noteOffs, bool* gotStop = nullptr)
{
    const std::uint8_t onStatus = static_cast<std::uint8_t>(0x90 | ((ch1to16 - 1) & 0x0F));
    const std::uint8_t offStatus = static_cast<std::uint8_t>(0x80 | ((ch1to16 - 1) & 0x0F));
    McxMidiOutMessage m {};
    while (q.pop(m))
    {
        if (m.length == 1 && m.bytes[0] == 0xFC && gotStop != nullptr) *gotStop = true;
        if (m.length == 3 && m.bytes[0] == onStatus && m.bytes[2] > 0) noteOns.push_back(m.bytes[1]);
        if (m.length == 3 && (m.bytes[0] == offStatus || (m.bytes[0] == onStatus && m.bytes[2] == 0)))
            noteOffs.push_back(m.bytes[1]);
    }
}
} // namespace

int main()
{
    std::printf("=== ABDMCX0X Phase 4B Song Mode & Bar-Quantized Live Scenes Tests ===\n");

    // T1: Factory defaults, idle safety & 16-track defaults intact
    {
        McxEngine e;
        e.prepare(44100.0);
        const auto tel = e.songAndScenes().readTelemetry();
        std::vector<float> l(1024, 0.0f), r(1024, 0.0f);
        e.processAudio(l.data(), r.data(), 1024);
        float maxAbs = 0.0f;
        for (float s : l) maxAbs = std::max(maxAbs, std::abs(s));
        check(!tel.songMode && tel.songLoop && tel.activeScene == 0 && tel.queuedScene == -1
                  && tel.songBlockCount == 4 && e.songAndScenes().scene(3).transposeSemitones == 5 && maxAbs == 0.0f,
              "T1: Default Song/Scene state is safe, populated with 4 blocks/8 scenes, and produces 0 idle audio");
    }

    // T2: Immediate stopped scene trigger + captureCurrentToScene
    {
        McxEngine e;
        e.prepare(44100.0);
        e.triggerScene(3, false); // Scene 4: +5 st
        const bool switchedTr = (e.getTransposer().getTransposeSemitones() == 5 && e.songAndScenes().readTelemetry().activeScene == 3);

        e.part(0).mute = true;
        e.part(2).mute = true;
        e.part(9).mute = true;
        e.setGlobalTranspose(-2);
        e.captureCurrentToScene(4);
        const auto& cap = e.songAndScenes().scene(4);
        const std::uint16_t expectedMask = static_cast<std::uint16_t>((1u << 0) | (1u << 2) | (1u << 9));
        check(switchedTr && cap.muteMask == expectedMask && cap.transposeSemitones == -2,
              "T2: Stopped scene switch applies immediately and captureCurrentToScene snapshots exact mask & transpose");
    }

    // T3: Bar-quantized scene trigger defers mid-bar and switches cleanly on exact barline (0 hangs)
    {
        McxEngine e;
        McxMidiOutQueue<1024> q;
        e.setOutboundMidiQueue(&q);
        e.prepare(44100.0);
        e.setMasterTempoBpm(120.0f); // 1 bar = 2.0 s = 88200 samples
        e.part(1).routeMode = McxPartRouteMode::ExternalMidi;
        e.part(1).midiChannel = 3;
        e.songAndScenes().setScene(0, 0x0000u, 0, "Open");
        e.songAndScenes().setScene(1, 0x0002u, 0, "MuteP2");

        McxPatternSequencer::PartPattern pat {};
        pat.eventCount = 2;
        pat.events[0] = { 0, 24, 60, 100, false, true };
        pat.events[1] = { 240, 24, 62, 100, false, true };
        e.sequencer().replacePartPattern(1, pat);

        e.setSequencerPlaying(true, true);
        pumpAudio(e, 22050); // ~0.25 bar
        e.triggerScene(1, false); // Queued for next barline!
        const auto midTel = e.songAndScenes().readTelemetry();
        const bool queuedNotYetActive = (midTel.activeScene == 0 && midTel.queuedScene == 1 && !e.part(1).mute);

        pumpAudio(e, 66150 + 512); // Cross barline 1 (total ~88712 > 88200)
        const auto bar1Tel = e.songAndScenes().readTelemetry();
        std::vector<int> bar0Ons, bar0Offs;
        drainNoteEvents(q, 3, bar0Ons, bar0Offs);

        pumpAudio(e, 88200); // Full Bar 2 while part(1) is muted
        std::vector<int> bar1Ons, bar1Offs;
        drainNoteEvents(q, 3, bar1Ons, bar1Offs);

        check(queuedNotYetActive && bar1Tel.activeScene == 1 && bar1Tel.queuedScene == -1 && e.part(1).mute
                  && bar0Ons.size() == 2 && bar1Ons.empty() && e.getActiveVoiceCount() == 0,
              "T3: Live Scene defers mid-bar, switches on exact barline, mutes Part 2 NoteOns cleanly with 0 hangs");
    }

    // T4: Scene transpose shifts Chromatic (+5) without shifting DrumMap (Part 10) & zero hanging NoteOffs across barline
    {
        McxEngine e;
        McxMidiOutQueue<1024> q;
        e.setOutboundMidiQueue(&q);
        e.prepare(44100.0);
        e.setMasterTempoBpm(120.0f);
        e.part(0).routeMode = McxPartRouteMode::ExternalMidi;
        e.part(0).midiChannel = 1;
        e.part(9).routeMode = McxPartRouteMode::ExternalMidi;
        e.part(9).midiChannel = 10;
        e.setPartKind(9, McxPartKind::DrumMap);
        e.songAndScenes().setScene(0, 0x0000u, 0, "Root");
        e.songAndScenes().setScene(1, 0x0000u, 5, "Up5");

        McxPatternSequencer::PartPattern pChr {}, pDrm {};
        pChr.eventCount = 2;
        pChr.events[0] = { 0, 24, 60, 100, false, true };
        pChr.events[1] = { 360, 48, 60, 100, false, true }; // Held across barline!
        pDrm.eventCount = 1;
        pDrm.events[0] = { 0, 24, 36, 110, false, true };
        e.sequencer().replacePartPattern(0, pChr);
        e.sequencer().replacePartPattern(9, pDrm);

        e.setSequencerPlaying(true, true);
        pumpAudio(e, 1024);
        e.triggerScene(1, false);
        pumpAudio(e, 88200); // Crosses barline into Bar 2 (where transpose=+5 and held note 60 expires at tick 24)
        pumpAudio(e, 12000); // Past tick 24 of Bar 2

        std::vector<int> ch1Ons, ch1Offs, ch10Ons, ch10Offs;
        McxMidiOutMessage m {};
        while (q.pop(m))
        {
            if (m.length == 3)
            {
                const int ch = (m.bytes[0] & 0x0F) + 1;
                const bool isNoteOn = ((m.bytes[0] & 0xF0) == 0x90) && (m.bytes[2] > 0);
                const bool isNoteOff = ((m.bytes[0] & 0xF0) == 0x80) || (((m.bytes[0] & 0xF0) == 0x90) && (m.bytes[2] == 0));
                if (ch == 1)
                {
                    if (isNoteOn) ch1Ons.push_back(m.bytes[1]);
                    else if (isNoteOff) ch1Offs.push_back(m.bytes[1]);
                }
                else if (ch == 10)
                {
                    if (isNoteOn) ch10Ons.push_back(m.bytes[1]);
                    else if (isNoteOff) ch10Offs.push_back(m.bytes[1]);
                }
            }
        }

        bool had60On = false, had65On = false, had60OffTwice = false;
        int count60Off = 0;
        for (int n : ch1Ons) { if (n == 60) had60On = true; if (n == 65) had65On = true; }
        for (int n : ch1Offs) { if (n == 60) ++count60Off; }
        had60OffTwice = (count60Off >= 2);
        const bool drumUntouched = (!ch10Ons.empty() && ch10Ons[0] == 36 && ch10Ons.back() == 36);
        check(had60On && had65On && had60OffTwice && drumUntouched,
              "T4: Scene transpose shifts chromatic part to 65 at barline, leaves DrumMap at 36, and releases 60 without hanging");
    }

    // T5: Song Mode loop transitions blocks across barlines and wraps cleanly
    {
        McxEngine e;
        e.prepare(44100.0);
        e.setMasterTempoBpm(120.0f);
        e.songAndScenes().setScene(0, 0x0000u, 0, "A");
        e.songAndScenes().setScene(1, 0x0001u, 1, "B");
        e.songAndScenes().clearStagingBlocks();
        e.songAndScenes().addStagingBlock(0, 1, 2); // Block 0: S1 1 bar, tr 0+2 = +2
        e.songAndScenes().addStagingBlock(1, 1, 3); // Block 1: S2 1 bar, tr 1+3 = +4, mute P1
        e.songAndScenes().commitStagingBlocks(true);
        e.setSongModeEnabled(true);
        e.setSequencerPlaying(true, true);

        pumpAudio(e, 2048);
        const auto b0 = e.songAndScenes().readTelemetry();
        pumpAudio(e, 88200); // Bar 1 -> Block 1
        const auto b1 = e.songAndScenes().readTelemetry();
        const bool p0MutedAtB1 = e.part(0).mute;
        pumpAudio(e, 88200); // Bar 2 -> Wrap to Block 0
        const auto b2 = e.songAndScenes().readTelemetry();

        check(b0.songBlockIdx == 0 && b0.appliedTranspose == 2 && b0.appliedMuteMask == 0u
                  && b1.songBlockIdx == 1 && b1.appliedTranspose == 4 && b1.appliedMuteMask == 1u && p0MutedAtB1
                  && b2.songBlockIdx == 0 && b2.appliedTranspose == 2 && !e.part(0).mute && e.isSequencerRunning(),
              "T5: Looped Song Mode advances block index, mute mask & transpose on each barline and wraps back to Block 0");
    }

    // T6: Song Mode One-Shot (loop=false) stops sequencer and emits 0xFC at end of arrangement
    {
        McxEngine e;
        McxMidiOutQueue<1024> q;
        e.setOutboundMidiQueue(&q);
        e.prepare(44100.0);
        e.setMasterTempoBpm(120.0f);
        e.songAndScenes().clearStagingBlocks();
        e.songAndScenes().addStagingBlock(0, 1, 0);
        e.songAndScenes().addStagingBlock(1, 1, 0);
        e.songAndScenes().commitStagingBlocks(false);
        e.setSongModeEnabled(true);
        e.setSequencerPlaying(true, true);

        pumpAudio(e, 176400 + 2048); // 2 full bars + margin
        bool gotStop = false;
        std::vector<int> ons, offs;
        drainNoteEvents(q, 1, ons, offs, &gotStop);
        check(!e.isSequencerRunning() && gotStop && e.getActiveVoiceCount() == 0,
              "T6: One-Shot Song Mode stops cleanly at final barline and emits MIDI Stop (0xFC)");
    }

    // T7: DAW host transport seek jumps to corresponding Song Block & applies scene
    {
        McxEngine e;
        e.prepare(44100.0);
        e.songAndScenes().setScene(0, 0x0000u, 0, "Intro");
        e.songAndScenes().setScene(1, 0x0004u, 7, "Verse");
        e.songAndScenes().setScene(2, 0x0008u, -3, "Chorus");
        e.songAndScenes().clearStagingBlocks();
        e.songAndScenes().addStagingBlock(0, 2, 0); // Bars 0..1
        e.songAndScenes().addStagingBlock(1, 2, 0); // Bars 2..3 (PPQ 8.0)
        e.songAndScenes().addStagingBlock(2, 2, 0); // Bars 4..5 (PPQ 16.0)
        e.songAndScenes().commitStagingBlocks(false);
        e.setSongModeEnabled(true);

        e.syncHostTransport(true, 120.0, 8.0, true); // Bar 2 -> Block 1
        const auto s1 = e.songAndScenes().readTelemetry();
        const bool p2MutedAtS1 = e.part(2).mute;
        const int trAtS1 = e.getTransposer().getTransposeSemitones();
        e.syncHostTransport(true, 120.0, 16.0, true); // Bar 4 -> Block 2
        const auto s2 = e.songAndScenes().readTelemetry();
        check(s1.songBlockIdx == 1 && s1.activeScene == 1 && p2MutedAtS1 && trAtS1 == 7
                  && s2.songBlockIdx == 2 && s2.activeScene == 2 && e.part(3).mute && e.getTransposer().getTransposeSemitones() == -3,
              "T7: DAW host transport PPQ seek selects matching Song Block, scene mutes, and transpose");
    }

    // T8: JSON codec round-trips custom scenes (names, masks, transpose) and Song arrangement faithfully
    {
        McxSongAndScenes src, dst;
        src.setScene(2, 0xA55Au, -7, "Acid \"Lead\"");
        src.clearStagingBlocks();
        src.addStagingBlock(2, 8, -2);
        src.addStagingBlock(5, 4, 4);
        src.commitStagingBlocks(false);
        src.setSongMode(true);

        const std::string json = serializeSongAndScenesJson(src);
        const bool ok = deserializeSongAndScenesJson(dst, json);
        const auto dtel = dst.readTelemetry();
        const auto blk0 = dst.getActiveSongBlock(0);
        const auto blk1 = dst.getActiveSongBlock(1);
        const bool c_ok = ok;
        const bool c_mode = dtel.songMode;
        const bool c_loop = !dtel.songLoop;
        const bool c_cnt = (dtel.songBlockCount == 2);
        const bool c_mask = (dst.scene(2).muteMask == 0xA55Au);
        const bool c_tr = (dst.scene(2).transposeSemitones == -7);
        const bool c_name = (std::strcmp(dst.scene(2).name, "Acid \"Lead\"") == 0);
        const bool c_b0 = (blk0.sceneIndex == 2 && blk0.bars == 8 && blk0.transposeOffset == -2);
        const bool c_b1 = (blk1.sceneIndex == 5 && blk1.bars == 4 && blk1.transposeOffset == 4);
        const bool allOk = c_ok && c_mode && c_loop && c_cnt && c_mask && c_tr && c_name && c_b0 && c_b1;
        if (!allOk)
            std::printf("  [T8-DIAG] ok=%d mode=%d !loop=%d cnt=%d mask=%d tr=%d name=%d ('%s') b0=%d b1=%d\n",
                        c_ok, c_mode, c_loop, c_cnt, c_mask, c_tr, c_name, dst.scene(2).name, c_b0, c_b1);
        check(allOk, "T8: Song & Scenes JSON codec round-trips scene names/masks/transposes and blocks cleanly");
    }

    std::printf("\n=== Results: %d passed, %d failed ===\n", gPassed, gFailed);
    return (gFailed == 0) ? 0 : 1;
}
