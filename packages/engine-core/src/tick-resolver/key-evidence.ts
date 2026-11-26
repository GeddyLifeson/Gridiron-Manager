// J3.2.2 what a key shows a defender. The perception system accumulates run-pass evidence from an
// `EvidenceSource`; this is the one the tick resolver gives it. It describes the key by what the key
// did on the field as of the tick the defender is seeing (his key delay ago), never by the play call:
// a lineman who has come off the ball shows a low hat, one who has set back shows a high hat, one who
// has run down the line is a puller; a back who has come downhill shows a run path; a quarterback still
// holding the ball after the mesh shows a drop; a ball in another man's hands is a handoff. Play action
// (J3.3.1) is therefore not a special case here: whatever the line and the back show is what is read.
//
// Evidence sizes are the bible's starting values where J3.2.2 names one and the module author's where it
// does not (params.ts says which). The fake-quality scale of J3.3.1 and the screen and draw key sets are
// not built: screen and draw evidence stay at zero.
import { BALL_STATES, SLOT_COUNT, SLOTS_PER_TEAM, TICK_S, type Assignment, type TickWorld } from '@gm/schema';
import type { EvidenceSource } from '../perception/index.ts';
import { tickResolverParams } from './params.ts';

export interface KeyEvidence {
  readonly source: EvidenceSource;
  /** Call before the loop's `begin`. `assignmentOf` gives the slot's assignment for this play. */
  setPlay(assignmentOf: (slot: number) => Assignment | undefined): void;
  /** Call once a tick from the snap on, before the perception stage runs. */
  record(world: TickWorld): void;
}

const RING = 16;
const HELD = BALL_STATES.indexOf('held'), PASS_FLIGHT = BALL_STATES.indexOf('passInFlight');
const C_LINE = 1, C_QB = 2, C_BACK = 3;
const H_NONE = 0, H_LOW = 1, H_HIGH = 2, H_PULL_LEFT = 3, H_PULL_RIGHT = 4;

