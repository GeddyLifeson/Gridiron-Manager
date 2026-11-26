// Creepers, simulated pressures and five-man pressures of the starter books (F11, G2).
import { describe, expect, it } from 'vitest';
import { COLLEGE_BOOK, FULL_DEFENSE, PRESSURE_DEFENSE, PRESSURE_SOURCES, PRO_BOOK, SOURCE_BY_ID, isSimulatedPressure } from '../../src/full/index.ts';

const RUSH = new Set(['passRush', 'blitz']);
const LINE = new Set(['LDE', 'LDT', 'RDT', 'RDE']);
const byId = new Map(FULL_DEFENSE.map((d) => [d.id, d]));

describe('pressure calls', () => {
  it('each has eleven men, and the stated number rush', () => {
    for (const d of PRESSURE_DEFENSE) {
      expect(d.slots.length, d.id).toBe(11);
      expect(new Set(d.slots.map((s) => s.role)).size, d.id).toBe(11);
      expect(d.slots.filter((s) => RUSH.has(s.behavior)).length, d.id).toBe(d.rushers);
    }
  });
  it('a creeper or simulated pressure rushes four with a lineman dropping and a backer or back coming', () => {
    const sims = PRESSURE_DEFENSE.filter(isSimulatedPressure).map((d) => d.id).sort();
    expect(sims).toEqual(['def_creeper_boundary', 'def_creeper_field_edge', 'def_sim_mug_cover1_rat', 'def_sim_mug_cover3']);
    for (const id of sims) {
      const d = byId.get(id)!;
      expect(d.rushers).toBe(4);
      expect(d.slots.some((s) => LINE.has(s.role) && !RUSH.has(s.behavior))).toBe(true);
      expect(d.slots.some((s) => !LINE.has(s.role) && s.behavior === 'blitz')).toBe(true);
    }
    expect(isSimulatedPressure(byId.get('def_cover3_fire3_sim')!)).toBe(true);
    for (const id of ['def_cover3_sky', 'def_cover3_fire_zone', 'def_cover0_six_man', 'def_34_cover3', 'def_cover1_five_man']) expect(isSimulatedPressure(byId.get(id)!), id).toBe(false);
  });
  it('a simulated pressure shows six at the line; a creeper shows four', () => {
    const atLine = (id: string) => byId.get(id)!.slots.filter((s) => s.onLine === true).length;
    expect(atLine('def_sim_mug_cover3')).toBe(6);
    expect(atLine('def_sim_mug_cover1_rat')).toBe(6);
    expect(atLine('def_creeper_field_edge')).toBe(4);
    expect(atLine('def_creeper_boundary')).toBe(4);
  });
  it('every basis row names known sources, and its status matches the independent groups behind it', () => {
    const word = ['Assumption', '1 of 3', '2 of 3', 'Verified'];
    for (const d of PRESSURE_DEFENSE) for (const b of d.basis) {
      for (const s of b.sources) expect(SOURCE_BY_ID.has(s), `${d.id}: ${s}`).toBe(true);
      const groups = new Set(b.sources.map((s) => SOURCE_BY_ID.get(s)!.group)).size;
      expect(b.status, `${d.id}: ${b.claim}`).toBe(word[Math.min(groups, 3)]);
    }
    expect(new Set(PRESSURE_SOURCES.map((s) => s.id)).size).toBe(PRESSURE_SOURCES.length);
  });
  it('both starter books carry them', () => {
    for (const book of [PRO_BOOK, COLLEGE_BOOK]) {
      const ids = new Set(Object.values(book.defense).flatMap((m) => (m ?? []).map((e) => e.id)));
      for (const d of PRESSURE_DEFENSE) expect(ids.has(d.id), `${book.id}: ${d.id}`).toBe(true);
    }
  });
});
