// G-76 acceptance: front office AI (bible K7). Each describe names the leaf whose acceptance criteria it checks.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ParamFile } from '@gm/schema';
import type { market } from '@gm/league';
import {
  FIELD_READERS, PARAMS, P, actingOrder, answer, askWeight, blendCollege, blendNeeds, bonusShare, buildBoard, campFine, capPlan, claimDecision,
  coachVoiceWeight, cutdown, draftDecider, effectiveHorizon, fillGap, generateCollegeBuilder, generateGm, gmNeeds, goingRateCentsPerWin, hideFromWaivers,
  injuryMove, lineupValue, mandatoryGaps, marketRound, medianGm, needBonusShare, negotiate, objects, onTheClock, ownPickPoints, playerWorth,
  practiceSquad, proposals, rememberDeal, rememberPassedOn, rosterDelta, rosterWorth, roundOffers, route, runsToday, seasonDrift, streamScope,
  targets, trustMove, undraftedBoard, walkAwayCents,
  type ContractOption, type FreeAgent, type GmProfile, type NeedsInput, type PickAsset, type PlayerView, type Power, type Prospect, type SideView,
} from '../../src/gm/index.ts';
import { CENTS_PER_WIN, GROUPS, POSITIONS, corr, ctx, draw, mean, player, rng } from './fixtures.ts';

const SRC = join(import.meta.dirname, '../../src/gm');
const srcFiles = () => readdirSync(SRC).filter((f) => f.endsWith('.ts'));
const code = (f: string) => readFileSync(join(SRC, f), 'utf8');

const gmWith = (id: number, over: Partial<GmProfile['philosophy']> = {}, behavior: Partial<GmProfile['behavior']> = {}): GmProfile => {
  const g = medianGm(id, POSITIONS, GROUPS, 'gm_final');
  return { ...g, philosophy: { ...g.philosophy, ...over }, behavior: { ...g.behavior, ...behavior } };
};
const NEUTRAL = gmWith(1);
const pick = (round: number, club: number, chartPoints: number, slotShare: number, season = 2030): PickAsset => ({ ref: { season, round, originalClubId: club }, chartPoints, slotShare });
const side = (gm: GmProfile, roster: PlayerView[], over: Partial<SideView> = {}): SideView => ({
  gm, clubId: 1, otherGmId: 99, window: 'neutral', currentSeason: 2030, roster, receives: [], gives: [], picksIn: [], picksOut: [], coachCore: [], pointsPerWin: 100, ...over,
});
function squad(r = rng(5)): PlayerView[] {
  const out: PlayerView[] = [];
  for (const pos of POSITIONS) for (let i = 0; i < 5; i++) out.push(player(pos, 45 + r.int(35), { age: 22 + r.int(11), costCentsByYear: [10_000_000 + r.int(40_000_000)] }));
  return out;
}

