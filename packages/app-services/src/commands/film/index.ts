// G-63 film commands (P1.3.1): every change the user makes in the film room. Each command names its
// S3 task, is undoable where a coach could take it back, and is allowed in certified mode (film work
// changes no outcome, only what the coach knows and tells his players).
import { z } from 'zod';
import { own, type CommandSpec } from '@gm/schema';
import {
  FilmRoom, addTag, removeTag, setNote, addDrawing, removeDrawing, buildCutUp, sendCutUp, userGradeSheet, userResponsibility,
  setState, filmHours, CAUSE_TYPES, COACHING_FIELDS, type SnapMark, type GradePolicy, type PolicyForm,
} from '../../read-models/film/index.ts';

const playId = () => own(z.string().regex(/^\d+:\d+$/));
const id = () => own(z.number().int().positive(), 'id');
const Point = z.object({ x: own(z.number(), 'yd'), y: own(z.number(), 'yd') }).strict();

export const FilmTagPlay = z.object({ playId: playId(), tag: own(z.string().min(1).max(40)) }).strict();
export const FilmUntagPlay = FilmTagPlay;
export const FilmSetNote = z.object({ playId: playId(), note: own(z.string().max(20000)) }).strict();
export const FilmDraw = z.object({ playId: playId(), shape: own(z.enum(['line', 'circle', 'arrow'])), points: own(z.array(Point).min(2).max(64)) }).strict();
export const FilmEraseDrawing = z.object({ playId: playId(), index: own(z.number().int().min(0), 'index') }).strict();
export const FilmChartPlay = z.object({ playId: playId(), field: own(z.enum(COACHING_FIELDS)), value: own(z.string().min(1).max(40)) }).strict();
export const FilmSaveCutUp = z.object({ id: own(z.string().min(1).max(60)), title: own(z.string().min(1).max(80)), playIds: own(z.array(z.string())), notes: own(z.record(z.string(), own(z.string().max(2000)))) }).strict();
export const FilmSendCutUp = z.object({ id: own(z.string()), kind: own(z.enum(['room', 'player', 'staff', 'none'])), to: own(z.string()).nullable() }).strict();
export const FilmGradeSnap = z.object({
  gameId: id(), personId: id(), playId: playId(),
  assignment: own(z.enum(['right', 'wrong'])), technique: own(z.enum(['plus', 'zero', 'minus'])),
  lostContest: own(z.boolean()), loaf: own(z.boolean()), note: own(z.string().max(500)),
}).strict();
export const FilmAssignBust = z.object({ playId: playId(), personId: id().nullable(), cause: own(z.enum(CAUSE_TYPES)) }).strict();
export const FilmSetCorrection = z.object({ gameId: id(), correctionId: own(z.string()), state: own(z.enum(['open', 'accepted', 'dismissed'])) }).strict();
export const FilmSetGradePolicy = z.object({
  room: own(z.string()), policy: own(z.enum(['posted', 'one_on_one', 'private'])),
  forms: own(z.array(z.enum(['loaf_board', 'effort_points', 'season_award', 'morning_sheets']))),
}).strict();
export const FilmWatchPlay = z.object({ week: own(z.number().int().min(0), 'index'), playId: playId() }).strict();

