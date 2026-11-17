#pragma once

#include "../DSP/Core/McxTypes.h"
#include <array>
#include <cstddef>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

#if defined(JUCE_VERSION) || defined(JUCE_CORE_H_INCLUDED)
#include <juce_core/juce_core.h>
#endif

namespace abdmcx
{

struct McxPartState;

struct McxLoadedWave
{
    std::string id;
    std::string name;
    McxOscSourceKind sourceKind { McxOscSourceKind::PcmZone };
    bool isStereo { false };
    bool isLooping { false };
    bool isPingPong { false };
    int rootKey { 60 };
    float fineTuneCents { 0.0f };
    float loopTuneCents { 0.0f };
    int loopStart { 0 };
    int loopEnd { 0 };
    int altStartOffset { 0 };
    std::vector<float> sampleDataL;
    std::vector<float> sampleDataR;
};

struct McxLoadedTone
{
    std::string id;
    std::string name;
    McxStructureMode structureMode { McxStructureMode::Parallel };
    McxOutputCharacter outputCharacter { McxOutputCharacter::HdStudio };
    std::array<McxPartialConfig, 4> partials {};
    std::array<std::string, 4> partialWaveIds {};
};

struct McxLoadedDrumSlot
{
    int midiNote { 60 };
    std::string name;
    std::string waveId;
    std::uint8_t muteGroup { 0 };
    float level { 1.0f };
    float pan { 0.0f };
    float cutoffHzOverride { 14000.0f };
    McxDrumTriggerMode triggerMode { McxDrumTriggerMode::OneShot };
};

struct McxLoadedDrumKit
{
    std::string id;
    std::string name;
    McxDrumMapMode drumMapMode { McxDrumMapMode::RolandGsMc };
    std::array<McxLoadedDrumSlot, 128> slots {};
};

/**
 * @brief Clean-room C++20 bank loader for proprietary .abdbank archives.
 * De-bakes wave pools, multi-partial tones, and drum kits into memory. Zero allocation during playback.
 */
class McxBankLoader
{
public:
    McxBankLoader() = default;

    bool loadFromMemory(const void* data, std::size_t sizeBytes);

#if defined(JUCE_VERSION) || defined(JUCE_CORE_H_INCLUDED)
    bool loadFromFile(const juce::File& file);
#endif
    bool loadFromFilePath(const std::string& filePath);

    void clear() noexcept;

    [[nodiscard]] bool isValid() const noexcept { return valid_; }
    [[nodiscard]] const std::string& getBankName() const noexcept { return bankName_; }
    [[nodiscard]] const std::string& getAuthor() const noexcept { return author_; }
    [[nodiscard]] int getToneCount() const noexcept { return static_cast<int>(tones_.size()); }
    [[nodiscard]] int getDrumKitCount() const noexcept { return static_cast<int>(drumKits_.size()); }
    [[nodiscard]] int getWaveCount() const noexcept { return static_cast<int>(waves_.size()); }

    [[nodiscard]] const McxLoadedTone* getTone(int index) const noexcept;
    [[nodiscard]] const McxLoadedDrumKit* getDrumKit(int index) const noexcept;
    [[nodiscard]] const McxLoadedWave* findWave(const std::string& waveId) const noexcept;

    bool applyToneToPart(int toneIndex, McxPartState& part) const noexcept;
    bool applyDrumKitToPart(int kitIndex, McxPartState& part) const noexcept;

private:
    struct ZipEntryView
    {
        std::string filename;
        const std::uint8_t* data { nullptr };
        std::size_t size { 0 };
    };

    static bool parseZip(const std::uint8_t* bytes, std::size_t size, std::vector<ZipEntryView>& outEntries);
    static bool parseWav(const std::uint8_t* wavBytes, std::size_t wavSize, McxLoadedWave& wave);
    bool parseManifest(const std::string& jsonText);

    bool valid_ { false };
    std::string bankName_;
    std::string author_;
    std::unordered_map<std::string, McxLoadedWave> waves_;
    std::vector<McxLoadedTone> tones_;
    std::vector<McxLoadedDrumKit> drumKits_;
};

} // namespace abdmcx
