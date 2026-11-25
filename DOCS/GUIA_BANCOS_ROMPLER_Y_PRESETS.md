# GUÍA DE ARQUITECTURA: BANCOS DE PISTAS, BANCOS PCM, INSTRUMENTOS Y PRESETS

> **Propósito:** Clarificar la jerarquía semántica en ABDMCX0X para eliminar confusiones entre la herencia del hardware clásico de los años 90 (MC-303 / Sound Canvas) y el flujo de trabajo moderno (DAWs, MPC, motores intercambiables por pista).

---

## 1. El Choque de Modelos: Hardware Clásico vs. Groovebox Moderna

### A. Modelo Heredado (Roland MC-303 / SC-55 / JV-1080)
* En las grooveboxes originales, existía una **ROM global física compartida** (con muestras PCM de pianos, bajos, baterías, etc.).
* Las 16 pistas eran canales pasivos que simplemente "sintonizaban" un sonido de esa ROM común.

### B. Modelo Real Multimotor de ABDMCX0X (Flujo DAW / MPC / Sampler)
* ABDMCX0X es un chasis **multimotor polimórfico**: cada pista aloja un `ISoundEngine` independiente:
  * **Structured Rompler** (`structured_rompler`): motor PCM+VA de 4 parciales estéreo o Drum Kit multi-pad.
  * **MCS-48 Micro-Synth** (`mcs48_synth`): emulación híbrida microcontrolador/chiptune.
  * **E-mu Emax II Player** (`emax_synth`, ranura `7`): reproductor clean-room con menús del OS y PCM desde `.abdbank`.
* **AbyssMind** (`abyssmind_synth`, ranura `8`) y futuros motores (`Juno`, `MS2000`, `CZ-101`).
* **External MIDI** (`external_midi`): control de hardware externo por puerto y canal.
* **Los Bancos de Sonido PCM (`.abdbank`) pertenecen a los motores con `supportsBankArchives: true` (`structured_rompler`, `jv880_synth` y `emax_synth`),** integrados como pestaña `Explorar` / browser dentro del propio panel del motor, nunca como modal global de la groovebox. En `emax_synth` el ingreso de discos Emax II se realiza antes con `emax2_disk` en `ABDNeuModMakr` ([`EMAX2_INTAKE.md`](../../ABDNeuModMakr/DOCS/EMAX2_INTAKE.md)).

---

## 2. Jerarquía Conceptual Clara (3 Niveles + Navegación Común)

| Nivel / Concepto | Qué representa | Dónde vive | Formato / API |
| :--- | :--- | :--- | :--- |
| **Motor de Pista (`ISoundEngine`)** | Generador DSP de la pista o ruta External MIDI. | Modal de Ruta (`McxInstrumentRouteModal`). | `McxEngineDescriptorDto` |
| **Banco de Sonido PCM (`.abdbank`)** | Contenedor ZIP (`ZIP_STORED`) con `manifest.json`, `tones[]`, `drumKits[]` y `wavePool[]`. | Barra lateral de fuentes del **Browser embebido** en cada motor con banca (`EnginePresetBrowser`). | `.abdbank` (`indexAndStoreBankBuffer`) |
| **Onda Individual (`wavePool[]`)** | Muestra PCM concreta reasignable en vivo dentro de un parcial o pad. | Selector `[ Banco PCM ▸ Muestra ]` en **Parciales** o **Pads del Kit**. | `RomplerWavePicker` / `assignWaveToTarget` |
| **Instrumento / Preset Factory** | Timbre completo cromático o kit de batería de fábrica o banco `.abdbank`. | Tab `Explorar` / selector unificado `EngineHeaderBar`. | `tones[]` / `drumKits[]` / Factory |
| **Preset de Usuario y Favoritos** | Estado completo del motor guardado por el usuario con categoría Hartmann `0..9`. | Barra común **`EngineHeaderBar`** (disponible en **todos** los motores). | `userPresetsStore` / `savePreset` |
| **Proyecto Completo** | Estado total de las 64 pistas, escenas, rack FX, patrón y ruteos. | Menú `File` / diálogo de proyecto. | `.mcxprj` |

