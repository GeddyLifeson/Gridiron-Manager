// A synthetic league for the calibration and long-run tests (E4.3.1 acceptance 1, E4.7.2 acceptance 2,
// K8.1.1 and K8.4.1 acceptance). Test scaffolding only: team strength, schedules and the public estimate
// are made-up stand-ins for the engine, the schedule (G-13) and N2.6.1. No coach has any effect on results
// here, which is what lets the no-bounce test see whether this module adds one.
import type { RandomStream } from '@gm/schema';
import {
  deciderModel, firingCost, needsEmergencyReview, review, situationAtHiring, startConfidence, updateConfidence,
  type ConfidenceState, type DecisionMakerProfile, type Result, type Situation,
} from '../../src/stakeholders/index.ts';
import { dm as baseDm, rng, week, winChance } from './fixtures.ts';

export interface SimOptions {
  readonly seed: number;
  readonly teams: number;
  readonly games: number;
  readonly seasons: number;
  readonly model: string;
  /** Override the decider for team i (default: a middle-of-the-road decider with spread patience). */
  readonly decider?: (i: number, r: RandomStream) => DecisionMakerProfile;
  /** Share of the season the top teams reach the postseason. */
  readonly postseasonShare: number;
  /** Win share that usually reaches the postseason: a team that can still reach it is alive (E4.3.3 edge case). */
  readonly postseasonWinShare: number;
  readonly contractYears: number;
  /** Annual salary over revenue share: the money brake's scale. */
  readonly salaryOverRevenue: number;
  /** Weeks without a game between the main review and the next season. */
  readonly offseasonWeeks: number;
  /** Override the decider model's fitted hazard scale (used only by the fitting probe). */
  readonly hazardScale?: number;
}

export interface TeamSeason {
  readonly team: number;
  readonly season: number;
  readonly winShare: number;
  readonly fired: boolean;
  readonly yearOnJob: number;
  readonly coachId: number;
  /** The public preseason strength estimate (points) the season was played under. */
  readonly publicEstimate: number;
}

export interface SimResult {
  readonly firingsPerSeason: number[];
  readonly inSeasonPerSeason: number[];
  readonly rows: TeamSeason[];
  readonly tenures: number[];
}

interface Team {
  strength: number;
  est: number;
  lastWinShare: number | null;
  yearsSincePost: number;
  coachId: number;
  conf: ConfidenceState;
  year: number;
  yearsLeft: number;
  dead: number;
  lowStreak: number;
  situation: Situation;
  expectedShareAtHire: number;
  dm: DecisionMakerProfile;
  hiredAt: number;
  gmHired: boolean;
}

