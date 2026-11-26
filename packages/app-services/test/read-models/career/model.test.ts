// The coach's own screens (O4.6, O7.6.1) and the assignment list (O7.2.1): each builder joins the career core
// and shows only what the coach may know. Hidden values (prestige, program strength, market value, health
// state, reputation numbers) never reach a view (A3 ruling 21, MA-48, E8.2.1); net worth is assets minus debts
// from the E6 sheet (O4.6.2 acceptance 1); every projection is a range (O4.6.2 rule 2).
import { describe, expect, it } from 'vitest';
import { ladder, reputation } from '@gm/career';
import {
  buildAssignmentsView, buildCareerView, buildContractView, buildFinanceView, buildJobMarketView, buildLifeView, buildRecordView,
  mixModel, projectRange, careerText,
} from '../../../src/read-models/career/index.ts';
import { assignmentsInput, careerInput, contractInput, contractOf, financeInput, lifeInput, marketInput, recordInput, seat, sheets, weekResult } from './fixture.ts';

const json = (x: unknown): string => JSON.stringify(x);

describe('assignment list (O7.2.1)', () => {
  it('lists the week duties from the ladder core, with a control only where the seat owns the duty', () => {
    const x = assignmentsInput();
    const v = buildAssignmentsView(x);
    const core = ladder.assignmentRows({ view: x.seat, week: 'game' });
    expect(v.rows.map((r) => r.dutyId)).toEqual(core.map((r) => r.dutyId));
    expect(v.rows.length).toBeGreaterThan(0);
    for (const r of v.rows) {
      if (r.command !== null) expect(x.seat.rights).toContain(r.command);
      expect(r.assignedBy).toBe('boss');
    }
    expect(v.bossName).toBe('Coach Reyes');
  });
  it('graded rows carry the mark and line; others carry none', () => {
    const x = assignmentsInput();
    const first = ladder.assignmentRows({ view: x.seat, week: 'game' })[0]!.dutyId;
    const v = buildAssignmentsView({ ...x, status: { [first]: 'graded' }, grades: { [first]: { mark: 'B', feedback: 'Cards late on Tuesday.' } } });
    expect(v.rows[0]!.grade).toEqual({ mark: 'B', feedback: 'Cards late on Tuesday.' });
    expect(v.rows.slice(1).every((r) => r.grade === null)).toBe(true);
  });
  it('a head coach sets his own list (no boss)', () => {
    const hc = seat('job:college.head_coach_top');
    const v = buildAssignmentsView(assignmentsInput({ seat: hc, jobTitle: 'Head coach' }));
    expect(v.bossName).toBeNull();
    expect(v.rows.every((r) => r.assignedBy === 'self')).toBe(true);
  });
});

describe('coach.career (O7.6.1, O4.6.1, E5)', () => {
  it('marks where he is and what he has held on the ladder', () => {
    const v = buildCareerView(careerInput());
    expect(v.jobTitle).toBe('Graduate assistant');
    expect(v.level).toBe('College');
    expect(v.ladder.college.find((r) => r.current)?.rung).toBe(2);
    expect(v.ladder.college.filter((r) => r.held).map((r) => r.rung)).toEqual([1, 2]);
    expect(v.ladder.pro.some((r) => r.current || r.held)).toBe(false);
    expect(v.ladder.pro.map((r) => r.rung)).toEqual([1, 2, 3, 4, 5, 6, 7, 9]);
    expect(v.history.map((h) => h.season)).toEqual([2026, 2028]);
    expect(v.network[0]).toEqual({ name: 'Ada Price', together: 'Rivertown 2026 to 2027', nowJob: 'Quality control coach (offense)', nowTeam: 'Lakeport', imported: false });
  });
  it('reputation is the core band word with reasons; an unknown coach gets no reasons and no number shows', () => {
    const v = buildCareerView(careerInput());
    const peers = v.reputation.find((r) => r.group === 'coaches')!;
    expect(peers.word).toBe(careerText(`band.${reputation.bandOf(80, 0.6)}`));
    expect(peers.reasons).toEqual(['Every assignment in on time in 2027']);
    const media = v.reputation.find((r) => r.group === 'media')!;
    expect(media.word).toBe('Not yet known');
    expect(media.reasons).toEqual([]);
    expect(v.reputation).toHaveLength(2);
    expect(v.reputation.every((r) => !/\d/.test(r.word))).toBe(true);
  });
  it('graduate assistant term in words; out of coaching shows no job and the self rights', () => {
    expect(buildCareerView(careerInput()).enrolment?.line).toBe('Graduate term: 9 credit hours done, 2 years left in the seat.');
    const out = buildCareerView(careerInput({ seat: null, jobId: null, team: null, enrolment: null }));
    expect(out.jobTitle).toBe('Out of coaching');
    expect(out.rights).toEqual(ladder.SCREEN_TABLE.selfCommands);
    expect(out.ladder.college.some((r) => r.current)).toBe(false);
  });
});

