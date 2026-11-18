# HANDOFF — ABDMCX0X

> **Última actualización:** 2026-11-19 · **Estado actual:** **Blindaje Técnico Core C++20 + Bloque 6 WebUI + Fase 3 (Extracción `StructuredRompler` a `ABDShared::SynthEngines` y Chasis Multi-Motor `ISoundEngine`/`TrackModRouter`) VERIFICADOS (`5/5 build.bat full`, `7/7` CTest con `McxPhase6CoreInfraTests` `18/18`, `ABDShared_StructuredRompler_Tests` `14/14`, 0 archivos >= 300 lín.).** **Siguiente tarea:** Pasar a **Fase 2** (Secuenciador PPQ C++20 `PatternSequencerEngine` + MIDI Clock `0xF8`/`0xFA`/`0xFC` sobre el `McxEngine` ya polimórfico).

---

## 1. Estado Actual de Verificaciones y Componentes
- **Fase 3 — Aislamiento del `StructuredRompler` en `ABDShared::SynthEngines` y Chasis Polimórfico (✅ VERIFICADO — `5/5 build.bat full`, `14/14` `ABDShared_StructuredRompler_Tests`, `18/18` `McxPhase6CoreInfraTests`):**
  - Extraídos `ISoundEngine.h`, `TrackModRouter.h` y `StructuredRompler/*` (`RomplerVoicePool`, `StructuredRomplerEngine`, `RomplerBankLoader`, `RomplerFactoryPatches`) a `ABDShared/Code/SynthEngines/` (100 % JUCE-free C++20, todos los archivos `< 300` lín.).
  - `McxEngine` refactorizado como chasis host multi-motor (`engineSlots_[16]`, `getPartSoundEngine`/`setPartSoundEngine`, `modRouter(partIdx)`, `romplerPool_` compartido con callback `onRomplerVoiceStolen`), retirando `Filter 2` de `McxChannelStrip.h`, delegando en adaptadores header-only (`McxBankLoader.h`, `McxFactoryBank.h`) y eliminando 11 archivos duplicados (`McxBankLoader.cpp`, `McxFactoryBank.cpp`, `McxRomTables.h`, `McxEnvelope5Stage.*`, `McxFilterBank.*`, `McxPartialExciter.*`, `McxVoice.*`).
  - Añadido Test #8 en `Tests/McxPhase6CoreInfraTests.cpp` (`TrackModRouter` modulando `StructuredRompler` de forma no destructiva); `build.bat full nopause` en verde al 100 % (Headless, `7/7` CTest, Vite WebUI, JUCE 9 Standalone + VST3 y Emscripten WASM).
- **Bloque 6 — Saneamiento Deuda WebUI, Tokenización 100 % y Puente Fase 6 (✅ VERIFICADO):**
  - `WebUI/src/styles/mcx0x.css` (2.574 lín. $\to$ manifiesto `@import` de 23 lín.) modularizado en **21 archivos CSS** (`< 180` lín. c/u) con **0 colores hardcodeados** (`CSS_COLOR_HITS=0`, `TS_COLOR_HITS=0`), tokens validados contra `ABDShared/Assets/styles/tokens.css`, y modos `.is-midi-ext` / `.is-midi-mode`.
  - `WebUI/src/main.ts` (644 $\to$ 189 lín.) descompuesto en `WebUI/src/app/` (`McxAppState.ts` 167, `McxPianoRollSync.ts` 54, `McxModalsFactory.ts` 196, `McxInputAndTelemetry.ts` 103); `McxStepStrip.ts` reducido (207 $\to$ 194 lín.); **100 % de archivos manuales WebUI `< 200` lín.** (`OVER_200_COUNT=0`).
  - Puente Fase 6 conectado (`mcxParamIds.ts` `82..89`, `partMidiPeaks` en `McxHostBridge.ts`, `BridgeWasm.ts`, `mcx0xWorklet.js` 174 lín. + `public/wasm/`, `wasm/CMakeLists.txt`), bugs `#mcx-strips` $\to$ `#part-list`, `patternSwing` y `updateParamLive` corregidos, y `vite build` en verde (`1.80s`, 157 módulos).
