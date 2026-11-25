# Especificación Técnica — Superficie Universal Aséptica `PerformanceDeck`

> **Estado:** Especificación aprobada (2026-11-25) · **Alcance:** `ABDShared` + `ABDAxionikVS` + `ABDMCX0X` (y cualquier futuro sinte de la suite ABDSynths).

---

## 1. Visión y Naming Aséptico

Evolución de `ABDAxionikVS/WebUI/src/ui/NukeDrawer.ts` hacia un componente universal aséptico reutilizable en `@abdsynths/shared/components`: **`PerformanceDeck`**.

- **Cero nomenclatura propietaria en contratos y API:** Se elimina el término `"nuke"` de los esquemas CDD v2.0, tiendas de mapeo, presets y clases compartidas.
- **Modularidad y estilo estrictos:** Módulos JS/TS/CSS `< 200` líneas cada uno, `0` colores `#hex` literales (100 % design tokens de `@abdsynths/shared`).
- **Independencia total del motor:** El componente desconoce la topología interna de cada sinte; todo se resuelve declarativamente a partir del diccionario de parámetros CDD v2.0 (`*_parameter_spec.json`).

---

## 2. Anatomía de Controles (10 Knobs Asépticos + Joystick XY)

1. **Zona superior (`main-deck`):**
   - **4 knobs principales** (2 en el ala izquierda, 2 en el ala derecha).
   - **Joystick 2D central (`TrajectoryStick2D`)** con slot extensible opcional en su cabecera para selectores de capa/modo (p. ej. `Resys 1 | Resys 2 | Silver`, `Sphere | Scape`, `L1..L3` en `ABDAxionikVS`; ocultable automáticamente en sintes sin capas).
2. **Zona inferior (`secondary-knobs`):**
   - **6 knobs secundarios asépticos** (NO son controladores de expresión hardcodeados).
   - En `ABDAxionikVS`, su adaptador fino los configura como los 6 moduladores bipolares clásicos (`Aftertouch`, `Modulation`, `Breath`, `CC 03`, `Foot`, `Expression`) mostrando su destino.
   - En `ABDMCX0X` y demás sintes universales, controlan directamente otros 6 parámetros del motor activo mostrando su nombre legible, valor formateado y unidad.
3. **Slots sobrantes deshabilitados:**
   - Si un motor declara o expone menos de 10 parámetros (o `xyPad: null`), los knobs o ejes sobrantes **no duplican el slot 0** ni inventan destinos: se renderizan **deshabilitados / sin asignar** (`—`) en modo Perform, y activables/asignables en modo `EDIT`.
4. **Tira fija de Pista/Mixer (`footerSlot`, exclusiva de `ABDMCX0X`):**
   - Zona fija opcional en el pie (oculta en `ABDAxionikVS`), **no asignable**, dedicada al canal de mezcla de la pista activa: `Level`, `Pan`, `Reverb Send`, `Chorus Send`, `Mute` y `Solo`.
   - Mantiene los **10 knobs + Joystick XY 100 % puros del motor**, garantizando portabilidad total de los presets `.abdperf.json` entre pistas y aplicaciones.

---

## 3. Dos Modos de Montaje y Experiencia en Directo

| Aplicación | Modo (`layout`) | Comportamiento de ventana |
|---|---|---|
| `ABDAxionikVS` | `'overlay'` | Drawer superior deslizante clásico (sustituye el monolito `NukeDrawer.ts` por un adaptador fino sobre `PerformanceDeck`). |
| `ABDMCX0X` | `'modeless'` | `<dialog>` no modal (`dialog.show()`, `attachDialogDrag` + `bringToFront`, sin backdrop bloqueante, idéntico a `McxSynthModal.ts`) bajo el nombre `McxPerformanceModal`. |

### Interacción sin cierres y señalización en `ABDMCX0X`
- **Persistente al tocar el exterior:** Pulsar **Bancos A–H**, los **16 botones de pistas**, Escenas `S1..S8`, Mixer, Rack FX, `McxSynthModal` o Teclado **no cierra** el modal; el contenido del deck se adapta en tiempo real a la pista enfocada.
- **Identidad visual ("Carátula") en cabecera:**
  - Barra/acento tintado con el color del Banco activo (`var(--color-bank-a..h)`).
  - Insignia del motor (`TB-303`, `EMAX II`, `LA-32`, `ROMPLER`, `MCS-48`, `DRUMS`), pista (`P01..P64`) y nombre del preset cargado.
- **Toggle `FOLLOW` / `PIN Pxx`:**
  - `FOLLOW` (por defecto): sigue automáticamente al foco al pulsar bancos y los 16 botones.
  - `PIN Pxx`: ancla el deck a una pista concreta para seguir retocándola en directo mientras se mutean o tocan otras pistas.

---

## 4. Modo `EDIT` Inline, `LEARN` y Contrato CDD v2.0

