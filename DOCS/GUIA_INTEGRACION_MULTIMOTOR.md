# GUÍA MAESTRA DE INTEGRACIÓN MULTI-MOTOR EN LA SUITE ABDSYNTHS

> **Principio Rector:** Cero bifurcaciones (no forks), cero código duplicado y 100% DRY.
> Cualquier optimización, corrección de bugs o ajuste DSP en el repositorio original del sintetizador debe verse reflejado inmediatamente en todos los hosts (como `ABDMCX0X`) en la siguiente compilación.

---

## 1. Visión General de la Arquitectura

La suite ABDSynths utiliza una arquitectura desacoplada basada en la interfaz pura C++20 `abd::engines::ISoundEngine` (ubicada en `ABDShared/Code/SynthEngines/ISoundEngine.h`).

Cualquier sintetizador o instrumento de la suite (`ABDMCS48SE`, `ABDJUNiO601`, `ABDMS2000`, `ABDAxionikVS`, etc.) puede operar tanto como **plugin/instrumento independiente** (Standalone / VST3 / CLAP / WebAssembly) como en calidad de **motor embebido** en estaciones de trabajo y grooveboxes multitímbricas de hasta 64 pistas (como `ABDMCX0X`).

```
+---------------------------------------------------------------------------------+
|                              REPOSITORIO DEL SINTETIZADOR                       |
|                          (p. ej. D:/desarrollos/ABDSynths/ABDMCS48SE)           |
|                                                                                 |
|   +--------------------------+           +----------------------------------+   |
|   |   source/core/ (C++20)   |           |    source/instrument/ (C++20)    |   |
|   |  Emulación, DSP, Clocks  |           |     Voces, Afinación, Filtros    |   |
|   +--------------------------+           +----------------------------------+   |
+---------------------------------------------------------------------------------+
                         |                                      |
                         | (CMake link directo - SIN COPIAR)    |
                         v                                      v
+---------------------------------------------------------------------------------+
|                       ABDShared (Librería Central de la Suite)                  |
|                                                                                 |
|   +-------------------------------------------------------------------------+   |
|   |            Adaptador ISoundEngine (p. ej. Mcs48SoundEngine.h/.cpp)       |   |
|   |                                                                         |   |
|   |  - Implementa: prepare(), reset(), renderBlock(), noteOn(), noteOff()   |   |
|   |  - Expone modulaciones en tiempo real vía SemanticRoleHash              |   |
|   |  - Garantiza auto-sleep (retorna false en reposo -> 0% CPU)             |   |
|   |  - RT-Safe: cero malloc/free y cero mutex en el hilo de audio           |   |
|   +-------------------------------------------------------------------------+   |
|   |   Capa WebUI (enginePanelRegistry.js + Paneles Canónicos <Motor>Panel)  |   |
|   +-------------------------------------------------------------------------+   |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                     HOSTS MULTITÍMBRICOS (p. ej. ABDMCX0X 64P)                  |
|                                                                                 |
|   - McxEngineRegistry: Asigna motores dinámicamente por pista (1..64)           |
|   - TrackModRouter: Inyecta LFOs de pista y globales al motor                   |
|   - EnginePanelHost: Monta la UI del motor automáticamente en la pestaña        |
+---------------------------------------------------------------------------------+
```

---

## 2. Los Dos Modelos de Vinculación (Sin Duplicación de Código)

Para garantizar que el sintetizador mantenga una única fuente de verdad en disco, se contemplan dos estrategias oficiales:

### Modelo A: Enlace por Target CMake (Sintetizador en su Propio Repositorio)
*Idóneo para sintetizadores que ya cuentan con su propio proyecto Git, CI/CD y ciclo de vida independiente (caso de `ABDMCS48SE`).*

1. **El repositorio del sintetizador es la única fuente de verdad (C++):**
   El código DSP vive exclusivamente en su carpeta original (p. ej. `D:/desarrollos/ABDSynths/ABDMCS48SE/source`).
   Sin embargo, los **param specs WebUI** (`*ParamSpecs.js`) sí se ubican en `ABDShared` y el plugin los consume desde ahí — véase Sección 7.3.
