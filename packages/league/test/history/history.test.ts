import { describe, expect, test } from 'vitest';
import { WorldEvent } from '@gm/schema';
import {
  EventLog, buildTypeRegistry, canonicalJson, compactLog, compactRows, counterMatches, foldableIds, sizeReport, tamperedSeasons,
  typeRegistry, fnv64, fnv64Hex, toHex, EMPTY_SEASON_HASH, HISTORY_SUMMARY_TYPE, PARAMS, RETAIN_PLAY_SEASONS, type CounterSpec,
} from '../../src/history/index.ts';
import { TYPES, generate, must, newLog, origins } from './fixtures.ts';

const D = (y: number, d = 1) => ({ seasonYear: y, dayIndex: d });
const SMALL = { seed: 1, firstYear: 2030, seasons: 6, teams: 20, games: 6, fourthPerGame: 3, timeoutsPerGame: 2 };

describe('event types as content (X2.1.2)', () => {
  test('a type with no consumer, and a harmful type open to imported people, fail the build', () => {
    const noConsumer = { ...TYPES[0]!, id: 'x', consumers: [] };
    const harmful = { ...TYPES[6]!, id: 'y', importedAllowed: true };
    const r = buildTypeRegistry([noConsumer, harmful]);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.problems.join()).toMatch(/x:.*consumers/); expect(r.problems.join()).toMatch(/y.*importedAllowed false/); }
  });
  test('a compactable career type and a reversal outside world or honors are refused; duplicates too', () => {
    const r = buildTypeRegistry([{ ...TYPES[3]!, compactable: true }, { ...TYPES[7]!, family: 'game' }, TYPES[0], TYPES[0]]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.length).toBe(3);
  });
  test('the summary type is always registered', () => {
    expect(typeRegistry(TYPES).has(HISTORY_SUMMARY_TYPE)).toBe(true);
  });
});

