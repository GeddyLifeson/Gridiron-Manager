// team.cap screen: renders in the shell frame, shows every figure from the model with its fact row and a
// flag when short of triple verification, previews moves, and sends intents; a recommending seat gets no
// action buttons.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell, SCREENS } from '../../../src/shell/index.ts';
import { CapScreen, capRoute, capTextIds, ct, money, SCREEN_ID, type CapIntent, type CapUi, type CollegeBudgetUi, type ProCapUi, type Tab } from '../../../src/screens/cap/index.ts';

const M = 100000000;
const src = (key: string, factId: string | null, status: string | null = 'Rulebook only') => ({ key, factId, status });
const move = (kind: 'release' | 'release_june1' | 'trade', over = {}) => ({
  kind, refused: null, deadThisYearCents: 10 * M, deadNextYearCents: 0, guaranteedOwedCents: 0, savingCents: -3 * M, roomAfterCents: 290 * M, chargeUntilJune2Cents: null, ...over,
});

function pro(over: Partial<ProCapUi> = {}): ProCapUi {
  return {
    level: 'pro', clubId: 3, leagueYear: 2026, phase: 'season', timing: 'on_or_before_june1',
    capCents: 3012 * M / 10, capSource: src('cap.amount_2026', 'F-cap-0042'), adjustmentCents: 0, teamSalaryCents: 7 * M, roomCents: 294 * M,
    countedInFull: 1, topN: 51, topNSource: src('cap.top_n_contracts', 'F-cap-0002'), june1: { allowed: 2, used: 0, source: src('cap.june1_designations', 'F-cap-0004', 'Verified') },
    prorationMaxYears: 5, prorationSource: src('cap.proration_max_years', 'F-cap-0003'),
    years: [
      { leagueYear: 2026, capCents: 3012 * M / 10, capSource: src('cap.amount_2026', 'F-cap-0042'), committedCents: 7 * M, deadCents: 0, roomCents: 294 * M },
      { leagueYear: 2027, capCents: null, capSource: src('cap.amount_2027', null, null), committedCents: 7 * M, deadCents: 0, roomCents: null },
    ],
    rows: [{
      contractId: 1, personId: 10, name: 'Sam Field', position: 'QB', form: 'veteran',
      thisYear: { baseCents: 5 * M, prorationCents: 2 * M, rosterBonusCents: 0, workoutBonusCents: 0, likelyIncentivesCents: 0, totalCents: 7 * M },
      countedInFull: true, countsCents: 7 * M, byYear: [{ leagueYear: 2026, chargeCents: 7 * M }, { leagueYear: 2027, chargeCents: 7 * M }], lastLeagueYear: 2030,
      remainingProrationCents: 10 * M, tranches: [{ source: 'signing', amountCents: 10 * M, paidLeagueYear: 2026, byYear: [{ leagueYear: 2026, cents: 2 * M }] }],
      rookie: null, minimumSalaryCents: 885000 * 100,
      moves: [move('release'), move('release_june1', { refused: 'league rule: the club has used its June 1 designations this league year' }), move('trade', { savingCents: 1 * M })],
    }],
    other: [], ...over,
  };
}

function college(over: Partial<CollegeBudgetUi> = {}): CollegeBudgetUi {
  return {
    level: 'college', clubId: 40, academicYear: 2026, tier: 'top', capCents: 21300000 * 100, capSource: src('pay.revenue_share_cap_2026_27', 'F-college-0004'),
    scholarshipCreditCents: 2500000 * 100, creditSource: src('pay.scholarship_credit_2026_27', 'F-college-keys-0030', 'Conflict'),
    paymentRoomCents: 18800000 * 100, schoolPoolCents: 18800000 * 100, footballCents: 14000000 * 100, reserveCents: 0, reserveReleasedCents: 0,
    aidLimit: 105, aidSource: src('league.aid_limit', 'F-college-0002'), reportThresholdCents: 60000, reportSource: src('pay.nil_report_threshold_usd', 'F-college-0006'),
    lines: [{ personId: 1, name: 'Ty Lane', position: 'QB', amountCents: 2000000 * 100 }], totalCents: 2000000 * 100, leftCents: 12000000 * 100, refused: null,
    paidPlayers: 1, byPosition: [{ position: 'QB', cents: 2000000 * 100 }], quarterbackShare: 0.142857, ...over,
  };
}

