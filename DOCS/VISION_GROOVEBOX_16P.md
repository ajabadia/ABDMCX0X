# Visión de Producto y Arquitectura — ABDMCX0X (Groovebox Modular de 16 Partes)

> **Estado:** Documento vivo de visión y diseño arquitectónico (v3 — decisiones consolidadas, sin desarrollo de código aún).  
> **Última actualización:** 2026-11-17

---

## 1. Decisiones Cerradas de Arquitectura y Producto

| Área | Decisión Cerrada | Reutilización / Promoción en `ABDShared` |
| :--- | :--- | :--- |
| **Motor único libre** | Se eliminan los modos limitadores (`SuperFree`, `MC-303`, `DR-5`); todo opera como motor libre. Se conservan las estéticas como **Temas Visuales** (`ms2000`, `neuron`, `mc303`, `dr5` en Claro/Oscuro). | Temas ya en `ABDShared/Assets/styles/themes/`. |
| **16 Partes libres** | Cualquier parte (`1..16`) puede ser **`Chromatic`** o **`DrumMap`** (sin límite de cuántas de cada tipo). Por defecto: Parte 10 = `DrumMap`, resto = `Chromatic`. | Contrato `McxPartKind` + `DrumMapProfiles` ya en `ABDShared/Contracts/`. |
| **Wavetables (`ABDMS2000` OSC 1)** | Las 512 tablas DWGS/AKWF/Usuario serán un **tipo de motor propio (`DwgsWavetable`)**, no convertidas a PCM estático, visibles y clasificadas en el Bank Manager. | Promover `DWGSTables` + `DWGSOscillator` (limpio, ~4 MB RAM) a `ABDShared::DspCore`. |
| **Directorio de Trabajo** | Directorio raíz configurable compatible con `AxionikDB` (`Models/`, `Presets/Parts/`, `Presets/Multis/`, `Presets/Patterns/`, `Banks/`, `MidiLearn/`). | Compatible con `ABDAxionikVS` y `ABDNeuModMakr` + `bankCategories.js` (`cat-0..cat-9` e imágenes). |
| **Canal de Parte (Mesa)** | EQ paramétrico ligero + Drive suave por parte, Volumen general de parte, Pan, Mute/Solo, y **4 envíos independientes (`Send A..D`) con volumen propio y selector Pre/Post-Fader**. | Reutilizar primitivas ya existentes en `ABDShared::DspEffects`: `DspMidasEQ.h` / `CascadeShelfEq.h` + `DspSaturation.h` (con bypass 0 % CPU en reposo). |
| **Rack FX Master** | Al final de la cadena (antes de Master Volume), inspirado en `ABDEep` pero generalizado y flexible: **múltiples entradas (4 buses estéreo `Send A..D` + `Dry`)** y topologías encadenables (serie, paralelo, cascada con inyección, mixto; retrocompatible 1-bus con `ABDEep`). | Promover `DspMultiBusFxRack` y su UI modular a `ABDShared` (con futura modal de edición clásica por efecto, p. ej. RE-201). |
| **LFOs Globales + Locales + ModMatrix** | **4 LFOs Globales** (sincronizables a BPM) + **2 LFOs Locales por Parte** (con *key-sync* y Delay/Fade-In). **Mute + auto-skip a 0 % CPU** si un LFO está muteado o no tiene rutas activas. Envolvente sobre LFOs globales gestionada por parte vía **Via-Attenuator (`Source × Via`)** en la ModMatrix (p. ej. `GLFO1 × ModEnv` o `ModWheel`) + `ModEnv` local por parte. Evaluado a control-rate (16–32 muestras) para `< 1 %` CPU. | Reutilizar `ABDShared/Code/SynthCore/ModMatrix.h` (misma base que `ABDEep`) + `LFO.h` / `LfoAnalog.h` + CDD v2.0 `ModSlotViaSource`. |
| **Doble Filtro en Serie (`Filter 1 → Filter 2`)** | Hasta **2 filtros concatenados en serie por parte**, con bypass individual (0 % CPU apagado). Selección en dos niveles: primero **tipo** (`LPF`, `HPF`, `BPF`, `Notch`, `Comb`, `Z-Plane`) y después **modelo DSP concreto** disponible para ese tipo (SVF, Roland TC6116AF, Juno IR3109/HPF, Moog Ladder, MS-20, etc.). | `McxFilterBank` + filtros de `ABDShared::DspCore` (`DspFilterFamily.h`). |
| **Edición en Pantallas Deslizantes (Drawers)** | Patrón general de ergonomía UI (como `ABDEep`, `ABDMS2000` y `ABDAxionikVS`): controles compactos en la vista principal y **drawers deslizantes** dedicados para edición profunda (Filter 1/2, Envolventes, ModMatrix, EQ/Drive, Pad Editor) evitando saturar la pantalla. | Reutilizar patrón `DrawerManager` / `slideDrawer` de `ABDAxionikVS` / `ABDMS2000` en `ABDShared`. |
| **Drum Maps (Paridad MC-303+ por sonido)** | Edición completa **por cada sonido/pad** del Drum Kit (mínimo paridad MC-303 ampliada): `Attack`, `Decay/Release`, `Pitch` (Coarse/Fine), `Volume`, `Pan`, `Filter Cutoff/Reso`, `Choke/Mute Group (0..15)`, `One-Shot/Gated`, `Start/End/Reverse`, `Accent` y envíos independientes a los **4 buses FX (`Send A..D`)**. | Extender `McxDrumSlotConfig` y contrato `drum_map_profile.schema.json`. |
| **Transposición Global** | Soporta **transposición cromática por tono (`-24..+24`) y por Escala / Tonalidad** (afecta solo a partes cromáticas habilitadas, nunca a Drum Maps). | **Crear en `ABDShared`:** `SynthCore/MusicalScaleTransposer.h` (C++20 RT-safe `O(1)`) + **integración directa en `@abdsynths/midi-keyb`** (resaltado de notas en escala y transposición en vivo). |
| **MIDI Learn + Hardware Externo** | Relegado a fase final y limitado a **controlador de entrada**: al detectar un equipo físico, se carga un **perfil completo de MIDI Learn** (`MidiLearn/<device>.json`) en lugar de espejo bidireccional complejo. | **Ya existe completo en `ABDShared`:** `Code/HardwareDrivers/MidiLearnManager.h`, `Components/MidiLearn/` (`midiLearnStore.js`, `midiLearnDrawer.js`, `midiLearnContextMenu.js`), `midi-learn.css` y `HardwareMidiDetect`. Solo falta añadir perfiles JSON completos por dispositivo. |
| **Secuenciador Piano-Roll (Modal)** | Superar el secuenciador simple de `ABDEep`: **modal dedicada tipo rollo de pianola (estilo Cubase)** para editar notas a mano, duraciones flexibles compatibles con compases (`1, 2, 4, 8...` compases; preparado internamente por ticks PPQ para soportar en el futuro métricas `4/4`, `3/4`, `6/8`, etc.). | Candidato a nuevo módulo reutilizable de **`ABDShared`** (motor de patrón en ticks PPQ + componente modal Piano Roll / Drum Grid). |
| **Transporte + Modo Canción (`Song Mode`)** | **Transporte completo** (`Play`, `Pause`, `Stop`, `Record`, `Rew`/`FF` por compás, `Return to Zero`, `Loop`, `Metrónomo` + `Count-in 1/2 compases` + `Tap Tempo`), con modo `Host Sync` (VST3) e `Internal` (Standalone/WASM). **Modo Canción** por cadena de escenas/patrones (`Scene + Repeticiones + Mute Mask + Transposición por bloque`) para estructurar temas completos. | Motor de reloj/transporte RT-safe en `ABDShared::SynthCore` reutilizable por cualquier groovebox/secuenciador de la suite. |
| **Groove & Performance (Fases posteriores)** | **Parameter Locks (P-Locks)** por paso, **Acento Acid/Groovebox por velocidad**, **Grabación en tiempo real** (libre o cuantizada), **Megamix** en vivo por parte y **Escenas / Hotcues** (`1..8`). | Arquitectura preparada desde el inicio en el modelo de eventos del patrón; implementación escalonada tras el core base. |