- **Blindaje Core C++20 de la Pieza Central Groovebox (✅ VERIFICADO — 7/7 suites CTest pasando al 100 %, `McxPhase6CoreInfraTests` 17/17 pass):**
  - **Concurrencia RT-Safe y Fin de Colisión de Canales:** Nueva cola SPSC lock-free `Source/Core/McxCommandQueue.h` + `Source/State/McxApvtsApplier.h` indexada por `partIdx` exacto (`PluginProcessor.cpp`, `WasmBridge.cpp`), manteniendo `kNumParts = 16` retrocompatible con `McxPhase0..5Tests`.
  - **Tubería MIDI Out Unificada y Multi-Contrato:** Enlace directo `McxEngine` $\to$ `McxHardwareBridge::outQueue_`, emisión real `0x90`/`0x80` con `portIndex`/`priority` y `GrooveArpeggiator` en `ExternalMidi`/`BothAB`, `midiMessages.clear()` anti-rebote VST3, `dispatchNotes = false` anti-doble disparo, `latchedNoteMap_[128]` anti-notas-colgadas, `autoDetectFromIdentityReply` *zero-alloc*, `nrpnStates_[16]` y perfiles/puertos por pista.
  - **Diezmador, EQ Estéreo, Latencia y Telemetría Dual:** `Source/MIDI/McxMidiModDecimator.h` (35 Hz CC / 18 Hz NRPN con caché `CC99/CC98` y *backpressure* 75 %), `McxChannelStrip::Biquad::copyCoeffsFrom`, `McxTrackSemanticOffsets`, `liveZeroLatency` + `setLatencySamples()`, `partMidiPeaks_` (`PluginEditor.cpp` / `WasmBridge.h`), roundtrip `sourceKind`/`midiPortIndex` en `McxBankManagerBridge.cpp`, y nueva suite `Tests/McxPhase6CoreInfraTests.cpp` (todos los C++ `< 300` líneas).
- **Pipeline Unificado (`build.bat full nopause` — 5/5 Pasos Pasando al 100 %):**
  - `[1/5]` Registros generados desde contrato semántico CDD v2.0.
  - `[2/5]` Headless C++20 Core compilado en Release con MSBuild sin warnings.
  - `[3/5]` CTest suite: **7/7 suites pasando al 100 %** (`McxPhase0Tests` 21/21, `McxPhase1Tests` 15/15, `McxPhase2Tests` 58/58, `McxPhase3Tests` 21/21, `McxPhase4Tests` 11/11 incluyendo Slice 7, `McxPhase5Tests` 7/7, `McxPhase6CoreInfraTests` 18/18).
  - `[4a/5]` Bundle WebUI offline generado con Vite (`WebUI/dist/`).
  - `[4b/5]` Binarios JUCE 9 Standalone (`ABDMCX0X.exe`) y VST3 (`ABDMCX0X.vst3`) generados con éxito.
  - `[5/5]` Compilación WebAssembly (`wasm/build_wasm.bat` con Ninja y Emscripten `-O2`) desplegada en `WebUI/src/wasm/` y `WebUI/public/wasm/`.
- **Motor de Secuenciador Unificado y Pianola Universal (`ABDShared`):**
  - **`PatternSequencerEngine.h` (`ABDShared/Code/SynthCore/`):** Motor C++20 RT-safe basado en ticks PPQ (96/480), compases múltiples (1..32), despacho de notas, acentos Roland (`vel > 100`), ligadura slide y grabación continua de movimiento de parámetros (*Motion Recording*). Testeado en `SynthCoreTests.cpp`.
  - **`abd_pattern.schema.json` & `abdPattern.ts` (`ABDShared/Contracts/`):** Contrato JSON y tipos TypeScript para patrones y automatización, validado en Vitest (31/31 tests pass).
  - **`PianoRollModal` (`ABDShared/Components/PianoRoll/`):** Utilidad modeless universal con soporte dual (Piano Roll Cromático y Drum Grid Rítmico), carril inferior de velocidad con resaltado de umbral de **Acento Roland en 100**, y carril de movimiento de parámetros con reproducción en controles visuales. Validada en Vitest (5/5 tests pass).
