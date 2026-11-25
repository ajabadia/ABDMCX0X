# Reproductor E-mu Emax II (`emax_synth`) — integración en ABDMCX0X

> **Estado:** Integración completa y verificada (`37/37` controles expuestos, contratos asépticos y filtro promovido a `DspCore`).
> La edición destructiva de muestras y grabación directa siguen quedando fuera del reproductor clean-room.
> Implementación **clean-room**: sin ROMs, microcódigo VLSI, tablas de la ROM ni código de ConvertWithMoss en el repositorio.

## 1. Contrato del motor y modularización (`< 300` lín.)

| Campo | Valor |
| :--- | :--- |
| `typeId` | `emax_synth` |
| Ranura en `McxEngineRegistry` | `7` |
| Descriptor | `supportsBankArchives: true`, `supportsDrumMode: false`, `supportsChromaticMode: true` |
| Instancias recomendadas | 16 (una por parte, igual que `structured_rompler`) |
| Banco de muestras | `WavePool` compartido del registro; `attachWavePool()` y `releaseActiveWaves()` en el destructor |
| Capa aséptica y contratos | `ABDShared/Contracts/emu_emax2_parameter_spec.json` (`37` params) + `emu_emax2.json` (`37` controles) + alias físicos host (`cutoffHz`, `p1.amp.t1Ms..t4Ms`, `p1.fine`) |
| Filtro compartido `DspCore` | [`EmaxHChipFilter`](../../ABDShared/Code/DspCore/DspEmaxHChipFilter.h) (`IsFilterStage<T>`) |
| Implementación C++ (`< 300` lín./archivo) | `EmaxSoundEngine.h`, `EmaxWaveSincReader.h`, `EmaxSoundEngine.cpp`, `EmaxSoundEngineParams.cpp`, `EmaxSoundEngineRender.cpp` |

El registro C++ y el catálogo de respaldo WebUI (`McxEngineCatalogDefaults.ts`) deben mantener el
mismo índice y las mismas capacidades; `McxPhase8MultiEngineTests.cpp` verifica el registro multi-motor.

## 2. Carátula canónica e inspector del OS (fuente única de verdad)

La SSOT WebUI vive en [`ABDShared/Components/SynthEngines/Emax/`](../../ABDShared/Components/SynthEngines/Emax/):

| Archivo | Responsabilidad |
| :--- | :--- |
| `emaxParamSpecs.js` | **37 parámetros** y 11 páginas del OS, roles semánticos, CC/NRPN, dominio físico y helpers (`emaxWireToNorm`, `emaxNormToWire`, `emaxNormToPhysicalDomain`) |
| `emaxSynthStageView.js` | Superficie principal de síntesis con `Knob`, `Segmented`, `Toggle` y `RomplerWavePicker` |
| `emaxMenuView.js` | Inspector completo de páginas del OS (`00..22`) y navegación por índice |
| `EmaxEnginePanel.js` | `registerEngineMetadata` (carátula oficial `models/emu-emax2.webp`) + `registerEnginePanel`; compone `EngineHeaderBar` y `EnginePresetBrowser` |
| `emax-panel.css` | Estilos 100 % tokens CSS (`--color-*`, aislamiento `[hidden]`) |

Páginas expuestas: `00 Change Voice`, `13 Filter Setup`, `14 Filter AHDSR`, `15 LFO Setup`,
`16 LFO to`, `17 Velocity to A`, `18 Velocity to B`, `19 Panning`, `20 Chorus`, `21 Kybd Mode` y
`22 ControlEnable`. El rótulo `A: A H D S R` del OS se presenta dentro de `00 Change Voice`
porque el recorte WebUI no publica la página `11 Voice` como entrada independiente.

`EmaxEnginePanel` reutiliza `EngineHeaderBar` + `EnginePresetBrowser`: no duplica teclado, ni
selector de banco global, ni controles CC locales. El motor no es un `StructuredRompler` con otra piel;
tiene su propio `ISoundEngine` y su propio sub-árbol de estado.

