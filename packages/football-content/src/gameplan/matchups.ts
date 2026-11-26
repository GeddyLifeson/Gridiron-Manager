// Matchup hunting (G6.3.1) and the protection plan (G6.3.2). Matchups apply the opponent's scouted
// alignment rules as the staff believes them (G2 rules, H2 samples); the tool is exactly as right as the
// scouting. The predictor is injected: the world package wires it to the G2 alignment code with the
// scouted rule set, so a perfect-scouting test reproduces the engine's alignment.
import type { Playbook } from '../playbook/index.ts';
import { param } from './params.ts';
import type { MenuEntry, PlanWarning, ProtectionAnswer } from './plan.ts';

export interface FormationOption { readonly formationId: string; readonly motionId: string | null }
/** One scouted rule the prediction used (strength call, matching table, motion rule) and how often it was seen. */
export interface RuleUse { readonly rule: string; readonly seen: number }
export interface Prediction { readonly defender: string; readonly rules: readonly RuleUse[] }
/** Who ends up over the target in this formation and motion; null when the opponent has shown no rule for it. */
export type AlignmentPredictor = (opt: FormationOption, targetSlot: string) => Prediction | null;

export interface MatchupTarget { readonly id: string; readonly targetSlot: string; readonly playerId: string; readonly wanted: readonly string[] }
export interface MatchupResult {
  readonly option: FormationOption;
  /** "unscouted" when no rule is known for this formation (G6.3.1 edge case). */
  readonly defender: string | null;
  readonly wanted: boolean;
  /** Lowest sample among the rules used, shown as "seen n times". */
  readonly seen: number;
  readonly thin: boolean;
  readonly unscouted: boolean;
  readonly menuUses: number;
}

/** G6.3.1 procedure: every formation and motion, scouted defender over the target, sorted by confidence then menu use. */
export function huntMatchup(target: MatchupTarget, options: readonly FormationOption[], predict: AlignmentPredictor, menu: readonly MenuEntry[], book: Playbook): MatchupResult[] {
  const uses = (f: string): number => menu.filter((m) => book.plays.get(m.call.playId)?.parts.formation === f).length;
  return options.map((option): MatchupResult => {
    const p = predict(option, target.targetSlot);
    if (!p) return { option, defender: null, wanted: false, seen: 0, thin: true, unscouted: true, menuUses: uses(option.formationId) };
    const seen = p.rules.length === 0 ? 0 : Math.min(...p.rules.map((r) => r.seen));
    return { option, defender: p.defender, wanted: target.wanted.includes(p.defender), seen, thin: seen < param('matchup.thinSeen'), unscouted: false, menuUses: uses(option.formationId) };
  }).sort((a, b) => Number(b.wanted) - Number(a.wanted) || b.seen - a.seen || b.menuUses - a.menuUses
    || (a.option.formationId + (a.option.motionId ?? '') < b.option.formationId + (b.option.motionId ?? '') ? -1 : 1));
}

// ---- G6.3.2 Protection plan ------------------------------------------------------------------------------

export interface Threat {
  readonly id: string;
  readonly kind: 'rusher' | 'pressure';
  /** The named rusher's id, or the pressure's name, and the situations it shows up in. */
  readonly name: string;
  readonly situationIds: readonly string[];
  readonly primary: ProtectionAnswer;
  readonly alternate?: ProtectionAnswer;
}

/** What an answer costs, from the engine's play data (F5 owns the chip time). */
export interface AnswerCost { readonly answer: ProtectionAnswer; readonly text: string; readonly routesLost: number; readonly releaseDelayS: number; readonly depthCapped: boolean }
export function answerCost(a: ProtectionAnswer, chipTimeS: number): AnswerCost {
  switch (a) {
    case 'chip': return { answer: a, text: `the chipping player releases ${chipTimeS.toFixed(1)} s late`, routesLost: 0, releaseDelayS: chipTimeS, depthCapped: false };
    case 'seventh_protector': return { answer: a, text: 'one route removed', routesLost: 1, releaseDelayS: 0, depthCapped: false };
    case 'slide': return { answer: a, text: 'the back or tight end is left on the rusher away from the slide', routesLost: 0, releaseDelayS: 0, depthCapped: false };
    case 'quick': return { answer: a, text: 'throw depth capped', routesLost: 0, releaseDelayS: 0, depthCapped: true };
    case 'move_pocket': return { answer: a, text: 'half-field read', routesLost: 0, releaseDelayS: 0, depthCapped: false };
    case 'screen': return { answer: a, text: 'answer only on screen calls', routesLost: 0, releaseDelayS: 0, depthCapped: false };
  }
}

const DROPBACK = new Set(['dropback', 'play_action', 'movement']);
/** Whether a plan answer can apply to a pass from this section: quick only on quick game, screen only on screens. */
export function answerApplies(a: ProtectionAnswer, section: string | undefined): boolean {
  if (section === undefined) return false;
  if (a === 'quick') return section === 'quick';
  if (a === 'screen') return section === 'screen';
  return DROPBACK.has(section) || section === 'quick';
}

export interface ProtectionCell { readonly entryId: string; readonly threatId: string; readonly answer: ProtectionAnswer | null }

/** G6.3.2 acceptance: every menu pass shows, for each threat, an answer or a flag (answer null). */
export function protectionMatrix(threats: readonly Threat[], menu: readonly MenuEntry[], book: Playbook): ProtectionCell[] {
  const out: ProtectionCell[] = [];
  for (const m of menu) {
    const p = book.plays.get(m.call.playId);
    const sec = p?.section[0];
    if (m.side !== 'offense' || sec === undefined || !(DROPBACK.has(sec) || sec === 'quick' || sec === 'screen')) continue;
    for (const t of threats) {
      const own = m.protection?.[t.id];
      const pick = own ?? [t.primary, t.alternate].find((a): a is ProtectionAnswer => a !== undefined && answerApplies(a, sec)) ?? null;
      out.push({ entryId: m.id, threatId: t.id, answer: pick });
    }
  }
  return out;
}

export function checkThreats(threats: readonly Threat[], cells: readonly ProtectionCell[]): PlanWarning[] {
  const w: PlanWarning[] = [];
  const rushers = threats.filter((t) => t.kind === 'rusher').length, pressures = threats.length - rushers;
  if (rushers > param('protection.maxRushers')) w.push({ leaf: 'G6.3.2', code: 'protection.rushers', subject: 'plan', text: `${rushers} named rushers (up to ${param('protection.maxRushers')})`, severity: 'warning' });
  if (pressures > param('protection.maxPressures')) w.push({ leaf: 'G6.3.2', code: 'protection.pressures', subject: 'plan', text: `${pressures} named pressures (up to ${param('protection.maxPressures')})`, severity: 'warning' });
  for (const c of cells) if (c.answer === null) w.push({ leaf: 'G6.3.2', code: 'protection.unanswered', subject: `${c.entryId}/${c.threatId}`, text: `${c.entryId} has no answer to ${c.threatId}`, severity: 'warning' });
  return w;
}
