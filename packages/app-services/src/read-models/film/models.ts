// Film read models (P1.3.2). Each builder reads the club's FilmRoom, which holds only what the film
// filter released, never the save's truth. The registry refuses these shapes if any field were truth.
// The world parameter is unused until film moves into world tables (CR-G63-1).
import { z } from 'zod';
import { own, pub } from '@gm/schema';
import type { ReadModelSpec } from '../../observer/index.ts';
import { AnnotationS, BreakdownS, CorrectionS, CutUpS, FilmRecordWireS, GradeSheetS, PlayRowS, ResponsibilityS } from './schemas.ts';
import type { FilmFilter } from './library.ts';
import { STANDARD_REELS } from './library.ts';
import { reelFromTemplate } from './cutups.ts';
import { displayGrade, GRADE_SCALES, type GradeScale } from './grading.ts';
import { topPerUnit } from './corrections.ts';
import type { FilmRoom } from './room.ts';
import { recordToWire } from './wire.ts';
import type { Breakdown } from './schemas.ts';

export const FilmPlayData = z.object({
  record: pub(FilmRecordWireS),
  annotation: own(AnnotationS),
  breakdown: own(BreakdownS).nullable(),
  responsibility: own(ResponsibilityS).nullable(),
}).strict();

export const FilmPlayListData = z.object({ rows: pub(z.array(PlayRowS)), total: pub(z.number().int(), 'count') }).strict();

export const FilmGradeSheetData = z.object({
  sheet: own(GradeSheetS).nullable(),
  display: own(z.string()),
  scale: own(z.enum(GRADE_SCALES)),
}).strict();

export const FilmCorrectionsData = z.object({ shown: own(z.array(CorrectionS)), more: own(z.array(CorrectionS)) }).strict();

export const FilmCutUpsData = z.object({ cutups: own(z.array(CutUpS)), templates: pub(z.array(z.object({ id: pub(z.string()), title: pub(z.string()) }).strict())) }).strict();

type Ps = Record<string, string | number | boolean | null>;

/** The film read models of one club's room. `breakdownOf` supplies the staff panel for own plays (built by the film filter's breakdown). */
export function filmReadModels(room: FilmRoom, breakdownOf: (playId: string) => Breakdown | null = () => null): ReadModelSpec<any, any>[] {
  const play: ReadModelSpec<{ playId: string } & Ps, z.infer<typeof FilmPlayData>> = {
    name: 'filmPlay',
    data: FilmPlayData,
    taskIds: ['film.review'],
    build: (_w, { playId }) => {
      const record = room.library.get(playId);
      if (!record) throw new Error(`no film of play ${playId}`);
      return { data: { record: recordToWire(record), annotation: room.library.annotation(playId), breakdown: breakdownOf(playId), responsibility: room.responsibility.get(playId) ?? null } };
    },
  };
  const list: ReadModelSpec<{ filter: string } & Ps, z.infer<typeof FilmPlayListData>> = {
    name: 'filmPlayList',
    data: FilmPlayListData,
    taskIds: ['film.review'],
    build: (_w, { filter }) => {
      const rows = room.library.rows(JSON.parse(filter) as FilmFilter);
      return { data: { rows, total: rows.length } };
    },
  };
  const sheet: ReadModelSpec<{ gameId: number; personId: number; scale: string } & Ps, z.infer<typeof FilmGradeSheetData>> = {
    name: 'filmGradeSheet',
    data: FilmGradeSheetData,
    taskIds: ['film.grade'],
    build: (_w, { gameId, personId, scale }) => {
      const s = room.sheet(gameId, personId) ?? null;
      const sc = (GRADE_SCALES as readonly string[]).includes(scale) ? (scale as GradeScale) : 'decimal';
      return { data: { sheet: s, display: s ? displayGrade(s, sc) : '', scale: sc } };
    },
  };
  const corrections: ReadModelSpec<{ gameId: number } & Ps, z.infer<typeof FilmCorrectionsData>> = {
    name: 'filmCorrections',
    data: FilmCorrectionsData,
    taskIds: ['film.corrections'],
    build: (_w, { gameId }) => ({ data: topPerUnit(room.corrections.get(gameId) ?? []) }),
  };
  const cutups: ReadModelSpec<Ps, z.infer<typeof FilmCutUpsData>> = {
    name: 'filmCutUps',
    data: FilmCutUpsData,
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
