# Changelog

All notable changes to **ABDMCX0X** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Consolidated Product & Architecture Vision v2 (`DOCS/VISION_GROOVEBOX_16P.md`):**
  - Documented the unified 16-part modular Groovebox architecture: single unrestricted engine (keeping `MS2000`/`Axionik`/`MC-303`/`DR-5` as pure visual themes), free `Chromatic`/`DrumMap` per part (Part 10 Drum by default), 3-tier settings hierarchy (`SystemSettings` / `MultiPreset` / `PartPreset`), `AxionikDB`-compatible working directory, `DwgsWavetable` engine promotion (`ABDMS2000` → `ABDShared::DspCore`), dual serial filters (`Filter 1 → Filter 2`) edited in sliding Drawers, per-part parametric EQ + Drive + 4 Pre/Post-Fader sends, 4 Global + 2 Local LFOs (0% idle CPU + ModMatrix Via-Attenuator), Global Chromatic + Scale/Key Transposer (`ABDShared` + `@abdsynths/midi-keyb`), multi-bus Master FX Rack (`ABDShared`), PPQ Piano-Roll Sequencer Modal + Full Transport + Song Mode, MPC/Groovebox performance features (`16 Levels`, `Note Repeat`, `MPC Swing`, `P-Locks`, `Acid Accent`, `Megamix`, `Scenes/Hotcues`), and hardware detection relegated to final phase as input controller loading full `ABDShared` MIDI Learn profiles.
- **Phase 3C Native JUCE 9 Host Parity (Standalone + VST3 + WebView2):**
  - Extracted single-source-of-truth `Source/Core/McxParamRouter.h` (`0..24`, incl. `DiagnosticProbe`) shared identically between `WasmBridge.cpp` and `PluginProcessor.cpp`.
  - Upgraded `PluginProcessor.h/.cpp` with `McxFactoryBank`, JSON contract hydration, lock-free `juce::MidiMessageCollector`, atomic double-buffered telemetry (`peakL/R`, `activeVoices`, `sampleRate`, `samplesL[128]`), and full DAW state persistence.
  - Migrated `PluginEditor.h/.cpp` to `abd::webview2::JuceWebView2Component` (`http://localhost:5330` dev probe + offline `WebUI/dist` fallback, PID-isolated WebView2 folder, full `mcxEvent` / `onNativeTelemetry` parity) and updated `McxHostBridge.ts`, `CMakeLists.txt`, and `build.bat full`.
- **First-Class Aseptic `ABDShared::DiagnosticProbe` Module (440 Hz Signal Probe):**
  - Promoted to `ABDShared/Code/DiagnosticProbe/` (`ABDShared::DiagnosticProbe` CMake target + `@abdsynths/shared/diagnostic-probe` export + [`DIAGNOSTIC_PROBE_INTEGRATION_GUIDE.md`](../ABDShared/Docs/integration/DIAGNOSTIC_PROBE_INTEGRATION_GUIDE.md) + `MODULE_CATALOG.md` §11).
  - C++20 header-only RT-safe `DiagnosticSignalProbe.h` with 64-bit atomic multi-destination bitmask (`setEnabledMask`, `setPointEnabled`, `isInjectingAt`), double-precision 440.0 Hz tuning-fork accuracy across 44.1k..192k Hz, and 4 waveforms (`Sine`, `Saw`, `WhiteNoise`, `1 Hz Impulse`).
  - Reusable draggable floating WebUI window (`DiagnosticProbeModal.js`, non-blocking by default like `ABDScope` `FloatingMount`, optional `modal: true`), animated 440 Hz waveform canvas, `ABDShared` `Knob` volume control, N caller-defined ON/OFF destination buttons with LEDs, full ES/EN i18n, Light/Dark theme sync, and 0 hardcoded colors.
  - Wired into `ABDMCX0X` across 5 DSP injection points (`Post-Master`, `Pre-Master`, `Pre-FX`, `Pre-Filter`, `Voice Direct`) via `Tools -> 440 Hz Signal Probe...`.
