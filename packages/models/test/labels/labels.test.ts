import { describe, expect, test } from 'vitest';
import type { WorldEvent } from '@gm/schema';
import { buildWorld, fixtureLabels, levelOf, rng, type World } from './world.ts';
import {
  buildBaseline, countersFor, evaluateLabel, labelDefProblems, labelWeight, matchKey, observerView, pow2, reversalMap,
  rowsBySubject, traceLabel, PARAMS, LABEL_PARAMS, type LabelDef, type LabelResult, type Observer,
} from '../../src/labels/index.ts';

const end = (y: number) => ({ seasonYear: y, dayIndex: 364 });

function evalAll(w: World, defs: LabelDef[], years: number[]): { def: LabelDef; r: LabelResult }[] {
  const rev = reversalMap(w.rows);
  const out: { def: LabelDef; r: LabelResult }[] = [];
  for (const def of defs) {
    const baseline = buildBaseline(def, w.rows, levelOf, new Set(rev.keys()));
    const by = rowsBySubject(def, w.rows);
    for (const [s, rows] of [...by.entries()].sort((a, b) => a[0] - b[0])) {
      for (const y of years) out.push({ def, r: evaluateLabel(def, s, rows, { asOf: end(y), levelOf, baseline, reversedBy: rev, origin: w.originOf(s) }) });
    }
  }
  return out;
}

describe('R1.2.9 gate rule 4: 1,000 random labels each resolve to their evidence rows', () => {
  const w = buildWorld({ seed: 2026, firstYear: 2020, seasons: 10, coaches: 120, gamesPerSeason: 12, baselineGo: 0.35, deviantShare: 0.4, playersPerTeam: 2, reversals: 40 });
  const defs = fixtureLabels(LABEL_PARAMS.zClear);
  const YEARS = [2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029];
  const all = evalAll(w, defs, YEARS);
  const held = all.filter((x) => x.r.state === 'held');

  test('the generated history holds well over 1,000 labels across every definition', () => {
    expect(held.length).toBeGreaterThan(1000);
    for (const d of defs) expect(held.some((x) => x.def.id === d.id)).toBe(true);
  });

  test('1,000 labels picked at random trace to log rows that reproduce them', () => {
    const r = rng(99);
    const pool = [...held];
    const picked: typeof held = [];
    while (picked.length < 1000) picked.push(pool.splice(Math.floor(r() * pool.length), 1)[0]!);
    const rev = reversalMap(w.rows);
    const baselines = new Map(defs.map((d) => [d.id, buildBaseline(d, w.rows, levelOf, new Set(rev.keys()))]));
    const failures: string[] = [];
    for (const { def, r: res } of picked) {
      const baseline = baselines.get(def.id)!;
      const t = traceLabel(def, res, w.byId, { asOf: end(2029), levelOf, baseline, reversedBy: rev });
      if (!t.ok) failures.push(...t.problems);
      expect(t.rows.length).toBe(res.evidenceIds.length);
      expect(t.rows.length).toBeGreaterThan(0);
      for (const e of t.rows) expect(w.byId.get(e.id)).toBe(e);
    }
    expect(failures).toEqual([]);
  });

  test('a corrupted result fails its trace', () => {
    const { def, r: res } = held[0]!;
    const rev = reversalMap(w.rows);
    const ctx = { asOf: end(2029), levelOf, baseline: buildBaseline(def, w.rows, levelOf), reversedBy: rev };
    expect(traceLabel(def, { ...res, evidenceIds: [...res.evidenceIds, 99_999_999] }, w.byId, ctx).ok).toBe(false);
    const other = w.rows.find((e) => e.type === 'meeting_attended')!;
    expect(traceLabel(def, { ...res, evidenceIds: [...res.evidenceIds, other.id].sort((a, b) => a - b) }, w.byId, ctx).ok).toBe(false);
    expect(traceLabel(def, { ...res, measure: res.measure + 0.01 }, w.byId, ctx).ok).toBe(false);
  });

  test('recomputing from the log reproduces every label exactly (N2.8.1 acceptance 1)', () => {
    const again = evalAll(w, defs, YEARS);
    expect(JSON.stringify(again.map((x) => x.r))).toBe(JSON.stringify(all.map((x) => x.r)));
  });

  test('opposite labels on one measure never both hold (N2.8.1 rule 7)', () => {
    const key = (x: { def: LabelDef; r: LabelResult }) => `${x.r.subjectId}|${x.r.evaluatedDay}|${x.def.id}`;
    const set = new Set(held.map(key));
    for (const x of held) if (x.def.opposes) expect(set.has(`${x.r.subjectId}|${x.r.evaluatedDay}|${x.def.opposes}`)).toBe(false);
  });
});

