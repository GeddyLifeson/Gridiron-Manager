// Clinching and elimination (C3.3.2) and playoff odds (C3.3.3).
// Clinching never guesses: a flag is set only when every completion of the season agrees. When the
// remaining games are few enough, every win, loss and tie outcome is enumerated (within the node
// budget). Otherwise a percentage bound is used, which is weaker but never wrong. A scenario whose
// seeding leaned on a points step or coin toss (made-up scores) counts as "could go either way" for
// every club.
import { KEY, num, param } from './params.ts';
import { Ledger, pctOf, add } from './records.ts';
import { seasonTable } from './seeding.ts';
import type { ClubPlace, GameResult, RuleValues, TeamId, TieDraw, WLT } from './types.ts';

/** A regular-season game not yet played. */
export interface RemainingGame {
  readonly gameId: number;
  readonly week: number;
  readonly teams: readonly [TeamId, TeamId];
  readonly neutralSite: boolean;
}

export interface ClinchStatus {
  readonly teamId: TeamId;
  readonly clinchedPlayoffs: boolean;
  readonly clinchedDivision: boolean;
  /** Seed 1 and the bye (C3.4.2). */
  readonly clinchedTopSeed: boolean;
  readonly eliminated: boolean;
  /** How the flags were proven. */
  readonly method: 'complete' | 'enumerated' | 'bounded';
}

type Outcome = 'W' | 'L' | 'T';
const OUTCOMES: readonly Outcome[] = ['W', 'L', 'T'];

/** A made-up result: side 0 wins, loses or ties. Points are placeholders (hypothetical). */
export function hypotheticalResult(g: RemainingGame, o: Outcome): GameResult {
  const pts: [number, number] = o === 'W' ? [1, 0] : o === 'L' ? [0, 1] : [0, 0];
  return { gameId: g.gameId, week: g.week, phase: 'regular', teams: g.teams, points: pts, touchdowns: [0, 0], overtime: false, forfeit: false, neutralSite: g.neutralSite, hypothetical: true };
}

interface Tally { seededEver: boolean; seededAlways: boolean; divisionAlways: boolean; topAlways: boolean }

/** Clinch and elimination flags for every club (C3.3.2). `allowTies` false for a level whose games cannot end tied. */
export function clinchStatus(
  places: readonly ClubPlace[], results: readonly GameResult[], remaining: readonly RemainingGame[],
  rules: RuleValues, draw: TieDraw, opts: { allowTies: boolean; nodeBudget?: number },
): ClinchStatus[] {
  const outcomes = opts.allowTies ? OUTCOMES : OUTCOMES.slice(0, OUTCOMES.length - 1);
  const budget = opts.nodeBudget ?? param('standings.clinch.nodeBudget');
  let leaves = 1;
  for (let i = 0; i < remaining.length && leaves <= budget; i++) leaves *= outcomes.length;
  if (leaves > budget) return boundedStatus(places, results, remaining, rules);

  const tally = new Map<TeamId, Tally>(places.map((p) => [p.id, { seededEver: false, seededAlways: true, divisionAlways: true, topAlways: true }]));
  const made: GameResult[] = [];
  const visit = (i: number): void => {
    if (i === remaining.length) {
      const table = seasonTable(places, [...results, ...made], rules, draw);
      for (const p of places) {
        const t = tally.get(p.id)!;
        const conf = table.conferences.find((c) => c.conferenceId === p.conferenceId)!;
        const seed = conf.seeds.indexOf(p.id);
        if (table.uncertain) { t.seededEver = true; t.seededAlways = false; t.divisionAlways = false; t.topAlways = false; continue; }
        if (seed >= 0) t.seededEver = true; else t.seededAlways = false;
        if (!conf.divisionWinners.includes(p.id)) t.divisionAlways = false;
        if (seed !== 0) t.topAlways = false;
      }
      return;
    }
    for (const o of outcomes) { made.push(hypotheticalResult(remaining[i]!, o)); visit(i + 1); made.pop(); }
  };
  visit(0);
  const method = remaining.length === 0 ? 'complete' : 'enumerated';
  return places.map((p) => {
    const t = tally.get(p.id)!;
    return { teamId: p.id, clinchedPlayoffs: t.seededAlways, clinchedDivision: t.divisionAlways, clinchedTopSeed: t.topAlways, eliminated: !t.seededEver, method };
  });
}

/**
 * Percentage bounds (C3.3.2 rule 2). Every club's best case wins out and worst case loses out. A tie in
 * percentage counts as a threat, so the bound never claims more than is certain.
 */
