# Brief de Diseño y Arquitectura en 9 Decisiones — ABDMCX0X

> **Propósito:** Fijar de forma inequívoca el alcance, la arquitectura y los límites de **ABDMCX0X** (plantilla de *9 Decisiones* + decisiones técnicas del ecosistema `ABDSynths`), armonizado con la visión consolidada v5 de Groovebox Multi-Motor de 16 Partes y Chasis Host Modular.  
> **Estado:** Documento vivo de diseño y alcance consolidado (v3 — sincronizado con `VISION_GROOVEBOX_16P.md` y arquitectura multi-motor `IMcxSoundEngine`).  
> **Última actualización:** 2026-11-18

---

## TU FRASE · HIPÓTESIS DEL PRODUCTO

> *«Una Groovebox Modular Autónoma de 16 Partes Libres con Chasis Host Multi-Motor (Structured Rompler, VA Juno, Control Hardware MIDI Out por Contratos y futuros motores de la suite), Secuenciador Piano-Roll PPQ, Consola Mezclador Full-Height y Controlador universal (VST3 / Standalone / WASM), libre de ROMs protegidas, con filtros/DAC modulares, transporte integrado y piezas transversales DRY de ABDShared.»*

---

## Las 9 Decisiones Cerradas

### 1. ¿Qué tipo de instrumento es?
- Instrumento híbrido **Groovebox Modular Completa de 16 Partes + Chasis Host Multi-Motor (`IMcxSoundEngine`) + Rompler Estructurado Independiente + Control Hardware MIDI Out + Secuenciador PPQ + Consola Mezcladora**, en formatos **VST3**, **Standalone** y **WASM (`AudioWorklet`)**.
- **Chasis Host Multi-Motor Aséptico:** ABDMCX0X desacopla la workstation de cualquier motor sonoro específico. Las 16 pistas alojan motores intercambiables que implementan la interfaz C++20 `IMcxSoundEngine`:
  - **`StructuredRomplerEngine`**: motor nativo de 4 parciales PCM estéreo, doble filtro en serie, envolventes 4T4L y vector mixing (gobernado por `abd_structured_rompler.schema.json`).
  - **`JunoEngine`**: motor analógico virtual de topología completa (DCO, IR3109 VCF, HPF Bass Boost, Chorus BBD I/II) importado de `ABDJUNiO601` con sus 128 patches de fábrica intactos.
  - **`ExternalMidiEngine`**: puente de control directo a hardware MIDI externo mediante contratos JSON asépticos (`HardwareMirrorRouter`).
  - **Futuros motores de la suite**: `Ms2000Engine` (DWGS / VA), `CzEngine` (Phase Distortion), etc.
- Interfaz gráfica obligatoria en **WebView2** (enlazado estático en Windows) usando componentes Zero-Fork de `ABDShared` (`SynthNavBar`, `CompactTransportBar`, `StepButtonStrip`, `MpcPadMatrix`, `MultiBusFxRackModal`, `GlobalLfoModal`, `PianoRollModal`, `GrooveShuffleModal`, `@abdsynths/midi-keyb`, `Scope`, `ABDBankManager`).
- **Salida de audio:** Bus **Estéreo `2.0`** único en v1 con etapa protectora `MasterSafetyLimiter` (entradas de audio desactivadas por defecto siguiendo la regla de arranque WASAPI/CoreAudio).
- **Producto único con motor libre:** sin variantes de compilación ni modos limitadores artificiales de polifonía o partials. Las 16 partes operan a motor libre (hasta 64 voces dinámicas con `0 %` de CPU en reposo).
- **Temas Visuales Vintage:** la personalidad y estética de las máquinas de referencia (*Roland MC-303*, *Boss DR-5*, *Korg MS2000*, *Neuron*) se disfrutan como **Temas Visuales** intercambiables en Claro y Oscuro desde el `ThemeManager`.

