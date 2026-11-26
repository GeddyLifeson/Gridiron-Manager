// What the calling console (G-60, O2.4.2) and the coordinator's kicking-game mix (K4.6.1) read from the menu:
// one group per special-teams sheet box with each call as a call template (the schema call minus players;
// the console adds whoever the depth chart sends). app-services and coach-ai take this shape through their
// own ports, so neither imports this package (P1.2.1); data/special-teams/*.json is the committed copy.
import type { KickCall, OffenseCall, ReturnCall, RuleSet } from '@gm/schema';
import { contentHash, menuFor, toKickCall, toReturnCall } from './calls.ts';
import type { ScrimmageDef, SheetKind, SpecialCallDef } from './types.ts';

export type CallTemplate = Omit<KickCall, 'players'> | Omit<ReturnCall, 'players'> | Omit<OffenseCall, 'players'>;

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly call: CallTemplate;
  readonly fake: boolean;
  /** Coordinator floor share for a fake; null otherwise. */
  readonly fakeShare: number | null;
  readonly requiredLook: string | null;
}

export interface MenuGroup { readonly kind: SheetKind; readonly title: string; readonly items: readonly MenuItem[] }

/** Box titles in the order of the G7.7.2 template, then two-point plays. */
export const GROUP_TITLES: Readonly<Record<SheetKind, string>> = {
  kickoff: 'Kickoff', kickoff_return: 'Kickoff return', punt: 'Punt', punt_return: 'Punt return or rush', field_goal: 'Field goal and try',
  field_goal_block: 'Field goal block', onside: 'Onside', hands_team: 'Hands team', try: 'Two-point plays',
};

/**
 * The template of one call. A fake or two-point play is an offensive call; its personnel code comes from the
 * team's depth chart for the unit on the field, so the caller passes it (G1.1.1 codes are not content).
 */
export function templateOf(def: SpecialCallDef, personnelCode: string): CallTemplate {
  if (def.unit === 'kick') { const { players: _p, ...t } = toKickCall(def, []); return t; }
  if (def.unit === 'return') { const { players: _p, ...t } = toReturnCall(def, []); return t; }
  const d: ScrimmageDef = def;
  return {
    unit: 'offense', playContentId: d.id, contentHash: contentHash(d), kind: d.playKind, personnelCode, formationId: null, strength: null, motionId: null,
    protectionId: null, tags: d.fake ? ['fake', `from_${d.from}`] : [`from_${d.from}`], runDirection: null, shotgun: false, tempo: 'huddle',
  };
}

/** Every box with its legal calls under the rule set. Boxes with no legal call are left out. */
export function menuGroups(rules: Pick<RuleSet, 'keys' | 'bool' | 'opt'>, personnelOf: (def: SpecialCallDef) => string): MenuGroup[] {
  return (Object.keys(GROUP_TITLES) as SheetKind[]).map((kind) => ({
    kind, title: GROUP_TITLES[kind],
    items: menuFor(rules, kind).map((d) => ({
      id: d.id, label: d.name, call: templateOf(d, personnelOf(d)),
      fake: d.unit === 'offense' && d.fake, fakeShare: d.unit === 'offense' ? d.fakeShare : null, requiredLook: d.unit === 'offense' ? d.requiredLook : null,
    })),
  })).filter((g) => g.items.length > 0);
}
