# INTEGRACION_PIANO_ROLL — Guía de Integración en ABDMCX0X

> **Módulo UI:** `ABDShared/Components/PianoRoll/pianoRollModal.js`  
> **Integración WebUI:** `ABDMCX0X/WebUI/src/main.ts` & `McxMixerConsole.ts`  
> **Motor DSP C++20:** `ABDShared/Code/SynthCore/PatternSequencerEngine.h`  
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

### B. Shuffle / Swing Musical
- Selector de Swing desde `50%` (straight) hasta `75%` (hard shuffle).
- Se comunica directamente al parámetro `patternSwing` del motor para modular la posición de los ticks pares.

### C. Carril de Velocidad y Acento Roland
- Línea horizontal discontinua roja en **100** (`ACCENT THRESHOLD (VEL > 100)`).
- Notas con velocidad > 100 reciben la insignia `[ACC]` y disparan la pegada extra de VCA y apertura de filtro de la voz.

### D. Automatización y Animación Visual de Mandos
- Selección de carril: *Velocity*, *Cutoff*, *Resonance*, *Pan*, *Send A*, *Send B*.
- Al grabar o reproducir movimiento, el callback `onMotionPlayback` actualiza en tiempo real los controles físicos correspondientes en el panel de Tono (`McxToneDrawer`), proporcionando retroalimentación visual idéntica a la del joystick vectorial.


### E. Soporte para Bancos Sliced Loop / REX2
- Cuando una parte carga un `.abdbank` de bucle troceado, la pianola se configura automáticamente en modo Drum/Slice:
  - Mapeo de cada slice con su número de orden (`Slice 01`, `Slice 02`...).
  - Carga inmediata de la secuencia original del slice con sus posiciones de disparo temporales (`startTick`, `durationTicks`, `velocity`).
  - Pre-escucha individual de cada trozo pulsando sobre su etiqueta en el teclado izquierdo.

### F. Importación y Exportación de Secuencias (.abdseq / JSON)
- **Exportar:** Botón `💾 EXPORTAR` descarga o almacena en `<WorkingDir>/Sequences/` un archivo `.abdseq` en formato JSON estructurado con notas, compases, PPQ y automatización de parámetros.
- **Importar:** Botón `📂 IMPORTAR` o arrastrar directamente un archivo `.abdseq` sobre la pianola para cargar el patrón en la parte enfocada.

### G. Sincronización Bidireccional de Transporte
- El transporte de la modal (`▶`, `■`, `● REC`) y la barra de transporte principal (`CompactTransportBar`) operan de manera 100% coordinada con feedback luminoso (`.is-playing` y `.is-stopped`).