export function simulate(o: SimOptions): SimResult {
  const r = rng(o.seed, 'league');
  const draws = rng(o.seed, 'reviews');
  const model = { ...deciderModel(o.model), ...(o.hazardScale === undefined ? {} : { hazardScale: o.hazardScale }) };
  let nextCoach = 1;
  const teams: Team[] = [];
  for (let i = 0; i < o.teams; i++) {
    const d = o.decider ? o.decider(i, r) : baseDm({ personId: i + 1, teamId: i + 1, deciderModel: o.model, patience: r.uniform(), volatility: 0.7 + 0.7 * r.uniform(), moneySensitivity: r.uniform() });
    const strength = 5.5 * r.normal();
    teams.push({
      strength, est: strength + 2 * r.normal(), lastWinShare: null, yearsSincePost: 0, coachId: nextCoach++,
      conf: startConfidence(0, 'head_coach', 'hired'), year: 1, yearsLeft: o.contractYears, dead: 0, lowStreak: 0,
      situation: 'steady', expectedShareAtHire: 0.5, dm: d, hiredAt: 0, gmHired: r.chance(0.7),
    });
  }
  const firingsPerSeason: number[] = [];
  const inSeasonPerSeason: number[] = [];
  const rows: TeamSeason[] = [];
  const tenures: number[] = [];
  const fire = (t: Team, season: number) => {
    tenures.push(season - t.hiredAt + 1);
    t.dead += t.yearsLeft;
    t.coachId = nextCoach++;
    t.conf = startConfidence(t.coachId, 'head_coach', 'hired');
    t.year = 1;
    t.yearsLeft = o.contractYears;
    t.lowStreak = 0;
    t.hiredAt = season + 1;
    t.gmHired = true;
    const expShare = winChance(t.est * 2);
    t.expectedShareAtHire = expShare;
    t.situation = situationAtHiring(expShare, false, false, false);
  };
  for (let season = 0; season < o.seasons; season++) {
    let fired = 0;
    let inSeasonFired = 0;
    const shares: number[] = [];
    const firedThis = new Set<number>();
    for (const t of teams) {
      const recent: Result[] = [];
      let kept = false;
      let wins = 0;
      let pd = 0;
      let expectedWins = 0;
      const quarter = Math.max(1, Math.round(o.games / 4));
      for (let g = 0; g < o.games; g++) {
        const opp = teams[r.int(0, teams.length - 1)]!;
        const gap = t.strength - opp.strength;
        const margin = Math.round(gap + 13 * r.normal());
        const result: Result = margin > 0 ? 'W' : 'L';
        const pPublic = winChance(t.est - opp.est);
        expectedWins += pPublic;
        if (result === 'W') wins++;
        pd += margin;
        const qp = (g + 1) % quarter === 0 ? { winShareSoFar: wins / (g + 1), expectedWinShare: expectedWins / (g + 1) } : null;
        const u = updateConfidence(t.conf, t.dm, model, week({
          weekId: `${season}:${g}`, games: [{ reading: { gameId: g, result, pPublic, margin, stage: 'regular', rivalry: false, starterQbOutPublicEarly: false, injuryAllowance: false, decisions: [] }, recent: [...recent] }], quarterPoint: qp,
        }));
        t.conf = u.state;
        recent.push(result);
        if (!firedThis.has(t.coachId) && g < o.games - 1 && needsEmergencyReview(t.conf.value)) {
          const out = review(t.dm, model, { ...reviewInputs(t, o, 'emergency'), inSeason: { gamesPlayed: g + 1, gamesInSeason: o.games, gamesOnJob: t.conf.gamesOnJob, interimWithHeadCoachExperience: false, aliveForPostseason: wins + (o.games - g - 1) >= Math.ceil(o.games * o.postseasonWinShare), keptAtEmergencyThisSeason: kept } }, draws);
          if (out.outcome !== 'fire') kept = true;
          if (out.outcome === 'fire') { fired++; inSeasonFired++; firedThis.add(t.coachId); rows.push({ team: teams.indexOf(t), season, winShare: wins / (g + 1), fired: true, yearOnJob: t.year, coachId: t.coachId, publicEstimate: t.est }); fire(t, season); }
        }
      }
      shares.push(wins / o.games);
      (t as Team & { _pd: number; _wins: number })._pd = pd;
      (t as Team & { _wins: number })._wins = wins;
    }
    const cut = [...shares].sort((a, b) => b - a)[Math.max(0, Math.round(o.teams * o.postseasonShare) - 1)]!;
    teams.forEach((t, i) => {
      const ws = shares[i]!;
      const qualified = ws >= cut;
      t.yearsSincePost = qualified ? 0 : t.yearsSincePost + 1;
      const u = updateConfidence(t.conf, t.dm, model, week({
        weekId: `${season}:end`,
        seasonEnd: { winShare: ws, lastWinShare: t.lastWinShare, qualified, postseasonWins: 0, title: false, firstGameLossAsHigherSeed: false, yearsSincePostseason: t.yearsSincePost, legacy: false, decisionRatingVsLeague: 0 },
      }));
      t.conf = u.state;
      t.lowStreak = t.conf.value < 50 ? t.lowStreak + 1 : 0;
      let wasFired = false;
      if (!firedThis.has(t.coachId)) {
        const out = review(t.dm, model, reviewInputs(t, o, 'main'), draws);
        if (out.outcome === 'fire') { fired++; wasFired = true; }
      }
      rows.push({ team: i, season, winShare: ws, fired: wasFired, yearOnJob: t.year, coachId: t.coachId, publicEstimate: t.est });
      t.lastWinShare = ws;
      t.dead = Math.max(0, t.dead - 1);
      if (wasFired) fire(t, season);
      else { t.year++; t.yearsLeft = Math.max(0, t.yearsLeft - 1); if (t.yearsLeft === 0) t.yearsLeft = 3; }
      // Offseason weeks without a game drift toward 55 (E4.2.1 rule 4).
      for (let wk = 0; wk < o.offseasonWeeks; wk++) t.conf = updateConfidence(t.conf, t.dm, model, week({ weekId: `${season}:off:${wk}` })).state;
      t.strength = 0.65 * t.strength + 4.2 * r.normal();
      // The public's preseason estimate: close to the truth, with noise (stand-in for N2.6.1 and markets).
      t.est = t.strength + 2 * r.normal();
    });
    firingsPerSeason.push(fired);
    inSeasonPerSeason.push(inSeasonFired);
  }
  return { firingsPerSeason, inSeasonPerSeason, rows, tenures };
}

function reviewInputs(t: Team, o: SimOptions, kind: 'main' | 'emergency') {
  const money = {
    remainingGuaranteeCents: t.yearsLeft * 100, assistantsGuaranteeCents: 0, expectedToWorkAgain: true,
    deadMoneyOwedCents: t.dead * 100, revenueShareCents: Math.round(100 / o.salaryOverRevenue), boosterFundingCents: 0, forCause: false,
  };
  firingCost(money);
  return {
    kind, confidence: t.conf.value, yearOnJob: t.year, lowStreak: t.lowStreak >= 2, gmHiredCoach: t.gmHired,
    situation: { situation: t.situation, yearOnJob: t.year, expectationRising: true, qbEstimateFalling: false },
    money, announcedRetirement: false, underConductInvestigation: false, presidentForces: false, presidentVetoes: false, inSeason: null,
  } as const;
}

export const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
