// Position of one slot at a tick time from the decoded film (linear between ticks, never beyond the
// last stored tick; the same rule as the G-03 sampler).
import type { FilmFrames } from '../../../field-view/index.ts';
import type { PointLike } from '../types.ts';

export function slotAt(f: FilmFrames, slot: number, tick: number): PointLike {
  const t = Math.min(Math.max(tick - f.firstTick, 0), f.tickCount - 1);
  const i = Math.floor(t), j = Math.min(i + 1, f.tickCount - 1), a = t - i;
  const n = f.slotCount;
  return {
    x: f.x[i * n + slot]! + (f.x[j * n + slot]! - f.x[i * n + slot]!) * a,
    y: f.y[i * n + slot]! + (f.y[j * n + slot]! - f.y[i * n + slot]!) * a,
  };
}
