// L8.3 officiating, rule changes and league assignments; L8.4.1 the conference office.
// Nothing here alters an officiating parameter, a practice result or a contest: clip answers are
// information, the camera flag changes only routing and reach, and the rule-awareness term is read
// only by the hazards of the changed or stressed fouls (J10 applies it).
import type { RuleKeyManifest, RuleSet } from '@gm/schema';
import { compliance } from '@gm/league';
import type { Order } from '../crisis/orders.ts';
import type { StreamFor } from '../crisis/events.ts';
import { param } from './params.ts';

// ---- L8.3.1 clip submissions ----

/** One play from the game's log, with the B11 truth record's verdict on the call. */
export interface ClipPlay { readonly playId: number; readonly callWasRight: boolean; readonly foulType: string | null }

export type ClipVerdict = 'correct_call' | 'incorrect_call' | 'judgment';

export interface ClipAnswer {
  readonly playId: number;
  readonly verdict: ClipVerdict;
  readonly foulType: string | null;
  readonly recipient: 'officiating_department' | 'coordinator_of_officials';
}

export type Body = 'league' | 'conference';

/**
 * Answer the plays sent in (at most the starting five). Where the truth record says the call was
 * wrong, the answer says so at the honest share, else "judgment, within the standard". A right call is
 * always "correct". The submission costs the quality control coach his minutes, not the head coach.
 */
export function answerClips(
  teamId: number, gameId: number, plays: readonly ClipPlay[], body: Body, qcCoachId: number | null, stream: StreamFor,
): { readonly answers: ClipAnswer[]; readonly orders: Order[] } {
  const max = param('clips.maxPerGame');
  if (plays.length > max) throw new Error(`community: at most ${max} clips per game`);
  const recipient = body === 'conference' ? 'coordinator_of_officials' : 'officiating_department';
  const answers = plays.map((p): ClipAnswer => {
    if (p.callWasRight) return { playId: p.playId, verdict: 'correct_call', foulType: p.foulType, recipient };
    const honest = stream(['community', 'clip', teamId, gameId, p.playId]).chance(param('clips.honestShare'));
    return { playId: p.playId, verdict: honest ? 'incorrect_call' : 'judgment', foulType: p.foulType, recipient };
  });
  const orders: Order[] = qcCoachId !== null && plays.length > 0 ? [{ kind: 'hours', personId: qcCoachId, minutes: plays.length * param('clips.qcMinutesEach'), what: `clips:${gameId}` }] : [];
  return { answers, orders };
}

/** The only gain: which foul types the staff now know the current standard for (H4 teaches, N5 explains). */
export function standardLearned(answers: readonly ClipAnswer[]): string[] {
  const out: string[] = [];
  for (const a of answers) if (a.foulType !== null && !out.includes(a.foulType)) out.push(a.foulType);
  return out;
}

// ---- L8.3.2 rule changes, points of emphasis, officials in camp ----

/** Per-player awareness of one changed or stressed rule, 0 to 100. */
export function startingAwareness(taughtByPreviousTeam: number | null = null): number {
  return taughtByPreviousTeam ?? param('rules.awarenessStart');
}

export function addAwareness(current: number, gain: number): number { return Math.max(0, Math.min(100, current + gain)); }

/** The officials' team meeting in camp. */
export function afterOfficialsMeeting(current: number): number { return addAwareness(current, param('rules.officialsMeetingGain')); }

/** Working a practice period with the crew, for players who took reps. */
export function afterCrewPractice(current: number, tookReps: boolean): number {
  return tookReps ? addAwareness(current, param('rules.crewPracticeGain')) : current;
}

/** Multiplier on the hazard of that specific foul for a player: exactly 1 at awareness 100. */
export function foulHazardMultiplier(awareness: number): number {
  const a = Math.max(0, Math.min(100, awareness));
  return 1 + param('rules.ignoredHazardRise') * (1 - a / 100);
}

/** League-wide call-rate factor of an emphasised foul in a given week of the season (0 = first week). */
export function emphasisFactor(weekOfSeason: number): number {
  const early = param('rules.emphasisEarlyFactor');
  const fade = param('rules.emphasisFadeWeeks');
  if (weekOfSeason <= 0) return early;
  if (weekOfSeason >= fade) return 1;
  return early - (early - 1) * (weekOfSeason / fade);
}

/** Chance a staff recommendation under a strategy-altering change is wrong (I4, I5 advice). */
export function staffAdviceErrorChance(gameIndex: number, skippedStaffSession: boolean, strategic: boolean): number {
  return skippedStaffSession && strategic && gameIndex < param('rules.skippedStaffAdviceGames') ? param('rules.skippedStaffAdviceError') : 0;
}

// ---- L8.3.3 league assignments ----

export type Access = 'open' | 'standard' | 'minimal';

