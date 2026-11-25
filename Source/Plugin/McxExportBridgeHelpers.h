#pragma once

#include "PluginProcessor.h"
#include "../Core/McxWavWriter.h"
#include <WebView2Bridge/JuceWebView2Component.h>
#include <juce_core/juce_core.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <algorithm>
#include <memory>
#include <vector>

namespace abdmcx
{

namespace export_detail
{
inline juce::String sanitizeStemName(juce::String raw, int partIdx)
{
    juce::String out;
    for (int i = 0; i < raw.length(); ++i)
    {
        const auto ch = raw[i];
        if (juce::CharacterFunctions::isLetterOrDigit(ch) || ch == '_' || ch == '-')
            out << ch;
        else if (ch == ' ')
            out << '_';
    }
    return out.isNotEmpty() ? out : juce::String::formatted("Part_%02d", partIdx + 1);
}

inline void emitExportStatus(juce::Component::SafePointer<abd::webview2::JuceWebView2Component> web,
                             bool ok, const juce::String& kind, const juce::String& path = {}, int count = 0)
{
    if (web == nullptr) return;
    juce::DynamicObject::Ptr res = new juce::DynamicObject();
    res->setProperty("type", "exportComplete");
    res->setProperty("ok", ok);
    res->setProperty("kind", kind);
    res->setProperty("path", path);
    if (count > 0) res->setProperty("count", count);
    web->emitEventIfBrowserIsVisible("onNativeTelemetry", juce::var(res.get()));
}

inline void launchWavFileSave(std::unique_ptr<juce::FileChooser>& chooser,
                              juce::Component::SafePointer<abd::webview2::JuceWebView2Component> web,
                              const juce::String& defaultName,
                              std::shared_ptr<std::vector<std::uint8_t>> wavBytes,
                              const juce::String& kind)
{
    const juce::File initial = defaultName.isNotEmpty()
        ? juce::File::getSpecialLocation(juce::File::userDocumentsDirectory).getChildFile(defaultName)
        : juce::File();
    chooser = std::make_unique<juce::FileChooser>("Export Audio WAV", initial, "*.wav");
    const int flags = juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles
        | juce::FileBrowserComponent::warnAboutOverwriting;
    chooser->launchAsync(flags, [web, wavBytes, kind](const juce::FileChooser& fc) {
        auto target = fc.getResult();
        if (target == juce::File()) { emitExportStatus(web, false, kind); return; }
        if (!target.hasFileExtension("wav")) target = target.withFileExtension("wav");
        const bool ok = wavBytes && !wavBytes->empty() && target.replaceWithData(wavBytes->data(), wavBytes->size());
        emitExportStatus(web, ok, kind, target.getFullPathName());
    });
}
} // namespace export_detail

inline bool handleExportJsEvent(McxAudioProcessor& proc,
                                abd::webview2::JuceWebView2Component* web,
                                std::unique_ptr<juce::FileChooser>& exportChooser,
                                const juce::String& type,
                                const juce::DynamicObject& obj)
{
    if (type == "getPartPattern")
    {
        const int part = std::clamp<int>(static_cast<int>(obj.getProperty("part")), 0, McxEngine::kNumParts - 1);
        std::vector<char> buf(65536, '\0');
        {
            const juce::ScopedLock sl(proc.engineLock());
            proc.flushPendingUiCommandsLocked();
            (void)proc.engine().sequencer().serializePartPatternJson(part, buf.data(), static_cast<int>(buf.size()));
        }
        if (web != nullptr)
        {
            juce::DynamicObject::Ptr reply = new juce::DynamicObject();
            reply->setProperty("type", "partPatternState");
            reply->setProperty("part", part);
            reply->setProperty("patternJson", juce::String(buf.data()));
            web->emitEventIfBrowserIsVisible("onNativeTelemetry", juce::var(reply.get()));
        }
        return true;
    }

    if (type == "saveExportFileBase64")
    {
        const auto kind = obj.getProperty("kind").toString();
        const auto ext = obj.getProperty("extension").toString().isNotEmpty()
            ? obj.getProperty("extension").toString() : juce::String(kind == "wav" ? "wav" : "mid");
        auto decoded = std::make_shared<juce::MemoryOutputStream>();
        if (!juce::Base64::convertFromBase64(*decoded, obj.getProperty("base64").toString()) || decoded->getDataSize() == 0)
        {
            export_detail::emitExportStatus(web, false, kind);
            return true;
        }
        const juce::String pattern = "*." + ext;
        const juce::String title = (ext == "mid") ? "Export MIDI File" : "Export Audio File";
        exportChooser = std::make_unique<juce::FileChooser>(title, juce::File(), pattern);
        const int flags = juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles
            | juce::FileBrowserComponent::warnAboutOverwriting;
        juce::Component::SafePointer<abd::webview2::JuceWebView2Component> safeWeb(web);
        exportChooser->launchAsync(flags, [safeWeb, decoded, ext, kind](const juce::FileChooser& fc) {
            auto target = fc.getResult();
            if (target == juce::File()) { export_detail::emitExportStatus(safeWeb, false, kind); return; }
            if (!target.hasFileExtension(ext)) target = target.withFileExtension(ext);
            const bool ok = target.replaceWithData(decoded->getData(), decoded->getDataSize());
            export_detail::emitExportStatus(safeWeb, ok, kind, target.getFullPathName());
        });
        return true;
    }

    if (type == "renderWavOffline")
    {
        const auto scope = obj.getProperty("scope").toString();
        OfflineBounceOptions opts;
        opts.sampleRate = (proc.getSampleRate() > 1000.0) ? proc.getSampleRate() : 44100.0;
        opts.patternBars = obj.hasProperty("bars") ? std::clamp<int>(static_cast<int>(obj.getProperty("bars")), 1, 64) : 4;
        opts.tailSeconds = obj.hasProperty("tailSec") ? std::clamp<float>(static_cast<float>(obj.getProperty("tailSec")), 0.0f, 10.0f) : 1.5f;
        opts.useSongMode = static_cast<bool>(obj.getProperty("useSongMode"));
        opts.isolatePart = (scope == "part") ? std::clamp<int>(static_cast<int>(obj.getProperty("part")), 0, McxEngine::kNumParts - 1) : -1;
        opts.isolateBank = (scope == "bank") ? std::clamp<int>(static_cast<int>(obj.getProperty("bank")), 0, McxBankLayoutState::kMaxBanks - 1) : -1;
        juce::Component::SafePointer<abd::webview2::JuceWebView2Component> safeWeb(web);

        if (scope == "stems")
        {
            exportChooser = std::make_unique<juce::FileChooser>("Select Folder for 64-Part WAV Stems", juce::File());
            const int flags = juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectDirectories;
            exportChooser->launchAsync(flags, [&proc, safeWeb, opts](const juce::FileChooser& fc) {
                const auto dir = fc.getResult();
                if (!dir.isDirectory()) { export_detail::emitExportStatus(safeWeb, false, "wav_stems"); return; }
                int savedCount = 0;
                for (int i = 0; i < McxEngine::kNumParts; ++i)
                {
                    auto stemOpts = opts;
                    stemOpts.isolatePart = i;
                    stemOpts.isolateBank = -1;
                    std::vector<std::uint8_t> wav;
                    juce::String partName;
                    {
                        const juce::ScopedLock sl(proc.engineLock());
                        if (!proc.engine().part(i).enabled) continue;
                        partName = proc.engine().getPartDisplayPresetName(i);
                        if (!renderEngineOfflineWav(proc.engine(), stemOpts, wav)) continue;
                    }
                    const auto fname = juce::String::formatted("Part_%02d_%s.wav", i + 1, export_detail::sanitizeStemName(partName, i).toRawUTF8());
                    if (dir.getChildFile(fname).replaceWithData(wav.data(), wav.size()))
                        ++savedCount;
                }
                export_detail::emitExportStatus(safeWeb, savedCount > 0, "wav_stems", dir.getFullPathName(), savedCount);
            });
            return true;
        }

        auto wavBytes = std::make_shared<std::vector<std::uint8_t>>();
        bool rendered = false;
        {
            const juce::ScopedLock sl(proc.engineLock());
            proc.flushPendingUiCommandsLocked();
            rendered = renderEngineOfflineWav(proc.engine(), opts, *wavBytes);
        }
        if (!rendered || wavBytes->empty())
        {
            export_detail::emitExportStatus(safeWeb, false, "wav_" + scope);
            return true;
        }
        export_detail::launchWavFileSave(exportChooser, safeWeb, obj.getProperty("filename").toString(), wavBytes, "wav_" + scope);
        return true;
    }

    return false;
}

} // namespace abdmcx
