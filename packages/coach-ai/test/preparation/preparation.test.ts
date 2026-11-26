// Tests for bible K3 (G-74). Each describe names the leaf it covers and the acceptance line it checks.
import { describe, expect, it } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import { tendencies } from '@gm/models';
import { ParamFile, scanForbiddenJson } from '@gm/schema';
import {
  allocatePractice, apportion, buildMatrix, buildMenu, buildPayoffs, buildScoutingReport, buildSheet, cellKey, coveredSituations,
  depthChart, expectedLineup, flaggedStar, installOrder, lockSheet, lookShares, matchupTable, mergeLooks, needsList, opponentSpecificCalls,
  OTHER_LOOK, PARAMS, param, plannedSnaps, plannerSystem, prepareLeagueWeek, prepareTeamWeek, prepDepth, sheetProblems, withinLimits,
  defenseLook, defaultBucket,
  type BucketMatrix, type CallOption, type MixSolver, type PairingDef, type PrepDepth, type PrepStreams, type PriorTable, type ScoutingInput,
  type SituationDef, type StaffGrade, type TeamWeekInput, type Unit,
} from '../../src/preparation/index.ts';
import type { SystemBlock } from '../../src/profile/index.ts';

type ChartedPlay = tendencies.ChartedPlay;
const SEED = seedFromNumber(20261126);
const OPP = 7;
const SEASON = 2026;

// ---- fixture: an opponent's film in the shared tendency store ----

const COVERAGES = ['cover1', 'cover2', 'cover3', 'cover4', 'cover6', 'cover0'];
const CONCEPTS = ['inside_zone', 'outside_zone', 'power', 'mesh', 'four_verts', 'smash', 'screen_family'];
const FORMATIONS = ['trips', 'doubles', 'i_form', 'empty'];

function film(games: number, teamId = OPP, season = SEASON, firstGameId = 100): ChartedPlay[] {
  const out: ChartedPlay[] = [];
  for (let g = 0; g < games; g++) {
    const d = stream(SEED, 'test-film', [teamId, season, g]);
    for (let i = 0; i < 120; i++) {
      const side = i % 2 === 0 ? 'offense' : 'defense';
      const down = d.int(1, 3);
      const formation = FORMATIONS[d.int(0, FORMATIONS.length - 1)]!;
      // A planted tendency: from the I formation this team runs almost every time.
      const run = formation === 'i_form' ? d.uniform() < 0.95 : d.uniform() < 0.4;
      const concept = run ? CONCEPTS[d.int(0, 2)]! : CONCEPTS[d.int(3, 6)]!;
      out.push({
        ref: `${firstGameId + g}:${i}`, gameId: firstGameId + g, gameOrder: g + 1, season, index: i, teamId, opponentId: 50 + g, side,
        callerId: 900, source: 'own', down, distanceYd: down === 1 ? 10 : d.int(1, 12), yardsToGoalYd: d.int(5, 90), hash: 'middle', quarter: d.int(1, 4),
        clockTenths: 5000, scoreDiff: 0, afterEvent: 'none', personnel: 'p11', formation, strength: 'right', motion: null, shotgun: !run, tempo: 'huddle',
        playKind: run ? 'run' : 'dropback_pass', runDirection: run ? 'left' : null, concept, protection: run ? null : 'slide',
        front: 'over', rushers: d.uniform() < 0.3 ? 5 : 4, boxCount: 7, coverageFamily: COVERAGES[d.pick([30, 25, 25, 12, 6, 2])]!, pressureDesign: null,
        yards: d.int(-2, 12), success: d.uniform() < 0.45, forced: false, lookOnly: false,
      });
    }
  }
  return out;
}

const PERFECT: tendencies.ChartingInputs = { tagger: tendencies.PERFECT_TAGGER, disguise: () => 0 };
const SLOPPY: tendencies.ChartingInputs = { tagger: { skill: 0 }, disguise: () => 1, vocabulary: (tag) => (tag === 'coverageFamily' ? COVERAGES : CONCEPTS) };
const STAFF = [1, 2, 3, 4].map((staffId) => ({ staffId, speed: 1, hoursAvailable: 40 }));

function scoutInput(over: Partial<ScoutingInput> = {}): ScoutingInput {
  return { opponentId: OPP, season: SEASON, film: film(8), staff: STAFF, hoursUntilPlanDay: 40, charting: PERFECT, ...over };
}
const depthAt = (z: number, over: Partial<PrepDepth> = {}): PrepDepth => ({ ...prepDepth({ preparationZ: z, evaluationZ: z, tellHours: 8 }), ...over });
const rng = (...scope: (number | string)[]) => stream(SEED, 'test-prep', scope);

// ---- fixture: playbook content, catalogue, priors ----

