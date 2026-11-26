// E3.5 negotiation: the round loop over a table of terms, the club's hidden offer budget, the agent's noisy read,
// and leverage. "Offer budget units" are the club's internal budget for one offer, never coach points.
import { roundCents, type Cents } from '../wealth/index.ts';
import { cparam } from './params.ts';
import { ROSTER_AUTHORITY_STEPS, type ContractRandom, type RosterAuthority } from './types.ts';

export type TermKey = 'salary' | 'years' | 'guarantee' | 'control' | 'staffPool' | 'perquisites';
export const TERM_KEYS: readonly TermKey[] = ['salary', 'years', 'guarantee', 'control', 'staffPool', 'perquisites'];

export interface NegotiableTerms {
  readonly salaryPerYearCents: Cents;
  readonly years: number;
  readonly guaranteeShare: number;
  readonly rosterAuthority: RosterAuthority;
  readonly staffPoolCents: Cents;
  readonly perquisiteCount: number;
}

/** How much the owner values each term (multiplies its cost). 1 is neutral; K8 owner traits set them. */
export type OwnerWeights = Readonly<Record<TermKey, number>>;
export const NEUTRAL_WEIGHTS: OwnerWeights = { salary: 1, years: 1, guarantee: 1, control: 1, staffPool: 1, perquisites: 1 };

const CENTS_PER_MILLION = 100_000_000;

function rawUnits(t: NegotiableTerms): Record<TermKey, number> {
  return {
    salary: (t.salaryPerYearCents / CENTS_PER_MILLION) * cparam('unitsPerSalaryMillion'),
    years: t.years * cparam('unitsPerYear'),
    guarantee: t.guaranteeShare * cparam('unitsPerGuaranteeShare'),
    control: ROSTER_AUTHORITY_STEPS.indexOf(t.rosterAuthority) * cparam('unitsPerControlStep'),
    staffPool: (t.staffPoolCents / CENTS_PER_MILLION) * cparam('unitsPerStaffPoolMillion'),
    perquisites: t.perquisiteCount * cparam('unitsPerPerkClause'),
  };
}

/** E3.5.1 rule 1: the cost of a set of terms to the club. */
export function termCost(t: NegotiableTerms, w: OwnerWeights): number {
  const u = rawUnits(t);
  return TERM_KEYS.reduce((s, k) => s + u[k] * w[k], 0);
}

// ---- E3.5.2 leverage ----

export interface LeverageInputs {
  readonly competingLiveOffers: number;
  /** Gap between this candidate and the club's next candidate, 0 (no gap) to 1 (no second choice it likes). */
  readonly candidateGap: number;
  /** Record and reputation term, -1 to 1, from the label engine's evidence (never a coach skill value). */
  readonly recordTerm: number;
  readonly unemployedWithNoOtherOffer: boolean;
}

export function leverageMultiplier(x: LeverageInputs): number {
  const offers = Math.min(Math.max(0, x.competingLiveOffers), cparam('leverageOfferCap'));
  const m = 1 + cparam('leveragePerOffer') * offers + cparam('leverageGapWeight') * x.candidateGap + cparam('leverageRecordWeight') * x.recordTerm
    - (x.unemployedWithNoOtherOffer ? cparam('leverageUnemployedPenalty') : 0);
  return Math.min(cparam('leverageMax'), Math.max(cparam('leverageMin'), m));
}

// ---- E3.5.1 the loop ----

export interface ClubPosture {
  /** Hidden total budget in offer budget units (interest x spending trait x leverage, set by the caller). */
  readonly budgetUnits: number;
  readonly weights: OwnerWeights;
  readonly opening: NegotiableTerms;
}

export interface NegotiationState {
  readonly round: number;
  readonly patience: number;
  readonly onTable: NegotiableTerms;
  readonly status: 'open' | 'signed' | 'withdrawn' | 'final_offer';
  /** Relationship marks with the owner from hard demands (L5), summed. */
  readonly relationshipMark: number;
  readonly hardRounds: number;
}

export function openNegotiation(club: ClubPosture): NegotiationState {
  if (termCost(club.opening, club.weights) > club.budgetUnits + 1e-9) throw new Error('contract: opening offer exceeds the club budget');
  return { round: 0, patience: cparam('patienceStart'), onTable: club.opening, status: 'open', relationshipMark: 0, hardRounds: 0 };
}

/** Trim the counter toward the opening offer, the term the owner values most first, until it fits the budget. */
export function trimToBudget(counter: NegotiableTerms, club: ClubPosture): NegotiableTerms {
  let t = { ...counter };
  const order = [...TERM_KEYS].sort((a, b) => club.weights[b] - club.weights[a]);
  for (const k of order) {
    const excess = termCost(t, club.weights) - club.budgetUnits;
    if (excess <= 1e-9) break;
    t = trimOne(t, k, excess, club);
  }
  return t;
}

