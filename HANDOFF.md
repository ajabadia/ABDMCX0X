# HANDOFF — ABDMCX0X

> **Última actualización:** 2026-11-18 · **Estado actual:** Fases 0–5, Fase 3C (Host Nativo JUCE 9 Standalone + VST3 + WebView2 + WASM) y **Consola Mezclador 16 Canales + Tira Hardware 16 Pasos + Glide/Acento Roland** verificados al 100 % (`.\build.bat full` verde). **Siguientes tareas pendientes:** transposición directa interactiva en teclado (MC-303), Bank Manager especializado rompler/sampler y Slice 2 de persistencia de librerías.

---

## 1. Estado Actual de Verificaciones y Componentes
- **Pipeline Unificado (`build.bat full nopause` — 5/5 Pasos Pasando al 100 %):**
  - `[1/5]` Registros generados desde contrato semántico CDD v2.0.
  - `[2/5]` Headless C++20 Core compilado en Release con MSBuild sin warnings.
  - `[3/5]` CTest suite: **6/6 suites pasando al 100 %** (`McxPhase0Tests` 21/21, `McxPhase1Tests` 15/15, `McxPhase2Tests` 58/58, `McxPhase3Tests` 21/21, `McxPhase4Tests` 10/10, `McxPhase5Tests` 7/7).
  - `[4a/5]` Bundle WebUI offline generado con Vite (`WebUI/dist/`).
  - `[4b/5]` Binarios JUCE 9 Standalone (`ABDMCX0X.exe`) y VST3 (`ABDMCX0X.vst3`) generados con éxito.
  - `[5/5]` Compilación WebAssembly (`wasm/build_wasm.bat` con Ninja y Emscripten `-O2`) desplegada en `WebUI/src/wasm/` y `WebUI/public/wasm/`.
- **Arquitectura de Interfaz Ergonómica de la Groovebox (WebUI):**
  - **Área Central Scrollable:** Espacio entre la tira de 16 pasos y el teclado inferior (`.mcx-workspace`) con scroll suave vertical y horizontal y scrollbars estilizadas con tokens de tema.
  - **Morph Vectorial 2D:** Joystick X/Y y zona drag-and-drop de bancos `.abdbank` ubicados a la izquierda (`.mcx-panel--left`).
  - **Consola Mezclador de 16 Canales (`McxMixerConsole.ts`):** 16 tiras verticales de canal (`.mcx-strip`) con cabecera `P01..16`, botón conmutador `DRM`/`CHR`, botón de sonido con icono de categoría y nombre, selector de canal MIDI `CH1..16`, botón `TR` (seguir transposición), botones `[ M ]` (Mute) y `[ S ]` (Solo), mini-slider de Glide/Portamento (`GLD` 0..500 ms con valor numérico, atenuado para pistas de batería), y fader de volumen con porcentaje.
  - **Selección Contextual:** Ubicada debajo del mezclador, permite conmutar entre Tono y Macros en Vivo / Efectos Master y el Drum Rack de 16 pads interactivos.
  - **Tira de 16 Botones Hardware (`StepButtonStrip`):** Promovida canónicamente a `ABDShared/Components/Controls/` e integrada en `ABDMCX0X` con 5 modos (`PART SEL`, `PART MUTE`, `STEP MUTE`, `ACCENT`, `SLIDE / GLIDE`) y animación chaser en tiempo real.
- **Motor DSP, Glide y Acento Roland:**
  - **Portamento / Glide por Canal MIDI:** Suavizado 1-pole en `McxVoice.h/.cpp` (RT-safe, cero alocaciones) con tiempo configurable por parte (`portaTimeMs`, param 59) conforme a GM2/GS (CC 5 / CC 65).
  - **Acento Dinámico Roland:** Umbral de velocidad `vel > 100` verificado e implementado en voces melódicas y rítmicas (apertura extra de filtro VCF, pegada de ataque VCA y mordida de decay).
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
   - `ABDShared/Code/DiagnosticProbe/` (`DiagnosticSignalProbe.h`, `WebUI/`)
   - `ABDShared/Components/Controls/` (`stepButtonStrip.js`, `step-button-strip.css`)
   - `ABDShared/Components/bank/` (`bankShell.js`, `bankCard.js`, `bankChips.js`, `bankCategories.js`, `bankIcons.js`)

