#include "Core/McxCommandQueue.h"
#include "Core/McxLibraryService.h"
#include "Core/McxMultiBankManager.h"
#include "Core/McxParamRouter.h"
#include "DSP/Core/McxEngine.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <memory>
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
    else      { ++gFailed; std::printf("  [FAIL] %s\n", msg); }
}

class MockAnalogVaEngine final : public abd::engines::ISoundEngine
{
public:
    void prepare(double sr, int) noexcept override { sampleRate_ = (sr > 1000.0) ? sr : 44100.0; reset(); }
    void reset() noexcept override { activeNote_ = -1; phase_ = 0.0; controls_.fill(0.0f); }
    const char* getEngineTypeId() const noexcept override { return "mock_analog_va"; }
    const char* getEngineDisplayName() const noexcept override { return "Mock Analog VA"; }
    bool supportsDrumMode() const noexcept override { return false; }
    abd::engines::EngineDescriptor getDescriptor() const noexcept override
    {
        return { getEngineTypeId(), getEngineDisplayName(), false, false, 16 };
    }
    int getFactoryPresetCount() const noexcept override { return 2; }
    const char* getFactoryPresetName(int i) const noexcept override
    {
        return (i == 0) ? "Saw Lead VA" : (i == 1) ? "Warm Pad VA" : "";
    }
    bool loadFactoryPreset(int i) noexcept override
    {
        if (i < 0 || i > 1) return false;
        presetIdx_ = i;
        return true;
    }
    const char* getCurrentPresetName() const noexcept override { return getFactoryPresetName(presetIdx_); }
    const abd::engines::EngineControlInputDescriptor* getControlInputDescriptors(std::size_t& outCount) const noexcept override
    {
        static constexpr abd::engines::EngineControlInputDescriptor kDescs[] = {
            { 5, "va_cutoff", "VA Cutoff", abd::synth::role::kFilterCutoff, -1.0f, 1.0f, 1.0f },
        };
        outCount = 1;
        return kDescs;
    }
    void setControlInputs(const float* vals, std::size_t n) noexcept override
    {
        if (!vals || n <= 5) return;
        controls_[5] = std::clamp(vals[5], -1.0f, 1.0f);
        lastCutoffOffset_ = controls_[5];
    }
    void clearControlInputs() noexcept override { controls_.fill(0.0f); ++clearInputsCalls_; }
    void setTransportContext(const abd::engines::EngineTransportContext&) noexcept override {}
    void noteOn(int note, float vel, float) noexcept override { activeNote_ = note; vel_ = vel; }
    void noteOff(int note) noexcept override { if (note == activeNote_) activeNote_ = -1; }
    void allNotesOff() noexcept override { activeNote_ = -1; ++allNotesOffCalls_; }
    void setSustainPedal(bool down) noexcept override { sustainDown_ = down; }
    bool renderBlock(float* outL, float* outR, int n) noexcept override
    {
        if (activeNote_ < 0 || n <= 0) return false;
        const float amp = (presetIdx_ == 1 ? 0.5f : 0.25f) * std::clamp(0.5f + 0.4f * controls_[5], 0.05f, 1.0f) * vel_;
        const double inc = (440.0 * std::pow(2.0, (activeNote_ - 69) / 12.0)) / sampleRate_;
        for (int i = 0; i < n; ++i)
        {
            const float s = amp * static_cast<float>(std::sin(2.0 * 3.14159265358979323846 * phase_));
            outL[i] = s; outR[i] = s;
            phase_ += inc;
            if (phase_ >= 1.0) phase_ -= 1.0;
        }
        return true;
    }

    int presetIdx_ { 0 };
    int activeNote_ { -1 };
    int allNotesOffCalls_ { 0 };
    int clearInputsCalls_ { 0 };
    bool sustainDown_ { false };
    float vel_ { 0.8f };
    float lastCutoffOffset_ { 0.0f };
    double sampleRate_ { 44100.0 };
    double phase_ { 0.0 };
    std::array<float, 8> controls_ {};
};

