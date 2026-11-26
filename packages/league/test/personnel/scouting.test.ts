import { describe, expect, it } from 'vitest';
import {
  acceptChance, assignClubs, averageLookAgeDays, boardRow, buildReadyList, calibrateTierCuts, chanceGone, claimRisk, clubOrder, conductSection,
  contribution, medicalSection, narrowed, P, planWeek, poachRisk, practiceSquadTargets, proReport, removeSigned, reportStack, reviewWireItem,
  runWorkout, standingChange, tierCell, tierOf, voiceChance, workoutDay, workoutEvidence, workoutWillingness,
  type ReadyCandidate, type SquadPlayer, type WorkItem,
} from '../../src/personnel/index.ts';
import { CB_PROFILE, g } from './helpers.ts';

describe('M3.1.1 coverage plan and queue', () => {
  it('splits clubs among scouts and warns outside 4 to 6', () => {
    const clubs = Array.from({ length: 32 }, (_, i) => i + 1);
    const six = assignClubs(Array.from({ length: 6 }, (_, i) => ({ staffId: i + 1, hoursPerWeek: 40 })), clubs);
    expect(Object.values(six.assignments).flat().sort((a, b) => a - b)).toEqual(clubs);
    expect(six.warnings).toEqual([]);
    expect(assignClubs([{ staffId: 1, hoursPerWeek: 40 }], clubs).warnings).toHaveLength(1);
  });
  it('with one scout removed, looks on his clubs age', () => {
    const scout = { staffId: 1, hoursPerWeek: 30 };
    expect(averageLookAgeDays(scout, 7, 1100)).toBeGreaterThan(averageLookAgeDays(scout, 6, 1100));
  });
  it('a user request goes to the front and delays a visible scheduled item', () => {
    const items: WorkItem[] = [
      { id: 'r1', kind: 'review', target: 5, snaps: 400, dueDay: 10, addedDay: 0 },
      { id: 'a1', kind: 'advance', target: 6, snaps: 400, dueDay: 12, addedDay: 0 },
    ];
    const before = planWeek(items, 20);
    expect(before.slipped).toEqual([]);
    const after = planWeek([...items, { id: 'u1', kind: 'request', target: 99, snaps: 400, dueDay: 30, addedDay: 5 }], 20);
    expect(after.done[0]!.id).toBe('u1');
    expect(after.slipped.map((x) => x.id)).toEqual(['a1']);
  });
  it('the board reads estimates only: a hidden rating change with evidence frozen changes nothing', () => {
    const look = { grade: g(62), lastLookDay: 100, evaluatorId: 7 };
    const truth = { rating: 40 };
    const a = boardRow(1, look, g(55, 200), 120);
    truth.rating = 90;
    expect(boardRow(1, look, g(55, 200), 120)).toEqual(a);
    expect(a.source).toBe('club');
  });
  it('no recent club look shows the public estimate, marked, with a wide band', () => {
    const r = boardRow(1, { grade: g(62), lastLookDay: 0, evaluatorId: 7 }, g(55, 30), 400);
    expect(r.noClubLook).toBe(true);
    expect(r.grade.variance).toBeGreaterThanOrEqual(P.publicEstimateMinVariance);
  });
});

describe('M3.1.2 colour tiers', () => {
  it('a band across a cut point is hatched; a firm one is not', () => {
    expect(tierCell(g(56, 25), null).hatched).toBe(true);
    expect(tierCell(g(60, 1), null).hatched).toBe(false);
    expect(tierCell(g(60, 1), null).tier).toBe('red');
  });
  it('arrow by change against the band over 12 months', () => {
    expect(tierCell(g(60, 4), g(50, 4)).arrow).toBe('rising');
    expect(tierCell(g(60, 4), g(59, 4)).arrow).toBe('steady');
  });
  it('switching the view changes no stored data', () => {
    const est = Object.freeze(g(58, 16));
    tierCell(est, null);
    expect(est).toEqual(g(58, 16));
  });
  it('calibrated cuts give about the starting shares', () => {
    const means = Array.from({ length: 1000 }, (_, i) => i / 10);
    const cuts = calibrateTierCuts(means);
    const share = (t: string) => means.filter((m) => tierOf(m, cuts) === t).length / means.length;
    expect(share('blue')).toBeCloseTo(0.05, 2);
    expect(share('red')).toBeCloseTo(0.3, 2);
    expect(share('purple')).toBeCloseTo(0.4, 2);
  });
});

const cand = (personId: number, mean: number, over: Partial<ReadyCandidate> = {}): ReadyCandidate => ({
  personId, job: 'CB', grade: g(mean), age: 26, lastClubId: 3, availability: 'street', systemKnowledge: 1, weeksUnsigned: 0, extraJobs: 0, eligible: true, lastWorkoutDay: 10, ...over,
});

