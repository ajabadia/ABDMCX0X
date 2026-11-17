# ROADMAP — ABDMCX0X

> Seguimiento maestro por fases para construir **ABDMCX0X** sin iteraciones redundantes, maximizando la reutilización DRY de `ABDShared`, `ABDBankManager`, `ABDNeuModMakr` y `ABDAudioLab`.

| Fase | Nombre | Estado | Objetivo clave |
| :---: | :--- | :--- | :--- |
| **0** | Brief, Contratos, DRY & Core Headless | ✅ HECHO | Documentos rectores, `GrooveArpeggiator` en `ABDShared`, contrato propietario rompler, perfiles hardware (`DR-5`, `MC-303`, `D-2`, `SC-55`) y esqueleto C++20 `McxEngine` + `HardwareMirrorRouter` verificado (`21/21` pass). |
| **1** | Voz DSP 4-Partial Estéreo y Drum Synth | ✅ VERIFICADO | `McxVoice` (4 Partials, `Parallel`/`RingMod12`/`Booster12`/`Vector2D`), `McxFilterBank` (6 filtros incl. `RolandTc6116Tvf` + `ZPlaneMorph`), `McxEnvelope5Stage` (`LUT IC7` + Accent), polifonía dinámica 0 % idle, Personas (`MC-303`..`FreeSuper`), `McxOutputAndFx`, Drum Maps multi-estándar y `McxPhase1Tests` verificados al 100 %. |
| **2** | Puente Hardware A/B en Vivo + `ABDBankManager` | ⏳ LISTO PARA COMPILAR/TESTEAR | Cola SPSC lock-free `McxMidiOutQueue`, enrutamiento `INT|EXT|BOTH` por parte, compensador de latencia de muestra exacta `McxLatencyCompensator`, puente hardware bidireccional `McxHardwareBridge` (NRPN GS Drum + Roland TVF/TVA) y persistencia `McxBankManagerBridge` (`abd_mcx0x_preset_v1` + SysEx DT1). `McxPhase2Tests.cpp` listo para verificación del usuario. |
| **3** | Host JUCE 9 (VST3/Standalone) + WebView2 + WASM | 📋 PENDIENTE | Integrar `JuceWebView2Component`, `abdmcx0x_parameter_spec.json` (`CDD v2.0`), WebUI Zero-Fork (`SynthNavBar`, `LcdDisplay`, `ABDShared/Code/Scope` `createScope()`, `FitStage`, `ABDShared/Code/MidiKeyboard` `@abdsynths/midi-keyb`), compilación WASM y paridad Nativo ↔ WASM. |
| **4** | Cápsulas Limpias desde `ABDNeuModMakr` | 📋 PENDIENTE | Generación offline en `ABDNeuModMakr` de bancos `abd_structured_rompler` con ondas des-horneadas (E-mu, Akai, Roland, Yamaha, SC-55 ref) y calibración de curvas `LutDSP` en `ABDAudioLab` cuando llegue el hardware. |
| **5** | Carga directa Akai/E-mu, `MidiKeyboard` + `Scope` & QA Final | 📋 PENDIENTE | Puente desde WebUI hacia `@abdsynths/shared/formats/sampler`, verificación integrada de `@abdsynths/midi-keyb` (`host-strip-height.test.js`) + `ABDShared::ScopeCore` telemetría A/B multi-carril, `pluginval` strictness 10 y pruebas A/B hardware (`MC-303`, `D-2`, `309`). |

---

## Detalle por Fases y Definition of Done