describe('parameters and purity', () => {
  it('the parameter file is valid and every row is read, every read has a row', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    const all = srcFiles().map(code).join('\n');
    const read = new Set([...all.matchAll(/P\('([^']+)'\)/g)].map((m) => m[1]!));
    for (const name of read) expect(() => P(name), name).not.toThrow();
    for (const p of PARAMS.params) {
      const short = p.name.replace('frontOffice.gm.', '');
      expect(read.has(short) || short.startsWith('voice.start.'), short).toBe(true);
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
    }
  });
  it('no file can reach a true value (K7.2.2 rule 6, D6.1.2)', () => {
    for (const f of srcFiles()) {
      const c = code(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(c, f).not.toMatch(/observe|drawLeniency|drawPlayerOffset|reportedForty|PersonRecord|trueValue|@gm\/people/);
    }
  });
});

describe('K7.1.1 general manager record, K7.1.2 college record', () => {
  it('every field has a reader that really reads it', () => {
    const g = generateGm(rng(1), 7, POSITIONS, GROUPS, 'gm_final');
    const fields = [...Object.keys(g.philosophy), ...Object.keys(g.behavior), 'coachVoiceWeight', ...Object.keys(g.memory)];
    for (const f of fields) { expect(FIELD_READERS[f], f).toBeDefined(); expect(code(FIELD_READERS[f]!), f).toContain(f); }
  });
  it('generation is seeded, bounded and stores no label or points', () => {
    const a = generateGm(rng(3), 7, POSITIONS, GROUPS, 'split'), b = generateGm(rng(3), 7, POSITIONS, GROUPS, 'split');
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toMatch(/label|points|xp|perk|trait"/i);
    const many = Array.from({ length: 300 }, (_, i) => generateGm(rng(i + 10), i, POSITIONS, GROUPS, 'gm_final'));
    for (const g of many) { expect(Math.abs(g.philosophy.draftVsVeteran)).toBeLessThanOrEqual(1); expect(g.philosophy.timeHorizon).toBeGreaterThanOrEqual(0); expect(g.philosophy.timeHorizon).toBeLessThanOrEqual(1); }
    expect(new Set(many.map((g) => g.philosophy.draftVsVeteran.toFixed(3))).size).toBeGreaterThan(250);
    const m = medianGm(1, POSITIONS, GROUPS, 'gm_final');
    expect(m.behavior).toEqual({ evaluation: 0, negotiation: 0, marketRead: 0 });
    expect(m.philosophy.draftVsVeteran).toBe(0);
  });
  it('the coach voice starts from the arrangement and moves with trust; pressure shortens the horizon; a season moves a value a little', () => {
    expect(coachVoiceWeight('coach_final', 0)).toBe(1);
    expect(coachVoiceWeight('gm_final', 1)).toBeGreaterThan(coachVoiceWeight('gm_final', 0));
    expect(coachVoiceWeight('gm_final', -1)).toBeLessThan(coachVoiceWeight('gm_final', 0));
    expect(effectiveHorizon(0.8, 1)).toBeLessThan(effectiveHorizon(0.8, 0));
    const g = gmWith(1, { riskOnTraits: 0.5 });
    const moved = seasonDrift(g, 'riskOnTraits', 1).philosophy.riskOnTraits;
    expect(moved).toBeGreaterThan(0.5); expect(moved - 0.5).toBeLessThanOrEqual(P('profile.seasonNudge') + 1e-12);
  });
  it('opposite draftVsVeteran values give different roster ages after 10 seasons from the same roster', () => {
    const run = (dv: number) => {
      const gm = gmWith(1, { draftVsVeteran: dv });
      let roster = squad(rng(11));
      const r = rng(12);
      const worth = (v: PlayerView) => playerWorth(gm, v, ctx()).surplus;
      for (let season = 0; season < 10; season++) {
        // Each season, at league-chart parity by his own grades: picks offered for his three oldest tradeable
        // players, and two veterans offered for picks. The same offers reach both general managers.
        const core = new Set([...roster].sort((a, b) => worth(b) - worth(a)).slice(0, 5).map((v) => v.personId));
        const lossOf = (v: PlayerView) => -rosterDelta(gm, roster, [], [v.personId], ctx()) * 100;
        for (const old of [...roster].filter((v) => !core.has(v.personId) && lossOf(v) > 0).sort((a, b) => b.age - a.age || a.personId - b.personId).slice(0, 3)) {
          const loss = lossOf(old);
          if (loss > 0 && answer(side(gm, roster, { gives: [old.personId], picksIn: [pick(2, 9, loss, 0.5)] }), ctx()).accepts) {
            roster = [...roster.filter((v) => v.personId !== old.personId), player(old.position, 55 + r.int(10), { age: 22, costCentsByYear: [8_000_000] })];
          }
        }
        for (let k = 0; k < 2; k++) {
          const vet = player(POSITIONS[(season + k) % POSITIONS.length]!, 72, { age: 30, costCentsByYear: [20_000_000] });
          const gain = rosterDelta(gm, roster, [vet], [], ctx()) * 100;
          const out = [...roster].filter((v) => v.position === vet.position).sort((a, b) => worth(a) - worth(b))[0]!;
          if (gain > 0 && answer(side(gm, roster, { receives: [vet], picksOut: [pick(2, 1, gain, 0.5)] }), ctx()).accepts) roster = [...roster.filter((v) => v.personId !== out.personId), vet];
        }
        // A year passes; a player past 34 retires and a 25-year-old takes his place.
        roster = roster.map((v) => (v.age >= 34 ? player(v.position, 60, { age: 25, costCentsByYear: [10_000_000] }) : { ...v, age: v.age + 1 }));
      }
      return mean(roster.map((v) => v.age));
    };
    expect(run(-1)).toBeGreaterThan(run(1) + 0.5);
  });
  it('college: the head coach and program general manager blend at 0.7, and the transfer mean sets the population', () => {
    const many = Array.from({ length: 400 }, (_, i) => generateCollegeBuilder(rng(i + 1), i, POSITIONS, 0.18));
    expect(mean(many.map((b) => 1 - b.highSchoolVsTransfer))).toBeGreaterThan(0.15);
    expect(mean(many.map((b) => 1 - b.highSchoolVsTransfer))).toBeLessThan(0.23);
    const head = { ...many[0]!, highSchoolVsTransfer: 1 }, pgm = { ...many[1]!, highSchoolVsTransfer: 0 };
    expect(blendCollege(head, pgm).highSchoolVsTransfer).toBeCloseTo(0.7, 12);
    expect(blendCollege(head, null)).toBe(head);
  });
});

describe('K7.2.2 player value', () => {
  it('two systems value the same player differently in the direction of fit', () => {
    const p = player('WR', 70);
    expect(playerWorth(NEUTRAL, { ...p, fit: 1.1 }, ctx()).value).toBeGreaterThan(playerWorth(NEUTRAL, { ...p, fit: 0.9 }, ctx()).value);
  });
  it('his opinion is his own and the same on every ask; a better evaluator errs less', () => {
    const p = player('CB', 65);
    const a = gmWith(21), b = gmWith(22);
    const c = ctx({ draw });
    expect(playerWorth(a, p, c).value).toBe(playerWorth(a, p, c).value);
    expect(playerWorth(a, p, c).value).not.toBe(playerWorth(b, p, c).value);
    const spread = (evaluation: number) => { const xs = Array.from({ length: 200 }, (_, i) => playerWorth(gmWith(100 + i, {}, { evaluation }), p, c).value); const m = mean(xs); return mean(xs.map((x) => (x - m) * (x - m))); };
    expect(spread(2)).toBeLessThan(spread(-2));
  });
  it('thin evidence: a risk-averse general manager values the lower part of the band; age and pressure cut the future', () => {
    const wide = player('QB', 60, { grade: { mean: 60, variance: 100 }, age: 22, projected: { mean: 75, variance: 100 } });
    expect(playerWorth(gmWith(1, { riskOnTraits: -1 }), wide, ctx()).value).toBeLessThan(playerWorth(gmWith(1, { riskOnTraits: 1 }), wide, ctx()).value);
    const old = player('RB', 70, { age: 31 });
    expect(playerWorth(gmWith(1, { ageCurveBelief: { skill: 1.5, line: 1 } }), old, ctx()).value).toBeLessThan(playerWorth(gmWith(1, { ageCurveBelief: { skill: 0.6, line: 1 } }), old, ctx()).value);
    const young = player('QB', 50, { age: 21, projected: { mean: 80, variance: 36 } });
    const long = gmWith(1, { timeHorizon: 1 });
    expect(playerWorth(long, young, ctx({ pressure: 1 })).value).toBeLessThan(playerWorth(long, young, ctx()).value);
  });
  it('cost is in wins at the going rate; depth players do not add up to a starter', () => {
    const p = player('WR', 70, { costCentsByYear: [CENTS_PER_WIN] });
    const w = playerWorth(NEUTRAL, p, ctx());
    expect(w.cost).toBeCloseTo(1, 12); expect(w.surplus).toBeCloseTo(w.value - 1, 12);
    expect(goingRateCentsPerWin([{ apyCents: 600, wins: 2 }, { apyCents: 300, wins: 1 }], 1)).toBe(300);
    expect(goingRateCentsPerWin([], 77)).toBe(77);
    expect(lineupValue([5, 1, 3], [1, 0.5])).toBe(6.5);
    const roster = [player('QB', 60), player('QB', 50)];
    const star = rosterDelta(NEUTRAL, roster, [player('QB', 85)], [], ctx());
    const depth = rosterDelta(NEUTRAL, roster, [player('QB', 58), player('QB', 58), player('QB', 58)], [], ctx());
    expect(depth).toBeLessThan(star / 4);
    expect(walkAwayCents(NEUTRAL, player('QB', 80), ctx(), 3)).toBeGreaterThan(walkAwayCents(NEUTRAL, player('QB', 60), ctx(), 3));
  });
});

describe('K7.2.1 needs and the coach voice', () => {
  const roster = [player('QB', 80), player('WR', 45), player('WR', 44), player('OT', 60), player('OT', 58), player('CB', 70), player('CB', 68), player('RB', 62)];
  const input: NeedsInput = { roster, baselineIss: { QB: 65, WR: 65, OT: 65, CB: 65, RB: 60 }, expiring: new Set(), unavailable: new Set() };
  const asks = [{ position: 'RB', rank: 1 }, { position: 'QB', rank: 2 }, { position: 'CB', rank: 3 }];
  it('with w at 0 the list ignores the coach; with w at 1 it follows his ranking for the positions he listed', () => {
    const own = gmNeeds(NEUTRAL, input, ctx());
    const zero = blendNeeds(NEUTRAL, input, asks, ctx(), 0);
    for (const n of zero) expect(n.need).toBeCloseTo(own.find((o) => o.position === n.position)!.need, 12);
    expect(zero[0]!.position).toBe('WR');
    const one = blendNeeds(NEUTRAL, input, asks, ctx(), 1).filter((n) => n.coachNeed !== null).map((n) => n.position);
    expect(one).toEqual(['RB', 'QB', 'CB']);
  });
  it('asks beyond five count at half weight; injuries and expiring contracts raise need; trust follows logged outcomes', () => {
    expect(askWeight(6)).toBeCloseTo((1 - 5 * P('needs.rankStep')) / 2, 12);
    expect(askWeight(5)).toBeCloseTo(1 - 4 * P('needs.rankStep'), 12);
    const qb = roster[0]!.personId;
    const hurt = gmNeeds(NEUTRAL, { ...input, unavailable: new Set([qb]) }, ctx()).find((n) => n.position === 'QB')!;
    expect(hurt.need).toBeGreaterThan(0.5); expect(hurt.frame).toBe('now');
    const walk = gmNeeds(NEUTRAL, { ...input, expiring: new Set([qb]) }, ctx()).find((n) => n.position === 'QB')!;
    expect(walk.frame).toBe('this_offseason');
    const log = { ask: asks[0]!, actedOn: true, season: 2030 };
    expect(trustMove(log, 1)).toBeGreaterThan(0); expect(trustMove(log, -1)).toBeLessThan(0); expect(trustMove({ ...log, actedOn: false }, 1)).toBe(0);
  });
});

describe('K7.4.4 trades', () => {
  it('no accepted trade lowers either side\'s own worth, and worth rises by exactly the stated net (no circular gain)', () => {
    const r = rng(77);
    const c = ctx({ draw });
    let accepted = 0;
    for (let i = 0; i < 400; i++) {
      const gm = generateGm(rng(1000 + i), 500 + i, POSITIONS, GROUPS, 'gm_final');
      const roster = squad(rng(2000 + i));
      const gives = [roster[r.int(roster.length)]!.personId];
      const receives = Array.from({ length: 1 + r.int(3) }, () => player(POSITIONS[r.int(5)]!, 45 + r.int(40), { age: 22 + r.int(10), costCentsByYear: [r.int(60_000_000)] }));
      const picksIn = r.uniform() < 0.5 ? [pick(1 + r.int(7), 9, 20 + r.int(300), r.uniform())] : [];
      const picksOut = r.uniform() < 0.5 ? [pick(1 + r.int(7), 1, 20 + r.int(300), r.uniform())] : [];
      const s = side(gm, roster, { gives, receives, picksIn, picksOut });
      const a = answer(s, c);
      const worth = (ro: PlayerView[], picks: PickAsset[]) => rosterWorth(gm, ro, c) * 100 + picks.reduce((t, p) => t + ownPickPoints(gm, p, 'neutral', 2030), 0);
      const delta = worth([...roster.filter((v) => !gives.includes(v.personId)), ...receives], picksIn) - worth(roster, picksOut);
      expect(a.valuation.net).toBeCloseTo(delta, 6);
      if (a.accepts) { accepted++; expect(delta).toBeGreaterThan(0); expect(delta).toBeGreaterThan(a.hold); }
      expect(answer(s, c)).toEqual(a);
    }
    expect(accepted).toBeGreaterThan(20); expect(accepted).toBeLessThan(380);
  });
  it('quantity for quality is refused, untouchables are refused, a burned general manager asks for more', () => {
    const star = player('QB', 88, { costCentsByYear: [30_000_000] });
    const roster = [star, player('QB', 55), ...squad(rng(4)).filter((v) => v.position !== 'QB')];
    const scrubs = [player('QB', 60), player('QB', 60), player('QB', 60), player('QB', 60)];
    expect(answer(side(NEUTRAL, roster, { gives: [star.personId], receives: scrubs }), ctx()).accepts).toBe(false);
    const rich = answer(side(NEUTRAL, roster, { gives: [star.personId], picksIn: [pick(1, 9, 100000, 0)] }), ctx());
    expect(rich.accepts).toBe(false); expect(rich.reason).toBe('untouchable');
    const depth = roster[1]!;
    const base = answer(side(NEUTRAL, roster, { gives: [depth.personId], picksIn: [pick(5, 9, 30, 0.6)] }), ctx());
    const burned = answer(side(rememberDeal(NEUTRAL, 99, -5), roster, { gives: [depth.personId], picksIn: [pick(5, 9, 30, 0.6)] }), ctx());
    expect(burned.hold).toBeGreaterThan(base.hold);
  });
  it('his own chart bends with his curve and his lean to picks; a contender discounts future picks', () => {
    const early = pick(1, 9, 1000, 0), late = pick(7, 9, 10, 1);
    const volume = gmWith(1, { pickValueCurve: 1 }), top = gmWith(1, { pickValueCurve: -1 });
    expect(ownPickPoints(volume, late, 'neutral', 2030) / ownPickPoints(volume, early, 'neutral', 2030)).toBeGreaterThan(ownPickPoints(top, late, 'neutral', 2030) / ownPickPoints(top, early, 'neutral', 2030));
    expect(ownPickPoints(gmWith(1, { draftVsVeteran: 1 }), early, 'neutral', 2030)).toBeGreaterThan(ownPickPoints(gmWith(1, { draftVsVeteran: -1 }), early, 'neutral', 2030));
    expect(ownPickPoints(NEUTRAL, pick(1, 9, 1000, 0, 2031), 'contending', 2030)).toBeLessThan(ownPickPoints(NEUTRAL, pick(1, 9, 1000, 0, 2031), 'neutral', 2030));
  });
  it('proposes only deals he gains from, where the other roster needs the player more, at most two a week', () => {
    const surplusQb = player('QB', 72, { costCentsByYear: [5_000_000] });
    const mine = [player('QB', 85), surplusQb, ...squad(rng(8)).filter((v) => v.position !== 'QB')];
    const me = { gm: NEUTRAL, clubId: 1, window: 'neutral' as market.CompetitiveWindow, currentSeason: 2030, roster: mine, coachCore: [], pointsPerWin: 100 };
    const partners = [2, 3, 4].map((clubId) => ({ clubId, gmId: clubId, roster: [player('QB', 50), player('WR', 60)], picks: [pick(2, clubId, 250, 0.2), pick(4, clubId, 60, 0.5), pick(6, clubId, 15, 0.8)] }));
    const out = proposals(me, partners, ctx());
    expect(out.length).toBe(P('trade.weeklyProposals'));
    for (const p of out) { expect(p.myNet).toBeGreaterThan(0); expect(p.theirNetAsIGuess).toBeGreaterThan(0); expect(p.proposal.aSends.players).not.toContain(mine[0]!.personId); }
    expect(proposals(me, partners, ctx(), 2)).toEqual([]);
    expect(proposals(me, [...partners].reverse(), ctx())).toEqual(out);
  });
});

describe('K7.4.3 the draft', () => {
  const prospect = (position: string, grade: number, over: Partial<Prospect> = {}): Prospect => ({ ...player(position, grade, { age: 21, projected: { mean: grade + 10, variance: 49 } }), coachRank: null, consensusRank: 1, ...over });
  it('the need bonus runs from 5 to 20 percent and moves a needed position up late', () => {
    expect(needBonusShare(1, 7)).toBeCloseTo(0.05, 12); expect(needBonusShare(7, 7)).toBeCloseTo(0.2, 12);
    const a = prospect('WR', 72), b = prospect('CB', 69);
    const needs = [{ position: 'CB', need: 1, gmNeed: 1, coachNeed: null, frame: 'now' as const }];
    expect(buildBoard(NEUTRAL, [a, b], needs, ctx(), 1, 7, 4)[0]!.personId).toBe(a.personId);
    expect(buildBoard(NEUTRAL, [a, b], needs, ctx(), 7, 7, 4)[0]!.personId).toBe(b.personId);
  });
  it('the coach ranking is blended for players his staff scouted', () => {
    const a = prospect('WR', 75), b = prospect('WR', 70, { coachRank: 1 }), c = prospect('WR', 65);
    expect(buildBoard(NEUTRAL, [a, b, c], [], ctx(), 1, 7, 4, 0).map((r) => r.personId)).toEqual([a.personId, b.personId, c.personId]);
    expect(buildBoard(NEUTRAL, [a, b, c], [], ctx(), 1, 7, 4, 1)[0]!.personId).toBe(b.personId);
  });
  it('on the clock: top available, or down when the top three are within 3 percent and an offer gains', () => {
    const row = (personId: number, score: number) => ({ personId, score, value: score, rank: 0 });
    const tight = [row(1, 100), row(2, 99), row(3, 98), row(4, 80)], clear = [row(1, 100), row(2, 90), row(3, 85)];
    const base = { consensusRank: new Map<number, number>(), onClock: true, picksUntilMine: 0 };
    expect(onTheClock({ ...base, board: tight, offers: [{ id: 'x', net: 5 }, { id: 'y', net: 9 }] })).toEqual({ kind: 'trade_down', offerId: 'y', fallback: 1 });
    expect(onTheClock({ ...base, board: tight, offers: [{ id: 'x', net: -1 }] }).kind).toBe('pick');
    expect(onTheClock({ ...base, board: clear, offers: [{ id: 'x', net: 5 }] })).toEqual({ kind: 'pick', personId: 1, passedOn: [2, 3] });
    const up = onTheClock({ board: [row(1, 100), row(2, 70)], offers: [], consensusRank: new Map([[1, 3]]), onClock: false, picksUntilMine: 8 });
    expect(up).toEqual({ kind: 'seek_trade_up', personId: 1, worthUpTo: 30, fallback: 1 });
    expect(onTheClock({ board: [row(1, 100), row(2, 70)], offers: [], consensusRank: new Map([[1, 30]]), onClock: false, picksUntilMine: 8 }).kind).toBe('pick');
    expect(rememberPassedOn(NEUTRAL, 2).memory.playersPassedOn).toEqual([2]);
  });
  it('the decider files only available players', () => {
    const d = draftDecider(() => [{ personId: 5, score: 1, value: 1, rank: 1 }, { personId: 6, score: 1, value: 1, rank: 2 }], 30);
    const view = { state: { available: [6, 9] }, selection: { round: 1 }, clubId: 1, late: false } as never;
    expect(d.choose(view)).toEqual({ personId: 6, thinkSec: 30 });
  });
  it('over 30 drafts, pick number and later value are related but far from perfectly', () => {
    const picks: number[] = [], truth: number[] = [];
    for (let d = 0; d < 30; d++) {
      const r = rng(900 + d);
      const pool = Array.from({ length: 96 }, () => { const t = 45 + 35 * r.uniform(); return { t, p: prospect(POSITIONS[r.int(5)]!, t + 9 * r.normal() - 10) }; });
      const gms = Array.from({ length: 32 }, (_, i) => generateGm(rng(d * 100 + i), 3000 + d * 100 + i, POSITIONS, GROUPS, 'gm_final'));
      const left = new Map(pool.map((x) => [x.p.personId, x]));
      for (let n = 0; n < 96; n++) {
        const board = buildBoard(gms[n % 32]!, [...left.values()].map((x) => x.p), [], ctx({ draw }), 1 + Math.floor(n / 32), 3, 4);
        const taken = left.get(board[0]!.personId)!;
        left.delete(taken.p.personId); picks.push(n + 1); truth.push(taken.t);
      }
    }
    const c = -corr(picks, truth);
    expect(c).toBeGreaterThan(0.2); expect(c).toBeLessThan(0.9);
  });
});

describe('K7.4.2 free agency', () => {
  const fa = (position: string, grade: number, over: Partial<FreeAgent> = {}): FreeAgent => ({ ...player(position, grade), expectedYears: 3, guaranteeShare: 0.5, minimumCents: 1_000_000, publicSuitors: 3, ...over });
  const pool = [fa('QB', 80), fa('WR', 75), fa('CB', 70), fa('RB', 41)];
  it('offers never pass his walk-away value or his room, open below it, and rise each round', () => {
    const t = targets(NEUTRAL, pool, [], ctx());
    const walk = new Map(t.map((x) => [x.personId, x.walkAwayApyCents]));
    const r0 = roundOffers(NEUTRAL, pool, [], ctx(), 1e12, 0, 5), r5 = roundOffers(NEUTRAL, pool, [], ctx(), 1e12, 5, 5), r50 = roundOffers(NEUTRAL, pool, [], ctx(), 1e12, 50, 5);
    expect(r0.length).toBe(P('fa.offersPerRound'));
    for (const o of r0) { expect(o.apyCents).toBeLessThan(walk.get(o.personId)!); expect(o.guaranteedCents).toBe(Math.round(o.apyCents * o.years * 0.5)); }
    for (const o of r5) expect(o.apyCents).toBeGreaterThan(r0.find((x) => x.personId === o.personId)!.apyCents);
    for (const o of r50) expect(o.apyCents).toBe(walk.get(o.personId)!);
    const tightRoom = r0[0]!.apyCents - 1;
    expect(roundOffers(NEUTRAL, pool, [], ctx(), tightRoom, 0, 5).every((o) => o.personId !== r0[0]!.personId)).toBe(true);
    expect(roundOffers(NEUTRAL, pool, [], ctx(), 1e12, 0, 0)).toEqual([]);
  });
  it('a hard bargainer opens lower; need and a past pass change the order; grading error makes clubs disagree on price', () => {
    const open = (negotiation: number) => roundOffers(gmWith(1, {}, { negotiation }), pool, [], ctx(), 1e12, 0, 5)[0]!.apyCents;
    expect(open(2)).toBeLessThan(open(-2));
    const needs = [{ position: 'CB', need: 1, gmNeed: 1, coachNeed: null, frame: 'now' as const }];
    const plain = targets(NEUTRAL, pool, [], ctx()).map((x) => x.personId), needed = targets(NEUTRAL, pool, needs, ctx()).map((x) => x.personId);
    expect(needed.indexOf(pool[2]!.personId)).toBeLessThan(plain.indexOf(pool[2]!.personId));
    const passed = targets(rememberPassedOn(NEUTRAL, pool[0]!.personId), pool, [], ctx());
    expect(passed.find((x) => x.personId === pool[0]!.personId)!.priority).toBeLessThan(targets(NEUTRAL, pool, [], ctx())[0]!.priority);
    const prices = Array.from({ length: 32 }, (_, i) => walkAwayCents(generateGm(rng(i + 40), 700 + i, POSITIONS, GROUPS, 'gm_final'), pool[1]!, ctx({ draw }), 3));
    expect(Math.max(...prices)).toBeGreaterThan(Math.min(...prices) * 1.15);
  });
});

describe('K7.4.1 contracts and the cap', () => {
  const a = player('QB', 85), b = player('WR', 70), c = player('RB', 60, { age: 30 });
  const views = new Map([a, b, c].map((v) => [v.personId, v]));
  const M = 1_000_000;
  const opt = (v: PlayerView, action: ContractOption['action'], cap: number[], cashCents: number, yearsKept: number): ContractOption => ({ personId: v.personId, action, capCentsByYear: cap, cashCents, yearsKept });
  const options = [
    opt(a, 'keep', [40 * M, 0, 0], 40 * M, 1), opt(a, 'extend', [30 * M, 45 * M, 45 * M], 60 * M, 3), opt(a, 'release', [10 * M], 0, 0),
    opt(b, 'keep', [20 * M, 20 * M], 20 * M, 2), opt(b, 'restructure', [10 * M, 30 * M], 20 * M, 2), opt(b, 'release', [8 * M], 0, 0),
    opt(c, 'keep', [15 * M], 15 * M, 1), opt(c, 'release', [3 * M], 0, 0),
  ];
  it('takes the most surplus when it fits, and repairs to a legal plan when it does not', () => {
    const free = capPlan(NEUTRAL, { views, options, roomCentsByYear: [500 * M, 500 * M, 500 * M], cashLimitCents: 500 * M, cashFloorCents: 0 }, ctx());
    expect(free.legal).toBe(true);
    expect(free.chosen.find((o) => o.personId === a.personId)!.action).toBe('extend');
    const tight = capPlan(NEUTRAL, { views, options, roomCentsByYear: [45 * M, 80 * M, 80 * M], cashLimitCents: 500 * M, cashFloorCents: 0 }, ctx());
    expect(tight.legal).toBe(true); expect(tight.overCentsByYear).toEqual([0, 0, 0]);
    expect(tight.totalSurplus).toBeLessThan(free.totalSurplus);
    expect(tight.chosen.find((o) => o.personId === a.personId)!.action).not.toBe('release');
    const cash = capPlan(NEUTRAL, { views, options, roomCentsByYear: [500 * M, 500 * M, 500 * M], cashLimitCents: 50 * M, cashFloorCents: 0 }, ctx());
    expect(cash.legal).toBe(true); expect(cash.cashCents).toBeLessThanOrEqual(50 * M);
    const impossible = capPlan(NEUTRAL, { views, options, roomCentsByYear: [1 * M, 0, 0], cashLimitCents: 500 * M, cashFloorCents: 0 }, ctx());
    expect(impossible.legal).toBe(false); expect(impossible.overCentsByYear[0]).toBe(20 * M);
  });
  it('a general manager on the hot seat mortgages later years', () => {
    const room = { views, options: options.filter((o) => o.personId === b.personId), roomCentsByYear: [500 * M, 500 * M], cashLimitCents: 500 * M, cashFloorCents: 0 };
    const pusher = gmWith(1, { capStyle: 1, timeHorizon: 0.5 });
    expect(capPlan(pusher, room, ctx({ pressure: 1 })).chosen[0]!.action).toBe('restructure');
    expect(capPlan(gmWith(1, { capStyle: 0, timeHorizon: 1 }), room, ctx()).chosen[0]!.action).toBe('keep');
    expect(bonusShare(pusher)).toBeGreaterThan(bonusShare(gmWith(1, { capStyle: 0 })));
  });
  it('talks land between the walk-away values, favour the better negotiator, and can fail', () => {
    const even = negotiate(NEUTRAL, 20 * M, 10 * M, 0, 0.9);
    expect(even).toEqual({ agreed: true, apyCents: 15 * M });
    const hard = negotiate(gmWith(1, {}, { negotiation: 2 }), 20 * M, 10 * M, 0, 0.9);
    expect(hard.agreed && hard.apyCents < 15 * M && hard.apyCents >= 10 * M).toBe(true);
    expect(negotiate(NEUTRAL, 9 * M, 10 * M, 0, 0.9)).toEqual({ agreed: false, reason: 'no_overlap' });
    expect(negotiate(NEUTRAL, 10.1 * M, 10 * M, 0, 0.1)).toEqual({ agreed: false, reason: 'broke_down' });
  });
  it('camp fines: waivable ones are waived for a starter; a non-waivable waiver is a violation opportunity, never done here', () => {
    expect(campFine({ waivable: true }, { starter: true, extensionPending: false })).toBe('waive');
    expect(campFine({ waivable: true }, { starter: false, extensionPending: false })).toBe('collect');
    expect(campFine({ waivable: false }, { starter: false, extensionPending: true })).toBe('violation_opportunity');
  });
});

describe('K7.3.1 in-season moves and K7.4.5 the cutdown', () => {
  it('gaps are filled first from the ready list inside cap room; injuries go to the right list', () => {
    const roster = [player('QB', 70), player('WR', 60)];
    const hurt = new Set([roster[0]!.personId]);
    expect(mandatoryGaps(roster, hurt, { QB: 2, WR: 1 })).toEqual([{ position: 'QB', short: 2 }]);
    const ready = [player('QB', 55, { costCentsByYear: [900] }), player('QB', 65, { costCentsByYear: [5000] }), player('WR', 80)];
    expect(fillGap(NEUTRAL, 'QB', ready, 1000, ctx())!.personId).toBe(ready[0]!.personId);
    expect(fillGap(NEUTRAL, 'QB', ready, 10_000, ctx())!.personId).toBe(ready[1]!.personId);
    expect(fillGap(NEUTRAL, 'QB', ready, 10, ctx())).toBeNull();
    expect(injuryMove(2, { minWeeksOut: 4, returnSlotsLeft: 3 }, 10)).toBe('stay_active');
    expect(injuryMove(6, { minWeeksOut: 4, returnSlotsLeft: 3 }, 10)).toBe('reserve_return');
    expect(injuryMove(6, { minWeeksOut: 4, returnSlotsLeft: 0 }, 10)).toBe('reserve_season');
    expect(injuryMove(12, { minWeeksOut: 4, returnSlotsLeft: 3 }, 10)).toBe('reserve_season');
  });
  it('claims a waived player only when he beats the worst man at that spot by a margin', () => {
    const roster = [player('CB', 70), player('CB', 66), player('CB', 50), player('QB', 70)];
    const good = claimDecision(NEUTRAL, roster, player('CB', 68), true, ctx());
    expect(good.claim).toBe(true); expect(good.dropId).toBe(roster[2]!.personId);
    expect(claimDecision(NEUTRAL, roster, player('CB', 50.2), true, ctx()).claim).toBe(false);
    expect(claimDecision(NEUTRAL, roster, player('OT', 70), true, ctx()).claim).toBe(false);
    expect(claimDecision(NEUTRAL, roster, player('OT', 70), false, ctx())).toMatchObject({ claim: true, dropId: null });
  });
  it('the cutdown keeps exactly the limit, fills position minimums, protects his own picks and hears the coach', () => {
    const roster = squad(rng(31));
    const minByPosition = { QB: 2, WR: 4, OT: 3, CB: 4, RB: 2 };
    const base = { roster, limit: 18, minByPosition, coachRank: new Map<number, number>(), draftedRound: new Map<number, number>(), deadCentsByYear: new Map<number, number[]>(), rounds: 7 };
    const out = cutdown(NEUTRAL, base, ctx());
    expect(out.keep.length).toBe(18); expect(out.cut.length).toBe(roster.length - 18); expect(out.shortAt).toEqual([]);
    for (const [pos, n] of Object.entries(minByPosition)) expect(roster.filter((v) => out.keep.includes(v.personId) && v.position === pos).length).toBeGreaterThanOrEqual(n);
    const three = [player('WR', 60), player('WR', 59), player('WR', 58)];
    const small = { ...base, roster: three, limit: 2, minByPosition: {} };
    expect(cutdown(NEUTRAL, small, ctx()).cut).toEqual([three[2]!.personId]);
    expect(cutdown(NEUTRAL, { ...small, draftedRound: new Map([[three[2]!.personId, 1]]) }, ctx()).keep).toContain(three[2]!.personId);
    expect(cutdown(NEUTRAL, { ...small, draftedRound: new Map([[three[2]!.personId, 7]]) }, ctx()).keep).not.toContain(three[2]!.personId);
    expect(cutdown(NEUTRAL, { ...small, deadCentsByYear: new Map([[three[2]!.personId, [CENTS_PER_WIN]]]) }, ctx()).keep).toContain(three[2]!.personId);
    const last = out.cut[out.cut.length - 1]!;
    expect(cutdown(NEUTRAL, { ...base, coachRank: new Map([[last, 1]]) }, ctx(), 1).keep).toContain(last);
    expect(cutdown(NEUTRAL, { ...base, coachRank: new Map([[last, 1]]) }, ctx(), 0).keep).not.toContain(last);
    expect(cutdown(NEUTRAL, { ...base, minByPosition: { ...minByPosition, QB: 9 } }, ctx()).shortAt).toEqual(['QB']);
  });
  it('practice squad, elevation, the undrafted board and hiding a player from waivers', () => {
    const young = [player('WR', 50, { age: 22, projected: { mean: 70, variance: 49 } }), player('WR', 52, { age: 27 }), player('CB', 45, { age: 22 })];
    expect(practiceSquad(NEUTRAL, young, 1, ctx())).toEqual([young[0]!.personId]);
    const needs = [{ position: 'CB', need: 1, gmNeed: 1, coachNeed: null, frame: 'now' as const }];
    expect(undraftedBoard(NEUTRAL, young, needs, ctx())[0]).toBe(young[0]!.personId);
    expect(hideFromWaivers(NEUTRAL, young[0]!, 0.9, ctx()).hide).toBe(true);
    expect(hideFromWaivers(NEUTRAL, young[0]!, 0.01, ctx()).hide).toBe(false);
  });
});

describe('authority (L5.2.1) and K7.8.1 order', () => {
  const power = (holder: 'general_manager' | 'head_coach', userIsHeadCoach: boolean, delegated: string[] = []): Power => ({
    holders: { final_say_roster: holder, final_say_draft: holder, final_say_contracts: holder }, userIsHeadCoach, delegated: new Set(delegated) as Power['delegated'],
  });
  it('with the user holding final say nothing is filed without his decision or his logged delegation', () => {
    expect(route('final_say_roster', power('head_coach', true), ['cut', 5], 'cutdown.surplus')).toEqual({ mode: 'propose', option: ['cut', 5], reason: 'cutdown.surplus' });
    expect(route('final_say_roster', power('head_coach', true, ['final_say_roster']), 'x', 'r')).toEqual({ mode: 'act', decision: 'x', decidedBy: 'head_coach', delegatedByUser: true });
    expect(route('final_say_draft', power('general_manager', true), 'x', 'r')).toEqual({ mode: 'act', decision: 'x', decidedBy: 'general_manager', delegatedByUser: false });
    expect(route('final_say_contracts', power('head_coach', false), 'x', 'r').mode).toBe('act');
    expect(objects(1, 0.5)).toBe(true); expect(objects(1, 0.95)).toBe(false);
  });
  it('clubs act in id order unless a league rule sets the order; streams are scoped; tier 3 runs markets at a coarser step', () => {
    expect(actingOrder([3, 1, 2])).toEqual([1, 2, 3]);
    expect(actingOrder([3, 1, 2, 4], [4, 2])).toEqual([4, 2, 1, 3]);
    expect(streamScope(2030, 12, 5, 'claims')).toEqual(['frontOffice', 2030, 12, 5, 'claims']);
    expect(runsToday(1, 'free_agency', 3)).toBe(true);
    expect(runsToday(3, 'free_agency', 3)).toBe(false); expect(runsToday(3, 'free_agency', 7)).toBe(true); expect(runsToday(3, 'legality', 3)).toBe(true);
  });
  it('a market round forms every offer from one snapshot, whatever order the clubs are listed in', () => {
    const seen: number[] = [];
    const run = (ids: number[]) => marketRound({ day: 1 }, ids, (c, s) => { seen.push(s.day); return [`${c}:${s.day}`]; }, (s, offers) => ({ day: s.day + 1, offers }));
    const a = run([3, 1, 2]), b = run([2, 3, 1]);
    expect(a).toEqual(b); expect(a).toEqual({ day: 2, offers: ['1:1', '2:1', '3:1'] }); expect(new Set(seen)).toEqual(new Set([1]));
  });
});
