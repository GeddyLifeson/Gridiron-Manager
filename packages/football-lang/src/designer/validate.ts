// The validator behind the O3.1.3 panel (G1.5). Four levels:
//   refused  the engine cannot run the play (a missing or duplicate slot). Only this blocks publishing.
//   illegal  a rule of football is broken (G1.5.1, G1.5.2). Publishes after one confirmation, marked
//            "illegal as drawn"; the play still runs and the officials judge it (Marlon 2026-11-25 22:23).
//   unsound  a football hole (G1.5.3). Dismissable with a typed reason.
//   note     cost information (teaching load, call length).
// Every rule value comes from the rule set by key; the checker never repairs a play.
import type { ParamTable, RuleSet } from '@gm/schema';
import { analyseAlignment, checkPreSnapScript, type AlignedPlayer, type AlignmentBounds, type LegalityFinding, type PreSnapStep as LegalStep } from '../legality/index.ts';
import type { DesignSlot, PlayDraft, Yd2 } from './types.ts';
import { slotsForPersonnel, isLineSlot } from './slots.ts';
import { snapSpots, toFrame } from './to-engine.ts';

export type MessageLevel = 'refused' | 'illegal' | 'unsound' | 'note';

export interface DesignMessage {
  readonly level: MessageLevel;
  readonly code: string;
  /** Slots involved, highlighted when the message is clicked (O3.1.3). */
  readonly roles: readonly string[];
  /** Rule key for an illegal message, G1 check id for an unsound one (O3.1.3 citation). */
  readonly citation: string;
  /** Bible leaf that states the rule or the check. */
  readonly leaf: string;
  /** Foul the officials may call (illegal only). */
  readonly foul: string | null;
  readonly messageKey: string;
  /** Pre-snap step the finding arose at (-1 starting formation), when it came from the sequence checker. */
  readonly step: number | null;
  readonly dismissed: boolean;
  /** Free detail for the panel, for example the look a warning applies to. */
  readonly detail: string;
}

/** A defensive look in the preview set (G1.5.3 inputs): what the board counts, never an outcome. */
export interface PreviewLook { readonly id: string; readonly rushers: number; readonly box: number }

export interface ValidateContext {
  readonly rules: RuleSet;
  /** Legality parameters merged with the designer's (paramTableOf([legality.PARAMS, designer.PARAMS])). */
  readonly params: ParamTable;
  /** Jersey per slot from the depth chart (M2). Absent: the slot's player wears a number that matches it. */
  readonly jerseys?: Readonly<Record<string, number>>;
  readonly bounds?: AlignmentBounds | null;
  readonly looks?: readonly PreviewLook[];
  /** Kinds of the OTHER plays in the book that use this formation (G1.5.3 "tell"). */
  readonly formationKinds?: readonly string[];
  /** Personnel fit gap per slot, 0 good to 1 far off (G1.5.3 "personnel fit"); from the depth chart player's body and skill. */
  readonly fitGap?: Readonly<Record<string, number>>;
  /** Spoken length of the call (G4), for the note. */
  readonly callWords?: number;
}

const PASS_KINDS = new Set(['dropback_pass', 'quick_pass', 'play_action', 'movement_pass', 'screen', 'rpo']);
const RUN_KINDS = new Set(['run', 'draw', 'qb_run']);
export const ROUTE_BEHAVIORS = new Set(['route', 'release', 'option_route', 'screen_release']);
const PASS_BLOCK = new Set(['pass_block', 'chip_block']);
const RUN_BLOCK = new Set(['run_block', 'block', 'lead_block', 'pull']);

const has = (rules: RuleSet, key: string): boolean => rules.keys().includes(key);
const isRoute = (s: DesignSlot): boolean => ROUTE_BEHAVIORS.has(s.assignment.behavior) && s.assignment.path.length > 0;

