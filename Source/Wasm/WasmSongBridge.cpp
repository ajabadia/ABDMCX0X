#include "WasmBridge.h"
#include "WasmInternal.h"
#include "../Core/McxWavWriter.h"
#include "../Sequencer/McxPatternSequencer.h"
#include "../Sequencer/McxSongAndScenes.h"
#include "../Sequencer/McxSongJsonCodec.h"

#include <algorithm>
#include <string>

extern "C"
{

void triggerScene(int sceneIdx, int immediate)
{
    abdmcx::wasm_internal::engine().triggerScene(sceneIdx, immediate != 0);
}

void captureScene(int sceneIdx)
{
    abdmcx::wasm_internal::engine().captureCurrentToScene(sceneIdx);
}

void updateSceneSlot(int sceneIdx, int muteMask, int transposeSemitones, const char* name)
{
    const auto mask = static_cast<std::uint64_t>(std::clamp(muteMask, 0, 65535));
    abdmcx::wasm_internal::engine().songAndScenes().setScene(sceneIdx, mask, transposeSemitones, name);
}

void updateSceneSlot64(int sceneIdx, int m0, int m1, int m2, int m3, int transposeSemitones, const char* name)
{
    const std::uint64_t mask = static_cast<std::uint64_t>(std::clamp(m0, 0, 65535))
                             | (static_cast<std::uint64_t>(std::clamp(m1, 0, 65535)) << 16)
                             | (static_cast<std::uint64_t>(std::clamp(m2, 0, 65535)) << 32)
                             | (static_cast<std::uint64_t>(std::clamp(m3, 0, 65535)) << 48);
    abdmcx::wasm_internal::engine().songAndScenes().setScene(sceneIdx, mask, transposeSemitones, name);
}

void setSongModeEnabled(int enabled)
{
    abdmcx::wasm_internal::engine().setSongModeEnabled(enabled != 0);
}

void setSongLoopEnabled(int loop)
{
    abdmcx::wasm_internal::engine().setSongLoopEnabled(loop != 0);
}

void jumpSongBlock(int blockIdx, int immediate)
{
    abdmcx::wasm_internal::engine().jumpSongBlock(blockIdx, immediate != 0);
}

void clearSongBlocks()
{
    abdmcx::wasm_internal::engine().songAndScenes().clearStagingBlocks();
}

void addSongBlock(int sceneIdx, int bars, int transposeOffset)
{
    (void)abdmcx::wasm_internal::engine().songAndScenes().addStagingBlock(sceneIdx, bars, transposeOffset);
}

void commitSongBlocks(int loopEnabled)
{
    abdmcx::wasm_internal::engine().songAndScenes().commitStagingBlocks(loopEnabled != 0);
}

void getSongSceneTelemetry(int* out14Ints)
{
    if (out14Ints == nullptr) return;
    const auto st = abdmcx::wasm_internal::engine().songAndScenes().readTelemetry();
    out14Ints[0] = st.activeScene;
    out14Ints[1] = st.queuedScene;
    out14Ints[2] = st.songMode ? 1 : 0;
    out14Ints[3] = st.songLoop ? 1 : 0;
    out14Ints[4] = st.songBlockIdx;
    out14Ints[5] = st.songBarInBlock;
    out14Ints[6] = st.songBlockCount;
    out14Ints[7] = static_cast<int>(st.sceneApplySeq);
    out14Ints[8] = static_cast<int>(st.appliedMuteMask & 0xFFFFull);
    out14Ints[9] = st.appliedTranspose;
    out14Ints[10] = static_cast<int>((st.appliedMuteMask >> 0) & 0xFFFFull);
    out14Ints[11] = static_cast<int>((st.appliedMuteMask >> 16) & 0xFFFFull);
    out14Ints[12] = static_cast<int>((st.appliedMuteMask >> 32) & 0xFFFFull);
    out14Ints[13] = static_cast<int>((st.appliedMuteMask >> 48) & 0xFFFFull);
}

const char* getSongScenesStateJson()
{
    static std::string sSongJson;
    sSongJson = abdmcx::serializeSongAndScenesJson(abdmcx::wasm_internal::engine().songAndScenes());
    return sSongJson.c_str();
}

void setTransportPlaying(int playing, int resetOnStop)
{
    abdmcx::wasm_internal::engine().setSequencerPlaying(playing != 0, resetOnStop != 0);
}

void setSequencerBars(int bars)
{
    abdmcx::wasm_internal::engine().sequencer().setBars(bars);
}

void setPartGroove(int partIdx, int mode, int algorithm, int resolution, float swing50to75)
{
    using GE = abdmcx::McxPatternSequencer::GrooveEngine;
    abdmcx::wasm_internal::engine().sequencer().setPartGrooveMusical(
        partIdx,
        static_cast<GE::Mode>(std::clamp(mode, 0, 2)),
        static_cast<GE::Algorithm>(std::clamp(algorithm, 0, 4)),
        static_cast<GE::Resolution>(std::clamp(resolution, 0, 1)),
        swing50to75);
}

void clearPartPattern(int partIdx) { abdmcx::wasm_internal::engine().sequencer().clearStagingPart(partIdx); }

void addPartNote(int partIdx, int startTick, int durationTicks, int note, int velocity, int slide)
{
    abdmcx::wasm_internal::engine().sequencer().addStagingEvent(
        partIdx, startTick, durationTicks,
        static_cast<std::uint8_t>(std::clamp(note, 0, 127)),
        static_cast<std::uint8_t>(std::clamp(velocity, 1, 127)),
        slide != 0);
}

void addPartMotionPoint(int partIdx, int laneIdx, int paramId, int tick, float value)
{
    abdmcx::wasm_internal::engine().sequencer().addStagingMotion(partIdx, laneIdx, paramId, tick, value);
}

void commitPartPattern(int partIdx) { abdmcx::wasm_internal::engine().sequencer().commitStagingPart(partIdx); }

void getSequencerState(int* outPlaying, int* outTick, int* outStep, int* outTotalTicks)
{
    const auto& eng = abdmcx::wasm_internal::engine();
    if (outPlaying) *outPlaying = eng.isSequencerRunning() ? 1 : 0;
    if (outTick) *outTick = eng.getSequencerTick();
    if (outStep) *outStep = eng.getSequencerStep();
    if (outTotalTicks) *outTotalTicks = eng.getSequencerTotalTicks();
}

void seekSequencerBars(int deltaBars)
{
    abdmcx::wasm_internal::engine().seekSequencerBars(deltaBars);
}

void returnSequencerToZero()
{
    abdmcx::wasm_internal::engine().returnSequencerToZero();
}

void setSequencerRecordConfig(int mode01, int countInBars, int quantizeSteps)
{
    abdmcx::wasm_internal::engine().setSequencerRecordConfig(mode01, countInBars, quantizeSteps);
}

void getSequencerExtState(int* out3Ints)
{
    if (!out3Ints) return;
    const auto& eng = abdmcx::wasm_internal::engine();
    out3Ints[0] = eng.isSequencerPaused() ? 1 : 0;
    out3Ints[1] = eng.getSequencerCountInTicks();
    out3Ints[2] = static_cast<int>(eng.getSequencerRecordedRev());
}

const char* getPartPatternJson(int partIdx)
{
    static char sPatBuf[65536] {};
    const int n = abdmcx::wasm_internal::engine().sequencer().serializePartPatternJson(partIdx, sPatBuf, sizeof(sPatBuf));
    if (n <= 0) { sPatBuf[0] = '{'; sPatBuf[1] = '}'; sPatBuf[2] = '\0'; }
    return sPatBuf;
}

static abdmcx::OfflineBounceSession gWasmBounce;

int offlineBounceBegin(int bars, float tailSec, int isolatePart, int isolateBank, int useSongMode)
{
    abdmcx::OfflineBounceOptions opts;
    opts.sampleRate = abdmcx::wasm_internal::sampleRate();
    opts.patternBars = bars;
    opts.tailSeconds = tailSec;
    opts.isolatePart = isolatePart;
    opts.isolateBank = isolateBank;
    opts.useSongMode = (useSongMode != 0);
    return gWasmBounce.begin(abdmcx::wasm_internal::engine(), opts);
}

int offlineBounceRenderChunk(float* outL, float* outR, int numFrames)
{
    return gWasmBounce.renderChunk(outL, outR, numFrames);
}

void offlineBounceEnd()
{
    gWasmBounce.end();
}

} // extern "C"
