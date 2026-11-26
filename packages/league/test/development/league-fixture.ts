// A small headless pro league for the Q1.6.4 long-run check: 32 rosters of 53, a yearly rookie
// class from the fixture generator (stand-in for G-17 until it merges), development and aging by this
// module, retirement by D8.4.1, and "not wanted" exits from a simple roster rule (K7 stand-in): each
// position keeps its best players by role grade. Counts and supply are fixture choices.
import type { PlayingBlock } from '@gm/schema';
import {
  developYear, defaultYearPlan, retirementChance, wholePlayerValue, WORKED, HIDDEN, adultTestKey, hiddenNum, type DevNumbers, type PositionFamily,
} from '../../src/development/index.ts';
import { MATH, N, makePlayer, meanOf, rng } from './helpers.ts';

const TEAMS = 32;
export const SLOTS: Record<PositionFamily, number> = { QB: 3, RB: 4, WR: 6, TE: 3, OL: 9, DL: 6, EDGE: 4, LB: 5, CB: 6, S: 4, K: 1, P: 1, LS: 1 };
export const STARTERS: Record<PositionFamily, number> = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 2, EDGE: 2, LB: 2, CB: 2, S: 2, K: 1, P: 1, LS: 1 };
const FAMILIES = Object.keys(SLOTS) as PositionFamily[];

export interface Pro {
  readonly id: number;
  readonly family: PositionFamily;
  age: number;
  rookieSeason: number;
  playing: PlayingBlock;
  starter: boolean;
  facets: Record<string, number>;
  drafted: boolean;
}

/** Role grade: the whole-player value the world's looks read (development value.ts). */
export function roleGrade(p: Pro): number {
  return wholePlayerValue(N, p.playing, p.family);
}

/** World-contract position groups (PositionGroup): the Q1.6.4 series are kept per group. */
export const GROUP_OF: Record<PositionFamily, string> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OL: 'OL', DL: 'DL', EDGE: 'DL', LB: 'LB', CB: 'DB', S: 'DB', K: 'specialists', P: 'specialists', LS: 'specialists' };
export const GROUPS = [...new Set(Object.values(GROUP_OF))];

export interface SeasonStats {
  readonly season: number;
  readonly starterMean: Record<string, number>;
  readonly starterSd: Record<string, number>;
  readonly rosterAge: Record<string, number>;
  readonly exits: { family: PositionFamily; age: number; exited: boolean }[];
  readonly careers: { drafted: boolean; seasons: number }[];
}

export function runLeague(n: DevNumbers, seed: number, seasons: number): SeasonStats[] {
  let nextId = 1;
  const draw = (family: PositionFamily, age: number, season: number, drafted: boolean, tag: string): Pro => {
    const id = nextId++;
    const s = rng(seed, tag, id);
    const playing = makePlayer(s, {
      family, ageYears: age,
      ceilingMean: drafted ? 50 + s.normal() * 6 : 42 + s.normal() * 6,
      gapMean: Math.max(2, 11 + s.normal() * 4),
    });
    const facets = { work_habits: Math.round(50 + s.normal() * 15), coachability: Math.round(50 + s.normal() * 15), competitiveness: Math.round(50 + s.normal() * 15), love_of_football: Math.round(50 + s.normal() * 15) };
    return { id, family, age, rookieSeason: season, playing, starter: false, facets, drafted };
  };
  // Initial league: ages spread 22 to 33, already developed to near their ceilings by age.
  let roster: Pro[] = [];
  for (const f of FAMILIES) for (let i = 0; i < SLOTS[f] * TEAMS; i++) {
    const age = 22 + (i % 12);
    const p = draw(f, age, -(age - 22), true, 'init');
    const ceil = p.playing.ceilings;
    const att = { ...p.playing.attributes };
    for (const k of WORKED[f]) att[k] = Math.max(att[k]!, (ceil[k] ?? 0) - Math.max(0, 8 - (age - 22) * 2));
    p.playing = { ...p.playing, attributes: att };
    roster.push(p);
  }
  let freeAgents: Pro[] = [];
  const out: SeasonStats[] = [];
  for (let season = 0; season < seasons; season++) {
    const exits: SeasonStats['exits'] = [];
    const careers: SeasonStats['careers'] = [];
    // 1. Offseason: retirement choices (D8.4.1 path 2).
    const stay: Pro[] = [];
    for (const p of roster) {
      const pr = retirementChance(n, { family: p.family, ageYears: p.age, majorInjuryLastYear: false, lostStartingJob: false, contenderWantsHim: p.starter, facets: p.facets });
      if (rng(seed, 'retire', season, p.id).chance(pr)) { exits.push({ family: p.family, age: p.age, exited: true }); careers.push({ drafted: p.drafted, seasons: season - p.rookieSeason }); }
      else stay.push(p);
    }
    // 2. Age and develop everyone still under contract or looking (one year, D7 and D8).
    const pool = [...stay, ...freeAgents];
    for (const p of pool) {
      p.age += 1;
      p.playing = developYear(n, MATH, { position: p.family, ageYears: p.age, playing: p.playing, facets: p.facets }, defaultYearPlan(n, p.starter ? 'starter' : 'backup'), (k) => rng(seed, 'dev', season, p.id, k));
    }
    // 3. Rookie class: drafted about 7 per team, plus undrafted free agents (fixture supply).
    for (const f of FAMILIES) {
      const drafted = Math.round((SLOTS[f] * TEAMS) / 7.5);
      for (let i = 0; i < drafted; i++) pool.push(draw(f, 21 + (i % 3), season, true, `rk${season}`));
      for (let i = 0; i < drafted; i++) pool.push(draw(f, 22 + (i % 2), season, false, `udfa${season}`));
    }
    // 4. Roster rule (K7 stand-in): best grades keep the slots; the rest are not wanted.
    const kept: Pro[] = [];
    const nextFa: Pro[] = [];
    for (const f of FAMILIES) {
      const ranked = pool.filter((p) => p.family === f).sort((a, b) => roleGrade(b) - roleGrade(a) || a.id - b.id);
      const keep = ranked.slice(0, SLOTS[f] * TEAMS);
      keep.forEach((p, i) => { p.starter = i < STARTERS[f] * TEAMS; });
      kept.push(...keep);
      for (const p of ranked.slice(SLOTS[f] * TEAMS)) {
        const wasPro = roster.includes(p);
        if (wasPro) { exits.push({ family: p.family, age: p.age - 1, exited: true }); careers.push({ drafted: p.drafted, seasons: season - p.rookieSeason }); }
        // Released veterans and unsigned rookies wait one year at most.
        if (!wasPro && p.rookieSeason === season) nextFa.push(p);
      }
    }
    for (const p of kept) if (roster.includes(p)) exits.push({ family: p.family, age: p.age - 1, exited: false });
    roster = kept;
    freeAgents = nextFa;
    const starterMean: Record<string, number> = {};
    const starterSd: Record<string, number> = {};
    const rosterAge: Record<string, number> = {};
    for (const g of GROUPS) {
      const st = roster.filter((p) => GROUP_OF[p.family] === g && p.starter).map(roleGrade);
      starterMean[g] = meanOf(st);
      starterSd[g] = Math.sqrt(st.reduce((s, x) => s + (x - starterMean[g]!) ** 2, 0) / Math.max(1, st.length - 1));
      rosterAge[g] = meanOf(roster.filter((p) => GROUP_OF[p.family] === g).map((p) => p.age));
    }
    out.push({ season, starterMean, starterSd, rosterAge, exits, careers });
  }
  return out;
}

export { FAMILIES, HIDDEN };
