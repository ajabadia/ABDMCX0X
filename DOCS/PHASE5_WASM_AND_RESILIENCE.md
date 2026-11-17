# DOCS — Fase 5: Compilación WASM, Resiliencia DSP y QA Offline

> **Documento de Arquitectura y Especificación Técnica**  
> **Proyecto:** `ABDMCX0X`  
> **Estado:** Implementado y Verificado (7/7 suites pasadas en `McxPhase5Tests.cpp`, WASM compilado con éxito).

---

## 1. Compilación WebAssembly (`mcx0x_dsp`)

### 1.1 Filosofía Single-Source Anti-Drift
Tanto el motor nativo de escritorio (VST3/Standalone) como el módulo WebAssembly consumen exactamente la misma lista de fuentes DSP declarada en `DspSources.cmake`. No existe código duplicado ni divergente entre plataformas.

### 1.2 Configuración del Pipeline Emscripten
- **Herramienta:** Emscripten SDK (`em++`), Ninja y CMake con `Emscripten.cmake`.
- **Flags de Optimización:**
  - `-O3 -DNDEBUG -std=c++20`
  - `-s ALLOW_MEMORY_GROWTH=1 -s MAXIMUM_MEMORY=1073741824` (1 GB)
  - `-s MALLOC=emmalloc -s SINGLE_FILE=0`
  - Modos exportados: `cwrap`, `ccall`, funciones C exportadas en `WasmBridge.h`.
- **Salida:** `WebUI/src/wasm/mcx0x_dsp.js` (13.4 KB) y `WebUI/src/wasm/mcx0x_dsp.wasm` (139 KB).
- **Script de Automatización:** `wasm/build_wasm.bat` con detección automática de rutas SDK (`D:\desarrollos\emsdk`).

---

## 2. Pruebas de Resiliencia DSP (`McxPhase5Tests`)

Las 7 suites de pruebas verifican:
1. **Invarianza de Frecuencia de Muestreo:** Comportamiento idéntico y estable a 44.1 kHz, 48 kHz, 88.2 kHz, 96 kHz y 192 kHz.
2. **Invarianza de Tamaño de Buffer:** Funcionamiento impecable desde 32 muestras hasta 4096 muestras.
3. **Inmunidad contra NaN / Inf:** Saturación controlada y reseteo suave ante entradas corruptas o picos numéricos.
4. **Presupuesto y Robo de Voces Roland MC-303:** Limitación estricta a 28 parciales simultáneos con política *oldest-lowest velocity stealing*.
5. **Idempotencia de Serialización DAW:** Comprobación del ciclo guardar/cargar estado de parche sin mutación de parámetros.

---

## 3. Render Offline y Medición de Audio

Se implementó el ejecutable `Tests/McxAudioRenderDemo.cpp` que procesa 8.88 segundos de un patrón rítmico multitímbrico con las siguientes métricas certificadas:
- Pico máximo: **-0.75 dBFS** (espacio seguro antes del clipping digital).
- Muestras clipeadas: **0**.
- Bloqueo DC: filtro pasa-altos de 5 Hz activo para eliminar offsets sub-graves.
