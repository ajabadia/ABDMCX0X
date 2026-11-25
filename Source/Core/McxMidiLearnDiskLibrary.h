#pragma once

#include "SynthCore/MiniJsonParser.h"

#include <algorithm>
#include <cctype>
#include <cstddef>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

namespace abdmcx
{

struct McxMidiLearnDiskProfile
{
    std::string device {};
    std::string displayName {};
    std::vector<std::string> portMatchHints {};
    int mappingCount { 0 };
    bool fromWorkingDir { false };
    std::string rawJson {};
};

/**
 * @brief Non-RT disk scanner and matcher for MIDI Learn controller profiles
 *        under `<WorkingDir>/MidiLearn/*.json` and factory `ABDMCX0X/MidiLearn/*.json`.
 */
class McxMidiLearnDiskLibrary
{
public:
    static std::string toLowerAscii(std::string_view s)
    {
        std::string out;
        out.reserve(s.size());
        for (unsigned char c : s) out.push_back(static_cast<char>(std::tolower(c)));
        return out;
    }

    static std::string normalizeId(std::string_view s)
    {
        std::string out;
        out.reserve(s.size());
        for (unsigned char c : s)
        {
            if (std::isalnum(c)) out.push_back(static_cast<char>(std::tolower(c)));
        }
        return out;
    }

    static std::string sanitizeFileStem(std::string_view raw)
    {
        std::string out;
        out.reserve(raw.size());
        for (unsigned char c : raw)
        {
            if (std::isalnum(c) || c == '_' || c == '-') out.push_back(static_cast<char>(std::tolower(c)));
            else if (c == ' ' || c == '.') out.push_back('_');
        }
        if (out.empty()) out = "custom_controller";
        return out;
    }

    static std::string escapeJson(std::string_view s)
    {
        std::string out;
        out.reserve(s.size() + 8);
        for (unsigned char c : s)
        {
            if (c == '\\') out += "\\\\";
            else if (c == '"') out += "\\\"";
            else if (c == '\n') out += "\\n";
            else if (c == '\r') out += "\\r";
            else if (c == '\t') out += "\\t";
            else if (c >= 0x20) out.push_back(static_cast<char>(c));
        }
        return out;
    }

    static bool parseProfileText(std::string_view text, bool fromWorkingDir, std::string_view fallbackStem, McxMidiLearnDiskProfile& out)
    {
        abd::synth::json::JsonValue root;
        abd::synth::json::Parser parser(text);
        if (!parser.parse(root) || !root.isObject()) return false;
        const std::string schema = root.getString("schema");
        if (schema != "abd.midiLearn.v1") return false;
        const auto* mappings = root.find("mappings");
        if (mappings == nullptr || !mappings->isArray()) return false;

        out.device = root.getString("device");
        if (out.device.empty()) out.device = std::string(fallbackStem);
        out.displayName = root.getString("displayName");
        if (out.displayName.empty()) out.displayName = out.device;
        out.portMatchHints.clear();
        if (const auto* hints = root.find("portMatchHints"); hints != nullptr && hints->isArray())
        {
            for (const auto& h : hints->arrVal)
            {
                if (h.isString() && !h.strVal.empty()) out.portMatchHints.push_back(h.strVal);
            }
        }
        out.mappingCount = static_cast<int>(mappings->arrVal.size());
        out.fromWorkingDir = fromWorkingDir;
        out.rawJson.assign(text);
        return true;
    }

    std::size_t scanDirectories(const std::string& workingMidiLearnDir,
                                const std::string& factoryMidiLearnDir = {},
                                bool seedWorkingDir = true)
    {
        profiles_.clear();
        std::error_code ec;
        if (seedWorkingDir && !workingMidiLearnDir.empty() && !factoryMidiLearnDir.empty()
            && std::filesystem::exists(factoryMidiLearnDir, ec) && std::filesystem::is_directory(factoryMidiLearnDir, ec))
        {
            std::filesystem::create_directories(workingMidiLearnDir, ec);
            for (const auto& entry : std::filesystem::directory_iterator(factoryMidiLearnDir, ec))
            {
                if (!entry.is_regular_file(ec)) continue;
                const auto p = entry.path();
                if (toLowerAscii(p.extension().string()) != ".json") continue;
                const auto dst = std::filesystem::path(workingMidiLearnDir) / p.filename();
                if (!std::filesystem::exists(dst, ec))
                    std::filesystem::copy_file(p, dst, std::filesystem::copy_options::skip_existing, ec);
            }
        }
        if (!workingMidiLearnDir.empty()) scanOneDir(workingMidiLearnDir, true);
        if (!factoryMidiLearnDir.empty()) scanOneDir(factoryMidiLearnDir, false);
        std::sort(profiles_.begin(), profiles_.end(), [](const auto& a, const auto& b) {
            if (a.device == "generic_cc" && b.device != "generic_cc") return false;
            if (b.device == "generic_cc" && a.device != "generic_cc") return true;
            return a.displayName < b.displayName;
        });
        return profiles_.size();
    }

