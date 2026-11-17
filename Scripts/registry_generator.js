#!/usr/bin/env node
/**
 * ABDMCX0X — registry_generator.js
 * Genera el registro de parámetros APVTS, helpers de conversión y contratos WebUI.
 *
 * Fuente Canónica:
 *   ../ABDShared/Contracts/abdmcx0x_parameter_spec.json
 *
 * Salidas:
 *   - Source/State/ParameterRegistry.gen.h
 *   - Source/State/Conversion.gen.h
 *   - WebUI/src/generated/parameters.gen.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const specPath = path.resolve(rootDir, '../ABDShared/Contracts/abdmcx0x_parameter_spec.json');
if (!fs.existsSync(specPath)) {
  console.error(`Error: Contrato no encontrado en ${specPath}`);
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const params = spec.parameters || [];

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// 1. Generar Source/State/ParameterRegistry.gen.h
let regH = `// ============================================================================
// ABDMCX0X — ParameterRegistry.gen.h
// AUTOGENERADO POR Scripts/registry_generator.js — NO EDITAR MANUALMENTE
// ============================================================================

#pragma once

#include <cstdint>
#include <cstddef>
#include <string_view>
#include <array>

namespace abdmcx {

constexpr size_t kNumParameters = ${params.length};

namespace ParamIdx {
`;

params.forEach((p, idx) => {
  const capId = capitalize(p.id);
  regH += `    inline constexpr uint32_t ${capId} = ${idx};\n`;
});
regH += `} // namespace ParamIdx\n\nnamespace ParamId {\n`;

params.forEach((p) => {
  const capId = capitalize(p.id);
  regH += `    inline constexpr const char* ${capId} = "${p.id}";\n`;
});
regH += `} // namespace ParamId\n\n`;

regH += `enum class WireType : uint8_t { None, CC, Nrpn, SysEx };\n\n`;

regH += `struct ParamDescriptor {\n`;
regH += `    uint32_t index;\n`;
regH += `    const char* id;\n`;
regH += `    const char* name;\n`;
regH += `    const char* group;\n`;
regH += `    const char* scope; // global or part\n`;
regH += `    const char* semanticRole;\n`;
regH += `    float minValue;\n`;
regH += `    float maxValue;\n`;
regH += `    float defaultValue;\n`;
regH += `    WireType wire;\n`;
regH += `    int16_t ccNumber;\n`;
regH += `    int16_t nrpnMsb;\n`;
regH += `    int16_t nrpnLsb;\n`;
regH += `};\n\n`;

regH += `inline constexpr std::array<ParamDescriptor, kNumParameters> kParameterDescriptors = {{\n`;
params.forEach((p, idx) => {
  let wire = 'WireType::None';
  let cc = p.cc !== undefined ? p.cc : -1;
  let msb = p.nrpnMsb !== undefined ? p.nrpnMsb : -1;
  let lsb = p.nrpnLsb !== undefined ? p.nrpnLsb : -1;
  if (p.wire === 'CC') wire = 'WireType::CC';
  else if (p.wire === 'Nrpn') wire = 'WireType::Nrpn';
  else if (p.wire === 'SysEx') wire = 'WireType::SysEx';

  regH += `    { ${idx}, "${p.id}", "${p.name}", "${p.group}", "${p.scope}", "${p.semanticRole || ''}", ${Number(p.min).toFixed(1)}f, ${Number(p.max).toFixed(1)}f, ${Number(p.default).toFixed(1)}f, ${wire}, ${cc}, ${msb}, ${lsb} },\n`;
});
regH += `}};\n\n} // namespace abdmcx\n`;

// 2. Generar Source/State/Conversion.gen.h
let convH = `// ============================================================================
// ABDMCX0X — Conversion.gen.h
// Helpers de conversión y normalización de parámetros
// ============================================================================

#pragma once

#include "ParameterRegistry.gen.h"
#include <algorithm>
#include <cmath>

namespace abdmcx {

inline float rawToNormalized(uint32_t paramIdx, float raw) noexcept {
    if (paramIdx >= kNumParameters) return 0.0f;
    const auto& desc = kParameterDescriptors[paramIdx];
    if (desc.maxValue <= desc.minValue) return 0.0f;
    return std::clamp((raw - desc.minValue) / (desc.maxValue - desc.minValue), 0.0f, 1.0f);
}

inline float normalizedToRaw(uint32_t paramIdx, float norm) noexcept {
    if (paramIdx >= kNumParameters) return 0.0f;
    const auto& desc = kParameterDescriptors[paramIdx];
    return desc.minValue + std::clamp(norm, 0.0f, 1.0f) * (desc.maxValue - desc.minValue);
}

inline float dbToGain(float db) noexcept {
    return (db <= -59.0f) ? 0.0f : std::pow(10.0f, db * 0.05f);
}

inline float gainToDb(float gain) noexcept {
    return (gain <= 0.0001f) ? -60.0f : 20.0f * std::log10(gain);
}

} // namespace abdmcx
`;

// 3. Generar WebUI/src/generated/parameters.gen.ts
let tsOut = `/**
 * ABDMCX0X — parameters.gen.ts
 * AUTOGENERADO POR Scripts/registry_generator.js — NO EDITAR MANUALMENTE
 */

export interface ParameterDef {
  index: number;
  id: string;
  name: string;
  group: string;
  scope: string;
  semanticRole: string;
  type: string;
  min: number;
  max: number;
  defaultValue: number;
  unit: string;
  choices?: string[];
  wire: string;
  cc?: number;
  nrpnMsb?: number;
  nrpnLsb?: number;
}

export const PARAM_DEFINITIONS: ParameterDef[] = ${JSON.stringify(params.map((p, idx) => ({
  index: idx,
  id: p.id,
  name: p.name,
  group: p.group,
  scope: p.scope,
  semanticRole: p.semanticRole || '',
  type: p.type,
  min: p.min,
  max: p.max,
  defaultValue: p.default,
  unit: p.unit || '',
  choices: p.choices,
  wire: p.wire || 'None',
  cc: p.cc,
  nrpnMsb: p.nrpnMsb,
  nrpnLsb: p.nrpnLsb,
})), null, 2)};
`;

fs.mkdirSync(path.join(rootDir, 'Source', 'State'), { recursive: true });
fs.mkdirSync(path.join(rootDir, 'WebUI', 'src', 'generated'), { recursive: true });

fs.writeFileSync(path.join(rootDir, 'Source', 'State', 'ParameterRegistry.gen.h'), regH, 'utf8');
fs.writeFileSync(path.join(rootDir, 'Source', 'State', 'Conversion.gen.h'), convH, 'utf8');
fs.writeFileSync(path.join(rootDir, 'WebUI', 'src', 'generated', 'parameters.gen.ts'), tsOut, 'utf8');

console.log('Artefactos de parámetros generados exitosamente.');