## 3. Del disco Emax al `.abdbank`

```text
Disco/imagen Emax II (.EM1/.EM2/.EB2/.EZ2/.IMG/.HFE)
        │  ABDNeuModMakr · emax2_disk (detección fail-closed)
        ▼
Zonas (88 teclas, voz primaria/secundaria, root key, detune, loops)
        │  PCM16 LE → WAV byte a byte → importSfzText
        ▼
.abdbank (ZIP_STORED: manifest.json + tones[] + wavePool[])
        │  Motor emax_synth · EnginePresetBrowser · WavePool compartido
        ▼
Render cromático en la pista
```

- El contrato completo del importador está en
  [`ABDNeuModMakr/DOCS/EMAX2_INTAKE.md`](../../ABDNeuModMakr/DOCS/EMAX2_INTAKE.md): API `detect()`,
  `listZones()` y `describe()`, validación de cabeceras y límites de formato.
- `.EMX` es un **OS**, no un banco musical: se rechaza salvo que contenga una cabecera de banco válida.
- `Stereo Chorus / Double`: `noteOn()` asigna una **segunda voz real** (2 de 16) con detune
  `+5..25 cents`, paneo opuesto y modulación LFO lenta en `renderBlock()`; ya no hay línea de
  retardo estilo BBD. `getActiveVoiceCount()` refleja la voz extra.
- `McxMultiBankManager::loadToneToPart()` y `assignWaveToPart()` entregan los handles del
  `WavePool` al motor Emax sin reconvertir la parte a Rompler cuando el destino ya es `emax_synth`.
- El campo `0x0C8` de la cabecera es un puntero CPU: el detector lo normaliza con
  `heap = word(0x0C8) - CPU_BASE (0x8000)`. Sin esa corrección se rechazaba un `.EZ2` real.
- Las muestras Emax originales de 8 bits compandidas (AM6072) se detectan, pero no se extraen
  bit a bit aquí; el módulo solo construye el comando de conversión externa y **nunca lo ejecuta**.
- La conversión EXB previa validó `847` `.ebl` → `847` WAV en `HipHopProducer_full.abdbank`
  (`840` ondas / `210` tonos, `errors: []`). El banco no se versiona en el repositorio.

## 4. Modelo DSP y límites de fidelidad

Resumen; el detalle y la justificación de cuantización están en
[`EMAX_II_DSP_MODEL.md`](EMAX_II_DSP_MODEL.md):

- **G-Chip:** acumulador de fase 32.32, 256 sub-fases, interpolación windowed-sinc (Blackman) de
  8 tapas generada en arranque, truncado a PCM16 antes del filtro.
- **H-Chip:** dos biquads Q2.14 en cascada, saturación `sat16()` entre secciones, slew de
  coeficientes `>> 6`, LUT coseno logarítmica propia de 512 entradas y stagger de ±36 índices.
- **Cuantización:** Q1.15 para la **entrada** `cos(theta)` (lectura dividida por `32767`) y Q2.14
  para `b0/b1/b2/a1/a2`, porque `a1 = -2R·cos(theta)` necesita rango ±2. La segunda pasada de
  Ghidra no encontró xrefs a las tablas candidatas ni un escritor de 8 coeficientes; por eso no se
  adoptó Q1.15 para los coeficientes ni la LUT de 36 entradas del OS.
- **Envolventes:** ley temporal `T(v) ≈ 0.0015·e^(0.0745v)` s, ataque lineal, *hold* en ticks y
  decay/release de un polo RC.
- Sin microcódigo ni renders de hardware no se puede prometer exactitud bit a bit; el TDM nativo a
  39.0625 kHz con upsampling explícito del host sigue pendiente.

## 5. Validación