2. **Vinculación en CMake:**
   En el `CMakeLists.txt` de los motores de `ABDShared` (`ABDShared/Code/SynthEngines/CMakeLists.txt`), se enlaza el target estático del sintetizador o se incluye su ruta de cabeceras directamente:
   ```cmake
   # Ejemplo de inclusión directa en ABDShared_SynthEngines
   set(ABDMCS48SE_ROOT_DIR "D:/desarrollos/ABDSynths/ABDMCS48SE" CACHE PATH "Ruta a ABDMCS48SE")
   if(EXISTS "${ABDMCS48SE_ROOT_DIR}/source")
       target_include_directories(ABDShared_SynthEngines INTERFACE
           ${ABDMCS48SE_ROOT_DIR}/source
       )
       # Se compila el adaptador puente
       target_sources(ABDShared_SynthEngines INTERFACE
           ${CMAKE_CURRENT_SOURCE_DIR}/Mcs48/Mcs48SoundEngine.cpp
           ${CMAKE_CURRENT_SOURCE_DIR}/Mcs48/Mcs48SoundEngine.h
       )
   endif()
   ```
3. **Efecto Inmediato:** Cualquier cambio realizado en la CPU, los opcodes o la afinación de `ABDMCS48SE` se compila directamente en `ABDMCX0X` sin necesidad de sincronizaciones manuales.

### Modelo B: Extracción del Core a `ABDShared` (Sintetizador Canónico de la Suite)
*Idóneo si el motor se concibe desde el principio como una pieza compartida por múltiples sintetizadores (como ocurrió con `StructuredRompler` y `GrooveArpeggiator`).*

1. El código del núcleo de síntesis se ubica directamente en `ABDShared/Code/SynthEngines/<NombreMotor>/`.
2. El proyecto individual del sintetizador utiliza `ABDShared` como librería base en su propio `CMakeLists.txt`.
3. Tanto el plugin independiente como la Groovebox compilan exactamente los mismos ficheros de la carpeta compartida.

---

## 3. Checklist Técnico de Compatibilidad para el Core C++

Antes de conectar un motor mediante `ISoundEngine`, se debe auditar que cumpla las reglas de oro de audio en tiempo real:

1. **Aislamiento de JUCE en el Core:**
   El código DSP (`Osciladores`, `Filtros`, `Envolventes`, `Emuladores de CPU`) no debe incluir cabeceras de `juce_gui_basics`, `juce_audio_processors` ni componentes de UI. Solo C++ estándar (`<cmath>`, `<array>`, `<vector>`, tipos enteros y flotantes).
2. **Cero Asignaciones Dinámicas (RT-Safety):**
   - En `noteOn`, `noteOff` y `renderBlock` está **terminantemente prohibido** hacer `new`, `malloc`, `std::make_unique` o redimensionar contenedores (`std::vector::push_back`).
   - Toda la memoria necesaria se pre-reserva en `prepare(sampleRate, maxBlockSize)`.
3. **Cero Bloqueos (Lock-Free):**
   Prohibido el uso de `std::mutex` o primitivas de sincronización bloqueantes en el hilo de audio.
4. **Auto-Sleep Eficiente (0% CPU en Reposo):**
   El método `renderBlock(float* outL, float* outR, int numSamples)` debe retornar `false` si no hay voces activas o si la cola de decaimiento llegó al silencio. El host salta inmediatamente el procesado de esa pista, garantizando que un proyecto de 64 partes consuma 0% CPU en las pistas que no estén sonando.

---

## 4. Implementación del Adaptador `ISoundEngine`

A continuación se muestra el patrón estándar tomando como referencia `ABDMCS48SE`:

```cpp
// Mcs48SoundEngine.h
#pragma once
#include "SynthEngines/ISoundEngine.h"
#include "machines/GenericMcs48Machine.h"
#include "instrument/MonoVoice.h"

namespace abd::engines {

class Mcs48SoundEngine final : public ISoundEngine {
public:
    Mcs48SoundEngine();
    ~Mcs48SoundEngine() override = default;

    // Ciclo de vida
    void prepare(double sampleRate, int maxBlockSize) noexcept override;
    void reset() noexcept override;

    // Identidad
    const char* getEngineTypeId() const noexcept override { return "mcs48_synth"; }
    const char* getEngineDisplayName() const noexcept override { return "MCS-48 Micro-Synth"; }
    bool supportsDrumMode() const noexcept override { return false; }

    // Eventos MIDI
    void noteOn(int midiNote, float velocity01, float accent01 = 0.0f) noexcept override;
    void noteOff(int midiNote) noexcept override;
    void allNotesOff() noexcept override;

    // Renderizado con auto-sleep
    bool renderBlock(float* outL, float* outR, int numSamples) noexcept override;

    // Mapeo semántico de modulaciones
    const EngineControlInputDescriptor* getControlInputDescriptors(std::size_t& outCount) const noexcept override;
    void setControlInputs(const float* valuesByDestId, std::size_t arraySize) noexcept override;
    void clearControlInputs() noexcept override;

    // Presets y serialización
    int getFactoryPresetCount() const noexcept override;
    const char* getFactoryPresetName(int index) const noexcept override;
    bool loadFactoryPreset(int index) noexcept override;
    std::string serializeStateJson() const override;
    bool deserializeStateJson(std::string_view jsonText) override;

private:
    bdmcs48::machines::GenericMcs48Machine machine_;
    bdmcs48::instrument::MonoVoice voice_;
    float dcBlockPrevX_ = 0.0f;
    float dcBlockPrevY_ = 0.0f;
};

} // namespace abd::engines
```

