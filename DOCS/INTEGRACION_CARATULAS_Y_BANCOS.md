# Integración de Carátulas, Metadatos de Motor y Portadas de Banco (.abdbank)

> **Documento de Arquitectura e Integración Transversal**  
> **Estado:** Implementado y Verificado  
> **Ámbito:** `ABDMCX0X` (Host DAW / Groovebox) ↔ `ABDShared` (SynthEngines & Bank Infrastructure)

---

## 1. Filosofía Arquitectónica: Asignación de Pista vs. Interfaz de Motor

El sistema separa estrictamente la **infraestructura de pista del host** del **instrumento embebido de `ABDShared`**:

1. **Configuración y Ruta de Pista (`McxInstrumentRouteModal.ts`):**
   - **Destino:** Motor **Interno (DSP)**, hardware **Externo (MIDI Out)** o **Capa Doble (A+B)**.
   - **Motor DSP (si Interno/A+B):** Selector del `ISoundEngine` (`Structured Rompler`, `MCS-48`, `AbyssMind`, etc.), lectura del sonido activo y botón directo `[ Abrir Sinte / Editar ]` (sin selector de presets ni lógica de bancos `.abdbank` duplicada en el modal de ruta).
   - **Formato Musical (`chromatic` / `drum_map`):** En motores internos es **derivado** del sonido o modo del motor y se muestra como insignia de solo lectura + control `Follow Transpose`. Los botones manuales *Cromático / Drum Map* solo aparecen en modo **`External MIDI`**.

2. **Ventana Host de Instrumento (`McxSynthModal.ts`):**
   - Totalmente **agnóstica al motor**: su cabecera muestra únicamente `[P01]`, título del motor y acceso a ruta/cierre. **No contiene barras específicas de Rompler ni botones de banco `.abdbank`.**
   - Monta `EnginePanelHost`, que instancia el panel del motor registrado (`StructuredRomplerPanel`, `Mcs48EnginePanel`, `GenericEnginePanel`, etc.).

3. **Barra Común y Navegador Multimotor (`ABDShared/Components/SynthEngines/Common/`):**
   - `EngineHeaderBar`: carátula en cascada, insignia de modo (`CROMÁTICO` / `DRUM KIT`), selector unificado `[ Fuente › Preset ]` con `◀`/`▶`, popover `[ Guardar ]` (categoría Hartmann `0..9` + autor) y `[ Init ]` (menú `Cromático` / `Kit Batería` si `supportsDrumMode: true`).
   - `EnginePresetBrowser`: búsqueda, filtro `Todos / Crom / Drum`, conmutador de literales `Musical / Neuron` sobre las **10 categorías Hartmann Neuron `0..9`**, favoritos (`★`) y carga de bancos `.abdbank` integrada dentro de los motores con `supportsBankArchives: true`.

---

## 2. Sistema de Metadatos de Motor (`EngineMetadata`)

En `ABDShared/Components/SynthEngines/enginePanelRegistry.js`:

```typescript
export interface EngineMetadata {
  typeId: string;              // 'structured_rompler', 'mcs48_synth', 'abyssmind_synth', etc.
  displayName: string;
  shortBadge: string;
  category: string;            // 'sampler' | 'synth' | 'drum' | 'hardware'
  accentToken: string;         // 'var(--color-cat-4)', etc.
  iconSvg: string;
  defaultImage?: string;
  description?: string;
}
```

Funciones públicas en `@abdsynths/shared/components/synth-engines`:
- `getEngineMetadata(typeId)`, `registerEngineMetadata(typeId, meta)`
- `renderEngineCoverHtml(typeId, coverUrl, title, size)`
- `EngineHeaderBar`, `EnginePresetBrowser`, `userPresetsStore`, `RomplerWavePicker`, `extractRomplerPatchMeta`

---

## 3. Jerarquía en Cascada para Carátulas (Artwork Fallback)

$$\text{1. Portada del Banco/Preset (.abdbank `coverWebpDataUrl`)} \;\longrightarrow\; \text{2. Render/Chasis del Motor} \;\longrightarrow\; \text{3. Icono SVG + Token `--color-cat-*`}$$

1. **Prioridad 1 — `coverWebpDataUrl` sanitizada:** Portada embebida en el manifiesto del `.abdbank` o patch.
2. **Prioridad 2 — `defaultImage` del chasis del motor.**
3. **Prioridad 3 — Fallback vectorial SVG (`currentColor`)** con el token cromático de categoría (`--color-cat-0..9`).

---

## 4. Puntos de Integración en `ABDMCX0X` y `ABDShared`

