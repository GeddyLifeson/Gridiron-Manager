// K8.6.1 agent behaviour: the person who speaks for a player or coach in money and role matters. The
// user-facing side (holdouts, trade requests, families) is L7 in career/src/agents (G-49), which governs
// where it differs; this file is the decision logic K7.4.1, K7.4.2 and K7.5.2 read.
import { P } from './params.ts';
import { clamp } from './mathx.ts';

/** Agent record (K8.6.1 inputs). The user's own agent (E3) uses the same record. Truth only. */
export interface AgentProfile {
  readonly personId: number;
  /** 0 to 1. */
  readonly negotiation: number;
  /** 0 to 1. */
  readonly aggression: number;
  /** X1 candor, 0 to 100: how readily he leaks. */
  readonly candor: number;
  readonly clientIds: readonly number[];
}

/** K8.6.1 edge case: a player without an agent uses default parameters. */
export function defaultAgent(): AgentProfile {
  return { personId: 0, negotiation: P('agent.default.negotiation'), aggression: P('agent.default.aggression'), candor: P('conf.mood.neutral'), clientIds: [] };
}

/** An agent with many clients on one team is less aggressive with that team. */
export function effectiveAggression(a: AgentProfile, clientsOnTeam: number): number {
  const restraint = Math.min(P('agent.clientsRestraintCap'), P('agent.clientsRestraint') * Math.max(0, clientsOnTeam - 1));
  return clamp(a.aggression * (1 - restraint), 0, 1);
}

export interface AgentPosition {
  /** Opening ask, same unit as the market value (cents per year or total). */
  readonly ask: number;
  /** Walk-away point. */
  readonly reservation: number;
}

/**
 * Ask = estimated market value (comparable contracts, as the agent estimates them) times an opening factor
 * by aggression; reservation from the best alternative he believes exists.
 */
export function agentPosition(a: AgentProfile, estimatedValue: number, bestAlternative: number, clientsOnTeam: number): AgentPosition {
  const ag = effectiveAggression(a, clientsOnTeam);
  const open = P('agent.openingFactor.min') + (P('agent.openingFactor.max') - P('agent.openingFactor.min')) * ag;
  const reservation = bestAlternative * (P('agent.reservationShare') + P('agent.aggressionReservationLift') * ag);
  return { ask: Math.max(estimatedValue * open, reservation), reservation };
}

export interface TeamPosition {
  readonly offer: number;
  /** The team's own walk-away (K7.4.1); the agent never reads it. */
  readonly max: number;
}

export interface TalksResult {
  readonly signed: boolean;
  readonly value: number | null;
  readonly rounds: number;
}

/**
 * Alternating concessions. Each round the agent gives up a share of the gap to his reservation (a better
 * negotiator gives up less) and the team raises toward its max; a deal closes when the offer meets the ask.
 */
export function negotiate(a: AgentProfile, pos: AgentPosition, team: TeamPosition): TalksResult {
  let ask = pos.ask;
  let offer = team.offer;
  const give = P('agent.concessionPerRound') * (1 - a.negotiation / 2);
  const rounds = P('agent.maxRounds');
  for (let r = 1; r <= rounds; r++) {
    if (offer >= ask) return { signed: true, value: ask, rounds: r };
    ask = Math.max(pos.reservation, ask - (ask - pos.reservation) * give);
    offer = Math.min(team.max, offer + (team.max - offer) * P('agent.concessionPerRound'));
  }
  if (offer >= ask) return { signed: true, value: ask, rounds };
  if (team.max >= pos.reservation) return { signed: true, value: Math.max(pos.reservation, offer), rounds };
  return { signed: false, value: null, rounds };
}

export type PublicMove = 'holdout_threat' | 'trade_request' | 'leak' | null;

/**
 * Public pressure when talks stall past 3 weeks and the client's stress (X5) is above the breakpoint.
 * Under contract: a holdout threat, or a trade request from an aggressive agent. Otherwise a leak, more
 * likely from a candid agent (the caller's stream decides whether he leaks at all).
 */
export function publicPressure(a: AgentProfile, weeksStalled: number, clientStress: number, underContract: boolean, clientsOnTeam: number): PublicMove {
  if (weeksStalled <= P('agent.stallWeeks') || clientStress <= P('agent.stressBreak')) return null;
  if (!underContract) return 'leak';
  return effectiveAggression(a, clientsOnTeam) >= P('agent.default.aggression') ? 'trade_request' : 'holdout_threat';
}
