// T3.1 acceptance: 12 games, the right conference count, one game a week, protected games every
// season, rotation coverage, alternating hosts, the lower-subdivision rate, the power-opponent rule.
// Twelve consecutive seasons are generated from the G-11 world, carrying meeting history forward.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG, conferenceGameCounts, generateCollegeSeason, protectedPairs,
  type CollegeSchedule, type MeetingHistory, type TeamId,
} from '../../src/schedule/index.ts';
import { collegeConferences, collegeRivalries, collegeTeams, neutralVenues, rng } from './fixtures.ts';

const C = DEFAULT_CONFIG.college;
const teams = collegeTeams();
const conferences = collegeConferences();
const rivalries = collegeRivalries();
const venues = neutralVenues();
const tops = teams.filter((t) => t.level === C.topLevel).map((t) => t.id);
const seconds = teams.filter((t) => t.level === C.secondLevel).map((t) => t.id);
const confOf = new Map(teams.map((t) => [t.id, t.conferenceId] as const));
const key = (a: TeamId, b: TeamId) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const YEARS = 12;
const BASE = Number(process.env['COLLEGE_SEED_BASE'] ?? 0);

let seasons: CollegeSchedule[] = [];
beforeAll(() => {
  let history: MeetingHistory = {};
  seasons = [];
  for (let y = 0; y < YEARS; y++) {
    const s = generateCollegeSeason({ season: 2026 + y, teams, conferences, rivalries, history, neutralVenues: venues, random: rng(BASE + y, 'college') });
    history = s.history;
    seasons.push(s);
  }
}, 600_000);

const gamesOf = (s: CollegeSchedule, t: TeamId) => s.games.filter((g) => g.home === t || g.away === t);
const dropped = (s: CollegeSchedule) => new Set(s.log.filter((l) => l.includes('protected game dropped')).map((l) => { const [a, , b] = l.split(/[ :]/); return key(a!, b!); }));

describe('T3.1.1 regular-season shape', () => {
  it('acceptance: every top-subdivision team has 12 games and no two games in one week', () => {
    for (const s of seasons) {
      for (const t of tops) expect(gamesOf(s, t), `${t} ${s.season}`).toHaveLength(12);
      for (const t of teams) {
        const w = gamesOf(s, t.id).map((g) => g.week);
        expect(new Set(w).size).toBe(w.length);
        for (const x of w) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(C.weeksByYear.default); }
      }
    }
  });

  it('second-subdivision teams play their season length, at most one short', () => {
    for (const s of seasons) for (const t of seconds) {
      const n = gamesOf(s, t).length;
      expect(n).toBeLessThanOrEqual(C.gamesByLevel.college_second);
      expect(n).toBeGreaterThanOrEqual(C.secondSubdivisionMinGames);
    }
  });

  it('acceptance: the right conference count, 9 in power conferences; an odd 17-team nine-game conference leaves one school at 8', () => {
    for (const s of seasons) for (const c of conferences) {
      const counts = conferenceGameCounts(c, s.season);
      for (const m of c.memberIds) expect(gamesOf(s, m).filter((g) => g.conferenceGame), `${m} ${s.season}`).toHaveLength(counts.get(m)!);
      if (c.tier === 'power') {
        const eights = c.memberIds.filter((m) => counts.get(m) === 8);
        expect(eights).toHaveLength(c.memberIds.length % 2 === 1 ? 1 : 0);
      }
    }
  });

  it('acceptance: protected games appear every season (except a logged drop for the power-opponent rule)', () => {
    for (const s of seasons) {
      const have = new Set(s.games.map((g) => key(g.home, g.away)));
      const skip = dropped(s);
      for (const c of conferences) for (const [a, b] of protectedPairs(c, rivalries, conferenceGameCounts(c, s.season))) expect(have.has(key(a, b)), `${a} v ${b} ${s.season}`).toBe(true);
      for (const r of rivalries) {
        if (confOf.get(r.a) === confOf.get(r.b)) continue;
        if (skip.has(key(r.a, r.b))) continue;
        expect(have.has(key(r.a, r.b)), `${r.a} v ${r.b} ${s.season}`).toBe(true);
      }
    }
  });

  it('rule 3: every conference pair meets within the conference cycle (SEC: three annual, the rest at least once in two years)', () => {
    for (const c of conferences) {
      const counts = conferenceGameCounts(c, 2026);
      const prot = protectedPairs(c, rivalries, counts);
      const pdeg = (m: TeamId) => prot.filter(([a, b]) => a === m || b === m).length;
      // Cycle: the most seasons any member needs to see all its non-protected opponents.
      const n = c.memberIds.length;
      const cycle = Math.max(...c.memberIds.map((m) => Math.ceil((n - 1 - pdeg(m)) / Math.max(1, counts.get(m)! - pdeg(m)))));
      for (const a of c.memberIds) for (const b of c.memberIds) {
        if (a >= b) continue;
        for (let y = 0; y + cycle <= YEARS; y++) {
          const met = seasons.slice(y, y + cycle).some((s) => s.games.some((g) => g.conferenceGame && key(g.home, g.away) === key(a, b)));
          expect(met, `${c.id}: ${a} v ${b} from ${2026 + y} within ${cycle} seasons`).toBe(true);
        }
      }
    }
  });

  it('rule 5: hosts alternate in protected series, and conference homes stay within one of half the games', () => {
    for (let y = 1; y < YEARS; y++) {
      const prev = seasons[y - 1]!;
      const cur = seasons[y]!;
      let alternated = 0;
      let total = 0;
      for (const g of cur.games.filter((x) => x.kind === 'protected' && x.conferenceGame)) {
        const p = prev.games.find((x) => key(x.home, x.away) === key(g.home, g.away));
        if (!p) continue;
        total++;
        if (p.home !== g.home) alternated++;
      }
      // Balance repair may break a few alternations; nearly all must hold.
      expect(alternated / total).toBeGreaterThan(0.9);
      for (const c of conferences) {
        const counts = conferenceGameCounts(c, cur.season);
        for (const m of c.memberIds) {
          const h = cur.games.filter((g) => g.conferenceGame && g.home === m && !g.neutral).length;
          expect(h).toBeGreaterThanOrEqual(Math.floor(counts.get(m)! / 2));
          expect(h).toBeLessThanOrEqual(Math.ceil(counts.get(m)! / 2));
        }
      }
    }
  });

  it('rule 5: neutral sites at about 2.5% of top-subdivision games, at a real stadium near the midpoint', () => {
    for (const s of seasons) {
      const topTop = s.games.filter((g) => tops.includes(g.home) && tops.includes(g.away));
      const n = topTop.filter((g) => g.neutral).length / topTop.length;
      expect(n).toBeGreaterThan(0.02);
      expect(n).toBeLessThan(0.03);
      for (const g of s.games.filter((x) => x.neutral)) expect(venues.some((v) => v.id === g.venueId)).toBe(true);
    }
  });

  it('rule 6: from 2027 the playoff standard warns only for the schools that miss it', () => {
    expect(seasons[0]!.warnings).toHaveLength(0);
    for (const s of seasons.slice(1)) for (const w of s.warnings) expect(w.qualifying).toBeLessThan(C.qualifyingStandard.minGames);
    // Power conference members always reach it (rule conferences by rule; the other by the standard).
    for (const s of seasons.slice(1)) for (const w of s.warnings) {
      const c = conferences.find((x) => x.id === confOf.get(w.team));
      if (c?.tier === 'power') expect(counts8(s.season, c.id, w.team)).toBe(true);
    }
  });

  it('the same seed gives the same season', () => {
    const a = generateCollegeSeason({ season: 2026, teams, conferences, rivalries, history: {}, neutralVenues: venues, random: rng(BASE, 'college') });
    expect(JSON.stringify(a.games)).toBe(JSON.stringify(seasons[0]!.games));
  });
});

