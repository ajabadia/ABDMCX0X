# Análisis Sistemático de Elementos y Arquitectura de la Workstation

> **Documento de Diseño y Especificación:** Detalle exhaustivo de componentes, flujo de datos, gestión de 64 pistas, separación de efectos y división de interfaces.  
> **Estado:** Aprobado para diseño (v1.0 — 2026-11-18).  
> **Ámbito:** `ABDMCX0X` y piezas transversales en `ABDShared`.

---

## 1. Gestión de 64 Pistas y los 16 Botones Físicos Superiores (Bancos A, B, C, D)

Para mantener la legibilidad perfecta en pantalla horizontal (1280x720) y preservar la ergonomía táctil 1:1 de los 16 botones de paso sin abarrotar la consola:

### A) 4 Bancos de 16 Canales con Código Cromático:
* **Banco A (Pistas 01 a 16):** Iluminación de botones en **Cian / Azul Eléctrico**.
* **Banco B (Pistas 17 a 32):** Iluminación de botones en **Ámbar / Naranja Vintage**.
* **Banco C (Pistas 33 a 48):** Iluminación de botones en **Verde Esmeralda**.
* **Banco D (Pistas 49 a 64):** Iluminación de botones en **Púrpura / Magenta**.

### B) Ubicación del Selector de Banco y Comportamiento:
* **Selector Integrado:** Situado en el extremo izquierdo de la tira `StepButtonStrip` (o en la barra de transporte), con 4 micro-pestañas `[ A ] [ B ] [ C ] [ D ]` y atajos de teclado rápidos (`Tab` / `Shift+Tab`).
* **Conmutación Instantánea:**
  * Al conmutar de banco, los 16 botones físicos superiores adoptan el color del banco activo y pasan a gobernar las pistas de ese bloque (en modos `PART SEL` y `PART MUTE`).
  * La consola del mezclador central conmuta suavemente a las 16 tiras de canal del banco activo.
  * **En modo Secuenciador / Edición de Pasos (`STEP MUTE`, `ACCENT`, `SLIDE`):** Los 16 botones representan siempre los 16 pasos del compás de la pista que esté enfocada en ese instante, garantizando coherencia absoluta.
* **Pistas Híbridas y Reorganización:**
  * Cada banco puede mezclar libremente pistas internas (`INT`) y pistas de control hardware (`EXT`).
  * Función de organización: reordenar o mover una pista de posición (`Mover Pista 03 a Pista 19`) para agrupar ritmos, bajos, sintetizadores y hardware ordenadamente.

---

## 2. Puertos MIDI Múltiples y Asignación Atómica

En un estudio real, no todo el hardware es un módulo multitímbrico de 16 partes. Conectamos sintes analógicos monotímbricos (Moog, Minilogue, Juno-106), cajas de ritmo en canales fijos (TR-8S) o canales virtuales del DAW:

* **Configuración Atómica por Pista Externa:**
  * `MidiPort`: Selector de interfaz/puerto físico o virtual (ej. `USB MIDI Out 1`, `DIN MIDI Out`, `DAW Virtual Bus`).
  * `MidiChannel`: Canal del 1 al 16 en ese puerto específico.
  * `HardwareProfile`: Contrato JSON cargado (`Contracts/*.json`).
* Si conectamos un sintetizador monotímbrico que solo escucha en el Canal 1, le asignamos una única pista de la Groovebox; las 63 pistas restantes quedan libres para otros canales, otros puertos o motores internos.

---

## 3. Naturaleza de los Datos: Moneda de Cambio en Pads, Teclado y Piano Roll

Para mantener `ABDShared` 100 % aséptico y evitar errores de redondeo o conversiones espurias:

$$\begin{aligned}
\text{\bf Notas Musicales (Pads / Teclado / Piano Roll)} &\longrightarrow \text{\bf Enteros MIDI Puros } (\text{Nota: } 0..127, \text{Velocidad: } 1..127) \\
\text{\bf Controles y Automatización (Knobs / Faders / LFOs)} &\longrightarrow \text{\bf Coma Flotante Normalizada } (0.0 \dots 1.0 \text{ ó } -1.0 \dots +1.0)
\end{aligned}$$

### A) ¿Por qué Notas en Enteros MIDI?
* Una nota musical es un valor discreto (semitono). Normalizar C4 (nota 60) a $0.4724$ para luego desnormalizarla introduce posibles desajustes por coma flotante. El número entero `60` es exacto para el Rompler, para un Moog externo y para el DAW.