- **Rack FX Polimórfico en 3 Niveles (`ABDShared/Components/MultiBusFxRack/`):**
  - Arquitectura desacoplada en 3 niveles (**Categoría -> Algoritmo -> Presets**) en los 4 slots de envío + 10 topologías de ruteo clásicas (0..9) con pantalla LCD vectorial interactiva. Validada en Vitest (6/6 tests pass).
- **Promoción Transversal DRY a `ABDShared` & Nuke Universal (`PerformanceDeck`):**
  - **`LcdTextFormatter.h` / `LcdMenuFormatter.h`:** C++20 header-only puro en `ABDShared/Code/SynthCore/` para pantallas LCD 16x2 y 20x2, completamente desacoplado de enums locales de DWGS. `ABDMS2000` refactorizado para consumirlo DRY.
  - **`StickPlayer.h`:** Motor determinista de reproducción de trayectorias vectoriales en tiempo real en `ABDShared/Code/SynthCore/`.
  - **`VelocitySensitivityCurves.h`:** Curvas canónicas de dinámica (Lineal, Exponencial, Logarítmica, S-Curve, Fija) en `ABDShared/Code/SynthCore/`.
  - **`PerformanceDeck` (Nuke Aséptico Universal):** Creado en `ABDShared/Components/PerformanceDeck/` (`performanceDeck.js`, `.css`, `.d.ts`) y exportado en `@abdsynths/shared/components`. Panel deslizante superior con `TrajectoryStick2D` (con **grabación de movimiento en vivo `REC/PLAY/LOOP/SVG trail`**), 4 perillas macro, 6 controladores físicos de expresión con perillas bipolares de profundidad, y selector de límite de voces. 100% tokenizado y `< 200` líneas.
  - **Verificación C++:** Slice 7 en `ABDMCX0X/Tests/McxPhase4Tests.cpp` y tests unitarios en `ABDShared/Code/SynthCore/SynthCoreTests.cpp`.
- **Arquitectura de Interfaz Ergonómica de la Groovebox (WebUI):**
  - **Área Central Scrollable:** Espacio entre la tira de 16 pasos y el teclado inferior (`.mcx-workspace`) con scroll suave vertical y horizontal y scrollbars estilizadas con tokens de tema.
  - **Morph Vectorial 2D:** Joystick X/Y y zona drag-and-drop de bancos `.abdbank` ubicados a la izquierda (`.mcx-panel--left`).
  - **Consola Mezclador de 16 Canales (`McxMixerConsole.ts`):** 16 tiras verticales de canal (`.mcx-strip`) con cabecera `P01..16`, botón conmutador `DRM`/`CHR`, botón de sonido con icono de categoría y nombre, selector de canal MIDI `CH1..16`, botón `TR` (seguir transposición), botones `[ M ]` (Mute) y `[ S ]` (Solo), mini-slider de Glide/Portamento (`GLD` 0..500 ms con valor numérico, atenuado para pistas de batería), y fader de volumen con porcentaje.
  - **Selección Contextual:** Ubicada debajo del mezclador, permite conmutar entre Tono y Macros en Vivo / Efectos Master y el Drum Rack de 16 pads interactivos.
  - **Tira de 16 Botones Hardware (`StepButtonStrip`):** Promovida canónicamente a `ABDShared/Components/Controls/` e integrada en `ABDMCX0X` con 5 modos (`PART SEL`, `PART MUTE`, `STEP MUTE`, `ACCENT`, `SLIDE / GLIDE`) y animación chaser en tiempo real.
- **Motor DSP, Glide y Acento Roland:**
  - **Portamento / Glide por Canal MIDI:** Suavizado 1-pole en `McxVoice.h/.cpp` (RT-safe, cero alocaciones) con tiempo configurable por parte (`portaTimeMs`, param 59) conforme a GM2/GS (CC 5 / CC 65).
  - **Acento Dinámico Roland:** Umbral de velocidad `vel > 100` verificado e implementado en voces melódicas y rítmicas (apertura extra de filtro VCF, pegada de ataque VCA y mordida de decay).
