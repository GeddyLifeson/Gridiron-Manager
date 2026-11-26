import { describe, expect, it } from 'vitest';
import { PersonRecord, type EventTypeDef } from '@gm/schema';
import {
  importPack, placeImported, EmitGuard, withoutProtected, historyRunViolations, assertHistoryClean, auditProblems, auditedAllowed,
  scanProtectedText, neutralityProblems, createDial, blendSeason, targetPathFrom, recordLists, nameCollisions, deltaEntrants, fillNeed,
  DEFAULT_MIX, placePlayers, placeCoaches, teamStrength, param, clubLetters, cfbdCoachRows, cfbdStatus, buildProjectPack, coachTendencies,
  mainGroupOf, importProfileOf, type TeamSlot, type CoachJob, type ImportResult,
} from '../../src/import/index.ts';
import { rng } from '../generator/helpers.ts';
import { synthPack, file } from './fixtures.ts';

const START = 2026;
const run = (seed = 7, files = synthPack()) => importPack(files, { worldStartYear: START, rnd: rng(seed), firstPersonId: 1 });
const byKey = (r: ImportResult, k: string) => r.people.find((p) => p.sourceKey === k)!;

describe('import pipeline (D13.6.1)', () => {
  const r = run();
  it('imports the synthetic pack with no schema failure', () => {
    expect(r.status).not.toBe('fail');
    expect(r.people.length).toBe(47);
    for (const p of r.people) expect(() => PersonRecord.parse(p.record)).not.toThrow();
  });
  it('marks every imported person protected with a neutral block (X14.1.1)', () => {
    for (const p of r.people) {
      expect(p.record.origin).toBe('imported');
      expect(p.record.externalRef?.key).toBe(p.sourceKey);
      expect(p.record.provenance).toBeNull();
      expect(neutralityProblems(p.record)).toEqual([]);
      expect(p.record.traitBlock.goals.every((g) => ['start_at_position', 'win_championship'].includes(g.goalId))).toBe(true);
    }
  });
  it('assigns roles from the latest real job', () => {
    expect(byKey(r, 'c1').record.roles).toEqual(['coach']);
    expect(byKey(r, 'o1').record.roles).toEqual(['official']);
    expect(byKey(r, 'q1').record.roles).toEqual(['player']);
    expect(byKey(r, 'u1').level).toBe('college');
  });
  it('is byte-for-byte deterministic for the same pack and seed (U3.1.1 acceptance)', () => {
    expect(JSON.stringify(run().people.map((p) => p.record))).toBe(JSON.stringify(r.people.map((p) => p.record)));
  });
  it('a new world seed changes draws but never a measured value', () => {
    const a = byKey(r, 'q1'), b = byKey(run(99), 'q1');
    expect(b.record.playing!.tests.fortyS).toBe(a.record.playing!.tests.fortyS);
    expect(b.record.playing!.tests.verticalIn).toBe(a.record.playing!.tests.verticalIn);
    expect(b.record.playing!.heightIn).toBe(a.record.playing!.heightIn);
    for (const [k, c] of Object.entries(a.confidence)) if (c === 'measured' || c === 'inferred') expect(b.record.playing!.attributes[k]).toBe(a.record.playing!.attributes[k]);
  });
  it('keeps durability at the position median and no off-field value (U3.1.2 rule 5)', () => {
    for (const p of r.people) if (p.record.playing) {
      expect(p.record.playing.attributes['durability']).toBe(50);
      expect(p.record.playing.hidden['durability_mult']).toBe(1);
    }
  });
  it('fills missing fields and flags them (D13.6.3 rule 1)', () => {
    const o = byKey(r, 'o1');
    expect(o.flags).toContain('birth_date_from_experience');
    const q = byKey(r, 'q1');
    expect(q.filled).toEqual([]);
    expect(byKey(r, 'f1').filled).toEqual(expect.arrayContaining(['cone', 'shuttle']));
    expect(q.confidence['explosiveness']).toBe('measured');
  });
  it('a pack with only name, position and age per row imports valid players (D13.6.3 acceptance)', () => {
    const files = [
      file('pack.json', JSON.stringify({ schema_id: 'people_pack', schema_version: 1, pack_id: 'thin', name: 'Thin', version: '1', author: 't', contains: 'real', source_statement: 'synthetic' })),
      file('people.csv', 'source_key,name_first,name_last,birth_date\nt1,Thin,One,1999-02-02\nt2,Thin,Two,2004-07-07\n'),
      file('playing.csv', 'source_key,position,level\nt1,RB,pro\nt2,DE,college\n'),
    ];
    const t = importPack(files, { worldStartYear: START, rnd: rng(), firstPersonId: 1 });
    expect(t.people.length).toBe(2);
    for (const p of t.people) { expect(p.record.playing).toBeDefined(); expect(() => PersonRecord.parse(p.record)).not.toThrow(); }
  });
  it('applies pack overrides and marks the person edited', () => {
    const e = run(7, synthPack({ overrides: true }));
    const q = byKey(e, 'q1');
    expect(q.edited).toBe(true);
    expect(q.record.playing!.attributes['arm_strength']).toBe(77);
    expect(q.flags).toContain('imported_edited');
  });
  it('reports the coverage gaps and the missing CollegeFootballData key', () => {
    expect(r.preview!.gaps.some((g) => g.startsWith('college coaches'))).toBe(true);
    expect(r.preview!.gaps.some((g) => g.startsWith('assistant coaches'))).toBe(true);
    expect(r.preview!.cfbd.available).toBe(false);
  });
  it('honours the mix: a group set to generated only is skipped (U5.1.1 rule 2) and ids do not move', () => {
    const m = importPack(synthPack(), { worldStartYear: START, rnd: rng(7), firstPersonId: 1, mix: { ...DEFAULT_MIX, officials: 'generated_only' } });
    expect(m.people.find((p) => p.sourceKey === 'o1')).toBeUndefined();
    expect(m.preview!.skippedByMix.officials).toBe(1);
    expect(byKey(m, 'q1').record.id).toBe(byKey(r, 'q1').record.id);
  });
});

