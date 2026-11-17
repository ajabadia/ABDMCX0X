# ABDMCX0X

> **Structured Groove-Rompler de 4 Partials Estéreo y Controlador Hardware MIDI/NRPN/SysEx (`VST3` / `Standalone` / `WebAssembly`) — suite ABDSynths.**

[![Architecture](https://img.shields.io/badge/Arch-C++20%20%7C%20JUCE%209%20%7C%20WebView2-blue)](DOCS/BRIEF_9_DECISIONES.md)
[![Shared Core](https://img.shields.io/badge/Core-ABDShared%20DRY-green)](../ABDShared/README.md)

## Visión general

**ABDMCX0X** une en un solo instrumento propietario limpio (sin ROMs protegidas ni código GPL de terceros):
1. **Motor interno modular de hasta 4 Partials Estéreo** (`Spectral+DDSP` des-horneado vía `ABDNeuModMakr`, `PCM/SFZ`, `VA PolyBLEP`), topologías paralela / *RingMod* / *Booster* / **Vector 2D `(X,Y)`**, filtros intercambiables (`SVF`, `Roland TVF ZDF`, `MS-20 Acid`, `Ladder Drive`, `Z-Plane Morph`), envolventes `4T4L`, `ModMatrix` (*PatchCords*), etapas de salida intercambiables (`HD Studio`, `90s 16-bit`, `Vintage 12-bit`), Drum Rack de 128 teclas con *mute groups* y matriz FX de `ABDShared::DspEffects`.
2. **Groove Arpeggiator (`abd::synth::GrooveArpeggiator`)**: 12 motivos, 16 divisiones de reloj, swing bipolar invariante, `LatchReArm`, *strum*, acento y máscara/patrón programable de hasta 32 pasos.
3. **Hardware Mirror Controller (`INT | EXT | BOTH A/B`)**: emisión estricta de NRPN (`CC99 → CC98 → CC6`), NRPN por tecla de batería y SysEx `DT1` gobernados por contratos JSON (`boss_dr5.json`, `roland_mc303.json`, `roland_d2.json`, `roland_sc55.json`), gestionado con **`ABDBankManager`**.

## Documentación clave
- [`DOCS/BRIEF_9_DECISIONES.md`](DOCS/BRIEF_9_DECISIONES.md) — Hipótesis, 9 decisiones cerradas, convergencia de hardware y alcance blindado v1.
- [`DOCS/PHASE1_DSP_AND_DRUM_MAPS.md`](DOCS/PHASE1_DSP_AND_DRUM_MAPS.md) — Arquitectura detallada de Fase 1 (motor 4-Partial, filtros ROM `TC6116AF`/`Z-Plane`, envolventes `5-Stage`, Personas y Drum Maps multi-estándar).
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

### Build completo (Nativo JUCE 9 + WebView2 estático + Emscripten WASM + WebUI)
```powershell
.\build.bat
```

## Remoto
- Repositorio: `https://github.com/ajabadia/ABDMCX0X.git`
