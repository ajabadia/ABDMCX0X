# Brief de Diseño y Arquitectura en 9 Decisiones — ABDMCX0X

> **Propósito:** Fijar de forma inequívoca el alcance, la arquitectura y los límites de **ABDMCX0X** antes de construir cada capa (plantilla de *9 Decisiones* + decisiones técnicas del ecosistema `ABDSynths`), evitando iteraciones innecesarias y retrabajo.

---

## TU FRASE · HIPÓTESIS DEL PRODUCTO

> *«Un Groove-Rompler estructurado de 4 Partials Estéreo y Controlador universal de módulos de los 90 (VST3 / Standalone / WASM), libre de ROMs y muestras protegidas, con partes de síntesis e intercambio de filtros/DAC modulares y modo espejo MIDI/NRPN/SysEx en vivo (`INT | EXT | A-B`) gobernado por contratos.»*

---

## Las 9 Decisiones Cerradas

### 1. ¿Qué tipo de instrumento es?
- Instrumento híbrido **Structured Rompler + Drum Synth Rack + Controlador Hardware MIDI/NRPN/SysEx**, en formatos **VST3**, **Standalone** y **WASM (`AudioWorklet`)**.
- Interfaz gráfica obligatoria en **WebView2** (enlazado estático en Windows) usando componentes Zero-Fork de `ABDShared` (`SynthNavBar`, `LcdDisplay`, `Scope`, `FitStage`, `StepMatrix`, `@abdsynths/midi-keyb`, `ABDBankManager`).
- **Salida de audio:** Bus **Estéreo `2.0`** único en v1 (basta para mezcla en DAW; entradas de audio desactivadas por defecto siguiendo la regla de arranque WASAPI/CoreAudio).
- **Producto único:** sin variantes de compilación (`CLASSIC`/`PLUS`/`EXPANDED`). Los módulos internos (**filtro**, **etapa DAC/cuantización**, **estructura de 4 Partials**, **matriz FX**) se intercambian en caliente por parte/preset.
- **Modos de Máquina (*Personas*) vs Modo Libre (`FreeSuper`):** además del **Modo Libre / Super** (hasta 4 Partials, 64 voces dinámicas, 6 filtros y mapa de batería libre `0..127`), la interfaz permite activar modos presintonizados que aplican tema visual y límites curados de máquina (*Roland MC-303* con presupuesto auténtico de 28 Partials, *MC-505/D-2*, *Yamaha CS2x/XG*, *Korg N5/AI2*, *E-mu Orbit*, *Quasimidi 309*). La polifonía es dinámica desde Settings y las voces/partials inactivos consumen `0 %` de CPU.

### 2. ¿Para quién es y dónde se usa?
- Productores de estudio y directo que buscan la pegada e inmediatez de los módulos y grooveboxes de los 90/2000 (MC-303/505/909, D-2, SC-55, DR-5, Quasimidi Rave-O-Lution 309, E-mu Orbit/Carnival, Yamaha TG33, Korg M1/Wavestation) tanto en software autónomo como controlando y comparando en A/B el hardware real desde el mismo plugin.

