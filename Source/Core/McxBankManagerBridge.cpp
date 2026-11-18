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
    ss << "  \"hardwareProfile\": \"" << bridge.getProfile().id << "\",\n";
    ss << "  \"latencyMs\": " << floatToStr(bridge.getLatencyCompensator().getLatencyMs()) << ",\n";
    ss << "  \"parts\": [\n";

    for (int pIdx = 0; pIdx < 16; ++pIdx)
    {
        const auto& p = engine.part(static_cast<std::size_t>(pIdx));
        ss << "    {\n";
        ss << "      \"index\": " << pIdx << ",\n";
        ss << "      \"midiChannel\": " << static_cast<int>(p.midiChannel) << ",\n";
        ss << "      \"midiPortIndex\": " << static_cast<int>(p.midiPortIndex) << ",\n";
        ss << "      \"routeMode\": " << static_cast<int>(p.routeMode) << ",\n";
        ss << "      \"isDrumKit\": " << (p.isDrumKit ? "true" : "false") << ",\n";
        ss << "      \"structureMode\": " << static_cast<int>(p.structureMode) << ",\n";
        ss << "      \"vectorX\": " << floatToStr(p.vectorX) << ",\n";
        ss << "      \"vectorY\": " << floatToStr(p.vectorY) << ",\n";
        ss << "      \"level\": " << floatToStr(p.level) << ",\n";
        ss << "      \"pan\": " << floatToStr(p.pan) << ",\n";
        ss << "      \"reverbSend\": " << floatToStr(p.reverbSend) << ",\n";
        ss << "      \"chorusSend\": " << floatToStr(p.chorusSend) << ",\n";
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
} // namespace

bool McxBankManagerBridge::deserializeFromJson(McxEngine& engine,
                                              McxHardwareBridge& bridge,
                                              const std::string& jsonString)
{
    if (jsonString.empty() || jsonString.find("abd_mcx0x_preset_v1") == std::string::npos)
        return false;

    const int persona = findInt(jsonString, "persona", 0);
    engine.setMachinePersona(static_cast<McxMachinePersona>(persona));

    const int dac = findInt(jsonString, "dacCharacter", 0);
    engine.setOutputCharacter(static_cast<McxOutputCharacter>(dac));

    const std::string hwProfile = findString(jsonString, "hardwareProfile", "generic_midi");
    bridge.setProfileById(hwProfile);

    const float latency = findFloat(jsonString, "latencyMs", 0.0f);
    bridge.getLatencyCompensator().setLatencyMs(latency);

    // Simple per-part scanner
    std::size_t curPos = 0;
    for (int pIdx = 0; pIdx < 16; ++pIdx)
    {
        const std::string partKey = "\"index\": " + std::to_string(pIdx);
        auto pPos = jsonString.find(partKey, curPos);
        if (pPos == std::string::npos)
            break;

        auto nextPPos = jsonString.find("\"index\": " + std::to_string(pIdx + 1), pPos);
        std::string partChunk = jsonString.substr(pPos, (nextPPos != std::string::npos) ? (nextPPos - pPos) : 3000);

        auto& p = engine.part(static_cast<std::size_t>(pIdx));
        p.midiChannel = static_cast<std::uint8_t>(findInt(partChunk, "midiChannel", p.midiChannel));
        p.midiPortIndex = static_cast<std::uint8_t>(std::clamp(findInt(partChunk, "midiPortIndex", p.midiPortIndex), 0, 7));
        p.routeMode = static_cast<McxPartRouteMode>(findInt(partChunk, "routeMode", static_cast<int>(p.routeMode)));
        p.isDrumKit = (partChunk.find("\"isDrumKit\": true") != std::string::npos);
        p.structureMode = static_cast<McxStructureMode>(findInt(partChunk, "structureMode", 0));
        p.vectorX = findFloat(partChunk, "vectorX", 0.0f);
        p.vectorY = findFloat(partChunk, "vectorY", 0.0f);
        p.level = findFloat(partChunk, "level", 0.8f);
        p.pan = findFloat(partChunk, "pan", 0.0f);
        p.reverbSend = findFloat(partChunk, "reverbSend", 0.0f);
        p.chorusSend = findFloat(partChunk, "chorusSend", 0.0f);

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
