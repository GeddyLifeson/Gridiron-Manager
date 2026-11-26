// Dealing real people onto generated teams (U4.2.1 to U4.2.3, U5.2.2, X14.4.2 rule 2). One choice at import:
// random, balanced or kept together. The placement seed is the world seed, the pack hash and the mode (U4.2.3),
// so the same three give the same placement. Roster limits and position minimums come from the caller, read
// from the C5 and T5 rule keys (G-10, G-15); nothing here holds a league number.
import type { RandomStream } from '@gm/schema';
import type { GeneratorRandom } from '../generator/index.ts';
import { param } from './params.ts';

export type PlacementMode = 'random' | 'balanced' | 'kept_together';
export const PLACEMENT_MODES: readonly PlacementMode[] = ['random', 'balanced', 'kept_together'];
export const PLACE_STREAM = 'person.place';

const GROUP_OF: Readonly<Record<string, string>> = {
  QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', KR: 'WR', PR: 'WR', TE: 'TE', OT: 'OL', OG: 'OL', C: 'OL', IOL: 'OL',
  DE: 'DL', EDGE: 'DL', DT: 'DL', NT: 'DL', LB: 'LB', CB: 'DB', S: 'DB', K: 'ST', P: 'ST', LS: 'ST',
};
/** Position group of a pack position code, used for position needs, teammate links and the team metric. */
export function groupOfPosition(position: string): string {
  return GROUP_OF[position] ?? 'other';
}

export interface RosterEntry { personId: number; group: string; value: number; imported: boolean }

export interface TeamSlot {
  teamId: number;
  /** Level key the team plays at; players are placed only at their own level (U4.2.1 rule 5). */
  level: string;
  /** C5 or T5 roster limit for the moment of placement. */
  rosterLimit: number;
  /** Minimum players per position group, from content and the depth rules (U4.2.1 rule 1 "position minimums first"). */
  minimums: Readonly<Record<string, number>>;
  /** Generated players already on the roster from the history run. */
  roster: readonly RosterEntry[];
}

export interface PlacePlayer {
  personId: number;
  level: string;
  group: string;
  value: number;
  /** "organisation|season|level" keys of his real seasons, latest last. */
  unitKeys: readonly string[];
}

export interface PlacementResult {
  mode: PlacementMode;
  /** Imported player id to team id. */
  assigned: Map<number, number>;
  /** Imported players beyond roster limits: to the free pool (pro) or transfer and walk-on pool (college) of their level. */
  pooled: number[];
  /** Generated players released at placement with an ordinary `released` event (X14.4.2 rule 2, U5.2.2). */
  displaced: { personId: number; teamId: number }[];
  rosters: Map<number, RosterEntry[]>;
  /** Team metric per team: mean value of the starters (top `minimums[group]` per group). */
  strength: Map<number, number>;
  /** Largest minus smallest strength, per level. */
  spread: Record<string, number>;
  /** "organisation|season|level" to team, kept-together mode only. */
  unitTeam: Map<string, number>;
  /** Positions still short of minimums after placement, to be filled by the generator at full profile (U5.1.2 rule 3). */
  shortfalls: { teamId: number; group: string; missing: number }[];
}

function shuffle<T>(xs: T[], s: RandomStream): T[] {
  for (let i = xs.length - 1; i > 0; i--) { const j = s.int(0, i); [xs[i], xs[j]] = [xs[j]!, xs[i]!]; }
  return xs;
}

/** D13.4.1-style team metric used here: mean value of the starters, the top `minimums[g]` of each group. */
export function teamStrength(roster: readonly RosterEntry[], minimums: Readonly<Record<string, number>>): number {
  let sum = 0, n = 0;
  for (const [g, k] of Object.entries(minimums)) {
    const top = roster.filter((r) => r.group === g).map((r) => r.value).sort((a, b) => b - a).slice(0, k);
    for (const v of top) { sum += v; n++; }
  }
  return n > 0 ? sum / n : 0;
}

/** The placement stream for one world seed (inside `rnd`), pack hash and mode (U4.2.3 rule 1). */
export function placementStream(rnd: GeneratorRandom, packHash: string, mode: PlacementMode): RandomStream {
  return rnd.open(PLACE_STREAM, [packHash, mode]);
}

