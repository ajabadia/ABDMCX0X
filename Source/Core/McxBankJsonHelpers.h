#pragma once

#include "../DSP/Core/McxEngine.h"

#include <algorithm>
#include <cstdlib>
#include <iomanip>
#include <sstream>
#include <string>

namespace abdmcx::bank_json
{

inline std::string floatToStr(float val)
{
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(4) << val;
    return ss.str();
}

inline float findFloat(const std::string& str, const std::string& key, float defaultVal)
{
    const std::string needle = "\"" + key + "\":";
    auto pos = str.find(needle);
    if (pos == std::string::npos)
        return defaultVal;
    pos += needle.length();
    while (pos < str.length() && (str[pos] == ' ' || str[pos] == '\t')) ++pos;
    char* endPtr = nullptr;
    const float v = std::strtof(&str[pos], &endPtr);
    return (endPtr != &str[pos]) ? v : defaultVal;
}

inline int findInt(const std::string& str, const std::string& key, float defaultVal)
{
    return static_cast<int>(findFloat(str, key, defaultVal));
}

inline std::string findString(const std::string& str, const std::string& key, const std::string& defaultVal)
{
    const std::string needle = "\"" + key + "\":";
    auto pos = str.find(needle);
    if (pos == std::string::npos)
        return defaultVal;
    pos += needle.length();
    while (pos < str.length() && (str[pos] == ' ' || str[pos] == '\t')) ++pos;
    if (pos >= str.length() || str[pos] != '"')
        return defaultVal;
    ++pos;
    std::string out;
    while (pos < str.length())
    {
        const char ch = str[pos++];
        if (ch == '\\' && pos < str.length()) { out.push_back(str[pos++]); continue; }
        if (ch == '"') return out;
        out.push_back(ch);
    }
    return defaultVal;
}

inline std::string escapeStr(const char* s)
{
    std::string out;
    if (!s) return out;
    for (const char* p = s; *p != '\0'; ++p)
    {
        if (*p == '\\' || *p == '"') { out.push_back('\\'); out.push_back(*p); }
        else if (static_cast<unsigned char>(*p) >= 0x20u) out.push_back(*p);
    }
    return out;
}

inline bool findBool(const std::string& str, const std::string& key, bool defaultVal)
{
    const std::string needle = "\"" + key + "\":";
    auto pos = str.find(needle);
    if (pos == std::string::npos) return defaultVal;
    pos += needle.length();
    while (pos < str.length() && (str[pos] == ' ' || str[pos] == '\t')) ++pos;
    if (pos + 4 <= str.length() && str.compare(pos, 4, "true") == 0) return true;
    if (pos + 5 <= str.length() && str.compare(pos, 5, "false") == 0) return false;
    return defaultVal;
}

inline void appendPartJson(std::ostringstream& ss, const McxEngine& engine, int pIdx, bool trailingComma)
{
    const auto& p = engine.part(static_cast<std::size_t>(pIdx));
    const char* pName = engine.getPartDisplayPresetName(pIdx);
    ss << "    {\n";
    ss << "      \"index\": " << pIdx << ",\n";
    ss << "      \"enabled\": " << (p.enabled ? "true" : "false") << ",\n";
    ss << "      \"presetName\": \"" << escapeStr(pName ? pName : "") << "\",\n";
    ss << "      \"engineTypeIndex\": " << engine.getPartEngineTypeIndex(pIdx) << ",\n";
    ss << "      \"midiChannel\": " << static_cast<int>(p.midiChannel) << ",\n";
    ss << "      \"midiPortIndex\": " << static_cast<int>(p.midiPortIndex) << ",\n";
    ss << "      \"midiInPortIndex\": " << static_cast<int>(p.midiInPortIndex) << ",\n";
    ss << "      \"midiOutDeviceName\": \"" << escapeStr(p.midiOutDeviceName) << "\",\n";
    ss << "      \"midiInDeviceName\": \"" << escapeStr(p.midiInDeviceName) << "\",\n";
    ss << "      \"routeMode\": " << static_cast<int>(p.routeMode) << ",\n";
    ss << "      \"isDrumKit\": " << (p.isDrumKit ? "true" : "false") << ",\n";
    ss << "      \"mute\": " << (p.mute ? "true" : "false") << ",\n";
    ss << "      \"solo\": " << (p.solo ? "true" : "false") << ",\n";
    ss << "      \"followTranspose\": " << (p.followGlobalTranspose ? "true" : "false") << ",\n";
    ss << "      \"structureMode\": " << static_cast<int>(p.structureMode) << ",\n";
    ss << "      \"vectorX\": " << floatToStr(p.vectorX) << ", \"vectorY\": " << floatToStr(p.vectorY) << ",\n";
    ss << "      \"level\": " << floatToStr(p.level) << ", \"pan\": " << floatToStr(p.pan) << ",\n";
    ss << "      \"reverbSend\": " << floatToStr(p.reverbSend) << ", \"chorusSend\": " << floatToStr(p.chorusSend) << ",\n";
    ss << "      \"delaySend\": " << floatToStr(p.delaySend) << ", \"auxSend\": " << floatToStr(p.auxSend) << ",\n";
    ss << "      \"insertSlot\": " << p.insertSlot << ",\n";
    ss << "      \"driveEnabled\": " << (p.driveEnabled ? "true" : "false") << ", \"driveType\": " << static_cast<int>(p.driveType) << ", \"driveAmount\": " << floatToStr(p.driveAmount) << ",\n";
    ss << "      \"eqEnabled\": " << (p.eqEnabled ? "true" : "false") << ", \"eqLowGain\": " << floatToStr(p.eqLowGainDb) << ", \"eqMidGain\": " << floatToStr(p.eqMidGainDb) << ", \"eqHighGain\": " << floatToStr(p.eqHighGainDb) << ",\n";
    ss << "      \"partials\": [\n";
    for (int ptIdx = 0; ptIdx < 4; ++ptIdx)
    {
        const auto& pt = p.partials[static_cast<std::size_t>(ptIdx)];
        ss << "        {\n";
        ss << "          \"enabled\": " << (pt.enabled ? "true" : "false") << ",\n";
        ss << "          \"sourceKind\": " << static_cast<int>(pt.sourceKind) << ",\n";
        ss << "          \"vaWaveform\": " << static_cast<int>(pt.vaWaveform) << ",\n";
        ss << "          \"coarse\": " << static_cast<int>(pt.coarseSemitones) << ",\n";
        ss << "          \"fine\": " << floatToStr(pt.fineCents) << ",\n";
        ss << "          \"level\": " << floatToStr(pt.level) << ",\n";
        ss << "          \"pan\": " << floatToStr(pt.pan) << ",\n";
        ss << "          \"cutoffHz\": " << floatToStr(pt.cutoffHz) << ",\n";
        ss << "          \"resonance\": " << floatToStr(pt.resonance) << "\n";
        ss << "        }" << (ptIdx < 3 ? ",\n" : "\n");
    }
    ss << "      ]\n";
    ss << "    }" << (trailingComma ? ",\n" : "\n");
}

inline void parsePartJson(McxEngine& engine, int pIdx, const std::string& partChunk)
{
    const auto ptStart = partChunk.find("\"partials\":");
    const std::string partHeader = (ptStart != std::string::npos) ? partChunk.substr(0, ptStart) : partChunk;
    const int engIdx = findInt(partHeader, "engineTypeIndex", engine.getPartEngineTypeIndex(pIdx));
    if (engIdx != engine.getPartEngineTypeIndex(pIdx)) (void)engine.selectPartEngineType(pIdx, engIdx);

    auto& p = engine.part(static_cast<std::size_t>(pIdx));
    p.enabled = findBool(partHeader, "enabled", pIdx < 16);
    const std::string pName = findString(partHeader, "presetName", "");
    if (!pName.empty()) engine.setPartPresetName(pIdx, pName.c_str());
    p.midiChannel = static_cast<std::uint8_t>(std::clamp(findInt(partHeader, "midiChannel", p.midiChannel), 1, 16));
    p.midiPortIndex = static_cast<std::uint8_t>(std::clamp(findInt(partHeader, "midiPortIndex", p.midiPortIndex), 0, 31));
    p.midiInPortIndex = static_cast<std::int16_t>(std::clamp(findInt(partHeader, "midiInPortIndex", pIdx < 16 ? 0 : -1), -1, 31));
    p.setMidiOutDeviceName(findString(partHeader, "midiOutDeviceName", ""));
    p.setMidiInDeviceName(findString(partHeader, "midiInDeviceName", ""));
    p.routeMode = static_cast<McxPartRouteMode>(findInt(partHeader, "routeMode", static_cast<int>(p.routeMode)));
    engine.setPartKind(pIdx, findBool(partHeader, "isDrumKit", p.isDrumKit) ? McxPartKind::DrumMap : McxPartKind::Chromatic);
    p.mute = findBool(partHeader, "mute", false);
    p.solo = findBool(partHeader, "solo", false);
    p.followGlobalTranspose = findBool(partHeader, "followTranspose", !p.isDrumKit) && !p.isDrumKit;
    p.structureMode = static_cast<McxStructureMode>(findInt(partHeader, "structureMode", 0));
    p.vectorX = findFloat(partHeader, "vectorX", 0.0f);
    p.vectorY = findFloat(partHeader, "vectorY", 0.0f);
    p.level = findFloat(partHeader, "level", 0.85f);
    p.pan = findFloat(partHeader, "pan", 0.0f);
    p.reverbSend = findFloat(partHeader, "reverbSend", 0.25f);
    p.chorusSend = findFloat(partHeader, "chorusSend", 0.10f);
    p.delaySend = findFloat(partHeader, "delaySend", 0.0f);
    p.auxSend = findFloat(partHeader, "auxSend", 0.0f);
    p.insertSlot = std::clamp(findInt(partHeader, "insertSlot", -1), -1, 7);
    p.driveEnabled = findBool(partHeader, "driveEnabled", false);
    p.driveType = static_cast<std::uint8_t>(std::clamp(findInt(partHeader, "driveType", 0), 0, 3));
    p.driveAmount = std::clamp(findFloat(partHeader, "driveAmount", 0.0f), 0.0f, 1.0f);
    p.eqEnabled = findBool(partHeader, "eqEnabled", false);
    p.eqLowGainDb = std::clamp(findFloat(partHeader, "eqLowGain", 0.0f), -15.0f, 15.0f);
    p.eqMidGainDb = std::clamp(findFloat(partHeader, "eqMidGain", 0.0f), -15.0f, 15.0f);
    p.eqHighGainDb = std::clamp(findFloat(partHeader, "eqHighGain", 0.0f), -15.0f, 15.0f);

    std::size_t ptPos = (ptStart != std::string::npos) ? ptStart : partChunk.size();
    for (int ptIdx = 0; ptIdx < 4; ++ptIdx)
    {
        ptPos = partChunk.find("\"enabled\":", ptPos);
        if (ptPos == std::string::npos) break;
        const auto closeBrace = partChunk.find('}', ptPos);
        const std::size_t blockLen = (closeBrace != std::string::npos) ? (closeBrace - ptPos) : 300;
        const std::string ptBlock = partChunk.substr(ptPos, blockLen);
        auto& pt = p.partials[static_cast<std::size_t>(ptIdx)];
        pt.enabled = (ptBlock.find("true") < ptBlock.find(','));
        pt.sourceKind = static_cast<McxOscSourceKind>(std::clamp(findInt(ptBlock, "sourceKind", static_cast<float>(pt.sourceKind)), 0, 5));
        pt.vaWaveform = static_cast<std::uint8_t>(findInt(ptBlock, "vaWaveform", 0));
        pt.coarseSemitones = static_cast<std::int8_t>(findInt(ptBlock, "coarse", 0));
        pt.fineCents = findFloat(ptBlock, "fine", 0.0f);
        pt.level = findFloat(ptBlock, "level", 0.8f);
        pt.pan = findFloat(ptBlock, "pan", 0.0f);
        pt.cutoffHz = findFloat(ptBlock, "cutoffHz", 12000.0f);
        pt.resonance = findFloat(ptBlock, "resonance", 0.1f);
        ptPos = (closeBrace != std::string::npos) ? (closeBrace + 1) : (ptPos + 20);
    }
}

} // namespace abdmcx::bank_json