function calls(unit: Unit, n: number, readyCount: number): CallOption[] {
  const fam = unit === 'offense' ? CONCEPTS : unit === 'defense' ? COVERAGES : ['kick_deep', 'kick_short'];
  return Array.from({ length: n }, (_, i): CallOption => ({
    callId: `${unit[0]}${String(i).padStart(2, '0')}`, unit, conceptFamily: fam[i % fam.length]!,
    kind: unit === 'offense' ? (i % fam.length < 3 ? 'run' : 'dropback_pass') : 'call', tags: unit === 'defense' && i % 3 === 0 ? ['pressure'] : [],
    fits: null, readiness: i < readyCount ? 0.9 : 0.2, carryOver: i < readyCount / 2,
    pairings: i % 4 === 0 ? [{ pairingId: 'x_vs_cb1', weight: 0.02 }] : [],
  }));
}
const CATALOGUE: SituationDef[] = [
  { id: '1st_10', parentId: null, expectedSnaps: 25.7, clock: false },
  { id: '1st_other', parentId: '1st_10', expectedSnaps: 1.2, clock: false },
  { id: '2nd_short', parentId: '2nd_medium', expectedSnaps: 3.4, clock: false },
  { id: '2nd_medium', parentId: null, expectedSnaps: 4.8, clock: false },
  { id: '2nd_long', parentId: '2nd_medium', expectedSnaps: 12.3, clock: false },
  { id: '3rd_short', parentId: '3rd_medium', expectedSnaps: 3.6, clock: false },
  { id: '3rd_medium', parentId: null, expectedSnaps: 3.2, clock: false },
  { id: '3rd_long', parentId: '3rd_medium', expectedSnaps: 5.8, clock: false },
  { id: '4th', parentId: '3rd_short', expectedSnaps: 1.4, clock: false },
  { id: 'two_minute', parentId: '1st_10', expectedSnaps: 7.3, clock: true },
];
/** A deterministic prior: each family has a base value and one look it beats. */
const prior: PriorTable = (unit, family, look) => {
  const fams = unit === 'offense' ? CONCEPTS : unit === 'defense' ? COVERAGES : ['kick_deep', 'kick_short'];
  const i = fams.indexOf(family);
  if (i < 0) return null;
  const h = [...look].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 97, 7 + i);
  return { mean: 0.02 * i + (h % 10) * 0.01 - 0.05, sd: 0.15 };
};
const uniform: MixSolver = (m) => m.candidates.map(() => 1 / m.candidates.length);
const PAIRINGS: PairingDef[] = [{ id: 'x_vs_cb1', offenseSlot: 'X', offenseRole: 'wr', defenseSlot: 'CB1', defenseRole: 'cb', contest: 'route' }, { id: 'lt_vs_edge', offenseSlot: 'LT', offenseRole: 'ot', defenseSlot: 'EDGE', defenseRole: 'edge', contest: 'passRush' }];
const expectation = (_c: string, diff: number) => 0.01 * diff;

function teamInput(teamId: number, z: number, over: Partial<TeamWeekInput> = {}): TeamWeekInput {
  return {
    teamId, gameId: 5000 + teamId, opponentId: OPP, season: SEASON, week: 9, preparationZ: z, evaluationZ: z, tellHours: 8, method: 'full',
    scouting: { film: film(8), staff: STAFF, hoursUntilPlanDay: 40, charting: PERFECT, management: { fourthDownGo: 9, fourthDownChances: 30, twoPointTries: 1, touchdowns: 20, timeoutsUnused: 4, halves: 16 },
      specialTeams: [{ gameId: 107, unit: 'kickoff', observed: 'deep_middle' }, { gameId: 107, unit: 'kickoff', observed: 'deep_middle' }, { gameId: 106, unit: 'kickoff', observed: 'squib' }] },
    ownOffense: [{ slot: 'X', playerId: 1, uncertain: false }, { slot: 'LT', playerId: 2, uncertain: false }],
    ownDefense: [{ slot: 'CB1', playerId: 3, uncertain: false }, { slot: 'EDGE', playerId: 4, uncertain: false }],
    opponentOffenseOnFilm: [{ slot: 'X', playerId: 71, snaps: 300 }, { slot: 'LT', playerId: 72, snaps: 300 }],
    opponentDefenseOnFilm: [{ slot: 'CB1', playerId: 73, snaps: 300 }, { slot: 'EDGE', playerId: 74, snaps: 280 }, { slot: 'EDGE', playerId: 75, snaps: 40 }],
    injuryReport: [],
    grades: (games) => [
      { playerId: 1, role: 'wr', mean: 62, sd: 2 }, { playerId: 2, role: 'ot', mean: 50, sd: 2 }, { playerId: 3, role: 'cb', mean: 55, sd: 2 }, { playerId: 4, role: 'edge', mean: 58, sd: 2 },
      { playerId: 71, role: 'wr', mean: 74, sd: 12 / games.length }, { playerId: 72, role: 'ot', mean: 48, sd: 12 / games.length },
      { playerId: 73, role: 'cb', mean: 49, sd: 12 / games.length }, { playerId: 74, role: 'edge', mean: 66, sd: 12 / games.length },
    ],
    ourOffensePairings: PAIRINGS, ourDefensePairings: PAIRINGS, contestExpectation: expectation, rushContests: ['passRush'],
    offense: { calls: calls('offense', 60, 30), catalogue: CATALOGUE, sizeLimit: 40, scriptSituations: ['1st_10', '2nd_medium'],
      packages: [{ id: 'seq1', kind: 'set-up', calls: ['o00', 'o01'] }, { id: 'seq2', kind: 'set-up', calls: ['o02', 'o03'] }, { id: 'seq3', kind: 'set-up', calls: ['o04', 'o05'] }],
      balance: { groupOf: (c) => tendencies.runOrPass(c.kind) ?? 'other', targets: { pass: 0.573, run: 0.427 } } },
    defense: { calls: calls('defense', 40, 24), catalogue: CATALOGUE, sizeLimit: 24, mixGroupOf: (c) => (c.tags.includes('pressure') ? 'pressure' : 'coverage') },
    specialTeams: { calls: calls('specialTeams', 4, 4).map((c) => ({ ...c, fits: ['kickoff'] })), catalogue: [{ id: 'kickoff', parentId: null, expectedSnaps: 5, clock: false }], sizeLimit: 3 },
    prior, reps: (req, r) => ({ mean: 0.05 + 0.1 * r.normal() / Math.sqrt(req.reps), sd: 1, n: req.reps }), solver: uniform,
    practice: { readiness: () => 0.9, repsToReady: () => 12, healthRisk: 0.2, budget: { teamReps: 400, paddedAllowed: 1 }, paddedWanted: 1 },
    practiceShare: 1, backupReadiness: (id) => (Number(id.slice(1)) % 2 === 0 ? 0.8 : 0.3), weatherPlanDue: true, lockTime: 6, ...over,
  };
}
const streamsFor = (teamId: number): PrepStreams => (name) => stream(SEED, 'coachPrep', [SEASON, 9, teamId, name]);

// ---- tests ----

