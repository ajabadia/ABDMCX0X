# Fase 1 — Motor DSP Modular (`McxVoice`), Modelos ROM `IC7`/`TC6116AF`, Polifonía Dinámica y Drum Maps Multi-Estándar

> **Estado:** En desarrollo activo (Fase 1) · **Regla de Oro:** 100 % C++20 libre de JUCE en `Source/DSP/` (`DspSources.cmake` compartido Nativo + WASM), `< 300` líneas por archivo, cero alojamientos heap en audio.

---

## 1. Perfiles de Drum Map Multi-Estándar + Remapeador (`ABDShared/Contracts` + `ABDNeuModMakr` + `ABDMCX0X`)

El editor de kits de `ABDNeuModMakr` ya no está bloqueado al rango General MIDI (`35..81`). Ahora comparte una única fuente de verdad en `ABDShared/Contracts`:

- **Contratos y código compartido:**
  - [`drum_map_profile.schema.json`](../../ABDShared/Contracts/drum_map_profile.schema.json) & [`drum_map_profiles.json`](../../ABDShared/Contracts/drum_map_profiles.json)
  - [`abdDrumMapProfiles.ts`](../../ABDShared/Contracts/abdDrumMapProfiles.ts) (`DRUM_MAP_MODES`, `getDrumMapProfile`, `getDrumSlotName`, `resolveRemappedDrumNote`)
  - Wrapper retrocompatible en [`ABDNeuModMakr/src/core/gmDrumMap.ts`](../../ABDNeuModMakr/src/core/gmDrumMap.ts) y presets en [`drumMapParser.ts`](../../ABDNeuModMakr/src/core/autoSampler/drumMapParser.ts).
- **Los 6 modos soportados (`McxDrumMapMode`):**
  1. `GmStandard` (`35..81`): General MIDI Level 1 clásico (47 golpes).
  2. `RolandGsMc` (`11..118` + `126..127`): Roland GS / MC-303 / MC-505 / D-2 / SC-55 (110 teclas activas por kit extraídas de la estructura `0x68080` + `.ins`).
  3. `YamahaXgXs` (`13..100`): Yamaha XG / Motif XS / **Yamaha CS2x**.
  4. `KorgAi2N5` (`24..85`): **Korg N5 / X5D / AI2**.
  5. `HardwareNative`: Perfiles propios de máquina (*Boss DR-5*, *Quasimidi 309*, *E-mu Orbit/Carnival*, *Akai MPC*, *Elektron*).
  6. `ProprietaryCustom` (`0..127`): Mapa libre de 128 ranuras con categoría semántica, hasta 31 grupos de corte (`muteGroup`), disparo por tecla (`OneShot` vs `Gated`) y traductor bidireccional **`McxDrumNoteRemapper`** (`inputToSlot` para adaptar patrones DAW GM a cualquier layout, y `slotToExternal` para reflejar hacia el hardware físico).

---

## 2. Tablas ROM y Comportamientos Hardware Verificados (`McxRomTables.h`)

A partir del análisis del firmware `IC7` v1.03 (`analysis/extracted/sram_luts.json`, `disasm_prog.txt` y topología `TC6116AF`), hemos extraído e implementado en compilación (`constexpr`, cero ROM propietaria incrustada):

- `kEnvRate2935[128]` (`A1:2935`): Curva exponencial de tiempos de envolvente (`T0..T4`).
- `kLogAtten2D4D[128]` (`A1:2D4D`): Curva de atenuación logarítmica para niveles `TVA`/`Sample`.
- `kPanCurve2CCC[129]` (`A1:2CCC`): Curva de panorámica de potencia constante `L/R`.
- `kTvfKfDepth2ECD[21]`, `kTvfVelSens2EF7[11]` y `kTvfEnvDepth2F0D[24]`: Escalado de Keyfollow, Velocidad/Acento y Profundidad de Envolvente del `TVF`.
- **Envolvente de 5 etapas (`McxEnvelope5Stage`):** Soporta `Delay T0`, `L0 -> L1 (T1)`, `L1 -> L2 (T2)`, `L2 -> L3 (T3)`, `Sustain L3` y `Release -> L4 (T4)`, con impulso dinámico por **Velocidad + Acento**.

---

## 3. Modos de Máquina (`McxMachinePersona`) vs Modo Libre (`FreeSuper`) y Polifonía Dinámica

Definidos en `Source/DSP/Core/McxTypes.h` (`getMachinePersonaSpec`) y declarados en `abdmcx0x_parameter_spec.json` (`CDD v2.0`):

