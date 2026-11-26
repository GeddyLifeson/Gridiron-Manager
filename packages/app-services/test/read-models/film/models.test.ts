import { describe, expect, it } from 'vitest';
import { ReadModelRegistry, buildReadModel, observerFor } from '../../../src/observer/index.ts';
import { fixtureWorld, USER } from '../../observer/fixture-world.ts';
import { FilmRoom, filmReadModels, filmRecord, standardReel, breakdown, staffResponsibility, staffGradeSheet, buildCorrections, recordFromWire, toBase64, fromBase64 } from '../../../src/read-models/film/index.ts';
import { applyFilmCommand as apply, FILM_COMMAND_TABLE, FilmCommandError } from '../../../src/commands/film/index.ts';
import { FILM_COMMAND_SPECS, FILM_MODEL_SCHEMAS } from './schemas.ts';
const applyFilmCommand = (room: FilmRoom, type: string, raw: unknown) => apply(room, FILM_COMMAND_SPECS, type, raw);
import { makeSource, HOME, SEED, person } from './fixtures.ts';

function room() {
  const r = new FilmRoom(HOME);
  for (let p = 1; p <= 30; p++) r.library.add(filmRecord(makeSource({ playNumber: p, down: 3, distance: 8 }), { viewerTeamId: HOME, seed: SEED, charter: { personId: 4, accuracy: 0.9 }, charted: true }));
  return r;
}

describe('film read models', () => {
  it('register (no truth field) and build', () => {
    const rm = room();
    const reg = new ReadModelRegistry();
    for (const s of filmReadModels(rm, FILM_MODEL_SCHEMAS)) reg.register(s);
    expect(reg.names()).toEqual(['filmCorrections', 'filmCutUps', 'filmGradeSheet', 'filmPlay', 'filmPlayList']);
    const world = fixtureWorld();
    const user = observerFor(world, USER);
    const b = <D>(name: string, params: Record<string, string | number>) => buildReadModel<D>(reg, world, user, name, params, { validate: true });
    const play = b<any>('filmPlay', { playId: '7:3' });
    expect(play.model.data.record.playId).toBe('7:3');
    const back = recordFromWire(play.model.data.record);
    expect(Array.from(back.trajectory.buffer)).toEqual(Array.from(rm.library.get('7:3')!.trajectory.buffer));
    const list = b<any>('filmPlayList', { filter: JSON.stringify({ downs: [3] }) });
    expect(list.model.data.total).toBe(30);
    rm.putSheet(staffGradeSheet([makeSource({ playNumber: 3 })], person(0), { personId: 2, accuracy: 1, favourites: [], favouriteLean: 0 }, { seed: SEED, gameId: 7 }));
    const sheet = b<any>('filmGradeSheet', { gameId: 7, personId: person(0), scale: 'letter' });
    expect(sheet.model.data.display).toMatch(/^[A-F]$/);
    expect(standardReel(rm, 'third_long', HOME).playIds.length).toBe(30);
  });

  it('breakdown on own film: staff word on the call, visible luck, no call on other film', () => {
    const src = makeSource({ callValue: 0.5, contests: [{ winner: 0, loser: 11 }] });
    const b = breakdown(src, HOME, { personId: 2, accuracy: 1, favourites: [], favouriteLean: 0 }, SEED);
    expect(b.call).toBe('good');
    expect(b.execution).toEqual([{ personId: person(0), won: true }]);
    expect(breakdown(src, 99, { personId: 2, accuracy: 1, favourites: [], favouriteLean: 0 }, SEED).call).toBeNull();
  });

  it('responsibility: staff line right with accuracy, favourites shielded', () => {
    let right = 0, shielded = 0;
    for (let n = 1; n <= 200; n++) {
      const src = makeSource({ playNumber: n, mentalError: { slot: 3, cause: 'communication' } });
      const r = staffResponsibility(src, HOME, { personId: 2, accuracy: 0.8, favourites: [], favouriteLean: 0 }, SEED)!;
      if (r.personId === person(3) && r.cause === 'communication') right++;
      const f = staffResponsibility(src, HOME, { personId: 2, accuracy: 0.8, favourites: [person(3)], favouriteLean: 1 }, SEED)!;
      if (f.personId !== person(3)) shielded++;
    }
    expect(right).toBeGreaterThan(140); expect(right).toBeLessThan(180);
    expect(shielded).toBeGreaterThan(20);
    // Accuracy is held inside the 70% to 95% band of N1.3.2.
    const src = makeSource({ mentalError: { slot: 3, cause: 'knowledge' } });
    expect(staffResponsibility(src, HOME, { personId: 2, accuracy: 0, favourites: [], favouriteLean: 0 }, SEED)).not.toBeNull();
  });
});

