#include "McxEngineRegistry.h"

#include <algorithm>
#include <string_view>

namespace abdmcx
{

namespace
{
constexpr abd::engines::EngineControlInputDescriptor kNullControlInputs[] = {
    { 1, "cutoff_offset",    "Filter Cutoff",    abd::synth::role::kFilterCutoff,    -1.0f, 1.0f, 1.0f },
    { 2, "resonance_offset", "Filter Resonance", abd::synth::role::kFilterResonance, -1.0f, 1.0f, 1.0f },
    { 3, "attack_offset",    "Amp Attack",       abd::synth::role::kAmpEnvAttack,     -1.0f, 1.0f, 1.0f },
    { 4, "decay_offset",     "Amp Decay",        abd::synth::role::kAmpEnvDecay,      -1.0f, 1.0f, 1.0f },
    { 5, "sustain_offset",   "Amp Sustain",      abd::synth::role::kAmpEnvSustain,    -1.0f, 1.0f, 1.0f },
    { 6, "release_offset",   "Amp Release",      abd::synth::role::kAmpEnvRelease,    -1.0f, 1.0f, 1.0f },
    { 7, "lfo1_depth",       "Vibrato Depth",    abd::synth::role::kLfo1Depth,        -1.0f, 1.0f, 1.0f },
};
} // namespace

void McxNullSoundEngine::prepare(double sampleRate, int /*maxBlockSize*/) noexcept
{
    sampleRate_ = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    reset();
}

void McxNullSoundEngine::reset() noexcept
{
    activeNotes_ = 0;
    controlInputs_.fill(0.0f);
}

abd::engines::EngineDescriptor McxNullSoundEngine::getDescriptor() const noexcept
{
    return { getEngineTypeId(), getEngineDisplayName(), true, false, McxEngineRegistry::kNumParts };
}

const abd::engines::EngineControlInputDescriptor* McxNullSoundEngine::getControlInputDescriptors(std::size_t& outCount) const noexcept
{
    outCount = sizeof(kNullControlInputs) / sizeof(kNullControlInputs[0]);
    return kNullControlInputs;
}

void McxNullSoundEngine::setControlInputs(const float* valuesByDestId, std::size_t arraySize) noexcept
{
    if (valuesByDestId == nullptr)
        return;
    const std::size_t limit = std::min(arraySize, kControlSlotCount);
    for (std::size_t i = 0; i < limit; ++i)
        controlInputs_[i] = std::clamp(valuesByDestId[i], -1.0f, 1.0f);
}

void McxNullSoundEngine::clearControlInputs() noexcept { controlInputs_.fill(0.0f); }
void McxNullSoundEngine::setTransportContext(const abd::engines::EngineTransportContext& ctx) noexcept { transportCtx_ = ctx; }
void McxNullSoundEngine::noteOn(int /*midiNote*/, float /*velocity01*/, float /*accent01*/) noexcept { ++activeNotes_; }
void McxNullSoundEngine::noteOff(int /*midiNote*/) noexcept { activeNotes_ = std::max(0, activeNotes_ - 1); }
void McxNullSoundEngine::allNotesOff() noexcept { activeNotes_ = 0; }
bool McxNullSoundEngine::renderBlock(float* /*outL*/, float* /*outR*/, int /*numSamples*/) noexcept { return false; }

float McxNullSoundEngine::getControlInputValue(std::size_t destId) const noexcept
{
    return (destId < kControlSlotCount) ? controlInputs_[destId] : 0.0f;
}

McxEngineRegistry::McxEngineRegistry() noexcept
    : romplerEngines_(static_cast<std::size_t>(kNumParts)),
      jv880Engines_(static_cast<std::size_t>(kNumParts)),
      tb303Engines_(static_cast<std::size_t>(kNumParts)),
      emaxEngines_(static_cast<std::size_t>(kNumParts))
{
    std::array<abd::engines::ISoundEngine*, kNumParts> romplerPtrs {};
    std::array<abd::engines::ISoundEngine*, kNumParts> extPtrs {};
    std::array<abd::engines::ISoundEngine*, kNumParts> mcs48Ptrs {};
    std::array<abd::engines::ISoundEngine*, kNumParts> la50Ptrs {};
    std::array<abd::engines::ISoundEngine*, kNumParts> cm32Ptrs {};
    std::array<abd::engines::ISoundEngine*, kNumParts> jv880Ptrs {};
    std::array<abd::engines::ISoundEngine*, kNumParts> tb303Ptrs {};
    std::array<abd::engines::ISoundEngine*, kNumParts> emaxPtrs {};
    for (int i = 0; i < kNumParts; ++i)
    {
        const auto idx = static_cast<std::size_t>(i);
        auto& rompler = romplerEngines_[idx];
        rompler.attachVoicePool(&romplerPool_, i);
        rompler.attachWavePool(&wavePool_);
        rompler.patch().level = 1.0f;
        rompler.patch().pan = 0.0f;
        romplerPtrs[idx] = &rompler;
        extPtrs[idx] = &externalMidiEngines_[idx];
        mcs48Ptrs[idx] = &mcs48Engines_[idx];
        la50Engines_[idx].setDeferKernelUntilActive(true);
        la50Engines_[idx].attachWavePool(&wavePool_);
        la50Ptrs[idx] = &la50Engines_[idx];
        cm32Engines_[idx].configureAsCm32();
        cm32Engines_[idx].setDeferKernelUntilActive(true);
        cm32Engines_[idx].attachWavePool(&wavePool_);
        cm32Ptrs[idx] = &cm32Engines_[idx];
        auto& jv880 = jv880Engines_[idx];
        jv880.attachVoicePool(&romplerPool_, i);
        jv880.attachWavePool(&wavePool_);
        jv880.configureAsJv880();
        jv880Ptrs[idx] = &jv880;
        tb303Ptrs[idx] = &tb303Engines_[idx];
        auto& emax = emaxEngines_[idx];
        emax.attachWavePool(&wavePool_);
        emaxPtrs[idx] = &emax;
    }
    registerEngineType(romplerEngines_[0].getDescriptor(), romplerPtrs.data(), kNumParts);
    registerEngineType(externalMidiEngines_[0].getDescriptor(), extPtrs.data(), kNumParts);
    registerEngineType(mcs48Engines_[0].getDescriptor(), mcs48Ptrs.data(), kNumParts);
    registerEngineType(la50Engines_[0].getDescriptor(), la50Ptrs.data(), kNumParts);
    registerEngineType(cm32Engines_[0].getDescriptor(), cm32Ptrs.data(), kNumParts);
    registerEngineType(jv880Engines_[0].getDescriptor(), jv880Ptrs.data(), kNumParts);
    registerEngineType(tb303Engines_[0].getDescriptor(), tb303Ptrs.data(), kNumParts);
    registerEngineType(emaxEngines_[0].getDescriptor(), emaxPtrs.data(), kNumParts);
}

McxEngineRegistry::~McxEngineRegistry() noexcept
{
    for (auto& la : la50Engines_)
        la.attachWavePool(nullptr);
    for (auto& cm : cm32Engines_)
        cm.attachWavePool(nullptr);
    for (auto& jv : jv880Engines_)
    {
        jv.releaseActiveWaves();
        jv.attachWavePool(nullptr);
        jv.attachVoicePool(nullptr, 0);
    }
    for (auto& r : romplerEngines_)
    {
        r.releaseActiveWaves();
        r.attachWavePool(nullptr);
        r.attachVoicePool(nullptr, 0);
    }
    for (auto& e : emaxEngines_)
    {
        e.releaseActiveWaves();
        e.attachWavePool(nullptr);
    }
    wavePool_.clear();
}

void McxEngineRegistry::prepare(double sampleRate, int maxBlockSize) noexcept
{
    romplerPool_.prepare(sampleRate);
    for (int t = 0; t < typeCount_; ++t)
    {
        for (auto* inst : types_[static_cast<std::size_t>(t)].partSlots)
        {
            if (inst != nullptr)
                inst->prepare(sampleRate, maxBlockSize);
        }
    }
}

void McxEngineRegistry::reset() noexcept
{
    romplerPool_.reset();
    for (int t = 0; t < typeCount_; ++t)
    {
        for (auto* inst : types_[static_cast<std::size_t>(t)].partSlots)
        {
            if (inst != nullptr)
                inst->reset();
        }
    }
}

int McxEngineRegistry::registerEngineType(const abd::engines::EngineDescriptor& desc,
                                          abd::engines::ISoundEngine* const* partInstances,
                                          int instanceCount) noexcept
{
    if (desc.typeId == nullptr || desc.typeId[0] == '\0' || typeCount_ >= kMaxEngineTypes)
        return -1;
    if (findEngineTypeIndex(desc.typeId) >= 0)
        return -1;

    const int slotIdx = typeCount_++;
    auto& entry = types_[static_cast<std::size_t>(slotIdx)];
    entry.descriptor = desc;
    entry.partSlots.fill(nullptr);
    entry.occupied = true;

    if (partInstances != nullptr)
    {
        const int count = std::min(instanceCount, kNumParts);
        for (int i = 0; i < count; ++i)
            entry.partSlots[static_cast<std::size_t>(i)] = partInstances[i];
    }
    return slotIdx;
}

bool McxEngineRegistry::registerPartInstance(int typeIndex, int partIdx, abd::engines::ISoundEngine* instance) noexcept
{
    if (typeIndex < 0 || typeIndex >= typeCount_ || partIdx < 0 || partIdx >= kNumParts)
        return false;
    types_[static_cast<std::size_t>(typeIndex)].partSlots[static_cast<std::size_t>(partIdx)] = instance;
    return true;
}

int McxEngineRegistry::findEngineTypeIndex(const char* typeId) const noexcept
{
    if (typeId == nullptr || typeId[0] == '\0')
        return -1;
    const std::string_view target(typeId);
    for (int t = 0; t < typeCount_; ++t)
    {
        const char* id = types_[static_cast<std::size_t>(t)].descriptor.typeId;
        if (id != nullptr && std::string_view(id) == target)
            return t;
    }
    return -1;
}

abd::engines::EngineDescriptor McxEngineRegistry::getTypeDescriptor(int typeIndex) const noexcept
{
    if (typeIndex < 0 || typeIndex >= typeCount_)
        return {};
    return types_[static_cast<std::size_t>(typeIndex)].descriptor;
}

abd::engines::ISoundEngine* McxEngineRegistry::getInstanceForPart(int typeIndex, int partIdx) noexcept
{
    if (typeIndex < 0 || typeIndex >= typeCount_ || partIdx < 0 || partIdx >= kNumParts)
        return nullptr;
    return types_[static_cast<std::size_t>(typeIndex)].partSlots[static_cast<std::size_t>(partIdx)];
}

const abd::engines::ISoundEngine* McxEngineRegistry::getInstanceForPart(int typeIndex, int partIdx) const noexcept
{
    if (typeIndex < 0 || typeIndex >= typeCount_ || partIdx < 0 || partIdx >= kNumParts)
        return nullptr;
    return types_[static_cast<std::size_t>(typeIndex)].partSlots[static_cast<std::size_t>(partIdx)];
}

int McxEngineRegistry::findTypeIndexForInstance(const abd::engines::ISoundEngine* ptr) const noexcept
{
    if (ptr == nullptr)
        return -1;
    for (int t = 0; t < typeCount_; ++t)
    {
        for (const auto* s : types_[static_cast<std::size_t>(t)].partSlots)
        {
            if (s == ptr)
                return t;
        }
    }
    return -1;
}

abd::rompler::StructuredRomplerEngine& McxEngineRegistry::rompler(int partIdx) noexcept { return romplerEngines_[static_cast<std::size_t>(std::clamp(partIdx, 0, kNumParts - 1))]; }
const abd::rompler::StructuredRomplerEngine& McxEngineRegistry::rompler(int partIdx) const noexcept { return romplerEngines_[static_cast<std::size_t>(std::clamp(partIdx, 0, kNumParts - 1))]; }
abd::engines::La50SoundEngine& McxEngineRegistry::la50(int partIdx) noexcept { return la50Engines_[static_cast<std::size_t>(std::clamp(partIdx, 0, kNumParts - 1))]; }
const abd::engines::La50SoundEngine& McxEngineRegistry::la50(int partIdx) const noexcept { return la50Engines_[static_cast<std::size_t>(std::clamp(partIdx, 0, kNumParts - 1))]; }
abd::engines::La50SoundEngine& McxEngineRegistry::cm32(int partIdx) noexcept { return cm32Engines_[static_cast<std::size_t>(std::clamp(partIdx, 0, kNumParts - 1))]; }
const abd::engines::La50SoundEngine& McxEngineRegistry::cm32(int partIdx) const noexcept { return cm32Engines_[static_cast<std::size_t>(std::clamp(partIdx, 0, kNumParts - 1))]; }
abd::rompler::StructuredRomplerEngine& McxEngineRegistry::jv880(int partIdx) noexcept { return jv880Engines_[static_cast<std::size_t>(std::clamp(partIdx, 0, kNumParts - 1))]; }
const abd::rompler::StructuredRomplerEngine& McxEngineRegistry::jv880(int partIdx) const noexcept { return jv880Engines_[static_cast<std::size_t>(std::clamp(partIdx, 0, kNumParts - 1))]; }
abd::engines::Tb303SoundEngine& McxEngineRegistry::tb303(int partIdx) noexcept { return tb303Engines_[static_cast<std::size_t>(std::clamp(partIdx, 0, kNumParts - 1))]; }
const abd::engines::Tb303SoundEngine& McxEngineRegistry::tb303(int partIdx) const noexcept { return tb303Engines_[static_cast<std::size_t>(std::clamp(partIdx, 0, kNumParts - 1))]; }
abd::emax::EmaxSoundEngine& McxEngineRegistry::emax(int partIdx) noexcept { return emaxEngines_[static_cast<std::size_t>(std::clamp(partIdx, 0, kNumParts - 1))]; }
const abd::emax::EmaxSoundEngine& McxEngineRegistry::emax(int partIdx) const noexcept { return emaxEngines_[static_cast<std::size_t>(std::clamp(partIdx, 0, kNumParts - 1))]; }
std::size_t McxEngineRegistry::collectUnusedWaves() noexcept { return wavePool_.collectGarbage(&romplerPool_); }

} // namespace abdmcx
