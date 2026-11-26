// K4.3.2 to K4.3.7: from the stored mix to the mix the call is drawn from. Pure functions over arrays
// aligned with the candidate list. Each step bends the mix; none of them forbids a call (A3 ruling 22).
import { clamp } from '../profile/draws.ts';
import type { DefenseRates, OffenseRates, PersonnelKey, TendencyBlock } from '../profile/types.ts';
import { param } from './params.ts';
import leanTable from './pass-lean.json' with { type: 'json' };
import type { CallMath, CallSituation, SheetCall } from './types.ts';

export function normalise(w: readonly number[]): number[] {
  const t = w.reduce((a, x) => a + x, 0);
  if (!(t > 0)) return w.map(() => 1 / w.length);
  return w.map((x) => x / t);
}

/** K4.3.2 rule 3. A strong caller's best response is sharp, a weak one's is flat. */
export function temperature(zCallFit: number, math: CallMath): number {
  return param('tilt.temperature') * math.exp(-param('tilt.temperatureZ') * zCallFit);
}

export function softmax(u: readonly number[], t: number, math: CallMath): number[] {
  let top = -Infinity;
  for (const x of u) if (x > top) top = x;
  return normalise(u.map((x) => math.exp((x - top) / t)));
}

export interface TiltInputs {
  readonly sigma: readonly number[];
  /** Payoff rows per candidate over the look classes. */
  readonly payoff: readonly (readonly number[])[];
  readonly belief: readonly number[];
  readonly zCallFit: number;
  /** Plays of evidence in this bucket (K4.3.2 rule 4). */
  readonly evidence: number;
  readonly n0: number;
  /** Last result of each candidate this game in expected points; 0 when not yet called. */
  readonly lastEpa: readonly number[];
}

/** K4.3.2: `mix1 = (1 - tau) sigmaStar + tau q`. Also returns the parts for the call record. */
export function tilt(inp: TiltInputs, math: CallMath): { mix: number[]; u: number[]; q: number[]; tau: number } {
  const rho = param('tilt.rhoPerZ') * Math.max(0, -inp.zCallFit);
  const u = inp.payoff.map((row, i) => row.reduce((a, x, j) => a + x * inp.belief[j]!, 0) + rho * inp.lastEpa[i]!);
  const q = softmax(u, temperature(inp.zCallFit, math), math);
  const tau = inp.evidence <= 0 ? 0 : param('tilt.tauMax') * inp.evidence / (inp.evidence + inp.n0);
  return { mix: inp.sigma.map((s, i) => (1 - tau) * s + tau * q[i]!), u, q, tau };
}

/**
 * K4.3.7 rule 1 for one tag dimension. `scope` marks the candidates the wanted share is defined over
 * (all plays, or only passes for a share of dropbacks); the scope's total weight is left unchanged.
 * Skipped when no candidate, or every candidate, in scope carries the tag (edge case).
 */
export function leanDimension(mix: readonly number[], has: readonly boolean[], scope: readonly boolean[], wanted: number, math: CallMath): number[] {
  let mass = 0, withTag = 0;
  for (let i = 0; i < mix.length; i++) if (scope[i]) { mass += mix[i]!; if (has[i]) withTag += mix[i]!; }
  if (!(mass > 0)) return [...mix];
  const s = withTag / mass;
  if (s <= 0 || s >= 1) return [...mix];
  const r = clamp(wanted, param('lean.rateMin'), param('lean.rateMax'));
  const eta = param('lean.eta');
  const up = math.pow(r / s, eta), down = math.pow((1 - r) / (1 - s), eta);
  const out = mix.map((x, i) => (scope[i] ? x * (has[i] ? up : down) : x));
  let after = 0;
  for (let i = 0; i < out.length; i++) if (scope[i]) after += out[i]!;
  return out.map((x, i) => (scope[i] ? (x * mass) / after : x));
}

