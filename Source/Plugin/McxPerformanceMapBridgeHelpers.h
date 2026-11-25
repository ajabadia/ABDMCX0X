#pragma once

#include "PluginProcessor.h"
#include <WebView2Bridge/JuceWebView2Component.h>
#include <juce_core/juce_core.h>

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

namespace abdmcx
{

namespace perfmap_bridge
{
[[nodiscard]] inline bool validToken(const std::string& s)
{
    if (s.empty() || s.size() > 64 || s.find("..") != std::string::npos
        || s.find('/') != std::string::npos || s.find('\\') != std::string::npos)
        return false;
    for (unsigned char c : s)
        if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-')) return false;
    return true;
}

[[nodiscard]] inline std::filesystem::path mapFilePath(const std::string& workingDir,
                                                     const std::string& engineId,
                                                     const std::string& slug)
{
    const auto dir = (std::filesystem::path(workingDir) / "PerformanceMaps" / engineId).lexically_normal();
    const auto file = (dir / (slug + ".abdperf.json")).lexically_normal();
    return file.parent_path() == dir ? file : std::filesystem::path();
}

inline void emitReply(abd::webview2::JuceWebView2Component* web, const juce::String& type,
                      bool ok, const std::string& engineId, const std::string& slug, const std::string& extra = {})
{
    if (web == nullptr) return;
    juce::DynamicObject::Ptr p = new juce::DynamicObject();
    p->setProperty("type", type);
    p->setProperty("ok", ok);
    p->setProperty("engineId", juce::String(engineId));
    p->setProperty("slug", juce::String(slug));
    if (!extra.empty()) p->setProperty("content", juce::String(extra.c_str()));
    web->emitEventIfBrowserIsVisible("onNativeTelemetry", juce::var(p.get()));
}
} // namespace perfmap_bridge

/** JUCE IPC for <WorkingDir>/PerformanceMaps/<engineId>/<slug>.abdperf.json. */
inline bool handlePerformanceMapJsEvent(McxAudioProcessor& proc,
                                        abd::webview2::JuceWebView2Component* web,
                                        const juce::String& type,
                                        const juce::DynamicObject& obj)
{
    if (type != "listPerformanceMaps" && type != "savePerformanceMap" && type != "loadPerformanceMap") return false;
    const auto workingDir = proc.systemSettings().workingDirectory;
    const auto engineId = obj.getProperty("engineId").toString().toStdString();
    const bool validEng = !workingDir.empty() && perfmap_bridge::validToken(engineId);

    if (type == "listPerformanceMaps")
    {
        std::vector<std::string> slugs;
        std::error_code ec;
        const auto dir = validEng ? (std::filesystem::path(workingDir) / "PerformanceMaps" / engineId) : std::filesystem::path();
        if (!dir.empty() && std::filesystem::is_directory(dir, ec))
        {
            for (const auto& entry : std::filesystem::directory_iterator(dir, ec))
            {
                const auto name = entry.path().filename().string();
                if (!entry.is_regular_file(ec) || name.size() <= 13 || name.substr(name.size() - 13) != ".abdperf.json") continue;
                const auto slug = name.substr(0, name.size() - 13);
                if (perfmap_bridge::validToken(slug)) slugs.push_back(slug);
            }
        }
        std::sort(slugs.begin(), slugs.end());
        std::ostringstream json;
        json << '[';
        for (std::size_t i = 0; i < slugs.size(); ++i) json << (i ? "," : "") << '"' << slugs[i] << '"';
        json << ']';
        if (web != nullptr)
        {
            juce::DynamicObject::Ptr p = new juce::DynamicObject();
            p->setProperty("type", "performanceMapList"); p->setProperty("ok", true);
            p->setProperty("engineId", juce::String(engineId)); p->setProperty("catalogJson", juce::String(json.str().c_str()));
            web->emitEventIfBrowserIsVisible("onNativeTelemetry", juce::var(p.get()));
        }
        return true;
    }

    const auto slug = obj.getProperty("slug").toString().toStdString();
    const auto file = (validEng && perfmap_bridge::validToken(slug))
        ? perfmap_bridge::mapFilePath(workingDir, engineId, slug) : std::filesystem::path();

    if (type == "savePerformanceMap")
    {
        const auto content = obj.getProperty("content").toString().toStdString();
        bool ok = false;
        if (!file.empty())
        {
            std::error_code ec;
            std::filesystem::create_directories(file.parent_path(), ec);
            std::ofstream ofs(file, std::ios::binary | std::ios::trunc);
            if (ofs) { ofs << content; ok = ofs.good(); }
        }
        perfmap_bridge::emitReply(web, "performanceMapSaved", ok, engineId, slug);
        return true;
    }

    std::string content;
    bool ok = false;
    if (!file.empty() && std::filesystem::exists(file))
    {
        std::ifstream ifs(file, std::ios::binary);
        if (ifs) { std::ostringstream ss; ss << ifs.rdbuf(); content = ss.str(); ok = true; }
    }
    perfmap_bridge::emitReply(web, "performanceMapLoaded", ok, engineId, slug, content);
    return true;
}

} // namespace abdmcx
