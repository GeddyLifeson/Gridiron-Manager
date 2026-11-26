// K6.2.1 suggestions and reports on the headset, and K6.2.2 the advisor's line. Each line is as good
// as the person speaking. No line is ever made from hidden state: the caller hands in what the film
// filter lets this seat observe (K9.1.1), and the staff member's own error is added here. A wrong
// report is stated exactly like a right one; the true look goes only to the review log (N3.1.2).
import type { Draws } from '../profile/index.ts';
import type { AnyCall, DecisionView } from './contract.ts';
import { dutyCount, member } from './owners.ts';
import { P, byQuality, clamp } from './params.ts';
import type { AdvisorLine, CallContext, CallerPort, ManagerPort } from './ports.ts';
import { DUTY, type Duty, type Seat, type StaffChart, type StaffMember } from './types.ts';

/** Something a staff member could see on the last play, already passed through the film filter. */
export interface Observation {
  /** What kind of thing it is, for the line's wording: a coverage, a front, a tell, a tired player. */
  readonly kind: string;
  /** Situation bucket (K4.2.2). */
  readonly bucket: string;
  /** The observable class as charted without error, for example `cover4`. */
  readonly look: string;
  /** Every class this kind of observation can be charted as; a mislabel picks another of these. */
  readonly classes: readonly string[];
  /** The seat that sees it best (L4.1.3). */
  readonly bestSeat: Seat;
  /** Game time, tenths since kickoff, at which it became observable. */
  readonly observableAtTenths: number;
}

export interface AdviceLine {
  readonly staffId: number;
  readonly playNumber: number;
  readonly kind: 'suggestion' | 'report';
  /** For a suggestion: the calls, best first. */
  readonly calls: readonly AnyCall[];
  /** For a report: what he says he saw. */
  readonly reportKind: string | null;
  readonly said: string | null;
  /** Game time at which the line reaches the head coach. Never before its inputs were observable. */
  readonly atTenths: number;
}

/** The review row of a report (N3.1.2): what he said beside what was there. Truth data, never shown in a career. */
export interface AdviceReview {
  readonly staffId: number;
  readonly playNumber: number;
  readonly reportKind: string;
  readonly said: string;
  readonly was: string;
}

/** K6.2.1 rule 3: 2 to 8 s after the play, longer with more duties and lower quality. Tenths. */
export function adviceDelayTenths(m: StaffMember, duties: number): number {
  const z = (m.profile.behavior.evaluation + m.profile.behavior.adjustment) / 2;
  return Math.round(byQuality(z, P('advice_delay_max_tenths'), P('advice_delay_min_tenths')) + Math.max(0, duties - 1) * P('advice_delay_per_duty_tenths'));
}

/** K4.2.2 rule 3: chance he mislabels a look, by his `evaluation` and whether it is his seat's kind of look. */
export function mislabelChance(m: StaffMember, bestSeat: Seat): number {
  const base = byQuality(m.profile.behavior.evaluation, P('mislabel_max'), P('mislabel_min'));
  return clamp(base * (m.seat === bestSeat ? 1 : P('mislabel_off_seat')), 0, P('mislabel_cap'));
}

/** What he charts for an observation: the look, or with his error another class. One uniform each. */
export function chartLook(m: StaffMember, o: Observation, d: Draws): string {
  const wrong = d.uniform() < mislabelChance(m, o.bestSeat);
  const pick = d.uniform();
  const others = o.classes.filter((c) => c !== o.look);
  if (!wrong || others.length === 0) return o.look;
  return others[Math.min(others.length - 1, Math.floor(pick * others.length))]!;
}

export interface AdviceInput {
  readonly chart: StaffChart;
  readonly view: DecisionView;
  /** What each seat could observe on the last play. */
  readonly observations: readonly Observation[];
  /** Game time now, tenths since kickoff: suggestions cannot be made before the situation is known. */
  readonly nowTenths: number;
  readonly caller: CallerPort;
  /** Duties whose holders suggest calls to the head coach for this request (the side he is calling). */
  readonly suggestFor: readonly Duty[];
  draws(scope: readonly (string | number)[]): Draws;
}

/**
 * K6.2.1: the lines of one play. One line per staff member per play (rule 4): a suggestion from the
 * holder of a calling duty the head coach is calling himself, else his report of the first thing his
 * seat saw.
 */
export function adviceForPlay(input: AdviceInput): { lines: AdviceLine[]; reviews: AdviceReview[] } {
  const { chart, view } = input;
  const lines: AdviceLine[] = [];
  const reviews: AdviceReview[] = [];
  const playNumber = view.situation.playNumber;
  const people = [...chart.members].filter((m) => m.available).sort((a, b) => a.personId - b.personId);
  for (const m of people) {
    const duties = dutyCount(chart, m.personId);
    const delay = adviceDelayTenths(m, duties);
    const duty = input.suggestFor.find((d) => chart.assignments[d]?.holderId === m.personId);
    if (duty !== undefined) {
      const ctx: CallContext = {
        caller: m, duty, sheet: { sheetId: null, builtById: null }, mayAdd: chart.assignments[duty]?.mayAdd === true,
        permits: () => true, draws: input.draws([view.situation.gameId, playNumber, m.personId, 'suggest']),
      };
      const top = input.caller.suggest(view, ctx, P('advice_max_suggestions')).slice(0, P('advice_max_suggestions'));
      if (top.length > 0) {
        lines.push({ staffId: m.personId, playNumber, kind: 'suggestion', calls: top.map((s) => s.call), reportKind: null, said: null, atTenths: input.nowTenths + delay });
        continue;
      }
    }
    const mine = input.observations.filter((o) => o.bestSeat === m.seat);
    const o = mine[0] ?? null;
    if (o === null) continue;
    const said = chartLook(m, o, input.draws([view.situation.gameId, playNumber, m.personId, 'report']));
    lines.push({ staffId: m.personId, playNumber, kind: 'report', calls: [], reportKind: o.kind, said, atTenths: o.observableAtTenths + delay });
    reviews.push({ staffId: m.personId, playNumber, reportKind: o.kind, said, was: o.look });
  }
  return { lines, reviews };
}

/** What the decision bar shows (I5.1.2, K6.2.2). */
export interface AdvisorResult {
  readonly line: AdvisorLine | null;
  /** The analyst who signed it, or null for the generic decision-book cell. */
  readonly analystId: number | null;
  readonly delayTenths: number;
}

/**
 * K6.2.2: the analyst's line. With an analyst it is K5.1.1 steps 1 and 2 on his estimates, after a
 * delay by his skill. With none, the generic chart cell with no opponent or matchup adjustment.
 */
export function advisorLine(chart: StaffChart, view: DecisionView, manager: ManagerPort, draws: (scope: readonly (string | number)[]) => Draws): AdvisorResult {
  const a = chart.assignments[DUTY.gameManagementAdvice];
  const analyst = a && a.holderId !== null ? member(chart, a.holderId) : null;
  if (analyst === null || !analyst.available) return { line: manager.genericLine(view), analystId: null, delayTenths: 0 };
  const line = manager.advise(view, analyst, draws([view.situation.gameId, view.request.requestId, analyst.personId, 'advise']));
  const delayTenths = Math.round(byQuality(analyst.profile.behavior.evaluation, P('advisor_delay_max_tenths'), P('advisor_delay_min_tenths')));
  return { line, analystId: analyst.personId, delayTenths };
}
