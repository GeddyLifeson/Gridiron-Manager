// PV-17 same-seed test with audio on and off on all three performance tiers (plan section 8; section 6 test 1;
// O5.3.2 acceptance; MB-16). PV-01 proved the cosmetic streams alone cannot move a game. This test runs the
// real presenters: the real audio engine (on a fake context), the real crowd driver and the real sound
// recipes, with the per-tier display work, between the plays of the game, in the same process, and then
// checks the game's hash chain and final state are the baseline's, byte for byte.
//   tier work: display.performanceTier low | standard | high changes how many display draws a play costs.
//   audio:     on = engine, crowd driver, reactions and one-shot sounds; off = master off (and no presenter).
import { describe, expect, it } from 'vitest';
import { seedFromHex } from '@gm/engine-core';
import { dummyTeams, newGame, playGame, stepPlay, type GameRecord } from '@gm/engine-game';
import { cosmetic } from '@gm/app-services';
const { cosmeticFactory } = cosmetic;
import { resolveRuleSet } from '@gm/rules-data';
import { realGame } from '@gm/headless';
const { createRealGame } = realGame;
import { CROWD_FEED_FORMAT, CrowdDriver, type CrowdCue, type CrowdFeed, type CrowdRulingKind } from '../../src/audio/crowd/index.ts';
import { rig } from './qa-lib.ts';

const SEED_HEX = '00c0ffee12345678';
const TIERS = { low: 4, standard: 32, high: 256 } as const;
type Tier = keyof typeof TIERS;

/** Result words of the play loop's rows, as the rulings a crowd reacts to. */
function rulingOf(result: string): CrowdRulingKind | null {
  if (result === 'touchdown') return 'touchdown';
  if (result === 'safety') return 'safety';
  if (result === 'try good') return 'try_good';
  if (result === 'try failed') return 'try_failed';
  if (result.startsWith('field goal good')) return 'field_goal_good';
  if (result.startsWith('field goal missed')) return 'field_goal_missed';
  if (result === 'incomplete') return 'incomplete';
  if (result === 'first down') return 'first_down';
  if (result === 'turnover on downs') return 'turnover_on_downs';
  return null;
}

function feedFor(row: GameRecord['plays'][number], noise: number): CrowdFeed {
  const cues: CrowdCue[] = [{ kind: 'snap', seq: 0, tick: 0, x: 40 }, { kind: 'whistle', seq: 1, tick: 40, x: 44 }];
  const ruling = rulingOf(row.result);
  if (ruling) cues.push({ kind: 'ruling', seq: 2, tick: 41, ruling, favours: row.offense === 0 ? 0 : 1 });
  return {
    formatVersion: CROWD_FEED_FORMAT, playId: `${row.gameId}:${row.playNumber}`, ticksPerSecond: 10,
    perspective: { homeSide: 0, userSide: 0 },
    conditions: { noise },
    result: { yardsGained: row.gain, noPlay: false },
    cues, missing: [],
  };
}

interface Presenter { tier: Tier; audioOn: boolean; cosmeticSeed: number }

function presentedGame(ruleSetId: string, gameId: number, p: Presenter) {
  const seed = seedFromHex(SEED_HEX);
  const rules = resolveRuleSet(ruleSetId);
  const [home, away] = dummyTeams(seed, 2);
  const streamsFor = cosmeticFactory(SEED_HEX, p.cosmeticSeed);
  const g = rig({ settings: { master: { volumePct: 100, on: p.audioOn } } });
  const crowd = new CrowdDriver(g.engine);
  if (p.audioOn) crowd.startGame();
  let s = newGame(gameId, home!, away!, rules, seed);
  const plays: GameRecord["plays"][number][] = [];
  let sounds = 0;
  while (s.phase !== 'final') {
    const r = stepPlay(s, rules, seed);
    s = r.state;
    plays.push(r.row);
    const c = streamsFor({ gameId, playNumber: r.row.playNumber });
    for (let i = 0; i < TIERS[p.tier]; i++) { c.display.range(0, 120); c.display.range(0, 53.3); }
    if (p.audioOn) {
      g.ctx.advance(25);
      const report = crowd.play(feedFor(r.row, 0.2 + 0.6 * c.audio.uniform()), { tick0At: g.ctx.currentTime + 2, audioDraw: () => c.audio.uniform() });
      if (report.reaction?.outcome?.played) sounds++;
      g.engine.play('contact.snap', { when: g.ctx.currentTime + 2, variantDraw: c.audio.uniform() });
      g.engine.play('officials.whistle.deadBall', { when: g.ctx.currentTime + 6, variantDraw: c.audio.uniform() });
    }
  }
  return { finalState: s, plays, sounds, played: g.played.length, refused: g.refused.length };
}