### 2. ¿Para quién es y dónde se usa?
- Productores de estudio y músicos de directo que buscan la pegada, inmediatez y flujo de trabajo de las grooveboxes y cajas de ritmo de los 90/2000 (Roland MC-303/505/909, D-2, Boss DR-5, Akai MPC, Quasimidi 309, E-mu Orbit) tanto de forma autónoma en directo/bocetado (con su secuenciador, pads y metrónomo propios) como integrado en DAW vía VST3.

### 3. ¿De dónde sale el sonido? (Seguridad Legal y Propiedad Intelectual)
- **Cero Mask ROMs y cero PCM protegido de fábrica:** jamás se incrustan ni ejecutan ROMs de fabricantes ni librerías con copyright de terceros ni código GPLv3 o sin licencia.
- **Estrategia de *De-Baking* (des-horneado):** las ondas base crudas y estacionarias se destilan con herramientas offline (`ABDNeuModMakr` / `ABDAudioLab`), y `ABDMCX0X` reconstruye envolventes `4T4L`, modulación y doble filtrado en tiempo real para edición completa.
- **Formato propietario evolucionado ([`abd_structured_rompler.schema.json`](../../ABDShared/Contracts/abd_structured_rompler.schema.json)):** une en una cápsula: `wavePool`, hasta **4 Partials Estéreo**, estructuras `RingMod`/`Booster`/`Parallel`/`Vector 2D`, **doble filtro en serie** (6 modelos, incl. `RolandTc6116Tvf` y `ZPlaneMorph`), envolventes `4T4L`, ModMatrix y **Drum Maps multi-estándar** (`0..127`) con *choke groups `0..15`*, disparo `OneShot`/`Gated` y envíos independientes a los 4 buses auxiliares FX.
- **Motores de Síntesis de Topología Completa de la Suite:** integración limpia de motores terminados de otros proyectos (ej. `JunoEngine` con sus 128 patches de fábrica) sin descomponerlos en bloques genéricos, preservando sus circuitos de modelado, curvas de calibración (LUTs) y carácter sonoro original.
- **Integración con `ABDBankManager`:** gestión unificada de bancos de muestras (`.abdbank`), compatibilidad futura con bancos sliceados tipo REX2 con secuencias MIDI embebidas, y carga de presets de sintetizadores de la suite.

### 4. ¿Cuántas pistas (Partes) y qué hace cada una?
- **16 Partes Libres simultáneas** asignadas en C++20 (`std::array<McxPartState, 16>`, zero-alloc; voces inactivas consumen `0 %` de CPU).
- **Selector Ortogonal de Instrumento & Destino por Pista:** el antiguo selector binario DRM/CHR se sustituye por una asignación desacoplada en dos dimensiones:
  1. **Destino / Motor:** `Internal: Structured Rompler`, `Internal: Juno-106 VA`, `External: Hardware MIDI Out (puerto y canal asignado)`, `Both A+B (Layer híbrido)`.
  2. **Formato Musical:** `Chromatic` (escala continua) o `DrumMap` (slots de percusión con notas fijas C1..B2).
- **Consola Mezclador 16 Canales de Altura Completa (Full-Height):** 16 tiras verticales simultáneas (`McxMixerConsole.ts`) con faders de largo recorrido, vúmetros duales (dBFS para audio / actividad para MIDI), panorámica, mute, solo, badge interactivo de instrumento (`INT:ROM`, `INT:JUNO`, `EXT:CH01`, `A+B`), canal MIDI (`1..16`), `TR` (seguir transposición global), potenciómetro de Glide (`0..500 ms`), envíos auxiliares y lanzaderas contextuales `[ TONE ]` y `[ PADS ]`.
- **Paneles Deslizantes Inferiores (Bottom Drawers):** utilidades independientes de síntesis profunda (`Tono & FX`) y ritmo (`MpcPadMatrix`) que emergen sobre la consola, sincronizadas directamente con la tira superior de 16 botones hardware. En modo `[ ENGINE ]`, la interfaz del cajón muta dinámicamente según el motor asignado a la pista.

