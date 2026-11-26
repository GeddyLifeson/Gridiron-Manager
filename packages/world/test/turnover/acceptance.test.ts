// K7 acceptance runs over 10, 30 and 50 seasons (front-office README "Not built yet"; handoff item 5).
// Long: skipped unless GM_WORLD_ACCEPTANCE lists the season counts, e.g. GM_WORLD_ACCEPTANCE=10,30,50.
// Each run prints one JSON line per check; the run fails on any hard check.
import { describe, expect, it } from 'vitest';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';

const RUNS = (process.env.GM_WORLD_ACCEPTANCE ?? '').split(',').map(Number).filter((n) => n > 0);
const content = trimmed();
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);

function build(seedHex: string) {
  const binding: turnover.TurnoverBinding = { content, rule, policy: turnover.gmPolicy() };
  const w = loop.createWorld({ setup: setup({ seedHex }), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES });
  const pro = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
  const col = w.teams.length - pro;
  const sys = loop.systemsFrom({
    games: loop.gamesStep(testSchedule, testGamePort()), leaving: loop.leavingStep(),
    cohorts: loop.cohortStep({
      scale: () => ({ topCollegeTeams: col, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 }),
      names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
    }),
    development: turnover.developmentStep(binding), moves: turnover.rosterMovesStep(binding),
  }, 'acceptance: not bound');
  return { w, sys, binding };
}

