// The college budget view (team.cap at the college level, T7): the revenue share cap, the scholarship
// cost counted against it, the school's pool and football's share, and the head coach's pay sheet
// checked by the college module. Money in the college module is whole dollars; the view uses cents so
// the screen formats both levels the same way. Pure.
import type { RuleSet } from '@gm/schema';
import { cap, college } from '@gm/league';
import { provenanceOf, type PlayerCard } from './model.ts';
import type { CollegeBudgetView, Provenance, ProvenanceLookup } from './types.ts';

export interface CollegeBudgetInput {
  readonly clubId: number;
  readonly rules: RuleSet;
  readonly college: college.CollegeRules;
  readonly tier: college.BudgetTier;
  /** Where the school sits inside its tier's range, 0 to 1 (a generated program's budget strength). */
  readonly tierPosition: number;
  readonly split?: college.PoolSplit;
  /** Reserve the athletic director released to football this year (USD). */
  readonly reserveReleased?: number;
  readonly lines: readonly college.SheetLine[];
  readonly cards: readonly PlayerCard[];
  readonly provenance: ProvenanceLookup;
}

const cents = (usd: number) => Math.round(usd * cap.CENTS_PER_USD);

function keyProvenance(lookup: ProvenanceLookup, keys: readonly string[], fallback: string): Provenance {
  return provenanceOf(lookup, keys[0] ?? fallback);
}

export function buildCollegeBudgetView(input: CollegeBudgetInput): CollegeBudgetView {
  const { rules, provenance } = input;
  const year = input.college.seasonYear;
  const suffix = college.academicYearSuffix(year);
  const capRead: string[] = [];
  college.revenueShareCapFor(rules, year, capRead);
  const budget = college.footballBudget(input.college, input.tier, input.tierPosition, input.split ?? college.startingSplit());
  const released = input.reserveReleased ?? 0;
  const verdict = college.validateSheet(input.lines, budget, input.college, released);
  const cards = new Map(input.cards.map((c) => [c.personId, c]));
  const byPosition = college.PAY_POSITIONS.map((p) => ({ position: p, cents: cents(input.lines.filter((l) => l.position === p).reduce((s, l) => s + l.amount, 0)) }))
    .filter((r) => r.cents !== 0);
  const aidKey = rules.keys().includes('league.aid_limit') ? 'league.aid_limit' : 'league.roster_limit';
  return {
    level: 'college', clubId: input.clubId, academicYear: year, tier: input.tier,
    capCents: cents(budget.cap), capSource: keyProvenance(provenance, capRead, `pay.revenue_share_cap_${suffix}`),
    scholarshipCreditCents: cents(input.college.pay?.scholarshipCredit ?? 0), creditSource: provenanceOf(provenance, `pay.scholarship_credit_${suffix}`),
    paymentRoomCents: cents(budget.paymentRoom), schoolPoolCents: cents(budget.schoolPool), footballCents: cents(budget.football),
    reserveCents: cents(budget.reserve), reserveReleasedCents: cents(Math.min(released, budget.reserve)),
    aidLimit: input.college.aidLimit, aidSource: provenanceOf(provenance, aidKey),
    reportThresholdCents: cents(input.college.pay?.nilReportThreshold ?? 0), reportSource: provenanceOf(provenance, 'pay.nil_report_threshold_usd'),
    lines: input.lines.map((l) => ({ personId: l.personId, name: cards.get(l.personId)?.name ?? `#${l.personId}`, position: l.position, amountCents: cents(l.amount) }))
      .sort((a, b) => b.amountCents - a.amountCents || a.personId - b.personId),
    totalCents: cents(verdict.total), leftCents: verdict.ok ? cents(verdict.left) : null, refused: verdict.ok ? null : verdict.reason,
    paidPlayers: input.lines.filter((l) => l.amount > 0).length, byPosition, quarterbackShare: verdict.ok ? verdict.quarterbackShare : 0,
  };
}