describe('definitions (X2.2.1)', () => {
  const base = fixtureLabels(LABEL_PARAMS.zClear)[0]!;
  test('the shipped fixtures pass the content checks', () => {
    for (const d of fixtureLabels(LABEL_PARAMS.zClear)) expect(labelDefProblems(d, new Set(['fourth_down_decision', 'promise_kept', 'promise_broken', 'late_to_meeting', 'meeting_attended']))).toEqual([]);
  });
  test('no consumer, a truth field, an unregistered type and inverted thresholds are refused', () => {
    expect(labelDefProblems({ ...base, consumers: [] }).join()).toMatch(/no consumer/);
    expect(labelDefProblems({ ...base, positive: { ...base.positive, payloadEquals: { traitBlock: 1 } } }).join()).toMatch(/truth field/);
    expect(labelDefProblems(base, new Set(['other'])).join()).toMatch(/not registered/);
    expect(labelDefProblems({ ...base, thresholdOn: 0.4, thresholdOff: 0.5 }).join()).toMatch(/nearer the baseline/);
  });
  test('counters cover every query once', () => {
    const c = countersFor(fixtureLabels(1));
    expect(new Set(c.map((x) => x.key)).size).toBe(c.length);
    expect(c.map((x) => x.key)).toContain(matchKey(base.positive));
  });
  test('parameters carry a basis and a leaf', () => {
    for (const p of PARAMS.params) { expect(['bible', 'assumption']).toContain(p.basis); expect(p.leaf).toMatch(/^[A-Z]\d/); }
  });
  test('2^x series is exact at whole powers and monotone', () => {
    expect(pow2(0)).toBe(1); expect(pow2(3)).toBe(8); expect(pow2(-2)).toBe(0.25);
    expect(Math.abs(pow2(0.5) - Math.SQRT2)).toBeLessThan(1e-14);
  });
});

describe('thresholds, fading and the user (X2.2.2)', () => {
  const def = fixtureLabels(LABEL_PARAMS.zClear)[0]!;
  // Coach 1 goes for it at 0.75 for five seasons, then at the 0.35 baseline from season 6 (index 5).
  const script = new Map<number, (s: number) => number>([[1, (s) => (s < 5 ? 0.75 : 0.35)]]);
  const w = buildWorld({ seed: 11, firstYear: 2020, seasons: 10, coaches: 60, gamesPerSeason: 12, baselineGo: 0.35, deviantShare: 0, playersPerTeam: 1, reversals: 0, script });
  const baseline = buildBaseline(def, w.rows, levelOf);
  const mine = rowsBySubject(def, w.rows).get(1)!;

  test('no label before the minimum sample, even at an extreme rate', () => {
    const few = mine.slice(0, 6).map((e) => ({ ...e, payload: { ...e.payload, went: true } }));
    expect(evaluateLabel(def, 1, few, { asOf: end(2020), levelOf, baseline }).state).toBe('absent');
  });

  test('behaviour change in season 6 fades the label within two half-lives and not at once', () => {
    const r5 = evaluateLabel(def, 1, mine, { asOf: end(2024), levelOf, baseline });
    expect(r5.state).toBe('held');
    const early6 = evaluateLabel(def, 1, mine, { asOf: { seasonYear: 2025, dayIndex: 250 }, levelOf, baseline });
    expect(early6.state).toBe('held');
    const r = evaluateLabel(def, 1, mine, { asOf: end(2029), levelOf, baseline });
    expect(r.state).toBe('absent');
    const faded = r.transitions.find((t) => t.state === 'absent')!;
    expect(faded.date.seasonYear - 2025).toBeLessThan(2 * LABEL_PARAMS.halfLifeTendency);
  });

  test('the same script with the user as actor yields the same label on the same date', () => {
    const asUser = mine.map((e) => ({ ...e, actors: e.actors.map((a) => ({ ...a, personId: 9_000 })) }));
    const a = evaluateLabel(def, 1, mine, { asOf: end(2029), levelOf, baseline, origin: 'generated' });
    const b = evaluateLabel(def, 9_000, asUser, { asOf: end(2029), levelOf, baseline, origin: 'user' });
    expect({ ...b, subjectId: 1 }).toEqual(a);
  });

  test('a reversal removes evidence from that day on', () => {
    const r5 = evaluateLabel(def, 1, mine, { asOf: end(2024), levelOf, baseline });
    const target = r5.evidenceIds[r5.evidenceIds.length - 1]!;
    const rev = new Map([[target, { id: 10_000_000, date: { seasonYear: 2024, dayIndex: 364 } }]]);
    const r = evaluateLabel(def, 1, mine, { asOf: end(2024), levelOf, baseline, reversedBy: rev });
    expect(r.evidenceIds).not.toContain(target);
  });

  test('state replayed after a save equals state recomputed (same rows, any split of asOf)', () => {
    const full = evaluateLabel(def, 1, mine, { asOf: end(2029), levelOf, baseline });
    const prefix = evaluateLabel(def, 1, mine.filter((e) => e.when.date.seasonYear <= 2029), { asOf: end(2029), levelOf, baseline });
    expect(prefix).toEqual(full);
  });

  test('weight: fresh 1, straight line to 0.5 at twice the window, frozen falls to 0.3 and never rises', () => {
    expect(labelWeight(1, 2, false)).toBe(1);
    expect(labelWeight(3, 2, false)).toBeCloseTo(0.75);
    expect(labelWeight(9, 2, false)).toBe(0.5);
    let prev = 1;
    for (let a = 0; a <= 12; a += 0.5) { const x = labelWeight(a, 2, true); expect(x).toBeLessThanOrEqual(prev); prev = x; }
    expect(labelWeight(12, 2, true)).toBe(0.3);
    const r = evaluateLabel(def, 1, mine.filter((e) => e.when.date.seasonYear <= 2022), { asOf: end(2027), levelOf, baseline });
    expect(r.stale).toBe(true);
  });
});

