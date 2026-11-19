#include "WasmBridge.h"
#include "WasmInternal.h"
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
    const auto mask = static_cast<std::uint16_t>(std::clamp(muteMask, 0, 65535));
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

void getSongSceneTelemetry(int* out10Ints)
{
    if (out10Ints == nullptr) return;
    const auto st = abdmcx::wasm_internal::engine().songAndScenes().readTelemetry();
    out10Ints[0] = st.activeScene;
    out10Ints[1] = st.queuedScene;
    out10Ints[2] = st.songMode ? 1 : 0;
    out10Ints[3] = st.songLoop ? 1 : 0;
    out10Ints[4] = st.songBlockIdx;
    out10Ints[5] = st.songBarInBlock;
    out10Ints[6] = st.songBlockCount;
    out10Ints[7] = static_cast<int>(st.sceneApplySeq);
    out10Ints[8] = static_cast<int>(st.appliedMuteMask);
    out10Ints[9] = st.appliedTranspose;
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

} // extern "C"