function boundedStatus(places: readonly ClubPlace[], results: readonly GameResult[], remaining: readonly RemainingGame[], rules: RuleValues): ClinchStatus[] {
  const ledger = new Ledger(places, results, rules);
  const left = new Map<TeamId, number>(places.map((p) => [p.id, 0]));
  for (const g of remaining) for (const id of g.teams) if (left.has(id)) left.set(id, left.get(id)! + 1);
  const extend = (r: WLT, n: number, res: 'W' | 'L'): WLT => { let x = r; for (let i = 0; i < n; i++) x = add(x, res); return x; };
  const best = new Map<TeamId, number>(), worst = new Map<TeamId, number>();
  for (const p of places) {
    const r = ledger.record(p.id);
    best.set(p.id, pctOf(extend(r, left.get(p.id)!, 'W'), ledger.tieWinValue));
    worst.set(p.id, pctOf(extend(r, left.get(p.id)!, 'L'), ledger.tieWinValue));
  }
  const fieldSize = num(rules, KEY.clubsPerConference);
  return places.map((p) => {
    const conf = places.filter((q) => q.conferenceId === p.conferenceId && q.id !== p.id);
    const divisions = new Set(places.filter((q) => q.conferenceId === p.conferenceId).map((q) => q.divisionId)).size;
    const wildCards = Math.max(0, fieldSize - divisions);
    const rivals = conf.filter((q) => q.divisionId === p.divisionId);
    const w = worst.get(p.id)!, b = best.get(p.id)!;
    const clinchedDivision = rivals.every((q) => best.get(q.id)! < w);
    const threats = conf.filter((q) => best.get(q.id)! >= w).length;
    const clinchedPlayoffs = clinchedDivision || threats < wildCards;
    const clinchedTopSeed = conf.every((q) => best.get(q.id)! < w);
    const canWinDivision = rivals.every((q) => worst.get(q.id)! <= b);
    const above = conf.filter((q) => worst.get(q.id)! > b);
    const nonWinnersAbove = above.length - new Set(above.map((q) => q.divisionId)).size;
    const eliminated = !canWinDivision && nonWinnersAbove >= wildCards;
    return { teamId: p.id, clinchedPlayoffs, clinchedDivision, clinchedTopSeed, eliminated, method: 'bounded' as const };
  });
}

/** Uniform draws in [0, 1), backed by a J13 stream supplied by the caller (league may not import engine-core). */
export interface Uniform { next(): number }

/** The simple game model of C3.3.3: probability the first-listed team wins, and of a tie. Not the full engine. */
export interface WinModel {
  winProbability(first: TeamId, second: TeamId, neutralSite: boolean): number;
  tieProbability(first: TeamId, second: TeamId): number;
}

export interface PlayoffOdds { readonly teamId: TeamId; readonly playoffs: number; readonly division: number; readonly topSeed: number }

/**
 * Playoff odds (C3.3.3): simulate the rest of the season `simulations` times with the simple model,
 * seed each finish (C3.3.1), and count. Placeholder scores decide points steps arbitrarily; odds are an
 * estimate, shown as one. Odds of exactly 0 or 1 should be shown only where clinchStatus agrees.
 */
export function playoffOdds(
  places: readonly ClubPlace[], results: readonly GameResult[], remaining: readonly RemainingGame[],
  rules: RuleValues, model: WinModel, rng: Uniform, draw: TieDraw, simulations: number = param('standings.odds.simulations'),
): PlayoffOdds[] {
  const count = new Map<TeamId, { p: number; d: number; s: number }>(places.map((p) => [p.id, { p: 0, d: 0, s: 0 }]));
  for (let n = 0; n < simulations; n++) {
    const made = remaining.map((g) => {
      const u = rng.next();
      const win = model.winProbability(g.teams[0], g.teams[1], g.neutralSite);
      const tie = model.tieProbability(g.teams[0], g.teams[1]);
      return hypotheticalResult(g, u < win ? 'W' : u < win + tie ? 'T' : 'L');
    });
    const table = seasonTable(places, [...results, ...made], rules, draw);
    for (const c of table.conferences) {
      c.seeds.forEach((id, i) => { const k = count.get(id)!; k.p++; if (i === 0) k.s++; });
      for (const id of c.divisionWinners) count.get(id)!.d++;
    }
  }
  return places.map((p) => { const k = count.get(p.id)!; return { teamId: p.id, playoffs: k.p / simulations, division: k.d / simulations, topSeed: k.s / simulations }; });
}

