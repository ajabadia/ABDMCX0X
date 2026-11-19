#pragma once

#include "../DSP/Core/McxTypes.h"
#include "McxMidiOutQueue.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace abdmcx
{

/**
 * @brief Sample-accurate 24 PPQ MIDI Clock emitter (0xFA Start, 0xFB Continue, 0xFC Stop, 0xF8 Clock).
 * Priority 0 ensures clock/realtime events bypass modulation throttling. JUCE-free, zero-alloc.
 */
class McxMidiClockEmitter
{
public:
    static constexpr int kPpq = 24;

    void prepare(double sampleRate) noexcept
    {
        sampleRate_ = (sampleRate > 1000.0) ? sampleRate : 44100.0;
        recalcInterval();
    }

    void reset() noexcept
    {
        running_ = false;
        sampleCountdown_ = 0.0;
    }

    void setBpm(double bpm) noexcept
    {
        const double clamped = std::clamp(bpm, 20.0, 300.0);
        if (std::abs(clamped - bpm_) > 1e-4)
        {
            bpm_ = clamped;
            recalcInterval();
        }
    }

    [[nodiscard]] double getBpm() const noexcept { return bpm_; }
    void setEnabled(bool enabled) noexcept { enabled_ = enabled; }
    [[nodiscard]] bool isEnabled() const noexcept { return enabled_; }
    void setPortIndex(std::uint8_t portIndex) noexcept { portIndex_ = portIndex; }
    [[nodiscard]] std::uint8_t getPortIndex() const noexcept { return portIndex_; }
    [[nodiscard]] bool isRunning() const noexcept { return running_; }

    void emitStart(McxMidiOutQueue<1024>* queue, std::int32_t sampleOffset = 0) noexcept
    {
        running_ = true;
        sampleCountdown_ = 0.0;
        if (enabled_ && queue != nullptr)
            queue->push(makeRealtimeMessage(0xFA, sampleOffset));
    }

    void emitContinue(McxMidiOutQueue<1024>* queue, std::int32_t sampleOffset = 0) noexcept
    {
        running_ = true;
        if (enabled_ && queue != nullptr)
            queue->push(makeRealtimeMessage(0xFB, sampleOffset));
    }

    void emitStop(McxMidiOutQueue<1024>* queue, std::int32_t sampleOffset = 0) noexcept
    {
        running_ = false;
        sampleCountdown_ = 0.0;
        if (enabled_ && queue != nullptr)
            queue->push(makeRealtimeMessage(0xFC, sampleOffset));
    }

    void processBlock(int numSamples, McxMidiOutQueue<1024>* queue, std::int32_t baseSampleOffset = 0) noexcept
    {
        if (!enabled_ || !running_ || queue == nullptr || numSamples <= 0)
            return;

        const double blockSamples = static_cast<double>(numSamples);
        while (sampleCountdown_ < blockSamples)
        {
            const std::int32_t offset = std::clamp(
                static_cast<std::int32_t>(std::floor(sampleCountdown_)),
                0,
                std::max<std::int32_t>(0, numSamples - 1));
            queue->push(makeRealtimeMessage(0xF8, baseSampleOffset + offset));
            sampleCountdown_ += samplesPerPulse_;
        }
        sampleCountdown_ -= blockSamples;
    }

private:
    [[nodiscard]] McxMidiOutMessage makeRealtimeMessage(std::uint8_t statusByte, std::int32_t sampleOffset) const noexcept
    {
        McxMidiOutMessage msg {};
        msg.portIndex = portIndex_;
        msg.priority = 0; // Clock / Realtime highest priority
        msg.length = 1;
        msg.bytes[0] = statusByte;
        msg.sampleOffset = std::max<std::int32_t>(0, sampleOffset);
        return msg;
    }

    void recalcInterval() noexcept
    {
        const double pulsesPerSecond = (bpm_ / 60.0) * static_cast<double>(kPpq);
        samplesPerPulse_ = std::max(1.0, sampleRate_ / pulsesPerSecond);
    }

    double sampleRate_ { 44100.0 };
    double bpm_ { 120.0 };
    double samplesPerPulse_ { 918.75 };
    double sampleCountdown_ { 0.0 };
    bool running_ { false };
    bool enabled_ { true };
    std::uint8_t portIndex_ { 0 };
};

} // namespace abdmcx
