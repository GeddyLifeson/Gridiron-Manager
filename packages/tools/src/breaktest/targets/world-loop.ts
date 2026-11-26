// World-loop target: the G-81 off-screen world with the real generator and content, the real leaving,
// cohort, development, roster-moves and coach-moves steps, driven in any order: weeks past the end of a
// season, a season point in mid-season, two season points in a row, whole seasons skipped in one burst, and
// head coaches fired in mid-week. After every step the long-run Q1.2.2 invariants run (one job and one team per
// person, roster limits, nobody lost, the dead stay dead, ages never fall, the calendar moves forward), and at
// each season point the season's records must match its box scores and the season history must match the games.
//
// Games and the schedule are STAND-INS (a round robin and seeded scores) until the season session binds the real
// schedule and engine to the loop: the checks here are about state, not results.
import { seedFromHex, stream } from '@gm/engine-core';
import { longRun } from '@gm/headless';
import { loop, turnover } from '@gm/world';
import { trimmedContent, worldContent } from '../world-content.ts';
import type { Action, BreakTarget, Mode, Outcome, Rnd, Violation } from '../types.ts';

const OWNER = 'G-81 world loop with turnover (world loop, world turnover); records via G-87 season runner';
const WEEKS = 6;

/** STAND-IN schedule: a rotation inside each competition, then a title game between the two best records. */
const schedule: loop.SchedulePort = {
  weeksInSeason: () => WEEKS + 1,
  gamesOn: (world, week) => {
    const out: loop.ScheduledGame[] = [];
    let gameId = world.date.seasonYear * 10_000 + week * 500 + 1;
    for (const comp of world.competitions) {
      const ids = loop.activeTeamIds(world, comp.teamIds);
      if (ids.length < 2) continue;
      if (week < WEEKS) {
        const n = ids.length, half = Math.floor(n / 2);
        for (let i = 0; i < half; i++) {
          const a = ids[(i + week) % n]!, b = ids[(n - 1 - i + week) % n]!;
          if (a !== b) out.push({ gameId: gameId++, competitionId: comp.id, homeTeamId: a, awayTeamId: b, kind: 'regular', title: false });
        }
      } else if (week === WEEKS) {
        const wins = new Map<number, number>(ids.map((id) => [id, 0]));
        for (const g of world.results) if (g.competitionId === comp.id && g.homePoints !== g.awayPoints) { const w = g.homePoints > g.awayPoints ? g.homeTeamId : g.awayTeamId; wins.set(w, (wins.get(w) ?? 0) + 1); }
        const top = [...ids].sort((a, b) => wins.get(b)! - wins.get(a)! || a - b);
        out.push({ gameId: gameId++, competitionId: comp.id, homeTeamId: top[0]!, awayTeamId: top[1]!, kind: 'postseason', title: true });
      }
    }
    return out;
  },
};

/** STAND-IN game port: seeded scores, ties possible. Not a result model. */
const games: loop.GamePort = (req) => {
  const s = stream(seedFromHex(req.seedHex), 'breaktest.game', []);
  return { homePoints: s.int(0, 45), awayPoints: s.int(0, 45), passPlays: s.int(28, 40), runPlays: s.int(20, 32) };
};

export class WorldLoopTarget implements BreakTarget {
  readonly name = 'world-loop';
  readonly owner = OWNER;
  private w: loop.LiveWorld | null = null;
  private sys: loop.WorldSystems | null = null;
  private checker = new longRun.InvariantChecker();
  private pending: Violation[] = [];
  private lastHash = '';
  private lastCommand = 'create';
  private eventTypes = new Map<string, { importedAllowed: boolean; harmClass: string }>();

  constructor(private readonly clubs = 6, private readonly schools = 6) {}

  private get world(): loop.LiveWorld { if (!this.w) throw new Error('no world'); return this.w; }

