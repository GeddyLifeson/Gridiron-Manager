// Static formation and motion legality (B4.1.2, B4.2.1, B4.2.2, B4.3.3, B2.3.1 to B2.3.3, B13.2.2,
// G1.5.1 checks 1 to 5 and 7). One checker for the designer, the AI and the engine (B4.6.1).
// It reports and never repairs or refuses: an illegal formation is a warning marked with the rule
// key it breaks, the play still compiles and runs, and the officials decide whether to flag it.
import type { FoulId, ParamTable, RuleSet, ValidationFinding } from '@gm/schema';

/**
 * One offensive player as the checker sees him. Positions are play frame (J1.1.2): `px` is depth
 * past the line of scrimmage (backs are negative), `py` is lateral to the offense's left.
 * The first six fields are the contract's (`FootballLang.checkAlignment`). The optional ones let a
 * caller that knows more get the full check; without them those checks are skipped, never guessed.
 */
export interface AlignedPlayer {
  readonly role: string;
  readonly px: number;
  readonly py: number;
  /** The designer forces an on or off choice (G1.5.1 edge case); the engine sets it by B4.1.2. */
  readonly onLine: boolean;
  readonly jersey: number;
  /** Moving at the snap. When a velocity is given the checker also applies the B4.3.3 thresholds to it. */
  readonly inMotion: boolean;
  /** Reported to the referee for this down (B2.3.3). Read only when the rule set allows reporting. */
  readonly reported?: boolean;
  /** Velocity at the snap tick, play frame, yd/s. Positive `velPx` is toward the line. */
  readonly velPx?: number;
  readonly velPy?: number;
}

/** Sidelines in the play frame for this snap. Without them the in-bounds check is skipped. */
export interface AlignmentBounds { readonly minPy: number; readonly maxPy: number }

export type LineStatus = 'on' | 'off' | 'neither';

/**
 * A legality finding. `ruleKey` not null means the formation is illegal as drawn under that key
 * (G1.5.1). `foul` is the foul the officials may call, as the bible names it; the catalogue id is
 * reconciled with WP-01 at integration. `step` is set by the sequence checker.
 */
export interface LegalityFinding extends ValidationFinding {
  readonly foul: FoulId | null;
  /** Bible leaf that states the rule. */
  readonly leaf: string;
  /** Index into the scripted steps, -1 for the starting formation, null for a single set formation or the snap. */
  readonly step: number | null;
}

export interface AlignmentReport {
  readonly findings: LegalityFinding[];
  /** Per player, in input order. */
  readonly status: LineStatus[];
  /** Index of the snapper, or -1 when no player on the line is over the ball. */
  readonly snapper: number;
  /** Index of the player under center (B4.1.2 item 6), or -1. */
  readonly underCenter: number;
  /** Eligible receiver by position (B4.2.1 item 2, B5). */
  readonly eligibleByPosition: boolean[];
  /** Eligible by position and by number or report. */
  readonly eligible: boolean[];
  /** On the line inside the ends while wearing an eligible number: "covered" (B4.2.1 edge case). */
  readonly covered: boolean[];
}

/** Foul each finding code leads to, in the bible's words (B4.2.1, B4.3.1 to B4.3.3, B2.3.1). */
export const FOUL_OF_CODE: Readonly<Record<string, FoulId>> = {
  'formation.too_many_players': 'too_many_players',
  'formation.line_min': 'illegal_formation',
  'formation.backfield_max': 'illegal_formation',
  'formation.line_ineligible_numbers_min': 'illegal_formation',
  'formation.neither_position': 'illegal_formation',
  'formation.neither_count': 'illegal_formation',
  'numbering.eligible_position_needs_number': 'illegal_formation',
  'numbering.reported_not_eligible_position': 'illegal_formation',
  'formation.out_of_bounds': 'illegal_formation',
  'formation.motion_max_at_snap': 'illegal_shift',
  'formation.motion_from_line': 'illegal_motion',
  'formation.motion_toward_line': 'illegal_motion',
  'formation.motion_under_center': 'illegal_motion',
  'formation.shift_set_seconds': 'illegal_shift',
  'formation.shift_under_center': 'illegal_shift',
};

function finding(code: string, ruleKey: string | null, role: string | null, leaf: string, step: number | null): LegalityFinding {
  return { severity: 'warning', code, ruleKey, role, messageKey: `legality.${code}`, foul: FOUL_OF_CODE[code] ?? null, leaf, step };
}

/** True when any finding marks the design illegal as drawn (G1.5.1). Soundness notes have no rule key. */
export function isIllegalAsDrawn(findings: readonly ValidationFinding[]): boolean {
  return findings.some((f) => f.ruleKey !== null);
}

