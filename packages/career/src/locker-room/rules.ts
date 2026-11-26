// The offence catalogue and the team rule list set in camp (L3.1.1). Rule rows are data; the coach turns
// them on, sets the penalty scale (labour agreement: a percent of the allowed maximum; school code: a
// consequence from the L3.5.1 menu) and who enforces each one. Publishing is never blocked: a row past a
// labour-agreement limit gets a warning naming the limit and may still be published (L3.1.1, L8.2.5).
import offencesJson from './offences.json' with { type: 'json' };
import type { DisciplineRules, ScheduleGroup } from './keys.ts';
import { clamp, lp } from './params.ts';

export interface Offence {
  readonly id: string;
  readonly label: string;
  readonly group: ScheduleGroup | null;
  readonly clause: string | null;
  readonly clauseInferred: boolean;
  /** Counts toward the conduct-detrimental predicate (Art. 42 Sec. 3(a), L3.2.4). */
  readonly predicate: boolean;
  /** The 40/70/100 ladder applies (not to camp, minicamp or conduct detrimental, L3.2.2). */
  readonly ladder: boolean;
  readonly dailyCap: boolean;
  readonly payPeriodLimit: boolean;
  readonly minor: boolean;
  readonly neutralWorkplace: boolean;
  readonly weeklyBase: number;
  readonly conductSingleAct?: boolean;
  readonly singleActStatus?: string;
  readonly models: readonly ('labour_agreement' | 'school_code')[];
}

export const OFFENCES: readonly Offence[] = (offencesJson as { offences: Offence[] }).offences;
const byId = new Map(OFFENCES.map((o) => [o.id, o]));

export function offence(id: string): Offence {
  const o = byId.get(id);
  if (!o) throw new Error(`career.locker_room: unknown offence ${id}`);
  return o;
}

/** A row is a labour-agreement listed offence when it maps to a fine schedule group. */
export const isListed = (o: Offence): boolean => o.group !== null;

export type Enforcer = 'head_coach' | 'position_coach' | 'player_council';

/** School code consequence menu (L3.5.1), lightest to heaviest. */
export const COLLEGE_CONSEQUENCES = [
  'warning', 'written_reprimand', 'probation', 'restitution', 'loss_of_privileges', 'extra_conditioning',
  'playing_time', 'suspension_part_game', 'travel_roster_removal', 'aid_reduction', 'dismissal',
] as const;
export type CollegeConsequence = (typeof COLLEGE_CONSEQUENCES)[number];

export interface TeamRuleRow {
  readonly offenceId: string;
  readonly on: boolean;
  /**
   * Labour agreement: penalty scale as a share of the allowed maximum (1 = the step maximum; above 1 is past
   * the CBA limit). Rows with no fine group use it only for strictness (playing time standards).
   */
  readonly penaltyShare: number;
  /** School code: the listed consequence. */
  readonly consequence: CollegeConsequence | null;
  readonly enforcer: Enforcer;
  /** A fineable item the CBA does not list (L3.1.1 last rule): allowed after a warning, logged per fine. */
  readonly offList?: boolean;
}

export interface RuleChange {
  readonly day: number;
  readonly offenceId: string;
  readonly from: TeamRuleRow | null;
  readonly to: TeamRuleRow;
  /** The change came after this player's violation (raising reads as aimed at him, loosening after a star costs consistency). */
  readonly afterViolationBy: number | null;
}

export interface TeamRuleList {
  readonly teamId: number;
  readonly model: 'labour_agreement' | 'school_code';
  readonly rows: readonly TeamRuleRow[];
  /** League-year day of publication, or null while still a draft. */
  readonly publishedDay: number | null;
  readonly history: readonly RuleChange[];
}

export type Preset = 'culture_file' | 'strict' | 'player_led' | 'saved';

/** Build the starting rows for a preset (L3.1.1). `culture_file` and `saved` rows come from the caller (data). */
export function presetRows(preset: Preset, model: TeamRuleList['model'], fromData: readonly TeamRuleRow[] = []): TeamRuleRow[] {
  if (preset === 'culture_file' || preset === 'saved') return fromData.map((r) => ({ ...r }));
  const strict = preset === 'strict';
  return OFFENCES.filter((o) => o.models.includes(model) && (o.minor || o.conductSingleAct !== true)).map((o) => ({
    offenceId: o.id,
    on: true,
    penaltyShare: strict ? 1 : 0.5,
    consequence: model === 'school_code' ? (strict ? 'playing_time' : 'warning') : null,
    enforcer: strict ? 'head_coach' : o.minor ? 'player_council' : 'head_coach',
  }));
}

/** School code consequence as a share of the heaviest (for strictness). */
export function consequenceShare(c: CollegeConsequence | null): number {
  if (c === null) return 0;
  return COLLEGE_CONSEQUENCES.indexOf(c) / (COLLEGE_CONSEQUENCES.length - 1);
}

