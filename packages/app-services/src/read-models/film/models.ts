// Film read models (P1.3.2). Each builder reads the club's FilmRoom, which holds only what the film
// filter released, never the save's truth. The registry refuses these shapes if any field were truth.
// The world parameter is unused until film moves into world tables (CR-G63-1).
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import type { FilmFilter } from './library.ts';
import { STANDARD_REELS } from './library.ts';
import { reelFromTemplate } from './cutups.ts';
import { displayGrade, GRADE_SCALES, type GradeScale } from './grading.ts';
import { topPerUnit } from './corrections.ts';
import type { FilmRoom } from './room.ts';
import { recordToWire } from './wire.ts';
import type { Breakdown, FilmCorrectionsData, FilmCutUpsData, FilmGradeSheetData, FilmPlayData, FilmPlayListData } from './views.ts';

/** The zod data schemas of the five read models, every field classed. They live in @gm/schema (CR-G63-0) because app-services may not import zod. */
export interface FilmModelSchemas { readonly play: Schema; readonly playList: Schema; readonly gradeSheet: Schema; readonly corrections: Schema; readonly cutUps: Schema }

type Ps = Record<string, string | number | boolean | null>;

/** The film read models of one club's room. `breakdownOf` supplies the staff panel for own plays (built by the film filter's breakdown). */
export function filmReadModels(room: FilmRoom, schemas: FilmModelSchemas, breakdownOf: (playId: string) => Breakdown | null = () => null): ReadModelSpec<any, any>[] {
  const play: ReadModelSpec<{ playId: string } & Ps, FilmPlayData> = {
    name: 'filmPlay',
    data: schemas.play,
    taskIds: ['film.review'],
    build: (_w, { playId }) => {
      const record = room.library.get(playId);
      if (!record) throw new Error(`no film of play ${playId}`);
      return { data: { record: recordToWire(record), annotation: room.library.annotation(playId), breakdown: breakdownOf(playId), responsibility: room.responsibility.get(playId) ?? null } };
    },
  };
  const list: ReadModelSpec<{ filter: string } & Ps, FilmPlayListData> = {
    name: 'filmPlayList',
    data: schemas.playList,
    taskIds: ['film.review'],
    build: (_w, { filter }) => {
      const rows = room.library.rows(JSON.parse(filter) as FilmFilter);
      return { data: { rows, total: rows.length } };
    },
  };
  const sheet: ReadModelSpec<{ gameId: number; personId: number; scale: string } & Ps, FilmGradeSheetData> = {
    name: 'filmGradeSheet',
    data: schemas.gradeSheet,
    taskIds: ['film.grade'],
    build: (_w, { gameId, personId, scale }) => {
      const s = room.sheet(gameId, personId) ?? null;
      const sc = (GRADE_SCALES as readonly string[]).includes(scale) ? (scale as GradeScale) : 'decimal';
      return { data: { sheet: s, display: s ? displayGrade(s, sc) : '', scale: sc } };
    },
  };
  const corrections: ReadModelSpec<{ gameId: number } & Ps, FilmCorrectionsData> = {
    name: 'filmCorrections',
    data: schemas.corrections,
    taskIds: ['film.corrections'],
    build: (_w, { gameId }) => ({ data: topPerUnit(room.corrections.get(gameId) ?? []) }),
  };
  const cutups: ReadModelSpec<Ps, FilmCutUpsData> = {
    name: 'filmCutUps',
    data: schemas.cutUps,
    taskIds: ['film.review'],
    build: () => ({ data: { cutups: [...room.cutups.values()], templates: STANDARD_REELS.map((t) => ({ id: t.id, title: t.title })) } }),
  };
  return [play, list, sheet, corrections, cutups];
}

/** A standard reel built on request for the cut-ups screen. */
export function standardReel(room: FilmRoom, templateId: string, teamId: number) {
  const t = STANDARD_REELS.find((x) => x.id === templateId);
  if (!t) throw new Error(`no reel template ${templateId}`);
  return reelFromTemplate(room.library, t, teamId);
}