describe('wire form', () => {
  it('base64 round-trips every length', () => {
    for (let n = 0; n < 10; n++) { const b = Uint8Array.from({ length: n }, (_, i) => (i * 97 + 13) % 256); expect(Array.from(fromBase64(toBase64(b)))).toEqual(Array.from(b)); }
    expect(toBase64(Uint8Array.from([77, 97, 110]))).toBe('TWFu');
  });
});

describe('film commands', () => {
  it('every command validates and applies; errors are named', () => {
    const rm = room();
    expect(FILM_COMMAND_TABLE.every((c) => c.allowedInCertified)).toBe(true);
    applyFilmCommand(rm, 'FilmTagPlay', { playId: '7:1', tag: 'Alignment' });
    expect(rm.library.annotation('7:1').causeTags).toEqual(['alignment']);
    applyFilmCommand(rm, 'FilmSetNote', { playId: '7:1', note: 'Mike widened' });
    applyFilmCommand(rm, 'FilmDraw', { playId: '7:1', shape: 'line', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
    applyFilmCommand(rm, 'FilmEraseDrawing', { playId: '7:1', index: 0 });
    applyFilmCommand(rm, 'FilmChartPlay', { playId: '7:1', field: 'front', value: 'odd' });
    applyFilmCommand(rm, 'FilmSaveCutUp', { id: 'teach', title: 'Smash vs 3', playIds: ['7:1', '7:2'], notes: { '7:1': 'look at the corner' } });
    applyFilmCommand(rm, 'FilmSendCutUp', { id: 'teach', kind: 'room', to: 'wr' });
    expect(rm.cutups.get('teach')!.audience).toEqual({ kind: 'room', id: 'wr' });
    const first = applyFilmCommand(rm, 'FilmGradeSnap', { gameId: 7, personId: person(7), playId: '7:1', assignment: 'right', technique: 'plus', lostContest: false, loaf: false, note: '' });
    const second = applyFilmCommand(rm, 'FilmGradeSnap', { gameId: 7, personId: person(7), playId: '7:2', assignment: 'wrong', technique: 'zero', lostContest: false, loaf: false, note: '' });
    expect([first.userHours, second.userHours]).toEqual([1, 0]);
    expect(rm.sheet(7, person(7))!.assignmentShare).toBe(0.5);
    applyFilmCommand(rm, 'FilmAssignBust', { playId: '7:2', personId: person(7), cause: 'mental' });
    rm.corrections.set(7, buildCorrections([{ line: rm.responsibility.get('7:2')!, unit: 'offense', concept: 'smash', epa: -1 }]));
    applyFilmCommand(rm, 'FilmSetCorrection', { gameId: 7, correctionId: rm.corrections.get(7)![0]!.id, state: 'accepted' });
    applyFilmCommand(rm, 'FilmSetGradePolicy', { room: 'wr', policy: 'posted', forms: ['loaf_board'] });
    let hours = 0;
    for (let p = 1; p <= 30; p++) hours += applyFilmCommand(rm, 'FilmWatchPlay', { week: 1, playId: `7:${p}` }).userHours ?? 0;
    expect(hours).toBe(0);
    expect(() => applyFilmCommand(rm, 'FilmTagPlay', { playId: '7:99', tag: 'x' })).toThrow(FilmCommandError);
    expect(() => applyFilmCommand(rm, 'FilmChartPlay', { playId: '7:1', field: 'protection', value: 'max' })).toThrow(/own call/);
    expect(() => applyFilmCommand(rm, 'FilmTagPlay', { playId: 'bad', tag: 'x' })).toThrow(FilmCommandError);
  });
});