### 3. ¿De dónde sale el sonido? (Seguridad Legal y Propiedad Intelectual)
- **Cero Mask ROMs y cero PCM protegido de fábrica:** jamás se incrustan ni ejecutan ROMs de fabricantes (`IC3`, `SC-55`, etc.) ni librerías con copyright de terceros ni código GPLv3 (`grvbox-main`) o sin licencia (`MC3o3-arpegiator`).
- **Estrategia de *De-Baking* (des-horneado):** los WAVs externos o capturas de referencia llevan impresos el Pitch Env, el TVF y el TVA. Con `ABDNeuModMakr` y `ABDAudioLab` destilamos **ondas base crudas y estacionarias** (síntesis espectral + residuo DDSP Bark en 24 bandas + VA `PolyBLEP`), y `ABDMCX0X` reconstruye la envolvente `4T4L` y el filtrado en tiempo real para permitir edición libre completa.
- **Formato propietario evolucionado ([`abd_structured_rompler.schema.json`](../../ABDShared/Contracts/abd_structured_rompler.schema.json)):** supera a `SF2` y `SFZ` uniendo en una cápsula: `wavePool` (*spectral DDSP*, *PCM*, *VA*, *FM*, *Axionik Surface*), hasta **4 Partials Estéreo**, estructuras `RingMod`/`Booster`/`Parallel`/`Vector 2D (X,Y)`, **6 modelos de filtro** (incl. `RolandTc6116Tvf` y `ZPlaneMorph`), envolventes de **5 etapas** (`L0..L4`/`T0..T4` con LUTs `IC7`), *PatchCords* (`ModMatrixT`) y **Drum Maps multi-estándar** (`gm_standard`, `roland_gs_mc`, `yamaha_xg_xs`, `korg_ai2_n5`, `hardware_native`, `proprietary_custom` `0..127`) con *mute groups* `1..31`, disparo `OneShot`/`Gated` y remapeador bidireccional (`DrumNoteRemapper`).
- **Librerías Akai / E-mu / Yamaha / Roland del usuario:** en v1 se convierten offline con `ABDNeuModMakr` al formato propietario. Dado que el motor de formatos vive ya en TypeScript en `ABDShared/Code/SamplerFormats`, cuando el núcleo C++ de `ABDMCX0X` esté pulido bastará exponer el cargador del contrato propietario al bridge JS sin rehacer una línea del DSP.

### 4. ¿Cuántas pistas (Partes) y qué hace cada una?
- **Motor C++ pre-asignado para 16 Partes** desde el Día 0 (`std::array<McxPartState, 16>`, zero-alloc; las partes inactivas consumen `0 %` de CPU).
- **Truco de escalado sin saturar el `APVTS` ni la UI:**
  - Fase inicial ergonómica con **1 Parte melódica enfocada + 1 Parte Drum Kit (Canal 10)** mediante patrón **Focused-Part Proxy** (`APVTS` expone edición profunda de la parte enfocada + mezcla/mute/routing ligero de las 16 partes).
  - La infraestructura interna y de estado (`BankManager`) queda preparada para desplegar las 8 o 16 partes completas (modo módulo GS completo) cuando sea necesario sin romper presets ni contratos.
- Cada Parte tiene conmutador **`INT` (motor interno) | `EXT` (controlador MIDI/NRPN/SysEx) | `BOTH` (comparación A/B en vivo)**.

### 5. ¿Cómo se ordena en el tiempo?
- **Sin secuenciador completo de canciones/patrones** en el plugin: el DAW ya cumple esa función con creces (la puerta queda abierta en arquitectura para una fase posterior).
- **Arpegiador Groove DRY (`abd::synth::GrooveArpeggiator` en `ABDShared::SynthCore`):** implementación limpia desde cero con **12 motivos**, **16 divisores de reloj** (`1/48..4/1`), **swing bipolar `-100%..+100%`** con media temporal invariante, `LatchReArm`, *strum* en ms, acento y **patrón/máscara rítmica programable de hasta 32 pasos** (superando al arpegiador de MC-303/MS2000 y reutilizado también por `ABDMS2000`).

### 6. ¿Cómo se controla?
- **Gobernado por Contrato (`abdmcx0x_parameter_spec.json` bajo `CDD v2.0` + `hardware_profile.schema.json`):** `SymBipolar` con `wireZeroCenter: 64` en parámetros MIDI/NRPN de rango `0..127` / `14..114`.
- **`HardwareMirrorRouter` estrictamente ordenado:** corrige bugs clásicos de editores externos emitiendo siempre `CC99 (MSB) -> CC98 (LSB) -> CC6 (Data)` antes que el valor, tanto para canales melódicos (`CC99=1`) como por tecla de batería (`CC99=24/26/28/29/30`), además de checksum exacto Roland 7-bit `DT1` (`(0x80 - (sum & 0x7F)) & 0x7F`).
- **Primeros perfiles en `ABDShared/Contracts/`:** **`boss_dr5.json`** (hardware disponible ya en mesa para pruebas en vivo), **`roland_mc303.json`**, **`roland_d2.json`** y **`roland_sc55.json`**.

