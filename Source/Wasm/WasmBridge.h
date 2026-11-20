#pragma once

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define WASM_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define WASM_EXPORT
#endif

#include <cstdint>

extern "C"
{
    /**
     * Initializes the ABDMCX0X synthesis engine with sample rate.
     */
    WASM_EXPORT void initEngine(double sampleRate);

    /**
     * Renders interleaved or separate Left/Right stereo audio block.
     */
    WASM_EXPORT void processAudio(float* outL, float* outR, int numSamples);

    /**
     * Note On event directed to a specific Groove-Part (0..63).
     * Part 9 is canonical Drum Part (MIDI Channel 10).
     */
    WASM_EXPORT void noteOn(int partIdx, int noteNumber, float velocity);

    /**
     * Note Off event directed to a specific Groove-Part (0..63).
     */
    WASM_EXPORT void noteOff(int partIdx, int noteNumber);

    /**
     * All Notes Off (Panic) across all 64 parts.
     */
    WASM_EXPORT void allNotesOff();

    /**
     * Sets master tempo in BPM for groove quantization, delay and lfo sync.
     */
    WASM_EXPORT void setTempoBPM(float bpm);

    /**
     * Sets a part-specific parameter normalized (0.0 .. 1.0) or raw.
     */
    WASM_EXPORT void setPartParam(int partIdx, int paramId, float value);

    /**
     * Sets master output volume (0.0 .. 1.0).
     */
    WASM_EXPORT void setMasterVolume(float volume);

    /**
     * Loads a proprietary .abdbank binary container from WebAssembly memory buffer.
     * Returns 1 on success, 0 on failure.
     */
    WASM_EXPORT int loadBankFromMemory(const uint8_t* data, int sizeBytes);

    /**
     * Retrieves audio telemetry snapshot for UI VU meters and active voices count.
     */
    WASM_EXPORT void getAudioSnapshot(float* peakL, float* peakR, int* activeVoices);

    /**
     * Retrieves 64 channel peak levels for the mixer console VU meter towers.
     */
    WASM_EXPORT void getPartPeaks(float* outPeaks64);

    /**
     * Retrieves 64 channel MIDI activity peak levels for external MIDI VU meter towers.
     */
    WASM_EXPORT void getPartMidiPeaks(float* outPeaks64);

    /**
     * Resets engine to internal factory default presets & patches.
     */
    WASM_EXPORT void resetToFactory();

    /** Starts or stops the C++ PPQ sequencer and resets playhead if requested. */
    WASM_EXPORT void setTransportPlaying(int playing, int resetOnStop);

    /** Sets loop length in bars (1..32). */
    WASM_EXPORT void setSequencerBars(int bars);

    /** Configures groove/shuffle per part (-1 = master). */
    WASM_EXPORT void setPartGroove(int partIdx, int mode, int algorithm, int resolution, float swing50to75);

    /** Double-buffered staging API for WebUI pattern uploads. */
    WASM_EXPORT void clearPartPattern(int partIdx);
    WASM_EXPORT void addPartNote(int partIdx, int startTick, int durationTicks, int note, int velocity, int slide);
    WASM_EXPORT void addPartMotionPoint(int partIdx, int laneIdx, int paramId, int tick, float value);
    WASM_EXPORT void commitPartPattern(int partIdx);

    /** Publishes sequencer play/tick/step/totalTicks for passive UI playhead sync. */
    WASM_EXPORT void getSequencerState(int* outPlaying, int* outTick, int* outStep, int* outTotalTicks);

    /** Drains queued outbound hardware MIDI messages into JS memory. Returns bytes written. */
    WASM_EXPORT int drainMidiOut(uint8_t* outBytes, int maxBytes);


    /** Registry & polymorphic sound-engine / factory-preset inspection & switching. */
    WASM_EXPORT int getRegisteredEngineCount();
    WASM_EXPORT int getPartEngineTypeIndex(int partIdx);
    WASM_EXPORT int selectPartEngineType(int partIdx, int typeIndex);
    WASM_EXPORT const char* getPartEngineTypeId(int partIdx);
    WASM_EXPORT int getPartFactoryPresetCount(int partIdx);
    WASM_EXPORT const char* getPartFactoryPresetName(int partIdx, int presetIdx);
    WASM_EXPORT int loadPartFactoryPreset(int partIdx, int presetIdx);
    WASM_EXPORT const char* getPartCurrentPresetName(int partIdx);
    WASM_EXPORT int setPartEngineParamByKey(int partIdx, const char* key, float value);
    WASM_EXPORT float getPartEngineParamByKey(int partIdx, const char* key);
    WASM_EXPORT const char* getPartEngineStateJson(int partIdx);
    WASM_EXPORT const char* getRegisteredEngineCatalogJson();
    WASM_EXPORT const char* getPartPresetsJson(int partIdx);

    /** Selective multi-bank on-demand archive indexing, loading & deferred wave GC. */
    WASM_EXPORT int indexBankFromMemory(const uint8_t* data, int sizeBytes);
    WASM_EXPORT int getIndexedBankToneCount(int bankSlot);
    WASM_EXPORT int getIndexedBankKitCount(int bankSlot);
    WASM_EXPORT int loadIndexedToneOnDemand(int bankSlot, int toneIdx, int partIdx);
    WASM_EXPORT int loadIndexedKitOnDemand(int bankSlot, int kitIdx, int partIdx);
    WASM_EXPORT int collectUnusedWaves();

    /** Bar-quantized Live Scenes (1..8) and Song Mode arrangement control. */
    WASM_EXPORT void triggerScene(int sceneIdx, int immediate);
    WASM_EXPORT void captureScene(int sceneIdx);
    WASM_EXPORT void updateSceneSlot(int sceneIdx, int muteMask, int transposeSemitones, const char* name);
    WASM_EXPORT void updateSceneSlot64(int sceneIdx, int m0, int m1, int m2, int m3, int transposeSemitones, const char* name);
    WASM_EXPORT void setSongModeEnabled(int enabled);
    WASM_EXPORT void setSongLoopEnabled(int loop);
    WASM_EXPORT void jumpSongBlock(int blockIdx, int immediate);
    WASM_EXPORT void clearSongBlocks();
    WASM_EXPORT void addSongBlock(int sceneIdx, int bars, int transposeOffset);
    WASM_EXPORT void commitSongBlocks(int loopEnabled);
    WASM_EXPORT void getSongSceneTelemetry(int* out14Ints);
    WASM_EXPORT const char* getSongScenesStateJson();

    /** Visual 8x8 Bank Layout persistence & WebMIDI port-scoped inbound routing */
    WASM_EXPORT int setBankLayoutJson(const char* jsonText);
    WASM_EXPORT const char* getBankLayoutJson();
    WASM_EXPORT void routeMidiInBytes(int portIdx, int status, int data1, int data2);

    /** 8-Slot Modular 19'' Studio Rack & Patchbay Controls */
    WASM_EXPORT int setRackSlotEngine(int slotIdx, int engineType, const char* customName);
    WASM_EXPORT void setRackSlotName(int slotIdx, const char* customName);
    WASM_EXPORT void removeRackSlot(int slotIdx);
    WASM_EXPORT void moveRackSlot(int fromIdx, int toIdx);
    WASM_EXPORT void setRackSlotBypass(int slotIdx, int bypass);
    WASM_EXPORT void setRackSlotParams(int slotIdx, float p1, float p2, float mix);
    WASM_EXPORT void setRackSlotParamByKey(int slotIdx, const char* key, float value);
    WASM_EXPORT void setRackSlotPreset(int slotIdx, int presetIdx);
    WASM_EXPORT void setRackSlotDucking(int slotIdx, int enabled, float amount);
    WASM_EXPORT void getRackSlotTelemetry(int slotIdx, float* outPeaks4, int* outFlags3);
    WASM_EXPORT const char* getRackSlotsStateJson();
    WASM_EXPORT int loadRackSlotsStateJson(const char* jsonText);
    WASM_EXPORT void setPartInsertSlot(int partIdx, int slotIdx);
    WASM_EXPORT int getPartInsertSlot(int partIdx);
    WASM_EXPORT void setSendSlotTarget(int busIdx, int slotIdx);
    WASM_EXPORT int getSendSlotTarget(int busIdx);
    WASM_EXPORT void setSlotChainTarget(int slotIdx, int targetSlotIdx);
    WASM_EXPORT int getSlotChainTarget(int slotIdx);
    WASM_EXPORT void getAllRackSlotsTelemetry(float* outPeaks16, int* outFlags16);
    WASM_EXPORT void setSendBusMute(int busIdx, int muted);
    WASM_EXPORT void setFxTopology(int uiTopo);
    WASM_EXPORT void setFxCascade(float choToRev, float delToRev);
    WASM_EXPORT void setFxGate(int gateIdx, int active);
    WASM_EXPORT void setFxTempoSync(int enabled);
    WASM_EXPORT void setLimiterEnabled(int enabled);
    WASM_EXPORT void setLimiterCeilingDb(float db);
    WASM_EXPORT void setDuckMode(int kind, int enabled);
    WASM_EXPORT void setSequencerLoop(int loop);
    WASM_EXPORT void setPartPresetName(int partIdx, const char* name);
    WASM_EXPORT void getMasterFxTelemetry(float* out7Floats, int* out4Mutes);
}
