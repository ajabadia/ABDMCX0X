/** ABDMCX0X — Vitest coverage for pure contextual Q-Link model. */
import { describe, expect, it } from 'vitest';
import {
  QLINK_CONTEXTS, QLINK_TARGET_TYPES, clearQLinkOverrides, deserializeQLinkOverrides,
  getQLinksForContext, serializeQLinkOverrides, setQLinkOverride,
  type QLinkContext, type QLinkOverrideMap,
} from './McxQLinksModel';

describe('getQLinksForContext', () => {
  it('maps exactly four knobs for every active context', () => {
    for (const context of QLINK_CONTEXTS) {
      const links = getQLinksForContext(context);
      expect(links).toHaveLength(4);
      expect(links.map((l) => l.id)).toEqual(['q1', 'q2', 'q3', 'q4']);
      expect(new Set(links.map((l) => l.paramKey)).size).toBe(4);
      links.forEach((l) => {
        expect(QLINK_TARGET_TYPES).toContain(l.targetType);
        expect(l.label.length).toBeGreaterThan(0);
        expect(l.max).toBeGreaterThan(l.min);
        expect(l.defaultNorm).toBeGreaterThanOrEqual(0);
        expect(l.defaultNorm).toBeLessThanOrEqual(1);
      });
    }
  });

  it('uses the expected focus-specific parameter keys', () => {
    const keys = (c: QLinkContext): string[] => getQLinksForContext(c).map((l) => l.paramKey);
    expect(keys('mixer')).toEqual(['partLevel', 'partPan', 'reverbSend', 'chorusSend']);
    expect(keys('tone')).toEqual(['filterCutoff', 'filterResonance', 'ampAttack', 'ampRelease']);
    expect(keys('rack')).toEqual(['fxCutoff', 'fxResonance', 'fxDrive', 'fxMix']);
    expect(keys('pads')).toEqual(['padLevel', 'padTune', 'padDecay', 'padAttack']);
    expect(keys('master')).toEqual(['masterVolume', 'tempoBpm', 'masterReverbSend', 'masterLimiterCeiling']);
  });

  it('returns fresh objects and falls back to mixer for an unknown context', () => {
    const first = getQLinksForContext('tone');
    first[0].label = 'mutated';
    expect(getQLinksForContext('tone')[0].label).toBe('Cutoff');
    expect(getQLinksForContext('bogus' as QLinkContext)).toEqual(getQLinksForContext('mixer'));
  });

  it('applies sanitized overrides only to the selected context and slot', () => {
    const overrides: QLinkOverrideMap = {
      tone: [null, { label: 'Res', paramKey: 'res', min: 2, max: 8, defaultNorm: 0.5, targetType: 'rackParam' }, null, null],
    };
    expect(getQLinksForContext('tone', overrides)[1]).toEqual({
      id: 'q2', label: 'Res', targetType: 'rackParam', paramKey: 'res',
      min: 2, max: 8, defaultNorm: 0.5,
    });
    expect(getQLinksForContext('mixer', overrides)[1].paramKey).toBe('partPan');
    expect(getQLinksForContext('tone')[1].paramKey).toBe('filterResonance');
  });

  it('ignores invalid override fields and clamps defaultNorm', () => {
    const overrides: QLinkOverrideMap = {
      pads: [
        { targetType: 'bogus' as never, paramKey: '   ' },
        { min: 9, max: 1 },
        { defaultNorm: 5 },
        { defaultNorm: -3 },
      ],
    };
    const links = getQLinksForContext('pads', overrides);
    expect(links[0]).toMatchObject({ targetType: 'padParam', paramKey: 'padLevel' });
    expect(links[1]).toMatchObject({ min: -12, max: 12 });
    expect(links[2].defaultNorm).toBe(1);
    expect(links[3].defaultNorm).toBe(0);
  });
});

describe('Q-Link override persistence', () => {
  const seed: QLinkOverrideMap = { rack: [{ label: 'Old' }, null, null, null] };

  it('sets overrides without mutating the input or accepting bad indices', () => {
    const next = setQLinkOverride(seed, 'rack', 0, { label: 'New' });
    expect(next.rack?.[0]).toEqual({ label: 'New' });
    expect(seed.rack?.[0]).toEqual({ label: 'Old' });
    expect(setQLinkOverride(seed, 'rack', 4, { label: 'X' })).toBe(seed);
    expect(setQLinkOverride(seed, 'nope' as QLinkContext, 0, {})).toBe(seed);
  });

  it('round-trips canonical JSON and ignores unknown payloads', () => {
    let map: QLinkOverrideMap = {};
    map = setQLinkOverride(map, 'master', 1, { paramKey: 'tempoBpm', defaultNorm: 0.25 });
    map = setQLinkOverride(map, 'mixer', 3, { label: 'Send', min: 0, max: 1 });
    const json = serializeQLinkOverrides(map);
    expect(json).toBe('{"mixer":[null,null,null,{"label":"Send","min":0,"max":1}],"master":[null,{"paramKey":"tempoBpm","defaultNorm":0.25},null,null]}');
    expect(deserializeQLinkOverrides(json)).toEqual(map);
    expect(serializeQLinkOverrides(deserializeQLinkOverrides(json))).toBe(json);
    expect(deserializeQLinkOverrides('{')).toEqual({});
    expect(deserializeQLinkOverrides('[]')).toEqual({});
    expect(serializeQLinkOverrides({ pads: [{ nonsense: 1 } as never, null, null, null] })).toBe('{}');
  });

  it('clears one context or all of them', () => {
    expect(clearQLinkOverrides(seed, 'rack')).toEqual({});
    expect(clearQLinkOverrides({ ...seed, tone: [null, null, null, null] }, 'rack')).toEqual({ tone: [null, null, null, null] });
    expect(clearQLinkOverrides(seed)).toEqual({});
  });
});