interface LeanBand { readonly id: string; readonly maxMargin: number; readonly rate: readonly number[] }
const BANDS = leanTable.bands as readonly LeanBand[];
const TIED = BANDS.find((b) => b.id === 'tied')!;

/** Status of the measured table, for reports (never typed: read from the data file). */
export const PASS_LEAN_SOURCE = { source: leanTable.source, status: leanTable.status } as const;

/**
 * K4.3.7 rule 3 `passLeanByState`: the change in wanted pass share for an offense at this margin and
 * stage of the game, as a share (0.2 is twenty percentage points). The table cell minus the tied cell of the same
 * quarter. Overtime reads the last regulation quarter's row (Assumption).
 */
export function passLean(margin: number, period: number, regulationPeriods: number, overtime: boolean): number {
  const q = overtime ? 4 : clamp(Math.ceil((period * 4) / regulationPeriods), 1, 4);
  const band = BANDS.find((b) => margin <= b.maxMargin) ?? BANDS[BANDS.length - 1]!;
  return band.rate[q - 1]! - TIED.rate[q - 1]!;
}

function tendencyScale(z: number): number {
  return clamp(1 + param('lean.tendencyPerZ') * z, param('lean.tendencyScaleMin'), param('lean.tendencyScaleMax'));
}

/** The wanted pass share away from neutral: the system's neutral rate plus the scaled game-state lean. */
export function wantedPassShare(neutralPass: number, s: CallSituation, t: Pick<TendencyBlock, 'deficitUrgency' | 'leadProtection'>): number {
  const lean = passLean(s.margin, s.period, s.regulationPeriods, s.overtime);
  const scale = s.margin < 0 ? tendencyScale(t.deficitUrgency) : s.margin > 0 ? tendencyScale(t.leadProtection) : 1;
  return neutralPass + lean * scale;
}

const tag = (c: readonly SheetCall[], k: keyof SheetCall['tags']): boolean[] => c.map((x) => x.tags[k] === true);

/** K4.3.7 offense: pass share with the game-state lean, then the shares inside the pass game, then personnel. */
export function leanOffense(mix: readonly number[], calls: readonly SheetCall[], rates: OffenseRates, weights: Readonly<Record<PersonnelKey, number>>,
  s: CallSituation, t: Pick<TendencyBlock, 'deficitUrgency' | 'leadProtection'>, math: CallMath): number[] {
  const all = calls.map(() => true);
  const pass = tag(calls, 'pass');
  let m = leanDimension(mix, pass, all, wantedPassShare(rates.neutralPass, s, t), math);
  m = leanDimension(m, tag(calls, 'playAction'), pass, rates.playAction, math);
  m = leanDimension(m, tag(calls, 'screen'), pass, rates.screen, math);
  m = leanDimension(m, tag(calls, 'deepShot'), pass, rates.deepShot, math);
  m = leanDimension(m, tag(calls, 'rpo'), all, rates.rpo, math);
  // Personnel: one multi-way dimension. Skipped when the box holds a single grouping.
  const groups = [...new Set(calls.map((c) => c.personnel).filter((p): p is PersonnelKey => p !== null))].sort();
  if (groups.length > 1) {
    const share = new Map<PersonnelKey, number>();
    calls.forEach((c, i) => { if (c.personnel) share.set(c.personnel, (share.get(c.personnel) ?? 0) + m[i]!); });
    const eta = param('lean.eta');
    m = normalise(m.map((x, i) => {
      const p = calls[i]!.personnel;
      const sk = p ? share.get(p)! : 0;
      if (!p || !(sk > 0)) return x;
      return x * math.pow(clamp(weights[p], param('lean.rateMin'), param('lean.rateMax')) / sk, eta);
    }));
  }
  return normalise(m);
}

