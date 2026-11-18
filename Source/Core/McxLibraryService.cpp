#include "McxLibraryService.h"

#include <algorithm>
#include <fstream>
#include <sstream>

namespace abdmcx
{

namespace
{
std::string sanitizeId(const std::string& str)
{
    std::string out;
    for (char c : str)
    {
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_')
            out += c;
        else if (c == ' ' || c == '.' || c == '/' || c == '\\')
            out += '_';
    }
    return out;
}

std::string escapeJson(const std::string& str)
{
    std::string out;
    out.reserve(str.size() + 8);
    for (char c : str)
    {
        if (c == '\\') out += "\\\\";
        else if (c == '"') out += "\\\"";
        else if (c == '\n') out += "\\n";
        else if (c == '\r') out += "\\r";
        else out += c;
    }
    return out;
}
} // namespace

bool McxLibraryService::scanWorkingDir(const std::string& workingDir)
{
    items_.clear();
    sublibraries_.clear();
    if (workingDir.empty()) return false;

    currentWorkingDir_ = std::filesystem::path(workingDir);
    std::error_code ec;
    if (!std::filesystem::exists(currentWorkingDir_, ec) || !std::filesystem::is_directory(currentWorkingDir_, ec))
        return false;

    loadFavorites(currentWorkingDir_ / "favorites.json");

    scanPresetsFolder(currentWorkingDir_ / "Presets" / "Parts", McxCatalogItemType::PartPreset);
    scanPresetsFolder(currentWorkingDir_ / "Presets" / "Multis", McxCatalogItemType::MultiPreset);
    scanBanksFolder(currentWorkingDir_ / "Banks");
    scanModelsFolder(currentWorkingDir_ / "Models");

    // Add unique sublibraries sorted
    std::unordered_set<std::string> subs;
    for (const auto& item : items_)
    {
        if (!item.sublibrary.empty()) subs.insert(item.sublibrary);
    }
    sublibraries_.assign(subs.begin(), subs.end());
    std::sort(sublibraries_.begin(), sublibraries_.end());

    return true;
}

void McxLibraryService::scanPresetsFolder(const std::filesystem::path& root, McxCatalogItemType type)
{
    std::error_code ec;
    if (!std::filesystem::exists(root, ec)) return;

    const std::string ext = (type == McxCatalogItemType::PartPreset) ? ".abdpart" : ".abdmulti";

    for (const auto& entry : std::filesystem::recursive_directory_iterator(root, ec))
    {
        if (entry.is_regular_file(ec) && entry.path().extension() == ext)
        {
            McxCatalogItem item{};
            item.filePath = entry.path().generic_string();
            item.name = entry.path().stem().string();
            item.itemType = type;

            auto rel = std::filesystem::relative(entry.path(), root, ec);
            if (rel.has_parent_path())
                item.sublibrary = rel.parent_path().string();
            else
                item.sublibrary = "Default";

            item.relativePath = rel.generic_string();
            item.id = sanitizeId(item.sublibrary + "_" + item.name);
            item.isFavorite = isFavorite(item.id);
            items_.push_back(std::move(item));
        }
    }
}

void McxLibraryService::scanBanksFolder(const std::filesystem::path& root)
{
    std::error_code ec;
    if (!std::filesystem::exists(root, ec)) return;

    for (const auto& entry : std::filesystem::directory_iterator(root, ec))
    {
        if (entry.is_regular_file(ec) && entry.path().extension() == ".abdbank")
        {
            McxCatalogItem item{};
            item.filePath = entry.path().generic_string();
            item.name = entry.path().stem().string();
            item.itemType = McxCatalogItemType::SoundBank;
            item.sublibrary = "Banks";
            item.engineKind = "rompler_bank";
            item.id = sanitizeId("bank_" + item.name);
            item.isFavorite = isFavorite(item.id);
            items_.push_back(std::move(item));
        }
    }
}

void McxLibraryService::scanModelsFolder(const std::filesystem::path& root)
{
    std::error_code ec;
    if (!std::filesystem::exists(root, ec)) return;

    for (const auto& entry : std::filesystem::recursive_directory_iterator(root, ec))
    {
        if (entry.is_directory(ec))
        {
            // If folder contains sound.script or model.mname, treat as model
            auto scriptPath = entry.path() / "sound.script";
            auto mnamePath = entry.path() / "model.mname";
            if (std::filesystem::exists(scriptPath, ec) || std::filesystem::exists(mnamePath, ec))
            {
                McxCatalogItem item{};
                item.filePath = entry.path().generic_string();
                item.name = entry.path().filename().string();
                item.itemType = McxCatalogItemType::Model;
                auto rel = std::filesystem::relative(entry.path(), root, ec);
                item.sublibrary = rel.has_parent_path() ? rel.parent_path().string() : "Models";
                item.engineKind = "spectral_ddsp";
                item.id = sanitizeId("model_" + item.sublibrary + "_" + item.name);
                item.isFavorite = isFavorite(item.id);
                items_.push_back(std::move(item));
            }
        }
    }
}

bool McxLibraryService::toggleFavorite(const std::string& id)
{
    if (favorites_.find(id) != favorites_.end())
        favorites_.erase(id);
    else
        favorites_.insert(id);

    if (!currentWorkingDir_.empty())
        saveFavorites(currentWorkingDir_ / "favorites.json");

    for (auto& item : items_)
    {
        if (item.id == id)
        {
            item.isFavorite = isFavorite(id);
            return item.isFavorite;
        }
    }
    return false;
}

bool McxLibraryService::isFavorite(const std::string& id) const noexcept
{
    return favorites_.find(id) != favorites_.end();
}

void McxLibraryService::loadFavorites(const std::filesystem::path& favPath)
{
    favorites_.clear();
    std::ifstream file(favPath);
    if (!file.is_open()) return;

    std::string line;
    while (std::getline(file, line))
    {
        // Simple line-based or JSON string extraction
        auto p1 = line.find('"');
        if (p1 != std::string::npos)
        {
            auto p2 = line.find('"', p1 + 1);
            if (p2 != std::string::npos)
                favorites_.insert(line.substr(p1 + 1, p2 - p1 - 1));
        }
    }
}

void McxLibraryService::saveFavorites(const std::filesystem::path& favPath)
{
    std::ofstream file(favPath, std::ios::trunc);
    if (!file.is_open()) return;

    file << "[\n";
    std::size_t i = 0;
    for (const auto& fav : favorites_)
    {
        file << "  \"" << escapeJson(fav) << "\"" << (++i < favorites_.size() ? ",\n" : "\n");
    }
    file << "]\n";
}

bool McxLibraryService::savePartPresetJson(const std::string& workingDir,
                                          const std::string& sublibrary,
                                          const std::string& presetName,
                                          int categoryId,
                                          const std::string& jsonContent)
{
    if (workingDir.empty() || presetName.empty()) return false;
    std::filesystem::path sub = sublibrary.empty() ? "User" : sublibrary;
    std::filesystem::path targetDir = std::filesystem::path(workingDir) / "Presets" / "Parts" / sub;

    std::error_code ec;
    std::filesystem::create_directories(targetDir, ec);
    if (ec) return false;

    std::filesystem::path outFile = targetDir / (presetName + ".abdpart");
    std::ofstream file(outFile, std::ios::trunc);
    if (!file.is_open()) return false;

    file << jsonContent;
    file.close();

    scanWorkingDir(workingDir);
    return true;
}

bool McxLibraryService::saveMultiPresetJson(const std::string& workingDir,
                                           const std::string& sublibrary,
                                           const std::string& presetName,
                                           int categoryId,
                                           const std::string& jsonContent)
{
    if (workingDir.empty() || presetName.empty()) return false;
    std::filesystem::path sub = sublibrary.empty() ? "User" : sublibrary;
    std::filesystem::path targetDir = std::filesystem::path(workingDir) / "Presets" / "Multis" / sub;

    std::error_code ec;
    std::filesystem::create_directories(targetDir, ec);
    if (ec) return false;

    std::filesystem::path outFile = targetDir / (presetName + ".abdmulti");
    std::ofstream file(outFile, std::ios::trunc);
    if (!file.is_open()) return false;

    file << jsonContent;
    file.close();

    scanWorkingDir(workingDir);
    return true;
}

std::string McxLibraryService::serializeCatalogJson() const
{
    std::ostringstream ss;
    ss << "{\n";
    ss << "  \"type\": \"CATALOG_SNAPSHOT\",\n";
    ss << "  \"workingDir\": \"" << escapeJson(currentWorkingDir_.generic_string()) << "\",\n";
    ss << "  \"sublibraries\": [";
    for (std::size_t i = 0; i < sublibraries_.size(); ++i)
    {
        ss << "\"" << escapeJson(sublibraries_[i]) << "\"" << (i + 1 < sublibraries_.size() ? ", " : "");
    }
    ss << "],\n";
    ss << "  \"items\": [\n";
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
        ss << "      \"isFavorite\": " << (it.isFavorite ? "true" : "false") << "\n";
        ss << "    }" << (i + 1 < items_.size() ? ",\n" : "\n");
    }
    ss << "  ]\n";
    ss << "}\n";
    return ss.str();
}

} // namespace abdmcx
