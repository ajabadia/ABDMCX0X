#pragma once

#include "McxTypes.h"
#include "SynthEngines/ISoundEngine.h"
#include "SynthEngines/Emax/EmaxSoundEngine.h"
#include "SynthEngines/LinearArithmetic/La50SoundEngine.h"
#include "SynthEngines/Mcs48/Mcs48SoundEngine.h"
#include "SynthEngines/StructuredRompler/RomplerVoicePool.h"
#include "SynthEngines/StructuredRompler/RomplerWavePool.h"
#include "SynthEngines/StructuredRompler/StructuredRomplerEngine.h"
#include "SynthEngines/Tb303/Tb303SoundEngine.h"

#include <array>
#include <cstddef>
#include <vector>

namespace abdmcx
{

/**
 * @brief Lightweight silent ISoundEngine slot representing external-only MIDI / placeholder tracks.
 * Publishes canonical semantic control inputs so TrackModRouter binds cleanly without audio CPU cost.
 */
class McxNullSoundEngine final : public abd::engines::ISoundEngine
{
public:
    static constexpr std::size_t kControlSlotCount = 8;

    void prepare(double sampleRate, int maxBlockSize) noexcept override;
    void reset() noexcept override;

    [[nodiscard]] const char* getEngineTypeId() const noexcept override { return "external_midi"; }
    [[nodiscard]] const char* getEngineDisplayName() const noexcept override { return "External MIDI / Silent Slot"; }
    [[nodiscard]] bool supportsDrumMode() const noexcept override { return true; }
    [[nodiscard]] abd::engines::EngineDescriptor getDescriptor() const noexcept override;

    [[nodiscard]] const abd::engines::EngineControlInputDescriptor* getControlInputDescriptors(std::size_t& outCount) const noexcept override;
    void setControlInputs(const float* valuesByDestId, std::size_t arraySize) noexcept override;
    void clearControlInputs() noexcept override;

    void setTransportContext(const abd::engines::EngineTransportContext& ctx) noexcept override;

    void noteOn(int midiNote, float velocity01, float accent01 = 0.0f) noexcept override;
    void noteOff(int midiNote) noexcept override;
    void allNotesOff() noexcept override;

    [[nodiscard]] bool renderBlock(float* outL, float* outR, int numSamples) noexcept override;

    [[nodiscard]] float getControlInputValue(std::size_t destId) const noexcept;
    [[nodiscard]] int getActiveNoteCount() const noexcept { return activeNotes_; }
    [[nodiscard]] double getSampleRate() const noexcept { return sampleRate_; }

private:
    double sampleRate_ { 44100.0 };
    int activeNotes_ { 0 };
    abd::engines::EngineTransportContext transportCtx_ {};
    std::array<float, kControlSlotCount> controlInputs_ {};
};

/**
 * @brief Static RT-safe multi-engine registry and pool host for the 64-part Groovebox.
 *
 * Pre-allocates the shared RomplerVoicePool, shared RomplerWavePool, 64 StructuredRomplerEngine
 * instances, and 64 External MIDI silent slots upfront so engine switching and audio rendering
 * perform zero heap allocations or locks on the audio thread.
 */
class McxEngineRegistry
{
public:
    static constexpr int kNumParts = 64;
    static constexpr int kMaxEngineTypes = 12;
    static constexpr int kRomplerTypeIndex = 0;
    static constexpr int kExternalMidiTypeIndex = 1;
    static constexpr int kMcs48TypeIndex = 2;
    static constexpr int kLa50TypeIndex = 3;
    static constexpr int kCm32TypeIndex = 4;
    static constexpr int kJv880TypeIndex = 5;
    static constexpr int kTb303TypeIndex = 6;
    static constexpr int kEmaxTypeIndex = 7;

    McxEngineRegistry() noexcept;
    ~McxEngineRegistry() noexcept;

    McxEngineRegistry(const McxEngineRegistry&) = delete;
    McxEngineRegistry& operator=(const McxEngineRegistry&) = delete;
    McxEngineRegistry(McxEngineRegistry&&) = delete;
    McxEngineRegistry& operator=(McxEngineRegistry&&) = delete;

