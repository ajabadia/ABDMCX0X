# Plan Arquitectónico: Armario Rack FX Modular & Patchbay (Estilo Estudio 90s)

> **Ubicación Canónica de Especificación:** `ABDMCX0X/DOCS/PLAN_RACK_FX_ARMARIO_MODULAR.md`  
> **Componentes Compartidos:** `ABDShared/Components/MultiBusFxRack/` y `ABDShared/Components/FxFaceplates/`  
> **Consumidores:** `ABDMCX0X` (Groovebox Workstation), extensible a `ABDEep`, `ABDJUNiO601`, etc.  
> **Filosofía de Diseño:** Realismo de estudio analógico de los años 90 (Hardware 19'' Rack Chasis + Patchbay), 100% DRY, cero colores hardcodeados, cero alocaciones dinámicas en el bucle de audio.

---

## 1. Visión y Metáfora del Armario

En lugar de un conjunto cerrado de 4 envíos fijos e inmutables, la estación de trabajo cuenta con un **Armario de Rack modular de 19 pulgadas** situado en la interfaz principal a la izquierda de la columna Master:

1. **Cabezal Superior (Patchbay Inteligente de Envíos)**:
   - Administra los 4 envíos auxiliares (`Send A..D`) y su topología hacia el bus Master.
   - Muestra el estado global de conexiones, niveles de retorno e inyecciones en cascada.
   - Botón `[ VER TOPOLOGÍA ]` que abre la modal gráfica existente (`MultiBusFxRackModal`) con el diagrama vectorial LCD de las 10 topologías.

2. **Cuerpo del Armario (8 Bahías / Slots de Efectos)**:
   - Hasta **8 unidades de efectos** montadas simultáneamente en el armario.
   - Cada bahía vacía cuenta con un botón estilizado `[ + AÑADIR EFECTO ]`.
   - Cada unidad montada dispone de:
     * **Interruptor Power / Bypass**: Desconexión manual inmediata (0% CPU).
     * **Identidad propia del efecto**: Color base (`baseColor`) e icono temático (`icon`) declarados por el propio efecto en `ABDShared`.
     * **Nombre personalizable**: Etiqueta editable a un clic (ej: `[RE-201] Ecos Largos Lead`).
     * **Medición estéreo horizontal doble**: Vúmetro de entrada (`IN L/R`) y vúmetro de salida (`OUT L/R`) con LEDs de clip.
     * **Reordenación y desmontaje**: Botones para mover arriba/abajo en la cadena y botón `✕` para desmontar la unidad del rack.
     * **Acceso a Carátula Detallada**: Clic en la tarjeta o botón dedicado para abrir la **Modal de Edición Profunda del Efecto**.

3. **Alcance Exclusivo para Pistas de Audio**:
   - Solo las pistas configuradas como de audio local (`routeMode === 0` INT o `routeMode === 2` DUAL) participan en el rack mediante inserciones y envíos.
   - Las pistas configuradas como `routeMode === 1` (EXT MIDI) son exclusivamente emisoras de eventos MIDI y sus envíos de audio quedan desactivados.

---

## 2. Filosofía DRY: Efectos, Carátulas y Presets en `ABDShared`

Para evitar la duplicación de código entre proyectos de la suite (`ABDEep`, `ABDJUNiO601`, `ABDMCX0X`), la definición de los efectos reside en `ABDShared`:

```
ABDShared/
  ├── Assets/
  │    └── icons/                       <-- Iconos SVG canónicos (wave, sparkle, zap, etc.)
  ├── Components/
  │    ├── MultiBusFxRack/              <-- Modal global de topologías y ruteo
  │    │    ├── multiBusFxRackModal.js
  │    │    ├── multiBusFxRackLcd.js
  │    │    └── multiBusFxRegistry.js   <-- Metadata ampliada (baseColor, icon, tailSec)
  │    └── FxFaceplates/                <-- Carátulas modulares de efectos compartidas
  │         ├── FxFaceplateModal.js     <-- Modal de edición de parámetros de un efecto
  │         ├── faceplates/
  │         │    ├── Re201Faceplate.js
  │         │    ├── ZitaReverbFaceplate.js
  │         │    ├── BbdChorusFaceplate.js
  │         │    ├── StereoDelayFaceplate.js
  │         │    └── SaturationFaceplate.js
  │         └── styles/
  │              └── fx-faceplates.css  <-- Estilos 100% tokenizados (CSS vars)
  └── Data/
       └── FxPresets/
            └── factory_fx_presets.json <-- Presets de fábrica compartidos
```