### Mapeo de Modulaciones (`SemanticRoleHash`) y Alias Físicos del Host:
1. **Slots modulables (`getControlInputDescriptors`):** Todo destino modulable en tiempo real expone un `roleHash` válido de `SemanticRoleHash.h` (p. ej. `kFilterCutoff`, `kFilterResonance`, `kAmpEnvAttack`, `kAmpEnvDecay`, `kAmpEnvRelease`, `kLfo1Depth`, `kPartPan`, `kPartVolume`), evitando dejar slots activos con `roleHash = 0` si existe rol semántico aplicable.
   Así la pista en la Groovebox modula estos parámetros desde sus LFOs y envolventes globales **sin saber qué sintetizador hay debajo**.
2. **Alias en dominio físico (`setParamByKey` / `getParamByKey`):** Además de las claves nativas del motor, todo adaptador debe traducir e invertir según su ley DSP los alias estándar del host cuando apliquen (`cutoffHz`/`p1.cutoffHz`, `p1.resonance`, `p1.amp.t1Ms`/`t2Ms`/`t4Ms`, `p1.amp.l2`/`l3`, `coarse`/`p1.coarse`, `fine`/`p1.fine`, `tuningA4`, `porta.enabled`/`portaSwitch`, `porta.timeMs`/`slide`/`glide`, `lfo1.rate`, `lfo1.depth`, `p1.level`, `p1.pan`) para que `McxParamRouter.h` y `McxHardwareInbound.cpp` operen de forma uniforme sobre cualquier motor.

---

## 5. Integración en el Host (`ABDMCX0X`)

### 1. Pre-asignación en `McxEngineRegistry`
En `Source/DSP/Core/McxEngineRegistry.h` y `.cpp`:
- Se define un slot de tipo de motor: `kMcs48TypeIndex = 2`.
- Se pre-asignan las instancias para las partes que utilicen el motor (cero asignaciones en caliente).

### 2. Conmutación en Caliente de Pista:
Cuando el usuario cambia el motor de la Pista 5 de `StructuredRompler` a `MCS-48 Micro-Synth`:
1. El host ejecuta `part.setActiveEngine(kMcs48TypeIndex)`.
2. `TrackModRouter` remapea al vuelo los IDs de modulación coincidentes (`cutoff`, `release`, etc.).
3. El audio comienza a fluir a través del nuevo motor sin chasquidos ni caídas de buffer.

---

## 6. Persistencia y Serialización Distribuida de Parámetros (Estándar de Suite)

Al guardar una Canción, Escena o Banco, el host **no debe asumir qué parámetros tiene cada motor**. Se aplica el patrón de persistencia distribuida (*Tree / Part Serializer*):

```
                                  ESTADO DE CANCIÓN JSON
                                            |
        +-----------------------------------+-----------------------------------+
        | (Part 1 - StructuredRompler)      | (Part 2 - MCS-48 Micro-Synth)     | (Part 3 - External MIDI)
        v                                   v                                   v
  "engine": "structured_rompler"      "engine": "mcs48_synth"             "engine": "external_midi"
  "volume": 0.85, "pan": 0.0          "volume": 0.90, "pan": -0.2         "volume": 1.0, "port": "DIN-1"
  "engineState": {                    "engineState": {                    "engineState": {
    "version": 2,                       "version": 1,                       "channel": 3,
    "partials": [ ... ],                "preset": 1,                        "program": 42
    "vector": { "x": 0.5, "y": 0.5 }    "attack": 4.0, "release": 80.0
  }                                   }                                   }
```

### Reglas Obligatorias para todo Adaptador `ISoundEngine`:
1. **`serializeStateJson() const`:**
   - Debe retornar una cadena JSON válida y compacta que encierre todos los parámetros internos propios del motor.
   - Debe incluir siempre un campo `"version": <int>` para garantizar migraciones hacia atrás cuando se amplíen funciones.
2. **`deserializeStateJson(std::string_view jsonText)`:**
   - Restaura el estado de forma determinista y segura (con validaciones de rango y valores de fallback).
3. **Inmunidad ante Cambios:**
   - La Groovebox o el DAW simplemente guarda y recarga el sub-árbol `"engineState"` sin necesidad de saber qué variables internas contiene cada sintetizador. Si un motor añade nuevos parámetros mañana, el guardado de canciones del host sigue funcionando sin romperse.