### 5. ¿Cómo se ordena en el tiempo?
- **Transporte Autónomo Completo (`CompactTransportBar` en `ABDShared`):** controles de transporte (`Play`, `Stop`, `Record`, `Loop`), BPM (reloj interno / sincronización con host VST3) y **Metrónomo Triple-Modo** (`OFF` ➔ `BOTH` [Play+Rec] ➔ `REC` [Solo Grabación] ➔ `OFF`) con generador de audio WebAudio aséptico (`metronomeClicker.js`).
- **Secuenciador Piano-Roll Modal (`PianoRollModal` en `ABDShared`):** editor de secuencias basado en ticks PPQ (96/480 PPQ) para 1, 2, 4, 8... compases. Vistas automáticas según el tipo de parte: **Piano Roll Cromático** y **Drum Grid / TR-REC**, carril inferior de velocidad con detección de **Acento Roland (`velocity > 100`)**, y grabación de automatización de parámetros en tiempo real.
- **Groove & Shuffle Universal (`GrooveShuffleEngine` en `ABDShared`):** arquitectura jerárquica con **Master Groove** y anulación por parte (**`GLOBAL` \| `CUSTOM` \| `OFF`** para bombos y bajos rectos), con algoritmos canónicos de la industria (MPC 60/3000 de Roger Linn, Roland TR-909, E-mu SP-1200, Triplet y Dilla).
- **Arpegiador Groove DRY (`GrooveArpeggiator.h`):** 12 motivos, divisores de reloj, swing bipolar y máscara de hasta 32 pasos.
- **Modo Canción (`Song Mode`):** arquitectura preparada para estructurar bloques/escenas de patrones con repeticiones, máscara de mute y transposición por bloque.

### 6. ¿Cómo se controla?
- **Gobernado por Contrato (`abdmcx0x_parameter_spec.json` bajo CDD v2.0):** ruteo ordenado de parámetros e integridad de tipos.
- **Tira Hardware de 16 Pasos (`StepButtonStrip` en `ABDShared`):** situada bajo la pantalla LCD con 5 modos operativos (`PART SEL`, `PART MUTE`, `STEP MUTE`, `ACCENT`, `SLIDE / GLIDE`) y chaser animado en tiempo real.
- **Matriz de Pads Universal (`MpcPadMatrix` en `ABDShared`):** cuadrícula táctil 4x4 con Modo Ritmo, Modo Cromático (escalas/In-Key) y función clásica *16-Levels* de Akai MPC.
- **Perfiles de MIDI Learn:** compatibilidad con controladores y teclados hardware mediante perfiles externos de mapeo (`MidiLearnManager.h` en `ABDShared`), prescindiendo de espejos SysEx bidireccionales complejos en el núcleo del DSP.

### 7. ¿Qué muestra la pantalla?
- Barra superior: `SynthNavBar` con menús completos, selector de temas y atajos globales.
- Sub-barra de transporte e indicadores: `CompactTransportBar`, LCD de dos líneas y `StepButtonStrip` (16 botones físicos con chaser activo).
- Zona central: **Consola Mezclador de 16 Canales** de altura completa optimizada para resolución de referencia 1280x720 y tablets táctiles de 10 pulgadas.
- Paneles deslizantes inferiores (Bottom Drawers): `Tono & FX` y `MpcPadMatrix`, que se despliegan sobre la consola y se cierran desde su propio botón `[ ✕ ]`.
- Modales flotantes universales de `ABDShared`: `MultiBusFxRackModal`, `GlobalLfoModal`, `PianoRollModal`, `GrooveShuffleModal` y `DiagnosticProbeModal`.
- Zona inferior: Teclado cromático virtual (`@abdsynths/midi-keyb`) con ruedas Pitch/Mod y botón de **colapsar / descolapsar** para maximizar el área de trabajo en pantallas táctiles o uso con teclado MIDI externo.

### 8. ¿Qué se guarda y cómo se conecta?
- **Jerarquía de 3 Niveles:**
  1. *Global / Sistema:* Configuración del sinte (directorio de trabajo, audio/MIDI, polifonía, tema e idioma).
  2. *MultiPreset (.abdmulti):* Estado completo de las 16 partes, Rack FX Master, LFOs Globales y Groove Master.
  3. *PartPreset (.abdpart):* Sonido y configuración individual de una parte cromática o kit de batería.