---

## 3. Tareas Pendientes Inmediatas (Roadmap Vivo)
1. **Consola Mezclador Full-Height (16 Canales Alargados) & Paneles Deslizantes Inferiores (Bottom Drawers):**
   - **Consola 16 Canales Alargada:** Alargar las 16 tiras verticales de canal para aprovechar el 100 % del alto central (~480px libres a 1280x720): fader largo (120-140px), vúmetro estéreo, envíos auxiliares (`Send A/B`), `PAN`, `Mute` y `Solo` iluminados, `TR`, y potenciómetro `GLD` (glide).
   - **Lanzaderas de Cajón en Canal:** Botones `[ TONE ]` y `[ PADS ]` en cada tira para invocar el panel contextualizado.
   - **Cajón Deslizante "Tono & FX":** Despliegue inferior sobre los 16 canales, sin pestañas redundantes: sincronizado directamente con la tira superior de 16 botones (`StepButtonStrip` en `PART SEL` y `PART MUTE`). Solo se cierra con su botón `[ ✕ ]` o el toggle del canal.
   - **Revisión y Separación de Parámetros (Locales vs Globales en Deslizante):** Auditar uno por uno los parámetros de la deslizante para separar lo que es exclusivo de la parte/canal (filtros, envolventes, EQs, y envíos auxiliares Pre/Post-Fader) de lo que es global del Master Bus (conversor D/A, estructura general y algoritmos del Rack FX Master).
   - **Matriz de Pads Universal (`MpcPadMatrix` en `ABDShared`):** Componente 4x4 táctil y aséptico con Modo Ritmo (baterías, choke groups, notas), Modo Cromático (notas, octavas, selector de escalas, In-Key) y modo 16-Levels. Sincronizado también con la tira de 16 botones superiores.
   - **Botón de Colapso del Teclado Virtual:** Añadir botón de colapsar / descolapsar al dock del teclado virtual para maximizar el área de trabajo en pantallas táctiles compactas o al usar teclados MIDI físicos externos.
   - **Ergonomía Tablet Táctil 10 Pulgadas (1280x720 / 1280x800):** Hit targets de mínimo 44px; controles de lectura rápida en mesa vs edición profunda en drawers.
   - **Utilidad de Acordes (Chord Mode / Chord Performer):** Anotado para investigar referencias de mercado (MPC, Launchpad, Reason Scales & Chords) para disparo de acordes diatónicos, Chord Memory y rasgueo (*strum delay* en ms).
2. **Transposición Directa Interactiva por Teclado (MC-303 Style):**
   - Permitir transponer instantáneamente en directo manteniendo pulsado el botón `TRANSPOSE` y tocando una tecla del teclado (virtual o MIDI), fijando la raíz/semitonos de forma ergonómica sin necesidad de navegar menús.
3. **Bank Manager Especializado Rompler/Sampler:**
   - Adaptar el Bank Manager en ABDMCX0X para mostrar y navegar únicamente las partes de la librería rompler/multisample/drum kits de ABDMCX0X (sin mezclar las partes sintéticas de AxionikVS).
   - Estructura de sub-librerías por subcarpetas en `<WorkingDir>/Presets/Parts/` e índice `favorites.json`.
4. **Slice 2 — Formatos Propietarios y Crecimiento de Librería:**
   - Soporte y serialización completa de cápsulas y bancos `.abdbank`, presets de parte `.abdpart` y multis de 16 partes `.abdmulti`.
5. **Bloque 3 — Rack FX Master Multi-Entrada (`DspMultiBusFxRack`):**
   - Rack modular en `ABDShared` con 4 buses estéreo de entrada (`Send A..D`) + `Dry`, topologías encadenables y modal dedicada por efecto.
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
