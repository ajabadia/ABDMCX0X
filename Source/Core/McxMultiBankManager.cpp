#include "McxMultiBankManager.h"

#include <algorithm>
#include <utility>

namespace abdmcx
{

int McxMultiBankManager::findBankSlotById(std::string_view bankId) const noexcept
{
    if (bankId.empty())
        return -1;
    for (std::size_t i = 0; i < slots_.size(); ++i)
    {
        if (slots_[i].bankId == bankId)
            return static_cast<int>(i);
    }
    return -1;
}

int McxMultiBankManager::findBankSlotByPath(std::string_view filePath) const noexcept
{
    if (filePath.empty())
        return -1;
    for (std::size_t i = 0; i < slots_.size(); ++i)
    {
        if (slots_[i].filePath == filePath)
            return static_cast<int>(i);
    }
    return -1;
}

const abd::rompler::RomplerBankIndex* McxMultiBankManager::getBank(int slot) const noexcept
{
    if (slot < 0 || slot >= static_cast<int>(slots_.size()))
        return nullptr;
    return slots_[static_cast<std::size_t>(slot)].index.get();
}

bool McxMultiBankManager::isLaSharedPcmBankId(std::string_view bankId) noexcept
{
    return bankId == "roland_d50" || bankId == "roland_mt32_v107"
        || bankId == "roland_cm32l_v102" || bankId == "roland_d110_v110"
        || bankId == "roland_jv880" || bankId.starts_with("roland_sr_jv80_");
}

bool McxMultiBankManager::preloadBankWaves(int bankSlot, abd::rompler::RomplerWavePool& pool) const
{
    const auto* bank = getBank(bankSlot);
    return bank != nullptr && bank->preloadAllWaves(pool) > 0;
}

int McxMultiBankManager::registerMountedIndex(std::unique_ptr<abd::rompler::RomplerBankIndex> idx,
                                              const std::string& filePath,
                                              bool replaceMatchingId,
                                              abd::rompler::RomplerWavePool* preloadWavePool)
{
    if (!idx || !idx->isValid())
        return -1;

    int targetSlot = findBankSlotById(idx->getBankId());
    if (targetSlot >= 0)
    {
        if (replaceMatchingId)
        {
            auto& existing = slots_[static_cast<std::size_t>(targetSlot)];
            existing.bankId = idx->getBankId();
            existing.filePath = filePath;
            existing.index = std::move(idx);
        }
    }
    else
    {
        MountedBankSlot slot {};
        slot.bankId = idx->getBankId();
        slot.filePath = filePath;
        slot.index = std::move(idx);
        slots_.push_back(std::move(slot));
        targetSlot = static_cast<int>(slots_.size()) - 1;
    }
    const auto* mounted = getBank(targetSlot);
    if (preloadWavePool != nullptr && mounted != nullptr && isLaSharedPcmBankId(mounted->getBankId()))
        (void)mounted->preloadAllWaves(*preloadWavePool);
    return targetSlot;
}

int McxMultiBankManager::mountBankFromFile(const std::string& filePath,
                                           const std::string& bankIdOverride,
                                           abd::rompler::RomplerWavePool* preloadWavePool)
{
    if (filePath.empty())
        return -1;

    if (bankIdOverride.empty())
    {
        if (const int existing = findBankSlotByPath(filePath); existing >= 0)
        {
            const auto* mounted = getBank(existing);
            if (preloadWavePool != nullptr && mounted != nullptr && isLaSharedPcmBankId(mounted->getBankId()))
                (void)mounted->preloadAllWaves(*preloadWavePool);
            return existing;
        }
    }

    auto idx = std::make_unique<abd::rompler::RomplerBankIndex>();
    if (!idx->indexFromFilePath(filePath, bankIdOverride))
        return -1;

    return registerMountedIndex(std::move(idx), filePath, !bankIdOverride.empty(), preloadWavePool);
}

int McxMultiBankManager::mountBankFromMemory(const void* data,
                                             std::size_t sizeBytes,
                                             const std::string& bankIdOverride,
                                             bool copyBuffer,
                                             abd::rompler::RomplerWavePool* preloadWavePool)
{
    if (data == nullptr || sizeBytes == 0)
        return -1;

    auto idx = std::make_unique<abd::rompler::RomplerBankIndex>();
    if (!idx->indexFromMemory(data, sizeBytes, bankIdOverride, copyBuffer))
        return -1;

    return registerMountedIndex(std::move(idx), {}, true, preloadWavePool);
}

bool McxMultiBankManager::loadToneToPart(int bankSlot, int toneIndex, McxEngine& engine, int partIdx) const
{
    const auto* bank = getBank(bankSlot);
    if (bank == nullptr)
        return false;

    const int clampedPart = std::clamp(partIdx, 0, McxEngine::kNumParts - 1);
    auto& part = engine.part(clampedPart);
    if (engine.getPartEngineTypeIndex(clampedPart) == McxEngineRegistry::kEmaxTypeIndex)
    {
        const auto* tone = bank->getTone(toneIndex);
        if (tone == nullptr)
            return false;
        const auto h0 = !tone->partialWaveIds[0].empty()
            ? bank->acquireWaveOnDemand(tone->partialWaveIds[0], engine.wavePool()) : abd::rompler::kInvalidWaveHandle;
        const auto h1 = !tone->partialWaveIds[1].empty()
            ? bank->acquireWaveOnDemand(tone->partialWaveIds[1], engine.wavePool()) : abd::rompler::kInvalidWaveHandle;
        const auto primary = (h0 != abd::rompler::kInvalidWaveHandle) ? h0 : h1;
        if (primary == abd::rompler::kInvalidWaveHandle)
            return false;
        auto& emax = engine.engineRegistry().emax(clampedPart);
        emax.setDefaultZone(primary, h1);
        if (const auto* w = engine.wavePool().get(primary))
            emax.setZoneRange(0, 0, 127, w->rootKey);
        emax.setParamByKey("voice", h1 != abd::rompler::kInvalidWaveHandle ? 2.0f : 0.0f);
        emax.setCurrentPresetName(tone->name);
        part.isDrumKit = false; part.kind = McxPartKind::Chromatic; part.followGlobalTranspose = true;
        (void)engine.collectUnusedWaves();
        return true;
    }

    (void)engine.selectPartEngineType(clampedPart, McxEngineRegistry::kRomplerTypeIndex);

    auto& rompler = part.romplerEngine();
    if (!bank->loadToneOnDemand(toneIndex, rompler, &engine.wavePool()))
        return false;

    part.isDrumKit = false;
    part.kind = McxPartKind::Chromatic;
    part.followGlobalTranspose = true;
    rompler.patch().level = 1.0f;
    rompler.patch().pan = 0.0f;
    (void)engine.collectUnusedWaves();
    return true;
}

bool McxMultiBankManager::loadDrumKitToPart(int bankSlot, int kitIndex, McxEngine& engine, int partIdx) const
{
    const auto* bank = getBank(bankSlot);
    if (bank == nullptr)
        return false;

    const int clampedPart = std::clamp(partIdx, 0, McxEngine::kNumParts - 1);
    (void)engine.selectPartEngineType(clampedPart, McxEngineRegistry::kRomplerTypeIndex);

    auto& part = engine.part(clampedPart);
    auto& rompler = part.romplerEngine();
    if (!bank->loadDrumKitOnDemand(kitIndex, rompler, &engine.wavePool()))
        return false;

    part.isDrumKit = true;
    part.kind = McxPartKind::DrumMap;
    part.followGlobalTranspose = false;
    rompler.patch().level = 1.0f;
    rompler.patch().pan = 0.0f;
    (void)engine.collectUnusedWaves();
    return true;
}

bool McxMultiBankManager::assignWaveToPart(int bankSlot,
                                           int waveIndex,
                                           bool isDrumSlot,
                                           int targetIndex,
                                           McxEngine& engine,
                                           int partIdx) const
{
    const auto* bank = getBank(bankSlot);
    if (bank == nullptr)
        return false;

    const int clampedPart = std::clamp(partIdx, 0, McxEngine::kNumParts - 1);
    auto& part = engine.part(clampedPart);
    const int activeType = engine.getPartEngineTypeIndex(clampedPart);
    if (activeType == McxEngineRegistry::kEmaxTypeIndex && !isDrumSlot)
    {
        const auto* desc = bank->getWaveDescriptor(waveIndex);
        if (desc == nullptr)
            return false;
        const auto handle = bank->acquireWaveOnDemand(desc->id, engine.wavePool());
        if (handle == abd::rompler::kInvalidWaveHandle)
            return false;
        auto& emax = engine.engineRegistry().emax(clampedPart);
        const bool sec = (targetIndex > 0);
        for (int z = 0; z < abd::emax::EmaxSoundEngine::kZoneCount; ++z)
            (void)emax.setZoneWaveHandle(z, sec, handle);
        if (!sec)
            emax.setZoneRange(0, 0, 127, desc->rootKey);
        part.isDrumKit = false; part.kind = McxPartKind::Chromatic; part.followGlobalTranspose = true;
        (void)engine.collectUnusedWaves();
        return true;
    }

    const bool keepJv = (activeType == McxEngineRegistry::kJv880TypeIndex && !isDrumSlot);
    if (!keepJv)
        (void)engine.selectPartEngineType(clampedPart, McxEngineRegistry::kRomplerTypeIndex);

    auto& rompler = keepJv ? engine.engineRegistry().jv880(clampedPart) : part.romplerEngine();
    const bool ok = isDrumSlot
        ? bank->assignWaveToDrumSlotOnDemand(waveIndex, targetIndex, rompler, &engine.wavePool())
        : bank->assignWaveToPartialOnDemand(waveIndex, targetIndex, rompler, &engine.wavePool());
    if (!ok)
        return false;

    part.isDrumKit = isDrumSlot;
    part.kind = isDrumSlot ? McxPartKind::DrumMap : McxPartKind::Chromatic;
    part.followGlobalTranspose = !isDrumSlot;
    rompler.patch().level = 1.0f;
    rompler.patch().pan = 0.0f;
    (void)engine.collectUnusedWaves();
    return true;
}

void McxMultiBankManager::clear() noexcept
{
    slots_.clear();
}

} // namespace abdmcx
