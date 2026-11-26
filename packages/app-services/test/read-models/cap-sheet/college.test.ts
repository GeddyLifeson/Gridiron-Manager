// College budget view (T7.1.1, T7.3.1): the revenue share cap and scholarship credit come from the
// G-10 college league file with their fact rows; the budget and the sheet check are the college module's.
import { describe, expect, it } from 'vitest';
import { college } from '@gm/league';
import { buildCollegeBudgetView, type CollegeBudgetInput } from '../../../src/read-models/cap-sheet/index.ts';
import { COLLEGE, COLLEGE_FILE, lookup } from './fixture.ts';

const RULES = college.collegeRules(COLLEGE);

function input(over: Partial<CollegeBudgetInput> = {}): CollegeBudgetInput {
  return {
    clubId: 40, rules: COLLEGE, college: RULES, tier: 'top', tierPosition: 1,
    lines: [{ personId: 1, position: 'QB', amount: 2000000 }, { personId: 2, position: 'OT', amount: 800000 }],
    cards: [{ personId: 1, name: 'Ty Lane', position: 'QB' }], provenance: lookup(COLLEGE_FILE), ...over,
  };
}

describe('cap sheet: college player pay (T7)', () => {
  it('shows the 2026-27 cap and scholarship credit with their fact rows', () => {
    const v = buildCollegeBudgetView(input());
    expect(v.capCents).toBe(21300000 * 100); // F-college-0004
    expect(v.capSource).toMatchObject({ key: 'pay.revenue_share_cap_2026_27', factId: 'F-college-0004' });
    expect(v.scholarshipCreditCents).toBe(2500000 * 100);
    expect(v.creditSource.factId).toBe('F-college-keys-0030');
    expect(v.paymentRoomCents).toBe((21300000 - 2500000) * 100);
    expect(v.aidLimit).toBe(105);
  });

  it('agrees with the college module on football budget and the sheet', () => {
    const budget = college.footballBudget(RULES, 'top', 1);
    const v = buildCollegeBudgetView(input());
    expect(v.footballCents).toBe(budget.football * 100);
    expect(v.totalCents).toBe(2800000 * 100);
    expect(v.leftCents).toBe((budget.football - 2800000) * 100);
    expect(v.lines[0]).toMatchObject({ name: 'Ty Lane', amountCents: 2000000 * 100 });
    expect(v.byPosition).toEqual([{ position: 'QB', cents: 200000000 }, { position: 'OT', cents: 80000000 }]);
  });

  it('refuses a sheet over the football budget', () => {
    const budget = college.footballBudget(RULES, 'top', 1);
    const v = buildCollegeBudgetView(input({ lines: [{ personId: 1, position: 'QB', amount: budget.football + 1 }] }));
    expect(v.refused).toBe('over_budget');
    expect(v.leftCents).toBeNull();
  });

  it('a school not opted in has no pool', () => {
    expect(buildCollegeBudgetView(input({ tier: 'not_opted_in', lines: [] })).footballCents).toBe(0);
  });
});