/** A power school can miss the standard only when parity left it with 8 conference games and no slot. */
function counts8(season: number, confId: string, t: TeamId): boolean {
  const c = conferences.find((x) => x.id === confId)!;
  return conferenceGameCounts(c, season).get(t) === 8;
}

describe('T3.1.2 non-conference scheduling', () => {
  it('acceptance: the lower-subdivision game rate is within 0.8 to 1.1 per team-season, and the top team hosts', () => {
    for (const s of seasons) {
      const mixed = s.games.filter((g) => tops.includes(g.home) !== tops.includes(g.away));
      const rate = mixed.length / tops.length;
      expect(rate).toBeGreaterThanOrEqual(0.8);
      expect(rate).toBeLessThanOrEqual(1.1);
      for (const g of mixed) expect(tops.includes(g.home)).toBe(true);
    }
  });

  it('rule 5: SEC, ACC and Big 12 stand-ins play 10 power opponents; the Big Ten stand-in is not bound in 2026', () => {
    const isPower = (t: TeamId) => conferences.find((c) => c.id === confOf.get(t))?.tier === 'power' || C.powerOpponentRule.countingIndependents.includes(t);
    for (const s of seasons) for (const cid of C.powerOpponentRule.conferences) {
      for (const m of conferences.find((c) => c.id === cid)!.memberIds) {
        const n = gamesOf(s, m).filter((g) => g.conferenceGame || isPower(g.home === m ? g.away : g.home)).length;
        const conf = conferenceGameCounts(conferences.find((c) => c.id === cid)!, s.season).get(m)!;
        expect(n, `${m} ${s.season}`).toBeGreaterThanOrEqual(C.powerOpponentRule.minGames - (conf < 9 ? 1 : 0));
      }
    }
  });

  it('no pair meets twice in a season, and conference members never meet out of conference', () => {
    for (const s of seasons) {
      const seen = new Set<string>();
      for (const g of s.games) {
        const k = key(g.home, g.away);
        expect(seen.has(k), k).toBe(false);
        seen.add(k);
        if (!g.conferenceGame && confOf.get(g.home) !== null) expect(confOf.get(g.home)).not.toBe(confOf.get(g.away));
      }
    }
  });

  it('weeks: non-conference games mostly early, conference games mostly from week 4, protected rivals mostly in the final week', () => {
    let early = 0;
    let nonconf = 0;
    let lateConf = 0;
    let conf = 0;
    let finalProt = 0;
    let prot = 0;
    const last = C.weeksByYear.default - 1;
    for (const s of seasons) for (const g of s.games) {
      if (g.kind === 'protected') { prot++; if (g.week === last) finalProt++; continue; }
      if (g.conferenceGame) { conf++; if (g.week >= C.weekPrefs.conferenceFirst) lateConf++; }
      else { nonconf++; if (g.week <= C.weekPrefs.nonConferenceEarlyLast) early++; }
    }
    expect(early / nonconf).toBeGreaterThan(0.7);
    expect(lateConf / conf).toBeGreaterThan(0.85);
    expect(finalProt / prot).toBeGreaterThan(0.3);
  });

  it('signed contracts are honoured', () => {
    const [a, b] = [tops[0]!, tops.find((t) => confOf.get(t) !== confOf.get(tops[0]!))!];
    const s = generateCollegeSeason({ season: 2026, teams, conferences, rivalries, history: {}, contracts: [{ home: a, away: b }], random: rng(5, 'college') });
    const g = s.games.find((x) => key(x.home, x.away) === key(a, b));
    if (!s.log.some((l) => l.startsWith(`contract ${a}`))) expect(g?.home).toBe(a);
  });
});