| Persona / Modo | Partials / Tono | Filtro por defecto | Presupuesto / Polifonía | DAC | Drum Map por defecto |
| :--- | :---: | :--- | :---: | :--- | :--- |
| **`FreeSuper` (Modo Libre)** | **4** | Cualquiera (def. `RolandTc6116Tvf`) | **64 voces / 256 Partials** | Cualquiera | `ProprietaryCustom` |
| `RolandMc303` | 2 | `RolandTc6116Tvf` | **28 Partials** (robo auténtico) | `Rompler16Bit` | `RolandGsMc` |
| `RolandMc505` | 4 | `RolandTvfZdf` | 64 Partials | `Rompler16Bit` | `RolandGsMc` |
| `YamahaCs2x` | 2 | `SvfClean` | 64 voces / 64 Partials | `HdStudio` | `YamahaXgXs` |
| `KorgN5` | 2 | `SvfClean` | 32 voces / 64 Partials | `Rompler16Bit` | `KorgAi2N5` |
| `EmuOrbit` | 2 | `ZPlaneMorph` | 32 voces / 32 Partials | `Rompler16Bit` | `HardwareNative` |
| `Quasimidi309` | 2 | `Ms20Acid` | 32 voces / 32 Partials | `Rompler16Bit` | `HardwareNative` |

**Polifonía Dinámica Zero-Idle CPU:** El pool de 64 voces se preasigna en construcción (`0` *allocations* en runtime). Cualquier voz en estado `Idle` o cualquier Partial deshabilitado se salta de inmediato sin consumir ciclos de CPU. En modos con presupuesto de Partials activo (`RolandMc303` = 28), si una nueva nota excede el presupuesto, el algoritmo roba progresivamente las voces más antiguas en `Release` / menor amplitud respetando la unidad de cada nota.

---

## 4. Banco de Filtros Modulares (`McxFilterBank`)

Ubicación: [`Source/DSP/Synth/McxFilterBank.h`](../Source/DSP/Synth/McxFilterBank.h) y [`McxFilterBank.cpp`](../Source/DSP/Synth/McxFilterBank.cpp).  
Cada Partial puede conmutar en tiempo real entre **6 caracteres de filtro** sin asignaciones de memoria:

1. `SvfClean`: SVF Zavalishin TPT (`abd::dsp::FilterTpt` de `ABDShared::DspCore`), modos LP/HP/BP.
2. `RolandTvfZdf`: Filtro OTA TPT/ZDF (`abd::dsp::JunoVCF_ZDF` de `ABDShared::DspCore`).
3. `Ms20Acid`: Filtro Sallen-Key K35 (`abd::dsp::KorgMS20VCF` de `ABDShared::DspCore`) con saturación de diodos.
4. `LadderDrive`: Escalera de transistores de 4 polos (`abd::dsp::MoogLadderVCF` de `ABDShared::DspCore`).
5. `ZPlaneMorph`: Par resonante dual TPT interpolado por el parámetro `zplaneMorph` (`0..1`), inspirado en E-mu Orbit/Carnival.
6. **`RolandTc6116Tvf`:** Modelo *clean-room* del filtro digital Chamberlin SVF de 2 polos con acumuladores saturados a 20 bits (`saturate20Bit`, equivalente a `addclip20`) inspirado en la topología `TC6116AF` de la MC-303/SC-55.

---

## 5. Excitador Híbrido por Partial (`McxPartialExciter`)

Ubicación: [`Source/DSP/Synth/McxPartialExciter.h`](../Source/DSP/Synth/McxPartialExciter.h) y [`McxPartialExciter.cpp`](../Source/DSP/Synth/McxPartialExciter.cpp).

- **Modo VA (`McxOscSourceKind::VaOsc`):** Reutiliza `abd::synth::OscPolyBlep` (`ABDShared::SynthCore`) para ondas `Saw`, `Pulse/Square` (con PWM), `Triangle`, `Sine`, `SuperSaw` de 3 osciladores desintonizados en estéreo y `Noise` (`DSPUtils::randomBipolar`).
- **Modo Ciclos / Wavetable / PCM / FM (`SpectralDdsp`, `PcmZone`, `Fm2Op`, `AxionikSurface`):** Reproducción con interpolación lineal en coma flotante, soporte de bucle hacia adelante (`Forward`) o bidireccional (`PingPong`, replicando el bit `b6` de `E03E`), disparo único (`OneShot`), salto inicial alternativo (`altStartOffset`) y conmutación automática de `fineCents` a `loopTuneCents` tras el primer paso de ciclo (`GPINT` → `0xF8064C`).