### B) ¿Por qué Controles y LFOs en Coma Flotante?
* El cálculo DSP interno requiere modulación continua de 32 bits para **eliminar el "zipper noise"** (ruido de cremallera en cortes de filtro o pitch).
* **El Adaptador de Salida MIDI para LFOs:**  
  Genera la modulación en float continuo (`[-1.0, +1.0]`) y, al salir hacia el puerto MIDI externo, un **diezmador inteligente (Rate Limiter a 30–40 Hz con umbral de cambio $\Delta \ge 1$)** escala el valor a CC (0..127) o NRPN (14 bits). Esto evita saturar el ancho de banda del cable MIDI físico.

---

## 4. Vúmetros de Consola: Medición Dual (Audio vs. Actividad MIDI)

En la consola de 16 canales full-height, los vúmetros contiguos a los faders adaptan su función al destino de la pista:

| Tipo de Pista | Qué mide el Vúmetro | Escala y Comportamiento Visual |
| :--- | :--- | :--- |
| **Pistas INTERNAS (`INT`)** | **Audio Real en dBFS** (Señal DSP calculada por las voces y filtros). | Escala clásica de mezcla: Verde ($-60 \dots -12$ dB) $\to$ Amarillo ($-12 \dots -2$ dB) $\to$ Rojo (Clip). Retención de picos. |
| **Pistas EXTERNAS (`EXT`)** | **Actividad y Velocidad MIDI** (Eventos de nota transmitidos al cable/DAW). | Barra luminosa en **Azul Hielo o Violeta** que salta proporcionalmente a la velocidad de la nota ($1 \dots 127$) y decae con una caída visual rápida. Permite identificar al instante qué canales son de control MIDI. |
| **Pistas DUALES (`A+B`)** | **Audio DSP Interno** con indicador LED de pulso MIDI en cabecera. | Mide la señal de audio que genera la capa interna e ilumina el LED de voz con cada evento MIDI externo enviado. |

---

## 5. Diferenciación Arquitectónica: Efectos MIDI (MIDI FX) vs. Efectos de Audio (Audio FX)

Es fundamental separar tajantemente ambos conceptos en el flujo de señal:

```text
[Disparador: Teclado Virtual / Pads MPC / Piano-Roll PPQ / Tira 16 Pasos / MIDI In DAW]
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│               CAPA DE EFECTOS MIDI (MIDI FX / UTILIDADES DE INSERCIÓN)           │
│                    (Pre-Generación de Sonido / Operan a nivel de NOTA)            │
│                                                                                   │
│  • Arpegiador Groove (GrooveArpeggiator en ABDShared: 12 motivos, swing, máscaras)│
│  • Chord Performer / Chord Memory (Generación diatónica de acordes, strum en ms)  │
│  • Scale Transposer / In-Key Quantizer (Forzar notas a escalas musicales)         │
│  • Note Repeat / Roll (Repeticiones cuantizadas a 1/16, 1/8T por presión de pad)  │
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │  (Emite notas transformadas)
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
       [Ruta INTERNAL o BOTH]             [Ruta EXTERNAL o BOTH]
                    │                               │
                    ▼                               ▼
       [Generador de Sonido DSP]          [McxHardwareBridge -> MIDI Out]
       (Rompler 4-Partials / Drum Kit)    (Dispara Sintes Externos / DAW)
                    │                     (¡Se benefician de los Efectos MIDI!)
                    ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│              CAPA DE EFECTOS DE AUDIO (AUDIO FX / PROCESAMIENTO DE ONDA)          │
│                  (Post-Generación de Sonido / Operan a nivel de MUESTRA)          │
│                                                                                   │
│  • En Canal (Inserto): Doble Filtro VCF 2, Saturación & Drive, EQ 3 Bandas         │
│  • Envíos Auxiliares (Sends A, B, C, D) con ruteo Pre/Post-Fader                  │
│  • Rack Master FX Multibús: Reverb (Zita), Stereo Delay, Chorus, Flanger          │
│  • Etapa Master: MasterSafetyLimiter (0 dBFS soft-knee transparente)              │
└───────────────────────────────────┬───────────────────────────────────────────────┘
                                    │
                                    ▼
                         [Salida Audio Estéreo 2.0]
```

### Reglas Clave:
1. **Los Efectos MIDI enriquecen tanto al motor interno como al hardware:** Si activas el Arpegiador o el Generador de Acordes en una pista asignada a un Moog o Juno externo, las notas arpegiadas o los acordes rasgueados se emiten directamente por el cable MIDI.
2. **Los Efectos de Audio no se aplican al cable MIDI:** Un cable MIDI solo transporta datos de control numérico; el procesamiento de saturación analógica o reverberación interna solo actúa sobre señales de audio generadas en el host (o retornos de entrada de audio).

---

## 6. La Tríada de Pantallas que Sustituye al Monolito "Tono & FX"

