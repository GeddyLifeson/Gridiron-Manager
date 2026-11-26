// How front offices keep, cut and re-sign veterans with contracts in the world: the cap holds every year with
// accelerated guarantees (K7.4.1 rule 2, CBA Art. 13 s.6(d)(iv)), players cut at the cutdown are signed by
// other clubs the same offseason at the market price (C8.3.2, PC-12), each position is valued by what the
// real market pays for being better there (TO-18), and a veteran's grade pools his seasons of film (TO-21)
// on top of the D6.4.1 prior (TO-22).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cap as capRules } from '@gm/league';
import { scouting } from '@gm/people';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';
import * as money from '../../src/money/index.ts';
import * as contracts from '../../src/contracts/index.ts';

const RULES_YEAR = 2026;
const content = trimmed();
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);
const keysOf = (rel: string): string[] =>
  (JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')).values as { key: string }[]).map((v) => v.key);
const KEYS = { pro: keysOf('../../../rules-data/data/league/proleague_2026.json'), college: keysOf('../../../rules-data/data/league/collegeleague_2026.json') };
const binding: contracts.ContractsBinding = { rule, keys: (lvl) => (lvl === 'pro' ? KEYS.pro : KEYS.college), rulesYear: RULES_YEAR };
const tb: turnover.TurnoverBinding = { content, rule, policy: turnover.gmPolicy({ contracts: binding }) };
const capCents = PRO_LOOKUP(`cap.amount_${RULES_YEAR}`)! * money.CENTS_PER_DOLLAR;
const proRules = contracts.ruleSetFor(binding, 'pro');

describe('position values from the real pay scale (TO-18)', () => {
  const mix = content.levels.pro.rosterMix;
  const w = contracts.positionValueWeights(mix);
  it('averages 1 over the roster mix and puts the quarterback far above the snapper', () => {
    const total = Object.values(mix).reduce((a, x) => a + x, 0);
    const mean = Object.keys(mix).reduce((a, p) => a + mix[p]! * w[p]!, 0) / total;
    expect(mean).toBeCloseTo(1, 9);
    expect(w.QB!).toBeGreaterThan(2);
    expect(w.QB!).toBeGreaterThan(w.G!);
    if (w.LS !== undefined) expect(w.LS).toBeLessThan(0.2);
  });
});

describe('keeping and cutting veterans over offseasons', () => {
  const w = loop.createWorld({ setup: setup({}), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES });
  const pro = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
  const col = w.teams.length - pro;
  const sys = loop.systemsFrom({
    games: loop.gamesStep(testSchedule, testGamePort()), leaving: loop.leavingStep(),
    cohorts: loop.cohortStep({
      scale: () => ({ topCollegeTeams: col, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 }),
      names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
    }),
    development: turnover.developmentStep(tb), moves: contracts.contractsStep(binding, turnover.rosterMovesStep(tb)),
  }, 'test: not bound');
  loop.runWeek(w, sys);
  const first = w.date.seasonYear;
  const street: { id: number; team: number; year: number }[] = [];
  let seen = w.log.rows().length;
  for (let i = 0; i < 3; i++) {
    loop.runSeason(w, sys, testSchedule);
    const rows = w.log.rows().slice(seen);
    seen = w.log.rows().length;
    const year = Math.max(...contracts.contractsOf(w).paidYears);
    const released = new Set(rows.filter((e) => e.type === 'released').map((e) => e.subjects[0]!.id));
    for (const e of rows) {
      if (e.type === turnover.PLAYER_SIGNED && e.payload.kind === 'free_agent' && released.has(e.subjects[0]!.id)) street.push({ id: e.subjects[0]!.id, team: e.payload.team as number, year });
    }
  }
  const st = contracts.contractsOf(w);
  const last = Math.max(...st.paidYears);
  const proTeams = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').map((t) => t.id);

  it('keeps every club under the cap every year, released guarantees included (K7.4.1 acceptance)', () => {
    for (let y = first; y <= last; y++) for (const t of proTeams) expect(contracts.playerCashPaid(w, t, y)).toBeLessThanOrEqual(capCents);
  });

  it('signs players cut at the cutdown to other clubs the same offseason, under contract at the market price or more', () => {
    expect(street.length).toBeGreaterThan(0);
    const opened = new Map<number, contracts.PlayerContract>();
    for (const c of st.active) opened.set(c.personId, c);
    let checked = 0;
    for (const s of street.filter((x) => x.year === last)) {
      const c = opened.get(s.id);
      if (!c || !(w.rosters.get(s.team) ?? []).includes(s.id)) continue;
      expect(c.teamId).toBe(s.team);
      expect(c.signed.seasonYear).toBe(last);
      // The season he has just played was credited after his contract opened.
      const credited = Math.max(0, w.people.get(s.id)!.playing!.eligibility.pro.creditedSeasons - 1);
      expect(contracts.salaryIn(c, last)).toBeGreaterThanOrEqual(capRules.minimumSalary(proRules, RULES_YEAR, credited));
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('lets some expiring players walk to free agency instead of re-signing every one (TO-30)', () => {
    const walked = w.log.rows().filter((e) => e.type === 'released' && e.payload.reason === 'contract_expired');
    expect(walked.length).toBeGreaterThan(0);
    for (const e of walked.slice(0, 20)) expect(w.status.get(e.subjects[0]!.id)).toBeDefined();
  });

  it('front-loads new multi-year veteran deals rather than paying above the market (PC-15)', () => {
    const fresh = st.active.filter((c) => c.signed.seasonYear === last && c.terms.form === 'veteran' && c.terms.years.length >= 2);
    expect(fresh.length).toBeGreaterThan(0);
    for (const c of fresh) {
      const [y0, ...later] = c.terms.years.map((y) => y.baseSalary.amountCents);
      for (const x of later) expect(y0!).toBeGreaterThanOrEqual(x);
    }
    const scale = st.lastMarket?.signings ?? [];
    for (const m of scale) expect(m.apyCents).toBeLessThanOrEqual(capCents);
  });

  it('grades a veteran more surely than a first-year player (pooled film, TO-21) and pulls a look toward the prior (TO-22)', () => {
    const g = turnover.gradeContext(w, turnover.rosteredSet(w));
    const team = proTeams[0]!;
    const roster = w.rosters.get(team) ?? [];
    const credited = (id: number) => w.people.get(id)!.playing!.eligibility.pro.creditedSeasons;
    const rookie = [...roster].sort((a, b) => credited(a) - credited(b) || a - b)[0]!;
    const vet = roster.find((id) => credited(id) >= 3 && credited(id) > credited(rookie) + 1)!;
    expect(vet).toBeDefined();
    expect(credited(rookie)).toBeLessThanOrEqual(1);
    expect(g.belief(team, vet).variance).toBeLessThan(g.belief(team, rookie).variance);
    // With the prior the belief is surer than either alone: below the D6.4.1 prior variance for some film (8 squared).
    const sd = scouting.priorSd('production');
    expect(g.belief(team, rookie).variance).toBeLessThan(sd * sd);
  });
});