- **Rediseño del Rack de Efectos Master Polimórfico (`DOCS/INTEGRACION_FX_RACK_MODAL.md`):**
  - Especificación formal para desacoplar los envíos de tipos fijos y adoptar el modelo **ABDEep**: 3 niveles jerárquicos (**Categoría -> Algoritmo -> Presets**) en cada uno de los 4 slots de envío + topologías conmutables 0..9 (Serie, Paralelo, Pares, Cascada) con diagrama vectorial dinámico en LCD Canvas.
- **Internacionalización y Cero Colores Hardcodeados:**
  - 100 % de estilos en CSS y Canvas tokenizados con variables de `@abdsynths/shared`.
  - Diccionarios i18n modulares separados en `WebUI/src/i18n/locales/en.ts` y `locales/es.ts`.
  - Cobertura completa de i18n (`data-i18n`, `data-i18n-title`, `data-i18n-placeholder`).
- **Límites de Líneas Estrictos:** 100 % de ficheros C++ `< 300` líneas y ficheros TypeScript/JavaScript `< 200` líneas.

---

## 2. Reglas Inmutables y Arquitectura DRY
1. **Propiedad Intelectual limpia:** prohibido incluir Mask ROMs originales (`IC3`, `SC-55`, etc.), PCM de fábrica protegido, código GPLv3 o código sin licencia.
2. **Cero colores hardcodeados:** 100 % de estilos en `ABDMCX0X/WebUI` y `ABDShared` consumen tokens canónicos de `@abdsynths/shared/styles` (`--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`).
3. **Seguridad en pila y Audio Thread Safety:** buffers grandes SIEMPRE en heap una sola vez en constructor (`std::unique_ptr` / `std::vector`), cero alocaciones de memoria ni bloqueos/mutexes en callbacks de audio.
4. **Límites de extensión:** C++ `< 300` líneas, JS/TS `< 200` líneas por archivo.
5. **Rutas compartidas clave en `ABDShared`:**
   - `ABDShared/Code/SynthCore/` (`GrooveArpeggiator.h`, `HardwareProfileHydrator.h/.cpp`, `MiniJsonParser.h`, `SemanticRoleHash.h`)
   - `ABDShared/Code/SynthEngines/` (`ISoundEngine.h`, `TrackModRouter.h`, `StructuredRompler/*`)
   - `ABDShared/Code/DiagnosticProbe/` (`DiagnosticSignalProbe.h`, `WebUI/`)
   - `ABDShared/Components/Controls/` (`stepButtonStrip.js`, `step-button-strip.css`)
   - `ABDShared/Components/bank/` (`bankShell.js`, `bankCard.js`, `bankChips.js`, `bankCategories.js`, `bankIcons.js`)

---

## 3. Tareas Pendientes Inmediatas (Hoja de Ruta Reordenada — Ver `DOCS/PLAN_MAESTRO_ARQUITECTURA_Y_REFACTOR_CORE.md`)
0. **✅ COMPLETADO — Validación Full Build (Fase 1 + Bloque 6 + Fase 3):**
   - Ejecutado `build.bat full nopause` con salida `0` (**5/5 verde**: Headless Core, `7/7` CTest, WebUI Vite `WebUI/dist`, JUCE 9 `ABDMCX0X.exe` / `ABDMCX0X.vst3` y `mcx0x_dsp.wasm` con `_getPartPeaks`/`_getPartMidiPeaks`).
0B. **SIGUIENTE TAREA — Fase 2 — Secuenciador PPQ Nativo en C++20 + MIDI Clock (`0xF8`):**
   - Conectar `ABDShared/Code/SynthCore/PatternSequencerEngine.h` en `McxEngine` (doble buffer lock-free, `GrooveShuffleEngine`, P-Locks) + emisor sample-accurate `0xF8`/`0xFA`/`0xFC`.
0C. **✅ COMPLETADO — Fase 3 — Aislamiento del `StructuredRompler` (`ISoundEngine` & `TrackModRouter`):**
   - Formalizados `ISoundEngine.h`, `TrackModRouter.h` y `StructuredRompler/*` (`RomplerVoicePool`, `StructuredRomplerEngine`, `RomplerBankLoader`, `RomplerFactoryPatches`) en `ABDShared/Code/SynthEngines/` (`14/14` pass) e integrados en el chasis polimórfico `McxEngine` (`McxPhase6CoreInfraTests` `18/18` pass).
