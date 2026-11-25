/** ABDMCX0X — pure contextual Q-Link model: 4 knobs mapped to the active focus. */

export type QLinkContext = 'mixer' | 'tone' | 'rack' | 'pads' | 'master';
export type QLinkTargetType = 'partParam' | 'rackParam' | 'padParam' | 'send' | 'masterParam' | 'transport';

export interface QLinkAssignment {
  id: string; label: string; targetType: QLinkTargetType;
  paramKey: string; min: number; max: number; defaultNorm: number;
}
export interface QLinkOverride {
  label?: string; targetType?: QLinkTargetType; paramKey?: string;
  min?: number; max?: number; defaultNorm?: number;
}
export type QLinkOverrideMap = Partial<Record<QLinkContext, Array<QLinkOverride | null>>>;

export const QLINK_CONTEXTS: readonly QLinkContext[] = ['mixer', 'tone', 'rack', 'pads', 'master'];
export const QLINK_TARGET_TYPES: readonly QLinkTargetType[] = [
  'partParam', 'rackParam', 'padParam', 'send', 'masterParam', 'transport',
];
export const QLINK_COUNT = 4;

const q = (id: number, label: string, targetType: QLinkTargetType, paramKey: string,
  min: number, max: number, defaultNorm: number): QLinkAssignment =>
  ({ id: `q${id}`, label, targetType, paramKey, min, max, defaultNorm });

const DEFAULTS: Record<QLinkContext, readonly QLinkAssignment[]> = {
  mixer: [
    q(1, 'Part Level', 'partParam', 'partLevel', 0, 1, 0.8),
    q(2, 'Pan', 'partParam', 'partPan', -1, 1, 0.5),
    q(3, 'Reverb Send', 'send', 'reverbSend', 0, 1, 0),
    q(4, 'Chorus Send', 'send', 'chorusSend', 0, 1, 0),
  ],
  tone: [
    q(1, 'Cutoff', 'partParam', 'filterCutoff', 0, 1, 0.7),
    q(2, 'Resonance', 'partParam', 'filterResonance', 0, 1, 0.2),
    q(3, 'Attack', 'partParam', 'ampAttack', 0, 1, 0.1),
    q(4, 'Release', 'partParam', 'ampRelease', 0, 1, 0.3),
  ],
  rack: [
    q(1, 'FX Cutoff', 'rackParam', 'fxCutoff', 0, 1, 0.6),
    q(2, 'FX Resonance', 'rackParam', 'fxResonance', 0, 1, 0.2),
    q(3, 'FX Drive', 'rackParam', 'fxDrive', 0, 1, 0.25),
    q(4, 'FX Mix', 'rackParam', 'fxMix', 0, 1, 0.5),
  ],
  pads: [
    q(1, 'Pad Level', 'padParam', 'padLevel', 0, 1, 0.8),
    q(2, 'Pad Tune', 'padParam', 'padTune', -12, 12, 0.5),
    q(3, 'Pad Decay', 'padParam', 'padDecay', 0, 1, 0.4),
    q(4, 'Pad Attack', 'padParam', 'padAttack', 0, 1, 0.15),
  ],
  master: [
    q(1, 'Master Volume', 'masterParam', 'masterVolume', 0, 1, 0.85),
    q(2, 'Tempo', 'transport', 'tempoBpm', 40, 240, 0.4),
    q(3, 'Master Reverb', 'masterParam', 'masterReverbSend', 0, 1, 0.1),
    q(4, 'Limiter Ceiling', 'masterParam', 'masterLimiterCeiling', 0, 1, 0.9),
  ],
};

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const text = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v.trim() ? v.trim() : fallback;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Drops unknown keys and invalid values; null means "no override". */
function sanitize(raw: QLinkOverride | null | undefined): QLinkOverride | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: QLinkOverride = {};
  if (raw.label !== undefined) out.label = text(raw.label, '');
  if (QLINK_TARGET_TYPES.includes(raw.targetType as QLinkTargetType)) out.targetType = raw.targetType;
  if (raw.paramKey !== undefined) {
    const key = text(raw.paramKey, '');
    if (key) out.paramKey = key;
  }
  if (raw.min !== undefined && Number.isFinite(raw.min)) out.min = num(raw.min, 0);
  if (raw.max !== undefined && Number.isFinite(raw.max)) out.max = num(raw.max, 1);
  if (raw.defaultNorm !== undefined && Number.isFinite(raw.defaultNorm)) out.defaultNorm = clamp01(num(raw.defaultNorm, 0));
  return Object.keys(out).length ? out : null;
}

/** Always returns 4 fresh assignments; overrides are validated against the defaults. */
export function getQLinksForContext(
  context: QLinkContext, overrides: QLinkOverrideMap = {},
): QLinkAssignment[] {
  const base = DEFAULTS[context] ?? DEFAULTS.mixer;
  const custom = context in overrides ? (overrides[context] ?? []) : [];
  return base.map((def, i) => {
    const o = sanitize(custom[i]) ?? {};
    const min = num(o.min, def.min);
    const candidateMax = num(o.max, def.max);
    const validRange = candidateMax > min;
    return {
      ...def,
      label: o.label ?? def.label,
      targetType: o.targetType ?? def.targetType,
      paramKey: o.paramKey ?? def.paramKey,
      min: validRange ? min : def.min,
      max: validRange ? candidateMax : def.max,
      defaultNorm: clamp01(num(o.defaultNorm, def.defaultNorm)),
    };
  });
}

/** Pure setter: returns a new map, never mutates the incoming one. */
export function setQLinkOverride(
  overrides: QLinkOverrideMap, context: QLinkContext, index: number, patch: QLinkOverride,
): QLinkOverrideMap {
  if (!QLINK_CONTEXTS.includes(context) || !Number.isInteger(index) || index < 0 || index >= QLINK_COUNT) return overrides;
  const clean = sanitize(patch);
  const next: QLinkOverrideMap = { ...overrides };
  const slots = [...(next[context] ?? [])];
  while (slots.length < QLINK_COUNT) slots.push(null);
  slots[index] = clean;
  next[context] = slots;
  return next;
}

export function clearQLinkOverrides(overrides: QLinkOverrideMap, context?: QLinkContext): QLinkOverrideMap {
  if (context === undefined) return {};
  const next: QLinkOverrideMap = { ...overrides };
  delete next[context];
  return next;
}

/** Canonical JSON: fixed context order, fixed slot order, only valid keys. */
export function serializeQLinkOverrides(overrides: QLinkOverrideMap): string {
  let canonical: QLinkOverrideMap = {};
  for (const context of QLINK_CONTEXTS) {
    const slots = overrides[context];
    if (!Array.isArray(slots)) continue;
    for (let i = 0; i < QLINK_COUNT; i++) {
      const clean = sanitize(slots[i]);
      if (clean) canonical = setQLinkOverride(canonical, context, i, clean);
    }
  }
  return JSON.stringify(canonical);
}

export function deserializeQLinkOverrides(json: string): QLinkOverrideMap {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const raw = parsed as Record<string, unknown>;
  let result: QLinkOverrideMap = {};
  for (const context of QLINK_CONTEXTS) {
    const slots = raw[context];
    if (!Array.isArray(slots)) continue;
    for (let i = 0; i < QLINK_COUNT; i++) {
      const clean = sanitize(slots[i] as QLinkOverride | null);
      if (clean) result = setQLinkOverride(result, context, i, clean);
    }
  }
  return result;
}
