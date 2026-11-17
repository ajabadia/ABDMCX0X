#pragma once

#include "McxTypes.h"
#include "../FX/McxOutputAndFx.h"
#include "../Synth/McxVoice.h"
#include "../../MIDI/HardwareMirrorRouter.h"
#include "SynthCore/GrooveArpeggiator.h"

#include <array>
#include <atomic>
#include <cstdint>
#include <vector>

namespace abdmcx
{

struct McxPartState
{
    bool enabled { false };
    bool isDrumKit { false };
    std::uint8_t midiChannel { 1 };
    McxPartRouteMode routeMode { McxPartRouteMode::Internal };
    McxStructureMode structureMode { McxStructureMode::Parallel };
    McxFilterModel filterModel { McxFilterModel::RolandTc6116Tvf };
    McxDrumMapMode drumMapMode { McxDrumMapMode::RolandGsMc };
    float level { 0.85f };
    float pan { 0.0f };
    float vectorX { 0.0f };
    float vectorY { 0.0f };
    float reverbSend { 0.25f };
    float chorusSend { 0.10f };
    std::array<McxPartialConfig, 4> partials {};
    std::array<McxDrumSlotConfig, 128> drumSlots {};
    McxDrumNoteRemapper drumRemapper {};
    abd::synth::GrooveArpeggiator arp {};
};

/**
 * @brief 16-part JUCE-free C++20 Groove-Rompler core engine for ABDMCX0X.
 * Phase 1 adds dynamic 1..64 polyphony with zero-CPU idle voice/partial skipping,
 * partial-budget voice stealing (28-partial MC-303 mode), Machine Personas,
 * 4-Partial McxVoice synthesis, bidirectional Drum Note Remapper, and Master FX + DAC.
 */
class McxEngine
{
public:
    static constexpr int kNumParts = 16;
    static constexpr int kMaxVoices = 64;

    McxEngine() noexcept;

    void prepare(double sampleRate) noexcept;
    void reset() noexcept;

    void setFocusedPart(int partIndex) noexcept;
    [[nodiscard]] int getFocusedPart() const noexcept { return focusedPartIndex_; }

    McxPartState& part(int partIndex) noexcept;
    [[nodiscard]] const McxPartState& part(int partIndex) const noexcept;

    void setMachinePersona(McxMachinePersona persona) noexcept;
    [[nodiscard]] McxMachinePersona getMachinePersona() const noexcept { return persona_; }
    [[nodiscard]] McxMachinePersonaSpec getPersonaSpec() const noexcept { return personaSpec_; }

    void setMaxPolyphony(int maxVoices) noexcept;
    [[nodiscard]] int getMaxPolyphony() const noexcept { return maxPolyphony_; }

    void setPartialBudget(int maxPartials) noexcept;
    [[nodiscard]] int getPartialBudget() const noexcept { return partialBudget_; }

    void setAccentAmount(float accent01) noexcept;
    [[nodiscard]] float getAccentAmount() const noexcept { return accentAmount_; }

    void setMasterVolume(float gain) noexcept;
    void setFxMix(float chorusMix, float delayMix, float reverbMix) noexcept;

    void setOutputCharacter(McxOutputCharacter character) noexcept;
    [[nodiscard]] McxOutputCharacter getOutputCharacter() const noexcept { return outputCharacter_; }

    void setDiagnosticTestToneEnabled(bool enabled) noexcept
    {
        diagnosticTestTone_.store(enabled, std::memory_order_release);
    }
    [[nodiscard]] bool isDiagnosticTestToneEnabled() const noexcept
    {
        return diagnosticTestTone_.load(std::memory_order_acquire);
    }

    void setMasterTempoBpm(float bpm) noexcept;

    void triggerNote(int partIndex, int midiNote, float velocity, std::int32_t sampleOffset = 0) noexcept;
    void releaseNote(int partIndex, int midiNote, std::int32_t sampleOffset = 0) noexcept;

    void processAudio(float* left, float* right, int numSamples) noexcept;

    [[nodiscard]] int getActiveVoiceCount() const noexcept;
    [[nodiscard]] int getActivePartialCount() const noexcept;

    [[nodiscard]] HardwareMirrorRouter& getMirrorRouter() noexcept { return mirrorRouter_; }
    [[nodiscard]] const HardwareMirrorRouter& getMirrorRouter() const noexcept { return mirrorRouter_; }

    static float quantizeOutputSample(float x, McxOutputCharacter character) noexcept;

private:
    void applyDrumMuteGroup(int partIdx, McxPartState& p, int slotNote) noexcept;
    int countNeededPartials(const McxPartState& p, float velocity01) const noexcept;
    int allocateVoiceSlot(int requestedPartials) noexcept;
    int findStealCandidate() const noexcept;
    void triggerInternalVoice(int partIdx, int inputNote, float velocity, float eventAccent) noexcept;
    void releaseInternalVoice(int partIdx, int inputNote) noexcept;
    McxVoiceRenderConfig buildVoiceConfig(const McxPartState& p) const noexcept;

    double sampleRate_ { 44100.0 };
    int focusedPartIndex_ { 0 };
    McxMachinePersona persona_ { McxMachinePersona::FreeSuper };
    McxMachinePersonaSpec personaSpec_ { getMachinePersonaSpec(McxMachinePersona::FreeSuper) };
    int maxPolyphony_ { kMaxVoices };
    int partialBudget_ { 256 };
    float accentAmount_ { 0.0f };
    float masterGain_ { 0.85f };
    std::uint64_t noteCounter_ { 0 };
    int fxTailSamplesLeft_ { 0 };

    McxOutputCharacter outputCharacter_ { McxOutputCharacter::HdStudio };
    std::atomic<bool> diagnosticTestTone_ { false };
    double testTonePhase_ { 0.0 };

    std::vector<McxPartState> parts_;
    std::vector<McxVoice> voices_;
    McxOutputAndFx outputAndFx_ {};
    HardwareMirrorRouter mirrorRouter_ {};

    std::array<float, McxOutputAndFx::kMaxChunk> dryL_ {};
    std::array<float, McxOutputAndFx::kMaxChunk> dryR_ {};
    std::array<float, McxOutputAndFx::kMaxChunk> choL_ {};
    std::array<float, McxOutputAndFx::kMaxChunk> choR_ {};
    std::array<float, McxOutputAndFx::kMaxChunk> revL_ {};
    std::array<float, McxOutputAndFx::kMaxChunk> revR_ {};
};

} // namespace abdmcx
