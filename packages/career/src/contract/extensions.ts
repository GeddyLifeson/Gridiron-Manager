// E3.7 extensions, rollovers and the final contract year.
import { roundCents, type Cents } from '../wealth/index.ts';
import { cparam } from './params.ts';
import type { CoachContract, RosterAuthority, SalaryYear } from './types.ts';

export function yearsLeft(c: CoachContract, leagueYear: number): number {
  return Math.max(0, c.endYear - leagueYear + 1);
}

/** E3.7.1: the owner offers when confidence is above the threshold and two or fewer years are left. */
export function ownerOffersExtension(confidence: number, c: CoachContract, leagueYear: number): boolean {
  const left = yearsLeft(c, leagueYear);
  return left > 0 && left <= cparam('extensionMaxYearsLeft') && confidence >= cparam('extensionConfidence');
}

export interface ExtensionTerms {
  /** First league year the new salary applies to (normally next year). Earlier years are kept. */
  readonly fromYear: number;
  readonly newEndYear: number;
  readonly firstYearPayCents: Cents;
  readonly raise: number;
  /** Authority clauses can be reopened in an extension; null keeps the current arrangement. */
  readonly rosterAuthority: RosterAuthority | null;
}

/** Replace remaining years from `fromYear` and add new ones. Respects a state term cap. */
export function extend(c: CoachContract, x: ExtensionTerms): CoachContract {
  const capEnd = c.termCapYears === null ? x.newEndYear : Math.min(x.newEndYear, x.fromYear + c.termCapYears - 1);
  const kept = c.salary.filter((y) => y.leagueYear < x.fromYear);
  const sup = c.salary.length ? (c.salary[c.salary.length - 1]!.supplementalCents / Math.max(1, c.salary[c.salary.length - 1]!.baseCents + c.salary[c.salary.length - 1]!.supplementalCents)) : 0;
  const added: SalaryYear[] = [];
  let pay = x.firstYearPayCents;
  for (let y = x.fromYear; y <= capEnd; y++) {
    const total = roundCents(pay);
    const s = roundCents(total * sup);
    added.push({ leagueYear: y, baseCents: total - s, supplementalCents: s });
    pay *= 1 + x.raise;
  }
  return {
    ...c, salary: [...kept, ...added], endYear: capEnd,
    guarantee: { ...c.guarantee, guaranteedThroughYear: capEnd },
    rosterAuthority: x.rosterAuthority ?? c.rosterAuthority,
  };
}

export type RolloverEvent = { readonly kind: 'playoff_appearance' } | { readonly kind: 'season_wins'; readonly wins: number };

/** E3.7.1 rollover: one more year on the trigger, no negotiation, authority untouched, up to the unexpired cap. */
export function applyRollover(c: CoachContract, leagueYear: number, e: RolloverEvent): CoachContract {
  const r = c.rollover;
  const hit = (r.trigger === 'playoff_appearance' && e.kind === 'playoff_appearance') || (r.trigger === 'win_total' && e.kind === 'season_wins' && r.winTotal !== null && e.wins >= r.winTotal);
  if (!hit) return c;
  const unexpiredAfter = c.endYear + 1 - leagueYear;
  if (r.maxUnexpiredYears !== null && unexpiredAfter > r.maxUnexpiredYears) return c;
  // A state term cap limits the written term, not rollovers: a capped school writes four years plus automatic extensions.
  const last = c.salary[c.salary.length - 1];
  if (!last) return c;
  const next: SalaryYear = { ...last, leagueYear: c.endYear + 1 };
  return { ...c, salary: [...c.salary, next], endYear: c.endYear + 1, guarantee: { ...c.guarantee, guaranteedThroughYear: c.endYear + 1 } };
}

export interface FinalYearEffects {
  readonly finalYear: boolean;
  /** Added to an assistant's chance of accepting an outside offer (L4). */
  readonly assistantLeaveAdd: number;
  /** Multiplies a recruit's weight on the coach's promises (college recruiting). */
  readonly recruitPromiseFactor: number;
  /** Drop in role_belief from a promise, for players under contract past the coach's last year (L1, L5.1.5). */
  readonly roleBeliefDrop: number;
}

/** E3.7.2: a flag on other people's choices, never on play contests. Clears when an extension is signed. */
export function finalYearEffects(c: CoachContract, leagueYear: number): FinalYearEffects {
  const finalYear = yearsLeft(c, leagueYear) === 1;
  return finalYear
    ? { finalYear, assistantLeaveAdd: cparam('finalYearAssistantLeaveAdd'), recruitPromiseFactor: cparam('finalYearRecruitPromiseFactor'), roleBeliefDrop: cparam('finalYearRoleBeliefDrop') }
    : { finalYear, assistantLeaveAdd: 0, recruitPromiseFactor: 1, roleBeliefDrop: 0 };
}