/** Share of meetings and cut-day conversations with cameras present that are treated as public (L6.2.1 routing). */
export function documentaryPublicShare(access: Access): number {
  return param(access === 'minimal' ? 'doc.publicShareMinimal' : access === 'open' ? 'doc.publicShareOpen' : 'doc.publicShareStandard');
}

/** Is this conversation on camera and routed as public. Affects routing and reach only. */
export function conversationOnCamera(teamId: number, conversationKey: number, access: Access, stream: StreamFor): boolean {
  return stream(['community', 'doc', teamId, conversationKey]).chance(documentaryPublicShare(access));
}

/** Orders when the coach sets access: the owner's memory if he wanted exposure and got minimal; fan mood for open. */
export function documentaryAccessOrders(teamId: number, access: Access, coachId: number, ownerId: number | null, ownerWantsExposure: boolean): Order[] {
  const out: Order[] = [];
  if (access === 'minimal' && ownerWantsExposure && ownerId !== null) out.push({ kind: 'memory', holderId: ownerId, aboutId: coachId, memoryClass: 'refused_exposure', amount: param('doc.minimalOwnerMemory'), halfLifeWeeks: null, sourceEventId: null });
  if (access === 'open') out.push({ kind: 'fan_mood', teamId, delta: param('doc.openFanMood') });
  return out;
}

/**
 * The yearly documentary draw. Eligibility rules are a data key that ships empty (every club eligible,
 * no rule is sourced), so the caller passes the eligible ids.
 */
export function drawDocumentaryClub(eligibleTeamIds: readonly number[], seasonYear: number, stream: StreamFor): number | null {
  if (eligibleTeamIds.length === 0) return null;
  const sorted = [...eligibleTeamIds].sort((a, b) => a - b);
  return sorted[stream(['community', 'doc_draw', seasonYear]).int(0, sorted.length - 1)]!;
}

// ---- L8.4.1 the conference office ----

export const CONFERENCE_KEYS = {
  body: 'discipline.body',
  fineCents: 'conference_discipline.fine_cents',
  suspensionGames: 'conference_discipline.suspension_games',
} as const;

/** Rule keys this module reads (requested from the integrator, CR-G50-3). Every conference value ships empty (L8.4.1). */
export const RULE_KEYS: RuleKeyManifest = [
  { key: CONFERENCE_KEYS.body, type: 'option', options: ['league', 'conference'], meaning: 'Body that disciplines a head coach for public conduct (L8.4.1). Absent = league.', ownerLeaf: 'L8.4.1', readBy: ['career.community'] },
  { key: CONFERENCE_KEYS.fineCents, type: 'number', unit: 'cents', meaning: 'Conference fine on a second public-conduct finding (L8.4.1; Unverified, ships empty).', ownerLeaf: 'L8.4.1', readBy: ['career.community'] },
  { key: CONFERENCE_KEYS.suspensionGames, type: 'number', unit: 'count', meaning: 'Conference suspension on a third finding (L8.4.1; Unverified, ships empty, default one game).', ownerLeaf: 'L8.4.1', readBy: ['career.community'] },
];

/** Which body disciplines the coach for public conduct, from the rule set (option key; absent = league). */
export function disciplineBody(rules: Pick<RuleSet, 'keys' | 'opt'>): Body {
  return rules.keys().includes(CONFERENCE_KEYS.body) && rules.opt(CONFERENCE_KEYS.body) === 'conference' ? 'conference' : 'league';
}

export type ConferenceSanction =
  | { readonly kind: 'public_reprimand' }
  | { readonly kind: 'fine'; readonly cents: number | null }
  | { readonly kind: 'suspension'; readonly games: number | null };

/**
 * The conference's default tier (public reprimand, then a fine, then a suspension for a game) by the
 * number of prior findings. Only `conference_discipline.*` keys are read; empty values leave the amount
 * null ("conference default").
 */
export function conferenceSanction(priorFindings: number, rules: Pick<RuleSet, 'keys' | 'num'>): ConferenceSanction {
  const has = (k: string) => rules.keys().includes(k);
  if (priorFindings <= 0) return { kind: 'public_reprimand' };
  if (priorFindings === 1) return { kind: 'fine', cents: has(CONFERENCE_KEYS.fineCents) ? rules.num(CONFERENCE_KEYS.fineCents) : null };
  return { kind: 'suspension', games: has(CONFERENCE_KEYS.suspensionGames) ? rules.num(CONFERENCE_KEYS.suspensionGames) : 1 };
}

/** A coach moving between conferences keeps one record: prior findings are counted on the person, not the body. */
export function priorConductFindings(record: readonly compliance.LeagueRecordEntry[], personId: number, classId: string): number {
  return record.filter((e) => e.party.kind === 'person' && e.party.id === personId && e.classId === classId).length;
}