---

## 6. Voz Estructurada de 4 Partials (`McxVoice`), FX + DAC (`McxOutputAndFx`) y Orquestador (`McxEngine`)

- **`McxVoice` ([`McxVoice.h`](../Source/DSP/Synth/McxVoice.h) / [`McxVoice.cpp`](../Source/DSP/Synth/McxVoice.cpp)):**
  - Une excitador, filtro modular y 3 envolventes `5-Stage` (`Pitch`, `TVF`, `TVA`) por cada uno de los hasta **4 Partials**.
  - **4 Estructuras entre Partials (`McxStructureMode`):**
    - `Parallel`: suma paralela independiente por Partial con panorámica `kPanCurve2CCC`.
    - `RingMod12`: multiplicación en anillo `P1 × P2` antes del filtrado de pareja + `P3`/`P4` en paralelo.
    - `Booster12`: saturación `tanh(P2 + P1 * 2.4)` empujando la etapa del filtro + `P3`/`P4`.
    - `Vector2D`: mezcla bilineal continua en eje `(X, Y)` de `-1..+1` sobre los 4 Partials.
  - **Drum Key Synth:** evaluación a `coarseKey`, sobreescritura de `cutoffHzOverride`, `resonanceOverride`, `decayMs`, soporte estricto `OneShot` vs `Gated` y corte instantáneo `forceChoke()` por `muteGroup` (`1..31`).
- **`McxOutputAndFx` ([`McxOutputAndFx.h`](../Source/DSP/FX/McxOutputAndFx.h) / [`McxOutputAndFx.cpp`](../Source/DSP/FX/McxOutputAndFx.cpp)):**
  - Integra `abd::dsp::DspStereoChorus`, `abd::dsp::DspStereoDelay` (sincronizable a BPM) y `abd::dsp::DspZitaReverb` desde `ABDShared::DspEffects`.
  - Tres caracteres DAC seleccionables en caliente: `HdStudio`, `Rompler16Bit` y `Sampler12Bit`.
- **`McxEngine` ([`McxEngine.h`](../Source/DSP/Core/McxEngine.h) / [`McxEngine.cpp`](../Source/DSP/Core/McxEngine.cpp)):**
  - Pool prealojado una única vez en construcción (`std::vector` con `resize` fijo de `64` voces y `16` partes, evitando desbordar la pila de Windows al instanciar `McxEngine` por valor o stack y garantizando `0` asignaciones en runtime/`processAudio`), tabla armónica compartida por proceso en `McxPartialExciter`, polifonía dinámica (`setMaxPolyphony`), presupuesto de Partials (`setPartialBudget`) con robo por estado `Release -> Nivel -> Antigüedad`, `McxDrumNoteRemapper` por Parte y salto de coste nulo (`0 % CPU`) para voces inactivas y colas FX en reposo.

---

## 7. Batería de Pruebas de Fase 1 y Comandos de Verificación

Los tests unitarios de Fase 1 viven en [`Tests/McxPhase1Tests.cpp`](../Tests/McxPhase1Tests.cpp) y están registrados en [`CMakeLists.txt`](../CMakeLists.txt) junto con [`DspSources.cmake`](../DspSources.cmake). Cubren las 4 estructuras entre Partials, los 6 filtros, envolventes `5-Stage` + `Accent`, modos de bucle/one-shot, robo de voces de 28 Partials en `RolandMc303`, los 7 *Machine Personas*, `DrumNoteRemapper` bidireccional, disparo `OneShot`/`Gated`, `muteGroup` y etapa DAC + Master FX.

### Comandos para compilar y validar (ejecución manual)

```powershell
# 1. Contratos y TypeScript (ABDShared + ABDNeuModMakr)
npx --prefix "D:\desarrollos\ABDSynths\ABDShared" vitest run --root "D:\desarrollos\ABDSynths\ABDShared" Contracts/Contracts.test.js
npm --prefix "D:\desarrollos\ABDSynths\ABDNeuModMakr" run test:types

# 2. Configurar, compilar y pasar tests headless de ABDMCX0X
cmake -B "D:\desarrollos\ABDSynths\ABDMCX0X\build_headless" -S "D:\desarrollos\ABDSynths\ABDMCX0X" -DMCX_HEADLESS_ONLY=ON
cmake --build "D:\desarrollos\ABDSynths\ABDMCX0X\build_headless" --config Release
ctest --test-dir "D:\desarrollos\ABDSynths\ABDMCX0X\build_headless" -C Release --output-on-failure
```