export function createKeyEvidence(): KeyEvidence {
  const px = new Float64Array(RING * SLOTS_PER_TEAM), py = new Float64Array(RING * SLOTS_PER_TEAM);
  const kind = new Int8Array(RING), carrier = new Int8Array(RING), tickAt = new Int32Array(RING);
  const px0 = new Float64Array(SLOTS_PER_TEAM), py0 = new Float64Array(SLOTS_PER_TEAM), cls = new Uint8Array(SLOTS_PER_TEAM);
  const hat = new Uint8Array(SLOTS_PER_TEAM), hatTick = new Int32Array(SLOTS_PER_TEAM);
  let behaviors: (string | null)[] = [];
  let last = -1, started = false;

  const at = (tick: number): number => (((tick % RING) + RING) % RING);

  const record = (w: TickWorld): void => {
    if (w.tick < 0 || w.tick === last) return;
    const f = w.frame, pl = w.players, i = at(w.tick), base = i * SLOTS_PER_TEAM;
    for (let s = 0; s < SLOTS_PER_TEAM; s++) {
      px[base + s] = (pl.posX[s]! - f.originX) * f.attackDir; py[base + s] = (pl.posY[s]! - f.originY) * f.attackDir;
    }
    kind[i] = BALL_STATES.indexOf(w.ball.kind); carrier[i] = w.ball.carrierSlot; tickAt[i] = w.tick;
    if (!started) {
      started = true; hat.fill(H_NONE); hatTick.fill(-1);
      const backDepth = tickResolverParams(w.params)['keyRead.backfieldDepthYd']!;
      for (let s = 0; s < SLOTS_PER_TEAM; s++) {
        px0[s] = px[base + s]!; py0[s] = py[base + s]!;
        const b = behaviors[s] ?? null;
        cls[s] = b === 'quarterback' ? C_QB : pl.eligible[s] !== 1 ? C_LINE : px0[s]! <= -backDepth ? C_BACK : 0;
      }
    }
    // A lineman's hat is what his first step showed. It is fixed then: a run blocker driven back by his man a second
    // later has not turned into a pass setter.
    const q = tickResolverParams(w.params), step = q['keyRead.lineStepYd']!, pull = q['keyRead.pullStepYd']!;
    for (let s = 0; s < SLOTS_PER_TEAM; s++) {
      if (cls[s] !== C_LINE || hatTick[s]! >= 0) continue;
      const dx = px[base + s]! - px0[s]!, dy = py[base + s]! - py0[s]!, ady = dy < 0 ? -dy : dy;
      if (ady >= pull && ady > (dx < 0 ? -dx : dx)) { hat[s] = dy > 0 ? H_PULL_LEFT : H_PULL_RIGHT; hatTick[s] = w.tick; }
      else if (dx >= step) { hat[s] = H_LOW; hatTick[s] = w.tick; }
      else if (dx <= -step) { hat[s] = H_HIGH; hatTick[s] = w.tick; }
    }
    last = w.tick;
  };

  const source: EvidenceSource = (w, _viewer, key, delayTicks, out) => {
    const seen = w.tick - delayTicks;
    if (!started || seen < 0 || last - seen >= RING || key < 0 || key >= SLOTS_PER_TEAM) return;
    const q = tickResolverParams(w.params), i = at(seen), base = i * SLOTS_PER_TEAM;
    if (tickAt[i] !== seen) return;
    const tS = seen * TICK_S, meshed = tS + 1e-9 >= q['keyRead.meshS']!;
    const k = kind[i]!, c = carrier[i]!;
    const handed = k === HELD && c >= 0 && c < SLOTS_PER_TEAM && cls[c] !== C_QB && cls[c] !== C_LINE;
    const qbHolds = k === HELD && c >= 0 && c < SLOTS_PER_TEAM && cls[c] === C_QB;

    // [0], [1]: the assigned key.
    const dx = px[base + key]! - px0[key]!, dy = py[base + key]! - py0[key]!;
    if (cls[key] === C_LINE) {
      const h = hatTick[key]! >= 0 && hatTick[key]! <= seen ? hat[key]! : H_NONE;
      if (h === H_PULL_LEFT || h === H_PULL_RIGHT) { out[0] = q['keyRead.pullEvidence']!; out[1] = h === H_PULL_LEFT ? 1 : -1; }
      else if (h === H_LOW) out[0] = q['keyRead.lineRunEvidence']!;
      else if (h === H_HIGH) out[0] = q['keyRead.linePassEvidence']!;
    } else if (cls[key] === C_QB) {
      if (qbHolds && meshed) out[0] = q['keyRead.qbDropEvidence']!;
      else if (handed) out[0] = q['keyRead.handoffEvidence']!;
    } else if (cls[key] === C_BACK) {
      if (handed && c === key) { out[0] = q['keyRead.handoffEvidence']!; out[1] = dy > 0 ? 1 : dy < 0 ? -1 : 0; }
      else if (dx >= q['keyRead.backStepYd']! && !meshed) { out[0] = q['keyRead.backPathEvidence']!; out[1] = dy > 0 ? 1 : dy < 0 ? -1 : 0; }
      else if (meshed && qbHolds) out[0] = q['keyRead.qbDropEvidence']!;
    } else if (qbHolds && dx >= q['keyRead.releaseStemYd']!) {
      // A receiver who has run his stem downfield while the quarterback holds the ball shows pass.
      out[0] = q['keyRead.releaseEvidence']!;
    }

    // [2], [3]: backfield flow, the same for every defender.
    if (k === PASS_FLIGHT) out[2] = q['keyRead.ballInAirEvidence']!;
    else if (handed) { const cy = py[base + c]! - py0[c]!; out[2] = q['keyRead.handoffEvidence']!; out[3] = cy > 0 ? 1 : cy < 0 ? -1 : 0; }
    else if (qbHolds && meshed) out[2] = q['keyRead.qbDropEvidence']!;
    else if (qbHolds) {
      // Before the mesh: the back's first steps (J3.2.2 "a back's first steps move them").
      let best = -1, bestDx = q['keyRead.backStepYd']!;
      for (let s = 0; s < SLOTS_PER_TEAM; s++) {
        if (cls[s] !== C_BACK) continue;
        const bx = px[base + s]! - px0[s]!;
        if (bx >= bestDx) { bestDx = bx; best = s; }
      }
      if (best >= 0) { const by = py[base + best]! - py0[best]!; out[2] = q['keyRead.backPathEvidence']!; out[3] = by > 0 ? 1 : by < 0 ? -1 : 0; }
      // No back coming downhill and the quarterback already off his spot with the ball: he is dropping.
      else if (px[base + c]! - px0[c]! <= -q['keyRead.qbDropStepYd']!) out[2] = q['keyRead.qbDropEvidence']!;
    }
    // A defender keyed on the quarterback reads through him to the mesh: before it, what the back shows.
    if (cls[key] === C_QB && qbHolds && !meshed) { out[0] = out[2]!; out[1] = out[3]!; }
  };

  return {
    source,
    setPlay(assignmentOf): void {
      behaviors = [];
      for (let s = 0; s < SLOTS_PER_TEAM; s++) behaviors.push(assignmentOf(s)?.behavior.type ?? null);
      last = -1; started = false; hat.fill(H_NONE); hatTick.fill(-1);
    },
    record,
  };
}
