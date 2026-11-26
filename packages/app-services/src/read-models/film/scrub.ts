// Trajectory scrub (J1.6.2, O2.6.2, K9.1.1 item 3). Engine format 1 stores each player's engagement
// advantage per tick, a hidden contest value. Film may show positions, headings, gaze and move modes
// only, so every record the film filter hands out has that byte set to "no contest". Positions and
// everything else stay bit for bit (N1.1.1: film always matches what happened).
//
// Byte layout read here is engine-core's (src/tick/trajectory.ts, format 1): byte 0 officials; per
// tick 22 players of (dx, dy, dHeading, dGaze varints, move-mode byte, advantage byte), then the ball
// (state byte, three varints, carrier byte), then officials (three varints each).
import { SLOT_COUNT, type TrajectoryRecord } from '@gm/schema';

const FORMAT_WITH_ADVANTAGE = 1;
/** -128 as an unsigned byte: the engine's "in no contest" value. */
const NO_CONTEST_BYTE = 128;
const PLAYER_VARINTS = 4, BALL_VARINTS = 3, OFFICIAL_VARINTS = 3;
const CONTINUE = 128;

export class TrajectoryScrubError extends Error {}

/** Returns a copy of the record with every hidden advantage byte cleared. Other formats pass through unchanged. */
export function scrubTrajectory(rec: TrajectoryRecord): TrajectoryRecord {
  if (rec.formatVersion !== FORMAT_WITH_ADVANTAGE) return { ...rec, buffer: rec.buffer.slice() };
  const out = rec.buffer.slice();
  let at = 0;
  const skipVarint = () => {
    while (at < out.length && out[at]! >= CONTINUE) at++;
    if (at >= out.length) throw new TrajectoryScrubError('trajectory ends inside a number');
    at++;
  };
  const officials = out[at++]!;
  for (let t = 0; t < rec.tickCount; t++) {
    for (let s = 0; s < SLOT_COUNT; s++) {
      for (let k = 0; k < PLAYER_VARINTS; k++) skipVarint();
      at++; // move mode
      if (at >= out.length) throw new TrajectoryScrubError(`trajectory ends in tick ${t}`);
      out[at++] = NO_CONTEST_BYTE;
    }
    at++; // ball state
    for (let k = 0; k < BALL_VARINTS; k++) skipVarint();
    at++; // carrier
    for (let i = 0; i < officials; i++) for (let k = 0; k < OFFICIAL_VARINTS; k++) skipVarint();
  }
  if (at !== out.length) throw new TrajectoryScrubError(`trajectory has ${out.length - at} bytes after its last tick`);
  return { formatVersion: rec.formatVersion, firstTick: rec.firstTick, tickCount: rec.tickCount, buffer: out };
}