0D. **Fase 4 (Diseño Futuro) — Modo Canción, Múltiples Pistas/Bancos y Nuevas Vistas WebUI; Fase 5 — Motores de la Suite (`JunoEngine`, etc.).**
1. **Integración del Nuke Aséptico (`PerformanceDeck`) en WebUI de `ABDMCX0X`:**
   - Montar el cajón superior deslizante `PerformanceDeck` desde `@abdsynths/shared/components`.
   - Conectar botón `PERF / NUKE` en la barra superior (`McxNavbar.ts`).
   - Conectar `TrajectoryStick2D` (con Motion Recording) al plano de morphing vectorial de la parte activa.
   - Conectar 4 macros y 6 controladores de expresión física (Pitch, Mod, AT, Breath, Foot, Expr) a los parámetros y modulación.
   - Conectar selector de límite de voces a `McxEngine::setMaxPolyphony`.
2. **Rediseño del Rack FX Polimórfico en `ABDShared` (`DspMultiBusFxRack` & `MultiBusFxRackModal`):**
   - Implementar la arquitectura **ABDEep**: 3 niveles jerárquicos (Categoría -> Algoritmo -> Presets) para los 4 slots de envío.
   - Topologías de ruteo conmutables (Modos 0..9: Serie, Paralelo, Pares, Cascada) con diagrama visual interactivo en Canvas/SVG con tema de LCD.
3. **Consola Mezclador Full-Height (16 Canales Alargados) & Paneles Deslizantes Inferiores (Bottom Drawers):**
   - **Consola 16 Canales Alargada:** Alargar las 16 tiras verticales de canal para aprovechar el 100 % del alto central (~480px libres a 1280x720): fader largo (120-140px), vúmetro estéreo, envíos auxiliares (`Send A/B`), `PAN`, `Mute` y `Solo` iluminados, `TR`, y potenciómetro `GLD` (glide).
   - **Lanzaderas de Cajón en Canal:** Botones `[ TONE ]` y `[ PADS ]` en cada tira para invocar el panel contextualizado.
   - **Cajón Deslizante "Tono & FX":** Despliegue inferior sobre los 16 canales, sin pestañas redundantes: sincronizado directamente con la tira superior de 16 botones (`StepButtonStrip` en `PART SEL` y `PART MUTE`). Solo se cierra con su botón `[ ✕ ]` o el toggle del canal.
   - **Revisión y Separación de Parámetros (Locales vs Globales en Deslizante):** Auditar uno por uno los parámetros de la deslizante para separar lo que es exclusivo de la parte/canal (filtros, envolventes, EQs, y envíos auxiliares Pre/Post-Fader) de lo que es global del Master Bus (conversor D/A, estructura general y algoritmos del Rack FX Master).
   - **Matriz de Pads Universal (`MpcPadMatrix` en `ABDShared`):** Componente 4x4 táctil y aséptico con Modo Ritmo (baterías, choke groups, notas), Modo Cromático (notas, octavas, selector de escalas, In-Key) y modo 16-Levels. Sincronizado también con la tira de 16 botones superiores.
   - **Botón de Colapso del Teclado Virtual:** Añadir botón de colapsar / descolapsar al dock del teclado virtual para maximizar el área de trabajo en pantallas táctiles compactas o al usar teclados MIDI físicos externos.
   - **Ergonomía Tablet Táctil 10 Pulgadas (1280x720 / 1280x800):** Hit targets de mínimo 44px; controles de lectura rápida en mesa vs edición profunda en drawers.
   - **Utilidad de Acordes (Chord Mode / Chord Performer):** Anotado para investigar referencias de mercado (MPC, Launchpad, Reason Scales & Chords) para disparo de acordes diatónicos, Chord Memory y rasgueo (*strum delay* en ms).
4. **Transposición Directa Interactiva por Teclado (MC-303 Style):**
   - Permitir transponer instantáneamente en directo manteniendo pulsado el botón `TRANSPOSE` y tocando una tecla del teclado (virtual o MIDI), fijando la raíz/semitonos de forma ergonómica sin necesidad de navegar menús.
