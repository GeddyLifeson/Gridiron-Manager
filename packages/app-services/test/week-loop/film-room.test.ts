// The seat's film room (week-loop/film-room.ts, item 2d): a called game's plays go through the film filter into
// a G-63 FilmRoom; the film screens read the five read models on it and send film commands to it. A bare
// simulate keeps no drawn paths, so each play's path here is a stand-in record (format 0, which the scrub copies);
// the film room files only plays that have one. The app-root test files real drawn paths from a console game.
import { describe, it, expect } from 'vitest';
import { season as seasons } from '@gm/world';
import { field } from '@gm/engine-core';
import type { TrajectoryRecord } from '@gm/schema';
import { SeatFilmRoom } from '../../src/week-loop/film-room.ts';

const PATH: TrajectoryRecord = { formatVersion: 0, firstTick: 0, tickCount: 3, buffer: new Uint8Array([1, 2, 3]) };

describe('seat film room', () => {
  for (const ruleSetId of ['pro_2026', 'college_2026']) {
    it(`${ruleSetId}: files a called game's drawn plays, lists, tags and cuts them, and keeps truth out`, () => {
      const game = seasons.createRealGameCore(ruleSetId);
      const fixture = { gameId: 11, week: 1, phase: 'regular' as const, home: 3, away: 9, neutralSite: false, conferenceGame: false, dayIndex: null, kickoffMinute: null, postKey: null };
      const input = seasons.fixtureInput(game, fixture, '00ff00ff00ff00ff');
      const res = game.simulate(input);
      const geometry = field.fieldGeometry(game.rules);
      const room = new SeatFilmRoom(input.teams[0].teamId, '00ff00ff00ff00ff');
      // Every other play has a drawn path: only those are filed.
      const drawn = (n: number) => (n % 2 === 0 ? PATH : null);
      const n = room.file({ records: res.records, geometry, params: game.params, input, trajectory: drawn });
      expect(n).toBe(res.records.filter((r) => r.situation.playNumber % 2 === 0).length);
      expect(room.file({ records: res.records, geometry, params: game.params, input, trajectory: drawn })).toBe(0); // once per game
      expect(room.gameIds).toEqual([11]);

      const list = room.list('{}');
      expect(list.total).toBe(n);
      const id = list.rows[0]!.playId;
      const p = room.play(id);
      expect(p.record.trajectory.tickCount).toBe(3);
      expect(p.record.viewerSide).toBe(0);
      const text = JSON.stringify(p);
      expect(text).not.toMatch(/callValue|"truth"|"deltas"/);
      // The seat's own unit's coaching fields come from its calls; the other unit's are charted by the staff.
      const sources = Object.values(p.record.coaching.sources);
      expect(sources).toContain('call');
      expect(sources).toContain('staff');

      room.send('FilmTagPlay', { playId: id, tag: 'third_down_review' });
      expect(room.play(id).annotation.tags).toContain('third_down_review');
      expect(() => room.send('FilmTagPlay', { playId: 'nope', tag: 'x' })).toThrow(/no film of play/);
      expect(() => room.send('FilmTagPlay', null)).toThrow(/not an object/);
      expect(room.cutups().templates.length).toBeGreaterThan(0);
      expect(room.sheet(11, 1, 'decimal').sheet).toBeNull(); // no grader has graded the game yet
      expect(room.corrections(11).shown).toEqual([]);
    });
  }
});
