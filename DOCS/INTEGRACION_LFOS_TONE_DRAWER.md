# Integración de Moduladores LFO Duales en ABDMCX0X (WebUI & DSP)

## 1. Resumen Arquitectónico
Cada una de las 16 partes multitimbrales de **ABDMCX0X** cuenta ahora con **2 LFOs analógicos locales independientes**:
- **LFO 1 (Movimiento & Tono):** Especializado en Pitch (Vibrato), Fine Pitch, Auto-Pan estéreo y Morfología Vectorial 2D (X/Y).
- **LFO 2 (Timbre & Rítmica):** Especializado en Filtro Dual (Cutoff VCF 1/2), Resonancia, Nivel VCA (Trémolo) y Saturación/Drive.

---

## 2. Ubicación en la Interfaz (Deck 2 del Tone Drawer)
El módulo se encuentra montado como tarjeta de hardware dedicada:
`mcx-module-card mcx-card-lfo` situada como primer bloque en **Deck 2 (Inferior)**, precediendo a la **Envolvente VCA (ADSR)**.
Esto permite un balance simétrico perfecto:
- **Deck 1 (Generador & Tono, ~950px):** Config & Ruta, Afinación, Portamento, Vector 2D, Filtros Duales en Serie, Saturación Drive.
- **Deck 2 (Modulación & Mezcla, ~1040px):** LFO Dual, Envolvente VCA, Ecualizador 3-Bandas, Buses Envío Rack FX, Salida & Canal.

### Características de la Tarjeta LFO
- **Subpestañas conmutables `[LFO 1] [LFO 2]`:** Permiten alternar entre el oscilador de movimiento y el de timbre sin saturar el espacio vertical.
- **LED dinámico de fase (`#mcx-lfo-led`):** Indicador luminoso pulsante con feedback visual del ciclo de modulación.
- **Selector de Forma de Onda (SHAPE):** Basado en los enums canónicos de `LfoAnalog`:
  - `0`: `~ SINE` (kSine)
  - `1`: `/\ TRI` (kTriangle)
  - `2`: `|--| SQR` (kSquare)
  - `3`: `/| RAMP+` (kRampUp)
  - `4`: `|\ SAW` (kRampDown)
  - `5`: `|::| S&H` (kSampleHold)
  - `6`: `~: GLIDE` (kSampleGlide)
  - `7`: `|_| PULSE` (kPulse25)
- **Conmutador TEMPO / SYNC:** Alterna entre frecuencia libre analógica (`FREE (Hz)`, 0.05 Hz a 30.0 Hz) y sincronía métrica (`BPM SYNC`).
- **Modo de Disparo (TRIGGER / KEY SYNC):**
  - `0 (VOICE)`: Retrigger polifónico individual por pulsación de tecla.
  - `1 (BEAT)`: Sincronizado a cuadrícula métrica de compás.
  - `2 (FREE)`: Oscilador analógico libre continuo sin reinicio de fase.
- **Knobs Canónicos (size 38px, ms2000 skin):**
  - `RATE`: Frecuencia en Hz o división métrica.
  - `DELAY`: Retardo analógico previo a la rampa (0 ms a 2000 ms).
  - `DEPTH`: Profundidad bipolar (-100% a +100%, centro en 0% = bypass).
- **Selector de Destino (MOD TARGET):**
  - LFO 1: `0: PITCH (VIBRATO)`, `1: FINE PITCH`, `2: AUTO-PAN`, `3: VECTOR X/Y`.
  - LFO 2: `0: VCF CUTOFF`, `1: VCF RESONANCE`, `2: VCA LEVEL`, `3: DRIVE SAT`.

---

## 3. Mapeo de Parámetros IPC / WASM (`WASM_PARAM_ID`)

| Parámetro WebUI | ID Numérico | Rango / Valores | Descripción |
| :--- | :---: | :---: | :--- |
| `lfo1Shape` | **68** | `0..7` | Forma de onda LFO 1 (`LfoAnalog::Waveform`) |
| `lfo1Sync` | **69** | `0` o `1` | `0` = Frecuencia Libre (Hz), `1` = Tempo Sync (BPM) |
| `lfo1Trigger` | **70** | `0..2` | `0: Voice`, `1: Beat`, `2: Free` |
| `lfo1Rate` | **71** | `0.05 .. 30.0` | Velocidad (Hz o división en BPM sync) |
| `lfo1Delay` | **72** | `0 .. 2000` | Tiempo de retardo en ms |
| `lfo1Depth` | **73** | `-1.0 .. +1.0` | Profundidad bipolar (centro 0.0 = bypass) |
| `lfo1Target` | **74** | `0..3` | Destino de modulación LFO 1 |
| `lfo2Shape` | **75** | `0..7` | Forma de onda LFO 2 (`LfoAnalog::Waveform`) |
| `lfo2Sync` | **76** | `0` o `1` | `0` = Frecuencia Libre (Hz), `1` = Tempo Sync (BPM) |
| `lfo2Trigger` | **77** | `0..2` | `0: Voice`, `1: Beat`, `2: Free` |
| `lfo2Rate` | **78** | `0.05 .. 30.0` | Velocidad (Hz o división en BPM sync) |
| `lfo2Delay` | **79** | `0 .. 2000` | Tiempo de retardo en ms |
| `lfo2Depth` | **80** | `-1.0 .. +1.0` | Profundidad bipolar (centro 0.0 = bypass) |
| `lfo2Target` | **81** | `0..3` | Destino de modulación LFO 2 |

---

## 4. Estructura y Módulos Creados / Modificados
- `WebUI/src/ui/McxToneDrawerLfo.ts`: **184 líneas** (< 200) — HTML de tarjeta, subpestañas, binds de eventos y sincronización.
- `WebUI/src/ui/McxToneDrawerKnobs.ts`: **124 líneas** (< 200) — Knobs `lfo1Rate`, `lfo1Delay`, `lfo1Depth`, `lfo2Rate`, `lfo2Delay`, `lfo2Depth`.
- `WebUI/src/ui/McxToneDrawerDeck1.ts`: **137 líneas** (< 200) — Inserción ergonómica entre Vector y Filtros.
- `WebUI/src/ui/McxToneDrawer.ts`: **189 líneas** (< 200) — Enlace de eventos y soporte de telemetría de fase.
- `WebUI/src/ui/McxToneDrawerViews.ts`: **128 líneas** (< 200) — Helpers de vista y restricciones de filtros duales.
- `WebUI/src/bridge/McxHostBridge.ts`: **177 líneas** (< 200) — Mapeo de parámetros 68-81.
- `WebUI/src/ui/McxMixerConsole.ts`: **165 líneas** (< 200) — Estado `McxPartUiState` y defaults de LFO.
- `WebUI/src/styles/mcx0x.css`: 100% token-driven, cero colores hardcodeados para `.mcx-card-lfo` y controles.