---

## 3. Taxonomía Canónica: Hartmann Neuron `0..9` + `playMode` Ortogonal

Todo sonido, instrumento o preset de cualquier motor usa dos ejes independientes:

1. **`categoryId` (`0..9` — Parameter Sets canónicos de Hartmann Neuron):**
   Se mantiene idéntica numeración heredada de Hartmann Neuron, con soporte multi-literal (`flavor: 'musical' | 'neuron' | 'short'` en `ABDShared/Components/bank/bankCategories.js`):
   * `0`: `Default Set` (`Synth & Leads`)
   * `1`: `Stringed / Bowed` (`Strings & Ensemble`)
   * `2`: `Plucked & Bells` (`Bells & Mallets`)
   * `3`: `Plucked & Picked` (`Bass & Plucked`)
   * `4`: `Carpet Shop` (`Warm Pads & Choirs`)
   * `5`: `Piano etc.` (`Keys, Pianos & Organs`)
   * `6`: `Woodwinds` (`Winds & Brass`)
   * `7`: `Extreme Pads` (`Motion Pads & Atmos`)
   * `8`: `Loop Factory` (`Drums, Perc & Loops`)
   * `9`: `Multipurpose` (`SFX, Drones & Exp.`)
2. **`playMode` (`'chromatic' | 'drum_map'`):**
   * En motores internos, **nace automáticamente del sonido o preset cargado** (o desde `[ Init ▾ ]` → *Cromático* vs *Kit Batería*), sincronizando la pestaña contextual del panel del Rompler:
     * **Cromático:** `[ Explorar | Parciales P1-P4 | Vector y Mod ]`
     * **Drum Map:** `[ Explorar | Pads del Kit | Filtro y Satur. Kit ]`
   * La selección manual Cromático/Drum en `McxInstrumentRouteModal` se muestra **solo para `External MIDI`**, donde el host no puede inferir qué aparato externo escucha en el cable MIDI.

---

## 4. Flujo de Trabajo en la Práctica

1. **Seleccionar motor / ruta (`McxInstrumentRouteModal`):** Eliges si la pista usa `Structured Rompler`, `MCS-48`, `AbyssMind` o `External MIDI`, y el puerto/canal MIDI.
2. **Explorar y cargar sonido (`EngineHeaderBar` + `EnginePresetBrowser`):** Desde cualquier motor haces clic en el selector `[ Fuente › Preset activo ]` (o usas `◀` / `▶` y `Guardar` / `Init`). En `Structured Rompler`, la barra izquierda del navegador integra tanto **Factory Presets** como los **bancos `.abdbank`** y carga perezosa (*lazy*) o arrastrar-y-soltar `.abdbank`.
3. **Editar síntesis o batería:**
   * En modo **Cromático**: editas parciales `P1..P4` (ondas VA con `PW` contextual, o selector real `{ Banco, Muestra PCM }` por parcial, filtro VCF1 con `Morph` solo en `Z-PLN`, envolventes `[ Amp | Filtro | Tono ]`) y `Vector 2D` + `Glide` + `VCF2` + `LFO 1/2` en `Vector y Mod`.
   * En modo **Drum Kit**: el pad seleccionado responde a `Auto-Sel MIDI`, permite audición `▶`, muestra su muestra asignada real y permite reasignar muestras PCM y editar `level`, `pan`, `cutoff`, `reso`, `decayMs`, `muteGroup`, `coarseKey` y `KeyTrk` por nota, además del filtro maestro `VCF2 + Drive` del kit.
4. **Guardar preset de usuario:** Desde el popover `[ Guardar ]` de `EngineHeaderBar` asignas nombre, categoría Hartmann `0..9` y autor, quedando accesible desde cualquier pista que utilice ese motor.

---

## 5. Menú `File` de la Barra Superior (Desacoplado)

El menú `File` de la Navbar queda reservado exclusivamente a las operaciones de proyecto y sesión general (`.mcxprj`, import/export WAV/MIDI, carpeta de trabajo y reset de fábrica).
