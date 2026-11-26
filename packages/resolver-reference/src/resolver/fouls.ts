// Fouls committed on a play of the reference resolver (J1.6.3, J15.7.1, contract D-06).
// The resolver records acts; only officiating decides whether a flag falls. Chances come from the
// accepted-penalty rates of J15.7.1 (params.ts). A foul type is used only when the rule set carries its
// `foul.<id>.exists` key and the key is true, so a level without that foul never draws it.
import { roundSimS, type FoulId, type RuleSet, type Side } from '@gm/schema';
import type { Ctx, Team } from './context.ts';
import type { FoulChance } from './config.ts';
import { foulRowIds } from './params.ts';

/** Seconds before the snap at which a dead-ball foul before the snap is recorded. Placement only. */
const PRE_SNAP_T = -0.5;
/** Seconds after the dead ball at which a foul after the play is recorded. Placement only. */
const AFTER_PLAY_S = 1;

const exists = new WeakMap<RuleSet, Map<FoulId, boolean>>();

function foulExists(rules: RuleSet, id: FoulId): boolean {
  let m = exists.get(rules);
  if (!m) {
    m = new Map();
    const keys = new Set(rules.keys());
    exists.set(rules, m);
    for (const k of keys) {
      const match = /^foul\.([a-z0-9_]+)\.exists$/.exec(k);
      if (match) m.set(match[1]!, rules.bool(k));
    }
  }
  return m.get(id) === true;
}

/** One draw over a list of foul chances: at most one of them happens. Returns it or null. */
function draw(c: Ctx, list: readonly FoulChance[]): FoulChance | null {
  let total = 0;
  for (const f of list) total += f.p;
  const u = c.rng.uniform();
  if (u >= total) return null;
  let acc = 0;
  for (const f of list) {
    acc += f.p;
    if (u < acc) return foulRowIds(f.row).every((id) => foulExists(c.input.rules, id)) ? f : null;
  }
  return null;
}

function emit(c: Ctx, f: FoulChance, t: number, px: number, py: number, timing: 'before_snap' | 'live' | 'dead_ball'): void {
  const team: Team = f.row.by === 'either' ? (c.rng.chance(0.5) ? 'snapping' : 'opposing') : f.row.by;
  const side: Side = c.side(team);
  c.push({
    type: 'foul_committed', t: roundSimS(t), foulId: f.row.bySide ? f.row.bySide[team] : f.row.id, side, playerId: c.pickId(team), spot: c.spot(px, py),
    timing, phase: c.facts.phase, severity: c.rng.uniform(), visibility: 'open',
    atPointOfAttack: c.rng.chance(c.cfg.foulPointOfAttack), flagrant: false, borderline: false, ordered: false,
  });
}

/**
 * A dead-ball foul before the snap. When one happens the play never becomes live: the record holds the
 * foul and a `pre_snap_foul` dead ball, and the caller resolves nothing else.
 */
export function preSnapFoul(c: Ctx): boolean {
  const f = draw(c, c.cfg.fouls.pre_snap_dead);
  if (!f) return false;
  emit(c, f, PRE_SNAP_T, 0, 0, 'before_snap');
  c.live = false;
  c.dead(PRE_SNAP_T, 'pre_snap_foul', 0, 0, null, null);
  return true;
}

/** Fouls during and after a play that ran. One draw for the live windows the play opened, one for after the play. */
export function liveFouls(c: Ctx): void {
  const F = c.cfg.fouls;
  const facts = c.facts;
  const list: FoulChance[] = [];
  if (facts.hadSnap) for (const f of F.at_snap) list.push(f);
  if (facts.scrimmage) for (const f of F.scrimmage) list.push(f);
  if (facts.dropback) for (const f of F.dropback) list.push(f);
  if (facts.passAttempt) for (const f of F.pass_attempt) list.push(f);
  if (facts.throwaway) for (const f of F.throwaway) list.push(f);
  if (facts.kickReturn) for (const f of F.kick_return) list.push(f);
  const live = draw(c, list);
  if (live) {
    const w = live.row.when;
    if (w === 'at_snap') emit(c, live, 0, 0, 0, 'live');
    else if (w === 'pass_attempt' || w === 'kick_return') emit(c, live, c.deadT / 2, facts.focusPx, facts.focusPy, 'live');
    else emit(c, live, c.deadT / 2, 0, 0, 'live');
  }
  const after = draw(c, F.after_play);
  if (after) emit(c, after, c.deadT + AFTER_PLAY_S, c.deadPx, c.deadPy, 'dead_ball');
}
