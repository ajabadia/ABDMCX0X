#include "McxBankManagerBridge.h"

#include <algorithm>
#include <cstdio>
#include <iomanip>
#include <sstream>

namespace abdmcx
{

namespace
{
std::string floatToStr(float val)
{
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(4) << val;
    return ss.str();
}

std::uint8_t computeRolandChecksum(const std::vector<uint8_t>& bytes) noexcept
{
    std::uint32_t sum = 0;
    for (uint8_t b : bytes)
        sum += (b & 0x7Fu);
    return static_cast<std::uint8_t>((0x80u - (sum & 0x7Fu)) & 0x7Fu);
}
} // namespace

std::string McxBankManagerBridge::serializeToJson(const McxEngine& engine,
                                                  const McxHardwareBridge& bridge,
                                                  const std::string& presetName)
{
    std::ostringstream ss;
    ss << "{\n";
    ss << "  \"schema\": \"" << kCurrentSchema << "\",\n";
    ss << "  \"name\": \"" << presetName << "\",\n";
    ss << "  \"persona\": " << static_cast<int>(engine.getPersonaSpec().persona) << ",\n";
    ss << "  \"dacCharacter\": " << static_cast<int>(engine.getOutputCharacter()) << ",\n";
    ss << "  \"masterGain\": " << floatToStr(engine.getMasterVolume()) << ",\n";
    ss << "  \"globalTranspose\": " << engine.getTransposer().getTransposeSemitones() << ",\n";
    ss << "  \"fxTopology\": " << engine.getOutputAndFx().getUiTopology() << ",\n";
    ss << "  \"sendTargets\": [" << engine.getOutputAndFx().getSendSlotTarget(0) << ", "
       << engine.getOutputAndFx().getSendSlotTarget(1) << ", "
       << engine.getOutputAndFx().getSendSlotTarget(2) << ", "
       << engine.getOutputAndFx().getSendSlotTarget(3) << "],\n";
    ss << "  \"hardwareProfile\": \"" << bridge.getProfile().id << "\",\n";
    ss << "  \"latencyMs\": " << floatToStr(bridge.getLatencyCompensator().getLatencyMs()) << ",\n";
    ss << "  \"parts\": [\n";

    for (int pIdx = 0; pIdx < 16; ++pIdx)
    {
        const auto& p = engine.part(static_cast<std::size_t>(pIdx));
        const char* pName = engine.getPartDisplayPresetName(pIdx);
        ss << "    {\n";
        ss << "      \"index\": " << pIdx << ",\n";
        ss << "      \"presetName\": \"" << (pName ? pName : "") << "\",\n";
        ss << "      \"engineTypeIndex\": " << engine.getPartEngineTypeIndex(pIdx) << ",\n";
        ss << "      \"midiChannel\": " << static_cast<int>(p.midiChannel) << ",\n";
        ss << "      \"midiPortIndex\": " << static_cast<int>(p.midiPortIndex) << ",\n";
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
        ss << "    }" << (pIdx < 15 ? ",\n" : "\n");
    }
    ss << "  ]\n";
    ss << "}\n";
    return ss.str();
}

namespace
{
float findFloat(const std::string& str, const std::string& key, float defaultVal)
{
    const std::string needle = "\"" + key + "\":";
    auto pos = str.find(needle);
    if (pos == std::string::npos)
        return defaultVal;
    pos += needle.length();
    while (pos < str.length() && (str[pos] == ' ' || str[pos] == '\t')) ++pos;
    char* endPtr = nullptr;
    float v = std::strtof(&str[pos], &endPtr);
    return (endPtr != &str[pos]) ? v : defaultVal;
}

int findInt(const std::string& str, const std::string& key, float defaultVal)
{
    return static_cast<int>(findFloat(str, key, defaultVal));
}

std::string findString(const std::string& str, const std::string& key, const std::string& defaultVal)
{
    const std::string needle = "\"" + key + "\": \"";
    auto pos = str.find(needle);
    if (pos == std::string::npos)
        return defaultVal;
    pos += needle.length();
    auto endQuote = str.find('"', pos);
    return (endQuote != std::string::npos) ? str.substr(pos, endQuote - pos) : defaultVal;
}

bool findBool(const std::string& str, const std::string& key, bool defaultVal)
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
} // namespace

bool McxBankManagerBridge::deserializeFromJson(McxEngine& engine,
                                              McxHardwareBridge& bridge,
                                              const std::string& jsonString)
{
    if (jsonString.empty() || jsonString.find("abd_mcx0x_preset_v1") == std::string::npos)
        return false;

    const auto partsPos = jsonString.find("\"parts\":");
    const std::string header = (partsPos != std::string::npos) ? jsonString.substr(0, partsPos) : jsonString;

    engine.setMachinePersona(static_cast<McxMachinePersona>(findInt(header, "persona", 0)));
    engine.setOutputCharacter(static_cast<McxOutputCharacter>(findInt(header, "dacCharacter", 0)));
    if (header.find("\"masterGain\":") != std::string::npos) engine.setMasterVolume(findFloat(header, "masterGain", 0.85f));
    if (header.find("\"globalTranspose\":") != std::string::npos) engine.setGlobalTranspose(findInt(header, "globalTranspose", 0));
    if (header.find("\"fxTopology\":") != std::string::npos) engine.getOutputAndFx().setUiTopology(findInt(header, "fxTopology", 1));
    if (auto stPos = header.find("\"sendTargets\": ["); stPos != std::string::npos)
    {
        std::size_t cur = stPos + 16;
        for (int b = 0; b < 4; ++b)
        {
            char* endP = nullptr;
            const long t = std::strtol(&header[cur], &endP, 10);
            if (endP != &header[cur]) { engine.getOutputAndFx().setSendSlotTarget(b, static_cast<int>(t)); cur = static_cast<std::size_t>(endP - header.data()); }
            auto comma = header.find(',', cur);
            if (comma == std::string::npos) break;
            cur = comma + 1;
        }
    }

    bridge.setProfileById(findString(header, "hardwareProfile", "generic_midi"));
    bridge.getLatencyCompensator().setLatencyMs(findFloat(header, "latencyMs", 0.0f));

    std::size_t curPos = 0;
    for (int pIdx = 0; pIdx < 16; ++pIdx)
    {
        const std::string partKey = "\"index\": " + std::to_string(pIdx);
        auto pPos = jsonString.find(partKey, curPos);
        if (pPos == std::string::npos) break;

        auto nextPPos = jsonString.find("\"index\": " + std::to_string(pIdx + 1), pPos);
        std::string partChunk = jsonString.substr(pPos, (nextPPos != std::string::npos) ? (nextPPos - pPos) : (jsonString.size() - pPos));
        auto ptStart = partChunk.find("\"partials\":");
        std::string partHeader = (ptStart != std::string::npos) ? partChunk.substr(0, ptStart) : partChunk;

        const int engIdx = findInt(partHeader, "engineTypeIndex", engine.getPartEngineTypeIndex(pIdx));
        if (engIdx != engine.getPartEngineTypeIndex(pIdx)) (void)engine.selectPartEngineType(pIdx, engIdx);

        auto& p = engine.part(static_cast<std::size_t>(pIdx));
        const std::string pName = findString(partHeader, "presetName", "");
        if (!pName.empty()) engine.setPartPresetName(pIdx, pName.c_str());
        p.midiChannel = static_cast<std::uint8_t>(findInt(partHeader, "midiChannel", p.midiChannel));
        p.midiPortIndex = static_cast<std::uint8_t>(std::clamp(findInt(partHeader, "midiPortIndex", p.midiPortIndex), 0, 7));
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

        // Scan partials in chunk
        std::size_t ptPos = 0;
        for (int ptIdx = 0; ptIdx < 4; ++ptIdx)
        {
            ptPos = partChunk.find("\"enabled\":", ptPos);
            if (ptPos == std::string::npos)
                break;
            std::string ptBlock = partChunk.substr(ptPos, 300);
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
            ptPos += 20;
        }

        curPos = pPos + 50;
    }
    return true;
}

std::vector<uint8_t> McxBankManagerBridge::buildRolandDt1SysEx(uint8_t deviceId,
                                                              uint8_t modelId,
                                                              const std::vector<uint8_t>& address,
                                                              const std::vector<uint8_t>& data)
{
    std::vector<uint8_t> syx;
    syx.push_back(0xF0);
    syx.push_back(0x41); // Roland ID
    syx.push_back(deviceId & 0x7F);
    syx.push_back(modelId & 0x7F);
    syx.push_back(0x12); // DT1 command

    std::vector<uint8_t> payload;
    payload.insert(payload.end(), address.begin(), address.end());
    payload.insert(payload.end(), data.begin(), data.end());

    syx.insert(syx.end(), payload.begin(), payload.end());
    syx.push_back(computeRolandChecksum(payload));
    syx.push_back(0xF7);
    return syx;
}

std::vector<uint8_t> McxBankManagerBridge::buildBossDr5TrackDump(uint8_t partIdx,
                                                                uint8_t trackLevel,
                                                                uint8_t trackPan,
                                                                uint8_t reverbSend,
                                                                uint8_t deviceId)
{
    // Boss DR-5 GS Track Address: 0x40, partIdx, 0x00
    const std::vector<uint8_t> addr = { 0x40, static_cast<uint8_t>(partIdx & 0x0F), 0x00 };
    const std::vector<uint8_t> data = {
        static_cast<uint8_t>(trackLevel & 0x7F),
        static_cast<uint8_t>(trackPan & 0x7F),
        static_cast<uint8_t>(reverbSend & 0x7F)
    };
    return buildRolandDt1SysEx(deviceId, 0x42, addr, data);
}

#if defined(JUCE_VERSION) || defined(JUCE_CORE_H_INCLUDED)
juce::ValueTree McxBankManagerBridge::toValueTree(const McxEngine& engine,
                                                 const McxHardwareBridge& bridge,
                                                 const juce::String& presetName)
{
    juce::ValueTree vt("MCX_PRESET");
    vt.setProperty("schema", kCurrentSchema, nullptr);
    vt.setProperty("name", presetName, nullptr);
    vt.setProperty("jsonState", juce::String(serializeToJson(engine, bridge, presetName.toStdString())), nullptr);
    return vt;
}

bool McxBankManagerBridge::fromValueTree(McxEngine& engine,
                                        McxHardwareBridge& bridge,
                                        const juce::ValueTree& vt)
{
    if (!vt.isValid() || !vt.hasProperty("jsonState"))
        return false;

    return deserializeFromJson(engine, bridge, vt.getProperty("jsonState").toString().toStdString());
}
#endif

} // namespace abdmcx
