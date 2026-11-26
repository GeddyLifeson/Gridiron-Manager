// From committed foul to called foul (B11.3.1), and the mistaken flag on a borderline legal act
// (B11.3.2 rule 1). A flag never comes from nothing: every call here starts from a `foul_committed`
// truth event, real or borderline.
import {
  FoulClass, FoulDq, foulKey, type FoulRecord, type PlayTruth, type RulingContext, type Side, type TruthEventOf,
} from '@gm/schema';
import { CREW, baseParam, type DetectionFamily } from './params.ts';
import { detectionClass, type DetectionClass } from './foul-families.ts';
import type { View } from './zones.ts';

export type FoulEvent = TruthEventOf<'foul_committed'>;

const min = (a: number, b: number) => (a < b ? a : b);

function sightFactor(visibility: FoulEvent['visibility'], ctx: RulingContext): number {
  const name = visibility === 'open' ? CREW.sightOpenFactor : visibility === 'crowded' ? CREW.sightCrowdedFactor : CREW.sightPileFactor;
  return ctx.params.num(name);
}

function crewFactor(family: DetectionFamily, ctx: RulingContext): number {
  return ctx.crew.crewFactor[family] ?? 1;
}

/** `visibility_factor` of B11.3.1 rule 2: the sight line, the watch zone, and a position the crew lacks. */
export function visibilityFactor(visibility: FoulEvent['visibility'], view: View, ctx: RulingContext): number {
  const zone = view.covered ? 1 : ctx.params.num(CREW.outOfZoneFactor);
  const missing = view.missing ? ctx.params.num(CREW.missingOfficialFactor) : 1;
  return sightFactor(visibility, ctx) * zone * missing;
}

/**
 * Chance that a true foul is flagged (B11.3.1 rules 1 and 2). Objective fouls are called at one
 * high rate; judgment fouls at base x severity x visibility x impact x crew, under a cap. The crew
 * factor applies to both, because pre-snap fouls are one of the crew families of B11.4.1.
 */
export function trueFoulCallChance(cls: DetectionClass, e: Pick<FoulEvent, 'severity' | 'visibility' | 'atPointOfAttack'>, view: View, ctx: RulingContext): number {
  const num = (name: string) => ctx.params.num(name);
  if (cls.objective) {
    const missing = view.missing ? num(CREW.missingOfficialFactor) : 1;
    return min(num(CREW.objectiveCallCap), num(CREW.objectiveCallChance) * crewFactor(cls.family, ctx) * missing);
  }
  const lo = num(CREW.severityFactorMin);
  const severity = lo + (num(CREW.severityFactorMax) - lo) * e.severity;
  const impact = e.atPointOfAttack ? num(CREW.impactAtPointFactor) : num(CREW.impactAwayFactor);
  const chance = num(baseParam(cls.family)) * severity * visibilityFactor(e.visibility, view, ctx) * impact * crewFactor(cls.family, ctx);
  return min(num(CREW.judgmentCallCap), chance);
}

/**
 * Chance that a borderline legal act draws a flag (B11.3.2 rule 1). On a borderline event the
 * `severity` field says how near the act came to the foul boundary: 1 is at the boundary, where the
 * chance reaches its highest value. Crew accuracy scales it (B11.4.1 rule 3).
 */
export function phantomCallChance(cls: DetectionClass, e: Pick<FoulEvent, 'severity'>, ctx: RulingContext): number {
  const top = ctx.params.num(CREW.phantomMaxChance);
  return min(top, top * e.severity * crewFactor(cls.family, ctx) * ctx.crew.accuracy);
}

/** True when some possession event before `index` gave the ball to the team that did not snap it. */
export function possessionChangedBefore(truth: PlayTruth, index: number, snappingSide: Side): boolean {
  for (let i = 0; i < index && i < truth.events.length; i++) {
    const e = truth.events[i]!;
    if (e.type === 'possession' && e.side !== snappingSide) return true;
  }
  return false;
}

/**
 * A foul record for a borderline event that the foul module did not list as a candidate, built from
 * the catalogue keys of the rule set (B8.1.1). Returns null when the foul does not exist in this
 * rule set. Its `eventIndex` is null: the contract's mark of a call with no foul behind it.
 */
export function phantomRecord(e: FoulEvent, index: number, truth: PlayTruth, ctx: RulingContext): FoulRecord | null {
  const r = ctx.rules;
  if (!r.bool(foulKey(e.foulId, 'exists'))) return null;
  return {
    foulId: e.foulId, side: e.side, playerId: e.playerId, spot: { x: e.spot.x, y: e.spot.y }, t: e.t,
    timing: e.timing, phase: e.phase,
    yards: r.num(foulKey(e.foulId, 'yards')),
    afd: r.bool(foulKey(e.foulId, 'afd')), lod: r.bool(foulKey(e.foulId, 'lod')),
    spotFoul: r.bool(foulKey(e.foulId, 'spot_foul')), runoffEligible: r.bool(foulKey(e.foulId, 'runoff_eligible')),
    foulClass: FoulClass.parse(r.opt(foulKey(e.foulId, 'class'))), dq: FoulDq.parse(r.opt(foulKey(e.foulId, 'dq'))),
    beforeChangeOfPossession: !possessionChangedBefore(truth, index, ctx.situation.offense),
    eventIndex: null, sameAct: null, called: false, correct: true, flagrant: e.flagrant,
  };
}

export { detectionClass };
