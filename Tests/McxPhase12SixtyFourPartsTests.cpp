#include "../Source/Core/McxBankManagerBridge.h"
#include "../Source/DSP/Core/McxEngine.h"
#include "../Source/Hardware/McxHardwareBridge.h"
#include "../Source/Sequencer/McxPatternSequencer.h"
#include "../Source/Sequencer/McxSongAndScenes.h"
#include "../Source/Sequencer/McxSongJsonCodec.h"

#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstring>
#include <iostream>
#include <memory>
#include <string>
#include <vector>

namespace
{

void pumpAudio(abdmcx::McxEngine& e, int totalSamples)
{
    std::vector<float> l(256, 0.0f), r(256, 0.0f);
    for (int pos = 0; pos < totalSamples; pos += 256)
        e.processAudio(l.data(), r.data(), std::min(256, totalSamples - pos));
}

void testT1_SixtyFourPartDefaultInitAndZeroIdleAudio()
{
    auto e = std::make_unique<abdmcx::McxEngine>();
    e->prepare(44100.0);

    for (int i = 0; i < 16; ++i) assert(e->part(i).enabled);
    assert(e->part(9).isDrumKit && e->part(9).midiChannel == 10);
    for (int i = 16; i < abdmcx::McxEngine::kNumParts; ++i)
    {
        assert(!e->part(i).enabled);
        assert(!e->part(i).isDrumKit);
        assert(e->part(i).midiInPortIndex == -1);
    }

    const auto& layout = e->bankLayout();
    assert(layout.bankCount == 2 && layout.activeBank == 0);
    assert(layout.pinnedMask == 0x000000000000FFFFull);
    assert(layout.usedPartsMask() == 0x000000000000FFFFull);

    std::vector<float> l(1024, 0.0f), r(1024, 0.0f);
    e->processAudio(l.data(), r.data(), 1024);
    for (float s : l) assert(s == 0.0f);
    assert(e->getActiveVoiceCount() == 0);
    std::cout << "[T1] 64-part default init (A+B enabled, 16..63 clean disabled, 0 idle CPU) verified.\n";
}

void testT2_MultiPortInboundIsolationAndSharedPortChannelOut()
{
    auto e = std::make_unique<abdmcx::McxEngine>();
    abdmcx::McxMidiOutQueue<1024> outQ;
    e->setOutboundMidiQueue(&outQ);
    e->prepare(44100.0);

    // Kick (part 17) + Snare (part 18) sharing hardware port 3 & CH 10
    e->setPartEnabled(17, true);
    e->setPartEnabled(18, true);
    for (int pIdx : { 17, 18 })
    {
        auto& pt = e->part(pIdx);
        pt.routeMode = abdmcx::McxPartRouteMode::ExternalMidi;
        pt.midiPortIndex = 3;
        pt.midiChannel = 10;
    }
    e->triggerPartNoteOn(17, 36, 0.90f, 0);
    e->triggerPartNoteOn(18, 38, 0.85f, 4);
    assert(e->getActiveVoiceCount() == 0 && outQ.size() == 2);

    abdmcx::McxMidiOutMessage m1 {}, m2 {};
    assert(outQ.pop(m1) && outQ.pop(m2));
    assert(m1.portIndex == 3 && m1.bytes[0] == 0x99 && m1.bytes[1] == 36);
    assert(m2.portIndex == 3 && m2.bytes[0] == 0x99 && m2.bytes[1] == 38);

    // Inbound port isolation: CH 1 on port 0 hits only part 0; CH 1 on port 2 hits only part 16
    e->setPartEnabled(16, true);
    e->part(16).routeMode = abdmcx::McxPartRouteMode::Internal;
    e->part(16).midiChannel = 1;
    e->part(16).midiInPortIndex = 2;

    e->routeMidiPortChannelNoteOn(0, 1, 60, 0.8f, 0);
    auto& pool = e->engineRegistry().romplerPool();
    assert(pool.getOwnerActiveVoiceCount(0) == 1 && pool.getOwnerActiveVoiceCount(16) == 0);

    e->routeMidiPortChannelNoteOn(2, 1, 64, 0.8f, 0);
    assert(pool.getOwnerActiveVoiceCount(0) == 1 && pool.getOwnerActiveVoiceCount(16) == 1);

    e->routeMidiPortChannelCc(0, 1, 64, 127);
    e->routeMidiPortChannelNoteOff(0, 1, 60, 0);
    assert(pool.hasHeldMelodicVoice(0) == false && pool.getOwnerActiveVoiceCount(0) == 1);
    assert(pool.getOwnerActiveVoiceCount(16) == 1);
    e->routeMidiPortChannelNoteOff(2, 1, 64, 0);
    e->routeMidiPortChannelCc(0, 1, 64, 0);
    std::cout << "[T2] Multi-port inbound isolation & shared hardware (port, ch) split verified.\n";
}

void testT3_DisablePartChokesVoicesAndClearsSolo()
{
    auto e = std::make_unique<abdmcx::McxEngine>();
    e->prepare(44100.0);
    e->setPartEnabled(20, true);
    e->part(20).solo = true;
    e->triggerPartNoteOn(20, 60, 0.9f);
    assert(e->engineRegistry().romplerPool().getOwnerActiveVoiceCount(20) == 1);
    assert(e->isAnyPartSoloed() && !e->isPartAudible(0));

    e->setPartEnabled(20, false);
    pumpAudio(*e, 1024);
    assert(!e->part(20).enabled && !e->part(20).solo);
    assert(!e->isAnyPartSoloed() && e->isPartAudible(0));
    assert(e->getActiveVoiceCount() == 0);
    std::cout << "[T3] setPartEnabled(false) chokes voices, clears solo & frees audio cleanly.\n";
}

void testT4_SixtyFourBitSceneMasksAndJsonRoundtrip()
{
    auto e = std::make_unique<abdmcx::McxEngine>();
    e->prepare(44100.0);
    e->setPartEnabled(31, true);
    e->setPartEnabled(47, true);
    e->setPartEnabled(63, true);

    const std::uint64_t expectedMask =
        (1ull << 0) | (1ull << 15) | (1ull << 16) | (1ull << 31) | (1ull << 47) | (1ull << 63);
    e->songAndScenes().setScene(2, expectedMask, -4, "HighBankMask");
    e->triggerScene(2, true);

    assert(e->part(0).mute && !e->part(1).mute && e->part(15).mute && e->part(16).mute);
    assert(e->part(31).mute && e->part(47).mute && !e->part(62).mute && e->part(63).mute);
    assert(e->getTransposer().getTransposeSemitones() == -4);

    e->captureCurrentToScene(5);
    assert(e->songAndScenes().scene(5).muteMask == expectedMask);

    const std::string json = abdmcx::serializeSongAndScenesJson(e->songAndScenes());
    abdmcx::McxSongAndScenes restored;
    assert(abdmcx::deserializeSongAndScenesJson(restored, json));
    assert(restored.scene(2).muteMask == expectedMask);
    assert(restored.scene(5).muteMask == expectedMask);

    // Legacy v1 song JSON fallback (16-bit muteMask only)
    const std::string v1Song = R"({"formatId":"abd_mcx_song_scenes_v1","songMode":false,"songLoop":true,"scenes":[{"index":1,"name":"Legacy","muteMask":4101,"transpose":2}],"blocks":[]})";
    abdmcx::McxSongAndScenes fromV1;
    assert(abdmcx::deserializeSongAndScenesJson(fromV1, v1Song));
    assert(fromV1.scene(1).muteMask == 4101ull && fromV1.scene(1).transposeSemitones == 2);
    std::cout << "[T4] 64-bit scene mute masks, JSON codec & v1 backward compatibility verified.\n";
}

void testT5_SixtyFourPartSequencerAndGroove()
{
    auto e = std::make_unique<abdmcx::McxEngine>();
    e->prepare(44100.0);
    e->setMasterTempoBpm(120.0f);
    e->setPartEnabled(55, true);
    e->part(55).reverbSend = 0.0f;
    e->part(55).chorusSend = 0.0f;
    e->part(55).partials[0].cutoffHz = 12000.0f;

    e->sequencer().setPartSwing50to75(55, 0.75f);
    assert(e->sequencer().groove().getEffectiveGroove(55).amount > 0.9f);

    abdmcx::McxPatternSequencer::PartPattern p0 {}, p55 {};
    p0.eventCount = 1;
    p0.events[0] = { 0, 24, 48, 100, false, true };
    p55.eventCount = 2;
    p55.events[0] = { 0, 24, 60, 110, false, true };
    p55.events[1] = { 24, 24, 67, 100, false, true };
    e->sequencer().replacePartPattern(0, p0);
    e->sequencer().replacePartPattern(55, p55);

    e->setSequencerPlaying(true, true);
    pumpAudio(*e, 12000);
    assert(e->getPartPeaks()[0] > 0.001f && e->getPartPeaks()[55] > 0.001f);

    e->setSequencerPlaying(false, true);
    pumpAudio(*e, 1024);
    assert(e->getActiveVoiceCount() == 0);
    std::cout << "[T5] 64-part Sequencer + GrooveShuffleEngine (part 0 & part 55) verified.\n";
}

void testT6_BankManagerV2PersistenceAndV1Fallback()
{
    auto src = std::make_unique<abdmcx::McxEngine>();
    src->prepare(44100.0);
    abdmcx::McxHardwareBridge brSrc(*src);

    auto& layout = src->bankLayout();
    layout.bankCount = 3;
    layout.activeBank = 2;
    layout.slots[2][0] = 20;
    layout.setPinned(0, false);
    layout.setPinned(20, true);

    src->setPartEnabled(20, true);
    src->part(20).routeMode = abdmcx::McxPartRouteMode::BothAB;
    src->part(20).midiPortIndex = 4;
    src->part(20).midiInPortIndex = 2;
    src->part(20).midiChannel = 7;
    src->part(20).setMidiOutDeviceName("Roland JV-1080");
    src->part(20).setMidiInDeviceName("Keystep Pro");
    src->setPartPresetName(20, "RackLead 20");

    const std::string v2Json = abdmcx::McxBankManagerBridge::serializeToJson(*src, brSrc, "V2Multi");
    assert(v2Json.find("abd_mcx0x_preset_v2") != std::string::npos);

    auto dst = std::make_unique<abdmcx::McxEngine>();
    dst->prepare(44100.0);
    abdmcx::McxHardwareBridge brDst(*dst);
    assert(abdmcx::McxBankManagerBridge::deserializeFromJson(*dst, brDst, v2Json));

    assert(dst->bankLayout().bankCount == 3 && dst->bankLayout().activeBank == 2);
    assert(dst->bankLayout().slots[2][0] == 20);
    assert(!dst->bankLayout().isPinned(0) && dst->bankLayout().isPinned(20));
    assert(dst->part(20).enabled && dst->part(20).midiPortIndex == 4 && dst->part(20).midiInPortIndex == 2);
    assert(dst->part(20).midiChannel == 7 && std::strcmp(dst->part(20).midiOutDeviceName, "Roland JV-1080") == 0);
    assert(std::strcmp(dst->part(20).midiInDeviceName, "Keystep Pro") == 0);
    assert(std::strcmp(dst->getPartDisplayPresetName(20), "RackLead 20") == 0);
    assert(!dst->part(21).enabled);

    // Legacy v1 preset JSON fallback
    const std::string v1Json = R"({"schema":"abd_mcx0x_preset_v1","name":"OldV1","parts":[{"index":0,"presetName":"LegacyZero","midiChannel":3,"midiPortIndex":2,"level":0.66}]})";
    auto dstV1 = std::make_unique<abdmcx::McxEngine>();
    dstV1->prepare(44100.0);
    abdmcx::McxHardwareBridge brV1(*dstV1);
    assert(abdmcx::McxBankManagerBridge::deserializeFromJson(*dstV1, brV1, v1Json));
    assert(dstV1->part(0).enabled && dstV1->part(15).enabled && !dstV1->part(16).enabled);
    assert(dstV1->part(0).midiChannel == 3 && dstV1->part(0).midiPortIndex == 2);
    assert(dstV1->bankLayout().bankCount == 2 && dstV1->bankLayout().pinnedMask == 0x000000000000FFFFull);
    std::cout << "[T6] BankManager v2 persistence (3 banks, pins, devices) & v1 fallback verified.\n";
}

} // namespace

int main()
{
    std::cout << "=== ABDMCX0X Phase 13A: 64-Part Core, Multi-Port & 64-Bit Scene Tests ===\n";
    testT1_SixtyFourPartDefaultInitAndZeroIdleAudio();
    testT2_MultiPortInboundIsolationAndSharedPortChannelOut();
    testT3_DisablePartChokesVoicesAndClearsSolo();
    testT4_SixtyFourBitSceneMasksAndJsonRoundtrip();
    testT5_SixtyFourPartSequencerAndGroove();
    testT6_BankManagerV2PersistenceAndV1Fallback();
    std::cout << "=== All Phase 13A Tests PASSED (6/6) ===\n";
    return 0;
}
