// The league injury report (D11.5.1, H5.2.1 to H5.2.3). The staff draft is always truthful; the head
// coach files. Labels come from data/designations.json under `medical.injury_report_rule` (W-13), so
// a level with no report rule files nothing. Filing away from the truth is the G-28 class
// `injury_report_shading` (C11.3.1); this file raises the flags and builds the act, G-28 detects.
import { possible, type WorldDate, type WorldTier } from '@gm/schema';
import type { Act, PartyRef } from '../compliance/index.ts';
import designations from './data/designations.json' with { type: 'json' };
import rates from './data/rates.json' with { type: 'json' };
import type { MedicalRules, ReportRule } from './keys.ts';
import { P } from './params.ts';
import type { MedicalCase, Participation } from './types.ts';
import { protocolDef } from './concussion.ts';

export interface RateRow {
  readonly id: string; readonly statement: string; readonly value: number; readonly targetLow: number; readonly targetHigh: number;
  readonly factId: string | null; readonly leaf: string; readonly requested?: string; readonly basis?: string;
}
export const RATES: readonly RateRow[] = rates.rows;
export function rate(id: string): RateRow {
  const r = RATES.find((x) => x.id === id);
  if (!r) throw new Error(`league.medical: no rate row ${id}`);
  return r;
}

interface ParticipationDef { readonly id: string; readonly label: string; readonly minShare: number | null; readonly injuryRelated: boolean }
interface StatusDef { readonly id: string; readonly label: string; readonly meaning: string; readonly rateId: string }
interface ReportDef { readonly participation: readonly ParticipationDef[]; readonly gameStatus: readonly StatusDef[]; readonly unlistedRateId: string | null }

export function reportDef(rule: ReportRule): ReportDef {
  return (designations.rules as Record<string, ReportDef>)[rule]!;
}

export type ReportLabel = Participation | 'nir';
/** A filed game status id, or null for "no status" (certain to play). */
export type GameStatusId = string | null;

/**
 * Report days: the last `medical.report_practice_days` practice days before the game (H5.2.1 rule 1), so
 * Wednesday to Friday for a Sunday game, Monday to Wednesday for Thursday, Thursday to Saturday for Monday.
 * Game status is filed on the last of them. None when the level has no report rule.
 */
export function reportDays(practiceDays: readonly number[], gameDay: number, mr: MedicalRules): number[] {
  if (reportDef(mr.reportRule).participation.length === 0) return [];
  const before = [...new Set(practiceDays)].filter((d) => d < gameDay).sort((a, b) => a - b);
  return before.slice(Math.max(0, before.length - mr.reportPracticeDays));
}

/** The label implied by the recorded share of normal reps (H5.2.1 rule 2): full at 100 percent, limited below, none at zero. */
export function labelFromShare(repShare: number, injuryRelated: boolean, mr: MedicalRules): ReportLabel {
  const def = reportDef(mr.reportRule);
  if (!injuryRelated) return 'nir';
  const full = def.participation.find((p) => p.id === 'full')!;
  if (repShare >= full.minShare!) return 'full';
  return repShare > 0 ? 'limited' : 'dnp';
}

/** Who must be listed (H5.2.1 rule 3): missed or left the last game, missed practice time, or limited. */
export interface ListingFacts {
  readonly personId: number;
  readonly missedOrLeftLastGame: boolean;
  readonly repShare: number;
  readonly injuryRelated: boolean;
  /** Limited by the staff even with every rep taken (rule 3: listed even when he took every rep). */
  readonly limitedByStaff: boolean;
  readonly bodyPart: string | null;
}

export function mustList(f: ListingFacts): boolean {
  if (!f.injuryRelated) return f.repShare < 1;
  return f.missedOrLeftLastGame || f.repShare < 1 || f.limitedByStaff;
}

export interface PracticeReportRow { readonly personId: number; readonly label: ReportLabel; readonly bodyPart: string | null }

/** The truthful staff draft for one practice day. */
export function draftPracticeReport(facts: readonly ListingFacts[], mr: MedicalRules): PracticeReportRow[] {
  if (reportDef(mr.reportRule).participation.length === 0) return [];
  return facts.filter(mustList).map((f) => ({ personId: f.personId, label: labelFromShare(f.repShare, f.injuryRelated, mr), bodyPart: f.injuryRelated ? f.bodyPart : null }));
}

/** Validate a game status id: only the rule's statuses or null. There is no "Probable" (D11.5.1). */
export function isStatus(id: GameStatusId, mr: MedicalRules): boolean {
  return id === null || reportDef(mr.reportRule).gameStatus.some((g) => g.id === id);
}

/** Measured play rate of a status (calibration rows; AI and staff quote these when advising, D11.5.1). */
export function playRateOf(id: GameStatusId, mr: MedicalRules): number {
  const def = reportDef(mr.reportRule);
  if (id === null) return def.unlistedRateId ? rate(def.unlistedRateId).value : 1;
  const g = def.gameStatus.find((x) => x.id === id);
  if (!g) throw new Error(`league.medical: ${id} is not a game status under ${mr.reportRule}`);
  return rate(g.rateId).value;
}

