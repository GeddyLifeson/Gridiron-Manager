// Small log builders for the record tests.
import type { WorldEvent } from '@gm/schema';
import { draftEvidence, RECORD_EVENT, RECORD_EVENT_TYPES, type SeatAt } from '../../src/record/index.ts';

export const COACH = 7;
let nextId = 1;
export function resetIds(): void { nextId = 1; }

export function ev(type: string, season: number, day: number, payload: WorldEvent['payload'], personId = COACH, teamId: number | null = 3): WorldEvent {
  const known = RECORD_EVENT_TYPES.some((t) => t.id === type);
  const d = draftEvidence(known ? type : RECORD_EVENT.conduct, { date: { seasonYear: season, dayIndex: day }, competitionId: 1, teamId, tier: 1, source: 'user' }, personId, payload);
  return { ...d, type, payload: known ? d.payload : payload, id: nextId++, notability: null };
}

export const decision = (season: number, day: number, kind: string, matched: boolean, extra: WorldEvent['payload'] = {}) =>
  ev(RECORD_EVENT.decision, season, day, { decisionKind: kind, matchedModel: matched, recommendation: false, rulesError: false, ...extra });
export const work = (season: number, day: number, checked: number, matched: number, extra: WorldEvent['payload'] = {}) =>
  ev(RECORD_EVENT.workProduct, season, day, { product: 'film_tags', checked, matched, onTime: true, ...extra });
export const teach = (season: number, day: number, playerId: number, delta: number, measure = 'development') =>
  ev(RECORD_EVENT.teaching, season, day, { measure, playerId, positionGroup: 'wr', seasonYear: season, delta });
export const unit = (season: number, day: number, above: boolean) => ev(RECORD_EVENT.unitResult, season, day, { unit: 'offense', aboveExpectation: above });
export const evaluation = (season: number, day: number, matched: boolean) => ev(RECORD_EVENT.evaluation, season, day, { kind: 'grade', subjectPersonId: 50, matched });
export const conduct = (season: number, day: number, kept: boolean) => ev(RECORD_EVENT.conduct, season, day, { kind: 'own_rule', kept });

/** One event of every family (decision as his own fourth down). */
export function everyFamily(season: number): WorldEvent[] {
  return [decision(season, 10, 'fourth_down', true), unit(season, 11, true), teach(season, 12, 40, 1.5), work(season, 13, 20, 18), evaluation(season, 14, true), conduct(season, 15, true)];
}

export const seat = (rung: number, extra: Partial<SeatAt> = {}): SeatAt => ({ rung, callsPlays: false, duties: null, ...extra });
export const constantSeat = (s: SeatAt) => ({ seatAt: () => s });