- **Control de visibilidad:** `inlineEdit: false` en `ABDAxionikVS` (su botón `Edit` sigue abriendo `MatrixDrawer`); `inlineEdit: true` en `ABDMCX0X` y sintes universales.
- **Controles por slot al activar `EDIT`** (en cada uno de los 10 knobs y en los ejes `X`/`Y` del Joystick):
  1. **Desplegable agrupado** por `group` del contrato (`Oscillators`, `Filter`, `Envelopes`, `LFO`, `FX`, etc.) listando todos los parámetros con `automatable !== false` y su `name` legible.
  2. **Botón `LEARN`:** activa escucha para capturar cualquier knob tocado en `McxSynthModal` (abierto lado a lado al ser ambos *modeless*).
  3. **Toggle `ON/OFF` (Deshabilitar):** apaga el slot y lo marca deshabilitado fuera de `EDIT`.
  4. **Ajuste compacto `Min / Max` e `Invert`:** acota el recorrido útil del control (ej. limitar un sweep de Cutoff a `15 %–85 %`) o invierte su sentido.
- **Acciones globales de cabecera en modo `EDIT`:** `Reset Engine Default`, `Save as Engine Default`, `Save Preset (.abdperf.json)`, `Load Preset` e `Import from .mcxprj`.

### Extensión de `ABDShared/Contracts/parameter_dictionary.schema.json`
1. **Bloque raíz opcional `"performanceDeck"`:**
   - `macros`: lista ordenada (hasta 10 slots) de `{ paramId, label?, bipolar?, minNorm?, maxNorm?, invert? }`.
   - `xyPad`: `{ x: paramId, y: paramId, labels?: [N, E, S, W] } | null`.
   - `stickLayers`: metadatos opcionales si el motor expone capas de joystick.
   - **Fallback automático por `semanticRole`:** Si un contrato aún no declara `"performanceDeck"`, el resolver en `ABDShared` rellena automáticamente los primeros slots buscando roles transversales (`FilterCutoff`, `FilterResonance`, `FilterEnvDepth` / `DistortionDrive`, `AmpEnvDecay` / `AmpEnvRelease`, `Lfo1Rate`, etc.).
2. **Campos opcionales en `ParameterEntry`:**
   - `"shortName"` (`string`, máx. 10 caracteres): etiqueta abreviada para celdas compactas cuando `name` es largo.
   - `"automatable"` (`boolean`, default `true`): excluye del modo `EDIT` y de grabación de movimiento parámetros de configuración (`VoiceLimit`, `BankSelect`, `PatchMode`).
   - `"automationInterp"` (`"linear" | "step"`, default `"linear"` en continuos/bipolares y `"step"` en `choice`/`boolean`).
3. **Saneamiento de contratos existentes:**
   - Añadir `"id"` raíz faltante en `casio_cz101_parameter_spec.json` y `roland_juno106_parameter_spec.json`.
   - Añadir `"group"` a los 14 parámetros de `roland_juno106_parameter_spec.json`.
4. **Catálogo *browser-safe*:** Exportar un índice ligero de parámetros para navegador/WebView2 sin dependencia de `node:fs`.

---

## 5. Persistencia, Serialización y Presets (4 Capas)

Cada slot del mapa guarda sus asignaciones con forma preparada para multi-destino futuro (`targets: [{ paramId, min, max, invert }]`, con 1 elemento en UI v1 y múltiples sin migración en v2) más `enabled: boolean` y `label?: string`.

1. **Capa 1 — Factory Default:** bloque `"performanceDeck"` del contrato CDD v2.0 (`*_parameter_spec.json`). Inmutable; base del botón `Reset`.
2. **Capa 2 — Default de usuario por motor (opcional):** preferencia global del usuario para un `engineId` concreto en `<WorkingDir>/PerformanceMaps/_defaults/<engineId>.abdperf.json` (con fallback `localStorage`).
3. **Capa 3 — Estado serializado en el proyecto (`.mcxprj`):** campo `performanceMaps` en `McxProjectDto`, indexado por `(partId, engineId)` guardando solo los overrides activos. Al cambiar el motor de una pista se validan los `paramId` contra el nuevo contrato (si no coinciden, aplica el mapa del nuevo motor conservando el anterior si se vuelve atrás).
4. **Capa 4 — Presets portables (`.abdperf.json`) e Importación entre proyectos:**
   - Guardar/cargar mapas en `<WorkingDir>/PerformanceMaps/<engineId>/<slug>.abdperf.json` (y descarga/subida JSON en modo navegador).
   - Importar directamente el mapa de una pista desde otro archivo `.mcxprj` sin cargar el proyecto completo.
5. **MIDI Learn universal:** Los 10 knobs y ejes `X/Y` se registran en `midiLearnStore` con claves estables (`perf.macro.1..10`, `perf.xy.x`, `perf.xy.y`) para mapear un controlador hardware una sola vez y controlar cualquier motor al cambiar de banco o pista.

