// Keys of the game management panel (O2.1.2, O2.4, O2.5.2, O2.5.3). Actions come from the live key map, so
// a remapped key works and shows correctly. Bar options use `prompt.option_n` in the `console.prompt`
// context; those bindings are proposed here (PROMPT_BINDINGS) for the integrator to add to the default map
// (CR-G61-4). Rare irreversible keys hold to confirm: a single tap sends nothing, a held key does.
import { actionFor, displayChord, type Binding } from '../../shell/index.ts';
import type { GameManagementCommand, GameManagementView } from './types.ts';

export const PROMPT_BINDINGS: readonly Binding[] = [1, 2, 3, 4].map((n) => ({ context: 'console.prompt', action: `prompt.option_${n}`, keys: [`Digit${n}`], device: 'keyboard' as const }));

/** The context stack while the panel shows, outermost first (shell order): a bar puts the prompt context innermost so it takes the digit keys. */
export function panelContexts(view: GameManagementView, side: 'console.offense' | 'console.defense' | 'console.special'): string[] {
  return view.bar ? ['global', side, 'console.prompt'] : ['global', side];
}

/** The key shown for an action in the current map, or '' when unbound. */
export function keyFor(action: string, contexts: readonly string[], bindings: readonly Binding[]): string {
  for (let i = contexts.length - 1; i >= 0; i--) {
    const c = contexts[i]!;
    const b = bindings.find((x) => x.context === c && x.action === action && x.keys.length > 0);
    if (b) return displayChord(b.keys[0]!);
  }
  return '';
}

export type PanelIntent =
  | { readonly kind: 'command'; readonly command: GameManagementCommand; readonly guarded: boolean }
  | { readonly kind: 'tab'; readonly tab: 'messages' | 'injuries' }
  | { readonly kind: 'open_aspects' };

/** What a chord does on the panel now, or null. Nothing here checks legality beyond the view's copy. */
export function intentFor(chord: string, view: GameManagementView, contexts: readonly string[], bindings: readonly Binding[]): PanelIntent | null {
  const action = actionFor(chord, contexts, bindings);
  if (!action) return null;
  const g = view.gameId;
  if (action === 'call.timeout' && view.timeout?.enabled) return { kind: 'command', command: { type: 'gm.timeout', gameId: g }, guarded: view.timeout.guarded };
  if (action === 'call.timeout' && view.seat === 'coordinator') return { kind: 'command', command: { type: 'gm.timeout_request', gameId: g }, guarded: false };
  if (action === 'call.challenge' && view.challenge?.enabled) return { kind: 'open_aspects' };
  if (action === 'booth.list') return { kind: 'tab', tab: 'messages' };
  if (action === 'panel.tab_3') return { kind: 'tab', tab: 'injuries' };
  const m = /^prompt\.option_(\d)$/.exec(action);
  if (m && view.bar && !view.bar.noticeOnly) {
    const o = view.bar.options[Number(m[1]) - 1];
    if (!o) return null;
    const bar = view.bar;
    const command: GameManagementCommand = bar.mode === 'decide'
      ? { type: 'gm.decide', gameId: g, decisionId: bar.id, kind: bar.kind, optionId: o.id, decidedBy: 'user', shown: { chartOption: bar.chart?.option ?? null, advisorOption: bar.advisor?.optionId ?? null } }
      : { type: 'gm.recommend', gameId: g, decisionId: bar.id, optionId: o.id };
    return { kind: 'command', command, guarded: o.guarded };
  }
  return null;
}

/** Hold-to-confirm (O2.5.3). The hold time counts against the play clock: the caller keeps real time. */
export interface Hold { readonly intent: PanelIntent; readonly downAtMs: number }

export function release(hold: Hold | null, upAtMs: number, holdS: number): GameManagementCommand | null {
  if (!hold || hold.intent.kind !== 'command') return null;
  if (!hold.intent.guarded) return hold.intent.command;
  return upAtMs - hold.downAtMs >= holdS * 1000 ? hold.intent.command : null;
}
