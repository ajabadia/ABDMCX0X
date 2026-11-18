#include "Core/McxBankLoader.h"
#include "Core/McxParamRouter.h"
#include "DSP/Core/McxEngine.h"
#include "DspEffects/DspMultiBusFxRack.h"
#include "SynthCore/LfoAnalog.h"
#include "SynthCore/LcdTextFormatter.h"
#include "SynthCore/StickPlayer.h"
#include "SynthCore/VelocitySensitivityCurves.h"

#include <cassert>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <string>
#include <vector>

namespace
{
void appendU16LE(std::vector<std::uint8_t>& buf, std::uint16_t val)
{
    buf.push_back(static_cast<std::uint8_t>(val & 0xFF));
    buf.push_back(static_cast<std::uint8_t>((val >> 8) & 0xFF));
}

void appendU32LE(std::vector<std::uint8_t>& buf, std::uint32_t val)
{
    appendU16LE(buf, static_cast<std::uint16_t>(val & 0xFFFF));
    appendU16LE(buf, static_cast<std::uint16_t>((val >> 16) & 0xFFFF));
}

std::vector<std::uint8_t> createSyntheticPcm16Wav(float freqHz, float durationSec, int sampleRate = 44100)
{
    std::vector<std::uint8_t> wav {'R', 'I', 'F', 'F'};
    const int numSamples = static_cast<int>(durationSec * static_cast<float>(sampleRate));
    const int dataSize = numSamples * 2;
    appendU32LE(wav, static_cast<std::uint32_t>(36 + dataSize));
    wav.insert(wav.end(), {'W', 'A', 'V', 'E', 'f', 'm', 't', ' '});
    appendU32LE(wav, 16); appendU16LE(wav, 1); appendU16LE(wav, 1);
    appendU32LE(wav, static_cast<std::uint32_t>(sampleRate));
    appendU32LE(wav, static_cast<std::uint32_t>(sampleRate * 2));
    appendU16LE(wav, 2); appendU16LE(wav, 16);
    wav.insert(wav.end(), {'d', 'a', 't', 'a'});
    appendU32LE(wav, static_cast<std::uint32_t>(dataSize));

    for (int i = 0; i < numSamples; ++i)
    {
        const float s = std::sin(6.2831853f * freqHz * (static_cast<float>(i) / static_cast<float>(sampleRate))) * 0.75f;
        appendU16LE(wav, static_cast<std::uint16_t>(static_cast<std::int16_t>(s * 32767.0f)));
    }
    return wav;
}

void addZipStoreEntry(std::vector<std::uint8_t>& zip, const std::string& path, const std::vector<std::uint8_t>& data)
{
    appendU32LE(zip, 0x04034b50u);
    appendU16LE(zip, 20); appendU16LE(zip, 0); appendU16LE(zip, 0);
    appendU16LE(zip, 0); appendU16LE(zip, 0); appendU32LE(zip, 0);
    appendU32LE(zip, static_cast<std::uint32_t>(data.size()));
    appendU32LE(zip, static_cast<std::uint32_t>(data.size()));
    appendU16LE(zip, static_cast<std::uint16_t>(path.length())); appendU16LE(zip, 0);
    zip.insert(zip.end(), path.begin(), path.end());
    zip.insert(zip.end(), data.begin(), data.end());
}

std::vector<std::uint8_t> createTestAbdRomplerBank()
{
    std::vector<std::uint8_t> zip;
    const std::string manifest = R"({
  "schemaVersion": "1.0.0",
  "formatId": "abd_structured_rompler",
  "bankName": "McxCleanRoomBank",
  "author": "ABDSynths",
  "wavePool": [
    {"id": "w_0000", "name": "KickDrum", "rootKey": 36, "fineTuneCents": 0.0, "loopStartFrame": 0, "loopEndFrame": 0, "playMode": "oneshot"},
    {"id": "w_0001", "name": "ClosedHiHat", "rootKey": 42, "fineTuneCents": 0.0, "loopStartFrame": 0, "loopEndFrame": 0, "playMode": "oneshot"},
    {"id": "w_0002", "name": "OpenHiHat", "rootKey": 46, "fineTuneCents": 0.0, "loopStartFrame": 0, "loopEndFrame": 0, "playMode": "oneshot"}
  ],
  "tones": [
    {
      "id": "tone_001",
      "name": "RomBass",
      "structureMode": 0,
      "outputCharacter": 1
    }
  ],
  "drumKits": [
    {
      "id": "kit_001",
      "name": "StandardGrooveKit",
      "slots": [
        {"midiNote": 36, "name": "Kick", "toneId": "w_0000", "muteGroup": 0, "cutoffHzOverride": 12000.0, "triggerMode": "one_shot"},
        {"midiNote": 42, "name": "CHH", "toneId": "w_0001", "muteGroup": 1, "cutoffHzOverride": 14000.0, "triggerMode": "one_shot"},
        {"midiNote": 46, "name": "OHH", "toneId": "w_0002", "muteGroup": 1, "cutoffHzOverride": 15000.0, "triggerMode": "one_shot"}
      ]
    }
  ]
})";

    const std::vector<std::uint8_t> manifestBytes(manifest.begin(), manifest.end());
    const auto wavKick = createSyntheticPcm16Wav(60.0f, 0.15f);
    const auto wavCHH = createSyntheticPcm16Wav(8000.0f, 0.05f);
    const auto wavOHH = createSyntheticPcm16Wav(7500.0f, 0.40f);

    addZipStoreEntry(zip, "manifest.json", manifestBytes);
    addZipStoreEntry(zip, "samples/w_0000.wav", wavKick);
    addZipStoreEntry(zip, "samples/w_0001.wav", wavCHH);
    addZipStoreEntry(zip, "samples/w_0002.wav", wavOHH);

    return zip;
}
} // namespace

