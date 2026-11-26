// The plain types in src (views.ts) and the zod draft for @gm/schema (schemas.ts) must stay one shape.
// Compile-time: each z.infer is assignable to the plain type and back. Run-time: every field is classed.
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { pathsOfClass, holdsTruth } from '../../../src/observer/index.ts';
import type * as V from '../../../src/read-models/film/views.ts';
import * as S from './schemas.ts';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const check = <T extends true>(_: T) => _;
check<Same<z.infer<typeof S.FilmPlayDataS>, V.FilmPlayData>>(true);
check<Same<z.infer<typeof S.FilmPlayListDataS>, V.FilmPlayListData>>(true);
check<Same<z.infer<typeof S.FilmCorrectionsDataS>, V.FilmCorrectionsData>>(true);
check<Same<z.infer<typeof S.FilmCutUpsDataS>, V.FilmCutUpsData>>(true);
check<Same<z.infer<typeof S.GradeSheetS>, V.GradeSheet>>(true);
check<Same<z.infer<typeof S.SnapMarkS>, V.SnapMark>>(true);
check<Same<z.infer<typeof S.FilmRecordS>, V.FilmRecord>>(true);

describe('film shapes', () => {
  it('no read-model schema holds a truth field', () => {
    for (const [name, s] of Object.entries(S.FILM_MODEL_SCHEMAS)) expect(holdsTruth(s), name).toBe(false);
    expect(pathsOfClass(S.FilmPlayDataS, 'truth')).toEqual([]);
  });
  it('every command in the table has a payload schema', () => {
    expect(S.FILM_COMMAND_SPECS.every((c) => typeof c.payload.safeParse === 'function')).toBe(true);
  });
});