describe('same seed, same game: presenters on every tier, audio on and off, cosmetic seed changed', () => {
  for (const ruleSetId of ['pro_2026', 'college_2026']) {
    it(`${ruleSetId}: identical hash chain and final state in all twelve presentations`, () => {
      const seed = seedFromHex(SEED_HEX);
      const [home, away] = dummyTeams(seed, 2);
      const baseline = playGame(7, home!, away!, resolveRuleSet(ruleSetId), seed);
      const runs: ReturnType<typeof presentedGame>[] = [];
      for (const tier of Object.keys(TIERS) as Tier[]) for (const audioOn of [true, false]) for (const cosmeticSeed of [0, 99]) {
        const run = presentedGame(ruleSetId, 7, { tier, audioOn, cosmeticSeed });
        expect(run.plays.map((x) => x.stateHash), `${tier} audio ${audioOn} seed ${cosmeticSeed}`).toEqual(baseline.plays.map((x) => x.stateHash));
        expect(run.finalState).toEqual(baseline.finalState);
        runs.push(run);
      }
      // The audio-on runs really made sound and the audio-off runs made none: the comparison was not between idle presenters.
      for (const run of runs.filter((r) => r.played > 0)) expect(run.played).toBeGreaterThan(baseline.plays.length);
      expect(runs.filter((r) => r.played === 0).length).toBe(6);
      expect(runs.filter((r) => r.played > 0).length).toBe(6);
    });
  }

  it('the audio engine sees the same plays however the cosmetic seed is set, so sound varies and the game does not', () => {
    const a = presentedGame('pro_2026', 11, { tier: 'standard', audioOn: true, cosmeticSeed: 1 });
    const b = presentedGame('pro_2026', 11, { tier: 'standard', audioOn: true, cosmeticSeed: 2 });
    expect(a.plays.map((x) => x.stateHash)).toEqual(b.plays.map((x) => x.stateHash));
    expect(a.played).toBe(b.played); // same events make the same number of sounds
  });
});

describe('the real engine game, run again after audio and display presenters have run in the same process', () => {
  for (const ruleSetId of ['pro_2026', 'college_2026']) {
    it(`${ruleSetId}: a presented run between two runs of the same game leaves both identical`, () => {
      const game = createRealGame(ruleSetId);
      const input = game.input(0, SEED_HEX);
      const first = game.simulate(input);
      // Present the whole game: audio engine, crowd driver, one-shot sounds and the high-tier display work.
      const streamsFor = cosmeticFactory(SEED_HEX, 5);
      const g = rig();
      const crowd = new CrowdDriver(g.engine);
      crowd.startGame();
      let n = 0;
      for (const rec of first.records) {
        const c = streamsFor({ gameId: 0, playNumber: ++n });
        for (let i = 0; i < TIERS.high; i++) c.display.range(0, 120);
        g.ctx.advance(25);
        crowd.play(feedFor({ gameId: 0, playNumber: n, result: '', gain: 0, offense: rec.situation.offense } as never, c.audio.uniform()), { tick0At: g.ctx.currentTime + 2 });
        g.engine.play('contact.hit.tier3', { when: g.ctx.currentTime + 3, variantDraw: c.audio.uniform() });
      }
      expect(g.played.length).toBeGreaterThanOrEqual(first.records.length); // a hit per play, at least
      const second = game.simulate(input);
      expect(second.records.length).toBe(first.records.length);
      expect(second).toEqual(first);
    });
  }
});
