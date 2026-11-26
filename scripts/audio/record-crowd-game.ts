// Records one real simulated game as crowd-driver feeds (PV-08 test fixture).
//
//   npx tsx scripts/audio/record-crowd-game.ts [seedHex] [noiseBase]
//
// Runs a pro game through the headless real game (the same engine `npm run bench` uses), builds each
// play's PV-00 presentation feed with the engine's own J12.6.1 `noiseForPlay` as the `noise` extra
// (what CR-PV00-1 will put on each play record), and writes the crowd-relevant part of every feed to
// packages/app-ui/test/audio/crowd/recorded-game.json. The crowd driver test replays it.
//
// Test data only: the venue `noiseBase` is a test value, not a claim about any real stadium.
import { writeFileSync } from 'node:fs';
import { NEUTRAL_ENVIRONMENT, TICKS_PER_SECOND, type PlayRecord } from '@gm/schema';
import { createRealGame } from '../../packages/headless/src/real-game/index.ts';
import { noiseForPlay } from '../../packages/engine-game/src/environment/index.ts';
import { environmentParamTable } from '../../packages/engine-game/src/environment/params.ts';
import { presentationFeed } from '../../packages/app-services/src/presentation/feed/index.ts';
import { encodeV1 } from '../../packages/app-services/test/read-models/film/fixtures.ts';

const seedHex = process.argv[2] ?? '00000000000a11ce';
const noiseBase = Number(process.argv[3] ?? 0.85);
const OUT = 'packages/app-ui/test/audio/crowd/recorded-game.json';

const g = createRealGame('pro_2026');
const input = g.input(0, seedHex);
const result = g.simulate(input);
const env = { ...NEUTRAL_ENVIRONMENT, noiseBase };
const HOME = 0;
// The environment module's own table (the real game's table does not load it yet: CR-PV00-1).
const envParams = environmentParamTable();

const plays = result.records.map((rec: PlayRecord) => {
  const s = rec.situation;
  const margin = s.score[HOME]! - s.score[1 - HOME]!;
  const noise = noiseForPlay(env, { offenseFavoured: s.offense === HOME, down: s.down ?? 0, margin }, g.rules, envParams);
  const ball = { kind: 0, x: s.ballX, y: s.ballY, height: 1, carrier: 0 };
  const feed = presentationFeed({
    record: rec, ticksPerSecond: TICKS_PER_SECOND,
    trajectory: encodeV1(0, 0, [{ players: [], ball, officials: [] }]), slots: [],
    environment: env, lineOfScrimmageX: s.ballX, lineToGainX: s.lineToGainX ?? null, userSide: HOME,
    extras: { noise },
  });
  // Only what the crowd driver reads; the rest of the feed is not part of this fixture.
  return {
    formatVersion: feed.formatVersion, playId: feed.playId, ticksPerSecond: feed.ticksPerSecond,
    perspective: feed.perspective,
    conditions: { noise: feed.conditions.noise, noiseBase: feed.conditions.noiseBase },
    situation: { offenseSide: feed.situation.offenseSide },
    result: { yardsGained: +feed.result.yardsGained.toFixed(2), noPlay: feed.result.noPlay, changeOfPossession: feed.result.changeOfPossession },
    cues: feed.cues.filter((c) => c.kind === 'ruling' || c.kind === 'tackle' || c.kind === 'whistle' || c.kind === 'snap')
      .map((c) => ('x' in c ? { kind: c.kind, seq: c.seq, tick: c.tick, x: +c.x.toFixed(2) } : c)),
    missing: feed.missing.filter((m) => m === 'noise' || m === 'rulingTicks'),
    // Situation behind the noise value, kept so a reader can check the fixture by hand.
    why: { down: s.down, offense: s.offense, homeMargin: margin, period: s.period },
  };
});

const out = { source: { ruleSetId: 'pro_2026', seedHex, noiseBase, plays: plays.length, recordedWith: 'scripts/audio/record-crowd-game.ts' }, plays };
writeFileSync(OUT, JSON.stringify(out, null, 0).replace(/\},\{"formatVersion"/g, '},\n{"formatVersion"') + '\n');
console.log(`wrote ${OUT}: ${plays.length} plays, noise ${Math.min(...plays.map((p) => p.conditions.noise ?? 0)).toFixed(2)}..${Math.max(...plays.map((p) => p.conditions.noise ?? 0)).toFixed(2)}`);
