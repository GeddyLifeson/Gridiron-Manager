// Conditions (I1.3): the forecast error of the weather and field report (I1.3.1), the kicking lines by
// direction (I1.3.2, and their halftime update in I8.2.4), and the opponent warm-up watch (I1.3.3). The kick
// model is J9's: the caller passes the true make probability by field goal distance for each direction at
// current conditions; this module finds the lines and adds the coordinator's error.
import { gp } from './params.ts';
import { chance, lerp, normal, type Draw } from './math.ts';
import type { GameDayRules } from './rules.ts';

// ---------------------------------------------------------------------------------------------- I1.3.1

/** Wind forecast standard error at a lead time (I1.3.1: 3 mph at 1 hour, 6 at 3 hours, linear, 0 now). */
export function windForecastSe(leadHours: number): number {
  const h = leadHours < 0 ? 0 : leadHours;
  const at1 = gp('forecast.windSeAt1h'), at3 = gp('forecast.windSeAt3h');
  if (h <= 1) return at1 * h;
  return at1 + ((at3 - at1) / 2) * (h - 1);
}

/** One forecast value: the true later value plus zero-mean error that grows with lead time. Never negative. */
export function forecastWind(trueLaterMph: number, leadHours: number, draw: Draw): number {
  const v = trueLaterMph + windForecastSe(leadHours) * normal(draw);
  return v < 0 ? 0 : v;
}

// ---------------------------------------------------------------------------------------------- I1.3.2

export type Direction = 'north' | 'south';

/** Field goal distance from the line of scrimmage (yards to the goal line): end zone plus snap and hold. */
export function kickDistance(losYdToGoal: number, rules: GameDayRules): number {
  return losYdToGoal + rules.endZoneDepthYd + gp('kick.snapAndHoldYd');
}

/**
 * The farthest line of scrimmage (yards from the goal being attacked) at which the make probability is still at
 * least `p`. Scans whole yards outward; null when even the 1-yard line falls short.
 */
export function lineFor(makeProb: (distanceYd: number) => number, p: number, rules: GameDayRules, farthestLos = 60): number | null {
  let best: number | null = null;
  for (let los = 1; los <= farthestLos; los++) if (makeProb(kickDistance(los, rules)) >= p) best = los;
  return best;
}

export interface KickingLine {
  /** Line of scrimmage, yards from the goal being attacked; null when no kick reaches the probability. */
  readonly comfortable: number | null;
  readonly maximum: number | null;
}

export interface KickingLines {
  readonly true: Readonly<Record<Direction, KickingLine>>;
  readonly reported: Readonly<Record<Direction, KickingLine>>;
}

function noisy(v: number | null, sd: number, draw: Draw): number | null {
  if (v === null) return null;
  const r = Math.round(v + sd * normal(draw));
  return r < 1 ? 1 : r;
}

/**
 * I1.3.2: the true comfortable (75%) and maximum (40%) lines per direction from J9, and the special teams
 * coordinator's report, true plus error by his hidden accuracy (0 to 1). A perfect coordinator reports within
 * a yard (acceptance). The same function serves the halftime update (I8.2.4) with the new curves.
 */
export function kickingLines(curves: Readonly<Record<Direction, (distanceYd: number) => number>>, coordinatorAccuracy: number, rules: GameDayRules, draw: Draw): KickingLines {
  const sd = lerp(gp('kick.reportErrorAtZero'), gp('kick.reportErrorAtFull'), coordinatorAccuracy);
  const t = (dir: Direction): KickingLine => ({ comfortable: lineFor(curves[dir], gp('kick.comfortableMake'), rules), maximum: lineFor(curves[dir], gp('kick.maximumMake'), rules) });
  const tr = { north: t('north'), south: t('south') };
  const rep = (l: KickingLine): KickingLine => ({ comfortable: noisy(l.comfortable, sd, draw), maximum: noisy(l.maximum, sd, draw) });
  return { true: tr, reported: { north: rep(tr.north), south: rep(tr.south) } };
}

/** The user moves a reported line (accept or move, I1.3.2). Lines are stored by direction (I8.2.4). */
export function moveLine(lines: Readonly<Record<Direction, KickingLine>>, dir: Direction, which: keyof KickingLine, los: number | null): Record<Direction, KickingLine> {
  return { ...lines, [dir]: { ...lines[dir], [which]: los } } as Record<Direction, KickingLine>;
}

/** The direction a team attacks in a quarter, given the goal it defends (attack is away from it). */
export function attacking(defends: Direction): Direction {
  return defends === 'north' ? 'south' : 'north';
}

// ---------------------------------------------------------------------------------------------- I1.3.3

export interface OpponentPlayerView {
  readonly id: string;
  /** True state: limited by injury today (from D11, hidden). */
  readonly limited: boolean;
  readonly inactive: boolean;
}

export interface WarmupNote {
  readonly playerId: string;
  /** What the staff wrote: always "moving poorly"; a false note is one on a player who is fine. */
  readonly note: 'moving_poorly';
}

/**
 * I1.3.3: warm-up notes are noisy observations. Each limited active opponent is noticed with a probability by
 * staff observation accuracy (30% to 70%), and a healthy one draws a false note at 5%. The inactive list itself
 * is exact and is passed through by the caller when the level has one.
 */
export function warmupNotes(opponents: readonly OpponentPlayerView[], staffAccuracy: number, draw: Draw): WarmupNote[] {
  const pNotice = lerp(gp('watch.noticeAtZero'), gp('watch.noticeAtFull'), staffAccuracy);
  const out: WarmupNote[] = [];
  for (const o of opponents) {
    if (o.inactive) continue;
    const p = o.limited ? pNotice : gp('watch.falseNote');
    if (chance(p, draw)) out.push({ playerId: o.id, note: 'moving_poorly' });
  }
  return out;
}

/** I1.3.3: plan rules that name a now-inactive opponent (acceptance: every one is listed). */
export function rulesNamingInactive(planRules: readonly { id: string; names: readonly string[] }[], inactive: readonly string[]): string[] {
  return planRules.filter((r) => r.names.some((n) => inactive.includes(n))).map((r) => r.id).sort();
}
