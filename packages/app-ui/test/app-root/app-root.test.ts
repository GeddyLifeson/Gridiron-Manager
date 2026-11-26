// Career composition root (handoff item D): Today from the season, the season panel, and the season session
// adapter on both levels (advance to game day, a delegated game lands in the record and the standings).
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { gameCalling, play } from '@gm/app-services';
import type { GameSession } from '../../src/app-root/index.ts';
import { careerPortFromSeason, epochDayOfNewYear, homeFromSeason, rootTextIds, SeasonPanel, WeekProgressLine, type SeasonToday } from '../../src/app-root/index.ts';
import { resolverFor } from '../../src/app-root/ConsoleHost.tsx';
import { DEFAULT_KEYMAP } from '../../src/shell/keymap.ts';
import TEXT from '../../src/app-root/text.json';

const ROOT = resolvePath(import.meta.dirname, '../../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (...p: string[]): any => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
const CONTENT = {
  proLeague: read('packages', 'football-content', 'data', 'world', 'pro-league.json'),
  college: read('packages', 'football-content', 'data', 'world', 'college.json'),
  proLeagueRules: read('packages', 'rules-data', 'data', 'league', 'proleague_2026.json'),
  collegeLeagueRules: read('packages', 'rules-data', 'data', 'league', 'collegeleague_2026.json'),
};

const base: SeasonToday = {
  teamName: 'Harbor City Gulls', level: 'pro', seasonYear: 2026, dayIndex: 0, stageLabel: 'Week 1',
  record: { w: 0, l: 0, t: 0 }, nextGame: { opponentId: 7, opponent: 'Lake Port Owls', home: true, daysToGame: 7 },
  lastResult: null, standings: [{ teamId: 1, name: 'Harbor City Gulls', w: 0, l: 0, t: 0, pf: 0, pa: 0, seat: true }], seasonOver: false, champion: null,
};

describe('Today from the season', () => {
  it('a week out: the next game and one advance target to game day', () => {
    const h = homeFromSeason(base);
    expect(h.today.mode).toBe('empty');
    expect(h.today.daysToGame).toBe(7);
    expect(h.today.opponent?.name).toBe('Lake Port Owls');
    expect(h.advance.map((a) => a.target)).toEqual(['game_day']);
    expect(h.advance[0]!.to?.date.dayIndex).toBe(7);
  });
  it('on game day the mode is game_day and there is nothing to advance to', () => {
    const h = homeFromSeason({ ...base, nextGame: { ...base.nextGame!, daysToGame: 0 } });
    expect(h.today.mode).toBe('game_day');
    expect(h.advance).toEqual([]);
  });
  it('the season panel shows the record, the table with the seat marked, and every text id exists', () => {
    const html = renderToStaticMarkup(createElement(SeasonPanel, { today: { ...base, record: { w: 2, l: 1, t: 0 }, lastResult: 'Win 24-17 vs Lake Port Owls' }, canDelegate: true, onDelegate: () => undefined }));
    expect(html).toContain('Record 2-1');
    expect(html).toContain('data-seat="true"');
    expect(html).toContain('Win 24-17');
    for (const id of rootTextIds()) expect((TEXT as Record<string, string>)[id]).toBeTruthy();
  });
});

describe('season session adapter', () => {
  it('fixture days (from 1970-01-01) become days of the season year', () => {
    // Cross-checks: the platform calendar outside the core, and two hand-counted anchors (1970 is day 0; 1972 is a leap year).
    for (const y of [1970, 1971, 1973, 2000, 2026, 2100]) expect(epochDayOfNewYear(y)).toBe(Date.UTC(y, 0, 1) / 86_400_000);
    expect(epochDayOfNewYear(1970)).toBe(0);
    expect(epochDayOfNewYear(1973)).toBe(365 * 3 + 1);
  });

  const resolve = resolverFor(DEFAULT_KEYMAP.bindings);
  for (const [level, ruleSetId, key] of [['pro', 'pro_2026', null], ['college', 'college_2026', null]] as const) {
    it(`${level}: advance to game day, the staff coaches it, the result reaches the record and the table`, () => {
      const teams = level === 'pro' ? CONTENT.proLeague.league.clubs : CONTENT.college.schools;
      const seatTeamKey: string = key ?? teams[0].id;
      const sp = play.SeasonPlay.start(CONTENT as never, { ruleSetId, seasonYear: 2026, seedHex: '0f1e2d3c4b5a6978', seatTeamKey });
      const port = careerPortFromSeason(sp, { level, seasonYear: 2026, resolve, consoleConfig: () => { throw new Error('no console in this test'); } });
      const t0 = port.today();
      expect(t0.record).toEqual({ w: 0, l: 0, t: 0 });
      expect(t0.standings.some((r) => r.seat)).toBe(true);
      expect(t0.nextGame).not.toBeNull();
      expect(t0.nextGame!.daysToGame).toBeGreaterThan(0);
      expect(t0.dayIndex).toBeGreaterThan(150); // the season opens in late summer, not on day 20,000
      expect(t0.dayIndex).toBeLessThan(366);
      port.advanceToGameDay();
      expect(port.today().nextGame!.daysToGame).toBe(0);
      port.delegateGame();
      const t1 = port.today();
      expect(t1.record.w + t1.record.l + t1.record.t).toBe(1);
      expect(t1.lastResult).toMatch(/\d+-\d+ (vs|at) /);
      const seat = t1.standings.find((r) => r.seat)!;
      expect(seat.pf + seat.pa).toBeGreaterThan(0);
      expect(t1.nextGame === null || t1.nextGame.daysToGame > 0).toBe(true);
    }, 120_000);
  }
});

const LIVE_MS = 6000; // virtual time from a committed call to the next dead ball: a named test assumption

/** Plays the open game to the final whistle by keys (the season session test's loop): default prompts, a cycling pick. */
function playByKeys(session: GameSession): number {
  let pick = 0, lastOpen = -1, stuck = 0, keys = 0;
  for (let guard = 0; guard < 20000 && !session.final; guard++) {
    const s = session.driver.state;
    if (session.holding) { session.wait(LIVE_MS); continue; }
    const p = session.pending;
    if (p?.late) { session.wait(1000); continue; }
    if (!p || !s.open) throw new Error('session waits with no open request');
    if (p.request.requestId === lastOpen) { if (++stuck > 3) { session.settle(); continue; } } else { stuck = 0; lastOpen = p.request.requestId; }
    if (s.step === 'prompt') { session.press(p.request.type === 'challenge' ? 'Digit1' : 'Enter'); keys++; continue; }
    if (s.step === 'fourth') { session.press(s.open.situation.toGoal <= 30 ? 'Digit3' : 'Digit2'); keys++; continue; }
    if (s.step !== 'select') { session.settle(); continue; }
    const box = s.cfg.sheets[s.open.unit]!.boxes.find((b) => b.id === s.focus.boxId);
    const count = box?.entries.length ?? 0;
    if (count === 0) { session.settle(); continue; }
    session.press(`Digit${(pick++ % Math.min(count, 9)) + 1}`); keys++;
    if (!session.driver.state.open) continue;
    session.press('Enter'); keys++;
    session.settle();
  }
  return keys;
}

describe('a game on the staff sheets through the career port', () => {
  const resolve = resolverFor(DEFAULT_KEYMAP.bindings);
  for (const [level, ruleSetId] of [['pro', 'pro_2026'], ['college', 'college_2026']] as const) {
    it(`${level}: game day opens the console, keys play it to the final, the score lands in the record`, () => {
      const teams = level === 'pro' ? CONTENT.proLeague.league.clubs : CONTENT.college.schools;
      const sp = play.SeasonPlay.start(CONTENT as never, { ruleSetId, seasonYear: 2026, seedHex: '5b4a39281706f5e4', seatTeamKey: teams[1].id });
      const port = careerPortFromSeason(sp, { level, seasonYear: 2026, resolve, consoleConfig: (gameId) => gameCalling.staffConsoleConfig(ruleSetId, gameId, DEFAULT_KEYMAP.bindings) });
      port.advanceToGameDay();
      const session = port.startGame();
      const v = gameCalling.consoleViewOfSession(session, { keyFor: () => null });
      expect(v.prompt).not.toBeNull(); // the toss
      expect(playByKeys(session)).toBeGreaterThan(100);
      expect(session.final).toBe(true);
      const s = session.situation();
      const me = session.userSide;
      port.finishGame(session);
      const t = port.today();
      const mine = s.score[me], theirs = s.score[me === 0 ? 1 : 0];
      expect(t.record).toEqual({ w: mine > theirs ? 1 : 0, l: mine < theirs ? 1 : 0, t: mine === theirs ? 1 : 0 });
      expect(t.lastResult).toContain(`${mine}-${theirs}`);
      const row = t.standings.find((r) => r.seat)!;
      expect([row.pf, row.pa]).toEqual([mine, theirs]);
      expect(gameCalling.sessionPlayLog(session, port.names(session), 5)).toHaveLength(5);
    }, 300_000);
  }
});

describe('the seat week through the career port (H1.1.3)', () => {
  const resolve = resolverFor(DEFAULT_KEYMAP.bindings);
  it('pro: Today steps the week by block and by day, game day plays on the week\'s sheets, the season keeps the week', () => {
    const sp = play.SeasonPlay.start(CONTENT as never, { ruleSetId: 'pro_2026', seasonYear: 2026, seedHex: '5b4a39281706f5e4', seatTeamKey: CONTENT.proLeague.league.clubs[2].id });
    const port = careerPortFromSeason(sp, { level: 'pro', seasonYear: 2026, resolve, bindings: DEFAULT_KEYMAP.bindings, consoleConfig: () => { throw new Error('the week supplies the console'); } });
    expect(port.week!()).toBeNull();
    port.advance!('next_block');
    const w0 = port.week!()!;
    expect(w0.blocks.length).toBeGreaterThan(0);
    expect(w0.blocks.some((b) => b.done)).toBe(true);
    expect(w0.minutesLeftThisWeek).toBeGreaterThan(0);
    const home0 = homeFromSeason(port.today(), 0, w0);
    expect(home0.today.mode).toBe('normal');
    expect(home0.advance.map((a) => a.target)).toEqual(['next_block', 'end_of_day', 'game_day']);
    const d0 = port.today().nextGame!.daysToGame;
    port.advance!('end_of_day');
    port.advance!('end_of_day');
    expect(port.today().nextGame!.daysToGame).toBeLessThan(d0);
    port.advance!('game_day');
    expect(port.today().nextGame!.daysToGame).toBe(0);
    const session = port.startGame();
    expect(playByKeys(session)).toBeGreaterThan(100);
    const week = sp.stepWeek();
    port.finishGame(session);
    const rec = sp.state.seat.find((s) => s.week === week)!;
    expect(rec.reachedGameDay).toBe(true);
    expect(rec.blocksRun).toBeGreaterThan(10);
    expect(port.week!()).toBeNull();
    expect(port.today().record.w + port.today().record.l + port.today().record.t).toBe(1);
  }, 300_000);
});

describe('the week\'s other games in a pool (unbuilt-work item 15)', () => {
  it('pro: a pooled port answers with promises, reports progress and lands the same season as the in-place port', async () => {
    const resolve = resolverFor(DEFAULT_KEYMAP.bindings);
    const key = CONTENT.proLeague.league.clubs[2].id;
    const make = (pool?: play.WeekPool) => {
      const sp = play.SeasonPlay.start(CONTENT as never, { ruleSetId: 'pro_2026', seasonYear: 2026, seedHex: '5b4a39281706f5e4', seatTeamKey: key });
      return { sp, port: careerPortFromSeason(sp, { level: 'pro', seasonYear: 2026, resolve, consoleConfig: (g) => gameCalling.staffConsoleConfig('pro_2026', g, DEFAULT_KEYMAP.bindings), ...(pool ? { pool } : {}) }) };
    };
    const here = make();
    expect(here.port.delegateGame()).toBeUndefined();

    const pooled = make(play.inlinePool());
    const seen: { done: number; total: number }[] = [];
    const r = pooled.port.delegateGame((p) => seen.push(p));
    expect(r).toBeInstanceOf(Promise);
    await r;
    expect(pooled.sp.state.chain).toBe(here.sp.state.chain);
    expect(pooled.port.today()).toEqual(here.port.today());
    const last = seen[seen.length - 1]!;
    expect(last.done).toBe(last.total);
    expect(last.total).toBe(here.sp.state.games.length);
  }, 300_000);

  it('pro: a game finished on the console, then the rest of the week in a pool, lands the same season as in place', async () => {
    const resolve = resolverFor(DEFAULT_KEYMAP.bindings);
    const key = CONTENT.proLeague.league.clubs[3].id;
    const make = (pool?: play.WeekPool) => {
      const sp = play.SeasonPlay.start(CONTENT as never, { ruleSetId: 'pro_2026', seasonYear: 2026, seedHex: '5b4a39281706f5e4', seatTeamKey: key });
      return { sp, port: careerPortFromSeason(sp, { level: 'pro', seasonYear: 2026, resolve, consoleConfig: (g) => gameCalling.staffConsoleConfig('pro_2026', g, DEFAULT_KEYMAP.bindings), ...(pool ? { pool } : {}) }) };
    };
    const here = make();
    here.port.advanceToGameDay();
    const s1 = here.port.startGame();
    playByKeys(s1);
    expect(here.port.finishGame(s1)).toBeUndefined();

    const pooled = make(play.inlinePool());
    await pooled.port.advanceToGameDay();
    const s2 = pooled.port.startGame();
    playByKeys(s2);
    expect(s2.situation().score).toEqual(s1.situation().score);
    const seen: { done: number; total: number }[] = [];
    const r = pooled.port.finishGame(s2, (p) => seen.push(p));
    expect(r).toBeInstanceOf(Promise);
    await r;
    expect(pooled.sp.state.chain).toBe(here.sp.state.chain);
    expect(pooled.port.today()).toEqual(here.port.today());
    expect(JSON.stringify(pooled.sp.film.save())).toBe(JSON.stringify(here.sp.film.save()));
    // The pool played every game of the week but the seat's own.
    expect(seen[seen.length - 1]).toEqual({ done: here.sp.state.games.length - 1, total: here.sp.state.games.length - 1 });
    // The console is closed: game day is over and the next game is a week out.
    expect(pooled.port.today().nextGame?.daysToGame).toBeGreaterThan(0);
    expect(pooled.port.liveField(s2)).toBeNull();
  }, 600_000);

  it('college: the first week control plays the bye weeks in the pool, then opens the seat week as in place', async () => {
    const resolve = resolverFor(DEFAULT_KEYMAP.bindings);
    const built = play.SeasonPlay.start(CONTENT as never, { ruleSetId: 'college_2026', seasonYear: 2026, seedHex: '5b4a39281706f5e4', seatTeamKey: CONTENT.college.schools[0].id }).built;
    const first = Math.min(...built.spec.fixtures.map((x) => x.week));
    const seat = built.spec.teams.find((t) => !built.spec.fixtures.some((x) => x.week === first && (x.home === t.id || x.away === t.id)))!;
    const make = (pool?: play.WeekPool) => {
      const sp = play.SeasonPlay.start(CONTENT as never, { ruleSetId: 'college_2026', seasonYear: 2026, seedHex: '5b4a39281706f5e4', seatTeamKey: seat.key });
      return { sp, port: careerPortFromSeason(sp, { level: 'college', seasonYear: 2026, resolve, bindings: DEFAULT_KEYMAP.bindings, consoleConfig: () => { throw new Error('the week supplies the console'); }, ...(pool ? { pool } : {}) }) };
    };
    const here = make();
    expect(here.port.advance!('next_block')).toBeUndefined();
    const pooled = make(play.inlinePool());
    const seen: { done: number; total: number }[] = [];
    const r = pooled.port.advance!('next_block', (p) => seen.push(p));
    expect(r).toBeInstanceOf(Promise);
    await r;
    expect(seen.some((p) => p.total > 0 && p.done === p.total)).toBe(true);
    expect(pooled.sp.state.chain).toBe(here.sp.state.chain);
    expect(pooled.port.week!()).toEqual(here.port.week!());
    // Once the seat week is open, the next control is in place again (no games until game day).
    expect(pooled.port.advance!('end_of_day')).toBeUndefined();
  }, 300_000);

  it('the progress line reads games done of the batch', () => {
    const html = renderToStaticMarkup(createElement(WeekProgressLine, { progress: { done: 5, total: 15 } }));
    expect(html).toContain('5 of 15');
    expect(html).toContain('data-week-progress');
    // Before the pool has counted the batch: no "0 of 0".
    expect(renderToStaticMarkup(createElement(WeekProgressLine, { progress: { done: 0, total: 0 } }))).not.toContain('0 of 0');
  });
});
