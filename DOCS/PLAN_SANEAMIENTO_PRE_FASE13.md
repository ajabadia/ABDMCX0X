# Plan de Saneamiento Integral Pre-Fase 13 (`ABDMCX0X` + `ABDShared`)

**Estado:** `[BLOQUEANTE]` Puerta de calidad obligatoria antes de ampliar el núcleo a 64 pistas en la Fase 13.
**Origen:** Auditoría integral de código, sincronía DSP/WASM/WebUI y ergonomía `1280x720`.
**Documento maestro vinculado:** [ROADMAP.md](file:///d:/desarrollos/ABDSynths/ABDMCX0X/ROADMAP.md)

---

## Reglas de Oro durante la Ejecución

1. **Compilación y Git exclusivos del usuario:** Ningún agente debe ejecutar `build.bat`, CMake, Vite build, CTest, Vitest ni comandos `git commit` / `git push`. El usuario ejecuta las compilaciones y pruebas al cierre de cada oleada.
2. **Límites estrictos de líneas por archivo:**
   - C++ (`.h`, `.cpp`): estrictamente `< 300` líneas (objetivo práctico de margen `<= 270` líneas antes de Fase 13).
   - WebUI (`.ts`, `.js`, `.css`): estrictamente `< 200` líneas (objetivo práctico `<= 180` líneas).
3. **Cero colores fijos:** Prohibido usar literales hexadecimales o funciones de color numéricas; 100 % tokens y variables CSS de tema (`var(--...)`).
4. **Cero emojis o glifos Unicode textuales en UI:** Toda la iconografía debe ser SVG vectorial monocromático con `currentColor`.
5. **Idioma y trazabilidad:** Documentación y comunicación en español, manteniendo coherencia de contratos entre [ABDMCX0X](file:///d:/desarrollos/ABDSynths/ABDMCX0X) y [ABDShared](file:///d:/desarrollos/ABDSynths/ABDShared).

---

## Resumen de Oleadas

| Oleada | Foco Principal | Ítems Cubiertos | Criterio de Salida |
| :--- | :--- | :--- | :--- |
| **P0** | Integridad DSP, tiempo real audio, contratos puente y errores bloqueantes | `[CR-01]` .. `[CR-11]` | Audio, rack FX, MIDI, pianola y paneles de sinte sin cuelgues, sin fugas ni pérdida silenciosa de parámetros (**IMPLEMENTADO — Pendiente verificación de usuario**) |
| **P1** | Sincronía total de los 3 mundos (C++ / WASM / WebUI), persistencia DAW y telemetría real | `[ME-06]`, `[ME-07]`, `[ME-08]`, `[DT-01]`, `[DT-02]`, `[DT-03]`, `[DT-06]` | Cero controles placebo en Rack/Master/Mix; estado y bancos persistidos en DAW y WebUI al recargar |
| **P2** | Ergonomía `1280x720`, ventanas flotantes modeless y claridad conceptual UX | Ergonomía `1280x720`, `[ME-09]`, `[DT-04]`, `[DT-05]`, claridad pista/sinte/secuenciador | 16 tiras + Rack + Master visibles sin recorte horizontal a `1280x720`; modales modeless movibles con z-order estable |
| **P3** | Saneamiento DRY, tokens CSS, iconografía SVG, límites de líneas y coherencia documental | `[ME-01]` .. `[ME-05]`, `[ME-10]`, `[DT-07]` | 0 tokens CSS indefinidos, 0 colores fijos y 0 emojis en `ABDShared`/`ABDMCX0X`; todos los archivos bajo `< 300` / `< 200` líneas; `tsc` limpio |
| **P4** | Cobertura automática de integración y holgura estructural para Fase 13 (`kNumParts = 64`) | Tests Rack/Secuenciador + partición preventiva de archivos al límite | Suite CTest, Vitest y verificación de tipos en verde ejecutados por el usuario; archivos puente con holgura `< 260` / `< 180` líneas |

---

## Oleada P0 — Bloqueantes Críticos (DSP, Realtime, Contratos y Modales Rotas)

Objetivo: eliminar fallos funcionales silenciosos, mutaciones inseguras en el hilo de audio y bloqueos de interfaz antes de tocar ninguna otra capa.

### Señal Audio, Rack FX y Seguridad Tiempo Real
- [x] **`[CR-01]` Corregir ruta Master y Multi-Bus FX cuando hay bahías activas en Rack:** *(Pendiente compilación/test de usuario)*
  - En [McxOutputAndFx.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/DSP/FX/McxOutputAndFx.cpp#L204-L239), cuando `anyRouted == true` (situación por defecto al activarse ranuras 0 y 1 en `prepare()`), la rama `else` ejecuta `rack_.getLimiter().process(dryL, dryR, n)` omitiendo `masterGain` y saltándose `rack_.processMultiBus(...)` (topologías `0..9`, macros `17..20` y telemetría `peakSendA..D`). Unificar la salida aplicando siempre `masterGain`, procesando el multi-bus cuando proceda y conservando los vúmetros de envíos vivos.
- [x] **`[CR-02]` Implementar bypass real por ranura, mezcla Dry/Wet y motores DSP faltantes en `McxRackChassis`:** *(Pendiente compilación/test de usuario)*
  - En [McxRackChassis.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/DSP/FX/McxRackChassis.cpp#L156-L198) y [McxRackSlot.h](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/DSP/FX/McxRackSlot.h#L18-L20), respetar `st.bypassed` al inicio de `processSlot()`, aplicar mezcla `st.dryWetMix` sobre los buffers de entrada/salida y completar las ramas DSP faltantes para `MidasEq`, `FairComp` y `MoodFilter` (o retirar sus enumeradores/carátulas si no van a existir en esta fase).
  - Ampliar [McxPhase10RackChassisTests.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Tests/McxPhase10RackChassisTests.cpp#L55-L74) para que `testT3_BypassAndPassThrough` verifique explícitamente `setSlotBypass(true)` y `dryWetMix`.
- [x] **`[CR-03]` Eliminar mutaciones directas al hilo de audio desde el hilo UI de JUCE:** *(Pendiente compilación/test de usuario)*
  - En [PluginEditor.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Plugin/PluginEditor.cpp#L196-L260) y [McxRackBridgeHelpers.h](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Plugin/McxRackBridgeHelpers.h#L9-L84), enrutar `handleRackJsEvent` (incluyendo `std::swap((*dsp_)[from], (*dsp_)[to])`), `resetToFactory` y `loadBankFromMemory` a través de comandos lock-free en [McxCommandQueue.h](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Core/McxCommandQueue.h) o mecanismo de doble búfer seguro en bloque de audio, evitando carreras entre hilo UI y `processBlock()`.
- [x] **`[CR-08]` Corregir colas FX de inserción directa, doble procesado de bahías compartidas y cola corta (`2.5 s`):** *(Pendiente compilación/test de usuario)*
  - En [McxEngine.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/DSP/Core/McxEngine.cpp#L134-L155) y [McxEngine.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/DSP/Core/McxEngine.cpp#L240-L272), no omitir `processSlot(p.insertSlot)` cuando `!eng->renderBlock()` si el slot aún tiene cola o actividad; detectar y prevenir el doble procesado por bloque de una misma bahía compartida entre inserción directa, envío y cadena en [McxOutputAndFx.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/DSP/FX/McxOutputAndFx.cpp#L206-L230); calcular `fxTailSamplesLeft_` dinámicamente o ampliarlo para cubrir colas largas de `3.5 s - 5.0 s`.
- [x] **`[CR-09]` Remapear rutas al reordenar/eliminar bahías y cablear parámetros reales de carátula FX:** *(Pendiente compilación/test de usuario)*
  - Al mover o vaciar ranuras desde [McxRackChassis.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/DSP/FX/McxRackChassis.cpp#L70-L77), actualizar coherentemente `chainTargetSlot`, `sendSlotTargets_[4]` y `part.insertSlot` de todas las pistas.
  - En [McxRackColumn.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxRackColumn.ts#L136-L151), [main.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/main.ts#L126-L132) y [McxRackSlotBridge.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/bridge/McxRackSlotBridge.ts#L52-L96), sincronizar bidireccionalmente los cambios de `FxFaceplateModal` hacia `McxRackColumn.slots`/`localStorage` y mapear todos los parámetros específicos (`mode`, `echoVol`, `bass`, `treble`, `size`, `preDelay`, `lowCut`, `depth`, `width`, `noise`, `spread`, `bias`, `level`).

### Contratos Bridge, WASM, MIDI y Modales Rotas
- [x] **`[CR-04]` Corregir tabla `mcxParamIds.ts`, guardia de claves indefinidas y contrato de `GlobalLfoModal`:** *(Pendiente compilación/test de usuario)*
  - En [McxHostBridge.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/bridge/McxHostBridge.ts#L115-L119) y [mcx0xWorklet.js](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/wasm/mcx0xWorklet.js#L75), validar que `WASM_PARAM_ID[key] !== undefined` antes de enviar o coercionar (`data.paramId | 0` estaba colapsando claves ausentes sobre `paramId = 0`, `filterCutoff`).
  - Completar [mcxParamIds.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/bridge/mcxParamIds.ts) y [McxParamRouter.h](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Core/McxParamRouter.h#L211-L215) para cubrir `arpMotif`, `arpSwing`, `driveType` y los parámetros reales del arpegiador (`octaves`, `rate`, `gate`, `latch`) desde [McxMidiModalsFactory.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/app/McxMidiModalsFactory.ts#L54-L66), [McxToneDrawer.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxToneDrawer.ts#L138) y [McxToneTabMix.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxToneTabMix.ts#L65).
  - En [McxModalsFactory.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/app/McxModalsFactory.ts#L119-L126) y [globalLfoModal.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/GlobalLfo/globalLfoModal.js#L134), alinear la firma de 2 argumentos `bridge.setParam('globalLfo1_...', val)` hacia la pista global/part correspondiente con IDs explícitos.
- [x] **`[CR-05]` Corregir escala de velocidad MIDI (`8..127` vs `0..1`) entre `MpcPadMatrix` y `McxMidiModalsFactory`:** *(Pendiente compilación/test de usuario)*
  - En [McxMidiModalsFactory.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/app/McxMidiModalsFactory.ts#L17-L26), eliminar la multiplicación `vel * 127` tras recibir `vel` en rango `8..127` desde [MpcPadMatrix.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/Controls/MpcPadMatrix.js#L166-L167), normalizando correctamente para el LCD (`%`), la grabación en pianola y el motor de audio (`16 Levels`).
- [x] **`[CR-06]` Arreglar `McxSynthModal` (pantalla en blanco al reabrir, listener de ruta externa y modo modeless):** *(Pendiente compilación/test de usuario)*
  - En [McxSynthModal.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxSynthModal.ts#L71-L157), destruir o reutilizar limpiamente el `EnginePanelHost` anterior al hacer `render()`, invalidar `mountedPart`/`mountedEngineTypeId` cuando el contenedor DOM se recrea, enlazar el evento clic de `[data-act="open-route"]` después de `syncEnginePanel()` y cambiar `showModal()` por `show()` modeless.
- [x] **`[CR-07]` Exportar `_drainMidiOut` en WASM y respetar `portIndex` en salida WebMIDI:** *(Pendiente compilación/test de usuario)*
  - Añadir `_drainMidiOut` a `EXPORTED_FUNCTIONS` en [CMakeLists.txt](file:///d:/desarrollos/ABDSynths/ABDMCX0X/wasm/CMakeLists.txt#L81) revisando su implementación en [WasmBridge.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Wasm/WasmBridge.cpp#L135-L149).
  - En [mcx0xWorklet.js](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/wasm/mcx0xWorklet.js#L164-L170) y su copia pública, preservar `msg.portIndex`; en [McxWebMidiService.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/midi/McxWebMidiService.ts#L127-L141), enviar por el puerto seleccionado en vez de usar siempre `outputs[0]`.
- [x] **`[CR-10]` Corregir constructor y cuantización de `PianoRollModal`:** *(Pendiente compilación/test de usuario)*
  - En [pianoRollModal.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/PianoRoll/pianoRollModal.js#L14-L25), asignar `this.opts = options` y `this.partIndex = options.partIndex ?? 0` para evitar el `TypeError` al pulsar el botón Groove (`#L95`), y acotar `startTick` cuantizado (`#L177`) dentro de `[0, totalTicks - minStep]` para que ninguna nota quede en `startTick === totalTicks`.
- [x] **`[CR-11]` Hacer `MpcPadModal` no bloqueante (`show()`) y sincronizar estado de cierre:** *(Pendiente compilación/test de usuario)*
  - En [MpcPadModal.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/Pads/MpcPadModal.js#L112-L135), sustituir `showModal()` por `show()` y registrar el evento `'close'` del diálogo para restablecer `this.opened = false`.

---

## Oleada P1 — Sincronía de los 3 Mundos (C++ / WASM / WebUI) y Persistencia

Objetivo: garantizar que ningún control visible sea placebo, que el estado sobreviva a recargas de proyecto DAW / navegador y que la telemetría refleje valores reales del DSP.

- [ ] **`[ME-06]` Cablear controles placebo en Multi-Bus FX Rack, WASM, Master y Presets:**
  - Alinear eventos en [multiBusFxRackModal.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/MultiBusFxRack/multiBusFxRackModal.js) (`setMute` vs `muteSendBus`, `setTopology`, `setCascadeInjections`, `setGate`, `lim-toggle`, `toggle-sync`) y montar el knob `limCeiling`.
  - Exponer y atender en WASM y [mcx0xWorklet.js](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/wasm/mcx0xWorklet.js) los mensajes faltantes: `setSendBusMute`, `requestEngineCatalog`, `requestPartPresets`, `setLimiterEnabled`, `setManualDuckGate`, `setAudioDuckEnabled` y `setMidiDuckEnabled`.
  - En [McxMasterPanel.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxMasterPanel.ts#L114-L132), conectar `LIM`, `onRecord`, `onLoop` y pasar la pista enfocada actual en vez de `onOpenGroove(0)` fijo.
  - Persistir el nombre/preset guardado desde `McxSavePresetModal` y `McxBankDrawer` en C++ / estado serializable en lugar de mutar únicamente `ps.name` en RAM.
- [ ] **`[ME-07]` Unificar persistencia de estado en DAW (`setStateInformation`), rack local y señal `uiReady`:**
  - En [PluginProcessor.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Plugin/PluginProcessor.cpp#L241-L274), [PluginEditor.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Plugin/PluginEditor.cpp#L178-L186) y [McxBankManagerBridge.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Core/McxBankManagerBridge.cpp#L43-L82), asegurar que `setStateInformation` emita una resincronización completa hacia la WebUI en cuanto `uiReady` llegue, sin perder cambios si la ventana WebView aún no estaba montada al restaurar sesión.
  - Evitar en [McxRackColumn.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxRackColumn.ts#L31-L38) que la lectura inicial de `localStorage` sobrescriba el estado real cargado desde el proyecto DAW o banco `.abdbank`.
- [ ] **`[ME-08]` Unificar sincronía de pista enfocada, formato (Drum Map / Cromático), `McxStepStrip` y listeners:**
  - Centralizar en [McxAppState.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/app/McxAppState.ts#L113-L135) el cambio de pista y modo (`trackFormat` / `routeMode`), actualizando automáticamente [McxStepStrip.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxStepStrip.ts#L58-L131), [McxInstrumentRouteModal.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxInstrumentRouteModal.ts#L98-L105) y el cableado de [main.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/main.ts#L99-L100).
  - En [McxHostBridge.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/bridge/McxHostBridge.ts#L99), permitir múltiples suscriptores de `onAudioStatus` o desacoplar para que [main.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/main.ts#L170) no sobrescriba el listener registrado en [McxSongWiring.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/app/McxSongWiring.ts#L131).
- [ ] **`[DT-01]` Integrar `McxMidiModDecimator.h` en `McxHardwareBridge` (o retirarlo si queda sustituido):**
  - Resolver el archivo huérfano `McxMidiModDecimator.h` conectando el decimador en el puente MIDI hardware o eliminando el código no utilizado.
- [ ] **`[DT-02]` Migrar mutación directa de `p.partials` en `McxParamRouter.h`:**
  - En [McxParamRouter.h](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Core/McxParamRouter.h#L26-L61) (`case 0..5`), asegurar que los parámetros de parciales sigan las reglas de comando/enrutado limpio compatibles con el refactor multi-motor y futura expansión a 64 pistas.
- [ ] **`[DT-03]` Corregir doble envío de `partLevel` y sincronía de `McxGlobalDrawer` / `McxSettingsModal` / `McxMasterPanel`:**
  - Eliminar el envío duplicado de `partLevel` en [McxMixerConsole.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxMixerConsole.ts#L180) y mantener sincronizados los estados iniciales de `McxGlobalDrawer`, `McxSettingsModal` y `McxMasterPanel` al cambiar de banco o proyecto.
- [ ] **`[DT-06]` Sustituir `lfoPhase` simulado por telemetría real del DSP:**
  - En [PluginProcessor.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Plugin/PluginProcessor.cpp#L205) y [McxInputAndTelemetry.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/app/McxInputAndTelemetry.ts#L134), emitir la fase real del LFO en curso desde el motor DSP.

---

## Oleada P2 — Ergonomía `1280x720`, Ventanas Modeless y Claridad UX

Objetivo: que la workstation completa quepa de una pieza a `1280x720`, con modales flotantes coherentes y separación visual clara entre configurar pista, editar sonido y secuenciar.

- [ ] **Ajuste de rejilla horizontal a `1280x720` (cero desborde en mezclador y Master):**
  - Revisar anchos en [mcx-rack-column.css](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/styles/mcx-rack-column.css#L4) (`240px`), [mcx-master-panel.css](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/styles/mcx-master-panel.css#L4) (`108px`) y paddings de [mcx-workspace.css](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/styles/mcx-workspace.css) para que las 16 tiras (`P01..P16`, actualmente recortadas en ~86 px en `P15-P16`) quepan íntegras junto al Rack y Master sin scroll horizontal forzado.
  - Alojar `.mcx-master-quick-row` (`LIM`, `SHUFFLE`, `SONG`) y `CompactTransportBar` aprovechando `.mcx-transport-dock` ya declarado en [mcx-workspace.css](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/styles/mcx-workspace.css#L85-L104) o redistribuyendo el ancho del Master para evitar compresión en `108px`.
- [ ] **`[ME-09]` Estandarizar comportamiento modeless, dragging, z-order y limpieza de eventos en ventanas flotantes:**
  - Unificar `McxSynthModal`, `MpcPadModal`, `GrooveArpeggiatorModal`, `PianoRollModal`, `FxFaceplateModal` y `McxInstrumentRouteModal` con apertura no bloqueante (`show()`), arrastre mediante `attachDialogDrag`, gestor compartido `bringToFront(dialog)` y cierre con `Escape` sin fugas.
  - Añadir `position: fixed` y `z-index` en [groove-arpeggiator-modal.css](file:///d:/desarrollos/ABDSynths/ABDShared/Assets/styles/components/groove-arpeggiator-modal.css#L4-L13).
  - Limpiar listeners globales `window.keydown` al cerrar en [MpcPadModal.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/Pads/MpcPadModal.js#L100) y [GrooveArpeggiatorModal.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/Arpeggiator/GrooveArpeggiatorModal.js#L99).
  - Reemplazar telemetría estática en [FxFaceplateModal.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/FxFaceplates/FxFaceplateModal.js#L58-L70) (`SC DUCK [ON]`, `mix=1.0`, `44.1 kHz`) por valores reales de la bahía y frecuencia de muestreo activa.
  - Añadir `role="button"` y `tabindex` accesible en [MpcPadMatrix.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/Controls/MpcPadMatrix.js).
- [ ] **`[DT-05]` Sustituir `window.prompt()` en `McxRackColumn`:**
  - En [McxRackColumn.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxRackColumn.ts#L161), reemplazar `window.prompt()` por un selector/menú popover no bloqueante estilizado con tokens CSS del tema.
- [ ] **Claridad conceptual (Pista vs Motor vs Secuenciador), `SOLO ACTIVE — CLEAR`, i18n y atajos:**
  - Eliminar o implementar realmente el botón muerto `NUKE` en [McxMixerConsole.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxMixerConsole.ts#L132) y revisar los macros heredados de Reverb/Chorus en [McxGlobalDrawer.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxGlobalDrawer.ts#L87-L108) frente al nuevo Rack FX.
  - Añadir botón e indicador maestro `SOLO ACTIVE — CLEAR` para limpiar todos los Solos activos de un clic.
  - Diferenciar claramente la acción de ruta de pista vs editor de síntesis en [McxToneDrawerSync.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxToneDrawerSync.ts#L34), completar o retirar la tarjeta vacía `Macros` (`0` knobs) en [McxToneTabMidiFx.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxToneTabMidiFx.ts#L60-L71) y aclarar etiquetas de puertos Layer A+B en [McxInstrumentRouteModalView.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxInstrumentRouteModalView.ts#L86).
  - **`[DT-04]`** Implementar [McxToneDrawer.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxToneDrawer.ts) `setLocale()`, eliminar cadenas fijas solo en español y completar atajos (`Ctrl+S`, `Ctrl+O`, `Ctrl+,`, `Ctrl+4`, `Esc` Panic) en [McxInputAndTelemetry.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/app/McxInputAndTelemetry.ts).

---

## Oleada P3 — Saneamiento DRY, Tokens CSS, SVG, Límites `< 300` / `< 200` y Coherencia Documental

Objetivo: dejar `ABDMCX0X` y los componentes compartidos consumidos en `ABDShared` al 100 % conformes con las Reglas de Oro y sin código muerto ni duplicidades.

- [ ] **`[ME-01]` Definir y corregir los 11 tokens CSS faltantes en el sistema de temas:**
  - Resolver en `tokens.css` o mapear en las hojas consumidoras los tokens actualmente indefinidos: `--radius-xs`, `--tracking-wide`, `--radius-full`, `--color-bg-primary`, `--color-bg-secondary`, `--color-border-strong`, `--color-control-bg`, `--color-shadow`, `--color-text-primary`, `--color-text-secondary` (afectan a `fx-faceplates.css`, `mpc-pad-modal.css`, `groove-arpeggiator-modal.css`, [McxToneTabMix.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxToneTabMix.ts#L86-L88), [multiBusFxViews.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/MultiBusFxRack/multiBusFxViews.js#L57) y 12 CSS de `ABDMCX0X`).
  - Revisar el alcance de `--fx-base-color` / `--fx-accent-color` fuera del backdrop de `FxFaceplateModal`.
- [ ] **`[ME-02]` Erradicar el 100 % de colores fijos (`hex`, `rgb`, `rgba`) en `ABDShared` consumido por `ABDMCX0X`:**
  - Migrar a variables CSS / tokens de tema los colores fijos detectados en: [multiBusFxRegistry.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/MultiBusFxRack/multiBusFxRegistry.js), [fxFaceplateRegistry.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/FxFaceplates/fxFaceplateRegistry.js) (unificando además los metadatos duplicados entre ambos registros), `pianoRollContract.js`, `TapeEchoVisual.js`, `PeakLED.js`, `performanceDeck.css`, `widgets.css`, `step-button-strip.css`, `mpc-pad-matrix.css`, `piano-roll.css`, `compact-transport-bar.css`, `compact-stereo-vu.css`, `AboutDialog.css`, `SynthNavBar.css`, `navbar.css`, `modals.css` y `pills.css`.
- [ ] **`[ME-03]` Reemplazar todos los emojis y glifos Unicode textuales por iconos SVG `currentColor`:**
  - Eliminar emojis residuales (`U+23F3` en [McxSceneBar.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxSceneBar.ts#L122), `U+26A0` en `pianoRollContract.js#L166,175` y `bankShell.js#L354`) y glifos Unicode textuales (`U+2715`, `U+2630`, `U+2794`, `U+25B2`, `U+25BC`, `U+25CF`, `U+25EF`, `U+2713`) en `ABDMCX0X` (`McxRackColumn.ts`, `McxToneDrawerSync.ts`, `McxGlobalDrawer.ts`, `McxSongDrawerViews.ts`, `McxSavePresetModal.ts`) y en `ABDShared` (`Drawer.js`, `drawer.js`, `trajectoryStick2D.js`, `hardwareRoutingDiagram.js`, `FxFaceplateModal.js`, `AboutDialog.js`, `globalLfoViews.js`, `grooveShuffleViews.js`, `compactStereoVu.js`).
- [ ] **`[ME-04]` Modularizar todos los archivos que exceden los límites `< 300` (C++) y `< 200` (Web/CSS):**
  - En `ABDShared` C++: dividir `GrooveArpeggiator.h` (actualmente `301` líneas) por debajo de `270` líneas.
  - En `ABDShared` JS/CSS consumidos o compartidos: fragmentar `SynthNavBar.js` (`617`), `AboutDialog.js` (`409`), `bankShell.js` (`384`), `XYPad.js` (`310`), `Segmented.js` (`300`), `Wheel.js` (`295`), `Select.js` (`240`), `Slider.js` (`237`), `Knob.js` (`233`), `widgets.css` (`1708`), `bank-manager.css` (`1298`), `step-button-strip.css` (`541`), `kbd-buttons.css` (`483`), `tokens.css` (`418`), `global-lfo-modal.css` (`402`), `SynthNavBar.css` (`389`), `AboutDialog.css` (`384`), `multi-bus-fx-rack.css` (`329`) y `compact-stereo-vu.css` (`215`).
  - Mantener `0` archivos por encima del límite en `ABDMCX0X` creando margen preventivo (siguiente punto en P4).
- [ ] **`[ME-05]` Consolidar archivos duplicados en `ABDShared` y retirar código muerto en `ABDMCX0X`:**
  - Unificar en `ABDShared` las copias divergentes entre `Components/{Pads,Arpeggiator,FxFaceplates}/styles/*.css` y `Assets/styles/components/*.css`, así como `SynthNavBar.css` vs `navbar.css` (ambos importados en [main.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/main.ts)), `drag-core.js` vs `DragCore.js`, `SynthNavBar.js` vs `synthNavBar.js` y `Drawer.js` vs `drawer.js`.
  - Retirar tras confirmar que no tienen referencias activas: `McxPadsDrawer.ts`, `McxPadsDrawerViews.ts`, `McxDrumPads.ts`, `mcx-pads-drawer.css`, `mcx-lfo-panel.css`, `mcx-lfo-targets.css`, `mcx-strip-controls.css`, `mcx-vu-modal.css` y los 22 knobs sin montar de [McxToneDrawerKnobs.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxToneDrawerKnobs.ts).
- [ ] **`[ME-10]` y `[DT-07]` Alinear documentación con realidad, reparar `tsc` y limpiar `HANDOFF.md`:**
  - Decidir y documentar correctamente en [ANALISIS_Y_PLAN_PLUGINS_MIDI_Y_ARQUITECTURA_INSERCIONES.md](file:///d:/desarrollos/ABDSynths/ABDMCX0X/DOCS/ANALISIS_Y_PLAN_PLUGINS_MIDI_Y_ARQUITECTURA_INSERCIONES.md) el estado real de `MidiFaceplates/` y `midiFaceplateBridge.ts` (o implementarlos si forman parte obligatoria del contrato antes de 64 pistas).
  - Corregir los 11 errores preexistentes de TypeScript (`tsc`) y eliminar el párrafo duplicado en [HANDOFF.md](file:///d:/desarrollos/ABDSynths/ABDMCX0X/HANDOFF.md#L53-L54).

---

## Oleada P4 — Pruebas de Integración y Holgura para Fase 13 (`64 Pistas`)

Objetivo: dejar el código preparado estructuralmente para pasar `kNumParts = 16 -> 64` sin romper límites de líneas ni introducir regresiones silenciosas.

- [ ] **Dividir archivos de `ABDMCX0X` pegados al límite (`289..299` C++ y `186..199` WebUI):**
  - Refactorizar con holgura (`<= 260` C++ / `<= 175` JS-TS) al menos: [WasmBridge.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Wasm/WasmBridge.cpp) (`299`), [PluginProcessor.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Plugin/PluginProcessor.cpp) (`295`), `McxSongAndScenes.cpp` (`291`), [PluginEditor.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Plugin/PluginEditor.cpp) (`290`), [McxParamRouter.h](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/Core/McxParamRouter.h) (`290`), [McxEngineMultiEngine.cpp](file:///d:/desarrollos/ABDSynths/ABDMCX0X/Source/DSP/Core/McxEngineMultiEngine.cpp) (`290`), [mcx0xWorklet.js](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/wasm/mcx0xWorklet.js) (`199`, sincronizado con `public/wasm/mcx0xWorklet.js`), [main.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/main.ts) (`198`), [McxHostBridge.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/bridge/McxHostBridge.ts) (`198`), [McxGlobalDrawer.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxGlobalDrawer.ts) (`198`) y [McxSettingsModal.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxSettingsModal.ts) (`197`).
- [ ] **Añadir pruebas automáticas para los fallos cerrados en P0-P1:**
  - Bypass por bahía, mezcla Dry/Wet, `masterGain` con rack ruteado, envíos Multi-Bus A..D, inserción directa sin doble procesado, conservación de rutas al reordenar bahías y casos de regresión de `PianoRollModal`, `McxMidiModalsFactory` y `McxSynthModal`.

---

## Verificación del Usuario (A ejecutar manualmente tras cada oleada)

> Recordatorio: según la Regla de Oro 1, estos comandos los ejecuta el usuario en su terminal tras revisar los cambios de cada oleada.

```powershell
# 1. Compilación completa (C++ Plugin/Tests + WASM + WebUI)
.\build.bat full

# 2. Suite de pruebas nativas CTest (DSP, Rack Chassis, Multi-Engine, Secuenciador)
ctest --test-dir build --output-on-failure

# 3. Verificación estática de tipos TypeScript y pruebas unitarias WebUI
cd WebUI
npx tsc --noEmit
pnpm test
```

### Checklist Final de Apertura de Puerta para Fase 13
- [ ] Todas las pruebas CTest, Vitest y `tsc --noEmit` pasan sin errores tras el saneamiento.
- [ ] Verificación visual manual a `1280x720` en DAW/Standalone y navegador: 16 pistas + Rack + Master caben sin recorte ni solapamientos.
- [ ] Escaneo estático limpio: 0 archivos sobre límite de líneas (`< 300` C++ / `< 200` Web), 0 colores fijos y 0 emojis en `ABDMCX0X` y `ABDShared`.
