// Edits to a play draft (O3.1.1 "edits to the play draft as commands"). Each edit is a pure function
// of the draft: the shared editor core (O3.7.1 drafts, undo, publish; app-services/src/editor) holds
// the history and calls `applyEdit` as its reducer. An edit never repairs or refuses an illegal
// alignment: dragging a player to an illegal spot is allowed and flagged by the validator (O3.1.2).
import type { OffensePlayKind } from '@gm/schema';
import type {
  CallName, DesignSlot, DrawnClause, DrawnPoint, IntentRole, PlayDraft, PlayStatus, PresnapStep, QbRules, SlotAssignment, Strength, Yd2,
} from './types.ts';
import { defaultSlot, slotsForPersonnel } from './slots.ts';

export class DesignError extends Error {}

/** A formation part (F2) as the designer applies it: the spots it gives each role. */
export interface FormationPart {
  readonly id: string;
  readonly personnel: string;
  readonly shotgun: boolean;
  readonly players: readonly { readonly role: string; readonly at: Yd2; readonly onLine: boolean }[];
}

export type PlayEdit =
  | { readonly type: 'set_name'; readonly name: CallName }
  | { readonly type: 'set_kind'; readonly kind: OffensePlayKind }
  | { readonly type: 'set_personnel'; readonly personnel: string }
  | { readonly type: 'apply_formation'; readonly formation: FormationPart }
  | { readonly type: 'set_strength'; readonly strength: Strength }
  | { readonly type: 'move_slot'; readonly role: string; readonly at: Yd2; readonly onLine: boolean }
  | { readonly type: 'set_stance'; readonly role: string; readonly stance: string }
  | { readonly type: 'set_letter'; readonly role: string; readonly letter: string }
  | { readonly type: 'set_flags'; readonly role: string; readonly reportsEligible: boolean; readonly extraTackle: boolean }
  | { readonly type: 'set_assignment'; readonly role: string; readonly assignment: SlotAssignment }
  | { readonly type: 'set_path'; readonly role: string; readonly behavior: string; readonly path: readonly DrawnPoint[] }
  | { readonly type: 'set_params'; readonly role: string; readonly params: SlotAssignment['params'] }
  | { readonly type: 'set_rules'; readonly role: string; readonly rules: readonly DrawnClause[] }
  | { readonly type: 'insert_presnap'; readonly index: number; readonly step: PresnapStep }
  | { readonly type: 'replace_presnap'; readonly index: number; readonly step: PresnapStep }
  | { readonly type: 'remove_presnap'; readonly index: number }
  | { readonly type: 'set_qb'; readonly qb: QbRules }
  | { readonly type: 'set_protection'; readonly protection: PlayDraft['protection'] }
  | { readonly type: 'set_run_direction'; readonly runDirection: PlayDraft['runDirection'] }
  | { readonly type: 'set_shotgun'; readonly shotgun: boolean }
  | { readonly type: 'set_tags_allowed'; readonly tags: readonly string[] }
  | { readonly type: 'set_intent'; readonly role: IntentRole; readonly beats: readonly string[]; readonly checkOutOf: readonly string[] }
  | { readonly type: 'set_coaching_point'; readonly role: string; readonly text: string }
  | { readonly type: 'set_status'; readonly status: PlayStatus }
  | { readonly type: 'dismiss_warning'; readonly code: string; readonly role: string | null; readonly reason: string }
  | { readonly type: 'restore_warning'; readonly code: string; readonly role: string | null }
  | { readonly type: 'set_notes'; readonly notes: string }
  | { readonly type: 'mirror' };

