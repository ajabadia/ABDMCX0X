# HANDOFF — ABDMCX0X

> **Última actualización:** 2026-11-18 · **Fase actual:** Fases 0–5 y **Fase 3C (Host Nativo JUCE 9 Standalone + VST3 + WebView2 + WASM)** verificadas al 100 % (`.\build.bat full` verde). **Siguiente etapa:** ejecución por slices pequeños de la arquitectura Groovebox Modular v2 ([`DOCS/VISION_GROOVEBOX_16P.md`](DOCS/VISION_GROOVEBOX_16P.md)).

---

## 1. Estado Actual de Verificaciones
- **Tests C++20 Headless (`build.bat` / CTest — 6/6 Suites pasando, 100 %, 0.78 s):**
  - `McxPhase0Tests`: 21/21 passed.
  - `McxPhase1Tests`: 15/15 passed (motor 4-parciales, filtros ZDF/TC6116AF, envolventes 5-stage LUT IC7, drum maps, `FxBuffers` en heap).
  - `McxPhase2Tests`: 58/58 passed (hidratación JSON real de `boss_dr5.json`, `roland_mc303.json`, `korg_ms2000.json`, `behringer_deepmind12.json`, auto-detección Universal Identity Reply, cola SPSC).
  - `McxPhase3Tests`: 21/21 passed.
  - `McxPhase4Tests`: 10/10 passed (carga `.abdbank`, descompresión PCM, hi-hat `muteGroup 1` choke).
  - `McxPhase5Tests`: 7/7 passed (sample rates 44.1k..192k, buffers 32..4096, MC-303 28-partial stealing, NaN/Inf, DAW state).
- **Contratos `@abdsynths/contracts`:** 30/30 Vitest tests verdes (`semanticRoles.ts`, `drum_map_profiles.json`, `hardware_profile.schema.json`).
- **Módulo `ABDShared::DiagnosticProbe`:**
  - `DiagnosticSignalProbe.h` (201 l., bitmask atómico 64-bit, `double` phase para 440.0 Hz exactos 44.1k..192k, 4 ondas).
  - WebUI (`DiagnosticProbeModal.js`, `DiagnosticProbeWave.js`, `DiagnosticProbeI18n.js`, `DiagnosticProbeModal.css`): ventana flotante arrastrable (patrón `ABDScope` `FloatingMount`), 0 colores hardcodeados, verificada precisión 440 Hz en 44.1k/48k/96k/192k Hz y bitmask exacto.
- **Compilación WASM (`wasm/build_wasm.bat`):** configurado con `-O2` (exports/imports sin minificar para `AudioWorklet`) y despliegue automático a `WebUI/src/wasm/` y `WebUI/public/wasm/`.
- **WebUI (`start.bat` -> `http://localhost:5330`):**
  - `ABDShared` `SynthNavBar` (`File / Edit / Tools / Help` + `AboutDialog` + `Tools -> 440 Hz Signal Probe`).
  - 3 modos iniciales (`SuperFree` [default], `MC-303`, `DR-5`), Light/Dark sobre `bg_neutral.webp` con paneles semitransparentes (`color-mix`, **0 colores hardcodeados**), i18n ES/EN.
  - `@abdsynths/midi-keyb` con ruedas `bender.png` (`wheels.css`, `kbd-buttons.css`) y botones `OCT +` / `OCT -` con LEDs, Osciloscopio + Stereo VU, Mezclador 16 partes, 10 Macros, FX GS/MC-303 (`RolandGsMc303FxProfile.h`), Vector 2D, Drum Rack 16 Pads y carga drag-and-drop `.abdbank`.
- **Modularidad:** 100 % de archivos C++ `< 300` líneas (`McxBankLoader.cpp` 299, `McxVoice.cpp` 298, `WasmBridge.cpp` 297) y JS/TS `< 200` líneas.

---

## 2. Reglas Inmutables y Arquitectura DRY
1. **Propiedad Intelectual limpia:** prohibido incluir Mask ROMs originales (`IC3`, `SC-55`, etc.), PCM de fábrica protegido, código GPLv3 o código sin licencia.
2. **Cero colores hardcodeados:** 100 % de estilos en `ABDMCX0X/WebUI` y `ABDShared/Code/DiagnosticProbe` consumen tokens canónicos de `@abdsynths/shared/styles` (`--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`).
3. **Seguridad en pila (Stack Safety):** buffers grandes (`DspStereoChorus`, `DspFlanger`, `DspZitaReverb`, `McxLatencyCompensator`) SIEMPRE en heap una sola vez en constructor (`std::unique_ptr` / `std::vector`), nunca por valor en stack ni alocados en `process()`.
4. **Reglas de flujo de trabajo:** nunca ejecutar `cmake --build`, `ctest` ni `git commit/push` de forma autónoma; proporcionar los comandos exactos al usuario.
5. **Rutas compartidas clave en `ABDShared`:**
   - `ABDShared/Code/SynthCore/` (`GrooveArpeggiator.h`, `HardwareProfileHydrator.h/.cpp`, `MiniJsonParser.h`, `SemanticRoleHash.h`)
   - `ABDShared/Code/DiagnosticProbe/` (`DiagnosticSignalProbe.h`, `WebUI/`, `DIAGNOSTIC_PROBE_INTEGRATION_GUIDE.md`)
   - `ABDShared/Code/DspEffects/profiles/RolandGsMc303FxProfile.h`
   - `ABDShared/Code/Scope/` (`ABDShared::ScopeCore`, `@abdsynths/shared/scope`)
   - `ABDShared/Code/MidiKeyboard/` (`@abdsynths/midi-keyb`)
   - `ABDShared/Assets/styles/themes/` (`mc303`, `mc303-light`, `dr5`, `dr5-light`, `ms2000`, `ms2000-light`, `neuron-dark`, `neuron-light`)

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
