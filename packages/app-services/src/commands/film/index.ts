// G-63 film commands (P1.3.1): every change the user makes in the film room. Each command names its
// S3 task, is undoable where a coach could take it back, and is allowed in certified mode (film work
// changes no outcome, only what the coach knows and tells his players).
import type { CommandSpec } from '@gm/schema';
import {
  FilmRoom, addTag, removeTag, setNote, addDrawing, removeDrawing, buildCutUp, sendCutUp, userGradeSheet, userResponsibility,
  setState, filmHours, type SnapMark, type GradePolicy, type PolicyForm,
} from '../../read-models/film/index.ts';

/**
 * The film commands without their payload schemas. app-services may not import zod (P1.2.2), so the
 * payload schemas join these rows in @gm/schema's COMMANDS (CR-G63-0) and `applyFilmCommand` takes the
 * joined specs.
 */
export const FILM_COMMAND_TABLE: readonly Omit<CommandSpec, 'payload'>[] = [
  { type: 'FilmTagPlay', task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmUntagPlay', task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmSetNote', task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmDraw', task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmEraseDrawing', task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmChartPlay', task: 'film.chart', undoable: true, allowedInCertified: true },
  { type: 'FilmSaveCutUp', task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmSendCutUp', task: 'film.review', undoable: false, allowedInCertified: true },
  { type: 'FilmGradeSnap', task: 'film.grade', undoable: true, allowedInCertified: true },
  { type: 'FilmAssignBust', task: 'film.grade', undoable: true, allowedInCertified: true },
  { type: 'FilmSetCorrection', task: 'film.corrections', undoable: true, allowedInCertified: true },
  { type: 'FilmSetGradePolicy', task: 'film.policy', undoable: true, allowedInCertified: true },
  { type: 'FilmWatchPlay', task: 'film.review', undoable: false, allowedInCertified: true },
];

export class FilmCommandError extends Error {}

export interface FilmCommandResult {
  /** Read-model names whose data changed. */
  readonly touched: readonly string[];
  /** Hours the command drew from the user's week (N1.6.1), when any. */
  readonly userHours?: number;
}

/** Validates and applies one film command to a club's room. */
export function applyFilmCommand(room: FilmRoom, specs: readonly CommandSpec[], type: string, raw: unknown): FilmCommandResult {
  if (!FILM_COMMAND_TABLE.some((c) => c.type === type)) throw new FilmCommandError(`unknown film command ${type}`);
  const spec = specs.find((c) => c.type === type);
  if (!spec) throw new FilmCommandError(`no payload schema for film command ${type}`);
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
