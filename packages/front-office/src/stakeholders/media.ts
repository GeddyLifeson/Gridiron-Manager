// K8.7.1 stories from labels and notable events. Each outlet picks the top stories by notability times
// its interests; the angle comes from public labels and recent reactions, and the label may be wrong
// (K2.4.1): the story runs anyway. Stories never read hidden state (rule 3), and no harmful or personal
// story is ever generated about an imported person (rule 6, X14).
import type { HarmClass, PersonOrigin } from '@gm/schema';
import { P } from './params.ts';
import { clamp, halfLifeFactor } from './mathx.ts';

/** A public event as the outlet sees it (already through the observer filter, G-27). */
export interface PublicEventView {
  readonly eventId: number;
  readonly type: string;
  /** X4.1.1 notability 0 to 100. */
  readonly notability: number;
  readonly teamIds: readonly number[];
  readonly personIds: readonly number[];
  readonly harm: HarmClass;
  /** True only for leaks and sources (X12, L4.4.3): a private fact that reached this outlet. */
  readonly fromLeak: boolean;
}

/** A public label (X2.2) with its evidence rows. */
export interface PublicLabelView {
  readonly subjectId: number;
  readonly label: string;
  readonly evidenceEventIds: readonly number[];
}

/** Outlet and reporter record (K8.7.1 inputs). Truth only. */
export interface Outlet {
  readonly id: number;
  /** Interest by event type; unknown types score 0. */
  readonly interests: Readonly<Record<string, number>>;
  /** Appetite for controversy, 0 to 1. */
  readonly controversy: number;
  /** 0.2 to 1.0 (an analytics beat is process-minded, K8.2.1 rule 3). */
  readonly outcomeBias: number;
  /** X7 friendliness edge with each subject (coach person id) 0 to 100. */
  readonly edges: Readonly<Record<number, number>>;
}

export interface Story {
  readonly outletId: number;
  readonly subjectTeamId: number | null;
  readonly subjectPersonIds: readonly number[];
  /** Label angle when one fits the subject, else the event type. */
  readonly angle: string;
  /** -1 to 1. */
  readonly tone: number;
  /** Every story links to at least one public event (acceptance). */
  readonly evidence: readonly number[];
  readonly fromLeak: boolean;
}

const NEGATIVE: readonly HarmClass[] = ['professional_negative', 'personal', 'harmful'];
const PROTECTED: readonly HarmClass[] = ['personal', 'harmful'];

/** Rule 6: a personal or harmful story about an imported person is never generated. */
export function excluded(e: PublicEventView, origins: Readonly<Record<number, PersonOrigin>>): boolean {
  return PROTECTED.includes(e.harm) && e.personIds.some((id) => origins[id] === 'imported');
}

/** Rule 1: notability times the outlet's interest, plus its appetite for controversy on negative events. */
export function storyScore(o: Outlet, e: PublicEventView): number {
  const interest = o.interests[e.type] ?? 0;
  const controversy = NEGATIVE.includes(e.harm) ? P('media.controversyBoost') * o.controversy : 0;
  return e.notability * (interest + controversy);
}

/**
 * Rules 1, 2, 5 and 6. `teamReaction` is this week's K8.2.1 reaction total for each team as this outlet
 * judged it; its sign sets the tone. A good relationship softens a negative tone by 20%.
 */
export function pickStories(
  o: Outlet, events: readonly PublicEventView[], labels: readonly PublicLabelView[],
  teamReaction: Readonly<Record<number, number>>, origins: Readonly<Record<number, PersonOrigin>>,
): Story[] {
  const ranked = events
    .filter((e) => !excluded(e, origins))
    .map((e) => ({ e, s: storyScore(o, e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.eventId - b.e.eventId)
    .slice(0, P('media.storiesPerCycle'));
  return ranked.map(({ e }) => {
    const subjects = [...e.teamIds, ...e.personIds];
    const label = labels.find((l) => subjects.includes(l.subjectId));
    const team = e.teamIds[0] ?? null;
    const reaction = team === null ? 0 : teamReaction[team] ?? 0;
    let tone = clamp(reaction / P('conf.result.size'), -1, 1) * o.outcomeBias;
    if (NEGATIVE.includes(e.harm)) tone = Math.min(tone, 0) - P('media.controversyBoost') * o.controversy / 2;
    const friendly = e.personIds.some((id) => (o.edges[id] ?? 0) >= P('media.friendlyFrom'));
    if (friendly && tone < 0) tone *= 1 - P('media.friendlySoften');
    const evidence = label ? [e.eventId, ...label.evidenceEventIds.filter((id) => id !== e.eventId)] : [e.eventId];
    return { outletId: o.id, subjectTeamId: team, subjectPersonIds: e.personIds, angle: label?.label ?? e.type, tone: clamp(tone, -1, 1), evidence, fromLeak: e.fromLeak };
  });
}

/** Rule 4: `mediaTone` per team (0 to 100) carries over with a 3-week half-life. Read by K8.3.1 and K8.8.1. */
export function updateMediaTone(prev: number, storiesAboutTeam: readonly Story[]): number {
  const keep = halfLifeFactor(P('media.toneHalfLifeWeeks'));
  const neutral = P('conf.mood.neutral');
  const push = storiesAboutTeam.reduce((s, st) => s + st.tone, 0) * P('media.reactionToTone');
  return clamp(neutral + (prev - neutral) * keep + push, 0, P('conf.max'));
}

/** K8.7.1 edge case: a violation rumour run from a leak raises the true detection chance (L8.2.5); the compliance pipeline adds it. */
export function leakDetectionLift(stories: readonly Story[]): number {
  return stories.some((s) => s.fromLeak) ? P('media.leakDetectionLift') : 0;
}