### Contrato del Descriptor de Efecto (`FxDescriptor`)
```typescript
export interface FxDescriptor {
  id: string;            // 'space_echo', 'zita', 'bbd_chorus', etc.
  name: string;          // 'Space Echo RE-201'
  category: string;      // 'delay', 'reverb', 'modulation', 'distortion', etc.
  badge: string;         // 'RE2', 'REV', 'BBD', 'SAT'
  baseColor: string;     // Color base del módulo (ej: '#1d3326', '#1c2638', '#2b1b36')
  accentColor: string;   // Color de acento LED (ej: '#4cd97b', '#ffaa22')
  icon: string;          // Nombre del icono SVG en ABDShared/Assets/icons
  tailLengthSec: number; // Tiempo de cola de decaimiento antes del Auto-Sleep (0..10 s)
  presets: string[];     // Nombres de los presets de fábrica
  params: FxParamDef[];  // Definición de controles macro y detallados
}
```

---

## 3. Eficiencia DSP y Reglas de 0% CPU

El motor C++ garantiza que ningún ciclo de CPU se desperdicie:

1. **Bypass Manual**: Si el slot está en bypass o mute, el hilo de audio salta su ejecución inmediatamente (`if (slot.bypassed) return;`).
2. **Corte de Ruteo Huérfano**: Si un módulo está cargado pero ningún envío (`Send A..D`) ni ninguna pista activa lo tiene como destino, se marca inactivo (0% CPU).
3. **Auto-Sleep por Silencio (Dynamic Sleep Gate)**:
   - Si el nivel pico de entrada cae por debajo de $-90\text{ dBFS}$ continuadamente y el contador de cola (*tail decay counter*) llega a cero, el efecto entra en estado `Sleeping` (0% CPU).
   - En cuanto entra una muestra que supere el umbral, el efecto despierta en el mismo bloque de procesamiento sin latencia ni chasquidos.

---

## 4. Sistema de Ducking / Sidechain en Efectos

El ducking (atenuación por señal de control externa o bombeo rítmico) es esencial en producción moderna para evitar que las colas de reverb y delay enturbien el impacto de las frecuencias bajas y la pegada del bombo:

1. **Fuentes de Disparo del Sidechain (Triggers)**:
   - **Bombo / Drum Track (Pista 9 - Nota 36 Kick)**: Disparo instantáneo cada vez que suena un golpe de bombo, atenuando la señal del efecto y dejando que recupere su nivel con un release suave.
   - **Auto-Pumping Sincronizado a BPM (4-on-the-floor)**: Modulación rítmica a negras ($1/4$) o corcheas ($1/8$) sin necesidad de cablear señal de audio auxiliar (estilo Daft Punk / French House).
   - **Pista Guía (Lead/Vocal Ducking)**: Permite que el sintetizador solista atenúe sus propios ecos mientras toca notas rápidas, dejando que las repeticiones florezcan en los silencios.
2. **Aplicación en el Armario**:
   - **En el Cabezal Patchbay**: Selector global de `Sidechain Ducking` para los buses de envío auxiliares (afecta a Reverbs y Delays).
   - **Por Unidad de Rack (Slot Individual)**: Conmutador `SC DUCK` en la carátula de cada slot, permitiendo decidir qué efectos concretos bombean y cuáles permanecen estables (ej: Reverb bombeando al 70%, pero Saturación o EQ fijas al 0%).
   - **Algoritmos Nativos con Ducking Interno**: Procesadores como `Ducking Delay` o compresores con entrada sidechain incorporan potenciómetros dedicados de *Threshold*, *Duck Amount* ($-3\text{ dB}$ a $-24\text{ dB}$) y *Release Time*.

---

## 5. Buenas Prácticas Adicionales Incorporadas

