#pragma once

#include "../DSP/Core/McxEngine.h"
#include "SynthEngines/StructuredRompler/RomplerBankIndex.h"

#include <cstddef>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

namespace abdmcx
{

/**
 * @brief Selective on-demand multi-bank host over abd::rompler::RomplerBankIndex.
 *
 * Mounts multiple .abdbank archives (from disk via seekg or memory) decoding ZERO PCM
 * samples upfront, then streams ONLY the requested Tone or DrumKit waves into the shared
 * McxEngine::wavePool() without waveId collisions across mounted banks.
 */
class McxMultiBankManager
{
public:
    McxMultiBankManager() = default;
    ~McxMultiBankManager() = default;

    McxMultiBankManager(const McxMultiBankManager&) = delete;
    McxMultiBankManager& operator=(const McxMultiBankManager&) = delete;
    McxMultiBankManager(McxMultiBankManager&&) noexcept = default;
    McxMultiBankManager& operator=(McxMultiBankManager&&) noexcept = default;

    int mountBankFromFile(const std::string& filePath,
                          const std::string& bankIdOverride = {},
                          abd::rompler::RomplerWavePool* preloadWavePool = nullptr);
    int mountBankFromMemory(const void* data,
                            std::size_t sizeBytes,
                            const std::string& bankIdOverride = {},
                            bool copyBuffer = true,
                            abd::rompler::RomplerWavePool* preloadWavePool = nullptr);
    [[nodiscard]] static bool isLaSharedPcmBankId(std::string_view bankId) noexcept;
    bool preloadBankWaves(int bankSlot, abd::rompler::RomplerWavePool& pool) const;

    [[nodiscard]] int findBankSlotById(std::string_view bankId) const noexcept;
    [[nodiscard]] int findBankSlotByPath(std::string_view filePath) const noexcept;
    [[nodiscard]] int getBankCount() const noexcept { return static_cast<int>(slots_.size()); }
    [[nodiscard]] const abd::rompler::RomplerBankIndex* getBank(int slot) const noexcept;

    bool loadToneToPart(int bankSlot, int toneIndex, McxEngine& engine, int partIdx) const;
    bool loadDrumKitToPart(int bankSlot, int kitIndex, McxEngine& engine, int partIdx) const;
    bool assignWaveToPart(int bankSlot, int waveIndex, bool isDrumSlot, int targetIndex, McxEngine& engine, int partIdx) const;

    void clear() noexcept;

private:
    struct MountedBankSlot
    {
        std::unique_ptr<abd::rompler::RomplerBankIndex> index {};
        std::string filePath {};
        std::string bankId {};
    };

    int registerMountedIndex(std::unique_ptr<abd::rompler::RomplerBankIndex> idx,
                             const std::string& filePath,
                             bool replaceMatchingId,
                             abd::rompler::RomplerWavePool* preloadWavePool = nullptr);

    std::vector<MountedBankSlot> slots_ {};
};

} // namespace abdmcx
