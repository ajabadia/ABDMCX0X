#pragma once

#include "McxTypes.h"
#include "../FX/McxOutputAndFx.h"
#include "../Synth/McxChannelStrip.h"
#include "../../MIDI/HardwareMirrorRouter.h"
#include "../../MIDI/McxMidiOutQueue.h"
#include "SynthCore/DiagnosticSignalProbe.h"
#include "SynthCore/GrooveArpeggiator.h"
#include "SynthCore/MusicalScaleTransposer.h"

#include <array>
#include <cstdint>
#include <deque>
#include <vector>

namespace abdmcx
{

struct McxPartState
{
    explicit McxPartState(abd::rompler::StructuredRomplerEngine& rompler) noexcept
        : rompler_(&rompler)
    {
    }

    McxPartState(const McxPartState&) = delete;
    McxPartState& operator=(const McxPartState&) = delete;
    McxPartState(McxPartState&&) = delete;
    McxPartState& operator=(McxPartState&&) = delete;

    [[nodiscard]] abd::rompler::StructuredRomplerEngine& romplerEngine() noexcept { return *rompler_; }
    [[nodiscard]] const abd::rompler::StructuredRomplerEngine& romplerEngine() const noexcept { return *rompler_; }

    bool enabled { true };
    bool isDrumKit { false };
    McxPartKind kind { McxPartKind::Chromatic };
    std::uint8_t midiChannel { 1 };
    std::uint8_t keyLow { 0 };
    std::uint8_t keyHigh { 127 };
    bool mute { false };
    bool solo { false };
    bool followGlobalTranspose { true };
    McxPartRouteMode routeMode { McxPartRouteMode::Internal };
    std::uint8_t midiPortIndex { 0 };

    // Mixing Console Strip State (engine-agnostic)
    float level { 0.85f };
    float pan { 0.0f };
    float reverbSend { 0.25f }; // Send A
    float chorusSend { 0.10f }; // Send B
    float delaySend { 0.0f };   // Send C
    float auxSend { 0.0f };     // Send D
    bool reverbSendPre { false };
    bool chorusSendPre { false };
    bool delaySendPre { false };
    bool auxSendPre { false };

    bool eqEnabled { false };
    float eqLowFreqHz { 100.0f };
    float eqLowGainDb { 0.0f };
    float eqMidFreqHz { 1000.0f };
    float eqMidGainDb { 0.0f };
    float eqMidQ { 1.0f };
    float eqHighFreqHz { 8000.0f };
    float eqHighGainDb { 0.0f };
    bool driveEnabled { false };
    float driveAmount { 0.0f };

    float pitchBendSemitones { 0.0f };
    McxTrackSemanticOffsets semanticOffsets {};
    std::array<std::int8_t, 128> latchedNoteMap {};
    abd::synth::GrooveArpeggiator arp {};

private:
    abd::rompler::StructuredRomplerEngine* rompler_;

public:
    // Direct reference views into the part's StructuredRomplerEngine patch & drum kit
    McxStructureMode& structureMode { rompler_->patch().structureMode };
    McxFilterModel& filterModel { rompler_->patch().filterModel };
    McxDrumMapMode& drumMapMode { rompler_->drumKit().drumMapMode };
    bool& filter2Enabled { rompler_->patch().filter2.enabled };
    McxFilterModel& filter2Model { rompler_->patch().filter2.model };
    std::uint8_t& filter2Mode { rompler_->patch().filter2.mode };
    float& filter2CutoffHz { rompler_->patch().filter2.cutoffHz };
    float& filter2Resonance { rompler_->patch().filter2.resonance };
    float& vectorX { rompler_->patch().vectorX };
    float& vectorY { rompler_->patch().vectorY };
    bool& portamentoEnabled { rompler_->patch().portamentoEnabled };
    float& portamentoTimeMs { rompler_->patch().portamentoTimeMs };
    bool& portamentoLegatoOnly { rompler_->patch().portamentoLegatoOnly };

    std::uint8_t& lfo1Shape { rompler_->patch().lfo1.shape };
    bool& lfo1Sync { rompler_->patch().lfo1.sync };
    std::uint8_t& lfo1Trigger { rompler_->patch().lfo1.trigger };
    float& lfo1Rate { rompler_->patch().lfo1.rate };
    float& lfo1DelayMs { rompler_->patch().lfo1.delayMs };
    float& lfo1Depth { rompler_->patch().lfo1.depth };
    std::uint8_t& lfo1Target { rompler_->patch().lfo1.target };

    std::uint8_t& lfo2Shape { rompler_->patch().lfo2.shape };
    bool& lfo2Sync { rompler_->patch().lfo2.sync };
    std::uint8_t& lfo2Trigger { rompler_->patch().lfo2.trigger };
    float& lfo2Rate { rompler_->patch().lfo2.rate };
    float& lfo2DelayMs { rompler_->patch().lfo2.delayMs };
    float& lfo2Depth { rompler_->patch().lfo2.depth };
    std::uint8_t& lfo2Target { rompler_->patch().lfo2.target };

