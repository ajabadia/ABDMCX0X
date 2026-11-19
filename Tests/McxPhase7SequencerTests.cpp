#include "DSP/Core/McxEngine.h"
#include "MIDI/McxMidiOutQueue.h"
#include "Sequencer/McxPatternSequencer.h"

#include <cmath>
#include <cstdio>
#include <vector>

using namespace abdmcx;

namespace
{
int gPassed = 0;
int gFailed = 0;

void check(bool cond, const char* msg)
{
    if (cond)
    {
        ++gPassed;
        std::printf("  [PASS] %s\n", msg);
    }
    else
    {
        ++gFailed;
        std::printf("  [FAIL] %s\n", msg);
    }
}

float renderRms(McxEngine& e, int numSamples)
{
    std::vector<float> l(static_cast<std::size_t>(numSamples), 0.0f);
    std::vector<float> r(static_cast<std::size_t>(numSamples), 0.0f);
    e.processAudio(l.data(), r.data(), numSamples);
    double sum = 0.0;
    for (float s : l) sum += static_cast<double>(s) * s;
    return static_cast<float>(std::sqrt(sum / static_cast<double>(numSamples)));
}

int findFirstMidiNoteSample(McxEngine& e, McxMidiOutQueue<1024>& q, std::uint8_t statusMask, std::uint8_t note, int totalSamples)
{
    std::vector<float> l(256, 0.0f), r(256, 0.0f);
    for (int base = 0; base < totalSamples; base += 256)
    {
        e.processAudio(l.data(), r.data(), 256);
        McxMidiOutMessage msg {};
        while (q.pop(msg))
        {
            if (msg.length >= 2 && (msg.bytes[0] & 0xF0) == statusMask && msg.bytes[1] == note)
                return base + msg.sampleOffset;
        }
    }
    return -1;
}
} // namespace