describe('U3.1.3 estimates', () => {
  it('starters average within 3 ISS of 50 on their main role', () => {
    const r = run(3, synthPack({ starters: 80 }));
    const starters = r.people.filter((p) => p.sourceKey.startsWith('lb'));
    const mean = starters.reduce((a, p) => a + p.mainValue!, 0) / starters.length;
    expect(Math.abs(mean - 50)).toBeLessThanOrEqual(3);
  });
  it('a one-game player stays within one prior width of the position prior', () => {
    const r = run();
    const p = byKey(r, 'r1');
    const prior = param('role.priorPro');
    for (const a of ['run_fit_technique', 'taking_on_blocks', 'blitz_technique']) expect(Math.abs(p.record.playing!.attributes[a]! - prior)).toBeLessThanOrEqual(param('confidence.sdPrior'));
  });
  it('identical football records give identical mental values; names and fame do not enter', () => {
    const r = run(3, synthPack({ starters: 6 }));
    const a = byKey(r, 'lb000'), b = byKey(r, 'lb002');
    for (const k of ['play_recognition', 'processing_speed', 'composure', 'football_intelligence']) expect(a.record.playing!.attributes[k]).toBe(b.record.playing!.attributes[k]);
  });
  it('maps every pack position to a profile', () => {
    for (const p of ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'NT', 'LB', 'CB', 'S', 'K', 'P', 'LS', 'KR', 'PR']) expect(mainGroupOf(importProfileOf(p))).toBeTruthy();
  });
  it('coach tendencies sit at the median without play-by-play and shrink with plays (U3.2.1)', () => {
    expect(Object.values(coachTendencies()).every((t) => t.delta === 0 && t.confidence === 'prior')).toBe(true);
    expect(coachTendencies({ plays: 400, rawDelta: { pass_rate_over_expected: 5 } }).pass_rate_over_expected.delta).toBe(0);
    const t = coachTendencies({ plays: 2000, rawDelta: { pass_rate_over_expected: 4 } });
    expect(t.pass_rate_over_expected.delta).toBeCloseTo(2, 6);
  });
});

