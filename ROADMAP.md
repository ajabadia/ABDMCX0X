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
- [ ] **Piezas a migrar a `ABDShared` antes de integrarlas en Fase 3:**
  - Migrar `D:\desarrollos\ABDSynths\ABDAxionikVS\Source\DSP\StickPlayer.h` → `ABDShared/Code/SynthCore/StickPlayer.h` (motor determinista de reproducción de trayectorias vectoriales en tiempo real para Vector 2D).
  - Migrar `D:\desarrollos\ABDSynths\ABDMS2000\Source\State\LCDMenuFormatter.h` → `ABDShared/Code/SynthCore/LcdMenuFormatter.h` (formateador de texto y páginas para pantallas alfanuméricas LCD 16x2 / 20x2).
  - Migrar `D:\desarrollos\ABDSynths\ABDCZ101\Source\DSP\VelocitySensitivityCurves.h` → `ABDShared/Code/SynthCore/VelocitySensitivityCurves.h` (curvas de sensibilidad dinámica percusiva/pad/lead para Drum Rack y partes).
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
- [ ] **Promoción de Wavetables DWGS (`ABDMS2000` OSC 1 → `ABDShared::DspCore`):** motor propio `DwgsWavetable` (512 slots × 2048 muestras, ~4 MB RAM, morphing modulable + WAVs de usuario en `Models/Wavetables/`), integrado en el Bank Manager compartido (`bankCategories.js` `cat-0..cat-9` e imágenes de `ABDNeuModMakr`).
- [ ] **Transposición Global en `ABDShared`:** `SynthCore/MusicalScaleTransposer.h` (semitonos `-24..+24` + Escala/Tonalidad `O(1)`) + **función nativa en `@abdsynths/midi-keyb`** (resaltado de escala y transposición en vivo, ignorando Drum Maps).
- [ ] **Canal de Mezcla por Parte + Doble Filtro en Serie + LFOs/ModMatrix:**
  - **2 Filtros en serie (`Filter 1 → Filter 2`)** con bypass individual (0 % CPU), selección en 2 pasos (familia `LPF/HPF/BPF/Notch/Comb/Z-Plane` → modelo DSP concreto de `ABDShared::DspCore`) y edición en **pantallas deslizantes (Drawers)**.
  - **EQ Paramétrico ligero + Drive** por parte (`DspMidasEQ` / `CascadeShelfEq` + `DspSaturation`, bypass 0 % CPU en reposo) + Pan + Volumen + Mute/Solo + **4 envíos (`Send A..D`) con nivel independiente y Pre/Post-Fader**.
  - **4 LFOs Globales + 2 LFOs Locales por parte** con Mute y auto-skip 0 % CPU + **ModMatrix por parte** (`ABDShared/SynthCore/ModMatrix.h`, control-rate 16–32 muestras) con **Via-Attenuator (`Source × Via`)** para envolventes sobre LFOs globales + **Accent Acid por velocidad**.
  - **Edición completa por sonido/pad en Drum Maps (paridad MC-303+):** Attack, Decay/Release, Pitch Coarse/Fine, Volume, Pan, Cutoff/Reso, Choke `0..15`, One-Shot/Gated, Start/End/Reverse, Accent y envíos `Send A..D`.
  - **Master Safety Limiter / Soft-Clipper** tras el volumen Master + indicador Peak/Clip.

### Bloque 3 — Rack FX Master Multi-Entrada (`ABDShared`) y WebUI Zero-Fork (Drawers)
- [ ] **Rack Modular `DspMultiBusFxRack` en `ABDShared`:** generalización de `ABDEep/FXEngine` con **4 buses estéreo de entrada (`Send A..D`) + `Dry`**, topologías encadenables flexibles (paralelo, serie, cascada con inyección, mixto; retrocompatible 1-bus con `ABDEep`), buffers prealocados en heap y modal clásica dedicada por efecto (p. ej. RE-201).
- [ ] **WebUI Zero-Fork con Drawers deslizantes:** `Knob` de `ABDShared`, `TrajectoryStick2D`, `@abdsynths/shared/scope` flotante, `EnvelopeCurve.js`, Drawers dedicados (Filtros 1/2, Envolventes, ModMatrix, EQ/Drive, Pad Editor), **Undo/Redo (`Ctrl+Z`/`Ctrl+Y`) + Compare (`A/B`)**, búsqueda/favoritos/pre-escucha en Bank Manager, y alta en `host-strip-height.test.js`.