const mean = (xs: readonly number[]): number => (xs.length === 0 ? NaN : xs.reduce((a, x) => a + x, 0) / xs.length);
function corr(rows: readonly (readonly [number, number])[]): number {
  const mx = mean(rows.map((r) => r[0])), my = mean(rows.map((r) => r[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of rows) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
}

describe.skipIf(RUNS.length === 0)('K7 acceptance runs', () => {
  for (const seasons of RUNS) {
    it(`${seasons} seasons: legal rosters, limits, undrafted players, class quality, turnover`, () => {
      const t0 = Date.now();
      const { w, sys, binding } = build('a1c3e5f7092b4d6f');
      const problems: string[] = [];
      const perSeason: Record<string, number | string>[] = [];
      let logFrom = 0;
      const undraftedIds = new Set<number>();
      let pastLimit = new Set<number>();
      for (let s = 0; s < seasons; s++) {
        loop.runSeason(w, sys, testSchedule);
        const year = w.date.seasonYear;
        const rows = w.log.rows().slice(logFrom);
        logFrom = w.log.rows().length;
        const counts: Record<string, number> = {};
        const classByTeam = new Map<number, number[]>();
        for (const e of rows) {
          counts[e.type] = (counts[e.type] ?? 0) + 1;
          if (e.type === turnover.PLAYER_SIGNED) {
            counts[`signed_${e.payload.kind}`] = (counts[`signed_${e.payload.kind}`] ?? 0) + 1;
            if (e.payload.kind === 'undrafted') undraftedIds.add(e.subjects[0]!.id);
            if (e.payload.kind === 'recruit') {
              const a = Object.values(w.people.get(e.subjects[0]!.id)!.playing!.attributes);
              classByTeam.set(e.payload.team as number, [...(classByTeam.get(e.payload.team as number) ?? []), mean(a)]);
            }
          }
        }
        // Legal rosters (C5, T5): at the limit, nobody twice, nobody inactive or out of football, no college player past his seasons.
        const seen = new Set<number>();
        const nextPast = new Set<number>();
        const seasonsAllowed = COLLEGE_LOOKUP(turnover.RULE_KEY.seasonsOfCompetition)!;
        const ages: Record<string, number[]> = { pro: [], college: [] };
        let proRostered = 0, proUndrafted = 0;
        for (const [teamId, ids] of w.rosters) {
          const level = turnover.levelOfTeam(w, teamId);
          const limit = turnover.specOf(binding, w, teamId).rosterLimit;
          if (ids.length > limit) problems.push(`season ${year}: team ${teamId} holds ${ids.length} over its limit ${limit}`);
          if (ids.length < limit) problems.push(`season ${year}: team ${teamId} holds ${ids.length} under its limit ${limit}`);
          for (const id of ids) {
            if (seen.has(id)) problems.push(`season ${year}: player ${id} on two rosters`);
            seen.add(id);
            if (w.status.get(id) !== 'active' || w.outOfFootballSince.has(id)) problems.push(`season ${year}: player ${id} rostered while not active`);
            const p = w.people.get(id)!;
            ages[level]!.push(year - p.birthDate.seasonYear);
            // The season point counts the season being entered; the week-0 moves step then takes out whoever is past the limit.
            // So a player one past the limit here must be gone from college rosters by the next check.
            if (level === 'college') {
              const used = p.playing!.eligibility.college.seasonsOfCompetitionUsed;
              // The founding season is exempt: TO-03 counts every season since the first college age for a founding
              // player (no redshirt on record), so a founding fifth-year senior shows one season too many until the first moves step.
              if (pastLimit.has(id) || (s > 0 && used > seasonsAllowed + 1)) problems.push(`season ${year}: college player ${id} still rostered past ${seasonsAllowed} seasons`);
              if (used > seasonsAllowed) nextPast.add(id);
            }
            if (level === 'pro') { proRostered++; if (undraftedIds.has(id)) proUndrafted++; }
          }
        }
        pastLimit = nextPast;
        const classQuality = corr([...classByTeam].map(([t, v]) => [w.teams.find((x) => x.id === t)!.prestige, mean(v)] as const));
        perSeason.push({
          year, drafted: counts[turnover.PLAYER_DRAFTED] ?? 0, undrafted: counts.signed_undrafted ?? 0, freeAgents: counts.signed_free_agent ?? 0,
          recruits: counts.signed_recruit ?? 0, walkOns: counts.signed_walk_on ?? 0, retired: counts[turnover.PLAYER_RETIRED] ?? 0,
          eligibilityEnded: counts[turnover.ELIGIBILITY_ENDED] ?? 0, leftUnsigned: counts[turnover.LEFT_UNSIGNED] ?? 0,
          undraftedShareOfProRosters: Number((proUndrafted / Math.max(1, proRostered)).toFixed(3)),
          meanAgePro: Number(mean(ages.pro!).toFixed(2)), meanAgeCollege: Number(mean(ages.college!).toFixed(2)),
          classQualityVsPrestige: Number.isNaN(classQuality) ? 'n/a' : Number(classQuality.toFixed(3)),
        });
      }
      const after = perSeason.slice(1);
      const kinds: Record<string, number> = {};
      for (const p of problems) { const k = p.replace(/(player|team) \d+/g, '$1 #'); kinds[k] = (kinds[k] ?? 0) + 1; }
      const summary = {
        seasons, ms: Date.now() - t0, problems: problems.length, problemKinds: kinds, firstProblems: problems.slice(0, 5),
        drafted: after.reduce((a, r) => a + (r.drafted as number), 0),
        undraftedShareOfProRostersLast: perSeason.at(-1)!.undraftedShareOfProRosters,
        classQualityVsPrestigeMean: Number(mean(after.map((r) => r.classQualityVsPrestige).filter((x): x is number => typeof x === 'number')).toFixed(3)),
        meanAgePro: [perSeason[0]!.meanAgePro, perSeason.at(-1)!.meanAgePro], meanAgeCollege: [perSeason[0]!.meanAgeCollege, perSeason.at(-1)!.meanAgeCollege],
        notMeasurable: ['cap legality, contract sizes (no contracts in the world, TO-04)', 'trade counts (no trades, TO-04)', 'violations detected (no front office people to act, TO-10)'],
      };
      console.log(JSON.stringify(summary));
      for (const r of perSeason) console.log(JSON.stringify(r));
      expect(problems).toEqual([]);
      for (const r of after) {
        expect(r.drafted).toBeGreaterThan(0);
        expect((r.retired as number) + (r.leftUnsigned as number)).toBeGreaterThan(0);
        expect(r.recruits).toBeGreaterThan(0);
      }
      expect(perSeason.at(-1)!.undraftedShareOfProRosters).toBeGreaterThan(0);
      expect(summary.classQualityVsPrestigeMean).toBeGreaterThan(0);
      expect(Math.abs((perSeason.at(-1)!.meanAgePro as number) - (perSeason[0]!.meanAgePro as number))).toBeLessThan(3);
    }, 3_600_000);
  }
});
