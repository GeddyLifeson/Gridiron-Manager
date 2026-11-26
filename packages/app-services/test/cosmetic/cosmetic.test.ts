// PV-01 acceptance (presentation-build-plan section 6 tests 1 and 2; O5.3.2; MB-16).
// (1) The same seed gives identical game results on all three performance tiers, with audio on and off, and with
//     the cosmetic seed changed: a presenter that draws cosmetic numbers between plays never moves a game stream.
// (2) A play replayed twice produces identical cosmetic draw sequences (film shows the same crowd and rain).
// Test 3 (the lint fails a planted Math.random in app-ui) lives in packages/tools/test/lint.test.ts.
import { describe, it, expect } from 'vitest';
import { seedFromHex } from '@gm/engine-core';
import { dummyTeams, newGame, playGame, stepPlay, type GameRecord } from '@gm/engine-game';
import { resolveRuleSet } from '@gm/rules-data';
import { COSMETIC_STREAM, cosmeticFactory, cosmeticStream, type CosmeticStreams } from '../../src/cosmetic/index.ts';

const SEED_HEX = '00c0ffee12345678';
const TIERS = { low: 4, standard: 32, high: 256 } as const; // rain particles drawn per play, by display.performanceTier
type Tier = keyof typeof TIERS;

interface Presenter { tier: Tier; audioOn: boolean; cosmeticSeed: number }

/** Plays a game snap by snap with a fake presenter drawing cosmetic numbers after each play, as app-ui will. */
function presentedGame(ruleSetId: string, gameId: number, p: Presenter): { record: Pick<GameRecord, 'finalState' | 'plays'>; cosmeticDraws: number; sample: number[] } {
  const seed = seedFromHex(SEED_HEX);
  const rules = resolveRuleSet(ruleSetId);
  const [home, away] = dummyTeams(seed, 2);
  const streamsFor = cosmeticFactory(SEED_HEX, p.cosmeticSeed);
  let s = newGame(gameId, home!, away!, rules, seed);
  const plays = [];
  let cosmeticDraws = 0;
  const sample: number[] = [];
  while (s.phase !== 'final') {
    const r = stepPlay(s, rules, seed);
    s = r.state;
    plays.push(r.row);
    const c: CosmeticStreams = streamsFor({ gameId, playNumber: r.row.playNumber });
    for (let i = 0; i < TIERS[p.tier]; i++) { c.display.range(0, 120); c.display.range(0, 53.3); }
    c.display.int(0, 7); // stride phase
    if (p.audioOn) {
      for (const _e of r.events) { c.audio.range(0.94, 1.06); c.audio.pick([3, 2, 1]); } // pitch variant, crowd sample
      c.audio.normal(); // crowd timing jitter
    }
    cosmeticDraws += c.display.draws + c.audio.draws;
    if (sample.length < 8) sample.push(c.display.uniform());
  }
  return { record: { finalState: s, plays }, cosmeticDraws, sample };
}

describe('cosmetic streams never change a game result (section 6 test 1, O5.3.2, MB-16)', () => {
  for (const ruleSetId of ['pro_2026', 'college_2026']) {
    it(`${ruleSetId}: same seed, identical plays on every tier, audio on and off, cosmetic seed changed`, () => {
      const seed = seedFromHex(SEED_HEX);
      const [home, away] = dummyTeams(seed, 2);
      const baseline = playGame(7, home!, away!, resolveRuleSet(ruleSetId), seed);
      const runs: ReturnType<typeof presentedGame>[] = [];
      for (const tier of Object.keys(TIERS) as Tier[]) for (const audioOn of [true, false]) for (const cosmeticSeed of [0, 99]) {
        const run = presentedGame(ruleSetId, 7, { tier, audioOn, cosmeticSeed });
        expect(run.record.plays.map((x) => x.stateHash)).toEqual(baseline.plays.map((x) => x.stateHash));
        expect(run.record.finalState).toEqual(baseline.finalState);
        runs.push(run);
      }
      // The presenters really did draw different amounts and different numbers.
      expect(new Set(runs.map((r) => r.cosmeticDraws)).size).toBeGreaterThan(1);
      expect(runs[0]!.sample).not.toEqual(runs[1]!.sample); // same tier and audio, cosmetic seed 0 vs 99
    });
  }
});

describe('replays repeat their cosmetic draws (section 6 test 2)', () => {
  it('the same play gives the same display and audio sequences every time', () => {
    const f = cosmeticFactory(SEED_HEX);
    const draw = (c: CosmeticStreams) => [c.display.uniform(), c.display.int(0, 99), c.audio.range(0.9, 1.1), c.audio.pick([1, 1, 1]), c.audio.normal(), c.display.chance(0.5)];
    const first = draw(f({ gameId: 12, playNumber: 40 }));
    const again = draw(f({ gameId: 12, playNumber: 40 }));
    const fresh = draw(cosmeticFactory(SEED_HEX)({ gameId: 12, playNumber: 40 }));
    expect(again).toEqual(first);
    expect(fresh).toEqual(first);
  });

  it('channels, plays, games, world seeds and cosmetic seeds are separate streams', () => {
    const seq = (hex: string, ch: 'display' | 'audio', g: number, pl: number, cs = 0) => {
      const s = cosmeticStream(hex, ch, { gameId: g, playNumber: pl }, cs);
      return [s.uniform(), s.uniform(), s.uniform()].join(',');
    };
    const base = seq(SEED_HEX, 'display', 1, 1);
    const others = [seq(SEED_HEX, 'audio', 1, 1), seq(SEED_HEX, 'display', 1, 2), seq(SEED_HEX, 'display', 2, 1), seq('1', 'display', 1, 1), seq(SEED_HEX, 'display', 1, 1, 1)];
    expect(new Set([base, ...others]).size).toBe(6);
  });

  it('draws stay in range and the stream names are the reserved J13 names', () => {
    const { display, audio } = cosmeticFactory(SEED_HEX)({ gameId: 0, playNumber: 0 });
    expect(display.name).toBe(`${COSMETIC_STREAM}.display`);
    expect(audio.name).toBe(`${COSMETIC_STREAM}.audio`);
    for (let i = 0; i < 1000; i++) {
      const u = display.uniform(); expect(u >= 0 && u < 1).toBe(true);
      const r = audio.range(0.94, 1.06); expect(r >= 0.94 && r < 1.06).toBe(true);
      const n = display.int(-3, 3); expect(Number.isInteger(n) && n >= -3 && n <= 3).toBe(true);
    }
  });

  it('rejects bad seeds and scopes', () => {
    expect(() => cosmeticFactory('not-hex')).toThrow();
    expect(() => cosmeticStream(SEED_HEX, 'display', { gameId: -1, playNumber: 0 })).toThrow();
    expect(() => cosmeticStream(SEED_HEX, 'display', { gameId: 0, playNumber: 1.5 })).toThrow();
    expect(() => cosmeticStream(SEED_HEX, 'smell' as 'audio', { gameId: 0, playNumber: 0 })).toThrow();
  });
});
