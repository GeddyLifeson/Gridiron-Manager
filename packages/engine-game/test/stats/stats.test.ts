// Statistics and play-by-play (WP-07). Acceptance of plans/engine-build-plan.md: over hand-built play
// records covering each PlayResultType, the box score equals the sum of the credit rows, and a play
// that does not count carries no production credits. FIXTURE DATA throughout (see fixtures.ts).
import { describe, expect, it } from 'vitest';
import { Contract } from '@gm/engine-core';
import { KEY_DICTIONARY } from '@gm/rules-data';
import {
  createStatsModule, boxScore, playsBehind, readPlay, STAT_CATALOGUE, SEASON_TABLE_COLUMNS, SEASON_COLUMNS_SKIPPED,
  PUBLIC_COLUMNS, CALIBRATION_SCRIPT_COLUMNS, publicRows, publicCsv, PLAY_TEXT_TEMPLATES, renderPlayText, RULE_KEYS, PARAMS,
  fieldGoalBand, FIELD_GOAL_BANDS,
} from '../../src/stats/index.ts';
import { FIXTURE_GEOMETRY } from './fixtures.ts';
import { buildPlays } from './plays.ts';

type StatCredit = Contract.StatCredit;

const stats = createStatsModule({ geometry: FIXTURE_GEOMETRY });
const plays = buildPlays();
const all = Object.values(plays);
const creditsOf = (name: string) => stats.credits(plays[name]!);
const of = (rows: readonly StatCredit[], statId: string, playerId?: number | null) =>
  rows.filter((c) => c.statId === statId && (playerId === undefined || c.playerId === playerId)).reduce((a, c) => a + c.value, 0);

/** FIXTURE rule set: only the three keys the module reads, with made-up values. Not the real rules. */
const FIXTURE_RULES: Contract.RuleSet = {
  id: 'fixture', level: 'pro', seasonYear: 2026,
  num: (key) => {
    const v = ({ 'clock.periods': 4, 'clock.period_length_s': 900, 'series.downs': 4 } as Record<string, number>)[key];
    if (v === undefined) throw new Error(`fixture rule set has no key ${key}`);
    return v;
  },
  bool: () => { throw new Error('not in fixture'); },
  opt: () => { throw new Error('not in fixture'); },
  keys: () => ['clock.periods', 'clock.period_length_s', 'series.downs'],
};

const PRODUCTION_FREE = new Set(['snaps_offense', 'snaps_defense', 'snaps_special_teams', 'penalties', 'penalty_yards']);

describe('fixtures', () => {
  it('cover every PlayResultType', () => {
    const seen = new Set(all.map((r) => r.final.resultType));
    expect(Contract.PlayResultType.options.filter((t) => !seen.has(t))).toEqual([]);
  });
  it('every statistic id is produced by at least one fixture', () => {
    const produced = new Set(all.flatMap((r) => stats.credits(r).map((c) => c.statId)));
    expect(Contract.STAT_IDS.filter((id) => !produced.has(id))).toEqual([]);
  });
  it('are deterministic: rebuilding gives equal records, credits and rows', () => {
    const again = buildPlays();
    for (const [name, r] of Object.entries(plays)) {
      expect(again[name]).toEqual(r);
      expect(stats.credits(again[name]!)).toEqual(stats.credits(r));
      expect(stats.playByPlay(again[name]!, null)).toEqual(stats.playByPlay(r, null));
    }
  });
});