---

## 7. Integración en la Interfaz WebUI (Zero-Code UI)

`ABDShared` incluye un sistema de introspección que evita tener que diseñar interfaces desde cero:

### 1. Metadatos del Motor (`enginePanelRegistry.js`)
En `ABDShared/Components/SynthEngines/enginePanelRegistry.js`:
```javascript
registerEngineMetadata('mcs48_synth', {
  typeId: 'mcs48_synth',
  displayName: 'MCS-48 Micro-Synth',
  shortBadge: 'M48',
  category: 'vintage_cpu',
  accentToken: 'var(--color-warning)',
  iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/></svg>',
  defaultImage: '/assets/engines/mcs48_chassis.webp',
  description: 'Emulador ciclo a ciclo de microcontrolador Intel 8048/8049 con síntesis por DAC 8-bit.'
});
```

### 2. Panel Genérico Instantáneo (`GenericEnginePanel.js`)
Si el sintetizador no cuenta aún con una carátula HTML/CSS dedicada, el host monta de forma automática el **`GenericEnginePanel`**.
- Lee los parámetros declarados en el descriptor.
- Dibuja potenciómetros rotatorios con estilo hardware de estudio.
- Monta el selector de presets de fábrica.
- Enlaza el botón de bypass y medición.

### 3. Param Specs como SSOT en `ABDShared` (Principio Obligatorio)

> **Regla de oro WebUI:** Los archivos de especificación de parámetros (`*ParamSpecs.js`) son la **única fuente de verdad** de la suite. Se ubican en `ABDShared/Components/SynthEngines/<Motor>/` y son consumidos por **todos** los hosts que necesiten esa información — tanto el plugin standalone como la groovebox.

**Nunca** se duplican ni se bifurcan los specs en el repositorio del plugin individual. Si un plugin ya tenía su propio archivo de specs (p. ej. `ABDMCS48SE/WebUI/src/contracts/registry.gen.js`), este debe **actualizarse para importar desde ABDShared**:

```
ABDShared/Components/SynthEngines/Mcs48/mcs48ParamSpecs.js   ← SSOT
        ↑                                       ↑
ABDMCS48SE/WebUI/src/contracts/registry.gen.js  ABDMCX0X (panel embebido)
(re-exporta o importa desde ABDShared)          (Mcs48EnginePanel.js)
```

**Contenido obligatorio del archivo de specs en ABDShared** (`<motor>ParamSpecs.js`):
- `<MOTOR>_PARAMETERS_SPEC` — esquema v2.0.0 completo con `id`, `min`, `max`, `default`, `unit`, `format`, además de los metadatos de la **capa aséptica** (`semanticRole`, `wire`, `wireCodec`, `wireZeroCenter`, `cc`, `nrpnMsb`/`nrpnLsb`, `domainMin`/`domainMax`, `curve`) enlazados con `ABDShared/Contracts/<modelo>_parameter_spec.json` y `MidiTranslationEngine.ts`.
- `<MOTOR>_PARAM_LOOKUP` — `Map<id, spec>` para acceso O(1).
- Helpers puros de traducción `Wire ↔ Normalized ↔ Physical Domain` (p. ej. `tb303WireToDomain`/`tb303DomainToWire` o `emaxWireToNorm`/`emaxNormToPhysicalDomain`) y `<MOTOR>_FACTORY_PRESETS` con presets diferenciados audibles en síntesis pura (sin depender únicamente de overdrive/samples externos para sonar distintos).
- `<MOTOR>_TELEMETRY_KEYS` / subsets de etapa cuando aplique (LCD/cabecera).

**Actualización del plugin standalone** (`ABDMCS48SE/WebUI/src/contracts/registry.gen.js`):
```javascript
// registry.gen.js — ahora re-exporta desde ABDShared (no duplica)
export { MCS48_PARAMETERS_SPEC as PARAMETERS_SPEC, MCS48_PARAM_LOOKUP as PARAM_LOOKUP }
  from '@abdsynths/shared/components/SynthEngines/Mcs48/mcs48ParamSpecs.js';
```

### 4. Carátula Dedicada Canónica (`<Motor>EnginePanel.js`)

Cuando un sintetizador cuente con su propia interfaz artesanal completa (caso de `ABDMCS48SE` con su panel de voz, osciloscopio DAC, vúmetro, matriz de comandos y telemetría LCD), se aplica el **principio de Traslado Canónico a ABDShared**:

1. **La interfaz original se traslada a `ABDShared`, no se duplica:**
   - La interfaz del sintetizador se descompone en `ABDShared/Components/SynthEngines/<Motor>/` en submódulos **< 200 líneas** (y `< 300` en `.h`/`.cpp`), con **`0` colores `#hex` literales** (100 % tokens `--color-*`) y aislamiento `[hidden] { display: none; }` en toda vista con `display: flex`/`grid` para que la pestaña activa no filtre controles sobre `Explorar Presets`.
   - **Paridad `100 %` (`N/N`) con controles canónicos ABD:** todos los parámetros aceptados por el motor (`15/15` en `tb303_synth`, `37/37` en `emax_synth`) deben exponerse mediante `Knob`, `Segmented`, `Toggle`, `RomplerWavePicker`, `EngineHeaderBar` y `EnginePresetBrowser` (cero `<input type="range">` crudos como superficie principal ni keybeds embebidos).
   - Se desacopla de llamadas directas a un backend específico (`window.__JUCE__`) utilizando la interfaz estándar `bridge` (`getParam`, `setParam`, `getState`, `setMatrixRow`).
   - Se excluyen elementos exclusivos del host como el teclado virtual (véase punto 5).
2. **El plugin individual pasa a ser un consumidor (Cero Duplicación):**
   - En el repositorio del plugin (p. ej. `ABDMCS48SE/WebUI`), se eliminan el HTML estático repetido y los scripts duplicados de instanciación de controles.
   - El plugin standalone simplemente monta el componente de `ABDShared` (`createMcs48EnginePanel`) sobre un contenedor (`#synthStageMount`), conectándole su puente nativo.
3. **El host multitímbrico (`ABDMCX0X`) monta exactamente el mismo componente:**
   - Al importar `index.js`, el panel se auto-registra en `enginePanelRegistry.js`.
   - Cuando el usuario abre la modal de instrumento o el drawer, `EnginePanelHost.mount(bridge)` monta la carátula canónica idéntica.
4. **Beneficio directo:** Existe **una sola versión de la interfaz** en toda la suite. Cualquier ajuste de diseño, mejora de rendimiento, tema visual o calibración de parámetros se realiza en un único lugar (`ABDShared`) y se refleja automáticamente en el plugin standalone y en la Groovebox.

**Patrón de dependencias y única fuente de verdad (SSOT):**
```
ABDShared/Components/SynthEngines/Mcs48/
├── mcs48ParamSpecs.js     ← Única fuente de verdad de parámetros
├── mcs48VoiceView.js      ← Panel de Voz + Salida Master (Scope/VU)
├── mcs48MatrixView.js     ← Matriz de 8 Pasos + Telemetría LCD
├── Mcs48EnginePanel.js    ← Orquestador y registro del panel
└── mcs48-panel.css        ← Estilos únicos compartidos
         ▲                                      ▲
         │ (consume)                            │ (consume vía EnginePanelHost)
  ABDMCS48SE (Standalone/VST3)           ABDMCX0X (Groovebox 64P)
  index.html: solo #synthStageMount       McxSynthModal: #mcx-synth-slot
```

### 5. Desacoplo Absoluto del Keybed en Modo Embebido (Regla de Ergonomía y DRY)

> **Principio de Superficie de Ejecución Única:** En la suite ABDSynths, el teclado virtual (`@abdsynths/midi-keyb`), los botones de octava (`OCT +/-`), y las ruedas de pitch/modulación pertenecen **exclusivamente a la superficie global del host**, nunca al panel embebido del motor.

1. **Cero redundancia y máximo espacio vertical:**
   - En un plugin standalone (p. ej. ventana independiente de `ABDMCS48SE`), el keybed inferior es útil para audición rápida sin controlador MIDI.
   - En una Groovebox/Workstation (`ABDMCX0X`), el host ya cuenta con su propio keybed global, pads de batería, secuenciador por pasos y arpegiadores por pista.
   - Incluir un teclado en el panel embebido (`Mcs48EnginePanel`, modal de instrumento o cajón lateral) es **redundante**, desperdicia entre 120 y 160 px de altura útil y fuerza barras de scroll innecesarias en resoluciones compactas (720p/1080p). Por tanto, en modo embebido el teclado **se omite u oculta por completo**.

