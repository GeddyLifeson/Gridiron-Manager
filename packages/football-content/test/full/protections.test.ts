// F5 protections as content: the shipped set, what each pass play calls, and the sourcing of every claim.
import { describe, expect, it } from 'vitest';
import { FULL_PLAYS, PROTECTIONS, PROTECTION_BY_ID, PROTECTION_SOURCES, protectionFor } from '../../src/full/index.ts';

const LINE = ['LT', 'LG', 'C', 'RG', 'RT'];

describe('F5 protections', () => {
  it('ships man, half slide and full slide at five, six and seven men', () => {
    expect(new Set(PROTECTIONS.map((p) => p.type))).toEqual(new Set(['man', 'half_slide', 'full_slide']));
    expect(new Set(PROTECTIONS.map((p) => p.count))).toEqual(new Set([5, 6, 7]));
    expect(PROTECTION_BY_ID.size).toBe(PROTECTIONS.length);
    for (const p of PROTECTIONS) {
      expect(p.count).toBe(5 + (p.back !== null ? 1 : 0) + (p.tightEnd !== null && p.count === 7 ? 1 : 0));
      if (p.type === 'man') expect(p.slide).toBeNull(); else expect(p.slide).not.toBeNull();
    }
  });
  it('every claim names sources that exist, and its status matches how many independent groups back it', () => {
    const groupOf = new Map(PROTECTION_SOURCES.map((s) => [s.id, s.group]));
    expect(groupOf.size).toBe(PROTECTION_SOURCES.length);
    for (const p of PROTECTIONS) {
      expect(p.basis.length).toBeGreaterThan(0);
      for (const b of p.basis) {
        for (const id of b.sources) expect(groupOf.has(id), `${p.id}: ${id}`).toBe(true);
        const groups = new Set(b.sources.map((id) => groupOf.get(id))).size;
        if (b.status === 'Verified') expect(groups, b.claim).toBeGreaterThanOrEqual(3);
        else if (b.status === '2 of 3') expect(groups, b.claim).toBe(2);
        else if (b.status === '1 of 3') expect(groups, b.claim).toBe(1);
      }
    }
  });
  it('every dropback, quick and play-action pass whose line pass-sets calls a protection that fits who it keeps in', () => {
    let called = 0;
    for (const play of FULL_PLAYS) {
      const c = protectionFor(play);
      const lineSets = LINE.every((r) => play.slots.find((s) => s.role === r)?.behavior === 'passSet');
      const kind = play.kind === 'dropback_pass' || play.kind === 'quick_pass' || play.kind === 'play_action';
      if (!kind || !lineSets) { expect(c, play.id).toBeNull(); continue; }
      expect(c, play.id).not.toBeNull();
      called++;
      const kept = play.slots.filter((s) => s.behavior === 'passSet' && !LINE.includes(s.role));
      expect(c!.keptIn.map((k) => k.role).sort(), play.id).toEqual(kept.map((s) => s.role).sort());
      // F5.1.2: the count is the men kept in (a seven-man call may hold more than seven).
      expect(c!.protection.count, play.id).toBe(Math.min(7, 5 + kept.length));
      expect(c!.lineRoles).toEqual(LINE);
    }
    expect(called).toBeGreaterThan(10);
  });
});