describe('box score equals the sum of the credit rows (P3.1.1)', () => {
  for (const [name, record] of Object.entries(plays)) {
    it(name, () => {
      const rows = stats.credits(record);
      for (const c of rows) Contract.StatCredit.parse(c);
      expect(rows.every((c) => c.gameId === record.gameId && c.playIndex === record.index)).toBe(true);
      const box = boxScore(rows);
      for (const side of [0, 1] as const) {
        const sideRows = rows.filter((c) => c.side === side);
        for (const id of new Set(sideRows.map((c) => c.statId))) {
          const agg = STAT_CATALOGUE.find((r) => r.id === id)!.aggregate;
          const values = sideRows.filter((c) => c.statId === id).map((c) => c.value);
          const want = agg === 'max' ? Math.max(...values) : values.reduce((a, v) => a + v, 0);
          expect(box.teams[side].totals[id]).toBeCloseTo(want, 9);
        }
      }
      for (const line of box.players) {
        for (const [id, total] of Object.entries(line.totals)) {
          expect(total).toBeCloseTo(of(rows.filter((c) => c.side === line.side), id, line.playerId), 9);
        }
      }
    });
  }
  it('over the whole set: team totals equal per-play sums, longest is a max', () => {
    const rows = all.flatMap((r) => stats.credits(r));
    const box = boxScore(rows);
    for (const side of [0, 1] as const) {
      for (const row of STAT_CATALOGUE) {
        const sideRows = rows.filter((c) => c.side === side && c.statId === row.id);
        if (sideRows.length === 0) { expect(box.teams[side].totals[row.id]).toBeUndefined(); continue; }
        const vals = sideRows.map((c) => c.value);
        expect(box.teams[side].totals[row.id]).toBeCloseTo(row.aggregate === 'max' ? Math.max(...vals) : vals.reduce((a, v) => a + v, 0), 9);
      }
    }
    expect(box.teams[0].totals.punt_longest).toBe(45);
    // Field goal splits add up to the attempts.
    const fga = box.teams[0].splits.field_goals_attempted!;
    expect(Object.values(fga).reduce((a, v) => a + v, 0)).toBe(box.teams[0].totals.field_goals_attempted);
  });
  it('the plays behind a number are the plays that credited it', () => {
    const rows = all.flatMap((r) => stats.credits(r));
    expect(playsBehind(rows, { side: 0, playerId: 2, statId: 'rush_touchdowns' })).toEqual([plays.runTouchdown!.index]);
    expect(playsBehind(rows, { side: 0, playerId: null, statId: 'penalties', splitKey: 'false_start' })).toEqual([plays.falseStart!.index]);
  });
});

describe('plays that do not count (J11.9.1, D14.1.1)', () => {
  it('a pre-snap foul: penalty only, no snap', () => {
    const rows = creditsOf('falseStart');
    expect(rows.map((c) => c.statId).sort()).toEqual(['penalties', 'penalty_yards']);
    expect(of(rows, 'penalty_yards', 7)).toBe(5);
  });
  it('a live play wiped out by a penalty: snaps and the penalty, no production', () => {
    const rows = creditsOf('holdingNoPlay');
    expect(rows.filter((c) => !PRODUCTION_FREE.has(c.statId))).toEqual([]);
    expect(of(rows, 'snaps_offense')).toBe(11);
    expect(of(rows, 'snaps_defense')).toBe(11);
    expect(of(rows, 'penalties', 8)).toBe(1);
    expect(of(rows, 'penalty_yards', 8)).toBe(10);
  });
  it('every noPlay fixture carries no production credits', () => {
    for (const r of all.filter((x) => x.final.noPlay)) {
      expect(stats.credits(r).filter((c) => !PRODUCTION_FREE.has(c.statId))).toEqual([]);
      expect(stats.playByPlay(r, null).noPlay).toBe(true);
      expect(stats.playByPlay(r, null).textKey).toBe('pbp.no_play');
    }
  });
});