5. **Bank Manager Especializado Rompler/Sampler:**
   - Adaptar el Bank Manager en ABDMCX0X para mostrar y navegar únicamente las partes de la librería rompler/multisample/drum kits de ABDMCX0X (sin mezclar las partes sintéticas de AxionikVS).
   - Estructura de sub-librerías por subcarpetas en `<WorkingDir>/Presets/Parts/` e índice `favorites.json`.
6. **Slice 2 — Formatos Propietarios y Crecimiento de Librería:**
   - Soporte y serialización completa de cápsulas y bancos `.abdbank`, presets de parte `.abdpart` y multis de 16 partes `.abdmulti`.

---

## 3. Entorno de Herramientas Verificado
- **Remoto GitHub:** `https://github.com/ajabadia/ABDMCX0X.git`
- **JUCE 9:** autodescubrimiento `JUCE_PATH` → `../ABDEep/JUCE` → `../ABDMS2000/GITS/JUCE` → `C:/JUCE`
- **Emscripten SDK:** `D:\desarrollos\emsdk\emsdk_env.bat` (con Ninja, `-O2`)
- **Node.js / pnpm workspace:** `ABDMCX0X` registrado en `D:\desarrollos\ABDSynths\pnpm-workspace.yaml`; Vite dev en puerto `5330` (`start.bat`).
- **WebView2 NuGet:** `%USERPROFILE%/AppData/Local/PackageManagement/NuGet/Packages`

---

## 4. Visión v2 Consolidada y Siguientes Pasos (Ver `DOCS/VISION_GROOVEBOX_16P.md` y `ROADMAP.md`)
1. **Validación inmediata de Fase 3C:** ejecutar `.\build.bat full` para verificar compilación y arranque del ejecutable Standalone (`ABDMCX0X.exe`) y VST3 (`ABDMCX0X.vst3`) con WebView2 offline + paridad completa Nativo ↔ WASM vía `McxParamRouter.h`.
2. **Transición a la Arquitectura Groovebox Modular de 16 Partes (`DOCS/VISION_GROOVEBOX_16P.md`):**
   - Motor único libre (sin modos limitadores `MC-303`/`DR-5`, conservando sus paletas como Temas Visuales puros).
   - 16 partes con `PartKind` libre (`Chromatic` o `DrumMap`, Parte 10 `DrumMap` por defecto), jerarquía de 3 niveles (`SystemSettings` / `MultiPreset` / `PartPreset`) y directorio de trabajo unificado compatible con `AxionikDB` (`Models/`, `Presets/Parts/`, `Presets/Multis/`, `Presets/Patterns/`, `Banks/`, `MidiLearn/`).
   - **Canal de parte:** Doble Filtro en serie (`Filter 1 → Filter 2`, edición en Drawers deslizantes), EQ Paramétrico ligero + Drive (`DspMidasEQ`/`DspSaturation`), 4 envíos (`Send A..D`, Pre/Post-Fader), 4 LFOs Globales + 2 LFOs Locales (mute + auto-skip 0 % CPU) + ModMatrix con Via-Attenuator (`ModMatrix.h`), Accent Acid por velocidad, y edición completa por sonido/pad en Drum Maps (paridad MC-303+).
   - **Promociones a `ABDShared`:** `DwgsWavetable` (desde `ABDMS2000` OSC 1), `MusicalScaleTransposer.h` + integración en `@abdsynths/midi-keyb`, `DspMultiBusFxRack` (4+ buses, generalizando `ABDEep`), Secuenciador Piano-Roll Modal basado en ticks PPQ (`1, 2, 4, 8...` compases, futuro `3/4`/`6/8`, grabación real + cuantizado + P-Locks), y Transporte completo + Modo Canción (`Song Mode`).
   - **Performance MPC/Groovebox & Transversales:** `16 Levels`, `Note Repeat`, `MPC Swing + Humanize`, `Pad Perform`, Megamix, Escenas/Hotcues `1..8`, Master Safety Limiter, `Undo/Redo` + `Compare`, Export `.mid`/`.wav`/Stems, Multi-Out VST3 opcional, y Hardware externo (fase final) únicamente como **controlador de entrada** cargando perfiles completos de `ABDShared` `MIDI Learn`.