int main()
{
    std::cout << "=== ABDMCX0X Phase 4 Proprietary .abdbank Loader & De-Baking Tests ===" << std::endl;
    int passed = 0;

    const auto zipBank = createTestAbdRomplerBank();
    assert(!zipBank.empty());

    abdmcx::McxBankLoader loader;
    const bool loaded = loader.loadFromMemory(zipBank.data(), zipBank.size());

    assert(loaded);
    std::cout << "  [PASS] .abdbank memory container successfully parsed" << std::endl;
    ++passed;

    assert(loader.isValid());
    assert(loader.getBankName() == "McxCleanRoomBank");
    assert(loader.getAuthor() == "ABDSynths");
    assert(loader.getWaveCount() == 3);
    assert(loader.getDrumKitCount() == 1);
    assert(loader.getToneCount() == 1);
    std::cout << "  [PASS] Manifest validated: 3 waves, 1 kit, 1 tone" << std::endl;
    ++passed;

    const auto* kickWave = loader.findWave("w_0000");
    assert(kickWave != nullptr);
    assert(kickWave->rootKey == 36);
    assert(!kickWave->sampleDataL.empty());
    std::cout << "  [PASS] Wave w_0000 decoded PCM samples correctly" << std::endl;
    ++passed;

    abdmcx::McxEngine engine;
    engine.prepare(44100.0);

    // Apply Drum Kit to Part 9
    auto& drumPart = engine.part(9);
    const bool appliedKit = loader.applyDrumKitToPart(0, drumPart);
    assert(appliedKit);
    assert(drumPart.isDrumKit);
    assert(drumPart.drumSlots[36].cutoffHzOverride == 12000.0f);
    assert(drumPart.drumSlots[42].muteGroup == 1);
    assert(drumPart.drumSlots[46].muteGroup == 1);
    std::cout << "  [PASS] Drum kit applied with slots and muteGroup 1 for hi-hats" << std::endl;
    ++passed;

    // Trigger Kick
    engine.triggerNote(9, 36, 0.9f);
    assert(engine.getActiveVoiceCount() == 1);
    std::cout << "  [PASS] Kick triggered voice successfully" << std::endl;
    ++passed;

    // Trigger Open Hi-Hat (Note 46, muteGroup 1)
    engine.triggerNote(9, 46, 0.85f);
    assert(engine.getActiveVoiceCount() == 2);
    std::cout << "  [PASS] Open Hi-Hat sounding (2 active voices)" << std::endl;
    ++passed;

    // Trigger Closed Hi-Hat (Note 42, muteGroup 1) -> must choke Open Hi-Hat
    engine.triggerNote(9, 42, 0.95f);
    // Active voices: kick (if still decaying) + closed hi-hat (open hi-hat choked)
    assert(engine.getActiveVoiceCount() <= 2);
    std::cout << "  [PASS] Hi-Hat mute group choke executed: Open Hi-Hat choked on Closed hit" << std::endl;
    ++passed;

    // Apply Chromatic Tone to Part 0
    auto& tonePart = engine.part(0);
    const bool appliedTone = loader.applyToneToPart(0, tonePart);
    assert(appliedTone);
    assert(!tonePart.isDrumKit);
    assert(tonePart.partials[0].enabled);
    assert(tonePart.partials[0].externalSampleData != nullptr);
    std::cout << "  [PASS] Chromatic Tone applied with bound PCM sample table" << std::endl;
    ++passed;

    // Trigger Note 60 on Part 0
    engine.triggerNote(0, 60, 0.8f);
    std::vector<float> outL(128, 0.0f);
    std::vector<float> outR(128, 0.0f);
    engine.processAudio(outL.data(), outR.data(), 128);

    float maxAmp = 0.0f;
    for (float s : outL) maxAmp = std::max(maxAmp, std::abs(s));
    assert(maxAmp > 0.001f);
    std::cout << "  [PASS] Audio rendered from PCM samples with valid output amplitude (" << maxAmp << ")" << std::endl;
    ++passed;

    // Release all notes and verify voice clearance
    engine.releaseNote(0, 60);
    engine.releaseNote(9, 36);
    engine.releaseNote(9, 42);
    engine.releaseNote(9, 46);
    engine.allNotesOff();
    for (int b = 0; b < 20; ++b)
        engine.processAudio(outL.data(), outR.data(), 128);

    assert(engine.getActiveVoiceCount() == 0);
    std::cout << "  [PASS] Voices properly released and zero-CPU idle state reached" << std::endl;
    ++passed;

    // Slice 4: Channel Strip & Master Safety Limiter verification
    {
        abdmcx::McxChannelStrip strip;
        strip.prepare(44100.0);
        abdmcx::McxChannelStripParams p {};
        p.eqEnabled = true;
        p.eqLowGainDb = 6.0f;
        p.driveEnabled = true;
        p.driveAmount = 0.5f;
        p.sendA = 0.75f;

        std::vector<float> inL(64, 0.5f);
        std::vector<float> inR(64, 0.5f);
        std::vector<float> sendAL(64, 0.0f);
        std::vector<float> sendAR(64, 0.0f);

        strip.process(inL.data(), inR.data(), sendAL.data(), sendAR.data(),
                      nullptr, nullptr, nullptr, nullptr, nullptr, nullptr,
                      64, p, true);

        assert(inL[10] > 0.0f && std::isfinite(inL[10]));
        assert(sendAL[10] > 0.0f && std::isfinite(sendAL[10]));
        std::cout << "  [PASS] McxChannelStrip processes EQ, Drive, and Sends safely" << std::endl;
        ++passed;

        abd::dsp::MasterSafetyLimiter limiter;
        limiter.prepare(44100.0); limiter.setCeilingDb(-0.2f);
        std::vector<float> hotL(128, 2.5f), hotR(128, 2.5f);
        limiter.process(hotL.data(), hotR.data(), 128);
        float maxHot = 0.0f;
        for (int i = 0; i < 128; ++i) maxHot = std::max(maxHot, std::max(std::abs(hotL[i]), std::abs(hotR[i])));
        assert(maxHot <= 1.0f);
        std::cout << "  [PASS] MasterSafetyLimiter strictly bounds +8 dBFS burst <= 1.0" << std::endl;
        ++passed;

        // Slice 5: DspMultiBusFxRack 4-Topology & Multi-Bus Verification
        abd::dsp::DspMultiBusFxRack rack;
        rack.prepare(44100.0);
        rack.setReturns(0.8f, 0.7f, 0.5f, 0.4f);
        rack.setCascadeInjections(0.3f, 0.2f);

        std::vector<float> rDryL(64, 0.1f), rDryR(64, 0.1f);
        std::vector<float> rSendA(64, 0.4f), rSendB(64, 0.3f), rSendC(64, 0.2f), rSendD(64, 0.1f);

        rack.setTopology(abd::dsp::DspMultiBusFxRack::Topology::ParallelSends);
        rack.processMultiBus(rDryL.data(), rDryR.data(), rSendA.data(), rSendA.data(), rSendB.data(), rSendB.data(), rSendC.data(), rSendC.data(), rSendD.data(), rSendD.data(), 64, 1.0f);
        assert(std::isfinite(rDryL[10]) && rDryL[10] != 0.1f);
        rack.setTopology(abd::dsp::DspMultiBusFxRack::Topology::CascadeInjection);
        rack.processMultiBus(rDryL.data(), rDryR.data(), rSendA.data(), rSendA.data(), rSendB.data(), rSendB.data(), rSendC.data(), rSendC.data(), rSendD.data(), rSendD.data(), 64, 1.0f);
        rack.setTopology(abd::dsp::DspMultiBusFxRack::Topology::HybridSendInsert);
        rack.processMultiBus(rDryL.data(), rDryR.data(), rSendA.data(), rSendA.data(), rSendB.data(), rSendB.data(), nullptr, nullptr, nullptr, nullptr, 64, 1.0f);
        rack.setTopology(abd::dsp::DspMultiBusFxRack::Topology::SerialMaster);
        rack.processMultiBus(rDryL.data(), rDryR.data(), nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, 64, 1.0f);
        abd::dsp::DspMultiBusFxRack::ControlFrame ctrl; ctrl.bpm = 135.0; ctrl.gates[0] = 1.0f; ctrl.gates[3] = 1.0f;
        rack.processMultiBus(rDryL.data(), rDryR.data(), rSendA.data(), rSendA.data(), rSendB.data(), rSendB.data(), rSendC.data(), rSendC.data(), rSendD.data(), rSendD.data(), 64, 1.0f, ctrl);
        assert(std::isfinite(rDryL[10]));
        std::cout << "  [PASS] DspMultiBusFxRack executes all 4 topologies and ControlFrame RT-safely" << std::endl;
        ++passed;

        // Slice 6: LfoAnalog & McxParamRouter Dual LFO (IDs 68..81)
        abd::synth::DspLfoUnit lfo; lfo.prepare(44100.0); lfo.setRateHz(2.0f);
        lfo.setWaveform(abd::synth::DspLfoUnit::Waveform::Triangle); lfo.trigger();
        for (int i = 0; i < 200; ++i) assert(std::isfinite(lfo.nextSample()));
        lfo.setTempoSync(true); lfo.setBpm(120.0); lfo.setSyncDivision(abd::synth::DspLfoUnit::SyncDivision::Div1_4);
        lfo.setWaveform(abd::synth::DspLfoUnit::Waveform::Sine); lfo.trigger(); assert(std::abs(lfo.nextSample()) <= 0.05f);

        abdmcx::McxEngine engLfo; engLfo.prepare(44100.0);
        abdmcx::routePartParam(engLfo, 0, 68, 7.0f); abdmcx::routePartParam(engLfo, 0, 71, 3.25f);
        abdmcx::routePartParam(engLfo, 0, 73, 0.85f); abdmcx::routePartParam(engLfo, 0, 80, -0.6f);
        assert(engLfo.part(0).lfo1Shape == 7 && engLfo.part(0).lfo1Rate == 3.25f && engLfo.part(0).lfo2Depth == -0.6f);
        std::cout << "  [PASS] LfoAnalog and McxParamRouter (IDs 68..81) dual LFO verification" << std::endl;
        ++passed;

        // Slice 7: LcdTextFormatter & StickPlayer & VelocitySensitivityCurves
        assert(abd::synth::LcdTextFormatter::pad("Test", 16) == "Test            ");
        assert(abd::synth::LcdTextFormatter::formatCenter("OK", 16).length() == 16);
        assert(abd::synth::LcdTextFormatter::formatSigned("P", 2, "st", 16).find("+2 st") != std::string::npos);
        abdsynth::core::StickPlayer sp; sp.prepare(44100.0); assert(!sp.isPlaying());
        assert(abdsynth::core::VelocitySensitivityProcessor::getPercussiveCurve().amplitudeResponse == 1.0f);
        std::cout << "  [PASS] LcdTextFormatter, StickPlayer & VelocitySensitivityCurves verified" << std::endl;
        ++passed;
    }

    std::cout << "\nTest Summary: " << passed << " passed, 0 failed." << std::endl;
    return 0;
}