1. **Micro-Crossfade Anti-Clicks (Click-Free Hot Swapping)**:
   - Al encender/apagar bypass, cambiar de algoritmo o mover un módulo de posición en el rack en caliente, el motor aplica una rampa de desvanecimiento ultra-rápida (5–10 ms / 256 samples) para evitar transitorios o pops audibles.
2. **Persistencia Completa en el Estado del Proyecto (Song / Multi-Preset)**:
   - La configuración completa del armario (slots 1..8, algoritmo, nombre personalizado, parámetros, bypass y ruteos de inserción/envío) se serializa en el JSON de la canción y en los bancos binarios `.abdbank`.
3. **Prevención de Bucles de Realimentación (DAG / Directed Acyclic Graph)**:
   - El ruteo de señal es estrictamente acíclico: `Pista Audio ➔ Inserción Pista ➔ Envíos Auxiliares ➔ Suma Master ➔ Limitador`. Ninguna salida del rack puede recircular como entrada de un canal upstream.
4. **Balística Hardware de Vúmetros**:
   - Ataque instantáneo (Peak meter real) y caída balística suave ($\tau \approx 300\text{ ms}$).
   - Indicador de CLIP (+0 dBFS) en rojo con retención de 1.5 segundos (*peak hold*) para garantizar visibilidad al usuario.
5. **Automatización y Modulación (Motion Recording / MIDI CC)**:
   - Los parámetros macro de las unidades activas en el armario están mapeados en el registro canónico de parámetros para permitir automatización por pasos (Motion) y control mediante mandos hardware externos.

---

## 6. Plan de Ejecución por Fases

- [x] **Fase 1: Capa de Metadatos Canónicos en `ABDShared`**
  - Actualizar `ABDShared/Components/MultiBusFxRack/multiBusFxRegistry.js` añadiendo `baseColor`, `accentColor`, `icon` y `tailLengthSec`.
  - Crear el armazón inicial de carátulas modulares en `ABDShared/Components/FxFaceplates/`.
  - Validar que los estilos sean 100% tokenizados y respeten `< 200` líneas por archivo.

- [x] **Fase 2: Motor DSP C++ en `ABDMCX0X`**
  - Extender `McxOutputAndFx` y `McxEngine` para gestionar el pool de hasta 8 unidades de rack activas.
  - Implementar el detector de silencio con Auto-Sleep y cálculo de picos `peakInL/R` y `peakOutL/R` por slot.
  - Exponer los métodos de control en `WasmBridge.h` / `WasmBridge.cpp` y el adaptador VST3.

- [x] **Fase 3: Columna WebUI del Armario de Rack (`McxRackColumn.ts`)**
  - Diseñar el componente visual del armario con cabezal de Patchbay y las 8 bahías.
  - Implementar vúmetros horizontales de entrada/salida y controles de bypass, reordenación y renombramiento.
  - Integrar la columna en el layout principal a la izquierda de `McxMasterPanel`.

- [x] **Fase 4: Modal de Carátula Detallada de Efecto (`FxFaceplateModal.ts`)**
  - Conectar el clic en cada tarjeta para abrir la edición profunda con carátula específica (RE-201, Zita, BBD Chorus, Saturation, etc.).
  - Conectar el selector de presets de fábrica y de usuario.

- [x] **Fase 5: Ruteo de Inserciones en Canales de Audio**
  - Integrar en el *Tone Drawer* de las pistas de audio (`routeMode !== 1`) la selección de unidad de rack como inserción de canal directa.
  - Verificar pruebas CTest y suite WebUI sin advertencias de compilador.

