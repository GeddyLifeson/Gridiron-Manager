// coach.contract (O4.6.1, E3.1.1): his own contract as signed, term by term in words and money, with the
// clauses that bind him. Only the contract record is read (E3); nothing here estimates what an owner would do.
import { contract } from '@gm/career';
import { money, t } from './text.ts';
import type { ContractView } from './types.ts';

export interface ContractInput {
  readonly rights: readonly string[];
  /** His active contract, or null when he holds none. */
  readonly contract: contract.CoachContract | null;
  readonly team: string | null;
  readonly jobTitle: string | null;
  /** League year now. */
  readonly leagueYear: number;
}

const pct = (share: number): number => Math.round(share * 1000) / 10;

export function contractTerms(c: contract.CoachContract, leagueYear: number): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const s of c.salary) {
    if (s.leagueYear < leagueYear) continue;
    rows.push({ label: t('term.base', { year: s.leagueYear }), value: money(s.baseCents) });
    if (s.supplementalCents > 0) rows.push({ label: t('term.supplemental', { year: s.leagueYear }), value: money(s.supplementalCents) });
  }
  if (c.signingBonusCents > 0) rows.push({ label: t('term.signing'), value: money(c.signingBonusCents) });
  rows.push({ label: t('term.guarantee', { year: c.guarantee.guaranteedThroughYear }), value: `${pct(c.guarantee.share)}%` });
  rows.push({ label: t('term.buyout'), value: buyoutText(c.buyout) });
  rows.push({ label: t('term.offset'), value: c.offset.on ? t('term.offset.on', { income: t(`term.offset.${c.offset.income}`) }) : t('term.offset.off') });
  if (c.seat === 'head_coach') {
    rows.push({ label: t('term.authority'), value: t(`auth.${c.rosterAuthority}`) });
    if (c.staff.poolCents > 0) rows.push({ label: t('term.staffPool'), value: money(c.staff.poolCents) });
    if (c.staff.sizeCap > 0) rows.push({ label: t('term.staffCap'), value: String(c.staff.sizeCap) });
  }
  if (c.incentiveCapCents > 0) rows.push({ label: t('term.incentiveCap'), value: money(c.incentiveCapCents) });
  if (c.clubOptionYear !== null) rows.push({ label: t('term.clubOption'), value: String(c.clubOptionYear) });
  if (c.coachOptionYear !== null) rows.push({ label: t('term.coachOption'), value: String(c.coachOptionYear) });
  rows.push({ label: t('term.resignation'), value: t(`resign.${c.resignationWindow}`) });
  if (c.agentId !== null && c.agentFeeShare > 0) rows.push({ label: t('term.agent'), value: `${pct(c.agentFeeShare)}%` });
  for (const p of c.perquisites) rows.push({ label: t('term.perk', { key: p.key.replace(/_/g, ' ') }), value: money(p.amountCents) });
  return rows;
}

function buyoutText(b: contract.BuyoutTerms): string {
  switch (b.form) {
    case 'none': return t('term.buyout.none');
    case 'fixed_by_year': return t('term.buyout.fixed_by_year', { list: b.fixedByYearCents.map((c) => money(c)).join(', ') });
    case 'per_remaining_year': return t('term.buyout.per_remaining_year', { amount: money(b.perRemainingYearCents) });
    case 'pct_remaining': return t('term.buyout.pct_remaining', { pct: pct(b.share) });
    case 'assistant_ladder': {
      const [a, bb, c] = b.ladder ?? [b.share, b.share, b.share];
      return t('term.buyout.assistant_ladder', { a: pct(a), b: pct(bb), c: pct(c) });
    }
  }
}

export function contractClauses(c: contract.CoachContract): string[] {
  const out = c.otherClauses.map((k) => t(`clause.${k}`));
  if (c.releaseHeldByClub) out.push(t('clause.releaseHeld'));
  for (const i of c.incentives) {
    out.push(i.trigger === 'win_threshold' && i.fromWins !== null
      ? t('clause.incentive.wins', { amount: money(i.amountCents), wins: i.fromWins })
      : t('clause.incentive', { amount: money(i.amountCents), trigger: t(`trigger.${i.trigger}`) }));
  }
  return out;
}

export function buildContractView(x: ContractInput): ContractView {
  const c = x.contract;
  if (!c || c.state !== 'active') return { rights: [...x.rights], team: null, jobTitle: null, terms: [], yearsLeft: null, clauses: [] };
  return {
    rights: [...x.rights], team: x.team, jobTitle: x.jobTitle,
    terms: contractTerms(c, x.leagueYear),
    yearsLeft: Math.max(0, c.endYear - x.leagueYear + 1),
    clauses: contractClauses(c),
  };
}