describe('credit rules', () => {
  it('run: carry, yards, solo tackle', () => {
    const rows = creditsOf('run');
    expect(of(rows, 'rush_carries', 2)).toBe(1);
    expect(of(rows, 'rush_yards', 2)).toBe(5);
    expect(of(rows, 'tackles_solo', 101)).toBe(1);
    expect(rows.find((c) => c.playerId === 101)!.side).toBe(1);
    expect(of(rows, 'rush_first_downs')).toBe(0);
  });
  it('assisted tackle', () => {
    const rows = creditsOf('runFirstDownAssisted');
    expect(of(rows, 'tackles_assisted', 102)).toBe(1);
    expect(of(rows, 'tackles_assisted', 103)).toBe(1);
    expect(of(rows, 'tackles_solo')).toBe(0);
    expect(of(rows, 'rush_first_downs', 2)).toBe(1);
  });
  it('tackle for loss to the first tackler', () => {
    expect(of(creditsOf('runForLoss'), 'tackles_for_loss', 104)).toBe(1);
    expect(of(creditsOf('runForLoss'), 'rush_yards', 2)).toBe(-2);
  });
  it('rushing touchdown', () => {
    expect(of(creditsOf('runTouchdown'), 'rush_touchdowns', 2)).toBe(1);
    expect(of(creditsOf('runTouchdown'), 'rush_first_downs', 2)).toBe(1);
  });
  it('scramble is a quarterback carry', () => {
    const rows = creditsOf('scramble');
    expect(of(rows, 'rush_carries', 1)).toBe(1);
    expect(of(rows, 'pass_attempts')).toBe(0);
  });
  it('completion: passer and receiver lines agree, yards = air + after catch', () => {
    const rows = creditsOf('passComplete');
    for (const [p, r] of [['pass_yards', 'receiving_yards'], ['pass_air_yards', 'receiving_air_yards'], ['pass_yards_after_catch', 'receiving_yards_after_catch'], ['pass_first_downs', 'receiving_first_downs']] as const) {
      expect(of(rows, p, 1)).toBe(of(rows, r, 3));
    }
    expect(of(rows, 'pass_yards', 1)).toBe(15);
    expect(of(rows, 'pass_air_yards', 1) + of(rows, 'pass_yards_after_catch', 1)).toBe(15);
    expect(of(rows, 'targets', 3)).toBe(1);
  });
  it('passing touchdown', () => {
    expect(of(creditsOf('passTouchdown'), 'pass_touchdowns', 1)).toBe(1);
    expect(of(creditsOf('passTouchdown'), 'receiving_touchdowns', 4)).toBe(1);
  });
  it('incompletion: attempt, target, pass defended', () => {
    const rows = creditsOf('incompleteBrokenUp');
    expect(of(rows, 'pass_attempts', 1)).toBe(1);
    expect(of(rows, 'pass_completions')).toBe(0);
    expect(of(rows, 'targets', 4)).toBe(1);
    expect(of(rows, 'passes_defended', 106)).toBe(1);
  });
  it('throwaway: attempt with no target', () => {
    const rows = creditsOf('throwaway');
    expect(of(rows, 'pass_attempts', 1)).toBe(1);
    expect(of(rows, 'targets')).toBe(0);
    expect(of(rows, 'pass_air_yards')).toBe(0);
  });
  it('spike counts as an attempt', () => {
    expect(of(creditsOf('spike'), 'pass_attempts', 1)).toBe(1);
  });
  it('shared sack: half each, sack is not an attempt', () => {
    const rows = creditsOf('sackShared');
    expect(of(rows, 'sacks', 107)).toBe(0.5);
    expect(of(rows, 'sacks', 108)).toBe(0.5);
    expect(of(rows, 'sacks')).toBe(1);
    expect(of(rows, 'sack_yards')).toBe(7);
    expect(of(rows, 'sacks_taken', 1)).toBe(1);
    expect(of(rows, 'sack_yards_lost', 1)).toBe(7);
    expect(of(rows, 'pass_attempts')).toBe(0);
    expect(of(rows, 'quarterback_hits')).toBe(2);
    expect(of(rows, 'tackles_for_loss')).toBe(0);
  });
  it('sack fumble kept by the offense', () => {
    const rows = creditsOf('sackFumbleKept');
    expect(of(rows, 'sack_fumbles', 1)).toBe(1);
    expect(of(rows, 'sack_fumbles_lost')).toBe(0);
    expect(of(rows, 'forced_fumbles', 101)).toBe(1);
    expect(of(rows, 'fumble_recoveries')).toBe(0);
  });
  it('sack fumble lost: sack to the fumble spot, lost, recovered', () => {
    const rows = creditsOf('sackFumbleLost');
    expect(of(rows, 'sacks_taken', 1)).toBe(1);
    expect(of(rows, 'sack_yards_lost', 1)).toBe(8);
    expect(of(rows, 'sacks', 102)).toBe(1);
    expect(of(rows, 'sack_fumbles_lost', 1)).toBe(1);
    expect(of(rows, 'fumble_recoveries', 103)).toBe(1);
    expect(of(rows, 'rush_fumbles')).toBe(0);
  });
  it('interception and return', () => {
    const rows = creditsOf('interception');
    expect(of(rows, 'pass_interceptions', 1)).toBe(1);
    expect(of(rows, 'interceptions', 109)).toBe(1);
    expect(of(rows, 'passes_defended', 109)).toBe(1);
    expect(of(rows, 'interception_return_yards', 109)).toBe(10);
    expect(of(rows, 'targets', 3)).toBe(1);
    expect(rows.find((c) => c.statId === 'tackles_solo')).toMatchObject({ playerId: 3, side: 0 });
  });
  it('lost fumble on a run: yards to the fumble spot, lost, forced, recovered', () => {
    const rows = creditsOf('fumbleLostRun');
    expect(of(rows, 'rush_yards', 2)).toBe(3);
    expect(of(rows, 'rush_fumbles', 2)).toBe(1);
    expect(of(rows, 'rush_fumbles_lost', 2)).toBe(1);
    expect(of(rows, 'forced_fumbles', 110)).toBe(1);
    expect(of(rows, 'fumble_recoveries', 111)).toBe(1);
  });
  it('fumble returned for a touchdown is a defensive touchdown', () => {
    expect(of(creditsOf('fumbleReturnTouchdown'), 'defensive_touchdowns', 111)).toBe(1);
    expect(of(creditsOf('fumbleReturnTouchdown'), 'rush_touchdowns')).toBe(0);
  });
  it('receiver fumble after the catch: completion to the fumble spot', () => {
    const rows = creditsOf('receiverFumbleLost');
    expect(of(rows, 'pass_completions', 1)).toBe(1);
    expect(of(rows, 'receiving_yards', 3)).toBe(14);
    expect(of(rows, 'receiving_fumbles_lost', 3)).toBe(1);
  });
  it('a fumble the officials ruled down is not credited', () => {
    const rows = creditsOf('fumbleOverruled');
    expect(of(rows, 'rush_fumbles')).toBe(0);
    expect(of(rows, 'forced_fumbles')).toBe(0);
    expect(of(rows, 'rush_carries', 2)).toBe(1);
  });
  it('safety credited to the tackler', () => {
    const rows = creditsOf('safety');
    expect(of(rows, 'safeties', 101)).toBe(1);
    expect(rows.find((c) => c.statId === 'safeties')!.side).toBe(1);
  });
  it('punt returned: gross, net, return', () => {
    const rows = creditsOf('puntReturned');
    expect(of(rows, 'punt_gross_yards', 13)).toBe(45);
    expect(of(rows, 'punt_return_yards', 120)).toBe(7);
    expect(of(rows, 'punt_net_yards', 13)).toBe(38);
    expect(of(rows, 'punt_hang_time', 13)).toBe(4.4);
    expect(of(rows, 'punts_inside_20')).toBe(0);
    expect(of(rows, 'snaps_special_teams')).toBe(22);
    expect(of(rows, 'snaps_offense') + of(rows, 'snaps_defense')).toBe(0);
  });
  it('punt inside the 20 with a fair catch', () => {
    const rows = creditsOf('puntFairCatchInside');
    expect(of(rows, 'punts_inside_20', 13)).toBe(1);
    expect(of(rows, 'fair_catches', 120)).toBe(1);
    expect(of(rows, 'punt_returns')).toBe(0);
    expect(of(rows, 'punt_net_yards', 13)).toBe(40);
  });
  it('punt touchback: net to the called spot, not inside the 20', () => {
    const rows = creditsOf('puntTouchback');
    expect(of(rows, 'punt_touchbacks', 13)).toBe(1);
    expect(of(rows, 'punt_gross_yards', 13)).toBe(45);
    expect(of(rows, 'punt_net_yards', 13)).toBe(25);
    expect(of(rows, 'punts_inside_20')).toBe(0);
  });
  it('blocked punt behind the line: zero yards', () => {
    const rows = creditsOf('puntBlocked');
    expect(of(rows, 'punts_blocked', 13)).toBe(1);
    expect(of(rows, 'punt_gross_yards')).toBe(0);
  });
  it('punt return touchdown and muff', () => {
    expect(of(creditsOf('puntReturnTouchdown'), 'punt_return_touchdowns', 120)).toBe(1);
    expect(of(creditsOf('puntReturnTouchdown'), 'defensive_touchdowns')).toBe(0);
    const muff = creditsOf('puntMuffed');
    expect(of(muff, 'muffs', 120)).toBe(1);
    expect(of(muff, 'fumble_recoveries', 4)).toBe(1);
    expect(of(muff, 'forced_fumbles')).toBe(0);
  });
  it('field goal distance label: line of scrimmage plus the parameter', () => {
    const rows = creditsOf('fieldGoalGood');
    expect(of(rows, 'field_goal_longest', 12)).toBe(47);
    expect(rows.find((c) => c.statId === 'field_goals_made')!.splitKey).toBe('40_49');
    const blocked = creditsOf('fieldGoalBlocked');
    expect(of(blocked, 'field_goals_blocked', 12)).toBe(1);
    expect(of(blocked, 'field_goals_made')).toBe(0);
    expect(blocked.find((c) => c.statId === 'field_goals_attempted')!.splitKey).toBe('50_59');
    expect(of(creditsOf('fairCatchKick'), 'field_goal_longest', 12)).toBe(55);
  });
  it('distance bands cover every whole yard once', () => {
    for (let yd = 0; yd <= 80; yd++) {
      const hits = FIELD_GOAL_BANDS.filter((b) => yd >= b.minYd && (b.maxYd === null || yd <= b.maxYd));
      expect(hits).toHaveLength(1);
      expect(fieldGoalBand(yd)).toBe(hits[0]!.key);
    }
  });
  it('tries: extra points and two-point conversions, no scrimmage credits', () => {
    expect(of(creditsOf('tryKickGood'), 'extra_points_made', 12)).toBe(1);
    expect(of(creditsOf('tryKickFailed'), 'extra_points_attempted', 12)).toBe(1);
    expect(of(creditsOf('tryKickFailed'), 'extra_points_made')).toBe(0);
    expect(of(creditsOf('twoPointRunGood'), 'rush_two_point_conversions', 2)).toBe(1);
    expect(of(creditsOf('twoPointRunGood'), 'rush_carries')).toBe(0);
    expect(of(creditsOf('twoPointPassGood'), 'pass_two_point_conversions', 1)).toBe(1);
    expect(of(creditsOf('twoPointPassGood'), 'receiving_two_point_conversions', 3)).toBe(1);
    expect(of(creditsOf('twoPointPassGood'), 'pass_attempts')).toBe(0);
    expect(creditsOf('twoPointFailed').filter((c) => !PRODUCTION_FREE.has(c.statId))).toEqual([]);
  });
  it('kickoffs: returned (other direction), touchback, return touchdown; safety kick is not a kickoff', () => {
    const k = creditsOf('kickoffReturned');
    expect(of(k, 'kickoffs', 212)).toBe(1);
    expect(k.find((c) => c.statId === 'kickoffs')!.side).toBe(1);
    expect(of(k, 'kickoff_return_yards', 320)).toBe(22);
    expect(k.find((c) => c.statId === 'kickoff_returns')!.side).toBe(0);
    expect(of(creditsOf('kickoffTouchback'), 'kickoff_touchbacks', 12)).toBe(1);
    expect(of(creditsOf('kickoffTouchback'), 'kickoff_returns')).toBe(0);
    expect(of(creditsOf('kickoffReturnTouchdown'), 'kickoff_return_touchdowns', 120)).toBe(1);
    const sk = creditsOf('safetyKick');
    expect(of(sk, 'kickoffs')).toBe(0);
    expect(of(sk, 'kickoff_returns', 120)).toBe(1);
  });
  it('penalties: enforced yards, split by foul', () => {
    const fm = creditsOf('runWithFacemask');
    expect(of(fm, 'rush_yards', 2)).toBe(6);
    expect(of(fm, 'penalty_yards', 104)).toBe(15);
    expect(fm.find((c) => c.statId === 'penalties')).toMatchObject({ side: 1, splitKey: 'face_mask' });
    const two = creditsOf('twoFoulsEnforced');
    expect(of(two, 'penalty_yards', 106)).toBe(5);
    expect(of(two, 'penalty_yards', 107)).toBe(15);
    expect(of(two, 'penalties')).toBe(2);
  });
  it('players are credited to their own side', () => {
    for (const r of all) {
      const sides = new Map<number, Contract.Side>();
      for (const pl of r.calls.snapping.players) sides.set(pl.playerId, r.situation.offense);
      for (const pl of r.calls.opposing.players) sides.set(pl.playerId, Contract.otherSide(r.situation.offense));
      for (const c of stats.credits(r)) if (c.playerId !== null && sides.has(c.playerId)) expect([c.statId, c.side]).toEqual([c.statId, sides.get(c.playerId)]);
    }
  });
});