    std::array<McxPartialConfig, 4>& partials { rompler_->patch().partials };
    std::array<McxDrumSlotConfig, 128>& drumSlots { rompler_->drumKit().slots };
    McxDrumNoteRemapper& drumRemapper { rompler_->drumKit().remapper };
};

/**
 * @brief 16-part JUCE-free C++20 Multi-Engine Groovebox Workstation core for ABDMCX0X.
 * Hosts pluggable IMcxSoundEngine instances per track (default: ABDShared StructuredRompler
 * over a shared 64-voice RomplerVoicePool) plus per-track TrackModRouter modulation.
 */
class McxEngine
{
public:
    static constexpr int kNumParts = 16;
    static constexpr int kMaxVoices = 64;

    McxEngine() noexcept;
    McxEngine(const McxEngine&) = delete;
    McxEngine& operator=(const McxEngine&) = delete;
    McxEngine(McxEngine&&) = delete;
    McxEngine& operator=(McxEngine&&) = delete;

    void prepare(double sampleRate) noexcept;
    void reset() noexcept;

    void setFocusedPart(int partIndex) noexcept;
    [[nodiscard]] int getFocusedPart() const noexcept { return focusedPartIndex_; }

    McxPartState& part(int partIndex) noexcept;
    [[nodiscard]] const McxPartState& part(int partIndex) const noexcept;

    [[nodiscard]] IMcxSoundEngine* getPartSoundEngine(int partIndex) noexcept;
    void setPartSoundEngine(int partIndex, IMcxSoundEngine* customEngine) noexcept;
    [[nodiscard]] McxTrackModRouter& modRouter(int partIndex) noexcept;
    [[nodiscard]] const McxTrackModRouter& modRouter(int partIndex) const noexcept;

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

    void setDiagnosticTestToneEnabled(bool enabled) noexcept { diagProbe_.setInjectionPoint(enabled ? 2 : 0); }
    [[nodiscard]] bool isDiagnosticTestToneEnabled() const noexcept { return diagProbe_.isEnabled(); }
    [[nodiscard]] abd::synth::DiagnosticSignalProbe& getDiagnosticProbe() noexcept { return diagProbe_; }
    [[nodiscard]] const abd::synth::DiagnosticSignalProbe& getDiagnosticProbe() const noexcept { return diagProbe_; }

    void setMasterTempoBpm(float bpm) noexcept;
    void setTempoBpm(double bpm) noexcept { setMasterTempoBpm(static_cast<float>(bpm)); }
    [[nodiscard]] float getMasterTempoBpm() const noexcept { return masterTempoBpm_; }
    void setMasterTuneHz(float a4Hz) noexcept;
    [[nodiscard]] float getMasterTuneHz() const noexcept { return masterTuneHz_; }

    [[nodiscard]] abd::synth::MusicalScaleTransposer& getTransposer() noexcept { return transposer_; }
    [[nodiscard]] const abd::synth::MusicalScaleTransposer& getTransposer() const noexcept { return transposer_; }
    void setGlobalTranspose(int semitones) noexcept { transposer_.setTransposeSemitones(semitones); }
    void setGlobalScale(abd::synth::MusicalScale scale, int rootNote = 0) noexcept
    {
        transposer_.setScale(scale);
        transposer_.setRootNote(rootNote);
        transposer_.setQuantizeEnabled(scale != abd::synth::MusicalScale::Off);
    }

    void setPartKind(int partIndex, McxPartKind kind) noexcept;
    [[nodiscard]] bool isAnyPartSoloed() const noexcept;
    [[nodiscard]] bool isPartAudible(int partIndex) const noexcept;

    void routeMidiChannelNoteOn(int midiChannel1to16, int midiNote, float velocity, std::int32_t sampleOffset = 0) noexcept;
    void routeMidiChannelNoteOff(int midiChannel1to16, int midiNote, std::int32_t sampleOffset = 0) noexcept;
    void allNotesOff() noexcept;

    void setOutboundMidiQueue(McxMidiOutQueue<1024>* queue) noexcept { outboundQueue_ = queue; }
    [[nodiscard]] McxMidiOutQueue<1024>* getOutboundMidiQueue() const noexcept { return outboundQueue_; }

    void triggerPartNoteOn(int partIndex, int inputNote, float velocity, std::int32_t sampleOffset = 0) noexcept;
    void releasePartNoteOff(int partIndex, int inputNote, std::int32_t sampleOffset = 0) noexcept;
    void triggerInternalNoteOnly(int partIndex, int midiNote, float velocity) noexcept;
    void releaseInternalNoteOnly(int partIndex, int midiNote) noexcept;

