// G2.7.1 legality and soundness. Nothing here blocks saving except what the engine cannot run (more than
// eleven slots). Rule failures mark the call "illegal as drawn" and the officials judge the foul in the game
// (Marlon's ruling 2026-11-25 22:23 UTC). Everything else is a warning the coordinator may acknowledge.
import { boxDefenders, coverageReport, fitTable, gapTable, matchConsistency, pressureReport, RUN_FAMILIES, stuntReport } from './analysis.ts';
import { disguiseReport } from './adjust.ts';
import type { FieldGeometry } from './keys.ts';
import { LOOKS } from './looks.ts';
import { param } from './params.ts';
import { resolve } from './resolve.ts';
import type { BoardSituation, DefensiveCall, OffLook, RuleFailure } from './types.ts';

export type Severity = 'refuse' | 'rule_failure' | 'warning';
export interface Finding { readonly severity: Severity; readonly code: string; readonly formationId: string | null; readonly slot: string | null; readonly message: string; readonly ruleKey: string | null }

export interface Validation {
  readonly status: DefensiveCall['status'];
  readonly findings: readonly Finding[];
  readonly ruleFailures: readonly RuleFailure[];
  /** Per look: box count and run/pass conflict, for the designer's side panel. */
  readonly perLook: readonly { readonly lookId: string; readonly box: number; readonly checkApplied: string | null }[];
}

export interface ValidateOptions {
  readonly looks?: readonly OffLook[];
  readonly situations?: readonly BoardSituation[];
  /** Knowledge capacity of the package in teaching units (G5); null skips the teaching-load warning. */
  readonly teachingCapacity?: number | null;
}

export function validateCall(call: DefensiveCall, f: FieldGeometry, opts: ValidateOptions = {}): Validation {
  const findings: Finding[] = [];
  const add = (severity: Severity, code: string, message: string, formationId: string | null = null, slot: string | null = null, ruleKey: string | null = null): void => {
    if (!findings.some((x) => x.code === code && x.formationId === formationId && x.slot === slot && x.message === message)) findings.push({ severity, code, formationId, slot, message, ruleKey });
  };
  const n = call.slots.length;
  if (n > 11) add('refuse', 'slots.over_eleven', `${n} slots: a call has eleven, the engine cannot run more (too many men comes from substitution, I6)`);
  if (n < 11) add('warning', 'slots.under_eleven', `${n} defenders: legal (B2) but unsound`);
  const ids = new Set<string>();
  for (const s of call.slots) { if (ids.has(s.id)) add('refuse', 'slots.duplicate', `slot letter ${s.id} used twice`, null, s.id); ids.add(s.id); }
  const looks = opts.looks ?? LOOKS;
  const sits = opts.situations ?? [{ ballYd: 0, qbArm: 'right' as const }];
  const perLook: { lookId: string; box: number; checkApplied: string | null }[] = [];
  if (n <= 11) {
    for (const look of looks) {
      for (const sit of sits) {
        const res = resolve(call, look, sit, f);
        if (sit === sits[0]) perLook.push({ lookId: look.id, box: boxDefenders(res).length, checkApplied: res.checkApplied?.id ?? null });
        for (const d of res.defenders) {
          if (d.px < 0) add('rule_failure', 'align.neutral_zone', `${d.slot.id} aligned in or past the neutral zone`, look.id, d.slot.id, 'foul.offside.exists');
        }
        for (const g of gapTable(res)) if (g.owners.length === 0) add('warning', 'gap.unowned', `${g.side} ${g.gap} gap has no owner`, look.id);
        for (const fam of RUN_FAMILIES) for (const side of ['left', 'right'] as const) for (const e of fitTable(call, res, fam, side).errors) add('warning', 'fit.error', `${fam}: ${e}`, look.id);
        const cov = coverageReport(res);
        for (const r of cov.uncovered) add('warning', 'coverage.uncovered', `eligible ${r} has no defender`, look.id);
        for (const r of cov.doubled) add('warning', 'coverage.doubled', `${r} has two man defenders and no bracket rule`, look.id);
        const pr = pressureReport(res);
        if (pr.rushers.length + pr.droppers.length !== res.defenders.length) add('refuse', 'pressure.count', 'rushers plus droppers is not the defender count', look.id);
        if (pr.rushers.length >= 5 && pr.deep === 0 && call.movement.pressure?.family !== 'allOut') add('warning', 'pressure.no_deep', 'pressure with no deep defender behind it', look.id);
        for (const h of pr.hot) if (h.takenBy === null) add('warning', 'pressure.no_hot_answer', `free rusher with no one on the hot throw to ${h.receiver}`, look.id);
        for (const s of call.movement.stunts) {
          const rep = stuntReport(call, res, s);
          for (const e of rep.errors) add('warning', 'stunt.error', e, look.id);
          for (const w of rep.warnings) add('warning', 'stunt.gap_open', w, look.id);
        }
        for (const c of matchConsistency(res.coverage.match, res)) add('warning', 'match.conflict', `${c.side} ${c.combo.join('/')}: ${c.problem}`, look.id);
        for (const row of disguiseReport(call, look, sit, f)) if (!row.reachable) add('warning', 'disguise.unreachable', `${row.slot} needs ${row.needS.toFixed(1)} s to travel ${row.travelYd.toFixed(1)} yd from the shown spot; ${row.allowedS.toFixed(1)} s allowed`, look.id, row.slot);
        for (const note of res.matchupNotes) if (note.includes('already used')) add('warning', 'matchup.helper_clash', note, look.id);
      }
    }
  }
  if (opts.teachingCapacity != null) {
    const load = call.slots.reduce((a, s) => a + (s.load ?? 1), 0) + call.checks.length + call.coverage.match.length;
    if (load > opts.teachingCapacity * param('validate.teachingLoadWarnShare')) add('warning', 'teaching.load_high', `teaching load ${load} units against a capacity of ${opts.teachingCapacity}`);
  }
  const ruleFailures: RuleFailure[] = findings.filter((x) => x.severity === 'rule_failure').map((x) => ({ ruleKey: x.ruleKey ?? '', slot: x.slot, formationId: x.formationId, message: x.message }));
  const status: DefensiveCall['status'] = ruleFailures.length > 0 ? 'illegal_as_drawn' : findings.some((x) => x.severity === 'refuse') ? 'draft' : 'valid';
  return { status, findings, ruleFailures, perLook };
}

/** The editor core's refuse rule (O3.7.1): only what the engine cannot run. */
export function refuseReason(call: DefensiveCall): string | null {
  if (call.slots.length > 11) return `${call.slots.length} slots: a call has eleven`;
  const ids = call.slots.map((s) => s.id);
  if (new Set(ids).size !== ids.length) return 'two slots share a letter';
  return null;
}
