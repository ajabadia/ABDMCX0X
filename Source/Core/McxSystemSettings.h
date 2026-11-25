#pragma once

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

namespace abdmcx
{

/**
 * @brief Level-1 Local Synth Settings (never serialized inside musical presets).
 * Manages Working Directory compatible with AxionikDB (Models / Presets / Banks / MidiLearn),
 * max polyphony, master A4 tuning, standalone BPM, visual theme family, scheme, and locale.
 */
struct McxSystemSettings
{
    std::string workingDirectory {};
    int maxPolyphony { 64 };
    float masterTuneHz { 440.0f };
    float standaloneBpm { 120.0f };
    std::string themeFamily { "ms2000" };
    std::string colorScheme { "dark" };
    std::string locale { "es" };

    static std::filesystem::path defaultSettingsFilePath()
    {
#ifdef _WIN32
        if (const char* appData = std::getenv("APPDATA"); appData && *appData)
            return std::filesystem::path(appData) / "ABDSynths" / "ABDMCX0X" / "settings.json";
#endif
        return std::filesystem::current_path() / "abdmcx0x_settings.json";
    }

    static std::string discoverDefaultWorkingDir()
    {
        const std::vector<std::filesystem::path> candidates = {
            R"(D:\desarrollos\ABDSynths\ABDAxionikVS\AxionikDB)",
            R"(D:\desarrollos\ABDSynths\AxionikDB)",
            R"(D:\desarrollos\ABDSynths\ABDNeuModMakr\AxionikDB)",
            std::filesystem::current_path() / "AxionikDB",
        };
        for (const auto& p : candidates)
        {
            std::error_code ec;
            if (std::filesystem::exists(p, ec) && std::filesystem::is_directory(p, ec))
                return p.string();
        }
        return {};
    }

    static bool ensureWorkingDirScaffold(const std::string& dirPath)
    {
        if (dirPath.empty()) return false;
        std::error_code ec;
        const std::filesystem::path root(dirPath);
        const char* subdirs[] = {
            "Models/Rompler", "Models/Drums", "Models/Wavetables", "Models/Spectral",
            "Presets/Parts", "Presets/Multis", "Presets/Patterns", "Banks", "MidiLearn", "Sequences", "PerformanceMaps"
        };
        std::filesystem::create_directories(root, ec);
        if (ec) return false;
        for (const char* sub : subdirs)
            std::filesystem::create_directories(root / sub, ec);
        return true;
    }

    static std::string escapeJson(const std::string& s)
    {
        std::string out;
        out.reserve(s.size() + 8);
        for (char c : s)
        {
            if (c == '\\') out += "\\\\";
            else if (c == '"') out += "\\\"";
            else out += c;
        }
        return out;
    }

    [[nodiscard]] std::string toJson() const
    {
        std::ostringstream oss;
        oss << "{\n"
            << "  \"workingDirectory\": \"" << escapeJson(workingDirectory) << "\",\n"
            << "  \"maxPolyphony\": " << std::clamp(maxPolyphony, 8, 64) << ",\n"
            << "  \"masterTuneHz\": " << std::clamp(masterTuneHz, 415.0f, 466.0f) << ",\n"
            << "  \"standaloneBpm\": " << std::clamp(standaloneBpm, 40.0f, 240.0f) << ",\n"
            << "  \"themeFamily\": \"" << escapeJson(themeFamily) << "\",\n"
            << "  \"colorScheme\": \"" << escapeJson(colorScheme) << "\",\n"
            << "  \"locale\": \"" << escapeJson(locale) << "\"\n"
            << "}\n";
        return oss.str();
    }

    bool saveToDisk() const
    {
        const auto file = defaultSettingsFilePath();
        std::error_code ec;
        std::filesystem::create_directories(file.parent_path(), ec);
        std::ofstream ofs(file, std::ios::binary | std::ios::trunc);
        if (!ofs) return false;
        ofs << toJson();
        return ofs.good();
    }

    void loadFromDisk()
    {
        const auto file = defaultSettingsFilePath();
        std::ifstream ifs(file, std::ios::binary);
        if (ifs)
        {
            std::ostringstream ss;
            ss << ifs.rdbuf();
            const std::string text = ss.str();
            auto readStr = [&](const char* key, std::string& dst) {
                const std::string needle = std::string("\"") + key + "\"";
                auto pos = text.find(needle);
                if (pos == std::string::npos) return;
                pos = text.find(':', pos + needle.size());
                auto q1 = text.find('"', pos);
                if (q1 == std::string::npos) return;
                std::string val;
                for (std::size_t i = q1 + 1; i < text.size(); ++i)
                {
                    if (text[i] == '\\' && i + 1 < text.size()) { val += text[++i]; continue; }
                    if (text[i] == '"') break;
                    val += text[i];
                }
                dst = val;
            };
            auto readNum = [&](const char* key, double& dst) {
                const std::string needle = std::string("\"") + key + "\"";
                auto pos = text.find(needle);
                if (pos == std::string::npos) return;
                pos = text.find(':', pos + needle.size());
                if (pos == std::string::npos) return;
                try { dst = std::stod(text.substr(pos + 1)); } catch (...) {}
            };
            readStr("workingDirectory", workingDirectory);
            readStr("themeFamily", themeFamily);
            readStr("colorScheme", colorScheme);
            readStr("locale", locale);
            double num = 0.0;
            num = maxPolyphony; readNum("maxPolyphony", num); maxPolyphony = std::clamp(static_cast<int>(num), 8, 64);
            num = masterTuneHz; readNum("masterTuneHz", num); masterTuneHz = std::clamp(static_cast<float>(num), 415.0f, 466.0f);
            num = standaloneBpm; readNum("standaloneBpm", num); standaloneBpm = std::clamp(static_cast<float>(num), 40.0f, 240.0f);
        }
        if (workingDirectory.empty())
            workingDirectory = discoverDefaultWorkingDir();
    }
};

} // namespace abdmcx