function trimOne(t: NegotiableTerms, k: TermKey, excess: number, club: ClubPosture): NegotiableTerms {
  const w = club.weights[k];
  const o = club.opening;
  if (w <= 0) return t;
  switch (k) {
    case 'salary': {
      const per = (cparam('unitsPerSalaryMillion') * w) / CENTS_PER_MILLION;
      return { ...t, salaryPerYearCents: Math.max(o.salaryPerYearCents, t.salaryPerYearCents - Math.ceil(excess / per)) };
    }
    case 'staffPool': {
      const per = (cparam('unitsPerStaffPoolMillion') * w) / CENTS_PER_MILLION;
      return { ...t, staffPoolCents: Math.max(o.staffPoolCents, t.staffPoolCents - Math.ceil(excess / per)) };
    }
    case 'guarantee': {
      const per = cparam('unitsPerGuaranteeShare') * w;
      return { ...t, guaranteeShare: Math.max(o.guaranteeShare, t.guaranteeShare - excess / per) };
    }
    case 'years': {
      const steps = Math.ceil(excess / (cparam('unitsPerYear') * w));
      return { ...t, years: Math.max(o.years, t.years - steps) };
    }
    case 'perquisites': {
      const steps = Math.ceil(excess / (cparam('unitsPerPerkClause') * w));
      return { ...t, perquisiteCount: Math.max(o.perquisiteCount, t.perquisiteCount - steps) };
    }
    case 'control': {
      const steps = Math.ceil(excess / (cparam('unitsPerControlStep') * w));
      const idx = Math.max(ROSTER_AUTHORITY_STEPS.indexOf(o.rosterAuthority), ROSTER_AUTHORITY_STEPS.indexOf(t.rosterAuthority) - steps);
      return { ...t, rosterAuthority: ROSTER_AUTHORITY_STEPS[idx] ?? o.rosterAuthority };
    }
  }
}

export type ClubReply =
  | { readonly kind: 'accept'; readonly terms: NegotiableTerms }
  | { readonly kind: 'counter'; readonly terms: NegotiableTerms }
  | { readonly kind: 'final_offer'; readonly terms: NegotiableTerms }
  | { readonly kind: 'withdrawn' };

/** One round (E3.5.1 rule 3). Inside budget: accepted. Slightly above: a counter trimmed to fit. Far above: patience
 *  drops and the owner relationship takes the hard-demand mark; at zero patience the offer is withdrawn. The last
 *  round turns any counter into a final offer. The club never concedes more than its budget. */
export function clubResponds(state: NegotiationState, counter: NegotiableTerms, club: ClubPosture): { state: NegotiationState; reply: ClubReply } {
  if (state.status !== 'open') throw new Error(`contract: negotiation is ${state.status}`);
  const round = state.round + 1;
  const cost = termCost(counter, club.weights);
  if (cost <= club.budgetUnits + 1e-9) return { state: { ...state, round, onTable: counter, status: 'signed' }, reply: { kind: 'accept', terms: counter } };
  const far = cost > club.budgetUnits * (1 + cparam('slightlyAboveShare'));
  const patience = far ? state.patience - 1 : state.patience;
  const mark = far ? state.relationshipMark + cparam('hardDemandMark') : state.relationshipMark;
  if (patience <= 0) return { state: { ...state, round, patience, relationshipMark: mark, status: 'withdrawn' }, reply: { kind: 'withdrawn' } };
  const terms = trimToBudget(counter, club);
  const last = round >= cparam('maxRounds');
  return {
    state: { ...state, round, patience, relationshipMark: mark, hardRounds: state.hardRounds + (far ? 1 : 0), onTable: terms, status: last ? 'final_offer' : 'open' },
    reply: last ? { kind: 'final_offer', terms } : { kind: 'counter', terms },
  };
}

/** The coach takes what is on the table (a counter or the final offer). */
export function acceptTable(state: NegotiationState): NegotiationState {
  return { ...state, status: 'signed' };
}

/** The opening owner relationship mark if the talks end in a deal (rule 5); nothing when they break. */
export function relationshipMarkOnSigning(state: NegotiationState): number {
  return state.status === 'signed' ? state.relationshipMark : 0;
}

// ---- E3.5.1 rule 4 and E3.6: the agent's read ----

export interface AgentRead { readonly budgetEstimateUnits: number; readonly leastValuedTerm: TermKey }

/** A noisy estimate of the budget and of the term the owner values least. Noise shrinks with the agent's hidden
 *  negotiation skill (0 to 100). Without an agent the user sees nothing (edge case). */
export function agentRead(rng: ContractRandom, club: ClubPosture, agentSkill: number | null): AgentRead | null {
  if (agentSkill === null) return null;
  const s = Math.min(100, Math.max(0, agentSkill)) / 100;
  const noise = cparam('agentNoiseAtZeroSkill') + (cparam('agentNoiseAtFullSkill') - cparam('agentNoiseAtZeroSkill')) * s;
  const budgetEstimateUnits = club.budgetUnits * (1 + noise * (2 * rng.next() - 1));
  const sorted = [...TERM_KEYS].sort((a, b) => club.weights[a] - club.weights[b]);
  // A weak agent may misread the least-valued term: with probability `noise` pick the second-least.
  const leastValuedTerm = (rng.next() < noise ? sorted[1] : sorted[0]) ?? 'perquisites';
  return { budgetEstimateUnits, leastValuedTerm };
}

/** Club budget: units the opening terms cost, scaled by interest and the owner's spending trait (K8), times leverage. */
export function clubBudget(openingCostUnits: number, interest: number, spending: number, leverage: number): number {
  return openingCostUnits * Math.max(1, interest * spending * leverage);
}

export function salaryFromUnits(units: number, w: OwnerWeights): Cents {
  return roundCents((units / (cparam('unitsPerSalaryMillion') * w.salary)) * CENTS_PER_MILLION);
}
