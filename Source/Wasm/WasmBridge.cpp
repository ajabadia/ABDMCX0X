#include "WasmBridge.h"
#include "../DSP/Core/McxEngine.h"
#include "../Core/McxBankLoader.h"
#include "../Core/McxFactoryBank.h"
#include "../Core/McxParamRouter.h"

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
        engine_.prepare(44100.0);
        abdmcx::McxFactoryBank::applyFactoryDefaults(engine_);
    }

    void prepare(double sampleRate) noexcept
    {
        currentSampleRate_ = sampleRate;
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
        const int ch = static_cast<int>(engine_.part(partIdx).midiChannel);
        engine_.routeMidiChannelNoteOn(ch, noteNumber, velocity);
    }

    void noteOff(int partIdx, int noteNumber) noexcept
    {
        const int ch = static_cast<int>(engine_.part(partIdx).midiChannel);
        engine_.routeMidiChannelNoteOff(ch, noteNumber);
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

        abdmcx::McxBankLoader loader;
        if (!loader.loadFromMemory(data, static_cast<std::size_t>(sizeBytes)))
            return 0;

        // Apply first drum kit to part 9 (drum part) if present
        if (loader.getDrumKitCount() > 0)
        {
            loader.applyDrumKitToPart(0, engine_.part(9));
        }

        // Apply tones to other parts
        const int toneCount = loader.getToneCount();
        for (int i = 0; i < abdmcx::McxEngine::kNumParts; ++i)
        {
            if (i == 9) continue;
            if (i < toneCount)
            {
                loader.applyToneToPart(i, engine_.part(i));
            }
        }
        return 1;
    }

    void getAudioSnapshot(float* peakL, float* peakR, int* activeVoices) const noexcept
    {
        if (peakL) *peakL = lastPeakL_;
        if (peakR) *peakR = lastPeakR_;
        if (activeVoices) *activeVoices = engine_.getActiveVoiceCount();
    }

    void resetToFactory() noexcept
    {
        engine_.reset();
        abdmcx::McxFactoryBank::applyFactoryDefaults(engine_);
    }

private:
    abdmcx::McxEngine engine_;
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

void resetToFactory()
{
    getEngine().resetToFactory();
}

} // extern "C"