describe('M3.2.1 ready list', () => {
  it('never shows a player who may not sign', () => {
    const cols = buildReadyList({ pool: [cand(1, 60), cand(2, 70, { eligible: false })], jobs: ['CB'], quarterbackJobs: [], specialistJobs: [], today: 20 });
    expect(cols[0]!.names.map((n) => n.personId)).toEqual([1]);
    expect(cols[0]!.thinMarket).toBe(true);
  });
  it('a signing elsewhere removes the name from every club\'s list the same day', () => {
    const col = buildReadyList({ pool: [cand(1, 60), cand(2, 58), cand(3, 55)], jobs: ['CB'], quarterbackJobs: [], specialistJobs: [], today: 20 });
    const out = removeSigned({ '1': col, '2': col }, 2);
    for (const cols of Object.values(out)) expect(cols[0]!.names.map((n) => n.personId)).toEqual([1, 3]);
  });
  it('a quarterback column weights system knowledge double, and street conditioning decays', () => {
    const c = cand(1, 60, { systemKnowledge: 0 });
    expect(contribution(c, true)).toBeLessThan(contribution(c, false));
    expect(contribution(cand(1, 60, { weeksUnsigned: 5 }), false)).toBeLessThan(contribution(cand(1, 60), false));
  });
  it('a specialist column without fresh workouts is marked', () => {
    const col = buildReadyList({ pool: [cand(1, 60, { job: 'LS', lastWorkoutDay: 0 }), cand(2, 58, { job: 'LS', lastWorkoutDay: 0 })], jobs: ['LS'], quarterbackJobs: [], specialistJobs: ['LS'], today: 100 });
    expect(col[0]!.staleWorkouts).toBe(true);
  });
  it('the coach\'s order is the club\'s with roster say and a logged preference without it', () => {
    const col = buildReadyList({ pool: [cand(1, 60), cand(2, 58), cand(3, 55)], jobs: ['CB'], quarterbackJobs: [], specialistJobs: [], today: 20 })[0]!;
    const coach = { job: 'CB', order: [3, 1, 2], marks: [{ kind: 'strike' as const, personId: 2, reason: 'does not fit what we ask of this job' }] };
    expect(clubOrder(col, coach, true).club).toEqual([3, 1]);
    const noSay = clubOrder(col, coach, false);
    expect(noSay.club).toEqual([1, 2, 3]);
    expect(noSay.differ).toBe(true);
  });
});

describe('M3.3.1 workouts', () => {
  it('conditioning and speed bands narrow; in-pads traits barely move', () => {
    const ev = workoutEvidence(['movement', 'board']);
    const prior = g(55, 100);
    const ath = ev.find((e) => e.group === 'athletic')!, con = ev.find((e) => e.group === 'conditioning')!;
    expect(narrowed(prior, ath.noiseSd).variance).toBeLessThan(prior.variance / 4);
    expect(narrowed(prior, con.noiseSd).variance).toBeLessThan(prior.variance / 4);
    expect(ev.find((e) => e.group === 'in_pads')).toBeUndefined();
    expect(narrowed(prior, P.workoutInPadsNoiseSd).variance).toBeGreaterThan(prior.variance * 0.75);
  });
  it('appears on the wire the same day and charges the head coach\'s time', () => {
    const r = runWorkout({ day: 44, clubId: 1, players: [9, 8, 7], tests: ['movement'], attendee: { kind: 'head_coach' } });
    expect(r.wire.every((w) => w.dayIndex === 44)).toBe(true);
    expect(r.headCoachHours).toBe(1.5);
    expect(runWorkout({ day: 44, clubId: 1, players: [9], tests: [], attendee: { kind: 'position_coach', staffId: 3 } }).headCoachHours).toBe(0);
  });
  it('repeat workouts lower willingness; a short week moves the day', () => {
    expect(workoutWillingness(1)).toBe(1);
    expect(workoutWillingness(2)).toBeCloseTo(0.8);
    expect(workoutDay(100, 104, 102, 7)).toBe(101);
    expect(workoutDay(100, 107, 102, 7)).toBe(102);
  });
});

describe('M3.4.1 wire review', () => {
  const roster = [{ personId: 10, job: 'CB', grade: g(60), lock: true }, { personId: 11, job: 'CB', grade: g(42), lock: false }];
  it('no claim recommendation for a player the cap check rejects', () => {
    const r = reviewWireItem({ personId: 1, job: 'CB', grade: g(58), capCheck: { ok: false, reason: 'over the cap' }, injured: false }, roster, [], []);
    expect(r.recommendation).not.toBe('claim');
  });
  it('claims a player a tier-step better than the last at his position, naming who leaves', () => {
    const r = reviewWireItem({ personId: 1, job: 'CB', grade: g(58), capCheck: { ok: true, reason: '' }, injured: false }, roster, [], []);
    expect(r.recommendation).toBe('claim');
    expect(r.releaseToMakeRoom).toBe(11);
  });
  it('likely gone when clubs ahead are needy', () => {
    expect(chanceGone([{ clubId: 2, publicNeed: 1 }, { clubId: 3, publicNeed: 1 }])).toBeGreaterThan(P.likelyGoneChance);
  });
});

