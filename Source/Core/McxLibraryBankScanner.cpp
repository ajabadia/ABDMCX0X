#include "McxLibraryService.h"
#include "McxMultiBankManager.h"
#include "SynthEngines/StructuredRompler/RomplerBankIndex.h"

#include <cctype>
#include <sstream>

namespace abdmcx
{
namespace
{
std::string cleanBankDisplayName(std::string s)
{
    for (char& ch : s) if (ch == '_') ch = ' ';
    return s;
}

bool containsAny(const std::string& lower, std::initializer_list<const char*> needles)
{
    for (const char* w : needles) if (lower.find(w) != std::string::npos) return true;
    return false;
}

int inferHartmannCategory(const std::string& name, bool isKit)
{
    std::string lower = name;
    for (char& ch : lower) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
    if (containsAny(lower, { "orchestra hit", "sound effect", "sfx", "dj fx", "noise sweep", "laser", "applause", "helicopter", "gunshot", "siren", "fx kit" })) return 9;
    if (isKit || containsAny(lower, { "drum", "kit", "snare", "kick", "hihat", "tom", "cymbal", "perc", "rhythm", "loop", "arp", "beat", "groove" })) return 8;
    if (containsAny(lower, { "bell", "marimba", "vibe", "xylophone", "glock", "kalimba", "chime", "mallet", "gong", "tubular", "celesta", "agogo" })) return 2;
    if (containsAny(lower, { "bass", "slap", "fretless", "guitar", "harp", "banjo", "mandolin", "sitar", "koto", "shamisen", "pluck", "pizz" })) return 3;
    if (containsAny(lower, { "piano", "rhodes", "wurli", "clav", "epiano", "organ", "harpsi", "accord", "key" })) return 5;
    if (containsAny(lower, { "flute", "oboe", "clarinet", "bassoon", "sax", "wind", "reed", "brass", "trumpet", "trombone", "tuba", "horn", "fanfare" })) return 6;
    if (containsAny(lower, { "atmos", "morph", "shimmer", "ethereal", "soundscape", "extreme", "evolving", "crystal" })) return 7;
    if (containsAny(lower, { "pad", "choir", "voice", "vocal", "vox", "warm", "halo", "carpet" })) return 4;
    if (containsAny(lower, { "string", "violin", "viola", "cello", "orchestra", "ensemble", "arco" })) return 1;
    if (containsAny(lower, { "drone", "hit", "impact", "glitch" })) return 9;
    return 0;
}
} // namespace

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
        const std::string rawBankLabel = (indexed && !index.getBankName().empty()) ? index.getBankName() : bankStem;
        const std::string bankLabel = cleanBankDisplayName(rawBankLabel);
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
            toneItem.categoryId = (tone->categoryId >= 0 && tone->categoryId <= 9)
                ? tone->categoryId
                : inferHartmannCategory(tone->category.empty() ? toneItem.name : tone->category, false);
            toneItem.categoryName = tone->category.empty() ? "Synthesizer" : tone->category;
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
            kitItem.categoryId = (kit->categoryId >= 0 && kit->categoryId <= 9)
                ? kit->categoryId
                : inferHartmannCategory(kit->category.empty() ? kitItem.name : kit->category, true);
            kitItem.categoryName = kit->category.empty() ? "Drums, Perc & Loops" : kit->category;
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