describe('prior career and links (X14.2.1, U2.2)', () => {
  const r = run();
  it('shows only seasons before the world start and keeps later ones for the dial', () => {
    const q = byKey(r, 'q1');
    expect(q.priorCareer.seasons.map((s) => s.season)).toEqual([2022, 2023, 2024, 2025]);
    const late = run(7, synthPack()).people;
    void late;
    const early = importPack(synthPack(), { worldStartYear: 2024, rnd: rng(7), firstPersonId: 1 });
    expect(byKey(early, 'q1').priorCareer.seasons.map((s) => s.season)).toEqual([2022, 2023]);
    expect(byKey(early, 'q1').futureSeasons.map((s) => Number(s['season']))).toEqual([2024, 2025]);
  });
  it('hides real team names and teammates share the same prior club letter', () => {
    const q = byKey(r, 'q1'), f = byKey(r, 'f1');
    expect(q.priorCareer.seasons.every((s) => s.organisation.startsWith('Prior club'))).toBe(true);
    expect(q.priorCareer.seasons[1]!.organisation).toBe(f.priorCareer.seasons[0]!.organisation);
    expect(JSON.stringify(r.people.map((p) => p.priorCareer))).not.toMatch(/Alpha|Beta|Gamma/);
    expect(clubLetters(0)).toBe('A'); expect(clubLetters(26)).toBe('AA');
  });
  it('shows plain names only when the pack says team_names plain', () => {
    const p = run(7, synthPack({ extra: { team_names: 'plain' } }));
    expect(byKey(p, 'q1').priorCareer.seasons[0]!.organisation).toBe('Alpha');
  });
  it('derives coached edges, never a family edge, and keeps the family link as a flag', () => {
    const q = byKey(r, 'q1'), c = byKey(r, 'c1'), f = byKey(r, 'f1');
    expect(r.links!.edges.some((e) => e.kind === 'coached' && e.a === c.record.id && e.b === q.record.id)).toBe(true);
    expect(r.links!.edges.every((e) => (e.kind as string) !== 'family')).toBe(true);
    expect(r.links!.familyFlags).toEqual([[Math.min(q.record.id, f.record.id), Math.max(q.record.id, f.record.id)]]);
    for (const e of r.links!.edges) expect(r.originOf(e.a) === 'imported' && r.originOf(e.b) === 'imported').toBe(true);
  });
  it('keeps imported statistics apart (history.importedStats)', () => {
    expect(byKey(r, 'q1').record.history.importedStats!['pro.passing_yards']).toBe(3800 + 4000 + 4200 + 4300);
  });
});

