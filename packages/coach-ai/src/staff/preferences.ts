// Staff learn the head coach's preferences and bring their own (Marlon 2026-11-26 07:08: "the staff
// should learn my preferences ... and they can have their own that they suggest to me ... in like a one
// on one meeting during the week before a game"). Built on K6 (staff AI), K6.3.2 and L4.3.3 (candor),
// N3 (the decision log is what he learns from) and H4 (game-week meetings).
//
// What a staff member learns is only what he could have seen: the head coach's own logged decisions of
// the kinds his duties touch, made since he joined. Nothing hidden is read: no truth view, no rating.
// A habit becomes a preference once he has seen enough of it going one way. His own suggestions come
// from his own estimates (the caller's K4/K5 port answers `ownPick`), and whether he raises one in the
// meeting goes through the same candor rule as the headset, with `headset: false` (a meeting, H4).
import { decisions } from '@gm/models';
import type { Draws } from '../profile/index.ts';
import { voice, type CandorHistory, type CandorOutcome } from './candor.ts';
import { P } from './params.ts';
import type { StaffMember } from './types.ts';

type LogView = decisions.DecisionView;
type LogRecord = decisions.DecisionRecord;

/** What one staff member was in a position to see. */
export interface PreferenceWindow {
  readonly staffId: number;
  /** The head coach whose habits he is learning (the user). */
  readonly headCoachId: number;
  /** World date (ISO day) he joined the staff: he learns nothing from before it. */
  readonly sinceIso: string;
  /** Decision types (N3.2 catalogue) his duties let him see, for example an offensive coordinator's play calls and fourth downs. */
  readonly types: readonly string[];
}

/** One habit he has noticed, with the decisions behind it (the screen shows the count, never a score). */
export interface LearnedPreference {
  readonly staffId: number;
  readonly type: string;
  /** Situation bucket from the caller (K4.2.2 buckets for game decisions, the week phase for weekly ones). */
  readonly bucket: string;
  /** The option the head coach picks most often here. */
  readonly chosen: string;
  readonly times: number;
  readonly of: number;
  readonly decisionIds: readonly string[];
}

const byKey = (a: { type: string; bucket: string }, b: { type: string; bucket: string }): number =>
  a.type < b.type ? -1 : a.type > b.type ? 1 : a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0;

/** True when the record is the head coach's own choice inside the window (not delegated, not replaced). */
function seenOwnChoice(v: LogView, w: PreferenceWindow, types: ReadonlySet<string>): boolean {
  const r = v.record;
  return r.actor.kind === 'user' && r.actor.personId === w.headCoachId && types.has(r.type)
    && r.time.worldDate >= w.sinceIso && v.supersededBy.length === 0 && !r.notMade;
}

/**
 * The head coach's habits this staff member has noticed. A bucket counts once he has seen at least
 * `pref_min_seen` decisions there and one option took at least `pref_min_share` of them. Ties between
 * options go to the option id that sorts first, so the result is the same on every machine.
 */
export function learnPreferences(views: readonly LogView[], w: PreferenceWindow, bucketOf: (r: LogRecord) => string | null): LearnedPreference[] {
  const types = new Set(w.types);
  const groups = new Map<string, { type: string; bucket: string; picks: Map<string, string[]>; n: number }>();
  for (const v of views) {
    if (!seenOwnChoice(v, w, types)) continue;
    const bucket = bucketOf(v.record);
    if (bucket === null) continue;
    const key = `${v.record.type}\u0000${bucket}`;
    const g = groups.get(key) ?? { type: v.record.type, bucket, picks: new Map<string, string[]>(), n: 0 };
    const ids = g.picks.get(v.record.chosen) ?? [];
    ids.push(v.record.id);
    g.picks.set(v.record.chosen, ids);
    g.n++;
    groups.set(key, g);
  }
  const out: LearnedPreference[] = [];
  for (const g of groups.values()) {
    if (g.n < P('pref_min_seen')) continue;
    const [chosen, ids] = [...g.picks.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0]!;
    if (ids.length / g.n < P('pref_min_share')) continue;
    out.push({ staffId: w.staffId, type: g.type, bucket: g.bucket, chosen, times: ids.length, of: g.n, decisionIds: [...ids].sort() });
  }
  return out.sort((a, b) => b.of - a.of || byKey(a, b));
}

/** The head coach's preferred option for a decision, when this staff member has learned one. A staff-drafted sheet or plan starts from it. */
export function preferredOption(prefs: readonly LearnedPreference[], type: string, bucket: string): string | null {
  return prefs.find((p) => p.type === type && p.bucket === bucket)?.chosen ?? null;
}

/** His own answer for a type and bucket, from his own estimates (the caller's K4/K5 port). */
export interface OwnPick {
  readonly optionId: string;
  /** How much better he thinks his option is than the head coach's habit, by his own estimates (win-probability share). */
  readonly gap: number;
  /** His option is his own system's answer (a high-ego coach pushes it harder, K6.3.2). */
  readonly ownSystem: boolean;
}

export interface Suggestion {
  readonly staffId: number;
  readonly type: string;
  readonly bucket: string;
  /** What the head coach usually does here. */
  readonly yourHabit: string;
  readonly times: number;
  readonly of: number;
  /** What he would do instead. */
  readonly hisPick: string;
  readonly gap: number;
  readonly decisionIds: readonly string[];
}

/** What he brings to the one-on-one: the habits he has noticed, the suggestions he raises, and his candor memory. */
export interface OneOnOneAgenda {
  readonly staffId: number;
  readonly learned: readonly LearnedPreference[];
  readonly suggestions: readonly Suggestion[];
  /** One candor outcome per disagreement he weighed, raised or not (K6.3.2 writes a memory row either way). */
  readonly weighed: readonly CandorOutcome[];
  readonly history: CandorHistory;
}

/**
 * The agenda of a game-week one-on-one with one staff member. For each learned habit where his own
 * pick differs, he weighs speaking up with the meeting form of the candor rule; the largest gaps are
 * weighed first and at most `pref_suggestions_per_meeting` are raised. One uniform per weighed item.
 */
export function oneOnOneAgenda(
  member: StaffMember, learned: readonly LearnedPreference[], ownPick: (type: string, bucket: string) => OwnPick | null,
  history: CandorHistory, draws: Draws,
): OneOnOneAgenda {
  const differing = learned
    .map((p) => ({ p, mine: ownPick(p.type, p.bucket) }))
    .filter((x): x is { p: LearnedPreference; mine: OwnPick } => x.mine !== null && x.mine.optionId !== x.p.chosen && x.mine.gap > 0)
    .sort((a, b) => b.mine.gap - a.mine.gap || byKey(a.p, b.p));
  const cap = P('pref_suggestions_per_meeting');
  const suggestions: Suggestion[] = [];
  const weighed: CandorOutcome[] = [];
  let h = history;
  for (const { p, mine } of differing) {
    if (!member.available || suggestions.length >= cap) break;
    const o = voice(member, h, { gap: mine.gap, ownSystem: mine.ownSystem, headset: false }, draws);
    weighed.push(o);
    h = o.history;
    if (o.spoke) {
      suggestions.push({ staffId: member.personId, type: p.type, bucket: p.bucket, yourHabit: p.chosen, times: p.times, of: p.of, hisPick: mine.optionId, gap: mine.gap, decisionIds: p.decisionIds });
    }
  }
  return { staffId: member.personId, learned, suggestions, weighed, history: h };
}