El antiguo cajón único y saturado se divide en 3 pantallas especializadas con sus propios botones de apertura en la consola:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. PANTALLA [ TRACK ] — AJUSTES DE PISTA Y CONTROL SEMÁNTICO (Común a Interno y MIDI)       │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Afinación de Pista: Semitonos (-24..+24) y Afinación Fina (-50..+50 cents).              │
│ • Portamento / Glide: Modo (Off, Always, Legato) y Tiempo (0..500 ms).                      │
│ • Envolvente VCA: Ataque, Caída, Sostén, Liberación (ADSR estándar).                        │
│ • LFO Dual: Formas de onda, velocidad, BPM Sync, profundidad y destino de modulación.       │
│ • Configuración de Ruteo: Canal MIDI, Follow Transpose, Pan y Volumen.                     │
│ -> En pista MIDI Out: emite automáticamente CC 05, CC 73, CC 75, CC 70, CC 72, CC 10, CC 07│
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. PANTALLA [ CH AUDIO ] — PROCESAMIENTO DE AUDIO DE CANAL (Solo si hay señal de audio)     │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Ecualizador de Canal: EQ paramétrico de 3 bandas (Graves, Medios, Agudos).                │
│ • Saturación & Drive: Modelos Tube, Tape, Clip, Fold con control de cantidad.               │
│ • Filtro de Canal (VCF 2): Filtro secundario estéreo insertado en la tira de la mesa.       │
│ • Envíos Auxiliares (Sends A..D): Niveles de envío con selector Pre/Post-Fader al Rack FX.  │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. PANTALLA [ ENGINE ] — MOTOR DE SÍNTESIS ACTIVO (Específico del Instrumento Asignado)     │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ [Si el motor activo es STRUCTURED ROMPLER]:                                                 │
│   • Conexiones Estructuras: Paralelo, RingMod 1-2, Booster 1-2.                             │
│   • Mezcla Vectorial 2D: Ejes X/Y entre los 4 partials A, B, C, D.                          │
│   • Filtro de Voz (VCF 1): Modelos vintage (Roland TC6116, Z-Plane, Moog Ladder, MS-20).   │
│   • Edición profunda de parciales y capas multisample.                                      │
│ [Si el motor activo es JUNO-106 / JUNO-60 (JunoEngine)]:                                    │
│   • DCO Analógico: Saw, Pulse con PWM (Manual/LFO), Sub-Oscilador (-1/-2 oct), Ruido.       │
│   • Filtro Analógico IR3109: Cutoff, Resonancia autoscilante, Env Amount, Keyboard Track.   │
│   • HPF Roland: 4 pasos con refuerzo característico de graves (Bass Boost en pos 0).        │
│   • Chorus BBD Estéreo: Modo I, Modo II, Modo I+II con doble retardo de brigada de cubos.   │
│   • Selector de Presets de Fábrica: acceso directo a los 128 patches originales de 1984.    │
│ [Si la pista es EXTERNAL MIDI]:                                                             │
│   • Panel de Macros Hardware: Cutoff, Resonancia, Carácter y mandos específicos del contrato│
│ [Si en el futuro la pista usa WAVETABLE DWGS o CASIO CZ]:                                   │
│   • Selector y visualizador de tablas de ondas DWGS/AKWF o líneas DCO/DCW/DCA de Casio.     │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Descarte de Pistas Puras de Audio: Delegación al Rompler / Sampler

Se rechaza formalmente implementar pistas lineales de audio continuas estilo DAW en v1 (evitando la sobrecarga de streaming desde disco asíncrono y algoritmos elásticos de time-stretching en tiempo real).

* **La Solución Elegida:** Disparo de muestras de audio, loops de batería o frases vocales **como clips o zonas PCM cargadas en el Rompler / Drum Sampler**.
* La Groovebox los dispara como eventos musicales de nota (`NoteOn C3`).
* Se aprovechan de inmediato y con cero coste de código: envolventes, afinación, ruteo a efectos, filtros y modulación.

---

## 8. Arquitectura Multi-Motor Modular (`IMcxSoundEngine`) y Promoción a `ABDShared`

### A) El Contrato C++20 Unificado de Motor de Sonido
Para que una pista de ABDMCX0X pueda alojar cualquier motor de la suite o un puerto MIDI externo sin acoplamiento, todos los motores implementan la interfaz abstracta pura:

```cpp
class IMcxSoundEngine
{
public:
    virtual ~IMcxSoundEngine() = default;

    // Ciclo de vida y buffer (hilo no-audio)
    virtual void prepare(double sampleRate, int maxBlockSize) noexcept = 0;
    virtual void reset() noexcept = 0;

    // Eventos de interpretación en tiempo real (Lock-Free / Zero-Alloc)
    virtual void noteOn(int note, float velocity, float accent01) noexcept = 0;
    virtual void noteOff(int note) noexcept = 0;
    virtual void allNotesOff() noexcept = 0;
    virtual void setPitchBend(float semitones) noexcept = 0;

    // Parámetros semánticos universales (Macros de pista: Cutoff, Reso, Attack, Decay, etc.)
    virtual void setSemanticParam(uint64_t roleHash, float normalized01) noexcept = 0;

    // Renderizado estéreo (si es MIDI Out emite silencio y devuelve de inmediato)
    virtual void renderBlock(float* outL, float* outR, int numSamples) noexcept = 0;

    // Metadatos y capacidades
    virtual EngineId getEngineId() const noexcept = 0;
    virtual bool isDrumModeSupported() const noexcept = 0;
    virtual int getMaxPolyphony() const noexcept = 0;
};
```

### B) Reutilización de "Topologías Completas" vs. Reconstrucción desde Bloques Sueltos
* **El Principio de Identidad Analógica:** Un sintetizador clásico (como el Roland Juno-106 o el Korg MS2000) no es una simple suma de bloques genéricos (oscilador + filtro + envolvente). Su sonido característico reside en el **cableado interno específico, las curvas de saturación del filtro IR3109, el circuito de realce de graves del HPF en posición 0, el desfasaje del Chorus BBD y las tablas de calibración de componentes analógicos (LUTs)**.
* **Prohibición de Re-creación Redundante:** Para incorporar el Juno o el MS2000 a la Groovebox, **NO se reconstruye el sintetizador desde cero**. Se toma la clase de motor completa probada y calibrada (`JunoEngine` en `ABDJUNiO601`) y se conecta mediante un adaptador aséptico (`McxJunoEngine : public IMcxSoundEngine`).
* **Cero Trabajo Duplicado en Presets:** El motor ya posee su lista tipada de 128 parches de fábrica (`FactoryPresets.h`), listos para ser seleccionados desde el catálogo de la pista sin necesidad de re-sintetizarlos.

### C) El Structured Rompler como Instrumento Independiente de la Suite
* El código PCM actual de MCX0X (`McxVoice`, `McxPartialExciter`, `McxFilterBank`, `McxEnvelope5Stage`) se desacopla del chasis de la máquina y se empaqueta como **`StructuredRomplerEngine`**.
* Se rige por el contrato de la suite [`abd_structured_rompler.schema.json`](../../ABDShared/Contracts/abd_structured_rompler.schema.json).
* Pasa a residir en `ABDShared/Code/SynthEngines/StructuredRompler/`, permitiendo que en el futuro un plugin standalone tipo *Roland Sound Canvas* o *JV-1080* use ese mismo motor sin arrastrar el secuenciador ni los 16 pads de MCX0X.

### D) Integración con `ABDBankManager` y Bancos Tipo REX2
* `ABDBankManager` es el gestor de contenidos de la suite para cargar, guardar e intercambiar bancos `.abdbank`.
* **Soporte de Bancos REX2 / Slices:** La arquitectura queda definida para que bancos de samples troceados con secuencias de notas asociadas (tipo REX2 o slicer percusivo) se importen a través de `ABDBankManager`, cargando los slices en las zonas PCM del Rompler y depositando automáticamente la secuencia rítmica asociada en el **Piano Roll (`PianoRollModal`)** de la pista correspondiente.

### E) Descarte Definitivo de Hosting VST/VST3 de Terceros en v1
Se evalúa formalmente la posibilidad de hospedar plugins VST de terceros en las pistas y se **descarta categóricamente** por los siguientes motivos técnicos y de producto:
1. **Conflicto de Interfaces:** Incrustar ventanas nativas Win32/X11 de plugins ajenos sobre un lienzo renderizado en WebView2 genera problemas severos de parpadeo, Z-order y robo de eventos de teclado.
2. **Latencia Impredecible:** Requiere un sistema complejo de compensación de retardo de plugins (*Plugin Delay Compensation - PDC*) que complica el motor de tiempo real.
3. **Fragilidad de la Sesión:** Un fallo o fuga de memoria en un VST3 externo colapsaría la Groovebox completa.
4. **Incompatibilidad Absoluta con WASM:** Los plugins VST son binarios compilados para la CPU anfitriona; no pueden ejecutarse en la versión WebAssembly / navegador.
5. **Veredicto:** El valor de producción que aportaría hospedar VSTs queda plenamente cubierto de forma más ligera, robusta y multiplataforma mediante el **Ruteo MIDI Out hacia hardware o hacia canales de instrumento del DAW anfitrión**.
