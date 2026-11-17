# DOCS — Integración Hardware Aséptica y Taxonomía Semántica Universal (CDD v2.0)

> **Documento de Arquitectura y Especificación Técnica**  
> **Proyecto:** `ABDMCX0X`  
> **Estado:** Especificado e integrado en `@abdsynths/contracts` y `Source/Hardware/`.

---

## 1. Principio de Asepticidad Total

El puente hardware de `ABDMCX0X` y de todos los sintetizadores de la suite `ABDSynths` cumple una regla de diseño estricta:
> **Cero código C++ específico de fabricante o modelo.**

Ningún archivo C++ contiene condicionales `if (isRolandMc303)` o tablas de números de CC/NRPN cableadas a mano. Toda la información del hardware reside en contratos declarativos JSON ubicados en `ABDShared/Contracts/` (`roland_mc303.json`, `boss_dr5.json`, `roland_d2.json`, `roland_sc55.json`, etc.).

---

## 2. Taxonomía de Roles Semánticos (CDD v2.0)

Los controles hardware declaran un `semanticRole` canónico (especificado formalmente en `ABDShared/Contracts/UNIVERSAL_SEMANTIC_TAXONOMY.md` y tipado en `semanticRoles.ts`).

### Bloques Semánticos Clave:
1. **Voz & Afinación:** `VoicePolyMode`, `VoiceUnisonVoices`, `VoiceUnisonDetune`, `VoiceUnisonSpread`, `PortamentoGlideTime` (CC 5), `PortamentoSwitch` (CC 65), `PortamentoMode`, `PitchBendUpRange`, `PitchBendDownRange`.
2. **Osciladores & Parciales:** `OscWaveform`, `OscOctave`, `OscCoarseTune`, `OscFineTune`, `OscPulseWidth`, `OscPulseWidthMod`, `OscLevel`, `OscPan`, `OscHardSync`, `OscRingMod`, `OscFmCrossMod`, `NoiseLevel`, `SampleLoopMode`, `SampleStartOffset`, `SampleAltStart`, `SampleLoopTune`.
3. **Filtros:** `FilterType`, `FilterMode` (LPF 6/12/18/24, HPF 6/12/24, BPF 6/12/24, Notch, Comb, Peaking), `FilterCutoff` (CC 74 / GS NRPN 01 20), `FilterResonance` (CC 71 / GS NRPN 01 21), `FilterKeyTrack`, `FilterDrive`, `FilterEnvDepth`, `FilterLfoDepth`, `FilterMorph`, `FilterCombFeedback`.
4. **Envolventes Multietapa:** ADSR, DADSR, 5-Stage (`T1..T4`, `L0..L4`), Casio CZ 8-Step: `[Prefix]EnvDelay`, `[Prefix]EnvAttack` (CC 73), `[Prefix]EnvHold`, `[Prefix]EnvDecay` (CC 75), `[Prefix]EnvSustain`, `[Prefix]EnvRelease` (CC 72), `[Prefix]EnvStageNTime`, `[Prefix]EnvStageNLevel`, `[Prefix]EnvStageNCurve`, `[Prefix]EnvLoopMode`, `[Prefix]EnvInvert`.
5. **LFOs:** `[LfoN]Waveform`, `[LfoN]Rate` (CC 76), `[LfoN]TempoSync`, `[LfoN]Delay` (CC 78), `[LfoN]FadeIn`, `[LfoN]KeySync`, `[LfoN]PhaseOffset`, `[LfoN]Depth` (CC 77).
6. **Matriz de Modulación:** `ModSlotSource`, `ModSlotDestination`, `ModSlotAmount` (Bipolar), `ModSlotViaSource`, `ModSlotViaAmount`, `ModSlotCurve`.
7. **Controladores Físicos & Pedales:** `ModulationWheel` (CC 1), `BreathController` (CC 2), `FootExpressionPedal` (CC 11), `SustainPedal` (CC 64), `PortamentoSwitch` (CC 65), `SostenutoPedal` (CC 66), `SoftPedal` (CC 67), `ChannelAftertouch`, `PolyAftertouch`, `PitchBendWheel`, `VectorJoystickX` (CC 16), `VectorJoystickY` (CC 17).
8. **Efectos Master & Mezclador:** Reverb (CC 91), Delay (CC 94), Chorus (CC 93), Phaser (CC 95), Tremolo (CC 92), PartVolume (CC 7), PartPan (CC 10), DrumKeyPitch, DrumKeyLevel, DrumKeyPan, DrumKeyReverbSend.

---

## 3. Auto-Detección y Flujo Bidireccional con `HardwareMidiDetect`

1. **Inquiry de Identidad:** Cuando se conecta un cable o interfaz MIDI, `HardwareMidiDetect` envía el mensaje MIDI estándar Universal Identity Inquiry:
   ```
   F0 7E 7F 06 01 F7
   ```
2. **Respuesta de Identidad:** El hardware conectado responde con su Identity Reply (`F0 7E <device_id> 06 02 <manufacturer_id> <family_code> <model_number> ... F7`).
3. **Selección del Contrato JSON:** `HardwareMidiDetect` (o `abd::synth::HardwareProfileHydrator::resolveByIdentityReply` en modo Headless/WASM) busca el perfil coincidente en `ABDShared/Contracts/` soportando tanto Manufacturer ID de 1 byte (Roland `41`, Korg `42`, Casio `44`) como extendido MMA de 3 bytes (Behringer `00 20 32`), además de heurística por nombre de puerto MIDI.
4. **Hidratación Dinámica Zero-Deps (`ABDShared::SynthCore`):** `HardwareProfileHydrator` parsea los JSON con `MiniJsonParser.h` (RFC-8259 puro C++20 sin JUCE ni `nlohmann_json`), normaliza aliases legados, escala inteligentemente rangos UI `[0..1]` a wire MIDI `[0..127]` (conservando rangos exactos como `[14..114]` en Roland MC-303) y construye índices planos RT-safe (`roleHashIndex`, `ccLookup[128]`, `nrpnLookup`, `drumNrpnMsbLookup[128]`).
5. **Bidireccionalidad Activa:**
   - Si el usuario gira una perilla en el plugin o WebUI, `McxHardwareBridge::routeSemanticParam()` busca el `roleHash` en O(log N) sin alojar memoria y emite los CC/NRPN al hardware.
   - Si el usuario gira un dial en el hardware físico, `McxHardwareInbound` resuelve el CC o NRPN en O(1)/O(log N), actualiza el motor DSP interno y notifica vía `InboundSemanticCallback` a WebUI/APVTS/ModMatrix para cualquier rol semántico abierto de CDD v2.0.