/** A fresh draft: the group's eleven slots in a legal starting picture, nothing drawn yet. */
export function newDraft(id: string, personnel: string, author: string, created: string): PlayDraft {
  const roles = slotsForPersonnel(personnel);
  if (!roles) throw new DesignError(`personnel group ${personnel} cannot be met by eleven players`);
  return {
    id,
    name: { formation: '', strength: '', motion: '', protection: '', concept: '', tags: [] },
    kind: 'dropback_pass', personnel,
    formation: { id: null, strength: 'right' },
    slots: roles.map((r, i) => defaultSlot(r, Math.max(0, i - 6))),
    presnap: [],
    qb: { action: 'drop', dropSteps: 3, readType: 'progression', progression: [], hot: [], throwAway: 'out_of_bounds' },
    protection: null, runDirection: null, shotgun: false, tagsAllowed: [],
    intent: { role: 'base', beats: [], checkOutOf: [] },
    coachingPoints: {}, source: { author, created, parentId: null },
    status: 'draft', ruleFailures: [], dismissed: [], notes: '', version: 0,
  };
}

function withSlot(d: PlayDraft, role: string, f: (s: DesignSlot) => DesignSlot): PlayDraft {
  const i = d.slots.findIndex((s) => s.role === role);
  if (i < 0) throw new DesignError(`no slot ${role} on play ${d.id}`);
  const slots = d.slots.slice();
  slots[i] = f(d.slots[i]!);
  return { ...d, slots };
}

function checkIndex(d: PlayDraft, index: number, inclusiveEnd: boolean): void {
  const max = inclusiveEnd ? d.presnap.length : d.presnap.length - 1;
  if (!Number.isInteger(index) || index < 0 || index > max) throw new DesignError(`presnap index ${index} out of range`);
}

/** The reducer. Throws `DesignError` for an edit that names a slot or step the draft does not have. */
export function applyEdit(d: PlayDraft, e: PlayEdit): PlayDraft {
  switch (e.type) {
    case 'set_name': return { ...d, name: e.name };
    case 'set_kind': return { ...d, kind: e.kind };
    case 'set_personnel': {
      const roles = slotsForPersonnel(e.personnel);
      if (!roles) throw new DesignError(`personnel group ${e.personnel} cannot be met by eleven players`);
      // Keep every slot the new group still names; add the new ones at the starting picture (G1.1.2).
      const keep = new Map(d.slots.map((s) => [s.role, s]));
      return { ...d, personnel: e.personnel, slots: roles.map((r, i) => keep.get(r) ?? defaultSlot(r, Math.max(0, i - 6))) };
    }
    case 'apply_formation': {
      // Choosing a part rewrites the affected players' alignments by the part's definition (O3.1.1).
      let out: PlayDraft = { ...d, formation: { ...d.formation, id: e.formation.id }, shotgun: e.formation.shotgun };
      if (e.formation.personnel !== d.personnel) out = applyEdit(out, { type: 'set_personnel', personnel: e.formation.personnel });
      for (const p of e.formation.players) {
        if (out.slots.some((s) => s.role === p.role)) out = withSlot(out, p.role, (s) => ({ ...s, at: p.at, onLine: p.onLine }));
      }
      return out;
    }
    case 'set_strength': return { ...d, formation: { ...d.formation, strength: e.strength } };
    case 'move_slot': return withSlot(d, e.role, (s) => ({ ...s, at: e.at, onLine: e.onLine }));
    case 'set_stance': return withSlot(d, e.role, (s) => ({ ...s, stance: e.stance }));
    case 'set_letter': return withSlot(d, e.role, (s) => ({ ...s, letter: e.letter }));
    case 'set_flags': return withSlot(d, e.role, (s) => ({ ...s, reportsEligible: e.reportsEligible, extraTackle: e.extraTackle }));
    case 'set_assignment': return withSlot(d, e.role, (s) => ({ ...s, assignment: e.assignment }));
    case 'set_path': return withSlot(d, e.role, (s) => ({ ...s, assignment: { ...s.assignment, behavior: e.behavior, path: e.path } }));
    case 'set_params': return withSlot(d, e.role, (s) => ({ ...s, assignment: { ...s.assignment, params: e.params } }));
    case 'set_rules': return withSlot(d, e.role, (s) => ({ ...s, assignment: { ...s.assignment, rules: e.rules } }));
    case 'insert_presnap': { checkIndex(d, e.index, true); const p = d.presnap.slice(); p.splice(e.index, 0, e.step); return { ...d, presnap: p }; }
    case 'replace_presnap': { checkIndex(d, e.index, false); const p = d.presnap.slice(); p[e.index] = e.step; return { ...d, presnap: p }; }
    case 'remove_presnap': { checkIndex(d, e.index, false); const p = d.presnap.slice(); p.splice(e.index, 1); return { ...d, presnap: p }; }
    case 'set_qb': return { ...d, qb: e.qb };
    case 'set_protection': return { ...d, protection: e.protection };
    case 'set_run_direction': return { ...d, runDirection: e.runDirection };
    case 'set_shotgun': return { ...d, shotgun: e.shotgun };
    case 'set_tags_allowed': return { ...d, tagsAllowed: e.tags };
    case 'set_intent': return { ...d, intent: { role: e.role, beats: e.beats, checkOutOf: e.checkOutOf } };
    case 'set_coaching_point': {
      if (!d.slots.some((s) => s.role === e.role)) throw new DesignError(`no slot ${e.role} on play ${d.id}`);
      const cp: Record<string, string> = { ...d.coachingPoints };
      if (e.text === '') delete cp[e.role]; else cp[e.role] = e.text;
      return { ...d, coachingPoints: cp };
    }
    case 'set_status': return { ...d, status: e.status };
    case 'dismiss_warning': {
      if (e.reason.trim() === '') throw new DesignError('a dismissed warning needs a typed reason (O3.1.3)');
      const rest = d.dismissed.filter((w) => !(w.code === e.code && w.role === e.role));
      return { ...d, dismissed: [...rest, { code: e.code, role: e.role, reason: e.reason }] };
    }
    case 'restore_warning': return { ...d, dismissed: d.dismissed.filter((w) => !(w.code === e.code && w.role === e.role)) };
    case 'set_notes': return { ...d, notes: e.notes };
    case 'mirror': return mirrorDraft(d);
  }
}

