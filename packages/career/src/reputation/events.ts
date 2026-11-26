// Event types the reputation module writes (E5.4.2, E5.6.1, E5.6.2, E5.6.3, S11.2.1) and their drafts.
// All are football events open to imported people (X2.1.2 rule 3). The Hall of Fame and award names are
// generic (A6): templates say "Coach of the Year" and "the Hall", never a real award or sponsor.
import { EventTypeDef, type WorldDate, type WorldEvent, type WorldTier } from '@gm/schema';
import { MODULE } from './params.ts';

export const EVENT = {
  hiredUp: 'assistant_hired_up',
  award: 'award_won',
  milestone: 'milestone_reached',
  nominated: 'hall_nominated',
  finalist: 'hall_finalist',
  elected: 'hall_elected',
  passedOver: 'hall_passed_over',
} as const;

const base = { importedAllowed: true, minTier: 1, harmClass: 'none', witnessRule: 'public', compactable: false } as const;

export const REPUTATION_EVENT_TYPES: readonly EventTypeDef[] = [
  { ...base, id: EVENT.hiredUp, family: 'career', payloadSchema: { rung: 'number', toTeamId: 'id', supported: 'boolean' }, lineTemplate: 'reputation.line.hired_up', consumers: [MODULE, 'world.news'] },
  { ...base, id: EVENT.award, family: 'honors', payloadSchema: { awardKind: 'string', scope: 'string', voteShare: 'number' }, lineTemplate: 'reputation.line.award', consumers: [MODULE, 'league.records'] },
  { ...base, id: EVENT.milestone, family: 'honors', payloadSchema: { category: 'string', value: 'number' }, lineTemplate: 'reputation.line.milestone', consumers: [MODULE, 'world.news'] },
  { ...base, id: EVENT.nominated, family: 'honors', payloadSchema: { classYear: 'number' }, lineTemplate: 'reputation.line.hall_nominated', consumers: [MODULE] },
  { ...base, id: EVENT.finalist, family: 'honors', payloadSchema: { classYear: 'number' }, lineTemplate: 'reputation.line.hall_finalist', consumers: [MODULE] },
  { ...base, id: EVENT.elected, family: 'honors', payloadSchema: { classYear: 'number', yesShare: 'number' }, lineTemplate: 'reputation.line.hall_elected', consumers: [MODULE, 'league.records'] },
  { ...base, id: EVENT.passedOver, family: 'honors', payloadSchema: { classYear: 'number', yesShare: 'number' }, lineTemplate: 'reputation.line.hall_passed_over', consumers: [MODULE] },
].map((t) => EventTypeDef.parse(t));

export type EventDraft = Omit<WorldEvent, 'id' | 'notability'>;

export interface DraftMeta {
  readonly date: WorldDate;
  readonly competitionId: number | null;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
}

export function draft(type: string, meta: DraftMeta, teamId: number | null, actors: EventDraft['actors'], payload: EventDraft['payload'], causeId: number | null = null): EventDraft {
  return {
    type,
    when: { date: meta.date, period: null, clockTenths: null },
    competitionId: meta.competitionId,
    where: { teamId, venueId: null },
    actors,
    subjects: actors.map((a) => ({ kind: 'person' as const, id: a.personId })),
    payload,
    witnesses: { kind: 'public' },
    causeId,
    tier: meta.tier,
    source: meta.source,
  };
}

/**
 * E5.4.2 and S11.2.1: an assistant hired to a higher rung elsewhere. One public event naming the pupil and
 * every mentor whose tree he is on (role `former_boss`), so the news item and the reputation event come from
 * the same row in the same week. `supported` mentors also carry role `supported_move` (E5.2.2 "+1 more").
 */
export function hiredUpDraft(meta: DraftMeta, pupilId: number, toTeamId: number, rung: number, mentorIds: readonly number[], supportedBy: readonly number[], causeId: number | null): EventDraft {
  const actors = [{ personId: pupilId, role: 'pupil' }, ...[...mentorIds].sort((a, b) => a - b).map((personId) => ({ personId, role: 'former_boss' })),
    ...[...supportedBy].filter((id) => mentorIds.includes(id)).sort((a, b) => a - b).map((personId) => ({ personId, role: 'supported_move' }))];
  const subjects = actors.filter((a) => a.role !== 'supported_move');
  return { ...draft(EVENT.hiredUp, meta, toTeamId, actors, { rung, toTeamId, supported: supportedBy.length > 0 }, causeId), subjects: subjects.map((a) => ({ kind: 'person' as const, id: a.personId })) };
}