- [x] **Fase 6: Catálogo Completo 56 Efectos & Carátulas Fotográficas 1:1 en `ABDShared`**
  - Expansión total de `multiBusFxRegistry.js` cubriendo los 56 algoritmos del contrato C++ de `ABDEep` y `ABDMCX0X`.
  - Integración de 46 carátulas fotorrealistas de hardware en formato WebP 512px optimizado (`tc_m3000`, `fender_spring`, `tree_monster`, `bonsai`, `nimbus`, `fdn_reverb`, `spectral_delay`, `pattern_freeze`, `decimator`, etc.).
  - Selector de bahía enriquecido (`McxRackColumnViews.ts`) agrupado por categorías con miniaturas en tiempo real.
  - Faceplate modal de alta fidelidad: escalado de carátula al 100% de altura con anclaje a la izquierda (`background-size: auto 100%; background-position: left center;`) y fundido suave con degradado de máscara hacia el chasis.
  - RE-201 Space Echo con dial selector rotatorio gigante de 12 posiciones, sincronización con cinta/cabezales y mandos aislados por placa posterior antirreflejo.

- [x] **Fase 7: Experiencia Visual de Topología, Selector Universal & Congelación de Parámetros**
  - **Selector Universal `FxPickerModal`**: Reemplazo del selector de ranura por el componente universal de `ABDShared` con 8 categorías, buscador reactivo y miniaturas de hardware.
  - **Matriz 2×2 en Topología**: Distribución de los 4 envíos auxiliares (`Envío A..D`) en cuadrícula de 2 columnas por 2 filas sin compresión ni desbordamiento horizontal.
  - **Módulo Visual de Bahías**: Eliminación del `<select>` plano y sustitución por chasis con LED de actividad, miniatura de hardware, badge `B1..B8`, botón `▶ FACEPLATE` y menú filtrado a bahías ocupadas.
  - **Diagrama de Bloques por Etapas (Stage Flow LCD)**: Representación gráfica vectorial cristalina en la mitad derecha de la pantalla LCD para las 10 topologías con bloques iluminados (`[A]`, `[B]`, `[C]`, `[D]`) en serie, paralelo, bifurcación o bucle de retorno.
  - **Congelación Total en Canción / Proyecto**: Serialización C++ profunda en `McxRackChassisJson.cpp` y `McxBankManagerBridge.cpp` grabando `p1..p12`, motores, modos, ganancia, mezcla y ducking directamente en el fichero de canción `.json`, haciéndola 100% autónoma ante traslados de archivo.
  - **Gestor Compartido de Presets (`FxPresetManager`)**: Soporte para presets de fábrica y de usuario en `ABDShared` y carpetas de trabajo `Presets/Effects/`.

---

## 7. Estado de Verificación y Ducking Dual (Completado)

1. **Chasis DSP Headless C++20 (`McxRackChassis.h/.cpp`):**
   - 8 Bahías con asignación heap (`SlotDsp`) inmune a desbordamientos de pila (`std::unique_ptr<std::array<SlotDsp, kMaxSlots>>`).
   - Auto-sleep dinámico por debajo de -80 dBFS (0% CPU).
   - Medición pico estéreo de entrada y salida con clip-hold de 1.5 s.
   - Encadenamiento en serie entre bahías (`chainTarget`) y ruteo a buses de envío `Send A..D`.
   - Serialización y deserialización JSON completa de ranuras y parámetros (`p1`, `p2`, `chain`, `customName`).
2. **Ducking Dual-Mode (Audio Envelope Follower + Disparo MIDI 35/36):**
   - **Envolvente por Audio:** `audioDuckEnvelope_` rastrea la energía dinámica de la pista de batería/bombo (`pIdx == 9 || isDrumKit`) con decaimiento suave en `McxEngine.cpp`.
   - **Disparo Rítmico por MIDI:** `kickDuckEnvelope_` se dispara con las notas MIDI de bombo 35 y 36 en `McxEngineControl.cpp`.
   - **Compuerta Combinada:** `fxCtrl.gates[0]` se activa indistintamente por transitorios de audio real o pulsos MIDI rítmicos.
3. **Sincronización WebUI y WASM:**
   - Métodos `_setRackSlotName` y `_setPartInsertSlot` expuestos en WASM.
   - Conexión con `FxFaceplateModal.js` para edición en caliente de nombres personalizados de bahía.
   - Opciones filtradas en la modal de Patchbay y en el *Tone Drawer* mostrando únicamente bahías ocupadas con sus nombres reales.
4. **Verificación Automatizada:**
   - Suite `Tests/McxPhase10RackChassisTests.cpp` con 11 pruebas pasando al 100% en CTest.