describe('the append-only log (X2.1.1, X2.1.3)', () => {
  const base = { date: D(2030), witnesses: { kind: 'public' as const }, tier: 1 as const, source: 'sim' as const };
  test('emit assigns increasing ids; refusals name the rule', () => {
    const log = newLog({ originOf: origins({ 5: 'imported' }), labelIds: new Set(['goes_for_it_on_fourth_down']) });
    const a = must(log.emit({ ...base, type: 'timeout_used', actors: [{ personId: 1, role: 'caller' }], payload: { period: 1 } }));
    expect(a.ok && a.event.id).toBe(1);
    expect(log.emit({ ...base, type: 'nope' })).toMatchObject({ ok: false, code: 'unknown_type' });
    expect(log.emit({ ...base, type: 'timeout_used', payload: { period: 1, traitBlock: 1 } })).toMatchObject({ ok: false, code: 'payload' });
    expect(log.emit({ ...base, type: 'hired', payload: { job: 'goes_for_it_on_fourth_down' } })).toMatchObject({ ok: false, code: 'payload' });
    expect(log.emit({ ...base, type: 'timeout_used', payload: {} })).toMatchObject({ ok: false, code: 'payload' });
    expect(log.emit({ ...base, type: 'arrested', actors: [{ personId: 5, role: 'subject' }] })).toMatchObject({ ok: false, code: 'protected' });
    expect(log.emit({ ...base, type: 'arrested', actors: [{ personId: 6, role: 'subject' }] }).ok).toBe(true);
    expect(log.emit({ ...base, type: 'promise_broken' })).toMatchObject({ ok: false, code: 'witness' });
    expect(log.emit({ ...base, type: 'timeout_used', tier: 2, payload: { period: 1 } })).toMatchObject({ ok: false, code: 'below_min_tier' });
    expect(log.emit({ ...base, type: 'hired', payload: { job: 'x' }, causeId: 999 })).toMatchObject({ ok: false, code: 'cause' });
    expect(log.emit({ ...base, date: D(2029), type: 'hired', payload: { job: 'x' } })).toMatchObject({ ok: false, code: 'order' });
    expect(log.size).toBe(2);
  });
  test('rows are frozen and the log has no update or delete path', () => {
    const log = newLog();
    const r = must(log.emit({ ...base, type: 'hired', payload: { job: 'x' } }));
    if (r.ok) expect(() => { (r.event.payload as Record<string, unknown>).job = 'y'; }).toThrow();
    const methods = Object.getOwnPropertyNames(EventLog.prototype);
    for (const m of methods) expect(m).not.toMatch(/update|delete|remove|set|edit|replace/i);
  });
  test('two runs of one seeded history give byte-identical logs and hashes (X2.1.1 acceptance)', () => {
    const a = generate(newLog(), SMALL); const b = generate(newLog(), SMALL);
    expect(canonicalJson(a.rows())).toBe(canonicalJson(b.rows()));
    expect(a.seasonHashes()).toEqual(b.seasonHashes());
    for (const e of a.rows()) expect(WorldEvent.safeParse(e).success).toBe(true);
  });
  test('a one-byte edit to a saved season is detected (X2.1.3 acceptance)', () => {
    const log = generate(newLog(), SMALL);
    const stored = log.seasonHashes();
    expect(tamperedSeasons(log.rows(), stored)).toEqual([]);
    const rows = JSON.parse(JSON.stringify(log.rows())) as WorldEvent[];
    const i = rows.findIndex((e) => e.when.date.seasonYear === 2032 && e.type === 'game_result');
    rows[i]!.payload.home_points = Number(rows[i]!.payload.home_points) + 1;
    expect(tamperedSeasons(rows, stored)).toEqual([2032]);
    expect(() => EventLog.fromRows(log.rows(), { registry: typeRegistry(TYPES) })).not.toThrow();
  });
  test('a vacated result is a second row; readers drop the original at read time', () => {
    const log = newLog();
    const g = must(log.emit({ ...base, type: 'game_result', tier: 2, teamId: 1, payload: { home_points: 21, away_points: 14, home_team: 1, away_team: 2 } }));
    const id = g.ok ? g.event.id : 0;
    expect(log.reverse(id, { ...base, type: 'hired', payload: { job: 'x' } })).toMatchObject({ ok: false });
    must(log.reverse(id, { ...base, date: D(2031), type: 'result_vacated' }));
    expect(log.rows().length).toBe(2);
    expect(log.get(id)!.type).toBe('game_result');
    expect([...log.reversedIds()]).toEqual([id]);
    const wins = log.ofType('game_result').filter((e) => !log.reversedIds().has(e.id)).length;
    expect(wins).toBe(0);
  });
  test('subscribers get each row once, in order (X2.1.1 fan-out), with notability scored first (W-17)', () => {
    const seen: number[] = [];
    const log = newLog({ notabilityOf: (e) => (e.type === 'fired' ? 60 : null) });
    log.subscribe((e) => seen.push(e.id));
    generate(log, { ...SMALL, seasons: 1 });
    expect(seen).toEqual(log.rows().map((e) => e.id));
    expect(log.ofType('fired')[0]!.notability).toBe(60);
    expect(log.forPerson(log.ofType('fired')[0]!.actors[0]!.personId).length).toBeGreaterThan(0);
  });
});

describe('hash', () => {
  test('the limb FNV-1a 64 equals the BigInt reference', () => {
    for (const str of ['', 'a', 'gridiron', '{"id":1,"type":"x"}', 'é漢\u{1F3C8}']) {
      expect(fnv64Hex(str, EMPTY_SEASON_HASH)).toBe(toHex(fnv64(str)));
    }
  });
});

