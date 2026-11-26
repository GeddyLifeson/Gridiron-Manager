// Drills for the user (N5.3). All run outside career time and change nothing in the career.
// Call speed (N5.3.1), coverage and front recognition (N5.3.2), clock problems (N5.3.3), protection
// identification (N5.3.4). Situation and clip generation that needs the engine or the film room is
// injected (G-63 clip library, engine quick resolution); scoring, records and the clock arithmetic are here.
import { seedFromNumber, stream } from '@gm/engine-core';
import { param } from './params.ts';
import type { TeachingRules } from './rules.ts';

// ---------------------------------------------------------------- N5.3.1 call speed

/**
 * Seconds the caller has from the ball being ready to the last moment the call can reach the field.
 * Radio: the call must be finished before the radio cuts off (B13.13.1 cut-off reading), so the time to say
 * it comes off too. No radio (college levels without it): the signal method, whose time cost the caller
 * passes in `sayOrSignalSeconds` (N5.3.1 edge case).
 */
export function callDeadline(rules: TeachingRules, afterStoppage: boolean, sayOrSignalSeconds: number): number {
  const clock = afterStoppage ? rules.playClockAfterStoppageS : rules.playClockS;
  const cut = rules.radioAllowed ? rules.radioCutoffS : 0;
  return Math.max(0, clock - cut - sayOrSignalSeconds);
}

export interface CallRep { readonly seconds: number; readonly deadline: number; readonly correctSection: boolean }
export interface CallSession { readonly reps: readonly CallRep[] }

export interface CallSessionSummary {
  readonly reps: number;
  readonly medianSeconds: number;
  readonly worstSeconds: number;
  readonly late: number;
  readonly correctSectionShare: number;
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** N5.3.1 acceptance: a call made after the cut-off is marked late. */
export function isLate(r: CallRep): boolean { return r.seconds > r.deadline; }

export function summarizeCallSession(s: CallSession): CallSessionSummary {
  const secs = s.reps.map((r) => r.seconds);
  return {
    reps: s.reps.length,
    medianSeconds: median(secs),
    worstSeconds: secs.length ? Math.max(...secs) : 0,
    late: s.reps.filter(isLate).length,
    correctSectionShare: s.reps.length ? s.reps.filter((r) => r.correctSection).length / s.reps.length : 0,
  };
}

/** Chart series across sessions (N5.3.1: results chart time to call across sessions). */
export function callSpeedSeries(sessions: readonly CallSession[]): { session: number; median: number; worst: number }[] {
  return sessions.map((s, i) => { const x = summarizeCallSession(s); return { session: i + 1, median: x.medianSeconds, worst: x.worstSeconds }; });
}

// ---------------------------------------------------------------- N5.3.2 recognition

export type Shell = 'one_high' | 'two_high' | 'zero_high';

/** Truth label of a generated clip (exact: the clip is generated from a call record, rule 1). */
export interface ClipTruth {
  readonly clipId: string;
  readonly shell: Shell;
  /** Coverage family id (starter defensive call family or F10 family id). */
  readonly coverage: string;
  /** Pressure id, or null for no pressure. */
  readonly pressure: string | null;
  /** Disguise tier from depth of disguise and lateness of the tell (rule 1): 0 plain upward. */
  readonly disguise: number;
  /** The look is truly ambiguous before the snap: score only the post-snap answer (edge case). */
  readonly ambiguousPreSnap: boolean;
}

export interface RecognitionAnswer { readonly clipId: string; readonly shell: Shell | null; readonly coverage: string | null; readonly pressure: string | null }

export interface RecognitionResult { readonly clipId: string; readonly family: string; readonly disguise: number; readonly correct: boolean; readonly parts: { shell: boolean | null; coverage: boolean; pressure: boolean } }

export function scoreClip(t: ClipTruth, a: RecognitionAnswer): RecognitionResult {
  const shell = t.ambiguousPreSnap ? null : a.shell === t.shell;
  const coverage = a.coverage === t.coverage;
  const pressure = a.pressure === t.pressure;
  return { clipId: t.clipId, family: t.coverage, disguise: t.disguise, correct: (shell ?? true) && coverage && pressure, parts: { shell, coverage, pressure } };
}

export interface Accuracy { readonly key: string; readonly n: number; readonly correct: number; readonly share: number }

function accuracyBy(results: readonly RecognitionResult[], keyOf: (r: RecognitionResult) => string): Accuracy[] {
  const m = new Map<string, { n: number; c: number }>();
  for (const r of results) { const k = keyOf(r); const x = m.get(k) ?? { n: 0, c: 0 }; x.n++; if (r.correct) x.c++; m.set(k, x); }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, x]) => ({ key, n: x.n, correct: x.c, share: x.c / x.n }));
}