describe('M3.5.1 practice squad targets', () => {
  const sp = (personId: number, over: Partial<SquadPlayer> = {}): SquadPlayer => ({
    personId, clubId: 5, job: 'CB', grade: g(55), protectedThisWeek: false, nextOpponentRestricted: false, pathRank: 3, agentSaid: null, ...over,
  });
  it('no protected player and no next-opponent player is a target', () => {
    const t = practiceSquadTargets([sp(1), sp(2, { protectedThisWeek: true }), sp(3, { nextOpponentRestricted: true })], { CB: 50 }, 2, 3, 1);
    expect(t.map((x) => x.personId)).toEqual([1]);
    expect(t[0]!.read).toBe('likely');
    expect(t[0]!.cost.guaranteedWeeks).toBe(3);
  });
  it('acceptance rises with the role offered and falls with trust; high poach risk is signed away often', () => {
    expect(acceptChance(1, 4, 0)).toBeGreaterThan(acceptChance(3, 4, 0));
    expect(acceptChance(1, 4, 1)).toBeLessThan(acceptChance(1, 4, 0));
    const risk = poachRisk(g(70), 50, 10, 32);
    expect(risk.level).toBe('high');
    const r = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
    let taken = 0;
    for (let w = 0; w < 200; w++) if (r() < risk.score * acceptChance(1, 3, 0.2)) taken++;
    expect(taken).toBeGreaterThan(10);
  });
  it('claim risk rises with a strong preseason on film', () => {
    expect(claimRisk(g(60), 50, 8, 32, 1).score).toBeGreaterThan(claimRisk(g(60), 50, 8, 32, 0).score);
  });
});

describe('M3.6 reports and voice', () => {
  const role = { kind: 'backup' as const };
  it('every report shows grade, role, flags context, snaps, evaluator and date; limited look under 60 snaps', () => {
    const rep = proReport(1, { evaluatorId: 4, day: 30, grade: g(58), snapsWatched: 40, games: 2, traits: { speed: g(80), press: g(50), ball: g(76) }, film: ['p1'] }, CB_PROFILE, role);
    expect(rep.limitedLook).toBe(true);
    expect(rep.strengths).toEqual(['speed', 'ball']);
    expect(rep.weaknesses).toEqual(['press']);
    expect([rep.evaluatorId, rep.day, rep.snapsWatched]).toEqual([4, 30, 40]);
  });
  it('two scouts more than a tier apart are a split opinion', () => {
    const r = (ev: number, m: number) => proReport(1, { evaluatorId: ev, day: ev, grade: g(m), snapsWatched: 100, games: 3, traits: {}, film: [] }, CB_PROFILE, role);
    expect(reportStack([r(1, 68), r(2, 42)]).splitOpinion).toBe(true);
    expect(reportStack([r(1, 58), r(2, 52)]).splitOpinion).toBe(false);
  });
  it('with final say an insisted legal signing always happens; without it the rate rises with relationship', () => {
    const base = { finalSay: false, departmentAgrees: false, legal: true };
    expect(voiceChance('insist', { ...base, finalSay: true, relationship: 0 })).toBe(1);
    expect(voiceChance('insist', { ...base, relationship: 0.9 })).toBeGreaterThan(voiceChance('insist', { ...base, relationship: 0.1 }));
    expect(standingChange('insist', false, 'pending')).toBeLessThan(0);
    expect(standingChange('insist', false, 'worked')).toBeGreaterThan(-standingChange('insist', false, 'pending'));
  });
  it('no medical detail beyond public history before an examination; conduct lines name a source and carry no number', () => {
    const pub = [{ source: 'injury report', day: 1, text: 'hamstring', fromExam: false }];
    const exam = [{ source: 'club physician', day: 5, text: 'grade two strain healed', fromExam: true }];
    expect(medicalSection(pub, exam, false)).toHaveLength(1);
    expect(medicalSection(pub, exam, true)).toHaveLength(2);
    const c = conductSection([{ source: 'security', day: 2, text: 'public record clean' }, { source: '', day: 3, text: 'heard things' }, { source: 'former coach', day: 4, text: 'rated him 9 of 10' }]);
    expect(c.lines).toHaveLength(1);
    expect(c.refused).toHaveLength(2);
  });
});
