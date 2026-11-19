#include "McxEngine.h"

#include <algorithm>

namespace abdmcx
{

McxPartState& McxEngine::part(int partIndex) noexcept
{
    return parts_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))];
}

const McxPartState& McxEngine::part(int partIndex) const noexcept
{
    return parts_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))];
}

IMcxSoundEngine* McxEngine::getPartSoundEngine(int partIndex) noexcept
{
    return engineSlots_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))];
}

const IMcxSoundEngine* McxEngine::getPartSoundEngine(int partIndex) const noexcept
{
    return engineSlots_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))];
}

void McxEngine::switchToResolvedEngine(int idx, int typeIdx, IMcxSoundEngine* nextEng, bool callPrepare) noexcept
{
    const auto uIdx = static_cast<std::size_t>(idx);
    if (nextEng == nullptr)
        return;

    if (IMcxSoundEngine* prev = engineSlots_[uIdx]; prev != nullptr)
    {
        prev->allNotesOff();
        prev->clearControlInputs();
    }

    auto& mr = modRouters_[uIdx];
    mr.clearRoutes();
    mr.clearDirectOffsets();
    lastSemanticOffsets_[uIdx] = McxTrackSemanticOffsets {};
    parts_[uIdx].latchedNoteMap.fill(-1);
    parts_[uIdx].arp.reset();

    engineSlots_[uIdx] = nextEng;
    partEngineTypeIdx_[uIdx] = typeIdx;
    if (callPrepare)
        nextEng->prepare(sampleRate_, McxOutputAndFx::kMaxChunk);
    else
    {
        nextEng->allNotesOff();
        nextEng->clearControlInputs();
    }

    if (!nextEng->supportsDrumMode() && parts_[uIdx].isDrumKit)
    {
        parts_[uIdx].isDrumKit = false;
        parts_[uIdx].kind = McxPartKind::Chromatic;
        parts_[uIdx].followGlobalTranspose = true;
    }
    if (nextEng == &engineRegistry_.rompler(idx))
        engineRegistry_.rompler(idx).setDrumMode(parts_[uIdx].isDrumKit);

    cacheSemanticDestIds(idx);
}

void McxEngine::setPartSoundEngine(int partIndex, IMcxSoundEngine* customEngine) noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    IMcxSoundEngine* target = (customEngine != nullptr) ? customEngine : &engineRegistry_.rompler(idx);
    const int typeIdx = engineRegistry_.findTypeIndexForInstance(target);
    switchToResolvedEngine(idx, typeIdx, target, customEngine != nullptr);
}

bool McxEngine::selectPartEngineType(int partIndex, int engineTypeIndex) noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    IMcxSoundEngine* nextEng = engineRegistry_.getInstanceForPart(engineTypeIndex, idx);
    if (nextEng == nullptr)
        return false;
    switchToResolvedEngine(idx, engineTypeIndex, nextEng, false);
    return true;
}

bool McxEngine::selectPartEngineById(int partIndex, const char* engineTypeId) noexcept
{
    const int typeIdx = engineRegistry_.findEngineTypeIndex(engineTypeId);
    if (typeIdx < 0)
        return false;
    return selectPartEngineType(partIndex, typeIdx);
}

int McxEngine::registerCustomEngineType(const abd::engines::EngineDescriptor& desc,
                                        IMcxSoundEngine* const* partInstances,
                                        int instanceCount) noexcept
{
    const int typeIdx = engineRegistry_.registerEngineType(desc, partInstances, instanceCount);
    if (typeIdx >= 0 && prepared_ && partInstances != nullptr)
    {
        const int count = std::min(instanceCount, kNumParts);
        for (int i = 0; i < count; ++i)
        {
            if (partInstances[i] != nullptr)
                partInstances[i]->prepare(sampleRate_, McxOutputAndFx::kMaxChunk);
        }
    }
    return typeIdx;
}

int McxEngine::getRegisteredEngineTypeCount() const noexcept { return engineRegistry_.getTypeCount(); }