/** Places imported players on the teams of their level by the chosen mode (U4.2.1). Pure given the stream. */
export function placePlayers(players: readonly PlacePlayer[], teams: readonly TeamSlot[], mode: PlacementMode, s: RandomStream): PlacementResult {
  const assigned = new Map<number, number>();
  const pooled: number[] = [];
  const importedOn = new Map<number, RosterEntry[]>(teams.map((t) => [t.teamId, []]));
  const unitTeam = new Map<string, number>();
  const levels = [...new Set(teams.map((t) => t.level))].sort();
  const space = (t: TeamSlot) => t.rosterLimit - importedOn.get(t.teamId)!.length;
  const have = (t: TeamSlot, g: string) => importedOn.get(t.teamId)!.filter((r) => r.group === g).length;
  const put = (p: PlacePlayer, t: TeamSlot) => { importedOn.get(t.teamId)!.push({ personId: p.personId, group: p.group, value: p.value, imported: true }); assigned.set(p.personId, t.teamId); };

  for (const level of levels) {
    const lt = teams.filter((t) => t.level === level).sort((a, b) => a.teamId - b.teamId);
    const lp = players.filter((p) => p.level === level).sort((a, b) => a.personId - b.personId);
    const dealRandom = (list: PlacePlayer[]) => {
      for (const p of shuffle(list, s)) {
        const open = lt.filter((t) => space(t) > 0);
        if (open.length === 0) { pooled.push(p.personId); continue; }
        const needy = open.filter((t) => have(t, p.group) < (t.minimums[p.group] ?? 0));
        const from = needy.length > 0 ? needy : open;
        put(p, from[s.int(0, from.length - 1)]!);
      }
    };
    if (mode === 'random') dealRandom(lp.slice());
    else if (mode === 'balanced') {
      // Snake draft with a seeded order; each pick takes the best player at the team's most-needed group.
      const order = shuffle(lt.slice(), s);
      const left = lp.slice().sort((a, b) => b.value - a.value || a.personId - b.personId);
      let round = 0;
      while (left.length > 0) {
        const seq = round % 2 === 0 ? order : order.slice().reverse();
        let picked = 0;
        for (const t of seq) {
          if (left.length === 0) break;
          if (space(t) <= 0) continue;
          const needs = Object.entries(t.minimums).map(([g, k]) => [g, k - have(t, g)] as const).filter(([, d]) => d > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
          let idx = -1;
          for (const [g] of needs) { idx = left.findIndex((p) => p.group === g); if (idx >= 0) break; }
          if (idx < 0) idx = 0;
          put(left.splice(idx, 1)[0]!, t);
          picked++;
        }
        if (picked === 0) { for (const p of left.splice(0)) pooled.push(p.personId); }
        round++;
      }
      // Improvement pass: swap same-group players between the strongest and weakest team while it narrows the spread.
      const str = (t: TeamSlot) => teamStrength([...t.roster, ...importedOn.get(t.teamId)!], t.minimums);
      for (let pass = 0; pass < param('placement.swapPasses'); pass++) {
        const ranked = lt.slice().sort((a, b) => str(b) - str(a) || a.teamId - b.teamId);
        const hi = ranked[0], lo = ranked[ranked.length - 1];
        if (!hi || !lo || hi === lo) break;
        const before = str(hi) - str(lo);
        if (before <= param('placement.balancedSpreadIss')) break;
        let best: { i: number; j: number; after: number } | null = null;
        const H = importedOn.get(hi.teamId)!, Lo = importedOn.get(lo.teamId)!;
        for (let i = 0; i < H.length; i++) for (let j = 0; j < Lo.length; j++) {
          if (H[i]!.group !== Lo[j]!.group || H[i]!.value <= Lo[j]!.value) continue;
          [H[i], Lo[j]] = [Lo[j]!, H[i]!];
          const after = Math.abs(str(hi) - str(lo));
          [H[i], Lo[j]] = [Lo[j]!, H[i]!];
          if (after < before && (!best || after < best.after)) best = { i, j, after };
        }
        if (!best) break;
        const a = H[best.i]!, b = Lo[best.j]!;
        H[best.i] = b; Lo[best.j] = a;
        assigned.set(a.personId, lo.teamId); assigned.set(b.personId, hi.teamId);
      }
    } else {
      // Kept together: each real organisation-season (his latest) maps to one team of the level, chosen by seed.
      const units = new Map<string, PlacePlayer[]>();
      const loose: PlacePlayer[] = [];
      for (const p of lp) {
        const u = p.unitKeys[p.unitKeys.length - 1];
        if (!u) { loose.push(p); continue; }
        (units.get(u) ?? units.set(u, []).get(u)!).push(p);
      }
      const order = shuffle(lt.slice(), s);
      const load = new Map(order.map((t) => [t.teamId, 0]));
      const unitList = [...units.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
      for (const [u, members] of unitList) {
        const t = order.slice().sort((a, b) => load.get(a.teamId)! - load.get(b.teamId)!)[0];
        if (!t) { for (const p of members) pooled.push(p.personId); continue; }
        load.set(t.teamId, load.get(t.teamId)! + 1);
        unitTeam.set(u, t.teamId);
        for (const p of members.sort((a, b) => b.value - a.value)) { if (space(t) > 0) put(p, t); else pooled.push(p.personId); }
      }
      dealRandom(loose);
    }
  }

  // Displacement: a roster over its limit releases its lowest-value generated players, starting with the
  // groups that hold more than their minimum (U5.2.2 rule 1).
  const displaced: PlacementResult['displaced'] = [];
  const rosters = new Map<number, RosterEntry[]>();
  const strength = new Map<number, number>();
  const shortfalls: PlacementResult['shortfalls'] = [];
  for (const t of teams) {
    const imp = importedOn.get(t.teamId)!;
    let gen = t.roster.slice().sort((a, b) => a.value - b.value || a.personId - b.personId);
    while (imp.length + gen.length > t.rosterLimit && gen.length > 0) {
      const all = [...imp, ...gen];
      const surplus = (g: string) => all.filter((r) => r.group === g).length - (t.minimums[g] ?? 0);
      const idx = gen.findIndex((r) => surplus(r.group) > 0);
      const out = gen.splice(idx >= 0 ? idx : 0, 1)[0]!;
      displaced.push({ personId: out.personId, teamId: t.teamId });
    }
    gen = gen.sort((a, b) => a.personId - b.personId);
    const roster = [...imp, ...gen];
    rosters.set(t.teamId, roster);
    strength.set(t.teamId, teamStrength(roster, t.minimums));
    for (const [g, k] of Object.entries(t.minimums)) {
      const n = roster.filter((r) => r.group === g).length;
      if (n < k) shortfalls.push({ teamId: t.teamId, group: g, missing: k - n });
    }
  }
  const spread: Record<string, number> = {};
  for (const level of levels) {
    const xs = teams.filter((t) => t.level === level).map((t) => strength.get(t.teamId)!);
    spread[level] = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  }
  return { mode, assigned, pooled: pooled.sort((a, b) => a - b), displaced, rosters, strength, spread, unitTeam, shortfalls };
}

// ---- U4.2.2 coaches ----

export interface CoachJob { jobId: number; teamId: number; level: string; role: string }
export interface PlaceCoach { personId: number; level: string; lastRole: string | null; lastSeason: number | null; lastUnitKey: string | null }

export interface CoachPlacement {
  /** Coach id to job id. */
  hired: Map<number, number>;
  /** Imported coaches to the unemployed pool of their rung (U4.2.2 rules 4 and the edge case). */
  unemployed: number[];
  /** Generated holders of jobs taken by imported coaches, to the unemployed pool (U5.2.2 rule 2). */
  displacedJobs: number[];
}

/**
 * U4.2.2: rung match first, then mode. A coach goes only to a job of the role of his last real job (never above
 * it); the user's starting job is reserved before placement (rule 5). Kept together sends a head coach to the
 * team that holds his last organisation-season. A coach out of football more than the set number of seasons
 * before the world start goes to the unemployed pool.
 */
export function placeCoaches(coaches: readonly PlaceCoach[], jobs: readonly CoachJob[], mode: PlacementMode, s: RandomStream, opts: { worldStartYear: number; reservedJobIds: ReadonlySet<number>; unitTeam?: ReadonlyMap<string, number> }): CoachPlacement {
  const hired = new Map<number, number>();
  const unemployed: number[] = [];
  const open = jobs.filter((j) => !opts.reservedJobIds.has(j.jobId)).sort((a, b) => a.jobId - b.jobId);
  const taken = new Set<number>();
  const active = (c: PlaceCoach) => c.lastSeason !== null && opts.worldStartYear - 1 - c.lastSeason <= param('coach.outOfFootballSeasons');
  const ordered = shuffle(coaches.slice().sort((a, b) => a.personId - b.personId), s);
  // Kept together first, so a head coach finds his unit's team before random dealing fills it.
  if (mode === 'kept_together' && opts.unitTeam) {
    for (const c of ordered) {
      if (!active(c) || !c.lastUnitKey) continue;
      const teamId = opts.unitTeam.get(c.lastUnitKey);
      const job = open.find((j) => !taken.has(j.jobId) && j.teamId === teamId && j.role === c.lastRole && j.level === c.level);
      if (job) { hired.set(c.personId, job.jobId); taken.add(job.jobId); }
    }
  }
  for (const c of ordered) {
    if (hired.has(c.personId)) continue;
    if (!active(c)) { unemployed.push(c.personId); continue; }
    const fits = open.filter((j) => !taken.has(j.jobId) && j.role === c.lastRole && j.level === c.level);
    if (fits.length === 0) { unemployed.push(c.personId); continue; }
    const job = fits[s.int(0, fits.length - 1)]!;
    hired.set(c.personId, job.jobId); taken.add(job.jobId);
  }
  return { hired, unemployed: unemployed.sort((a, b) => a - b), displacedJobs: [...taken].sort((a, b) => a - b) };
}
