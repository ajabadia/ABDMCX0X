#pragma once

#include "../MIDI/McxMidiClockEmitter.h"
#include "../MIDI/McxMidiOutQueue.h"
#include "SynthCore/GrooveShuffleEngine.h"
#include "SynthCore/PatternSequencerEngine.h"

#include <array>
#include <atomic>
#include <cstdint>
#include <memory>

namespace abdmcx
{

struct McxSequencerCallbacks
{
    void* ctx { nullptr };
    void (*onNoteOn)(void* ctx, int part, std::uint8_t note, std::uint8_t vel, bool slide, std::int32_t sampleOffset) noexcept { nullptr };
    void (*onNoteOff)(void* ctx, int part, std::uint8_t note, std::int32_t sampleOffset) noexcept { nullptr };
    void (*onMotion)(void* ctx, int part, int paramId, float value, std::int32_t sampleOffset) noexcept { nullptr };
    bool (*onBarBoundary)(void* ctx, std::int32_t sampleOffset) noexcept { nullptr };
};

/**
 * @brief RT-safe, double-buffered C++20 PPQ pattern sequencer for ABDMCX0X.
 * Wraps ABDShared PatternSequencerEngine pattern data + GrooveShuffleEngine timing,
 * storing large buffers in single constructor heap allocation (stack-safe, zero RT allocs).
 */
class McxPatternSequencer
{
public:
    static constexpr int kNumParts = 64;
    static constexpr int kMaxEventsPerPart = 256;
    static constexpr int kMaxMotionPoints = 256;
    static constexpr int kDefaultPpq = 96;

    enum class RecordMode : std::uint8_t
    {
        Overdub = 0,
        Replace = 1
    };

    using PatternEvent = abd::synth::PatternSequencerEngine::PatternEvent;
    using MotionPoint  = abd::synth::PatternSequencerEngine::MotionPoint;
    using GrooveEngine = abd::synth::GrooveShuffleEngine;

    struct MotionLane
    {
        int paramId { -1 };
        int count { 0 };
        std::array<MotionPoint, kMaxMotionPoints> points {};
    };

    struct PartPattern
    {
        int eventCount { 0 };
        std::array<PatternEvent, kMaxEventsPerPart> events {};
        std::array<MotionLane, 4> motionLanes {};
    };

    McxPatternSequencer() noexcept;
    ~McxPatternSequencer() = default;
    McxPatternSequencer(const McxPatternSequencer&) = delete;
    McxPatternSequencer& operator=(const McxPatternSequencer&) = delete;

    void prepare(double sampleRate) noexcept;
    void reset() noexcept;

    // UI/Message thread lock-free pattern staging & swap
    void clearPart(int partIdx) noexcept;
    void replacePartPattern(int partIdx, const PartPattern& pattern) noexcept;
    void clearStagingPart(int partIdx) noexcept;
    bool addStagingEvent(int partIdx, int startTick, int durationTicks,
                         std::uint8_t note, std::uint8_t velocity, bool slide) noexcept;
    bool addStagingMotion(int partIdx, int laneIdx, int paramId, int tick, float value) noexcept;
    void commitStagingPart(int partIdx) noexcept;
    void setStep(int partIdx, int step0to15, bool active,
                 std::uint8_t velocity, bool slide, std::uint8_t note) noexcept;

    // Transport, tempo & groove controls
    void setBpm(double bpm) noexcept;
    [[nodiscard]] double getBpm() const noexcept { return bpm_; }
    void setBars(int bars) noexcept;
    [[nodiscard]] int getBars() const noexcept { return bars_.load(std::memory_order_relaxed); }
    void setPpq(int ppq) noexcept;
    [[nodiscard]] int getPpq() const noexcept { return ppq_.load(std::memory_order_relaxed); }
    void setRecording(bool rec) noexcept;
    [[nodiscard]] bool isRecording() const noexcept { return recording_.load(std::memory_order_relaxed); }
    void setRecordMode(RecordMode mode) noexcept { recordMode_.store(mode, std::memory_order_relaxed); }
    [[nodiscard]] RecordMode getRecordMode() const noexcept { return recordMode_.load(std::memory_order_relaxed); }
    void setCountInBars(int bars0to2) noexcept { countInBars_.store(std::clamp(bars0to2, 0, 2), std::memory_order_relaxed); }
    [[nodiscard]] int getCountInBars() const noexcept { return countInBars_.load(std::memory_order_relaxed); }
    void setRecordQuantizeSteps(int stepsPerBar) noexcept;
    [[nodiscard]] int getRecordQuantizeSteps() const noexcept { return recordQuantizeSteps_.load(std::memory_order_relaxed); }
    void setLoopEnabled(bool loop) noexcept { loopEnabled_.store(loop, std::memory_order_relaxed); }
    [[nodiscard]] bool isLoopEnabled() const noexcept { return loopEnabled_.load(std::memory_order_relaxed); }

    // Musical swing 0.50..0.75 maps cleanly to GrooveShuffleEngine 0.0..1.0 amount
    void setPartSwing50to75(int partIdx, float swing50to75) noexcept;
    void setPartGrooveMusical(int partIdx, GrooveEngine::Mode mode, GrooveEngine::Algorithm algo,
                              GrooveEngine::Resolution res, float swing50to75) noexcept;
    [[nodiscard]] const GrooveEngine& groove() const noexcept { return groove_; }

