# Changelog

All notable changes to **ABDMCX0X** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
