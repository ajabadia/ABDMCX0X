#include "McxPatternSequencer.h"

#include <algorithm>
#include <cmath>

namespace abdmcx
{

McxPatternSequencer::McxPatternSequencer() noexcept
    : storage_(std::make_unique<Storage>())
{
    reset();
}

void McxPatternSequencer::prepare(double sampleRate) noexcept
{
    sampleRate_ = (sampleRate > 1000.0) ? sampleRate : 44100.0;
    updateTiming();
}

void McxPatternSequencer::reset() noexcept
{
    running_ = false;
    paused_ = false;
    prevHostPlaying_ = false;
    barBoundaryPending_ = false;
    currentTick_ = 0;
    countInRemainingTicks_ = 0;
    sampleCursor_ = 0.0;
    bars_.store(1, std::memory_order_relaxed);
    ppq_.store(kDefaultPpq, std::memory_order_relaxed);
    recording_.store(false, std::memory_order_relaxed);
    recSessionResetPending_.store(false, std::memory_order_relaxed);
    recordMode_.store(RecordMode::Overdub, std::memory_order_relaxed);
    countInBars_.store(0, std::memory_order_relaxed);
    recordQuantizeSteps_.store(16, std::memory_order_relaxed);
    loopEnabled_.store(true, std::memory_order_relaxed);
    recordedPatternRev_.store(0u, std::memory_order_relaxed);

    groove_.reset();
    // GrooveShuffleEngine resets amount to 0.50 (50% delay). Default straight = 0.0f.
    groove_.setMasterGroove({ GrooveEngine::Mode::Global, GrooveEngine::Algorithm::Mpc, GrooveEngine::Resolution::Sixteenth, 0.0f });
    for (int p = 0; p < kNumParts; ++p)
    {
        groove_.setPartGroove(p, { GrooveEngine::Mode::Global, GrooveEngine::Algorithm::Mpc, GrooveEngine::Resolution::Sixteenth, 0.0f });
        const auto u = static_cast<std::size_t>(p);
        storage_->activeSlot[u].store(0, std::memory_order_relaxed);
        storage_->dirty[u].store(false, std::memory_order_relaxed);
        storage_->buffers[u][0] = {};
        storage_->buffers[u][1] = {};
        storage_->staging[u] = {};
        storage_->activeRemainingTicks[u].fill(-1);
        storage_->activeNoteCount[u] = 0;
    }
    clearLiveRecState();
    updateTiming();
    publishTelemetry();
}

void McxPatternSequencer::clearPart(int partIdx) noexcept
{
    if (partIdx < 0 || partIdx >= kNumParts) return;
    storage_->staging[static_cast<std::size_t>(partIdx)] = {};
    replacePartPattern(partIdx, PartPattern {});
}

void McxPatternSequencer::replacePartPattern(int partIdx, const PartPattern& pattern) noexcept
{
    if (partIdx < 0 || partIdx >= kNumParts) return;
    const auto u = static_cast<std::size_t>(partIdx);
    const std::uint8_t cur = storage_->activeSlot[u].load(std::memory_order_acquire);
    const std::uint8_t back = static_cast<std::uint8_t>(1u - (cur & 1u));
    storage_->staging[u] = pattern;
    storage_->buffers[u][back] = pattern;
    storage_->dirty[u].store(true, std::memory_order_release);
}

void McxPatternSequencer::clearStagingPart(int partIdx) noexcept
{
    if (partIdx >= 0 && partIdx < kNumParts)
        storage_->staging[static_cast<std::size_t>(partIdx)] = {};
}

bool McxPatternSequencer::addStagingEvent(int partIdx, int startTick, int durationTicks,
                                          std::uint8_t note, std::uint8_t velocity, bool slide) noexcept
{
    if (partIdx < 0 || partIdx >= kNumParts) return false;
    auto& pat = storage_->staging[static_cast<std::size_t>(partIdx)];
    if (pat.eventCount >= kMaxEventsPerPart) return false;

    const int maxTicks = std::max(1, getTotalTicks());
    auto& ev = pat.events[static_cast<std::size_t>(pat.eventCount++)];
    ev.startTick = std::clamp(startTick, 0, maxTicks - 1);
    ev.durationTicks = std::max(1, durationTicks);
    ev.midiNote = std::clamp<std::uint8_t>(note, 0, 127);
    ev.velocity = std::clamp<std::uint8_t>(velocity, 1, 127);
    ev.slide = slide;
    ev.active = true;
    return true;
}

bool McxPatternSequencer::addStagingMotion(int partIdx, int laneIdx, int paramId, int tick, float value) noexcept
{
    if (partIdx < 0 || partIdx >= kNumParts || laneIdx < 0 || laneIdx >= 4) return false;
    auto& lane = storage_->staging[static_cast<std::size_t>(partIdx)].motionLanes[static_cast<std::size_t>(laneIdx)];
    lane.paramId = paramId;
    if (lane.count >= kMaxMotionPoints) return false;

    const int maxTicks = std::max(1, getTotalTicks());
    lane.points[static_cast<std::size_t>(lane.count++)] = { std::clamp(tick, 0, maxTicks - 1), value };
    return true;
}

void McxPatternSequencer::commitStagingPart(int partIdx) noexcept
{
    if (partIdx >= 0 && partIdx < kNumParts)
        replacePartPattern(partIdx, storage_->staging[static_cast<std::size_t>(partIdx)]);
}

void McxPatternSequencer::setStep(int partIdx, int step0to15, bool active,
                                  std::uint8_t velocity, bool slide, std::uint8_t note) noexcept
{
    if (partIdx < 0 || partIdx >= kNumParts || step0to15 < 0 || step0to15 >= 16) return;
    const int ppq = ppq_.load(std::memory_order_relaxed);
    const int ticksPerStep = std::max(1, (ppq * 4) / 16);
    const int targetTick = step0to15 * ticksPerStep;
    auto& pat = storage_->staging[static_cast<std::size_t>(partIdx)];

    bool updated = false;
    for (int i = 0; i < pat.eventCount; ++i)
    {
        auto& ev = pat.events[static_cast<std::size_t>(i)];
        if (ev.startTick == targetTick)
        {
            ev.active = active;
            ev.velocity = std::clamp<std::uint8_t>(velocity, 1, 127);
            ev.slide = slide;
            updated = true;
            break;
        }
    }
    if (!updated && active)
        addStagingEvent(partIdx, targetTick, ticksPerStep, note, velocity, slide);
    commitStagingPart(partIdx);
}

void McxPatternSequencer::setBpm(double bpm) noexcept
{
    const double clamped = std::clamp(bpm, 20.0, 300.0);
    if (std::abs(clamped - bpm_) > 1e-4)
    {
        bpm_ = clamped;
        updateTiming();
    }
}

void McxPatternSequencer::setBars(int bars) noexcept
{
    bars_.store(std::clamp(bars, 1, 32), std::memory_order_relaxed);
    publishTelemetry();
}

void McxPatternSequencer::setPpq(int ppq) noexcept
{
    ppq_.store((ppq == 480) ? 480 : 96, std::memory_order_relaxed);
    updateTiming();
    publishTelemetry();
}

void McxPatternSequencer::start(bool resetToZero) noexcept
{
    const bool wasPaused = paused_;
    if (resetToZero)
    {
        currentTick_ = 0;
        sampleCursor_ = 0.0;
        barBoundaryPending_ = false;
    }
    const int cib = countInBars_.load(std::memory_order_relaxed);
    if (recording_.load(std::memory_order_relaxed) && cib > 0 && (resetToZero || !wasPaused))
    {
        const int ppq = ppq_.load(std::memory_order_relaxed);
        countInRemainingTicks_ = cib * 4 * ppq;
    }
    else if (!wasPaused)
    {
        countInRemainingTicks_ = 0;
    }
    if (resetToZero || !wasPaused)
        recSessionResetPending_.store(true, std::memory_order_release);
    paused_ = false;
    running_ = true;
    publishTelemetry();
}

void McxPatternSequencer::stop(const McxSequencerCallbacks& cbs, std::int32_t sampleOffset) noexcept
{
    running_ = false;
    paused_ = false;
    countInRemainingTicks_ = 0;
    barBoundaryPending_ = false;
    currentTick_ = 0;
    sampleCursor_ = 0.0;
    recSessionResetPending_.store(true, std::memory_order_release);
    releaseAllActiveNotes(cbs, sampleOffset);
    publishTelemetry();
}

void McxPatternSequencer::pause() noexcept
{
    running_ = false;
    paused_ = true;
    countInRemainingTicks_ = 0;
    for (int p = 0; p < kNumParts; ++p)
    {
        const auto u = static_cast<std::size_t>(p);
        storage_->activeRemainingTicks[u].fill(-1);
        storage_->activeNoteCount[u] = 0;
    }
    publishTelemetry();
}

void McxPatternSequencer::syncFromHostTransport(bool hostPlaying, double hostBpm, double hostPpqPos, bool ppqValid,
                                                const McxSequencerCallbacks& cbs, McxMidiClockEmitter* midiClock,
                                                McxMidiOutQueue<1024>* outQ) noexcept
{
    if (hostBpm >= 20.0 && hostBpm <= 300.0)
        setBpm(hostBpm);

    const int totalTicks = std::max(1, publishedTotalTicks_.load(std::memory_order_relaxed));
    const int ppq = ppq_.load(std::memory_order_relaxed);

    if (hostPlaying && !prevHostPlaying_)
    {
        if (ppqValid && hostPpqPos >= 0.0)
        {
            currentTick_ = static_cast<int>(std::llround(hostPpqPos * static_cast<double>(ppq))) % totalTicks;
            sampleCursor_ = 0.0;
            barBoundaryPending_ = false;
        }
        start(!ppqValid);
        if (midiClock)
        {
            if (ppqValid && hostPpqPos > 0.01) midiClock->emitContinue(outQ, 0);
            else midiClock->emitStart(outQ, 0);
        }
    }
    else if (!hostPlaying && prevHostPlaying_)
    {
        stop(cbs, 0);
        if (midiClock) midiClock->emitStop(outQ, 0);
    }
    else if (hostPlaying && ppqValid && hostPpqPos >= 0.0)
    {
        const int hostTick = static_cast<int>(std::floor(hostPpqPos * static_cast<double>(ppq))) % totalTicks;
        int dist = std::abs(hostTick - currentTick_);
        if (dist > totalTicks / 2) dist = totalTicks - dist;
        if (dist > 4)
        {
            releaseAllActiveNotes(cbs, 0);
            currentTick_ = hostTick;
            sampleCursor_ = 0.0;
            barBoundaryPending_ = false;
        }
    }
    prevHostPlaying_ = hostPlaying;
}

} // namespace abdmcx
