# HANDOFF — ABDMCX0X

> **Última actualización:** 2026-11-17 · **Fase actual:** Fase 2 implementada (pendiente de compilación, ejecución de tests y commit por el usuario)

---

## 1. Decisiones y Reglas Inmutables de Proyecto
1. **Arquitectura Rectora:** Leer [`DOCS/BRIEF_9_DECISIONES.md`](DOCS/BRIEF_9_DECISIONES.md) antes de añadir cualquier funcionalidad.
2. **Propiedad Intelectual limpia:** Prohibido incluir Mask ROMs originales (`IC3`, `SC-55`, etc.), PCM de fábrica protegido, código GPLv3 (`grvbox-main`) o código sin licencia (`MC3o3-arpegiator`). Las ondas de fábrica llegarán des-horneadas como resíntesis espectral/DDSP o síntesis VA.
3. **DRY Estricto sobre `ABDShared` y `ABDBankManager`:**
   - Arpegiador groove compartido: **`ABDShared/Code/SynthCore/GrooveArpeggiator.h`** (documentado en [`ABDShared/Docs/dsp/ARPEGGIATORS_GUIDE.md`](../ABDShared/Docs/dsp/ARPEGGIATORS_GUIDE.md)).
   - Diccionario de parámetros (`CDD v2.0`): [`ABDShared/Contracts/abdmcx0x_parameter_spec.json`](../ABDShared/Contracts/abdmcx0x_parameter_spec.json).
   - Formato de banco/cápsula propietario: [`ABDShared/Contracts/abd_structured_rompler.schema.json`](../ABDShared/Contracts/abd_structured_rompler.schema.json) y [`abdStructuredRompler.ts`](../ABDShared/Contracts/abdStructuredRompler.ts).
   - Contratos de hardware/softsynth en `ABDShared/Contracts/` (todos bajo `hardware_profile.schema.json` + `bankManagement`): `boss_dr5.json`, `roland_mc303.json`, `roland_d2.json`, `roland_sc55.json` y `abd_mcx0x.json`, hidratados de forma aséptica en [`ABDShared/Code/BankManager/Contracts/Models/jsonContractHydrator.ts`](../ABDShared/Code/BankManager/Contracts/Models/jsonContractHydrator.ts) (`createUniversalContractRegistry()`).
   - Módulos hardware e identidad: `ABDShared/Code/HardwareMidiDetect` (`abd::hwid::HardwareContractRegistry`, `JuceMidiHardwareBackend`), `ABDShared/Code/HardwareDrivers` (`abd::hw::NRPNParser`) y `ABDBankManagerCore`.
   - Módulos UI/Telemetría compartidos para Fases 3–5: **`D:\desarrollos\ABDSynths\ABDShared\Code\MidiKeyboard`** (`@abdsynths/midi-keyb`, registro obligatorio en `host-strip-height.test.js`) y **`D:\desarrollos\ABDSynths\ABDShared\Code\Scope`** (`ABDShared::ScopeCoreHeaders`, `ABDShared::ScopeCore`, `ABDShared::ScopeWebAssets` y `@abdsynths/shared/scope`).
4. **Reglas de Código y UI:**
   - GUI en **JUCE 9 + WebView2 estático** (`JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1`), **Vanilla CSS** con tokens de `@abdsynths/shared`, cero emojis (solo SVGs de `ABDShared/Assets/icons/`).
   - C++ `.h/.cpp` `< 300` líneas por archivo; JS/TS `< 200` líneas de lógica por archivo; identificadores y comentarios del código 100 % en inglés; cero alojamientos o locks en `processBlock`.
   - `DspSources.cmake` como lista única compartida entre Nativo y Emscripten WASM.

---