const esc = (x: string) => x.replace(/'/g, '&#x27;');
const html = (v: CapUi | null, tab: Tab = 'contracts', opts: { readOnly?: boolean; selected?: number | null; onIntent?: (i: CapIntent) => void } = {}) =>
  renderToStaticMarkup(createElement(CapScreen, { view: v, tab, readOnly: opts.readOnly ?? false, selected: opts.selected ?? null, onTab: () => {}, onSelect: () => {}, onIntent: opts.onIntent ?? (() => {}) }));

describe('contracts and cap screen (C6, T7)', () => {
  it('is registered and renders in the shell frame with an open contract from the address', () => {
    expect(SCREENS.some((s) => s.id === SCREEN_ID)).toBe(true);
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: '/team/cap?tab=contracts&contract=1', routes: { [SCREEN_ID]: capRoute({ view: () => pro(), dispatch: () => {} }) } }));
    expect(out).toContain(`data-screen="${SCREEN_ID}"`);
    expect(out).toContain('data-detail="1"');
  });

  it('shows cap, salary and room, each rule value with its fact row', () => {
    const out = html(pro());
    expect(out).toContain(money(3012 * M / 10));
    expect(out).toContain('$301,200,000');
    expect(out).toContain(money(294 * M));
    expect(out).toContain('data-fact="F-cap-0042"');
    expect(out).toContain(ct('cap.summary.june1', { used: 0, allowed: 2 }));
  });

  it('flags rule values short of triple verification and not the verified ones', () => {
    const out = html(pro());
    expect(out).toContain('data-fact="F-cap-0042" data-verified="no"');
    expect(out).toContain('data-fact="F-cap-0004" data-verified="yes"');
    expect(out).toContain(ct('cap.fact.flag'));
  });

  it('lists contracts with base, proration and what counts', () => {
    const out = html(pro());
    expect(out).toContain('data-contract="1"');
    expect(out).toContain(money(5 * M));
    expect(out).toContain(money(2 * M));
  });

  it('the open contract previews each move, including a refused June 1 designation', () => {
    const out = html(pro(), 'contracts', { selected: 1 });
    expect(out).toContain('data-move="release"');
    expect(out).toContain(ct('cap.move.cost', { cost: money(3 * M) }));
    expect(out).toContain('data-refused="release_june1"');
    expect(out).toContain(ct('cap.move.saving', { saving: money(1 * M) }));
    expect(out).toContain(ct('cap.move.do', { name: 'Sam Field' }));
  });

  it('a recommending seat sees the costs but no action buttons', () => {
    const out = html(pro(), 'contracts', { selected: 1, readOnly: true });
    expect(out).toContain(esc(ct('cap.readOnly')));
    expect(out).not.toContain(ct('cap.move.do', { name: 'Sam Field' }));
  });

  it('years with no published cap say so instead of a number', () => {
    const out = html(pro(), 'years');
    expect(out).toContain('data-year="2027"');
    expect(out).toContain(ct('cap.notSet'));
  });

  it('warns when over the cap', () => {
    expect(html(pro({ roomCents: -2 * M }))).toContain(ct('cap.summary.over', { amount: money(2 * M) }));
  });

  it('dead money tab lists charges or says there are none', () => {
    expect(html(pro(), 'dead')).toContain(esc(ct('cap.dead.none')));
    expect(html(pro({ other: [{ label: 'Released: J. Doe', amountCents: 3 * M, kind: 'dead' }] }), 'dead')).toContain('Released: J. Doe');
  });

  it('college: shows the revenue share cap, the scholarship credit flagged as a conflict, and the sheet', () => {
    const out = html(college());
    expect(out).toContain(ct('cap.title.college', { year: 2026 }));
    expect(out).toContain('$21,300,000');
    expect(out).toContain('data-fact="F-college-keys-0030" data-verified="no"');
    expect(out).toContain('Conflict');
    expect(out).toContain('data-pay="1"');
    expect(html(college({ refused: 'over_budget', leftCents: null }))).toContain(ct('cap.college.refused.over_budget'));
  });

  it('every string id used exists and has no unfilled slot in plain text', () => {
    expect(capTextIds().length).toBeGreaterThan(50);
    const out = html(pro(), 'contracts', { selected: 1 }) + html(pro(), 'years') + html(college());
    expect(out).not.toMatch(/cap\.[a-z_]+\.[a-z_]+/);
  });
});
