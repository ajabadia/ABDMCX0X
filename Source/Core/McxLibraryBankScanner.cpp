#include "McxLibraryService.h"
#include "McxMultiBankManager.h"
#include "SynthEngines/StructuredRompler/RomplerBankIndex.h"

#include <sstream>

namespace abdmcx
{

void McxLibraryService::scanBanksFolder(const std::filesystem::path& root)
{
    std::error_code ec;
    if (!std::filesystem::exists(root, ec))
        return;

    for (const auto& entry : std::filesystem::directory_iterator(root, ec))
    {
        if (!entry.is_regular_file(ec) || entry.path().extension() != ".abdbank")
            continue;

        const std::string filePath = entry.path().generic_string();
        const std::string bankStem = entry.path().stem().string();

        abd::rompler::RomplerBankIndex index;
        const bool indexed = index.indexFromFilePath(filePath);
        const std::string bankLabel = (indexed && !index.getBankName().empty()) ? index.getBankName() : bankStem;
        const std::string resolvedBankId = (indexed && !index.getBankId().empty()) ? index.getBankId() : sanitizeId("bank_" + bankStem);

        McxCatalogItem bankItem {};
        bankItem.filePath = filePath;
        bankItem.name = bankLabel;
        bankItem.itemType = McxCatalogItemType::SoundBank;
        bankItem.sublibrary = "Banks";
        bankItem.engineKind = "structured_rompler";
        bankItem.id = sanitizeId("bank_" + bankStem);
        bankItem.isFavorite = isFavorite(bankItem.id);
        bankItem.bankId = resolvedBankId;
        items_.push_back(std::move(bankItem));

        if (!indexed)
            continue;

        for (int t = 0; t < index.getToneCount(); ++t)
        {
            const auto* tone = index.getTone(t);
            if (tone == nullptr) continue;

            McxCatalogItem toneItem {};
            toneItem.filePath = filePath;
            toneItem.name = tone->name.empty() ? ("Tone " + std::to_string(t + 1)) : tone->name;
            toneItem.itemType = McxCatalogItemType::PartPreset;
            toneItem.sublibrary = bankLabel;
            toneItem.engineKind = "structured_rompler";
            toneItem.bankId = resolvedBankId;
            toneItem.bankSlotKind = "tone";
            toneItem.bankItemIndex = t;
            toneItem.id = sanitizeId("bank_" + bankStem + "_tone_" + std::to_string(t));
            toneItem.isFavorite = isFavorite(toneItem.id);
            items_.push_back(std::move(toneItem));
        }

        for (int k = 0; k < index.getDrumKitCount(); ++k)
        {
            const auto* kit = index.getDrumKit(k);
            if (kit == nullptr) continue;

            McxCatalogItem kitItem {};
            kitItem.filePath = filePath;
            kitItem.name = kit->name.empty() ? ("Kit " + std::to_string(k + 1)) : kit->name;
            kitItem.itemType = McxCatalogItemType::PartPreset;
            kitItem.sublibrary = bankLabel;
            kitItem.categoryId = 9;
            kitItem.categoryName = "Drums";
            kitItem.engineKind = "structured_rompler_drum";
            kitItem.bankId = resolvedBankId;
            kitItem.bankSlotKind = "drum_kit";
            kitItem.bankItemIndex = k;
            kitItem.id = sanitizeId("bank_" + bankStem + "_kit_" + std::to_string(k));
            kitItem.isFavorite = isFavorite(kitItem.id);
            items_.push_back(std::move(kitItem));
        }
    }
}

bool McxLibraryService::loadCatalogItemOnDemand(const std::string& itemId,
                                                McxMultiBankManager& banks,
                                                McxEngine& engine,
                                                int partIdx) const
{
    const McxCatalogItem* item = findItemById(itemId);
    if (item == nullptr || item->filePath.empty())
        return false;

    int slot = banks.findBankSlotByPath(item->filePath);
    if (slot < 0)
        slot = banks.mountBankFromFile(item->filePath, item->bankId);
    if (slot < 0)
        return false;

    if (item->bankSlotKind == "drum_kit")
        return banks.loadDrumKitToPart(slot, std::max(0, item->bankItemIndex), engine, partIdx);
    if (item->bankSlotKind == "tone")
        return banks.loadToneToPart(slot, std::max(0, item->bankItemIndex), engine, partIdx);
    if (item->itemType == McxCatalogItemType::SoundBank)
        return banks.loadToneToPart(slot, 0, engine, partIdx) || banks.loadDrumKitToPart(slot, 0, engine, partIdx);

    return false;
}

std::string McxLibraryService::serializeCatalogJson() const
{
    std::ostringstream ss;
    ss << "{\n";
    ss << "  \"type\": \"CATALOG_SNAPSHOT\",\n";
    ss << "  \"workingDir\": \"" << escapeJson(currentWorkingDir_.generic_string()) << "\",\n";
    ss << "  \"sublibraries\": [";
    for (std::size_t i = 0; i < sublibraries_.size(); ++i)
        ss << "\"" << escapeJson(sublibraries_[i]) << "\"" << (i + 1 < sublibraries_.size() ? ", " : "");
    ss << "],\n  \"items\": [\n";
    for (std::size_t i = 0; i < items_.size(); ++i)
    {
        const auto& it = items_[i];
        ss << "    {\n";
        ss << "      \"id\": \"" << escapeJson(it.id) << "\",\n";
        ss << "      \"name\": \"" << escapeJson(it.name) << "\",\n";
        ss << "      \"sublibrary\": \"" << escapeJson(it.sublibrary) << "\",\n";
        ss << "      \"categoryName\": \"" << escapeJson(it.categoryName) << "\",\n";
        ss << "      \"categoryId\": " << it.categoryId << ",\n";
        ss << "      \"engineKind\": \"" << escapeJson(it.engineKind) << "\",\n";
        ss << "      \"itemType\": " << static_cast<int>(it.itemType) << ",\n";
        ss << "      \"filePath\": \"" << escapeJson(it.filePath) << "\",\n";
        ss << "      \"isFavorite\": " << (it.isFavorite ? "true" : "false") << ",\n";
        ss << "      \"bankId\": \"" << escapeJson(it.bankId) << "\",\n";
        ss << "      \"bankSlotKind\": \"" << escapeJson(it.bankSlotKind) << "\",\n";
        ss << "      \"bankItemIndex\": " << it.bankItemIndex << "\n";
        ss << "    }" << (i + 1 < items_.size() ? ",\n" : "\n");
    }
    ss << "  ]\n}\n";
    return ss.str();
}

} // namespace abdmcx
