# Especificación de Integración: MultiBusFxRackModal (Polimórfico 3 Niveles)

> **Ubicación Canónica:** `ABDShared/Components/MultiBusFxRack/` (`multiBusFxRackModal.js`, `multiBusFxRegistry.js`, `multiBusFxViews.js`, `multiBusFxRackLcd.js`)  
> **Export en Shared:** `@abdsynths/shared/components` (`MultiBusFxRackModal`, `MultiBusFxRackLcd`, `FX_CATEGORIES`, `TOPOLOGIES`)  
> **Consumidores:** `ABDMCX0X`, `ABDAxionikVS`, `ABDEep`, `ABDMS2000`, `ABDCZ101`  
> **Motor DSP C++ Asociado:** `ABDShared/Code/DspEffects/FxEngine.h` y `DspMultiBusFxRack.h`

---

## 1. Visión y Objetivos Arquitectónicos
`MultiBusFxRackModal` es el componente visual universal de rack de efectos multibus de la suite ABDSynths (alineado al 100% con la arquitectura modular polimórfica de 4 slots de `ABDEep`). Proporciona una interfaz gráfica de alta gama (estilo procesador multiefectos hardware de estudio) desacoplada de cualquier instrumento particular:

1. **Slots Polimórficos Universales (Filosofía ABDEep):** Ningún envío ni slot está atado de forma rígida a un tipo de efecto. En cualquiera de los 4 slots se selecciona libremente:
   - **Nivel 1 — Categoría / Familia:** Reverbs, Delays / Echo, Modulación (Chorus, Flanger, Phaser, Solina, Rotary), Distorsión / Drive, Filtros / EQ, Dinámica, Pitch / Especiales.
   - **Nivel 2 — Algoritmo Concreto:** El procesador exacto dentro de la categoría seleccionada (ej. en Reverbs: `Zita Reverb`, `FDN Reverb`, `Vintage Plate`, `Spring Reverb`; en Delays: `Stereo Delay`, `Analog Tape`, `Space Echo RE-201`, `Ducking Delay`; en Modulación: `Roland BBD Chorus`, `Solina Ensemble`, `Stereo Flanger`, `Phaser 4-Stage`).
   - **Nivel 3 — Presets del Efecto:** Desplegable de presets específicos de ese algoritmo que configuran sus parámetros al instante.
2. **Topologías de Ruteo 0..9 (Paridad con `FxEngine.h`):** Conmutación instantánea entre los 10 modos de ruteo clásicos: Serie (`1➔2➔3➔4`), Pareja delante (`(1∥2)➔3➔4`), Dos parejas (`(1∥2)∥(3∥4)`), Paralelo puro (`1∥2∥3∥4`), Cadenas paralelas (`(1➔2)∥(3➔4)`), Centro partido (`1➔(2∥3)➔4`), Pareja a pareja (`(1∥2)➔(3∥4)`), Cadena + Adición (`(1➔2➔3)∥4`), Pareja promediada, y Serie con realimentación global (`Feedback Loop`).
3. **Pantalla LCD Gráfica Vectorial (SVG):** Dibuja el diagrama de bloques interactivo con los nombres reales de los algoritmos activos en cada slot (`[FX 1: ZITA REV]`, `[FX 2: BBD CHOR]`, etc.), flechas dirigidas y vúmetros integrados.
4. **Feedback Continuo al Anfitrión:** Emisión reactiva de `onSendLabelsChange` con las etiquetas de los 4 envíos (`sendA`..`sendD`) para alimentar los nombres de los buses en la consola mezcladora de 16 canales.
5. **Eficiencia y 0 % CPU:** Silenciado o bypass selectivo de buses inactivos para saltar la ejecución DSP de algoritmos no utilizados.

---

## 2. Contrato de Integración WebUI (TypeScript)

### 2.1. Opciones de Inicialización (`MultiBusFxRackModalOptions`)

