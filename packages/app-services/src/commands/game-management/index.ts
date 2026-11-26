// Commands of the game management panel (G-61: O2.1.2, O2.1.3, O2.4, I5.1.1, I5.5.1, I5.6.1, I7.5.1).
// A screen sends one of these; the world service checks it against the engine again (the view is a copy
// of the engine's legality, never the authority), applies it through the game flow (J11) and writes the
// decision record (N3, I5.11.1) with what was on screen. Plain data only, so a save replays them (Q1.3.1); the world service stamps the real time on receipt.
// AI coaches use the same commands (K5).
import type { Channel, DecisionKind, GameManagementView } from '../../read-models/game-management/index.ts';

/** Who made a decision (O2.4.2 acceptance: every fourth down, try and kickoff names its decider). */
export type DecidedBy = 'user' | 'standing_rule' | 'default' | 'delegate';

export type GameManagementCommand =
  | { readonly type: 'gm.timeout'; readonly gameId: string }
  | { readonly type: 'gm.timeout_request'; readonly gameId: string } // coordinator asks the head coach (S5.4.1)
  | { readonly type: 'gm.challenge'; readonly gameId: string; readonly aspect: string }
  | {
    readonly type: 'gm.decide'; readonly gameId: string; readonly decisionId: string; readonly kind: DecisionKind; readonly optionId: string;
    readonly decidedBy: DecidedBy;
    /** What was on screen when he chose (N3: the information shown). */
    readonly shown: { readonly chartOption: string | null; readonly advisorOption: string | null };
  }
  | { readonly type: 'gm.recommend'; readonly gameId: string; readonly decisionId: string; readonly optionId: string } // analyst seat (S5.3.3)
  | { readonly type: 'gm.channel'; readonly gameId: string; readonly channel: Channel }
  | { readonly type: 'gm.ask_booth'; readonly gameId: string; readonly questionId: string }
  | { readonly type: 'gm.message_read'; readonly gameId: string; readonly messageId: string; readonly beforeCallConfirmed: boolean };

const TYPES: ReadonlySet<string> = new Set(['gm.timeout', 'gm.timeout_request', 'gm.challenge', 'gm.decide', 'gm.recommend', 'gm.channel', 'gm.ask_booth', 'gm.message_read']);

export function isGameManagementCommand(c: { readonly type: string }): c is GameManagementCommand {
  return TYPES.has(c.type);
}

/**
 * Why the panel should not send this command, or null to send it. A first check only: the world service
 * asks the engine again. Pressing T twice does not call two timeouts (O2.4.1 edge case).
 */
export function refusal(c: GameManagementCommand, view: GameManagementView): string | null {
  if (c.gameId !== view.gameId) return 'game_management.refused.other_game';
  switch (c.type) {
    case 'gm.timeout':
      if (!view.timeout) return 'game_management.refused.not_your_seat';
      return view.timeout.enabled ? null : view.timeout.reasonKey ?? 'game_management.refused.not_legal';
    case 'gm.timeout_request':
      return view.seat === 'coordinator' ? null : 'game_management.refused.not_your_seat';
    case 'gm.challenge':
      if (!view.challenge) return 'game_management.refused.not_your_seat';
      if (!view.challenge.enabled) return view.challenge.reasonKey ?? 'game_management.refused.not_legal';
      return view.challenge.aspects.includes(c.aspect) ? null : 'game_management.refused.not_reviewable';
    case 'gm.decide':
    case 'gm.recommend': {
      const bar = view.bar;
      if (!bar || bar.id !== c.decisionId) return 'game_management.refused.no_such_decision';
      if (bar.mode !== (c.type === 'gm.decide' ? 'decide' : 'recommend')) return 'game_management.refused.not_your_seat';
      return bar.options.some((o) => o.id === c.optionId) ? null : 'game_management.refused.not_an_option';
    }
    default:
      return null;
  }
}

/** The command the timer sends at zero (I5.1.1): the standing instruction, else the default, logged as which. */
export function expiryCommand(view: GameManagementView): GameManagementCommand | null {
  const bar = view.bar;
  if (!bar || bar.secondsLeft > 0 || bar.mode !== 'decide') return null;
  return {
    type: 'gm.decide', gameId: view.gameId, decisionId: bar.id, kind: bar.kind, optionId: bar.onExpiry.optionId,
    decidedBy: bar.onExpiry.by, shown: { chartOption: bar.chart?.option ?? null, advisorOption: bar.advisor?.optionId ?? null },
  };
}