function msg(level: MessageLevel, code: string, roles: readonly string[], citation: string, leaf: string, detail = '', foul: string | null = null, step: number | null = null): DesignMessage {
  return { level, code, roles, citation, leaf, foul, messageKey: `designer.${code}`, step, dismissed: false, detail };
}

/** A number that matches the slot when the depth chart gives none: inside the eligible band for skill slots, outside it for linemen. */
function defaultJersey(s: DesignSlot, rules: RuleSet): number {
  if (isLineSlot(s.role) || s.extraTackle) return rules.num('numbering.eligible_low_max') + 1;
  return rules.num('numbering.eligible_high_min');
}

function aligned(d: PlayDraft, s: DesignSlot, at: Yd2, onLine: boolean, ctx: ValidateContext): AlignedPlayer {
  const f = toFrame(at);
  return { role: s.role, px: f.px, py: f.py, onLine, jersey: ctx.jerseys?.[s.role] ?? defaultJersey(s, ctx.rules), inMotion: false, reported: s.reportsEligible };
}

function fromLegality(f: LegalityFinding): DesignMessage {
  return msg('illegal', f.code, f.role ? [f.role] : [], f.ruleKey ?? f.code, f.leaf, '', f.foul, f.step);
}

/** Path length in yards from the alignment through each point. */
function pathLength(from: Yd2, pts: readonly { at: Yd2 }[]): number {
  let len = 0, x = from[0], y = from[1];
  for (const p of pts) { const dx = p.at[0] - x, dy = p.at[1] - y; len += Math.sqrt(dx * dx + dy * dy); x = p.at[0]; y = p.at[1]; }
  return len;
}
function timeToBreak(s: DesignSlot, speed: number): number | null {
  const pts = s.assignment.path;
  const cut = pts.findIndex((p) => p.kind === 'cut');
  if (cut < 0) return null;
  return pathLength(s.at, pts.slice(0, cut + 1)) / speed;
}

