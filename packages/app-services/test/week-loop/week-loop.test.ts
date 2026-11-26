// The seat's week loop (H1.1.3) on a real season: the week runs block by block to game day, its work comes out
// as reports (self-scout, opponent study, staff sheets, install), the season takes the week's record, and the
// film archive holds every game so the next opponent's study reads its film. Same seed, same week.
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { describe, it, expect } from 'vitest';
import { season as seasons } from '@gm/world';
import { field } from '@gm/engine-core';
import { ep } from '@gm/models';
import { SeasonPlay } from '../../src/play/index.ts';
import { SeatWeekLoop, averageStaff, packFilm } from '../../src/week-loop/index.ts';

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
const BINDINGS: { context: string; keys: string[] }[] = [];

function proSeason(): SeasonPlay {
  const built = seasons.buildSeason(CONTENT, 'pro_2026', { season: 2026, seedHex: SEED });
  return SeasonPlay.start(CONTENT, { ruleSetId: 'pro_2026', seasonYear: 2026, seedHex: SEED, seatTeamKey: built.spec.teams[0]!.key });
}

/** Runs the week by "next decision", answering every required item with its default, then closes it. */
function runWeek(sp: SeasonPlay, loop: SeatWeekLoop): void {
  for (let i = 0; i < 200; i++) {
    const r = loop.step('decision');
    if (r.stop === 'game_day') break;
    if (r.stop === 'decision') loop.choose(r.item!.id, r.item!.defaultChoice);
    else throw new Error(`week stopped at ${r.stop}`);
  }
  loop.finish();
  sp.delegateGame();
}

/** Plays steps until the seat's next game is up, running each seat week on the way. */
function toNextSeatWeek(sp: SeasonPlay): SeatWeekLoop {
  sp.advanceToGame();
  const loop = SeatWeekLoop.open(sp);
  if (!loop) throw new Error('no seat game');
  return loop;
}

