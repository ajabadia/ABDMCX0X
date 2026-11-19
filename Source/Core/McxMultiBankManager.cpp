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

int McxMultiBankManager::registerMountedIndex(std::unique_ptr<abd::rompler::RomplerBankIndex> idx,
                                              const std::string& filePath,
                                              bool replaceMatchingId)
{
    if (!idx || !idx->isValid())
        return -1;

    const int byId = findBankSlotById(idx->getBankId());
    if (byId >= 0)
    {
        if (replaceMatchingId)
        {
            auto& existing = slots_[static_cast<std::size_t>(byId)];
            existing.bankId = idx->getBankId();
            existing.filePath = filePath;
            existing.index = std::move(idx);
        }
        return byId;
    }

    MountedBankSlot slot {};
    slot.bankId = idx->getBankId();
    slot.filePath = filePath;
    slot.index = std::move(idx);
    slots_.push_back(std::move(slot));
    return static_cast<int>(slots_.size()) - 1;
}

int McxMultiBankManager::mountBankFromFile(const std::string& filePath, const std::string& bankIdOverride)
{
    if (filePath.empty())
        return -1;

    if (bankIdOverride.empty())
    {
        if (const int existing = findBankSlotByPath(filePath); existing >= 0)
            return existing;
    }

    auto idx = std::make_unique<abd::rompler::RomplerBankIndex>();
    if (!idx->indexFromFilePath(filePath, bankIdOverride))
        return -1;

    return registerMountedIndex(std::move(idx), filePath, !bankIdOverride.empty());
}

int McxMultiBankManager::mountBankFromMemory(const void* data,
                                             std::size_t sizeBytes,
                                             const std::string& bankIdOverride,
                                             bool copyBuffer)
{
    if (data == nullptr || sizeBytes == 0)
        return -1;

    auto idx = std::make_unique<abd::rompler::RomplerBankIndex>();
    if (!idx->indexFromMemory(data, sizeBytes, bankIdOverride, copyBuffer))
        return -1;

    return registerMountedIndex(std::move(idx), {}, true);
}

bool McxMultiBankManager::loadToneToPart(int bankSlot, int toneIndex, McxEngine& engine, int partIdx) const
{
    const auto* bank = getBank(bankSlot);
    if (bank == nullptr)
        return false;

    const int clampedPart = std::clamp(partIdx, 0, McxEngine::kNumParts - 1);
    (void)engine.selectPartEngineType(clampedPart, McxEngineRegistry::kRomplerTypeIndex);

    auto& part = engine.part(clampedPart);
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

void McxMultiBankManager::clear() noexcept
{
    slots_.clear();
}

} // namespace abdmcx
