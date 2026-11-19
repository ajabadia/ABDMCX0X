# ABDMCX0X

> **Structured Groove-Rompler de 4 Partials Estéreo y Controlador Hardware MIDI/NRPN/SysEx (`VST3` / `Standalone` / `WebAssembly`) — suite ABDSynths.**

[![Architecture](https://img.shields.io/badge/Arch-C++20%20%7C%20JUCE%209%20%7C%20WebView2-blue)](DOCS/BRIEF_9_DECISIONES.md)
[![Shared Core](https://img.shields.io/badge/Core-ABDShared%20DRY-green)](../ABDShared/README.md)

## Visión general

**ABDMCX0X** es una **Groovebox / Workstation modular de 16 partes con chasis multi-motor (`ISoundEngine` / `TrackModRouter`)** (propietaria y limpia, sin ROMs protegidas ni código GPL de terceros) construida sobre `ABDShared`:
1. **Chasis Polimórfico y Primer Motor `ABDShared::StructuredRompler` (4 Partials Estéreo + Drum Synth):**
   - Aloja ranuras polimórficas `IMcxSoundEngine` por pista con `TrackModRouter` no destructivo y un pool compartido (`RomplerVoicePool`) con presupuesto dinámico de parciales (`28`/`64`/`256`).
   - Estructuras paralelas, modulación en anillo, booster y vector 2D, 6 modelos de filtro intercambiables en serie (`VCF 1 -> VCF 2`, incl. `TC6116AF` y `Z-Plane Morph`), envolventes multietapa `5-Stage` con curvas LUT `IC7`, **Acento Dinámico Roland** (`velocity > 100`), DAC vintage (`HD`, `16-bit`, `12-bit`) y envíos FX A..D.
2. **Secuenciador PPQ Nativo C++20, MIDI Clock `0xF8` y Sincronización Host DAW:**
   - Reproducción autónoma `96 PPQ` en C++20 RT-safe (`McxPatternSequencer`, doble buffer lock-free, `GrooveShuffleEngine`, 4 carriles de *Motion* y ligadura *slide*) ejecutada por sub-bloques (`64` muestras), inmune al cierre de la ventana VST3.
   - Emisor `24 PPQ` sample-accurate (`0xFA` Start, `0xFB` Continue, `0xFC` Stop, `0xF8` Clock con `priority = 0`) + sincronización automática con `AudioPlayHead` del DAW.
   - Salida MIDI multipuerto y multi-contrato por pista (`McxMidiModDecimator` `35 Hz` CC / `18 Hz` NRPN con caché `CC99/CC98`).
3. **WebUI Modular (< 200 lín./archivo, 100 % Tokens CSS) como Espejo Pasivo del DSP:**
   - Consola de mezcla estructurada en bancos de 16 tiras con vúmetros duales Audio/MIDI, tira hardware de 16 pasos sin `setInterval`, `PianoRollModal` / Drum Grid, `GrooveShuffleModal`, teclado virtual con ruedas/escala y 16 temas Claro/Oscuro sobre `bg_neutral.webp` con diccionario ES/EN.
4. **Armario Rack FX Modular 19'' (8 Bahías) & Patchbay Inteligente:**
   - Chasis modular en hardware analógico de 19'' con auto-sleep dinámico a 0% CPU (< -80 dBFS), encadenamiento en serie entre bahías, sidechain ducking dual (seguidor de pico de audio + trigger rítmico MIDI), vúmetros duales IN/OUT con clip-hold, e inserción directa por canal de audio.
5. **Directorio de Trabajo (`AxionikDB`-compatible) y Contenedores `.abdbank`:**
   - Bank Manager especializado para partes rompler/multisample/drum kits con sub-librerías por subcarpetas y puente hardware bidireccional (`NRPN GS Drum` + `SysEx`).

## Documentación clave
- [`DOCS/PLAN_MAESTRO_ARQUITECTURA_Y_REFACTOR_CORE.md`](DOCS/PLAN_MAESTRO_ARQUITECTURA_Y_REFACTOR_CORE.md) — Plan Maestro y mapa técnico del Core Workstation / Multi-Motor.
- [`DOCS/PLAN_RACK_FX_ARMARIO_MODULAR.md`](DOCS/PLAN_RACK_FX_ARMARIO_MODULAR.md) — Arquitectura y especificación del Armario Rack FX Modular 19'' y Patchbay.
- [`DOCS/INTEGRACION_CARATULAS_Y_BANCOS.md`](DOCS/INTEGRACION_CARATULAS_Y_BANCOS.md) — Frontera Host vs. Plugin, jerarquía de carátulas `.abdbank` y metadatos de motor.
- [`DOCS/ANALISIS_Y_PLAN_PLUGINS_MIDI_Y_ARQUITECTURA_INSERCIONES.md`](DOCS/ANALISIS_Y_PLAN_PLUGINS_MIDI_Y_ARQUITECTURA_INSERCIONES.md) — Análisis de plugins MIDI e inserciones de canal.
- [`DOCS/AUDITORIA_CODIGO_Y_CHECKLIST_REFACTOR.md`](DOCS/AUDITORIA_CODIGO_Y_CHECKLIST_REFACTOR.md) — Auditoría de trampas ocultas, correcciones aplicadas y checklist técnico.
- [`DOCS/VISION_GROOVEBOX_16P.md`](DOCS/VISION_GROOVEBOX_16P.md) — Visión modular de 16+ partes libres, jerarquía 3 niveles, directorio `AxionikDB` y utilidades MIDI.
- [`DOCS/BRIEF_9_DECISIONES.md`](DOCS/BRIEF_9_DECISIONES.md) — Hipótesis, 9 decisiones cerradas y alcance v1.
- [`DOCS/INTEGRACION_PIANO_ROLL.md`](DOCS/INTEGRACION_PIANO_ROLL.md) & [`DOCS/INTEGRACION_TRANSPORTE.md`](DOCS/INTEGRACION_TRANSPORTE.md) — Conexión de `PianoRollModal`, `McxStepStrip` y transporte C++20/Host Sync.
- [`DOCS/INTEGRACION_FX_RACK_MODAL.md`](DOCS/INTEGRACION_FX_RACK_MODAL.md) — Arquitectura Rack FX polimórfico en 3 niveles y topologías 0..9.
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
