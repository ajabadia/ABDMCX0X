#include "McxBankManagerBridge.h"
#include "McxBankJsonHelpers.h"

#include <algorithm>
#include <sstream>

namespace abdmcx
{

namespace
{
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
    ss << "  \"masterGain\": " << bank_json::floatToStr(engine.getMasterVolume()) << ",\n";
    ss << "  \"globalTranspose\": " << engine.getTransposer().getTransposeSemitones() << ",\n";
    ss << "  \"fxTopology\": " << engine.getOutputAndFx().getUiTopology() << ",\n";
    ss << "  \"sendTargets\": [" << engine.getOutputAndFx().getSendSlotTarget(0) << ", "
       << engine.getOutputAndFx().getSendSlotTarget(1) << ", "
       << engine.getOutputAndFx().getSendSlotTarget(2) << ", "
       << engine.getOutputAndFx().getSendSlotTarget(3) << "],\n";
    ss << "  \"hardwareProfile\": \"" << bridge.getProfile().id << "\",\n";
    ss << "  \"latencyMs\": " << bank_json::floatToStr(bridge.getLatencyCompensator().getLatencyMs()) << ",\n";
    ss << "  \"parts\": [\n";
    for (int pIdx = 0; pIdx < 16; ++pIdx)
        bank_json::appendPartJson(ss, engine, pIdx, pIdx < 15);
    ss << "  ]\n";
    ss << "}\n";
    return ss.str();
}

bool McxBankManagerBridge::deserializeFromJson(McxEngine& engine,
                                               McxHardwareBridge& bridge,
                                               const std::string& jsonString)
{
    if (jsonString.empty() || jsonString.find("abd_mcx0x_preset_v1") == std::string::npos)
        return false;

    const auto partsPos = jsonString.find("\"parts\":");
    const std::string header = (partsPos != std::string::npos) ? jsonString.substr(0, partsPos) : jsonString;

    engine.setMachinePersona(static_cast<McxMachinePersona>(bank_json::findInt(header, "persona", 0)));
    engine.setOutputCharacter(static_cast<McxOutputCharacter>(bank_json::findInt(header, "dacCharacter", 0)));
    if (header.find("\"masterGain\":") != std::string::npos) engine.setMasterVolume(bank_json::findFloat(header, "masterGain", 0.85f));
    if (header.find("\"globalTranspose\":") != std::string::npos) engine.setGlobalTranspose(bank_json::findInt(header, "globalTranspose", 0));
    if (header.find("\"fxTopology\":") != std::string::npos) engine.getOutputAndFx().setUiTopology(bank_json::findInt(header, "fxTopology", 1));
    if (auto stPos = header.find("\"sendTargets\": ["); stPos != std::string::npos)
    {
        std::size_t cur = stPos + 16;
        for (int b = 0; b < 4; ++b)
        {
            char* endP = nullptr;
            const long t = std::strtol(&header[cur], &endP, 10);
            if (endP != &header[cur]) { engine.getOutputAndFx().setSendSlotTarget(b, static_cast<int>(t)); cur = static_cast<std::size_t>(endP - header.data()); }
            const auto comma = header.find(',', cur);
            if (comma == std::string::npos) break;
            cur = comma + 1;
        }
    }

    bridge.setProfileById(bank_json::findString(header, "hardwareProfile", "generic_midi"));
    bridge.getLatencyCompensator().setLatencyMs(bank_json::findFloat(header, "latencyMs", 0.0f));

    std::size_t curPos = 0;
    for (int pIdx = 0; pIdx < 16; ++pIdx)
    {
        const auto pPos = jsonString.find("\"index\": " + std::to_string(pIdx), curPos);
        if (pPos == std::string::npos) break;
        const auto nextPPos = jsonString.find("\"index\": " + std::to_string(pIdx + 1), pPos);
        const std::string partChunk = jsonString.substr(pPos, (nextPPos != std::string::npos) ? (nextPPos - pPos) : (jsonString.size() - pPos));
        bank_json::parsePartJson(engine, pIdx, partChunk);
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
    syx.push_back(0x41);
    syx.push_back(deviceId & 0x7F);
    syx.push_back(modelId & 0x7F);
    syx.push_back(0x12);

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
