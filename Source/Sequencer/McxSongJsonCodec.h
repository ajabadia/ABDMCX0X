#pragma once

#include "McxSongAndScenes.h"
#include "SynthCore/MiniJsonParser.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <sstream>
#include <string>
#include <string_view>

namespace abdmcx
{

namespace detail
{
[[nodiscard]] inline std::string escapeJsonText(std::string_view text)
{
    std::string out;
    out.reserve(text.size() + 4);
    for (const char ch : text)
    {
        if (ch == '\0') break;
        if (ch == '"' || ch == '\\') { out.push_back('\\'); out.push_back(ch); }
        else if (static_cast<unsigned char>(ch) >= 0x20u) out.push_back(ch);
    }
    return out;
}
} // namespace detail

/**
 * @brief Serializes Live Scenes (S1..S8) and Song Arrangement (up to 64 blocks) to RFC-8259 JSON.
 */
[[nodiscard]] inline std::string serializeSongAndScenesJson(const McxSongAndScenes& ss)
{
    const auto tel = ss.readTelemetry();
    const int blkCount = ss.getActiveSongBlockCount();
    std::ostringstream os;
    os << "{\"formatId\":\"abd_mcx_song_scenes_v1\""
       << ",\"songMode\":" << (tel.songMode ? "true" : "false")
       << ",\"songLoop\":" << (tel.songLoop ? "true" : "false")
       << ",\"activeScene\":" << tel.activeScene
       << ",\"queuedScene\":" << tel.queuedScene
       << ",\"songBlockIdx\":" << tel.songBlockIdx
       << ",\"songBarInBlock\":" << tel.songBarInBlock
       << ",\"scenes\":[";

    for (int i = 0; i < McxSongAndScenes::kNumScenes; ++i)
    {
        if (i > 0) os << ',';
        const auto& sc = ss.scene(i);
        os << "{\"index\":" << i
           << ",\"name\":\"" << detail::escapeJsonText(static_cast<const char*>(sc.name)) << "\""
           << ",\"muteMask\":" << static_cast<unsigned int>(sc.muteMask)
           << ",\"transpose\":" << static_cast<int>(sc.transposeSemitones) << '}';
    }

    os << "],\"blocks\":[";
    for (int b = 0; b < blkCount; ++b)
    {
        if (b > 0) os << ',';
        const auto blk = ss.getActiveSongBlock(b);
        os << "{\"sceneIndex\":" << static_cast<int>(blk.sceneIndex)
           << ",\"bars\":" << static_cast<int>(blk.bars)
           << ",\"transposeOffset\":" << static_cast<int>(blk.transposeOffset) << '}';
    }
    os << "]}";
    return os.str();
}

/**
 * @brief Restores Live Scenes (S1..S8) and Song Arrangement from JSON using ABDShared MiniJsonParser.
 */
inline bool deserializeSongAndScenesJson(McxSongAndScenes& ss, std::string_view jsonText)
{
    if (jsonText.empty())
        return false;

    abd::synth::json::JsonValue root;
    if (!abd::synth::json::parseJson(jsonText, root) || !root.isObject())
        return false;

    const auto fmt = root.getString("formatId");
    if (!fmt.empty() && fmt != "abd_mcx_song_scenes_v1")
        return false;

    if (const auto* scenesVal = root.find("scenes"); scenesVal && scenesVal->isArray())
    {
        for (int idx = 0; idx < static_cast<int>(scenesVal->arrVal.size()); ++idx)
        {
            const auto& item = scenesVal->arrVal[static_cast<std::size_t>(idx)];
            if (!item.isObject()) continue;
            const int slot = std::clamp(item.getInt("index", idx), 0, McxSongAndScenes::kNumScenes - 1);
            const auto mask = static_cast<std::uint16_t>(std::clamp(item.getInt("muteMask", 0), 0, 65535));
            const int tr = std::clamp(item.getInt("transpose", 0), -24, 24);
            const std::string name = item.getString("name");
            ss.setScene(slot, mask, tr, name.empty() ? nullptr : name.c_str());
        }
    }

    const bool loop = root.getBool("songLoop", true);
    if (const auto* blocksVal = root.find("blocks"); blocksVal && blocksVal->isArray())
    {
        ss.clearStagingBlocks();
        for (const auto& bItem : blocksVal->arrVal)
        {
            if (!bItem.isObject()) continue;
            (void)ss.addStagingBlock(
                bItem.getInt("sceneIndex", 0),
                bItem.getInt("bars", 4),
                bItem.getInt("transposeOffset", 0));
        }
        ss.commitStagingBlocks(loop);
    }
    else
    {
        ss.setSongLoop(loop);
    }

    ss.setSongMode(root.getBool("songMode", false));
    ss.swapDirtySongBuffer();
    return true;
}

} // namespace abdmcx
