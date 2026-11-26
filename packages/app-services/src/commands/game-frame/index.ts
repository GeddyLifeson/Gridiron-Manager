// Commands of the game-day frame screens (G-62). A screen sends one of these; the world service applies it with
// the career gameday functions named beside each (doTask, delegate, advanceToNextDeadline, addHalftimeItem, ...)
// and writes the result to the command log (P5). Plain data only, so a save replays them (Q1.3.1).

export type PregameCommand =
  | { readonly type: 'pregame.do_task'; readonly task: string; readonly costMin?: number } // doTask
  | { readonly type: 'pregame.delegate'; readonly task: string; readonly staffId: string } // delegate
  | { readonly type: 'pregame.advance' } // advanceToNextDeadline
  | { readonly type: 'pregame.run_to_kickoff' }; // runToKickoff

export type HalftimeCommand =
  | { readonly type: 'halftime.open'; readonly attending: 'offense' | 'defense' | 'special'; readonly staffMin?: number } // openHalftime
  | { readonly type: 'halftime.add'; readonly item: { readonly kind: string; readonly [k: string]: unknown } } // addHalftimeItem
  | { readonly type: 'halftime.openers'; readonly unit: 'offense' | 'defense' | 'special'; readonly calls: readonly string[] } // makeOpeners
  | { readonly type: 'halftime.end' };

export type PostgameCommand =
  | { readonly type: 'postgame.handshake'; readonly manner: 'normal' | 'warm' | 'cold' | 'skipped' } // handshake
  | { readonly type: 'postgame.talk'; readonly tone: 'proud' | 'level' | 'demanding' | 'angry' | 'brief'; readonly points: readonly string[]; readonly callouts: readonly string[] } // postgameTalk
  | { readonly type: 'postgame.game_balls'; readonly receivers: readonly string[] } // giveGameBalls
  | { readonly type: 'postgame.answer'; readonly question: number; readonly style: string } // runMediaSession
  | { readonly type: 'postgame.skip_media' } // runMediaSession('skip'): a breakable act (media policy)
  | { readonly type: 'postgame.notes'; readonly text: string; readonly mustSee: readonly string[] } // firstNotes
  | { readonly type: 'postgame.day_after'; readonly choice: 'normal' | 'short' | 'off' } // dayAfter
  | { readonly type: 'postgame.send_play'; readonly playId: string; readonly question: string }; // submitPlays

export type GameFrameCommand = PregameCommand | HalftimeCommand | PostgameCommand;

const TYPES: ReadonlySet<string> = new Set([
  'pregame.do_task', 'pregame.delegate', 'pregame.advance', 'pregame.run_to_kickoff',
  'halftime.open', 'halftime.add', 'halftime.openers', 'halftime.end',
  'postgame.handshake', 'postgame.talk', 'postgame.game_balls', 'postgame.answer', 'postgame.skip_media', 'postgame.notes', 'postgame.day_after', 'postgame.send_play',
]);

/** Whether a value is a known game-frame command (used when a save's command log is read back). */
export function isGameFrameCommand(v: unknown): v is GameFrameCommand {
  return typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string' && TYPES.has((v as { type: string }).type);
}

/** Commands that are breakable acts and must show the L8.2.5 warning before they are sent (I10.4.1). */
export function needsWarning(c: GameFrameCommand): boolean {
  return c.type === 'postgame.skip_media';
}
