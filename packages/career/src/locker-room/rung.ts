// The room from a lower rung (L2.6.2) and enforcing someone else's rules (L3.5.2). An assistant sees his own
// room in full, his side of the ball banded with one band of noise, and the other side as news only. Rule
// editing is locked below head coach because the job does not hold it (authority, INDEX rule 4), not because
// it is a rule-breaking act.
import { lp } from './params.ts';

export type Rung = 'head_coach' | 'coordinator' | 'position_coach' | 'quality_control' | 'graduate_assistant';
export type Side = 'offense' | 'defense' | 'special_teams';

export interface Viewer {
  readonly rung: Rung;
  /** The rooms he coaches (a GA sees the scout team room). */
  readonly rooms: readonly string[];
  readonly side: Side | null;
}

export type Visibility = 'full' | 'banded' | 'news_only';

/** What a viewer sees of one room (L2.6.2 rule). The head coach sees every room (through what people tell him, L2.1.2). */
export function roomVisibility(v: Viewer, room: string, roomSide: Side): Visibility {
  if (v.rung === 'head_coach') return 'full';
  if (v.rooms.includes(room)) return 'full';
  if (v.rung === 'coordinator' && v.side === roomSide) return 'full';
  if (v.side === roomSide) return 'banded';
  return 'news_only';
}

/** Only the head coach edits the team rule list (L3.1.1 edge case, L3.5.2 acceptance). */
export function mayEditRules(r: Rung): boolean {
  return r === 'head_coach';
}

export type AssistantChoice = 'handle_in_room' | 'report_up' | 'let_go';

export interface AssistantEffect {
  readonly playerTrust: number;
  readonly standingWithBoss: number;
  readonly roomCoachBond: number;
}

/**
 * Effects of the assistant's choice (L3.5.2): handling in the room what the boss's list says must be reported
 * is +2 trust from the player and, if found out, -6 standing; reporting is +1 standing and -1 room coach bond.
 * A graduate assistant or quality control coach can only tell someone.
 */
export function assistantChoice(rung: Rung, c: AssistantChoice, listRequiresReport: boolean, foundOut: boolean): AssistantEffect {
  if ((rung === 'graduate_assistant' || rung === 'quality_control') && c === 'handle_in_room') throw new Error('career.locker_room: this rung can only tell someone (L3.5.2)');
  if (c === 'report_up') return { playerTrust: 0, standingWithBoss: lp('assistant.reportStanding'), roomCoachBond: lp('assistant.reportCoachBond') };
  if (c === 'handle_in_room') return { playerTrust: lp('assistant.handleTrust'), standingWithBoss: listRequiresReport && foundOut ? lp('assistant.handleFoundOutStanding') : 0, roomCoachBond: 0 };
  return { playerTrust: 0, standingWithBoss: 0, roomCoachBond: 0 };
}

/**
 * Reporting what he sees to the boss (L2.6.2): passing on a player's confidence, if it becomes known, is -15
 * trust from that player and +3 standing; not reporting something that later becomes a crisis is -8 standing
 * if the boss learns he knew.
 */
export function reportConfidence(becameKnown: boolean): { readonly playerTrust: number; readonly standingWithBoss: number } {
  return { playerTrust: becameKnown ? lp('rung.reportConfidenceTrust') : 0, standingWithBoss: lp('rung.reportConfidenceStanding') };
}

export function keptQuietBecameCrisis(bossLearnedHeKnew: boolean): number {
  return bossLearnedHeKnew ? lp('rung.notReportedStanding') : 0;
}
