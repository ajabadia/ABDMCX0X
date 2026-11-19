# Auditoría de Código y Checklist de Refactorización — ABDMCX0X

> **Documento de Auditoría y Control de Calidad:** Detección de trampas ocultas, desconexiones, carencias y deuda técnica antes de acometer la arquitectura Workstation Multi-Motor y MIDI Out.  
> **Estado:** Auditado y verificado al 100 % (`.\build.bat full` **5/5** + `8/8` CTest en `0.64s`): Fase 1, Bloque 6, Fase 3 (`StructuredRompler` + `ISoundEngine`) y Fase 2 (Secuenciador PPQ + MIDI Clock `0xF8`) — **2026-11-19**.  
> **Ámbito:** `ABDMCX0X` (C++20, JUCE 9, WASM, WebUI) y su interacción con `ABDShared`.

---

## 1. Resumen Ejecutivo

La auditoría del código fuente actual revela que, aunque la base matemática del DSP y la infraestructura de contratos están en un estado avanzado, existen **4 trampas críticas en el flujo de eventos**, **3 carencias arquitectónicas** y **deuda técnica de límites de líneas y estilos CSS** que habrían provocado fallos silenciosos y semanas de depuración si se intentaba construir encima sin corregirlas.

---

## 2. Trampas Críticas (Bloqueantes Funcionales Ocultos)

### ✅ Trampa 1 (Resuelto en Fase 1): El "MIDI Out Fantasma" en las Notas de `McxEngine`
* **Ubicación:** `Source/DSP/Core/McxEngineControl.cpp` (líneas 100–115 y 118–129).
* **Diagnóstico:**  
  En `triggerNote()`, cuando la pista tiene `routeMode == ExternalMidi`, el código ejecuta:
  ```cpp
  if (HardwareMirrorRouter::routesToExternal(p.routeMode))
  {
      if (p.isDrumKit)
          mirrorRouter_.emitDrumKeyNrpn(...);
      else
          mirrorRouter_.emitNrpn(p.midiChannel, 1, 32, cutoffByte, ...);
  }
  ```
  **Fallo Crítico:** Emite un parámetro NRPN de Cutoff o Drum Level, pero **NUNCA emite el mensaje MIDI `NoteOn` (`0x90 | ch`, `note`, `vel`)**.  
  Y en `releaseNote()`, si la pista es externa, el bloque no hace nada: **NUNCA emite `NoteOff` (`0x80 | ch`, `note`)**.
* **Efecto en Ejecución:** Un sintetizador hardware externo conectado por cable recibiría ajustes de filtro o volumen, pero **jamás sonaría ninguna nota musical**.
* **Corrección Requerida:**  
  En `triggerNote()`, emitir `mirrorRouter_.emitNoteOn(p.midiChannel, clampedNote, velByte, sampleOffset)`.  
  En `releaseNote()`, emitir `mirrorRouter_.emitNoteOff(p.midiChannel, clampedNote, sampleOffset)`.

---

### ✅ Trampa 2 (Resuelto en Fase 1): La Doble Cola Desconectada (Cola Huérfana)
* **Ubicación:** `McxEngine.h` vs. `Source/Plugin/PluginProcessor.cpp` (líneas 125–132).
* **Diagnóstico:**  
  1. `McxEngine` posee su propio miembro interno `HardwareMirrorRouter mirrorRouter_;`. Las llamadas de `triggerNote()` escriben en el búfer interno de esta instancia.
  2. En `PluginProcessor.cpp`, el bucle que inyecta los mensajes MIDI de salida hacia el DAW (`processBlock`) lee exclusivamente de:
     ```cpp
     McxMidiOutMessage outMsg{};
     while (hardwareBridge_.getOutboundQueue().pop(outMsg)) {
         midiMessages.addEvent(juce::MidiMessage(outMsg.bytes, ...), ...);
     }
     ```
  3. **`mirrorRouter_` de `engine_` no tiene ninguna conexión con `hardwareBridge_`.** `engine_` acumula mensajes en un búfer que nadie lee jamás, mientras que `hardwareBridge_` permanece con su cola vacía.