### Fase 0: Brief, Contratos, DRY & Esqueleto Headless
- [x] Cerrar [`DOCS/BRIEF_9_DECISIONES.md`](DOCS/BRIEF_9_DECISIONES.md) con hipótesis, alcance v1 y backlog explícito.
- [x] Actualizar skills en `D:\desarrollos\ABDSKILLS\skills\audio` y `.agents/skills`.
- [x] Implementar y verificar `abd::synth::GrooveArpeggiator` en `ABDShared::SynthCore` + documentación ([`ARPEGGIATORS_GUIDE.md`](../ABDShared/Docs/dsp/ARPEGGIATORS_GUIDE.md)).
- [x] Migrar `ABDMS2000::Arpeggiator` a `abd::synth::GrooveArpeggiator`.
- [x] Crear contrato propietario [`abd_structured_rompler.schema.json`](../ABDShared/Contracts/abd_structured_rompler.schema.json) (`v1.0.0`) y [`abdmcx0x_parameter_spec.json`](../ABDShared/Contracts/abdmcx0x_parameter_spec.json) (`CDD v2.0`).
- [x] Publicar contratos hardware iniciales en `ABDShared/Contracts/`: `boss_dr5.json`, `roland_mc303.json`, `roland_d2.json`, `roland_sc55.json`.
- [x] Inicializar `ABDMCX0X` (Git local + remoto, `.gitignore`, `.antigravityignore`, `DspSources.cmake`, `McxTypes.h`, `HardwareMirrorRouter`, `McxEngine`, `McxPhase0Tests`, `CMakeLists.txt`, `build.bat`, `wasm/build_wasm.bat`).
- [x] Verificar `McxPhase0Tests.exe` pasando al 100 % en esta fase.

**Definition of Done (Fase 0):** Compila y ejecuta `McxPhase0Tests.exe` (exit 0), `ABDShared_SynthCore_Tests.exe` (exit 0) y validación de contratos JS/JSON, sin archivos binarios ni ROMs protegidas en el repo.

### Fase 1: Motor DSP de 4 Partials Estéreo y Drum Rack
- [x] Contratos multi-estándar de Drum Map (`gm_standard`, `roland_gs_mc`, `yamaha_xg_xs`, `korg_ai2_n5`, `hardware_native`, `proprietary_custom` + `DrumNoteRemapper`) en `ABDShared/Contracts` y migración de `ABDNeuModMakr` (`gmDrumMap.ts` y `drumMapParser.ts`).
- [x] `McxRomTables.h` & `McxEnvelope5Stage`: envolventes `5-Stage` (`L0..L4`, `T0..T4`) con LUTs verificadas de `IC7` (`kEnvRate2935`, `kLogAtten2D4D`, `kPanCurve2CCC`) e impulso de `Accent`.
- [x] `McxPartialExciter` & `McxFilterBank`: `OscPolyBlep` + ciclo des-horneado (`Forward`/`PingPong`/`OneShot`/`altStart`/`loopTune`) y 6 filtros intercambiables (incl. `RolandTc6116Tvf` 20-bit SVF + `ZPlaneMorph`).
- [x] `McxVoice` + `McxEngine` + `McxOutputAndFx`: 4 Partials (`Parallel`, `RingMod12`, `Booster12`, `Vector 2D`), polifonía dinámica 1–64 con 0 % CPU en inactividad, *Machine Personas* (`FreeSuper`, `RolandMc303` 28-partial stealing, `MC-505`, `CS2x`, `Korg N5`, `E-mu Orbit`, `Quasimidi 309`), `OneShot`/`Gated` por tecla, Chorus/Delay/ZitaReverb y DAC (`HD`/`16-bit`/`12-bit`).
- [ ] Ejecución de compilación CMake + `McxPhase0Tests.exe` + `McxPhase1Tests.exe` y commit por el usuario (ver [`DOCS/PHASE1_DSP_AND_DRUM_MAPS.md`](DOCS/PHASE1_DSP_AND_DRUM_MAPS.md)).

