#include "WasmBridge.h"
#include "WasmInternal.h"
#include "../DSP/Core/McxEngine.h"
#include "../Core/McxFactoryBank.h"
#include "../Core/McxMultiBankManager.h"
#include "../Core/McxParamRouter.h"
#include "../Sequencer/McxPatternSequencer.h"

#include <algorithm>
#include <cmath>
#include <memory>

namespace
{
class McxWasmContainer
{
public:
    McxWasmContainer()
    {
        engine_.setOutboundMidiQueue(&midiOutQueue_);
        engine_.prepare(44100.0);
        abdmcx::McxFactoryBank::applyFactoryDefaults(engine_);
    }

    void prepare(double sampleRate) noexcept
    {
        currentSampleRate_ = sampleRate;
        engine_.setOutboundMidiQueue(&midiOutQueue_);
        engine_.prepare(sampleRate);
    }

    void process(float* outL, float* outR, int numSamples) noexcept
    {
        if (!outL || !outR || numSamples <= 0)
            return;

        engine_.processAudio(outL, outR, numSamples);

        // Calculate peak amplitude for telemetry
        float maxL = 0.0f;
        float maxR = 0.0f;
        for (int i = 0; i < numSamples; ++i)
        {
            maxL = std::max(maxL, std::abs(outL[i]));
            maxR = std::max(maxR, std::abs(outR[i]));
        }
        lastPeakL_ = maxL;
        lastPeakR_ = maxR;
    }

    void noteOn(int partIdx, int noteNumber, float velocity) noexcept
    {
        engine_.triggerPartNoteOn(partIdx, noteNumber, velocity);
    }

    void noteOff(int partIdx, int noteNumber) noexcept
    {
        engine_.releasePartNoteOff(partIdx, noteNumber);
    }

    void allNotesOff() noexcept
    {
        engine_.allNotesOff();
    }

    void setTempoBPM(float bpm) noexcept
    {
        engine_.setMasterTempoBpm(bpm);
    }

    void setMasterVolume(float vol) noexcept
    {
        engine_.setMasterVolume(vol);
    }

    void setPartParam(int partIdx, int paramId, float value) noexcept
    {
        abdmcx::applyWebPartParam(engine_, partIdx, paramId, value);
    }

    int loadBankFromMemory(const uint8_t* data, int sizeBytes)
    {
        if (!data || sizeBytes <= 0)
            return 0;

        const int slot = bankManager_.mountBankFromMemory(data, static_cast<std::size_t>(sizeBytes), {}, true);
        const auto* bank = bankManager_.getBank(slot);
        if (bank == nullptr)
            return 0;

        if (bank->getDrumKitCount() > 0)
            (void)bankManager_.loadDrumKitToPart(slot, 0, engine_, 9);

        const int toneCount = bank->getToneCount();
        const int activeInitial = std::min(16, abdmcx::McxEngine::kNumParts);
        for (int i = 0; i < activeInitial; ++i)
        {
            if (i == 9) continue;
            if (i < toneCount)
                (void)bankManager_.loadToneToPart(slot, i, engine_, i);
        }
        return 1;
    }

    void getAudioSnapshot(float* peakL, float* peakR, int* activeVoices) const noexcept
    {
        if (peakL) *peakL = lastPeakL_;
        if (peakR) *peakR = lastPeakR_;
        if (activeVoices) *activeVoices = engine_.getActiveVoiceCount();
    }

    void getPartPeaks(float* outPeaks16) const noexcept
    {
        if (!outPeaks16) return;
        const auto p = engine_.getPartPeaks();
        std::copy(p.begin(), p.end(), outPeaks16);
    }

    void getPartMidiPeaks(float* outPeaks16) const noexcept
    {
        if (!outPeaks16) return;
        const auto p = engine_.getPartMidiPeaks();
        std::copy(p.begin(), p.end(), outPeaks16);
    }

    void resetToFactory() noexcept
    {
        engine_.reset();
        abdmcx::McxFactoryBank::applyFactoryDefaults(engine_);
    }

    abdmcx::McxEngine& engine() noexcept { return engine_; }
    const abdmcx::McxEngine& engine() const noexcept { return engine_; }
    abdmcx::McxMultiBankManager& bankManager() noexcept { return bankManager_; }