describe('parameters', () => {
  it('the file parses as a schema ParamFile and every value sits inside its range', () => {
    expect(ParamFile.safeParse(PARAMS).success).toBe(true);
    for (const p of PARAMS.params) { expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max); }
    expect(new Set(PARAMS.params.map((p) => p.name)).size).toBe(PARAMS.params.length);
  });
  it('depth follows K3 ranges: 2 to 6 games, 0 to 20 reps, noise 0.20 to 0.05, script 8 to 15, coverage 70% to 100%', () => {
    const lo = depthAt(-3);
    const hi = depthAt(3);
    expect([lo.gamesWanted, hi.gamesWanted]).toEqual([2, 6]);
    expect([lo.repsPerCell, hi.repsPerCell]).toEqual([0, 20]);
    expect(lo.noiseSd).toBeCloseTo(0.2, 12); expect(hi.noiseSd).toBeCloseTo(0.05, 12);
    expect([lo.scriptLength, hi.scriptLength]).toEqual([8, 15]);
    expect(lo.catalogueCoverage).toBeCloseTo(0.7, 12); expect(hi.catalogueCoverage).toBeCloseTo(1, 12);
    expect(lo.splits).toEqual(['downDistance']);
    expect(depthAt(-1.5 + 0.75).splits).toEqual(['downDistance', 'fieldZone']);
    expect(hi.splits.length).toBe(6);
    expect(lo.fullContingencies).toBe(false); expect(hi.fullContingencies).toBe(true);
    expect(prepDepth({ preparationZ: 3, evaluationZ: 3, tellHours: 8, method: 'noPlanningReps' }).repsPerCell).toBe(0);
  });
  it('the chance to find a tell runs from 10% to 60% and is never zero', () => {
    expect(prepDepth({ preparationZ: 0, evaluationZ: -3, tellHours: 0 }).tellFindChance).toBeCloseTo(0.1, 12);
    expect(prepDepth({ preparationZ: 0, evaluationZ: 3, tellHours: 40 }).tellFindChance).toBeCloseTo(0.6, 12);
  });
});

