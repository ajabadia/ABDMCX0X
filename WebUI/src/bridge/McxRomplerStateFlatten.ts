/**
 * ABDMCX0X -- McxRomplerStateFlatten.ts
 * Re-exports canonical Rompler flat state builders & deserializers from @abdsynths/shared.
 * Keeps host completely decoupled from engine-internal schema. Strictly < 30 lines.
 */

import {
  buildDefaultRomplerFlatState,
  flattenRomplerStateJson,
} from '@abdsynths/shared/components/synth-engines';

export { buildDefaultRomplerFlatState, flattenRomplerStateJson };

export function flattenEngineStateJson(engineTypeId: string, stateJson: string): Record<string, number> {
  return flattenRomplerStateJson(stateJson, engineTypeId);
}