  async reset(seedHex: string): Promise<void> {
    const { content: full, names, lookup } = await worldContent();
    const content = trimmedContent(full, this.clubs, this.schools);
    const { generation } = await import('@gm/world');
    const setup = generation.createSetup({ seedHex, size: 'small', historySeasons: 0, packs: [], careerCurveDial: null, rulebookEra: 'era:2026', eraProgression: false, firstSeasonYear: 2026 });
    const eventTypes = [...turnover.TURNOVER_EVENT_TYPES, ...turnover.COACH_EVENT_TYPES];
    this.w = loop.createWorld({ setup, content, names, eventTypes });
    const binding: turnover.TurnoverBinding = { content, rule: (lvl, k) => (lvl === 'pro' ? lookup.pro : lookup.college)(k) };
    const pro = this.w.teams.filter((t) => turnover.levelOfTeam(this.w!, t.id) === 'pro').length;
    const col = this.w.teams.length - pro;
    this.sys = loop.systemsFrom({
      games: loop.gamesStep(schedule, games), leaving: loop.leavingStep(),
      cohorts: loop.cohortStep({
        scale: () => ({ topCollegeTeams: col, draftedCount: pro * (lookup.pro(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 }),
        names, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
      }),
      development: turnover.developmentStep(binding), moves: turnover.movesStep(binding, turnover.rosterMovesStep(binding)),
    }, 'break test: not bound');
    this.checker = new longRun.InvariantChecker();
    this.pending = [];
    this.eventTypes = new Map();
    for (const t of [...turnover.TURNOVER_EVENT_TYPES, ...turnover.COACH_EVENT_TYPES, ...loop.worldEventTypes([])]) this.eventTypes.set(t.id, { importedAllowed: t.importedAllowed, harmClass: t.harmClass });
    this.lastHash = this.hash();
    this.lastCommand = 'create';
  }

  propose(mode: Mode, r: Rnd): Action {
    const w = this.world;
    switch (mode) {
      case 'legal': return w.week < WEEKS + 1 ? { kind: 'week', mode, args: {} } : { kind: 'seasonPoint', mode, args: {} };
      case 'hostile': return { kind: 'fireHead', mode, args: { pick: r.uniform() } };
      case 'boundary': return { kind: 'skipSeasons', mode, args: { seasons: r.pick([1, 2, 3]) } };
      case 'out_of_order': return r.chance(0.5) ? { kind: 'seasonPoint', mode, args: {} } : { kind: 'week', mode, args: {} };
    }
  }

  /** A week past the end of the season and a season point before the last week are out of the C4 order. */
  expect(a: Action): string | null | undefined {
    const w = this.world;
    if (a.kind === 'week' && w.week >= WEEKS + 1) return 'every week of the season has run; the next step is the season point';
    if (a.kind === 'seasonPoint' && w.week < WEEKS + 1) return 'the season is not over; a season point now would close it early';
    return undefined;
  }

  async apply(a: Action): Promise<Outcome> {
    const w = this.world, sys = this.sys!;
    this.lastHash = this.hash();
    this.lastCommand = a.kind;
    switch (a.kind) {
      case 'week': loop.runWeek(w, sys); return { accepted: true };
      case 'seasonPoint': this.seasonPoint(); return { accepted: true };
      case 'skipSeasons': {
        for (let i = 0; i < (a.args['seasons'] as number); i++) { while (w.week < WEEKS + 1) loop.runWeek(w, sys); this.seasonPoint(); }
        return { accepted: true };
      }
      case 'fireHead': {
        // Firing in mid-week: the head coach's job falls vacant now and he is out of football, the way the coach
        // moves step does it. No app command fires a coach yet, so the rig acts through the job map.
        const heads = [...w.jobs.values()].filter((j) => j.positionId === 'pos:head_coach' && j.holderPersonId !== null).sort((x, y) => x.id - y.id);
        if (heads.length === 0) return { accepted: false, reason: 'no head coach to fire' };
        const j = heads[Math.floor((a.args['pick'] as number) * heads.length)]!;
        w.outOfFootballSince.set(j.holderPersonId!, w.date.seasonYear);
        w.jobs.set(j.id, { ...j, holderPersonId: null, holderSince: null, vacantSince: w.date });
        return { accepted: true };
      }
      default: return { accepted: false, reason: `unknown action ${a.kind}` };
    }
  }

  private seasonPoint(): void {
    const w = this.world;
    const results = [...w.results];
    const s = loop.runSeasonPoint(w, this.sys!);
    // Records against box scores: the season's lines must be exactly the regular-season results.
    const rec = new Map<number, { wins: number; losses: number; ties: number }>();
    const line = (id: number) => { let l = rec.get(id); if (!l) { l = { wins: 0, losses: 0, ties: 0 }; rec.set(id, l); } return l; };
    for (const g of results) {
      if (g.kind !== 'regular') continue;
      const h = line(g.homeTeamId), aw = line(g.awayTeamId);
      if (g.homePoints > g.awayPoints) { h.wins++; aw.losses++; } else if (g.homePoints < g.awayPoints) { aw.wins++; h.losses++; } else { h.ties++; aw.ties++; }
    }
    for (const [id, l] of rec) {
      const got = s.records[id];
      if (!got || got.wins !== l.wins || got.losses !== l.losses || got.ties !== l.ties) {
        this.pending.push({ code: 'records.differ_from_box_scores', message: 'A team\'s season record differs from its regular-season box scores.', detail: { team: id, record: got ?? null, boxScores: l } });
        break;
      }
    }
    const points = results.reduce((t, g) => t + g.homePoints + g.awayPoints, 0);
    if (s.games !== results.length) this.pending.push({ code: 'history.games_count', message: 'The season history counts a different number of games from the games played.', detail: { history: s.games, played: results.length } });
    if (s.points !== points) this.pending.push({ code: 'history.points', message: 'The season history totals different points from the box scores.', detail: { history: s.points, played: points } });
    for (const comp of w.competitions) {
      const title = results.find((g) => g.competitionId === comp.id && g.title);
      const champ = s.champions[comp.id];
      if (title && title.homePoints !== title.awayPoints) {
        const winner = title.homePoints > title.awayPoints ? title.homeTeamId : title.awayTeamId;
        if (champ !== winner) this.pending.push({ code: 'history.champion_not_title_winner', message: 'The recorded champion is not the winner of the title game.', detail: { competition: comp.id, champion: champ ?? null, titleWinner: winner } });
      }
      if (title && title.homePoints === title.awayPoints) this.pending.push({ code: 'title_game.tied', message: 'A title game ended tied, so the season has no champion from its title game.', detail: { competition: comp.id } });
      if (!title && champ !== undefined) this.pending.push({ code: 'history.champion_without_title_game', message: 'A champion was recorded for a season whose title game was never played (season closed early).', detail: { competition: comp.id, champion: champ } });
    }
  }

  invariants(): Violation[] {
    const w = this.world;
    const out = this.pending; this.pending = [];
    // The Q1.2.2 checker reads pass boundaries; a firing between passes is checked at the next pass.
    if (this.lastCommand === 'fireHead') return out;
    const at: longRun.Boundary = { kind: 'week', season: w.date.seasonYear, week: w.week };
    const fails = this.checker.check({ world: w as unknown as longRun.WorldView, at, command: this.lastCommand, hashBefore: this.lastHash, eventType: (id) => this.eventTypes.get(id) as never });
    for (const f of fails) {
      out.push({ code: `q122.${f.invariant}`, message: `Q1.2.2 ${f.invariant}: ${f.detail.replace(/\d+/g, 'N')}`, detail: { detail: f.detail, command: f.command } });
    }
    // Vacancies: a head coach chair left empty through a whole season point is a team with nobody calling games.
    return out;
  }

  hash(): string { return loop.worldHash(this.world, false); }

  unreachable() {
    return [
      { code: 'loop.standin_games', message: 'The loop plays STAND-IN games and a stand-in schedule until the season session (SeasonPlay) binds the real schedule and engine; records, history and champions are checked against those games.' },
      { code: 'loop.no_save', message: 'The live world has no save round trip yet (G-83 binds LiveWorld to the store), so the world loop cannot be saved and reloaded at odd moments.' },
      { code: 'loop.no_fire_command', message: 'No command fires or hires a coach; the rig fires through the job map, the way the coach moves step does.' },
    ];
  }

  async close(): Promise<void> { this.w = null; this.sys = null; }
}