describe('the protection rule (A6.3.1, X14.1.2, Q1.6.2)', () => {
  const r = run();
  const defs: Record<string, Pick<EventTypeDef, 'importedAllowed'>> = { arrest: { importedAllowed: false }, divorce: { importedAllowed: false }, game_result: { importedAllowed: true }, injury_in_play: { importedAllowed: true } };
  const typeOf = (t: string) => defs[t];
  const generated = Array.from({ length: 30 }, (_, i) => ({ id: 10_000 + i, origin: 'generated' as const }));
  const world = [...r.people.map((p) => ({ id: p.record.id, origin: p.record.origin })), ...generated];
  const originOf = (id: number) => world.find((w) => w.id === id)?.origin;
  const ev = (type: string, personId: number) => ({ type, actors: [{ personId, role: 'subject' }], subjects: [] });

  it('a direct emit of an excluded type on a protected person is refused and counted', () => {
    const g = new EmitGuard(originOf, typeOf);
    expect(g.check(ev('arrest', byKey(r, 'q1').record.id))).toBe(false);
    expect(g.check({ type: 'divorce', actors: [], subjects: [{ kind: 'person', id: byKey(r, 'c1').record.id }] })).toBe(false);
    expect(g.check(ev('mod_event', byKey(r, 'q1').record.id))).toBe(false);
    expect(g.refusalCount).toBe(3);
  });
  it('football events land on everyone', () => {
    const g = new EmitGuard(originOf, typeOf);
    expect(g.check(ev('injury_in_play', byKey(r, 'q1').record.id))).toBe(true);
    expect(g.check(ev('arrest', 10_001))).toBe(true);
  });
  it('fuzz: 10,000 sensitive picks in an all-real world with the first barrier produce zero refusals and zero protected subjects (D13.6.2)', () => {
    const s = rng(11).open('test.fuzz', []);
    const g = new EmitGuard(originOf, typeOf);
    const allReal = world.filter((w) => w.origin === 'imported');
    let emitted = 0;
    for (let i = 0; i < 10_000; i++) {
      const pool = withoutProtected(s.chance(0.5) ? allReal : world);
      if (pool.length === 0) continue;
      const who = pool[s.int(0, pool.length - 1)]!;
      if (g.check(ev(s.chance(0.5) ? 'arrest' : 'divorce', who.id))) emitted++;
      expect(originOf(who.id)).not.toBe('imported');
    }
    expect(g.refusalCount).toBe(0);
    expect(emitted).toBeGreaterThan(0);
  });
  it('the history run scan finds imported people before the career start (X14.4.2)', () => {
    const imp = new Set(r.people.map((p) => p.record.id));
    const q = byKey(r, 'q1').record.id;
    const e = (id: number, year: number, pid: number) => ({ id, when: { date: { seasonYear: year, dayIndex: 10 }, period: null, clockTenths: null }, actors: [{ personId: pid, role: 'x' }], subjects: [] });
    const start = { seasonYear: START, dayIndex: 0 };
    expect(historyRunViolations([e(1, 2020, 10_001), e(2, 2027, q)], imp, start)).toEqual([]);
    expect(historyRunViolations([e(3, 2020, q)], imp, start)).toEqual([3]);
    expect(() => assertHistoryClean([e(3, 2020, q)], imp, start)).toThrow(/X14.4.2/);
  });
  it('the audit fails missing, stale, reasonless and harmful-allowed rows (X14.1.3)', () => {
    const types = [{ id: 'game_result', harmClass: 'none' as const }, { id: 'arrest', harmClass: 'harmful' as const }, { id: 'benched', harmClass: 'professional_negative' as const }];
    const hash = (_k: string, id: string) => `h-${id}`;
    const rows = [
      { id: 'game_result', kind: 'event' as const, importedAllowed: true, reviewer: 'M', date: '2026-11-26', reason: 'public result', fileHash: 'h-game_result' },
      { id: 'arrest', kind: 'event' as const, importedAllowed: true, reviewer: 'M', date: '2026-11-26', reason: 'x', fileHash: 'h-arrest' },
      { id: 'label_clutch', kind: 'label' as const, importedAllowed: true, reviewer: 'M', date: '2026-11-26', reason: '', fileHash: 'old' },
    ];
    const codes = auditProblems(types, ['label_clutch'], rows, hash).map((p) => `${p.id}:${p.code}`).sort();
    expect(codes).toEqual(['arrest:harm_allowed', 'benched:missing_row', 'label_clutch:no_reason', 'label_clutch:stale_row']);
    expect(auditedAllowed(rows, 'event', 'game_result', 'h-game_result')).toBe(true);
    expect(auditedAllowed(rows, 'event', 'game_result', 'changed')).toBe(false);
    expect(auditedAllowed(rows, 'event', 'benched', 'h-benched')).toBe(false);
  });
  it('the text scan catches protected topics and quotes near a protected name, and passes football lines', () => {
    const names = [{ first: 'Testa', last: 'Quill' }];
    expect(scanProtectedText('Testa Quill threw for 300 yards. The offense scored twice.', names)).toEqual([]);
    expect(scanProtectedText('Testa Quill was arrested on Tuesday.', names)[0]!.topic).toBe('crime');
    expect(scanProtectedText('Testa Quill said "we will win".', names).some((f) => f.kind === 'quotation')).toBe(true);
    expect(scanProtectedText('Quill was benched.', names, { matchLastName: true })).toEqual([]);
  });
});