/** The status whose measured play rate is nearest the staff's chance that he plays (the draft proposal). */
export function statusForChance(chance: number, mr: MedicalRules): GameStatusId {
  const def = reportDef(mr.reportRule);
  const options: GameStatusId[] = [...def.gameStatus.map((g) => g.id), null];
  let best: GameStatusId = null;
  let gap = Infinity;
  for (const o of options) {
    const d = Math.abs(playRateOf(o, mr) - chance);
    if (d < gap) { gap = d; best = o; }
  }
  return best;
}

/**
 * The staff's chance he plays in `daysToGame` days, from the shown state only (never the truth):
 * cleared reads as the unlisted rate, limits as at least the Questionable rate, not cleared as the share of
 * the shown range that falls before the game; a concussion by steps left against days left.
 */
export function staffPlayChance(c: MedicalCase, daysToGame: number, mr: MedicalRules): number {
  if (!c.shown.known || c.shown.state === 'cleared') return possible(playRateOf(null, mr));
  if (c.protocol) {
    const left = protocolDef(c.protocol.protocol).steps.length - c.protocol.step + 1;
    if (left < daysToGame) return possible(rate('play_rate_questionable').value);
    if (left === daysToGame) return possible(rate('play_rate_doubtful').value);
    return possible(rate('play_rate_out').value);
  }
  const r = c.shown.rangeDays;
  const fromRange = r ? Math.min(1, Math.max(0, (daysToGame - r[0]) / (r[1] - r[0] + 1))) : 0;
  return possible(c.shown.state === 'cleared_with_limits' ? Math.max(fromRange, rate('play_rate_questionable').value) : fromRange);
}

/** The staff warns when the filed status is far from the medical outlook (D11.5.1 last rule). */
export function statusWarning(filed: GameStatusId, staffChance: number, mr: MedicalRules): boolean {
  return Math.abs(playRateOf(filed, mr) - staffChance) > P('statusWarnGap');
}

export type ReportFlagKind = 'unlisted_injury' | 'wrong_participation' | 'status_inconsistent' | 'invalid_status';
export interface ReportFlag { readonly personId: number; readonly kind: ReportFlagKind; readonly day: number }

/**
 * Compare a filed practice report with the truthful draft (H5.2.3 rule 1). Run before submission it is
 * the warning (D11.5.1 acceptance); after it, a filed difference is the shading act. A truthful report
 * raises nothing.
 */
export function compareFiled(day: number, draft: readonly PracticeReportRow[], filed: readonly PracticeReportRow[]): ReportFlag[] {
  const out: ReportFlag[] = [];
  const f = new Map(filed.map((r) => [r.personId, r]));
  for (const d of draft) {
    const x = f.get(d.personId);
    if (!x) out.push({ personId: d.personId, kind: 'unlisted_injury', day });
    else if (x.label !== d.label) out.push({ personId: d.personId, kind: 'wrong_participation', day });
  }
  return out;
}

/**
 * After the game (H5.2.2 rule 3): a player with no status who sits for injury, or one declared Out who is
 * fit and dressed or was never hurt, are signals every time.
 */
export function compareWithGame(personId: number, day: number, filed: GameStatusId, inactiveForInjury: boolean, fitToPlay: boolean, mr: MedicalRules): ReportFlag[] {
  if (!isStatus(filed, mr)) return [{ personId, kind: 'invalid_status', day }];
  if (filed === null && inactiveForInjury) return [{ personId, kind: 'status_inconsistent', day }];
  if (filed !== null && playRateOf(filed, mr) <= rate('play_rate_out').targetHigh && fitToPlay) return [{ personId, kind: 'status_inconsistent', day }];
  return [];
}

export interface ShadingContext {
  readonly actor: PartyRef;
  readonly orderedBy: PartyRef | null;
  readonly knew: readonly number[];
  readonly date: WorldDate;
  readonly competitionId: number | null;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
  /** Benefit on G-28's 0 to 1 scale: how much the shade misleads the opponent's plan (H5.2.3 rule 4). */
  readonly gain: number;
}

/** The act for a filed report that differs from the truth, or null for a truthful one (never an inquiry). */
export function shadingAct(flags: readonly ReportFlag[], ctx: ShadingContext): Act | null {
  if (flags.length === 0) return null;
  // H5.2.3 rule 2 (MA-40): a label shade alone is detected at 10% (minor); an unlisted or no-status mismatch at 60% (major).
  const severity = flags.every((f) => f.kind === 'wrong_participation') ? 'minor' : 'major';
  return { classId: 'injury_report_shading', severity, actor: ctx.actor, orderedBy: ctx.orderedBy, knew: ctx.knew, date: ctx.date, competitionId: ctx.competitionId, gain: ctx.gain, tier: ctx.tier, source: ctx.source };
}