    void prepare(double sampleRate, int maxBlockSize) noexcept;
    void reset() noexcept;

    int registerEngineType(const abd::engines::EngineDescriptor& desc,
                           abd::engines::ISoundEngine* const* partInstances,
                           int instanceCount) noexcept;
    bool registerPartInstance(int typeIndex, int partIdx, abd::engines::ISoundEngine* instance) noexcept;

    [[nodiscard]] int getTypeCount() const noexcept { return typeCount_; }
    [[nodiscard]] int findEngineTypeIndex(const char* typeId) const noexcept;
    [[nodiscard]] abd::engines::EngineDescriptor getTypeDescriptor(int typeIndex) const noexcept;
    [[nodiscard]] abd::engines::ISoundEngine* getInstanceForPart(int typeIndex, int partIdx) noexcept;
    [[nodiscard]] const abd::engines::ISoundEngine* getInstanceForPart(int typeIndex, int partIdx) const noexcept;
    [[nodiscard]] int findTypeIndexForInstance(const abd::engines::ISoundEngine* ptr) const noexcept;

    [[nodiscard]] abd::rompler::RomplerVoicePool& romplerPool() noexcept { return romplerPool_; }
    [[nodiscard]] const abd::rompler::RomplerVoicePool& romplerPool() const noexcept { return romplerPool_; }
    [[nodiscard]] abd::rompler::RomplerWavePool& wavePool() noexcept { return wavePool_; }
    [[nodiscard]] const abd::rompler::RomplerWavePool& wavePool() const noexcept { return wavePool_; }

    [[nodiscard]] abd::rompler::StructuredRomplerEngine& rompler(int partIdx) noexcept;
    [[nodiscard]] const abd::rompler::StructuredRomplerEngine& rompler(int partIdx) const noexcept;
    [[nodiscard]] abd::engines::La50SoundEngine& la50(int partIdx) noexcept;
    [[nodiscard]] const abd::engines::La50SoundEngine& la50(int partIdx) const noexcept;
    [[nodiscard]] abd::engines::La50SoundEngine& cm32(int partIdx) noexcept;
    [[nodiscard]] const abd::engines::La50SoundEngine& cm32(int partIdx) const noexcept;
    [[nodiscard]] abd::rompler::StructuredRomplerEngine& jv880(int partIdx) noexcept;
    [[nodiscard]] const abd::rompler::StructuredRomplerEngine& jv880(int partIdx) const noexcept;
    [[nodiscard]] abd::engines::Tb303SoundEngine& tb303(int partIdx) noexcept;
    [[nodiscard]] const abd::engines::Tb303SoundEngine& tb303(int partIdx) const noexcept;
    [[nodiscard]] abd::emax::EmaxSoundEngine& emax(int partIdx) noexcept;
    [[nodiscard]] const abd::emax::EmaxSoundEngine& emax(int partIdx) const noexcept;
    [[nodiscard]] std::size_t collectUnusedWaves() noexcept;

private:
    struct RegisteredType
    {
        abd::engines::EngineDescriptor descriptor {};
        std::array<abd::engines::ISoundEngine*, kNumParts> partSlots {};
        bool occupied { false };
    };

    // Destruction order dependency: pools MUST outlive romplerEngines_.
    abd::rompler::RomplerVoicePool romplerPool_ {};
    abd::rompler::RomplerWavePool wavePool_ {};
    std::vector<abd::rompler::StructuredRomplerEngine> romplerEngines_;
    std::vector<abd::rompler::StructuredRomplerEngine> jv880Engines_;
    std::array<McxNullSoundEngine, kNumParts> externalMidiEngines_ {};
    std::array<abd::engines::Mcs48SoundEngine, kNumParts> mcs48Engines_ {};
    std::array<abd::engines::La50SoundEngine, kNumParts> la50Engines_ {};
    std::array<abd::engines::La50SoundEngine, kNumParts> cm32Engines_ {};
    std::vector<abd::engines::Tb303SoundEngine> tb303Engines_;
    std::vector<abd::emax::EmaxSoundEngine> emaxEngines_;
    std::array<RegisteredType, kMaxEngineTypes> types_ {};
    int typeCount_ { 0 };
};

} // namespace abdmcx