describe('placement (U4.2)', () => {
  const r = run(5, synthPack({ starters: 40 }));
  const mins: Record<string, number> = { QB: 1, LB: 3, DB: 1, WR: 1, OL: 1 };
  const teams = (n: number): TeamSlot[] => Array.from({ length: n }, (_, i) => ({ teamId: 100 + i, level: 'pro', rosterLimit: 12, minimums: mins, roster: Array.from({ length: 10 }, (_, j) => ({ personId: 5000 + i * 100 + j, group: ['QB', 'LB', 'LB', 'LB', 'DB', 'WR', 'OL', 'LB', 'DB', 'WR'][j]!, value: 30 + j, imported: false })) }))
    .concat([{ teamId: 900, level: 'college', rosterLimit: 20, minimums: { WR: 1, OL: 1 }, roster: [] }]);
  const jobs: CoachJob[] = [100, 101, 102, 103].map((t, i) => ({ jobId: 700 + i, teamId: t, level: 'pro', role: 'head coach' }));

  for (const mode of ['random', 'balanced', 'kept_together'] as const) {
    it(`${mode}: rosters stay within limits, levels never mix, same seed same placement`, () => {
      const a = placeImported(r, teams(4), jobs, { mode, rnd: rng(1), worldStartYear: START, reservedJobIds: new Set() });
      const b = placeImported(r, teams(4), jobs, { mode, rnd: rng(1), worldStartYear: START, reservedJobIds: new Set() });
      expect([...a.players.assigned]).toEqual([...b.players.assigned]);
      for (const [, roster] of a.players.rosters) expect(roster.length).toBeLessThanOrEqual(20);
      for (const t of teams(4)) expect(a.players.rosters.get(t.teamId)!.length).toBeLessThanOrEqual(t.rosterLimit);
      for (const [pid, tid] of a.players.assigned) expect(r.people.find((p) => p.record.id === pid)!.level).toBe(tid === 900 ? 'college' : 'pro');
      const placedPlusPooled = a.players.assigned.size + a.players.pooled.length;
      expect(placedPlusPooled).toBe(r.people.filter((p) => p.record.playing).length);
    });
  }
  it('balanced mode keeps the team strength spread within the set value', () => {
    const big = run(5, synthPack({ starters: 40 }));
    const ts: TeamSlot[] = Array.from({ length: 4 }, (_, i) => ({ teamId: 100 + i, level: 'pro', rosterLimit: 20, minimums: { LB: 4 }, roster: [] }));
    const res = placeImported(big, ts, [], { mode: 'balanced', rnd: rng(2), worldStartYear: START, reservedJobIds: new Set() });
    expect(res.players.spread['pro']!).toBeLessThanOrEqual(param('placement.balancedSpreadIss'));
  });
  it('kept together puts every player of one organisation-season on one team', () => {
    const res = placeImported(r, teams(4), jobs, { mode: 'kept_together', rnd: rng(3), worldStartYear: START, reservedJobIds: new Set() });
    const unitTeams = new Map<string, Set<number>>();
    for (const p of r.people) {
      const tid = res.players.assigned.get(p.record.id);
      const u = p.unitKeys[p.unitKeys.length - 1];
      if (tid === undefined || !u) continue;
      (unitTeams.get(u) ?? unitTeams.set(u, new Set()).get(u)!).add(tid);
    }
    for (const [, s] of unitTeams) expect(s.size).toBe(1);
  });
  it('displaces the lowest generated players when a roster overflows (U5.2.2)', () => {
    const res = placeImported(r, teams(4), jobs, { mode: 'random', rnd: rng(4), worldStartYear: START, reservedJobIds: new Set() });
    expect(res.players.displaced.length).toBeGreaterThan(0);
    for (const d of res.players.displaced) expect(d.personId).toBeGreaterThanOrEqual(5000);
  });
  it('coaches: never above the last real rung, the reserved job holds no import, one head coach per job', () => {
    const res = placeImported(r, teams(4), jobs, { mode: 'random', rnd: rng(4), worldStartYear: START, reservedJobIds: new Set([700, 701, 702]) });
    const c1 = byKey(r, 'c1').record.id;
    expect(res.coaches.hired.get(c1)).toBe(703);
    const s = rng(1).open('t', []);
    const out = placeCoaches([{ personId: 1, level: 'pro', lastRole: 'head coach', lastSeason: 2020, lastUnitKey: null }], jobs, 'random', s, { worldStartYear: START, reservedJobIds: new Set() });
    expect(out.unemployed).toEqual([1]);
    const oc = placeCoaches([{ personId: 2, level: 'pro', lastRole: 'coordinator', lastSeason: 2025, lastUnitKey: null }], jobs, 'random', s, { worldStartYear: START, reservedJobIds: new Set() });
    expect(oc.hired.size).toBe(0);
  });
  it('team metric is the mean of starters', () => {
    expect(teamStrength([{ personId: 1, group: 'LB', value: 60, imported: true }, { personId: 2, group: 'LB', value: 40, imported: true }, { personId: 3, group: 'LB', value: 10, imported: true }], { LB: 2 })).toBe(50);
    void placePlayers;
  });
});

