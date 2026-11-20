#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <WebView2Bridge/WebView2ResourceProvider.h>

#include <cstdint>
#include <optional>

#if JUCE_WINDOWS
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

namespace abdmcx::editor_webview
{

inline bool isDevServerReachable(const juce::URL& url)
{
    const auto opts = juce::URL::InputStreamOptions(juce::URL::ParameterHandling::inAddress)
                          .withHttpRequestCmd("HEAD")
                          .withConnectionTimeoutMs(200)
                          .withNumRedirectsToFollow(0);
    auto stream = url.createInputStream(opts);
    if (stream == nullptr) return false;
    if (auto* webStream = dynamic_cast<juce::WebInputStream*>(stream.get()))
        return webStream->getStatusCode() == 200;
    return true;
}

inline juce::String resolveInitialUrl()
{
    const auto envUrl = juce::SystemStats::getEnvironmentVariable("ABDMCX0X_DEV_URL", "").trim();
    if (envUrl.isNotEmpty() && envUrl != "0" && !envUrl.equalsIgnoreCase("off"))
        return envUrl;
    const juce::URL viteUrl("http://localhost:5330");
    if (isDevServerReachable(viteUrl))
        return "http://localhost:5330";
    // Empty => JuceWebView2Component uses JUCE ResourceProvider root (WebUI/dist offline)
    return {};
}

inline juce::File getPidIsolatedWebView2Folder()
{
#if JUCE_WINDOWS
    const auto pid = static_cast<std::uint32_t>(::GetCurrentProcessId());
#else
    const auto pid = static_cast<std::uint32_t>(juce::Time::getMillisecondCounter());
#endif
    juce::File baseDir;
    const auto envDir = juce::SystemStats::getEnvironmentVariable("WEBVIEW2_USER_DATA_FOLDER", "").trim();
    if (envDir.isNotEmpty())
        baseDir = juce::File(envDir);
    else
        baseDir = juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("ABDMCX0X_WebView2");
    auto pidDir = baseDir.getChildFile("pid_" + juce::String(pid));
    pidDir.createDirectory();
    return pidDir;
}

inline juce::File locateWebUiRoot()
{
    const auto exeDir = juce::File::getSpecialLocation(juce::File::currentExecutableFile).getParentDirectory();
    if (exeDir.getChildFile("WebUI").getChildFile("dist").isDirectory())
        return exeDir.getChildFile("WebUI");
#ifdef ABDMCX0X_PROJECT_DIR
    const juce::File projWebUi = juce::File(ABDMCX0X_PROJECT_DIR).getChildFile("WebUI");
    if (projWebUi.isDirectory()) return projWebUi;
#endif
    const auto cwdWebUi = juce::File::getCurrentWorkingDirectory().getChildFile("WebUI");
    if (cwdWebUi.isDirectory()) return cwdWebUi;
    return exeDir.getChildFile("WebUI");
}

inline std::optional<juce::WebBrowserComponent::Resource> mcxResourceProvider(const juce::String& url)
{
    const juce::String decodedPath = abd::webview2::normalizeResourcePath(url);
    if (decodedPath == "juce/juce.js" || decodedPath.endsWith("/juce.js"))
        return std::nullopt;
    const juce::File webUiDir = locateWebUiRoot();
    if (auto res = abd::webview2::resolveLocalDiskAsset(decodedPath, webUiDir))
        return res;
    if (auto sharedRes = abd::webview2::resolveSharedAssetFile(decodedPath))
        return sharedRes;
    return std::nullopt;
}

} // namespace abdmcx::editor_webview
