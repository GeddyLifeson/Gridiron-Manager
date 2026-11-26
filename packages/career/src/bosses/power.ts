// L5.2.1 power arrangement and reporting lines; T9.1.1 rule 1 the program default and its variants.
// Authority follows the real arrangement: the user controls exactly what a real holder of his job controls.
// Every roster, draft, contract and staff action is routed here and comes back as the actor's own decision,
// a request to the holder, or an act under a logged delegation. Final say is never an approval screen.
import type { RandomStream } from '@gm/schema';
import { param } from './params.ts';

/** The four `final_say_*` fields of L5.2.1. */
export const POWER_FIELDS = ['roster', 'draft', 'contracts', 'staff'] as const;
export type PowerField = (typeof POWER_FIELDS)[number];

/** Seats that can hold a field or be reported to. `unused` marks a field the job does not have (T9.1.1: no draft). */
export const SEATS = ['head_coach', 'general_manager', 'owner', 'executive', 'athletic_director'] as const;
export type Seat = (typeof SEATS)[number];
export type Holder = Seat | 'unused';

/** The L5.2.1 starting arrangements, plus the program default of T9.1.1. */
export const ARRANGEMENTS = ['head_coach', 'general_manager', 'split', 'owner', 'executive', 'program'] as const;
export type Arrangement = (typeof ARRANGEMENTS)[number];

export interface Power {
  readonly arrangement: Arrangement;
  readonly finalSay: Readonly<Record<PowerField, Holder>>;
  /** `reports` of L5.2.1: whom the head coach reports to. */
  readonly headCoachReportsTo: Seat;
  /** Whom the general manager or personnel man reports to (null: the job has none). */
  readonly gmReportsTo: Seat | null;
}

const all = (h: Holder): Record<PowerField, Holder> => ({ roster: h, draft: h, contracts: h, staff: h });

/** Build one of the starting arrangements. `splitOf` names who keeps acquisitions under split duties. */
export function arrangement(a: Arrangement, splitOf: 'general_manager' | 'owner' = 'general_manager'): Power {
  switch (a) {
    case 'head_coach': return { arrangement: a, finalSay: all('head_coach'), headCoachReportsTo: 'owner', gmReportsTo: 'head_coach' };
    case 'general_manager': return { arrangement: a, finalSay: all('general_manager'), headCoachReportsTo: 'general_manager', gmReportsTo: 'owner' };
    case 'split': return {
      arrangement: a,
      finalSay: { roster: 'head_coach', staff: 'head_coach', draft: splitOf, contracts: splitOf },
      headCoachReportsTo: 'owner', gmReportsTo: 'owner',
    };
    case 'owner': return { arrangement: a, finalSay: all('owner'), headCoachReportsTo: 'owner', gmReportsTo: 'owner' };
    case 'executive': return { arrangement: a, finalSay: all('executive'), headCoachReportsTo: 'executive', gmReportsTo: 'executive' };
    case 'program': return {
      arrangement: a,
      finalSay: { roster: 'head_coach', contracts: 'head_coach', staff: 'head_coach', draft: 'unused' },
      headCoachReportsTo: 'athletic_director', gmReportsTo: 'head_coach',
    };
  }
}

/** A team led by an owner draws from the club odds; one led by an athletic director takes the program default. */
export interface TeamLeadership { readonly ownerPersonId: number | null; readonly athleticDirectorPersonId: number | null }

/** Weights for generated clubs (L5.2.1 `power_arrangement_odds`; anchor fact F-bosses-0001, 1 of 3). */
export function clubOdds(): readonly [Arrangement, number][] {
  return [
    ['general_manager', param('power.odds.general_manager')],
    ['head_coach', param('power.odds.head_coach')],
    ['owner', param('power.odds.owner')],
    ['executive', param('power.odds.executive')],
  ];
}

/**
 * Draw a team's arrangement at generation. Clubs: one weighted pick, then split duties inside the general
 * manager and owner groups. Programs: the T9.1.1 default with its two variants. Draw order is fixed.
 */
export function generatePower(team: TeamLeadership, stream: RandomStream): Power {
  if (team.ownerPersonId === null && team.athleticDirectorPersonId !== null) {
    const base = arrangement('program');
    const paymentsAbove = stream.chance(param('power.college.paymentsAbove'));
    const holderIsAd = stream.chance(param('power.college.paymentsHolderAdShare'));
    const gmToAd = stream.chance(param('power.college.gmReportsToAd'));
    return {
      ...base,
      finalSay: { ...base.finalSay, contracts: paymentsAbove ? (holderIsAd ? 'athletic_director' : 'general_manager') : 'head_coach' },
      gmReportsTo: gmToAd ? 'athletic_director' : 'head_coach',
    };
  }
  const odds = clubOdds();
  const picked = odds[stream.pick(odds.map(([, w]) => w))]![0];
  const split = stream.chance(param('power.splitShare'));
  if (split && (picked === 'general_manager' || picked === 'owner')) return arrangement('split', picked);
  return arrangement(picked);
}

export function holderOf(power: Power, field: PowerField): Holder {
  return power.finalSay[field];
}

/** Arrangement changes: won in a renegotiation after success, or lost as a hot-seat sign (L5.2.1). */
export function withField(power: Power, field: PowerField, holder: Holder): Power {
  return { ...power, finalSay: { ...power.finalSay, [field]: holder } };
}

// ---- Actions -------------------------------------------------------------------------------------------