2. **Flujo MIDI Centralizado (SSOT de Eventos y Teclas Habilitadas):**
   - El panel embebido jamás debe registrar listeners de teclado QWERTY ni capturar eventos de nota locales.
   - Es el host (`ABDMCX0X`) quien captura la entrada física (USB/DIN MIDI, QWERTY del host), aplica la transposición de pista, la escala, el arpegiador y despacha las notas (`noteOn`, `noteOff`), inflexión de tono (`pitchBend` / benders) y modulaciones en tiempo real directamente al motor a través de `ISoundEngine` y `McxPartEngineBridge`.
   - Además, cuando una pista opera con un mapa discreto de sonidos (p. ej. kits de batería `drum_map` / `populatedDrumNotes[]`), el host sincroniza el keybed compartido (`keyboard.setPlayableNotes(notes)`) para deshabilitar visual y funcionalmente (`.kbd-key-disabled` / `aria-disabled="true"`) las teclas MIDI sin sonido asignado y restaurarlas (`null`) al volver a modo cromático.
   - El panel del sintetizador se concentra al 100% en lo que le es propio: los potenciómetros de voz, la telemetría interna, la matriz de comandos y los presets.

3. **Desacoplo de Bancos PCM (`.abdbank`) y Cromado Común Multimotor (`EngineHeaderBar` + `EnginePresetBrowser`):**
   - **Ningún host (Groovebox) debe contener lógica o barras de bancos PCM fuera del panel del motor.** En `ABDMCX0X`, `McxSynthModal.ts` y `McxInstrumentRouteModal.ts` son 100% agnósticos al motor: el modal de ruta elige el motor DSP y la ruta MIDI; el panel embebido del motor gestiona sonidos, presets y bancos.
   - **Cromado común para todos los motores (`ABDShared/Components/SynthEngines/Common/`):** Cualquier motor (`structured_rompler`, `mcs48_synth`, `abyssmind_synth`, `GenericEnginePanel` y futuros motores) comparte `EngineHeaderBar` (selector unificado, `◀`/`▶`, `Init` contextual y popover `Guardar` con categoría Hartmann `0..9` + autor) y `EnginePresetBrowser` (búsqueda, favoritos y filtros).
   - **Los bancos `.abdbank` y muestras `wavePool[]` viven dentro de los motores con `supportsBankArchives: true`:** Cuando el descriptor declara `supportsBankArchives: true`, `EnginePresetBrowser` habilita automáticamente la sección de bancos `.abdbank` (carga bajo demanda e importación drag-and-drop) en su pestaña `Explorar`. Motores como `mcs48_synth` no la muestran.
   - **Taxonomía canónica Hartmann Neuron `0..9` + `playMode` ortogonal:** Todos los instrumentos, presets Factory y presets de usuario se clasifican con `categoryId` (`0..9`, literales `'musical' | 'neuron' | 'short'`) y un eje ortogonal `playMode` (`'chromatic' | 'drum_map'`). En `StructuredRomplerPanel`, cargar un sonido o usar `Init` adapta las pestañas entre modo Cromático (`Explorar | Parciales P1-P4 | Vector y Mod`) y modo Drum (`Explorar | Pads del Kit | Filtro y Satur. Kit`), eliminando conmutadores sueltos destructivos.
   - **Asignación de onda PCM por parcial y por pad (`RomplerWavePicker`):** Mediante `EnginePanelBridge.listWaveBanks`, `listWavesInBank` y `assignWaveToTarget`, cualquier parcial PCM (`partial_wave`) o pad rítmico (`drum_wave`) puede sustituir su muestra de forma independiente.

---

## 8. Hoja de Ruta Normativa para Nuevos Sintetizadores (10 Pasos)

La especificación completa y verificable de las 4 capas asépticas vive en [`../../ABDShared/Docs/integration/SYNTH_ENGINE_INTEGRATION_GUIDE.md`](../../ABDShared/Docs/integration/SYNTH_ENGINE_INTEGRATION_GUIDE.md). Para incorporar cualquier instrumento (`TB-303`, `Emax II`, `ABDJUNiO601`, `ABDMS2000`, etc.), el orden obligatorio es:

1. **Auditoría Core (`< 300` lín./fichero):** Verificar que el núcleo DSP compila sin JUCE, es RT-safe, hace auto-sleep (`renderBlock() == false` en silencio) y fragmenta implementaciones largas en unidades `< 300` líneas.
2. **Promoción de Filtros a `DspCore`:** Extraer todo filtro hardware específico a `ABDShared/Code/DspCore/` (p. ej. `DspTb303DiodeLadder.h`, `DspEmaxHChipFilter.h`), incluirlo en `DspCore.h` y verificar `abd::dsp::IsFilterStage<T>`.
3. **Adaptador `ISoundEngine` con Alias y `SemanticRoleHash`:** Implementar `getControlInputDescriptors()` sin slots huérfanos de rol, `getFactoryPresetCategory(int)` (`0..9` Hartmann Neuron), `serializeStateJson()`/`deserializeStateJson()`, y soporte en `setParamByKey`/`getParamByKey` para alias en dominio físico del host (`cutoffHz`/`p1.cutoffHz`, `p1.amp.t1Ms..t4Ms`, `coarse`, `fine`, `porta.timeMs`/`slide`).
4. **Tests C++ Automatizados:** Añadir suite en `ABDShared/Code/SynthEngines/Tests/` verificando notas, silenciamiento 0 % CPU, estabilidad sin NaN/Inf, presets y serialización JSON.
5. **Contratos JSON Asépticos en `ABDShared/Contracts/` ← OBLIGATORIO:** Crear `<modelo>_parameter_spec.json` (`parameter_dictionary.schema.json` v2.0.0) y `<modelo>.json` (`hardware_profile.schema.json` v2.0) validados por esquema e hidratables en `MidiTranslationEngine` y `HardwareProfileHydrator`.
   - **Configuración para `PerformanceDeck` (Nuke Aséptico):**
     1. Incluir el bloque raíz `"performanceDeck"` (`macros[0..10]` con `{ paramId, label?, minNorm?, maxNorm?, invert?, bipolar? }` y `xyPad: { x, y, labels? } | null`), más `shortName`, `automatable: false` (en parámetros globales no automatizables) y `automationInterp` (`"linear" | "step"`). Si el motor expone menos de 10 controles o sin XY, los slots restantes se deshabilitan (`—`) automáticamente sin duplicar el slot 0.
     2. Registrar el contrato en `ALL_SPECS` y mapear el `typeId` del motor en `ENGINE_ALIASES` dentro de `ABDShared/Contracts/parameterSpecCatalog.js` (p. ej. `tb303_synth: 'roland_tb303'`). Ver guía completa en [`../../ABDShared/Docs/integration/INTEGRACION_PERFORMANCE_DECK.md`](../../ABDShared/Docs/integration/INTEGRACION_PERFORMANCE_DECK.md).
6. **Registro Host C++ y Enrutado Semántico:** Dar de alta el motor en `McxEngineRegistry`, propagar alias en `McxParamRouter.h` y enrutar CC/NRPN/SysEx entrantes en `McxHardwareInbound.cpp` sin duplicar modulaciones sobre `TrackModRouter`.
7. **Specs WebUI (`<motor>ParamSpecs.js`) y `unifiedEngineControlSpecs.js` ← OBLIGATORIO:** Declarar los `N` parámetros completos con `semanticRole`, `cc`/`nrpn`, curva, rango físico y conversores puros `Wire ↔ Normalized ↔ Domain` en `ABDShared/Components/SynthEngines/<Motor>/`, junto con `ENGINE_BINDINGS` y `ENGINE_DRAWER_CAPABILITIES` en `Common/unifiedEngineControlSpecs.js`.
8. **Metadatos y Carátula Única `.webp`:** Registrar el motor en `enginePanelRegistry.js`, colocar la carátula `.webp` oficial en `ABDShared/Assets/models/` y añadirla en `MODEL_COVERS` (`ABDMCX0X/vite.config.ts`).
9. **Carátula Canónica (`<Motor>EnginePanel.js`) con Paridad `N/N`:** Modularizada `< 200` líneas por archivo, `0` `#hex`, regla `[hidden] { display: none; }`, `EngineHeaderBar` + `EnginePresetBrowser` compartidos, controles `Knob`/`Segmented`/`Toggle`/`RomplerWavePicker` cubriendo el `100 %` de los parámetros, cero teclados embebidos y presets audibles diferenciados en síntesis pura.
10. **Barrel y Tests Vitest:** Exportar panel, specs y helpers en `ABDShared/Components/SynthEngines/index.js` (+ `.d.ts`) y pasar `Contracts/Contracts.test.js` + `tests/<motor>EnginePanel.test.js`.

---

## 9. Regla de Oro: Flujo de Dependencias WebUI

```
ABDShared/Components/SynthEngines/
├── Common/                  ← EngineHeaderBar, EnginePresetBrowser, userPresetsStore
├── <Motor>/                 ← <motor>ParamSpecs.js + vistas (< 200 líneas, 0 hex)
└── genericEnginePanel.js    ← Fallback universal con browser y presets comunes

Consumers:
  Plugin Standalone (<Motor>/WebUI/src/...)   → importa desde ABDShared
  Groovebox (ABDMCX0X WebUI)                 → importa desde ABDShared vía EnginePanelHost + McxPartEngineBridge
```

**Nunca:**
- Mantener dos versiones de la misma interfaz o duplicar un browser de presets/bancos en el chasis host (`ABDMCX0X`).
- Crear specs en el plugin y luego copiarlos/moverlos al panel embebido o hardcodear `isRompler` en `McxSynthModal.ts` o `GenericEnginePanel`.
- Incluir o montar un keybed virtual (`@abdsynths/midi-keyb`) dentro del panel embebido: el teclado es responsabilidad exclusiva del host.
- Exponer carga `.abdbank` en sintetizadores que declaren `supportsBankArchives: false`.

