// The film archive (week-loop/film.ts): packed rows unpack to exactly what `chartGame` gives for either team
// (lengths to the hundredth of a yard), the varint codec round-trips, and the archive is small.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { season as seasons } from '@gm/world';
import { field } from '@gm/engine-core';
import { ep, tendencies } from '@gm/models';
import { decodeInts, encodeInts, FilmArchive, packFilm, unpackFilm } from '../../src/week-loop/film.ts';

const round = (x: number) => Math.round(x * 100) / 100;
const roundRow = (p: tendencies.ChartedPlay): tendencies.ChartedPlay => ({ ...p, distanceYd: round(p.distanceYd), yardsToGoalYd: round(p.yardsToGoalYd), yards: round(p.yards) });

describe('film archive', () => {
  it('varint codec round-trips any safe integers', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: -2_000_000_000, max: 2_000_000_000 }), { maxLength: 200 }), (xs) => {
      expect(decodeInts(encodeInts(xs))).toEqual(xs);
    }));
  });

  it('a packed game unpacks to chartGame rows for both teams, and is about 5 KB', () => {
    for (const ruleSetId of ['pro_2026', 'college_2026']) {
      const game = seasons.createRealGameCore(ruleSetId);
      const fixture = { gameId: 7, week: 1, phase: 'regular' as const, home: 3, away: 9, neutralSite: false, conferenceGame: false, dayIndex: null, kickoffMinute: null, postKey: null };
      const input = seasons.fixtureInput(game, fixture, '00ff00ff00ff00ff');
      const res = game.simulate(input);
      const geometry = field.fieldGeometry(game.rules);
      const d = ep.defaultDefinitions().success;
      if (d.kind !== 'coaching') throw new Error('expected the coaching definition');
      const success = { firstDownShare: d.firstDownShare, secondDownShare: d.secondDownShare, lateDownShare: d.lateDownShare };
      const packed = packFilm(res.records, { gameId: 7, season: 2026, week: 1, phase: 'regular', teams: [3, 9], geometry, success });
      for (const [side, teamId] of [[0, 3], [1, 9]] as const) {
        const truth = tendencies.chartGame(res.records, side, { teamIds: [3, 9], gameOrder: 4, season: 2026, geometry, success }).map(roundRow);
        expect(unpackFilm(packed, teamId, { gameOrder: 4 })).toEqual(truth);
      }
      expect(packed.stateHash).toBe(res.records[res.records.length - 1]!.stateHash);
      const bytes = JSON.stringify(packed).length;
      expect(bytes).toBeLessThan(8000);
      expect(bytes * 200).toBeLessThan(JSON.stringify(res.records).length);
      const archive = FilmArchive.load([packed]);
      expect(archive.teamRows(9).length).toBe(packed.snaps);
      expect(FilmArchive.load(JSON.parse(JSON.stringify(archive.save()))).save()).toEqual(archive.save());
    }
  });
});
