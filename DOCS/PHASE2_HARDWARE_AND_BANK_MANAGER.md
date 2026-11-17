# FASE 2: PUENTE HARDWARE A/B EN VIVO + ABDBANKMANAGER (ABDMCX0X)

## 1. Visión General y Objetivos
La **Fase 2** dota a `ABDMCX0X` de control bidireccional hardware en tiempo real y persistencia multinivel de estado compatible con el ecosistema `ABDSynths` (`ABDShared/Code/HardwareMidiDetect`, `HardwareDrivers` y `ABDBankManager`).

Permite utilizar `ABDMCX0X` simultáneamente como:
1. **Sintetizador/Rompler Autónomo Digital** (modo `Internal`).
2. **Controlador Maestro de Módulos Hardware** (modo `ExternalMidi` sin carga en voces DSP internas).
3. **Espejo y Comparador A/B en Vivo** (modo `BothAB`), donde el audio interno y el dispositivo físico suenan en fase gracias a la compensación de latencia de muestra exacta.

Dispositivos objetivo inmediatos:
- **Boss DR-5 Dr. Rhythm Section** (`boss_dr5.json`): disponible físicamente para pruebas, soporte de CCs de pista (7, 10, 91) y NRPNs por tecla de batería GS (Pitch CC99=24, TVA Level CC99=26, Pan CC99=28, Reverb CC99=29).
- **Roland MC-303 Groovebox** (`roland_mc303.json`): soporte de TVF Cutoff/Resonance (NRPN 1/32, 1/33) y envolvente TVA/TVF (NRPN 1/99, 1/100, 1/102).
- **Roland D2**, **SC-55**, y estándar **ABD MCX-0X**.

---

## 2. Componentes Implementados

### 2.1. Cola Lock-Free SPSC (`Source/MIDI/McxMidiOutQueue.h`)
- Búfer circular sin bloqueos ni asignaciones en el hilo de audio (`Single-Producer Single-Consumer`).
- Capacidad por defecto de 1024 mensajes (`McxMidiOutMessage`), potencia de 2 con enmascaramiento rápido por bit (`mask = Cap - 1`).
- Alineación en líneas de caché (`alignas(64)`) para `writeHead_` y `readHead_`, impidiendo *false sharing* entre el núcleo que ejecuta el render de audio y el hilo de despacho MIDI.
- Métodos seguros `push()`, `pop()`, `popBatch()`, `size()`, `empty()` y `clear()`.

### 2.2. Compensador de Latencia A/B (`Source/Hardware/McxLatencyCompensator.h`)
- Búfer circular estéreo de muestra exacta sin asignación dinámica (hasta 100 ms a 192 kHz).
- Permite retrasar la señal de audio interna generada por `McxEngine` para alinearla al microsegundo con la latencia física de transmisión MIDI y respuesta de firmware de las máquinas hardware externas (evitando desfases y filtrado peine en modo `BothAB`).
- Bypass automático de coste cero cuando `delaySamples_ == 0`.

### 2.3. Puente Hardware Bidireccional Aséptico (`Source/Hardware/McxHardwareBridge.h/.cpp`)
- **Arquitectura Aséptica Basada en Contratos (`McxHardwareDeviceProfile`)**:
  - **Cero código hardcodeado por sintetizador**: La lógica del puente no bifurca por modelos de hardware (`no if(target == BossDr5)` ni enums rígidos).
  - Toda la asignación de mensajes se rige por un perfil de datos (`McxHardwareDeviceProfile` y `McxParamControlMap`), configurable mediante presets o contratos JSON (`boss_dr5.json`, `roland_mc303.json`, etc.).
  - Cada control (volumen, panorama, filtros, envolventes, afinación y niveles de drum kit) define su método (`MidiCc` o `Nrpn7Bit`), número de controlador, subnúmero y rango min/max.
