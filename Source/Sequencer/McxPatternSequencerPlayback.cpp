#include "McxPatternSequencer.h"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>

namespace abdmcx
{

namespace
{
[[nodiscard]] float mapSwingToGrooveAmount(float swing50to75) noexcept
{
    return std::clamp((swing50to75 - 0.50f) * 4.0f, 0.0f, 1.0f);
}
} // namespace

void McxPatternSequencer::setPartSwing50to75(int partIdx, float swing50to75) noexcept
{
    const float amt = mapSwingToGrooveAmount(swing50to75);
    if (partIdx < 0)
    {
        auto s = groove_.getMasterGroove();
        s.mode = GrooveEngine::Mode::Custom;
        s.amount = amt;
        groove_.setMasterGroove(s);
    }
    else
    {
        auto s = groove_.getPartGroove(partIdx);
        s.mode = GrooveEngine::Mode::Custom;
        s.amount = amt;
        groove_.setPartGroove(partIdx, s);
    }
}

void McxPatternSequencer::setPartGrooveMusical(int partIdx, GrooveEngine::Mode mode, GrooveEngine::Algorithm algo,
                                               GrooveEngine::Resolution res, float swing50to75) noexcept
{
    const GrooveEngine::GrooveSettings s { mode, algo, res, mapSwingToGrooveAmount(swing50to75) };
    if (partIdx < 0) groove_.setMasterGroove(s);
    else groove_.setPartGroove(partIdx, s);
}

void McxPatternSequencer::processBlock(int numSamples, const McxSequencerCallbacks& cbs, std::int32_t baseSampleOffset) noexcept
{
    swapDirtyBuffers(cbs, baseSampleOffset);
    if (!running_ || numSamples <= 0) return;

    const double blockSamples = static_cast<double>(numSamples);
    while (running_ && sampleCursor_ < blockSamples)
    {
        const std::int32_t offset = std::clamp(
            static_cast<std::int32_t>(std::floor(sampleCursor_)),
            0, std::max<std::int32_t>(0, numSamples - 1));
        stepSingleTick(cbs, baseSampleOffset + offset);
        if (!running_)
            break;
        sampleCursor_ += samplesPerTick_;
    }
    if (running_)
        sampleCursor_ -= blockSamples;
    publishTelemetry();
}

void McxPatternSequencer::updateTiming() noexcept
{
    const int ppq = ppq_.load(std::memory_order_relaxed);
    const double secondsPerTick = (60.0 / bpm_) / static_cast<double>(ppq);
    samplesPerTick_ = std::max(1.0, secondsPerTick * sampleRate_);
    publishedTotalTicks_.store(bars_.load(std::memory_order_relaxed) * 4 * ppq, std::memory_order_release);
}

void McxPatternSequencer::publishTelemetry() noexcept
{
    const int bars = bars_.load(std::memory_order_relaxed);
    const int ppq = ppq_.load(std::memory_order_relaxed);
    const int total = std::max(1, bars * 4 * ppq);
    const int ticksPerStep = std::max(1, (ppq * 4) / 16);
    publishedTotalTicks_.store(total, std::memory_order_release);
    publishedTick_.store(currentTick_ % total, std::memory_order_release);
    publishedStep_.store((currentTick_ / ticksPerStep) % (bars * 16), std::memory_order_release);
    publishedRunning_.store(running_, std::memory_order_release);
    publishedPaused_.store(paused_, std::memory_order_release);
    publishedCountInTicks_.store(countInRemainingTicks_, std::memory_order_release);
}

void McxPatternSequencer::releasePartActiveNotes(int partIdx, const McxSequencerCallbacks& cbs, std::int32_t sampleOffset) noexcept
{
    const auto u = static_cast<std::size_t>(partIdx);
    if (storage_->activeNoteCount[u] == 0)
        return;
    auto& rem = storage_->activeRemainingTicks[u];
    for (int n = 0; n < 128; ++n)
    {
        if (rem[static_cast<std::size_t>(n)] >= 0)
        {
            if (cbs.onNoteOff) cbs.onNoteOff(cbs.ctx, partIdx, static_cast<std::uint8_t>(n), sampleOffset);
            rem[static_cast<std::size_t>(n)] = -1;
        }
    }
    storage_->activeNoteCount[u] = 0;
}

void McxPatternSequencer::releaseAllActiveNotes(const McxSequencerCallbacks& cbs, std::int32_t sampleOffset) noexcept
{
    for (int p = 0; p < kNumParts; ++p)
        releasePartActiveNotes(p, cbs, sampleOffset);
}

void McxPatternSequencer::swapDirtyBuffers(const McxSequencerCallbacks& cbs, std::int32_t sampleOffset) noexcept
{
    for (int p = 0; p < kNumParts; ++p)
    {
        const auto u = static_cast<std::size_t>(p);
        if (storage_->dirty[u].exchange(false, std::memory_order_acquire))
        {
            releasePartActiveNotes(p, cbs, sampleOffset);
            const std::uint8_t cur = storage_->activeSlot[u].load(std::memory_order_relaxed);
            storage_->activeSlot[u].store(static_cast<std::uint8_t>(1u - (cur & 1u)), std::memory_order_release);
        }
    }
}

void McxPatternSequencer::stepSingleTick(const McxSequencerCallbacks& cbs, std::int32_t sampleOffset) noexcept
{
    if (recSessionResetPending_.exchange(false, std::memory_order_acq_rel))
        clearLiveRecState();
    if (countInRemainingTicks_ > 0)
    {
        --countInRemainingTicks_;
        publishedCountInTicks_.store(countInRemainingTicks_, std::memory_order_release);
        return;
    }
    const int ppq = ppq_.load(std::memory_order_relaxed);
    int totalTicks = std::max(1, bars_.load(std::memory_order_relaxed) * 4 * ppq);
    const int tick = currentTick_ % totalTicks;

    for (int p = 0; p < kNumParts; ++p)
    {
        const auto u = static_cast<std::size_t>(p);
        if (storage_->activeNoteCount[u] == 0)
            continue;
        auto& rem = storage_->activeRemainingTicks[u];
        for (int n = 0; n < 128; ++n)
        {
            if (rem[static_cast<std::size_t>(n)] > 0 && --rem[static_cast<std::size_t>(n)] == 0)
            {
                if (cbs.onNoteOff) cbs.onNoteOff(cbs.ctx, p, static_cast<std::uint8_t>(n), sampleOffset);
                rem[static_cast<std::size_t>(n)] = -1;
                if (storage_->activeNoteCount[u] > 0) --storage_->activeNoteCount[u];
            }
        }
    }

    if (barBoundaryPending_)
    {
        barBoundaryPending_ = false;
        if (cbs.onBarBoundary && !cbs.onBarBoundary(cbs.ctx, sampleOffset))
        {
            stop(cbs, sampleOffset);
            return;
        }
        totalTicks = std::max(1, bars_.load(std::memory_order_relaxed) * 4 * ppq);
    }

    for (int p = 0; p < kNumParts; ++p)
    {
        const auto u = static_cast<std::size_t>(p);
        const auto slot = static_cast<std::size_t>(storage_->activeSlot[u].load(std::memory_order_acquire) & 1u);
        const auto& pat = storage_->buffers[u][slot];
        const bool hasMotion = (pat.motionLanes[0].paramId >= 0 && pat.motionLanes[0].count > 0)
                            || (pat.motionLanes[1].paramId >= 0 && pat.motionLanes[1].count > 0)
                            || (pat.motionLanes[2].paramId >= 0 && pat.motionLanes[2].count > 0)
                            || (pat.motionLanes[3].paramId >= 0 && pat.motionLanes[3].count > 0);
        if (pat.eventCount <= 0 && !hasMotion)
            continue;

        auto& rem = storage_->activeRemainingTicks[u];
        for (int i = 0; i < pat.eventCount; ++i)
        {
            const auto& ev = pat.events[static_cast<std::size_t>(i)];
            if (!ev.active) continue;
            const int swung = groove_.applyGroove(ev.startTick, ppq, p) % totalTicks;
            if (swung == tick)
            {
                const bool wasActive = (rem[ev.midiNote] >= 0);
                if (wasActive && cbs.onNoteOff)
                    cbs.onNoteOff(cbs.ctx, p, ev.midiNote, sampleOffset);
                if (cbs.onNoteOn)
                    cbs.onNoteOn(cbs.ctx, p, ev.midiNote, ev.velocity, ev.slide, sampleOffset);
                rem[ev.midiNote] = static_cast<std::int16_t>(std::clamp(ev.durationTicks, 1, 32767));
                if (!wasActive && storage_->activeNoteCount[u] < 128)
                    ++storage_->activeNoteCount[u];
            }
        }

        for (int l = 0; l < 4; ++l)
        {
            const auto& lane = pat.motionLanes[static_cast<std::size_t>(l)];
            if (lane.paramId < 0 || lane.count <= 0) continue;
            for (int m = 0; m < lane.count; ++m)
            {
                const auto& pt = lane.points[static_cast<std::size_t>(m)];
                if ((pt.tick % totalTicks) == tick && cbs.onMotion)
                {
                    cbs.onMotion(cbs.ctx, p, lane.paramId, pt.value, sampleOffset);
                    break;
                }
            }
        }
    }

    if (!loopEnabled_.load(std::memory_order_relaxed) && (tick + 1) >= totalTicks)
    {
        stop(cbs, sampleOffset);
        return;
    }

    currentTick_ = (tick + 1) % totalTicks;
    const int ticksPerBar = std::max(1, 4 * ppq);
    if ((currentTick_ % ticksPerBar) == 0)
        barBoundaryPending_ = true;
}

} // namespace abdmcx
