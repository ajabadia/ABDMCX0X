#pragma once

#include "McxEngineRegistry.h"
#include "McxPartState.h"
#include "McxTypes.h"
#include "../FX/McxOutputAndFx.h"
#include "../Synth/McxChannelStrip.h"
#include "../../MIDI/HardwareMirrorRouter.h"
#include "../../MIDI/McxMidiClockEmitter.h"
#include "../../MIDI/McxMidiOutQueue.h"
#include "SynthCore/DiagnosticSignalProbe.h"
#include "SynthCore/MusicalScaleTransposer.h"

#include <array>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <memory>
#include <string>
#include <string_view>

namespace abdmcx
{

class McxPatternSequencer;
class McxSongAndScenes;

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
    ~McxEngine() noexcept;
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
    [[nodiscard]] const IMcxSoundEngine* getPartSoundEngine(int partIndex) const noexcept;
    void setPartSoundEngine(int partIndex, IMcxSoundEngine* customEngine) noexcept;

    [[nodiscard]] McxEngineRegistry& engineRegistry() noexcept { return engineRegistry_; }
    [[nodiscard]] const McxEngineRegistry& engineRegistry() const noexcept { return engineRegistry_; }
    [[nodiscard]] abd::rompler::RomplerWavePool& wavePool() noexcept { return engineRegistry_.wavePool(); }
    [[nodiscard]] const abd::rompler::RomplerWavePool& wavePool() const noexcept { return engineRegistry_.wavePool(); }
    std::size_t collectUnusedWaves() noexcept;

    [[nodiscard]] int getRegisteredEngineTypeCount() const noexcept;
    [[nodiscard]] abd::engines::EngineDescriptor getRegisteredEngineDescriptor(int typeIndex) const noexcept;
    int registerCustomEngineType(const abd::engines::EngineDescriptor& desc,
                                 IMcxSoundEngine* const* partInstances,
                                 int instanceCount) noexcept;
    bool selectPartEngineType(int partIndex, int engineTypeIndex) noexcept;
    bool selectPartEngineById(int partIndex, const char* engineTypeId) noexcept;
    [[nodiscard]] int getPartEngineTypeIndex(int partIndex) const noexcept;
    [[nodiscard]] const char* getPartEngineTypeId(int partIndex) const noexcept;
    [[nodiscard]] abd::engines::EngineDescriptor getPartEngineDescriptor(int partIndex) const noexcept;

    [[nodiscard]] int getPartFactoryPresetCount(int partIndex) const noexcept;
    [[nodiscard]] const char* getPartFactoryPresetName(int partIndex, int presetIndex) const noexcept;
    bool loadPartFactoryPreset(int partIndex, int presetIndex) noexcept;
    [[nodiscard]] const char* getPartCurrentPresetName(int partIndex) const noexcept;

    bool setPartEngineParamByKey(int partIndex, std::string_view key, float value) noexcept;
    [[nodiscard]] bool getPartEngineParamByKey(int partIndex, std::string_view key, float& outValue) const noexcept;
    [[nodiscard]] std::string serializePartEngineStateJson(int partIndex) const;
    bool deserializePartEngineStateJson(int partIndex, std::string_view jsonText);

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
    void setPartInsertSlot(int partIndex, int slotIndex) noexcept;
    [[nodiscard]] int getPartInsertSlot(int partIndex) const noexcept;
    void moveRackSlot(int fromIdx, int toIdx) noexcept;
    void removeRackSlot(int slotIdx) noexcept;
    void triggerSidechainDuck(float amount = 1.0f) noexcept { kickDuckEnvelope_ = std::max(kickDuckEnvelope_, amount); }
    void setManualDuckGate(bool active) noexcept { manualDuckGate_ = active; }
    void setAudioDuckEnabled(bool enabled) noexcept { audioDuckEnabled_ = enabled; }
    [[nodiscard]] bool isAudioDuckEnabled() const noexcept { return audioDuckEnabled_; }
    void setMidiDuckEnabled(bool enabled) noexcept { midiDuckEnabled_ = enabled; }
    [[nodiscard]] bool isMidiDuckEnabled() const noexcept { return midiDuckEnabled_; }
    [[nodiscard]] bool isAnyPartSoloed() const noexcept;
    [[nodiscard]] bool isPartAudible(int partIndex) const noexcept;

