# Análisis y Plan: Plugins MIDI de Inserción y Arquitectura de Pista

> **Documento de Análisis Arquitectónico y Plan Director**  
> **Fecha:** 2026-11-19  
> **Ámbito:** `ABDShared` (MidiFaceplates canónicas & Modales Modeless) ↔ `ABDMCX0X` (Workstation / Groovebox)  
> **Estado:** ✅ **IMPLEMENTADO Y VERIFICADO** (Pestaña MIDI FX en 4 etapas, Input Quantize en Pads MPC, Arpegiador Groove flotante, y Sincronía con Pianola).  

---

## 1. Diagnóstico del Estado Actual

Al auditar los tres componentes clave en el código actual:

### A. La Pianola (`PianoRollModal` en `ABDShared/Components/PianoRoll/`)
- **Fortalezas ya construidas:**
  - Código desacoplado en módulos `< 200` líneas (`pianoRollCanvas.js`, `pianoRollVelocityLane.js`, `pianoRollViews.js`).
  - Soporte dual: *Cromático* (teclado piano vertical) y *Drum Grid* (nombres de instrumentos de percusión).
  - Carril inferior con detección de **Roland Accent** (`vel > 100`).
  - Carril de automatización de parámetros (*Motion Recording*: Cutoff, Reso, Pan).
  - Selector de división de rejilla (`off`, `1/4`, `1/8`, `1/16`, `1/32`, `1/16T`).
  - Selector de Swing / Shuffle (`50%` a `75%`).
- **Problema actual:** Vive como un modal flotante independiente y huérfano (`PianoRollModal`), sin un contrato de plugin de inserción ni carátula de hardware homogénea.

### B. El Pad de 16 (`MpcPadMatrix.js` en `ABDShared/Components/Controls/`)
- **Fortalezas ya construidas:**
  - Matriz 4x4 táctil con modos: `drum` (kits, choke groups), `chromatic` (escalas musicales, tonalidad raíz, octava) y `16_levels` (16 niveles de velocidad o 16 semitonos de afinación).
- **Problema actual en `ABDMCX0X`:**
  - En la Groovebox está confinado dentro de un cajón deslizante inferior (`McxPadsDrawer.ts`).
  - No está tratado como lo que verdaderamente es: un **Plugin MIDI de Interpretación** (*Performance Pad Controller*) que transforma pulsaciones en notas musicales adaptadas al contrato del instrumento.

### C. El Arpegiador (`GrooveArpeggiator` en `ABDShared::SynthCore`)
- **Fortalezas ya construidas en C++20:**
  - Algoritmo de arpegiador con 12 patrones rítmicos, 1..4 octavas, longitud de compuerta (*Gate* 10%..100%), swing y sincronía estricta a BPM/PPQ.
- **Problema actual en la UI:**
  - En la WebUI solo existe un botón simple tipo switch en la pestaña `MIDI FX` (`ARPEGIADOR: APAGADO / ENCENDIDO`).
  - Carece de interfaz visual propia, carátula hardware clásica, selector de patrones rítmicos, octavas o visualización de notas disparadas.

---

## 2. Filosofía DRY: Centralizar "MidiFaceplates" en `ABDShared`

Siguiendo exactamente el éxito del modelo de efectos de audio (`FxFaceplates`), crearemos el subsistema hermano para el procesamiento de datos musicales:

```
ABDShared/
  ├── Contracts/
  │    └── midiFaceplateBridge.ts       <-- Contrato canónico de plugins MIDI
  ├── Components/
  │    └── MidiFaceplates/              <-- CARÁTULAS CANÓNICAS COMPARTIDAS
  │         ├── MidiFaceplateModal.js   <-- Contenedor modal universal con LCD
  │         ├── MidiFaceplateRegistry.js<-- Catálogo de plugins MIDI, metadatos y rangos
  │         ├── faceplates/
  │         │    ├── ArpeggiatorFaceplate.js   (Carátula clásica hardware: 12 patrones, octavas, gate, swing)
  │         │    ├── PadsPerformFaceplate.js   (Carátula MPC 4x4: Drum Kit, Escalas, 16-Levels, Chords)
  │         │    ├── PianoRollFaceplate.js     (Pianola/Secuenciador universal con rejilla, acento y motion)
  │         │    └── ... (futuros: ChordHarmonizer, NoteRepeatRatchet)
  │         └── styles/
  │              └── midi-faceplates.css (100% tokenizado, 0 colores hardcodeados)
```

### Ventajas de este modelo:
1. **Reutilización total en la suite:** El mismo Arpegiador visual o el mismo Pad Perform de 16 servirá para `ABDMCX0X`, `ABDJUNiO601`, `ABDEep` o cualquier futuro sinte.
2. **Carátula y personalidad propia:** Cada plugin MIDI tiene su propia identidad (diseño de chasis, serigrafía, pantalla LCD monocromática, controles táctiles y feedback visual).
3. **Respeto a los límites de tamaño:** Cada faceplate se mantendrá `< 200` líneas de JavaScript/CSS.

---

## 3. Cadena de Señal de la Pista (Track Signal Chain)

Cada pista de la Groovebox (`P01` a `P16`) procesa dos dominios lineales consecutivos:

