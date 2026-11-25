#pragma once

#include "Core/McxWavWriter.h"
#include "DSP/Core/McxEngine.h"
#include "MIDI/McxMidiOutQueue.h"
#include "Sequencer/McxPatternSequencer.h"

#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

namespace abdmcx::test_ext
{

template <typename CheckFn, typename RenderRmsFn>
inline void runExtendedSequencerTests(CheckFn&& check, RenderRmsFn&& renderRms)
{
    using namespace abdmcx;
    // T9: Live recording Overdub vs Replace + serializePartPatternJson
    {
        McxPatternSequencer seq;
        seq.prepare(44100.0);
        seq.setBars(1);
        seq.setRecordQuantizeSteps(16);
        seq.clearStagingPart(0);
        seq.addStagingEvent(0, 0, 24, 60, 100, false);
        seq.commitStagingPart(0);

        seq.setRecordMode(McxPatternSequencer::RecordMode::Overdub);
        seq.setRecording(true);
        seq.recordLiveNoteOn(0, 64, 110);
        char buf[4096] {};
        (void)seq.serializePartPatternJson(0, buf, sizeof(buf));
        std::string s1(buf);
        const bool overdubOk = (s1.find("\"midiNote\":60") != std::string::npos)
            && (s1.find("\"midiNote\":64") != std::string::npos);

        seq.setRecording(false);
        seq.setRecordMode(McxPatternSequencer::RecordMode::Replace);
        seq.setRecording(true);
        seq.recordLiveNoteOn(0, 72, 120);
        (void)seq.serializePartPatternJson(0, buf, sizeof(buf));
        std::string s2(buf);
        const bool replaceOk = (s2.find("\"midiNote\":72") != std::string::npos)
            && (s2.find("\"midiNote\":60") == std::string::npos);
        check(overdubOk && replaceOk && seq.getRecordedPatternRev() >= 2u,
              "T9: Overdub vs Replace live recording & serializePartPatternJson verified");
    }

    // T10: Count-in delay (when REC armed), Pause, Seek by bars, and Return to Zero
    {
        McxPatternSequencer seq;
        seq.prepare(44100.0);
        seq.setBars(2);
        seq.setBpm(120.0);
        seq.setCountInBars(1);
        seq.setRecording(true);
        seq.clearStagingPart(0);
        seq.addStagingEvent(0, 0, 24, 60, 100, false);
        seq.commitStagingPart(0);
        seq.start(true);
        const bool countStarted = seq.isRunning() && seq.isCountingIn() && seq.getCountInRemainingTicks() == 384;
        int notesFired = 0;
        McxSequencerCallbacks cbs {};
        cbs.ctx = &notesFired;
        cbs.onNoteOn = [](void* ud, int, std::uint8_t, std::uint8_t, bool, std::int32_t) noexcept { ++(*static_cast<int*>(ud)); };
        for (int i = 0; i < 80; ++i) seq.processBlock(1024, cbs, 0);
        const bool duringCountIn = seq.isCountingIn() && notesFired == 0;
        for (int i = 0; i < 10; ++i) seq.processBlock(1024, cbs, 0);
        const bool afterCountIn = !seq.isCountingIn() && notesFired >= 1;
        seq.pause();
        const bool pausedOk = seq.isPaused() && !seq.isRunning();
        seq.seekByBars(1, cbs, 0);
        const bool seekOk = seq.getCurrentTick() == 384;
        seq.returnToZero(cbs, 0);
        check(countStarted && duringCountIn && afterCountIn && pausedOk && seekOk && seq.getCurrentTick() == 0,
              "T10: Count-in bars, Pause, Seek +/-1 bar, and Return to Zero verified");
    }

    // T11: Offline Bounce PCM16 WAV & full engine state restoration
    {
        McxEngine e;
        e.prepare(44100.0);
        e.part(0).level = 0.8f;
        e.part(1).mute = true;
        e.setGlobalTranspose(2);
        e.sequencer().clearStagingPart(0);
        e.sequencer().addStagingEvent(0, 0, 48, 60, 110, false);
        e.sequencer().commitStagingPart(0);

        OfflineBounceOptions opts;
        opts.sampleRate = 44100.0;
        opts.patternBars = 1;
        opts.tailSeconds = 0.05f;
        opts.isolatePart = 0;
        std::vector<std::uint8_t> wav;
        const bool ok = renderEngineOfflineWav(e, opts, wav);
        const bool hdr = wav.size() > 44 && std::memcmp(wav.data(), "RIFF", 4) == 0 && std::memcmp(wav.data() + 8, "WAVE", 4) == 0;
        const bool restored = e.part(1).mute && !e.part(0).solo && e.getTransposer().getTransposeSemitones() == 2;
        check(ok && hdr && restored, "T11: McxWavWriter offline bounce renders PCM16 WAV and restores mute/solo/transpose");
    }

    // T12: Hardware MIDI inbound auto-records when seqRecording enabled
    {
        McxEngine e;
        e.prepare(44100.0);
        e.setSequencerRecordConfig(0, 0, 16);
        e.sequencer().setRecording(true);
        (void)renderRms(e, 128);
        e.routeMidiPortChannelNoteOn(0, 1, 67, 0.9f, 0);
        e.routeMidiPortChannelNoteOff(0, 1, 67, 0);
        char buf[2048] {};
        (void)e.sequencer().serializePartPatternJson(0, buf, sizeof(buf));
        check(e.getSequencerRecordedRev() >= 1u && std::string(buf).find("\"midiNote\":67") != std::string::npos,
              "T12: Hardware MIDI inbound routes into pattern recorder when REC armed");
    }
}

} // namespace abdmcx::test_ext
