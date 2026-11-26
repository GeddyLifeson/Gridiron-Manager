// C2 acceptance criteria, each test named for its leaf. The checks here are written independently of
// the solver's own cost function, so a solver bug cannot hide behind its own scoring.
// SCHEDULE_SEEDS=1000 npm test runs the full C2.2.1 acceptance 1 (1,000 schedules); the default is 25.
import { beforeAll, describe, expect, it } from 'vitest';
import { ParamFile, RuleKeyManifest } from '@gm/schema';
import {
  DEFAULT_CONFIG, PARAMS, RULE_KEYS, assignSlots, generateProSeason, isPrimeTime, proPairings, rotationYear, solveWeeks,
  type ProSchedule, type ScheduledGame, type TeamId,
} from '../../src/schedule/index.ts';
import { priorRanks, priorWins, proClubs, proLeague, rng } from './fixtures.ts';

const cfg = DEFAULT_CONFIG;
const league = proLeague();
const clubs = proClubs();
const ids = clubs.map((c) => c.id);
const SEEDS = Number(process.env['SCHEDULE_SEEDS'] ?? 25);
const W = cfg.pro.weeks.count;
const confOf = new Map<TeamId, number>();
const divOf = new Map<TeamId, string>();
league.conferences.forEach((c, ci) => c.divisions.forEach((d) => d.clubIds.forEach((id) => { confOf.set(id, ci); divOf.set(id, d.id); })));
const zoneOf = new Map(clubs.map((c) => [c.id, c.zone] as const));

function season(seed: number): ProSchedule {
  return generateProSeason({ season: 2026 + (seed % 12), league, clubs, priorRank: priorRanks(league, seed), priorWins: priorWins(league, seed), random: rng(seed), week1SundayDayIndex: 100 });
}
const mine = (s: ProSchedule, t: TeamId) => s.games.filter((g) => g.home === t || g.away === t).sort((a, b) => a.week - b.week);
const rest = (a: ScheduledGame, b: ScheduledGame) => (b.week - a.week) * 7 + b.dayOffset - a.dayOffset;

let seasons: ProSchedule[] = [];
beforeAll(() => { seasons = Array.from({ length: SEEDS }, (_, i) => season(i)); }, 600_000);