export const FILM_COMMANDS: readonly CommandSpec[] = [
  { type: 'FilmTagPlay', payload: FilmTagPlay, task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmUntagPlay', payload: FilmUntagPlay, task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmSetNote', payload: FilmSetNote, task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmDraw', payload: FilmDraw, task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmEraseDrawing', payload: FilmEraseDrawing, task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmChartPlay', payload: FilmChartPlay, task: 'film.chart', undoable: true, allowedInCertified: true },
  { type: 'FilmSaveCutUp', payload: FilmSaveCutUp, task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmSendCutUp', payload: FilmSendCutUp, task: 'film.review', undoable: false, allowedInCertified: true },
  { type: 'FilmGradeSnap', payload: FilmGradeSnap, task: 'film.grade', undoable: true, allowedInCertified: true },
  { type: 'FilmAssignBust', payload: FilmAssignBust, task: 'film.grade', undoable: true, allowedInCertified: true },
  { type: 'FilmSetCorrection', payload: FilmSetCorrection, task: 'film.corrections', undoable: true, allowedInCertified: true },
  { type: 'FilmSetGradePolicy', payload: FilmSetGradePolicy, task: 'film.policy', undoable: true, allowedInCertified: true },
  { type: 'FilmWatchPlay', payload: FilmWatchPlay, task: 'film.review', undoable: false, allowedInCertified: true },
];

export class FilmCommandError extends Error {}

export interface FilmCommandResult {
  /** Read-model names whose data changed. */
  readonly touched: readonly string[];
  /** Hours the command drew from the user's week (N1.6.1), when any. */
  readonly userHours?: number;
}

/** Validates and applies one film command to a club's room. */
export function applyFilmCommand(room: FilmRoom, type: string, raw: unknown): FilmCommandResult {
  const spec = FILM_COMMANDS.find((c) => c.type === type);
  if (!spec) throw new FilmCommandError(`unknown film command ${type}`);
  const parsed = spec.payload.safeParse(raw);
  if (!parsed.success) throw new FilmCommandError(`${type}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  const p = parsed.data as Record<string, any>;
  const lib = room.library;
  const needPlay = () => { if (!lib.get(p.playId)) throw new FilmCommandError(`${type}: no film of play ${p.playId}`); };
  switch (type) {
    case 'FilmTagPlay': needPlay(); lib.setAnnotation(addTag(lib.annotation(p.playId), p.tag)); return { touched: ['filmPlay', 'filmPlayList'] };
    case 'FilmUntagPlay': needPlay(); lib.setAnnotation(removeTag(lib.annotation(p.playId), p.tag)); return { touched: ['filmPlay', 'filmPlayList'] };
    case 'FilmSetNote': needPlay(); lib.setAnnotation(setNote(lib.annotation(p.playId), p.note)); return { touched: ['filmPlay'] };
    case 'FilmDraw': needPlay(); lib.setAnnotation(addDrawing(lib.annotation(p.playId), { shape: p.shape, points: p.points })); return { touched: ['filmPlay'] };
    case 'FilmEraseDrawing': needPlay(); lib.setAnnotation(removeDrawing(lib.annotation(p.playId), p.index)); return { touched: ['filmPlay'] };
    case 'FilmChartPlay':
      needPlay();
      try { lib.setUserChart(p.playId, p.field, p.value); } catch (e) { throw new FilmCommandError((e as Error).message); }
      return { touched: ['filmPlay', 'filmPlayList'] };
    case 'FilmSaveCutUp': {
      const missing = (p.playIds as string[]).filter((x) => !lib.get(x));
      if (missing.length) throw new FilmCommandError(`FilmSaveCutUp: no film of ${missing.join(', ')}`);
      const prev = room.cutups.get(p.id);
      room.cutups.set(p.id, buildCutUp(lib, p.id, p.title, p.playIds, p.notes, prev?.audience));
      return { touched: ['filmCutUps'] };
    }
    case 'FilmSendCutUp': {
      const c = room.cutups.get(p.id);
      if (!c) throw new FilmCommandError(`FilmSendCutUp: no cut-up ${p.id}`);
      room.cutups.set(p.id, sendCutUp(c, { kind: p.kind, id: p.to }));
      return { touched: ['filmCutUps'] };
    }
    case 'FilmGradeSnap': {
      needPlay();
      const prev = room.sheet(p.gameId, p.personId);
      const firstUserMark = !prev || prev.grader !== 'user';
      const rows: SnapMark[] = prev && prev.grader === 'user' ? prev.rows.filter((r) => r.playId !== p.playId) : [];
      const candidate = prev?.rows.find((r) => r.playId === p.playId)?.loafCandidate ?? false;
      rows.push({ playId: p.playId, assignment: p.assignment, technique: p.technique, lostContest: p.lostContest, loaf: p.loaf, loafCandidate: candidate, note: p.note });
      rows.sort((a, b) => Number(a.playId.split(':')[1]) - Number(b.playId.split(':')[1]));
      room.putSheet({ ...userGradeSheet(p.gameId, p.personId, rows), comments: prev?.comments ?? { coachingPoints: '', workOn: '', summary: '' } });
      // Grading a player for a game costs the hour once, when the user takes the sheet over (N1.6.1).
      return { touched: ['filmGradeSheet'], userHours: firstUserMark ? filmHours({ playsWatched: 0, sheetsGradedByUser: 1, gamesChartedByUser: 0, gamesChartedByStaff: 0 }).userHours : 0 };
    }
    case 'FilmAssignBust': needPlay(); room.responsibility.set(p.playId, userResponsibility(p.playId, p.personId, p.cause)); return { touched: ['filmPlay'] };
    case 'FilmSetCorrection': {
      const list = room.corrections.get(p.gameId);
      if (!list) throw new FilmCommandError(`FilmSetCorrection: no correction list for game ${p.gameId}`);
      try { room.corrections.set(p.gameId, setState(list, p.correctionId, p.state)); } catch (e) { throw new FilmCommandError((e as Error).message); }
      return { touched: ['filmCorrections'] };
    }
    case 'FilmSetGradePolicy': room.policies.set(p.room, { policy: p.policy as GradePolicy, forms: p.forms as PolicyForm[] }); return { touched: [] };
    case 'FilmWatchPlay': {
      needPlay();
      const before = room.watched.get(p.week)?.size ?? 0;
      const after = room.markWatched(p.week, p.playId);
      const cost = (n: number) => filmHours({ playsWatched: n, sheetsGradedByUser: 0, gamesChartedByUser: 0, gamesChartedByStaff: 0 }).userHours;
      return { touched: [], userHours: cost(after) - cost(before) };
    }
    default: throw new FilmCommandError(`film command ${type} has no handler`);
  }
}
