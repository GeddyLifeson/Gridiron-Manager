// What a tier may change (X13.1.2, P6.4.1), under Marlon's ruling of 2026-11-25 23:40 UTC (A3.1.1 row 20):
// no lighter simulation anywhere. A tier chooses what is RECORDED and how a game is RUN (shown or
// headless, and in what order during a long advance). It never chooses how anything is resolved.
//
// The X13.1.2 table still thins some systems by tier (stress weekly, memory off, development at season
// points, injuries drawn from rates, calling from tendencies). Those cells change outcomes, so they are
// not built: every system below runs at one cadence at every tier. Sent to the bible fixes thread.
import type { PlayRecord, TrajectoryRef, WorldTier } from '@gm/schema';

export const TIERS: readonly WorldTier[] = [1, 2, 3];

/** The simulated systems of X13.1.2. Each runs the same way at every tier. */
export const SIM_SYSTEMS = ['games', 'needs', 'memory', 'edges', 'development', 'injuries', 'coaching', 'market'] as const;
export type SimSystem = (typeof SIM_SYSTEMS)[number];

const CADENCE: Readonly<Record<SimSystem, string>> = {
  games: 'full engine, every play (J14.1.2)',
  needs: 'on every relevant event (X5)',
  memory: 'full (X6)',
  edges: 'event by event (X7)',
  development: 'weekly (D7, D8)',
  injuries: 'from play (D11)',
  coaching: 'full planning and calling (K3 to K5)',
  market: 'full (K7, T4, M4)',
};

/** How a simulated system runs for a subject at `tier`. The tier is accepted and ignored: that is the rule. */
export function simCadence(system: SimSystem, _tier: WorldTier): string {
  return CADENCE[system];
}

/** What is kept and how a game is run at a tier. Recording and presentation only. */
export interface TierRecording {
  /** P6.4.1 detail of the play rows (A keeps trajectories, B does not; same engine and same rows). */
  readonly playTier: PlayRecord['fidelityTier'];
  /** P5.4.1: stored for film, or regenerable by re-simulating from the stored inputs. */
  readonly trajectories: TrajectoryRef['state'];
  /** P6.4.1 near and distant. Near games run on their usual schedule; distant games run headless at machine speed. */
  readonly near: boolean;
  /** During a long advance (O7.6.3) distant games are run first, so near games finish when the user looks. */
  readonly runFirstInLongAdvance: boolean;
  /** X2.2.2 rule 6: labels as events arrive, or on demand from the same log. Same labels either way. */
  readonly labels: 'as_events_arrive' | 'on_demand';
}

export const RECORDING: Readonly<Record<WorldTier, TierRecording>> = {
  1: { playTier: 'A', trajectories: 'stored', near: true, runFirstInLongAdvance: false, labels: 'as_events_arrive' },
  2: { playTier: 'B', trajectories: 'regenerable', near: true, runFirstInLongAdvance: false, labels: 'as_events_arrive' },
  3: { playTier: 'B', trajectories: 'regenerable', near: false, runFirstInLongAdvance: true, labels: 'on_demand' },
};

export function recordingFor(tier: WorldTier): TierRecording {
  return RECORDING[tier];
}

/** A game is as near as its nearer team (P6.4.1 "either team"). */
export function gameTier(homeTier: WorldTier, awayTier: WorldTier): WorldTier {
  return Math.min(homeTier, awayTier) as WorldTier;
}

/** Fails if any simulated system differs by tier, or if a tier keeps no way back to film (P6.4.1). */
export function policyProblems(cadence: (s: SimSystem, t: WorldTier) => string = simCadence, recording: Readonly<Record<WorldTier, TierRecording>> = RECORDING): string[] {
  const out: string[] = [];
  for (const s of SIM_SYSTEMS) {
    const seen = new Set(TIERS.map((t) => cadence(s, t)));
    if (seen.size !== 1) out.push(`system ${s} runs differently by tier (${[...seen].join(' | ')}): a tier may not change the simulation (A3.1.1 row 20)`);
  }
  for (const t of TIERS) {
    if (recording[t].trajectories === 'dropped') out.push(`tier ${t} drops trajectories for good: every game must be re-simulable to film (P6.4.1)`);
    if (recording[t].playTier === 'Bench') out.push(`tier ${t} uses the Bench detail: that is for the test bench, never a saved game (P6.4.1)`);
  }
  if (recording[1].playTier !== 'A') out.push('tier 1 must record at detail A: the user\'s games keep film (P6.4.1)');
  return out;
}

/**
 * The order to RUN a week's games in. Results are still applied in the fixed order of J14.2.1 (the
 * games step sorts by game id), so this order cannot change any result.
 */
export function executionOrder<G extends { readonly gameId: number }>(games: readonly G[], tierOf: (g: G) => WorldTier, longAdvance: boolean): G[] {
  const rank = (g: G): number => (longAdvance && recordingFor(tierOf(g)).runFirstInLongAdvance ? 0 : 1);
  return [...games].sort((a, b) => rank(a) - rank(b) || a.gameId - b.gameId);
}