describe('coach.job_market (O7.6.1, E2, E4.4.1)', () => {
  it('shows live openings with the core fit line and what he applied for; filled searches drop off', () => {
    const v = buildJobMarketView(marketInput());
    expect(v.openings.map((o) => o.id)).toEqual([7, 8]);
    expect(v.openings[0]).toMatchObject({ fit: 'step_up', applied: true, payCents: 4_500_000 });
    expect(v.openings[1]!.fit).toBe('well_above');
    expect(v.applications[0]).toEqual({ openingId: 7, route: 'letter', date: '2028 day 31', response: null });
  });
  it('offer cards: lapsed offers drop, the deadline is a date, and no hidden value reaches the card', () => {
    const v = buildJobMarketView(marketInput());
    expect(v.offers.map((o) => o.offerId)).toEqual([3]);
    expect(v.offers[0]!.deadline).toBe('2028 day 47');
    expect(json(v)).not.toContain('programStrength');
    expect(json(v)).not.toContain('prestige');
    expect(json(v)).not.toMatch(/hot.?seat/i);
  });
  it('signs are facts, newest first, with a source; year-out choices only without a job', () => {
    const v = buildJobMarketView(marketInput());
    expect(v.signs).toEqual([{ sign: 'leaks', date: '2028 day 35', source: 'your inbox' }, { sign: 'owner_attends', date: '2028 day 20', source: 'the news' }]);
    expect(v.yearOut).toBeNull();
    const out = buildJobMarketView(marketInput({ current: null }));
    expect(out.yearOut?.map((o) => o.id)).toContain('visit_staffs');
    expect(out.yearOut?.find((o) => o.id === 'lower_job')).toEqual({ id: 'lower_job', weeklyHours: 70, onField: true });
  });
  it('window line names the next opening date when closed', () => {
    const v = buildJobMarketView(marketInput({ window: { open: false, until: null, next: { seasonYear: 2029, dayIndex: 5 } } }));
    expect(v.windowOpen).toBe(false);
    expect(v.windowLine).toBe('Hiring window closed; the next opens 2029 day 5');
  });
});

describe('coach.contract (O4.6.1, E3)', () => {
  it('lists the remaining salary years, guarantee, buyout and clauses of the signed contract', () => {
    const c = contractOf();
    const v = buildContractView(contractInput());
    expect(v.yearsLeft).toBe(c.endYear - 2031 + 1);
    const salaryRows = v.terms.filter((r) => r.label.startsWith('Base salary'));
    expect(salaryRows.map((r) => r.label)).toEqual(c.salary.filter((s) => s.leagueYear >= 2031).map((s) => `Base salary ${s.leagueYear}`));
    expect(v.terms.some((r) => r.label === 'Buyout')).toBe(true);
    expect(v.terms.some((r) => r.label === 'Roster authority')).toBe(true);
    expect(v.clauses.length).toBe(c.otherClauses.length + (c.releaseHeldByClub ? 1 : 0) + c.incentives.length);
  });
  it('no active contract reads as none', () => {
    expect(buildContractView(contractInput({ contract: null }))).toMatchObject({ team: null, terms: [], yearsLeft: null });
    expect(buildContractView(contractInput({ contract: { ...contractOf(), state: 'expired' } })).team).toBeNull();
  });
});

describe('coach.record (O4.6.1, E9.1.2)', () => {
  it('seasons in order, unfinished season reads "No result", families from the log in words', () => {
    const v = buildRecordView(recordInput());
    expect(v.seasons.map((s) => s.season)).toEqual([2026, 2027]);
    expect(v.seasons[1]!.finish).toBe('No result');
    expect(v.families.map((f) => f.family)).toEqual(['Decisions', 'Unit results', 'Teaching', 'Work products', 'Evaluations', 'Conduct']);
    const work = v.families.find((f) => f.family === 'Work products')!;
    expect(work.lines).toEqual(['film tags: 9 of 10 checked held up (1 logged)', 'scout cards: 1 logged']);
    expect(v.families.find((f) => f.family === 'Teaching')!.lines).toEqual([]);
  });
  it('a window with no events reads "no record" in every family', () => {
    const v = buildRecordView(recordInput({ window: { fromSeason: 2030, toSeason: 2031 } }));
    expect(v.families.every((f) => f.lines.length === 0)).toBe(true);
  });
});

