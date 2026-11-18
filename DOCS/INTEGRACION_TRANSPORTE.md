# INTEGRACION_TRANSPORTE — Guía de Integración en ABDMCX0X

> **Módulo:** `ABDMCX0X/WebUI/src/ui/McxTransport.ts`  
> **Contenedor Host:** `ABDMCX0X/WebUI/src/ui/McxMasterPanel.ts`  
> **Componente Canónico:** `@abdsynths/shared/components` (`CompactTransportBar` + `MetronomeClicker`)  
> **Estilos:** `@abdsynths/shared/styles/components/compact-transport-bar.css`

---

## 1. Arquitectura en ABDMCX0X

En `ABDMCX0X`, la barra de transporte se ubica en la base de la columna derecha del mezclador (`McxMasterPanel.ts`), integrándose armónicamente bajo el potenciómetro maestro de volumen y el vúmetro estéreo.

```
┌─────────────────────────────────┐
│          MASTER PANEL           │
│  [ FX RACK ]   [ G-LFO ]  [LIM] │
│                                 │
│        [ STEREO VU METER ]      │
│                                 │
│         [ MASTER VOLUME ]       │
│                                 │
├─────────────────────────────────┤
│     MCX TRANSPORT BAR (DRY)     │
│  [ ▶ Play ] [ ■ Stop ] [ ● Rec ]│
│  [ LOOP ]            [ METRO ]  │
│  [ - ]  [ 120.0 BPM ]  [ + ]    │
└─────────────────────────────────┘
```

---

## 2. Flujo de Datos y Eventos

1. **Play / Stop:**
   - Al pulsar Play, `McxMasterPanel` comunica el tempo a través de `bridge.setTempo(bpm)`.
   - Se notifica a la botonera de pasos (`McxStepStrip.setTransportRunning(true, bpm)`) para que inicie la animación del chaser LED de 16 pasos.
   - Si el metrónomo está armado (`METRO` iluminado), `MetronomeClicker` arranca inmediatamente en WebAudio generando pulsos sinusoidales limpios a 1600 Hz (downbeat) y 800 Hz.
   - Al pulsar Stop, se envía `bridge.allNotesOff()`, se detiene el chaser y se silencia el metrónomo.

2. **Metrónomo con Triple Modo Cíclico:**
   - Botón `METRO` con LED indicador e insignia contextual. Al hacer clic conmuta cíclicamente:
     - **`OFF`:** Apagado (silencio total).
     - **`ON` (Play + Rec):** Suena tanto en reproducción normal como en grabación. LED cian activo e insignia `ON`.
     - **`REC` (Rec Only):** Suena únicamente si el transporte está corriendo y el botón `REC` está armado. LED ámbar e insignia `REC`.
   - Cero dependencias de ficheros de audio externos: síntesis precisa en tiempo real mediante `AudioContext` (1600 Hz downbeat, 800 Hz offbeats).

3. **Tempo y Tap Tempo:**
   - Botones `+` y `-` para ajuste fino de 1 en 1 BPM.
   - Rueda del ratón sobre el visor para ajuste continuo (con `Shift` para decimales de 0.1 BPM).
   - Tap Tempo interactivo sobre el visor numérico calculando el promedio de intervalos de pulsación.
   - Doble clic abre un diálogo numérico directo para introducir el tempo deseado.