describe('compaction (X2.1.3 rule 3, X2.4.1)', () => {
  const counters: CounterSpec[] = [
    { key: 'go', types: ['fourth_down_decision'], actorRole: 'caller', payloadEquals: { went: true } },
    { key: 'kick', types: ['fourth_down_decision'], actorRole: 'caller', payloadEquals: { went: false }, sumFields: ['yards_to_go'] },
  ];
  const opts = { registry: typeRegistry(TYPES), currentYear: 2035, counters };
  test('recent seasons, never-compacted families, kept ids and causes stay; counts per caller are preserved', () => {
    const log = generate(newLog(), SMALL);
    const rows = log.rows();
    const keep = rows.find((e) => e.type === 'timeout_used' && e.when.date.seasonYear === 2030)!.id;
    const { log: c, report } = compactLog(log, { ...opts, keepIds: new Set([keep]) });
    expect(report.after).toBeLessThan(report.before);
    const out = c.rows();
    expect(out.some((e) => e.id === keep)).toBe(true);
    for (const e of rows) if (e.when.date.seasonYear >= 2035 - RETAIN_PLAY_SEASONS || e.type === 'game_result' || e.type === 'fired' || e.type === 'hired') expect(c.get(e.id)).toEqual(e);
    // Counter totals per caller and season survive the fold.
    const tally = (rs: readonly WorldEvent[]) => {
      const m = new Map<string, number>();
      for (const e of rs) for (const ct of counters) {
        const n = e.type === HISTORY_SUMMARY_TYPE ? (e.payload.of_type === 'fourth_down_decision' ? Number(e.payload[ct.key]) : 0) : counterMatches(ct, e) ? 1 : 0;
        const k = `${e.actors[0]?.personId}|${e.when.date.seasonYear}|${ct.key}`;
        if (n) m.set(k, (m.get(k) ?? 0) + n);
      }
      return m;
    };
    expect(tally(out)).toEqual(tally(rows));
    expect(c.seasonHashes().length).toBe(log.seasonHashes().length);
  });
  test('a row named as a cause by a kept row is not folded', () => {
    const log = newLog();
    const base = { witnesses: { kind: 'public' as const }, tier: 1 as const, source: 'sim' as const, actors: [{ personId: 1, role: 'caller' }] };
    const t = must(log.emit({ ...base, date: D(2030), type: 'timeout_used', payload: { period: 1 } }));
    must(log.emit({ ...base, date: D(2030, 2), type: 'hired', payload: { job: 'x' }, causeId: t.ok ? t.event.id : null }));
    expect(foldableIds(log.rows(), opts).size).toBe(0);
  });
  test('notable rows above the keep line stay', () => {
    const log = generate(newLog({ notabilityOf: (e) => (e.type === 'fourth_down_decision' && e.payload.yards_to_go === 10 ? 90 : 10) }), SMALL);
    const kept = compactRows(log.rows(), { ...opts, notabilityKeepLine: 50 }).rows;
    const notable = log.rows().filter((e) => e.notability === 90);
    for (const e of notable) expect(kept).toContainEqual(e);
  });
});

describe('size (X2.4.1 acceptance, P6)', () => {
  test('a 40-season world log is reported and compared with the budget', () => {
    // 160 teams, 12 games: 960 games a season (P5.4.1 plans about 1,110). Per team-game 4 fourth-down
    // decisions and 5 timeouts at tier 1 detail: a heavy case, since the default world logs them only near
    // the user. Compacted once at the end, which gives the same rows as compacting at each roll-over.
    const spec = { seed: 40, firstYear: 2030, seasons: 40, teams: 160, games: 12, fourthPerGame: 4, timeoutsPerGame: 5 };
    const registry = typeRegistry(TYPES);
    const counters: CounterSpec[] = [{ key: 'go', types: ['fourth_down_decision'], actorRole: 'caller', payloadEquals: { went: true } }, { key: 'n', types: ['fourth_down_decision'], actorRole: 'caller' }];
    const full = generate(new EventLog({ registry, validateRows: false }), spec);
    const log = compactLog(full, { registry, validateRows: false, currentYear: spec.firstYear + spec.seasons - 1, counters }).log;
    const rep = sizeReport(log.rows());
    process.stderr.write(`[history size] 40 seasons: ${rep.rows} rows, ${(rep.bytes / 1e6).toFixed(1)} MB raw JSON; budget ${(rep.budgetBytes / 1e6).toFixed(1)} MB (${PARAMS.params[1]!.basis}, ${PARAMS.params[1]!.leaf})\n`);
    expect(rep.seasons).toBe(40);
    expect(rep.withinBudget).toBe(true);
  }, 600_000);
});