describe('play-by-play row (J11.9.1)', () => {
  it('every row parses with the contract schema and agrees with the credits', () => {
    for (const r of all) {
      const row = Contract.PlayByPlayRow.parse(stats.playByPlay(r, null));
      const rows = stats.credits(r);
      expect(row.sack).toBe(of(rows, 'sacks_taken') > 0);
      expect(row.interception).toBe(of(rows, 'pass_interceptions') > 0);
      if (row.resultType === 'run' && !row.noPlay) expect(row.yardsGained).toBe(of(rows, 'rush_yards'));
      if (row.resultType === 'pass_complete') expect(row.yardsGained).toBe(of(rows, 'pass_yards'));
    }
  });
  it('pass location by lateral landing spot', () => {
    expect(stats.playByPlay(plays.passComplete!, null).passLocation).toBe('left');
    expect(stats.playByPlay(plays.incompleteBrokenUp!, null).passLocation).toBe('right');
    expect(stats.playByPlay(plays.passTouchdown!, null).passLocation).toBe('middle');
    expect(stats.playByPlay(plays.run!, null).passLocation).toBeNull();
  });
  it('charting fields come from the calls', () => {
    const row = stats.playByPlay(plays.passComplete!, null);
    expect(row).toMatchObject({ dropback: true, shotgun: true, noHuddle: true, motion: true, rushers: 5, coverageFamily: 'cover1', airYd: 8, yardsAfterCatch: 7, firstDown: true });
    expect(stats.playByPlay(plays.scramble!, null)).toMatchObject({ dropback: true, scramble: true, runLocation: null, textKey: 'pbp.scramble' });
    expect(stats.playByPlay(plays.runFirstDownAssisted!, null).runLocation).toBe('left');
    expect(stats.playByPlay(plays.passTouchdown!, null).playAction).toBe(true);
    expect(stats.playByPlay(plays.incompleteBrokenUp!, null).pressure).toBe(true);
  });
  it('kick distance by the play-by-play convention', () => {
    expect(stats.playByPlay(plays.fieldGoalGood!, null).kickDistanceYd).toBe(47);
    expect(stats.playByPlay(plays.puntReturned!, null).kickDistanceYd).toBe(45);
    expect(stats.playByPlay(plays.tryKickGood!, null).kickDistanceYd).toBeNull();
  });
  it('snap to snap only within the same drive and period', () => {
    const a = plays.run!, b = plays.runFirstDownAssisted!;
    expect(stats.playByPlay(a, b).snapToSnapTenths).toBe(a.situation.clockTenths - b.situation.clockTenths);
    expect(stats.playByPlay(plays.kickoffReturned!, plays.kickoffTouchback!).snapToSnapTenths).toBe(100);
    const otherDrive = { ...b, situation: { ...b.situation, driveNumber: 2 } };
    expect(stats.playByPlay(a, otherDrive).snapToSnapTenths).toBeNull();
    expect(stats.playByPlay(a, null).snapToSnapTenths).toBeNull();
  });
  it('every text key has a template and renders with its parameters', () => {
    const names = { playerName: (id: number) => `P${id}`, teamName: (s: Contract.Side) => `T${s}` };
    const keys = new Set(PLAY_TEXT_TEMPLATES.map((t) => t.key));
    const used = new Set<string>();
    for (const r of all) {
      const row = stats.playByPlay(r, null);
      expect(keys.has(row.textKey)).toBe(true);
      used.add(row.textKey);
      expect(renderPlayText(row, names)).not.toMatch(/[{}]/);
    }
    expect(renderPlayText(stats.playByPlay(plays.passComplete!, null), names)).toBe('P1 pass complete to P3 for 15 yd.');
    // Every template but the generic fallback is reached by a fixture.
    expect([...keys].filter((k) => !used.has(k) && k !== 'pbp.play')).toEqual([]);
  });
});