abd::engines::EngineDescriptor McxEngine::getRegisteredEngineDescriptor(int typeIndex) const noexcept
{
    return engineRegistry_.getTypeDescriptor(typeIndex);
}

int McxEngine::getPartEngineTypeIndex(int partIndex) const noexcept
{
    return partEngineTypeIdx_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))];
}

const char* McxEngine::getPartEngineTypeId(int partIndex) const noexcept
{
    const IMcxSoundEngine* eng = getPartSoundEngine(partIndex);
    return (eng != nullptr) ? eng->getEngineTypeId() : "";
}

abd::engines::EngineDescriptor McxEngine::getPartEngineDescriptor(int partIndex) const noexcept
{
    const IMcxSoundEngine* eng = getPartSoundEngine(partIndex);
    return (eng != nullptr) ? eng->getDescriptor() : abd::engines::EngineDescriptor {};
}

int McxEngine::getPartFactoryPresetCount(int partIndex) const noexcept
{
    const IMcxSoundEngine* eng = getPartSoundEngine(partIndex);
    return (eng != nullptr) ? eng->getFactoryPresetCount() : 0;
}

const char* McxEngine::getPartFactoryPresetName(int partIndex, int presetIndex) const noexcept
{
    const IMcxSoundEngine* eng = getPartSoundEngine(partIndex);
    return (eng != nullptr) ? eng->getFactoryPresetName(presetIndex) : "";
}

bool McxEngine::loadPartFactoryPreset(int partIndex, int presetIndex) noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    const auto uIdx = static_cast<std::size_t>(idx);
    IMcxSoundEngine* eng = engineSlots_[uIdx];
    if (eng == nullptr)
        return false;

    eng->allNotesOff();
    if (!eng->loadFactoryPreset(presetIndex))
        return false;

    if (eng == &engineRegistry_.rompler(idx))
    {
        auto& rompler = engineRegistry_.rompler(idx);
        const bool isDrum = rompler.isDrumMode() && eng->supportsDrumMode();
        parts_[uIdx].isDrumKit = isDrum;
        parts_[uIdx].kind = isDrum ? McxPartKind::DrumMap : McxPartKind::Chromatic;
        parts_[uIdx].followGlobalTranspose = !isDrum;
        rompler.patch().level = 1.0f;
        rompler.patch().pan = 0.0f;
    }
    return true;
}

const char* McxEngine::getPartCurrentPresetName(int partIndex) const noexcept
{
    const IMcxSoundEngine* eng = getPartSoundEngine(partIndex);
    return (eng != nullptr) ? eng->getCurrentPresetName() : "";
}

bool McxEngine::setPartEngineParamByKey(int partIndex, std::string_view key, float value) noexcept
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    const auto uIdx = static_cast<std::size_t>(idx);
    IMcxSoundEngine* eng = engineSlots_[uIdx];
    if (eng == nullptr || !eng->setParamByKey(key, value))
        return false;

    if (key == "mode.drum" && eng == &engineRegistry_.rompler(idx))
    {
        const bool isDrum = (value >= 0.5f) && eng->supportsDrumMode();
        parts_[uIdx].isDrumKit = isDrum;
        parts_[uIdx].kind = isDrum ? McxPartKind::DrumMap : McxPartKind::Chromatic;
        parts_[uIdx].followGlobalTranspose = !isDrum;
    }
    return true;
}

bool McxEngine::getPartEngineParamByKey(int partIndex, std::string_view key, float& outValue) const noexcept { const auto* eng = getPartSoundEngine(partIndex); return eng != nullptr && eng->getParamByKey(key, outValue); }
std::string McxEngine::serializePartEngineStateJson(int partIndex) const { const auto* eng = getPartSoundEngine(partIndex); return eng != nullptr ? eng->serializeStateJson() : std::string {}; }

