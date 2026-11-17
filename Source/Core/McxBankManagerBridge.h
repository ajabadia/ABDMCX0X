#pragma once

#include "../DSP/Core/McxEngine.h"
#include "../Hardware/McxHardwareBridge.h"

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

#if defined(JUCE_VERSION) || defined(JUCE_CORE_H_INCLUDED)
#include <juce_core/juce_core.h>
#include <juce_data_structures/juce_data_structures.h>
#endif

namespace abdmcx
{

/**
 * @brief State serialization and BankManager bridge for ABDMCX0X.
 * Handles multitimbral preset storage, JSON export/import, DAW state chunks,
 * and Roland/Boss SysEx patch conversion.
 */
class McxBankManagerBridge
{
public:
    static constexpr const char* kCurrentSchema = "abd_mcx0x_preset_v1";

    McxBankManagerBridge() = default;
    ~McxBankManagerBridge() = default;

    // --- JSON Serialization (Headless & JUCE compatible) ---
    static std::string serializeToJson(const McxEngine& engine,
                                       const McxHardwareBridge& bridge,
                                       const std::string& presetName = "Default Preset");

    static bool deserializeFromJson(McxEngine& engine,
                                    McxHardwareBridge& bridge,
                                    const std::string& jsonString);

    // --- Roland GS / Boss DR-5 SysEx Parameter Dump Export ---
    static std::vector<uint8_t> buildBossDr5TrackDump(uint8_t partIdx,
                                                      uint8_t trackLevel,
                                                      uint8_t trackPan,
                                                      uint8_t reverbSend,
                                                      uint8_t deviceId = 0x10);

    static std::vector<uint8_t> buildRolandDt1SysEx(uint8_t deviceId,
                                                    uint8_t modelId,
                                                    const std::vector<uint8_t>& address,
                                                    const std::vector<uint8_t>& data);

#if defined(JUCE_VERSION) || defined(JUCE_CORE_H_INCLUDED)
    // --- JUCE ValueTree & DAW State Persistence ---
    static juce::ValueTree toValueTree(const McxEngine& engine,
                                       const McxHardwareBridge& bridge,
                                       const juce::String& presetName = "Default Preset");

    static bool fromValueTree(McxEngine& engine,
                              McxHardwareBridge& bridge,
                              const juce::ValueTree& vt);
#endif
};

} // namespace abdmcx
