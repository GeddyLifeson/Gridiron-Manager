// Media and obligations (H7): required sessions and their count, skipping, coordinators' days, the
// stance model, hot topics, leaks, off-message quotes, promises, injury answers, officials, the coach's
// show, and the college media week. Effects leave as events with signs; receivers own sizes (H7.2.1 rule 2).
import { possible } from '@gm/schema';
import STANCES from './data/stances.json' with { type: 'json' };
import { WEEKDAY, instantValue, weekday, MINUTES_PER_DAY, type Instant } from '../calendar/date.ts';
import type { RuleLookup } from '../calendar/types.ts';
import { involvesAtom } from './atoms.ts';
import { allBlocks } from './build.ts';
import { flag } from './keys.ts';
import { P } from './params.ts';
import type { Block, Finding, Week } from './types.ts';
import type { ViolationRequest } from './edit.ts';

/** An effect sent to another category (L1, L2, L4, L5, L6, K3, C11, E10, T4, S4, S6). */
export interface WeekEvent {
  readonly to: string;
  readonly kind: string;
  readonly effect: string;
  readonly subject?: string | number;
}

function mediaFinding(ruleId: string, plain: string, leaf: string, status: 'Verified' | '1 of 3' | 'Assumption'): Finding {
  return { ruleId, hardness: 'hard', classId: 'media_policy', plain, penalty: 'Conduct detrimental; no published amount (C11.5.1)', leaf, blockId: null, developerWarning: status !== 'Verified' };
}

const hcSessions = (week: Week): Block[] => allBlocks(week).filter((b) => b.type === 'media' && involvesAtom(b, 'head_coach'));

/** Days of the practice week the head coach's availability counts on (H7.1.1 rule 1). */
function practiceWeekDays(week: Week): number[] {
  const prep = week.days.filter((d) => d.gMinus > 0);
  return prep.slice(Math.max(0, prep.length - P('normal_prep_days'))).map((d) => d.day);
}

/**
 * The validator for the required sessions (H7.1.1 rule 3; H7.4.1 for a college rule set). It warns;
 * the template still saves. Phase `conference_championship` adds the Wednesday to Friday rule (rule 6).
 */
export function mediaFindings(week: Week, rules: RuleLookup, phaseId?: string): Finding[] {
  const out: Finding[] = [];
  const s = hcSessions(week);
  if (flag(rules, 'media.post_game_required') && !s.some((b) => b.session === 'post_game')) {
    out.push(mediaFinding('media.post_game', 'A news conference after every game', 'H7.1.1', '1 of 3'));
  }
  if (flag(rules, 'media.day_after_required') && week.previousGameDay !== null && !s.some((b) => b.session === 'day_after')) {
    out.push(mediaFinding('media.day_after', 'Availability the day after every game', 'H7.1.1', '1 of 3'));
  }
  const days = rules('media.head_coach_days_per_week');
  if (days !== undefined) {
    const span = new Set(week.shape === 'bye' && flag(rules, 'media.bye_week_required') ? week.days.filter((d) => d.gMinus > 0).map((d) => d.day) : practiceWeekDays(week));
    const countsAfter = flag(rules, 'media.day_after_counts_toward_week');
    const held = new Set(s.filter((b) => span.has(b.start.day) && (b.session === 'mid_week' || (countsAfter && b.session === 'day_after'))).map((b) => b.start.day));
    // The span is the practice week before the game. In a bye week that leaves the bye's own calendar week
    // out, which is the default of media.bye_week_required (off); with the flag on, the whole week counts.
    if (held.size < days) out.push(mediaFinding('media.head_coach_days', `Head coach available on at least ${days} days of the practice week`, 'H7.1.1', '1 of 3'));
  }
  if (phaseId === 'conference_championship' && rules('media.conference_championship_days') !== undefined) {
    const need = [WEEKDAY.wed, WEEKDAY.thu, WEEKDAY.fri];
    const have = new Set(s.filter((b) => b.session === 'mid_week' || b.session === 'day_after').map((b) => weekday(b.start.day)));
    if (!need.every((w) => have.has(w))) out.push(mediaFinding('media.conference_championship', 'Conference championship week: the head coach is available Wednesday, Thursday and Friday', 'H7.1.1', '1 of 3'));
  }
  const weekly = rules('media.college_weekly_conferences');
  if (weekly !== undefined && s.filter((b) => b.session === 'weekly_conference').length < weekly) {
    out.push(mediaFinding('media.college_weekly', 'The weekly news conference', 'H7.4.1', 'Assumption'));
  }
  return out;
}