---

## 10. Capa CDD Mínimo Común Denominador, Deshabilitado Dinámico y Fidelidad JV-880 (Nov 2026)

1. **Capacidades por Motor y Ruta (`ENGINE_DRAWER_CAPABILITIES` / `getEngineDrawerCapabilities`):**
   - Declaradas en `ABDShared/Components/SynthEngines/Common/unifiedEngineControlSpecs.js` y re-exportadas en `index.js` / `index.d.ts`, enlazando cada control común con su `semanticRole` canónico de `ABDShared/Contracts/semanticRoles.ts` y las especificaciones de `Contracts/*_parameter_spec.json`.
   - Permite consultar qué macro-controles de síntesis y mezcla (`cutoffOffset`, `resonanceOffset`, `envAttackOffset`, `envDecayOffset`, `envReleaseOffset`, `vibratoOffset`, `pitchCoarse`, `pitchFine`, `portaSwitch`, `level`, `pan`, envíos `reverbSend`/`chorusSend`/`delaySend`, `driveType`) soporta cada motor (`structured_rompler`, `jv880_synth`, `la50_synth`, `cm32_synth`, `tb303_synth`, `emax_synth`, `mcs48_synth`, `abyssmind_synth`, `external_midi`).
   - Los filtros específicos extraídos durante el desarrollo de los motores (`Tb303DiodeLadderFilter` en `DspCore/DspTb303DiodeLadder.h` y `EmaxHChipFilter` en `DspCore/DspEmaxHChipFilter.h`) se promueven a `ABDShared::DspCore` honrando `IsFilterStage<T>` para reutilización transversal en la suite.

2. **Deshabilitado Visual y Funcional en `Knob` y Cajón Lateral (`McxToneDrawer`):**
   - `Knob` (`ABDShared/Components/Controls/Knob.js`) expone la opción `disabled` y el método `setDisabled(boolean)`, aplicando `.is-disabled`, `aria-disabled="true"` / `"false"`, `tabIndex = -1` / `0` y bloqueando arrastre, rueda, teclado y doble clic. `GenericEnginePanel` propaga `spec.disabled` de forma automática.
   - En `ABDMCX0X`, `McxToneDrawerKnobs.setParamDisabled()` y `McxToneDrawerSync.syncToneDrawerDom()` atenúan las celdas no soportadas con valor `'N/A'` y desactivan controles de síntesis o envíos incompatibles tanto para motores limitados (p. ej. `mcs48_synth` sin filtro, decay ni vibrato) como cuando la pista opera en `routeMode = 1` (*External MIDI*).

3. **Propagación C++ de Roles Semánticos y Parámetros Compartidos:**
   - `ABDMCX0X/Source/Core/McxParamRouter.h` (casos `53..57`: `pitchCoarse`, `pitchFine`, `portaEnabled`, `portaTimeMs`, `portaLegatoOnly`) propaga afinación y portamento de forma uniforme tanto a los alias de `StructuredRompler` (`u.keyShift`/`l.keyShift`, `u.masterFine`/`l.masterFine`, `portaSwitch`/`portaTime`/`portaMode`) como a `tuningA4` y `glide` en LA-50/CM-32L/MCS-48.
   - `La50SoundEngine` y `La50ParamCodec` (`ABDShared/Code/SynthEngines/LinearArithmetic/`) añaden `TvaDecay` (`kAmpEnvDecay`) y `VibratoDepth` (`kLfo1Depth`) al contrato de control de la familia D-50/LA-50.

4. **Puente `SET_ENGINE_STATE_JSON` y 64 Tonos JV-880 Preset A Multi-Parcial:**
   - `ABDMCX0X/WebUI/src/wasm/mcx0xWorklet.js` procesa explícitamente `SET_ENGINE_STATE_JSON` invocando `setPartEngineStateJson` en WASM y re-emitiendo el estado actualizado; `McxPartBankAdapter.ts` y `McxPartEngineBridge.ts` añaden `ensureWaveBankLoaded` y sincronizan `presetName`; `jv880SysexBankStore.js` actualiza el nombre del preset al aplicar parches SysEx DT1.
   - `RomplerFactoryPatches.cpp` + `RomplerJv880Presets.h` dotan a los 64 tonos de fábrica JV-880 (`applyJv880FactoryTone`) de datos reales extraídos de `JV880_Preset_A.syx` (hasta 3 parciales por tono, ondas secundarias, cortes/resonancia, envolventes 4T4L TVA/TVF, afinación, panorama estéreo y LFO1).