---

## 2. Jerarquía de 3 Niveles de Configuración y Datos

1. **Nivel 1 — Configuración Global del Sinte (Sistema / Local, no viaja en presets):**
   - Directorio de trabajo (`WorkingDirectory`), sample rate, polifonía máxima global, afinación maestra (`A4 = 440 Hz` ± cents), BPM en Standalone, configuración de audio/MIDI, perfil de MIDI Learn activo, tema visual e idioma.
2. **Nivel 2 — Preset General (`MultiPreset` / Performance de 16 Partes):**
   - Las 16 partes (su `PartKind`, canal MIDI, estado y referencia/embed de `PartPreset`), Rack FX Master (slots + topología de los 4 buses), LFOs Globales, Transposición Global (tono + escala/tonalidad) y (futuro) Escenas/Hotcues `1..8`.
3. **Nivel 3 — Canal de Parte (`PartPreset`):**
   - **Común a toda parte:** `PartKind` (`Chromatic` / `DrumMap`), Canal MIDI receptor (1:1 por defecto, editable para *layers*/*splits*), Modelo + Tipo de motor, EQ Paramétrico ligero + Drive, Pan, Volumen, Mute/Solo, 4 envíos (`Send A..D`, cada uno con nivel y Pre/Post-Fader), Utilidades MIDI de inserción (Seq/Arp/Chord).
   - **Específico `Chromatic`:** Filtro(s), Envolventes, Matriz de Modulación, Accent Acid, bandera *"Seguir Transposición Global"*.
   - **Específico `DrumMap`:** Nivel Kit/Parte (macros de filtro/decay, ModMatrix de kit, volumen/envíos maestros) + Nivel Pad/Tecla (muestra/modelo, nivel, pan, pitch, *choke group*, offsets de filtro/decay, envíos FX propios).

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

- Taxonomía compartida: `ABDShared/Components/bank/bankCategories.js` (`cat-0..cat-9`, ES/EN, incluyendo `cat-9: Rhythm / Drums`) e imágenes de instrumento de `ABDNeuModMakr`.

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

## 6. Pipeline de Señal Completo (Audio + MIDI)

```text
[MIDI In (DAW / @abdsynths/midi-keyb / Perfil MIDI Learn HW)]
          │
          ▼
[Transposición Global ABDShared (Tono ±24 + Escala/Tonalidad)] ──► (solo Cromáticas activas)
          │
          ▼
[Utilidades MIDI de Inserción por Parte] (Piano-Roll Seq / GrooveArpeggiator / Note Repeat / Chord Gen)
          │
          ▼
[Motor de Voz de la Parte] (Rompler Cromático | Drum Map [16 Levels / Layers] | DWGS Wavetable | futuro: VA, FM, Spectral)
          │   ◄── [4 LFOs Globales (mute/0% idle)] + [2 LFOs Locales] + [CCs por Canal] + [ModMatrix c/ Via]
          ▼
[Doble Filtro en Serie: Filter 1 (Bypass/LPF/HPF/BPF/Notch/Comb) → Filter 2 (idem)] + [Envolventes + Accent]
          │
          ▼
[Canal de Mesa: EQ Paramétrico Ligero (DspMidasEQ/Shelf) + Drive (DspSaturation) → Pan → Vol → Mute/Solo]
          │
          ├──► Bus DRY ──────────────────────────────────────────────────┐
          ├──► Send A (nivel + Pre/Post-Fader) ──┐                       │
          ├──► Send B (nivel + Pre/Post-Fader) ──┼──► [Rack FX Master] ──┼──► [Master Volume] ──► Out L/R
          ├──► Send C (nivel + Pre/Post-Fader) ──┤    (ABDShared,        │
          └──► Send D (nivel + Pre/Post-Fader) ──┘     4+ buses / slots) ┘
```

---

## 7. Transporte, Modo Canción y Piezas Transversales Recomendadas

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

## 8. Inventario de Piezas Existentes vs Nuevas en `ABDShared`

- **Ya existen en `ABDShared` (listos para reusar):**
  - `MIDI Learn` completo (`MidiLearnManager.h`, `midiLearnStore.js`, `midiLearnDrawer.js`, `midiLearnContextMenu.js`, `midi-learn.css`).
  - `ModMatrix.h` (base de `ABDEep`), `GrooveArpeggiator.h`, `LFO.h` / `LfoAnalog.h`, `DiagnosticProbe`.
  - `DspMidasEQ.h`, `CascadeShelfEq.h`, `DspSaturation.h`, `DspZitaReverb`, `DspStereoDelay`, `DspStereoChorus`, `DspFlanger`.
  - `Bank` UI (`bankCategories.js`, `bankShell.js`, `bankCard.js`, `bankChips.js`), `SynthNavBar`, `AboutDialog`, `@abdsynths/midi-keyb`, `Scope`.
- **Nuevas piezas transversales a crear en `ABDShared` (en orden lógico cuando empecemos):**
  1. `SynthCore/MusicalScaleTransposer.h` + integración de Escala/Transposición en `@abdsynths/midi-keyb`.
  2. Promoción de `DWGSTables` + `DWGSOscillator` (desde `ABDMS2000`) a `ABDShared::DspCore`.
  3. `DspEffects/DspMultiBusFxRack.h` (generalización multi-entrada de `ABDEep/FXEngine` con 4 buses + topologías).
  4. Módulo **Piano-Roll / Pattern Sequencer** basado en ticks PPQ (C++20 RT-safe + modal WebUI reutilizable).
  5. Perfiles JSON completos de dispositivo para `MidiLearn` + enlace con `HardwareMidiDetect` (fase final).

---

## 9. Orden Recomendado de Ejecución (Cuando Cerramos la Visión)
1. **Cimiento de Datos y Directorio de Trabajo:** definir el modelo de 3 niveles (`SystemSettings` / `MultiPreset` / `PartPreset` + `PartKind::Chromatic | DrumMap`) y la estructura de `<WorkingDir>` compatible con `AxionikDB`.
2. **Canal de Parte + Motor Modular + `ABDShared` Core:**
   - EQ paramétrico + Drive + 4 envíos Pre/Post-Fader por parte.
   - `MusicalScaleTransposer` en `ABDShared` (+ función en `@abdsynths/midi-keyb`).
   - Promoción de `DwgsWavetable` (`ABDMS2000` → `ABDShared::DspCore`).
   - LFOs Globales + ModMatrix por parte (control-rate) + Accent por velocidad.
3. **Rack FX Master Multi-Entrada en `ABDShared` (`4 buses`, topologías flexibles).**
4. **Secuenciador Piano-Roll Modal (PPQ, `1/2/4/8...` compases, grabación en tiempo real + cuantizado, P-Locks) + Utilidades MIDI (`GrooveArpeggiator`, Chord Gen).**
5. **Performance Avanzada y Hardware:** Megamix en vivo por parte, Escenas/Hotcues `1..8`, y perfiles automáticos de MIDI Learn con `HardwareMidiDetect`.
