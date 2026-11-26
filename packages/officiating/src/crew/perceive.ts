// CrewModel.perceive (contract officiating.ts; B11.2.1, B11.3.1, B11.3.2). One call per play:
//   1. place the officials (zones.ts);
//   2. rule on every close act and write the mistakes into the seen record (rulings.ts, seen.ts);
//   3. decide which committed fouls draw a flag, and which borderline acts draw one by mistake (detection.ts).
// Every draw comes from stream `officials` with scope [game, play, official], one stream per official,
// opened once per call, so the same truth, crew and seed give the same result on every machine
// (B11.3.1 rule 5, J13.2.1). The facade may call this again to recompute the seen record (D-05).
import type { CrewModel, FoulRecord, PlayTruth, RandomStream, Ruling, RulingContext } from '@gm/schema';
import { foulReplaySwitch, reviewableKey } from './params.ts';
import { detectionClass, phantomCallChance, phantomRecord, trueFoulCallChance, type FoulEvent } from './detection.ts';
import { decideRulings } from './rulings.ts';
import { deadBallIndex, seenFrom } from './seen.ts';
import { officialSpots, viewOf, type OfficialSpot } from './zones.ts';

function streamsFor(truth: PlayTruth, ctx: RulingContext): (o: OfficialSpot) => RandomStream {
  const open = new Map<number, RandomStream>();
  return (o) => {
    let s = open.get(o.index);
    if (!s) { s = ctx.streams('officials', [truth.gameId, truth.playNumber, o.index]); open.set(o.index, s); }
    return s;
  };
}

export function perceive(truth: PlayTruth, candidates: readonly FoulRecord[], ctx: RulingContext): { seen: PlayTruth; rulings: Ruling[]; fouls: FoulRecord[] } {
  const spots = officialSpots(truth, ctx);
  const streamOf = streamsFor(truth, ctx);
  const offense = ctx.situation.offense;

  const rulings = decideRulings(truth, ctx, spots, streamOf);
  const seen = seenFrom(truth, rulings, new Set(), ctx, null);

  const deadIndex = deadBallIndex(truth);
  const dead = deadIndex >= 0 ? truth.events[deadIndex]! : null;
  // A play shut down before the snap was shut down by a flag: those fouls were seen by construction.
  const shutDown = dead !== null && dead.type === 'dead_ball' && dead.reason === 'pre_snap_foul';
  const foulEventAt = (index: number | null): FoulEvent | null => {
    const e = index === null ? undefined : truth.events[index];
    return e && e.type === 'foul_committed' ? e : null;
  };

  const fouls: FoulRecord[] = [];
  const foulRulings: Ruling[] = [];
  const rule = (record: FoulRecord, e: FoulEvent | null, eventIndex: number) => {
    const cls = detectionClass(record, offense);
    const view = viewOf(spots, record.spot.x, record.spot.y, cls.family, ctx);
    const borderline = e !== null && e.borderline;
    let called: boolean;
    if (e === null) {
      // A candidate with no truth event behind it cannot be weighed; it is taken as the foul module gave it.
      called = true;
    } else if (borderline) {
      const p = phantomCallChance(cls, e, ctx);
      called = p > 0 && streamOf(view.official).chance(p);
    } else if (shutDown && record.timing === 'before_snap') {
      called = true;
    } else {
      called = streamOf(view.official).chance(trueFoulCallChance(cls, e, view, ctx));
    }
    fouls.push({ ...record, called, correct: borderline ? !called : called });
    foulRulings.push({
      aspect: 'foul', eventIndex,
      trueValue: borderline ? 'no_foul' : 'foul', calledValue: called ? 'foul' : 'no_foul',
      marginYd: null, marginS: null, visibility: e ? e.visibility : 'open', official: view.official.position,
      reviewable: ctx.rules.bool(reviewableKey('foul')) || foulReplaySwitch(ctx.rules, record.foulId, 'replay_reviewed'),
    });
  };

  const listed = new Set<number>();
  for (const c of candidates) {
    if (c.eventIndex !== null) listed.add(c.eventIndex);
    rule(c, foulEventAt(c.eventIndex), c.eventIndex ?? (deadIndex >= 0 ? deadIndex : 0));
  }
  // Borderline acts the foul module did not list: each may still draw a mistaken flag.
  truth.events.forEach((e, i) => {
    if (e.type !== 'foul_committed' || !e.borderline || listed.has(i)) return;
    const record = phantomRecord(e, i, truth, ctx);
    if (record) rule(record, e, i);
  });

  return { seen, rulings: [...rulings, ...foulRulings], fouls };
}

/** The crew model of WP-05. It keeps no state between calls. */
export const crewModel: CrewModel = { perceive };

/**
 * Index into the foul list of the foul a ruling is about, or -1. The foul rulings are the last ones
 * of the list and stand in the order of the fouls, so the facade can set `called` false on a foul
 * whose ruling replay reversed.
 */
export function foulIndexOfRuling(rulings: readonly Ruling[], rulingIndex: number): number {
  const r = rulings[rulingIndex];
  if (!r || r.aspect !== 'foul') return -1;
  let k = -1;
  for (let i = 0; i <= rulingIndex; i++) if (rulings[i]!.aspect === 'foul') k++;
  return k;
}

/** The fouls after replay: a flag whose ruling was reversed is picked up (B9.4.2 rule 5, B9.5.1 rule 2). */
export function foulsAfterReview(fouls: readonly FoulRecord[], rulings: readonly Ruling[], reversed: readonly number[]): FoulRecord[] {
  const out = fouls.map((f) => ({ ...f }));
  for (const i of reversed) {
    const k = foulIndexOfRuling(rulings, i);
    const f = k >= 0 ? out[k] : undefined;
    if (f) { f.called = false; f.correct = true; }
  }
  return out;
}