describe('C2.1.1 the 17 opponents', () => {
  const runs = Array.from({ length: 12 }, (_, y) => ({ year: 2026 + y, pairings: proPairings(league, 2026 + y, priorRanks(league, y)) }));

  it('acceptance 1 and 2: 17 pairings per club, 6 division, 272 in all, for every rotation year', () => {
    for (const { pairings } of runs) {
      expect(pairings).toHaveLength(272);
      for (const id of ids) {
        expect(pairings.filter((p) => p.home === id || p.away === id)).toHaveLength(17);
        expect(pairings.filter((p) => p.kind === 'division' && (p.home === id || p.away === id))).toHaveLength(6);
      }
    }
  });

  it('the 6/4/4/2/1 split per club', () => {
    for (const { pairings } of runs) for (const id of ids) {
      const k = (kind: string) => pairings.filter((p) => p.kind === kind && (p.home === id || p.away === id)).length;
      expect([k('division'), k('intra_rotation'), k('inter_rotation'), k('intra_place'), k('extra')]).toEqual([6, 4, 4, 2, 1]);
    }
  });

  it('acceptance 3: over 12 seasons, each club plays every other-division conference club 4+ times and every other-conference club 3+ times', () => {
    const count = new Map<string, number>();
    for (const { pairings } of runs) for (const p of pairings) {
      const k = [p.home, p.away].sort().join('|');
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    for (const a of ids) for (const b of ids) {
      if (a >= b || divOf.get(a) === divOf.get(b)) continue;
      const n = count.get(`${a}|${b}`) ?? 0;
      expect(n, `${a} v ${b}`).toBeGreaterThanOrEqual(confOf.get(a) === confOf.get(b) ? 4 : 3);
    }
  });

  it('acceptance 4: one conference has 9 home games, the other 8, alternating; the second conference hosts in even years', () => {
    for (const { year, pairings } of runs) {
      const host = year % 2 === 0 ? 1 : 0;
      expect(rotationYear(year).extraHostConference).toBe(host);
      for (const id of ids) expect(pairings.filter((p) => p.home === id)).toHaveLength(confOf.get(id) === host ? 9 : 8);
    }
  });

  it('rotation cycles: same-conference division every 3 years, other-conference division every 4', () => {
    const divPairs = (pairings: ReturnType<typeof proPairings>, kind: string) =>
      new Set(pairings.filter((p) => p.kind === kind).map((p) => [divOf.get(p.home), divOf.get(p.away)].sort().join('|')));
    for (let y = 0; y + 4 < runs.length; y++) {
      expect(divPairs(runs[y]!.pairings, 'intra_rotation')).toEqual(divPairs(runs[y + 3]!.pairings, 'intra_rotation'));
      expect(divPairs(runs[y]!.pairings, 'inter_rotation')).toEqual(divPairs(runs[y + 4]!.pairings, 'inter_rotation'));
      expect(divPairs(runs[y]!.pairings, 'inter_rotation')).not.toEqual(divPairs(runs[y + 1]!.pairings, 'inter_rotation'));
    }
  });

  it('rule 4 and 5: standings games pair the same prior rank; the 17th-game division is not the rotation division', () => {
    const { pairings } = runs[0]!;
    const rank = priorRanks(league, 0);
    for (const p of pairings.filter((x) => x.kind === 'intra_place' || x.kind === 'extra')) expect(rank[p.home]).toBe(rank[p.away]);
    for (const id of ids) {
      const inter = new Set(pairings.filter((p) => p.kind === 'inter_rotation' && (p.home === id || p.away === id)).map((p) => divOf.get(p.home === id ? p.away : p.home)));
      const extra = pairings.find((p) => p.kind === 'extra' && (p.home === id || p.away === id))!;
      expect(inter.has(divOf.get(extra.home === id ? extra.away : extra.home))).toBe(false);
      const place = pairings.filter((p) => p.kind === 'intra_place' && (p.home === id || p.away === id));
      expect(place.filter((p) => p.home === id)).toHaveLength(1);
    }
  });

  it('rule 6: across two meetings of the same two divisions, each club hosts and visits every rotation opponent', () => {
    const host = (pairings: ReturnType<typeof proPairings>, a: TeamId, b: TeamId) => pairings.find((p) => (p.home === a && p.away === b) || (p.home === b && p.away === a))?.home;
    for (const [y1, y2, kind] of [[0, 3, 'intra_rotation'], [0, 4, 'inter_rotation']] as const) {
      for (const p of runs[y1]!.pairings.filter((x) => x.kind === kind)) expect(host(runs[y2]!.pairings, p.home, p.away)).toBe(p.away);
    }
  });

  it('year one has no prior season: ranks come from data, and bad ranks are refused', () => {
    const bad = { ...priorRanks(league, 0) };
    bad[ids[0]!] = bad[ids[1]!]!;
    expect(() => proPairings(league, 2026, bad)).toThrow();
  });
});

describe('C2.2.1 weeks and byes', () => {
  it(`acceptance 1: ${SEEDS} generated schedules all satisfy every hard constraint`, () => {
    const noBye = new Set(cfg.pro.weeks.noByeWeeksByYear.default);
    for (const s of seasons) {
      // Each club plays at most once a week and has exactly one bye, inside weeks 5 to 14.
      const byWeek = new Map<number, number>();
      for (const id of ids) {
        const weeks = mine(s, id).map((g) => g.week);
        expect(new Set(weeks).size).toBe(17);
        const bye = [...Array(W).keys()].map((i) => i + 1).filter((w) => !weeks.includes(w));
        expect(bye).toHaveLength(1);
        expect(bye[0]).toBeGreaterThanOrEqual(5);
        expect(bye[0]).toBeLessThanOrEqual(14);
        expect(noBye.has(bye[0]!)).toBe(false);
        byWeek.set(bye[0]!, (byWeek.get(bye[0]!) ?? 0) + 1);
        // No more than 3 straight road or home games.
        let run = 0;
        let last = '';
        for (const g of mine(s, id)) {
          const site = g.home === id && !g.neutral ? 'h' : 'a'; // a game abroad is a road trip for both clubs
          run = site === last ? run + 1 : 1;
          last = site;
          expect(run, `${id} ${s.season}`).toBeLessThanOrEqual(3);
        }
      }
      // 0, 2, 4 or 6 clubs on bye per week; at most one empty week besides Thanksgiving week.
      for (const n of byWeek.values()) { expect(n % 2).toBe(0); expect(n).toBeLessThanOrEqual(6); }
      const empty = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14].filter((w) => !noBye.has(w) && !byWeek.has(w));
      expect(empty.length).toBeLessThanOrEqual(1);
      // Final week: division games only.
      for (const g of s.games.filter((x) => x.week === W)) expect(g.kind).toBe('division');
      // Stadium conflicts: no two home games at one venue in a week.
      for (let w = 1; w <= W; w++) {
        const venues = s.games.filter((g) => g.week === w && !g.neutral).map((g) => g.venueId);
        expect(new Set(venues).size).toBe(venues.length);
      }
      // Opponents off a bye: hard ceiling 4.
      const byeOf = new Map(s.byes.map((b) => [b.team, b.week] as const));
      for (const id of ids) {
        const n = mine(s, id).filter((g) => { const o = g.home === id ? g.away : g.home; return byeOf.get(o) === g.week - 1 && byeOf.get(id) !== g.week - 1; }).length;
        expect(n).toBeLessThanOrEqual(4);
      }
      expect(s.log.join(' ')).toContain('consecutive cap 3');
    }
  });

  it('three-game road trips happen to 2 to 4 clubs a season (three in 2026, 15 over four seasons before)', () => {
    for (const s of seasons) {
      let clubsWith = 0;
      for (const id of ids) {
        let run = 0;
        let hit = false;
        for (const g of mine(s, id)) { run = g.away === id || g.neutral ? run + 1 : 0; if (run === 3) hit = true; }
        if (hit) clubsWith++;
      }
      expect(clubsWith).toBeGreaterThanOrEqual(2);
      expect(clubsWith).toBeLessThanOrEqual(4);
    }
  });

  it('acceptance 2: generation takes under 5 s', () => {
    const t0 = process.hrtime.bigint();
    season(9999);
    expect(Number(process.hrtime.bigint() - t0) / 1e9).toBeLessThan(5);
  });

  it('acceptance 3: the same seed gives the same schedule', () => {
    expect(JSON.stringify(season(7))).toBe(JSON.stringify(seasons[7] ?? season(7)));
  });
});