* **Efecto en Ejecución:** Cero bytes MIDI salen hacia el host VST3 o hacia los puertos físicos.
* **Corrección Requerida:**  
  Unificar el canal de salida: hacer que `McxEngine` utilice directamente la cola de salida de `hardwareBridge_`, o bien que `PluginProcessor` drene el `mirrorRouter_` de `engine_` al final de `processBlock`.

---

### ✅ Trampa 3 (Resuelto en Fase 3): El Allocator de Voces estaba Soldado al Rompler (`McxVoice` $\to$ `ISoundEngine` + `RomplerVoicePool`)
* **Ubicación:** `Source/DSP/Core/McxEngine.cpp` (líneas 126–134) y `McxEngineAllocation.cpp`.
* **Diagnóstico:**  
  La mezcla y asignación de polifonía itera exclusivamente sobre:
  ```cpp
  std::array<McxVoice, 64> voices_;
  ```
  Donde cada `McxVoice` es estrictamente una voz de síntesis Rompler de 4 parciales PCM.
* **Efecto en Ejecución:** No es posible asignar un motor alternativo (como `JunoEngine` de `ABDJUNiO601` o `ExternalMidiEngine`) a una pista porque el motor asume que el 100 % de las voces activas son parciales del Rompler.
* **Corrección Requerida:**  
  Implementar la ranura polimórfica o variante de motor por parte:
  ```cpp
  std::array<std::unique_ptr<IMcxSoundEngine>, kNumParts> engineSlots_;
  ```
  Permitiendo que cada parte renderice su propio audio mediante `engineSlots_[pIdx]->renderBlock(partL, partR, chunk)`.

---

### ✅ Trampa 4 (Resuelto en Fase 1): Pérdida del Índice de Pista en el Bridge UI (`McxCommandQueue` + `triggerPartNoteOn`)
* **Ubicación:** `Source/Plugin/PluginProcessor.cpp` (línea 135) y `Source/Wasm/WasmBridge.cpp` (línea 49).
* **Diagnóstico:**  
  Cuando la interfaz WebUI dispara una nota manual en la pista $X$, llama a `bridge.noteOn(partIdx, note, vel)`.  
  Sin embargo, el bridge C++ convierte inmediatamente el `partIdx` en su canal MIDI:
  ```cpp
  const int ch = static_cast<int>(engine_.part(partIdx).midiChannel);
  engine_.routeMidiChannelNoteOn(ch, note, vel);
  ```
* **Efecto en Ejecución:** Al expandir a 64 pistas (Bancos A, B, C, D), los canales 1..16 se repetirán forzosamente entre bancos. Al comprimir el evento a 4 bits de canal MIDI, tocar en la Pista 17 (Canal 1 del Banco B) disparará simultáneamente la Pista 1 (Canal 1 del Banco A) por colisión de canal.
* **Corrección Requerida:**  
  Crear un método de disparo directo por índice de parte:  
  `engine_.triggerPartNoteOn(partIdx, note, vel, sampleOffset)`.

---

## 3. Carencias y Cabos Sueltos (Gaps de Arquitectura)

### ✅ Carencia 1 (Resuelto en Fase 1): El Arpegiador ahora enruta vía `dispatchNoteOnToOutputs` (`INT`/`EXT`/`BOTH`)
* **Ubicación:** `Source/DSP/Core/McxEngine.cpp` (líneas 86–96).
* **Diagnóstico:**  
  El callback del generador de arpegios ejecuta:
  ```cpp
  p.arp.generate(numSamples, [this, partIdx](const auto& ev) {
      if (ev.isNoteOn) triggerInternalVoice(partIdx, ev.note, ...);
      else releaseInternalVoice(partIdx, ev.note);
  });
  ```