```typescript
export interface MultiBusFxRackModalOptions {
  /** Host bridge para enviar y recibir parámetros del motor C++/WASM */
  bridge: FxRackBridgeAdapter;

  /** Tema visual inicial (ej. 'ms2000', 'mc303', 'neuron', 'audiolab') */
  theme?: string;

  /** Idioma de la interfaz ('es' | 'en') */
  locale?: string;

  /** Slots habilitados en este instrumento concreto (por defecto todos) */
  enabledSlots?: Array<'reverb' | 'chorus' | 'delay' | 'flanger' | 'limiter' | 'saturation'>;

  /** Callback cuando cambian los nombres de algoritmo de los envíos */
  onSendLabelsChange?: (labels: Record<'sendA' | 'sendB' | 'sendC' | 'sendD', string>) => void;

  /** Callback cuando se cierra la modal */
  onClose?: () => void;
}
```

### 2.2. Adaptador del Bridge (`FxRackBridgeAdapter`)

```typescript
export interface FxRackBridgeAdapter {
  setTopology: (topo: number) => void;
  setSlotEngine: (slotIdx: number, engineId: number) => void;
  setMacro: (slotIdx: number, macroId: number) => void;
  setParam: (paramId: string, value: number) => void;
  setSendReturns: (retA: number, retB: number, retC: number, retD: number) => void;
  setCascadeInjections: (choToRev: number, delToRev: number) => void;
  muteSendBus: (busIdx: number, muted: boolean) => void;
  onTelemetry?: (cb: (data: FxRackTelemetryDto) => void) => void;
}

export interface FxRackTelemetryDto {
  peakSendA: number;
  peakSendB: number;
  peakSendC: number;
  peakSendD: number;
  peakMasterL: number;
  peakMasterR: number;
  limiterGainReductionDb: number;
}
```

---

## 3. Pantalla LCD Gráfica de Topología y Ruteo Dinámico

Ubicada en la parte superior de la modal, utiliza un `<canvas>` o `<svg>` dedicado renderizado con los tokens de diseño LCD de `@abdsynths/shared` (`--color-lcd-bg`, `--color-lcd-text`, `--color-lcd-border`, `--font-lcd`):

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [LCD VIRTUAL DE ALTA RESOLUCIÓN] MULTI-BUS DSP ROUTING MATRIX           SR: 44.1 kHz   │
│                                                                                        │
│  [DRY] ─────────────────────────────────────────────────────────────┐                  │
│                                                                      ▼                  │
│  [SEND A] ────> [ FX 1: SPACE ECHO RE-201 ] ──────────(Ret A)─────> ( ∑ )              │
│                       ▲                ▲                             │                 │
│                 (35% Inyec)      (25% Inyec)                         │                 │
│                       │                │                             │                 │
│  [SEND B] ────> [ FX 2: ROLAND BBD CHORUS ] ──┴───────(Ret B)─────>  │                 │
│                                                                      │                 │
│  [SEND C] ────> [ FX 3: ZITA REVERB (Hall) ] ─────────(Ret C)─────>  │                 │
│                                                                      │                 │
│  [SEND D] ────> [ FX 4: SOLINA ENSEMBLE ] ────────────(Ret D)─────>  │                 │
│                                                                      │                 │
│                                                                      ▼                 │
│                                                     [ MASTER SAFETY LIMITER ] ──> OUT  │
│                                                       (Ceiling: -0.3 dB | GR: 0.0 dB)  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Topologías Soportadas en la Representación Gráfica (Modos 0..9 de `FxEngine`):
1. **`0: Serie (1 ➔ 2 ➔ 3 ➔ 4)`:** Cadena lineal directa a través de los cuatro procesadores.
2. **`1: Pareja Delante ((1∥2) ➔ 3 ➔ 4)`:** Slots 1 y 2 en paralelo alimentando en serie a los slots 3 y 4.
3. **`2: Dos Parejas ((1∥2) ∥ (3∥4))`:** Dos parejas independientes en paralelo sumándose al bus master.
4. **`3: Paralelo Puro (1 ∥ 2 ∥ 3 ∥ 4)`:** Cuatro envíos completamente independientes sumándose en paralelo al nodo maestro (∑).
5. **`4: Cadenas Paralelas ((1➔2) ∥ (3➔4))`:** Dos cadenas en serie procesándose en paralelo.
6. **`5: Centro Partido (1 ➔ (2∥3) ➔ 4)`:** Slot 1 alimenta en paralelo a los slots 2 y 3, que se recombinan en el slot 4.
7. **`6: Pareja a Pareja ((1∥2) ➔ (3∥4))`:** La suma de slots 1 y 2 alimenta en paralelo a los slots 3 y 4.
8. **`7: Cadena + Adición ((1➔2➔3) ∥ 4)`:** Cadena en serie de tres slots con el slot 4 sumado en paralelo.
9. **`8: Pareja Promediada ((1∥2) ➔ 3 ➔ 4 Avg)`:** Idéntica topología que el modo 1 con normalización de ganancia promediada.
10. **`9: Serie con Feedback (1 ➔ 2 ➔ 3 ➔ 4 FB)`:** Cadena en serie con bucle vectorial de realimentación global desde la salida del slot 4 hacia la entrada del slot 1.