describe('dial, mix and records (X14.3.1, U5, X14.2.2)', () => {
  it('the dial is fixed, whole and 0 to 100', () => {
    expect(createDial().value).toBe(param('dial.default'));
    expect(() => createDial(101)).toThrow(); expect(() => createDial(12.5)).toThrow();
    expect(Object.isFrozen(createDial(30))).toBe(true);
  });
  it('100 follows the target, 0 follows the generated change, and no target means generated', () => {
    const target = targetPathFrom([2027], () => ({ a: 60 }));
    const cur = { a: 50 }, gen = { a: -2 };
    expect(blendSeason(cur, gen, target, 2027, createDial(100)).a).toBe(60);
    expect(blendSeason(cur, gen, target, 2027, createDial(0)).a).toBe(48);
    expect(blendSeason(cur, gen, target, 2027, createDial(50)).a).toBe(54);
    expect(blendSeason(cur, gen, target, 2030, createDial(100)).a).toBe(48);
  });
  it('record lists: a big prior career tops the combined list and is absent from the world list', () => {
    const l = recordLists(new Map([[1, 10], [2, 0]]), new Map([[2, 900]]), 5);
    expect(l.includingPrior[0]!.personId).toBe(2);
    expect(l.thisWorld.map((x) => x.personId)).toEqual([1]);
  });
  it('fill needs, delta entrants and the certified lock', () => {
    expect(fillNeed('pro_players', 100, 30, DEFAULT_MIX)).toBe(70);
    expect(fillNeed('pro_players', 100, 30, { ...DEFAULT_MIX, pro_players: 'generated_only' })).toBe(100);
    expect(deltaEntrants(['a', 'b'], new Set(['a']), { certified: false })).toEqual({ entrants: ['b'], skipped: ['a'], refused: false });
    expect(deltaEntrants(['a'], new Set(), { certified: true }).refused).toBe(true);
  });
  it('the collision guard finds generated people sharing an imported full name', () => {
    const name = (first: string, last: string) => ({ first, last, suffix: null, nickname: null });
    expect(nameCollisions([{ id: 1, origin: 'imported', name: name('Testa', 'Quill') }, { id: 2, origin: 'generated', name: name('testa', 'QUILL') }, { id: 3, origin: 'generated', name: name('Other', 'Person') }])).toEqual([2]);
  });
});

describe('pack builder and CollegeFootballData adapter', () => {
  it('builds a valid pack from rows in the project data layout and never carries image or pay columns', () => {
    const { pack } = buildProjectPack({
      nflPlayers: [{ gsis_id: '00-1', first_name: 'Synth', last_name: 'Pro', birth_date: '1998-01-01', position: 'WR', height: '72', weight: '200', last_season: '2025', rookie_season: '2020', pfr_id: 'SynP00', forty: '4.4', draft_year: '2020', headshot: 'https://example.invalid/x.png', contract_apy: '1' }],
      nflPlayerSeasons: [{ player_id: '00-1', season: '2025', team: 'XXX', games: '17', receiving_yards: '900', targets: '100' }],
      nflSnapCounts: [{ game_id: 'g1', game_type: 'REG', season: '2025', team: 'XXX', pfr_player_id: 'SynP00', offense_snaps: '60', offense_pct: '0.9', defense_snaps: '0', defense_pct: '0', st_snaps: '0' }],
      nflHeadCoachSeasons: [{ coach: 'Synth Coach', team: 'XXX', season: '2025', game_type: 'REG', games: '17', wins: '9', losses: '8', ties: '0' }],
    }, { packId: 'b', name: 'b', version: '1', author: 't', snapshotSeason: 2025, teamNames: 'omitted' });
    expect(JSON.stringify(pack)).not.toMatch(/https?:|headshot|contract/);
    expect(pack.tables['player_seasons']!.rows[0]!['snap_share']).toBe('0.9');
    expect(pack.tables['coaching_seasons']!.rows[0]!['wins']).toBe('9');
  });
  it('reads the CFBD /coaches shape and works without a key', () => {
    const rows = cfbdCoachRows([{ id: 5, firstName: 'Synth', lastName: 'Ivy', seasons: [{ school: 'S', year: 2024, games: 12, wins: 8, losses: 4, ties: 0 }] }, { firstName: 'No', lastName: 'Id' }]);
    expect(rows.people).toEqual([{ source_key: 'cfbdcoach:5', name_first: 'Synth', name_last: 'Ivy' }]);
    expect(rows.coachingSeasons[0]).toMatchObject({ level: 'college', role: 'head coach', season: '2024', wins: '8' });
    expect(rows.skipped).toBe(1);
    expect(cfbdStatus(undefined).available).toBe(false);
    expect(cfbdStatus('k').available).toBe(true);
  });
});
