// Special teams and possession plan (G6.5.1) and contingency plans (G6.5.2).
//
// Tempo tool: expected drives per team at a pace. Starting point: the reference table's drives per team game
// (10.8 in the 2024 NFL play-by-play, reference.ts, PROVISIONAL) at the engine's own league-average seconds
// per snap. Time is shared, so drives scale with the inverse of the two teams' summed seconds per snap. No
// variance bonus exists: fewer possessions help the weaker team only through the engine.
import { param } from './params.ts';
import type { MenuEntry, PlanWarning, Side } from './plan.ts';

export type Pace = 'fastest' | 'fast' | 'normal' | 'slow' | 'slowest';

/** Expected drives per team given each team's average seconds per snap (the engine's numbers, passed in). */
export function expectedDrives(ownSecondsPerSnap: number, oppSecondsPerSnap: number, leagueSecondsPerSnap: number, leagueDrivesPerGame: number): number {
  const sum = ownSecondsPerSnap + oppSecondsPerSnap;
  return sum <= 0 ? 0 : (leagueDrivesPerGame * 2 * leagueSecondsPerSnap) / sum;
}

export interface UnitPlan { readonly unit: string; readonly threat: string; readonly answer: string; readonly practiceDay: number | null }
export interface SpecialTeamsPlan {
  readonly units: readonly UnitPlan[];
  readonly kickAwayFrom: string | null;
  readonly blockOpenings: readonly { readonly text: string; readonly refs: readonly string[] }[];
  readonly fakes: readonly { readonly entryId: string; readonly requiredLook: string }[];
  readonly kickoffPlacement: string;
}
export interface PossessionPlan {
  readonly pace: Pace;
  readonly shortenGame: boolean;
  /** Fourth-down attitude for the day, -2 (cautious) to +2 (aggressive); feeds the head coach card. */
  readonly fourthDownAttitude: number;
}

export function checkSpecialTeams(p: SpecialTeamsPlan): PlanWarning[] {
  const w: PlanWarning[] = [];
  for (const u of p.units) if (u.practiceDay === null) w.push({ leaf: 'G6.5.1', code: 'st.no_day', subject: u.unit, text: `${u.unit} has no practice day`, severity: 'note' });
  for (const f of p.fakes) if (!f.requiredLook) w.push({ leaf: 'G7.7.2', code: 'st.fake_look', subject: f.entryId, text: `fake ${f.entryId} has no required look`, severity: 'warning' });
  return w;
}

// ---- G6.5.2 Contingencies --------------------------------------------------------------------------------

export type Trigger =
  | { readonly kind: 'player_out'; readonly playerId: string }
  | { readonly kind: 'qb_out'; readonly backupId: string }
  | { readonly kind: 'opponent_starter'; readonly playerId: string; readonly plays: boolean }
  | { readonly kind: 'trail_by'; readonly points: number }
  | { readonly kind: 'weather'; readonly what: 'wet' | 'wind' };

export interface Contingency { readonly id: string; readonly side: Side; readonly trigger: Trigger; readonly calls: readonly MenuEntry[] }

/** Reps a contingency takes from the main plan: the reps its calls need that the main plan does not supply. */
export function contingencyReps(c: Contingency, main: readonly MenuEntry[]): number {
  const mainPlays = new Set(main.map((m) => m.call.playId));
  return c.calls.filter((m) => !mainPlays.has(m.call.playId)).reduce((a, m) => a + (m.targetReps > 0 ? m.targetReps : param('contingency.defaultRepsPerCall')), 0);
}

/** Main plan reps per call after the contingencies take theirs (G6.5.2 acceptance: adding one lowers it, removing restores). */
export function mainRepsPerCall(repsAvailable: number, main: readonly MenuEntry[], contingencies: readonly Contingency[]): number {
  const taken = contingencies.reduce((a, c) => a + contingencyReps(c, main), 0);
  const calls = new Set(main.map((m) => m.call.playId)).size;
  return calls === 0 ? 0 : Math.max(0, repsAvailable - taken) / calls;
}

/** Forecast (J12): chance of rain and the wind speed. Weather contingencies are offered from it. */
export interface Forecast { readonly rainChance: number; readonly windMph: number }
export function offeredWeather(f: Forecast): ('wet' | 'wind')[] {
  const out: ('wet' | 'wind')[] = [];
  if (f.rainChance >= param('contingency.rainChance')) out.push('wet');
  if (f.windMph > param('contingency.windMph')) out.push('wind');
  return out;
}

export function checkContingencies(cs: readonly Contingency[], main: readonly MenuEntry[]): PlanWarning[] {
  const w: PlanWarning[] = [];
  for (const side of new Set(cs.map((c) => c.side))) {
    const n = cs.filter((c) => c.side === side).length;
    if (n > param('contingency.maxPerSide')) w.push({ leaf: 'G6.5.2', code: 'contingency.count', subject: side, text: `${n} contingencies on ${side} (up to ${param('contingency.maxPerSide')})`, severity: 'warning' });
  }
  for (const c of cs) {
    const r = contingencyReps(c, main);
    if (r > 0) w.push({ leaf: 'G6.5.2', code: 'contingency.reps', subject: c.id, text: `${c.id} takes ${r} reps from the main plan`, severity: 'note' });
  }
  return w;
}
