import { describe, expect, it } from 'vitest';
import { relationships } from '@gm/people';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';
import * as people from '../../src/people/index.ts';

const content = trimmed();
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);
const binding: turnover.TurnoverBinding = { content, rule, policy: turnover.gmPolicy() };
const goals = () => ({ cut: 'postseason', top: 'top_fifth' });

function build(seedHex = '00000000000000a7') {
  const w = loop.createWorld({
    setup: setup({ seedHex }), content, names: NAMES, eventTypes: [...turnover.TURNOVER_EVENT_TYPES, ...people.peopleEventTypes()],
  });
  const steps = people.peopleSteps({ turnover: binding, goals });
  const sys = loop.systemsFrom({
    games: loop.gamesStep(testSchedule, testGamePort()), leaving: loop.leavingStep(),
    development: turnover.developmentStep(binding), moves: turnover.rosterMovesStep(binding), ...steps,
  }, 'test: not bound');
  return { w, sys };
}

function run(seasons: number, seedHex?: string) {
  const { w, sys } = build(seedHex);
  for (let i = 0; i < seasons; i++) loop.runSeason(w, sys, testSchedule);
  // The first pass of the next season runs the season-end sweeps (promotion, inactive records).
  loop.runWeek(w, sys);
  return w;
}

describe('people dynamics in the live world (X5, X6, X7, X9)', () => {
  const w = run(3);
  const edges = people.edgesOf(w);
  const ties = [...edges.ties.values()].map(people.unpackTie);
  const mem = people.memoryOf(w);
  const needs = people.needsOf(w);

  it('forms ties only with a season_together basis that names both parties (X7.1.1 acceptance)', () => {
    expect(edges.ties.size).toBeGreaterThan(0);
    for (const t of ties) {
      expect(t.basis.length).toBeGreaterThan(0);
      for (const b of t.basis) {
        const e = w.log.get(b.eventId)!;
        expect(e.type).toBe(people.SEASON_TOGETHER);
        const named = new Set(e.actors.map((a) => a.personId));
        expect(named.has(t.a)).toBe(true);
        expect(named.has(t.b!)).toBe(true);
      }
    }
  });

  it('keeps teammate ties inside a position group or among one side\'s starters (X7.1.1 rule 1)', () => {
    for (const t of ties) {
      if (t.kind !== 'teammate') continue;
      const ga = people.groupOfPosition(w.people.get(t.a)?.playing?.position);
      const gb = people.groupOfPosition(w.people.get(t.b!)?.playing?.position);
      if (ga !== gb) expect(people.sideOfGroup(ga)).toBe(people.sideOfGroup(gb));
    }
  });

  it('grows a tie that lasts a second season rather than making a second one', () => {
    const grown = ties.filter((t) => t.basis.length >= 2);
    expect(grown.length).toBeGreaterThan(0);
    for (const [k, r] of edges.ties) expect(relationships.tieKey(people.unpackTie(r))).toBe(k);
  });

  it('packs ties exactly: unpacking and packing again gives the same row', () => {
    for (const r of [...edges.ties.values()].slice(0, 500)) expect(people.packTie(people.unpackTie(r))).toEqual(r);
  });

  it('retires a tie only when neither party is active, and keeps a tie with one active party (README PD-05)', () => {
    const v = run(2);
    const st = people.edgesOf(v);
    const [k1, r1] = [...st.ties][0]!;
    const [k2, r2] = [...st.ties].find(([k, r]) => k !== k1 && r[people.AT.a] !== r1[people.AT.a] && r[people.AT.b] !== r1[people.AT.a]
      && r[people.AT.a] !== r1[people.AT.b] && r[people.AT.b] !== r1[people.AT.b])!;
    v.status.set(r1[people.AT.a]!, 'inactive'); v.status.set(r1[people.AT.b]!, 'deceased');
    v.status.set(r2[people.AT.a]!, 'inactive');
    // A season with no staff or roster seasons behind it: the pass only retires.
    st.formedFor = null; v.week = 0; v.date = { seasonYear: v.date.seasonYear + 5, dayIndex: 0 };
    const before = st.retired;
    loop.runWeek(v, loop.systemsFrom({ edges: people.edgesStep() }, 'test: not bound'), { order: ['edges'] });
    expect(st.ties.has(k1)).toBe(false);
    expect(st.ties.has(k2)).toBe(true);
    expect(st.retired).toBeGreaterThan(before);
  });

  it('gives witnesses memory rows within the X6 caps, and none to people who are not active', () => {
    expect(mem.rows.size).toBeGreaterThan(0);
    for (const [holder, rows] of mem.rows) {
      const perm = rows.filter((r) => r.layer === 'permanent').length;
      expect(perm).toBeLessThanOrEqual(12);
      expect(rows.length - perm).toBeLessThanOrEqual(6 * 8);
      if (w.status.get(holder) !== 'active') expect(rows.every((r) => r.layer === 'permanent')).toBe(true);
      for (const r of rows) expect(r.holderId).toBe(holder);
    }
  });

  it('updates needs and stress for every seated active person, and drops records of people who left (X12.1.3)', () => {
    const seated = people.seats(w);
    let seen = 0;
    for (const id of seated.keys()) if (w.status.get(id) === 'active') { expect(needs.people.has(id)).toBe(true); seen++; }
    expect(seen).toBeGreaterThan(100);
    for (const [id, r] of needs.people) {
      expect(w.status.get(id)).toBe('active');
      expect(r.state.stress).toBeGreaterThanOrEqual(0);
      expect(r.state.stress).toBeLessThanOrEqual(1000);
    }
  });

  it('moves culture records at each season point and sets next season\'s expectation (X9.2.1, X9.3.1)', () => {
    const st = people.cultureStateOf(w);
    expect(st.working.size).toBeGreaterThan(0);
    for (const [teamId, c] of st.working) {
      const row = w.cultures.get(teamId)!;
      expect(row.expectation.year).toBe(w.date.seasonYear);
      expect(c.expectation.rateLow).toBeLessThan(c.expectation.rateHigh);
      expect(st.seasons.get(teamId)!.length).toBe(3);
    }
    // Stable leadership builds tradition (X9.3.1).
    expect([...st.working.values()].some((c) => c.traditionStrength > 0)).toBe(true);
  });

  it('writes no inner X5 rows for tier 3 people (MA-66: tiers differ only in what is recorded)', () => {
    expect(w.log.ofType('stress_band_changed').length).toBe(0);
    expect(w.log.ofType('coping_started').length).toBe(0);
  });

  it('is deterministic: the same seed gives the same world hash', () => {
    const again = run(3);
    expect(loop.worldHash(again)).toBe(loop.worldHash(w));
    expect(again.passHash).toBe(w.passHash);
  });

  it('keeps every step state plain data that survives a JSON round trip', () => {
    for (const k of Object.values(people.KEY)) {
      const v = w.systemState.get(k);
      expect(v).toBeDefined();
      const json = JSON.stringify(v, (_key, x) => (x instanceof Map ? [...x] : x));
      expect(json.length).toBeGreaterThan(2);
    }
  });
});

describe('pair chemistry (X7.2.1)', () => {
  it('draws the pair term once per pair: the same fit in any season and step', () => {
    const { w } = build();
    const a = [...w.rosters.values()][0]![0]!, b = [...w.rosters.values()][0]![1]!;
    const f1 = people.pairContext(w).fitOf(a, b);
    w.date = { seasonYear: w.date.seasonYear + 7, dayIndex: 30 };
    expect(people.pairContext(w).fitOf(a, b)).toBe(f1);
    expect(people.pairContext(w).fitOf(b, a)).toBe(f1);
  });
});
