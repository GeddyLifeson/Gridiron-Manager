// Whitelist test of the film filter bridge (K9.3.1 rule 4): what a film room may hold, and nothing else.
import { describe, expect, it } from 'vitest';
import { tick } from '@gm/engine-core';
import { bridges, readModelSchemaProblems } from '../../../src/observer/index.ts';
import { FilmRecordS } from '@gm/schema';
import { filmRecord, scrubTrajectory, BASE_FIELDS, COACHING_FIELDS, FILM_EVENT_KINDS } from '../../../src/read-models/film/index.ts';
import { makeSource, HOME, AWAY, SEED } from './fixtures.ts';

const OTHER = 9;
const charter = (accuracy: number) => ({ personId: 77, accuracy });
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (x instanceof Uint8Array ? Array.from(x) : x));

describe('film filter bridge', () => {
  it('is registered and its record shape holds no truth field', () => {
    expect(bridges().map((b) => b.name)).toContain('film.filter');
    expect(readModelSchemaProblems('filmRecord', FilmRecordS)).toEqual([]);
  });

  it('own film: own unit exact from the call, the other unit charted; the record validates', () => {
    const src = makeSource({ coverageId: 'cover3' });
    const r = filmRecord(src, { viewerTeamId: HOME, seed: SEED, charter: charter(1), charted: true });
    expect(FilmRecordS.safeParse(r).success).toBe(true);
    expect(r.viewerSide).toBe(0);
    expect(r.coaching.sources.personnel).toBe('call');
    expect(r.coaching.values.protection).toBe('slide_left');
    expect(r.coaching.sources.coverage).toBe('staff');
    expect(r.coaching.values.coverage).toBe('cover3');
    expect(r.assignments.map((a) => a.slot)).toEqual([7]); // the defender's assignment is not ours
    expect(Object.keys(r.base).sort()).toEqual([...BASE_FIELDS].sort());
  });

  it('the defending club sees its own coverage exactly and charts the offense', () => {
    const r = filmRecord(makeSource(), { viewerTeamId: AWAY, seed: SEED, charter: charter(1), charted: false });
    expect(r.coaching.sources.coverage).toBe('call');
    expect(r.coaching.sources.protection).toBe('uncharted');
    expect(r.coaching.values.protection).toBeNull();
    expect(r.assignments.map((a) => a.slot)).toEqual([18]);
  });

  it('charting error follows the charter: perfect never wrong, poor often wrong, all deterministic', () => {
    let wrong = 0;
    for (let n = 1; n <= 200; n++) {
      const r = filmRecord(makeSource({ playNumber: n }), { viewerTeamId: HOME, seed: SEED, charter: charter(0.6), charted: true });
      if (r.coaching.values.coverage !== 'cover3') wrong++;
    }
    expect(wrong).toBeGreaterThan(50);
    expect(wrong).toBeLessThan(110);
    const a = filmRecord(makeSource(), { viewerTeamId: HOME, seed: SEED, charter: charter(0.6), charted: true });
    const b = filmRecord(makeSource(), { viewerTeamId: HOME, seed: SEED, charter: charter(0.6), charted: true });
    expect(json(a)).toBe(json(b));
  });

  it('other clubs film: no assignments, base set misread at the small rate', () => {
    let misses = 0, fields = 0;
    const exact = filmRecord(makeSource(), { viewerTeamId: HOME, seed: SEED, charter: null, charted: false }).base;
    for (let n = 1; n <= 300; n++) {
      const r = filmRecord(makeSource({ playNumber: n }), { viewerTeamId: OTHER, seed: SEED, charter: charter(0.8), charted: true });
      expect(r.assignments).toEqual([]);
      expect(r.viewerSide).toBeNull();
      for (const f of ['down', 'distance', 'hash', 'quarter'] as const) { fields++; if (r.base[f] !== exact[f]) misses++; }
    }
    expect(misses / fields).toBeLessThan(0.03);
    expect(misses).toBeGreaterThan(0);
  });

  it('nothing from the truth record, the call value or the opponent call ids leaves the filter', () => {
    const src = makeSource({ coverageId: 'SENTINEL_COVERAGE', frontId: 'SENTINEL_FRONT', pressureId: 'SENTINEL_PRESSURE', mentalError: { slot: 3, cause: 'communication' }, contests: [{ winner: 11, loser: 0 }], callValue: 0.4242 });
    const evil = { ...src, truth: { ...src.truth, events: src.truth.events.map((e) => (e.type === 'mental_error' ? { ...e, form: 'SENTINEL_FORM' } : e.type === 'contest' ? { ...e, contest: 'SENTINEL_CONTEST' } : e)) } };
    const r = filmRecord(evil, { viewerTeamId: HOME, seed: SEED, charter: charter(0), charted: false });
    const text = json(r);
    for (const s of ['SENTINEL', '0.4242', 'mental', 'contest', 'communication']) expect(text).not.toContain(s);
    for (const e of r.events) expect(FILM_EVENT_KINDS).toContain(e.kind);
    expect(COACHING_FIELDS.filter((f) => r.coaching.sources[f] === 'uncharted')).toEqual(['defPersonnel', 'front', 'coverage', 'pressure']);
  });

  it('the hidden contest advantage is scrubbed; positions stay bit for bit', () => {
    const src = makeSource({ advantage: 0.37 });
    const before = tick.decodeTrajectory(src.trajectory);
    expect(before.some((f) => f.advantage.some((a) => a !== null))).toBe(true);
    const after = tick.decodeTrajectory(scrubTrajectory(src.trajectory));
    expect(after.every((f) => f.advantage.every((a) => a === null))).toBe(true);
    expect(after.map((f) => [f.x, f.y, f.moveMode, f.ball])).toEqual(before.map((f) => [f.x, f.y, f.moveMode, f.ball]));
    expect(src.trajectory.buffer.length).toBe(scrubTrajectory(src.trajectory).buffer.length);
  });

  it('events: snap, throw, catch, tackle, whistle in order; a flag only for a called penalty', () => {
    const r = filmRecord(makeSource(), { viewerTeamId: HOME, seed: SEED, charter: null, charted: false });
    expect(r.events.map((e) => e.kind)).toEqual(['snap', 'throw', 'catch', 'tackle', 'whistle']);
    const src = makeSource();
    const flagged = { ...src, row: { ...src.row, penalties: [{ foulId: 'holding', side: 0 as const, yards: 10 }] } };
    expect(filmRecord(flagged, { viewerTeamId: HOME, seed: SEED, charter: null, charted: false }).events.map((e) => e.kind)).toContain('flag');
  });
});
