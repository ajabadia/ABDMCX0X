#include "../Source/Core/McxPadLayerSelector.h"
#include "Core/McxMidiLearnDiskLibrary.h"
#include "DSP/Core/McxEngine.h"
#include "Sequencer/McxSongAndScenes.h"

#include <algorithm>
#include <cstdio>
#include <filesystem>
#include <string>
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
} // namespace

int main()
{
    std::printf("=== ABDMCX0X Phase 15 Live Perf (MIDI Learn Disk + Quantized Mute) Tests ===\n");

    // T1: Disk library scan, port-name matching & hardware ID matching
    {
        const std::string factoryDir =
#ifdef MCX_MIDILEARN_DIR
            MCX_MIDILEARN_DIR;
#else
            "MidiLearn";
#endif
        const auto tmpWork = std::filesystem::temp_directory_path() / "abdmcx0x_p15_ml_test";
        std::error_code ec;
        std::filesystem::remove_all(tmpWork, ec);

        McxMidiLearnDiskLibrary lib;
        const std::size_t count = lib.scanDirectories(tmpWork.string(), factoryDir, true);
        const auto* mc = lib.matchPortName("USB Roland MC-303 In");
        const auto* dr = lib.matchPortName("BOSS DR-5 Port 1");
        const auto* gen = lib.matchPortName("Generic Controller MIDI");
        const auto* hw = lib.matchHardwareProfileId("boss_dr5");
        const std::string json = lib.serializeCatalogJson();

        check(count >= 5u && std::filesystem::exists(tmpWork / "roland_mc303.json", ec),
              "T1a: Disk library seeds WorkingDir/MidiLearn and loads >= 5 validated profiles");
        check(mc && mc->device == "roland_mc303" && dr && dr->device == "boss_dr5"
                  && gen && gen->device == "generic_cc" && hw && hw->device == "boss_dr5",
              "T1b: Port-name and Identity-ID matchers resolve hardware above generic_cc");
        check(json.find("\"profiles\":[") != std::string::npos && json.find("\"emu_emax2\"") != std::string::npos,
              "T1c: Catalog serialization embeds valid profile JSON entries");

        std::filesystem::remove_all(tmpWork, ec);
    }

    // T2: Bar-quantized Track Mute (mid-bar queue, double-toggle cancel, apply at bar boundary, immediate override)
    {
        McxEngine e;
        e.prepare(44100.0);
        e.setMasterTempoBpm(120.0f);
        e.setMuteQuantizeToBar(true);
        e.setSequencerPlaying(true, true);

        e.togglePartMuteQuantized(0, false);
        const bool queuedOnce = (!e.part(0).mute && (e.songAndScenes().quantizedMute().readTelemetry().queuedPartMuteMask & 1ull) != 0ull);
        e.togglePartMuteQuantized(0, false);
        const bool cancelledTwice = (!e.part(0).mute && e.songAndScenes().quantizedMute().readTelemetry().queuedPartMuteMask == 0ull);

        e.togglePartMuteQuantized(0, false);
        e.togglePartMuteQuantized(1, true); // Shift / immediate override
        const bool immApplied = e.part(1).mute && !e.part(0).mute;

        // 1 bar @ 120 BPM = 2.0 s = 88200 samples; pump 92000 samples across bar boundary
        pumpAudio(e, 92000);
        const auto qmTel = e.songAndScenes().quantizedMute().readTelemetry();
        check(queuedOnce && cancelledTwice && immApplied && e.part(0).mute
                  && qmTel.queuedPartMuteMask == 0ull && qmTel.muteApplySeq >= 2u,
              "T2: Bar-quantized track mute queues mid-bar, cancels on double toggle, and flips at bar boundary");
    }

    // T3: Bar-quantized Bank Mute
    {
        McxEngine e;
        e.prepare(44100.0);
        e.setMasterTempoBpm(120.0f);
        e.setMuteQuantizeToBar(true);
        e.setSequencerPlaying(true, true);

        e.toggleBankMuteQuantized(0, false);
        const bool stillAudibleMidBar = !e.bankLayout().isBankMuted(0)
            && ((e.songAndScenes().quantizedMute().readTelemetry().queuedBankMuteMask & 1u) != 0u);
        pumpAudio(e, 92000);
        const auto qmTel = e.songAndScenes().quantizedMute().readTelemetry();
        check(stillAudibleMidBar && e.bankLayout().isBankMuted(0)
                  && qmTel.queuedBankMuteMask == 0u && (qmTel.appliedBankMuteMask & 1u) != 0u,
              "T3: Bar-quantized bank mute defers until bar boundary and updates bankMuteMask cleanly");
    }

    // T4: Drum pad layers route the internal voice; untouched pads keep their original note.
    {
        struct Recorder final : abd::engines::ISoundEngine {
            int notes[16] {}; int count = 0; int offNote = -1;
            void prepare(double, int) noexcept override {}
            void reset() noexcept override {}
            const char* getEngineTypeId() const noexcept override { return "test.drumrec"; }
            const char* getEngineDisplayName() const noexcept override { return "Drum Recorder"; }
            bool supportsDrumMode() const noexcept override { return true; }
            const abd::engines::EngineControlInputDescriptor* getControlInputDescriptors(std::size_t& n) const noexcept override { n = 0; return nullptr; }
            void setControlInputs(const float*, std::size_t) noexcept override {}
            void clearControlInputs() noexcept override {}
            void setTransportContext(const abd::engines::EngineTransportContext&) noexcept override {}
            void noteOn(int note, float, float) noexcept override { if (count < 16) notes[count++] = note; }
            void noteOff(int note) noexcept override { offNote = note; }
            void allNotesOff() noexcept override {}
            bool renderBlock(float*, float*, int) noexcept override { return false; }
        };

        auto mk = [](std::uint8_t lo, std::uint8_t hi, std::uint8_t slot, McxPadPlayMode mode) {
            McxPadLayer l {}; l.velMin = lo; l.velMax = hi; l.sampleSlot = slot; l.playMode = mode; return l;
        };
        McxEngine e;
        e.prepare(44100.0);
        Recorder rec;
        e.setPartSoundEngine(0, &rec);
        e.setPartKind(0, McxPartKind::DrumMap);

        McxPadLayerConfig zones {};
        zones.layerCount = 2;
        zones.layers[0] = mk(0, 63, 38, McxPadPlayMode::VelocityZone);
        zones.layers[1] = mk(64, 127, 40, McxPadPlayMode::VelocityZone);
        McxPadLayerConfig rr {};
        rr.layerCount = 2;
        rr.layers[0] = mk(0, 127, 42, McxPadPlayMode::RoundRobin);
        rr.layers[1] = mk(0, 127, 44, McxPadPlayMode::RoundRobin);
        e.setPartPadLayerConfig(0, 0, zones);
        e.setPartPadLayerConfig(0, 1, rr);

        e.triggerPartNoteOn(0, 36, 0.3f);  // GM pad 0, soft zone
        e.triggerPartNoteOn(0, 36, 0.9f);  // GM pad 0, loud zone
        e.triggerPartNoteOn(0, 0, 0.9f);   // raw pad 0, loud zone
        e.triggerPartNoteOn(0, 37, 0.8f);  // GM pad 1, RR hit 1
        e.triggerPartNoteOn(0, 37, 0.8f);  // GM pad 1, RR hit 2
        e.triggerPartNoteOn(0, 39, 0.8f);  // GM pad 3, no layers

        const bool routed = rec.count == 6 && rec.notes[0] == 38 && rec.notes[1] == 40
            && rec.notes[2] == 40 && rec.notes[3] == 42 && rec.notes[4] == 44 && rec.notes[5] == 39;
        check(routed, "T4a: Velocity zones, raw pad indices and round robin select the expected drum slot/note");
        check(e.part(0).padRrCounters[0] == 0 && e.part(0).padRrCounters[1] == 2
              && e.part(0).padLayerRng == 0xA5A51234u,
              "T4b: Layer counters advance only on the matching mode; empty layers preserve the note");
        check(e.getPartPadLayerConfig(0, 0).layers[1].sampleSlot == 40
              && e.getPartPadLayerConfig(0, 0).layerCount == 2
              && e.getPartPadLayerConfig(-1, 0).layerCount == 0
              && e.getPartPadLayerConfig(0, 99).layerCount == 0,
              "T4c: Pad layer config accessors copy the config and guard out-of-range indices");
        e.releasePartNoteOff(0, 36);
        check(rec.offNote == 40, "T4d: Note-off releases the layer-resolved note held in the latch");
    }

    std::printf("Phase 15 Tests: %d passed, %d failed\n", gPassed, gFailed);
    return gFailed > 0 ? 1 : 0;
}
