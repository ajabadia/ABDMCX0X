#include "McxPatternSequencer.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace abdmcx
{

void McxPatternSequencer::setRecording(bool rec) noexcept
{
    const bool prev = recording_.exchange(rec, std::memory_order_relaxed);
    if (prev != rec)
        recSessionResetPending_.store(true, std::memory_order_release);
}

void McxPatternSequencer::setRecordQuantizeSteps(int stepsPerBar) noexcept
{
    const bool valid = (stepsPerBar == 8 || stepsPerBar == 12 || stepsPerBar == 16
                        || stepsPerBar == 24 || stepsPerBar == 32 || stepsPerBar == 64);
    recordQuantizeSteps_.store(valid ? stepsPerBar : 0, std::memory_order_relaxed);
}

void McxPatternSequencer::clearLiveRecState() noexcept
{
    if (!storage_) return;
    storage_->replaceClearedPartMask = 0ull;
    for (auto& partRec : storage_->liveRecNotes)
        for (auto& rn : partRec)
            rn = {};
}

void McxPatternSequencer::seekToTick(int tick, const McxSequencerCallbacks& cbs, std::int32_t sampleOffset) noexcept
{
    const int ppq = ppq_.load(std::memory_order_relaxed);
    const int totalTicks = std::max(1, bars_.load(std::memory_order_relaxed) * 4 * ppq);
    const int clamped = ((tick % totalTicks) + totalTicks) % totalTicks;
    releaseAllActiveNotes(cbs, sampleOffset);
    currentTick_ = clamped;
    sampleCursor_ = 0.0;
    countInRemainingTicks_ = 0;
    barBoundaryPending_ = false;
    publishTelemetry();
}

void McxPatternSequencer::seekByBars(int deltaBars, const McxSequencerCallbacks& cbs, std::int32_t sampleOffset) noexcept
{
    const int ppq = ppq_.load(std::memory_order_relaxed);
    const int ticksPerBar = std::max(1, 4 * ppq);
    const int bars = std::max(1, bars_.load(std::memory_order_relaxed));
    const int totalTicks = bars * ticksPerBar;
    const int curBar = std::clamp(currentTick_ / ticksPerBar, 0, bars - 1);
    const int nextBar = std::clamp(curBar + deltaBars, 0, bars - 1);
    const int nextTick = std::clamp(nextBar * ticksPerBar, 0, totalTicks - 1);
    seekToTick(nextTick, cbs, sampleOffset);
}

void McxPatternSequencer::returnToZero(const McxSequencerCallbacks& cbs, std::int32_t sampleOffset) noexcept
{
    seekToTick(0, cbs, sampleOffset);
}

void McxPatternSequencer::recordLiveNoteOn(int partIdx, std::uint8_t note, std::uint8_t vel) noexcept
{
    if (!storage_ || partIdx < 0 || partIdx >= kNumParts) return;
    if (!recording_.load(std::memory_order_relaxed) || countInRemainingTicks_ > 0) return;

    if (recSessionResetPending_.exchange(false, std::memory_order_acq_rel))
        clearLiveRecState();

    const auto u = static_cast<std::size_t>(partIdx);
    const std::uint8_t n = std::clamp<std::uint8_t>(note, 0, 127);
    const std::uint8_t v = std::clamp<std::uint8_t>(vel, 1, 127);

    if (recordMode_.load(std::memory_order_relaxed) == RecordMode::Replace)
    {
        const std::uint64_t bit = 1ull << partIdx;
        if ((storage_->replaceClearedPartMask & bit) == 0ull)
        {
            storage_->replaceClearedPartMask |= bit;
            storage_->staging[u].eventCount = 0;
            commitStagingPart(partIdx);
        }
    }

    const int ppq = ppq_.load(std::memory_order_relaxed);
    const int totalTicks = std::max(1, bars_.load(std::memory_order_relaxed) * 4 * ppq);
    const int qSteps = recordQuantizeSteps_.load(std::memory_order_relaxed);
    int tick = ((currentTick_ % totalTicks) + totalTicks) % totalTicks;
    if (qSteps > 0)
    {
        const int stepTicks = std::max(1, (ppq * 4) / qSteps);
        tick = static_cast<int>(std::llround(static_cast<double>(tick) / static_cast<double>(stepTicks))) * stepTicks;
        tick = ((tick % totalTicks) + totalTicks) % totalTicks;
    }

    if (running_)
    {
        storage_->liveRecNotes[u][n] = { tick, v };
        return;
    }

    const int stepTicks = (qSteps > 0) ? std::max(1, (ppq * 4) / qSteps) : std::max(1, (ppq * 4) / 16);
    auto& pat = storage_->staging[u];
    bool updated = false;
    for (int i = 0; i < pat.eventCount; ++i)
    {
        auto& ev = pat.events[static_cast<std::size_t>(i)];
        if (ev.active && ev.midiNote == n && ev.startTick == tick)
        {
            ev.velocity = v;
            ev.durationTicks = stepTicks;
            updated = true;
            break;
        }
    }
    if (!updated)
        (void)addStagingEvent(partIdx, tick, stepTicks, n, v, false);
    commitStagingPart(partIdx);
    currentTick_ = (tick + stepTicks) % totalTicks;
    recordedPatternRev_.fetch_add(1u, std::memory_order_release);
    publishTelemetry();
}

void McxPatternSequencer::recordLiveNoteOff(int partIdx, std::uint8_t note) noexcept
{
    if (!storage_ || partIdx < 0 || partIdx >= kNumParts) return;
    if (!recording_.load(std::memory_order_relaxed) || !running_) return;

    const auto u = static_cast<std::size_t>(partIdx);
    const std::uint8_t n = std::clamp<std::uint8_t>(note, 0, 127);
    auto& rec = storage_->liveRecNotes[u][n];
    if (rec.startTick < 0) return;

    const int startTick = rec.startTick;
    const std::uint8_t vel = rec.velocity;
    rec.startTick = -1;

    const int ppq = ppq_.load(std::memory_order_relaxed);
    const int totalTicks = std::max(1, bars_.load(std::memory_order_relaxed) * 4 * ppq);
    const int qSteps = recordQuantizeSteps_.load(std::memory_order_relaxed);
    const int minStep = (qSteps > 0) ? std::max(1, (ppq * 4) / qSteps) : std::max(1, (ppq * 4) / 16);

    const int cur = ((currentTick_ % totalTicks) + totalTicks) % totalTicks;
    int dur = cur - startTick;
    if (dur <= 0) dur += totalTicks;
    if (qSteps > 0)
        dur = static_cast<int>(std::llround(static_cast<double>(dur) / static_cast<double>(minStep))) * minStep;
    dur = std::clamp(dur, minStep, std::max(minStep, totalTicks - startTick));

    auto& pat = storage_->staging[u];
    bool updated = false;
    for (int i = 0; i < pat.eventCount; ++i)
    {
        auto& ev = pat.events[static_cast<std::size_t>(i)];
        if (ev.active && ev.midiNote == n && ev.startTick == startTick)
        {
            ev.velocity = vel;
            ev.durationTicks = dur;
            updated = true;
            break;
        }
    }
    if (!updated)
        (void)addStagingEvent(partIdx, startTick, dur, n, vel, false);
    commitStagingPart(partIdx);
    recordedPatternRev_.fetch_add(1u, std::memory_order_release);
}

int McxPatternSequencer::serializePartPatternJson(int partIdx, char* outBuf, int maxBytes) const noexcept
{
    if (!storage_ || !outBuf || maxBytes < 64 || partIdx < 0 || partIdx >= kNumParts) return 0;
    const auto u = static_cast<std::size_t>(partIdx);
    const std::uint8_t cur = storage_->activeSlot[u].load(std::memory_order_acquire) & 1u;
    const bool hasPending = storage_->dirty[u].load(std::memory_order_acquire);
    const auto slot = static_cast<std::size_t>(hasPending ? (1u - cur) : cur);
    const auto& pat = storage_->buffers[u][slot];
    const int bars = bars_.load(std::memory_order_relaxed);
    const int ppq = ppq_.load(std::memory_order_relaxed);

    int w = std::snprintf(outBuf, static_cast<std::size_t>(maxBytes),
                          "{\"part\":%d,\"bars\":%d,\"ppq\":%d,\"notes\":[", partIdx, bars, ppq);
    bool first = true;
    for (int i = 0; i < pat.eventCount; ++i)
    {
        const auto& ev = pat.events[static_cast<std::size_t>(i)];
        if (!ev.active) continue;
        const int n = std::snprintf(
            outBuf + w, static_cast<std::size_t>(std::max(0, maxBytes - w)),
            "%s{\"midiNote\":%u,\"startTick\":%d,\"durationTicks\":%d,\"velocity\":%u,\"slide\":%d}",
            first ? "" : ",",
            static_cast<unsigned>(ev.midiNote), ev.startTick, ev.durationTicks,
            static_cast<unsigned>(ev.velocity), ev.slide ? 1 : 0);
        if (n <= 0 || w + n + 4 >= maxBytes) break;
        w += n;
        first = false;
    }
    const int endN = std::snprintf(outBuf + w, static_cast<std::size_t>(std::max(0, maxBytes - w)), "]}");
    return (endN > 0) ? (w + endN) : w;
}

} // namespace abdmcx
