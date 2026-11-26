// WP-24 first divergence of one play under two builds (Q1.3.2): the first tick where the two runs differ
// and the contest responsible. With the tick resolver's trajectories the tick comes from the frames;
// with the reference resolver (no trajectory) it comes from the first differing truth event.
import type { PlayResult, PlayTruth, TrajectoryRecord, TruthEvent } from '@gm/schema';
import { tick as tickEngine } from '@gm/engine-core';
import { hashOf } from '../batch/run.ts';

/** Seconds to ticks: one tick is one tenth of a second (J1.3.1). */
export const ticksOf = (tSeconds: number): number => Math.round(tSeconds * 10);

export type ContestSource = 'explain' | 'contest_event' | 'event_type' | 'none';

export interface PlayDivergence {
  /** First tick where the runs differ, or null when only the per-player deltas differ. */
  readonly firstTick: number | null;
  readonly tickSource: 'trajectory' | 'event' | 'none';
  /** Index into the truth events of the first differing event, or null when the event lists agree. */
  readonly eventIndex: number | null;
  /** Type of the differing event in each run (null: the run has no event at that index). */
  readonly baseEvent: string | null;
  readonly variantEvent: string | null;
  /** The contest responsible (J6 type name or the truth event's contest string), and how it was found. */
  readonly contest: string | null;
  readonly contestSource: ContestSource;
  /** Which parts differ. */
  readonly differs: { readonly truth: boolean; readonly deltas: boolean; readonly liveDuration: boolean };
  readonly baseDeadBall: string | null;
  readonly variantDeadBall: string | null;
}

/** Reads the contest at a tick out of an explain record (J4.6.2, Q2.6.1). Supplied by the tick engine's explainer. */
export type ExplainContest = (explain: unknown, tick: number) => string | null;

/** Contest a truth event stands for when no contest event or explain record names one (J6.2 to J6.7). */
const EVENT_CONTEST: Readonly<Partial<Record<TruthEvent['type'], string>>> = {
  pressure: 'passBlock', catch_point: 'catchPoint', tackle_attempt: 'tackle', fumble: 'fumble', snap: 'snap', exchange: 'snap',
};

function isTrajectory(v: unknown): v is TrajectoryRecord {
  return !!v && typeof v === 'object' && (v as TrajectoryRecord).buffer instanceof Uint8Array && typeof (v as TrajectoryRecord).formatVersion === 'number';
}

/** First tick where two trajectories differ, or null when they agree or cannot be read. */
export function firstTrajectoryTick(a: unknown, b: unknown): number | null {
  if (!isTrajectory(a) || !isTrajectory(b)) return null;
  let fa: ReturnType<typeof tickEngine.decodeTrajectory>, fb: typeof fa;
  try { fa = tickEngine.decodeTrajectory(a); fb = tickEngine.decodeTrajectory(b); } catch { return null; }
  const byTick = (fs: typeof fa) => new Map(fs.map((f) => [f.tick, f] as const));
  const ma = byTick(fa), mb = byTick(fb);
  const ticks = [...new Set([...ma.keys(), ...mb.keys()])].sort((x, y) => x - y);
  for (const t of ticks) {
    const x = ma.get(t), y = mb.get(t);
    if (!x || !y || hashOf(x) !== hashOf(y)) return t;
  }
  return null;
}

/** Index of the first truth event that differs, or null when both lists are equal. */
export function firstEventIndex(a: PlayTruth, b: PlayTruth): number | null {
  const n = Math.max(a.events.length, b.events.length);
  for (let i = 0; i < n; i++) {
    const x = a.events[i], y = b.events[i];
    if (!x || !y || hashOf(x) !== hashOf(y)) return i;
  }
  return null;
}

function lastContestAtOrBefore(events: readonly TruthEvent[], uptoIndex: number, t: number): string | null {
  for (let i = Math.min(uptoIndex, events.length - 1); i >= 0; i--) {
    const e = events[i]!;
    if (e.t > t) continue;
    if (e.type === 'contest') return e.contest;
  }
  return null;
}

const deadBall = (tr: PlayTruth): string | null => {
  const d = tr.events.find((e) => e.type === 'dead_ball');
  return d && d.type === 'dead_ball' ? d.reason : null;
};

/** Compares one play under two builds. Returns null when they agree in truth and deltas. */
export function playDivergence(base: PlayResult, variant: PlayResult, explainContest?: ExplainContest): PlayDivergence | null {
  const strip = (tr: PlayTruth) => { const { resolverId: _a, resolverVersion: _b, ...rest } = tr; return rest; };
  const truthDiffers = hashOf(strip(base.truth)) !== hashOf(strip(variant.truth));
  const deltasDiffer = hashOf(base.deltas) !== hashOf(variant.deltas);
  if (!truthDiffers && !deltasDiffer) return null;
  const liveDuration = base.truth.liveDurationTenths !== variant.truth.liveDurationTenths;

  const eventIndex = firstEventIndex(base.truth, variant.truth);
  const be = eventIndex === null ? undefined : base.truth.events[eventIndex];
  const ve = eventIndex === null ? undefined : variant.truth.events[eventIndex];
  const eventTick = be || ve ? ticksOf(Math.min(be?.t ?? Infinity, ve?.t ?? Infinity)) : null;
  const trajTick = firstTrajectoryTick(base.trajectory, variant.trajectory);

  let firstTick: number | null = null;
  let tickSource: PlayDivergence['tickSource'] = 'none';
  if (trajTick !== null && (eventTick === null || trajTick <= eventTick)) { firstTick = trajTick; tickSource = 'trajectory'; }
  else if (eventTick !== null) { firstTick = eventTick; tickSource = 'event'; }

  let contest: string | null = null;
  let contestSource: ContestSource = 'none';
  if (explainContest && firstTick !== null) {
    contest = explainContest(base.explain, firstTick) ?? explainContest(variant.explain, firstTick);
    if (contest) contestSource = 'explain';
  }
  if (!contest && (be?.type === 'contest' || ve?.type === 'contest')) {
    contest = be?.type === 'contest' ? be.contest : ve?.type === 'contest' ? ve.contest : null;
    contestSource = 'contest_event';
  }
  if (!contest && eventIndex !== null && firstTick !== null) {
    const t = firstTick / 10;
    contest = lastContestAtOrBefore(base.truth.events, eventIndex, t) ?? lastContestAtOrBefore(variant.truth.events, eventIndex, t);
    if (contest) contestSource = 'contest_event';
  }
  if (!contest) {
    const typed = (be && EVENT_CONTEST[be.type]) ?? (ve && EVENT_CONTEST[ve.type]) ?? null;
    if (typed) { contest = typed; contestSource = 'event_type'; }
  }
  return {
    firstTick, tickSource, eventIndex, baseEvent: be?.type ?? null, variantEvent: ve?.type ?? null, contest, contestSource,
    differs: { truth: truthDiffers, deltas: deltasDiffer, liveDuration },
    baseDeadBall: deadBall(base.truth), variantDeadBall: deadBall(variant.truth),
  };
}