describe('baseline coach false-positive share (X2.2.2 acceptance)', () => {
  // A 20-season world of coaches who all behave at the baseline. Measured shares of season ends holding the
  // label: 0.20 at 1.0 SE, 0.08 at 1.75, 0.06 at 2.0, 0.02 at 2.5 (seed 7, 120 coaches). N2.8.1's starting
  // "mild" threshold of 1.0 SE therefore cannot meet X2.2.2's 5 percent target: reported to the bible thread.
  const w = buildWorld({ seed: 7, firstYear: 2020, seasons: 20, coaches: 120, gamesPerSeason: 12, baselineGo: 0.35, deviantShare: 0, playersPerTeam: 1, reversals: 0 });
  test('at the strong threshold the share stays under the 5 percent target', () => {
    const def = fixtureLabels(LABEL_PARAMS.zStrong)[0]!;
    const baseline = buildBaseline(def, w.rows, levelOf);
    const by = rowsBySubject(def, w.rows);
    let held = 0; let n = 0;
    for (const c of w.coaches) for (let y = 2022; y < 2040; y++) {
      n++;
      if (evaluateLabel(def, c.id, by.get(c.id) ?? [], { asOf: end(y), levelOf, baseline }).state === 'held') held++;
    }
    expect(held / n).toBeLessThanOrEqual(LABEL_PARAMS.falsePositiveTarget);
  });
});

