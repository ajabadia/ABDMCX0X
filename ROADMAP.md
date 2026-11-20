# ROADMAP — ABDMCX0X

> Seguimiento maestro por fases para construir **ABDMCX0X** sin iteraciones redundantes, maximizando la reutilización DRY de `ABDShared`, `ABDBankManager`, `ABDNeuModMakr` y `ABDAudioLab`.

| Fase | Nombre | Estado | Objetivo clave |
| :---: | :--- | :--- | :--- |
| **0** | Brief, Contratos, DRY & Core Headless | ✅ HECHO | Documentos rectores, `GrooveArpeggiator` en `ABDShared`, contrato propietario rompler, perfiles hardware (`DR-5`, `MC-303`, `D-2`, `SC-55`) y esqueleto C++20 `McxEngine` + `HardwareMirrorRouter` verificado (`21/21` pass). |
| **1** | Voz DSP 4-Partial Estéreo y Drum Synth | ✅ VERIFICADO | `McxVoice` (4 Partials, `Parallel`/`RingMod12`/`Booster12`/`Vector2D`), `McxFilterBank` (6 filtros incl. `RolandTc6116Tvf` + `ZPlaneMorph`), `McxEnvelope5Stage` (`LUT IC7` + Accent), polifonía dinámica 0 % idle, Personas (`MC-303`..`FreeSuper`), `McxOutputAndFx`, Drum Maps multi-estándar y `McxPhase1Tests` verificados al 100 %. |
| **2** | Puente Hardware A/B en Vivo + `ABDBankManager` | ✅ VERIFICADO | Cola SPSC lock-free `McxMidiOutQueue`, enrutamiento `INT|EXT|BOTH` por parte, compensador de latencia de muestra exacta `McxLatencyCompensator`, puente hardware bidireccional `McxHardwareBridge` (NRPN GS Drum + Roland TVF/TVA) y persistencia `McxBankManagerBridge`. `McxPhase2Tests.cpp` verificado al 100 % (58/58 pass). |
| **3** | Host JUCE 9 (VST3/Standalone) + WebView2 + WebUI | ✅ VERIFICADO (3A/3B/3C) | WebUI WASM (`SynthNavBar` + `AboutDialog`, `ABDShared::DiagnosticProbe`, Light/Dark sobre `bg_neutral.webp`, ES/EN, `@abdsynths/midi-keyb` + `OCT +/-`, Scope+VU, 16-Part Mixer, Drum Pads, `.abdbank`) + Host Nativo JUCE 9 (`Standalone` + `VST3` + `WebView2` + `McxParamRouter.h`) verificados con `.\build.bat full`. |
| **4** | Carga de Cápsulas y Bancos `.abdbank` | ✅ VERIFICADO | Formato propietario uncompressed ZIP `.abdbank`, descompresión PCM, extracción de ondas, mapeo de drum kits, tones cromáticos, hi-hat muteGroup 1 choke, `McxFactoryBank`. `McxPhase4Tests.cpp` verificado al 100 % (10/10 pass). |
| **5** | Resiliencia DSP, QA Offline & Compilación WASM | ✅ VERIFICADO | Frecuencias 44.1k a 192k, buffers 32 a 4096, MC-303 28-partial budget stealing, inmunidad NaN/Inf, serialización DAW, demo de audio offline sin clipping (-0.75 dBFS, 0 clipped samples), y compilación WebAssembly `mcx0x_dsp.js` (13.4 KB) + `mcx0x_dsp.wasm` (139 KB). `McxPhase5Tests.cpp` verificado (7/7 pass). |
| **6** | Blindaje Core C++20, MIDI Out, RT-Safety & WebUI Bloque 6 | ✅ VERIFICADO (`7/7` CTest + Vite) | Fixes de raíz en Core Groovebox (`kNumParts = 16`): `McxCommandQueue.h` SPSC por `partIdx`, MIDI Out `0x90`/`0x80` real + Arp híbrido, `midiMessages.clear()` anti-rebote VST3, fin de doble disparo, `latchedNoteMap_[128]`, `nrpnStates_[16]`, perfiles/puertos por pista, `McxMidiModDecimator.h`, `McxTrackSemanticOffsets`, EQ estéreo `copyCoeffsFrom`, `liveZeroLatency` y `McxPhase6CoreInfraTests` (`17/17` pass) + **Bloque 6 WebUI** (`mcx0x.css` en 21 módulos `< 180` lín. con 0 hex/rgba, `main.ts` descompuesto en `WebUI/src/app/`, `McxStepStrip.ts` 194 lín., puente `82..89` + `partMidiPeaks` dual y `vite build` en verde; ver `DOCS/PLAN_MAESTRO_ARQUITECTURA_Y_REFACTOR_CORE.md`). |
| **7** | Aislamiento `StructuredRompler` y Chasis Multi-Motor (`ISoundEngine`) | ✅ VERIFICADO (`5/5 build.bat full`) | Extracción del motor completo Rompler/Drum a `ABDShared::SynthEngines` (`ISoundEngine`, `TrackModRouter`, `RomplerVoicePool`, `StructuredRomplerEngine`, `14/14` pass), integración polimórfica en `McxEngine`, retirada de `Filter 2` de `McxChannelStrip`, borrado de 11 duplicados, Test #8 en `McxPhase6CoreInfraTests` (`18/18` pass) y build completo Headless + JUCE 9 + WASM en verde. |
| **8** | Secuenciador PPQ Nativo + MIDI Clock `0xF8` + Host Sync (Fase 2 Plan Maestro) | ✅ VERIFICADO (`5/5 build.bat full`, `8/8` CTest) | `McxPatternSequencer` doble buffer lock-free + `GrooveShuffleEngine`, `McxMidiClockEmitter.h` (`0xFA`/`0xFB`/`0xFC`/`0xF8` prio `0`), `syncHostTransport` (`AudioPlayHead`), sub-bloques `kMaxChunk = 64`, puentes `PluginEditor`/`WasmBridge`, WebUI espejo pasivo sin `setInterval`, `Tests/McxPhase7SequencerTests.cpp` (`8/8` CTest en `0.64s`), Standalone/VST3 y WASM `[12/12]` en verde. |
| **9** | Infraestructura Multi-Motor (`McxEngineRegistry`) + `WavePool` On-Demand (Punto 1) | ✅ VERIFICADO (`5/5 build.bat full`, `9/9` CTest) | `McxEngineRegistry` estático RT-safe (`structured_rompler` + `external_midi` + custom slots), conmutación limpia de `TrackModRouter`, presets polimórficos `ISoundEngine`, `RomplerWavePool` compartido + `McxMultiBankManager` + `McxLibraryService` (`0` PCM al indexar, carga selectiva `seekg`, GC diferido), puentes JUCE/WASM/WebUI (`95..96`) y `Tests/McxPhase8MultiEngineTests.cpp` (`T1..T6`, `9/9` CTest en `0.72s`). |
| **10** | Rediseño UX WebUI, `McxInstrumentRouteModal` y Drawer 3 Pestañas (Fase 4 — Bloque 4A) | ✅ VERIFICADO (`WebUI HMR 1280×720`) | Tiras de consola limpias (`24 px` botones, badge Motor/Ruta), `<dialog>` `McxInstrumentRouteModal` conectado a catálogo/presets de Punto 1, `McxToneDrawer` en 3 pestañas (`MOTOR` + `EnginePanelHost`, `CANAL / MEZCLA`, `MIDI FX`) sin recortes ni scroll en `1280×720`, `MANUAL_WEB_OVER_200=0` y `0` colores hardcodeados. |
| **11** | Modo Canción (`Song Mode`) + Escenas en Vivo `1..8` (Fase 4 — Bloque 4B) | ✅ VERIFICADO (`5/5 build.bat full`, `10/10` CTest) | `McxSongAndScenes` (`S1..S8` + arreglo 64 bloques lock-free), cuantización exacta en frontera de compás sobre `McxPatternSequencer`, puentes SPSC/DAW/WASM (`11` exports), `Tests/McxPhase9SongScenesTests.cpp` (`T1..T8`, `10/10` suites en verde en `0.78s`), `McxSceneBar` (`Alt+1..8`), `McxSongDrawer` (`Ctrl+M`), integración universal de paneles de motor (`EnginePanelHost`) y cero warnings. |
| **12** | Armario Rack FX Modular 19'' + Patchbay + Carátulas Canónicas (Fase 4 & 5) | ✅ IMPLEMENTADO (`11/11` CTest + WebUI) | Chasis modular 8 bahías (`McxRackChassis`, heap pre-alloc `SlotDsp`, dynamic auto-sleep 0% CPU, sidechain ducking, vúmetros pico dobles IN/OUT con clip hold, serialización JSON), puente `McxRackSlotBridge`, `FxFaceplateModal` en `ABDShared` con carátulas dedicadas (`RE-201`, `Zita`, `BBD Chorus`, `Stereo Delay`, `Saturation`, `Generic`), columna WebUI a la izquierda de Master con cabezal Patchbay 4 envíos, e inserciones de canal directas (`insertSlot`) exclusivas para pistas de audio (`routeMode !== 1`). |
| **12B** | Puerta de Saneamiento Pre-Fase 13 (`[CR-01]..[CR-11]`, Sincronía, `1280x720`, DRY) | ✅ VERIFICADO (`P0–P4`) | Corrección de ruta Master/Multi-Bus FX, bypass/DryWet/motores en Rack, thread-safety audio, contratos WASM/paramIds/velocidad/modales, ergonomía `1280x720`, tokens CSS y saneamiento P0–P4 verificado (`5a27b76` en `ABDShared`, `928a02c` en `ABDMCX0X`). Detalle en [PLAN_SANEAMIENTO_PRE_FASE13.md](file:///d:/desarrollos/ABDSynths/ABDMCX0X/DOCS/PLAN_SANEAMIENTO_PRE_FASE13.md). |
| **13** | Expansión a 64 Pistas (`8×8` Bancos `A..H`), Router MIDI DAW Real y Live Performance | ✅ IMPLEMENTADO (`13A/13B/13C`) | **13A:** Core C++20 `kNumParts = 64` + `McxNativeMidiRouter.h` multipuerto real + escenas `muteMask64` + preset `v2` (`13/13` CTest + JUCE 9 + WASM). **13B:** Mezclador `8×8`, rail vertical `A..H`, `McxBankLayout` (pines/cascada/hueco libre/compactación), selectores de puertos MIDI físicos reales y emparejamiento `StepButtonStrip` + popover. **13C:** Matriz dinámica `A..H × 8` + Mute-Bank 1 clic en `McxSongDrawer`, Live Mute-Bank y atajos directos `Alt+A..H` / `Shift+Alt+A..H` / `Shift+Alt+1..8`. |

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
- [x] Compilación CMake + `McxPhase0Tests.exe` + `McxPhase1Tests.exe` verificados en verde (6/6 CTest suites pasando).

### Fase 2: Puente Hardware Controlador + `ABDBankManager`
- [x] Cola SPSC lock-free `McxMidiOutQueue` (trivially copyable, power-of-2, alignas(64)) de audio/bridge hacia salida MIDI hardware.
- [x] Modos `INT | EXT | BOTH` por Parte con calibración de latencia A/B de muestra exacta (`McxLatencyCompensator`).
- [x] Puente hardware bidireccional aséptico (`McxHardwareBridge`, `McxHardwareInbound`, `McxHardwareProfiles`):
  - **Bidireccionalidad Real Aséptica:** Emisión de notas y parámetros hacia hardware (`routeNoteOn`, `routePartVolume`, `routeSynthFilter`) y recepción en vivo desde hardware (`processInboundMidiBuffer`, `processInboundCc`, `handleCompleteInboundNrpn`) para que girar diales físicos de cualquier máquina controle el software.
  - **Gobierno por Contratos JSON:** Cero bifurcaciones hardcodeadas en C++; control gobernado dinámicamente por perfiles (`boss_dr5.json`, `roland_mc303.json`, `roland_d2.json`, `roland_sc55.json`).
  - Orden estricto Roland (`CC99->CC98->CC6`) y soporte NRPN GS Drum + Roland TVF/TVA.
- [x] **Taxonomía Universal de Roles Semánticos (CDD v2.0), Hidratador C++ Dinámico y Detección Automática:**
  - **Especificación Canónica:** [`UNIVERSAL_SEMANTIC_TAXONOMY.md`](../ABDShared/Contracts/UNIVERSAL_SEMANTIC_TAXONOMY.md) y [`semanticRoles.ts`](../ABDShared/Contracts/semanticRoles.ts) en `@abdsynths/contracts`.
  - **Hidratador Universal Zero-Deps en `ABDShared::SynthCore`:** `SemanticRoleHash.h` (hash FNV-1a en tiempo de compilación), `MiniJsonParser.h` (RFC-8259 puro C++20 sin JUCE ni `nlohmann_json`, apto para Nativo y WASM), `HardwareProfileContract.h` (tablas planas O(1)/O(log N) lock-free/RT-safe) y `HardwareProfileHydrator.h/.cpp`.
  - **Auto-Detección Hardware:** `matchesIdentityReply()` soporta Manufacturer ID de 1 byte (Roland/Korg/Casio/Yamaha) y extendido MMA de 3 bytes (Behringer `00 20 32`) + heurística por nombre de puerto; `McxHardwareInbound` captura automáticamente Universal Identity Reply (`F0 7E ... 06 02 ... F7`) y conmuta el perfil activo en caliente.
  - **Cero perfiles hardcodeados en `ABDMCX0X`:** `McxHardwareProfiles.cpp` eliminado de constantes Roland/Boss; todo el enrutamiento (`routeSemanticParam`, `routeDrumSemanticParam`, `processInboundCc`, `handleCompleteInboundNrpn`) opera exclusivamente sobre el perfil hidratado desde `ABDShared/Contracts/*.json`.
  - **Cobertura Exhaustiva CDD v2.0:** Voz/Unison/Portamento, Osciladores múltiples/PCM/Noise, Filtros multimodo/peine/ZDF, Envolventes multietapa con ciclos/curvas/inversión, LFOs sincronizados con delay/fade, Matriz de Modulación, Pedales GM/GS/XG, Efectos master y Drum Keys.
- [x] Integración `McxBankManagerBridge` C++ (persistencia `abd_mcx0x_preset_v1` JSON + JUCE `ValueTree` + volcados SysEx Roland DT1).
- [x] Suite de pruebas automatizadas `Tests/McxPhase2Tests.cpp` integrada en CMake (58/58 pass).
- **DoD (Fase 2):** Modos `INT/EXT/AB` verificados enviando y recibiendo mensajes NRPN (`CC99→CC98→CC6`) y SysEx `DT1` válidos hacia/desde hardware MIDI y persistiendo bancos en chunk DAW.

### Fase 3: Plugin JUCE 9 + WebView2 Estático + WebUI (`MidiKeyboard`, `Scope` & `DiagnosticProbe`) + WASM
- [x] **Modos / Machine Personas Iniciales (v1 UI):**
  - Expuestos los 3 modos iniciales: **`SuperFree`** (**por defecto**, skins `ms2000`/`ms2000-light` y `neuron-dark`/`neuron-light`), **`MC-303`** (`mc303` / `mc303-light`, límite 28 parciales) y **`DR-5`** (`dr5` / `dr5-light`, límite 19 voces).
- [x] **Temas Light/Dark, Fondo `bg_neutral.webp` e Internacionalización (ES/EN):**
  - Creados y consumidos los temas compartidos de `ABDShared/Assets/styles/themes/` (`mc303`, `mc303-light`, `dr5`, `dr5-light`, `ms2000`, `ms2000-light`, `neuron-dark`, `neuron-light`) con soporte completo de **Modo Claro y Oscuro** y **0 colores hardcodeados**.
  - Fondo metálico tintado con **`ABDShared/Assets/assets/backgrounds/bg_neutral.webp`** a pantalla completa con paneles semitransparentes (`color-mix`).
  - Internacionalización **Español / Inglés** consumiendo **`ABDShared/Components/I18n`**.
- [x] **Nav-Bar Estándar (`SynthNavBar` + `AboutDialog`) y Sonda Diagnóstica 440 Hz (`ABDShared::DiagnosticProbe`):**
  - Barra desktop `File / Edit / Tools / Help` montada con `createSynthNavBar` de `ABDShared` y `AboutDialog` + comprobador de actualizaciones en `Help`.
  - Nuevo módulo de primer nivel `ABDShared/Code/DiagnosticProbe/` (motor C++20 multi-destino 64-bit RT-safe + ventana WebUI flotante arrastrable con onda 440 Hz calibrada por `sampleRate`, `Knob` de volumen y N botones ON/OFF, integrada en `Tools -> 440 Hz Signal Probe...`).
- [x] **Efectos Compartidos (`ABDShared::DspEffects`) + Perfil `RolandGsMc303FxProfile.h`:**
  - Reutilización DRY de `DspZitaReverb`, `DspStereoDelay`, `DspStereoChorus` y `DspFlanger` (DeepMind 12) gobernados por `ABDShared/Code/DspEffects/profiles/RolandGsMc303FxProfile.h` (8 macros Reverb/Delay + 8 macros Chorus/Flanger).
  - **Pendiente de calibración física (`ABDAudioLab`):** medir respuestas al impulso, tasas LFO y curvas `TIME/RATE` y `EFX LEVEL` sobre las unidades físicas MC-303 y DR-5 (`kMeasuredHardware = false`).
- [x] **Audio en Navegador (WASM `AudioWorklet` `-O2`) + Teclado `@abdsynths/midi-keyb` + Scope/VU + 16 Drum Pads:**
  - Desbloqueo automático de `AudioContext.resume()` al primer gesto, compilación `-O2` sin minificar para `AudioWorklet`, ruedas `bender.png` (`wheels.css`, `kbd-buttons.css`), botones `OCT +` / `OCT -` con LEDs, `McxScopeCanvas` (Osciloscopio + Stereo VU), Mezclador 16 Partes, 10 Macros, Vector 2D y carga drag-and-drop `.abdbank`.
- [x] Generador `Scripts/registry_generator.js` desde `abdmcx0x_parameter_spec.json` (`CDD v2.0`) integrado en `build.bat`.
- [ ] **Filtros y Envolventes Intercambiables por Voz (Promoción a `ABDShared`):**
  - Consumo directo de `ABDShared::DspCore::RolandTc6116Tvf` (honrando `IsFilterStage` bajo `DspFilterFamily.h`) y `ABDShared::SynthCore::Envelope5Stage` con tablas `RolandRomLuts.h`.
  - Evaluación modular por voz/parcial para garantizar articulación polifónica individual real sin parafonía.
  - Cero sobrecarga de CPU gracias al motor inline sin vtables y al algoritmo de *Zero-CPU Idle Voice Skipping*.
- [ ] `PluginProcessor` / `PluginEditor` con `JuceWebView2Component` aislado por PID (`WEBVIEW2_USER_DATA_FOLDER`), input bus opcional/desactivado y telemetría SPSC lock-free conectada a `ABDShared::ScopeCoreHeaders` / `ABDShared::ScopeCore` (`D:\desarrollos\ABDSynths\ABDShared\Code\Scope`).
- [ ] Integración WebUI Zero-Fork con componentes y assets de `ABDShared`:
  - **Superficie de Control & Navegación:** `SynthNavBar`, `FitStage` (escalado responsivo en DAW), `MidiLearn` (`midiLearnDrawer.js`, `midiLearnStore.js`) y `ABDBankManager`.
  - **Pantalla & Serigrafía Industrial:** `LcdDisplay` (`LcdMachine.js`, `LcdPanel.js`, `SevenSegmentDisplay.js`) + fuentes `SevenSegment.ttf` y `REGISTER.TTF` de `ABDShared/Assets/fonts/`.
  - **Marcas & Logos Vectoriales:** `Assets/brands/` (`boss-logo.svg`, `roland-logo.svg`, `yamaha-logo.svg`, `korg-logo.svg`).
  - **Deck Superior Desplegable "Nuke / Groove Deck":** (Inspirado en `ABDAxionikVS/WebUI/src/ui/NukeDrawer.ts`): panel deslizante que no cubre el teclado inferior, con 4 perillas Macro de actuación rápida (Cutoff, Reso, Env Speed, Vector Mix), Stick Vectorial 2D central, selector de voces activas y controles físicos de interpretación (Aftertouch, Mod Wheel Depth, Expression).
  - **Ruedas con LEDs & Indicadores Bipolares:** (Inspirado en `ABDEep/WebUI/js/script_controllers_wheels.js` y `Components/Controls/Wheel.js`): Pitch Bend bipolar con barra LED verde/rosa y lectura numérica exacta de semitonos (`+2.00` / `-2.00`), Mod Wheel azul (`0..100%`) y Aftertouch naranja.
  - **Monitor de Voces con Hilera de LEDs:** (Inspirado en `ABDEep/WebUI/js/script_controllers_leds.js`): hilera de LEDs para monitorizar en tiempo real el encendido, liberación y robo (*voice stealing*) de las voces según la Machine Persona activa (16, 28 o 64 voces).
  - **Motor de Acordes Expandido (Chord Memory & Poly Chord):** (Inspirado en `ABDEep/WebUI/js/keyboard_chord_memory.js`): captura en vivo del acorde pulsado en keybed + 12 acordes prefijados, vitaminado con rasgueo (*strum delay* en ms) y cuantización armónica.
  - **Controles Rítmicos y Morphing:** `stepMatrix.js` (matriz de 16 pasos estilo groovebox) y `trajectoryStick2D.js` / `xypad.js` (Morphing Vectorial 4-Partial).
  - **Envolventes & Medición:** `EnvelopeCurve.js` / `multiStageShaperPad.js` (curvas 4T4L interactivas) y `rotaryLedKnob.js` / `ledLadder.js` / `PeakLED.js` / `vuMeter.js`.
  - **Monitor A/B Hardware:** `LiveSysExInspector.js` (inspección de tráfico MIDI/NRPN en vivo contra hardware físico).
  - **Teclado Multitáctil:** `ABDShared/Code/MidiKeyboard` (`@abdsynths/midi-keyb` / `createKeyboard()`): teclado con ruedas Pitch/Mod, Chord Memory, animaciones LED, disparo bidireccional (`INT | EXT | BOTH`), resaltado de 128 teclas de Drum Kit y registro en `host-strip-height.test.js`.
  - **Telemetría en Tiempo Real:** `ABDShared/Code/Scope` (`@abdsynths/shared/scope` / `createScope()` + `ABDShared::ScopeWebAssets`): osciloscopio multirraíl, FFT, espectrograma y `VuMeterRenderer`.
- [x] **Piezas promovidas a `ABDShared` y Nuke Aséptico Universal:**
  - `StickPlayer.h`, `LcdTextFormatter.h` / `LcdMenuFormatter.h`, `VelocitySensitivityCurves.h` promovidos a `ABDShared/Code/SynthCore/` y verificados con tests C++ (Slice 7).
  - Creado `PerformanceDeck` (Nuke Aséptico Universal con Joystick 2D + Motion Recording + 4 Macros + 6 Expresión + Límite de Voces) en `ABDShared/Components/PerformanceDeck/`.
- [ ] **Integración del Nuke Aséptico (`PerformanceDeck`) en la WebUI de `ABDMCX0X` (Cajón superior de Performance).**
- [ ] Compilación Emscripten `wasm/build_wasm.bat` compartiendo `DspSources.cmake` + verificación de paridad numérica Nativo ↔ WASM.
- **DoD (Fase 3):** Compila `Standalone`, `VST3` y `WASM AudioWorklet` mediante `./build.bat`, arranca con HMR de Vite o bundle `BinaryData`, `MidiKeyboard` y `Scope` rinden sin errores de consola y la WebUI mueve todos los controles.

### Fase 4 y 5: Ecosistema `ABDNeuModMakr` / `ABDAudioLab`, Telemetría A/B y Formato Propietario Expandido
- [x] **Carga y Des-horneado de Contenedores `.abdbank` (`McxBankLoader`):** Descompresión en streaming C++20 de archivos ZIP sin comprimir, carga de ondas PCM, mapeo de kits y choke de hi-hats `muteGroup 1` (10/10 tests pass).
- [ ] **Soporte de Mezcla Multi-Banco `.abdbank` por Pista:**
  - Permitir que diferentes partes carguen instrumentos de archivos `.abdbank` distintos (ej. Pista 10 Kit de batería de `MC303_Drums.abdbank`, Pista 1 Bajo de `Acid_Moog.abdbank`, Pista 2 Lead de `SC55_Leads.abdbank`).
  - Coexistencia en un *Wave Pool* unificado sin colisión de identificadores.
- [ ] **Estrategia Dual de Guardado de Proyecto DAW:**
  - **Modo Ligero (Referencial por Defecto):** El chunk DAW almacena los parámetros de las 16 partes y las rutas/referencias a los archivos `.abdbank`, manteniendo los proyectos de Cubase/Ableton/FL en apenas unos kilobytes.
  - **Modo Monolítico / Bundle (Exportación con Tree-Shaking):** Generación de un archivo `.abdbank` de proyecto que incrusta únicamente las muestras PCM utilizadas por las partes activas, descartando las no utilizadas para facilitar el intercambio entre diferentes ordenadores.
- [ ] Exportador/Empaquetador en `ABDNeuModMakr`: ingesta offline de samples externos y exportación al **formato propietario expandido `abd_structured_rompler.schema.json`** (`.abdrompler.json` / `.abdbank`).
- [ ] **Consumo Exclusivo del Formato Propietario en `ABDMCX0X`:** El sintetizador consume únicamente cápsulas y bancos en formato `abd_structured_rompler` (ondas des-horneadas, parámetros multirítmicos de 4 parciales estéreo y drum racks), con validación de integridad SHA256 y bounds de memoria.
- [ ] **Vitaminado Virtual Analógico (VA) rescatado de `_Deprecados/ABDSharedCode/DspCore`:**
  - Migración a `ABDShared::DspCore` de filtros analógicos para enriquecer los parciales: `DspMoogLadder.h` (Ladder VCF 24dB), `DspJunoVCF.h` + `DspJunoHPF.h` (Roland IR3109 VCF + OTA HPF) y `DspKorgMS20.h` (Sallen-Key ácido).
  - Oscilador analógico enriquecido: `OscVcoCa72.h` (núcleo analógico CEM3340 Curtis) con modulación PWM y modulación cruzada Sync/RingMod entre parciales híbridos (muestra + analógico virtual).
- [ ] Ajuste de curvas `LutDSP` reales tras medir físicamente **MC-303**, **D-2**, **SC-55** y **Rave-O-Lution 309** con `ABDAudioLab`.
- [ ] **Comparación Objetiva A/B en Vivo:** Conectar `ABDShared/Code/AudioComparator` (`AudioABComparator.cpp`, `AudioABVerdictEngine.cpp`) para alineación temporal automática y correlación espectral objetiva entre el motor DSP interno y el hardware físico (**Boss DR-5**, **MC-303**).
- [ ] Verificación final de `ABDShared/Code/MidiKeyboard` (`host-strip-height.test.js` con entrada `ABDMCX0X`) y `ABDShared/Code/Scope` (comparación visual A/B en vivo Hardware vs DSP + comprobación en WebView2 real).
- [ ] Validación `pluginval` strictness 10 sin fallos ni memory leaks.

---

## Hoja de Ruta Consolidada — Groovebox Modular de 16 Partes (Ver [`DOCS/VISION_GROOVEBOX_16P.md`](DOCS/VISION_GROOVEBOX_16P.md))

> **Cambio rector de producto (2026-11-17):** Se eliminan los modos limitadores (`SuperFree`, `MC-303`, `DR-5`); el instrumento pasa a ser una **Groovebox / Workstation modular de 16 partes** a plena capacidad, conservando `ms2000`, `neuron`, `mc303` y `dr5` (Claro/Oscuro) únicamente como **Temas Visuales**. El hardware externo se relega a la fase final como **controlador de entrada** asociado a perfiles completos de `MIDI Learn`.

### Bloque 1 — Fase 3C: Paridad del Host Nativo JUCE 9 (Standalone + VST3 + WebView2)
- [x] **Router único de parámetros anti-drift (`Source/Core/McxParamRouter.h`):** tabla/switch único de 25 parámetros (`0..24`) compartido entre `WasmBridge.cpp` y `PluginProcessor.cpp`.
- [x] **Orden CMake JUCE 9 + `ABDShared`:** JUCE 9 + WebView2 estático cargados antes de `ABDShared/Code` cuando `MCX_HEADLESS_ONLY=OFF`.
- [x] **Host `PluginProcessor.cpp` RT-safe:** `McxFactoryBank`, hidratación JSON de `ABDShared/Contracts/`, `juce::MidiMessageCollector` lock-free para notas WebUI, double-buffer atómico de telemetría (`peakL/R`, `activeVoices`, `sampleRate`, `samplesL[128]`), y persistencia DAW (`APVTS` + JSON).
- [x] **Editor `PluginEditor.cpp` + `McxHostBridge.ts`:** migrado a `abd::webview2::JuceWebView2Component`, sondeo `http://localhost:5330` + fallback offline `WebUI/dist`, canal bidireccional completo `mcxEvent` / `onNativeTelemetry` y `loadBankBase64`.
- [x] **Build unificado `build.bat full`:** genera bundle offline `WebUI/dist` (Vite) antes de compilar `ABDMCX0X_All` (Standalone + VST3).
- [x] **Verificación en máquina real:** `.\build.bat full` completado sin errores (Standalone + VST3 + WASM).

### Bloque 2 — Slice 1 (Cimiento 16 Partes + `<WorkingDir>` + Contratos) ✅ & Slice 2 (Crecimiento Bank Manager Compartido) ⏳
- [x] **Slice 1 — Cimiento 16 Partes Libres + Ajustes Globales + `<WorkingDir>` + Contratos Propietarios:**
  - Eliminados modos limitadores (`SuperFree`/`MC-303`/`DR-5`) de la UI; expuestas las **8 familias visuales de `ABDShared` + `ABDNeuModMakr`** (`MS2000`, `Axionik/Neuron`, `MC-303`, `DR-5`, `Virus Snow`, `AudioLab`, `Advanced`, `CZ-101`, cada una en Claro y Oscuro = 16 temas).
  - 16 partes libres con `McxPartKind::Chromatic | DrumMap` (Parte 10 `DrumMap` por defecto), canal MIDI receptor editable (`CH1..16` con soporte *layers*/*splits* `keyLow..keyHigh`), `Mute`/`Solo` por parte y Drum Pads conectados a la parte `DrumMap` activa.
  - `McxSystemSettings.h` + `McxSettingsModal.ts`: persistencia local de `<WorkingDir>` compatible con `AxionikDB` (con selector de carpeta nativo `juce::FileChooser` + scaffold automático `Models/Presets/Banks/MidiLearn`), Polifonía máx. (`8..64`), Afinación Maestra `A4` (`415..466 Hz` real en DSP) y BPM Standalone (`40..240`).
  - Contratos en `ABDShared/Contracts/`: `abd_structured_rompler.schema.json` (`v1.1.0`, retrocompatible) + nuevos `abd_part_preset.schema.json` y `abd_multi_preset.schema.json`.
- [ ] **Slice 2 — Crecimiento del Bank Manager Compartido (`ABDShared/Components/bank` + `ABDAxionikVS` + `ABDMCX0X`):**
  - Ampliar el Bank Manager visual para navegar **Modelos** (Rompler Cromático, Drum Maps, Wavetables, Spectral) + **Presets de Parte** + **Presets Multi (16P)** usando `bankCategories.js` (`cat-0..cat-9`) e imágenes de `ABDNeuModMakr`, con búsqueda, favoritos y pre-escucha.
  - **Especialización Rompler/PCM para ABDMCX0X:** El Bank Manager en ABDMCX0X debe filtrar y mostrar exclusivamente las partes de la librería rompler/sampler/drum kits de ABDMCX0X, sin mezclar las partes sintéticas de AxionikVS. Soporte de sub-librerías en subcarpetas (`<WorkingDir>/Presets/Parts/`) e índice `favorites.json`.
  - **Revisión del flujo Drag & Drop y Carga On-Demand de Instrumentos (Optimización de Memoria):**
    - *Problema a evitar:* Cargar el banco `.abdbank` completo a memoria RAM satura el sistema con muestras no utilizadas, ya que cada parte solo ejecuta un instrumento concreto.
    - *Evolución del Bank Manager:* Diferenciar jerárquicamente Bancos (`.abdbank`), sus Instrumentos (`tones`/`drumKits`) y Presets (`.abdpart`), permitiendo inspeccionar el contenido del banco y cargar en memoria activa **exclusivamente el instrumento seleccionado por parte**.
    - *Rol de Drag & Drop de `.abdbank`:* Arrastrar un archivo `.abdbank` externo sobre la ventana debe actuar como importador que copia el archivo al `<WorkingDir>/Banks/` local (si no existe), indexándolo en el catálogo sin volcar ciegamente todas sus ondas a RAM.
- [ ] **Transposición Global y en Vivo al Vuelo:**
  - `SynthCore/MusicalScaleTransposer.h` (semitonos `-24..+24` + Escala/Tonalidad `O(1)`) + **función nativa en `@abdsynths/midi-keyb`** (resaltado de escala y transposición en vivo, ignorando Drum Maps).
  - **Transposición Directa por Teclado (MC-303 Style):** Permitir transponer en vivo manteniendo pulsado el botón TRANSPOSE y tocando una tecla del teclado (virtual o MIDI), fijando la tonalidad/raíz de forma ergonómica e instantánea para directos sin pasar por menús.
- [ ] **Canal de Mezcla por Parte (Full-Height) + Paneles Deslizantes Inferiores (Bottom Drawers):**
  - **Consola 16 Canales Alargada (Full-Height Strips ~480px libres):** P01..P16 verticales con fader largo (120-140px) y vúmetro estéreo contiguo, envíos auxiliares (`Send A/B`), `PAN`, `Mute` y `Solo` iluminados, ruteo MIDI, `TR` (seguimiento de transposición), y potenciómetro de **Glide / Portamento por Canal MIDI** (`GLD` 0..500 ms, estándar GM2/GS CC 5 y CC 65, atenuado para batería).
    - *Unificación Visual de Vúmetros (Completada):* Vúmetros de canal y vúmetro de columna Master unificados bajo la misma estética canónica de puente de medición de estudio (`StereoVuMeter` en `ABDShared`), con 8 segmentos LED discretos (`is-low` cian, `is-mid` ámbar, `is-hot` naranja, `is-peak` rojo), pista oscura encastrada `#04070b`, brillos especulares y halos de difusión realistas, eliminando iluminaciones falsas por hover.
    - *Telemetría C++ DSP de Pista (Completada):* `McxEngine::processAudio` calcula y almacena `partPeaks[16]` en cada bloque; publicado en el snapshot lock-free `McxTelemetrySnapshot` de `PluginProcessor` y en `WasmBridge` hacia la WebUI vía `BridgeWasm::onTelemetry` y `McxHostBridge`, alimentando los 16 vúmetros en vivo (`updatePartMeter`).
    - *Alineación de Botonera 16 Pasos y LCD Strip:* Espaciados, hit-targets táctiles, alineación horizontal a 1280 px y consistencia visual retro-moderna.
  - **Lanzaderas de Cajón en Canal:** Cada canal incorpora botones dedicados `[ TONE ]` y `[ PADS ]` para abrir el panel contextual correspondiente.
  - **Paneles Deslizantes Inferiores Independientes (Bottom Drawers):** Emergen desde arriba del teclado virtual (`bottom: 104px`) hacia arriba, cubriendo los 16 canales de la consola sin tapar la barra superior ni la tira de 16 botones (`StepButtonStrip`):
    - **Cajón 1 — Tono & FX:** Edición profunda del canal (Osciladores, 2 Filtros en serie, Envolventes, ModMatrix, Envíos). **Sin pestañas internas redundantes:** sincronizado en tiempo real con la tira superior de 16 botones (`PART SEL` cambia de pista instantáneamente, `PART MUTE` refleja o conmuta el mute). Solo se cierra desde su botón propio `[ ✕ ]` o el botón toggle del canal.
      - *Reorganización Modular Hardware (Completada):* Deck 1 superior dividido en 5 tarjetas atómicas (1A Estructura & Ruta, 1B Afinación, 1C Glide & Vector 2D, 2A Filtros Duales VCF 1 → 2 en Serie, 2B Saturación/Drive) y Deck 2 inferior dividido en 4 tarjetas (3 Envolvente VCA, 4A EQ 3-Bandas, 4B Salida de Canal, 4C Buses de Envío Auxiliar).
      - *Eliminación de `<select>`:* Sustituidos por botoneras segmentadas compactas (`.mcx-seg-btn`) idénticas a `ABDAxionikVS` (`PAR|RING|BOOST|VEC`, `INT|EXT|BOTH`, `ALWAYS|LEGATO`, `LPF|HPF|BPF|OFF`, modelos `SVF|TVF|MS20|LADD|Z-PLN|TC61`).
      - *Cadena de Filtros en Serie y Reglas Anti-Conflicto:* Tipo de filtro colocado antes del modelo en VCF 1 y VCF 2. Asociación dinámica de modelos según el tipo. Detección y bloqueo visual/operativo de tipos duplicados (ej. LPF → LPF vetado en serie) y modelos duplicados, con advertencia y reajuste automático.
      - *Catálogo Canónico Universal en ABDShared (`Contracts/filterRegistry.ts`):* Metadatos de filtro (id, numericId, familia, modos soportados, pendiente, saturación/drive) y validador de conflictos en serie promovidos a `@abdsynths/contracts` con suite de tests Vitest (5/5 pass).
    - **Auditoría Paramétrica: Separación Estricta Parámetros Locales vs Globales en Deslizante:**
      - **Parámetros Locales por Canal:** Afinación (Coarse/Fine), Glide, Filtro (Cutoff, Reso, Modelo), Saturación/Drive, Envolvente ADSR, EQ paramétrico de parte, Nivel, Pan, y **Envíos Auxiliares con selector Pre-Fader / Post-Fader** (`Send A..D`).
      - **Parámetros Globales (Master / Bus de Efectos):** Conversor D/A (`dacCharacter`), Efectos Master (`reverbMacro`, `reverbTime`, `chorusMacro`, `chorusRate`), y Estructura global. Se revisará parámetro por parámetro para separar limpiamente la edición de canal de los controles del bus Master FX.
    - **Cajón 2 — Matriz de Pads Universal (`MpcPadMatrix` en `ABDShared`):** Componente aséptico 4x4 reutilizable para toda la suite: Modo Ritmo (sonidos de batería, notas MIDI, choke groups) y Modo Cromático (notas y octavas, selector de escalas, modo In-Key, 16-Levels). Sincronizado también con la tira de 16 botones superiores para alternar pistas al vuelo.
    - **Cajón 3 — Pianola / Piano-Roll Seq (`PianoRollModal` en `ABDShared/Components/PianoRoll`):** [Completado e Integrado]
      - Rollo de pianola aséptico universal promovido a `ABDShared` con conmutación dinámica Chromatic / Drum Grid.
      - Grid snapping configurable (`OFF / Libre`, `1/4`, `1/8`, `1/16`, `1/32`, `1/16T`) y Shuffle / Swing (`50%` a `75%`).
      - Carril inferior con línea de umbral de acento Roland (`VEL > 100`) y visualización de envolventes de automatización.
      - Grabación y reproducción de movimiento de parámetros (Cutoff, Resonance, Pan, Envíos) con actualización visual reactiva de controles en tiempo real.
      - Integración de acceso directo: botón `[ SEQ ]` en cada pista de mezcla, entrada en menú Herramientas y atajo `Ctrl+P`.
  - **Ergonomía Tablet Táctil 10 Pulgadas (1280 x 720 / 1280 x 800):**
    - Hit targets táctiles de mínimo 44px.
    - Controles de lectura rápida en mesa vs edición profunda en cajón inferior.
    - [x] **Botón de Colapso del Teclado Virtual (Completado):** `@abdsynths/midi-keyb` configurado con `enableCollapse: true`, listener `onCollapseChange` y estilos CSS `.mcx-keyboard-dock.is-collapsed` reduciendo el dock a 36px y ocultando ruedas/octavas para ganar el 100 % del alto vertical en pantallas compactas o controladores MIDI externos.
  - **Utilidad de Acordes (Chord Mode / Chord Performer — Anotado para Investigación):**
    - Apuntado para investigar referencias de mercado (MPC Chord Mode, Launchpad Chord Mode, Reason Scales & Chords) para disparo de acordes diatónicos por pad/tecla, Chord Memory y rasgueo (*strum delay* en ms).
  - **Acento Dinámico Roland (Velocidad > 100):** Comportamiento clásico MC-303/TB-303 con umbral `velocity > 100` que activa dinámicamente apertura de filtro VCF, pegada de ataque VCA y mordida de decay en partes cromáticas y de batería.
  - **2 Filtros en serie (`Filter 1 → Filter 2`)** con bypass individual (0 % CPU), selección en 2 pasos (familia `LPF/HPF/BPF/Notch/Comb/Z-Plane` → modelo DSP concreto de `ABDShared::DspCore`).
  - **EQ Paramétrico ligero + Drive** por parte (`DspMidasEQ` / `CascadeShelfEq` + `DspSaturation`, bypass 0 % CPU en reposo) + Pan + Volumen + Mute/Solo + **4 envíos (`Send A..D`) con nivel independiente y Pre/Post-Fader**.
  - **4 LFOs Globales + 2 LFOs Locales por parte** con Mute y auto-skip 0 % CPU + **ModMatrix por parte** (`ABDShared/SynthCore/ModMatrix.h`, control-rate 16–32 muestras) con **Via-Attenuator (`Source × Via`)** para envolventes sobre LFOs globales + **Accent Acid por velocidad**.
  - **Edición completa por sonido/pad en Drum Maps (paridad MC-303+):** Attack, Decay/Release, Pitch Coarse/Fine, Volume, Pan, Cutoff/Reso, Choke `0..15`, One-Shot/Gated, Start/End/Reverse, Accent y envíos `Send A..D`.
  - **Master Safety Limiter / Soft-Clipper** tras el volumen Master + indicador Peak/Clip.

### Bloque 3 — Rack FX Master Multi-Slot Modular (`ABDShared`) y Armario de Rack 19'' con Patchbay
> **Especificación Detallada:** Ver [DOCS/PLAN_RACK_FX_ARMARIO_MODULAR.md](file:///d:/desarrollos/ABDSynths/ABDMCX0X/DOCS/PLAN_RACK_FX_ARMARIO_MODULAR.md)
- [ ] **Armario de Rack 19'' de Estudio (8 Bahías + Cabezal Patchbay de Envíos):**
  - **Ubicación en UI:** Columna dedicada a la izquierda del panel Master (`.mcx-master-col`), respetando el flujo de señal analógico `Pistas -> Rack FX -> Master Output`.
  - **Cabezal Patchbay Superior:** Administra los 4 envíos auxiliares (`Send A..D`), niveles de retorno, topología conmutable e inyecciones en cascada. Botón `[ VER TOPOLOGÍA ]` que abre la modal gráfica existente (`MultiBusFxRackModal`).
  - **8 Bahías / Slots de Efectos:** Unidades modulares configurables con color base (`baseColor`) e icono (`icon`) definidos por cada efecto en `ABDShared`. Cada unidad cuenta con interruptor Bypass/Power (0% CPU), nombre editable (`[RE-201] Ecos Largos Lead`), botones para reordenar/desmontar y doble vúmetro estéreo horizontal (`IN L/R` y `OUT L/R`) con peak hold de clip.
  - **Alcance Exclusivo Pistas de Audio:** Solo las pistas con audio local (`routeMode !== 1`) disponen de envíos e inserciones hacia el rack; las pistas MIDI externas (`routeMode === 1`) no participan en la ruta de audio.
  - **Ahorro Inteligente de CPU (0% CPU):** Bypass manual, corte de ruteo huérfano y Auto-Sleep dinámico con detector de cola (*tail decay counter*) tras silencio ($-90\text{ dBFS}$).
  - **Carátulas y Presets Centralizados en `ABDShared` (Filosofía DRY):** Carátulas específicas (*Space Echo RE-201*, *Zita Reverb*, *Roland BBD Chorus*, *Stereo Delay*, *Tape Saturation*) centralizadas en `ABDShared/Components/FxFaceplates/` y consumidas de forma universal sin duplicación de código.
- [ ] **WebUI Zero-Fork con Drawers deslizantes:** `Knob` de `ABDShared`, `TrajectoryStick2D`, `@abdsynths/shared/scope` flotante, `EnvelopeCurve.js`, Drawers dedicados (Filtros 1/2, Envolventes, ModMatrix, EQ/Drive, Pad Editor), **Undo/Redo (`Ctrl+Z`/`Ctrl+Y`) + Compare (`A/B`)**, búsqueda/favoritos/pre-escucha en Bank Manager, y alta en `host-strip-height.test.js`.

### Bloque 3B — Promoción de Piezas Transversales a `ABDShared` (Filosofía DRY) & Nuke Universal
- [x] **Promoción de componentes DSP/Core a `ABDShared`:**
  - `StickPlayer.h` (`ABDShared/Code/SynthCore/StickPlayer.h`): Motor determinista de reproducción de trayectorias vectoriales en tiempo real.
  - `LcdTextFormatter.h` / `LcdMenuFormatter.h` (`ABDShared/Code/SynthCore/LcdTextFormatter.h`): Formateador canónico C++20 desacoplado para pantallas LCD 16x2 / 20x2.
  - `VelocitySensitivityCurves.h` (`ABDShared/Code/SynthCore/VelocitySensitivityCurves.h`): Curvas de dinámica (Lineal, Exp, Log, S-Curve, Fija).
  - Suite de tests en `McxPhase4Tests.cpp` (Slice 7) y `SynthCoreTests.cpp` completada.
- [x] **Extracción de Nuke Aséptico Universal a `ABDShared` (`PerformanceDeck`):**
  - Creado `ABDShared/Components/PerformanceDeck/` (`performanceDeck.js`, `.css`, `.d.ts`) y exportado en `@abdsynths/shared/components`.
  - Panel deslizante superior aséptico que no solapa con el teclado inferior: Joystick 2D con grabación de movimiento (`TrajectoryStick2D`), 4 macros, 6 controladores físicos y selector de polifonía.
- [ ] **Integración del Nuke Aséptico (`PerformanceDeck`) en `ABDMCX0X`:**
  - Instanciar `PerformanceDeck` desde `@abdsynths/shared/components` como cajón superior ("Groove & Performance Deck") accesible desde la barra superior (`PERF / NUKE`).
  - Conectar sus 4 perillas Macro a los controles globales/rápidos de la Groovebox (Macro 1: Master Cutoff, Macro 2: Master Resonancia, Macro 3: Env Speed / Decay, Macro 4: Vector Mix).
  - Conectar el Joystick Vectorial 2D central (`TrajectoryStick2D`) al plano de Morphing de parciales de la parte activa, con **grabación de movimiento en vivo (Motion Recording)** y playback en bucle con estela SVG (sincronizado con `StickPlayer.h` en C++).
  - Conectar la hilera de 6 controladores de expresión física (Pitch Bend, Mod Wheel, Aftertouch, Breath, Foot, Expression) con sus potenciómetros de profundidad bipolar a los parámetros de interpretación y modulación de la parte seleccionada.
  - Conectar el selector de límite de polifonía de voces a `McxEngine::setMaxPolyphony` y telemetría de voces.

### Bloque 4 — Secuenciador / Matriz de 16 Pasos (Estilo Groovebox MC-303), Pianola y Transporte
- [x] **Motor C++20 y Contrato de Patrón Universal en `ABDShared` (`PatternSequencerEngine.h` & `abd_pattern.schema.json`):**
  - C++20 RT-safe en `ABDShared/Code/SynthCore/PatternSequencerEngine.h` basado en ticks PPQ (96/480), bucles de compases múltiples (1..32), reproducción de notas, acentos Roland (`vel > 100`), swing MPC y automatización de parámetros continua.
  - Contrato JSON `abd_pattern.schema.json` y `abdPattern.ts` en `@abdsynths/contracts` (validado con 31/31 tests).
  - Test suite en C++ (`testPatternSequencerEngine`) en `SynthCoreTests.cpp`.
- [x] **Utilidad Universal `PianoRollModal` en `ABDShared` (`ABDShared/Components/PianoRoll/`):**
  - Desarrollada la utilidad universal modeless (`pianoRollModal.js`, `pianoRollCanvas.js`, `pianoRollVelocityLane.js`, `pianoRollViews.js`) en módulos `< 200` líneas.
  - **Vistas duales:** *Piano Roll Cromático* (teclado vertical) y *Drum Grid Rítmico* (nombres de los instrumentos del kit).
  - **Carril inferior de velocidad y automatización:** Detección de acento analógico Roland con línea de umbral destacada en **100** (`vel > 100 = ROLAND ACCENT`) y etiqueta `[ACC]`.
  - **Grabación y reproducción de movimiento de parámetros (*Motion Recording*):** Registro continuo de curvas para Cutoff, Resonance, Pan, etc. con reproducción reactiva en los controles visuales.
  - Validada con Vitest en `ABDShared/tests/pianoRollModal.test.js` (5/5 tests pass).
- [ ] **Integración en `ABDMCX0X`:**
  - [x] Conectar la tira de 16 botones superiores (`McxStepStrip`), el transporte maestro (`McxMasterPanel`) y `PianoRollModal` al secuenciador nativo C++20 `McxPatternSequencer` como espejo pasivo del reloj DSP (`Play`/`Stop`, `Bars`, `Swing`, patrones, *Motion Recording*, `onNotePreview` y *chaser* por telemetría). *(Verificado en `.\build.bat full` — `8/8` CTest.)*
  - [ ] Conectar la matriz de pads (`McxPadsDrawer`) para grabación en vivo y mapeo directo al secuenciador.
- [ ] **Secuenciador / Matriz de 16 Pasos Directa por Parte (`stepMatrix`):**
  - Tira/matriz de 16 pasos estilo groovebox física MC-303 / TR-REC para programar, disparar y monitorizar patrones rítmicos o melódicos en tiempo real por parte.
  - Botones con LEDs de paso (`step-led`), estados: apagado, activo, acento y paso de cabezal de reproducción en vivo.
  - Selección de parte activa mediante selector instantáneo y edición rápida de notas por paso.
- [ ] **Transporte completo + Reloj Dual:** `Play`, `Pause`, `Stop`, `Record` (*overdub/replace*), `Rew`/`FF` por compás, `Return to Zero`, `Loop`, `Metrónomo` + `Count-in (1/2 compases)` + `Tap Tempo`; `Host Sync` (VST3) / `Internal` (Standalone/WASM).
- [ ] **Utilidades MIDI de Inserción por Parte:** `GrooveArpeggiator`, **Note Repeat / Roll**, **Pad Perform** (Escalas/Acordes), **16 Levels** (Tune/Vel/Cutoff/Decay/Attack), **MPC Swing (`50..75 %`) + Humanize**, y volcado (*print*) de Arp/Acordes al Piano Roll.
- [ ] **Estudio e Integración de Bancos Sliced (Loops tipo REX2 / Recycle):**
  - Análisis de contenedores y bancos de sonido con samples troceados por transitorios/slices.
  - Reproducción sincronizada al tempo sin timestretching destructivo mediante secuencia MIDI/trigger interna por defecto asociada al loop.
  - Mapeo automático de los slices a la matriz de 16 pads / teclas cromáticas con disparo One-Shot y choke groups dedicados.
  - Exportación de la secuencia de disparo a la pista del secuenciador o Piano Roll para edición y reordenación creativa de slices (*drum breaks slicing*).
- [ ] **Funciones Avanzadas de Cuantización y Shuffle / Swing:**
  - Cuantización de notas (tanto en grabación en vivo como post-edición): rejillas 1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32 y 1/64.
  - Parámetro de intensidad de cuantización (*Quantize Strength / Magnetismo* de 0 % a 100 %).
  - Algoritmo de Shuffle / Swing configurable (rango 50 % a 75 % estilo Akai MPC / Roland TR-909 / LinnDrum) con micro-timing dinámico en pulsos pares.
  - Opciones de humanización (micro-offsets aleatorios controlados de tiempo y velocidad).
  - **Soporte de Secuencias para Bancos Sliced Loop / REX2:**
    - Carga automática de la secuencia / patrón por defecto cuando un `.abdbank` sea de tipo sliced loop (slices mapeados a notas consecutivas con sus puntos de disparo originales).
    - Edición, audición y re-ordenación de slices en el Piano Roll (`drum` / slice grid).
  - **Importación y Exportación de Secuencias (`.abdseq` / JSON):**
    - Exportar secuencias a disco local / descarga de navegador en formato JSON `.abdseq`.
    - Importar secuencias arrastrando archivos sobre la modal de pianola o mediante el selector de archivo.
    - Persistencia en `<WorkingDir>/Sequences/` accesible desde el explorador del instrumento.
- [x] **Modo Canción (`Song Mode`) y Escenas en Vivo (`1..8`) cuantizadas al compás (Bloque 4B — ✅ VERIFICADO `10/10` CTest):** `McxSongAndScenes` + `McxSongJsonCodec` + `McxSceneBar` (`Alt+1..8`) + `McxSongDrawer` (`Ctrl+M`) + `McxPhase9SongScenesTests.cpp` (`T1..T8`, `100 % pass`). Pendiente futura: exportación **`.mid` multipista**, **`.wav` Master / Stems por parte** y *Drag-to-DAW*.

### Bloque 4B — Soporte Multi-Banco `.abdbank` por Pista (`✅ VERIFICADO — Punto 1 / 9/9 CTest`)
- [x] **Mezcla Multi-Banco `.abdbank` en Wave Pool Unificado (`McxPhase8MultiEngineTests` T4..T6):**
  - Permitir que diferentes pistas de las 16 partes carguen simultáneamente sonidos de distintos contenedores `.abdbank` (`McxMultiBankManager` + `RomplerWavePool` compartido en `McxEngine`).
  - Coexistencia en el *Wave Pool* unificado sin colisión de identificadores (`(bankId, waveId)`) y deduplicación por *refcounting*.
  - Carga selectiva on-demand vía `RomplerBankIndex` (`McxLibraryService` indexa disco con `0` bytes PCM decodificados y carga solo las ondas del Tone/Kit elegido con GC diferido `collectUnusedWaves()`).

### Bloque 5 — Performance Avanzada, Multi-Motor, Multi-Out y Hardware vía MIDI Learn
- [ ] **Performance en directo:** **Megamix** por parte cuantizado al compás, **Escenas / Hotcues (`1..8`)**, capas por pad (*Velocity Zones / Round-Robin*), Track/Pad Mute cuantizado y Q-Links contextuales.
- [ ] **Guardado Dual DAW + Multi-Out VST3 + Nuevos Motores:** chunk referencial ligero vs bundle portable `.abdbank` con *tree-shaking*; salidas estéreo auxiliares opcionales en VST3; ampliación de motores por parte (`VA`, `FM`, `Spectral/DDSP`).
- [ ] **Hardware Externo como Controlador de Entrada (`MIDI Learn` automático):** detección con `ABDShared::HardwareMidiDetect` cargando perfiles completos de `ABDShared` `MIDI Learn` (`<WorkingDir>/MidiLearn/<device>.json`) para MC-303, DR-5, controladores MIDI, etc.

---

### Backlog Compartido (`ABDShared`) — Componente Modular de Rack de Efectos, Inserciones y Carátulas Canónicas
- [x] **Arquitectura de Enrutamiento Flexible (Multi-Entrada & MultiBus):**
  - Implementado en `ABDShared::MultiBusFxRack` (`MultiBusFxRackModal`, `MultiBusFxRackLcd`): 4 buses de envío estéreo (A..D) asignables a 8 bahías físicas del armario modular 19'' o ruteo interno.
  - Topologías intercambiables: Paralelo, Cascada Serie (1->2 | 3->4, etc.) y Mixto con matriz CRT LCD reactiva.
  - Sincronía determinista de bahías (`syncSlotIndices()`, `rackSlots.indexOf(b)`) para ruteo consistente de títulos, selectores y carátulas.
- [x] **Modal de Edición Dedicada por Efecto con Carátula Propia (`FxFaceplateModal` en `ABDShared`):**
  - Al pulsar `[ Editar Carátula B# ]`, se abre `FxFaceplateModal` con su propia interfaz fotorealista:
    - `Re201Faceplate.js` (Roland Space Echo con cinta animada y selector de 12 modos).
    - `ZitaReverbFaceplate.js` (visualizador de curva y damping).
    - `BbdChorusFaceplate.js` (Roland Juno BBD con modos I, II, I+II).
    - `StereoDelayFaceplate.js` (delay BPM sync con ping-pong).
    - `SaturationFaceplate.js` (emulación de cinta y válvulas con 4 curvas de saturación).
    - `GenericFxFaceplate.js` para cualquier algoritmo adicional.
- [x] **Cadena de Plugins e Inserciones MIDI en la Pista (`McxToneTabMidiFx`):**
  - Estructuración en 4 etapas: (1) Fuentes & Edición de Secuencia (Pianola y Pads MPC 4x4), (2) Inserción MIDI 1: Arpegiador Groove (`GrooveArpeggiatorModal`), (3) Inserción MIDI 2: Escala y Transposición, y (4) Macros de Pista (offsets semánticos no destructivos).
  - Selector de Cuantización de Entrada (`REC Q: OFF | 1/8 | 1/16 | 1/32`) en `MpcPadModal.js` para grabación en tiempo real en la pianola con 0 ms de latencia auditiva.
- [ ] **Calibración Física de Efectos (`ABDAudioLab`):**
  - Medir en hardware real (**Roland MC-303**, **Boss DR-5**) las curvas `TIME/RATE`, `EFX LEVEL`, tiempos de tap y respuestas al impulso para pasar `RolandGsMc303FxProfile::kMeasuredHardware` de `false` a `true`.

---

### Fase 12B — Puerta de Saneamiento Pre-Fase 13 (Completada antes de Fase 13)

> Plan de ejecución detallado, anclajes por archivo y lista completa de verificación en [PLAN_SANEAMIENTO_PRE_FASE13.md](file:///d:/desarrollos/ABDSynths/ABDMCX0X/DOCS/PLAN_SANEAMIENTO_PRE_FASE13.md).

- [x] **Oleada P0 — Bloqueantes Críticos DSP, Realtime, Contratos y Modales (`[CR-01]`..`[CR-11]`):**
  - Corregir ruta Master y Multi-Bus FX cuando existen bahías activas en `McxOutputAndFx`, implementar bypass real/Dry-Wet y ramas DSP faltantes en `McxRackChassis`, eliminar mutaciones desde el hilo UI hacia el DSP en `PluginEditor` / `McxRackBridgeHelpers`, evitar cortes y doble procesado en inserciones directas y remapear rutas al mover ranuras + cablear parámetros reales en `McxRackSlotBridge`.
  - Reparar tabla `mcxParamIds.ts` y contrato `GlobalLfoModal`, corregir escala de velocidad `8..127` en `McxMidiModalsFactory`, arreglar `McxSynthModal` (pantalla en blanco y modo modeless), exportar `_drainMidiOut` con selección real de puerto WebMIDI, corregir `PianoRollModal` (`this.opts`/`partIndex` y cuantización) y pasar `MpcPadModal` a `show()`.
- [x] **Oleada P1 — Sincronía de los 3 Mundos (C++ / WASM / WebUI) y Persistencia (`[ME-06]`..`[ME-08]`, `[DT-01]`..`[DT-03]`, `[DT-06]`):**
  - Cablear controles placebo de `multiBusFxRackModal.js`, WASM y `McxMasterPanel`, persistir nombres de presets guardados, asegurar resincronización DAW/WebUI vía `uiReady` sin sobrescribir con `localStorage`, centralizar sincronía de pista/formato en `McxAppState`, desacoplar `onAudioStatus` y sustituir `lfoPhase` simulado por telemetría DSP real.
- [x] **Oleada P2 — Ergonomía `1280x720`, Ventanas Modeless y Claridad UX (`[ME-09]`, `[DT-04]`, `[DT-05]`):**
  - Ajustar rejilla horizontal (Rack + tiras + Master/Transport), estandarizar ventanas modeless con drag/z-order y limpieza de listeners `keydown`, reemplazar `window.prompt()` en `McxRackColumn`, añadir `SOLO ACTIVE — CLEAR`, limpiar controles muertos (`NUKE`, Macros vacío) y completar i18n/atajos.
- [x] **Oleada P3 — Saneamiento DRY, Tokens CSS, SVG y Límites `< 300` / `< 200` (`[ME-01]`..`[ME-05]`, `[ME-10]`, `[DT-07]`):**
  - Definir los 11 tokens CSS faltantes, erradicar colores fijos y emojis/glifos textuales por SVG `currentColor` en `ABDShared` y `ABDMCX0X`, dividir `GrooveArpeggiator.h` y archivos JS/CSS sobredimensionados en `ABDShared`, consolidar copias duplicadas, retirar archivos muertos y resolver los errores `tsc`.
- [x] **Oleada P4 — Cobertura Automática e Infraestructura Pre-Fase 13:**
  - Añadir tests CTest/Vitest de regresión para P0-P1 y dividir archivos puente críticos antes de ampliar a `kNumParts = 64`.

---

### Fase 13 — Expansión a 64 Pistas (`8×8` Bancos `A..H`), Router MIDI DAW Real y Live Performance
- [x] **13A — Core C++20 64 Pistas, Router MIDI Físico Real y Escenas 64-bit (`✅ VERIFICADO 13/13 CTest + JUCE 9 + WASM`):**
  - Expansión de `McxEngine`, `GrooveShuffleEngine`, `McxCommandQueue`, `McxPatternSequencer` (compacto, 0 % CPU en reposo para pistas desactivadas) y `McxBankManagerBridge` (`abd_mcx0x_preset_v2` con compatibilidad `v1`) a **64 partes** organizadas en `McxBankLayoutState` (Bancos **A+B** activos inicialmente `0..15`, resto limpios/desactivados).
  - Router multipuerto nativo **`McxNativeMidiRouter.h`**: solo dispositivos físicos reales del SO con nombres exactos (cero puertos ficticios, apertura perezosa bajo demanda en WinMM/CoreMIDI) + colas SPSC lock-free bidireccionales y libertad total para compartir `(puerto, canal)` entre pistas internas o hardware.
  - Máscaras de 64 bits (`std::uint64_t` + JSON `muteMask64` en 4 palabras de 16 bits) en `McxSongAndScenes` y verificación completa en `Tests/McxPhase12SixtyFourPartsTests.cpp`.
- [x] **13B — Consola `8×8`, Rail de Bancos `A..H`, Pines/Cascada, Puertos Reales y `StepButtonStrip` (`✅ VERIFICADO tsc + Vitest 10/10 + build.bat full`):**
  - **Rail vertical izquierdo `McxBankRail`:** hasta 8 bancos (`A..H` + `+`), cada uno con token de color WCAG (`ABDShared/Assets/styles/tokens/bank-colors.css`), indicador de actividad LED y respiración suave en banco activo (`prefers-reduced-motion`).
  - **Mezclador de 8 canales visibles (`~105 px` a `1280×720`) y motor puro `McxBankLayout.ts`:** identidad DSP estable (`partId 0..63`), pines protectores (con *"Desfijar banco"*), borrado dejando hueco libre + `+ Añadir parte` exclusivamente en el primer hueco libre, compactación/renombrado de bancos vacíos preservando puerto/canal MIDI, y reordenación Drag & Drop / popover `"Mover a..."` con cascada automática que salta pines y crea banco de desbordamiento hasta `H`.
  - **Puertos MIDI reales en `McxInstrumentRouteModal` y `McxSettingsModal`:** selectores reales IN/OUT en `INT`, `EXT` y `A+B` + habilitación y refresco de interfaces del SO.
  - **Emparejamiento en `McxStepStrip` + Popover WCAG (`ABDShared/stepButtonStrip.js`):** bloques de color por banco (`A+B`, `C+D`, último banco impar siempre a la derecha p.ej. `B+C`, solo `A` + derecha deshabilitada si únicamente existe `A`, huecos deshabilitados) y popover con nombre de pista y estado de mute.
- [x] **13C — Song/Scenes `A..H × 8` (`muteMask64`), Live Mute-Bank y Cierre Documental:**
  - Matriz de mutes dinámica por bancos activos (`A..H × 8`) en `McxSongDrawer` con botón **Mute Bank** por fila y serialización sin pérdida sobre `muteMask64`.
  - Botón rápido en vivo de **Mute Bank** (`M`) en `McxBankRail` sin cambiar la pista enfocada y atajos en directo `Alt+1..8` (cola compás), `Shift+Alt+1..8` (disparo inmediato), `Alt+A..H` (cambio de banco) y `Shift+Alt+A..H` (mute de banco en vivo).
  - Tests en `WebUI/src/ui/McxSongScenes64.test.ts` y actualización completa del `ROADMAP.md`.

---

### Backlog & Análisis Técnico: Sidechain Ducking Dual (Audio vs MIDI) y Rack FX
- [x] **Implementación Activa de Ducking Dual (Audio + MIDI):**
  - **Detección por Audio (Envelope Follower sobre Pista de Batería/Bombo):** En producción de estudio clásica (compresores VCA estilo SSL Bus, DBX 160 o DAWs como Ableton Live / FabFilter Pro-C), el ducking se dispara mediante una señal de audio real (Key Input). El seguidor de envolvente detecta el pico o valor RMS de la pista de bombo (Pista 9 o cualquier pista configurada como `isDrumKit`), reaccionando instantáneamente a la dinámica real del sonido.
  - **Disparo Rítmico por Notas MIDI (Ghost Trigger / MIDI Pumping):** En producción electrónica moderna (estilo Nicky Romero Kickstart, Cableguys VolumeShaper, LFO Tool), se prefiere el disparo por evento MIDI (notas 35 y 36 de bombo en la pista o una pista oculta "ghost"). Esto garantiza una envolvente de decaimiento limpia y musicalmente perfecta independientemente de si el sample de bombo es largo, corto o está muteado acústicamente.
  - **Funcionamiento Dual en ABDMCX0X:** El chasis de efectos y el motor `McxEngine` combinan ambas señales (`manualDuckGate_ || (midiDuckEnabled_ && kickDuckEnvelope_ > 0.05f) || (audioDuckEnabled_ && audioDuckEnvelope_ > 0.08f)`), permitiendo trabajar con loops/muestras de audio o secuencias MIDI sin configuración manual previa.
- [ ] **Puntos de Estudio Futuro para Sidechain Ducking:**
  - Selector de pista de sidechain dedicada (permitir seleccionar arbitrariamente cualquiera de las pistas 1..64 como fuente de control Key Input, en lugar de fijarlo a P09/Drum).
  - Filtro paso-alto (HPF sidechain conmutable 80–120 Hz) en la rama de detección de audio para prevenir que subgraves sostenidos mantengan la compuerta abierta indebidamente.
  - Parámetros accesibles desde UI: profundidad de atenuación en dB (rango -3 dB a -48 dB) y tiempos de ataque/relajación en ms o divisiones de tempo (1/8, 1/16, 1/4).
- [ ] **Revisión del Rack de Efectos y Monitor CRT LCD:**
  - **Diagrama de Flujo Vectorial Dinámico:** En el monitor CRT de la modal de efectos, atenuar o apagar visualmente las ramas de señal inactivas o desconectadas, y representar flechas de interconexión directa cuando exista encadenamiento en serie entre bahías en lugar de líneas estáticas.
  - **Centralización de Carátulas Canónicas en `ABDShared`:** Mover la definición completa de estilos, perfiles y лицевые панели (carátulas emuladas de hardware) a `ABDShared` una vez estabilizado su refactor paralelo, garantizando total consistencia visual entre instrumentos del ecosistema.