- **Phase 3A/3B WebUI, Shared Themes (`MC-303` / `DR-5`) & `SynthNavBar`:**
  - Created 4 Light/Dark themes in `ABDShared/Assets/styles/themes/` (`mc303`, `mc303-light`, `dr5`, `dr5-light`) with full widget/elevation/LED tokens.
  - Built desktop menu bar (`McxNavbar.ts`) on `ABDShared` `SynthNavBar` (`File / Edit / Tools / Help` with native `AboutDialog` & Update Checker) + 3 initial UI Machine Personas (`SuperFree` [default], `MC-303`, `DR-5`), Light/Dark toggle, and ES/EN i18n (`@abdsynths/shared/i18n`).
  - Integrated `ABDShared` `bg_neutral.webp` full-bleed metallic chassis with translucent 100%-tokenized panels (`color-mix`, 0 hardcoded colors).
  - Added `@abdsynths/midi-keyb` with `bender.png` Pitch/Mod wheels (`wheels.css`, `kbd-buttons.css`) and vertical `OCT +` / `OCT -` LED controls, Live Oscilloscope + Stereo VU (`McxScopeCanvas.ts`), 16-Part Mixer, 10 Live Macros, GS/MC-303 FX selectors, Vector 2D Pad, 16-Pad Drum Rack (`McxDrumPads.ts`), and `.abdbank` drag-and-drop loader.
  - Shared `RolandGsMc303FxProfile.h` in `ABDShared/Code/DspEffects/profiles/` driving `DspZitaReverb`, `DspStereoDelay`, `DspStereoChorus`, and `DspFlanger` (`kMeasuredHardware = false` pending `ABDAudioLab` measurement) + `BossDr5` persona (`19` voices).
  - Added `start.bat` (Vite port `5330`), workspace entry in root `pnpm-workspace.yaml`, and unified `build.bat` (registry gen → headless CMake + CTest → optional JUCE `full` → Emscripten `-O2` WASM).

### Fixed
- **Windows / WASM Stack Safety:** Moved large delay buffers inside `McxOutputAndFx` (`FxBuffers` via `std::unique_ptr`) and `McxLatencyCompensator` (`std::vector<float>` preallocated in constructor) off the stack, eliminating stack-overflow segfaults in `McxPhase1Tests` and `McxPhase2Tests` while preserving zero audio-thread allocations.
- **Emscripten 4.x WASM Unminified Exports:** Switched `wasm/CMakeLists.txt` and `wasm/build_wasm.bat` to `-O2` (removing forbidden internal CLI flags) so `mcx0x_dsp.wasm` exports clean unminified symbols for `WebAssembly.instantiate` inside `AudioWorkletGlobalScope`.
- **Universal Semantic Roles & Common Data Dictionary (CDD v2.0):**
  - Published canonical specification [`UNIVERSAL_SEMANTIC_TAXONOMY.md`](../ABDShared/Contracts/UNIVERSAL_SEMANTIC_TAXONOMY.md) and strongly-typed contract [`semanticRoles.ts`](../ABDShared/Contracts/semanticRoles.ts) in `@abdsynths/contracts`.
  - Comprehensive coverage of:
    - *Voice & Polyphony:* `VoicePolyMode`, `VoiceUnisonVoices`, `VoiceUnisonDetune`, `VoiceUnisonSpread`, `PortamentoGlideTime`, `PortamentoSwitch`, `PortamentoMode`, `PitchBendUpRange`, `PitchBendDownRange`.
    - *Oscillators & Partials:* `OscWaveform`, `OscOctave`, `OscCoarseTune`, `OscFineTune`, `OscPulseWidth`, `OscPulseWidthMod`, `OscLevel`, `OscPan`, `OscHardSync`, `OscRingMod`, `OscFmCrossMod`, `OscKeyTrack`, `OscPhaseInit`, `NoiseLevel`, `NoiseColor`, `SampleLoopMode`, `SampleStartOffset`, `SampleAltStart`, `SampleLoopTune`.
    - *Filters:* `FilterType`, `FilterMode` (LPF 6/12/18/24dB, HPF 6/12/24dB, BPF 6/12/24dB, Notch, CombPos, CombNeg, Peaking), `FilterCutoff`, `FilterResonance`, `FilterKeyTrack`, `FilterDrive`, `FilterEnvDepth`, `FilterEnvVelocity`, `FilterLfoDepth`, `FilterMorph`, `FilterCombFeedback`, `FilterCombDamping`.
    - *Envelopes (Standard, Multi-Stage & Loops):* `[Prefix]EnvDelay`, `[Prefix]EnvAttack`, `[Prefix]EnvHold`, `[Prefix]EnvDecay`, `[Prefix]EnvSustain`, `[Prefix]EnvRelease`, `[Prefix]EnvStageCount`, `[Prefix]EnvStageTime`, `[Prefix]EnvStageLevel`, `[Prefix]EnvStageCurve`, `[Prefix]EnvSustainStage`, `[Prefix]EnvEndStage`, `[Prefix]EnvLoopMode`, `[Prefix]EnvLoopStart`, `[Prefix]EnvLoopEnd`, `[Prefix]EnvInvert`, `[Prefix]EnvDepth`, `[Prefix]EnvVelocity`, `[Prefix]EnvKeyTrack`.
    - *LFOs:* `[LfoN]Waveform`, `[LfoN]Rate`, `[LfoN]TempoSync`, `[LfoN]Delay`, `[LfoN]FadeIn`, `[LfoN]KeySync`, `[LfoN]PhaseOffset`, `[LfoN]Polarity`, `[LfoN]Depth`.
    - *Modulation Matrix:* `ModSlotSource`, `ModSlotDestination`, `ModSlotAmount`, `ModSlotViaSource`, `ModSlotViaAmount`, `ModSlotCurve`.
    - *Physical Performance Controllers & Pedals:* `ModulationWheel`, `BreathController`, `FootController`, `FootExpressionPedal`, `SustainPedal`, `PortamentoSwitch`, `SostenutoPedal`, `SoftPedal`, `ChannelAftertouch`, `PolyAftertouch`, `PitchBendWheel`, `VectorJoystickX`, `VectorJoystickY`, `RibbonController`.
    - *Effects & Multi-Part Mix:* Master Reverb, Delay, Chorus, Flanger, Phaser, Distortion, EQ sends, and GS/XG Drum Key parameters.
  - Verified 30/30 unit tests passing in `@abdsynths/contracts`.