- **Directorio de Trabajo Unificado:** compatible con `AxionikDB` (`Models/`, `Presets/Parts/`, `Presets/Multis/`, `Presets/Patterns/`, `Banks/`, `MidiLearn/`).
- **`ABDBankManager`:** gestión canónica de bancos `.abdbank` y presets con pre-escucha.

### 9. ¿Sobre qué base lo construimos?
- **C++20 + JUCE 9 (Static WebView2) + Emscripten WASM + `ABDShared`**, compartiendo `DspSources.cmake` entre nativo y Web.
- **Filosofía DRY y Módulos Asépticos:** toda funcionalidad compartida reside en `ABDShared` (DSP, componentes UI, estilos y contratos).
- **Límites estrictos de código:** archivos C++ `< 300` líneas, archivos TS/JS/CSS `< 200` líneas, 100% token-driven sin colores hardcodeados y cero asignaciones de memoria dinámica en el hilo de audio.

---

## Matriz de Convergencia del Hardware Objetivo

| Equipo | Capas/Partials | Qué aporta al motor común `ABDMCX0X` |
| :--- | :--- | :--- |
| **MC-303 / SC-55 / DR-5** | 1–2 Partials | Base Tono→Partial→Wave, `4T4L`, choke groups, Acento Roland (`vel > 100`), paleta sonora de los 90. |
| **Roland D-2 / MC-505** | 4 Partials Mono | 10 Estructuras (`RingMod`, `Booster`), TVF multimodo, edición TVF/TVA por tecla. |
| **Roland MC-909 / XV** | **4 Partials Estéreo** | Pares de ondas `L/R` nativas por Partial, Drum Maps ampliados. |
| **Akai MPC (60/3000/Live)** | Pads y Groove | Matriz 4x4, 16-Levels, algoritmos de Swing/Shuffle y pads táctiles. |
| **Quasimidi 309** | Híbrido ROM + VA | *Overdrive* por voz, filtros ácidos resonantes (`ms20_acid`, doble filtro en serie). |
| **E-mu Orbit / Carnival** | 4 Capas + Matrix | ModMatrix con Via-Attenuators + filtro `zplane_morph` espectral. |
| **Yamaha TG33 / Wavestation** | 4 Elementos Vector | Mezcla espacial `vector_2d (X,Y)` con envolvente multipunto. |

---

## FUERA DE LA VERSIÓN v1 · BACKLOG BLINDADO

Lo que **NO** entra hasta cerrar el núcleo v1 estable:
1. Emulación de CPU hardware binaria (`MB90705`) o inclusión de ROMs binarias originales protegidas.
2. Salidas físicas multi-bus (`> 2` canales de audio VST3) — v1 trabaja íntegramente en bus Estéreo `2.0` con el limitador `MasterSafetyLimiter`.
3. Motor de análisis pesado / *de-baking* neural o lectores ISO SCSI Akai/E-mu dentro del plugin VST3 (viven en `ABDNeuModMakr`).
4. Espejo bidireccional SysEx complejo con sincronización hardware de vuelta (se utiliza la arquitectura simplificada de perfiles `MidiLearn` y emisión directa de contratos).
5. **Hosting de plugins VST/VST3 de terceros dentro de las pistas:** formalmente descartado para v1. Razones técnicas: conflicto de ventanas nativas flotantes sobre WebView2, gestión de Plugin Delay Compensation (PDC) dinámica, riesgo crítico de crashes externos que tiran la sesión completa y 0 % de compatibilidad con WASM/Web. La necesidad de sonidos externos se cubre al 100 % mediante **Ruteo MIDI Out por Contratos (`ExternalMidiEngine`)** hacia el DAW o hardware físico, y mediante la familia de **Motores Internos de la Suite (`IMcxSoundEngine`)**.