bool McxEngine::deserializePartEngineStateJson(int partIndex, std::string_view jsonText)
{
    const int idx = std::clamp(partIndex, 0, kNumParts - 1);
    const auto uIdx = static_cast<std::size_t>(idx);
    IMcxSoundEngine* eng = engineSlots_[uIdx];
    if (eng == nullptr || !eng->deserializeStateJson(jsonText))
        return false;

    if (eng == &engineRegistry_.rompler(idx))
    {
        auto& rompler = engineRegistry_.rompler(idx);
        const bool isDrum = rompler.isDrumMode() && eng->supportsDrumMode();
        parts_[uIdx].isDrumKit = isDrum;
        parts_[uIdx].kind = isDrum ? McxPartKind::DrumMap : McxPartKind::Chromatic;
        parts_[uIdx].followGlobalTranspose = !isDrum;
        rompler.patch().level = 1.0f;
        rompler.patch().pan = 0.0f;
    }
    return true;
}

std::size_t McxEngine::collectUnusedWaves() noexcept
{
    return engineRegistry_.collectUnusedWaves();
}

McxTrackModRouter& McxEngine::modRouter(int partIndex) noexcept
{
    return modRouters_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))];
}

const McxTrackModRouter& McxEngine::modRouter(int partIndex) const noexcept
{
    return modRouters_[static_cast<std::size_t>(std::clamp(partIndex, 0, kNumParts - 1))];
}

void McxEngine::cacheSemanticDestIds(int partIdx) noexcept
{
    const auto uIdx = static_cast<std::size_t>(partIdx);
    const IMcxSoundEngine* eng = engineSlots_[uIdx];
    auto& ids = semanticDestIds_[uIdx];
    if (eng == nullptr)
    {
        ids = CachedSemanticIds {};
        return;
    }
    ids.cutoff  = eng->findInputByRole(abd::synth::role::kFilterCutoff);
    ids.reso    = eng->findInputByRole(abd::synth::role::kFilterResonance);
    ids.attack  = eng->findInputByRole(abd::synth::role::kAmpEnvAttack);
    ids.decay   = eng->findInputByRole(abd::synth::role::kAmpEnvDecay);
    ids.sustain = eng->findInputByRole(abd::synth::role::kAmpEnvSustain);
    ids.release = eng->findInputByRole(abd::synth::role::kAmpEnvRelease);
    ids.vibrato = eng->findInputByRole(abd::synth::role::kLfo1Depth);
}

void McxEngine::syncPartEngineControl(int partIdx) noexcept
{
    const auto uIdx = static_cast<std::size_t>(partIdx);
    auto& p = parts_[uIdx];
    IMcxSoundEngine* eng = engineSlots_[uIdx];
    if (eng == nullptr)
        return;

    if (eng == &engineRegistry_.rompler(partIdx))
    {
        auto& rompler = engineRegistry_.rompler(partIdx);
        rompler.setDrumMode(p.isDrumKit);
        rompler.patch().level = 1.0f;
        rompler.patch().pan = 0.0f;
    }

    eng->setTransportContext({ static_cast<double>(masterTempoBpm_), masterTuneSemitones_, p.pitchBendSemitones });

    const auto& o = p.semanticOffsets;
    auto& prev = lastSemanticOffsets_[uIdx];
    auto& mr = modRouters_[uIdx];
    const auto& ids = semanticDestIds_[uIdx];

    if (o.cutoffOctaves != prev.cutoffOctaves) mr.setDirectOffset(ids.cutoff, o.cutoffOctaves);
    if (o.resonance != prev.resonance)         mr.setDirectOffset(ids.reso, o.resonance);
    if (o.envAttack != prev.envAttack)         mr.setDirectOffset(ids.attack, o.envAttack);
    if (o.envDecay != prev.envDecay)           mr.setDirectOffset(ids.decay, o.envDecay);
    if (o.envSustain != prev.envSustain)       mr.setDirectOffset(ids.sustain, o.envSustain);
    if (o.envRelease != prev.envRelease)       mr.setDirectOffset(ids.release, o.envRelease);
    if (o.vibratoDepth != prev.vibratoDepth)   mr.setDirectOffset(ids.vibrato, o.vibratoDepth);
    prev = o;

    mr.applyTo(*eng);
}

} // namespace abdmcx