    void routeMidiChannelNoteOn(int midiChannel1to16, int midiNote, float velocity, std::int32_t sampleOffset = 0) noexcept;
    void routeMidiChannelNoteOff(int midiChannel1to16, int midiNote, std::int32_t sampleOffset = 0) noexcept;
    void routeMidiChannelCc(int midiChannel1to16, int ccNumber, int ccValue) noexcept;
    void setPartSustainPedal(int partIdx, bool down) noexcept;
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
    [[nodiscard]] McxChannelStrip& channelStrip(int partIndex) noexcept { return channelStrips_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))]; }
    [[nodiscard]] const McxChannelStrip& channelStrip(int partIndex) const noexcept { return channelStrips_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))]; }
    [[nodiscard]] HardwareMirrorRouter& getMirrorRouter() noexcept { return mirrorRouter_; }
    [[nodiscard]] const HardwareMirrorRouter& getMirrorRouter() const noexcept { return mirrorRouter_; }
    [[nodiscard]] McxOutputAndFx& getOutputAndFx() noexcept { return outputAndFx_; }
    [[nodiscard]] const McxOutputAndFx& getOutputAndFx() const noexcept { return outputAndFx_; }
    [[nodiscard]] McxPatternSequencer& sequencer() noexcept;
    [[nodiscard]] const McxPatternSequencer& sequencer() const noexcept;
    [[nodiscard]] McxSongAndScenes& songAndScenes() noexcept;
    [[nodiscard]] const McxSongAndScenes& songAndScenes() const noexcept;
    void applySceneStateNow(std::uint16_t muteMask, int transposeSemitones) noexcept;
    [[nodiscard]] std::uint16_t captureCurrentMuteMask() const noexcept;
    void triggerScene(int sceneIndex, bool immediate = false) noexcept;
    void captureCurrentToScene(int sceneIndex) noexcept;
    void setSongModeEnabled(bool enabled) noexcept;
    void setSongLoopEnabled(bool loop) noexcept;
    void jumpSongBlock(int blockIndex, bool immediate = false) noexcept;
    [[nodiscard]] McxMidiClockEmitter& midiClock() noexcept { return midiClock_; }
    [[nodiscard]] const McxMidiClockEmitter& midiClock() const noexcept { return midiClock_; }
    void setSequencerPlaying(bool playing, bool resetToZero = true) noexcept;
    void syncHostTransport(bool hostPlaying, double hostBpm, double hostPpqPos, bool ppqValid) noexcept;
    [[nodiscard]] bool isSequencerRunning() const noexcept;
    [[nodiscard]] int getSequencerTick() const noexcept;
    [[nodiscard]] int getSequencerStep() const noexcept;
    [[nodiscard]] int getSequencerTotalTicks() const noexcept;
    [[nodiscard]] std::array<float, kNumParts> getPartPeaks() const noexcept { return partPeaks_; }
    [[nodiscard]] std::array<float, kNumParts> getPartMidiPeaks() const noexcept { return partMidiPeaks_; }
    static float quantizeOutputSample(float x, McxOutputCharacter character) noexcept;

private:
    struct CachedSemanticIds { abd::synth::ModDestinationId cutoff {}, reso {}, attack {}, decay {}, sustain {}, release {}, vibrato {}; };
    static void onRomplerVoiceStolen(void* userData, int ownerSlot, int drumSlotNote) noexcept;
    void initSequencer() noexcept;
    void prepareSequencer(double sr) noexcept;
    void resetSequencer() noexcept;
    void processSequencerAndClock(int numSamples, std::int32_t baseSampleOffset = 0) noexcept;
    void switchToResolvedEngine(int idx, int typeIdx, IMcxSoundEngine* nextEng, bool callPrepare) noexcept;
    void cacheSemanticDestIds(int partIdx) noexcept;
    void syncPartEngineControl(int partIdx) noexcept;
    void triggerInternalVoice(int partIdx, int inputNote, float velocity, float eventAccent) noexcept;
    void releaseInternalVoice(int partIdx, int inputNote) noexcept;
    void dispatchNoteOnToOutputs(int partIdx, int note, float velocity, float eventAccent, std::int32_t sampleOffset) noexcept;
    void dispatchNoteOffToOutputs(int partIdx, int note, std::int32_t sampleOffset) noexcept;
    void emitExternalNoteOn(int partIdx, const McxPartState& p, int note, float velocity, std::int32_t sampleOffset) noexcept;
    void emitExternalNoteOff(int partIdx, const McxPartState& p, int note, std::int32_t sampleOffset) noexcept;

    double sampleRate_ { 44100.0 };
    bool prepared_ { false };
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

    McxEngineRegistry engineRegistry_ {};
    std::array<int, kNumParts> partEngineTypeIdx_ {};
    std::array<IMcxSoundEngine*, kNumParts> engineSlots_ {};
    std::array<McxTrackModRouter, kNumParts> modRouters_ {};
    std::array<CachedSemanticIds, kNumParts> semanticDestIds_ {};
    std::array<McxTrackSemanticOffsets, kNumParts> lastSemanticOffsets_ {};
    std::deque<McxPartState> parts_;
    std::array<McxChannelStrip, kNumParts> channelStrips_ {};
    McxOutputAndFx outputAndFx_ {};
    HardwareMirrorRouter mirrorRouter_ {};
    McxMidiOutQueue<1024>* outboundQueue_ { nullptr };
    McxMidiClockEmitter midiClock_ {};
    std::unique_ptr<McxPatternSequencer> sequencer_;
    std::unique_ptr<McxSongAndScenes> songAndScenes_;
    float kickDuckEnvelope_ { 0.0f };
    float audioDuckEnvelope_ { 0.0f };
    bool audioDuckEnabled_ { true };
    bool midiDuckEnabled_ { true };
    bool manualDuckGate_ { false };
    double prevHostPpqPos_ { -1.0 };
    bool prevHostPlaying_ { false };

    std::array<float, McxOutputAndFx::kMaxChunk> dryL_ {}, dryR_ {}, choL_ {}, choR_ {}, revL_ {}, revR_ {};
    std::array<float, McxOutputAndFx::kMaxChunk> delL_ {}, delR_ {}, auxL_ {}, auxR_ {}, partL_ {}, partR_ {};
    std::array<float, kNumParts> partPeaks_ {}, partMidiPeaks_ {};
};

} // namespace abdmcx