    int drainMidi(uint8_t* outBytes, int maxBytes) noexcept
    {
        if (!outBytes || maxBytes < 3) return 0;
        int written = 0;
        abdmcx::McxMidiOutMessage msg{};
        while (written + 3 <= maxBytes && midiOutQueue_.pop(msg))
        {
            if (msg.length > 0 && written + static_cast<int>(msg.length) + 2 <= maxBytes)
            {
                outBytes[written++] = static_cast<uint8_t>(msg.portIndex);
                outBytes[written++] = static_cast<uint8_t>(msg.length);
                for (std::size_t i = 0; i < msg.length; ++i) outBytes[written++] = msg.bytes[i];
            }
        }
        return written;
    }

private:
    abdmcx::McxEngine engine_;
    abdmcx::McxMultiBankManager bankManager_ {};
    abdmcx::McxMidiOutQueue<1024> midiOutQueue_{};
    double currentSampleRate_ { 44100.0 };
    float lastPeakL_ { 0.0f };
    float lastPeakR_ { 0.0f };
};

static std::unique_ptr<McxWasmContainer> gEngine;

McxWasmContainer& getEngine()
{
    if (!gEngine)
    {
        gEngine = std::make_unique<McxWasmContainer>();
    }
    return *gEngine;
}
} // namespace

namespace abdmcx::wasm_internal
{
McxEngine& engine() noexcept { return getEngine().engine(); }
McxMultiBankManager& bankManager() noexcept { return getEngine().bankManager(); }
} // namespace abdmcx::wasm_internal

extern "C"
{

void initEngine(double sampleRate)
{
    getEngine().prepare(sampleRate);
}

void processAudio(float* outL, float* outR, int numSamples)
{
    getEngine().process(outL, outR, numSamples);
}

void noteOn(int partIdx, int noteNumber, float velocity)
{
    getEngine().noteOn(partIdx, noteNumber, velocity);
}

void noteOff(int partIdx, int noteNumber)
{
    getEngine().noteOff(partIdx, noteNumber);
}

void allNotesOff()
{
    getEngine().allNotesOff();
}

void setTempoBPM(float bpm)
{
    getEngine().setTempoBPM(bpm);
}

void setPartParam(int partIdx, int paramId, float value)
{
    getEngine().setPartParam(partIdx, paramId, value);
}

void setMasterVolume(float volume)
{
    getEngine().setMasterVolume(volume);
}

int loadBankFromMemory(const uint8_t* data, int sizeBytes)
{
    return getEngine().loadBankFromMemory(data, sizeBytes);
}

void getAudioSnapshot(float* peakL, float* peakR, int* activeVoices)
{
    getEngine().getAudioSnapshot(peakL, peakR, activeVoices);
}

void getPartPeaks(float* outPeaks64)
{
    getEngine().getPartPeaks(outPeaks64);
}

void getPartMidiPeaks(float* outPeaks64)
{
    getEngine().getPartMidiPeaks(outPeaks64);
}

void resetToFactory()
{
    getEngine().resetToFactory();
}

int drainMidiOut(uint8_t* outBytes, int maxBytes)
{
    return getEngine().drainMidi(outBytes, maxBytes);
}

int setBankLayoutJson(const char* jsonText)
{
    if (jsonText == nullptr) return 0;
    return abdmcx::wasm_internal::engine().setBankLayoutJson(jsonText) ? 1 : 0;
}

const char* getBankLayoutJson()
{
    static std::string sLayout;
    sLayout = abdmcx::wasm_internal::engine().serializeBankLayoutJson();
    return sLayout.c_str();
}

void routeMidiInBytes(int portIdx, int status, int data1, int data2)
{
    const std::uint8_t st = static_cast<std::uint8_t>(status & 0xFF);
    const std::uint8_t d1 = static_cast<std::uint8_t>(data1 & 0x7F);
    const std::uint8_t d2 = static_cast<std::uint8_t>(data2 & 0x7F);
    auto& eng = abdmcx::wasm_internal::engine();
    if (st >= 0x80u && st < 0xF0u)
    {
        const int ch = static_cast<int>((st & 0x0Fu) + 1u);
        const std::uint8_t kind = st & 0xF0u;
        if (kind == 0x90u && d2 > 0) eng.routeMidiPortChannelNoteOn(portIdx, ch, d1, static_cast<float>(d2) / 127.0f, 0);
        else if (kind == 0x80u || (kind == 0x90u && d2 == 0)) eng.routeMidiPortChannelNoteOff(portIdx, ch, d1, 0);
        else if (kind == 0xB0u)
        {
            if (d1 == 120 || d1 == 123) eng.allNotesOff();
            else eng.routeMidiPortChannelCc(portIdx, ch, d1, d2);
        }
    }
}

} // extern "C"