## 2. Entorno de Herramientas Verificado
- **Remoto GitHub:** `https://github.com/ajabadia/ABDMCX0X.git`
- **JUCE 9:** autodescubrimiento `JUCE_PATH` → `../ABDEep/JUCE` → `../ABDMS2000/GITS/JUCE` → `C:/JUCE`
- **Emscripten SDK:** `D:\desarrollos\emsdk\emsdk_env.bat` (con Ninja)
- **Node.js / Workspace:** `%LOCALAPPDATA%\nvm\v24.21.0` o `C:\Program Files\nodejs`, monorepo `ABDShared` + `ABDBankManager`
- **WebView2 NuGet:** `%USERPROFILE%/AppData/Local/PackageManagement/NuGet/Packages`

---

## 3. Notas de Investigación Hardware (MC-303 / DR-5 / D-2 / SC-55)
- **Bug documentado en editores comunitarios (evitado aquí):** Algunos editores envían `CC6 (Data)` antes que `CC99/CC98` al girar un dial NRPN. `HardwareMirrorRouter` y `McxHardwareBridge` imponen siempre el orden estricto Roland: **`CC99 (MSB) → CC98 (LSB) → CC6 (Data)`**.
- **MC-303:** Chip `TC6116AF`, Tone de 2 Partials con envolventes `4T4L`, 12 Drum Kits donde cada tecla apunta a un Tone evaluado en `coarse_key`. NRPN melódico (`CC99=1`, rango `14..114` relativo a `64`); NRPN de batería por tecla (`CC99=24` Pitch, `26` Level, `28` Pan, `29` Reverb, `30` Chorus; `CC98=11..118`).
- **Boss DR-5 en mesa:** 4 pistas (`Ch 1..4` Bass/Guitar/Keys, `Ch 10` Drums). CCs 7/10/91 y NRPNs GS de batería por tecla (`CC99=24,26,28,29`), DT1 SysEx con Checksum Roland `(0x80 - (sum & 0x7F)) & 0x7F`.
- **D-2 / MC-505 & MC-909:** Escalan a **4 Partials (estéreo en MC-909)** y **TVF/TVA independiente por tecla de Drum Kit**, modelo adoptado directamente por `ABDMCX0X`.

---

## 4. Estado Actual y Siguientes Pasos (Fase 2 → Fase 3)
1. **Fase 2 escrita al 100 %** y documentada en [`DOCS/PHASE2_HARDWARE_AND_BANK_MANAGER.md`](DOCS/PHASE2_HARDWARE_AND_BANK_MANAGER.md):
   - Cola SPSC lock-free `McxMidiOutQueue.h` (`Capacity = 1024`, `alignas(64)` en cabezales).
   - Compensador de latencia A/B de muestra exacta `McxLatencyCompensator.h` (`setLatencyMs(ms)`).
   - Puente bidireccional `McxHardwareBridge.h/.cpp` con enrutamiento `INT|EXT|BOTH`, orden estricto Roland, generación de CC/NRPN para Boss DR-5 / Roland MC-303, y parsing de CCs/NRPNs entrantes para actualización en caliente de `McxEngine`.
   - Persistencia multinivel `McxBankManagerBridge.h/.cpp` (preset `abd_mcx0x_preset_v1` JSON, volcados SysEx Roland DT1 con checksum exacto, y soporte `juce::ValueTree` DAW chunk).
   - Suite de pruebas unitarias `Tests/McxPhase2Tests.cpp` integrada en `CMakeLists.txt` y `DspSources.cmake`.
   - **El usuario ejecutará manualmente** la compilación CMake, `McxPhase2Tests.exe` y los commits a GitHub.
2. En **Fase 3**: montar la WebUI con `ABDShared/Code/MidiKeyboard` (`@abdsynths/midi-keyb` + alta en `host-strip-height.test.js`) y `ABDShared/Code/Scope` (`ABDShared::ScopeCore` + `createScope()`) para inspección SPSC en vivo e instrumentación A/B hardware vs DSP en host JUCE 9 + WebView2 estático + WASM.