export function validateDraft(d: PlayDraft, ctx: ValidateContext): DesignMessage[] {
  const out: DesignMessage[] = [];
  const { rules, params } = ctx;

  // Refused: the slot set must be exactly the personnel group's (G1.1.2 acceptance).
  const want = slotsForPersonnel(d.personnel);
  const roles = d.slots.map((s) => s.role);
  if (!want) out.push(msg('refused', 'structure.personnel', [], 'G1.1.2', 'G1.1.2', d.personnel));
  else {
    const missing = want.filter((r) => !roles.includes(r));
    const dup = roles.filter((r, i) => roles.indexOf(r) !== i);
    const extra = roles.filter((r) => !want.includes(r));
    if (missing.length) out.push(msg('refused', 'structure.missing_slot', missing, 'G1.1.2', 'G1.1.2'));
    if (dup.length) out.push(msg('refused', 'structure.duplicate_slot', [...new Set(dup)], 'G1.1.2', 'G1.1.2'));
    if (extra.length) out.push(msg('refused', 'structure.extra_slot', extra, 'G1.1.2', 'G1.1.2'));
  }
  if (out.length) return out;

  // Illegal: formation and motion (G1.5.1 checks 1 to 8), by the shared checker (B4.6.1).
  const bounds = ctx.bounds ?? null;
  const start = d.slots.map((s) => aligned(d, s, s.at, s.onLine, ctx));
  if (d.presnap.length === 0) {
    out.push(...analyseAlignment(start, rules, params, bounds).findings.map(fromLegality));
  } else {
    const steps: LegalStep[] = d.presnap.map((st) => {
      if (st.kind === 'shift') return { kind: 'shift', moves: st.moves.map((m) => ({ role: m.role, ...toFrame(m.to), onLine: m.onLine })), setAfterS: st.setAfterS };
      const end = st.path.length ? st.path[st.path.length - 1]!.at : d.slots.find((s) => s.role === st.role)?.at ?? [0, 0];
      const v = st.speed ? toFrame(st.speed) : null;
      return { kind: 'motion', move: { role: st.role, ...toFrame(end), onLine: st.onLine }, stops: st.stops, setAfterS: st.setAfterS, ...(v ? { velPx: v.px, velPy: v.py } : {}) };
    });
    out.push(...checkPreSnapScript({ start, startSetS: rules.num('formation.shift_set_seconds'), steps }, rules, params, bounds).map(fromLegality));
  }

  // Eligibility at the snap (G1.5.2).
  const spots = snapSpots(d);
  const atSnap = d.slots.map((s) => { const sp = spots.get(s.role)!; return aligned(d, s, sp.at, sp.onLine, ctx); });
  const report = analyseAlignment(atSnap, rules, params, bounds);
  const limit = rules.num('pass.ineligible_downfield_limit_yd');
  d.slots.forEach((s, i) => {
    if (!isRoute(s) || s.role === 'Q') return;
    if (report.eligible[i]) return;
    const deepest = Math.max(...s.assignment.path.map((p) => p.at[0]));
    // A screen release behind the line by an ineligible is allowed where the rules allow it (G1.5.2 acceptance).
    if (deepest <= limit && d.kind === 'screen') return;
    const code = report.covered[i] ? 'eligibility.covered_route' : 'eligibility.route_to_ineligible';
    out.push(msg('illegal', code, [s.role], 'pass.ineligible_downfield_limit_yd', 'G1.5.2', '', 'ineligible_downfield_pass'));
  });
  d.slots.forEach((s) => {
    // "Must report to the referee": the defense is told (G1.5.2). A consequence, not a failure.
    if (s.reportsEligible && rules.bool('numbering.report_eligible_allowed')) {
      out.push(msg('note', 'eligibility.must_report', [s.role], 'numbering.report_eligible_allowed', 'G1.5.2'));
    }
  });

  // Unsound (G1.5.3 starting warning set).
  const routes = d.slots.filter(isRoute);
  const speed = params.num('designer.timing.routeSpeedYps');
  const tol = params.num('designer.timing.toleranceS');
  if (PASS_KINDS.has(d.kind)) {
    // Timing: a route breaks more than the tolerance before or after the quarterback's eyes arrive.
    for (const r of d.qb.progression) {
      const s = d.slots.find((x) => x.role === r.role);
      const t = s ? timeToBreak(s, speed) : null;
      if (t !== null && Math.abs(t - r.eyesAtS) > tol) out.push(msg('unsound', 'timing.break_vs_eyes', [r.role], 'G1.5.3.timing', 'G1.5.3', `${t.toFixed(2)} s vs ${r.eyesAtS.toFixed(2)} s`));
    }
    // Spacing: two finishes within the minimum at about the same time, no pick or high-low purpose marked.
    const minYd = params.num('designer.spacing.minYd');
    for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i]!, b = routes[j]!;
      const purpose = (s: DesignSlot) => s.assignment.params['purpose'];
      if (['pick', 'high_low'].includes(String(purpose(a))) || ['pick', 'high_low'].includes(String(purpose(b)))) continue;
      const ea = a.assignment.path[a.assignment.path.length - 1]!.at, eb = b.assignment.path[b.assignment.path.length - 1]!.at;
      const dx = ea[0] - eb[0], dy = ea[1] - eb[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ta = pathLength(a.at, a.assignment.path) / speed, tb = pathLength(b.at, b.assignment.path) / speed;
      if (dist < minYd && Math.abs(ta - tb) <= tol) out.push(msg('unsound', 'spacing.same_spot', [a.role, b.role], 'G1.5.3.spacing', 'G1.5.3', `${dist.toFixed(1)} yd apart`));
    }
    // Protection: against a preview look more rushers than protectors and no hot answer; or a long drop behind a short protection.
    const protectors = d.slots.filter((s) => PASS_BLOCK.has(s.assignment.behavior)).length;
    const hasHot = d.qb.hot.length > 0 || routes.some((s) => s.assignment.params['hot'] === true);
    for (const look of ctx.looks ?? []) {
      if (look.rushers > protectors && !hasHot) out.push(msg('unsound', 'protection.unblocked', [], 'G1.5.3.protection', 'G1.5.3', look.id));
    }
    if (d.qb.dropSteps >= params.num('designer.protection.longDropSteps') && protectors <= params.num('designer.protection.shortProtectors')) {
      out.push(msg('unsound', 'protection.long_drop', ['Q'], 'G1.5.3.protection', 'G1.5.3', `${d.qb.dropSteps}-step drop, ${protectors} protectors`));
    }
  }
  if (RUN_KINDS.has(d.kind)) {
    // Run count: more in the box than blockers, with no read, motion or RPO for the extra man.
    const blockers = d.slots.filter((s) => RUN_BLOCK.has(s.assignment.behavior)).length;
    const answered = d.qb.readType.includes('read') || d.qb.readType.includes('option') || d.presnap.some((s) => s.kind === 'motion');
    for (const look of ctx.looks ?? []) {
      if (look.box > blockers && !answered) out.push(msg('unsound', 'run.count', [], 'G1.5.3.run_count', 'G1.5.3', `${look.id}: ${look.box} in the box, ${blockers} blockers`));
    }
  }
  // Tell: every other play from this formation is one kind, and it is this kind (G8).
  if (ctx.formationKinds && ctx.formationKinds.length > 0 && ctx.formationKinds.every((k) => k === d.kind)) {
    out.push(msg('unsound', 'tell.formation', [], 'G1.5.3.tell', 'G1.5.3', d.formation.id ?? ''));
  }
  // Personnel fit.
  const maxGap = params.num('designer.fit.maxGap');
  for (const s of d.slots) {
    const g = ctx.fitGap?.[s.role];
    if (g !== undefined && g > maxGap) out.push(msg('unsound', 'fit.personnel', [s.role], 'G1.5.3.fit', 'G1.5.3', g.toFixed(2)));
  }
  // Foul risk: an RPO lineman past the ineligible limit; pick contact beyond the OPI distance.
  if (d.kind === 'rpo') {
    for (const s of d.slots) {
      if (!isLineSlot(s.role) || s.assignment.path.length === 0) continue;
      if (Math.max(...s.assignment.path.map((p) => p.at[0])) > limit) out.push(msg('unsound', 'foul_risk.rpo_lineman', [s.role], 'G1.5.3.foul_risk', 'G1.3.5'));
    }
  }
  if (has(rules, 'pass.offensive_pi_contact_beyond_yd')) {
    const opi = rules.num('pass.offensive_pi_contact_beyond_yd');
    for (const s of routes) {
      if (s.assignment.params['purpose'] !== 'pick') continue;
      const cut = s.assignment.path.find((p) => p.kind === 'cut') ?? s.assignment.path[0]!;
      if (cut.at[0] > opi) out.push(msg('unsound', 'foul_risk.pick_depth', [s.role], 'G1.5.3.foul_risk', 'G1.5.3'));
    }
  }

  // Notes: cost information (G1.7.1, G4).
  const load = d.slots.reduce((a, s) => a + s.assignment.load, 0);
  out.push(msg('note', 'cost.teaching_load', [], 'G1.7.1', 'G1.7.1', String(load)));
  if (ctx.callWords !== undefined) out.push(msg('note', 'cost.call_length', [], 'G4', 'G4.3.1', String(ctx.callWords)));

  // Dismissed unsound messages stay listed, marked, with the reason kept on the play (O3.1.3).
  return out.map((m) => (m.level === 'unsound' && d.dismissed.some((w) => w.code === m.code && (w.role === null || m.roles.includes(w.role))) ? { ...m, dismissed: true } : m));
}

export const isRefused = (ms: readonly DesignMessage[]): boolean => ms.some((m) => m.level === 'refused');
export const isIllegal = (ms: readonly DesignMessage[]): boolean => ms.some((m) => m.level === 'illegal');
