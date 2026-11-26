// FAKE game port for season-gate tests: scores drawn from the game seed alone. No football in it.
// Options: { failAtGame?: number } throws in that game id; { strongBelow?: number } favours low team ids.
import { seedFromHex, stream } from '@gm/engine-core';
import type { CreatePlayGame, Json } from '../../src/season-gate/seasons.ts';

export const FAKE_PORT_MODULE = new URL('./fake-port.ts', import.meta.url).href;
export const fakePortRef = (options: Json = {}) => ({ module: FAKE_PORT_MODULE, options });

export const createPlayGame: CreatePlayGame = (_ruleSetId, raw) => {
  const o = (raw ?? {}) as { failAtGame?: number; strongBelow?: number };
  return (ctx) => {
    if (o.failAtGame === ctx.fixture.gameId) throw new Error('FAKE failure asked for by the test');
    const s = stream(seedFromHex(ctx.seedHex), 'fake.game', []);
    const edge = (t: number) => (o.strongBelow !== undefined && t < o.strongBelow ? 2 : 0);
    const tds: [number, number] = [s.int(0, 4) + edge(ctx.fixture.home), s.int(0, 4) + edge(ctx.fixture.away)];
    let points: [number, number] = [tds[0] * 7 + s.int(0, 3) * 3, tds[1] * 7 + s.int(0, 3) * 3];
    let overtime = false;
    if (points[0] === points[1]) { overtime = true; points = s.chance(0.5) ? [points[0] + 3, points[1]] : [points[0], points[1] + 3]; }
    const lines = [ctx.fixture.home, ctx.fixture.away].map((teamId, side) => ({ playerId: teamId * 1000 + 1, teamId, statId: 'pass_touchdowns', value: tds[side]! }));
    return { points, touchdowns: tds, overtime, stateHash: `${ctx.seedHex}:${points[0]}-${points[1]}`, plays: 120, lines };
  };
};
