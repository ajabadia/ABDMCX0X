#pragma once

#include "../Core/McxTypes.h"
#include "McxEnvelope5Stage.h"
#include "McxFilterBank.h"
#include "McxPartialExciter.h"

#include <array>
#include <cstdint>

namespace abdmcx
{

struct McxVoiceRenderConfig
{
    McxStructureMode structureMode { McxStructureMode::Parallel };
    float partLevel { 0.85f };
    float partPan { 0.0f };
    float vectorX { 0.0f };
    float vectorY { 0.0f };
    float reverbSend { 0.25f };
    float chorusSend { 0.0f };
    std::array<McxPartialConfig, 4> partials {};
    McxFilterModel forcedFilterModel { McxFilterModel::RolandTc6116Tvf };
    bool forcePartFilterModel { false };
    int maxPartialsAllowed { 4 };
    float masterTuneSemitones { 0.0f };
};

/**
 * @brief Up to 4-Partial Stereo Synth / Drum-Key Voice with Parallel, RingMod,
 * Booster saturation, and Vector 2D mixing. Inactive voices and disabled Partials
 * consume zero audio-thread CPU.
 */
class McxVoice
{
public:
    static constexpr int kMaxPartials = 4;

    void prepare(double sampleRate) noexcept;
    void reset() noexcept;

    void noteOnMelodic(int partIdx,
                       int midiNote,
                       float velocity01,
                       float accent01,
                       const McxVoiceRenderConfig& cfg,
                       std::uint64_t timestamp) noexcept;

    void noteOnDrum(int partIdx,
                    int rawInputNote,
                    int slotNote,
                    float velocity01,
                    float accent01,
                    const McxDrumSlotConfig& slotCfg,
                    const McxVoiceRenderConfig& cfg,
                    std::uint64_t timestamp) noexcept;

    void noteOff() noexcept;
    void forceChoke() noexcept;

    void processBlock(float* dryL,
                      float* dryR,
                      float* revL,
                      float* revR,
                      float* choL,
                      float* choR,
                      int numSamples,
                      const McxVoiceRenderConfig& cfg) noexcept;

    [[nodiscard]] bool isActive() const noexcept { return active_; }
    [[nodiscard]] bool isReleasing() const noexcept;
    [[nodiscard]] bool isHeldByKey() const noexcept { return heldByKey_; }
    [[nodiscard]] int getPartIndex() const noexcept { return partIndex_; }
    [[nodiscard]] int getMidiNote() const noexcept { return midiNote_; }
    [[nodiscard]] int getDrumSlotNote() const noexcept { return drumSlotNote_; }
    [[nodiscard]] std::uint8_t getDrumMuteGroup() const noexcept { return drumMuteGroup_; }
    [[nodiscard]] std::uint64_t getTimestamp() const noexcept { return timestamp_; }
    [[nodiscard]] float getLastLevelEstimate() const noexcept { return lastLevelEstimate_; }
    [[nodiscard]] int getActivePartialCount() const noexcept;

private:
    struct PartialUnit
    {
        bool enabledInVoice { false };
        McxPartialExciter exciter {};
        McxFilterBank filter {};
        McxEnvelope5Stage pitchEnv {};
        McxEnvelope5Stage filterEnv {};
        McxEnvelope5Stage ampEnv {};
        float velScaled { 1.0f };
        float cutoffOverrideHz { -1.0f };
        float resOverride { -1.0f };
        float releaseMsOverride { -1.0f };
    };

    static void computeVectorWeights(float vx, float vy, std::array<float, 4>& weights) noexcept;

    bool active_ { false };
    bool isDrumVoice_ { false };
    bool heldByKey_ { false };
    int partIndex_ { -1 };
    int midiNote_ { -1 };
    int drumSlotNote_ { -1 };
    std::uint8_t drumMuteGroup_ { 0 };
    McxDrumTriggerMode drumTriggerMode_ { McxDrumTriggerMode::OneShot };
    std::uint64_t timestamp_ { 0 };
    float lastLevelEstimate_ { 0.0f };
    float voiceReverbSend_ { 0.25f };
    float voiceChorusSend_ { 0.0f };
    float voicePanOffset_ { 0.0f };
    float voiceSlotLevel_ { 1.0f };

    std::array<PartialUnit, kMaxPartials> units_ {};
};

} // namespace abdmcx