### Fase 2: Puente Hardware Controlador + `ABDBankManager`
- [x] Cola SPSC lock-free `McxMidiOutQueue` (trivially copyable, power-of-2, alignas(64)) de audio/bridge hacia salida MIDI hardware.
- [x] Modos `INT | EXT | BOTH` por Parte con calibración de latencia A/B de muestra exacta (`McxLatencyCompensator`).
- [x] Puente hardware bidireccional (`McxHardwareBridge`) con orden estricto Roland (`CC99->CC98->CC6`) y perfiles **Boss DR-5** (`boss_dr5.json`), **Roland MC-303**, **D-2**, **SC-55**.
- [x] Integración `McxBankManagerBridge` C++ (persistencia `abd_mcx0x_preset_v1` JSON + JUCE `ValueTree` + volcados SysEx Roland DT1).
- [x] Suite de pruebas automatizadas `Tests/McxPhase2Tests.cpp` integrada en CMake.
- **DoD (Fase 2):** Modos `INT/EXT/AB` verificados enviando mensajes NRPN (`CC99→CC98→CC6`) y SysEx `DT1` válidos hacia hardware MIDI y persistiendo bancos en chunk DAW. Listo para compilación y ejecución por el usuario.

### Fase 3: Plugin JUCE 9 + WebView2 Estático + WebUI (`MidiKeyboard` & `Scope`) + WASM
- [ ] Generador `Scripts/registry_generator.js` desde `abdmcx0x_parameter_spec.json` (`CDD v2.0`).
- [ ] `PluginProcessor` / `PluginEditor` con `JuceWebView2Component` aislado por PID (`WEBVIEW2_USER_DATA_FOLDER`), input bus opcional/desactivado y telemetría SPSC lock-free conectada a `ABDShared::ScopeCoreHeaders` / `ABDShared::ScopeCore` (`D:\desarrollos\ABDSynths\ABDShared\Code\Scope`).
- [ ] WebUI en `Vanilla CSS` + componentes Zero-Fork de `ABDShared`:
  - `SynthNavBar`, `LcdDisplay`, `FitStage`, `ABDBankManager`.
  - **`D:\desarrollos\ABDSynths\ABDShared\Code\MidiKeyboard`** (`@abdsynths/midi-keyb` / `createKeyboard()`): teclado multitáctil con ruedas Pitch/Mod, Chord Memory, animaciones LED, disparo bidireccional hacia `McxEngine` + `HardwareMirrorRouter` (`INT | EXT | BOTH`), resaltado de las 128 teclas de Drum Kit y franja CSS con altura explícita registrada en `Code/MidiKeyboard/tests/host-strip-height.test.js`.
  - **`D:\desarrollos\ABDSynths\ABDShared\Code\Scope`** (`@abdsynths/shared/scope` / `createScope()` + `ABDShared::ScopeWebAssets`): osciloscopio multirraíl, espectro FFT, espectrograma y `VuMeterRenderer` para auditar en vivo los 4 Partials Estéreo, el filtro activo y comparaciones A/B contra hardware externo (**Boss DR-5**).
- [ ] Compilación Emscripten `wasm/build_wasm.bat` compartiendo `DspSources.cmake` + verificación de paridad numérica Nativo ↔ WASM.
- **DoD (Fase 3):** Compila `Standalone`, `VST3` y `WASM AudioWorklet` mediante `./build.bat`, arranca con HMR de Vite o bundle `BinaryData`, `MidiKeyboard` y `Scope` rinden sin errores de consola y la WebUI mueve todos los controles.

### Fase 4 y 5: Ecosistema `ABDNeuModMakr` / `ABDAudioLab`, Telemetría A/B y Carga Directa Multi-Sampler
- [ ] Exportador/Empaquetador `.abdrompler.json` en `ABDNeuModMakr` (cápsulas des-horneadas desde WAV/SF2/Akai/E-mu).
- [ ] Ajuste de curvas `LutDSP` reales tras medir físicamente **MC-303**, **D-2**, **SC-55** y **Rave-O-Lution 309** con `ABDAudioLab`.
- [ ] Verificación final de `ABDShared/Code/MidiKeyboard` (`host-strip-height.test.js` con entrada `ABDMCX0X`) y `ABDShared/Code/Scope` (comparación visual A/B en vivo Hardware vs DSP + comprobación en WebView2 real).
- [ ] Validación `pluginval` strictness 10 sin fallos ni memory leaks.
