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
     * Note On event directed to a specific Groove-Part (0..15).
     * Part 9 is canonical Drum Part (MIDI Channel 10).
     */
    WASM_EXPORT void noteOn(int partIdx, int noteNumber, float velocity);

    /**
     * Note Off event directed to a specific Groove-Part (0..15).
     */
    WASM_EXPORT void noteOff(int partIdx, int noteNumber);

    /**
     * All Notes Off (Panic) across all 16 parts.
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
     * Resets engine to internal factory default presets & patches.
     */
    WASM_EXPORT void resetToFactory();
}
