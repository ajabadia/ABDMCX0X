# Visión de Producto y Arquitectura — ABDMCX0X (Groovebox Modular de 16 Partes)

> **Estado:** Documento vivo de visión y diseño arquitectónico (v5 — desacoplamiento de dos naturalezas: Workstation Aséptica vs Rompler Modular, consola full-height, piano-roll PPQ, transporte, shuffle universal y ruteo MIDI Out por contratos).  
> **Documento de detalle técnico:** Ver [ARQUITECTURA_DETALLE_WORKSTATION_MIDI_OUT.md](file:///D:/desarrollos/ABDSynths/ABDMCX0X/DOCS/ARQUITECTURA_DETALLE_WORKSTATION_MIDI_OUT.md).  
> **Última actualización:** 2026-11-18

---

## 1. Decisiones Cerradas de Arquitectura y Producto

| Área | Decisión Cerrada | Reutilización / Promoción en `ABDShared` |
| :--- | :--- | :--- |
| **Chasis Host Multi-Motor Aséptico (`IMcxSoundEngine`)** | **Workstation Aséptica (Capa 1)** independiente de los **Motores de Síntesis (Capa 2)**. ABDMCX0X opera como un chasis/host modular de 16 pistas. Cada pista aloja cualquier motor que implemente `IMcxSoundEngine`: 1) `StructuredRomplerEngine` (independizado de la suite); 2) `JunoEngine` (importado de `ABDJUNiO601`); 3) `ExternalMidiEngine` (control hardware/DAW por contratos JSON); y futuros micro-motores (`Ms2000Engine`, `CzEngine`). | Interfaz abstracta `IMcxSoundEngine` y motores promovidos a `ABDShared/Code/SynthEngines/`. |
| **Independencia del Structured Rompler** | El Rompler de 4 parciales deja de ser código fundido con la workstation y se formaliza como **instrumento independiente de la suite** (`StructuredRomplerEngine`), gobernado por el contrato `abd_structured_rompler.schema.json`. Reutilizable en futuros plugins (Sound Canvas / JV-1080) sin arrastrar la groovebox. | Módulo `StructuredRomplerEngine` en `ABDShared::SynthCore`. |
| **Topologías Completas vs. Bloques Sueltos** | Para que un motor suene a su referencia analógica (ej. Juno-106), **NO se reconstruye desde osciladores o filtros genéricos**. Se importa su clase de topología completa (`JunoEngine`) que ya encapsula el cableado, las no-linealidades del IR3109, el HPF bass boost, el chorus BBD I/II y las tablas de calibración (LUTs), consumiendo sus 128 patches de fábrica de `FactoryPresets.h`. | Topologías completas compartidas entre el plugin dedicado y MCX0X. |
| **Descarte Formal de Hosting VST3 en v1** | Se rechaza hospedar plugins VST/VST3 de terceros dentro de las pistas por conflicto de ventanas nativas con WebView2, latencia variable (PDC), riesgo de cuelgues externos y nula compatibilidad en WebAssembly/WASM. Las necesidades sonoras se cubren con **Motores de la Suite + MIDI Out por Contratos**. | Regla de estabilidad blindada. |
| **Motor único libre** | Se eliminan los modos limitadores (`SuperFree`, `MC-303`, `DR-5`); todo opera como motor libre. Se conservan las estéticas como **Temas Visuales** (`ms2000`, `neuron`, `mc303`, `dr5` en Claro/Oscuro). | Temas ya en `ABDShared/Assets/styles/themes/`. |
| **16 Partes Libres y Ortogonales** | Cada parte (`1..16`) define de forma independiente: 1) **Formato Musical** (`Chromatic` / `DrumMap`); y 2) **Motor y Destino** (`StructuredRompler` / `JunoEngine` / `ExternalMidi` / `BothAB`). Por defecto: P10 = `Rompler DrumMap`, resto = `Rompler Chromatic`. | Contrato `McxPartKind` + `McxPartRouteMode` en C++ y WebUI. |
| **Consola Mezclador 16 Canales (Full-Height)** | **[COMPLETADO] Consola horizontal con 16 tiras verticales de canal (`.mcx-strip`):** P01..P16 independientes alargadas ocupando toda la altura central en canvas 1280x720. Incluyen badge interactivo de Instrumento & Ruteo (`INT:ROM`, `INT:JUNO`, `EXT:01`, `A+B`), botón de sonido (abre Bank Drawer), lanzaderas de cajón inferior `[ TONE ]` y `[ PADS ]`, canal MIDI (`CH1..16`), `TR` (seguir transposición), potenciómetro de **Glide / Portamento** (`GLD` 0..500 ms), envíos auxiliares (`Send A/B`), `PAN`, `Mute` y `Solo` iluminados, y fader vertical de largo recorrido con escala en % y dB y vúmetro contiguo. | Componente `McxMixerConsole.ts` en WebUI. |
| **Tira Hardware 16 Pasos (`@abdsynths/shared`)** | **[COMPLETADO]** Componente canónico universal de botones físicos (`StepButtonStrip.js` + `step-button-strip.css`) situado bajo la LCD con 5 modos (`PART SEL`, `PART MUTE`, `STEP MUTE`, `ACCENT`, `SLIDE / GLIDE`) y chaser animado en tiempo real. **Sincronización maestra:** los cajones inferiores de Tono & FX y MpcPadMatrix se sincronizan directamente con esta tira (al pulsar una parte en `PART SEL` o mutearla en `PART MUTE`), eliminando pestañas redundantes internas. | Promovido canónicamente a `ABDShared/Components/Controls/` y reutilizado también en `ABDMS2000`. |
| **Acento Roland (Velocidad > 100)** | Umbral clásico Roland `velocity > 100` que activa dinámicamente el circuito de acento (apertura VCF, golpe VCA y mordida de decay) tanto en notas melódicas como de batería. | Implementado y verificado en DSP `McxVoice.cpp`. |
| **Wavetables (`ABDMS2000` OSC 1)** | Las 512 tablas DWGS/AKWF/Usuario serán un **tipo de motor propio (`DwgsWavetable`)**, no convertidas a PCM estático, visibles y clasificadas en el Bank Manager. | Promover `DWGSTables` + `DWGSOscillator` (limpio, ~4 MB RAM) a `ABDShared::DspCore`. |
| **Directorio de Trabajo** | Directorio raíz configurable compatible con `AxionikDB` (`Models/`, `Presets/Parts/`, `Presets/Multis/`, `Presets/Patterns/`, `Banks/`, `MidiLearn/`). | Compatible con `ABDAxionikVS` y `ABDNeuModMakr` + `bankCategories.js` (`cat-0..cat-9` e imágenes). |
| **Canal de Parte (Mesa)** | **[COMPLETADO EN DSP]** EQ paramétrico ligero + Drive suave por parte, Volumen general de parte, Pan, Mute/Solo, y **4 envíos independientes (`Send A..D`) con volumen propio y selector Pre/Post-Fader**. | Reutiliza primitivas en `ABDShared::DspEffects`: `CascadeShelfEq.h` + `DspSaturation.h` (con bypass 0 % CPU en reposo). |
| **Rack FX Master** | **[COMPLETADO EN DSP]** Al final de la cadena (antes de Master Volume), generalizado y flexible: **múltiples entradas (4 buses estéreo `Send A..D` + `Dry`)** y 4 topologías encadenables (`ParallelSends`, `CascadeInjection`, `HybridSendInsert`, `SerialMaster`). | `DspMultiBusFxRack.h` implementado y promovido a `ABDShared/Code/DspEffects/` con `MasterSafetyLimiter` integrado. |
| **LFOs Globales + Locales + ModMatrix** | **4 LFOs Globales** (sincronizables a BPM) + **2 LFOs Locales por Parte** (con *key-sync* y Delay/Fade-In). **Mute + auto-skip a 0 % CPU** si un LFO está muteado o no tiene rutas activas. Envolvente sobre LFOs globales gestionada por parte vía **Via-Attenuator (`Source × Via`)** en la ModMatrix (p. ej. `GLFO1 × ModEnv` o `ModWheel`) + `ModEnv` local por parte. Evaluado a control-rate (16–32 muestras) para `< 1 %` CPU. | Reutilizar `ABDShared/Code/SynthCore/ModMatrix.h` (misma base que `ABDEep`) + `LFO.h` / `LfoAnalog.h` + CDD v2.0 `ModSlotViaSource`. |
| **Doble Filtro en Serie (`Filter 1 → Filter 2`)** | **[COMPLETADO]** Hasta **2 filtros concatenados en serie por parte**, con bypass individual (0 % CPU apagado). Selección en dos niveles: primero **tipo** (`LPF`, `HPF`, `BPF`, `Notch`, `Comb`, `Z-Plane`) y después **modelo DSP concreto** disponible para ese tipo (SVF, Roland TC6116AF, Juno IR3109/HPF, Moog Ladder, MS-20, etc.). | `McxFilterBank` + `McxChannelStrip` + UI en `McxToneDrawer`. |
| **Paneles Deslizantes Inferiores (Bottom Drawers)** | **[COMPLETADO / EVOLUCIONADO]** En lugar de un monolito saturado, la edición se divide en 3 pantallas limpias: 1) **`[ TRACK ]`**: ajustes generales y control semántico de pista (Afinación, Portamento, Envolvente VCA, LFOs, Pan, Vol); 2) **`[ CH AUDIO ]`**: procesamiento de audio de canal (EQ 3B, Drive, VCF 2 de canal, Envíos A..D); 3) **`[ ENGINE ]`**: motor activo de síntesis (Rompler 4-partials, estructuras, Vector 2D, VCF 1 de voz) o panel de macros hardware si es MIDI Out. Se complementan con **`MpcPadMatrix`** (pads de ritmo y cromático). | Patrón `BottomDrawerManager` en WebUI. |
| **Matriz de Pads Universal (`MpcPadMatrix` en `ABDShared`)** | **[COMPLETADO]** Grid 4x4 táctil y aséptico con **Modo Ritmo** (nombres de percusión, choke groups, notas MIDI) y **Modo Cromático** (notas musicales, octavas, selector de escalas, modo In-Key, 16-Levels). Reutilizable en toda la suite. | Componente `MpcPadMatrix.js` + `mpc-pad-matrix.css` en `ABDShared/Components/Controls/`. |
| **Teclado Virtual con Colapso** | **[COMPLETADO]** Teclado cromático inferior dockeado con botón de **colapsar / descolapsar** para maximizar área de trabajo en pantallas compactas o al tocar con teclado MIDI hardware. | `@abdsynths/midi-keyb` + control de colapso en WebUI. |
| **Utilidad de Acordes (Chord Mode)** | Generador e interpretador de acordes por pad/tecla (Chord Memory, progresiones diatónicas, rasgueo/strum), anotado para investigar referencias de mercado y definir. | Futuro módulo aséptico en `ABDShared`. |
| **Drum Maps (Paridad MC-303+ por sonido)** | Edición completa **por cada sonido/pad** del Drum Kit (mínimo paridad MC-303 ampliada): `Attack`, `Decay/Release`, `Pitch` (Coarse/Fine), `Volume`, `Pan`, `Filter Cutoff/Reso`, `Choke/Mute Group (0..15)`, `One-Shot/Gated`, `Start/End/Reverse`, `Accent` y envíos independientes a los **4 buses FX (`Send A..D`)**. | Extender `McxDrumSlotConfig` y contrato `drum_map_profile.schema.json`. |
| **Transposición Global** | Soporta **transposición cromática por tono (`-24..+24`) y por Escala / Tonalidad** (afecta solo a partes cromáticas habilitadas, nunca a Drum Maps). | **Crear en `ABDShared`:** `SynthCore/MusicalScaleTransposer.h` (C++20 RT-safe `O(1)`) + **integración directa en `@abdsynths/midi-keyb`** (resaltado de notas en escala y transposición en vivo). |
| **Controlador Universal MIDI Out por Contratos** | **[DISEÑADO / C++ LISTO]** Ruteo directo de notas y parámetros semánticos (Cutoff, Reso, Envolventes, Level, Pan) hacia hardware externo o pistas del DAW vía contratos JSON (`Contracts/*.json`). Cero consumo DSP adicional (`0 %` CPU), aislado de caídas externas. Emisión lock-free ordenada de CCs, tripletas NRPN Roland (CC99 $\to$ CC98 $\to$ CC6) y SysEx `DT1`. | `HardwareMirrorRouter.h`, `McxHardwareBridge.h`, `McxMidiOutQueue.h` y `ABDShared/Contracts/`. |
| **Secuenciador Piano-Roll (Modal)** | **[COMPLETADO EN ABDSHARED]** Editor gráfico modal de notas y patrones en ticks PPQ (96/480 PPQ), compatible con compases (`1, 2, 4, 8...`), pistas cromáticas y Drum Grid (TR-REC), carril de velocidad con detección de acento Roland (`> 100`) y grabación de movimiento de parámetros en tiempo real. | Componente `PianoRollModal.js` en `ABDShared/Components/PianoRoll/`. |
| **Transporte Autónomo + Metrónomo Triple-Modo** | **[COMPLETADO EN ABDSHARED]** Barra de transporte compacta (`Play`, `Stop`, `Record`, `Loop`), BPM (reloj interno / sincronización con host VST3) y **Metrónomo Triple-Modo** (`OFF` ➔ `BOTH` [Play+Rec] ➔ `REC` [Solo Grabación] ➔ `OFF`) con síntesis de audio WebAudio aséptica (`metronomeClicker.js`). | Componente `CompactTransportBar.js` en `ABDShared/Components/Controls/`. |
| **Groove & Shuffle Universal** | **[COMPLETADO EN ABDSHARED]** Arquitectura jerárquica con Master Groove y anulación por parte (`GLOBAL` \| `CUSTOM` \| `OFF`), con algoritmos clásicos de la industria (MPC 60/3000 de Roger Linn, Roland TR-909, E-mu SP-1200, Triplet y J Dilla). | `GrooveShuffleEngine.h` + `GrooveShuffleModal.js` en `ABDShared`. |
| **Modo Canción (`Song Mode`)** | Secuencia ordenada de bloques/escenas de patrones (`Scene + Repeticiones + Mute Mask + Transposición por bloque`) para estructurar temas completos sin duplicar memoria. | Motor de canción estructurado en ticks musicales. |

