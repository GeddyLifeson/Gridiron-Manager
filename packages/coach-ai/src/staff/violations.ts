// K6.6.1 staff who break rules, with or without the head coach. The decision itself is the one
// procedure every AI person uses (K2.8.2, league.compliance.decideViolation) and a request from the
// boss is league.compliance.staffRequest; this file is the staff side: who the actor is, whether he
// brings the idea to the head coach first or acts unasked, and the memory a refusal leaves. The act,
// its detection and who answers for it are the L8.2.5 pipeline's (league.compliance.commitAct), the
// same for the user and for AI. Imported real people never commit or propose (X14).
import { compliance } from '@gm/league';
import { P, clamp, facetShare } from './params.ts';
import type { StaffMember } from './types.ts';

type Disposition = compliance.Disposition;
type Opportunity = compliance.Opportunity;
type ComplianceState = Parameters<typeof compliance.decideViolation>[0];
type WorldDate = Parameters<typeof compliance.decideViolation>[3];
type StreamFor = Parameters<typeof compliance.decideViolation>[4];
type Origin = Disposition['origin'];

/** What K2.8.2 reads about a staff member. `origin` and `pressure` come from the caller (people module, E4 job security). */
export function disposition(m: StaffMember, origin: Origin, pressure: number): Disposition {
  return {
    personId: m.personId, origin: m.imported ? 'imported' : origin, ruleRespectZ: m.facets.ruleRespectZ,
    riskTolerance: m.facets.riskTolerance, candor: m.facets.candor, pressure: clamp(pressure, 0, 1),
  };
}

/** Chance a willing assistant brings it to the head coach instead of doing it unasked: the open, loyal ones ask. */
export function proposalChance(m: StaffMember): number {
  const open = (facetShare(m.facets.candor) + facetShare(m.facets.loyalty)) / 2;
  return clamp(P('proposal_base') * 2 * open, P('proposal_floor'), 1 - P('proposal_floor'));
}

export type UnaskedOutcome =
  | { readonly kind: 'none'; readonly score: number }
  /** He proposes it ("I can get that recruit on the phone this week"). The head coach asks, allows, stops or reports. */
  | { readonly kind: 'proposed'; readonly score: number; readonly staffId: number; readonly classId: string }
  /** He does it without a word. The caller hands the act to `commitAct` with no `orderedBy`. */
  | { readonly kind: 'committed'; readonly score: number; readonly staffId: number; readonly classId: string };

/** K6.6.1 rule 1: an opportunity with no request from the head coach. */
export function unasked(state: ComplianceState, opp: Opportunity, m: StaffMember, origin: Origin, pressure: number, date: WorldDate, conduct: StreamFor): UnaskedOutcome {
  const d = compliance.decideViolation(state, opp, disposition(m, origin, pressure), date, conduct);
  if (!d.commit) return { kind: 'none', score: d.score };
  const proposes = conduct(['propose', date.seasonYear, date.dayIndex, m.personId, opp.classId]).chance(proposalChance(m));
  return { kind: proposes ? 'proposed' : 'committed', score: d.score, staffId: m.personId, classId: opp.classId };
}

export interface AskedOutcome {
  readonly outcome: compliance.RequestOutcome;
  readonly score: number;
  /** A refusal is remembered for good (K6.6.1 rule 2): the caller writes it to X6 as a permanent row. */
  readonly memory: { readonly kind: 'refused_illegal_request'; readonly staffId: number; readonly classId: string; readonly permanent: true } | null;
  /** True when he also reports the request to compliance or the league (L5.4.5, C11). */
  readonly reported: boolean;
}

/** K6.6.1 rule 2: the head coach asks. The request is added pressure; he may still refuse, and may report it. */
export function asked(state: ComplianceState, opp: Opportunity, m: StaffMember, origin: Origin, pressure: number, date: WorldDate, conduct: StreamFor): AskedOutcome {
  const r = compliance.staffRequest(state, opp, disposition(m, origin, pressure), date, conduct);
  const refused = r.outcome !== 'complied';
  return {
    outcome: r.outcome, score: r.score, reported: r.outcome === 'reported',
    memory: refused ? { kind: 'refused_illegal_request', staffId: m.personId, classId: opp.classId, permanent: true } : null,
  };
}
