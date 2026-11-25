# ABDMCX0X

> **Workstation & Groovebox Multimotor de hasta 64 Partes, Chasis de Motores Polimórficos (`ISoundEngine`), Armario FX Modular de 19'' y Controlador Hardware MIDI/NRPN/SysEx (`VST3` / `Standalone` / `WebAssembly`) — suite ABDSynths.**

[![Architecture](https://img.shields.io/badge/Arch-C++20%20%7C%20JUCE%209%20%7C%20WebView2-blue)](DOCS/BRIEF_9_DECISIONES.md)
[![Shared Core](https://img.shields.io/badge/Core-ABDShared%20DRY-green)](../ABDShared/README.md)

## Visión general

**ABDMCX0X** es una **Workstation / Groovebox modular y multimotor de hasta 64 pistas** (sin código GPL de terceros ni ROMs protegidas) construida sobre `ABDShared`:

1. **Chasis Polimórfico Multi-Motor por Pista (`IMcxSoundEngine` / `ISoundEngine`):**
   - Aloja ranuras de motor intercambiables independientemente en cada una de las pistas (1..64):
     - **`ABDShared::StructuredRompler`:** Reproductor de muestras estructurado de 4 Partials estéreo + Drum Synth, con vector 2D, modulación en anillo, booster, 6 modelos de filtro en serie (`TC6116AF`, `Z-Plane Morph`), envolventes multietapa `5-Stage` con curvas LUT `IC7`, acento dinámico Roland (`velocity > 100`) y DACs vintage (`HD`, `16-bit`, `12-bit`).
     - **`ABDShared::EmaxSoundEngine` (`emax_synth`, ranura `7`):** Reproductor clean-room de E-mu Emax II centrado en la topología de menús del OS y la reproducción desde `.abdbank`: interpolación windowed-sinc de 8 tapas sobre acumulador 32.32, filtro H-Chip de 4 polos en Q2.14 y envolventes AHDSR. Sin keybed ni CC locales (responsabilidad del host).
     - **`Virtual Analog (VA)`:** Motor sustractivo analógico virtual (`va_subtractive`).
     - **`FM Operator`:** Motor de síntesis FM por modulación de frecuencia (`fm_operator`).
     - **`Acid 303`:** Emulación analógica de bajo ácido monofónico con acento y slide (`acid_303`).
     - **`External MIDI`:** Enrutamiento directo multipuerto y multicanal hacia sintetizadores y módulos hardware externos.

2. **Diferenciación Conceptual: Bancos de Pistas vs. Bancos de Sonido vs. Presets:**
   - **Bancos de Pistas (A..H):** Estructura de hardware estilo MPC / Roland TR-8S con 8 bancos de 8 pads/pistas (hasta 64 pistas en total) con fijación (*Pin*), reordenación por arrastre y mute/solo instantáneo.
   - **Bancos de Sonido PCM (`.abdbank`):** Pertenecen a los motores con `supportsBankArchives: true` (`structured_rompler`, `jv880_synth` y `emax_synth`) en la pista seleccionada. Se cargan e inspeccionan desde el panel/modal del instrumento (ej. *Roland D-50*, *Yamaha RM1x*, *Roland SC-55*, *TR-808*, *E-mu Emax II*), permitiendo elegir el instrumento base deseado sin contaminar el núcleo global de la groovebox.
   - **Presets de Pista (`.abdpart`):** La configuración completa del sonido procesado en la pista (instrumento base seleccionado + filtros, envolventes, modulación LFO, volumen, paneo y envíos de efectos).

3. **Gestión de Proyectos (`.mcxprj`) y Plantillas DAW:**
   - Menú `File` de la Navbar limpio y estándar: *New Project* (`Ctrl+N`), *Open Project* (`Ctrl+O`), *Save Project* (`Ctrl+S`), *Save Project As...* (`Ctrl+Shift+S`) y *Export MIDI / Audio WAV* (`Ctrl+E`).
   - Plantillas de inicio inspiradas en MPC / Logic Pro:
     - `Empty (Clean Slate)`: Una sola pista activa y vacía en Banco A-01, rack de efectos purgado a cero, sin loops ni notas pregrabadas.
     - `Factory Demo (MC-303)`: Las 16 partes clásicas de factoría con sus tonos y patrones de demostración completos.
     - `Basic 8-Track Starter`: 4 pistas rítmicas mapeadas en Ch 10 + Sub Bass, Chords, Lead y Pad.
     - `Electronic / Synthwave`: TR-Kick, TR-Snare, TR-OpenHat, Acid Bass, Rave Stab y Dark Pad con patrones rítmicos precargados.
     - `Live Performance 64P`: Las 64 partes activas enrutadas a MIDI externo en canales 1 a 16.

4. **Armario Rack FX Modular 19'' (8 Bahías) & Patchbay Inteligente:**
   - Chasis modular de efectos en serie/paralelo de 8 ranuras con auto-sleep dinámico a 0% CPU (< -80 dBFS), 4 buses de envío maestro (`Send 1..4`), sidechain ducking dual (seguidor de pico de audio + trigger rítmico MIDI) y vúmetros duales IN/OUT.

5. **Secuenciador PPQ Nativo C++20, Modo Canción y Escenas en Vivo:**
   - Reproducción autónoma `96 PPQ` en C++20 RT-safe (`McxPatternSequencer`, doble buffer lock-free, `GrooveShuffleEngine`, 4 carriles de *Motion* y ligadura *slide*) ejecutada por sub-bloques (`64` muestras), inmune al cierre de la ventana VST3.
   - Sistema de 8 Escenas en vivo con cuantización por compás y Modo Canción para encadenar bloques de arreglo.
   - Emisor `24 PPQ` sample-accurate (`0xFA` Start, `0xFB` Continue, `0xFC` Stop, `0xF8` Clock con `priority = 0`) + sincronización automática con `AudioPlayHead` del DAW.
   - Salida MIDI multipuerto y multi-contrato por pista (`McxMidiModDecimator` `35 Hz` CC / `18 Hz` NRPN con caché `CC99/CC98`).

6. **WebUI Modular (< 200 lín./archivo, 100 % Tokens CSS) como Espejo Pasivo del DSP:**
   - Consola de mezcla estructurada en el carril de bancos con vúmetros duales Audio/MIDI, tira hardware de pasos sin `setInterval`, `PianoRollModal` / Drum Grid, `GrooveShuffleModal`, teclado virtual con ruedas/escala y 16 temas Claro/Oscuro sobre `bg_neutral.webp` con diccionario bilingüe ES/EN.

## Documentación clave
- [`DOCS/GUIA_BANCOS_ROMPLER_Y_PRESETS.md`](DOCS/GUIA_BANCOS_ROMPLER_Y_PRESETS.md) — Modelo conceptual: Bancos de pistas (A..H) vs. Bancos de sonido PCM (`.abdbank`) vs. Instrumentos y Presets.
- [`DOCS/GUIA_INTEGRACION_MULTIMOTOR.md`](DOCS/GUIA_INTEGRACION_MULTIMOTOR.md) — Arquitectura y enlace multi-motor C++20 `ISoundEngine`.
- [`DOCS/PLAN_MAESTRO_ARQUITECTURA_Y_REFACTOR_CORE.md`](DOCS/PLAN_MAESTRO_ARQUITECTURA_Y_REFACTOR_CORE.md) — Plan Maestro y mapa técnico del Core Workstation / Multi-Motor.
- [`DOCS/PLAN_RACK_FX_ARMARIO_MODULAR.md`](DOCS/PLAN_RACK_FX_ARMARIO_MODULAR.md) — Arquitectura y especificación del Armario Rack FX Modular 19'' y Patchbay.
- [`DOCS/INTEGRACION_CARATULAS_Y_BANCOS.md`](DOCS/INTEGRACION_CARATULAS_Y_BANCOS.md) — Frontera Host vs. Plugin, jerarquía de carátulas `.abdbank` y metadatos de motor.
- [`DOCS/EMAX_II_INTEGRACION.md`](DOCS/EMAX_II_INTEGRACION.md) — Motor `emax_synth`, menús del OS, contenedor `.abdbank` e ingesta `emax2_disk`.
- [`DOCS/EMAX_II_DSP_MODEL.md`](DOCS/EMAX_II_DSP_MODEL.md) — Modelo DSP clean-room G-Chip/H-Chip, hallazgos del OS y límites de fidelidad.
- [`DOCS/ANALISIS_Y_PLAN_PLUGINS_MIDI_Y_ARQUITECTURA_INSERCIONES.md`](DOCS/ANALISIS_Y_PLAN_PLUGINS_MIDI_Y_ARQUITECTURA_INSERCIONES.md) — Análisis de plugins MIDI e inserciones de canal.
- [`ROADMAP.md`](ROADMAP.md) — Fases de desarrollo, Definition of Done y estado vivo.
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
