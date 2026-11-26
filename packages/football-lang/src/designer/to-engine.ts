// From the drawn play to what the engine runs (G1.1.1 -> J4.1.1, J1.6.1). The one place lateral is
// negated into the play frame (contract decision D-11: play frame lateral is positive to the LEFT).
import type { Assignment, FieldedPlayer, OffenseCall, PlayerId } from '@gm/schema';
import type { DesignSlot, DrawnPoint, PlayDraft, Yd2 } from './types.ts';
import { neg } from './edits.ts';

export const toFrame = (a: Yd2): { px: number; py: number } => ({ px: a[0], py: neg(a[1]) });
const toPathPoint = (p: DrawnPoint) => ({ ...toFrame(p.at), kind: p.kind, landmark: p.landmark });

/** Where each slot stands at the snap: the formation, then every shift and motion end point in order. */
export function snapSpots(d: PlayDraft): Map<string, { at: Yd2; onLine: boolean }> {
  const m = new Map(d.slots.map((s) => [s.role, { at: s.at, onLine: s.onLine }]));
  for (const st of d.presnap) {
    if (st.kind === 'shift') for (const mv of st.moves) m.set(mv.role, { at: mv.to, onLine: mv.onLine });
    else if (st.path.length > 0) m.set(st.role, { at: st.path[st.path.length - 1]!.at, onLine: st.onLine });
  }
  return m;
}

export function slotAssignment(d: PlayDraft, s: DesignSlot): Assignment {
  const motion = d.presnap.flatMap((st) => (st.kind === 'motion' && st.role === s.role ? st.path.map(toPathPoint) : []));
  const a = s.assignment;
  return {
    role: s.role,
    behavior: { type: a.behavior, params: { ...a.params }, path: a.path.map(toPathPoint) },
    preSnap: { align: { ...toFrame(s.at), rule: null }, onLine: s.onLine, stance: s.stance, motion },
    rules: a.rules.map((c) => ({ when: c.when, guard: c.guard, then: c.then.map((x) => ({ name: x.name, args: { ...x.args } })), text: c.text })),
    keys: [...a.keys], gaze: a.gaze, technique: { ...a.technique }, conceptId: a.concept, teachingLoad: a.load, calls: [...a.calls],
  };
}

/** The eleven assignments in slot order (team-slot order 0 to 10 when the call lists players the same way). */
export function toAssignments(d: PlayDraft): Assignment[] { return d.slots.map((s) => slotAssignment(d, s)); }

/** Canonical JSON: keys sorted at every level, so equal objects give equal text (O3.7.1 byte-identical undo). */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

/** 64-bit FNV-1a over the canonical text, as 16 hex digits. Integer arithmetic only (P1.1.1). */
export function contentHash(v: unknown): string {
  const s = canonical(v);
  let h1 = 0x811c9dc5 | 0, h2 = 0xcbf29ce4 | 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c ^ (h1 >>> 7), 0x01000193);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(h1) + hex(h2);
}

/** Hash of what the engine runs: the assignments and call fields, not notes or dismissals. */
export function draftContentHash(d: PlayDraft): string {
  return contentHash({ kind: d.kind, personnel: d.personnel, formation: d.formation, shotgun: d.shotgun, qb: d.qb, protection: d.protection, assignments: toAssignments(d) });
}

/**
 * The offensive call for a run of the play (I2.3.1). `players` maps each slot to the player the
 * depth chart (or the bench screen) put there; the order is the draft's slot order.
 */
export function toOffenseCall(d: PlayDraft, playerOf: (role: string) => PlayerId, contentId = `draft:${d.id}`): OffenseCall {
  const players: FieldedPlayer[] = d.slots.map((s) => ({ playerId: playerOf(s.role), role: s.role }));
  const strength = d.formation.strength === 'tight_end' ? null : d.formation.strength;
  const motion = d.presnap.find((s) => s.kind === 'motion');
  return {
    unit: 'offense', playContentId: contentId, contentHash: draftContentHash(d), kind: d.kind, personnelCode: d.personnel,
    formationId: d.formation.id, strength, motionId: motion ? `${motion.role}:motion` : null,
    protectionId: d.protection?.id ?? null, tags: [...d.name.tags], runDirection: d.runDirection, shotgun: d.shotgun,
    tempo: 'huddle', players,
  };
}