    void triggerNote(int partIndex, int midiNote, float velocity, std::int32_t sampleOffset = 0) noexcept;
    void releaseNote(int partIndex, int midiNote, std::int32_t sampleOffset = 0) noexcept;

    void processAudio(float* left, float* right, int numSamples) noexcept;

    [[nodiscard]] int getActiveVoiceCount() const noexcept;
    [[nodiscard]] int getActivePartialCount() const noexcept;

    [[nodiscard]] McxChannelStrip& channelStrip(int partIndex) noexcept
    {
        return channelStrips_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))];
    }
    [[nodiscard]] const McxChannelStrip& channelStrip(int partIndex) const noexcept
    {
        return channelStrips_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))];
    }

    [[nodiscard]] HardwareMirrorRouter& getMirrorRouter() noexcept { return mirrorRouter_; }
    [[nodiscard]] const HardwareMirrorRouter& getMirrorRouter() const noexcept { return mirrorRouter_; }
    [[nodiscard]] McxOutputAndFx& getOutputAndFx() noexcept { return outputAndFx_; }
    [[nodiscard]] const McxOutputAndFx& getOutputAndFx() const noexcept { return outputAndFx_; }

    [[nodiscard]] std::array<float, kNumParts> getPartPeaks() const noexcept { return partPeaks_; }
    [[nodiscard]] std::array<float, kNumParts> getPartMidiPeaks() const noexcept { return partMidiPeaks_; }

    static float quantizeOutputSample(float x, McxOutputCharacter character) noexcept;

private:
    struct CachedSemanticIds
    {
        abd::synth::ModDestinationId cutoff {}, reso {}, attack {}, decay {}, sustain {}, release {}, vibrato {};
    };

    static void onRomplerVoiceStolen(void* userData, int ownerSlot, int drumSlotNote) noexcept;
    void cacheSemanticDestIds(int partIdx) noexcept;
    void syncPartEngineControl(int partIdx) noexcept;
    void triggerInternalVoice(int partIdx, int inputNote, float velocity, float eventAccent) noexcept;
    void releaseInternalVoice(int partIdx, int inputNote) noexcept;
    void dispatchNoteOnToOutputs(int partIdx, int note, float velocity, float eventAccent, std::int32_t sampleOffset) noexcept;
    void dispatchNoteOffToOutputs(int partIdx, int note, std::int32_t sampleOffset) noexcept;
    void emitExternalNoteOn(int partIdx, const McxPartState& p, int note, float velocity, std::int32_t sampleOffset) noexcept;
    void emitExternalNoteOff(int partIdx, const McxPartState& p, int note, std::int32_t sampleOffset) noexcept;

    double sampleRate_ { 44100.0 };
    int focusedPartIndex_ { 0 };
    McxMachinePersona persona_ { McxMachinePersona::FreeSuper };
    McxMachinePersonaSpec personaSpec_ { getMachinePersonaSpec(McxMachinePersona::FreeSuper) };
    int maxPolyphony_ { kMaxVoices };
    int partialBudget_ { 256 };
    float accentAmount_ { 0.0f };
    float masterGain_ { 0.85f };
    float masterTuneHz_ { 440.0f };
    float masterTuneSemitones_ { 0.0f };
    float masterTempoBpm_ { 120.0f };
    int fxTailSamplesLeft_ { 0 };

    McxOutputCharacter outputCharacter_ { McxOutputCharacter::HdStudio };
    abd::synth::DiagnosticSignalProbe diagProbe_ {};
    abd::synth::MusicalScaleTransposer transposer_ {};
    McxFilterBank diagFilter_ {};

    abd::rompler::RomplerVoicePool romplerPool_ {};
    std::vector<abd::rompler::StructuredRomplerEngine> romplerEngines_;
    std::array<IMcxSoundEngine*, kNumParts> engineSlots_ {};
    std::array<McxTrackModRouter, kNumParts> modRouters_ {};
    std::array<CachedSemanticIds, kNumParts> semanticDestIds_ {};
    std::array<McxTrackSemanticOffsets, kNumParts> lastSemanticOffsets_ {};
    std::deque<McxPartState> parts_;
    std::array<McxChannelStrip, kNumParts> channelStrips_ {};
    McxOutputAndFx outputAndFx_ {};
    HardwareMirrorRouter mirrorRouter_ {};
    McxMidiOutQueue<1024>* outboundQueue_ { nullptr };

    std::array<float, McxOutputAndFx::kMaxChunk> dryL_ {}, dryR_ {}, choL_ {}, choR_ {}, revL_ {}, revR_ {};
    std::array<float, McxOutputAndFx::kMaxChunk> delL_ {}, delR_ {}, auxL_ {}, auxR_ {}, partL_ {}, partR_ {};
    std::array<float, kNumParts> partPeaks_ {}, partMidiPeaks_ {};
};

} // namespace abdmcx
