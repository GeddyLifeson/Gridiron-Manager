// C9.3.1 halls of fame and E5.6.3 the coach's case. One hall per level; a ring of honour uses the same
// mechanism with a local committee. The committee reads the record only (career rollups, coach totals,
// logged and detected discipline) and never a hidden rating. Imported real people are judged only on
// what they did in the world; their real careers are display only (X14) and carry no generated conduct
// penalty (E5.6.3 rule 7).
import type { DeterministicMath } from '@gm/schema';
import { HONOUR, honourDraft, type DraftMeta, type HonourDraft } from './events.ts';
import { KEY, flag, num, numOr, param, type RuleValues } from './params.ts';
import { COUNTER, type CareerRollup } from './rollup.ts';
import type { CoachTotals } from './records.ts';
import type { Origin, PersonId, Uniform } from './types.ts';

export type HallMath = Pick<DeterministicMath, 'exp'>;

export interface HallCandidate {
  readonly personId: PersonId;
  readonly kind: 'player' | 'coach';
  readonly origin: Origin;
  /** Last season played or coached. */
  readonly lastSeason: number;
  /** Still active (coaches may be eligible while active at the age rule). */
  readonly active: boolean;
  readonly age: number;
  readonly rollup: CareerRollup;
  /** Coaches only. */
  readonly coach?: CoachTotals;
  /** Former assistants who became head coaches (C9.4.1, E5.6.3). */
  readonly treeHeadCoaches?: number;
  /** Serious discipline findings detected and logged (C11, L8.2.5). Undetected acts leave no trace. */
  readonly conductFindings: number;
  /** Media regard, -1 to 1 (E5.6.3 rule 3). */
  readonly regard: number;
  /** Already elected: never a candidate again. */
  readonly elected?: boolean;
}

/** C9.3.1 rule 2 and the per-level rule keys. `ballotSeason` is the season just completed. */
export function isEligible(c: HallCandidate, ballotSeason: number, rules: RuleValues): boolean {
  if (c.elected) return false;
  const out = ballotSeason - c.lastSeason;
  if (c.kind === 'player') {
    if (c.active || out < num(rules, KEY.hallPlayerWait)) return false;
    const limit = numOr(rules, KEY.hallPlayerWindow, 0);
    if (limit > 0 && out > limit) return false;
    if (rules[KEY.hallFirstTeam] !== undefined && flag(rules, KEY.hallFirstTeam) && (c.rollup.honourCounters[COUNTER.allLeagueFirst] ?? 0) < 1) return false;
    return true;
  }
  const t = c.coach;
  if (!t) return false;
  if (t.games < numOr(rules, KEY.hallCoachMinGames, 0) || t.winShare < numOr(rules, KEY.hallCoachMinPct, 0)) return false;
  const atOnce = numOr(rules, KEY.hallCoachAgeAtOnce, 0);
  const activeAge = numOr(rules, KEY.hallCoachAgeActive, 0);
  if (c.active) return activeAge > 0 && c.age >= activeAge;
  if (atOnce > 0 && c.age >= atOnce) return true;
  return out >= num(rules, KEY.hallCoachWait);
}

/** E5.6.3 rule 2 (coaches) and the C9.3.1 player case. Conduct penalty is zero for imported people. */
export function caseScore(c: HallCandidate): number {
  const conduct = c.origin === 'imported' ? 0 : c.conductFindings * param('hall.case.conductFinding');
  const h = c.rollup.honourCounters;
  if (c.kind === 'coach' && c.coach) {
    const t = c.coach;
    return t.titles * param('hall.case.title') + t.wins / param('hall.case.winsDivisor') + t.postseasonWins * param('hall.case.playoffWin')
      + (t.winShare - param('hall.case.winShareBaseline')) * param('hall.case.winShare') + (c.treeHeadCoaches ?? 0) * param('hall.case.treeHeadCoach') - conduct;
  }
  return (h[COUNTER.allLeagueFirst] ?? 0) * param('hall.case.allLeagueFirst') + (h[COUNTER.allLeagueSecond] ?? 0) * param('hall.case.allLeagueSecond')
    + (h[COUNTER.allStar] ?? 0) * param('hall.case.allStar') + (h[COUNTER.majorAward] ?? 0) * param('hall.case.majorAward')
    + (h[COUNTER.title] ?? 0) * param('hall.case.playerTitle') + c.rollup.seasons * param('hall.case.season') - conduct;
}

function normalish(rng: Uniform): number {
  return rng.next() + rng.next() + rng.next() - rng.next() - rng.next() - rng.next();
}