---

## 4. Encadenamiento por Etapas y Expansión Dinámica (DAG)

Para configuraciones donde ciertos envíos deben alimentar un procesador intermedio (ej. expansor estéreo o saturador) antes de sumarse al bus final:
- El motor C++ en `DspMultiBusFxRack` opera por nodos dirigidos con buffers intermedios (`kMaxChunk = 256`).
- Si un envío tiene retorno 0 o está marcado como `muted`, el motor conmuta a bypass inmediato **(0 % CPU)** sin ejecutar el procesador asociado.
- La etapa final suma todas las ramas procesadas a través del módulo de protección `MasterSafetyLimiter` para asegurar una señal limpia de inter-sample peaks y sin clipping digital.

---

## 5. Bus de Control, Sincronía y Modulación Externa (`DspFxControlFrame`)

Para que el Rack FX Master interactúe dinámicamente con el ritmo, los LFOs y el reloj de la Groovebox/DAW, `DspMultiBusFxRack` incorpora un bus de control desacoplado en C++20 (`ControlFrame`):

```cpp
struct ControlFrame {
    double bpm { 120.0 };
    bool   tempoSync { true };
    std::array<float, 4> lfoMod { 0.0f, 0.0f, 0.0f, 0.0f }; // Bipolar [-1.0 .. +1.0]
    std::array<float, 4> gates  { 0.0f, 0.0f, 0.0f, 0.0f }; // Disparos binarios [0.0 / 1.0]
};
```

### Canales de Modulación y Disparo Asignados:
1. **Sincronía BPM (1 canal centralizado):** Esclaviza el tiempo de eco del Stereo Delay (1/16, 1/8d, ping-pong) y la tasa de oscilación del Chorus/Flanger.
2. **Entradas de Modulación LFO (4 canales continuos):**
   - **`LFO Mod A` (Bus A - Reverb):** Modulación de amortiguación de agudos (*Damping*) o tamaño del espacio.
   - **`LFO Mod B` (Bus B - Chorus/Flanger):** Barrido de velocidad (*Rate*) y profundidad estéreo (*Depth*).
   - **`LFO Mod C` (Bus C - Delay):** Variación de tiempo estilo cinta (*Tape Wow*) o realimentación (*Feedback*).
   - **`LFO Mod D` (Bus D - Aux/Saturación):** Barrido de saturación armónica o fase.
3. **Entradas de Compuerta / Gate Rítmico (4 canales de disparo):**
   - **`Gate 0 (Sidechain Ducking)`:** Atenúa de forma instantánea los retornos de Reverb y Delay cuando el bombo golpea, evitando emborronar graves.
   - **`Gate 1 (Reverb Gated)`:** Corta la cola de la reverb de forma tajante (sonido clásico *Gated Snare* 80s / Synthwave).
   - **`Gate 2 (Delay Freeze)`:** Fija la realimentación al 100% y bloquea la entrada para mantener un bucle infinito (*Hold buffer*).
   - **`Gate 3 (Stutter / FX Kill)`:** Silencia en seco todos los retornos de efectos para crear paradas rítmicas (*Drops*) y glitches en vivo.

---

## 6. Integración en ABDMCX0X

### 6.1. Puntos de Invocación en la Interfaz:
1. **Botón Principal en la Columna Master:**  
   Ubicado en el panel lateral derecho (`.mcx-master-panel`), justo encima de la perilla de volumen master:
   ```html
   <button type="button" class="mcx-master-fx-btn" id="mcx-btn-open-fx">
     <span class="mcx-btn-led"></span>
     <span>FX RACK</span>
     <span class="mcx-master-fx-topo-badge">CASC</span>
   </button>
   ```
2. **Acceso desde el Drawer Lateral Global:**  
   En `McxGlobalDrawer`, la sección `MASTER FX BUS` incorpora el botón *"Abrir Rack Modular Completo"*.