```
DOMINIO DE DATOS MUSICALES (Notas / MIDI)
  │
  ├── 1. Generador de Eventos (Secuenciador de Patrón / Entrada Externa / Teclado)
  │
  └── 2. INSERCIONES MIDI (Plugins MIDI en serie):
        ┌────────────────────────────────────────────────────────┐
        │ Slot 1: Pads Perform (Escala / Chords / 16-Levels)      │
        │ Slot 2: Groove Arpeggiator (Patrón, Octavas, Gate, Swing)│
        │ Slot 3: Cuantización de Entrada / Humanizer            │
        └────────────────────────────────────────────────────────┘
  │
  ▼
DOMINIO DE SÍNTESIS / GENERACIÓN
  │
  └── 3. Instrumento Asignado:
        - Si es Interno: Motor de Síntesis (Rompler, VA, FM...) ──► Genera Audio Estéreo
        - Si es Externo: Null Engine (MIDI Out) ─────────────────► Emite a Hardware / DAW
  │
  ▼
DOMINIO DE AUDIO (Muestras de Audio)
  │
  └── 4. INSERCIÓN DE AUDIO (Audio Insert FX):
        Conexión directa a una bahía del Armario Rack FX (Slot 1..8):
        Audio de pista ──► [ Bahía Rack FX seleccionada ] ──► Audio Procesado
  │
  └── 5. Canal de Mezcla:
        EQ Biquad ──► Fader Volumen ──► Panorama ──► Envíos Auxiliares (Sends A..D)
```

---

## 4. Cuantización y Shuffle / Swing: Definición Rigurosa

La cuantización y el swing operan estrictamente en el **dominio temporal de ticks PPQ**:

1. **Cuantización de Entrada (Input Quantize):**
   - Al tocar en los pads o en el teclado, el timestamp del evento se redondea al tick de la cuadrícula seleccionada (`1/4`, `1/8`, `1/16`, `1/32`, `1/16T` o `Libre`).
   - Evita la necesidad de editar notas a posteriori en el Piano Roll si se desea una ejecución rítmica perfecta.
2. **Shuffle / Swing (Groove Engine):**
   - El swing actúa **retrasando sistemáticamente los pulsos pares** de la subdivisión de compás:
     - `50%`: Tiempo recto (*straight*).
     - `58% - 62%`: Swing bailable clásico Akai MPC.
     - `66%`: Tresillo perfecto (*triplet / shuffle* blues y house).
     - `75%`: Shuffle extremo.
   - **Regla de oro:** El Arpegiador, el Secuenciador y la Pianola comparten el mismo valor de Groove/Swing configurado en la pista, garantizando que el arpegio y la batería caminen con el mismo *feel*.

---

## 5. Representación en la Interfaz de Usuario de `ABDMCX0X`

### A. En la Consola de Mezclas (`McxMixerConsole.ts`)
Cada canal añade dos puntos de acceso claros:
- **`MIDI FX`:** Indicador y acceso directo a los plugins de datos de esa pista (`Pads Perform`, `Arp`, `Piano Roll`).
- **`INS FX`:** Selector de la inserción de audio en serie (`None`, `Slot 1`..`Slot 8` del Rack).

### B. En el Cajón de Pista (`McxToneDrawer.ts`)
- **Pestaña `MIDI FX`:**
  - Muestra las carátulas compactas de los plugins MIDI de la pista:
    - Tarjeta Arpegiador con carátula y switch.
    - Tarjeta Pads Perform con modo activo (`Drum Kit`, `Scale: Minor Natural`, `16 Levels`).
    - Tarjeta Piano Roll con compases y swing.
  - Al pulsar sobre cualquiera de ellas, se abre su **`MidiFaceplateModal`** para edición completa en alta resolución.
- **Pestaña `CANAL / MEZCLA`:**
  - Selector de Inserción de Audio (`AUDIO INSERT: Bahía 1..8`), EQ, Fader, Pan y Envíos A/B.

---

## 6. Plan de Ejecución por Hitos

### Hito 1: Contrato y Catálogo en `ABDShared` (`MidiFaceplates`)
1. Crear `ABDShared/Contracts/midiFaceplateBridge.ts`.
2. Crear `MidiFaceplateRegistry.js` con los metadatos y fábricas de:
   - `ArpeggiatorFaceplate.js` (aprovechando `GrooveArpeggiator.h`).
   - `PadsPerformFaceplate.js` (empaquetando `MpcPadMatrix.js`).
   - `PianoRollFaceplate.js` (empaquetando el canvas y carril de `PianoRollModal.js`).
3. Crear el contenedor modal unificado `MidiFaceplateModal.js` y estilos `midi-faceplates.css`.
4. Tests con Vitest en `ABDShared`.

### Hito 2: Cableado de Inserciones en `ABDMCX0X`
1. Conectar los slots de inserción MIDI en la pestaña `MIDI FX` del cajón de pista.
2. Conectar el selector de inserción de audio (`insertSlot`) a las bahías del Rack en la pestaña `CANAL / MEZCLA`.
3. Conectar la pulsación del Pad Perform a la grabación en el secuenciador nativo C++20 `McxPatternSequencer`.

### Hito 3: Verificación y QA
1. Verificación en CTest y WebUI offline.
2. Comprobación de límites: C++ `< 300` lín., JS/TS/CSS `< 200` lín., 0 colores hardcodeados, 0 emojis.
