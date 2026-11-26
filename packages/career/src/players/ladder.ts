// Threshold events (D12.5.2) and the real-person limits (D12.6.1). Sustained unhappiness becomes the things
// coaches deal with: a knock on the door, a private complaint, a public one or the agent, and at a decision
// window a trade request or a portal decision. Each step is stopped only by a conversation that changes a
// driver, never by words alone. Real imported people stop at "asks for a meeting" and, at a window, a neutral
// football statement with no quote and no motive. Morale changes play only through effects.ts.
import type { PersonOrigin } from '@gm/schema';
import { buyIn } from './effects.ts';
import { pp } from './params.ts';
import type { RelationshipRecord } from './record.ts';

export type LadderStep = 'meeting' | 'private' | 'public' | 'exit';
export const LADDER_STEPS: readonly LadderStep[] = ['meeting', 'private', 'public', 'exit'];

export interface LadderState {
  readonly playerId: number;
  /** Weeks in a row below each step's level. */
  readonly weeksBelow: Readonly<Record<'meeting' | 'private' | 'public', number>>;
  /** Steps already fired in this spell of unhappiness. */
  readonly fired: readonly LadderStep[];
}

export function newLadder(playerId: number): LadderState {
  return { playerId, weeksBelow: { meeting: 0, private: 0, public: 0 }, fired: [] };
}

export type LadderEventKind =
  | 'asks_for_meeting'
  | 'effort_flag_private_complaint'
  | 'public_complaint_or_agent'
  | 'trade_or_release_request'
  | 'portal_decision'
  | 'neutral_seek_larger_role';

/** An event sent on to L1, L2, L6, L7, T or M5. `quoted` is false for every real person. */
export interface LadderEvent {
  readonly playerId: number;
  readonly step: LadderStep;
  readonly kind: LadderEventKind;
  readonly quoted: boolean;
  readonly textKey: string;
}

export interface LadderWeek {
  /** D12.2.1 satisfaction, -100 to +100, as G-23 and D12 compute it. */
  readonly satisfaction: number;
  /** A decision window is open (portal window, trade deadline). */
  readonly decisionWindow: boolean;
  /** A conversation this week changed a driver (role, usage, a real path back). Words alone do not count. */
  readonly driverChanged: boolean;
  /** `league_rules.player_contracts`: decides trade request against the portal at the last step. */
  readonly playerContracts: boolean;
}

function isReal(origin: PersonOrigin): boolean {
  return origin === 'imported';
}

/**
 * One week of the D12.5.2 ladder for one player. Below -30 for 3 weeks: asks for a meeting. Below -50 for
 * 4: effort flag and a private complaint. Below -65 for 4: public complaint or agent. Below -75 at a
 * decision window: trade or release request, or the portal decision (T owns it). A driver change resets
 * every count; rising above -30 ends the spell.
 */
export function ladderWeek(s: LadderState, w: LadderWeek, origin: PersonOrigin): { state: LadderState; events: LadderEvent[] } {
  if (w.driverChanged || w.satisfaction >= pp('ladder.meeting.below')) {
    return { state: newLadder(s.playerId), events: [] };
  }
  const below = (lvl: number, n: number): number => (w.satisfaction < lvl ? n + 1 : 0);
  const weeksBelow = {
    meeting: below(pp('ladder.meeting.below'), s.weeksBelow.meeting),
    private: below(pp('ladder.private.below'), s.weeksBelow.private),
    public: below(pp('ladder.public.below'), s.weeksBelow.public),
  };
  const fired = new Set(s.fired);
  const events: LadderEvent[] = [];
  const real = isReal(origin);
  const fire = (step: LadderStep, kind: LadderEventKind, quoted: boolean): void => {
    fired.add(step);
    events.push({ playerId: s.playerId, step, kind, quoted, textKey: `players.ladder.${kind}` });
  };
  if (!fired.has('meeting') && weeksBelow.meeting >= pp('ladder.meeting.weeks')) fire('meeting', 'asks_for_meeting', false);
  if (!real) {
    if (!fired.has('private') && weeksBelow.private >= pp('ladder.private.weeks')) fire('private', 'effort_flag_private_complaint', false);
    if (!fired.has('public') && weeksBelow.public >= pp('ladder.public.weeks')) fire('public', 'public_complaint_or_agent', true);
  }
  if (!fired.has('exit') && w.decisionWindow && w.satisfaction < pp('ladder.exit.below')) {
    if (real) fire('exit', 'neutral_seek_larger_role', false);
    else fire('exit', w.playerContracts ? 'trade_or_release_request' : 'portal_decision', false);
  }
  return { state: { playerId: s.playerId, weeksBelow, fired: [...fired].sort((a, b) => LADDER_STEPS.indexOf(a) - LADDER_STEPS.indexOf(b)) }, events };
}

/** D12.6.1: for real people D12.1 runs with ego fixed at 50. Every other facet passes through. */
export function moraleFacets(origin: PersonOrigin, facets: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return isReal(origin) ? { ...facets, ego: pp('real.egoFixed') } : facets;
}

/** D12.6.1: the satisfaction drivers a real person keeps. Personal drivers are removed. */
export const REAL_PERSON_DRIVERS: readonly string[] = ['role_gap', 'team_results', 'fit_and_use'];

/** The team mean buy-in that L2 reads for the rare "lost the room" state (D12.5.2 edge case). */
export function meanBuyIn(records: readonly Pick<RelationshipRecord, 'trust' | 'respect' | 'roleBelief'>[]): number {
  if (records.length === 0) return 50;
  let s = 0;
  for (const r of records) s += buyIn(r);
  return s / records.length;
}