---

## 2. Jerarquía de 3 Niveles de Configuración y Datos

1. **Nivel 1 — Configuración Global del Sinte (Sistema / Local, no viaja en presets):**
   - Directorio de trabajo (`WorkingDirectory`), sample rate, polifonía máxima global, afinación maestra (`A4 = 440 Hz` ± cents), BPM en Standalone, configuración de audio/MIDI, perfil de MIDI Learn activo, tema visual e idioma.
2. **Nivel 2 — Preset General (`MultiPreset` / Performance de 16 Partes):**
   - Las 16 partes (su `PartKind`, canal MIDI, estado y referencia/embed de `PartPreset`), Rack FX Master (slots + topología de los 4 buses), LFOs Globales, Transposición Global (tono + escala/tonalidad) y (futuro) Escenas/Hotcues `1..8`.
3. **Nivel 3 — Canal de Parte (`PartPreset`):**
   - **Común a toda parte:** `engineId` (`structured_rompler`, `juno106`, `ms2000`, `external_midi`), `PartKind` (`Chromatic` / `DrumMap`), Canal MIDI receptor (1:1 por defecto, editable para *layers*/*splits*), EQ Paramétrico ligero + Drive, Pan, Volumen, Mute/Solo, 4 envíos (`Send A..D`, cada uno con nivel y Pre/Post-Fader), Utilidades MIDI de inserción (Seq/Arp/Chord).
   - **Específico `StructuredRompler`:** Filtro(s), Envolventes 4T4L, Matriz de Modulación, Parciales 1..4, Accent Acid, bandera *"Seguir Transposición Global"*.
   - **Específico `JunoEngine`:** Parámetros DCO, sub-oscilador, corte IR3109, HPF bass boost, chorus BBD I/II, y número de patch original (`0..127`).
   - **Específico `ExternalMidi`:** Puerto MIDI físico/virtual, canal de salida (1..16), ID de contrato hardware (`roland_mc303`, `korg_ms2000`, etc.) y tabla de CCs/NRPNs mapeados.
   - **Específico `DrumMap`:** Nivel Kit/Parte (macros de filtro/decay, ModMatrix de kit, volumen/envíos maestros) + Nivel Pad/Tecla (muestra/modelo, nivel, pan, pitch, *choke group*, offsets de filtro/decay, envíos FX propios). Compatible con slices REX2 / bucles troceados gestionados por `ABDBankManager`.

---

## 3. Directorio de Trabajo Unificado (Compatible con `ABDAxionikVS` y `ABDNeuModMakr`)

```text
<WorkingDirectory>/                  # Compatible con AxionikDB/
├── Models/                          # Materia prima sonora (compartida en la suite)
│   ├── Rompler/                     # Modelos cromáticos multicapa (.abdbank / carpetas)
│   ├── Drums/                       # Modelos Drum Map (kits 128 teclas)
│   ├── Wavetables/                  # Ciclos únicos DWGS / AKWF / WAV usuario
│   └── Spectral/                    # Modelos Resynator (compatibles con ABDAxionikVS)
├── Presets/
│   ├── Parts/                       # Presets individuales de Parte (Cromática o Drum)
│   ├── Multis/                      # Presets Generales de Groovebox (16 Partes + FX + LFOs)
│   └── Patterns/                    # (Futuro) Patrones MIDI / Piano Roll reutilizables
├── Banks/                           # Contenedores .abdbank portables (con tree-shaking)
└── MidiLearn/                       # Perfiles completos de MIDI Learn por dispositivo físico
```

- Taxonomía compartida: `ABDShared/Components/bank/bankCategories.js` (`CATEGORY_0_9`, Parameter Sets inmutables de Hartmann Neuron, multiliteral EN/ES + `neuron`/`music`/`short`): `cat-8 = Loop Factory / Drums, Perc & Loops`, `cat-9 = Multipurpose / SFX, Drones & Exp.`; el eje ortogonal es `playMode: chromatic | drum_map`. Iconos de instrumento de `ABDNeuModMakr`.

---

## 4. Diseño Técnico del Secuenciador Piano-Roll (Modal estilo Cubase)

Para que soporte **cualquier duración en compases (`1, 2, 4, 8...`)**, polifonía real, **grabación en tiempo real (con o sin cuantización)**, **Parameter Locks** y en el futuro cambios de compás (`4/4`, `3/4`, `6/8`, `5/4`) **sin reescribir el motor ni el formato de datos**:

1. **Representación interna en Ticks Musicales (`96 PPQ` o `480 PPQ`):**
   - Cada patrón guarda `{ bars, timeSigNum, timeSigDen, gridDivision, swing, events[] }`.
   - Longitud total del bucle en ticks = `bars * timeSigNum * (4 / timeSigDen) * PPQ`.
     - En `4/4` (`4/4`, `96 PPQ`): 1 compás = `384` ticks (`16` semicorcheas), 4 compases = `1536` ticks (`64` semicorcheas), 8 compases = `3072` ticks.
     - En futuro `3/4`: 1 compás = `288` ticks (`12` semicorcheas) — cero cambios en el motor.
2. **Estructura de evento RT-safe (cero heap durante playback):**
   - `startTick`, `durationTicks`, `midiNote`, `velocity` (dispara **Acid Accent** si `>= umbral`), y hasta `K` **Parameter Locks** opcionales (`paramId`, `value`) que aplican durante esa nota/paso y restauran al valor base al terminar.
3. **Dos vistas coherentes en la misma Modal según `PartKind`:**
   - **Parte Cromática:** **Piano Roll** clásico (mini-teclado vertical, rejilla de `1..N` compases con zoom horizontal, barras de nota arrastrables/estirables en duración, carril inferior para Velocity / Accent / P-Locks).
   - **Parte Drum Map:** **Drum Grid / TR-REC** (eje vertical con los nombres de los pads del kit cargado, golpes por paso, carril inferior de Velocity / Accent / P-Locks).
4. **Grabación en tiempo real + Cuantización:**
   - Captura las notas entrantes en ticks exactos del bucle en reproducción, con selector `Quantize: Off / 1/8 / 1/16 / 1/16T / 1/32` y fuerza `0..100 %` (sobregrabación *overdub* o reemplazo).

---

## 5. Ideas de Flujo Groovebox & Akai MPC (Clean-Room, Alto Impacto / Bajo Coste)

### A) Inspiración de Groovebox Live (`grvbox-main` y `groove-lps-main` — solo conceptos, 0 código)
1. **Escenas / Hotcues de Performance (`1..8`) + Mutes Cuantizados:** guardar 8 instantáneas de Mutes/Solos + variación de patrón por parte + transposición/envíos y lanzarlas cuantizadas al compás sin detener el reloj.
2. **Megamix en vivo por parte:** cambiar el patrón MIDI de una sola parte sobre la marcha (cuantizado al compás) mezclando patrones de distintas escenas/bancos.
3. **Parameter Locks (P-Locks) por paso:** bloquear Cutoff, Decay, Pitch, Pan o Send FX únicamente durante un paso/nota del secuenciador.
4. **Acento Acid/Groovebox por velocidad (`vel >= 110`):** abrir extra de Cutoff + Resonancia + pegada en notas acentuadas.
5. **TR-REC + Grabación en tiempo real + "Imprimir" Arpegio/Acorde:** edición paso a paso en Drum Grid, grabación cuantizada en tiempo real y volcado directo de Arpegiador/Acordes al Piano Roll.
6. **Pre-escucha / Audition en Bank Manager + Pre/Post-Fader en `Send A..D`.**

### B) Inspiración de Akai MPC (Clásicas MPC60/2000XL/3000 y Modernas MPC Live/One/X)
1. **16 Levels (imprescindible en Drum Maps):** con un botón, desplegar **un solo pad** (ej. bajo 808, caja o hi-hat) a lo largo de los 16 pads/teclas graduado por **Tune (cromático)**, **Velocity**, **Filter Cutoff**, **Decay** o **Attack**.
2. **Note Repeat / Roll cuantizado:** mantener pulsado un pad o tecla para repetir golpes sincronizados al reloj (`1/4`, `1/8`, `1/16`, `1/16T`, `1/32`) respetando la velocidad/aftertouch en vivo (vive como utilidad MIDI de inserción).
3. **MPC Swing por Parte (`50 %..75 %`) + Humanize:** swing independiente por pista (ej. `58 %` en hi-hat y `54 %` en bajo) + micro-variación aleatoria opcional en ticks PPQ y velocidad.
4. **Pad Perform (Escalas y Acordes diatónicos en pads):** en partes cromáticas, usar los 16 pads sincronizados con nuestra **Transposición Global / Escala** de `ABDShared` para disparar notas en escala o acordes diatónicos (I..vii°) con un solo toque.
5. **Capas por Pad (Velocity Zones / Round-Robin) + Recorte no destructivo (`Start` / `End` / `Reverse`):** hasta 2–4 capas por pad para evitar efecto "metralleta" en baterías acústicas/electrónicas, más recorte de inicio/fin e inversión en RAM sin tocar el archivo original (y a futuro *Sample Chop / Slice* a 16 pads desde `ABDNeuModMakr`).
6. **Track Mute / Pad Mute en directo + Q-Links contextuales:** mutes instantáneos o cuantizados al compás por parte o por pad individual del kit, más 4–8 macros contextuales ("Q-Links") que se adaptan al drawer/parte activa y se mapean automáticamente con el perfil de MIDI Learn.

---

## 6. Arquitectura de Paneles Deslizantes Inferiores (Bottom Drawers) y Ergonomía Tablet 10"

### A) Paneles Deslizantes Inferiores (Bottom Drawers)
Para mantener la ergonomía sin saturar la pantalla en resoluciones de referencia **1280 x 720** (y pantallas táctiles de 10 pulgadas), se eliminan los racks fijos inferiores de la consola y se introducen **paneles deslizantes inferiores independientes**:

1. **Ubicación y Despliegue:**
   - Emergen desde arriba del teclado virtual (`bottom: 104px`) hacia arriba.
   - Ocupan la totalidad del área que corresponde a las 16 tiras de canal (mesa de mezclas), dejando siempre a la vista:
     - La barra superior (transporte, master, LCD, globales).
     - La tira de 16 botones hardware (`StepButtonStrip`).
     - El dock inferior del teclado virtual.
   - Transición CSS fluida por hardware (`transform: translateY(...)`).
   - **Regla de Cierre:** El panel solo se cierra desde su propio botón de cierre `[ ✕ ]` o volviendo a pulsar el botón toggle del canal que lo invocó.

2. **Utilidad 1: Cajón Deslizante "Tono & FX":**
   - Ofrece edición profunda de síntesis (Osciladores, Parciales, Filtros 1 y 2 en serie, Envolventes, ModMatrix y Envíos FX).
   - **Sincronización Maestra con los 16 Botones Superiores:** Al permanecer siempre visible la tira de 16 botones físicos superiores, **se eliminan las pestañas redundantes dentro del propio panel**. La parte activa mostrada en Tono & FX se sincroniza en tiempo real con el botón seleccionado en la tira superior cuando está en modo `PART SEL`. Asimismo, si la tira está en `PART MUTE`, refleja el estado de mute de la parte.
   - **Auditoría y Separación de Parámetros (Locales vs Globales):**
     - *Parámetros Locales por Canal:* Afinación (Coarse/Fine), Glide, Filtros (Cutoff, Reso, Modelos), Saturación/Drive, Envolventes, EQ paramétrico de canal, Nivel, Pan, y **Envíos Auxiliares con selector Pre-Fader / Post-Fader (`Send A..D`)**.
     - *Parámetros Globales (Master Bus):* Conversor D/A (`dacCharacter`: HD, 16-bit, 12-bit) y Algoritmos/Tiempos de Efectos Master (`reverbMacro`, `reverbTime`, `chorusMacro`, `chorusRate`). Se revisarán minuciosamente para separar la edición propia del canal de los controles del bus Master FX.

3. **Utilidad 2: Matriz de Pads Universal (`MpcPadMatrix` en `ABDShared`):**
   - Componente táctil 4x4 (16 pads) desarrollado de forma **completamente aséptica en `ABDShared`**:
     - **Modo Ritmo (Drum Map):** Cada pad muestra el nombre del sample/sonido de batería, nota MIDI base, categoría de color y grupo de choke/silencio exclusivo.
     - **Modo Cromático (Note Performer):** Muestra nota musical y octava (`C2`, `D#2`), selector de escalas (Mayor, Menor, Pentatónica, Blues, Dórica, etc.), iluminación de tónica e In-Key mode.
     - **16-Levels (Akai MPC Classic):** Con un botón, distribuye un solo pad en los 16 pads graduados por velocidad o afinación por semitonos.
   - **Sincronización:** También se sincroniza con la tira de 16 botones superiores para cambiar de parte/kit activo al vuelo sin cerrar la utilidad.

4. **Utilidad 3 (Futuro): Secuenciador Pianola / Piano-Roll (`ABDShared`):**
   - Reutilizará el mismo sistema de cajón deslizante inferior para edición gráfica PPQ de notas y eventos sin cambiar de pantalla.

### B) Mesa de Mezclas de 16 Canales de Altura Completa (Full-Height Strips)
Al liberar el espacio inferior, cada uno de los 16 canales verticales se estira ocupando toda la altura central (~480px):
- **Header:** Parte (`P01`..`P16`), LED de actividad de voz/audio, selector de modo (`DRM` / `CHR`).
- **Selector de Sonido:** Botón con nombre del instrumento y categoría (abre Bank Drawer al hacer clic).
- **Lanzaderas de Cajón:** Botones dedicados `[ TONE ]` y `[ PADS ]` para invocar el panel correspondiente contextualizado a esa pista.
- **Ruteo y Expresión:** Canal MIDI (`CH1..16`), `TR` (seguir transposición global), potenciómetro de **Glide / Portamento** (`GLD` 0..500 ms con valor numérico, atenuado para batería).
- **Envíos Auxiliares:** Mini-knobs `Send A` (Reverb) y `Send B` (Delay/Chorus) con opción Pre/Post.
- **Panorámica:** Knob `PAN` (L64 .. C .. R63) con centro calibrado.
- **Mute & Solo:** Botones iluminados `[ M ]` (rojo) y `[ S ]` (amarillo).
- **Fader de Volumen:** Fader deslizante de recorrido largo (120–140px) con escala calibrada en dB (+6 a -∞) y **Vúmetro estéreo/mono contiguo**.

### C) Ergonomía en Pantallas Táctiles de 10 Pulgadas (1280 x 720 / 1280 x 800)
- **Zonas Táctiles Seguras (Hit Targets):** Todos los botones y controles interactivos en tablet deben tener un tamaño táctil mínimo de 44x44px o pads con espaciado adecuado.
- **Controles de Lectura vs Edición Fina:** En la vista general de la mesa de mezclas, los parámetros más finos (curvas de envolvente, ruteos complejos de modulación) actúan como indicadores rápidos de estado; la edición precisa y cómoda se realiza abriendo el cajón deslizante inferior correspondiente (`[ TONE ]` o `[ PADS ]`).
- **Teclado Virtual con Botón de Colapso:** Al teclado virtual inferior dockeado se le añade un botón de **colapsar / descolapsar**. Al colapsarlo, se gana el 100 % del alto vertical del espacio de trabajo, ideal para operar en pantallas de 10" o cuando el músico utiliza un teclado controlador MIDI físico externo.

### D) Utilidad de Acordes (Chord Mode / Chord Performer — Anotado para Investigación)
- Se proyecta una utilidad complementaria (en pads o teclado) para disparo instantáneo de acordes:
  - *Chord Memory*: Memorizar acordes personalizados tocados en el teclado.
  - *Diatonic Chord Mode*: Generación de acordes a 1 toque dentro de la escala activa (I, ii, iii, IV, V, vi, vii°).
  - *Strum & Spread*: Retardo de rasgueo configurable (ms) y apertura de notas en octavas.
  - Se investigarán referencias destacadas de mercado (MPC Chord Mode, Novation Launchpad Chord Mode, Reason Scales & Chords) para definir su diseño en una fase posterior.

---

## 7. Pipeline de Señal Completo (Audio + MIDI Out)

```text
[Disparadores: Teclado Virtual / Pads MPC / Piano-Roll PPQ / Tira 16 Pasos / MIDI In DAW]
                                    │
                                    ▼
[Transposición Global ABDShared (Tono ±24 + Escala/Tonalidad)] ──► (solo Cromáticas activas)
                                    │
                                    ▼
[Utilidades MIDI de Inserción por Parte] (Piano-Roll Seq / GrooveArpeggiator / Note Repeat / Chord Gen)
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
       [Ruta INTERNAL o BOTH]             [Ruta EXTERNAL o BOTH]
                    │                               │
                    ▼                               ▼
    [Motor de Voz Interno Rompler]       [McxHardwareBridge & HardwareMirrorRouter]
    (Partials, PCM, Wavetables)          (Traducción Semántica vía Contratos JSON)
                    │                               │
    [Doble Filtro + Envolventes]                    ├─► CCs / NRPNs Roland ordenados
                    │                               ├─► SysEx DT1 con checksum
    [Canal Mesa: EQ + Drive + Pan + Fader]          └─► Salida MIDI Out (DAW o Cable)
                    │
    ├──► Bus DRY ───────────────────────────────────┐
    ├──► Send A (nivel + Pre/Post-Fader) ──┐        │
    ├──► Send B (nivel + Pre/Post-Fader) ──┼──► [Rack FX Master] ──┼──► [Master Volume] ──► Out L/R
    ├──► Send C (nivel + Pre/Post-Fader) ──┤    (ABDShared,         │
    └──► Send D (nivel + Pre/Post-Fader) ──┘     4 buses estéreo)   ┘
```

---

## 8. Transporte, Modo Canción y Piezas Transversales Recomendadas

### A) Transporte y Modo Canción (`Song Mode`)
- **Transporte completo:** `Play`, `Pause`, `Stop`, `Record` (overdub/replace), `Rew` / `FF` (salto por compás), `Return to Zero`, `Loop` (patrón o rango de canción), `Metrónomo` (volumen propio + `Count-in` de 1 o 2 compases) y `Tap Tempo`.
- **Sincronización Dual:** en VST3 sigue el transporte y PPQ del DAW (`Host Sync`) con opción de desacoplar a reloj interno (`Internal`) para bocetar libremente con el DAW detenido; en Standalone y Web/WASM corre con el reloj maestro interno.
- **Modo Canción (estilo MPC / MC-303):** secuencia ordenada de bloques `{ Scene/PatternId, Bars/Reps, MuteMask16, TransposeOffset, TempoOverride? }`, permitiendo construir un tema completo (Intro → Estrofa → Puente → Drop → Outro) reutilizando patrones sin duplicarlos.

### B) Otras Piezas Clave a Contemplar desde el Diseño Base
1. **Master Safety Limiter / Soft-Clipper + Headroom de 16 Partes:** etapa protectora transparente tras el Master Volume para evitar clipping digital cuando suman 16 partes + 4 buses FX, acompañada de indicador Peak/Clip.
2. **Undo / Redo (`Ctrl+Z` / `Ctrl+Y`) + Compare (`A/B`):** imprescindible en un entorno de edición con 16 canales, Piano Roll, P-Locks y Rack FX.
3. **Exportación MIDI (`.mid` multipista) y Audio (`.wav` Master o Stems por parte) + Drag-to-DAW:** aprovechar el render offline C++20 más rápido que tiempo real para exportar un patrón o la canción entera a Cubase/DAW (o arrastrar directamente el clip MIDI de una parte).
4. **Salidas Múltiples opcionales en VST3 (Multi-Out):** diseñar `McxEngine` para soportar en el futuro salidas estéreo auxiliares (ej. `Main 1-2` + hasta 7 buses estéreo extra) para procesar partes por separado en el mezclador del DAW.
5. **Favoritos, Búsqueda y Etiquetas en el Bank Manager:** filtrado instantáneo por categoría (`cat-0..cat-9`), motor (`Rompler`, `Drum`, `DWGS`, `VA`...), tipo (`Model`, `PartPreset`, `MultiPreset`, `Song`) y favoritos.
6. **Guardado Dual de Proyecto (Referencial Ligero vs Bundle Portable `.abdbank`):** chunk DAW ligero por defecto (referencias al `<WorkingDir>`) + exportación monolítica con *tree-shaking* de solo los modelos usados.

---

## 9. Inventario de Piezas Existentes vs Nuevas en `ABDShared`

- **Ya existen en `ABDShared` (listos para reusar):**
  - `StepButtonStrip.js` + `step-button-strip.css` (tira hardware de 16 pasos con 5 modos y sincronización con drawers).
  - `MpcPadMatrix.js` + `mpc-pad-matrix.css` (matriz 4x4 universal ritmo/cromático/16-levels).
  - `DspEffects/DspMultiBusFxRack.h` (Rack FX Master multi-bus con 4 entradas `Send A..D` + `Dry`, 4 topologías e inyección cruzada).
  - `DspEffects/MasterSafetyLimiter.h` (limitador brickwall transparente a 0 dBFS con soft-knee).
  - `MIDI Learn` completo (`MidiLearnManager.h`, `midiLearnStore.js`, `midiLearnDrawer.js`, `midiLearnContextMenu.js`, `midi-learn.css`).
  - `ModMatrix.h` (base de `ABDEep`), `GrooveArpeggiator.h`, `LFO.h` / `LfoAnalog.h`, `DiagnosticProbe`.
  - `DspMidasEQ.h`, `CascadeShelfEq.h`, `DspSaturation.h`, `DspZitaReverb`, `DspStereoDelay`, `DspStereoChorus`, `DspFlanger`.
  - `Bank` UI (`bankCategories.js`, `bankShell.js`, `bankCard.js`, `bankChips.js`), `SynthNavBar`, `AboutDialog`, `@abdsynths/midi-keyb`, `Scope`.
- **Nuevas piezas transversales a crear en `ABDShared` (en orden lógico):**
  1. `SynthCore/MusicalScaleTransposer.h` + integración de Escala/Transposición en `@abdsynths/midi-keyb`.
  2. Promoción de `DWGSTables` + `DWGSOscillator` (desde `ABDMS2000`) a `ABDShared::DspCore`.
  3. Módulo **Piano-Roll / Pattern Sequencer** basado en ticks PPQ (C++20 RT-safe + modal WebUI reutilizable en cajón inferior).
  4. Utilidad de Acordes (**Chord Performer / Chord Memory** modular en `ABDShared`).
  5. Perfiles JSON completos de dispositivo para `MidiLearn` + enlace con `HardwareMidiDetect` (fase final).

---

## 10. Orden Recomendado de Ejecución (Estado y Siguientes Pasos)
1. **Cimiento de Datos y Directorio de Trabajo:**
   - [x] Modelo base de tipos (`McxTypes.h`, `McxPartKind`, `DrumMapProfiles`).
   - [ ] Estructura `<WorkingDir>` unificada compatible con `AxionikDB` (`Models/`, `Presets/`, `Banks/`, `MidiLearn/`).
2. **Canal de Parte + Motor Modular + `ABDShared` Core:**
   - [x] Consola 16 canales alargada (Full-Height) con faders largos, vúmetros, sends A/B, PAN, GLD y lanzaderas `[ TONE ]` / `[ PADS ]` (calibrada para 1280x720).
   - [x] Sistema de cajones inferiores deslizantes (`Tono & FX` y `MpcPadMatrix`) sincronizados con la tira superior de 16 botones (`PART SEL` / `PART MUTE`).
   - [x] Botón de colapso en el dock del teclado virtual para ergonomía en tablets táctiles de 10".
   - [x] Doble Filtro en serie concatenado (`Filter 1 → Filter 2`) con bypass 0% CPU (`McxChannelStrip.h`).
   - [x] EQ paramétrico + Drive por parte (con bypass en reposo).
   - [x] Envíos independientes a 4 buses (`Send A..D`) con selector Pre/Post-Fader por canal (`McxChannelStrip.h`).
   - [x] Acento Roland dinámico por velocidad (`velocity > 100`).
   - [x] Modal UI de LFOs Globales (`GlobalLfoModal`) en `ABDShared` conectada a Navbar y Master Panel.
   - [ ] `MusicalScaleTransposer` en `ABDShared` (C++20 RT-safe `O(1)` + transposición en vivo).
   - [ ] Promoción de `DwgsWavetable` (`ABDMS2000` → `ABDShared::DspCore`) como tipo de motor propio en `McxVoice`.
3. **Rack FX Master Multi-Entrada en `ABDShared`:**
   - [x] `DspMultiBusFxRack.h` (4 buses estéreo `Send A..D` + `Dry`, 4 topologías: serie, paralelo, cascada con inyección, híbrido) en `ABDShared`.
   - [x] `MasterSafetyLimiter.h` (brickwall soft-knee a 0 dBFS integrado en el rack).
   - [x] Integración en `McxOutputAndFx.h/.cpp` (preservando macros Roland GS MC-303 y DAC vintage).
   - [x] Test Unitario Slice 5 en `Tests/McxPhase4Tests.cpp` validando topologías y estabilidad numérica.
   - [x] UI del Rack FX Master (`MultiBusFxRackModal`) en `ABDShared` integrada en la WebUI.
4. **Secuenciador Piano-Roll Modal + Transporte y Utilidades MIDI:**
   - [x] Motor de Transporte (`CompactTransportBar` en `ABDShared`) con Play, Stop, Rec, Loop, BPM y Metrónomo Triple-Modo (`OFF` / `BOTH` / `REC`) con audio sintético WebAudio (`metronomeClicker.js`).
   - [x] Secuenciador en ticks PPQ (`PianoRollModal` en `ABDShared`) con vistas Cromática y Drum Grid, duraciones libres (1, 2, 4, 8... compases), carril de velocidad con acento `> 100` y grabación de automatización.
   - [x] Motor universal de Groove & Shuffle (`GrooveShuffleEngine.h` + `GrooveShuffleModal.js` en `ABDShared`) con Master Groove y anulación por parte multi-algoritmo (MPC, TR-909, SP-1200, Triplet, Dilla).
   - [ ] Integración en tiempo real del `GrooveArpeggiator` de `ABDShared` por parte.
   - [ ] Utilidad de Acordes (`Chord Performer` / `Chord Memory`).
   - [ ] Modo Canción estructurado (`Song Mode` con escenas encadenadas).
5. **Persistencia, Presets y Bancos:**
   - [ ] Serialización APVTS y códec de proyectos / bancos portables `.abdbank` (con tree-shaking).
6. **Performance Avanzada y Hardware:**
   - [ ] Megamix en vivo por parte.
   - [ ] Escenas / Hotcues `1..8` con mutes cuantizados al compás.
   - [ ] Perfiles JSON completos de MIDI Learn con `HardwareMidiDetect`.