- **Zero-Dependency Dynamic C++ Hardware Profile Hydrator (`ABDShared::SynthCore`):**
  - Created `SemanticRoleHash.h` (compile-time FNV-1a 64-bit hashes + alias normalization), `MiniJsonParser.h` (strict RFC-8259 recursive-descent JSON parser, zero external deps, Native & WASM ready), `HardwareProfileContract.h` (flat O(1)/O(log N) RT-safe lookup indices + 1-byte and 3-byte extended MMA Universal Identity Reply matching), and `HardwareProfileHydrator.h/.cpp` (smart `[0..1]` UI → `[0..127]` MIDI wire auto-scaling + GM fallbacks).
  - Removed all hardcoded Roland/Boss CCs and NRPNs from `McxHardwareProfiles.cpp`, `McxHardwareBridge.cpp`, and `McxHardwareInbound.cpp`.
  - Added universal `routeSemanticParam()`, `routeDrumSemanticParam()`, `setInboundSemanticCallback()`, and live SysEx Universal Identity Reply auto-detection in `McxHardwareBridge`.
  - Updated `Tests/McxPhase2Tests.cpp` to hydrate real JSON contracts from `ABDShared/Contracts/` (`boss_dr5.json`, `roland_mc303.json`, `korg_ms2000.json`, `behringer_deepmind12.json`) and verify Universal Identity Reply auto-switching.
- **WebAssembly (WASM) AudioWorklet Engine & Build System:**
  - Implemented `Source/Wasm/WasmBridge.h` and `Source/Wasm/WasmBridge.cpp` with zero-allocation real-time C-linkage methods (`initEngine`, `processAudio`, `noteOn`, `noteOff`, `allNotesOff`, `setTempoBPM`, `setPartParam`, `setMasterVolume`, `loadBankFromMemory`, `getAudioSnapshot`, `resetToFactory`).
  - Added `wasm/CMakeLists.txt` consuming `DspSources.cmake` (Single-Source Anti-Drift) linked against `ABDShared::SynthCore`, `DspCore` and `DspEffects`.
  - Configured `wasm/build_wasm.bat` with auto-discovery of Emscripten SDK (`D:\desarrollos\emsdk`), Ninja generator, and automated deployment of `mcx0x_dsp.js` (13.4 KB) and `mcx0x_dsp.wasm` (139 KB) to `WebUI/src/wasm/`.
- **Phase 5 Quality Assurance, Polyphony Stress & Audio Resilience:**
  - Tested sample rate invariance across 44.1 kHz, 48 kHz, 88.2 kHz, 96 kHz, and 192 kHz.
  - Verified buffer size variance across 32, 64, 128, 256, 512, 1024, 2048, and 4096 samples.
  - Verified NaN/Inf immunity and voice budget stealing for Roland MC-303 (28 partials limit).
  - Verified DAW state serialization and deserialization roundtrip.
  - Implemented offline verification demo `Tests/McxAudioRenderDemo.cpp` generating 8.88s of audio with zero digital clipping and DC blocking.
