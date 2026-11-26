// Season session (handoff "Let the player start and play a game", item A): a pro week with the seat's game
// played on the console by keys, the result in the season, save and restore, replay from seed and the seat's
// outcomes to the same hash chain; a college bye week, a delegated game, and the guards.
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { describe, it, expect } from 'vitest';
import { season as seasons } from '@gm/world';
import { SeasonPlay, contentKeyOfWorldTeam } from '../../src/play/index.ts';
import type { GameCallingSession } from '../../src/commands/game-calling/index.ts';
import { resolve, testConsoleConfig } from '../game-calling/fixtures.ts';

const ROOT = resolvePath(import.meta.dirname, '../../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (...p: string[]): any => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
const CONTENT: seasons.LeagueContent = {
  proLeague: read('packages', 'football-content', 'data', 'world', 'pro-league.json'),
  college: read('packages', 'football-content', 'data', 'world', 'college.json'),
  proLeagueRules: read('packages', 'rules-data', 'data', 'league', 'proleague_2026.json'),
  collegeLeagueRules: read('packages', 'rules-data', 'data', 'league', 'collegeleague_2026.json'),
};
const SEED = '3a5c7e9b1d2f4608';
// The reference resolver keeps these whole weeks fast (a tick-engine pro week is minutes). The session passes the
// resolver through unchanged, so the season logic under test is the same; the default is checked separately.
const FAST = 'reference' as const;
const KEY_MS = 250; // virtual time per key press: a named test assumption, not a measured value
const LIVE_MS = 6000; // virtual time from a committed call to the next dead ball: a named test assumption

/** Plays the open game to the final whistle by keys: first prompt option, a cycling pick from the focused box. */
function playByKeys(session: GameCallingSession): void {
  let pick = 0;
  let lastOpen = -1;
  let stuck = 0;
  for (let guard = 0; guard < 20000 && !session.final; guard++) {
    const s = session.driver.state;
    if (session.holding) { session.wait(LIVE_MS); continue; }
    const p = session.pending;
    if (p?.late) { session.wait(1000); continue; }
    if (!p || !s.open) throw new Error('session waits with no open request');
    if (p.request.requestId === lastOpen) { if (++stuck > 3) { session.settle(); continue; } } else { stuck = 0; lastOpen = p.request.requestId; }
    if (s.step === 'prompt') { session.press(p.request.type === 'challenge' ? 'Digit1' : 'Enter'); continue; }
    if (s.step === 'fourth') { session.press(s.open.situation.toGoal <= 30 ? 'Digit3' : 'Digit2'); continue; }
    if (s.step !== 'select') { session.settle(); continue; }
    const box = s.cfg.sheets[s.open.unit]!.boxes.find((b) => b.id === s.focus.boxId);
    const count = box?.entries.length ?? 0;
    if (count === 0) { session.settle(); continue; }
    session.press(`Digit${(pick++ % Math.min(count, 9)) + 1}`);
    if (!session.driver.state.open) continue;
    session.press('Enter');
    session.settle();
  }
}

function firstKey(ruleSetId: string, skip: (built: seasons.BuiltSeason, id: number) => boolean = () => false): string {
  const built = seasons.buildSeason(CONTENT, ruleSetId, { season: 2026, seedHex: SEED });
  const team = built.spec.teams.find((t) => !skip(built, t.id));
  if (!team) throw new Error('no team');
  return team.key;
}

describe('season session', () => {
  it('pro: plays the seat game on the console, records it with the week, saves, restores and replays', () => {
    const play = SeasonPlay.start(CONTENT, { ruleSetId: 'pro_2026', seasonYear: 2026, seedHex: SEED, resolver: FAST, seatTeamKey: firstKey('pro_2026') });
    const firstWeek = play.state.week;
    const weekGames = play.built.spec.fixtures.filter((f) => f.week === firstWeek);
    const seatFixture = weekGames.find((f) => f.home === play.seatTeamId || f.away === play.seatTeamId);
    const seat = play.nextSeatGame();
    expect(seatFixture).toBeDefined();
    if (!seatFixture) return;
    expect(seat).not.toBeNull();
    expect(seat!.context.fixture.gameId).toBe(seatFixture.gameId);
    expect(seat!.side).toBe(seatFixture.home === play.seatTeamId ? 0 : 1);
    expect(seat!.context.seedHex).toBe(seasons.gameSeedHex(SEED, 2026, seatFixture.gameId));
    expect(play.state.games).toHaveLength(0); // the dry run leaves the season untouched

    expect(() => play.advance()).toThrow(/play the seat's game/);
    const session = play.openGame({ console: testConsoleConfig(), resolve, keyIntervalMs: KEY_MS, startMs: 0, liveMs: () => LIVE_MS });
    expect(() => play.openGame({ console: testConsoleConfig(), resolve })).toThrow(/already open/);
    playByKeys(session);
    expect(session.final).toBe(true);
    const userCalls = session.events.filter((e) => e.type === 'decision_made' && e.decision.side === seat!.side && e.decision.actor.kind === 'user');
    expect(userCalls.length).toBeGreaterThan(50);
    const outcome = play.finishGame();
    expect([...outcome.points]).toEqual([...session.game.score]);

    const state = play.state;
    expect(state.games).toHaveLength(weekGames.length);
    expect(state.week).toBe(firstWeek + 1);
    const recorded = state.games.find((g) => g.fixture.gameId === seatFixture.gameId)!;
    expect(recorded.outcome).toEqual(outcome);
    expect(play.seatResults()).toHaveLength(1);
    const line = play.summary().teams.find((t) => t.teamId === play.seatTeamId)!;
    const [us, them] = seat!.side === 0 ? outcome.points : [outcome.points[1], outcome.points[0]];
    expect([line.wins, line.losses, line.ties]).toEqual([us > them ? 1 : 0, us < them ? 1 : 0, us === them ? 1 : 0]);
    const today = play.today();
    expect(today.record).toEqual({ wins: line.wins, losses: line.losses, ties: line.ties });
    expect(today.seatTeamName).not.toBe(today.seatTeamKey);
    expect(today.week).toBe(firstWeek + 1);
    expect(today.standings).toHaveLength(play.built.spec.teams.length);
    expect(today.seasonOver).toBe(false);
    if (today.nextGame) { expect(today.weeksToGame).toBe(0); expect(today.nextGame.opponentName.length).toBeGreaterThan(0); } else expect(today.weeksToGame).toBeGreaterThan(0);
    // Every other game is the real game, exactly as the season runner plays it.
    const port = seasons.realGamePort({ ruleSetId: 'pro_2026', resolver: FAST });
    const other = state.games.find((g) => g.fixture.gameId !== seatFixture.gameId)!;
    expect(port.playGame({ season: 2026, ruleSetId: 'pro_2026', fixture: other.fixture, seedHex: other.seedHex, preparation: [null, null], seatSide: null })).toEqual(other.outcome);

    // Save is plain data; restore continues from it; replay from seed and seat outcomes reaches the same chain.
    const save = JSON.parse(JSON.stringify(play.save()));
    expect(save.seatOutcomes).toHaveLength(1);
    const restored = SeasonPlay.restore(CONTENT, save);
    expect(restored.state).toEqual(play.state);
    const replayed = SeasonPlay.replay(CONTENT, save);
    expect(replayed.state.chain).toBe(play.state.chain);
    expect(replayed.state.games.map((g) => g.outcome.points)).toEqual(play.state.games.map((g) => g.outcome.points));
    expect(() => SeasonPlay.replay(CONTENT, { ...save, state: { ...save.state, chain: 'x' } })).toThrow(/replay reached chain/);

    // Week 2: the staff plays the seat's game; the rest of the week follows.
    const next = play.nextSeatGame()!;
    expect(next).not.toBeNull();
    const before = play.state.games.length;
    const delegated = play.delegateGame();
    expect(delegated.plays).toBeGreaterThan(0);
    expect(play.state.games.length).toBe(before + play.built.spec.fixtures.filter((f) => f.week === next.context.fixture.week).length);
    expect(play.state.games.find((g) => g.fixture.gameId === next.context.fixture.gameId)!.outcome).toEqual(delegated);
    expect(play.save().seatOutcomes.map((x) => x.gameId)).toEqual([seatFixture.gameId, next.context.fixture.gameId]);
  }, 300_000);

  it('college: a bye in the opening week (week 0) plays without the seat, then the next game is up', () => {
    const probe = seasons.buildSeason(CONTENT, 'college_2026', { season: 2026, seedHex: SEED });
    const opening = Math.min(...probe.spec.fixtures.map((f) => f.week));
    const busy = new Set(probe.spec.fixtures.filter((f) => f.week === opening).flatMap((f) => [f.home, f.away]));
    const nextWeek = new Set(probe.spec.fixtures.filter((f) => f.week === opening + 1).flatMap((f) => [f.home, f.away]));
    const key = firstKey('college_2026', (_b, id) => busy.has(id) || !nextWeek.has(id));
    const play = SeasonPlay.start(CONTENT, { ruleSetId: 'college_2026', seasonYear: 2026, seedHex: SEED, resolver: FAST, seatTeamKey: key });
    expect(play.nextSeatGame()).toBeNull();
    expect(play.today().weeksToGame).toBe(1);
    expect(() => play.openGame({ console: testConsoleConfig(), resolve })).toThrow(/no game/);
    expect(() => play.delegateGame()).toThrow(/no game/);
    play.advanceToGame();
    expect(play.state.games).toHaveLength(probe.spec.fixtures.filter((f) => f.week === opening).length);
    const seat = play.nextSeatGame()!;
    expect(seat).not.toBeNull();
    expect(seat.context.fixture.week).toBe(opening + 1);
    expect(seat.opponentKey).toBe(play.keyOf(seat.opponentId));
    const today = play.today();
    expect(today.weeksToGame).toBe(0);
    expect(today.nextGame!.opponentName).toBe(play.nameOf(seat.opponentId));
  }, 300_000);

  it('maps a world team to its content key and starts from the world', () => {
    const clubs = CONTENT.proLeague as { league: { clubs: { id: string; city: string; nickname: string; abbreviation: string }[] } };
    const c = clubs.league.clubs[3]!;
    const world = { teams: [{ id: 41, identity: { name: `${c.city} ${c.nickname}`, abbreviation: c.abbreviation } }, { id: 42, identity: { name: 'Nowhere Nobodies', abbreviation: 'NOW' } }] };
    expect(contentKeyOfWorldTeam(CONTENT, world, 41)).toBe(c.id);
    expect(() => contentKeyOfWorldTeam(CONTENT, world, 42)).toThrow(/matches 0/);
    expect(() => contentKeyOfWorldTeam(CONTENT, world, 7)).toThrow(/not in the world/);
    const play = SeasonPlay.fromWorld(CONTENT, world, { ruleSetId: 'pro_2026', seasonYear: 2026, seedHex: SEED, seatTeamId: 41, resolver: FAST });
    expect(play.keyOf(play.seatTeamId)).toBe(c.id);
    expect(play.today().seatTeamName).toBe(`${c.city} ${c.nickname}`);
  });

  it('runs on the tick engine unless told otherwise', () => {
    const play = SeasonPlay.start(CONTENT, { ruleSetId: 'pro_2026', seasonYear: 2026, seedHex: SEED, seatTeamKey: firstKey('pro_2026') });
    expect(play.resolverId).toBe('tick');
  });

  it('refuses a seat team that is not in the competition', () => {
    expect(() => SeasonPlay.start(CONTENT, { ruleSetId: 'pro_2026', seasonYear: 2026, seedHex: SEED, resolver: FAST, seatTeamKey: 'no-such-team' })).toThrow(/not in the competition/);
  });
});
