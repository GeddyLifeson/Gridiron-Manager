// The foul catalogue as read from the rule set (B8.1.2), and the foul records built from truth events (B8.1.1).
import {
  FoulClass, FoulDq, foulKey, eventsOf,
  type FoulCatalogueRow, type FoulId, type FoulRecord, type NumberSources, type PlayTruth, type RuleSet,
  type RulingContext, type Side, type TruthEventOf,
} from '@gm/schema';
import { ENFORCEMENT_PROFILES, type EnforcementProfile, type ExtField } from './ids.ts';
import { extKey } from './params.ts';

const keySets = new WeakMap<RuleSet, ReadonlySet<string>>();

/** True when the rule set holds the key. Used only for the sparse extension fields. */
export function hasKey(rules: RuleSet, key: string): boolean {
  let set = keySets.get(rules);
  if (!set) { set = new Set(rules.keys()); keySets.set(rules, set); }
  return set.has(key);
}

/** B8.1.2: one catalogue row, every field read by key. A missing field is a rule-set error and throws. */
export function catalogue(id: FoulId, src: NumberSources): FoulCatalogueRow {
  const r = src.rules;
  return {
    id,
    exists: r.bool(foulKey(id, 'exists')),
    yards: r.num(foulKey(id, 'yards')),
    afd: r.bool(foulKey(id, 'afd')),
    lod: r.bool(foulKey(id, 'lod')),
    spotFoul: r.bool(foulKey(id, 'spot_foul')),
    deadBall: r.bool(foulKey(id, 'dead_ball')),
    runoffEligible: r.bool(foulKey(id, 'runoff_eligible')),
    foulClass: FoulClass.parse(r.opt(foulKey(id, 'class'))),
    dq: FoulDq.parse(r.opt(foulKey(id, 'dq'))),
  };
}

/** Whether the foul exists at this level. An id the rule set does not know does not exist. */
export function foulExists(id: FoulId, rules: RuleSet): boolean {
  const key = foulKey(id, 'exists');
  return hasKey(rules, key) && rules.bool(key);
}

function extFlag(rules: RuleSet, id: FoulId, field: ExtField): boolean {
  const key = extKey(id, field);
  return hasKey(rules, key) && rules.bool(key);
}

export function enforcementProfile(id: FoulId, rules: RuleSet): EnforcementProfile {
  const key = extKey(id, 'enforcement');
  if (!hasKey(rules, key)) return 'standard';
  const v = rules.opt(key);
  const found = ENFORCEMENT_PROFILES.find((p) => p === v);
  if (!found) throw new Error(`rule key ${key} holds an unknown enforcement procedure: ${v}`);
  return found;
}

export function isKickBlockAttempt(id: FoulId, rules: RuleSet): boolean { return extFlag(rules, id, 'kick_block_attempt'); }
export function isSeparate(id: FoulId, rules: RuleSet): boolean { return extFlag(rules, id, 'separate'); }

/** Time of the first change of team possession in the play, or null when there was none (B8.5.5 clean hands). */
export function firstChangeTime(truth: PlayTruth, snapping: Side): number | null {
  for (const e of eventsOf(truth, 'possession')) if (e.side !== snapping) return e.t;
  return null;
}

/**
 * One truth event as a foul record (B8.1.1) with the catalogue fields copied in. `called` is false:
 * the crew model sets it. WP-05 uses this for phantom calls too, passing `eventIndex` null.
 */
export function recordFromEvent(
  e: TruthEventOf<'foul_committed'>, eventIndex: number | null, truth: PlayTruth, ctx: RulingContext,
): FoulRecord {
  const row = catalogue(e.foulId, ctx);
  const change = firstChangeTime(truth, ctx.situation.offense);
  // A taunt, or any foul the catalogue marks so, is a dead-ball foul whenever it occurs (B8.1.1).
  const timing = row.deadBall && e.timing === 'live' ? 'dead_ball' : e.timing;
  return {
    foulId: e.foulId, side: e.side, playerId: e.playerId, spot: { x: e.spot.x, y: e.spot.y }, t: e.t,
    timing, phase: e.phase,
    yards: row.yards, afd: row.afd, lod: row.lod, spotFoul: row.spotFoul, runoffEligible: row.runoffEligible,
    foulClass: row.foulClass, dq: row.dq,
    beforeChangeOfPossession: change === null || e.t < change,
    eventIndex, sameAct: null, called: false,
    // A real foul that is not yet called is a wrong no-call; a borderline act that is not called is right.
    correct: e.borderline,
    flagrant: e.flagrant,
  };
}

/**
 * B8.1.1: every foul that was committed, as records with `called` false. Borderline acts are not fouls
 * in truth (B11.3.2), so they are left out; so is a foul the rule set says does not exist at this level
 * (the act still happened and stays in the truth record).
 */
export function candidates(truth: PlayTruth, ctx: RulingContext): FoulRecord[] {
  const out: FoulRecord[] = [];
  const src: { t: number; playerId: number | null }[] = [];
  truth.events.forEach((e, i) => {
    if (e.type !== 'foul_committed' || e.borderline || !foulExists(e.foulId, ctx.rules)) return;
    const rec = recordFromEvent(e, i, truth, ctx);
    // One act that is two fouls (B8.1.1 edge case): same player, same instant, different catalogue rows.
    const twin = src.findIndex((s, k) => s.t === e.t && s.playerId !== null && s.playerId === e.playerId && out[k]!.foulId !== e.foulId && out[k]!.side === e.side);
    if (twin >= 0 && out[twin]!.sameAct === null) { rec.sameAct = twin; out[twin]!.sameAct = out.length; }
    out.push(rec);
    src.push({ t: e.t, playerId: e.playerId });
  });
  return out;
}