int main()
{
    std::printf("=== ABDMCX0X Phase 2 PPQ Sequencer & MIDI Clock Tests ===\n");

    // T1: Idle sequencer emits 0 audio and 0 MIDI
    {
        McxEngine e;
        McxMidiOutQueue<1024> q;
        e.setOutboundMidiQueue(&q);
        e.prepare(44100.0);
        std::vector<float> l(2048, 0.0f), r(2048, 0.0f);
        e.processAudio(l.data(), r.data(), 2048);
        float maxAbs = 0.0f;
        for (float s : l) maxAbs = std::max(maxAbs, std::abs(s));
        check(maxAbs == 0.0f && q.empty(), "T1: Stopped sequencer produces 0 audio and 0 MIDI messages");
    }

    // T2: Internal PPQ pattern playback renders audio and releases cleanly after durationTicks
    {
        McxEngine e;
        e.prepare(44100.0);
        e.part(0).reverbSend = 0.0f;
        e.part(0).chorusSend = 0.0f;
        e.part(0).partials[0].ampEnv.t4Ms = 10.0f;
        McxPatternSequencer::PartPattern pat {};
        pat.eventCount = 1;
        pat.events[0] = { 0, 24, 60, 115, false, true }; // 1/16 at tick 0 with Roland Accent
        e.sequencer().replacePartPattern(0, pat);
        e.setMasterTempoBpm(120.0f);
        e.setSequencerPlaying(true, true);
        const float rmsStart = renderRms(e, 512);
        const int voicesDuringNote = e.getActiveVoiceCount();
        (void)renderRms(e, 16384); // Past duration (24 ticks = 5512 samples) + release
        check(rmsStart > 0.001f && voicesDuringNote >= 1 && e.getActiveVoiceCount() == 0,
              "T2: Internal PPQ playback produces audio and releases voices at durationTicks");
    }

    // T3: ExternalMidi track emits 0x90/0x80 with sampleOffset and 0 internal voices
    {
        McxEngine e;
        McxMidiOutQueue<1024> q;
        e.setOutboundMidiQueue(&q);
        e.prepare(44100.0);
        e.part(1).routeMode = McxPartRouteMode::ExternalMidi;
        e.part(1).midiChannel = 3;
        McxPatternSequencer::PartPattern pat {};
        pat.eventCount = 1;
        pat.events[0] = { 24, 24, 64, 100, false, true };
        e.sequencer().replacePartPattern(1, pat);
        e.setMasterTempoBpm(120.0f);
        e.setSequencerPlaying(true, true);
        bool gotOn = false, gotOff = false, offsetsOk = true;
        std::vector<float> l(256, 0.0f), r(256, 0.0f);
        for (int b = 0; b < 70; ++b)
        {
            e.processAudio(l.data(), r.data(), 256);
            McxMidiOutMessage m {};
            while (q.pop(m))
            {
                if (m.sampleOffset < 0 || m.sampleOffset >= 256) offsetsOk = false;
                if (m.length == 3 && m.bytes[0] == 0x92 && m.bytes[1] == 64) gotOn = true;
                if (m.length == 3 && m.bytes[0] == 0x82 && m.bytes[1] == 64) gotOff = true;
            }
        }
        check(gotOn && gotOff && offsetsOk && e.getActiveVoiceCount() == 0,
              "T3: ExternalMidi track emits sample-accurate NoteOn/NoteOff with 0 internal voices");
    }

    // T4: Sample-accurate MIDI Clock 0xFA / 0xF8 (24 PPQ -> 48..49/s at 120 BPM) / 0xFC
    {
        McxEngine e;
        McxMidiOutQueue<1024> q;
        e.setOutboundMidiQueue(&q);
        e.prepare(44100.0);
        e.part(2).routeMode = McxPartRouteMode::ExternalMidi;
        e.part(2).midiChannel = 5;
        McxPatternSequencer::PartPattern pat {};
        pat.eventCount = 1;
        pat.events[0] = { 0, 192, 67, 100, false, true }; // Held across stop
        e.sequencer().replacePartPattern(2, pat);
        e.setMasterTempoBpm(120.0f);
        e.setSequencerPlaying(true, true);

        bool firstIsStart = false;
        McxMidiOutMessage first {};
        if (q.pop(first))
            firstIsStart = (first.length == 1 && first.bytes[0] == 0xFA && first.priority == 0);

        int clockCount = 0;
        bool clockValid = true;
        std::vector<float> l(256, 0.0f), r(256, 0.0f);
        for (int processed = 0; processed < 44100; processed += 256)
        {
            const int n = std::min(256, 44100 - processed);
            e.processAudio(l.data(), r.data(), n);
            int lastClockOff = -1;
            McxMidiOutMessage m {};
            while (q.pop(m))
            {
                if (m.length == 1 && m.bytes[0] == 0xF8)
                {
                    ++clockCount;
                    if (m.priority != 0 || m.sampleOffset < lastClockOff || m.sampleOffset >= n)
                        clockValid = false;
                    lastClockOff = m.sampleOffset;
                }
            }
        }
        e.setSequencerPlaying(false, true);
        bool gotStop = false, gotRelease = false;
        McxMidiOutMessage m {};
        while (q.pop(m))
        {
            if (m.length == 1 && m.bytes[0] == 0xFC && m.priority == 0) gotStop = true;
            if (m.length == 3 && m.bytes[0] == 0x84 && m.bytes[1] == 67) gotRelease = true;
        }
        check(firstIsStart && clockValid && clockCount >= 48 && clockCount <= 49 && gotStop && gotRelease,
              "T4: MIDI Clock emits 0xFA, 48..49x 0xF8 (prio 0, monotonic), 0xFC and note release on Stop");
    }

    // T5: GrooveShuffleEngine real swing delays even 16th steps while downbeat stays intact
    {
        auto measureStep1 = [](float swing50to75, int& outDownbeat, int& outStep1) {
            McxEngine e;
            McxMidiOutQueue<1024> q;
            e.setOutboundMidiQueue(&q);
            e.prepare(44100.0);
            e.part(1).routeMode = McxPartRouteMode::ExternalMidi;
            e.part(1).midiChannel = 2;
            e.sequencer().setPartSwing50to75(1, swing50to75);
            McxPatternSequencer::PartPattern pat {};
            pat.eventCount = 2;
            pat.events[0] = { 0, 12, 60, 100, false, true };
            pat.events[1] = { 24, 12, 64, 100, false, true };
            e.sequencer().replacePartPattern(1, pat);
            e.setMasterTempoBpm(120.0f);
            e.setSequencerPlaying(true, true);
            outDownbeat = findFirstMidiNoteSample(e, q, 0x90, 60, 12000);
            e.setSequencerPlaying(false, true);
            q.clear();
            e.setSequencerPlaying(true, true);
            outStep1 = findFirstMidiNoteSample(e, q, 0x90, 64, 15000);
        };
        int db50 = -1, s50 = -1, db75 = -1, s75 = -1;
        measureStep1(0.50f, db50, s50);
        measureStep1(0.75f, db75, s75);
        check(db50 == 0 && db75 == 0 && s50 > 4500 && s75 > s50 + 2000,
              "T5: GrooveShuffle swing=0.75 delays even step significantly while keeping downbeat at 0");
    }

    // T6: Hot lock-free double-buffer pattern swap releases ringing notes cleanly
    {
        McxEngine e;
        McxMidiOutQueue<1024> q;
        e.setOutboundMidiQueue(&q);
        e.prepare(44100.0);
        e.part(1).routeMode = McxPartRouteMode::ExternalMidi;
        e.part(1).midiChannel = 1;
        McxPatternSequencer::PartPattern p1 {}, p2 {};
        p1.eventCount = 1; p1.events[0] = { 0, 96, 60, 100, false, true };
        p2.eventCount = 1; p2.events[0] = { 0, 24, 72, 100, false, true };
        e.sequencer().replacePartPattern(1, p1);
        e.setSequencerPlaying(true, true);
        (void)renderRms(e, 256); // Triggers note 60
        q.clear();
        e.sequencer().replacePartPattern(1, p2);
        (void)renderRms(e, 256); // Swaps cleanly and releases note 60
        bool released60 = false;
        McxMidiOutMessage m {};
        while (q.pop(m))
        {
            if (m.length == 3 && m.bytes[0] == 0x80 && m.bytes[1] == 60) released60 = true;
        }
        check(released60, "T6: Lock-free pattern swap releases ringing note cleanly with zero hangs");
    }

    // T7: Parameter motion lane playback updates Filter Cutoff
    {
        McxEngine e;
        e.prepare(44100.0);
        McxPatternSequencer::PartPattern pat {};
        pat.motionLanes[0].paramId = 0; // Cutoff
        pat.motionLanes[0].count = 2;
        pat.motionLanes[0].points[0] = { 0, 0.10f };
        pat.motionLanes[0].points[1] = { 12, 0.95f };
        e.sequencer().replacePartPattern(0, pat);
        e.setMasterTempoBpm(120.0f);
        e.setSequencerPlaying(true, true);
        (void)renderRms(e, 512);
        const float c0 = e.part(0).partials[0].cutoffHz;
        (void)renderRms(e, 4096); // Past tick 12 (2756 samples at 120 BPM / 44100 Hz)
        const float c1 = e.part(0).partials[0].cutoffHz;
        check(c0 < 100.0f && c1 > 10000.0f, "T7: Sequencer motion lane modulates Filter Cutoff on exact tick");
    }

    // T8: DAW host transport sync starts at 140 BPM and stops with 0xFC
    {
        McxEngine e;
        McxMidiOutQueue<1024> q;
        e.setOutboundMidiQueue(&q);
        e.prepare(44100.0);
        e.syncHostTransport(true, 140.0, 0.0, true);
        const bool started = e.isSequencerRunning() && std::abs(e.getMasterTempoBpm() - 140.0f) < 0.01f;
        bool gotFa = false, gotFc = false;
        McxMidiOutMessage m {};
        while (q.pop(m)) if (m.length == 1 && m.bytes[0] == 0xFA) gotFa = true;
        (void)renderRms(e, 256);
        e.syncHostTransport(false, 140.0, 0.25, true);
        while (q.pop(m)) if (m.length == 1 && m.bytes[0] == 0xFC) gotFc = true;
        check(started && gotFa && gotFc && !e.isSequencerRunning(),
              "T8: Host transport sync follows BPM, Start (0xFA) and Stop (0xFC)");
    }

    std::printf("\n=== Results: %d passed, %d failed ===\n", gPassed, gFailed);
    return (gFailed == 0) ? 0 : 1;
}