| Suite | Resultado |
| :--- | :--- |
| `ABDShared_EmaxEngine_Tests` | 8/8 |
| `McxPhase8MultiEngineTests` | 11/11 |
| CTest completo de `ABDMCX0X` | 14/14 |
| `ABDShared/tests/emaxEnginePanel.test.js` (Vitest) | 3/3 |
| `ABDNeuModMakr` · `npm run verify` | 111/111 suites |
| Detector `emax2_disk` con `.EZ2` real (copia temporal, no versionada) | 1 imagen de `100,528,128` B con banco en `0x13F000`: `11` presets, `6` samples, `70` zonas |

Comandos habituales:

```powershell
# Desde ABDMCX0X (nativo headless)
cmake --build build_headless --config Release
ctest --test-dir build_headless -C Release --output-on-failure

# Desde ABDMCX0X: Vitest del host; desde ABDShared: panel de Emax (3/3)
npm test
cd ../ABDShared; npm test

# Desde ABDShared: verificación completa del importador (111/111)
cd ../ABDNeuModMakr; npm run verify
```

## 6. Trabajo pendiente

- Validar **más** bancos musicales reales `.EB2/.EM2/.EZ2` con voz primaria/secundaria y 88 zonas.
  Ya se validó un `.EZ2` real (11 presets / 6 samples / 70 zonas, root keys y loops coherentes),
  pero los tests automatizados siguen usando fixtures sintéticos y faltan muestras `.EM2/.EB2`.
- Ajustar curvas de cutoff/Q/velocity/AHDSR con renders de un Emax II físico.
- Compilar binarios finales C++/WASM tras las actualizaciones de la capa aséptica (`EmaxSoundEngineParams.cpp`, `McxParamRouter.h`, `McxHardwareInbound.cpp`).

> **Completado (`2026-11-25`):** Exposición completa `37/37` con controles canónicos `Knob`/`Segmented`/`Toggle`/`RomplerWavePicker`, promoción de `DspEmaxHChipFilter.h` a `ABDShared::DspCore`, carátula oficial `models/emu-emax2.webp` ([`INTEGRACION_CARATULAS_Y_BANCOS.md`](INTEGRACION_CARATULAS_Y_BANCOS.md)) y contratos asépticos CC/NRPN (`emu_emax2_parameter_spec.json` + `emu_emax2.json`).

## 7. Fuentes legítimas de bancos (el usuario descarga)

Formatos nativos que ejercitan `emax2_disk`:

- [NONAudio — Emax II sampling libraries](https://nonaudio.wordpress.com/emulatorarchive/emax-ii/emax-ii-sampling-librarys/):
  imágenes `EmaxII-01/02/03.ez2` en Google Drive (IDs `0B0OyTSIhZUU2TS00c0VZRE5NeUk`,
  `0B0OyTSIhZUU2b0NTdk5tRWVPQWc`, `0B0OyTSIhZUU2UGNvcEZaZXJLN2M`). La `01` se validó aquí.
- [DVO7 — E-mu Emax 2 libraries](https://app.dvo7.com/store/sample-libraries?instrument=emu-emax-2):
  entradas `.EM2`/`.EM1` como `TR808_EM2` o `035-ZD736-ElectricBass_em1`.
- [Angelspit — Emax II downloads](https://angelspit.net/emax/emax2_downloads.html):
  colección de imágenes de disquete/banco compartida por usuarios.
- [EMXP — formatos soportados](https://www.emxp.net/features.htm): referencia de `.EM1/.EM2/.EB2/.EZ2/.IMG/.HFE`
  y exportación WAV/loop; herramienta externa, no se ejecuta desde el repo.

Solo como contenido de respaldo (no valida el detector nativo):

- [Archive.org — EMAX2 SF2](https://archive.org/details/emax-2-sf-2) / [ZIP](https://archive.org/download/emax-2-sf-2/EMAX2SF2.zip).
- [Archive.org — E-MU Emax EXB/EBL](https://archive.org/download/e-mu-sample-sets/E-MU%20Emax.zip).

Se evitan colecciones de ROM/EPROM (p. ej. `emu_emax-2.zip`): quedan fuera del límite clean-room.
Ningún binario E-mu se versiona en los repos; la validación se hizo con una copia temporal.
