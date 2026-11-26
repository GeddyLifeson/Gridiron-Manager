// A stand-in press corps for the seat's media sessions (H7.2, item 2d). The world's own reporters (L6.1.1, the
// press corps of generated people) are not in the season yet, so the room is a fixed stand-in by level: neutral
// trust and a middling appetite for controversy, no beat. The questions are the front-office press generator's
// own (H7.2.1, topic catalogue and the measured share of question kinds); only what they are about comes from the
// season: the seat's results, streak, a bye before this week, a short week and the next opponent. Nothing hidden
// reaches the screen: trust, controversy and goodwill shape the tone and stay in here.
//
// Stand-in values are week-loop parameters with basis `assumption` (A-2d-5 to A-2d-8). Replace the corps with
// the world's reporters when generated people play (L6), and the events with the world news step (X12.2.1).
import { seedFromHex, stream } from '@gm/engine-core';
import type { press } from '@gm/front-office';
import type { RandomStream } from '@gm/schema';
import { sessionKindFor } from '../read-models/week/index.ts';
import type { SeatWeekLoop } from './week-loop.ts';
import { P } from './params.ts';

const OUTLETS: Readonly<Record<'pro' | 'college', readonly press.OutletType[]>> = {
  pro: ['local_paper', 'local_broadcast', 'team_site', 'national'],
  college: ['local_paper', 'student', 'local_broadcast', 'team_site'],
};

/** The stand-in room by level (A-2d-5): one reporter per outlet, ids from 1. */
export function standInReporters(level: 'pro' | 'college'): press.ReporterView[] {
  return OUTLETS[level].map((outlet, i) => ({
    id: i + 1, outlet, reach: outlet === 'national' ? P('press.reachNational') : P('press.reachLocal'), beat: {},
    trust: P('press.trust'), controversy: P('press.controversy'),
  }));
}

export interface PressCorpsHost {
  readonly level: 'pro' | 'college';
  readonly coachId: number;
  /** C1 / T9 market size 1 to 5 of the seat's club. */
  readonly market: number;
  nameOf(teamId: number): string;
}

/** The week's public events for the room: what a reporter could ask about (H7.2.1 inputs). */
export function weekEvents(loop: SeatWeekLoop, sessionDay: number): press.PressEvent[] {
  const { teamId, results, week } = loop.ctx;
  const mine = results.filter((r) => r.teams.includes(teamId)).sort((a, b) => a.week - b.week);
  const out: press.PressEvent[] = [];
  const ev = (type: string, daysAgo: number, teamIds: readonly number[]): void => {
    out.push({ id: out.length + 1, type, daysAgo: Math.max(0, daysAgo), notability: P('press.notability'), harm: 'none', personIds: [], teamIds, public: true, fromLeak: false });
  };
  const last = mine[mine.length - 1];
  const prevDay = loop.week.previousGameDay;
  if (last) ev('game_result', prevDay === null ? 0 : sessionDay - prevDay, last.teams);
  const streak = streakOf(mine, teamId);
  if (streak >= P('press.streakGames')) ev('winning_streak', 0, [teamId]);
  if (-streak >= P('press.streakGames')) ev('losing_streak', 0, [teamId]);
  if (mine.length > 0 && !mine.some((r) => r.week === week - 1)) ev('bye', 0, [teamId]);
  if (loop.week.shape === 'short') ev('short_week', 0, [teamId]);
  return out;
}

/** + wins, - losses in a row up to now; a tie ends it. */
function streakOf(games: readonly { teams: readonly [number, number]; points: readonly [number, number] }[], teamId: number): number {
  let n = 0;
  for (let i = games.length - 1; i >= 0; i--) {
    const g = games[i]!;
    const me = g.teams[0] === teamId ? 0 : 1;
    const d = g.points[me]! - g.points[me === 0 ? 1 : 0]!;
    const s = d > 0 ? 1 : d < 0 ? -1 : 0;
    if (s === 0 || (n !== 0 && Math.sign(n) !== s)) break;
    n += s;
  }
  return n;
}

/** The press session for a media block of the seat's week, with its own stream [season, week, team, block]. */
export function standInSession(loop: SeatWeekLoop, blockId: string, host: PressCorpsHost): { session: press.PressSession; rng: RandomStream } | null {
  const blocks = loop.week.days.flatMap((d) => d.blocks);
  const i = blocks.findIndex((b) => b.id === blockId);
  const b = blocks[i];
  if (!b || b.type !== 'media') return null;
  const { teamId, results, season, week, fixture, seedHex } = loop.ctx;
  const mine = results.filter((r) => r.teams.includes(teamId));
  const won = (r: (typeof mine)[number]) => { const me = r.teams[0] === teamId ? 0 : 1; return r.points[me]! > r.points[me === 0 ? 1 : 0]!; };
  const lost = (r: (typeof mine)[number]) => { const me = r.teams[0] === teamId ? 0 : 1; return r.points[me]! < r.points[me === 0 ? 1 : 0]!; };
  const opp = fixture ? (fixture.home === teamId ? fixture.away : fixture.home) : null;
  const names: Record<number, string> = { [teamId]: host.nameOf(teamId) };
  if (opp !== null) names[opp] = host.nameOf(opp);
  for (const r of mine) for (const t of r.teams) names[t] = host.nameOf(t);
  const session: press.PressSession = {
    kind: sessionKindFor(b.session ?? undefined), speaker: 'head_coach', minutes: b.minutes,
    reporters: standInReporters(host.level), events: weekEvents(loop, b.start.day), statements: [],
    settings: { personalTopics: true },
    world: {
      level: host.level, teamId, coachId: host.coachId, market: host.market,
      wins: mine.filter(won).length, losses: mine.filter(lost).length, streak: streakOf([...mine].sort((a, c) => a.week - c.week), teamId),
      hotSeat: false, goodwill: P('press.goodwill'), nextOpponent: opp, rivalryWeek: false, origins: {}, names,
    },
  };
  return { session, rng: stream(seedFromHex(seedHex), 'weekLoop.press', [season, week, teamId, i]) };
}