### Bloque 4 — Secuenciador Piano-Roll Modal (PPQ), Transporte, Modo Canción y Utilidades MIDI
- [ ] **Transporte completo + Reloj Dual:** `Play`, `Pause`, `Stop`, `Record` (*overdub/replace*), `Rew`/`FF` por compás, `Return to Zero`, `Loop`, `Metrónomo` + `Count-in (1/2 compases)` + `Tap Tempo`; `Host Sync` (VST3) / `Internal` (Standalone/WASM).
- [ ] **Secuenciador Piano-Roll Modal (`ABDShared`, estilo Cubase):** motor basado en **ticks musicales PPQ (`96`/`480`)** admitiendo `1, 2, 4, 8...` compases (preparado para futuras métricas `4/4`, `3/4`, `6/8`), polifonía real, vista *Piano Roll* (Cromáticas) + *Drum Grid / TR-REC* (Drum Maps), **grabación en tiempo real** (libre o cuantizada `0..100 %`) y **Parameter Locks (P-Locks)** por paso.
- [ ] **Utilidades MIDI de Inserción por Parte:** `GrooveArpeggiator`, **Note Repeat / Roll**, **Pad Perform** (Escalas/Acordes), **16 Levels** (Tune/Vel/Cutoff/Decay/Attack), **MPC Swing (`50..75 %`) + Humanize**, y volcado (*print*) de Arp/Acordes al Piano Roll.
- [ ] **Modo Canción (`Song Mode`):** cadena de bloques `{ Escena/Patrón, Repeticiones, MuteMask16, Transposición }` + exportación **`.mid` multipista**, **`.wav` Master / Stems por parte** y *Drag-to-DAW*.

### Bloque 5 — Performance Avanzada, Multi-Motor, Multi-Out y Hardware vía MIDI Learn
- [ ] **Performance en directo:** **Megamix** por parte cuantizado al compás, **Escenas / Hotcues (`1..8`)**, capas por pad (*Velocity Zones / Round-Robin*), Track/Pad Mute cuantizado y Q-Links contextuales.
- [ ] **Guardado Dual DAW + Multi-Out VST3 + Nuevos Motores:** chunk referencial ligero vs bundle portable `.abdbank` con *tree-shaking*; salidas estéreo auxiliares opcionales en VST3; ampliación de motores por parte (`VA`, `FM`, `Spectral/DDSP`).
- [ ] **Hardware Externo como Controlador de Entrada (`MIDI Learn` automático):** detección con `ABDShared::HardwareMidiDetect` cargando perfiles completos de `ABDShared` `MIDI Learn` (`<WorkingDir>/MidiLearn/<device>.json`) para MC-303, DR-5, controladores MIDI, etc.

---

### Backlog Futuro Compartido (`ABDShared`) — Componente Modular de Rack de Efectos Multi-Entrada
- [ ] **Arquitectura de Enrutamiento Flexible (Multi-Entrada):**
  - Diseñar en `ABDShared` un componente de rack de efectos reutilizable al que puedan entrar varias rutas de audio (por defecto **1 o 2 buses estéreo**, ampliable).
  - Topologías intercambiables de colocación de slots de efectos: **Paralelo**, **Cadena (Serie)** y **Mixto** (algoritmos de conexión conmutables).
- [ ] **Gobierno desde la LCD Principal + Controles Rápidos:**
  - Los algoritmos de conexión / enrutamiento de efectos deben gobernarse directamente desde la **LCD principal** del sintetizador.
  - Evaluar ergonomía en panel principal: controles básicos compactos en vista principal vs controles avanzados al estilo `ABDEep`.
- [ ] **Modal de Edición Dedicada por Efecto (con LCD y Tema Clásico Propio):**
  - Al pulsar editar en cualquier efecto del rack, abrir una **modal dedicada** que cuente con:
    - Su **propia pantalla LCD** de estado/parámetros.
    - Su **propio tema visual** emulando hardware clásico (por ejemplo, **Roland RE-201 Space Echo** aprovechando `Re201Profile.h`, `tapeEchoVisual.js` y `FxTheme.js` ya existentes en `ABDShared`, Juno BBD Chorus, Dimension D, etc.).
    - Controles dedicados propios del efecto seleccionado.
- [ ] **Calibración Física de Efectos (`ABDAudioLab`):**
  - Medir en hardware real (**Roland MC-303**, **Boss DR-5**) las curvas `TIME/RATE`, `EFX LEVEL`, tiempos de tap y respuestas al impulso para pasar `RolandGsMc303FxProfile::kMeasuredHardware` de `false` a `true`.
