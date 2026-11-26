// The seat's own film room (N1, item 2d): every game the user calls on the console is filed play by play into
// a G-63 FilmRoom, with the trajectories the resolver drew, so the film viewer, cut-ups and tagging screens
// show the club's own games. The film filter (read-models/film `filmRecord`) is the only way a play reaches
// a screen: the seat's own unit's coaching fields come from its calls, the opponent's are charted by the
// staff at the H2.1.2 tagging accuracy, and no truth leaves.
//
// Not here yet:
//   - A game the staff coached (delegated) is played by the season without a resolver tap, so it has no
//     trajectories; its charting rows stay in the season's film archive (opponent study), not in the room.
//   - Other clubs' games: the archive keeps charting rows only (week-loop film.ts); a viewer reel of them
//     needs `rebuildFilm` with a tapped resolver.
//   - The room lives in memory for the session: the save has no film tables yet (CR-G63-1).
import { stats } from '@gm/engine-game';
import { tendencies } from '@gm/models';
import { seedFromHex } from '@gm/engine-core';
import { TICKS_PER_SECOND, type GameInput, type PlayRecord, type TrajectoryRecord } from '@gm/schema';
import { FilmRoom, filmReadModels, filmRecord, type FilmModelSchemas, type FilmSource } from '../read-models/film/index.ts';
import { FILM_COMMAND_TABLE, applyFilmCommand } from '../commands/film/index.ts';
import type { CommandSpec } from '@gm/schema';
import { liveSlots } from '../presentation/live/index.ts';
import type { GameCallingSession } from '../commands/game-calling/index.ts';
import { P } from './params.ts';

/** One finished game the user called: its play records, field, params, input and each play's drawn path. */
export interface CalledGame {
  readonly records: readonly PlayRecord[];
  readonly geometry: GameCallingSession['geometry'];
  readonly params: GameCallingSession['params'];
  readonly input: GameInput;
  trajectory(playNumber: number): TrajectoryRecord | null;
}

export class SeatFilmRoom {
  readonly room: FilmRoom;
  private readonly seed: ReturnType<typeof seedFromHex>;
  private readonly games: number[] = [];

  constructor(readonly teamId: number, seedHex: string) {
    this.room = new FilmRoom(teamId);
    this.seed = seedFromHex(seedHex);
  }

  /** Game ids filed, oldest first. */
  get gameIds(): readonly number[] { return this.games; }
  /** Plays on film: zero when the games filed drew no paths (the reference resolver draws none). */
  get plays(): number { return this.room.library.size; }

  /** Files every play of a finished console game that has a trajectory; returns the plays filed. */
  file(g: CalledGame): number {
    const records = g.records;
    if (!records.length) return 0;
    const gameId = records[0]!.gameId;
    if (this.games.includes(gameId)) return 0;
    const deps = { geometry: g.geometry, params: g.params };
    const teams = g.input.teams;
    const charter = { personId: 0, accuracy: tendencies.tagAccuracy(P('staff.taggerSkill'), P('staff.disguise')) };
    let n = 0;
    records.forEach((r, i) => {
      const trajectory = g.trajectory(r.situation.playNumber);
      if (!trajectory) return;
      const sit = r.situation;
      const src: FilmSource = {
        gameId: r.gameId, playNumber: r.index, kind: 'game', teams: [teams[0].teamId, teams[1].teamId], ticksPerSecond: TICKS_PER_SECOND,
        trajectory, slots: liveSlots(r, teams), row: stats.playByPlay(r, records[i + 1] ?? null, deps), calls: r.calls, truth: r.truth,
        hash: tendencies.hashOf(sit.ballY, sit.attackDir === 1 ? 1 : -1, g.geometry),
        lineOfScrimmageX: sit.ballX, lineToGainX: sit.lineToGainX ?? null, assignments: [], callValue: null,
      };
      this.room.library.add(filmRecord(src, { viewerTeamId: this.teamId, seed: this.seed, charter, charted: true }), this.games.length + 1);
      n++;
    });
    this.games.push(gameId);
    return n;
  }

  // ---- what the film screens read and send (the five G-63 read models, built on this room) ----

  private modelsMade: ReturnType<SeatFilmRoom['makeModels']> | null = null;
  private get models() { return (this.modelsMade ??= this.makeModels()); }
  private makeModels() {
    return (() => {
    const [play, list, sheet, corrections, cutups] = filmReadModels(this.room, NO_SCHEMAS);
    const read = (m: (typeof filmReadModels extends (...a: never[]) => infer R ? R : never)[number] | undefined, p: object) => m!.build(null as never, p as never).data;
    return {
      play: (playId: string) => read(play, { playId }),
      list: (filter: string) => read(list, { filter }),
      sheet: (gameId: number, personId: number, scale: string) => read(sheet, { gameId, personId, scale }),
      corrections: (gameId: number) => read(corrections, { gameId }),
      cutups: () => read(cutups, {}),
    };
    })();
  }

  play(playId: string) { return this.models.play(playId); }
  list(filterJson: string) { return this.models.list(filterJson); }
  sheet(gameId: number, personId: number, scale: string) { return this.models.sheet(gameId, personId, scale); }
  corrections(gameId: number) { return this.models.corrections(gameId); }
  cutups() { return this.models.cutups(); }

  /**
   * One film command on this room. The payload schemas are owed to @gm/schema (CR-G63-0), so until they land
   * the payload is checked only for being an object; `applyFilmCommand` refuses a missing play or field.
   */
  send(type: string, payload: unknown): void {
    if (typeof payload !== 'object' || payload === null) throw new Error(`${type}: the payload is not an object`);
    applyFilmCommand(this.room, PASS_SPECS, type, payload);
  }
}

/** The read models' data schemas only label the registry's output; these builders are called directly. */
const NO_SCHEMAS = { play: null, playList: null, gradeSheet: null, corrections: null, cutUps: null } as unknown as FilmModelSchemas;
const PASS = { safeParse: (v: unknown) => ({ success: true as const, data: v }) };
const PASS_SPECS = FILM_COMMAND_TABLE.map((c) => ({ ...c, payload: PASS })) as unknown as readonly CommandSpec[];
