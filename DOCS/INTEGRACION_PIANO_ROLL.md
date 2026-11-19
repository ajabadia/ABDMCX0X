# INTEGRACION_PIANO_ROLL — Guía de Integración en ABDMCX0X

> **Módulo UI:** `ABDShared/Components/PianoRoll/pianoRollModal.js`  
> **Integración WebUI:** `WebUI/src/app/McxModalsFactory.ts`, `McxPianoRollSync.ts`, `McxAppState.ts`, `McxInputAndTelemetry.ts`, `McxMixerConsole.ts`  
> **Motor DSP C++20:** `Source/Sequencer/McxPatternSequencer.h/.cpp/Playback.cpp` + `McxEngineSequencer.cpp` (sobre `ABDShared::SynthCore::PatternSequencerEngine` y `GrooveShuffleEngine`)  
> **Puentes:** `Source/Plugin/McxPatternJsonAdapter.h` (JUCE/WebView2) & `Source/Wasm/WasmBridge.cpp` (WASM)  
> **Contrato Semántico:** `abd_pattern.schema.json` & `abdPattern.ts`

---

## 1. Visión y Puntos de Acceso en ABDMCX0X

El rollo de pianola proporciona la vista de micro-secuenciación y edición profunda para las 16 pistas de la groovebox.

### Vías de Acceso:
1. **Botón `[ SEQ ]` en Consola:** Cada una de las 16 tiras de mezcla de `McxMixerConsole.ts` dispone del botón `[ SEQ ]`. Al pulsarlo, enfoca automáticamente la pista y abre la pianola adaptada a su naturaleza:
   - Pistas melódicas (`Chromatic`): se abren en modo cromático con teclado de piano vertical.
   - Pista de batería (`DrumMap`, ej. P10): se abre en modo **Drum Grid** con nombres de percusión (`Kick 1`, `Snare 1`, etc.).
2. **Atajo Global:** `Ctrl+P` (o `Cmd+P` en macOS) para conmutar la visibilidad de la ventana.
3. **Menú de Herramientas:** Menú *Tools / Herramientas* -> *Piano Roll Sequencer...* en `McxNavbar.ts`.

---

## 2. Características Operativas Clave

### A. Rejilla y Cuantización
- Selector de Grid con opción **`OFF (Libre)`**: Permite introducir notas en cualquier tick exacto sin forzar cuantización.
- Divisiones tradicionales: `1/4`, `1/8`, `1/16`, `1/32` y `1/16 T` (tresillos).
- Botón `QUANTIZE`: Ajusta todas las notas del patrón a la rejilla de semicorcheas más próxima.

### B. Shuffle / Swing Musical y Doble Buffer Lock-Free
- Selector de Swing desde `50%` (straight) hasta `75%` (hard shuffle), mapeado linealmente en C++ al rango `0.0..1.0` de `GrooveShuffleEngine` (`paramId 90` = `patternSwing`), además de soporte completo por pista desde `GrooveShuffleModal`.
- Al editar notas o alternar pasos desde `McxStepStrip` (`setStep`), los patrones se cargan sin bloqueos ni asignaciones en audio mediante el doble buffer de `McxPatternSequencer` (`applyPatternDtoToEngine` en JUCE o `_clearPartPattern`..`_commitPartPattern` en WASM), liberando notas sonando si se sustituye el patrón en caliente.

### C. Carril de Velocidad y Acento Roland
- Línea horizontal discontinua roja en **100** (`ACCENT THRESHOLD (VEL > 100)`).
- Notas con velocidad > 100 reciben la insignia `[ACC]` y disparan la pegada extra de VCA y apertura de filtro de la voz.

### D. Automatización, Audición (`onNotePreview`) y Animación Visual de Mandos
- Selección de carril en UI: *Velocity*, *Cutoff*, *Resonance*, *Pan*, *Send A*, *Send B* (soporte en motor C++ de hasta **4 carriles simultáneos** de *Motion Recording* por patrón mapeando `cutoff`, `resonance`, `pan` y `sendA..D`).
- Al dibujar o grabar curvas, `recordMotion` actualiza el mando en vivo (`McxToneDrawer::updateParamLive`) y sube el patrón actualizado al doble buffer C++ para reproducción autónoma desde el DSP; `onNotePreview` audiciona directamente sobre `focusedPart`.

### E. Soporte para Bancos Sliced Loop / REX2 *(En Roadmap — pendiente de implementar)*
- Diseño previsto cuando una parte cargue un `.abdbank` de bucle troceado: modo Drum/Slice con mapeo `Slice 01..`, carga de secuencia de disparo original y pre-escucha por slice.

### F. Importación y Exportación de Secuencias (.abdseq / JSON)
- **Exportar:** Botón `💾 EXPORTAR` descarga o almacena en `<WorkingDir>/Sequences/` un archivo `.abdseq` en formato JSON estructurado con notas, compases, PPQ y automatización de parámetros.
- **Importar:** Botón `📂 IMPORTAR` o arrastrar directamente un archivo `.abdseq` sobre la pianola para cargar el patrón en la parte enfocada.

### G. Sincronización Pasiva con Reloj Nativo C++20 y Transporte
- El cabezal (`seqTick`) y estado Play/Stop (`seqPlaying`) de la modal y del chaser de `McxStepStrip` actúan como **espejo pasivo** de la telemetría del motor C++20 (`McxPatternSequencer`), manteniendo coordinación total con `CompactTransportBar` (`McxMasterPanel`) y el host DAW.
