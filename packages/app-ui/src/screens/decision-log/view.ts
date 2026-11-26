// The parts of the decision log read model (app-services read-models/decision-log) the screen shows.
// Declared here because app-ui imports only the app-services entry point. No truth-view field exists here:
// a career review shows the staff version of the model with its range (N3.1.2, N3.3.1 rule 2).
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const dlTextIds = (): string[] => Object.keys(STRINGS);
export function dt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export type DecisionClass = 'clearly_right' | 'toss_up' | 'clearly_wrong';

export type UiModelLine =
  | { readonly kind: 'game_management'; readonly best: string; readonly bestLabelKey: string; readonly cost: number; readonly margin: number; readonly class: DecisionClass; readonly lacks: readonly string[]; readonly sparse: boolean;
      readonly options: readonly { readonly optionId: string; readonly labelKey: string; readonly value: number; readonly low: number; readonly high: number; readonly sparse: boolean }[] }
  | { readonly kind: 'play_call'; readonly foresight: number; readonly foresightSample: number; readonly predictability: number }
  | { readonly kind: 'follow_up'; readonly due: readonly string[]; readonly done: readonly { readonly dueDate: string; readonly bandsOverlapped: boolean; readonly people: number }[] }
  | { readonly kind: 'pending' };

export interface UiDecisionRow {
  readonly id: string; readonly worldDate: string; readonly gameId: number | null; readonly playIndex: number | null; readonly period: number | null; readonly clockTenths: number | null;
  readonly type: string; readonly scope: 'game' | 'week'; readonly owner: string;
  readonly actor: 'user' | 'ai' | 'staff' | 'default'; readonly actorId: number | null; readonly credited: number;
  readonly basis: 'own_decision' | 'suggestion_taken' | 'delegated' | 'logged_under_boss'; readonly viaId: number | null;
  readonly chosen: string; readonly chosenLabelKey: string; readonly notMade: boolean;
  readonly information: readonly { readonly source: string; readonly viewed: boolean }[];
  readonly secondsToDecide: number;
  readonly model: UiModelLine;
  readonly outcome: { readonly result: unknown; readonly luck: { readonly expected: number; readonly actual: number } | null } | null;
  readonly supersededBy: readonly string[]; readonly supersedes: string | null;
}

export interface UiDecisionLog {
  readonly rows: readonly UiDecisionRow[];
  readonly total: number;
  readonly types: readonly string[];
  readonly games: readonly number[];
  readonly summary: { readonly clearlyRight: number; readonly tossUp: number; readonly clearlyWrong: number; readonly costTotal: number; readonly pendingModel: number };
}

export interface UiDecisionFilter {
  readonly scope: 'game' | 'week' | 'all';
  readonly type: string | null;
  readonly gameId: number | null;
  readonly who: 'mine' | 'staff' | 'all';
  readonly clearlyWrongOnly: boolean;
}

export const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
export const clock = (tenths: number): string => {
  const s = Math.floor(tenths / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