describe('K3.1.1 the AI scouting report', () => {
  it('acceptance: with no charting error and maximum preparation the counts equal the same view of the store', () => {
    const inp = scoutInput();
    const report = buildScoutingReport(inp, depthAt(3), rng('k311'));
    expect(report.gamesCharted).toEqual([102, 103, 104, 105, 106, 107]);
    const window = inp.film.filter((p) => p.gameId >= 102);
    const want = tendencies.tendencyTable(tendencies.relevanceWeights(window, { teamId: OPP, season: SEASON }), { cuts: ['formation'], measure: 'runPass' });
    const got = report.tables.find((t) => t.measure === 'runPass' && t.cuts.join() === 'formation')!.cells;
    expect(got.map((c) => [c.key, c.calls, c.outcomes.map((o) => [o.outcome, o.count])])).toEqual(want.map((c) => [c.key, c.calls, c.outcomes.map((o) => [o.outcome, o.count])]));
    // The planted I-formation tendency is on film, so it is in the strong rows.
    expect(report.strong.some((c) => c.key === 'i_form' && c.bandOutcome === 'run')).toBe(true);
  });
  it('acceptance: a play that was never run in a game appears in no report (the report only holds what the film holds)', () => {
    const inp = scoutInput();
    const report = buildScoutingReport(inp, depthAt(3), rng('k311'));
    const onFilm = new Set(inp.film.map((p) => p.concept));
    for (const p of report.plays) expect(onFilm.has(p.concept)).toBe(true);
    expect(JSON.stringify(report)).not.toContain('installed_never_called');
    // The input type has no field for a plan, sheet, practice script or install state.
    expect(Object.keys(inp).sort()).toEqual(['charting', 'film', 'hoursUntilPlanDay', 'opponentId', 'season', 'staff']);
  });
  it('rule 1 and 2: a poor preparer charts fewer games and reads fewer splits; a short staff finishes fewer breakdowns', () => {
    const low = buildScoutingReport(scoutInput(), depthAt(-3), rng('a'));
    expect(low.gamesCharted).toEqual([106, 107]);
    expect(new Set(low.tables.flatMap((t) => t.cuts))).toEqual(new Set(['downDistance']));
    // One man with 20 hours finishes three game-sides of six hours each: only the newest game is complete on both sides.
    const short = buildScoutingReport(scoutInput({ staff: [{ staffId: 1, speed: 1, hoursAvailable: 20 }], hoursUntilPlanDay: 20 }), depthAt(3), rng('a'));
    expect(short.gamesCharted).toEqual([106, 107]);
    expect(short.plays.filter((p) => p.gameId === 106).every((p) => p.side === 'offense')).toBe(true);
  });
  it('rule 3: a poor charting staff mislabels inferred tags; the true call name never appears', () => {
    const sloppy = buildScoutingReport(scoutInput({ charting: { ...SLOPPY, chartValue: (tag, v) => (tag === 'concept' ? `fam:${v}` : v) } }), depthAt(3), rng('b'));
    const truth = new Map(scoutInput().film.map((p) => [p.ref, p]));
    const wrong = sloppy.plays.filter((p) => p.side === 'defense' && p.coverageFamily !== truth.get(p.ref)!.coverageFamily).length;
    const all = sloppy.plays.filter((p) => p.side === 'defense').length;
    expect(wrong / all).toBeGreaterThan(0.2);
    for (const p of sloppy.plays) if (p.concept !== null) expect(CONCEPTS.includes(p.concept)).toBe(p.concept.startsWith('fam:') ? false : true);
    expect(sloppy.plays.every((p) => p.source === 'charted')).toBe(true);
  });
  it('rule 4: tells are found by chance, more often by a better evaluator, and the same stream gives the same report', () => {
    const count = (z: number) => { let n = 0; for (let s = 0; s < 60; s++) n += buildScoutingReport(scoutInput(), depthAt(3, { tellFindChance: prepDepth({ preparationZ: 3, evaluationZ: z, tellHours: 8 }).tellFindChance }), rng('tells', s)).tells.length; return n; };
    const lo = count(-3);
    const hi = count(3);
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeGreaterThan(lo * 2);
    const a = buildScoutingReport(scoutInput(), depthAt(1), rng('same'));
    const b = buildScoutingReport(scoutInput(), depthAt(1), rng('same'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('week 1 and rule 7: last season and the caller\'s previous team are weighted down; special teams and the public record ride along', () => {
    const rows = [...film(2, 33, SEASON - 1, 10), ...film(2, OPP, SEASON - 1, 20), ...film(1, OPP, SEASON, 30)];
    const r = buildScoutingReport(scoutInput({ film: rows, specialTeams: [{ gameId: 30, unit: 'punt', observed: 'directional_left' }, { gameId: 999, unit: 'punt', observed: 'not_charted' }], management: { fourthDownGo: 6, fourthDownChances: 20, twoPointTries: 0, touchdowns: 3, timeoutsUnused: 1, halves: 2 } }), depthAt(3), rng('w1'));
    const weights = new Map(r.plays.map((p) => [p.gameId, p.weight]));
    expect(weights.get(30)).toBe(1); expect(weights.get(20)).toBe(0.4); expect(weights.get(10)).toBe(0.5);
    expect(r.specialTeams).toEqual([{ unit: 'punt', observed: 'directional_left', count: 1 }]);
    expect(r.management!.fourthDownGo).toBe(6);
  });
});

describe('K3.2.1 the AI staff\'s player grades', () => {
  const grades: StaffGrade[] = [{ playerId: 1, role: 'wr', mean: 70, sd: 2 }, { playerId: 73, role: 'cb', mean: 50, sd: 6 }, { playerId: 2, role: 'ot', mean: 50, sd: 2 }];
  const off = [{ slot: 'X', playerId: 1, uncertain: false }, { slot: 'LT', playerId: 2, uncertain: false }];
  it('rule 3: the edge is the grade difference through the contest curve, and thin film widens the band', () => {
    const def = [{ slot: 'CB1', playerId: 73, uncertain: false }];
    const narrow = matchupTable({ offenseLineup: off, defenseLineup: def, grades, pairings: PAIRINGS, contestExpectation: expectation })[0]!;
    const wide = matchupTable({ offenseLineup: off, defenseLineup: def, grades: grades.map((g) => (g.playerId === 73 ? { ...g, sd: 12 } : g)), pairings: PAIRINGS, contestExpectation: expectation })[0]!;
    expect(narrow.gradeDiff).toBe(20); expect(narrow.edge).toBeCloseTo(0.2, 12);
    expect(wide.band).toBeGreaterThan(narrow.band);
  });
  it('rule 4 acceptance: the table reads estimates only, so it cannot move when a true attribute moves without new film', () => {
    // There is no input that carries truth. Two calls with the same estimates give the same table.
    const def = [{ slot: 'CB1', playerId: 73, uncertain: false }];
    const a = matchupTable({ offenseLineup: off, defenseLineup: def, grades, pairings: PAIRINGS, contestExpectation: expectation });
    const b = matchupTable({ offenseLineup: off, defenseLineup: def, grades: grades.map((g) => ({ ...g })), pairings: PAIRINGS, contestExpectation: expectation });
    expect(a).toEqual(b);
  });
  it('rule 5: the expected lineup follows film and the published report; a rookie with no estimate gets the widest band', () => {
    const sightings = [{ slot: 'EDGE', playerId: 74, snaps: 280 }, { slot: 'EDGE', playerId: 75, snaps: 40 }, { slot: 'CB1', playerId: 73, snaps: 300 }];
    expect(expectedLineup(sightings, [])).toEqual([{ slot: 'CB1', playerId: 73, uncertain: false }, { slot: 'EDGE', playerId: 74, uncertain: false }]);
    expect(expectedLineup(sightings, [{ playerId: 74, status: 'out' }, { playerId: 73, status: 'questionable' }])).toEqual([{ slot: 'CB1', playerId: 73, uncertain: true }, { slot: 'EDGE', playerId: 75, uncertain: false }]);
    const rookie = matchupTable({ offenseLineup: off, defenseLineup: [{ slot: 'EDGE', playerId: 75, uncertain: false }], grades, pairings: PAIRINGS, contestExpectation: expectation })[0]!;
    expect(rookie.unknown).toBe(true); expect(rookie.gradeDiff).toBe(0);
    expect(rookie.diffSd).toBeCloseTo(Math.sqrt(4 + param('matchup.unknownBandIss') * param('matchup.unknownBandIss')), 12);
  });
  it('K3.4.1 rule 5: a player far above his own lineup is flagged; an even lineup flags nobody', () => {
    const lineup = [71, 72, 73].map((playerId, i) => ({ slot: `s${i}`, playerId, uncertain: false }));
    const g = (m: number[]) => m.map((mean, i) => ({ playerId: 71 + i, role: 'r', mean, sd: 4 }));
    expect(flaggedStar(lineup, g([80, 50, 50]))!.playerId).toBe(71);
    expect(flaggedStar(lineup, g([55, 50, 52]))).toBeNull();
  });
});

describe('K3.3.1 three sources', () => {
  const offense = calls('offense', 12, 12);
  const looks = [{ look: 'cover1', share: 0.6, count: 60 }, { look: 'cover3', share: 0.4, count: 40 }];
  const truth = (callId: string, look: string) => 0.3 * ((Number(callId.slice(1)) * 7 + look.length) % 5) / 5 - 0.1;
  it('acceptance: with zero noise and many reps the estimate converges to the engine value within 0.03 per cell', () => {
    const reps = (req: { callId: string; look: string; reps: number }, r: { normal(): number }) => ({ mean: truth(req.callId, req.look) + r.normal() / Math.sqrt(req.reps), sd: 1, n: req.reps });
    const t = buildPayoffs({ unit: 'offense', calls: offense, looks, prior, matchups: [], reps, shortList: 12 }, depthAt(3, { noiseSd: 0, repsPerCell: 20000, repsWeeklyCap: 1e9 }), { noise: rng('n'), reps: rng('r') });
    for (const c of offense) for (const l of looks) expect(Math.abs(t.cells.get(cellKey(c.callId, l.look))!.mean - truth(c.callId, l.look))).toBeLessThan(0.03);
  });
  it('rule 2: a matchup edge moves the calls that lean on the pairing, the other way for a defensive call', () => {
    const edge = [{ id: 'x_vs_cb1', contest: 'route', offensePlayerId: 1, defensePlayerId: 73, gradeDiff: 20, diffSd: 5, edge: 5, band: 1, unknown: false }];
    const d = depthAt(0, { noiseSd: 0 });
    const flat = buildPayoffs({ unit: 'offense', calls: offense, looks, prior, matchups: [], reps: null, shortList: 12 }, d, { noise: rng('n'), reps: rng('r') });
    const adj = buildPayoffs({ unit: 'offense', calls: offense, looks, prior, matchups: edge, reps: null, shortList: 12 }, d, { noise: rng('n'), reps: rng('r') });
    expect(adj.cells.get('o00|cover1')!.mean - flat.cells.get('o00|cover1')!.mean).toBeCloseTo(0.1, 12);
    expect(adj.cells.get('o01|cover1')!.mean).toBe(flat.cells.get('o01|cover1')!.mean);
    expect(adj.cells.get('o00|cover1')!.sd).toBeGreaterThan(flat.cells.get('o00|cover1')!.sd);
    const dc = calls('defense', 4, 4);
    const dflat = buildPayoffs({ unit: 'defense', calls: dc, looks, prior, matchups: [], reps: null, shortList: 4 }, d, { noise: rng('n'), reps: rng('r') });
    const dadj = buildPayoffs({ unit: 'defense', calls: dc, looks, prior, matchups: edge, reps: null, shortList: 4 }, d, { noise: rng('n'), reps: rng('r') });
    expect(dadj.cells.get('d00|cover1')!.mean - dflat.cells.get('d00|cover1')!.mean).toBeCloseTo(-0.1, 12);
  });
  it('rules 3 and 5: reps stay inside the weekly cap and go to the short list only; the reps port is told a call and a look and nothing else', () => {
    const seen: object[] = [];
    const reps = (req: { callId: string; look: string; reps: number }) => { seen.push(req); return { mean: 0, sd: 1, n: req.reps }; };
    const t = buildPayoffs({ unit: 'offense', calls: offense, looks, prior, matchups: [], reps, shortList: 5 }, depthAt(3, { repsWeeklyCap: 130 }), { noise: rng('n'), reps: rng('r') });
    expect(t.repsUsed).toBe(120);
    expect(t.repsUsed).toBeLessThanOrEqual(130);
    expect(new Set(seen.map((s) => (s as { callId: string }).callId)).size).toBeLessThanOrEqual(5);
    for (const s of seen) expect(Object.keys(s).sort()).toEqual(['callId', 'look', 'reps']);
    const none = buildPayoffs({ unit: 'offense', calls: offense, looks, prior, matchups: [], reps, shortList: 5, repsAlreadyUsed: 3000 }, depthAt(3), { noise: rng('n'), reps: rng('r') });
    expect(none.repsUsed).toBe(0);
  });
  it('rule 4: estimate noise is smaller for a better preparer', () => {
    const spread = (z: number) => {
      const base = buildPayoffs({ unit: 'offense', calls: offense, looks, prior, matchups: [], reps: null, shortList: 12 }, depthAt(z, { noiseSd: 0 }), { noise: rng('n'), reps: rng('r') });
      let ss = 0; let n = 0;
      for (let s = 0; s < 40; s++) {
        const t = buildPayoffs({ unit: 'offense', calls: offense, looks, prior, matchups: [], reps: null, shortList: 12 }, depthAt(z), { noise: rng('n', s), reps: rng('r') });
        for (const [k, c] of t.cells) { const e = c.mean - base.cells.get(k)!.mean; ss += e * e; n++; }
      }
      return Math.sqrt(ss / n);
    };
    expect(spread(-3)).toBeGreaterThan(0.17); expect(spread(-3)).toBeLessThan(0.23);
    expect(spread(3)).toBeGreaterThan(0.04); expect(spread(3)).toBeLessThan(0.06);
  });
  it('edge case: a call whose concept family is missing from the prior table fails content validation', () => {
    const bad = [...offense, { ...offense[0]!, callId: 'o99', conceptFamily: 'not_in_table' }];
    expect(() => buildPayoffs({ unit: 'offense', calls: bad, looks, prior, matchups: [], reps: null, shortList: 12 }, depthAt(0), { noise: rng('n'), reps: rng('r') })).toThrow(/content validation/);
  });
});

describe('K3.3.2 the matrix per situation bucket', () => {
  it('looks under 3% merge into other; the matrix never exceeds 12 candidates by 8 looks', () => {
    const shares = [0.4, 0.2, 0.1, 0.08, 0.07, 0.05, 0.04, 0.03, 0.02, 0.01].map((share, i) => ({ look: `L${i}`, share, count: Math.round(share * 100) }));
    const merged = mergeLooks(shares);
    expect(merged.length).toBe(8);
    expect(merged[7]!.look).toBe(OTHER_LOOK);
    expect(merged[7]!.members.map((m) => m.look)).toEqual(['L7', 'L8', 'L9']);
    expect(merged.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 12);
    expect(mergeLooks([])).toEqual([{ look: OTHER_LOOK, share: 1, members: [] }]);
    const offense = calls('offense', 30, 30);
    const looks = [{ look: 'cover1', share: 0.97, count: 97 }, { look: 'cover0', share: 0.02, count: 2 }, { look: 'cover6', share: 0.01, count: 1 }];
    const table = buildPayoffs({ unit: 'offense', calls: offense, looks, prior, matchups: [], reps: null, shortList: 30 }, depthAt(0, { noiseSd: 0 }), { noise: rng('n'), reps: rng('r') });
    const m = buildMatrix({ situation: CATALOGUE[0]!, calls: offense, table, bucketShares: looks, allShares: looks });
    expect(m.candidates.length).toBe(12);
    expect(m.looks).toEqual(['cover1', OTHER_LOOK]);
    // The merged column is the share-weighted mean of what it stands for.
    const i = m.candidates.indexOf(m.candidates[0]!);
    const c0 = table.cells.get(cellKey(m.candidates[0]!, 'cover0'))!.mean;
    const c6 = table.cells.get(cellKey(m.candidates[0]!, 'cover6'))!.mean;
    expect(m.a[i]![1]).toBeCloseTo((2 * c0 + c6) / 3, 12);
  });
  it('a clock situation stores win-probability payoffs', () => {
    const offense = calls('offense', 4, 4);
    const looks = [{ look: 'cover1', share: 1, count: 50 }];
    const table = buildPayoffs({ unit: 'offense', calls: offense, looks, prior, matchups: [], reps: null, shortList: 4 }, depthAt(0), { noise: rng('n'), reps: rng('r') });
    const m = buildMatrix({ situation: CATALOGUE[9]!, calls: offense, table, bucketShares: looks, allShares: looks, clockPayoff: () => ({ mean: 0.01, sd: 0.02 }) });
    expect(m.payoffIn).toBe('winProbability');
    expect(m.a.flat().every((x) => x === 0.01)).toBe(true);
  });
});

describe('K3.4 the game plan and the call sheet', () => {
  const run = (z: number, over: Partial<TeamWeekInput> = {}) => prepareTeamWeek(teamInput(11, z, over), streamsFor(11))!;
  it('K3.4.1 acceptance: high-preparation staffs carry more opponent-specific calls than low ones; a short week carries fewer', () => {
    const lo = run(-2.5);
    const hi = run(2.5);
    expect(opponentSpecificCalls(hi.plan)).toBeGreaterThan(opponentSpecificCalls(lo.plan));
    expect(lo.plan.offenseMenu.filter((e) => e.source === 'new').length).toBeLessThanOrEqual(2);
    expect(hi.plan.offenseMenu.filter((e) => e.source === 'new').length).toBeLessThanOrEqual(8);
    expect(hi.plan.offenseMenu.filter((e) => e.wrinkle).length).toBeGreaterThanOrEqual(1);
    expect(lo.plan.offenseMenu.some((e) => e.wrinkle)).toBe(false);
    const short = run(2.5, { practiceShare: 0.5 });
    expect(opponentSpecificCalls(short.plan)).toBeLessThan(opponentSpecificCalls(hi.plan));
  });
  it('K3.4.1 rules 1 to 3: the standing menu comes first, the plan stays inside its size, and the balance follows the system', () => {
    const out = run(1);
    // 30 installed calls plus the 6 new ones this staff can teach: the plan stops short of its 40-call limit.
    expect(out.plan.offenseMenu.length).toBe(36);
    expect(out.plan.defenseMenu.length).toBe(24);
    expect(run(1, { offense: { ...teamInput(11, 1).offense, sizeLimit: 20 } }).plan.offenseMenu.length).toBe(20);
    const standing = out.plan.offenseMenu.filter((e) => e.source === 'standing');
    expect(standing.length).toBe(15);
    expect(out.plan.offenseMenu.slice(0, 15).every((e) => e.source === 'standing')).toBe(true);
    const kinds = new Map(teamInput(11, 1).offense.calls.map((c) => [c.callId, c.kind]));
    const pass = out.plan.offenseMenu.filter((e) => kinds.get(e.callId) === 'dropback_pass').length / out.plan.offenseMenu.length;
    expect(Math.abs(pass - 0.573)).toBeLessThan(0.06);
  });
  it('K3.4.1 rules 4 to 6: themes, protection, the named answer, the fourth-down record and contingencies', () => {
    const hi = run(2.5);
    expect(hi.plan.themes.filter((t) => t.kind !== 'tendency').length).toBe(3);
    expect(hi.plan.themes.some((t) => t.kind === 'tendency')).toBe(true);
    // Their edge rusher (66) against our tackle (50) is the pass-rush mismatch.
    expect(hi.plan.protectionPlan).toEqual([{ pairingId: 'lt_vs_edge', rusherId: 74, blockerId: 2 }]);
    expect(hi.plan.rulesOfWeek.namedAnswer).toEqual({ playerId: 71, role: 'wr' });
    expect(hi.plan.rulesOfWeek.opponentFourthDownGoRate).toBeCloseTo(0.3, 12);
    expect(hi.plan.rulesOfWeek.unscoutedDefault).not.toBeNull();
    expect(hi.plan.specialTeamsAnswers).toHaveLength(1);
    expect(hi.plan.specialTeamsAnswers[0]!.threat).toBe('kickoff:deep_middle');
    expect(hi.plan.contingencies.map((c) => [c.kind, c.full])).toEqual([['backupQuarterback', true], ['weather', true]]);
    const lo = run(-2.5);
    expect(lo.plan.contingencies.map((c) => [c.kind, c.full])).toEqual([['backupQuarterback', false]]);
    expect(lo.plan.contingencies[0]!.calls.length).toBeGreaterThan(0);
    expect(lo.plan.contingencies[0]!.calls.length).toBeLessThanOrEqual(param('plan.backupPackageCalls'));
    expect(scanForbiddenJson('plan', JSON.parse(JSON.stringify(hi.plan)))).toEqual([]);
  });
  it('K2.6.1 rule 3: on a side he does not call, the head coach pulls the rates 30% of the way', () => {
    const sys = (neutralPass: number): SystemBlock => ({ offenseRates: { neutralPass, motion: 0.5, playAction: 0.3, shotgun: 0.6, screen: 0.1, rpo: 0.1, deepShot: 0.1 }, defenseRates: { blitz: 0.3, simulatedPressure: 0.1, man: 0.3, twoHigh: 0.5, disguise: 0.3 } } as SystemBlock);
    expect(plannerSystem(sys(0.6), sys(0.5)).offenseRates.neutralPass).toBeCloseTo(0.57, 12);
    const own = sys(0.6);
    expect(plannerSystem(own, null)).toBe(own);
  });
  it('K3.4.2 and K3.3.2 acceptance: every sheet is sound and every non-empty box has a matrix and a stored mix at lock', () => {
    for (const z of [-2.5, 0, 2.5]) {
      const out = run(z);
      for (const s of out.sheets) {
        const menu = s.unit === 'offense' ? out.plan.offenseMenu : s.unit === 'defense' ? out.plan.defenseMenu : out.plan.specialTeamsMenu;
        const cat = s.unit === 'specialTeams' ? teamInput(11, z).specialTeams!.catalogue : CATALOGUE;
        expect(sheetProblems(s, cat, menu)).toEqual([]);
        expect(s.lockedAt).toBe(6);
        for (const m of s.matrices) { expect(m.sigmaStar).not.toBeNull(); expect(m.sigmaStar!.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9); }
        for (const b of s.boxes) expect(b.entries.length).toBeGreaterThanOrEqual(2);
        expect(scanForbiddenJson('sheet', JSON.parse(JSON.stringify(s)))).toEqual([]);
      }
    }
  });
  it('K3.4.2 acceptance: catalogue coverage, script length and sequence packages rise with preparation', () => {
    const zs = [-2.5, -1, 0, 1, 2.5];
    const sheets = zs.map((z) => run(z).sheets.find((s) => s.unit === 'offense')!);
    const boxes = sheets.map((s) => s.boxes.length);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!).toBeGreaterThanOrEqual(boxes[i - 1]!);
    expect(boxes[0]).toBe(7); expect(boxes[4]).toBe(10);
    // The rarest narrow situations go uncovered first; base boxes never do.
    expect(sheets[0]!.uncovered).toEqual(['1st_other', '2nd_short', '4th']);
    expect(coveredSituations(CATALOGUE, 0).own).toEqual(['1st_10', '2nd_medium', '3rd_medium']);
    expect(sheets[0]!.script.length).toBe(8); expect(sheets[4]!.script.length).toBe(15);
    expect(new Set(sheets[4]!.script.map((e) => e.callId)).size).toBe(15);
    expect(sheets[0]!.sequences.length).toBeLessThanOrEqual(sheets[4]!.sequences.length);
  });
  it('K3.4.2: defensive boxes hold a pressure and a coverage call; a locked sheet is not rebuilt; planned snaps add up', () => {
    const out = run(1);
    const d = out.sheets.find((s) => s.unit === 'defense')!;
    const tags = new Map(teamInput(11, 1).defense.calls.map((c) => [c.callId, c.tags.includes('pressure')]));
    for (const b of d.boxes) expect(new Set(b.entries.map((e) => tags.get(e.callId))).size).toBe(2);
    expect(() => lockSheet(d, uniform, 7)).toThrow(/already locked/);
    const o = out.sheets.find((s) => s.unit === 'offense')!;
    const total = [...plannedSnaps(o, CATALOGUE).values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(CATALOGUE.reduce((s, c) => s + c.expectedSnaps, 0), 9);
    expect(out.plan.offenseMenu.every((e) => e.plannedSnaps !== null)).toBe(true);
    const bad: MixSolver = (m: BucketMatrix) => m.candidates.map(() => 1);
    expect(() => lockSheet({ ...o, lockedAt: null }, bad, 6)).toThrow(/not a probability/);
  });
  it('buildMenu alone: nothing is added past the size limit and a zero limit gives an empty menu', () => {
    const offense = calls('offense', 20, 10);
    const looks = [{ look: 'cover1', share: 1, count: 80 }];
    const table = buildPayoffs({ unit: 'offense', calls: offense, looks, prior, matchups: [], reps: null, shortList: 20 }, depthAt(0), { noise: rng('n'), reps: rng('r') });
    expect(buildMenu({ unit: 'offense', calls: offense, table, looks, sizeLimit: 0, practiceShare: 1 }, depthAt(2))).toEqual([]);
    const m = buildMenu({ unit: 'offense', calls: offense, table, looks, sizeLimit: 50, practiceShare: 1 }, depthAt(-3));
    expect(m.filter((e) => e.source === 'new').length).toBe(0);
    expect(m.length).toBe(10);
  });
  it('looks board: shares by bucket come from the charted rows and sum to 1', () => {
    const report = buildScoutingReport(scoutInput(), depthAt(3), rng('lb'));
    const s = lookShares(report.plays, 'defense', defenseLook, defaultBucket);
    expect(s.all.reduce((a, l) => a + l.share, 0)).toBeCloseTo(1, 9);
    for (const rows of s.byBucket.values()) expect(rows.reduce((a, l) => a + l.share, 0)).toBeCloseTo(1, 9);
    expect(s.all.some((l) => l.look.endsWith('+pressure'))).toBe(true);
  });
});

describe('K3.5.1 allocating practice', () => {
  const menu = Array.from({ length: 10 }, (_, i) => ({ callId: `o${i}`, source: i >= 7 ? 'new' as const : 'standing' as const, wrinkle: false, wrinkleTarget: null, value: 0, order: i, plannedSnaps: 10 - i }));
  const base = { menu, readiness: () => 0.9, repsToReady: () => 20, healthRisk: 0, budget: { teamReps: 200, paddedAllowed: 1 }, paddedWanted: 3 };
  it('acceptance: no week exceeds the limits unless a logged violation exists for it', () => {
    const p = allocatePractice(base);
    expect(withinLimits(p, base.budget)).toBe(true);
    expect(p.paddedPractices).toBe(1);
    expect(p.violationEventId).toBeNull();
    expect(p.perCall.reduce((s, c) => s + c.starterReps + c.backupReps, 0)).toBe(200);
    const v = allocatePractice({ ...base, violation: { eventId: 'violation_committed:881', extraTeamReps: 30, extraPadded: 1 } });
    expect(withinLimits(v, base.budget)).toBe(false);
    expect(v.violationEventId).toBe('violation_committed:881');
    expect(v.teamReps).toBe(230); expect(v.paddedPractices).toBe(2);
  });
  it('rules 1 and 2: new calls first, then planned usage; backups get 15% to 30% by health risk', () => {
    const p = allocatePractice(base);
    expect(p.backupReps).toBe(30);
    expect(allocatePractice({ ...base, healthRisk: 1 }).backupReps).toBe(60);
    const reps = new Map(p.perCall.map((c) => [c.callId, c.starterReps]));
    for (const id of ['o7', 'o8', 'o9']) expect(reps.get(id)!).toBeGreaterThanOrEqual(20);
    expect(reps.get('o0')!).toBeGreaterThan(reps.get('o6')!);
  });
  it('edge case: a plan too big for the week leaves the last calls added short', () => {
    const big = menu.map((e) => ({ ...e, source: 'new' as const }));
    const p = allocatePractice({ ...base, menu: big, budget: { teamReps: 100, paddedAllowed: 1 } });
    const reps = p.perCall.map((c) => c.starterReps);
    expect(reps.slice(0, 4)).toEqual([20, 20, 20, 20]);
    expect(reps[4]).toBe(5);
    expect(reps.slice(5).every((r) => r === 0)).toBe(true);
  });
  it('rule 6: the plan is a plain split with no AI marker, so the shared resolver cannot treat it differently', () => {
    const p = allocatePractice(base);
    expect(Object.keys(p).sort()).toEqual(['backupReps', 'paddedPractices', 'perCall', 'starterReps', 'teamReps', 'violationEventId']);
    expect(apportion(7, [1, 1, 1])).toEqual([3, 2, 2]);
    expect(apportion(5, [0, 0])).toEqual([3, 2]);
  });
});

describe('K3.6.1 order, timing and fidelity', () => {
  const sheetsOf = (m: Map<number, ReturnType<typeof prepareTeamWeek>>, id: number) => JSON.stringify(m.get(id)!.sheets);
  it('acceptance: any order gives identical sheets, and editing another team\'s profile leaves a team\'s sheet unchanged', () => {
    const teams = [teamInput(3, 0.5), teamInput(1, -1), teamInput(2, 1.5)];
    const a = prepareLeagueWeek(teams, streamsFor);
    const b = prepareLeagueWeek([...teams].reverse(), streamsFor);
    expect([...a.keys()]).toEqual([1, 2, 3]);
    for (const id of [1, 2, 3]) expect(sheetsOf(a, id)).toBe(sheetsOf(b, id));
    const edited = prepareLeagueWeek([teamInput(3, 0.5), teamInput(1, 2.9), teamInput(2, 1.5)], streamsFor);
    expect(sheetsOf(edited, 2)).toBe(sheetsOf(a, 2));
    expect(sheetsOf(edited, 3)).toBe(sheetsOf(a, 3));
    expect(sheetsOf(edited, 1)).not.toBe(sheetsOf(a, 1));
  });
  it('edge case: a reload re-runs with the same inputs and seeds and gives the same week', () => {
    const a = prepareTeamWeek(teamInput(5, 1), streamsFor(5))!;
    const b = prepareTeamWeek(teamInput(5, 1), streamsFor(5))!;
    expect(JSON.stringify({ ...a, report: null })).toBe(JSON.stringify({ ...b, report: null }));
    expect(JSON.stringify(a.report)).toBe(JSON.stringify(b.report));
  });
  it('rule 4: a tier-3 team on the full engine prepares with no planning reps; on a fitted model it skips', () => {
    expect(prepareTeamWeek(teamInput(5, 2, { method: 'skip' }), streamsFor(5))).toBeNull();
    const none = prepareTeamWeek(teamInput(5, 2, { method: 'noPlanningReps' }), streamsFor(5))!;
    expect(none.planningRepsUsed).toBe(0);
    const full = prepareTeamWeek(teamInput(5, 2), streamsFor(5))!;
    expect(full.planningRepsUsed).toBeGreaterThan(0);
    expect(full.planningRepsUsed).toBeLessThanOrEqual(param('payoff.repsWeeklyCap'));
  });
  it('rule 2: grades for the opponent are asked for with the charted games only', () => {
    let asked: readonly number[] = [];
    const inp = teamInput(5, -3);
    prepareTeamWeek({ ...inp, grades: (g) => { asked = g; return inp.grades(g); } }, streamsFor(5));
    expect(asked).toEqual([106, 107]);
  });
});

describe('K3.7.1 offseason', () => {
  it('rule 1: the core is installed first and nothing comes before what it depends on', () => {
    const order = installOrder([
      { id: 'shots', core: false, dependsOn: ['dropback'], plannedUse: 0.05 }, { id: 'zone', core: true, dependsOn: [], plannedUse: 0.3 },
      { id: 'dropback', core: true, dependsOn: ['protection'], plannedUse: 0.4 }, { id: 'protection', core: false, dependsOn: [], plannedUse: 0 },
      { id: 'screens', core: false, dependsOn: [], plannedUse: 0.1 },
    ]);
    expect(order).toEqual(['protection', 'dropback', 'zone', 'screens', 'shots']);
  });
  it('rules 2 and 3: depth chart by grade with a veteran bias; needs ranked by shortfall and position value', () => {
    const g: StaffGrade[] = [{ playerId: 1, role: 'qb', mean: 60, sd: 3 }, { playerId: 2, role: 'qb', mean: 61, sd: 6 }, { playerId: 3, role: 'cb', mean: 45, sd: 3 }];
    const cands = [{ playerId: 1, slots: [{ slot: 'QB', role: 'qb' }], seasons: 8 }, { playerId: 2, slots: [{ slot: 'QB', role: 'qb' }], seasons: 0 }, { playerId: 3, slots: [{ slot: 'CB1', role: 'cb' }], seasons: 2 }];
    const chart = depthChart(cands, g);
    expect(chart).toEqual([{ slot: 'CB1', order: [3] }, { slot: 'QB', order: [1, 2] }]);
    expect(depthChart(cands, g, 0).find((r) => r.slot === 'QB')!.order).toEqual([2, 1]);
    const needs = needsList(chart, g, [{ slot: 'QB', role: 'qb', starter: 58, depth: 50, value: 3 }, { slot: 'CB1', role: 'cb', starter: 55, depth: 48, value: 1.5 }]);
    expect(needs.map((n) => [n.slot, n.what])).toEqual([['CB1', 'depth'], ['CB1', 'starter']]);
    expect(needs[0]!.shortBy).toBe(48);
  });
});