describe('game summary', () => {
  it('parses and counts from the plays', () => {
    const s = stats.summary(all, [], { score: [0, 0], tie: true, stateHash: 'fixture', ruleSetId: 'fixture', seedHex: '00' });
    Contract.GameSummary.parse(s);
    const scrimmage = all.filter((r) => {
      const f = readPlay(r, stats.deps);
      return f.counts && !f.isTry && f.base !== 'none' && f.offense === 0;
    }).length;
    expect(s.teams[0].scrimmagePlays).toBe(scrimmage);
    expect(s.teams[1].sacksMade).toBe(3);
    // Turnovers by side 0: one interception and four lost fumbles. Side 1 lost the muff.
    expect(s.teams[0].turnovers).toBe(5);
    expect(s.teams[1].turnovers).toBe(1);
    expect(s.teams[0].penaltiesAccepted).toBe(2);
    expect(s.teams[1].penaltyYards).toBe(35);
    expect(s.teams[0].timeoutsUsed).toBe(0);
  });
  it('takes timeouts and drives from the caller', () => {
    const drive: Contract.DriveRecord = { driveNumber: 1, side: 0, startPeriod: 1, startClockTenths: 9000, startX: 35, plays: 3, yards: 20, clockUsedTenths: 900, result: 'punt' };
    const s = stats.summary([plays.run!], [drive], { score: [0, 0], tie: false, stateHash: 'h', ruleSetId: 'r', seedHex: 's', timeoutsUsed: [2, 1] });
    expect(s.teams[0]).toMatchObject({ drives: 1, timeoutsUsed: 2 });
    expect(s.teams[1]).toMatchObject({ drives: 0, timeoutsUsed: 1 });
    expect(() => stats.summary([], [], { score: [0, 0], tie: true, stateHash: 'h', ruleSetId: 'r', seedHex: 's' })).toThrow();
  });
});