/**
 * Coordinators' sessions (H7.1.2 rule 1): each coordinator at least once Monday to Friday, on a day the
 * head coach is not, when such a day is free. Returns the coordinator groups that break it.
 */
export function coordinatorProblems(week: Week, rules: RuleLookup): string[] {
  if (rules('media.coordinator_sessions_per_week') === undefined) return [];
  const hcDays = new Set(hcSessions(week).map((b) => b.start.day));
  const weekdays = week.days.filter((d) => d.gMinus > 0 && weekday(d.day) >= WEEKDAY.mon && weekday(d.day) <= WEEKDAY.fri).map((d) => d.day);
  const freeDayExists = weekdays.some((d) => !hcDays.has(d));
  const out: string[] = [];
  for (const g of ['off_staff', 'def_staff', 'st_staff'] as const) {
    const ss = allBlocks(week).filter((b) => b.type === 'media' && b.session === 'coordinator' && b.attendees.includes(g) && weekdays.includes(b.start.day));
    if (ss.length === 0) out.push(`${g}:missing`);
    else if (freeDayExists && ss.every((b) => hcDays.has(b.start.day))) out.push(`${g}:on_head_coach_day`);
  }
  return out;
}

export interface MediaSeason { readonly breaches: number }

/**
 * Skipping a required session (H7.1.1 rule 4): one C11 breach event and one L6 event. The first breach in
 * a season is a warning, later ones take the C11 fine scale. Optional sessions cost goodwill only.
 */
export function skipSession(block: Block, season: MediaSeason): { events: WeekEvent[]; season: MediaSeason } {
  if (block.type !== 'media') throw new Error(`${block.id} is not a media block`);
  if (block.session === 'production_meeting') return { events: [{ to: 'L6', kind: 'national_goodwill', effect: 'small_minus' }], season };
  if (block.session === 'opponent_media') return { events: [], season };
  const first = season.breaches === 0 && P('media_first_breach_warning_only') === 1;
  return {
    events: [
      { to: 'C11', kind: 'media_policy_breach', effect: first ? 'warning' : 'fine_scale', subject: block.session ?? 'session' },
      { to: 'L6', kind: 'reporter_goodwill', effect: 'minus', subject: block.session ?? 'session' },
    ],
    season: { breaches: season.breaches + 1 },
  };
}

interface StanceRow { readonly id: string; readonly players: string; readonly owner_gm: string; readonly media: string; readonly opponent: string }
export const STANCE_ROWS: readonly StanceRow[] = STANCES.stances;
export type Stance = (typeof STANCE_ROWS)[number]['id'];

export interface Statement {
  readonly topic: string;
  readonly stance: string;
  readonly audiences: readonly string[];
  readonly at: Instant;
}

/**
 * One answer (H7.2.1): writes one Statement and sends events only to the audiences in its table row.
 * `contradicts` marks a clash with a private statement to the same person (L1) or the philosophy (E10).
 */
export function answer(topic: string, stance: string, at: Instant, contradicts = false): { statement: Statement; events: WeekEvent[] } {
  const row = STANCE_ROWS.find((r) => r.id === stance);
  if (!row) throw new Error(`unknown stance ${stance}`);
  const cat = STANCES.audienceCategory as Record<string, string>;
  const events: WeekEvent[] = [];
  const audiences: string[] = [];
  for (const aud of ['players', 'owner_gm', 'media', 'opponent'] as const) {
    const effect = row[aud];
    if (effect === 'none' || effect === 'neutral') continue;
    // The bland default produces no relationship events in a single session (acceptance 3); its media cost builds over time.
    if (stance === 'bland') { audiences.push(aud); events.push({ to: cat[aud] ?? aud, kind: 'bland_answer', effect: 'tally' }); continue; }
    audiences.push(aud);
    events.push({ to: cat[aud] ?? aud, kind: 'statement', effect, subject: topic });
  }
  if (contradicts) events.push({ to: 'E10', kind: 'consistency', effect: 'contradiction', subject: topic });
  return { statement: { topic, stance, audiences, at }, events };
}

export const TOPICS = ['qb_change', 'failed_late_decision', 'star_injury', 'starter_discipline', 'losing_streak', 'job_security', 'routine_review'] as const;
export type Topic = (typeof TOPICS)[number];

/** Topic score = newsworthiness × recency (H7.2.2 rule 1). Recency halves every configured span of days. A leak adds to the story. */
export function topicScore(topic: Topic, daysAgo: number, leaked = false): number {
  const n = P(`topic_${topic}`) + (leaked ? P('leak_newsworthiness_bonus') : 0);
  return n / (1 + Math.max(0, daysAgo) / P('topic_recency_half_life_days'));
}