- **Enrutamiento por Parte (`McxPartRouteMode`)**:
  - `Internal`: Dispara voces y altera parámetros del motor DSP `McxEngine`.
  - `ExternalMidi`: Omite asignación de voces internas y encola notas/controladores en `McxMidiOutQueue`.
  - `BothAB`: Dispara voces internas y encola simultáneamente eventos MIDI salientes.
- **Transmisión de Parámetros Salientes**:
  - Orden estricto Roland para NRPN: `CC99 (MSB) -> CC98 (LSB) -> CC6 (Data Entry MSB)`.
  - Mapeo dinámico de Drum Key NRPN según el perfil activo (Pitch Coarse, Level, Pan, Reverb).
  - Mapeo dinámico de TVF Cutoff/Resonancia y envolventes según el método configurado en el perfil (CC o NRPN).
- **Recepción y Parsing MIDI Entrante**:
  - Máquina de estados para NRPN entrantes sobre CC99, CC98 y CC6.
  - Al completar un NRPN en canal de batería (`isDrumKit`), consulta el perfil activo y actualiza inmediatamente el pitch, volumen, panorama o envío de reverb del drum slot en `McxEngine`.
  - Al recibir NRPN o CC de sintetizador, actualiza los filtros o envolventes de los parciales según el mapa del perfil.
- **Despacho Seguro**:
  - Función `drainOutboundQueue(MidiByteSink)` para vaciar la cola hacia el backend hardware sin esperas activas ni bloqueos.

### 2.4. Puente BankManager y Persistencia (`Source/Core/McxBankManagerBridge.h/.cpp`)
- **Serialización JSON (`abd_mcx0x_preset_v1`)**:
  - Serializa y deserializa el estado multirítmico completo: 16 partes, 4 parciales por parte, estructura, vector morph, slots de percusión, efectos maestros (Chorus, Delay, Reverb), DAC Character y Persona.
  - Totalmente autónomo en C++20 (compila y corre en modo headless sin dependencias externas).
- **Integración JUCE / DAW (`ValueTree`)**:
  - Overloads condicionales `#if defined(JUCE_VERSION)` para persistencia en bloques de sesión DAW (`getStateInformation` / `setStateInformation`) y vinculación con `ABD::BankManager::BankManagerCore` y `ABD::BankManager::Patch`.
- **Generador de Volcados SysEx Roland DT1**:
  - Formateo `F0 41 <DevID> <ModelID> 12 <Address> <Data> <Checksum> F7`.
  - Algoritmo exacto de checksum Roland 7-bit: `(0x80 - (sum & 0x7F)) & 0x7F`.
  - Generador específico de volcados de pista para Boss DR-5 (`buildBossDr5TrackDump`).

---

## 3. Pruebas Unitarias Automatizadas (`Tests/McxPhase2Tests.cpp`)
El ejecutable `McxPhase2Tests` verifica:
1. **McxMidiOutQueue**: Comportamiento FIFO, llenado hasta capacidad (32), protección de desbordamiento en el mensaje 33, extracción en lote (`popBatch`) y retorno a estado vacío.
2. **Enrutamiento INT / EXT / BOTH**: Aislamiento de voces internas en `EXT`, generación limpia de mensajes salientes, y activación concurrente en `BOTH`.
3. **Compensación de Latencia**: Comprobación de retardo de muestra exacta (impulso trasladado exactamente 441 muestras a 10 ms @ 44.1 kHz).
4. **Espejo DR-5 & MC-303**:
   - Generación saliente de 3 CCs y 2 NRPNs de batería en orden estricto Roland (`CC99 -> CC98 -> CC6`).
   - Parsing entrante de NRPN de afinación de batería GS (CC99=24, CC98=36, CC6=70) actualizando el slot a +3.0 semitonos.
   - Parsing entrante de NRPN MC-303 TVF Cutoff actualizando la frecuencia de corte del parcial.
5. **Persistencia y SysEx**:
   - Roundtrip completo de preset multirítmico (exportación a JSON -> importación en nueva instancia -> verificación de retención exacta de parámetros).
   - Generación de volcado SysEx DT1 de Boss DR-5 con comprobación de checksum Roland exacto (`0x74`).
