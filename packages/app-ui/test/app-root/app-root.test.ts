// Career composition root (handoff item D): Today from the season, the season panel, and the season session
// adapter on both levels (advance to game day, a delegated game lands in the record and the standings).
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { gameCalling, play } from '@gm/app-services';
import type { GameSession } from '../../src/app-root/index.ts';
import { careerPortFromSeason, epochDayOfNewYear, homeFromSeason, rootTextIds, SeasonPanel, type SeasonToday } from '../../src/app-root/index.ts';
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
    if (session.watching) { session.wait(LIVE_MS); session.resumeWatch(); continue; }
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
      // The head coach says before the game that he calls every unit himself (coordinators call by default, Marlon 19:15).
      for (const u of ['offense', 'defense', 'special_teams'] as const) session.takeOver(u);
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