### 7. ¿Qué muestra la pantalla?
- `SynthNavBar` arriba + pantalla central (`LcdDisplay` + **`ABDShared/Code/Scope`** via `ABDShared::ScopeCore` / `@abdsynths/shared/scope` `createScope()` en modo multirraíl osciloscopio, espectro FFT, espectrograma y `VuMeterRenderer`) + tira de parte (`INT/EXT/AB`, filtro intercambiable, carácter de salida) + pestañas modulares (`4-Partial / Vector XY`, `Drum Rack 128`, `Groove Arp`, `Hardware Mirror / LiveSysExInspector`, `ABDBankManager`).
- Zona inferior con **`ABDShared/Code/MidiKeyboard`** (`@abdsynths/midi-keyb` / `createKeyboard()`, con ruedas Pitch/Mod, Chord Memory, animación de LEDs, resaltado de ranuras Drum Rack y contrato de franja CSS registrado en `host-strip-height.test.js` para WebView2).

### 8. ¿Qué se guarda y cómo se conecta?
- **`ABDBankManager`** es el sistema canónico de presets y bancos tanto en modo Plugin Host (blob serializado en el chunk DAW) como en modo Standalone Librarian.
- Carga de cápsulas `.abdrompler.json` (`abd_structured_rompler.schema.json`) y perfiles hardware desde `ABDShared/Contracts/`.

### 9. ¿Sobre qué base lo construimos?
- **100 % propietario en C++20 + JUCE 9 (Static WebView2) + Emscripten WASM + `ABDShared` + `ABDBankManager`**, compartiendo `DspSources.cmake` entre Nativo y WASM. Archivos pequeños (`< 300` líneas C++, `< 200` líneas JS/TS), código/identificadores en inglés y cero asignaciones en el hilo de audio.

---

## Matriz de Convergencia del Hardware Objetivo

| Equipo | Capas/Partials | Qué aporta al motor común `ABDMCX0X` |
| :--- | :--- | :--- |
| **MC-303 / SC-55 / DR-5 / M1** | 1–2 Partials | Base Tono→Partial→Multisample→Wave, `4T4L`, `muteGroup`, NRPN `CC99=1` y Drum NRPN |
| **Roland D-2 / MC-505** | 4 Partials Mono | 10 Estructuras (`RingMod`, `Booster`), TVF multimodo, edición TVF/TVA por tecla |
| **Roland MC-909 / XV** | **4 Partials Estéreo** | Pares de ondas `L/R` nativas por Partial |
| **Quasimidi Rave-O-Lution 309** | Híbrido ROM + VA | *Overdrive* por voz, filtros ácidos resonantes (`ms20_acid` / `ladder_drive`) |
| **E-mu Orbit / Carnival** | 4 Capas + Matrix | *PatchCords* (`ModMatrixT`) + filtro **`zplane_morph`** entre dos marcos espectrales |
| **Yamaha TG33 / Korg Wavestation** | 4 Elementos Vector | Mezcla espacial **`vector_2d (X,Y)`** con envolvente multipunto |

---

## FUERA DE LA VERSIÓN v1 · BACKLOG BLINDADO

Lo que **NO** entra hasta cerrar el núcleo v1 estable:
1. Emulación de CPU hardware (`MB90705`) ni ejecución/inclusión de ROMs binarias originales.
2. Secuenciador lineal completo de canciones, compases RPS o importador directo de `.mid` canciones dentro del plugin.
3. Motor de análisis pesado / *de-baking* neural o lectores ISO SCSI Akai/E-mu dentro del binario VST3 (en v1 viven en `ABDNeuModMakr`; en fase posterior se conectarán vía puente WebUI si conviene).
4. Salidas físicas multi-bus (`> 2` canales VST3) — v1 trabaja íntegramente en Estéreo `2.0`.
