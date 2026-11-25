#pragma once

#include "../DSP/Core/McxEngine.h"
#include "../Sequencer/McxSongAndScenes.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <string>

namespace abdmcx
{

struct McxTelemetrySnapshot
{
    float peakL{0.0f};
    float peakR{0.0f};
    float peakSendA{0.0f};
    float peakSendB{0.0f};
    float peakSendC{0.0f};
    float peakSendD{0.0f};
    float limiterGrDb{0.0f};
    std::array<bool, 4> sendBusMutes{false, false, false, false};
    std::string sendNameA;
    std::string sendNameB;
    std::string sendNameC;
    std::string sendNameD;
    int activeVoices{0};
    int focusedPart{0};
    double sampleRate{48000.0};
    float lfoPhase{0.0f};
    float lfo2Phase{0.0f};
    bool seqPlaying{false};
    bool seqPaused{false};
    int seqCountInTicks{0};
    std::uint32_t seqRecRev{0u};
    int seqTick{0};
    int seqStep{0};
    int seqTotalTicks{384};
    float bpm{120.0f};
    int activeScene{0};
    int queuedScene{-1};
    bool songMode{false};
    bool songLoop{true};
    int songBlockIdx{0};
    int songBarInBlock{0};
    int songBlockCount{0};
    std::uint32_t sceneApplySeq{0};
    std::uint64_t appliedMuteMask{0ull};
    int appliedTranspose{0};
    std::array<float, 128> samplesL{};
    std::array<float, McxEngine::kNumParts> partPeaks{};
    std::array<float, McxEngine::kNumParts> partMidiPeaks{};
    std::array<float, 8> rackPeakIn{};
    std::array<float, 8> rackPeakOut{};
    std::array<bool, 8> rackClipIn{};
    std::array<bool, 8> rackClipOut{};
};

inline McxTelemetrySnapshot captureEngineTelemetry(
    const McxEngine& engine,
    int focusedPart,
    double sampleRate,
    float peakL,
    float peakR,
    int activeVoices,
    const std::array<float, 128>& scopeBuf,
    const std::array<std::atomic<float>, McxEngine::kNumParts>& lastPartPeaks,
    const std::array<std::atomic<float>, McxEngine::kNumParts>& lastPartMidiPeaks) noexcept
{
    McxTelemetrySnapshot snap;
    snap.peakL = peakL;
    snap.peakR = peakR;
    snap.activeVoices = activeVoices;
    snap.focusedPart = focusedPart;
    snap.sampleRate = sampleRate;
    snap.samplesL = scopeBuf;

    const auto& fx = engine.getOutputAndFx();
    const auto t = fx.getTelemetry();
    snap.peakSendA = t.peakSendA; snap.peakSendB = t.peakSendB;
    snap.peakSendC = t.peakSendC; snap.peakSendD = t.peakSendD;
    snap.limiterGrDb = t.limiterGainReductionDb;
    for (int b = 0; b < 4; ++b) snap.sendBusMutes[static_cast<std::size_t>(b)] = fx.isSendBusMuted(b);
    const auto l = fx.getActiveSendLabels();
    snap.sendNameA = l.sendA; snap.sendNameB = l.sendB;
    snap.sendNameC = l.sendC; snap.sendNameD = l.sendD;
    snap.lfoPhase = engine.getFocusedLfoValue(0);
    snap.lfo2Phase = engine.getFocusedLfoValue(1);
    snap.seqPlaying = engine.isSequencerRunning();
    snap.seqPaused = engine.isSequencerPaused();
    snap.seqCountInTicks = engine.getSequencerCountInTicks();
    snap.seqRecRev = engine.getSequencerRecordedRev();
    snap.seqTick = engine.getSequencerTick();
    snap.seqStep = engine.getSequencerStep();
    snap.seqTotalTicks = engine.getSequencerTotalTicks();
    snap.bpm = engine.getMasterTempoBpm();
    const auto song = engine.songAndScenes().readTelemetry();
    snap.activeScene = song.activeScene; snap.queuedScene = song.queuedScene; snap.songMode = song.songMode;
    snap.songLoop = song.songLoop; snap.songBlockIdx = song.songBlockIdx; snap.songBarInBlock = song.songBarInBlock;
    snap.songBlockCount = song.songBlockCount; snap.sceneApplySeq = song.sceneApplySeq;
    snap.appliedMuteMask = song.appliedMuteMask; snap.appliedTranspose = song.appliedTranspose;
    for (std::size_t p = 0; p < static_cast<std::size_t>(McxEngine::kNumParts); ++p)
    {
        snap.partPeaks[p] = lastPartPeaks[p].load(std::memory_order_relaxed);
        snap.partMidiPeaks[p] = lastPartMidiPeaks[p].load(std::memory_order_relaxed);
    }
    const auto& chassis = fx.getChassis();
    for (int i = 0; i < 8; ++i)
    {
        const auto rt = chassis.getSlotTelemetry(i);
        snap.rackPeakIn[static_cast<std::size_t>(i)] = std::max(rt.peakInL, rt.peakInR);
        snap.rackPeakOut[static_cast<std::size_t>(i)] = std::max(rt.peakOutL, rt.peakOutR);
        snap.rackClipIn[static_cast<std::size_t>(i)] = rt.isClipIn;
        snap.rackClipOut[static_cast<std::size_t>(i)] = rt.isClipOut;
    }
    return snap;
}

} // namespace abdmcx