function eligibleNumber(jersey: number, rules: RuleSet): boolean {
  if (jersey >= 0 && jersey <= rules.num('numbering.eligible_low_max')) return true;
  return jersey >= rules.num('numbering.eligible_high_min') && jersey <= rules.num('numbering.eligible_high_max');
}

function speedOf(p: AlignedPlayer): number | null {
  if (p.velPx === undefined && p.velPy === undefined) return null;
  const vx = p.velPx ?? 0, vy = p.velPy ?? 0;
  return Math.sqrt(vx * vx + vy * vy);
}

/** The full static analysis. `checkAlignment` returns only its findings. */
export function analyseAlignment(
  players: readonly AlignedPlayer[], rules: RuleSet, params: ParamTable,
  bounds: AlignmentBounds | null = null, step: number | null = null,
): AlignmentReport {
  const n = players.length;
  const findings: LegalityFinding[] = [];
  const clearlyOff = params.num('legality.line.clearlyOffYd');
  const reportAllowed = rules.bool('numbering.report_eligible_allowed');

  // B4.1.2: on the line, off the line, or neither.
  const status: LineStatus[] = players.map((p) => {
    const depth = -p.px;
    if (depth >= clearlyOff) return 'off';
    return p.onLine ? 'on' : 'neither';
  });

  // The snapper is the player on the line over the ball (py = 0 is the ball, J1.1.2).
  let snapper = -1;
  const snapperMax = params.num('legality.snapper.maxLateralYd');
  for (let i = 0; i < n; i++) {
    if (status[i] !== 'on') continue;
    const d = Math.abs(players[i]!.py);
    if (d <= snapperMax && (snapper === -1 || d < Math.abs(players[snapper]!.py))) snapper = i;
  }

  // B4.1.2 item 6: the player under center is the one aligned at most the rule distance behind the snapper.
  let underCenter = -1;
  const behindLateral = params.num('legality.snapper.behindLateralYd');
  const tDepth = rules.num('formation.t_quarterback_depth_yd');
  const behindSnapper = (i: number): boolean => snapper !== -1 && i !== snapper
    && Math.abs(players[i]!.py - players[snapper]!.py) <= behindLateral && players[i]!.px <= players[snapper]!.px;
  for (let i = 0; i < n; i++) {
    if (status[i] === 'on' || !behindSnapper(i)) continue;
    const depth = players[snapper]!.px - players[i]!.px;
    if (depth > tDepth) continue;
    if (underCenter === -1 || depth < players[snapper]!.px - players[underCenter]!.px) underCenter = i;
  }

  // B2.3.1: more than the rule set's count is a foul; fewer is legal and worth a note.
  const maxPlayers = rules.num('substitution.max_players');
  if (n > maxPlayers) findings.push(finding('formation.too_many_players', 'substitution.max_players', null, 'B2.3.1', step));
  else if (n < maxPlayers) findings.push(finding('formation.fewer_players', null, null, 'B2.3.1', step));

  // B4.2.1 item 1 and B13.2.2: line minimum, backfield maximum, numbered linemen.
  let onLine = 0, offLine = 0, lineIneligibleNumbers = 0;
  for (let i = 0; i < n; i++) {
    if (status[i] === 'on') { onLine++; if (!eligibleNumber(players[i]!.jersey, rules)) lineIneligibleNumbers++; }
    else offLine++;
  }
  if (onLine < rules.num('formation.line_min')) findings.push(finding('formation.line_min', 'formation.line_min', null, 'B4.2.1', step));
  if (offLine > rules.num('formation.backfield_max')) findings.push(finding('formation.backfield_max', 'formation.backfield_max', null, 'B13.2.2', step));
  if (lineIneligibleNumbers < rules.num('formation.line_ineligible_numbers_min')) {
    findings.push(finding('formation.line_ineligible_numbers_min', 'formation.line_ineligible_numbers_min', null, 'B13.2.2', step));
  }

  // B4.2.2: nobody neither on nor off the line, except the allowed count directly behind the snapper.
  const neitherMax = rules.num('formation.neither_behind_snapper_max');
  const allowedNeither = new Array<boolean>(n).fill(false);
  let neitherBehind = 0;
  for (let i = 0; i < n; i++) {
    if (status[i] !== 'neither') continue;
    if (!behindSnapper(i)) { findings.push(finding('formation.neither_position', 'formation.neither_behind_snapper_max', players[i]!.role, 'B4.2.2', step)); continue; }
    neitherBehind++;
    if (neitherBehind > neitherMax) findings.push(finding('formation.neither_count', 'formation.neither_behind_snapper_max', players[i]!.role, 'B4.2.2', step));
    else allowedNeither[i] = true;
  }

  // B4.2.1 item 2: the ends of the line are eligible by position, everyone between them is not.
  let endLeft = -1, endRight = -1;
  for (let i = 0; i < n; i++) {
    if (status[i] !== 'on') continue;
    if (endLeft === -1 || players[i]!.py > players[endLeft]!.py) endLeft = i;
    if (endRight === -1 || players[i]!.py < players[endRight]!.py) endRight = i;
  }
  const qbEligible = rules.bool('numbering.qb_under_center_eligible');
  const eligibleByPosition = players.map((_, i) => {
    if (i === underCenter) return qbEligible;
    if (status[i] === 'on') return i === endLeft || i === endRight;
    if (status[i] === 'neither') return false;
    return true;
  });
  // A position the numbering rule treats as eligible: the ends, the backs, and the man under center.
  const eligiblePosition = players.map((_, i) => (status[i] === 'on' ? i === endLeft || i === endRight : status[i] === 'off' || allowedNeither[i]!));
  const numberOk = players.map((p) => eligibleNumber(p.jersey, rules) || (reportAllowed && p.reported === true));
  const eligible = players.map((_, i) => eligibleByPosition[i]! && numberOk[i]!);
  const covered = players.map((p, i) => status[i] === 'on' && i !== endLeft && i !== endRight && eligibleNumber(p.jersey, rules));

  // B4.2.1 item 4 and B4.2.2 item 3: eligible positions wear eligible numbers unless reported.
  if (rules.bool('numbering.eligible_position_needs_number')) {
    for (let i = 0; i < n; i++) {
      if (eligiblePosition[i] && !numberOk[i]) findings.push(finding('numbering.eligible_position_needs_number', 'numbering.eligible_position_needs_number', players[i]!.role, 'B4.2.1', step));
    }
  }
  // B4.2.1 edge case: a player who reported eligible must line up in an eligible position.
  if (reportAllowed) {
    for (let i = 0; i < n; i++) {
      const p = players[i]!;
      if (p.reported === true && !eligibleNumber(p.jersey, rules) && !eligiblePosition[i] && status[i] === 'on') {
        findings.push(finding('numbering.reported_not_eligible_position', 'numbering.report_eligible_allowed', p.role, 'B4.2.1', step));
      }
    }
  }

  // B4.2.1 item 3: no player out of bounds.
  if (bounds !== null && rules.bool('formation.in_bounds_required')) {
    for (const p of players) {
      if (p.py < bounds.minPy || p.py > bounds.maxPy) findings.push(finding('formation.out_of_bounds', 'formation.in_bounds_required', p.role, 'B4.2.1', step));
    }
  }

  // B4.3.3: who may be moving at the snap, from where, and which way.
  const stationary = params.num('legality.motion.stationaryYps');
  const towardTol = params.num('legality.motion.towardLineTolYps');
  const movers: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = speedOf(players[i]!);
    if (players[i]!.inMotion || (s !== null && s > stationary)) movers.push(i);
  }
  if (movers.length > rules.num('formation.motion_max_at_snap')) findings.push(finding('formation.motion_max_at_snap', 'formation.motion_max_at_snap', null, 'B4.3.3', step));
  const fromBackfieldOnly = rules.bool('formation.motion_from_backfield_only');
  const notTowardLine = rules.opt('formation.motion_rule') === 'not_toward_line';
  for (const i of movers) {
    const p = players[i]!;
    if (fromBackfieldOnly && status[i] === 'on') findings.push(finding('formation.motion_from_line', 'formation.motion_from_backfield_only', p.role, 'B4.3.3', step));
    if (i === underCenter) findings.push(finding('formation.motion_under_center', 'formation.motion_rule', p.role, 'B4.3.3', step));
    if (notTowardLine && p.velPx !== undefined && p.velPx > towardTol) findings.push(finding('formation.motion_toward_line', 'formation.motion_rule', p.role, 'B4.3.3', step));
  }

  return { findings, status, snapper, underCenter, eligibleByPosition, eligible, covered };
}

/** Formation and motion legality of one set formation at the snap (the contract's `checkAlignment`). */
export function checkAlignment(
  players: readonly AlignedPlayer[], rules: RuleSet, params: ParamTable, bounds: AlignmentBounds | null = null,
): LegalityFinding[] {
  return analyseAlignment(players, rules, params, bounds).findings;
}