/** Strictness 0 to 100 = mean penalty percent over the rules that are on (L3.1.1). Capped at 100. */
export function strictness(list: Pick<TeamRuleList, 'rows' | 'model'>): number {
  const on = list.rows.filter((r) => r.on);
  if (on.length === 0) return 0;
  const max = lp('scale.max');
  const s = on.reduce((acc, r) => acc + clamp(list.model === 'school_code' ? consequenceShare(r.consequence) : r.penaltyShare, 0, 1), 0) / on.length;
  return s * max;
}

export interface PublishWarning {
  readonly offenceId: string;
  readonly kind: 'above_maximum' | 'off_list';
  /** Text key naming the CBA limit (template engine). */
  readonly limitText: string;
}

/** Warnings shown before publishing (L3.1.1 acceptance). Only the labour agreement model has limits here. */
export function publishWarnings(list: Pick<TeamRuleList, 'rows' | 'model'>, d: DisciplineRules): PublishWarning[] {
  if (d.model !== 'labour_agreement') return [];
  const out: PublishWarning[] = [];
  for (const r of list.rows) {
    if (!r.on) continue;
    if (r.offList) out.push({ offenceId: r.offenceId, kind: 'off_list', limitText: 'locker_room.limit.cba_list_art42_1b' });
    else if (r.penaltyShare > 1 && isListed(offence(r.offenceId))) out.push({ offenceId: r.offenceId, kind: 'above_maximum', limitText: 'locker_room.limit.cba_schedule_max' });
  }
  return out;
}

/** Publish (or reissue) the list. Warnings must be acknowledged; nothing is refused. */
export function publish(list: TeamRuleList, day: number, acknowledged: readonly PublishWarning[], d: DisciplineRules): TeamRuleList {
  const need = publishWarnings(list, d);
  const missing = need.filter((w) => !acknowledged.some((a) => a.offenceId === w.offenceId && a.kind === w.kind));
  if (missing.length > 0) throw new Error(`career.locker_room: publish needs the warning shown first for ${missing.map((m) => m.offenceId).join(', ')} (L3.1.1)`);
  return { ...list, publishedDay: day };
}

export interface ChangeEffects {
  /** Trust change for the player whose violation preceded a raise (L3.1.1). */
  readonly targetedTrust: { readonly playerId: number; readonly delta: number } | null;
  /** Consistency change for loosening after a star's violation. */
  readonly consistencyDelta: number;
}

/** Change one row mid-season (allowed, at a cost, L3.1.1). `afterStar` says the preceding violator was a star (L3.3.2). */
export function changeRow(list: TeamRuleList, to: TeamRuleRow, day: number, afterViolationBy: number | null, afterStar: boolean): { list: TeamRuleList; effects: ChangeEffects } {
  const from = list.rows.find((r) => r.offenceId === to.offenceId) ?? null;
  const rows = from ? list.rows.map((r) => (r.offenceId === to.offenceId ? to : r)) : [...list.rows, to];
  const sev = (r: TeamRuleRow | null): number => (r === null || !r.on ? 0 : list.model === 'school_code' ? consequenceShare(r.consequence) : r.penaltyShare);
  const raised = sev(to) > sev(from);
  const loosened = sev(to) < sev(from);
  const effects: ChangeEffects = {
    targetedTrust: raised && afterViolationBy !== null && list.publishedDay !== null ? { playerId: afterViolationBy, delta: lp('rules.raiseAfterViolationTrust') } : null,
    consistencyDelta: loosened && afterViolationBy !== null && afterStar ? lp('rules.loosenAfterStarConsistency') : 0,
  };
  return { list: { ...list, rows, history: [...list.history, { day, offenceId: to.offenceId, from, to, afterViolationBy }] }, effects };
}

/**
 * Starting buy-in change for a veteran when the list is stricter than the culture file tolerates (L3.1.1):
 * up to -5 once the gap passes the wide margin, softened by the coach's respect.
 */
export function veteranBuyInHit(listStrictness: number, cultureTolerance: number, respectForCoach: number): number {
  const gap = listStrictness - cultureTolerance;
  const wide = lp('rules.toleranceGapWide');
  if (gap <= wide) return 0;
  const max = lp('scale.max');
  const share = clamp((gap - wide) / (max - wide), 0, 1);
  return lp('rules.veteranBuyInMax') * share * (1 - clamp(respectForCoach, 0, max) / max);
}

/** Extra weekly stress inflow from a strict list for a player with a low discipline facet (L3.1.1). */
export function strictStressInflow(listStrictness: number, disciplineFacet: number): number {
  return disciplineFacet < lp('rules.lowDisciplineBelow') ? (lp('rules.strictStress') * listStrictness) / lp('scale.max') : 0;
}