describe('seat week loop', () => {
  it('runs week 1 to game day: reports, staff sheets, install map, and the season keeps the record', () => {
    const sp = proSeason();
    const loop = toNextSeatWeek(sp);
    expect(loop.week.days.length).toBeGreaterThan(1);
    // Block by block to game day: every block before the game resolves once, in order, and the clock stops before the game.
    let guard = 0;
    while (!loop.atGameDay && guard++ < 500) {
      const r = loop.step('block');
      if (r.stop === 'decision') loop.choose(r.item!.id, r.item!.defaultChoice);
    }
    expect(loop.atGameDay).toBe(true);
    // Every block before the kickoff ran once, in start order; post-game blocks belong to the game (area I).
    const all = loop.week.days.flatMap((d) => d.blocks);
    const kick = all.find((b) => b.type === 'game')!.start;
    const at = (x: { day: number; minute: number }) => x.day * 1440 + x.minute;
    const blocks = all.filter((b) => b.type !== 'game' && at(b.start) < at(kick)).sort((a, b) => at(a.start) - at(b.start) || (a.id < b.id ? -1 : 1));
    expect(new Set(loop.reports.map((r) => r.blockId))).toEqual(new Set(blocks.map((b) => b.id)));
    expect(loop.reports.length).toBe(blocks.length);
    const order = loop.reports.map((r) => at(all.find((b) => b.id === r.blockId)!.start));
    expect(order).toEqual([...order].sort((x, y) => x - y));
    const kinds = new Set(loop.reports.map((r) => r.kind));
    for (const k of ['self_scout', 'scouting', 'sheets', 'practice', 'meeting']) expect(kinds.has(k as never)).toBe(true);
    // H2.1.1 rule 5: week 1 has no film of this season.
    expect(loop.study!.noFilmThisSeason).toBe(true);
    expect(loop.study!.report.gamesCharted).toEqual([]);
    expect(loop.selfScout!.plays).toEqual([]);
    // The staff drafted both sheets; the install map counts their boxes with exposures from the week's blocks.
    const sheets = loop.sheets();
    expect(sheets.offense.boxes.length).toBeGreaterThan(0);
    const install = loop.install();
    expect(install.items.length).toBeGreaterThan(0);
    expect(install.availableReps).toBeGreaterThan(0);
    expect(install.items.every((i) => i.practiceReps >= 1 && i.meeting === true)).toBe(true);
    // A user's own sheet replaces the staff's draft on the console.
    loop.setSheet('defense', { ...sheets.defense, gameId: 'mine' });
    expect(loop.sheets().defense.gameId).toBe('mine');
    expect(loop.consoleConfig(BINDINGS).sheets.offense?.boxes.length ?? 0).toBeGreaterThan(0);
    const rec = loop.finish();
    expect(rec.reachedGameDay).toBe(true);
    expect(rec.blocksRun).toBe(blocks.length);
    expect(rec.decisions.length).toBeGreaterThan(0);
    const week = sp.stepWeek();
    sp.delegateGame();
    const kept = sp.state.seat.find((s) => s.week === week);
    expect(kept).toEqual(rec);
    expect((kept!.preparation as { drafted: string[] }).drafted).toEqual(['offense']);
  });

  it('films every game; week 2 studies the opponent from the archive, and the film rebuilds exactly', () => {
    const sp = proSeason();
    runWeek(sp, toNextSeatWeek(sp));
    // Every game of the step is in the archive.
    expect(sp.film.size).toBe(sp.state.games.length);
    const loop = toNextSeatWeek(sp);
    loop.toGameDay();
    const study = loop.study!;
    const oppGames = sp.state.games.filter((g) => g.fixture.home === loop.game.opponentId || g.fixture.away === loop.game.opponentId);
    expect(study.gamesAvailable).toEqual(oppGames.map((g) => g.fixture.gameId));
    expect(study.report.gamesCharted.length).toBeGreaterThan(0);
    expect(study.report.plays.every((p) => p.teamId === loop.game.opponentId && p.source === 'charted')).toBe(true);
    expect(study.report.plays.length).toBe(sp.film.teamRows(loop.game.opponentId).length);
    // Self-scout reads the seat's own week 1 film.
    expect(loop.selfScout!.games.length).toBe(1);
    expect(loop.selfScout!.plays.every((p) => p.teamId === sp.seatTeamId)).toBe(true);
    // A non-seat game's full film, rebuilt from its context, packs to the archived rows.
    const other = sp.state.games.find((g) => g.fixture.home !== sp.seatTeamId && g.fixture.away !== sp.seatTeamId)!;
    const film = sp.rebuildFilm(other.fixture.gameId);
    const archived = sp.film.get(other.fixture.gameId)!;
    const d = ep.defaultDefinitions().success;
    if (d.kind !== 'coaching') throw new Error('expected the coaching definition');
    const repacked = packFilm(film.records, {
      gameId: archived.gameId, season: archived.season, week: archived.week, phase: archived.phase, teams: archived.teams,
      geometry: field.fieldGeometry(seasons.createRealGameCore('pro_2026').rules),
      success: { firstDownShare: d.firstDownShare, secondDownShare: d.secondDownShare, lateDownShare: d.lateDownShare },
    });
    expect(repacked).toEqual(archived);
    expect(() => sp.rebuildFilm(sp.seatResults()[0]!.fixture.gameId)).toThrow(/called by the seat/);
  });

  it('the same seed gives the same week; save and restore keep the archive; replay refilms the season', () => {
    const a = proSeason(), b = proSeason();
    for (const sp of [a, b]) { runWeek(sp, toNextSeatWeek(sp)); }
    const la = toNextSeatWeek(a), lb = toNextSeatWeek(b);
    la.toGameDay(); lb.toGameDay();
    expect(la.study!.report).toEqual(lb.study!.report);
    expect(la.reports).toEqual(lb.reports);
    const save = JSON.parse(JSON.stringify(a.save()));
    const restored = SeasonPlay.restore(CONTENT, save);
    expect(restored.film.save()).toEqual(a.film.save());
    const replayed = SeasonPlay.replay(CONTENT, save);
    expect(replayed.film.save()).toEqual(a.film.save());
    // Older saves carry no film: they restore with an empty archive.
    const { film: _drop, ...old } = save;
    expect(SeasonPlay.restore(CONTENT, old).film.size).toBe(0);
  });

  it('a short-handed staff finishes fewer breakdowns: the report is partial and reads finished jobs only (H2.1.1)', () => {
    const sp = proSeason();
    runWeek(sp, toNextSeatWeek(sp));
    sp.advanceToGame();
    const staff = { ...averageStaff(), qc: [{ staffId: 1, speed: 1, hoursAvailable: 6 }] };
    const loop = SeatWeekLoop.open(sp, { staff })!;
    loop.toGameDay();
    const study = loop.study!;
    // One 6-hour job fits: one side of one game.
    expect(study.partial || study.report.plays.every((p) => p.side === study.report.plays[0]!.side)).toBe(true);
    expect(new Set(study.report.plays.map((p) => `${p.gameId}|${p.side}`)).size).toBe(1);
  });

  it('guards: no game before the week, no finish before game day, the week record goes to its own step', () => {
    const sp = proSeason();
    const loop = toNextSeatWeek(sp);
    expect(() => loop.finish()).toThrow(/game day/);
    loop.toGameDay();
    loop.finish();
    expect(() => loop.step('block')).toThrow(/finished/);
  });
});
