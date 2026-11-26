// One club's film room state (N1): its library, grade sheets, responsibility lines, correction lists,
// cut-ups and grade policy. Plain data plus the library; the film commands (commands/film) change it
// and the read models (models.ts) read it. Persisting it is the save's job: the world contract has no
// film tables yet (CR-G63-1), so the room is built in memory from the play records of the save.
import { FilmLibrary } from './library.ts';
import type { GradePolicy, PolicyForm } from './grading.ts';
import type { Correction, CutUp, GradeSheet, Responsibility } from './schemas.ts';

export type Room = 'team' | string;

export class FilmRoom {
  readonly library: FilmLibrary;
  readonly sheets = new Map<string, GradeSheet>();
  readonly responsibility = new Map<string, Responsibility>();
  readonly corrections = new Map<number, Correction[]>();
  readonly cutups = new Map<string, CutUp>();
  readonly policies = new Map<Room, { policy: GradePolicy; forms: PolicyForm[] }>();
  /** Plays watched in each week, by week index, for the time ledger (N1.6.1). */
  readonly watched = new Map<number, Set<string>>();

  constructor(readonly teamId: number) { this.library = new FilmLibrary(teamId); }

  static sheetKey(gameId: number, personId: number): string { return `${gameId}:${personId}`; }

  sheet(gameId: number, personId: number): GradeSheet | undefined { return this.sheets.get(FilmRoom.sheetKey(gameId, personId)); }
  putSheet(s: GradeSheet): void { this.sheets.set(FilmRoom.sheetKey(s.gameId, s.personId), s); }

  /** Records a play watched in a week; each play counts once per week. */
  markWatched(week: number, playId: string): number {
    const set = this.watched.get(week) ?? new Set<string>();
    set.add(playId);
    this.watched.set(week, set);
    return set.size;
  }
}
