// Measures how the world's front offices keep and cut veterans against the real league (facts/release-rates.json,
// built by facts/release-build/build.py from OverTheCap's contract histories). Slow (about a minute for six
// offseasons), so it runs only when asked:
//
//   RELEASE_RATES=1 RELEASE_SEASONS=6 npx vitest run packages/world/test/contracts/tools/release-rates.test.ts
//
// It prints, for veteran deals of two or more years signed in one league year, the share whose player was gone
// from the club one season later (released, or released and signed elsewhere), by pay tier at the position;
// how many of the top tier released were signed again within the run; and any club over the cap.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../../fixtures.ts';
import * as turnover from '../../../src/turnover/index.ts';
import * as money from '../../../src/money/index.ts';
import * as contracts from '../../../src/contracts/index.ts';

const RULES_YEAR = 2026;
const SEASONS = Number(process.env.RELEASE_SEASONS ?? 6);
const TIER_STARTS = [0, 0.5, 0.8, 0.9];

it.runIf(process.env.RELEASE_RATES === '1')('release rates of veteran deals against the real league', () => {
  const content = trimmed();
  const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);
  const keysOf = (rel: string): string[] =>
    (JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')).values as { key: string }[]).map((v) => v.key);
  const KEYS = { pro: keysOf('../../../../rules-data/data/league/proleague_2026.json'), college: keysOf('../../../../rules-data/data/league/collegeleague_2026.json') };
  const binding: contracts.ContractsBinding = { rule, keys: (lvl) => (lvl === 'pro' ? KEYS.pro : KEYS.college), rulesYear: RULES_YEAR };
  const tb: turnover.TurnoverBinding = { content, rule, policy: turnover.gmPolicy({ contracts: binding }) };
  const capCents = PRO_LOOKUP(`cap.amount_${RULES_YEAR}`)! * money.CENTS_PER_DOLLAR;
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
  const proTeams = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').map((t) => t.id);
  const out: string[] = [];
  let seen = w.log.rows().length;
  const cohort = new Map<number, { tier: number; year: number }>();
  const n = TIER_STARTS.map(() => 0), gone = TIER_STARTS.map(() => 0);
  const goneTop = new Set<number>(), signedAgain = new Set<number>();
  let over = 0;
  const tierOf = (p: number) => TIER_STARTS.reduce((t, s, i) => (p >= s ? i : t), 0);
  const addCohort = () => {
    const st = contracts.contractsOf(w);
    const y = Math.max(...st.paidYears);
    const fresh = st.active.filter((c) => c.signed.seasonYear === y && c.terms.form === 'veteran' && c.terms.years.length >= 2);
    const byPos = new Map<string, typeof fresh>();
    for (const c of fresh) { const pos = w.people.get(c.personId)!.playing!.position; byPos.set(pos, [...(byPos.get(pos) ?? []), c]); }
    for (const list of byPos.values()) {
      const sorted = [...list].sort((a, b) => a.terms.years[0]!.baseSalary.amountCents - b.terms.years[0]!.baseSalary.amountCents);
      sorted.forEach((c, i) => cohort.set(c.personId, { tier: tierOf(sorted.length === 1 ? 0.5 : i / (sorted.length - 1)), year: y }));
    }
  };
  addCohort();
  for (let s = 0; s < SEASONS; s++) {
    loop.runSeason(w, sys, testSchedule);
    const rows = w.log.rows().slice(seen);
    seen = w.log.rows().length;
    const st = contracts.contractsOf(w);
    const year = Math.max(...st.paidYears);
    const released = new Set(rows.filter((e) => e.type === 'released').map((e) => e.subjects[0]!.id));
    const stayed = new Set(st.active.filter((c) => c.signed.seasonYear < year).map((c) => c.personId));
    const signed = rows.filter((e) => e.type === turnover.PLAYER_SIGNED && e.payload.kind === 'free_agent').map((e) => e.subjects[0]!.id);
    for (const [id, k] of [...cohort]) {
      if (k.year !== year - 1) continue;
      n[k.tier]!++;
      if (!stayed.has(id) && w.status.get(id) === 'active') { gone[k.tier]!++; if (k.tier === TIER_STARTS.length - 1) goneTop.add(id); }
      cohort.delete(id);
    }
    for (const id of signed) if (goneTop.has(id)) signedAgain.add(id);
    out.push(`${year}: released ${released.size}, free agents signed ${signed.length}, of them just released (street) ${signed.filter((id) => released.has(id)).length}`);
    for (const t of proTeams) if (contracts.playerCashPaid(w, t, year) > capCents) over++;
    addCohort();
  }
  const pct = (a: number, b: number) => (b ? (100 * a / b).toFixed(1) : '-');
  out.push(`gone one season in, by pay tier ${TIER_STARTS.join(' / ')}: ${n.map((x, i) => `${pct(gone[i]!, x)}% of ${x}`).join(' / ')}; all ${pct(gone.reduce((a, b) => a + b, 0), n.reduce((a, b) => a + b, 0))}%`);
  out.push(`top tier gone and signed again within the run: ${signedAgain.size} of ${goneTop.size}`);
  out.push(`club-years over the cap: ${over}`);
  console.log(out.join('\n'));
  expect(over).toBe(0);
}, 1_800_000);
