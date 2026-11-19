#pragma once

#include "McxRackSlot.h"
#include "DspEffects/DspZitaReverb.h"
#include "DspEffects/DspStereoDelay.h"
#include "DspEffects/DspStereoChorus.h"
#include "DspEffects/DspFlanger.h"
#include "DspEffects/DspSaturation.h"
#include "DspEffects/DspMidasEQ.h"
#include "DspEffects/DspFairComp.h"
#include "DspEffects/DspMoodFilter.h"
#include "DspEffects/MasterSafetyLimiter.h"

#include <array>
#include <cstdint>
#include <memory>
#include <string_view>

namespace abdmcx
{

class McxRackChassis
{
public:
    static constexpr int kMaxSlots = 8;
    static constexpr int kMaxChunk = 256;

    McxRackChassis();
    ~McxRackChassis() = default;
    McxRackChassis(const McxRackChassis&) = delete;
    McxRackChassis& operator=(const McxRackChassis&) = delete;

    void prepare(double sampleRate) noexcept;
    void reset() noexcept;

    void setSlotEngine(int slotIdx, McxRackEngineType type, const char* customName = nullptr) noexcept;
    void removeSlotEngine(int slotIdx) noexcept;
    void moveSlot(int fromIdx, int toIdx) noexcept;
    void setSlotBypass(int slotIdx, bool bypassed) noexcept;
    void setSlotCustomName(int slotIdx, const char* name) noexcept;
    void setSlotParams(int slotIdx, float p1, float p2, float dryWetMix = 1.0f) noexcept;
    void setSlotParamByKey(int slotIdx, std::string_view key, float value) noexcept;
    void setSlotPreset(int slotIdx, int presetIdx) noexcept;
    void setSlotDucking(int slotIdx, bool enabled, float amount = 0.6f) noexcept;
    void setSlotChainTarget(int slotIdx, int targetSlotIdx) noexcept;
    [[nodiscard]] int getSlotChainTarget(int slotIdx) const noexcept;

    [[nodiscard]] McxRackSlotTelemetry getSlotTelemetry(int slotIdx) const noexcept;
    [[nodiscard]] const McxRackSlotState& getSlotState(int slotIdx) const noexcept;
    [[nodiscard]] bool isSlotActive(int slotIdx) const noexcept;
    [[nodiscard]] bool hasSlotActivity(int slotIdx) const noexcept;
    [[nodiscard]] bool hasAnySlotActivity() const noexcept;

    void processSlot(int slotIdx,
                     const float* inL,
                     const float* inR,
                     float* outL,
                     float* outR,
                     int numSamples,
                     bool sidechainDuck = false) noexcept;

    int serializeJson(char* outBuffer, int maxBytes) const noexcept;
    bool deserializeJson(const char* jsonText) noexcept;

private:
    struct SlotDsp
    {
        abd::dsp::DspZitaReverb zita {};
        abd::dsp::DspStereoDelay delay {};
        abd::dsp::DspStereoChorus chorus {};
        abd::dsp::DspFlanger flanger {};
        abd::dsp::DspMidasEQ midasEq {};
        abd::dsp::DspFairComp fairComp {};
        abd::dsp::DspMoodFilter moodFilter {};
        int tailSamplesRemaining { 0 };
        float smoothBypassGain { 1.0f };
        float smoothDuckGain { 1.0f };
        float toneStateL { 0.0f };
        float toneStateR { 0.0f };
        std::uint32_t noiseRng { 2463534242u };
        float peakInL { 0.0f }, peakInR { 0.0f };
        float peakOutL { 0.0f }, peakOutR { 0.0f };
        float clipHoldIn { 0.0f }, clipHoldOut { 0.0f };
    };

    double sampleRate_ { 44100.0 };
    std::array<McxRackSlotState, kMaxSlots> states_ {};
    std::unique_ptr<std::array<SlotDsp, kMaxSlots>> dsp_;
    std::array<float, kMaxChunk> tempL_ {}, tempR_ {};

    void applyPresetToSlot(int slotIdx, int presetIdx) noexcept;
    void applySlotDspParams(int slotIdx) noexcept;
};

} // namespace abdmcx