void pushU16(std::vector<std::uint8_t>& o, std::uint16_t v)
{
    o.push_back(static_cast<std::uint8_t>(v & 0xFFu)); o.push_back(static_cast<std::uint8_t>((v >> 8) & 0xFFu));
}
void pushU32(std::vector<std::uint8_t>& o, std::uint32_t v)
{
    for (int s = 0; s < 32; s += 8) o.push_back(static_cast<std::uint8_t>((v >> s) & 0xFFu));
}
void appendZipEntry(std::vector<std::uint8_t>& z, const std::string& name, const std::uint8_t* data, std::size_t sz)
{
    pushU32(z, 0x04034b50u); pushU16(z, 20); pushU16(z, 0); pushU16(z, 0); pushU16(z, 0); pushU16(z, 0);
    pushU32(z, 0); pushU32(z, static_cast<std::uint32_t>(sz)); pushU32(z, static_cast<std::uint32_t>(sz));
    pushU16(z, static_cast<std::uint16_t>(name.size())); pushU16(z, 0);
    z.insert(z.end(), name.begin(), name.end());
    z.insert(z.end(), data, data + sz);
}
std::vector<std::uint8_t> makeSineWav(int numSamples, double freqHz)
{
    std::vector<std::uint8_t> w;
    const std::uint32_t db = static_cast<std::uint32_t>(numSamples * 2);
    w.insert(w.end(), { 'R', 'I', 'F', 'F' }); pushU32(w, 36u + db);
    w.insert(w.end(), { 'W', 'A', 'V', 'E', 'f', 'm', 't', ' ' });
    pushU32(w, 16u); pushU16(w, 1u); pushU16(w, 1u); pushU32(w, 44100u);
    pushU32(w, 88200u); pushU16(w, 2u); pushU16(w, 16u);
    w.insert(w.end(), { 'd', 'a', 't', 'a' }); pushU32(w, db);
    for (int i = 0; i < numSamples; ++i)
        pushU16(w, static_cast<std::uint16_t>(static_cast<std::int16_t>(
            std::lround(std::sin(2.0 * 3.14159265358979323846 * freqHz * i / 44100.0) * 24000.0))));
    return w;
}
std::vector<std::uint8_t> makeArchive(const std::string& bankName, double f0, double f1, double fKit)
{
    const std::string man =
        R"({"schemaVersion":"1.1.0","formatId":"abd_structured_rompler","bankName":")" + bankName +
        R"(","author":"ABDSynths","wavePool":[)"
        R"({"id":"w_0000","name":"w0","assetUriLeft":"waves/w0.wav","sourceKind":"pcm_zone","playMode":"forward","rootKey":60,"loopStartFrame":0,"loopEndFrame":512},)"
        R"({"id":"w_0001","name":"w1","assetUriLeft":"waves/w1.wav","sourceKind":"pcm_zone","playMode":"forward","rootKey":60,"loopStartFrame":0,"loopEndFrame":512},)"
        R"({"id":"w_0002","name":"k","assetUriLeft":"waves/k.wav","sourceKind":"pcm_zone","playMode":"oneshot","rootKey":36}],)"
        R"("tones":[{"id":"t0","name":"Tone Zero","structureMode":"parallel","partials":[{"slot":1,"enabled":true,"sourceKind":"pcm_zone","waveId":"w_0000","cutoffHz":16000}]},)"
        R"({"id":"t1","name":"Tone One","structureMode":"parallel","partials":[{"slot":1,"enabled":true,"sourceKind":"pcm_zone","waveId":"w_0001","cutoffHz":16000}]}],)"
        R"("drumKits":[{"id":"k0","name":"Kit Zero","drumMapMode":"roland_gs_mc","slots":[{"midiNote":36,"name":"Kick","waveId":"w_0002","muteGroup":0,"cutoffHzOverride":14000,"triggerMode":"one_shot"}]}]})";
    const auto w0 = makeSineWav(1024, f0), w1 = makeSineWav(1024, f1), wk = makeSineWav(1024, fKit);
    std::vector<std::uint8_t> z;
    appendZipEntry(z, "manifest.json", reinterpret_cast<const std::uint8_t*>(man.data()), man.size());
    appendZipEntry(z, "waves/w0.wav", w0.data(), w0.size());
    appendZipEntry(z, "waves/w1.wav", w1.data(), w1.size());
    appendZipEntry(z, "waves/k.wav", wk.data(), wk.size());
    return z;
}
float rmsRender(McxEngine& e, int n)
{
    std::vector<float> l(static_cast<std::size_t>(n), 0.0f), r(static_cast<std::size_t>(n), 0.0f);
    e.processAudio(l.data(), r.data(), n);
    double sum = 0.0;
    for (float s : l) sum += static_cast<double>(s) * s;
    return static_cast<float>(std::sqrt(sum / static_cast<double>(n)));
}
} // namespace

