# Integración de Carátulas, Metadatos de Motor y Portadas de Banco (.abdbank)

> **Documento de Arquitectura e Integración Transversal**  
> **Fecha:** 2026-11-19  
> **Estado:** Implementado y Verificado  
> **Ámbito:** `ABDMCX0X` (Host DAW / Groovebox) ↔ `ABDShared` (SynthEngines & Bank Infrastructure)

---

## 1. Filosofía Arquitectónica: Asignación de Pista vs. Edición de Instrumento

Siguiendo el flujo de trabajo natural de un músico en una estación de trabajo / DAW profesional, el sistema separa estrictamente dos momentos:

1. **Configuración y Asignación de Pista (`McxInstrumentRouteModal.ts`):**
   - **Paso 1 — Destino del Instrumento:** ¿Es un motor **Interno (DSP)**, un sintetizador **Externo (MIDI Out)** o una **Capa Doble (A+B)**?
   - **Paso 2 — Instrumento Concreto:**
     - Si es *Interno*: Selector de motor de síntesis (`Structured Rompler`, futuros sintes FM, VA, etc.) y preset de inicio.
     - Si es *Externo*: Puerto MIDI y Canal MIDI asignados a la pista.
   - **Paso 3 — Formato Musical (si aplica):**
     - Si el motor soporta ambos modos (ej. el Rompler): Permite conmutar entre *Cromático (Melodía)* y *Batería / Drum Map*.
     - Si el motor es exclusivo por contrato (ej. un sinte solo tonal o una caja de ritmos pura): El formato queda automáticamente fijado sin obligar al usuario a elegir una opción redundante.

2. **Ventana de Edición del Instrumento (`McxSynthModal.ts`):**
   - Es **exclusivamente para editar el instrumento activo** de esa pista y gestionar sus presets.
   - La cabecera del host es limpia y estática: identificador `[P01]`, nombre del instrumento cargado y botón `[ ⇄ Cambiar Instrumento ]` para invocar el configurador de pista.
   - **No existe ningún desplegable `<select>` de cambio de motor en la cabecera:** cambiar de motor es una decisión estructural de la pista que pertenece al paso de asignación, no a la ventana de edición.
   - El cuerpo de la ventana aloja el frontal auténtico (`StructuredRomplerPanel`, etc.) con sus parciales, filtros, envolventes y gestión de presets.

---

## 2. Sistema de Metadatos de Motor (`EngineMetadata`)

En `ABDShared/Components/SynthEngines/enginePanelRegistry.js` se define el catálogo canónico de motores disponibles en la suite:

```typescript
export interface EngineMetadata {
  typeId: string;              // 'structured_rompler', 'external_midi', etc.
  displayName: string;         // 'Structured Rompler'
  shortBadge: string;          // 'ROMP', 'MIDI', etc.
  category: string;            // 'sampler' | 'synth' | 'drum' | 'hardware'
  accentToken: string;         // 'var(--color-cat-4)', 'var(--color-cat-6)', etc.
  iconSvg: string;             // SVG vectorial canónico
  defaultImage?: string;       // Render/chasis por defecto (/assets/engines/...)
  description?: string;        // Descripción del motor
}
```

### Funciones públicas expuestas por `@abdsynths/shared/components/synth-engines`:
- `getEngineMetadata(typeId: string): EngineMetadata`: Consulta los metadatos de un motor o genera un fallback seguro.
- `registerEngineMetadata(typeId: string, meta: Partial<EngineMetadata>): void`: Registra dinámicamente nuevos motores.
- `renderEngineCoverHtml(typeId, coverUrl, title, size)`: Genera el HTML de la carátula con soporte para imágenes y degradado elegante a SVG ante cualquier fallo de red o archivo inexistente.

---

## 3. Jerarquía en Cascada para Carátulas (Artwork Fallback)

Para asegurar que la interfaz siempre luzca profesional, musical y sin huecos vacíos:

$$\text{1. Portada del Banco (.abdbank)} \;\longrightarrow\; \text{2. Render/Chasis del Motor} \;\longrightarrow\; \text{3. Icono SVG + Color de Categoría}$$

1. **Prioridad 1 — Portada específica del banco (`coverWebpDataUrl`):**
   - Los archivos `.abdbank` creados por `ABDNeuModMakr` o la suite pueden incorporar una portada WebP o PNG codificada en data-URL (`coverWebpDataUrl`, sanitizada contra XSS y limitada a $\le 2048\text{ px}$).
   - Si está presente, tiene máxima prioridad visual (representa el "pack de sonidos" o librería concreta).
2. **Prioridad 2 — Carátula del Chasis del Motor (`defaultImage`):**
   - Si el preset no tiene portada propia, se muestra la imagen o render del chasis del sintetizador (ej. chasis del Rompler, chasis del MS2000, interfaz hardware DIN-5).
3. **Prioridad 3 — Fallback Vectorial Seguro (`iconSvg` + `accentToken`):**
   - Si no hay imagen en disco o falla al cargar (`onerror`), la caja conmuta automáticamente sin parpadeo al icono vectorial SVG tintado con el token temático de la categoría (`--color-cat-*`).

---

## 4. Puntos de Integración en la Interfaz de `ABDMCX0X`

| Ubicación | Archivo | Comportamiento |
| :--- | :--- | :--- |
| **Cabecera Modal Sinte** | [McxSynthModal.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxSynthModal.ts) | Título estático del instrumento activo `[P01] ABD Structured Rompler` y botón `[ ⇄ Cambiar Instrumento ]`. Sin combobox de motor invasivo. |
| **Barra del Rompler** | [structuredRomplerPanel.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/SynthEngines/StructuredRompler/structuredRomplerPanel.js) | Miniatura ($28\times 28\text{ px}$) en la barra de herramientas interna del Rompler junto al selector `Preset: [TB-303 Acid Bass ▾]`. |
| **Mezclador de 16 Pistas** | [McxMixerConsole.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxMixerConsole.ts) | El botón de sonido del strip (`data-act="sound"`) muestra la miniatura de portada `.mcx-strip-cover-thumb` si existe, o el icono de categoría SVG con su acento de color. |
| **Navegador de Bancos** | [bankCard.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/bank/bankCard.js) | Las tarjetas del catálogo usan `thumbnailUrl` directamente para renderizar la portada de cada sublibrería. |

---

## 5. Simetría con la Refactorización de Efectos (`FxFaceplates`)

Esta misma arquitectura se aplica en espejo para el subsistema de efectos de la suite:

- **Efectos:** `ABDShared/Components/FxFaceplates/` (`FxFaceplateRegistry.js`, `Re201Faceplate.js`, `ZitaReverbFaceplate.js`, etc.) consumidos por `MultiBusFxRackModal.js`.
- **Instrumentos:** `ABDShared/Components/SynthEngines/` (`enginePanelRegistry.js`, `StructuredRomplerPanel.js`, etc.) consumidos por `McxSynthModal.ts`.

Ambos subsistemas respetan el límite de `< 200` líneas por módulo, cero colores hardcodeados (100% variables y tokens de `ABDShared`) y desacoplamiento absoluto de los anfitriones.