describe('C2.3.1 kickoff slots', () => {
  it('rest, Thursday, national and west-coast rules hold in every season', () => {
    for (const s of seasons) {
      const nat = new Map<TeamId, number>();
      for (const id of ids) {
        const g = mine(s, id);
        let shortThu = 0;
        for (let i = 1; i < g.length; i++) {
          const r = rest(g[i - 1]!, g[i]!);
          expect(r, `${id} week ${g[i]!.week}`).toBeGreaterThanOrEqual(3);
          if (g[i]!.day === 'thu' && g[i - 1]!.week === g[i]!.week - 1) expect(g[i - 1]!.day).not.toBe('mon');
          if ((g[i]!.day === 'thu' || g[i]!.day === 'wed') && r <= 4) shortThu++;
        }
        expect(shortThu).toBeLessThanOrEqual(2);
        for (const x of g) if (x.national) nat.set(id, (nat.get(id) ?? 0) + 1);
      }
      for (const n of nat.values()) expect(n).toBeLessThanOrEqual(7);
      for (const g of s.games) {
        if (g.slot === 'sunday_early' && !g.neutral) expect(zoneOf.get(g.home)).not.toBe('America/Los_Angeles');
        if (g.week === W) { expect(g.slot).toBe('tbd'); expect(g.kickoffEtMinutes).toBeNull(); }
        expect(g.dayIndex).toBe(100 + (g.week - 1) * 7 + g.dayOffset);
      }
    }
  });

  it('weekly shape: one Thursday, Sunday night and Monday night game in ordinary weeks; 2026 holidays and week-1 openers', () => {
    const s = seasons.find((x) => x.season === 2026)!;
    for (let w = 2; w <= 17; w++) {
      const wk = s.games.filter((g) => g.week === w);
      expect(wk.filter((g) => g.slot === 'sunday_night')).toHaveLength(1);
      expect(wk.filter((g) => g.slot === 'monday_night')).toHaveLength(1);
      if (w !== 12) expect(wk.filter((g) => g.slot === 'thursday_night')).toHaveLength(1);
    }
    const w12 = s.games.filter((g) => g.week === 12);
    expect(w12.filter((g) => g.day === 'wed')).toHaveLength(1);
    expect(w12.filter((g) => g.day === 'thu')).toHaveLength(3);
    expect(w12.filter((g) => g.day === 'fri')).toHaveLength(1);
    expect(s.games.filter((g) => g.week === 16 && g.day === 'fri')).toHaveLength(2);
    const w1 = s.games.filter((g) => g.week === 1);
    expect(w1.filter((g) => g.day === 'wed' && g.slot === 'opener_night')).toHaveLength(1);
    const fri = w1.filter((g) => g.day === 'fri');
    expect(fri).toHaveLength(1);
    expect(fri[0]!.international).toBe(true);
    expect(fri[0]!.region).toBe('australia');
  });

  it('acceptance: over 100 seasons, 2 to 8 clubs a season have no prime-time game', () => {
    const zeros: number[] = [];
    const base = seasons.slice(0, 10);
    for (const s of base) for (let k = 0; k < 10; k++) {
      const weekOf = s.pairings.map((p) => s.games.find((g) => g.home === p.home && g.away === p.away && g.kind === p.kind)!.week);
      const r = assignSlots({ season: s.season, pairings: s.pairings, weekOf, clubs, intl: [], priorWins: priorWins(league, k) }, rng(k, 'slots', [s.season]));
      const pt = new Set<TeamId>();
      for (const g of r.games) if (isPrimeTime(g)) { pt.add(g.home); pt.add(g.away); }
      zeros.push(ids.length - pt.size);
    }
    expect(zeros).toHaveLength(100);
    for (const z of zeros) { expect(z).toBeGreaterThanOrEqual(2); expect(z).toBeLessThanOrEqual(8); }
  });
});