/** The questions a session faces: the top N topics, N from session length (rule 2). */
export function questions(candidates: readonly { topic: Topic; daysAgo: number; leaked?: boolean }[], sessionMinutes: number): Topic[] {
  const n = Math.max(1, Math.floor(sessionMinutes / P('minutes_per_question')));
  return [...candidates]
    .sort((a, b) => topicScore(b.topic, b.daysAgo, b.leaked) - topicScore(a.topic, a.daysAgo, a.leaked) || (a.topic < b.topic ? -1 : 1))
    .slice(0, n).map((c) => c.topic);
}

/** Daily leak chance for held news (rule 3). */
export function leakChance(peopleWhoKnow: number, averageTrust: number): number {
  return possible(clamp01(P('leak_base_daily') * peopleWhoKnow * (1 - clamp01(averageTrust))));
}

/** Off-message chance per player session with a hot topic (H7.1.2 rule 3; H7.4.2 rule 1 for the user below head coach). */
export function offMessageChance(trust: number, mood: number, ego: number, clearGuidance: boolean, strongCouncil: boolean): number {
  let p = P('off_message_base') * (1 + P('off_message_trust_weight') * (1 - clamp01(trust)) + P('off_message_mood_weight') * (1 - clamp01(mood)) + P('off_message_ego_weight') * clamp01(ego));
  if (clearGuidance) p *= P('off_message_guidance_cut');
  if (strongCouncil) p *= P('off_message_guidance_cut');
  return possible(clamp01(p));
}

/** A public statement about someone's future is a promise for a window (H7.1.3 rule 2). Acting against it inside the window is a consistency event. */
export function brokenPromise(promiseDay: number, actionDay: number): boolean {
  return actionDay >= promiseDay && actionDay - promiseDay <= P('promise_window_days');
}

/** Injury questions (H7.2.3, H7.4.1 rule 5). Mental health is never an offered answer. */
export function injuryAnswers(rules: RuleLookup): string[] {
  const report = flag(rules, 'media.injury_report_exists') || flag(rules, 'college.availability_report');
  return report ? ['refer_to_report', 'decline', 'honest_outlook'] : ['decline', 'honest_outlook'];
}

/** A spoken answer that conflicts with the filing raises the H5.2.3 audit chance; H7 only flags it. */
export function injuryConflict(spoken: string, filed: string): boolean { return spoken !== 'decline' && spoken !== 'refer_to_report' && spoken !== filed; }

/** Public criticism of officials always creates a fine event (H7.2.5 rule 1); sending plays to the league is private and free. */
export function criticiseOfficials(callWasWrong: boolean): WeekEvent[] {
  return [
    { to: 'C11', kind: 'officiating_criticism', effect: 'fine_key:league_rules.discipline.officiating_criticism' },
    ...(callWasWrong ? [{ to: 'L1', kind: 'players_backed', effect: 'small_plus' }] : []),
  ];
}

/**
 * A college answer naming an unsigned recruit (H7.4.1 rule 4): offered, marked as a violation when the
 * ban is on; choosing it is one violation request (recruiting_contact).
 */
export function recruitComment(rules: RuleLookup, week: Week): { violation: boolean; request: ViolationRequest | null } {
  const banned = flag(rules, 'college.recruit_comment_ban');
  if (!banned) return { violation: false, request: null };
  return { violation: true, request: { classId: 'recruiting_contact', ruleId: 'media.recruit_comment', blockId: null, plain: 'A coach may not comment publicly on an unsigned recruit', penalty: 'Association penalty (T9.5)', weekId: week.weekId, teamId: week.teamId } };
}

/** The coach's show and appearances (H7.3.3): never inside the quiet hours before kickoff. */
export function appearanceAllowed(start: Instant, kickoff: Instant): boolean {
  const quiet = P('appearance_quiet_hours') * P('minutes_per_hour');
  return instantValue(start) <= instantValue(kickoff) - quiet || instantValue(start) >= instantValue(kickoff) + MINUTES_PER_DAY;
}

/** A skipped contracted appearance (H7.3.3 rules 1 and 2). */
export function skipAppearance(skipsThisSeason: number, standIn: boolean): { fee: 'lost'; goodwill: number; events: WeekEvent[] } {
  const events: WeekEvent[] = [{ to: 'L5', kind: 'appearance_skipped', effect: 'small_minus' }];
  if (skipsThisSeason + 1 >= P('coach_show_skips_for_talk')) events.push({ to: 'E3', kind: 'contract_conversation', effect: 'triggered' });
  return { fee: 'lost', goodwill: standIn ? P('coach_show_stand_in_goodwill') : 0, events };
}

function clamp01(x: number): number { return Math.min(1, Math.max(0, x)); }