// ---- Mirror (G1.4.2, O3.1.2 "flip"): every mark across the ball. Twice returns the original byte for byte (G1.1.1 acceptance 3).

/** Negation that never produces -0, so a mirrored-twice object serialises identically. */
export function neg(x: number): number { return x === 0 ? 0 : -x; }
const flipYd = (a: Yd2): Yd2 => [a[0], neg(a[1])];
const flipPt = (p: DrawnPoint): DrawnPoint => ({ ...p, at: flipYd(p.at) });
const SIDE_SWAP: Readonly<Record<string, string>> = { left: 'right', right: 'left' };
const flipArg = <T,>(v: T): T => (typeof v === 'string' && v in SIDE_SWAP ? (SIDE_SWAP[v] as T) : v);
function flipParams<T extends Readonly<Record<string, unknown>>>(r: T): T {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(r)) out[k] = flipArg(r[k]);
  return out as T;
}

export function mirrorDraft(d: PlayDraft): PlayDraft {
  const strength = (SIDE_SWAP[d.formation.strength] ?? d.formation.strength) as Strength;
  return {
    ...d,
    formation: { ...d.formation, strength },
    runDirection: d.runDirection === null ? null : (flipArg(d.runDirection) as PlayDraft['runDirection']),
    slots: d.slots.map((s) => ({
      ...s, at: flipYd(s.at),
      assignment: { ...s.assignment, params: flipParams(s.assignment.params), path: s.assignment.path.map(flipPt), technique: flipParams(s.assignment.technique) },
    })),
    presnap: d.presnap.map((st): PresnapStep => (st.kind === 'shift'
      ? { ...st, moves: st.moves.map((m) => ({ ...m, to: flipYd(m.to) })) }
      : { ...st, path: st.path.map(flipPt), speed: st.speed === null ? null : flipYd(st.speed) })),
  };
}