export const accuracyByFamily = (rs: readonly RecognitionResult[]): Accuracy[] => accuracyBy(rs, (r) => r.family);
export const accuracyByDisguise = (rs: readonly RecognitionResult[]): Accuracy[] => accuracyBy(rs, (r) => String(r.disguise));

/** The look that fools the user most: the family with the lowest share, ties to the larger sample. */
export function mostMissed(rs: readonly RecognitionResult[]): string | null {
  const a = accuracyByFamily(rs).filter((x) => x.correct < x.n);
  if (a.length === 0) return null;
  a.sort((x, y) => x.share - y.share || y.n - x.n || (x.key < y.key ? -1 : 1));
  return a[0]!.key;
}

/**
 * Next session's family mix (rule 3): `weakShare` of the clips from families the user misses, weighted
 * by miss rate; the rest spread over every family. Seeded. Returns one family id per clip.
 */
export function nextMix(history: readonly RecognitionResult[], families: readonly string[], count: number, seed: number): string[] {
  if (families.length === 0) return [];
  const st = stream(seedFromNumber(seed), 'teaching.mix', [count]);
  const acc = new Map(accuracyByFamily(history).map((a) => [a.key, a]));
  const miss = families.map((f) => { const a = acc.get(f); return a ? 1 - a.share : 0; });
  const totalMiss = miss.reduce((t, x) => t + x, 0);
  const weak = totalMiss > 0 ? Math.round(count * param('weakShare')) : 0;
  const out: string[] = [];
  const pickWeighted = (w: readonly number[]): string => {
    const tot = w.reduce((t, x) => t + x, 0);
    let u = st.uniform() * tot;
    for (let i = 0; i < w.length; i++) { u -= w[i]!; if (u < 0) return families[i]!; }
    return families[families.length - 1]!;
  };
  for (let i = 0; i < weak; i++) out.push(pickWeighted(miss));
  for (let i = weak; i < count; i++) out.push(families[Math.floor(st.uniform() * families.length)]!);
  return out;
}

// ---------------------------------------------------------------- N5.3.4 protection

/** One sound answer to a protection look (rule 2: more than one can be sound). */
export interface ProtectionAnswer {
  /** Defender the line is pointed at (the "Mike" for the protection), or null for "throw hot". */
  readonly point: string | null;
  /** Receiver or back who is hot, or null. */
  readonly hot: string | null;
  readonly action: 'as_called' | 'slide' | 'keep_back_in' | 'change_call' | 'throw_hot';
}

/** A generated look. `sound` is computed from F5 protection rules through the J4 assignment rules (injected). */
export interface ProtectionLook { readonly lookId: string; readonly pressure: string; readonly sound: readonly ProtectionAnswer[] }

export function sameAnswer(a: ProtectionAnswer, b: ProtectionAnswer): boolean {
  return a.point === b.point && a.hot === b.hot && a.action === b.action;
}

export interface ProtectionResult { readonly lookId: string; readonly pressure: string; readonly correct: boolean }

/** Each sound answer scores full credit (rule 2). A look the defense overloads lists only "throw hot". */
export function scoreLook(look: ProtectionLook, a: ProtectionAnswer): ProtectionResult {
  return { lookId: look.lookId, pressure: look.pressure, correct: look.sound.some((s) => sameAnswer(s, a)) };
}

export function protectionAccuracy(rs: readonly ProtectionResult[]): Accuracy[] {
  const m = new Map<string, { n: number; c: number }>();
  for (const r of rs) { const x = m.get(r.pressure) ?? { n: 0, c: 0 }; x.n++; if (r.correct) x.c++; m.set(r.pressure, x); }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, x]) => ({ key, n: x.n, correct: x.c, share: x.c / x.n }));
}

/**
 * Acceptance check for a stored look: every stored answer leaves no rusher unaccounted for, or is "hot".
 * `unaccounted` runs the answer through the J4 assignment rules and returns the rushers left free.
 */
export function lookProblems(look: ProtectionLook, unaccounted: (a: ProtectionAnswer) => readonly string[]): string[] {
  const out: string[] = [];
  if (look.sound.length === 0) out.push(`${look.lookId}: no sound answer stored`);
  for (const s of look.sound) {
    const free = unaccounted(s);
    if (free.length > 0 && s.hot === null && s.action !== 'throw_hot') out.push(`${look.lookId}: answer leaves ${free.join(', ')} free and names no hot`);
  }
  return out;
}

