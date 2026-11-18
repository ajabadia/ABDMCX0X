# ABDMCX0X

> **Structured Groove-Rompler de 4 Partials Estéreo y Controlador Hardware MIDI/NRPN/SysEx (`VST3` / `Standalone` / `WebAssembly`) — suite ABDSynths.**

[![Architecture](https://img.shields.io/badge/Arch-C++20%20%7C%20JUCE%209%20%7C%20WebView2-blue)](DOCS/BRIEF_9_DECISIONES.md)
[![Shared Core](https://img.shields.io/badge/Core-ABDShared%20DRY-green)](../ABDShared/README.md)

## Visión general

**ABDMCX0X** es una **Groovebox / Workstation modular de 16 partes** (propietaria y limpia, sin ROMs protegidas ni código GPL de terceros) construida sobre `ABDShared`:
1. **Consola Mezclador 16 Canales, Tira Hardware de 16 Pasos y Espacio Scrollable:**
   - **Consola Horizontal con 16 Tiras Verticales:** P01..P16 independientes con selector cromático/batería (`DRM`/`CHR`), botón de preset con icono de categoría coloreado, canal MIDI receptor (`CH1`..`CH16`), conmutador `TR` para seguir transposición global, botones `Mute` y `Solo`, mini-slider dedicado de **Glide / Portamento** (`GLD` 0..500 ms conforme a GM2/GS CC 5 y CC 65) y fader de nivel de volumen con porcentaje.
   - **Tira de 16 Pasos de Hardware (`@abdsynths/shared`):** componente canónico reutilizable con 5 modos en vivo (`PART SEL`, `PART MUTE`, `STEP MUTE`, `ACCENT` por velocidad y `SLIDE / GLIDE` legato estilo TB-303) con animación de chaser en tiempo real.
   - **Área Central Scrollable:** Morph Vectorial 2D alojado a la izquierda; consola mezcladora en la parte superior y deck contextual de sonido (Tono/Macros/FX vs Drum Rack de 16 pads) en la parte inferior, desplazable con fluidez en pantallas de cualquier tamaño.
2. **Motor DSP 4-Partial Estéreo, Drum Synth y Acento Roland:**
   - Estructuras paralelas, modulación en anillo, booster y vector 2D, 6 modelos de filtro intercambiables (incl. `TC6116AF` 20-bit SVF y `Z-Plane Morph`), envolventes multietapa `5-Stage` con curvas LUT `IC7` y **Acento Dinámico Roland** (`velocity > 100` activando apertura VCF, golpe VCA y mordida de decay).
   - Polifonía dinámica 0 % CPU en reposo, emulación de DAC vintage (`HD`, `16-bit`, `12-bit`), y efectos master Chorus/Delay/ZitaReverb.
3. **Secuenciador Piano-Roll Modal (PPQ), Transporte, Modo Canción y Utilidades MIDI (En Roadmap):**
   - Edición estilo rollo de pianola / Drum Grid (`1, 2, 4, 8...` compases), grabación en tiempo real con cuantización, *Parameter Locks*, `GrooveArpeggiator`, Transposición Global interactiva en teclado (MC-303), y utilidades de directo (`16 Levels`, `Note Repeat`, `MPC Swing`, `Megamix`, `Escenas/Hotcues` y `Song Mode`).
4. **Directorio de Trabajo unificado (`AxionikDB`-compatible), Temas Light/Dark y Hardware vía `MIDI Learn`:**
   - Bank Manager deslizante especializado para partes rompler/sampler de ABDMCX0X con sub-librerías por subcarpetas, 16 temas visuales completos Claro/Oscuro sobre `bg_neutral.webp` con 100 % de tokens CSS y cero colores hardcodeados, soporte multilenguaje ES/EN y puente hardware universal (NRPN GS Drum + SysEx).

## Documentación clave
- [`DOCS/VISION_GROOVEBOX_16P.md`](DOCS/VISION_GROOVEBOX_16P.md) — **Visión v2 en curso:** Groovebox modular de 16 partes libres (`Chromatic`/`DrumMap`), jerarquía 3 niveles, directorio de trabajo compatible con `AxionikDB`, motor DWGS, Rack FX multi-entrada y utilidades MIDI.
- [`DOCS/BRIEF_9_DECISIONES.md`](DOCS/BRIEF_9_DECISIONES.md) — Hipótesis, 9 decisiones cerradas, convergencia de hardware y alcance blindado v1.
- [`DOCS/PHASE1_DSP_AND_DRUM_MAPS.md`](DOCS/PHASE1_DSP_AND_DRUM_MAPS.md) — Arquitectura detallada de Fase 1 (motor 4-Partial, filtros ROM `TC6116AF`/`Z-Plane`, envolventes `5-Stage`, Personas y Drum Maps multi-estándar).
- [`DOCS/PHASE2_HARDWARE_AND_BANK_MANAGER.md`](DOCS/PHASE2_HARDWARE_AND_BANK_MANAGER.md) — Puente hardware bidireccional A/B en vivo, cola SPSC, compensación de latencia y persistencia.
- [`DOCS/PHASE4_BANK_CONTAINER.md`](DOCS/PHASE4_BANK_CONTAINER.md) — Formato propietario `.abdbank`, descompresión PCM, drum kits, choking hi-hat y política dual DAW.
- [`DOCS/PHASE5_WASM_AND_RESILIENCE.md`](DOCS/PHASE5_WASM_AND_RESILIENCE.md) — Compilación WebAssembly (`mcx0x_dsp`), resiliencia 44.1k..192k, buffers 32..4096 y medición offline.
- [`DOCS/HARDWARE_INTEGRATION_AND_SEMANTICS.md`](DOCS/HARDWARE_INTEGRATION_AND_SEMANTICS.md) — Taxonomía semántica universal CDD v2.0, auto-detección con `HardwareMidiDetect` e integración aséptica.
- [`ROADMAP.md`](ROADMAP.md) — Fases de desarrollo, Definition of Done y estado vivo.
- [`HANDOFF.md`](HANDOFF.md) — Contexto técnico, inventario de herramientas, rutas compartidas y notas para retomar.
- [`CHANGELOG.md`](CHANGELOG.md) — Historial semántico de versiones.

## Compilación rápida

### Tests Headless C++20 (sin requerir compilación JUCE)
```powershell
cmake -S . -B build_headless -DMCX_HEADLESS_ONLY=ON
cmake --build build_headless --config Release
ctest --test-dir build_headless -C Release --output-on-failure
```

### Build completo (Nativo Headless + CTest + Emscripten WASM; añadir `full` para JUCE VST3/Standalone)
```powershell
.\build.bat
.\build.bat full
```

### Arranque rápido WebUI + WASM (Vite puerto `5330`)
```powershell
.\start.bat
```

## Remoto
- Repositorio: `https://github.com/ajabadia/ABDMCX0X.git`
