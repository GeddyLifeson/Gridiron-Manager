// The staff's eye on its own players (D6; playtest findings scouting.exported:unbound and evaluations): each
// practice report and each seat game becomes D6 observations for the user's staff, folded into the
// organisation's belief store (people.scouting update), which is kept in the career save. Truth is read only
// here, inside the world side, through `scouting.observe`; what leaves this desk is estimates and bands
// (D6.1.1, MA-48: true ratings are never shown).
//
// Decisions (DECISIONS.md CY-10 to CY-13, ASSUMPTION until the staff model and snap counts exist):
// - The evaluator is the seat team's head coach seat (the user's staff as one reporting line), at the median
//   evaluation skill (`skill.userTerm`) with no lean, since AI staff hidden skills are not bound to the world yet.
// - Practice: one item per player and attribute per practice; live and thud reps are `practice_full`, jog and
//   walk-through reps `practice_walk`; units are the reps taken.
// - Game: the seat team's players at the top of each practice slot's depth (the 22 starters and specialists)
//   get one `game_film` item of GAME_SNAPS units; the season session keeps box scores, not snaps.
// - Priors: the position's mean on the team's own roster, sd for no public information (D6.4.1).
import { stream } from '@gm/engine-core';
import { scouting as sc } from '@gm/people';
import type { WorldDate } from '@gm/schema';
import type { loop } from '@gm/world';
import { PRACTICE_SHAPES, assignContextOf, type PracticeRecord } from './practice-desk.ts';

/** Snaps a starter is credited with on film per game (CY-12, ASSUMPTION). */
export const GAME_SNAPS = 60;

/** Contributor id of the user's staff as one evaluator (CY-10): world person ids are positive. */
const STAFF_EVALUATOR: sc.Contributor = { id: 0, line: 'own_staff' };

export interface ScoutingDeskSave {
  readonly version: 1;
  /** World person id to attribute to the organisation's estimate. */
  readonly beliefs: Readonly<Record<string, Readonly<Record<string, sc.Estimate>>>>;
  /** Observation sessions folded in (practices and games). */
  readonly sessions: number;
}

/** What a screen may show of one player: bands only, never a true value. */
export interface ObservedPlayer {
  readonly personId: number;
  readonly attributes: Readonly<Record<string, { readonly mean: number; readonly low: number; readonly high: number; readonly looks: number }>>;
}

export class ScoutingDesk {
  private beliefs: Record<string, Record<string, sc.Estimate>> = {};
  private sessions = 0;

  static restore(save: ScoutingDeskSave): ScoutingDesk {
    if (save.version !== 1) throw new Error(`scouting desk: save version ${String(save.version)} is not supported`);
    const d = new ScoutingDesk();
    d.beliefs = JSON.parse(JSON.stringify(save.beliefs)) as Record<string, Record<string, sc.Estimate>>;
    d.sessions = save.sessions;
    return d;
  }

  private skillOf: sc.SkillOf = () => sc.p('skill.userTerm');

  /** Position means on the team's roster, the prior's centre (CY-13). */
  private positionMeans(world: loop.LiveWorld, teamId: number): Map<string, Map<string, number>> {
    const sums = new Map<string, Map<string, { s: number; n: number }>>();
    for (const id of world.rosters.get(teamId) ?? []) {
      const pl = world.people.get(id)?.playing;
      if (!pl) continue;
      const m = sums.get(pl.position) ?? new Map<string, { s: number; n: number }>();
      for (const [a, v] of Object.entries(pl.attributes)) { const t = m.get(a) ?? { s: 0, n: 0 }; t.s += v; t.n++; m.set(a, t); }
      sums.set(pl.position, m);
    }
    const out = new Map<string, Map<string, number>>();
    for (const [pos, m] of sums) out.set(pos, new Map([...m].map(([a, t]) => [a, t.s / t.n] as const)));
    return out;
  }

  private look(world: loop.LiveWorld, teamId: number, looks: ReadonlyMap<number, { source: sc.EvidenceSource; units: number }>, scope: readonly (string | number)[]): number {
    const date: WorldDate = world.date;
    const means = this.positionMeans(world, teamId);
    const rng = stream(world.seed, 'career.scouting', scope);
    let items = 0;
    for (const [id, lk] of [...looks].sort((a, b) => a[0] - b[0])) {
      const person = world.people.get(id);
      const pl = person?.playing;
      if (!person || !pl || !(lk.units > 0)) continue;
      const age = date.seasonYear - person.birthDate.seasonYear;
      const mine = (this.beliefs[String(id)] ??= {});
      for (const a of Object.keys(pl.attributes).sort()) {
        const cur = mine[a] ?? sc.priorFor({ positionLevelMean: means.get(pl.position)?.get(a) ?? 50, publicImplied: null, information: 'none', date });
        const ctx: sc.LookContext = {
          attribute: a, source: lk.source, units: lk.units, date, evaluator: STAFF_EVALUATOR,
          skill: sc.p('skill.userTerm'), estimateMean: cur.mean, opponent: null,
        };
        mine[a] = sc.update(cur, sc.observe(pl.attributes[a]!, ctx, sc.NO_LEAN, rng), age, this.skillOf);
        items++;
      }
    }
    this.sessions++;
    return items;
  }

  /** Folds one practice report in: every player who took reps is seen for those reps (CY-11). */
  observePractice(world: loop.LiveWorld, teamId: number, rec: PracticeRecord, index = 0): number {
    const looks = new Map<number, { source: sc.EvidenceSource; units: number }>();
    for (const [id, n] of Object.entries(rec.reps)) {
      const full = rec.fullSpeed[id] ?? 0;
      looks.set(Number(id), full > 0 ? { source: 'practice_full', units: full } : { source: 'practice_walk', units: n });
    }
    return this.look(world, teamId, looks, ['practice', rec.seasonYear, rec.week, index]);
  }

  /** Folds one seat game in: the starters on film (CY-12). */
  observeGame(world: loop.LiveWorld, teamId: number, gameId: number): number {
    const ctx = assignContextOf(world, teamId);
    const looks = new Map<number, { source: sc.EvidenceSource; units: number }>();
    for (const shape of Object.values(PRACTICE_SHAPES)) {
      const need = new Map<string, number>();
      for (const slot of shape) need.set(slot, (need.get(slot) ?? 0) + 1);
      for (const [slot, n] of need) for (const id of (ctx.depth[slot] ?? []).slice(0, n)) looks.set(Number(id), { source: 'game_film', units: GAME_SNAPS });
    }
    return this.look(world, teamId, looks, ['game', world.date.seasonYear, gameId]);
  }

  get sessionCount(): number { return this.sessions; }
  get playersSeen(): number { return Object.keys(this.beliefs).length; }

  /** The organisation's belief about a player: the band per attribute, never the truth (MA-48). */
  player(personId: number): ObservedPlayer | null {
    const b = this.beliefs[String(personId)];
    if (!b) return null;
    const attributes: Record<string, { mean: number; low: number; high: number; looks: number }> = {};
    for (const [a, e] of Object.entries(b)) { const x = sc.band(e); attributes[a] = { mean: x.mean, low: x.low, high: x.high, looks: e.evidenceCount }; }
    return { personId, attributes };
  }

  /** The raw estimates of a player, for people read models (buildPlayerCard takes estimates). */
  estimates(personId: number): Readonly<Record<string, sc.Estimate>> | null { return this.beliefs[String(personId)] ?? null; }

  save(): ScoutingDeskSave { return { version: 1, beliefs: this.beliefs, sessions: this.sessions }; }
}