describe('coach.finance (O4.6.2, E6)', () => {
  it('net worth at every date is assets minus debts from the sheet', () => {
    const v = buildFinanceView(financeInput());
    sheets().forEach((s, i) => {
      const sh = s.sheet;
      const sum = (h: Readonly<Record<string, number | undefined>>) => Object.values(h).reduce<number>((a, b) => a + (b ?? 0), 0);
      const assets = sh.cash + sum(sh.taxable) + sum(sh.retirement) + sh.homes.reduce((a, h) => a + h.valueCents, 0);
      const debts = sh.homes.reduce((a, h) => a + h.mortgageBalanceCents, 0) + sh.liabilities.reduce((a, l) => a + l.balanceCents, 0);
      expect(v.netWorth[i]).toEqual({ date: s.date, cents: assets - debts });
    });
  });
  it('income by source, taxes by place, spending by item; transfers are not spending', () => {
    const v = buildFinanceView(financeInput());
    expect(v.income).toEqual([{ source: 'stipend', cents: 300_000 }, { source: 'camp', cents: 30_000 }]);
    expect(v.taxes).toEqual([{ place: 'Federal', cents: 20_000 }, { place: 'State', cents: 5_000 }]);
    expect(v.spending).toEqual([{ item: 'rent', cents: 80_000 }, { item: 'living costs', cents: 40_000 }]);
    expect(v.plan).toEqual({ savingRatePct: 10, risk: 'medium' });
    expect(v.advisers).toEqual([{ name: 'Lee Morgan', feeLine: '1% of assets a year' }]);
    expect(v.holdings.find((h) => h.name === 'Index funds')).toEqual({ name: 'Index funds', risk: 'medium', valueCents: 300_000, returnPct: 10 });
  });
  it('the projection is a range around the middle, wider for a riskier plan', () => {
    const v = buildFinanceView(financeInput());
    const r = v.projection!.range;
    expect(r.lowCents).toBeLessThan(r.midCents);
    expect(r.midCents).toBeLessThan(r.highCents);
    const risky = buildFinanceView(financeInput({ settings: { riskLevel: 5, savingsRate: 0.1 } })).projection!.range;
    expect(risky.highCents - risky.lowCents).toBeGreaterThan(r.highCents - r.lowCents);
  });
  it('the range arithmetic: zero spread gives one value; savings add each year', () => {
    expect(projectRange(100, 10, 2, { mean: 0, sd: 0.2 }, 0)).toEqual({ lowCents: 120, midCents: 120, highCents: 120 });
    expect(projectRange(1000, 0, 1, { mean: 0.1, sd: 0 }, 1.28)).toEqual({ lowCents: 1100, midCents: 1100, highCents: 1100 });
    const cash = mixModel({ cash: 1 }, { cash: { mean: 0.03, sd: 0.01, correlation: 0, fee: 0 } } as never);
    expect(cash.mean).toBeCloseTo(0.03, 12);
    expect(cash.sd).toBeCloseTo(0.01, 12);
  });
  it('no sheet yet: no projection, empty lines', () => {
    const v = buildFinanceView(financeInput({ sheets: [], entries: [] }));
    expect(v.projection).toBeNull();
    expect(v.netWorth).toEqual([]);
  });
});

describe('coach.life (O4.6.3, E7, E8)', () => {
  it('hours by task are his own kept work; a delegated item is not his hour', () => {
    const v = buildLifeView(lifeInput());
    expect(v.week).toBe('Week 12');
    const film = v.hours.find((h) => h.task === 'film')!;
    const practice = v.hours.find((h) => h.task === 'practice')!;
    expect(film.hours).toBe(56);
    expect(practice.hours).toBe(14);
    expect(v.hours.find((h) => h.task === 'travel')?.hours).toBe(2);
    expect(v.hoursAvailable).toBeGreaterThan(0);
  });
  it('the hidden health state never shows; the open warning and checkup lines do', () => {
    const v = buildLifeView(lifeInput());
    expect(json(v)).not.toContain('atRisk');
    expect(v.health[0]).toMatch(/^Sleep 7 hours or more a night/);
    expect(v.health.slice(1)).toEqual(['Checkup, week 11: Blood pressure is up.', 'Checkup, week 2: All clear.']);
  });
  it('family events ask hours; no household, no family rows', () => {
    const v = buildLifeView(lifeInput());
    expect(v.family).toEqual([{ event: 'A parent needs care', date: 'week 14', owed: '6 hours a week for 3 weeks' }]);
    const alone = lifeInput();
    expect(buildLifeView({ ...alone, household: { ...alone.household, members: [] } }).family).toEqual([]);
  });
  it('sleep and energy are band words with a trend; a short week shows its effects', () => {
    const rested = buildLifeView(lifeInput());
    expect(['rested', 'tired', 'worn down', 'exhausted']).toContain(rested.sleep.word);
    expect(rested.energy.trend).toBe('worse');
    const short = buildLifeView(lifeInput({ result: weekResult(16, 4) }));
    expect(short.sleep.trend).toBe('worse');
    expect(short.effects.map((e) => e.id)).toContain('took_from_home');
  });
});
