import type { RuleSet } from '@gm/schema';
import type { PackSource } from '../../src/content/index.ts';

const enc = new TextEncoder();

export function pack(origin: string, files: Record<string, unknown>): PackSource {
  return {
    origin,
    files: Object.entries(files).map(([path, v]) => {
      const bytes = v instanceof Uint8Array ? v : enc.encode(typeof v === 'string' ? v : JSON.stringify(v));
      return { path, size: bytes.length, bytes };
    }),
  };
}

export const manifest = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: `${id} pack`, version: '1.0.0', author: 'tests', contentSchemaVersion: 1, requires: [], kinds: ['football'], ...extra,
});

export const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, levelTags: ['both'], author: 'tests', version: '1.0.0', contentSchemaVersion: 1, ...extra,
});

export function fakeRules(id: string, values: Record<string, number | boolean | string> = {}): RuleSet {
  return {
    id, level: id.startsWith('college') ? 'college' : 'pro', seasonYear: 2026,
    num: (k) => { const v = values[k]; if (typeof v !== 'number') throw new Error(`no ${k}`); return v; },
    bool: (k) => { const v = values[k]; if (typeof v !== 'boolean') throw new Error(`no ${k}`); return v; },
    opt: (k) => { const v = values[k]; if (typeof v !== 'string') throw new Error(`no ${k}`); return v; },
    keys: () => Object.keys(values),
  };
}

/** A small core pack: a formation, two routes and a play that uses them. */
export function corePack(over: Record<string, unknown> = {}): PackSource {
  return pack('core-dir', {
    'pack.json': manifest('core'),
    'football/formations/doubles.json': item('doubles', { slots: 11 }),
    'football/routes/routes.json': [item('slant', { depth: 5 }), item('dig', { depth: 12 })],
    'playbooks/base.json': item('base-slant', { refs: [{ kind: 'football/formations', id: 'doubles' }, { kind: 'football/routes', id: 'slant' }] }),
    ...over,
  });
}
