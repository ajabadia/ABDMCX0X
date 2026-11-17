# DOCS — Fase 4: Contenedor Propietario `.abdbank` y Des-horneado

> **Documento de Arquitectura y Especificación Técnica**  
> **Proyecto:** `ABDMCX0X`  
> **Estado:** Implementado y Verificado (10/10 tests pasados en `McxPhase4Tests.cpp`).

---

## 1. Visión y Propósito

El formato `.abdbank` es el contenedor propietario de la familia `ABDSynths` para sonido e instrumentos rompler des-horneados. Permite encapsular muestras PCM de alta fidelidad, mapas cromáticos, definiciones de kits de percusión y estructuras multitímbricas sin dependencias de formatos cerrados de terceros (SF2/SFZ/Kontakt) ni riesgo de infracción de propiedad intelectual (sin ROMs protegidas).

---

## 2. Especificación del Contenedor `.abdbank`

- **Formato Físico:** Archivo ZIP estándar sin compresión (`Store`, compression method 0) para permitir lectura en streaming de muestra directa sin descompresión en memoria RAM adicional.
- **Estructura Interna de Archivos:**
  - `manifest.json`: Manifiesto canónico de metadatos, versión del contrato (`v1.0.0`), autor, hash SHA-256 de integridad y lista de instrumentos/kits.
  - `samples/`: Directorio que contiene archivos de audio WAV PCM (16-bit / 24-bit / 32-bit float, estéreo o mono).
  - `patches/`: Archivos JSON con descriptores de parches de 4 parciales (`abd_structured_rompler.schema.json`).
  - `drumkits/`: Descriptores JSON con mapeo de notas 0..127 a muestras, ajustes de afinación relativa, volumen, pan y grupos de corte (*mute groups*).

---

## 3. Implementación C++20 (`McxBankLoader`)

La clase `McxBankLoader` (`Source/Core/McxBankLoader.h/.cpp`) implementa:
1. **Extracción Zero-Copy:** Análisis de cabeceras locales ZIP y End of Central Directory (EOCD).
2. **Carga y Conversión PCM:** Carga de muestras a buffers de punto flotante `[-1.0, 1.0]`.
3. **Mute Groups de Batería:** Choke de hi-hats (`muteGroup 1`: pedal y closed hi-hat cortan inmediatamente el sonido de open hi-hat en la misma parte).
4. **Respaldo de Fábrica Integrado (`McxFactoryBank`):** Generación de instrumentos cromáticos y kits de percusión por síntesis determinista en caso de no suministrar un archivo externo.

---

## 4. Próximas Mejoras en Fase 4/5

1. **Mezcla Multi-Banco por Pista:** Permitir que cada una de las 16 partes consuma un banco `.abdbank` diferente simultáneamente mediante un *Wave Pool* compartido.
2. **Estrategia Dual de Persistencia DAW:**
   - **Modo Ligero (Referencial por Defecto):** El estado del DAW guarda solo los parámetros y rutas relativas/absolutas a los archivos `.abdbank` (~20 KB por proyecto).
   - **Modo Bundle (Tree-Shaking para Intercambio):** Exporta un archivo `.abdbank` de proyecto que solo contiene las muestras de las partes activas, optimizando el tamaño para compartir sesiones entre creadores.