/** K4.3.7 rule 4 defense: system rates, with more two-high and fewer blitzes when protecting a late lead. */
export function leanDefense(mix: readonly number[], calls: readonly SheetCall[], rates: DefenseRates, s: CallSituation,
  t: Pick<TendencyBlock, 'lateDefenseRisk'>, math: CallMath): number[] {
  const all = calls.map(() => true);
  // The offense he faces trails by his lead: its lean toward the pass is what he protects against.
  const theirs = Math.max(0, passLean(-s.margin, s.period, s.regulationPeriods, s.overtime));
  const shift = s.margin > 0 ? param('lean.defenseFactor') * theirs * tendencyScale(-t.lateDefenseRisk) : 0;
  let m = leanDimension(mix, tag(calls, 'blitz'), all, rates.blitz - shift, math);
  m = leanDimension(m, tag(calls, 'simulatedPressure'), all, rates.simulatedPressure, math);
  m = leanDimension(m, tag(calls, 'man'), all, rates.man, math);
  m = leanDimension(m, tag(calls, 'twoHigh'), all, rates.twoHigh + shift, math);
  return normalise(m);
}

/** K4.3.3 rule 2 strength. Zero at z = -2 or below: that coach does not look at his own tendencies. */
export function selfScoutKappa(zSelfScout: number): number {
  return param('selfScout.kappa') * clamp(1 + zSelfScout / 2, 0, param('selfScout.kappaClampMax'));
}

/**
 * K4.3.3: `ownCounts` is the caller's own charted calls in this bucket over the scouting window, by
 * look class: the same rows an opponent sees (N2.3.1). `s_i` is the share the class would have if
 * the candidate were called now.
 */
export function selfScoutPenalty(mix: readonly number[], calls: readonly SheetCall[], ownCounts: Readonly<Record<string, number>>, zSelfScout: number, math: CallMath): number[] {
  const kappa = selfScoutKappa(zSelfScout);
  if (kappa <= 0) return [...mix];
  let total = 0;
  for (const k of Object.keys(ownCounts)) total += ownCounts[k]!;
  const limit = param('selfScout.limit');
  return normalise(mix.map((x, i) => {
    const s = ((ownCounts[calls[i]!.lookClass] ?? 0) + 1) / (total + 1);
    return s > limit ? x * math.exp(-kappa * (s - limit)) : x;
  }));
}

/** K4.3.4 rule 1: complements and constraints of triggered packages are called more. */
export function sequenceBoost(mix: readonly number[], calls: readonly SheetCall[], boosted: ReadonlySet<string>): number[] {
  if (boosted.size === 0) return [...mix];
  const k = param('sequence.multiplier');
  return normalise(mix.map((x, i) => (boosted.has(calls[i]!.callId) ? x * k : x)));
}

/**
 * K4.3.5: multiply by estimated readiness squared. Below the cut a call is all but dropped, unless
 * the box would hold fewer than 2 ready calls. It keeps a small chance (A3 ruling 22): coaches do
 * sometimes call what was not practised, and it busts (J4.5.2).
 */
export function readinessCheck(mix: readonly number[], readiness: readonly number[], math: CallMath): number[] {
  const cut = param('readiness.cut');
  const ready = readiness.filter((r) => r >= cut).length;
  const power = param('readiness.power');
  return normalise(mix.map((x, i) => {
    const r = clamp(readiness[i]!, 0, 1);
    const below = r < cut && ready >= param('bucket.minCandidates') ? param('readiness.belowCutFactor') : 1;
    return x * (r > 0 ? math.pow(r, power) : 0) * below;
  }));
}

/** A3 ruling 22: every legal, available candidate keeps a chance above zero. */
export function floorPossible(mix: readonly number[]): number[] {
  const f = param('mix.possibleFloor');
  return normalise(normalise(mix).map((x) => (x < f ? f : x)));
}

/** K4.3.6 rule 1: one uniform selects from the mix. */
export function drawIndex(mix: readonly number[], u: number): number {
  let x = u;
  for (let i = 0; i < mix.length; i++) { x -= mix[i]!; if (x < 0) return i; }
  return mix.length - 1;
}