int main()
{
    std::printf("=== ABDMCX0X Multi-Engine Registry & On-Demand WavePool Tests ===\n");
    // T1 & T2 & T3: Registry, RT-safe switching, TrackModRouter rebind, polymorphic factory presets
    {
        McxEngine e;
        auto mocks = std::make_unique<std::array<MockAnalogVaEngine, McxEngine::kNumParts>>();
        std::array<IMcxSoundEngine*, McxEngine::kNumParts> ptrs {};
        for (int i = 0; i < McxEngine::kNumParts; ++i) ptrs[static_cast<std::size_t>(i)] = &(*mocks)[static_cast<std::size_t>(i)];

        const int mockType = e.registerCustomEngineType((*mocks)[0].getDescriptor(), ptrs.data(), McxEngine::kNumParts);
        e.prepare(44100.0);
        const auto d0 = e.getRegisteredEngineDescriptor(0);
        const auto d1 = e.getRegisteredEngineDescriptor(1);
        check(e.getRegisteredEngineTypeCount() == 3 && mockType == 2 && std::string(d0.typeId) == "structured_rompler" &&
                  d0.supportsBankArchives && std::string(d1.typeId) == "external_midi" && !(*mocks)[0].renderBlock(nullptr, nullptr, 0),
              "T1: McxEngineRegistry registers pre-allocated Rompler, ExternalMidi, and custom MockAnalogVa engines");

        e.setPartKind(0, McxPartKind::DrumMap);
        McxCommandQueue<32> q;
        q.push({ McxUiCommand::Type::SetPartEngineType, 0, 0, 0, static_cast<std::int16_t>(mockType), 0.0f });
        q.push({ McxUiCommand::Type::SetPartParam, 0, 0, 0, 82, 0.75f }); // semantic cutoffOffset -> mock dest ID 5
        q.push({ McxUiCommand::Type::LoadPartFactoryPreset, 0, 0, 0, 1, 0.0f }); // "Warm Pad VA"
        drainCommandQueue(q, e);

        e.triggerPartNoteOn(0, 60, 0.9f);
        const float mockRms = rmsRender(e, 256);
        const bool switchedBack = e.selectPartEngineById(0, "structured_rompler");
        const int romplerCount = e.getPartFactoryPresetCount(0);
        applyWebPartParam(e, 0, 96, 16.0f); // Kit 0 via param 96
        const bool loadedKit = e.part(0).isDrumKit && std::string(e.getPartCurrentPresetName(0)) == "90s Groove Kit";
        applyWebPartParam(e, 0, 96, 0.0f);  // Tone 0
        const bool loadedTone = !e.part(0).isDrumKit && std::string(e.getPartCurrentPresetName(0)) == "TB-303 Acid Bass";
        check(mockRms > 0.02f && std::abs((*mocks)[0].lastCutoffOffset_ - 0.75f) < 1e-4f && (*mocks)[0].allNotesOffCalls_ >= 1 &&
                  (*mocks)[0].clearInputsCalls_ >= 1 && switchedBack && romplerCount == 20 && loadedKit && loadedTone,
              "T2/T3: RT-safe engine swap rebinds TrackModRouter (dest 5) and loads polymorphic presets via ISoundEngine");
    }

    // T4 & T5: Selective Multi-Bank On-Demand WavePool & Deferred GC
    {
        McxEngine e;
        e.prepare(44100.0);
        McxMultiBankManager bm;
        const auto archA = makeArchive("Alpha", 220.0, 330.0, 80.0);
        const auto archB = makeArchive("Beta", 880.0, 660.0, 95.0);
        const int sA = bm.mountBankFromMemory(archA.data(), archA.size(), "bank_alpha", true);
        const int sB = bm.mountBankFromMemory(archB.data(), archB.size(), "bank_beta", true);
        const bool zeroBeforeLoad = (e.wavePool().getResidentWaveCount() == 0);

        const bool l0 = bm.loadToneToPart(sA, 0, e, 0);
        const bool l1 = bm.loadToneToPart(sA, 0, e, 1);
        const bool l2 = bm.loadToneToPart(sB, 0, e, 2);
        const bool l9 = bm.loadDrumKitToPart(sB, 0, e, 9);
        const auto hAlpha0 = e.wavePool().findHandle("bank_alpha", "w_0000");
        const auto hBeta0 = e.wavePool().findHandle("bank_beta", "w_0000");
        const bool selective = zeroBeforeLoad && l0 && l1 && l2 && l9 && e.wavePool().getLoadedWaveCount() == 3 &&
                               e.wavePool().getRefCount(hAlpha0) == 2 && e.wavePool().getRefCount(hBeta0) == 1 &&
                               e.part(0).partials[0].externalSampleData == e.part(1).partials[0].externalSampleData &&
                               e.part(0).partials[0].externalSampleData != e.part(2).partials[0].externalSampleData;

        std::vector<float> lA(256), rA(256), lB(256), rB(256);
        e.triggerPartNoteOn(0, 60, 0.9f); (void)e.part(0).romplerEngine().renderBlock(lA.data(), rA.data(), 256);
        e.triggerPartNoteOn(2, 60, 0.9f); (void)e.part(2).romplerEngine().renderBlock(lB.data(), rB.data(), 256);
        float diff = 0.0f;
        for (int i = 0; i < 256; ++i) diff += std::abs(lA[static_cast<std::size_t>(i)] - lB[static_cast<std::size_t>(i)]);
        check(selective && diff > 1.0f && rmsRender(e, 256) > 0.001f,
              "T4: Multi-bank on-demand loads only requested waves, deduplicates shared banks, avoids collisions");

        e.triggerPartNoteOn(9, 36, 0.95f); (void)rmsRender(e, 128);
        (void)bm.loadToneToPart(sA, 1, e, 0);
        (void)bm.loadToneToPart(sA, 1, e, 1);
        const std::size_t gcActive = e.collectUnusedWaves();
        const bool kept = (gcActive == 0 && e.wavePool().get(hAlpha0) != nullptr);
        e.engineRegistry().romplerPool().reset();
        const std::size_t gcIdle = e.collectUnusedWaves();
        check(kept && gcIdle == 1 && e.wavePool().get(hAlpha0) == nullptr,
              "T5: Deferred GC preserves unreferenced PCM while voices sound and frees when idle");
    }

    // T6: McxLibraryService disk .abdbank scanning & selective seekg loading
    {
        std::error_code ec;
        const auto root = std::filesystem::temp_directory_path(ec) / "mcx_p8_lib_test";
        std::filesystem::remove_all(root, ec);
        std::filesystem::create_directories(root / "Banks", ec);
        const auto archDisk = makeArchive("DiskBank", 261.63, 392.0, 75.0);
        {
            std::ofstream out(root / "Banks" / "DiskBank.abdbank", std::ios::binary);
            out.write(reinterpret_cast<const char*>(archDisk.data()), static_cast<std::streamsize>(archDisk.size()));
        }
        McxLibraryService lib; McxMultiBankManager bm; McxEngine e;
        e.prepare(44100.0);
        const bool scanned = lib.scanWorkingDir(root.string());
        const bool zeroAfterScan = (e.wavePool().getResidentWaveCount() == 0);
        std::string toneId;
        for (const auto& it : lib.getItems()) if (it.bankSlotKind == "tone" && it.bankItemIndex == 0) toneId = it.id;
        const bool loadedOnDemand = !toneId.empty() && lib.loadCatalogItemOnDemand(toneId, bm, e, 3);
        e.triggerPartNoteOn(3, 60, 0.9f);
        const float rms = rmsRender(e, 256);
        std::filesystem::remove_all(root, ec);
        check(scanned && zeroAfterScan && loadedOnDemand && e.wavePool().getLoadedWaveCount() == 1 && rms > 0.001f,
              "T6: McxLibraryService scans disk .abdbank lazily (0 PCM) and loads selected tone via seekg");
    }

    // T7: Polymorphic ISoundEngine key/value parameter access & JSON state serialization
    {
        McxEngine e;
        e.prepare(44100.0);
        float cut = 0.0f, f2Mode = 0.0f, dLvl = 0.0f, restored = 0.0f;
        const bool setOk = e.setPartEngineParamByKey(0, "p1.cutoffHz", 4321.0f) && e.setPartEngineParamByKey(0, "filter2.mode", 2.0f) && e.setPartEngineParamByKey(0, "drum.36.level", 0.62f);
        const bool getOk = e.getPartEngineParamByKey(0, "p1.cutoffHz", cut) && e.getPartEngineParamByKey(0, "filter2.mode", f2Mode) && e.getPartEngineParamByKey(0, "drum.36.level", dLvl);
        const std::string json = e.serializePartEngineStateJson(0);
        (void)e.setPartEngineParamByKey(0, "p1.cutoffHz", 900.0f);
        const bool deserOk = e.deserializePartEngineStateJson(0, json) && e.getPartEngineParamByKey(0, "p1.cutoffHz", restored);
        (void)e.selectPartEngineById(1, "external_midi");
        check(setOk && getOk && std::abs(cut - 4321.0f) < 1.0f && std::abs(f2Mode - 2.0f) < 0.01f &&
                  std::abs(dLvl - 0.62f) < 0.01f && !json.empty() && json.find("abd_structured_rompler_state") != std::string::npos &&
                  deserOk && std::abs(restored - 4321.0f) < 1.0f && e.serializePartEngineStateJson(1).empty(),
              "T7: setPartEngineParamByKey / getPartEngineParamByKey / serializePartEngineStateJson contract works across engines");
    }

    // T8: routeMidiChannelCc(64) sustain pedal forwarding to polymorphic ISoundEngine
    {
        McxEngine e; e.prepare(44100.0);
        MockAnalogVaEngine mock;
        e.setPartSoundEngine(0, &mock);
        e.routeMidiChannelCc(1, 64, 127);
        const bool down = mock.sustainDown_;
        e.routeMidiChannelCc(1, 64, 0);
        check(down && !mock.sustainDown_, "T8: routeMidiChannelCc forwards CC64 sustain pedal to engine");
    }

    std::printf("\n=== Results: %d passed, %d failed ===\n", gPassed, gFailed);
    return (gFailed == 0) ? 0 : 1;
}
