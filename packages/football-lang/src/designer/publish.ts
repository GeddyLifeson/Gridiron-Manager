// Publishing a play (O3.7.1, O3.1.3, G1.5.1). Never blocked by a rule failure: an illegal play publishes
// after one confirmation marked "illegal as drawn" and keeps its `ruleFailures`. Only a play the engine
// cannot run is refused. Publishing a changed installed play names the assignments that are new teaching (G5).
import type { PlayDraft, RuleFailure } from './types.ts';
import type { DesignMessage } from './validate.ts';
import { canonical, slotAssignment } from './to-engine.ts';

export type PublishResult =
  | { readonly kind: 'refused'; readonly messages: readonly DesignMessage[] }
  | { readonly kind: 'needs_confirmation'; readonly messages: readonly DesignMessage[] }
  | { readonly kind: 'published'; readonly play: PlayDraft; readonly illegalAsDrawn: boolean; readonly newTeaching: readonly string[] };

/** Slots whose assignment differs between two versions of a play (O3.7.1 "marks the changed assignments as new teaching"). */
export function changedRoles(before: PlayDraft, after: PlayDraft): string[] {
  const old = new Map(before.slots.map((s) => [s.role, canonical(slotAssignment(before, s))]));
  return after.slots.filter((s) => old.get(s.role) !== canonical(slotAssignment(after, s))).map((s) => s.role);
}

export function publishDraft(d: PlayDraft, messages: readonly DesignMessage[], opts: { readonly confirmIllegal: boolean; readonly previous: PlayDraft | null }): PublishResult {
  const refused = messages.filter((m) => m.level === 'refused');
  if (refused.length) return { kind: 'refused', messages: refused };
  const illegal = messages.filter((m) => m.level === 'illegal');
  if (illegal.length && !opts.confirmIllegal) return { kind: 'needs_confirmation', messages: illegal };
  const ruleFailures: RuleFailure[] = illegal.flatMap((m): RuleFailure[] => (m.roles.length ? m.roles.map((r) => ({ ruleId: m.citation, role: r })) : [{ ruleId: m.citation, role: null }]));
  // A legal draft becomes valid; an illegal one keeps its status (it may go from draft to installed without ever being valid, G1.5.1).
  const status = illegal.length ? d.status : d.status === 'draft' ? 'valid' : d.status;
  const play: PlayDraft = { ...d, status, ruleFailures, version: d.version + 1 };
  const newTeaching = opts.previous && opts.previous.status === 'installed' ? changedRoles(opts.previous, play) : [];
  return { kind: 'published', play, illegalAsDrawn: illegal.length > 0, newTeaching };
}
