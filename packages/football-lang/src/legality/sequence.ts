// Sequence checks on scripted pre-snap movement (B4.6.1 item 2, B4.3.1 to B4.3.3, G1.5.1 checks 6 to 8).
// A script is the play's `presnap` list (G1.1.1): shifts and motions in order, each with the time
// everyone then stands set. The checker walks it and reports; it never changes the script.
import type { ParamTable, RuleSet } from '@gm/schema';
import { analyseAlignment, type AlignedPlayer, type AlignmentBounds, type LegalityFinding, FOUL_OF_CODE } from './formation.ts';

export interface ScriptedMove { readonly role: string; readonly px: number; readonly py: number; readonly onLine: boolean }

export type PreSnapStep =
  /** Two or more players change position at once (B4.3.2 item 1). */
  | { readonly kind: 'shift'; readonly moves: readonly ScriptedMove[]; /** Seconds all eleven are set after it. */ readonly setAfterS: number }
  /**
   * One player moves. `stops` false means he is still moving when the next thing happens: at the snap
   * if this is the last step. `velPx`/`velPy` are his velocity at that moment (positive `velPx` is toward the line).
   */
  | { readonly kind: 'motion'; readonly move: ScriptedMove; readonly stops: boolean; readonly setAfterS: number; readonly velPx?: number; readonly velPy?: number };

export interface PreSnapScript {
  /** The formation the offense first sets in. `inMotion` and velocities are ignored here. */
  readonly start: readonly AlignedPlayer[];
  /** Seconds all eleven are set in the starting formation. Coming up to the line is itself a shift (B4.3.2 item 1). */
  readonly startSetS: number;
  readonly steps: readonly PreSnapStep[];
}

function seq(code: string, ruleKey: string, role: string | null, leaf: string, step: number | null): LegalityFinding {
  return { severity: 'warning', code, ruleKey, role, messageKey: `legality.${code}`, foul: FOUL_OF_CODE[code] ?? null, leaf, step };
}

/** Walks the script and returns every legality finding, each tagged with the step it arose at. */
export function checkPreSnapScript(
  script: PreSnapScript, rules: RuleSet, params: ParamTable, bounds: AlignmentBounds | null = null,
): LegalityFinding[] {
  const findings: LegalityFinding[] = [];
  const need = rules.num('formation.shift_set_seconds');
  const still = (p: AlignedPlayer): AlignedPlayer => ({ role: p.role, px: p.px, py: p.py, onLine: p.onLine, jersey: p.jersey, inMotion: false, reported: p.reported });
  let formation: AlignedPlayer[] = script.start.map(still);
  const place = (m: ScriptedMove): void => {
    formation = formation.map((p) => (p.role === m.role ? { ...p, px: m.px, py: m.py, onLine: m.onLine } : p));
  };

  // B4.3.2 item 2: the formation shown before a shift must itself be legal.
  findings.push(...analyseAlignment(formation, rules, params, bounds, -1).findings);

  /** Seconds everyone has been set since the last group movement. A valid set is `setS >= need`. */
  let setS = script.startSetS;
  /** Roles still moving (motion steps that did not stop), with their velocity. */
  const moving = new Map<string, { velPx?: number; velPy?: number; fromLine: boolean }>();
  /** The under-center player went in motion and stopped: he owes a full set before anything else (B4.3.2 item 6, B4.3.3 item 4). */
  let underCenterOwesSet: { role: string; step: number } | null = null;

  script.steps.forEach((step, i) => {
    if (underCenterOwesSet !== null && step.kind === 'motion') {
      // B4.3.2 item 6: a second player went in motion before the man from under center had been set a full second.
      findings.push(seq('formation.shift_under_center', 'formation.shift_set_seconds', underCenterOwesSet.role, 'B4.3.2', i));
    }
    underCenterOwesSet = null;
    if (step.kind === 'shift') {
      for (const m of step.moves) place(m);
      setS = step.setAfterS;
      // B4.3.2 item 2 and G1.5.1 check 8: legal after every shift too.
      findings.push(...analyseAlignment(formation, rules, params, bounds, i).findings);
      return;
    }
    const before = analyseAlignment(formation, rules, params, bounds, i);
    const moverIndex = formation.findIndex((p) => p.role === step.move.role);
    const wasUnderCenter = moverIndex !== -1 && moverIndex === before.underCenter;
    // A man starting before the set is complete, or while another is still moving, makes it a shift
    // (B4.3.2 items 3 and 5): a new full set is owed afterwards.
    const isShift = setS < need || moving.size > 0;
    place(step.move);
    if (step.stops) {
      if (isShift) setS = step.setAfterS;
      if (wasUnderCenter && step.setAfterS < need) underCenterOwesSet = { role: step.move.role, step: i };
    } else {
      moving.set(step.move.role, { velPx: step.velPx, velPy: step.velPy, fromLine: moverIndex !== -1 && before.status[moverIndex] === 'on' });
      if (isShift) setS = 0;
    }
  });

  // The snap. B4.3.1: everyone set for the full period after the last shift.
  if (setS < need) findings.push(seq('formation.shift_set_seconds', 'formation.shift_set_seconds', null, 'B4.3.1', null));
  // B4.3.3 item 4: the man from under center must have stopped for the full period before the snap.
  const owes = underCenterOwesSet as { role: string; step: number } | null;
  if (owes !== null) findings.push(seq('formation.motion_under_center', 'formation.motion_rule', owes.role, 'B4.3.3', null));
  // B4.3.3: movers at the snap, judged where they are now.
  const atSnap = formation.map((p): AlignedPlayer => {
    const mv = moving.get(p.role);
    return mv === undefined ? p : { ...p, inMotion: true, velPx: mv.velPx, velPy: mv.velPy };
  });
  const snap = analyseAlignment(atSnap, rules, params, bounds, null).findings;
  findings.push(...snap);
  // B4.3.3 item 1: the motion man must have been lined up in the backfield when his motion began.
  if (rules.opt('formation.motion_rule') === 'one_back_not_forward') {
    for (const [role, mv] of moving) {
      if (mv.fromLine && !snap.some((f) => f.code === 'formation.motion_from_line' && f.role === role)) {
        findings.push(seq('formation.motion_from_line', 'formation.motion_rule', role, 'B4.3.3', null));
      }
    }
  }
  return findings;
}
