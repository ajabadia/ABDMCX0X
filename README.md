# ABDMCX0X

> **Structured Groove-Rompler de 4 Partials Estéreo y Controlador Hardware MIDI/NRPN/SysEx (`VST3` / `Standalone` / `WebAssembly`) — suite ABDSynths.**

[![Architecture](https://img.shields.io/badge/Arch-C++20%20%7C%20JUCE%209%20%7C%20WebView2-blue)](DOCS/BRIEF_9_DECISIONES.md)
[![Shared Core](https://img.shields.io/badge/Core-ABDShared%20DRY-green)](../ABDShared/README.md)

## Visión general

**ABDMCX0X** es una **Groovebox / Workstation modular de 16 partes** (propietaria y limpia, sin ROMs protegidas ni código GPL de terceros) construida sobre `ABDShared`:
1. **16 Partes libres (`Chromatic` o `DrumMap`, Parte 10 Drum por defecto) y Multi-Motor extensible:** Rompler multicapa / Drum Kits (edición por sonido tipo MC-303+), motor `DwgsWavetable` (promovido desde `ABDMS2000`), y futuros motores VA / FM / Spectral, con **Doble Filtro en serie (`Filter 1 → Filter 2`)**, envolventes `4T4L`, **4 LFOs Globales + 2 LFOs Locales** (auto-skip 0 % CPU), Matriz de Modulación por parte con *Via-Attenuator*, **EQ Paramétrico + Drive por canal**, 4 envíos independientes (`Send A..D` Pre/Post-Fader) y **Rack FX Master multi-entrada** promovido a `ABDShared`.
2. **Secuenciador Piano-Roll Modal (PPQ), Transporte, Modo Canción y Utilidades MIDI:** edición estilo rollo de pianola / Drum Grid (`1, 2, 4, 8...` compases, preparado para futuras métricas), grabación en tiempo real con cuantización, *Parameter Locks*, *Accent Acid*, `GrooveArpeggiator`, Transposición Global por tono y escala/tonalidad (`ABDShared` + `@abdsynths/midi-keyb`), y flujo de directo inspirado en MPC/Groovebox (`16 Levels`, `Note Repeat`, `MPC Swing`, `Megamix`, `Escenas/Hotcues` y `Song Mode`).
3. **Directorio de Trabajo unificado (`AxionikDB`-compatible), Temas Light/Dark y Hardware vía `MIDI Learn`:** Bank Manager compartido (`Modelos`, `Presets de Parte`, `Presets Multi`, `Banks`), estilos clásicos (`MS2000`, `Axionik`, `MC-303`, `DR-5`) como temas visuales puros sobre `bg_neutral.webp`, y soporte final de hardware externo como **controlador de entrada** mediante perfiles completos de `ABDShared` `MIDI Learn`.

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
