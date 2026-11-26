import { describe, expect, it } from 'vitest';
import { FilmLibrary, filmRecord, STANDARD_REELS, reelFromTemplate, buildCutUp, breakdownWindow, addTag, setNote, addDrawing, removeDrawing, emptyAnnotation, scrubTrajectory, reelConcepts } from '../../../src/read-models/film/index.ts';
import { makeSource, HOME, AWAY, SEED } from './fixtures.ts';

const charter = { personId: 77, accuracy: 1 };
function lib(n = 40, charted = true) {
  const l = new FilmLibrary(HOME);
  for (let g = 1; g <= 2; g++) for (let p = 1; p <= n / 2; p++) {
    const down = (p % 3) + 1;
    const src = makeSource({ gameId: g, playNumber: p, down, distance: p % 10, ballOn: p * 4, coverageId: p % 2 ? 'cover3' : 'cover2', formationId: p % 4 ? 'trips_right' : 'empty', offense: p % 5 === 0 ? 1 : 0, period: 4, clockTenths: p * 100 });
    l.add(filmRecord(src, { viewerTeamId: HOME, seed: SEED, charter, charted }), g);
  }
  return l;
}

describe('play database and filters (N1.2.1)', () => {
  it('own team, concept X against coverage Y returns exactly the matching plays', () => {
    const l = lib();
    const got = l.query({ offenseTeamId: HOME, coaching: { concept: ['smash'], coverage: ['cover2'] } });
    const want = l.all().filter((r) => r.teams[r.situation.offenseSide] === HOME && r.coaching.values.concept === 'smash' && r.coaching.values.coverage === 'cover2');
    expect(got.map((r) => r.playId).sort()).toEqual(want.map((r) => r.playId).sort());
    expect(got.length).toBeGreaterThan(0);
  });

  it('sorts newest game first, then play number', () => {
    const ids = lib().query({}).map((r) => r.playId);
    expect(ids[0]).toBe('2:1');
    expect(ids[ids.length - 1]).toBe('1:20');
  });

  it('each standard reel returns exactly what its filter names; opening script takes the first plays', () => {
    const l = lib();
    for (const t of STANDARD_REELS) {
      const reel = reelFromTemplate(l, t, HOME);
      expect(reel.playIds).toEqual(l.query(t.filter(HOME)).map((r) => r.playId));
    }
    const third = reelFromTemplate(l, STANDARD_REELS.find((t) => t.id === 'third_long')!, HOME);
    for (const id of third.playIds) { const r = l.get(id)!; expect(r.base.down).toBe(3); expect(r.base.distance!).toBeGreaterThanOrEqual(7); }
    const opening = reelFromTemplate(l, STANDARD_REELS.find((t) => t.id === 'opening_script')!, HOME);
    expect(opening.playIds.length).toBe(2 * 15);
  });

  it('a reel with uncharted plays says how many', () => {
    const l = lib(10, false);
    const c = buildCutUp(l, 'x', 'Pressures', l.query({}).map((r) => r.playId));
    expect(c.unchartedPlays).toBe(10);
    expect(c.overAttention).toBe(false);
    expect(buildCutUp(lib(), 'y', 'All', lib().query({}).map((r) => r.playId)).overAttention).toBe(true);
    expect(reelConcepts(l, c)).toEqual(['smash']);
  });

  it('a season of plays queries inside the budget', () => {
    const l = new FilmLibrary(HOME);
    const base = filmRecord(makeSource(), { viewerTeamId: HOME, seed: SEED, charter, charted: true });
    for (let i = 0; i < 20000; i++) l.add({ ...base, playId: `${1 + (i % 272)}:${i}`, gameId: 1 + (i % 272), playNumber: i, base: { ...base.base, down: (i % 4) + 1 } });
    const t0 = performance.now();
    l.query({ downs: [3], distance: ['long'], coaching: { coverage: ['cover3'] } });
    expect(performance.now() - t0).toBeLessThan(300);
  });

  it('the user chart replaces the staff chart, never the own call', () => {
    const l = lib(4);
    const id = l.query({ offenseTeamId: HOME })[0]!.playId;
    l.setUserChart(id, 'coverage', 'cover6');
    expect(l.get(id)!.coaching).toMatchObject({ values: { coverage: 'cover6' }, sources: { coverage: 'user' } });
    expect(() => l.setUserChart(id, 'protection', 'max')).toThrow(/own call/);
  });

  it('a staff guess needs matching plays and is labelled with who drew it', () => {
    const l = new FilmLibrary(HOME);
    const add = (p: number) => l.add(filmRecord(makeSource({ gameId: 1, playNumber: p, teams: [AWAY, 9] }), { viewerTeamId: HOME, seed: SEED, charter, charted: true }));
    add(1); add(2);
    expect(l.guessedLine('1:1', 7, { personId: 77, accuracy: 0.6 })).toBeNull();
    add(3);
    const g = l.guessedLine('1:1', 7, { personId: 77, accuracy: 0.6 }, 0.8)!;
    expect(g.matches).toBe(2);
    expect(g.confidence).toBeCloseTo(0.7);
    expect(g.line.author).toBe('staff:77');
    expect(g.line.points.length).toBeGreaterThan(2);
  });
});

describe('annotations (N1.2.3)', () => {
  it('fixed cause terms are stored as fixed terms, notes flag the soft limit, drawings add and remove', () => {
    let a = addTag(emptyAnnotation('7:12'), 'Communication');
    a = addTag(a, 'boundary blitz');
    expect(a.causeTags).toEqual(['communication']);
    expect(a.tags).toEqual(['boundary blitz']);
    expect(setNote(a, 'x'.repeat(300)).noteOverSoftLimit).toBe(true);
    a = addDrawing(a, { shape: 'arrow', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] });
    expect(removeDrawing(a, 0).drawings).toEqual([]);
    expect(() => addDrawing(a, { shape: 'circle', points: [{ x: 1, y: 1 }] })).toThrow();
  });

  it('annotating never changes the play record', () => {
    const l = lib(4);
    const id = l.query({})[0]!.playId;
    const before = Array.from(l.get(id)!.trajectory.buffer).join(',');
    l.setAnnotation(addTag(l.annotation(id), 'teach'));
    l.setAnnotation(emptyAnnotation(id));
    expect(Array.from(l.get(id)!.trajectory.buffer).join(',')).toBe(before);
    expect(scrubTrajectory(l.get(id)!.trajectory).buffer.join(',')).toBe(before);
  });
});

describe('opponent breakdown window', () => {
  const games = [...Array.from({ length: 8 }, (_, i) => ({ gameId: 100 + i, season: 2030, week: i + 1 })), ...Array.from({ length: 4 }, (_, i) => ({ gameId: 200 + i, season: 2029, week: 14 + i }))];
  it('last four of this season by default; six when asked or too few; last season early on', () => {
    expect(breakdownWindow(games, 2030, 9)).toEqual([107, 106, 105, 104]);
    expect(breakdownWindow(games, 2030, 9, true)).toEqual([107, 106, 105, 104, 103, 102]);
    expect(breakdownWindow(games, 2030, 3)).toEqual([101, 100, 203, 202, 201, 200]);
  });
});
