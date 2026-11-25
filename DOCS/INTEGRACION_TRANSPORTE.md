# INTEGRACION_TRANSPORTE — Guía de Integración en ABDMCX0X

> **Motor Maestro C++20:** `Source/Sequencer/McxPatternSequencer.h`, `Source/MIDI/McxMidiClockEmitter.h`, `Source/Plugin/McxHostTransportSync.h`  
> **Contenedor UI y Telemetría:** `ABDMCX0X/WebUI/src/ui/McxNavbar.ts`, `McxMasterPanel.ts`, `McxStepStrip.ts`, `src/app/McxAppState.ts`, `src/app/McxInputAndTelemetry.ts`  
> **Componente Canónico:** `@abdsynths/shared/components` (`CompactTransportBar` + `MetronomeClicker`)  
> **Estilos:** `@abdsynths/shared/styles/components/compact-transport-bar.css` + `compact-transport-navbar.css`

---

## 1. Arquitectura en ABDMCX0X

En `ABDMCX0X`, la barra de transporte (`CompactTransportBar`, `mode: 'navbar'`) se monta centrada en la **Navbar superior** (`McxNavbar.ts` → `.mcx-navbar-transport`), lo que libera todo el alto vertical del lateral derecho para mostrar lado a lado el **Armario Rack 19''** (`#mcx-rack-column`) y el panel **Master** (`#mcx-master-panel`) como dos columnas colapsables independientemente.

```
┌────────────────────────────── NAVBAR (.nav-center) ───────────────────────────────┐
│  [ RTZ | ◀◀ | ▶ | ■ | ▶▶ | ● ] [ LOOP ] [ METRO ] [ 120.0 BPM ] [ TC ] [ SWG ]    │
└───────────────────────────────────────────────────────────────────────────────────┘
┌─────────────── RACK 19'' (colapsable) ───────────────┐┌── MASTER (colapsable) ──┐
│  [ Bahías 1..8 FX + Patchbay ]                        ││  [ GLOBAL | G-LFO | LIM ]│
│                                                       ││  [ STEREO VU METER ]    │
│                                                       ││  [ MASTER VOLUME ]      │
└───────────────────────────────────────────────────────┘└─────────────────────────┘
```

---

## 2. Flujo de Datos, Reloj Nativo C++20 y Telemetría Pasiva

1. **Play / Stop hacia el Core C++20 (Sin reloj JavaScript):**
   - Al pulsar Play/Stop en `McxMasterPanel` o en `PianoRollModal`, `McxAppState::setTransportPlaying()` llama a `bridge.setTransportPlaying(playing, resetOnStop)`.
   - En **JUCE (Standalone/VST3)** entra por la cola SPSC lock-free `McxCommandQueue` (`McxUiCommand::Type::SetTransportPlay`) y en **WASM** mediante el mensaje `SET_TRANSPORT` en `mcx0xWorklet.js`, invocando ambos `McxEngine::setSequencerPlaying()`.
   - El reloj maestro corre exclusivamente en **C++20** dentro de `McxEngine::processAudio` por cada sub-bloque de audio (`kMaxChunk = 64` muestras), invocando `processSequencerAndClock(chunk, offset)`:
     - **`McxMidiClockEmitter` (`24 PPQ`):** Emite con precisión de muestra mensajes de tiempo real MIDI (`0xFA` Start, `0xFB` Continue, `0xFC` Stop y pulsos `0xF8` Clock con `priority = 0` sobre `McxMidiOutQueue`).
     - **`McxPatternSequencer` (`96 PPQ`):** Dispara notas internas/externas (`sampleOffset`), ligaduras *slide*, automatización *Motion* y libera limpiamente todas las notas activas al detener.
   - Si el metrónomo Web está armado (`METRO` iluminado), `MetronomeClicker` genera los pulsos en paralelo en WebAudio.

2. **Sincronización con Host DAW (`AudioPlayHead`):**
   - En cada `processBlock()` del VST3, [`McxHostTransportSync.h`](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Plugin/McxHostTransportSync.h) consulta `juce::AudioPlayHead` (`BPM`, `isPlaying`, `ppqPosition`) y delega en `McxEngine::syncHostTransport()`.
   - Reacciona con `emitStart` (`0xFA`) al arrancar desde el origen o `emitContinue` (`0xFB`) al reanudar a mitad de tema (`ppqValid && hostPpqPos > 0.01`), `emitStop` (`0xFC`) al detener y re-engancha automáticamente si detecta un salto/seek del DAW (`dist > 4` ticks).

3. **WebUI como Espejo Pasivo de Telemetría DSP:**
   - La WebUI ya no usa `setInterval` para perseguir el paso activo: `McxInputAndTelemetry.ts` recibe desde nativo/WASM `seqPlaying`, `seqTick`, `seqStep`, `seqTotalTicks` y `bpm`.
   - Actualiza de forma idempotente (sin rebotes) el chaser LED de `McxStepStrip.setChaserStep(...)`, el cabezal de `PianoRollModal` (`setPlayhead` / `setPlaying`) y el estado visual de `McxMasterPanel` (`setPlaying` / `setBpm`).

4. **Metrónomo con Triple Modo Cíclico:**
   - Botón `METRO` con LED indicador e insignia contextual. Al hacer clic conmuta cíclicamente:
     - **`OFF`:** Apagado (silencio total).
     - **`ON` (Play + Rec):** Suena tanto en reproducción normal como en grabación. LED cian activo e insignia `ON`.
     - **`REC` (Rec Only):** Suena únicamente si el transporte está corriendo y el botón `REC` está armado. LED ámbar e insignia `REC`.
   - Cero dependencias de ficheros de audio externos: síntesis precisa en tiempo real mediante `AudioContext` (1600 Hz downbeat, 800 Hz offbeats).

5. **Tempo y Tap Tempo:**
   - Botones `+` y `-` para ajuste fino de 1 en 1 BPM.
   - Rueda del ratón sobre el visor para ajuste continuo (con `Shift` para decimales de 0.1 BPM).
   - Tap Tempo interactivo sobre el visor numérico calculando el promedio de intervalos de pulsación.
   - Doble clic abre un diálogo numérico directo para introducir el tempo deseado.