    bool saveProfileToWorkingDir(const std::string& workingMidiLearnDir, std::string_view deviceName, std::string_view rawJson) const
    {
        if (workingMidiLearnDir.empty()) return false;
        McxMidiLearnDiskProfile parsed {};
        const std::string stem = sanitizeFileStem(deviceName);
        if (!parseProfileText(rawJson, true, stem, parsed)) return false;
        std::error_code ec;
        const std::filesystem::path dir(workingMidiLearnDir);
        std::filesystem::create_directories(dir, ec);
        if (ec) return false;
        const auto dst = dir / (sanitizeFileStem(parsed.device) + ".json");
        std::ofstream ofs(dst, std::ios::binary | std::ios::trunc);
        if (!ofs) return false;
        ofs.write(rawJson.data(), static_cast<std::streamsize>(rawJson.size()));
        return ofs.good();
    }

    [[nodiscard]] const std::vector<McxMidiLearnDiskProfile>& profiles() const noexcept { return profiles_; }

    [[nodiscard]] const McxMidiLearnDiskProfile* findByDevice(std::string_view deviceId) const noexcept
    {
        const std::string target = normalizeId(deviceId);
        if (target.empty()) return nullptr;
        for (const auto& p : profiles_)
            if (normalizeId(p.device) == target) return &p;
        return nullptr;
    }

    [[nodiscard]] const McxMidiLearnDiskProfile* matchPortName(std::string_view portName) const noexcept
    {
        const std::string needle = toLowerAscii(portName);
        if (needle.empty()) return nullptr;
        const McxMidiLearnDiskProfile* best = nullptr;
        std::size_t bestLen = 0;
        bool bestGeneric = true;
        for (const auto& p : profiles_)
        {
            const bool isGen = (p.device == "generic_cc");
            for (const auto& hint : p.portMatchHints)
            {
                const std::string h = toLowerAscii(hint);
                if (h.empty() || needle.find(h) == std::string::npos) continue;
                if (best == nullptr || (bestGeneric && !isGen) || (bestGeneric == isGen && h.size() > bestLen))
                {
                    best = &p; bestLen = h.size(); bestGeneric = isGen;
                }
            }
        }
        return best;
    }

    [[nodiscard]] const McxMidiLearnDiskProfile* matchHardwareProfileId(std::string_view profileId) const noexcept
    {
        if (const auto* exact = findByDevice(profileId)) return exact;
        const std::string norm = normalizeId(profileId);
        if (norm.find("mc303") != std::string::npos) return findByDevice("roland_mc303");
        if (norm.find("dr5") != std::string::npos) return findByDevice("boss_dr5");
        if (norm.find("tb303") != std::string::npos) return findByDevice("roland_tb303");
        if (norm.find("emax") != std::string::npos) return findByDevice("emu_emax2");
        return nullptr;
    }

    [[nodiscard]] std::string serializeCatalogJson() const
    {
        std::ostringstream oss;
        oss << "{\"profiles\":[";
        for (std::size_t i = 0; i < profiles_.size(); ++i)
        {
            const auto& p = profiles_[i];
            if (i > 0) oss << ',';
            oss << "{\"device\":\"" << escapeJson(p.device) << "\""
                << ",\"displayName\":\"" << escapeJson(p.displayName) << "\""
                << ",\"portMatchHints\":[";
            for (std::size_t j = 0; j < p.portMatchHints.size(); ++j)
            {
                if (j > 0) oss << ',';
                oss << "\"" << escapeJson(p.portMatchHints[j]) << "\"";
            }
            oss << "],\"mappingCount\":" << p.mappingCount
                << ",\"source\":\"" << (p.fromWorkingDir ? "workingDir" : "factory") << "\""
                << ",\"profile\":" << p.rawJson << "}";
        }
        oss << "]}";
        return oss.str();
    }

private:
    void scanOneDir(const std::string& dirPath, bool fromWorkingDir)
    {
        std::error_code ec;
        if (!std::filesystem::exists(dirPath, ec) || !std::filesystem::is_directory(dirPath, ec)) return;
        std::vector<std::filesystem::path> files;
        for (const auto& entry : std::filesystem::directory_iterator(dirPath, ec))
            if (entry.is_regular_file(ec) && toLowerAscii(entry.path().extension().string()) == ".json")
                files.push_back(entry.path());
        std::sort(files.begin(), files.end());
        for (const auto& fp : files)
        {
            std::ifstream ifs(fp, std::ios::binary);
            if (!ifs) continue;
            std::ostringstream ss; ss << ifs.rdbuf();
            McxMidiLearnDiskProfile parsed {};
            if (!parseProfileText(ss.str(), fromWorkingDir, fp.stem().string(), parsed)) continue;
            if (findByDevice(parsed.device) == nullptr) profiles_.push_back(std::move(parsed));
        }
    }

    std::vector<McxMidiLearnDiskProfile> profiles_ {};
};

} // namespace abdmcx