| Ubicación | Archivo | Comportamiento |
| :--- | :--- | :--- |
| **Modal Sinte Host** | [McxSynthModal.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/ui/McxSynthModal.ts) | Shell 100% agnóstico al motor (`McxPartEngineBridge` + `EnginePanelHost`). |
| **Adaptador Host** | [McxPartBankAdapter.ts](file:///d:/desarrollos/ABDSynths/ABDMCX0X/WebUI/src/bridge/McxPartBankAdapter.ts) | Fuentes Factory + carga perezosa `.abdbank`, importación drag-and-drop y asignación PCM `partial_wave`/`drum_wave`. |
| **Cabecera y Browser** | [engineHeaderBar.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/SynthEngines/Common/engineHeaderBar.js) | Cromado común multimotor con presets, favoritos y taxonomía Hartmann `0..9`. |
| **Panel Rompler** | [structuredRomplerPanel.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/SynthEngines/StructuredRompler/structuredRomplerPanel.js) | Pestañas dinámicas según `playMode` + `RomplerWavePicker` PCM en parciales y pads. |
| **Panel Genérico** | [genericEnginePanel.js](file:///d:/desarrollos/ABDSynths/ABDShared/Components/SynthEngines/genericEnginePanel.js) | Incluye `EngineHeaderBar` + `EnginePresetBrowser` sin botón especial de bancos externos. |

---

## 5. Requisitos Canónicos para Generación de `.abdbank` (`schemaVersion: "1.0.0"`)

Todo archivo `.abdbank` generado para la suite debe cumplir:
- ZIP sin compresión (`ZIP_STORED`), con `manifest.json` en primera entrada y `formatId: "abd_structured_rompler"`.
- `"bankId"` estable en raíz del manifiesto y `"bankName"` legible (sin guiones bajos).
- `"sourceKind": "pcm_zone"` y `"assetUriLeft": "waves/<archivo>.wav"` en cada entrada de `wavePool[]`.
- `"categoryId"` (`0..9` Hartmann Neuron) y `"category"` en cada elemento de `tones[]` y `drumKits[]` (`8` para kits rítmicos, `9` para kits FX/SFX).
- Estructura estándar en `tones[]` (`"structureMode": "parallel"`, `"partials": [{ "slot": 1, "enabled": true, "sourceKind": "pcm_zone", "waveId": "..." }]`) y clave `"waveId"` (no `"toneId"`) en `drumKits[].slots[]`.
- Notas GM de batería priorizadas en `35..81` (evitando desbordar notas sueltas a `midiNote: 0`) y nombres descriptivos por golpe (`Kick`, `Snare`, `CHH`, etc.).

---

## 6. Generadores reproducibles desde ROM (`Scripts/extract_and_build_*_bank.py`)

Estos scripts Regeneran **solo el audio** de bancos Roland ya validados a partir de las ROM originales; la estructura de tonos/kits se hereda del banco curado (plantilla) porque las ROM disponibles no contienen todos los presets de usuario. Ninguno toca motores C++/TS y todos escriben exclusivamente en `WebUI/public/banks/PENDING/*.fromrom.abdbank` (nunca sobrescriben bancos activos).

| Script | Banco de salida | Formato de ROM | Resultado del `--check` |
| --- | --- | --- | --- |
| `extract_and_build_u110_bank.py` | `Roland_U110_U220.fromrom.abdbank` | LDPCM CM-32P (`descramble_rom`) | 403/410 byte-idénticos; 7 WAV TABLE/DEMO conservados de plantilla |
| `extract_and_build_d110_bank.py` | `Roland_D110_V110.fromrom.abdbank` | log-PCM munt (`d110_log_samples`) | 256/256 dentro de ±4 LSB |
| `extract_and_build_cm32l_bank.py` | `Roland_CM32L_V102.fromrom.abdbank` | log-PCM munt, tabla en `0x8100` | 256/256 dentro de ±4 LSB |
| `extract_and_build_d70_bank.py` | `Roland_D70_V110.fromrom.abdbank` | LDPCM CM-32P (`descramble_rom`) | 510/523 byte-idénticos; 10 zonas reparadas con DC blocker conservadas de plantilla |
| `extract_and_build_jd800_bank.py` | `Roland_JD800_V101.fromrom.abdbank` | FCE-DPCM (`fce_descramble_rom`, tabla en `0x80`) | 659/659 byte-idénticos |

**Política de fallback seguro:** cuando la reconstrucción desde ROM no puede reproducir el WAV curado byte a byte (por reparaciones históricas de DC no invertibles), se conserva el WAV de la plantilla y se documenta en la cabecera del script, igual que se hace con las entradas `TABLE`/`DEMO` del U-110. Las diferencias de hasta ±16 LSB por redondeo de escalado (D-110, CM-32L) se aceptan por ser inaudibles.

**Uso:** `python -B Scripts/<script>.py --check` para comparar sin escribir; sin `--check` para generar el candidato; `--limit N` para pruebas rápidas. Los candidatos deben pasar `normalize_abdbanks.py --check --scope pending` y `add_bank_covers.py --check --scope pending` antes de cualquier promoción.

---

## 7. Modal de Ruta Enriquecido, Portadas de Modelos y Auditoría de Faceplates (Nov 2026)

- **Tarjetas Enriquecidas en `McxInstrumentRouteModal` (`McxInstrumentRouteModalView.ts` / `mcx-route-modal.css`):**
  - El selector `<select id="mcx-route-engine">` pasa a `hidden` y las tarjetas visuales (`.mcx-route-engine-card` con `data-cover-engine`) muestran miniaturas de `68×44 px` (`object-fit: contain`), insignia de capacidades (`CHR+DRM` / `CHR`, `BNK`, `{N}V`), descripción en 2 líneas y vista previa ampliada al pasar el cursor vía `attachCoverPopup(..., { click: false })` (con limpieza `hideCoverHoverPopover()` en `close`/`destroy`).
  - Cuando la pista apunta a **External MIDI**, se muestra `.mcx-route-ext-card` con vista previa de hardware MIDI externo.
  - `emax_synth` (ranura `7`) incorpora ahora carátula oficial `models/emu-emax2.webp` (`512×228`, SHA256 `18a1145fad7e`) en `EmaxEnginePanel`, `engineMetadata.js` y `MODEL_COVERS`, conservando la insignia `EMAX` y la carga de `.abdbank` dentro de su `EnginePresetBrowser` y de `McxMultiBankManager`.
- **Portadas `/assets/models/*` en Build de Producción (`vite.config.ts`):**
  - Añadidas `roland-d550.webp` (`512×155`, SHA256 `c03902fb2645`), `roland-tb303.webp` (`512×152`, SHA256 `c5702b344863`) y `emu-emax2.webp` (`512×228`, SHA256 `18a1145fad7e`) en `ABDShared/Assets/` y `ABDMCX0X/WebUI/public/assets/models/`.
  - `MODEL_COVERS` en `ABDMCX0X/vite.config.ts` copia además `emu-emax2.webp`, `roland-cm32.webp`, `roland-d50.webp`, `roland-d550.webp`, `roland-tb303.webp`, `roland-u110.webp` y `roland-u220.webp` hacia `dist/assets/models/`.

| Motor / Modelo | Archivo en `ABDShared/Assets` | Dimensiones | SHA256 (12 hex) | Observación |
| :--- | :--- | :--- | :--- | :--- |
| `structured_rompler` | `assets/engines/rompler_faceplate.webp` | `2048×1732` | `32b91d0ff640` | Única |
| `jv880_synth` | `models/roland-jv880.webp` | `2047×519` | `8a5320597b58` | Única |
| `la50_synth` (D-50) | `models/roland-d50.webp` | `512×155` | `afd04ab60ea7` | Única |
| `la50_synth` (D-550) | `models/roland-d550.webp` | `512×155` | `c03902fb2645` | Única |
| `la50_synth` (U-110) | `models/roland-u110.webp` | `512×96` | `e1b1bab0b897` | Única |
| `la50_synth` (U-220) | `models/roland-u220.webp` | `512×79` | `326eba8cca6c` | Única |
| `cm32_synth` | `models/roland-cm32.webp` | `512×181` | `31abd0e1ec5b` | Única |
| `mcs48_synth` | `assets/engines/mcs48_faceplate.webp` | `2048×1732` | `9bf72db39892` | Única |
| `abyssmind_synth` | `models/abyssmind.webp` | `512×321` | `ea830ef2a841` | Única |
| `emax_synth` | `models/emu-emax2.webp` | `512×228` | `18a1145fad7e` | Única (carátula oficial E-mu Emax II en `EmaxEnginePanel`) |
| `juno601_synth` | `assets/engines/juno601_faceplate.webp` | `2010×825` | `3384e322b5bd` | Única |
| `ms2000_synth` | `models/korg-ms2000.webp` | `1065×534` | `fafb8ed22e34` | Única |
| `tb303_synth` | `models/roland-tb303.webp` | `512×152` | `c5702b344863` | Única (carátula canónica `Tb303EnginePanel`) |
| `external_midi` | `assets/engines/abdmcx0x_faceplate.webp` | `1280×688` | `1d74d6ae0f39` | Única (arte propio External MIDI) |
| Suite FX Hartmann Neuron (`74..77`) | `assets/fx/models/hartmann_neuron_fx.webp` | `512×198` | `89099414a80b` | Única (Silver Filter / FreqFX / TimeFX / Slicer) |
| `golana_reverb` (`78`) | `assets/fx/models/golana_reverb.webp` | `512×342` | `556b60440452` | Única (arte propio Hügelton Golana Reverb) |
| `iterum_delay` (`79`) | `assets/fx/models/iterum_delay.webp` | `512×217` | `1e4bac412ba8` | Única (arte propio Krate Iterum 11-Mode Delay) |
| `re201_wdf` (`80`) | `assets/fx/models/re201_wdf.webp` | `512×196` | `e45f2393958b` | Única (arte propio Roland RE-201 WDF) |
| `kr106_chorus` (`81`) | `assets/fx/models/kr106_chorus.webp` | `512×164` | `72d3b5f6a173` | Única (arte propio Juno KR-106 Chorus) |
