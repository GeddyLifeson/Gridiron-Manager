import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { seedFromNumber, stream } from '@gm/engine-core';
import { resolveRuleSet } from '@gm/rules-data';
import { newGame, stepPlay, playGame, dummyTeams, runGolden, compareGolden, seasonResult, seasonFixtures, type GoldenReport } from '../src/index.ts';
import { bytesHash, canonicalBytes } from '@gm/engine-core';
import { RULE_SET_FILES } from '@gm/rules-data';

const goldenInputs = () => ({ resolveRuleSet, ruleSetFilesHash: bytesHash(canonicalBytes(RULE_SET_FILES)) });

const golden = JSON.parse(readFileSync(new URL('../../../golden/golden.json', import.meta.url), 'utf8')) as GoldenReport;

describe('golden-seed determinism (Q1.3.1, R1.2.1 gate)', () => {
  it('this runtime reproduces the committed golden hashes', () => {
    const r = runGolden(goldenInputs());
    expect(compareGolden(r, golden).mismatches).toEqual([]);
    expect(r.digest).toBe(golden.digest);
  });
  it('season result does not depend on the order games are computed', () => {
    const n = seasonFixtures().length;
    const reversed = Array.from({ length: n }, (_, i) => n - 1 - i);
    for (const id of ['pro_2026', 'college_2026']) {
      expect(seasonResult(goldenInputs(), id, reversed).hash).toBe(seasonResult(goldenInputs(), id).hash);
    }
  });
});

describe('dummy game', () => {
  const rules = resolveRuleSet('pro_2026');
  const college = resolveRuleSet('college_2026');
  it('the same seed gives the same game; a different seed a different one', () => {
    const seed = seedFromNumber(5);
    const [a, b] = dummyTeams(seed, 2);
    expect(playGame(1, a!, b!, rules, seed).chainHead).toBe(playGame(1, a!, b!, rules, seed).chainHead);
    expect(playGame(1, a!, b!, rules, seedFromNumber(6)).chainHead).not.toBe(playGame(1, a!, b!, rules, seed).chainHead);
  });
  it('swapping the rule-set file changes results with no code change (P1.1.2 acceptance 1)', () => {
    const seed = seedFromNumber(5);
    const [a, b] = dummyTeams(seed, 2);
    expect(playGame(1, a!, b!, college, seed).chainHead).not.toBe(playGame(1, a!, b!, rules, seed).chainHead);
  });
  it('clock, down, distance and spot stay legal on every play (Q1.2.2 last invariant)', () => {
    for (const rs of [rules, college]) for (let i = 1; i <= 30; i++) {
      const seed = seedFromNumber(i * 31);
      const [a, b] = dummyTeams(seed, 2);
      let s = newGame(i, a!, b!, rs, seed);
      while (s.phase !== 'final') {
        s = stepPlay(s, rs, seed).state;
        expect(s.clockS).toBeGreaterThanOrEqual(0);
        expect(s.clockS).toBeLessThanOrEqual(rs.num('clock.period_length_s'));
        expect(s.playClockS).toBeLessThanOrEqual(rs.num('clock.play_clock_s'));
        expect(s.down).toBeGreaterThanOrEqual(1);
        expect(s.down).toBeLessThanOrEqual(rs.num('series.downs'));
        expect(s.ballOn).toBeGreaterThanOrEqual(0);
        expect(s.ballOn).toBeLessThanOrEqual(rs.num('field.goal_to_goal_yd'));
        expect(s.period).toBeLessThanOrEqual(rs.num('clock.periods'));
        for (const t of s.teams) expect(t.timeoutsLeft).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it('save, quit, load and continue equals continuing without saving, for 100 random save points (J13.5.2)', () => {
    const pick = stream(seedFromNumber(99), 'savepoints', []);
    for (let k = 0; k < 100; k++) {
      const seed = seedFromNumber(500 + (k % 10));
      const [a, b] = dummyTeams(seed, 2);
      const full = playGame(7, a!, b!, rules, seed);
      const at = pick.int(1, full.plays.length - 1);
      let s = newGame(7, a!, b!, rules, seed);
      for (let i = 0; i < at; i++) s = stepPlay(s, rules, seed).state;
      s = JSON.parse(JSON.stringify(s)); // the save round trip: no generator state is stored
      const rows = [];
      while (s.phase !== 'final') { const r = stepPlay(s, rules, seed); s = r.state; rows.push(r.row.stateHash); }
      expect(rows).toEqual(full.plays.slice(at).map((p) => p.stateHash));
    }
  });
});
