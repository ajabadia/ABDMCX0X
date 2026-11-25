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

namespace sequence_bridge
{
[[nodiscard]] inline juce::var makeReply(const juce::String& type, bool ok)
{
    juce::DynamicObject::Ptr obj = new juce::DynamicObject();
    obj->setProperty("type", type);
    obj->setProperty("ok", ok);
    return juce::var(obj.get());
}

/** Only lowercase [a-z0-9_-], no traversal, no separators. */
[[nodiscard]] inline bool validSlug(const std::string& slug)
{
    if (slug.empty() || slug.size() > 64 || slug.find("..") != std::string::npos
        || slug.find('/') != std::string::npos || slug.find('\\') != std::string::npos)
        return false;
    for (unsigned char c : slug)
        if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-')) return false;
    return true;
}

[[nodiscard]] inline std::filesystem::path sequencePath(const std::string& workingDir, const std::string& slug)
{
    const auto root = (std::filesystem::path(workingDir) / "Sequences").lexically_normal();
    const auto file = (root / (slug + ".abdseq")).lexically_normal();
    return file.parent_path() == root ? file : std::filesystem::path();
}
} // namespace sequence_bridge

/** JUCE IPC for <WorkingDir>/Sequences/*.abdseq, mirroring McxMidiLearnBridgeHelpers. */
inline bool handleSequenceJsEvent(McxAudioProcessor& proc,
                                  abd::webview2::JuceWebView2Component* web,
                                  const juce::String& type,
                                  const juce::DynamicObject& obj)
{
    if (type != "listSequences" && type != "saveSequenceFile" && type != "loadSequenceFile") return false;
    const auto workingDir = proc.systemSettings().workingDirectory;
    const auto root = workingDir.empty() ? std::filesystem::path() : (std::filesystem::path(workingDir) / "Sequences");

    if (type == "listSequences")
    {
        std::vector<std::string> slugs;
        std::error_code ec;
        if (!root.empty() && std::filesystem::is_directory(root, ec))
        {
            for (const auto& entry : std::filesystem::directory_iterator(root, ec))
            {
                if (!entry.is_regular_file(ec) || entry.path().extension() != ".abdseq") continue;
                const auto slug = entry.path().stem().string();
                if (sequence_bridge::validSlug(slug)) slugs.push_back(slug);
            }
        }
        std::sort(slugs.begin(), slugs.end());
        std::ostringstream json;
        json << '[';
        for (std::size_t i = 0; i < slugs.size(); ++i) json << (i ? "," : "") << '"' << slugs[i] << '"';
        json << ']';
        if (web != nullptr)
        {
            juce::DynamicObject::Ptr payload = new juce::DynamicObject();
            payload->setProperty("type", "sequenceList");
            payload->setProperty("ok", true);
            payload->setProperty("catalogJson", juce::String(json.str().c_str()));
            web->emitEventIfBrowserIsVisible("onNativeTelemetry", juce::var(payload.get()));
        }
        return true;
    }

    const auto slug = obj.getProperty("slug").toString().toStdString();
    const bool valid = !workingDir.empty() && sequence_bridge::validSlug(slug);
    const auto file = valid ? sequence_bridge::sequencePath(workingDir, slug) : std::filesystem::path();

    if (type == "saveSequenceFile")
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
        if (web != nullptr)
        {
            auto reply = sequence_bridge::makeReply("sequenceSaved", ok);
            if (auto* d = reply.getDynamicObject()) d->setProperty("slug", juce::String(slug));
            web->emitEventIfBrowserIsVisible("onNativeTelemetry", reply);
        }
        return true;
    }

    std::string content;
    bool ok = false;
    if (!file.empty() && std::filesystem::exists(file))
    {
        std::ifstream ifs(file, std::ios::binary);
        if (ifs) { std::ostringstream ss; ss << ifs.rdbuf(); content = ss.str(); ok = true; }
    }
    if (web != nullptr)
    {
        juce::DynamicObject::Ptr payload = new juce::DynamicObject();
        payload->setProperty("type", "sequenceLoaded");
        payload->setProperty("ok", ok);
        payload->setProperty("slug", juce::String(slug));
        payload->setProperty("content", juce::String(content.c_str()));
        web->emitEventIfBrowserIsVisible("onNativeTelemetry", juce::var(payload.get()));
    }
    return true;
}

} // namespace abdmcx
