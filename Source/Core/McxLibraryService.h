#pragma once

#include <filesystem>
#include <string>
#include <unordered_set>
#include <vector>

namespace abdmcx
{

enum class McxCatalogItemType
{
    Model,
    PartPreset,
    MultiPreset,
    SoundBank
};

struct McxCatalogItem
{
    std::string id;
    std::string name;
    std::string sublibrary;
    std::string categoryName { "General" };
    int categoryId { 0 }; // 0..31
    std::string engineKind { "rompler_chromatic" };
    std::string filePath;
    std::string relativePath;
    std::string thumbnailUri;
    McxCatalogItemType itemType { McxCatalogItemType::PartPreset };
    bool isFavorite { false };
    bool isSelfContained { false };
};

/**
 * @brief Thread-safe file library scanner and catalog manager for ABDMCX0X.
 * Indexes models, banks (.abdbank), part presets (.abdpart) and multi presets (.abdmulti).
 * Handles sublibraries (subfolders) and favorites persistence (favorites.json).
 */
class McxLibraryService
{
public:
    McxLibraryService() = default;

    bool scanWorkingDir(const std::string& workingDir);
    [[nodiscard]] const std::vector<McxCatalogItem>& getItems() const noexcept { return items_; }
    [[nodiscard]] const std::vector<std::string>& getSublibraries() const noexcept { return sublibraries_; }

    bool toggleFavorite(const std::string& id);
    [[nodiscard]] bool isFavorite(const std::string& id) const noexcept;

    bool savePartPresetJson(const std::string& workingDir,
                            const std::string& sublibrary,
                            const std::string& presetName,
                            int categoryId,
                            const std::string& jsonContent);

    bool saveMultiPresetJson(const std::string& workingDir,
                             const std::string& sublibrary,
                             const std::string& presetName,
                             int categoryId,
                             const std::string& jsonContent);

    [[nodiscard]] std::string serializeCatalogJson() const;

private:
    void loadFavorites(const std::filesystem::path& favPath);
    void saveFavorites(const std::filesystem::path& favPath);
    void scanPresetsFolder(const std::filesystem::path& root, McxCatalogItemType type);
    void scanBanksFolder(const std::filesystem::path& root);
    void scanModelsFolder(const std::filesystem::path& root);

    std::filesystem::path currentWorkingDir_;
    std::vector<McxCatalogItem> items_;
    std::vector<std::string> sublibraries_;
    std::unordered_set<std::string> favorites_;
};

} // namespace abdmcx
