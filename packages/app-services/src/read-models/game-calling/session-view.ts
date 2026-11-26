// The console read model for a running game session (G-60 in the app, handoff item D): the strip from the
// game's public situation and the console state from the session's key driver. Only scoreboard facts enter
// (GameSituation is public by contract, J1.6.1); the opponent's call never does (O2.1.2, K9).
import { stats } from '@gm/engine-game';
import { replay } from '@gm/officiating';
import { yardsToGoal, type PlayRecord, type RosterNames } from '@gm/schema';
import type { GameCallingSession } from '../../commands/game-calling/index.ts';
import { buildConsoleView, type BoothNote, type ConsoleView, type StripInput, type TendencyLine } from './index.ts';

export interface SessionViewOptions {
  /** Live key map: action to display chord (O2.5.2). */
  readonly keyFor: (action: string) => string | null;
  readonly booth?: BoothNote | null;
  readonly tendency?: TendencyLine | null;
  readonly opponentPersonnel?: string | null;
  readonly callText?: (label: string, tagLabels: readonly string[], personnel: string | null) => string;
}

/** The strip facts for the user's side: spot as the caller says it, hash as the offense looks downfield. */
export function sessionStrip(session: GameCallingSession): StripInput {
  const s = session.situation();
  const g = session.geometry;
  const offenseToGoal = Math.round(yardsToGoal(g, s.ballX, s.attackDir));
  // Yards to the user's attacking goal: the offense's own number when the user has the ball, else the far side.
  const userToGoal = s.offense === session.userSide ? offenseToGoal : 100 - offenseToGoal;
  const spot: StripInput['spot'] = userToGoal === 50 ? { side: 'mid', yard: 50 }
    : userToGoal < 50 ? { side: 'opp', yard: Math.max(0, userToGoal) } : { side: 'own', yard: Math.max(0, 100 - userToGoal) };
  // Looking toward the goal the offense attacks: attacking east, north is the left.
  const north = s.ballY >= g.hashNorthY - 0.5;
  const south = s.ballY <= g.hashSouthY + 0.5;
  const hash: StripInput['hash'] = !north && !south ? 'middle' : (north === (s.attackDir === 1) ? 'left' : 'right');
  const rules = session.rules;
  const full = Math.round(rules.num('clock.play_clock_s') * 10);
  const short = Math.round(rules.num('clock.play_clock_after_stoppage_s') * 10);
  const opened = session.pending?.playClockTenths ?? full;
  const shortClock = opened <= short;
  return {
    period: s.period, clockTenths: s.clockTenths, clockRunning: s.clockStatus === 'running', score: s.score,
    down: s.down, distance: s.distanceYd === null ? null : Math.max(1, Math.round(s.distanceYd)),
    spot, hash, timeoutsLeft: s.timeoutsLeft, playClockLengthTenths: shortClock ? short : full, shortClock,
  };
}

/** Challenges the user's team has left, from the rule set's count and the game's counters (B9.1.1 rules 1, 2). */
export function sessionChallengesLeft(session: GameCallingSession): number {
  const side = session.userSide;
  const r = session.rules;
  const earned = r.opt(replay.KEY.thirdIf) === replay.THIRD_IF.eitherWon && session.game.challengesWon[side] >= 1 ? 1 : 0;
  return Math.max(0, r.num(replay.KEY.challengeCount) + earned - session.game.challengesUsed[side]);
}

/** The whole console view for the session at the driver's current moment. */
export function consoleViewOfSession(session: GameCallingSession, o: SessionViewOptions): ConsoleView {
  return buildConsoleView({
    console: session.driver.state, atMs: session.driver.nowMs, strip: sessionStrip(session),
    personnelOnField: session.personnelOnField, opponentPersonnel: o.opponentPersonnel ?? null,
    booth: o.booth ?? null, tendency: o.tendency ?? null, challengesLeft: sessionChallengesLeft(session), keyFor: o.keyFor,
    ...(o.callText ? { callText: o.callText } : {}),
  });
}

/** One line of the game log: quarter, clock and the play-by-play text (J11.9.1), newest last. */
export interface PlayLogLine { readonly playNumber: number; readonly period: number; readonly clock: string; readonly text: string }

/** The last `n` plays of the session as play-by-play lines, named through `names` (observed names only). */
export function sessionPlayLog(session: GameCallingSession, names: RosterNames, n = 8): PlayLogLine[] {
  const records: PlayRecord[] = [];
  for (const e of session.events) if (e.type === 'play_resolved') records.push(e.record);
  const from = Math.max(0, records.length - n);
  const deps = { geometry: session.geometry, params: session.params };
  const out: PlayLogLine[] = [];
  for (let i = from; i < records.length; i++) {
    const r = records[i]!;
    const row = stats.playByPlay(r, records[i + 1] ?? null, deps);
    const t = Math.floor(r.situation.clockTenths / 10);
    out.push({ playNumber: r.situation.playNumber, period: r.situation.period, clock: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, text: stats.renderPlayText(row, names) });
  }
  return out;
}