### 6.2. Actualización Dinámica de las Tiras del Mezclador (16 Canales):
Cuando la modal emite `onSendLabelsChange`, las 16 tiras de canal actualizan sus leyendas de envíos contextuales:
- `S-A`: Nombre activo del algoritmo en Slot 1 (ej. `Zita Reverb`, `Vintage Plate`, `Space Echo`).
- `S-B`: Nombre activo del algoritmo en Slot 2 (ej. `Roland BBD Chorus`, `Stereo Flanger`).
- `S-C`: Nombre activo del algoritmo en Slot 3 (ej. `Stereo Delay`, `Analog Tape`).
- `S-D`: Nombre activo del algoritmo en Slot 4 (ej. `Tape Saturation`, `Fairchild Comp`).
- Si un envío está en bypass/mute, el botón o mini-knob correspondiente atenúa su opacidad visualizando el estado inactivo.

---

## 7. Estado de la Implementación Canónica (Nov 2026)

- **Componente Universal:** Implementado en `ABDShared/Components/MultiBusFxRack/` y subdividido en módulos estrictamente `< 200 líneas`:
  - `multiBusFxRegistry.js`: Catálogo de 7 categorías (`reverb`, `delay`, `modulation`, `distortion`, `filter`, `dynamics`, `pitch`), algoritmos y presets.
  - `multiBusFxViews.js`: Generación de interfaz en 3 niveles y barras de control.
  - `multiBusFxRackLcd.js`: Renderizador SVG de matriz vectorial de ruteo para las 10 topologías con nombres dinámicos.
  - `multiBusFxRackModal.js`: Controlador principal con modales modeless, eventos en cascada y arrastre.
- **Definiciones TypeScript:** Publicadas canónicamente en `ABDShared/Components/multiBusFxRackModal.d.ts`.
- **Hojas de Estilo:** `ABDShared/Assets/styles/components/multi-bus-fx-rack.css` (100% token-driven, cero colores hardcodeados).
- **Suite de Pruebas:** Validada con Vitest en `ABDShared/tests/multiBusFxRackModal.test.js` (**6/6 tests unitarios en verde**).
- **Integración Host:** Enlazada y operativa en `ABDMCX0X` a través de `McxMasterPanel` (`#mcx-btn-open-fx`) y `McxGlobalDrawer` (`#g-open-full-rack`).


## 8. Integración en Barra de Menú (Navbar), Ventana Flotante y Soporte Multilingüe (i18n)

### 8.1 Menú Tools (Herramientas) y Atajo Global
- **Ruta de acceso:** `Tools` (o `Herramientas` en ES) ➔ `Master Multi-Bus FX Rack...` / `Rack Multibus de Efectos...`.
- **Atajo de teclado:** `Ctrl+F` abre o cierra el diálogo de manera instantánea desde cualquier vista sin perder el foco ni interrumpir la reproducción sonora.

### 8.2 Ventana Flotante Modeless (Sin Bloqueo ni Fondo Difuminado)
- **Implementación:** Basada en `<dialog class="fx-rack-floating-dialog">` abierta mediante `.show()` (en lugar de `.showModal()`).
- **Comportamiento visual:** No genera capa opaca ni desenfoque de fondo (`::backdrop { background: transparent; backdrop-filter: none; pointer-events: none; }`). Permite al usuario continuar manipulando el sintetizador, pads o teclado virtual mientras el rack permanece visible.
- **Arrastre nativo (`attachDialogDrag`):** La barra superior del rack (`.fx-rack-head`) actúa como manipulador de arrastre (`cursor: grab / grabbing`). Doble clic sobre la cabecera re-centra la ventana en pantalla.

### 8.3 Internacionalización Completa (ES / EN) y Cero Colores Hardcodeados
- **Diccionario i18n reactivo:** Topologías (`PARALELO`, `CASCADA`, `HÍBRIDO`, `SERIE`), títulos, descripciones de compuertas rítmicas y tooltips se adaptan inmediatamente ante cambios de idioma mediante el método `.setLocale(locale)`.
- **Tokenización 100%:** Eliminación absoluta de códigos `#hex` directos; toda la paleta (incluso SVG y LCD) utiliza variables canónicas `--color-accent`, `--color-warning`, `--color-danger`, `--color-panel-surface`, etc.