- **Phase 4 Proprietary .abdbank Loader & De-Baking Container:**
  - Implemented `Source/Core/McxBankLoader.h/.cpp` for pure C++20 parsing and decompression of proprietary uncompressed ZIP `.abdbank` sample containers.
  - Added sample extraction, multi-stage tone configuration, drum kit mapping, and hi-hat muteGroup 1 choke.
  - Implemented factory preset bank fallback `Source/Core/McxFactoryBank.h/.cpp`.
  - Verified with `Tests/McxPhase4Tests.cpp` (10/10 passed).
- **Phase 2 Live Hardware Controller & Bank Manager Bridge:**
  - Lock-free SPSC outbound MIDI queue `McxMidiOutQueue` with trivially copyable messages.
  - Bidirectional MIDI/NRPN hardware bridge `McxHardwareBridge` supporting Roland GS, Boss DR-5, and Roland MC-303 parameter mappings.
  - Modularized into `McxHardwareProfiles.cpp` and `McxHardwareInbound.cpp` (< 210 lines each).
  - Sample-accurate latency compensator `McxLatencyCompensator`.
  - Verified with `Tests/McxPhase2Tests.cpp` (58/58 passed).
- **Phase 1 DSP Voice Engine, Machine Personas & Multi-Standard Drum Maps:**
  - Multi-standard Drum Map contracts in `ABDShared/Contracts` (`drum_map_profile.schema.json`, `drum_map_profiles.json`, `abdDrumMapProfiles.ts`) supporting `gm_standard`, `roland_gs_mc`, `yamaha_xg_xs` (XG/Motif XS/CS2x), `korg_ai2_n5` (Korg N5/X5D/AI2), `hardware_native`, and `proprietary_custom` (0..127) with bidirectional `DrumNoteRemapper`, integrated DRY into `ABDNeuModMakr`.
  - Clean-room MC-303 ROM lookup tables (`McxRomTables.h`: `kEnvRate2935`, `kLogAtten2D4D`, `kPanCurve2CCC`, TVF scaling tables) and 5-stage LUT/ms envelopes (`McxEnvelope5Stage`) with `Accent` boost.
  - Per-partial 6-model modular filter bank (`McxFilterBank`: `SvfClean`, `RolandTvfZdf`, `Ms20Acid`, `LadderDrive`, `ZPlaneMorph`, and clean-room 20-bit saturating `RolandTc6116Tvf`) and hybrid exciter (`McxPartialExciter`: `OscPolyBlep` + wavetable/PCM cycle player with `pingPongLoop`, `oneShotMode`, `altStartOffset`, and post-loop `loopTuneCents`).
  - 4-Partial `McxVoice` (`Parallel`, `RingMod12`, `Booster12`, `Vector2D`), dynamic 1..64 polyphony with 0% idle CPU, `McxMachinePersona` presets (`FreeSuper`, `RolandMc303` 28-partial stealing, `RolandMc505`, `YamahaCs2x`, `KorgN5`, `EmuOrbit`, `Quasimidi309`), `McxOutputAndFx` (`DspStereoChorus`, `DspStereoDelay`, `DspZitaReverb` + 3 DAC modes), `Tests/McxPhase1Tests.cpp`, and `DOCS/PHASE1_DSP_AND_DRUM_MAPS.md`.
- **Phase 0 Infrastructure & Governance:**
  - Closed product specification in `DOCS/BRIEF_9_DECISIONES.md`, `README.md`, `ROADMAP.md`, `HANDOFF.md`, `.gitignore`, and `.antigravityignore`.
  - Shared clean-room `abd::synth::GrooveArpeggiator` in `ABDShared::SynthCore` (with documentation in `ABDShared/Docs/dsp/ARPEGGIATORS_GUIDE.md`) and DRY migration of `ABDMS2000`.
  - Proprietary bank/patch format contract `abd_structured_rompler.schema.json` + `abdStructuredRompler.ts` (`v1.0.0`), parameter dictionary `abdmcx0x_parameter_spec.json` (`CDD v2.0`), and hardware profiles (`boss_dr5.json`, `roland_mc303.json`, `roland_d2.json`, `roland_sc55.json`).
  - JUCE-free C++20 headless Phase 0 skeleton (`McxTypes.h`, `HardwareMirrorRouter`, `McxEngine`), `DspSources.cmake`, `CMakeLists.txt` (Headless + JUCE 9 WebView2 + `ABDBankManager`), `build.bat`, `wasm/` skeleton, and `McxPhase0Tests.cpp`.
