#include "McxSongAndScenes.h"

#include <algorithm>
#include <cstring>

namespace abdmcx
{

namespace
{
void copyTruncatedName(char (&dst)[20], std::string_view src) noexcept
{
    const std::size_t n = std::min<std::size_t>(src.size(), sizeof(dst) - 1);
    std::memset(dst, 0, sizeof(dst));
    if (n > 0) std::memcpy(dst, src.data(), n);
}

[[nodiscard]] McxSceneApplyAction actionForScene(const McxSceneSlot& sc, int extraTranspose = 0) noexcept
{
    const int tr = std::clamp(static_cast<int>(sc.transposeSemitones) + extraTranspose, -24, 24);
    return { true, false, sc.muteMask, tr };
}
} // namespace

McxSongAndScenes::McxSongAndScenes() noexcept { reset(); }

void McxSongAndScenes::reset() noexcept
{
    songMode_ = false;
    songLoop_ = true;
    activeScene_ = 0;
    queuedScene_ = -1;
    queuedSongBlock_ = -1;
    songBlockIdx_ = 0;
    songBarInBlock_ = 0;

    static constexpr std::array<const char*, kNumScenes> kNames = { "Full", "Drums+Bass", "Breakdown", "Lift +5", "Bridge +7", "Minor -3", "Solo Drums", "Drop" };
    static constexpr std::array<std::uint64_t, kNumScenes> kMasks = { 0ull, 0xFDFEull, 0x0200ull, 0ull, 0ull, 0ull, 0xFDFFull, 0ull };
    static constexpr std::array<std::int8_t, kNumScenes> kTrs = { 0, 0, 0, 5, 7, -3, 0, 0 };
    for (int i = 0; i < kNumScenes; ++i)
    {
        const auto u = static_cast<std::size_t>(i);
        scenes_[u] = McxSceneSlot { kMasks[u], kTrs[u], 0, {} };
        copyTruncatedName(scenes_[u].name, kNames[u]);
    }

    SongBuffer defBuf {};
    defBuf.blocks[0] = { 1, 2, 0 }; defBuf.blocks[1] = { 0, 2, 0 };
    defBuf.blocks[2] = { 3, 2, 0 }; defBuf.blocks[3] = { 2, 2, 0 };
    defBuf.count = 4; defBuf.loop = true;

    songBuffers_[0] = defBuf;
    songBuffers_[1] = defBuf;
    songStaging_ = defBuf;
    songActiveSlot_.store(0, std::memory_order_relaxed);
    songDirty_.store(false, std::memory_order_relaxed);
    pubAppliedMuteMask_.store(0u, std::memory_order_relaxed);
    pubAppliedTranspose_.store(0, std::memory_order_relaxed);
    quantizedMute_.reset();
    publishTelemetry();
}

const McxSceneSlot& McxSongAndScenes::scene(int idx) const noexcept
{
    return scenes_[static_cast<std::size_t>(std::clamp(idx, 0, kNumScenes - 1))];
}

void McxSongAndScenes::setScene(int idx, std::uint64_t muteMask, int transposeSemitones, const char* name) noexcept
{
    auto& sc = scenes_[static_cast<std::size_t>(std::clamp(idx, 0, kNumScenes - 1))];
    sc.muteMask = muteMask;
    sc.transposeSemitones = static_cast<std::int8_t>(std::clamp(transposeSemitones, -24, 24));
    if (name != nullptr && name[0] != '\0')
        copyTruncatedName(sc.name, std::string_view(name));
}

void McxSongAndScenes::setSceneName(int idx, std::string_view name) noexcept
{
    if (!name.empty())
        copyTruncatedName(scenes_[static_cast<std::size_t>(std::clamp(idx, 0, kNumScenes - 1))].name, name);
}

McxSceneApplyAction McxSongAndScenes::triggerScene(int idx, bool sequencerRunning, bool immediate) noexcept
{
    const int i = std::clamp(idx, 0, kNumScenes - 1);
    songMode_ = false;
    queuedSongBlock_ = -1;
    if (!sequencerRunning || immediate)
    {
        activeScene_ = i;
        queuedScene_ = -1;
        publishTelemetry();
        return actionForScene(scenes_[static_cast<std::size_t>(i)]);
    }
    queuedScene_ = i;
    publishTelemetry();
    return {};
}

void McxSongAndScenes::clearStagingBlocks() noexcept { songStaging_.count = 0; }

bool McxSongAndScenes::addStagingBlock(int sceneIdx, int bars, int transposeOffset) noexcept
{
    if (songStaging_.count >= kMaxSongBlocks) return false;
    auto& blk = songStaging_.blocks[static_cast<std::size_t>(songStaging_.count++)];
    blk.sceneIndex = static_cast<std::uint8_t>(std::clamp(sceneIdx, 0, kNumScenes - 1));
    blk.bars = static_cast<std::uint8_t>(std::clamp(bars, 1, 32));
    blk.transposeOffset = static_cast<std::int8_t>(std::clamp(transposeOffset, -12, 12));
    return true;
}

void McxSongAndScenes::commitStagingBlocks(bool loopEnabled) noexcept
{
    const std::uint8_t cur = songActiveSlot_.load(std::memory_order_acquire);
    const std::uint8_t back = static_cast<std::uint8_t>(1u - (cur & 1u));
    songStaging_.loop = loopEnabled;
    songBuffers_[back] = songStaging_;
    songDirty_.store(true, std::memory_order_release);
    pubSongLoop_.store(loopEnabled, std::memory_order_release);
    pubSongBlockCount_.store(songStaging_.count, std::memory_order_release);
}

void McxSongAndScenes::setSongMode(bool enabled) noexcept
{
    songMode_ = enabled;
    queuedScene_ = -1;
    queuedSongBlock_ = -1;
    if (enabled) { songBlockIdx_ = 0; songBarInBlock_ = 0; }
    publishTelemetry();
}

void McxSongAndScenes::setSongLoop(bool loop) noexcept
{
    songLoop_ = loop;
    songBuffers_[0].loop = loop; songBuffers_[1].loop = loop; songStaging_.loop = loop;
    publishTelemetry();
}

McxSceneApplyAction McxSongAndScenes::jumpToSongBlock(int blockIdx, bool sequencerRunning, bool immediate) noexcept
{
    swapDirtySongBuffer();
    const auto& buf = activeSongBuffer();
    if (buf.count <= 0) return {};
    const int target = std::clamp(blockIdx, 0, buf.count - 1);
    songMode_ = true; queuedScene_ = -1;
    if (!sequencerRunning || immediate) { queuedSongBlock_ = -1; songBarInBlock_ = 0; return makeActionForBlock(buf, target); }
    queuedSongBlock_ = target;
    publishTelemetry();
    return {};
}

void McxSongAndScenes::swapDirtySongBuffer() noexcept
{
    if (songDirty_.exchange(false, std::memory_order_acquire))
    {
        const std::uint8_t cur = songActiveSlot_.load(std::memory_order_relaxed);
        const std::uint8_t next = static_cast<std::uint8_t>(1u - (cur & 1u));
        songActiveSlot_.store(next, std::memory_order_release);
        songLoop_ = songBuffers_[next].loop;
        songBlockIdx_ = (songBuffers_[next].count > 0) ? std::clamp(songBlockIdx_, 0, songBuffers_[next].count - 1) : 0;
        publishTelemetry();
    }
}

McxSceneApplyAction McxSongAndScenes::makeActionForBlock(const SongBuffer& buf, int blockIdx) noexcept
{
    songBlockIdx_ = std::clamp(blockIdx, 0, std::max(0, buf.count - 1));
    const auto& blk = buf.blocks[static_cast<std::size_t>(songBlockIdx_)];
    activeScene_ = std::clamp<int>(static_cast<int>(blk.sceneIndex), 0, kNumScenes - 1);
    publishTelemetry();
    return actionForScene(scenes_[static_cast<std::size_t>(activeScene_)], static_cast<int>(blk.transposeOffset));
}

McxSceneApplyAction McxSongAndScenes::onTransportStart(int startBar) noexcept
{
    swapDirtySongBuffer();
    const auto& buf = activeSongBuffer();
    if (!songMode_ || buf.count <= 0) { publishTelemetry(); return {}; }

    int totalBars = 0;
    for (int i = 0; i < buf.count; ++i)
        totalBars += std::max(1, static_cast<int>(buf.blocks[static_cast<std::size_t>(i)].bars));

    int rem = std::max(0, startBar);
    if (songLoop_ && totalBars > 0) rem %= totalBars;

    int chosenBlock = buf.count - 1;
    int barOffset = std::max(0, static_cast<int>(buf.blocks[static_cast<std::size_t>(chosenBlock)].bars) - 1);
    for (int b = 0; b < buf.count; ++b)
    {
        const int bBars = std::max(1, static_cast<int>(buf.blocks[static_cast<std::size_t>(b)].bars));
        if (rem < bBars) { chosenBlock = b; barOffset = rem; break; }
        rem -= bBars;
    }

    queuedScene_ = -1;
    queuedSongBlock_ = -1;
    songBarInBlock_ = barOffset;
    return makeActionForBlock(buf, chosenBlock);
}

McxSceneApplyAction McxSongAndScenes::onBarBoundary() noexcept
{
    swapDirtySongBuffer();
    const auto& buf = activeSongBuffer();

    if (queuedSongBlock_ >= 0 && songMode_ && buf.count > 0)
    {
        const int target = std::clamp(queuedSongBlock_, 0, buf.count - 1);
        queuedSongBlock_ = -1;
        queuedScene_ = -1;
        songBarInBlock_ = 0;
        return makeActionForBlock(buf, target);
    }
    if (queuedScene_ >= 0)
    {
        activeScene_ = std::clamp(queuedScene_, 0, kNumScenes - 1);
        queuedScene_ = -1;
        songMode_ = false;
        publishTelemetry();
        return actionForScene(scenes_[static_cast<std::size_t>(activeScene_)]);
    }
    if (!songMode_ || buf.count <= 0) return {};

    songBlockIdx_ = std::clamp(songBlockIdx_, 0, buf.count - 1);
    const int curBars = std::max(1, static_cast<int>(buf.blocks[static_cast<std::size_t>(songBlockIdx_)].bars));
    if (++songBarInBlock_ < curBars) { publishTelemetry(); return {}; }

    songBarInBlock_ = 0;
    if (++songBlockIdx_ >= buf.count)
    {
        songBlockIdx_ = 0;
        if (!songLoop_) { publishTelemetry(); return { false, true, 0u, 0 }; }
    }
    return makeActionForBlock(buf, songBlockIdx_);
}

void McxSongAndScenes::recordAppliedState(std::uint64_t muteMask, int transposeSemitones) noexcept
{
    pubAppliedMuteMask_.store(muteMask, std::memory_order_release);
    pubAppliedTranspose_.store(std::clamp(transposeSemitones, -24, 24), std::memory_order_release);
    pubSceneApplySeq_.fetch_add(1u, std::memory_order_release);
}

McxSongTelemetry McxSongAndScenes::readTelemetry() const noexcept
{
    return {
        pubActiveScene_.load(std::memory_order_acquire),
        pubQueuedScene_.load(std::memory_order_acquire),
        pubSongMode_.load(std::memory_order_acquire),
        pubSongLoop_.load(std::memory_order_acquire),
        pubSongBlockIdx_.load(std::memory_order_acquire),
        pubSongBarInBlock_.load(std::memory_order_acquire),
        pubSongBlockCount_.load(std::memory_order_acquire),
        pubSceneApplySeq_.load(std::memory_order_acquire),
        pubAppliedMuteMask_.load(std::memory_order_acquire),
        pubAppliedTranspose_.load(std::memory_order_acquire),
    };
}

int McxSongAndScenes::getActiveSongBlockCount() const noexcept { return latestCommittedSong().count; }

McxSongBlock McxSongAndScenes::getActiveSongBlock(int idx) const noexcept
{
    const auto& buf = latestCommittedSong();
    return (idx >= 0 && idx < buf.count) ? buf.blocks[static_cast<std::size_t>(idx)] : McxSongBlock {};
}

void McxSongAndScenes::publishTelemetry() noexcept
{
    const auto& buf = latestCommittedSong();
    pubActiveScene_.store(activeScene_, std::memory_order_release);
    pubQueuedScene_.store(queuedScene_, std::memory_order_release);
    pubSongMode_.store(songMode_, std::memory_order_release);
    pubSongLoop_.store(buf.loop, std::memory_order_release);
    pubSongBlockIdx_.store(songBlockIdx_, std::memory_order_release);
    pubSongBarInBlock_.store(songBarInBlock_, std::memory_order_release);
    pubSongBlockCount_.store(buf.count, std::memory_order_release);
}

const McxSongAndScenes::SongBuffer& McxSongAndScenes::activeSongBuffer() const noexcept
{
    return songBuffers_[songActiveSlot_.load(std::memory_order_acquire) & 1u];
}

const McxSongAndScenes::SongBuffer& McxSongAndScenes::latestCommittedSong() const noexcept
{
    const std::uint8_t cur = songActiveSlot_.load(std::memory_order_acquire) & 1u;
    return songBuffers_[songDirty_.load(std::memory_order_acquire) ? static_cast<std::uint8_t>(1u - cur) : cur];
}

} // namespace abdmcx
