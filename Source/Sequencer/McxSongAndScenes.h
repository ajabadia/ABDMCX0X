#pragma once

#include "McxQuantizedMuteState.h"

#include <array>
#include <atomic>
#include <cstdint>
#include <string_view>
#include <type_traits>

namespace abdmcx
{

/**
 * @brief Live performance scene (1 of 8) storing 64-part mute mask & global transpose.
 * Trivially copyable for lock-free audio/UI exchange.
 */
struct McxSceneSlot
{
    std::uint64_t muteMask { 0ull };
    std::int8_t transposeSemitones { 0 };
    std::uint8_t barsOverride { 0 };
    char name[20] {};
};

/**
 * @brief Single linear block in Song Mode referencing a Scene with length and transpose offset.
 */
struct McxSongBlock
{
    std::uint8_t sceneIndex { 0 };
    std::uint8_t bars { 4 };
    std::int8_t transposeOffset { 0 };
};

static_assert(std::is_trivially_copyable_v<McxSceneSlot>, "McxSceneSlot must be trivially copyable");
static_assert(std::is_trivially_copyable_v<McxSongBlock>, "McxSongBlock must be trivially copyable");

struct McxSongTelemetry
{
    int activeScene { 0 };
    int queuedScene { -1 };
    bool songMode { false };
    bool songLoop { true };
    int songBlockIdx { 0 };
    int songBarInBlock { 0 };
    int songBlockCount { 0 };
    std::uint32_t sceneApplySeq { 0 };
    std::uint64_t appliedMuteMask { 0 };
    int appliedTranspose { 0 };
};

struct McxSceneApplyAction
{
    bool applied { false };
    bool stopTransport { false };
    std::uint64_t muteMask { 0 };
    int transposeSemitones { 0 };
};

/**
 * @brief RT-safe manager for 8 bar-quantized Live Scenes and linear Song Mode (up to 64 blocks).
 * Lock-free double-buffered song arrangement + atomic telemetry mirror for WebUI / JUCE / WASM.
 */
class McxSongAndScenes
{
public:
    static constexpr int kNumScenes = 8;
    static constexpr int kMaxSongBlocks = 64;

    McxSongAndScenes() noexcept;

    void reset() noexcept;

    [[nodiscard]] const McxSceneSlot& scene(int idx) const noexcept;
    void setScene(int idx, std::uint64_t muteMask, int transposeSemitones, const char* name = nullptr) noexcept;
    void setSceneName(int idx, std::string_view name) noexcept;

    /** Launches or queues a live scene switch (cancels Song Mode when triggered live). */
    [[nodiscard]] McxSceneApplyAction triggerScene(int idx, bool sequencerRunning, bool immediate) noexcept;

    // Lock-free double-buffered Song Arrangement staging
    void clearStagingBlocks() noexcept;
    bool addStagingBlock(int sceneIdx, int bars, int transposeOffset) noexcept;
    void commitStagingBlocks(bool loopEnabled) noexcept;

    void setSongMode(bool enabled) noexcept;
    void setSongLoop(bool loop) noexcept;
    [[nodiscard]] McxSceneApplyAction jumpToSongBlock(int blockIdx, bool sequencerRunning, bool immediate) noexcept;

    void swapDirtySongBuffer() noexcept;
    [[nodiscard]] McxSceneApplyAction onTransportStart(int startBar = 0) noexcept;
    [[nodiscard]] McxSceneApplyAction onBarBoundary() noexcept;

    void recordAppliedState(std::uint64_t muteMask, int transposeSemitones) noexcept;
    [[nodiscard]] McxSongTelemetry readTelemetry() const noexcept;

    [[nodiscard]] int getActiveSongBlockCount() const noexcept;
    [[nodiscard]] McxSongBlock getActiveSongBlock(int idx) const noexcept;
    void publishTelemetry() noexcept;

    [[nodiscard]] McxQuantizedMuteState& quantizedMute() noexcept { return quantizedMute_; }
    [[nodiscard]] const McxQuantizedMuteState& quantizedMute() const noexcept { return quantizedMute_; }

private:
    struct SongBuffer
    {
        std::array<McxSongBlock, kMaxSongBlocks> blocks {};
        int count { 0 };
        bool loop { true };
    };

    [[nodiscard]] const SongBuffer& activeSongBuffer() const noexcept;
    [[nodiscard]] const SongBuffer& latestCommittedSong() const noexcept;
    [[nodiscard]] McxSceneApplyAction makeActionForBlock(const SongBuffer& buf, int blockIdx) noexcept;

    std::array<McxSceneSlot, kNumScenes> scenes_ {};
    std::array<SongBuffer, 2> songBuffers_ {};
    SongBuffer songStaging_ {};
    std::atomic<std::uint8_t> songActiveSlot_ { 0 };
    std::atomic<bool> songDirty_ { false };

    int activeScene_ { 0 };
    int queuedScene_ { -1 };
    int queuedSongBlock_ { -1 };
    bool songMode_ { false };
    bool songLoop_ { true };
    int songBlockIdx_ { 0 };
    int songBarInBlock_ { 0 };

    std::atomic<int> pubActiveScene_ { 0 };
    std::atomic<int> pubQueuedScene_ { -1 };
    std::atomic<bool> pubSongMode_ { false };
    std::atomic<bool> pubSongLoop_ { true };
    std::atomic<int> pubSongBlockIdx_ { 0 };
    std::atomic<int> pubSongBarInBlock_ { 0 };
    std::atomic<int> pubSongBlockCount_ { 0 };
    std::atomic<std::uint32_t> pubSceneApplySeq_ { 0 };
    std::atomic<std::uint64_t> pubAppliedMuteMask_ { 0 };
    std::atomic<int> pubAppliedTranspose_ { 0 };
    McxQuantizedMuteState quantizedMute_ {};
};

} // namespace abdmcx