describe('catalogue and column maps (D14.2.1, D-17)', () => {
  it('the catalogue has exactly one row per shared statistic id', () => {
    expect(STAT_CATALOGUE.map((r) => r.id).sort()).toEqual([...Contract.STAT_IDS].sort());
  });
  it('every season-table column maps to a statistic or is listed as skipped', () => {
    const mapped = new Set(STAT_CATALOGUE.map((r) => r.seasonColumn).filter((c): c is string => c !== null));
    expect(SEASON_TABLE_COLUMNS.filter((c) => !mapped.has(c) && !(c in SEASON_COLUMNS_SKIPPED))).toEqual([]);
    for (const c of mapped) expect(SEASON_TABLE_COLUMNS).toContain(c);
    for (const c of Object.keys(SEASON_COLUMNS_SKIPPED)) expect(mapped.has(c)).toBe(false);
  });
  it('every calibration-script column is in the public map, once', () => {
    const names = PUBLIC_COLUMNS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(CALIBRATION_SCRIPT_COLUMNS.filter((c) => !names.includes(c))).toEqual([]);
  });
  it('public export: one row per play, the conventions the scripts read', () => {
    const records = [plays.run!, plays.incompleteBrokenUp!, plays.sackShared!, plays.fieldGoalGood!];
    const rows = publicRows(records, { rules: FIXTURE_RULES, teamLabels: ['HOM', 'VIS'], season: 2026, finalScore: [3, 0] }, stats.deps);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ play_type: 'run', rush_attempt: 1, yards_gained: 5, yardline_100: 75, posteam: 'HOM', defteam: 'VIS', offense_personnel: '1 RB, 1 TE, 3 WR', total: 3 });
    expect(rows[0]!.game_seconds_remaining).toBe(3 * 900 + plays.run!.situation.clockTenths / 10);
    expect(rows[1]).toMatchObject({ third_down_failed: 1, third_down_converted: 0, pass_location: 'right' });
    expect(rows[2]).toMatchObject({ play_type: 'pass', sack: 1, pass_attempt: 1 });
    expect(rows[3]).toMatchObject({ play_type: 'field_goal', field_goal_result: 'made', kick_distance: 47 });
    const csv = publicCsv(rows).trimEnd().split('\n');
    expect(csv).toHaveLength(5);
    expect(csv[0]!.split(',')).toEqual(PUBLIC_COLUMNS.map((c) => c.name));
  });
});

describe('numbers (D-09, Q6)', () => {
  it('every rule key the module reads is in the key dictionary', () => {
    const dict = new Set(KEY_DICTIONARY.map((k) => k.key));
    expect(RULE_KEYS.map((k) => k.key).filter((k) => !dict.has(k))).toEqual([]);
  });
  it('every parameter is in range and says its basis', () => {
    for (const p of PARAMS.params) {
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
      expect(['bible', 'assumption']).toContain(p.basis);
    }
  });
});
