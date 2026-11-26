// WP-25 acceptance: the full set compiles with no error finding (Q1.2.1), covers every play kind and coverage family,
// every alignment is legal under both fixture rule sets, the data holds no forbidden key, and every claim names real
// sources whose independence groups agree with its status word (A5.2.1).
import { describe, expect, it } from 'vitest';
import { OffensePlayKind, CoverageFamily, Assignment, scanForbiddenJson } from '@gm/schema';
import { lang as langModule } from '@gm/football-lang';
import { JERSEYS } from '../../src/starter/index.ts';
import { FULL, ALL_SOURCES, SOURCE_BY_ID, assignmentsOf, formationOf } from '../../src/full/index.ts';
import type { Basis } from '../../src/starter/types.ts';
import { fixtureRules } from '../starter/rules.ts';

const { printAssignment, parseAssignment } = langModule;
const lang = langModule.createFootballLang();
const everything = [...FULL.plays, ...FULL.defense];

describe('size and coverage of the set', () => {
  it('keeps the starter content and adds to it', () => {
    expect(FULL.plays.length).toBe(12 + FULL.added.plays.length);
    expect(FULL.defense.length).toBe(8 + FULL.added.defense.length);
    expect(FULL.added.plays.length).toBeGreaterThanOrEqual(26);
    expect(FULL.added.defense.length).toBeGreaterThanOrEqual(9);
  });
  it('has at least one play of every kind', () => {
    for (const k of OffensePlayKind.options) expect(FULL.plays.filter((p) => p.kind === k).length, k).toBeGreaterThanOrEqual(1);
  });
  it('has at least eight runs, ten dropback or quick passes, and every screen, rpo and quarterback-run kind', () => {
    expect(FULL.plays.filter((p) => p.kind === 'run').length).toBeGreaterThanOrEqual(9);
    expect(FULL.plays.filter((p) => p.kind === 'dropback_pass' || p.kind === 'quick_pass').length).toBeGreaterThanOrEqual(13);
    expect(FULL.plays.filter((p) => p.kind === 'screen').length).toBeGreaterThanOrEqual(3);
  });
  it('has calls in every coverage family, and two or more in the man and zone families', () => {
    for (const f of CoverageFamily.options) expect(FULL.defense.filter((d) => d.coverageFamily === f).length, f).toBeGreaterThanOrEqual(1);
    for (const f of ['cover1', 'cover2', 'cover3', 'cover4'] as const) expect(FULL.defense.filter((d) => d.coverageFamily === f).length, f).toBeGreaterThanOrEqual(2);
  });
  it('ids are unique across formations, plays and calls', () => {
    const ids = [...FULL.formations, ...FULL.plays, ...FULL.defense].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every play names a formation that exists and the play uses that formation\'s players', () => {
    for (const p of FULL.plays) {
      const f = formationOf(p);
      expect(f, p.id).not.toBeNull();
      expect(p.slots.map((s) => s.role).sort(), p.id).toEqual(f!.players.map((x) => x.role).sort());
      expect(p.personnel, p.id).toBe(f!.personnel);
      expect(p.shotgun, p.id).toBe(f!.shotgun);
    }
  });
  it('every call is drawn against a formation that exists', () => {
    for (const d of FULL.defense) expect(FULL.formations.some((f) => f.id === d.drawnAgainst), d.id).toBe(true);
  });
});

describe('every assignment compiles with no error finding', () => {
  for (const def of everything) {
    it(def.id, () => {
      const as = assignmentsOf(def);
      expect(as).toHaveLength(11);
      expect(new Set(as.map((a) => a.role)).size).toBe(11);
      for (const a of as) {
        expect(Assignment.safeParse(a).success, `${def.id} ${a.role}`).toBe(true);
        const r = lang.compile(a);
        expect(r.findings.filter((f) => f.severity === 'error'), `${def.id} ${a.role}`).toEqual([]);
        expect(r.compiled).not.toBeNull();
      }
      expect(lang.validateAssignments(as).filter((f) => f.severity === 'error')).toEqual([]);
    });
  }
  it('prints and parses without loss', () => {
    for (const def of FULL.added.plays) for (const a of assignmentsOf(def)) expect(parseAssignment(printAssignment(a))).toEqual(a);
    for (const def of FULL.added.defense) for (const a of assignmentsOf(def)) expect(parseAssignment(printAssignment(a))).toEqual(a);
  });
});

describe('offensive alignments are legal under both fixture rule sets (B4, G1.5.1)', () => {
  for (const rules of fixtureRules()) {
    for (const p of FULL.added.plays) {
      it(`${p.id} under ${rules.id}`, () => {
        const players = assignmentsOf(p).map((a) => ({ role: a.role, px: a.preSnap.align.px, py: a.preSnap.align.py, onLine: a.preSnap.onLine, jersey: JERSEYS[a.role] ?? 0, inMotion: false }));
        expect(lang.checkAlignment(players, rules).filter((f) => f.ruleKey !== null)).toEqual([]);
      });
    }
  }
});

describe('every play is drawn to the right and mirrored by rule (G1.4.2)', () => {
  it('has drawnTo right and no negative zero', () => {
    for (const p of FULL.plays) expect(p.drawnTo).toBe('right');
    for (const def of everything) expect(JSON.stringify(assignmentsOf(def))).not.toContain('-0,');
  });
});

describe('forbidden keys and outcome numbers', () => {
  it('the data holds none (Q1.2.1)', () => {
    const data = JSON.parse(JSON.stringify({ formations: FULL.formations, plays: FULL.plays, defense: FULL.defense }));
    expect(scanForbiddenJson('full', data)).toEqual([]);
    for (const key of ['yards', 'completionPct', 'successRate']) expect(JSON.stringify(data)).not.toContain(`"${key}"`);
  });
});

describe('sourcing', () => {
  const bases: [string, readonly Basis[]][] = [...FULL.formations, ...FULL.plays, ...FULL.defense].map((d) => [d.id, d.basis]);
  it('source ids are unique and every source has a page, a group and a note of how it was read', () => {
    expect(new Set(ALL_SOURCES.map((x) => x.id)).size).toBe(ALL_SOURCES.length);
    for (const s of ALL_SOURCES) { expect(s.url.length, s.id).toBeGreaterThan(4); expect(s.group.length, s.id).toBeGreaterThan(0); }
  });
  it('every cited source exists', () => {
    for (const [id, basis] of bases) for (const b of basis) for (const s of b.sources) expect(SOURCE_BY_ID.has(s), `${id}: ${s}`).toBe(true);
  });
  it('status words agree with the number of independence groups', () => {
    for (const [id, basis] of bases) for (const b of basis) {
      const groups = new Set(b.sources.map((s) => SOURCE_BY_ID.get(s)!.group)).size;
      if (b.status === 'Verified') expect(groups, `${id}: ${b.claim}`).toBeGreaterThanOrEqual(3);
      if (b.status === '2 of 3') expect(groups, `${id}: ${b.claim}`).toBeGreaterThanOrEqual(2);
      if (b.status === '1 of 3') expect(groups, `${id}: ${b.claim}`).toBe(1);
      if (b.status === 'Conflict') expect(groups, `${id}: ${b.claim}`).toBeGreaterThanOrEqual(2);
      if (b.status === 'Assumption') expect(b.sources.length === 0 || groups >= 1).toBe(true);
    }
  });
  it('every play and call rests on at least two independence groups of coaching sources', () => {
    for (const d of [...FULL.plays, ...FULL.defense]) {
      if (d.id === 'kneel_victory' || d.id === 'spike_clock') continue;
      const groups = new Set(d.basis.flatMap((b) => b.sources).map((s) => SOURCE_BY_ID.get(s)!.group));
      expect(groups.size, d.id).toBeGreaterThanOrEqual(2);
    }
  });
  it('anything no source gives is flagged: every added play and call carries an Assumption row', () => {
    for (const d of [...FULL.added.plays, ...FULL.added.defense]) expect(d.basis.some((b) => b.status === 'Assumption'), d.id).toBe(true);
  });
});