* **Fallo:** Llama directamente a las voces internas sin comprobar `p.routeMode`. Si una pista está configurada como `ExternalMidi`, el arpegiador despierta voces del Rompler interno en lugar de emitir notas al puerto MIDI.

### ✅ Carencia 2 (Resuelto en Fase 1): Diezmador MIDI (`Source/MIDI/McxMidiModDecimator.h`) para LFOs y NRPN
* **Ubicación:** `ABDShared/Code/SynthCore/LFO.h` y `LfoAnalog.h`.
* **Diagnóstico:**  
  Los LFOs calculan ondas analíticas continuas a tasa de control (~1500 Hz). Falta construir el bloque de salida MIDI que submuestree a **30–40 Hz** y aplique un umbral de cambio $\Delta \ge 1$ para no saturar el cable MIDI DIN con miles de mensajes CC por segundo.

### ⚠️ Carencia 3: Falta de Transmisión de `routeMode` en WebUI
* **Ubicación:** `WebUI/src/main.ts` y `McxMixerConsole.ts`.
* **Diagnóstico:**  
  Aunque en el backend existe `paramId == 10` (`routeMode`), el botón de la consola era un simple toggle binario cosmético `DRM/CHR`. Nunca enviaba un DTO completo con el destino físico (`Internal`, `ExternalMidi`, `BothAB`), puerto y canal.

---

## 4. Deuda Técnica y Violación de Límites del Proyecto

### 🧹 Deuda 1: Monolito de Estilos `mcx0x.css` *(✅ Resuelto en Bloque 6)*
* **Estado Actual:** Particionado en **21 hojas modulares `< 180` líneas** más manifiesto `@import` [mcx0x.css](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/styles/mcx0x.css) (23 lín.). **0 colores hardcodeados** (`#hex`, `rgba(...)` literal o `black`/`white`) y tokens alineados con `ABDShared/Assets/styles/tokens.css`.

### 🧹 Deuda 2: Exceso de Líneas en TypeScript *(✅ Resuelto en Bloque 6; expansión a 64 pistas pendiente de Fase 4)*
* `McxStepStrip.ts`: Reducido de 207 a **194 líneas** (añadidos `buildPadState`, `setBpm()`, `setSwing()`).
* `main.ts`: Reducido de 644 a **189 líneas**, descompuesto en `WebUI/src/app/` (`McxAppState.ts` 167 lín., `McxPianoRollSync.ts` 54 lín., `McxModalsFactory.ts` 196 lín., `McxInputAndTelemetry.ts` 103 lín.). **100 % de ficheros WebUI manuales `< 200` líneas** (`OVER_200_COUNT=0`).

### 🧹 Deuda 3: Saturación del Cajón de Tono *(Listo para Fase 4)*
* `McxToneDrawer.ts` (196 líneas) y `McxToneDrawerLfo.ts` (196 líneas) siguen dentro de `< 200` líneas; la futura división en pantallas por flujo de señal quedará en Fase 4.

---

## 5. Checklist de Refactorización por Fases

Para ejecutar la transición de forma limpia, segura y verificable:

> *Nota de planificación:* Ver el orden maestro actualizado (Groovebox Core $\to$ Secuenciador PPQ C++ $\to$ Aislamiento Rompler `IMcxSoundEngine` $\to$ Diseño Song Mode / Múltiples Pistas / UX $\to$ Motores de la Suite) en [PLAN_MAESTRO_ARQUITECTURA_Y_REFACTOR_CORE.md](file:///d:/desarrollos/ABDSynths/ABDMCX0X/DOCS/PLAN_MAESTRO_ARQUITECTURA_Y_REFACTOR_CORE.md).

```markdown
### Fase 1: Corrección de Trampas en el Pipeline C++
- [x] 1.1 Conectar `triggerNote()` y `releaseNote()` para emitir NoteOn y NoteOff cuando `routesToExternal` sea true.
- [x] 1.2 Unificar la salida MIDI: enlazar `McxEngine` con la cola `outQueue_` de `hardwareBridge_` (+ `midiMessages.clear()` anti-eco en `PluginProcessor.cpp`).
- [x] 1.3 Conectar el callback del Arpegiador a `dispatchNoteOnToOutputs` / `dispatchNoteOffToOutputs` (`INT`/`EXT`/`BOTH`) en lugar de `triggerInternalVoice`.
- [x] 1.4 Crear `triggerPartNoteOn(partIdx, note, vel)` / `releasePartNoteOff` + `McxCommandQueue.h` para evitar la colisión de canales MIDI (+ `latchedNoteMap_[128]` anti-notas-colgadas).

### Fase 2: Modularización de Motores (`ISoundEngine` — Completada en Fase 3 del Plan Maestro)
- [x] 2.1 Formalizar la interfaz abstracta pura `ISoundEngine` en `ABDShared/Code/SynthEngines/` (+ `TrackModRouter.h`).
- [x] 2.2 Envolver el Rompler en la clase `StructuredRomplerEngine : public ISoundEngine` dentro de `ABDShared::StructuredRompler` (`RomplerVoicePool` compartido) y eliminar duplicados en `ABDMCX0X/Source/DSP/Synth/`.
- [ ] 2.3 Crear el adaptador `JunoEngineAdapter : public IMcxSoundEngine` consumiendo `ABDJUNiO601` (Fase 5 del Plan Maestro).
- [x] 2.4 Sustituir el renderizado directo de `voices_` en `McxEngine::processAudio` por delegación en `engineSlots_[pIdx]->renderBlock()`.

### Fase 2 del Plan Maestro: Secuenciador PPQ Nativo C++20 y MIDI Clock (`0xF8`) *(✅ Verificado — `5/5 build.bat full`, `8/8` CTest en `0.64s`)*
- [x] M1 Implementar `McxMidiClockEmitter.h` (`0xFA`/`0xFB`/`0xFC`/`0xF8` a `24 PPQ`, `priority = 0`) y `McxPatternSequencer` (doble buffer lock-free, `GrooveShuffleEngine`, `syncHostTransport`, 4 carriles de *Motion* y sub-bloques `kMaxChunk = 64` en `McxEngine`).
- [x] M2 Convertir `McxStepStrip.ts`, `McxMasterPanel.ts` y `PianoRollModal` en espejo pasivo de la telemetría DSP (`vite build` verde), y registrar `Tests/McxPhase7SequencerTests.cpp` (`T1..T8`).

### Fase 3: Interfaz WebUI y Desglose de Pantallas
- [ ] 3.1 Sustituir el botón plano `DRM/CHR` en `McxMixerConsole.ts` por el badge `INT:ROM`, `INT:JUNO`, `EXT:01`, `A+B`.
- [ ] 3.2 Crear el modal `McxInstrumentRouteModal.ts` (< 200 líneas) para configurar formato musical y destino.
- [ ] 3.3 Dividir el monolito de Tono en 3 pantallas: `[ TRACK ]`, `[ CH AUDIO ]` y `[ ENGINE ]`.
- [x] 3.4 Descomponer `mcx0x.css` en submódulos (< 200 líneas) y eliminar los colores hardcodeados (+ descomponer `main.ts` y ajustar `McxStepStrip.ts` < 200 líneas en Bloque 6).

### Fase 4: Expansión de Pistas y Adaptadores
- [ ] 4.1 Implementar la conmutación de 4 Bancos cromáticos (A, B, C, D) en `StepButtonStrip`.
- [x] 4.2 Implementar el diezmador inteligente de LFOs hacia MIDI Out (`Source/MIDI/McxMidiModDecimator.h`: 35 Hz CC / 18 Hz NRPN con caché `CC99/CC98` y *backpressure*).
- [x] 4.3 Adaptar los vúmetros de la consola a medición dual (dBFS para audio / velocidad para MIDI; backend C++ `partMidiPeaks_` en Fase 1 y UI/Worklet/Bridge en Bloque 6).
```