// ---------------------------------------------------------------- N5.3.3 clock problems

export interface KneelState {
  /** Game clock left in the half, seconds, with the clock about to start on the snap. */
  readonly clockS: number;
  readonly down: 1 | 2 | 3 | 4;
  readonly opponentTimeouts: number;
  /** The clock has already passed two minutes in this half (no warning stop left). */
  readonly pastTwoMinute: boolean;
}

export interface KneelPlan {
  /** True when kneeling every remaining down runs the clock out before possession can change. */
  readonly canKneelOut: boolean;
  /** Kneels needed (or used before the downs run out). */
  readonly kneels: number;
  /** Game clock left after the last kneel the offense runs (0 when it runs out). */
  readonly clockLeftS: number;
  /** Step-by-step worked answer for the review page. */
  readonly steps: readonly KneelStep[];
}

export interface KneelStep { readonly down: number; readonly clockAtSnap: number; readonly clockAfterPlay: number; readonly stop: 'none' | 'timeout' | 'two_minute' | 'expired'; readonly clockAtNextSnap: number }

/**
 * Kneel-down arithmetic solved exactly from the level's rules (N5.3.3 rule 1), never from a model.
 * The defense stops the clock after each kneel while it has timeouts; the two-minute stop (pro warning,
 * college two-minute timeout, rule key `clock.two_minute_timeout`) stops it once when crossed. Otherwise
 * the play clock (`clock.play_clock_s`) runs off before the next snap, less the snap margin. A kneel on the
 * last down that leaves time on the clock gives the ball up.
 */
export function kneelOut(s: KneelState, rules: TeachingRules, kneelPlayS = param('kneelPlaySeconds'), snapMarginS = param('snapMarginSeconds')): KneelPlan {
  let t = s.clockS;
  let timeouts = s.opponentTimeouts;
  let warned = s.pastTwoMinute || !rules.twoMinuteStop;
  const steps: KneelStep[] = [];
  const downs = 5 - s.down;
  for (let i = 0; i < downs; i++) {
    const at = t;
    t = Math.max(0, t - kneelPlayS);
    const crossed = !warned && at > rules.twoMinuteMarkS && t <= rules.twoMinuteMarkS;
    if (crossed) { t = rules.twoMinuteMarkS; warned = true; }
    if (t <= 0) { steps.push({ down: s.down + i, clockAtSnap: at, clockAfterPlay: 0, stop: 'expired', clockAtNextSnap: 0 }); return { canKneelOut: true, kneels: i + 1, clockLeftS: 0, steps }; }
    const last = i === downs - 1;
    if (last) { steps.push({ down: s.down + i, clockAtSnap: at, clockAfterPlay: t, stop: 'none', clockAtNextSnap: t }); break; }
    let stop: KneelStep['stop'] = 'none';
    let next = t;
    if (crossed) stop = 'two_minute';
    else if (timeouts > 0) { timeouts--; stop = 'timeout'; }
    else {
      next = Math.max(0, t - Math.max(0, rules.playClockS - snapMarginS));
      // The two-minute stop also interrupts the run-off between plays.
      if (!warned && t > rules.twoMinuteMarkS && next <= rules.twoMinuteMarkS) { next = rules.twoMinuteMarkS; warned = true; stop = 'two_minute'; }
    }
    steps.push({ down: s.down + i, clockAtSnap: at, clockAfterPlay: t, stop: next <= 0 ? 'expired' : stop, clockAtNextSnap: next });
    if (next <= 0) return { canKneelOut: true, kneels: i + 1, clockLeftS: 0, steps };
    t = next;
  }
  return { canKneelOut: false, kneels: downs, clockLeftS: t, steps };
}

/** A problem card (N5.3.3). `inBand` problems (coach's call) are never used (rule 3). */
export interface ClockProblem { readonly id: string; readonly level: 'pro' | 'college' | 'both'; readonly type: string; readonly inBand: boolean; readonly ruleSeason: string }

/** Problems usable for a save: level fits (rule 2), not in the band (rule 3), and built on the current rules (edge case). */
export function usableProblems(ps: readonly ClockProblem[], level: 'pro' | 'college', ruleSeason: string): ClockProblem[] {
  return ps.filter((p) => (p.level === 'both' || p.level === level) && !p.inBand && p.ruleSeason === ruleSeason);
}
