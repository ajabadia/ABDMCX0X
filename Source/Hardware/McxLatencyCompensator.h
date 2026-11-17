#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>

namespace abdmcx
{

/**
 * @brief Zero-allocation stereo latency compensation delay line for A/B monitoring.
 * Aligns internal DSP playback with external hardware MIDI transmission and response latency.
 * Supports up to 100ms delay at 192 kHz (19,200 samples capacity).
 */
class McxLatencyCompensator
{
public:
    static constexpr std::size_t kMaxDelaySamples = 24576; // >100ms @ 192kHz

    McxLatencyCompensator() noexcept { reset(); }

    void reset() noexcept
    {
        bufferL_.fill(0.0f);
        bufferR_.fill(0.0f);
        writeIndex_ = 0;
        sampleRate_ = 44100.0;
        delayMs_ = 0.0f;
        delaySamples_ = 0;
    }

    void prepare(double sampleRate) noexcept
    {
        sampleRate_ = (sampleRate > 1000.0) ? sampleRate : 44100.0;
        updateDelaySamples();
    }

    void setLatencyMs(float ms) noexcept
    {
        delayMs_ = std::clamp(ms, 0.0f, 100.0f);
        updateDelaySamples();
    }

    [[nodiscard]] float getLatencyMs() const noexcept { return delayMs_; }
    [[nodiscard]] std::size_t getDelaySamples() const noexcept { return delaySamples_; }

    void process(float* left, float* right, int numSamples) noexcept
    {
        if (numSamples <= 0 || !left || !right)
            return;

        if (delaySamples_ == 0)
            return; // Zero latency bypass

        const std::size_t d = delaySamples_;
        const std::size_t cap = kMaxDelaySamples;

        for (int i = 0; i < numSamples; ++i)
        {
            const float inL = left[i];
            const float inR = right[i];

            // Read delayed sample
            const std::size_t readIndex = (writeIndex_ + cap - d) % cap;
            left[i] = bufferL_[readIndex];
            right[i] = bufferR_[readIndex];

            // Write current sample into ring
            bufferL_[writeIndex_] = inL;
            bufferR_[writeIndex_] = inR;

            writeIndex_ = (writeIndex_ + 1) % cap;
        }
    }

private:
    void updateDelaySamples() noexcept
    {
        const double samples = (static_cast<double>(delayMs_) * 0.001) * sampleRate_;
        const std::size_t ds = static_cast<std::size_t>(std::round(samples));
        delaySamples_ = std::min(ds, kMaxDelaySamples - 1);
    }

    std::array<float, kMaxDelaySamples> bufferL_ {};
    std::array<float, kMaxDelaySamples> bufferR_ {};
    std::size_t writeIndex_ { 0 };
    std::size_t delaySamples_ { 0 };
    double sampleRate_ { 44100.0 };
    float delayMs_ { 0.0f };
};

} // namespace abdmcx
