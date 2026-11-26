// The checks that read scripted runs: S10.3.1 climb targets, the G-89 replay acceptance, and the
// Q4.3.1 career loop search with its 25% margin over 30 seasons.
import { seedFromNumber } from '@gm/engine-core';
import { param } from './params.ts';
import { runCareer, type RunOptions } from './run.ts';
import { averageWork, jobHopper, perfectWork, recruitFlipper, staffRaider, tanker, tuningScript } from './scripts.ts';
import type { CareerPolicy, CareerRun, CareerScript, Level } from './types.ts';

export const seedsOf = (n: number, from = 1) => Array.from({ length: n }, (_, i) => seedFromNumber(from + i));

/** First season (1-based game year) at or above `rung`, optionally at a level; null if never. */
export function yearReached(run: CareerRun, rung: number, level?: Level): number | null {
  const r = run.rows.find((x) => x.employed && x.rung >= rung && (level === undefined || x.level === level));
  return r ? r.season + 1 : null;
}

export interface ReplayCheck { readonly scriptId: string; readonly hash: string; readonly identical: boolean }

/** G-89 acceptance: the same script and seed replay to the same hash. */
export function replayCheck(script: CareerScript, seed: number, opts: RunOptions = {}): ReplayCheck {
  const a = runCareer(script, seedFromNumber(seed), opts);
  const b = runCareer(script, seedFromNumber(seed), opts);
  return { scriptId: script.id, hash: a.hash, identical: a.hash === b.hash && a.rows.length === b.rows.length };
}

export interface ClimbCheck {
  readonly seeds: number;
  readonly perfectInWindow: number;
  readonly perfectYears: readonly (number | null)[];
  readonly averageReached9: number;
  readonly perfectOk: boolean;
  readonly averageOk: boolean;
}

/**
 * S10.3.1 acceptance: scripted perfect-work careers reach rung 7 in 8 to 14 game years across seeds;
 * scripted average-work careers usually do not reach rung 9.
 */
export function climbCheck(seeds: number, opts: RunOptions = {}): ClimbCheck {
  const lo = param('careerRun.target.coordinatorYearsMin'), hi = param('careerRun.target.coordinatorYearsMax');
  const rung = param('careerRun.target.coordinatorRung');
  const years: (number | null)[] = [];
  let reached9 = 0;
  for (const seed of seedsOf(seeds)) {
    years.push(yearReached(runCareer(tuningScript(perfectWork()), seed, opts), rung));
    if (yearReached(runCareer(tuningScript(averageWork()), seed, opts), 9) !== null) reached9++;
  }
  const inWindow = years.filter((y) => y !== null && y >= lo && y <= hi).length;
  return {
    seeds, perfectInWindow: inWindow, perfectYears: years, averageReached9: reached9,
    perfectOk: inWindow / seeds >= param('careerRun.target.perfectShare'),
    averageOk: reached9 / seeds < param('careerRun.target.averageRung9Max'),
  };
}

// ---------- Q4.3.1 career loop search ----------

export interface LoopDef { readonly id: string; readonly policy: () => CareerPolicy }

/** Loops a headless run can try today. */
export const LOOPS: readonly LoopDef[] = [
  { id: 'job_hopping', policy: jobHopper },
  { id: 'tanking', policy: tanker },
  { id: 'staff_raids', policy: staffRaider },
  { id: 'recruiting_flips', policy: recruitFlipper },
];

/** Q4.3.1 loops that need systems not yet wired headless: listed, never silently passed (like Q4.3.2 "pending"). */
export const PENDING_LOOPS: readonly { readonly id: string; readonly needs: string }[] = [
  { id: 'contract_traps', needs: 'E3 contract talks with the G-76 front office AI deciding (offers an AI accepts that no real agent or GM would)' },
  { id: 'draft_trade_input', needs: 'G-76 front office AI taking the coach\'s draft and trade recommendations' },
  { id: 'money', needs: 'E6 personal wealth actions in the world loop (G-81)' },
];

export interface LoopResult {
  readonly id: string;
  readonly meanYield: number;
  /** Yield over the standard AI coach's yield, minus 1. */
  readonly edge: number;
  /** Same loop with no AI memory of the logged history (ablation). */
  readonly edgeWithoutMemory: number;
  /** The world changed its answer: memory moved the yield by more than the response floor. */
  readonly worldResponds: boolean;
  /** Q4.3.1 acceptance breach: edge above the margin. */
  readonly exploit: boolean;
}

export interface LoopSearch {
  readonly seasons: number;
  readonly seeds: number;
  readonly honestMeanYield: number;
  readonly loops: readonly LoopResult[];
  readonly pending: typeof PENDING_LOOPS;
  readonly pass: boolean;
}

const meanYield = (policy: () => CareerPolicy, seeds: number, seasons: number, memory: boolean): number => {
  let sum = 0;
  for (const seed of seedsOf(seeds)) sum += runCareer(tuningScript(policy(), seasons), seed, { memory }).yield;
  return sum / seeds;
};

/** Q4.3.1: greedy agents run long careers trying each loop, against the standard AI coach (average work, honest). */
export function careerLoopSearch(seeds: number, seasons = param('careerRun.loop.seasons')): LoopSearch {
  const honest = meanYield(() => averageWork(), seeds, seasons, true);
  const honestNoMem = meanYield(() => averageWork(), seeds, seasons, false);
  const margin = param('careerRun.loop.margin');
  const loops = LOOPS.map((l): LoopResult => {
    const y = meanYield(l.policy, seeds, seasons, true);
    const yOff = meanYield(l.policy, seeds, seasons, false);
    const edge = honest > 0 ? y / honest - 1 : 0;
    const edgeOff = honestNoMem > 0 ? yOff / honestNoMem - 1 : 0;
    return {
      id: l.id, meanYield: Math.round(y), edge: Math.round(edge * 1000) / 1000, edgeWithoutMemory: Math.round(edgeOff * 1000) / 1000,
      worldResponds: Math.abs(edgeOff - edge) > param('careerRun.loop.responseFloor'), exploit: edge > margin,
    };
  });
  return { seasons, seeds, honestMeanYield: Math.round(honest), loops, pending: PENDING_LOOPS, pass: loops.every((l) => !l.exploit) };
}

/** Plain report, deterministic, for test-results and the release gate. */
export function formatLoopSearch(r: LoopSearch): string {
  const lines = [
    `Career loop search (Q4.3.1): ${r.seeds} seeds x ${r.seasons} seasons. Standard AI coach yield ${r.honestMeanYield}. Margin ${param('careerRun.loop.margin') * 100}%.`,
    ...r.loops.map((l) => `  ${l.id}: yield ${l.meanYield}, edge ${(l.edge * 100).toFixed(1)}% (without AI memory ${(l.edgeWithoutMemory * 100).toFixed(1)}%), world ${l.worldResponds ? 'responds' : 'does NOT respond'}: ${l.exploit ? 'EXPLOIT' : 'ok'}`),
    ...r.pending.map((p) => `  ${p.id}: pending, needs ${p.needs}`),
    `Result: ${r.pass ? 'pass' : 'FAIL'} (pending loops fail no build).`,
  ];
  return lines.join('\n');
}