/** One voter's yes probability (E5.6.3 rule 3): logistic of the case, shifted by regard, with voter noise. */
export function yesProbability(score: number, regard: number, math: HallMath, voterNoise = 0): number {
  const z = (score - param('hall.logistic.center') + regard * param('hall.logistic.regard')) / param('hall.logistic.scale') + voterNoise;
  return 1 / (1 + math.exp(-z));
}

export interface BallotResult { readonly personId: PersonId; readonly caseScore: number; readonly yes: number; readonly voters: number; readonly yesShare: number; readonly elected: boolean }
export interface HallClass {
  readonly ballotSeason: number;
  readonly eligible: readonly PersonId[];
  readonly finalists: readonly BallotResult[];
  readonly elected: readonly PersonId[];
  /** True when fewer than the class minimum reached the share and the top finalists filled the floor (bylaws). */
  readonly filledToMinimum: boolean;
}

/**
 * One year's election. Finalists are the eligible candidates by case score, cut to
 * `hall.candidates_per_year` where the rule exists. Each committee member votes yes or no; election needs
 * the share. The class is held inside `hall.class_min` and `hall.class_max` (C9.3.1 acceptance).
 */
export function runElection(cands: readonly HallCandidate[], ballotSeason: number, rules: RuleValues, rng: Uniform, math: HallMath): HallClass {
  const voters = num(rules, KEY.hallCommittee);
  const share = num(rules, KEY.hallVoteShare);
  const min = numOr(rules, KEY.hallClassMin, 0);
  const max = num(rules, KEY.hallClassMax);
  const eligible = cands.filter((c) => isEligible(c, ballotSeason, rules))
    .map((c) => ({ c, s: caseScore(c) })).sort((a, b) => b.s - a.s || a.c.personId - b.c.personId);
  const cut = rules[KEY.hallCandidates] === undefined ? eligible.length : num(rules, KEY.hallCandidates);
  const noise = param('hall.voterNoise');
  const results = eligible.slice(0, cut).map(({ c, s }) => {
    let yes = 0;
    for (let v = 0; v < voters; v++) if (rng.next() < yesProbability(s, c.regard, math, noise * normalish(rng))) yes += 1;
    return { personId: c.personId, caseScore: s, yes, voters, yesShare: yes / voters, elected: false };
  });
  const byYes = [...results].sort((a, b) => b.yesShare - a.yesShare || b.caseScore - a.caseScore || a.personId - b.personId);
  let chosen = byYes.filter((r) => r.yesShare >= share).slice(0, max);
  let filled = false;
  if (chosen.length < min) { chosen = byYes.slice(0, Math.min(min, byYes.length)); filled = true; }
  const ids = new Set(chosen.map((r) => r.personId));
  return {
    ballotSeason, eligible: eligible.map((e) => e.c.personId),
    finalists: results.map((r) => ({ ...r, elected: ids.has(r.personId) })),
    elected: [...ids].sort((a, b) => a - b), filledToMinimum: filled,
  };
}

export function hallDrafts(hall: string, cls: HallClass, meta: Omit<DraftMeta, 'teamId'>): HonourDraft[] {
  const out: HonourDraft[] = [];
  const m = { ...meta, teamId: null };
  for (const r of cls.finalists) {
    out.push(honourDraft(HONOUR.finalist, m, r.personId, 'candidate', { hall, caseScore: Math.round(r.caseScore) }));
    out.push(honourDraft(r.elected ? HONOUR.elected : HONOUR.passedOver, m, r.personId, 'candidate', { hall, yesShare: r.yesShare, ballot: cls.ballotSeason }));
  }
  return out;
}

export type Outlook = 'no_case' | 'borderline' | 'strong' | 'near_certain';

/** E5.6.3 rule 6: chance of election within the outlook's ballots, by Monte Carlo over voter noise. */
export function electionChance(c: HallCandidate, rules: RuleValues, rng: Uniform, math: HallMath): number {
  const voters = num(rules, KEY.hallCommittee);
  const share = num(rules, KEY.hallVoteShare);
  const ballots = param('hall.outlook.ballots');
  const trials = param('hall.outlook.trials');
  const s = caseScore(c);
  const noise = param('hall.voterNoise');
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    for (let b = 0; b < ballots; b++) {
      let yes = 0;
      for (let v = 0; v < voters; v++) if (rng.next() < yesProbability(s, c.regard, math, noise * normalish(rng))) yes += 1;
      if (yes / voters >= share) { wins += 1; break; }
    }
  }
  return wins / trials;
}

export function outlookOf(p: number): Outlook {
  if (p > param('hall.outlook.nearCertain')) return 'near_certain';
  if (p >= param('hall.outlook.strong')) return 'strong';
  if (p >= param('hall.outlook.borderline')) return 'borderline';
  return 'no_case';
}
