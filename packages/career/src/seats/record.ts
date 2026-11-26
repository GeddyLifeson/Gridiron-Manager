// S5.5.1 role log. One record per graded game-day event with what the user had at the time (view, time
// available), his entry, the truth, and the grade. The role report shows accuracy by family only after enough
// graded events, median speed, and advice quality beside the share that worked out. Simulated games write
// estimated records from his running averages, marked so, and never count for certified mode (N4).
import { round } from '../gameday/math.ts';
import { sp } from './params.ts';
import type { SeatRole } from './sheet.ts';

export type RecordKind = 'booth' | 'chart' | 'relay' | 'flag' | 'signal' | 'substitution' | 'correction' | 'report' | 'advice' | 'call' | 'compliance';

export interface RoleRecord {
  readonly kind: RecordKind;
  readonly role: SeatRole;
  readonly seatId: number;
  readonly gameId: number;
  readonly playId: number | null;
  /** What he saw: booth overhead, sideline, tablet stills, broadcast angle. */
  readonly view: 'booth' | 'sideline' | 'tablet' | 'broadcast' | 'none';
  readonly timeAvailableS: number | null;
  readonly entry: string | null;
  readonly truth: string | null;
  /** 0 to 1. */
  readonly grade: number;
  readonly seconds: number | null;
  /** Family the event belongs to (coverage family, front, pressure type) for career charts. */
  readonly family: string | null;
  /** Advice and corrections: whether it worked out, kept apart from the grade. */
  readonly workedOut: boolean | null;
  /** Signals and substitutions: wrong or late. */
  readonly error: 'wrong' | 'late' | null;
  readonly simulated: boolean;
}

export type Share = { readonly value: number; readonly n: number } | 'not_enough_yet';

function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface RoleReport {
  readonly games: number;
  readonly accuracy: Share;
  readonly byFamily: Readonly<Record<string, Share>>;
  readonly medianSeconds: number | null;
  readonly advice: { readonly matchedModel: Share; readonly workedOut: Share };
  readonly corrections: { readonly given: number; readonly worked: number };
  readonly signalErrorsPerGame: number | null;
  readonly lateRelaysPerGame: number | null;
  readonly estimated: boolean;
}

const share = (hits: number, n: number, min: number): Share => n >= min && n > 0 ? { value: round(hits / n, 3), n } : 'not_enough_yet';

/** The role report over a set of records (one game after the game, or a season or career). */
export function roleReport(records: readonly RoleRecord[], certifiedOnly = false): RoleReport {
  const rs = certifiedOnly ? records.filter((r) => !r.simulated) : records;
  const games = new Set(rs.map((r) => r.gameId)).size;
  const recog = rs.filter((r) => r.kind === 'booth' || r.kind === 'relay' || r.kind === 'chart');
  const min = sp('log.familyMinEvents');
  const fam: Record<string, { h: number; n: number }> = {};
  for (const r of recog) if (r.family) { const f = (fam[r.family] ??= { h: 0, n: 0 }); f.h += r.grade; f.n++; }
  const byFamily = Object.fromEntries(Object.entries(fam).map(([k, v]) => [k, share(v.h, v.n, min)]));
  const advice = rs.filter((r) => r.kind === 'advice');
  const corr = rs.filter((r) => r.kind === 'correction');
  const sig = rs.filter((r) => r.kind === 'signal' || r.kind === 'substitution');
  return {
    games,
    accuracy: share(recog.reduce((s, r) => s + r.grade, 0), recog.length, 1),
    byFamily,
    medianSeconds: median(recog.flatMap((r) => r.seconds === null ? [] : [r.seconds])),
    advice: {
      matchedModel: share(advice.reduce((s, r) => s + r.grade, 0), advice.length, 1),
      workedOut: share(advice.filter((r) => r.workedOut === true).length, advice.filter((r) => r.workedOut !== null).length, 1),
    },
    corrections: { given: corr.length, worked: corr.filter((r) => r.workedOut === true).length },
    signalErrorsPerGame: games ? round(sig.filter((r) => r.error === 'wrong').length / games, 2) : null,
    lateRelaysPerGame: games ? round(sig.filter((r) => r.error === 'late').length / games, 2) : null,
    estimated: rs.some((r) => r.simulated),
  };
}

/** A season line, or null with fewer than `log.seasonMinGames` games in the role. */
export function seasonLine(records: readonly RoleRecord[], role: SeatRole): RoleReport | null {
  const mine = records.filter((r) => r.role === role);
  if (new Set(mine.map((r) => r.gameId)).size < sp('log.seasonMinGames')) return null;
  return roleReport(mine);
}

/**
 * Estimated records for a simulated game (S5.5.1 edge case, S10): one per expected event at his running average,
 * marked simulated. They never count for certified mode.
 */
export function estimateGame(prior: readonly RoleRecord[], gameId: number, role: SeatRole, seatId: number, events: number): RoleRecord[] {
  const mine = prior.filter((r) => r.role === role && !r.simulated);
  const avg = mine.length ? mine.reduce((s, r) => s + r.grade, 0) / mine.length : 0;
  const kind: RecordKind = mine[0]?.kind ?? 'booth';
  return Array.from({ length: events }, () => ({
    kind, role, seatId, gameId, playId: null, view: 'none' as const, timeAvailableS: null, entry: null, truth: null,
    grade: round(avg, 3), seconds: null, family: null, workedOut: null, error: null, simulated: true,
  }));
}

/** Records feed the S4.3.1 grade records: the game's mean grade by kind, certified records only. */
export function gradeSummary(records: readonly RoleRecord[]): Record<string, number> {
  const by: Record<string, { s: number; n: number }> = {};
  for (const r of records) if (!r.simulated) { const b = (by[r.kind] ??= { s: 0, n: 0 }); b.s += r.grade; b.n++; }
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, round(v.s / v.n, 3)]));
}