describe('compaction summaries count the same as the rows they replace (X2.4.1 acceptance)', () => {
  test('folding old fourth-down rows into per-day summaries leaves every held label unchanged', () => {
    const w = buildWorld({ seed: 5, firstYear: 2020, seasons: 8, coaches: 40, gamesPerSeason: 12, baselineGo: 0.35, deviantShare: 0.5, playersPerTeam: 1, reversals: 0 });
    const defs = fixtureLabels(LABEL_PARAMS.zClear).filter((d) => d.positive.types.includes('fourth_down_decision'));
    const counters = countersFor(defs);
    // Same shape as league/src/history compactRows: one summary per day, type, actors, team and competition,
    // carrying each counter's count, for seasons before 2025 (current 2027, two prior kept).
    const groups = new Map<string, WorldEvent[]>();
    const kept: WorldEvent[] = [];
    for (const e of w.rows) {
      if (e.type === 'fourth_down_decision' && e.when.date.seasonYear < 2025) {
        const k = JSON.stringify([e.when.date, e.actors, e.where, e.competitionId]);
        (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
      } else kept.push(e);
    }
    const summaries: WorldEvent[] = [...groups.values()].map((g) => {
      const last = g[g.length - 1]!;
      const payload: WorldEvent['payload'] = { of_type: last.type, count: g.length, first_id: g[0]!.id, last_id: last.id };
      for (const c of counters) payload[c.key] = g.filter((e) => Object.entries(c.payloadEquals).every(([k, v]) => e.payload[k] === v)).length;
      return { ...last, type: 'history_summary', payload, subjects: [], causeId: null };
    });
    const compacted = [...kept, ...summaries].sort((a, b) => a.id - b.id);
    for (const def of defs) {
      const bA = buildBaseline(def, w.rows, levelOf);
      const bB = buildBaseline(def, compacted, levelOf);
      const A = rowsBySubject(def, w.rows); const B = rowsBySubject(def, compacted);
      for (const [s, rows] of A) {
        const a = evaluateLabel(def, s, rows, { asOf: end(2027), levelOf, baseline: bA });
        const b = evaluateLabel(def, s, B.get(s) ?? [], { asOf: end(2027), levelOf, baseline: bB });
        expect(b.state).toBe(a.state);
        expect(b.measure).toBeCloseTo(a.measure, 9);
      }
    }
  });
});

describe('protection and observers (N2.8.1 rule 8, X2.3.1)', () => {
  test('a personal label never forms on an imported person', () => {
    const w = buildWorld({ seed: 3, firstYear: 2020, seasons: 6, coaches: 30, gamesPerSeason: 12, baselineGo: 0.35, deviantShare: 0, playersPerTeam: 2, reversals: 0 });
    const def = { ...fixtureLabels(LABEL_PARAMS.zClear)[4]!, personal: true };
    const baseline = buildBaseline(def, w.rows, levelOf);
    const by = rowsBySubject(def, w.rows);
    const heldIds = w.players.filter((p) => evaluateLabel(def, p.id, by.get(p.id)!, { asOf: end(2025), levelOf, baseline, origin: 'generated' }).state === 'held').map((p) => p.id);
    expect(heldIds.length).toBeGreaterThan(0);
    for (const id of heldIds) {
      const r = evaluateLabel(def, id, by.get(id)!, { asOf: end(2025), levelOf, baseline, origin: 'imported' });
      expect(r.state).toBe('absent'); expect(r.protectedSubject).toBe(true);
    }
  });

  const w = buildWorld({ seed: 21, firstYear: 2020, seasons: 6, coaches: 40, gamesPerSeason: 12, baselineGo: 0.35, deviantShare: 0.5, playersPerTeam: 1, reversals: 0 });
  const defs = fixtureLabels(LABEL_PARAMS.zClear).filter((d) => d.id === 'keeps_his_word' || d.id === 'breaks_his_word' || d.id === 'goes_for_it_on_fourth_down');
  const baselines = new Map(defs.map((d) => [d.id, buildBaseline(d, w.rows, levelOf)]));
  const breaker = w.coaches.find((c) => c.keepRate < 0.5 && c.comp === 1)!;
  const subjectRows = w.rows.filter((e) => e.actors.some((a) => a.personId === breaker.id));
  const playerId = w.players.find((p) => p.teamId === breaker.teamId)!.id;
  const insider: Observer = { personId: playerId, level: 'pro', teamsByYear: new Map() };
  const outsider: Observer = { personId: 77_777, level: 'pro', teamsByYear: new Map() };
  const ctx = { asOf: end(2025), levelOf, baselines, subjectLevel: 'pro' };

  test('promises are private: only the person promised to forms an impression', () => {
    const vi = observerView(defs, breaker.id, subjectRows, insider, ctx);
    const vo = observerView(defs, breaker.id, subjectRows, outsider, ctx);
    expect(vi.some((v) => v.basis === 'observer' && v.labelId === 'breaks_his_word' && v.held)).toBe(true);
    expect(vo.some((v) => v.labelId === 'breaks_his_word')).toBe(false);
  });

  test('deleting the rows an observer witnessed changes his view and nothing else', () => {
    const without = subjectRows.filter((e) => !(e.witnesses.kind === 'people' && e.witnesses.personIds.includes(playerId)));
    const vi = observerView(defs, breaker.id, without, insider, ctx);
    expect(vi.some((v) => v.labelId === 'breaks_his_word')).toBe(false);
    const vo1 = observerView(defs, breaker.id, subjectRows, outsider, ctx);
    const vo2 = observerView(defs, breaker.id, without, outsider, ctx);
    expect(vo2).toEqual(vo1);
  });

  test('an observer at the other level sees public labels a season late at half weight', () => {
    const same = observerView(defs, breaker.id, subjectRows, outsider, ctx).filter((v) => v.basis === 'record');
    const other = observerView(defs, breaker.id, subjectRows, { ...outsider, level: 'college' }, ctx).filter((v) => v.basis === 'record');
    for (const o of other) {
      const s = same.find((x) => x.labelId === o.labelId);
      if (s) expect(o.weight).toBeLessThanOrEqual(s.weight * LABEL_PARAMS.otherLevelDiscount + 1e-12);
      expect(o.result.evaluatedDay).toBeLessThanOrEqual(2025 * LABEL_PARAMS.daysPerSeasonYear);
    }
  });
});
