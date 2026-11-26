// WP-15 acceptance (engine build plan): every play compiles with no error finding (Q1.2.1 forbidden-key
// lint runs over the data separately), one base play per OffensePlayKind and CoverageFamily, every play
// has eleven distinct roles and a legal formation, every claim names real sources in at least two
// independence groups unless it is flagged.
import { describe, expect, it } from 'vitest';
import { OffensePlayKind, CoverageFamily, Assignment, scanForbiddenJson } from '@gm/schema';
import { lang as langModule } from '@gm/football-lang';
import { STARTER, SOURCES, SOURCE_BY_ID, JERSEYS, assignmentsOf, formationSvg, FORMATION_BY_ID, type Basis } from '../../src/starter/index.ts';
import { fixtureRules } from './rules.ts';

const { printAssignment, parseAssignment } = langModule;
const lang = langModule.createFootballLang();

describe('coverage of the kinds', () => {
  it('has exactly one base play per OffensePlayKind', () => {
    expect(STARTER.plays.map((p) => p.kind).sort()).toEqual([...OffensePlayKind.options].sort());
  });
  it('has exactly one call per CoverageFamily', () => {
    expect(STARTER.defense.map((d) => d.coverageFamily).sort()).toEqual([...CoverageFamily.options].sort());
  });
  it('ids are unique', () => {
    const ids = [...STARTER.formations, ...STARTER.plays, ...STARTER.defense].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('every assignment compiles with no error finding', () => {
  for (const def of [...STARTER.plays, ...STARTER.defense]) {
    it(def.id, () => {
      const as = assignmentsOf(def);
      expect(as).toHaveLength(11);
      expect(new Set(as.map((a) => a.role)).size).toBe(11);
      for (const a of as) {
        expect(Assignment.safeParse(a).success).toBe(true);
        const r = lang.compile(a);
        expect(r.findings.filter((f) => f.severity === 'error'), `${def.id} ${a.role}`).toEqual([]);
        expect(r.compiled).not.toBeNull();
      }
      expect(lang.validateAssignments(as).filter((f) => f.severity === 'error')).toEqual([]);
    });
  }
  it('prints and parses without loss', () => {
    for (const def of [...STARTER.plays, ...STARTER.defense]) for (const a of assignmentsOf(def)) expect(parseAssignment(printAssignment(a))).toEqual(a);
  });
});

describe('formations are legal under both fixture rule sets (B4, G1.5.1)', () => {
  for (const rules of fixtureRules()) {
    for (const p of STARTER.plays) {
      it(`${p.id} under ${rules.id}`, () => {
        const as = assignmentsOf(p);
        const players = as.map((a) => ({ role: a.role, px: a.preSnap.align.px, py: a.preSnap.align.py, onLine: a.preSnap.onLine, jersey: JERSEYS[a.role] ?? 0, inMotion: false }));
        expect(lang.checkAlignment(players, rules).filter((f) => f.ruleKey !== null)).toEqual([]);
      });
    }
  }
  it('a play uses the players of its formation', () => {
    for (const p of STARTER.plays) {
      const f = FORMATION_BY_ID.get(p.formationId)!;
      expect(p.slots.map((s) => s.role).sort()).toEqual(f.players.map((x) => x.role).sort());
      for (const s of p.slots) {
        const fp = f.players.find((x) => x.role === s.role)!;
        expect([s.at[0], s.at[1]]).toEqual([fp.px, fp.py]);
      }
    }
  });
});

describe('lateral flip happens once (D-11)', () => {
  it('authored right-positive becomes left-positive', () => {
    const play = STARTER.plays.find((p) => p.id === 'run_inside_zone_right')!;
    const z = assignmentsOf(play).find((a) => a.role === 'Z')!;
    expect(z.preSnap.align.py).toBe(-16);
    const x = assignmentsOf(play).find((a) => a.role === 'X')!;
    expect(x.preSnap.align.py).toBe(17);
  });
  it('no negative zero survives', () => {
    for (const def of [...STARTER.plays, ...STARTER.defense]) expect(JSON.stringify(assignmentsOf(def))).not.toContain('-0,');
  });
});

describe('forbidden keys and outcome numbers', () => {
  it('the data holds none (Q1.2.1, G1.1.1 acceptance 2)', () => {
    const data = JSON.parse(JSON.stringify({ formations: STARTER.formations, plays: STARTER.plays, defense: STARTER.defense }));
    expect(scanForbiddenJson('starter', data)).toEqual([]);
    for (const key of ['yards', 'completionPct', 'successRate']) expect(JSON.stringify(data)).not.toContain(`"${key}"`);
  });
});

describe('sourcing', () => {
  const bases: [string, readonly Basis[]][] = [...STARTER.formations, ...STARTER.plays, ...STARTER.defense].map((d) => [d.id, d.basis]);
  it('every source id exists and every source has a page and a group', () => {
    for (const [id, basis] of bases) for (const b of basis) for (const s of b.sources) expect(SOURCE_BY_ID.has(s), `${id}: ${s}`).toBe(true);
    for (const s of SOURCES) { expect(s.url.length).toBeGreaterThan(4); expect(s.group.length).toBeGreaterThan(0); }
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length);
  });
  it('status words agree with the number of independence groups', () => {
    for (const [id, basis] of bases) for (const b of basis) {
      const groups = new Set(b.sources.map((s) => SOURCE_BY_ID.get(s)!.group)).size;
      if (b.status === 'Verified') expect(groups, `${id}: ${b.claim}`).toBeGreaterThanOrEqual(3);
      if (b.status === '2 of 3') expect(groups, `${id}: ${b.claim}`).toBeGreaterThanOrEqual(2);
      if (b.status === '1 of 3') expect(groups, `${id}: ${b.claim}`).toBe(1);
      if (b.status === 'Assumption') expect(b.sources.length === 0 || groups >= 1).toBe(true);
    }
  });
  it('every play and call rests on at least two groups of coaching sources', () => {
    for (const d of [...STARTER.plays, ...STARTER.defense]) {
      const groups = new Set(d.basis.flatMap((b) => b.sources).map((s) => SOURCE_BY_ID.get(s)!.group));
      // Kneel and spike are rules, not coaching conventions: they rest on the rule book alone and say so.
      if (d.id === 'kneel_victory' || d.id === 'spike_clock') expect(d.basis.some((b) => b.status === 'Rulebook only')).toBe(true);
      else expect(groups.size, d.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('formation reference images', () => {
  it('draw eleven players and are deterministic', () => {
    for (const f of STARTER.formations) {
      const svg = formationSvg(f);
      expect((svg.match(/<circle/g) ?? []).length + (svg.match(/<rect x/g) ?? []).length).toBe(11);
      expect(formationSvg(f)).toBe(svg);
    }
  });
});

describe('committed reference images match the generator', () => {
  it('each formation has its image file, byte for byte', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../../data/starter/formations');
    for (const f of STARTER.formations) expect(readFileSync(join(dir, `${f.id}.svg`), 'utf8')).toBe(`${formationSvg(f)}\n`);
  });
});
