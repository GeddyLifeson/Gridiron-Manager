// Helpers over the special-teams menu: rule filtering, schema calls, content hashes, coordinator options.
// Pure: no clock, random, file or locale (P1.1.1).
import type { FieldedPlayer, KickCall, ReturnCall, RuleSet } from '@gm/schema';
import { SPECIAL_CALLS } from './menu.ts';
import type { KickDef, ReturnDef, RuleCond, ScrimmageDef, SheetKind, SpecialCallDef } from './types.ts';

export const SPECIAL_CALL_BY_ID: ReadonlyMap<string, SpecialCallDef> = new Map(SPECIAL_CALLS.map((c) => [c.id, c]));

type Rules = Pick<RuleSet, 'keys' | 'bool' | 'opt'>;

/** True when the rule set holds the value. A key the rule set lacks fails the condition (no level is tested). */
export function ruleHolds(rules: Rules, c: RuleCond): boolean {
  if (!rules.keys().includes(c.key)) return false;
  return typeof c.is === 'boolean' ? rules.bool(c.key) === c.is : rules.opt(c.key) === c.is;
}

export function availableUnder(def: SpecialCallDef, rules: Rules): boolean {
  return def.when.every((c) => ruleHolds(rules, c));
}

/** The calls legal under the rule set, optionally for one sheet box, in menu order. */
export function menuFor(rules: Rules, sheetKind?: SheetKind): SpecialCallDef[] {
  return SPECIAL_CALLS.filter((c) => (sheetKind === undefined || c.sheetKind === sheetKind) && availableUnder(c, rules));
}

/** FNV-1a over the call's content, as 8 hex digits. Changes when the call's football changes (P4 content hash). */
export function contentHash(def: SpecialCallDef): string {
  const text = JSON.stringify(def);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** The kick call the engine receives. A kickoff call made for a free kick after a safety becomes a safety kick. */
export function toKickCall(def: KickDef, players: readonly FieldedPlayer[], opts: { safetyKick?: boolean } = {}): KickCall {
  const kickKind = opts.safetyKick === true && def.kickKind === 'kickoff' ? 'safety_kick' : def.kickKind;
  return { unit: 'kick', kickKind, callContentId: def.id, contentHash: contentHash(def), direction: def.direction, players: [...players] };
}

/** The return or block call. A field goal block called against a try becomes a try block. */
export function toReturnCall(def: ReturnDef, players: readonly FieldedPlayer[], opts: { onTry?: boolean } = {}): ReturnCall {
  const returnKind = opts.onTry === true && def.returnKind === 'field_goal_block' ? 'try_block' : def.returnKind;
  return { unit: 'return', returnKind, callContentId: def.id, contentHash: contentHash(def), players: [...players] };
}

/**
 * The menu as the coordinator's kicking-game mix reads it (coach-ai K4.6.1 `SpecialOption`): his own estimate
 * of each call's gain comes in from his preparation (K3.2.1); fakes carry their floor share.
 */
export interface SpecialMenuOption { readonly callId: string; readonly estimatedGain: number; readonly fake: boolean; readonly fakeShare?: number }
export function specialOptions(defs: readonly SpecialCallDef[], estimatedGain: (def: SpecialCallDef) => number): SpecialMenuOption[] {
  return defs.map((d) => {
    const fake = d.unit === 'offense' && d.fake;
    return fake ? { callId: d.id, estimatedGain: estimatedGain(d), fake, fakeShare: (d as ScrimmageDef).fakeShare ?? 0 } : { callId: d.id, estimatedGain: estimatedGain(d), fake };
  });
}

/** Which sheet box a kick or return kind of the engine (I4 request) is called from. */
export function sheetKindFor(kind: KickCall['kickKind'] | ReturnCall['returnKind'] | 'try'): SheetKind {
  switch (kind) {
    case 'kickoff': case 'safety_kick': return 'kickoff';
    case 'onside_kick': return 'onside';
    case 'punt': return 'punt';
    case 'field_goal': case 'try_kick': case 'fair_catch_kick': return 'field_goal';
    case 'punt_return': case 'punt_block': return 'punt_return';
    case 'kick_return': return 'kickoff_return';
    case 'hands_team': return 'hands_team';
    case 'field_goal_block': case 'try_block': return 'field_goal_block';
    case 'try': return 'try';
  }
}