describe('C2.4.1 international games', () => {
  it('nine games, hosts from the nine-home conference, no club loses two home dates, never in consecutive weeks', () => {
    for (const s of seasons) {
      const intl = s.games.filter((g) => g.international);
      expect(intl).toHaveLength(9);
      const host = rotationYear(s.season).extraHostConference;
      const hosts = intl.map((g) => g.home);
      expect(new Set(hosts).size).toBe(hosts.length);
      for (const h of hosts) expect(confOf.get(h)).toBe(host);
      for (const id of ids) {
        const trueHome = mine(s, id).filter((g) => g.home === id && !g.neutral).length;
        expect(trueHome).toBe(hosts.includes(id) || confOf.get(id) !== host ? 8 : 9);
        const w = intl.filter((g) => g.home === id || g.away === id).map((g) => g.week).sort((a, b) => a - b);
        for (let i = 1; i < w.length; i++) expect(w[i]! - w[i - 1]!).toBeGreaterThan(1);
      }
    }
  });

  it('the bye after a game abroad is each club\'s choice: some clubs take it, some play the next week', () => {
    let took = 0;
    let played = 0;
    for (const s of seasons) {
      const byeOf = new Map(s.byes.map((b) => [b.team, b.week] as const));
      for (const g of s.games.filter((x) => x.international && x.week > 1)) for (const t of [g.home, g.away]) {
        if (byeOf.get(t) === g.week + 1) took++; else played++;
      }
    }
    expect(took).toBeGreaterThan(0);
    expect(played).toBeGreaterThan(0);
  });
});

describe('C2.5.1 preseason', () => {
  it('3 games a club, none against a week 1 or week 2 opponent; host conference clubs host 1, the others 2', () => {
    for (const s of seasons.slice(0, 12)) {
      const host = rotationYear(s.season).extraHostConference;
      for (const id of ids) {
        const pre = s.preseason.filter((g) => g.home === id || g.away === id);
        expect(pre).toHaveLength(3);
        expect(new Set(pre.map((g) => g.week)).size).toBe(3);
        expect(pre.filter((g) => g.home === id)).toHaveLength(confOf.get(id) === host ? 1 : 2);
        const early = new Set(mine(s, id).filter((g) => g.week <= 2).map((g) => (g.home === id ? g.away : g.home)));
        for (const g of pre) expect(early.has(g.home === id ? g.away : g.home)).toBe(false);
      }
      for (const [a, b] of s.jointPracticeCandidates) expect(s.preseason.some((g) => (g.home === a && g.away === b))).toBe(true);
    }
  });
});

describe('module manifest', () => {
  it('RULE_KEYS and PARAMS validate against the contract', () => {
    expect(RuleKeyManifest.safeParse(RULE_KEYS).success).toBe(true);
    expect(ParamFile.safeParse(PARAMS).success).toBe(true);
  });

  it('solveWeeks also works with no international games', () => {
    const pairings = proPairings(league, 2027, priorRanks(league, 3));
    const sol = solveWeeks({ season: 2027, teams: ids, pairings, venueOf: {}, intl: [] }, rng(3));
    expect(sol.weekOf).toHaveLength(272);
  });
});