---

## 6. Grabación y Reproducción de Movimientos sin Saltos

### Regla de oro en grabación y reproducción
- Se graba **siempre el `paramId` real del parámetro destino** (ej. `"cutoff"`), **nunca** `"slot_1"`. Reorganizar el `PerformanceDeck` después nunca rompe la automatización ya grabada ni el export a MIDI CC (si el contrato define `cc`).
- `McxPatternSequencer` ampliará `motionLanes` de `4` a `12–16` pistas por parte indexadas por hash `uint32_t` del `paramId` canónico, con `recordLiveMotion` en `McxPatternSequencerRecord.cpp`, compresión (*thinning* cuando `|Δv| > 0.004`) e interpolación `linear` o `step` según `automationInterp`.
- **Modos de escritura al grabar (`REC` / `MOTION REC`):**
  - **`TOUCH` (por defecto):** solo graba mientras se sujeta/mueve el control; al soltar devuelve la curva previa con crossfade suave (`40–80 ms`).
  - **`LATCH`:** inicia escritura al tocar y sostiene el último valor hasta detener grabación o cierre de bucle.

### Cero saltos al tocar durante reproducción (`PLAY` sin `REC`)
1. **En pantalla (ratón/táctil):**
   - **Modo por defecto — `OVERRIDE + ↺ RE-ENABLE AUTO` (estándar Ableton Live):** al tocar una lane automatizada, solo esa lane suspende su automatización y pasa a control manual sin lucha ni saltos. Al pulsar `↺ RE-ENABLE AUTO` en cabecera, reengancha con rampa suave de `40–80 ms`.
   - **Modo opcional de directo — `AUTO-RETURN` (estándar Roland MC-707 / Elektron):** manda la mano mientras se mantiene pulsado y al soltar vuelve suavemente (`40–80 ms`) o cuantizado al siguiente compás.
2. **Desde hardware MIDI externo (Takeover configurable en Ajustes):**
   - **`SCALE` (por defecto):** escalado proporcional desde el valor actual al rango físico; responde de inmediato sin ningún salto.
   - **`PICK-UP`:** ignora el físico hasta cruzar el valor actual, mostrando indicador visual de recogida.
   - **`JUMP`:** salto inmediato (para cortes rápidos tipo DJ).
3. **Capa final DSP (RT-safe):** suavizado anti-clic (`5–15 ms` según `"smoothing"` del contrato) + rampa de retorno de automatización (`40–80 ms`), sin alocaciones en el hilo de audio.

---

## 7. Plan de Implementación por Bloques

1. **Bloque A — Contratos y Store Puro (`ABDShared`):** extender `parameter_dictionary.schema.json`, sanear `casio_cz101` y `roland_juno106`, rellenar `"performanceDeck"` en los motores principales, exponer catálogo *browser-safe* y crear `performanceMapStore` + tests Vitest.
2. **Bloque B — Componente Aséptico `PerformanceDeck` (`ABDShared`):** modularizar (`< 200` líneas por archivo, `0` `#hex`) con 10 knobs asépticos + `TrajectoryStick2D` + modo `'overlay' | 'modeless'` + slots deshabilitados + `inlineEdit` (`EDIT` / `LEARN` / `Min-Max` / `ON-OFF`) + `footerSlot`.
3. **Bloque C — Recableado de `ABDAxionikVS`:** reemplazar el monolito `NukeDrawer.ts` (713 líneas) por un adaptador fino sobre `PerformanceDeck` en modo `'overlay'` preservando `Resys 1/2/Silver`, `Sphere/Scape`, `L1..L3`, 6 moduladores bipolares y botón `Edit` → `MatrixDrawer`.
4. **Bloque D — Integración Completa en `ABDMCX0X`:** crear `McxPerformanceModal` (`layout: 'modeless'`, `FOLLOW/PIN`, carátula por banco/motor, tira fija de pista), serialización en `McxProjectManager.ts` (`.mcxprj`) + `<WorkingDir>/PerformanceMaps/` (`.abdperf.json` + importar de `.mcxprj`), conexión con `midiLearnStore` / `McxQLinksModel` y ampliación de `McxPatternSequencer` para Motion Recording + `TOUCH/LATCH` + `Override/Auto-Return` + `Takeover`.
5. **Bloque E — Documentación de Integración Transversal (`ABDShared/docs/INTEGRACION_PERFORMANCE_DECK.md` + `ABDShared/Components/PerformanceDeck/README.md`):** guía paso a paso para integrar `PerformanceDeck` en cualquier sinte actual o futuro de la suite ABDSynths (declaración `"performanceDeck"` en CDD v2.0, modo `'overlay'` vs `'modeless'`, `inlineEdit`/`LEARN`, `stickToolbarSlot`/`footerSlot`, presets `.abdperf.json`, MIDI Learn universal y automatización sin saltos).