    void start(bool resetToZero = false) noexcept;
    void stop(const McxSequencerCallbacks& cbs, std::int32_t sampleOffset = 0) noexcept;
    void pause() noexcept;
    void seekToTick(int tick, const McxSequencerCallbacks& cbs, std::int32_t sampleOffset = 0) noexcept;
    void seekByBars(int deltaBars, const McxSequencerCallbacks& cbs, std::int32_t sampleOffset = 0) noexcept;
    void returnToZero(const McxSequencerCallbacks& cbs, std::int32_t sampleOffset = 0) noexcept;

    void recordLiveNoteOn(int partIdx, std::uint8_t note, std::uint8_t vel) noexcept;
    void recordLiveNoteOff(int partIdx, std::uint8_t note) noexcept;
    int serializePartPatternJson(int partIdx, char* outBuf, int maxBytes) const noexcept;

    void syncFromHostTransport(bool hostPlaying,
                               double hostBpm,
                               double hostPpqPos,
                               bool ppqValid,
                               const McxSequencerCallbacks& cbs,
                               McxMidiClockEmitter* midiClock,
                               McxMidiOutQueue<1024>* outQ) noexcept;

    void processBlock(int numSamples, const McxSequencerCallbacks& cbs, std::int32_t baseSampleOffset = 0) noexcept;

    // Thread-safe telemetry accessors for UI mirror
    [[nodiscard]] bool isRunning() const noexcept { return publishedRunning_.load(std::memory_order_acquire); }
    [[nodiscard]] bool isPaused() const noexcept { return publishedPaused_.load(std::memory_order_acquire); }
    [[nodiscard]] bool isCountingIn() const noexcept { return publishedCountInTicks_.load(std::memory_order_acquire) > 0; }
    [[nodiscard]] int getCountInRemainingTicks() const noexcept { return publishedCountInTicks_.load(std::memory_order_acquire); }
    [[nodiscard]] std::uint32_t getRecordedPatternRev() const noexcept { return recordedPatternRev_.load(std::memory_order_acquire); }
    [[nodiscard]] int getCurrentTick() const noexcept { return publishedTick_.load(std::memory_order_acquire); }
    [[nodiscard]] int getCurrentStep() const noexcept { return publishedStep_.load(std::memory_order_acquire); }
    [[nodiscard]] int getTotalTicks() const noexcept { return publishedTotalTicks_.load(std::memory_order_acquire); }

private:
    struct LiveRecNote
    {
        int startTick { -1 };
        std::uint8_t velocity { 100 };
    };

    struct Storage
    {
        std::array<std::array<PartPattern, 2>, kNumParts> buffers {};
        std::array<PartPattern, kNumParts> staging {};
        std::array<std::atomic<std::uint8_t>, kNumParts> activeSlot {};
        std::array<std::atomic<bool>, kNumParts> dirty {};
        std::array<std::array<std::int16_t, 128>, kNumParts> activeRemainingTicks {};
        std::array<std::uint8_t, kNumParts> activeNoteCount {};
        std::array<std::array<LiveRecNote, 128>, kNumParts> liveRecNotes {};
        std::uint64_t replaceClearedPartMask { 0ull };
    };

    void updateTiming() noexcept;
    void publishTelemetry() noexcept;
    void clearLiveRecState() noexcept;
    void releasePartActiveNotes(int partIdx, const McxSequencerCallbacks& cbs, std::int32_t sampleOffset) noexcept;
    void releaseAllActiveNotes(const McxSequencerCallbacks& cbs, std::int32_t sampleOffset) noexcept;
    void swapDirtyBuffers(const McxSequencerCallbacks& cbs, std::int32_t sampleOffset = 0) noexcept;
    void stepSingleTick(const McxSequencerCallbacks& cbs, std::int32_t sampleOffset) noexcept;

    std::unique_ptr<Storage> storage_;
    GrooveEngine groove_ {};

    double sampleRate_ { 44100.0 };
    double bpm_ { 120.0 };
    double samplesPerTick_ { 229.6875 };
    double sampleCursor_ { 0.0 };
    bool running_ { false };
    bool paused_ { false };
    bool prevHostPlaying_ { false };
    bool barBoundaryPending_ { false };
    int currentTick_ { 0 };
    int countInRemainingTicks_ { 0 };

    std::atomic<int> bars_ { 1 };
    std::atomic<int> ppq_ { kDefaultPpq };
    std::atomic<bool> recording_ { false };
    std::atomic<bool> recSessionResetPending_ { false };
    std::atomic<RecordMode> recordMode_ { RecordMode::Overdub };
    std::atomic<int> countInBars_ { 0 };
    std::atomic<int> recordQuantizeSteps_ { 16 };
    std::atomic<bool> loopEnabled_ { true };
    std::atomic<bool> publishedRunning_ { false };
    std::atomic<bool> publishedPaused_ { false };
    std::atomic<int> publishedCountInTicks_ { 0 };
    std::atomic<int> publishedTick_ { 0 };
    std::atomic<int> publishedStep_ { 0 };
    std::atomic<int> publishedTotalTicks_ { 384 };
    std::atomic<std::uint32_t> recordedPatternRev_ { 0u };
};

} // namespace abdmcx