/** Club actions that L5.2.1 says must check `power` (C6 to C8, H6, M3 to M5, L4). */
export const CLUB_ACTIONS = [
  'draft_pick', 'sign_free_agent', 'trade', 'offer_contract', 'extend', 'release', 'claim', 'promote_practice_squad',
  'set_53', 'hire_staff', 'fire_staff', 'hire_personnel_man', 'depth_chart', 'game_day_actives',
] as const;
export type ClubAction = (typeof CLUB_ACTIONS)[number];

/**
 * The field each action reads. The depth chart and game-day actives are the head coach's own in every
 * arrangement (L5.2.6 outputs, H6.2.1, H6.5.2), so they read no field.
 */
export const ACTION_FIELD: Readonly<Record<ClubAction, PowerField | null>> = {
  draft_pick: 'draft', sign_free_agent: 'contracts', trade: 'roster', offer_contract: 'contracts', extend: 'contracts',
  release: 'roster', claim: 'roster', promote_practice_squad: 'roster', set_53: 'roster',
  hire_staff: 'staff', fire_staff: 'staff', hire_personnel_man: 'staff', depth_chart: null, game_day_actives: null,
};

/** A field the holder hands to the personnel man for a week or a season (L5.2.1). He owns the result. */
export interface Delegation {
  readonly id: number;
  readonly field: PowerField;
  readonly from: Seat;
  readonly to: Seat;
  readonly fromDay: number;
  readonly toDay: number;
}

export type Routing =
  | { readonly kind: 'decision'; readonly field: PowerField | null; readonly by: Seat }
  | { readonly kind: 'request'; readonly field: PowerField; readonly to: Seat; readonly reason: 'not_holder' }
  | { readonly kind: 'delegated'; readonly field: PowerField; readonly by: Seat; readonly delegationId: number }
  | { readonly kind: 'not_applicable'; readonly field: PowerField; readonly reason: 'field_unused' };

function activeDelegation(field: PowerField, actor: Seat, day: number, ds: readonly Delegation[]): Delegation | null {
  for (const d of ds) if (d.field === field && d.to === actor && d.fromDay <= day && day <= d.toDay) return d;
  return null;
}

/** Whom the actor must persuade for a field he does not hold. */
export function requestTarget(power: Power, field: PowerField): Seat {
  const h = power.finalSay[field];
  return h === 'unused' ? power.headCoachReportsTo : h;
}

/**
 * L5.2.1 acceptance: every action checks `power` and renders as a decision or a request. A holder who has
 * delegated the field acts through requests to his delegate only if he chooses to take it back.
 */
export function route(power: Power, action: ClubAction, actor: Seat, day: number, delegations: readonly Delegation[] = []): Routing {
  const field = ACTION_FIELD[action];
  if (field === null) return actor === 'head_coach' ? { kind: 'decision', field, by: actor } : { kind: 'request', field: 'roster', to: 'head_coach', reason: 'not_holder' };
  const h = power.finalSay[field];
  if (h === 'unused') return { kind: 'not_applicable', field, reason: 'field_unused' };
  if (h === actor) return { kind: 'decision', field, by: actor };
  const d = activeDelegation(field, actor, day, delegations);
  if (d && d.from === h) return { kind: 'delegated', field, by: actor, delegationId: d.id };
  return { kind: 'request', field, to: requestTarget(power, field), reason: 'not_holder' };
}

/** True when the actor may carry the act out for the club himself (a decision or a logged delegation). */
export function mayAct(power: Power, action: ClubAction, actor: Seat, day: number, delegations: readonly Delegation[] = []): boolean {
  const r = route(power, action, actor, day, delegations);
  return r.kind === 'decision' || r.kind === 'delegated';
}

/** Fields the head coach holds: what the user decides himself when he holds that job. */
export function fieldsHeldBy(power: Power, seat: Seat): PowerField[] {
  return POWER_FIELDS.filter((f) => power.finalSay[f] === seat);
}

/** The arrangement in plain words for the offer and organization screens (L5.2.1). */
export function describePower(power: Power): string[] {
  const name: Record<Holder, string> = {
    head_coach: 'the head coach', general_manager: 'the general manager', owner: 'the owner', executive: 'the football executive',
    athletic_director: 'the athletic director', unused: '',
  };
  const label: Record<PowerField, string> = { roster: 'the roster', draft: 'the draft', contracts: 'contracts and free agents', staff: 'the staff' };
  const lines = POWER_FIELDS.filter((f) => power.finalSay[f] !== 'unused').map((f) => `Final say on ${label[f]}: ${name[power.finalSay[f]]}.`);
  lines.push(`The head coach reports to ${name[power.headCoachReportsTo]}.`);
  if (power.gmReportsTo !== null) lines.push(`The general manager reports to ${name[power.gmReportsTo]}.`);
  return lines;
}

// ---- Schema bridge -------------------------------------------------------------------------------------

/** TeamRecord.finalSay (W-29): job id per domain, null meaning the owner or administrator. */
export interface FinalSayRow { roster: number | null; contracts: number | null; draft: number | null; staffHiring: number | null }

/** Write `power` into the team row. `jobOf` gives the team's job id for a seat (null for owner and administrator seats). */
export function toFinalSayRow(power: Power, jobOf: (s: Seat) => number | null): FinalSayRow {
  const j = (h: Holder): number | null => (h === 'unused' ? null : jobOf(h));
  return { roster: j(power.finalSay.roster), contracts: j(power.finalSay.contracts), draft: j(power.finalSay.draft), staffHiring: j(power.finalSay.staff) };
}
