// What the crisis and community engines hand to the systems that own each effect (L9.3.1 "Every act
// resolves through the system that owns it. This leaf adds no effect sizes of its own"). The engines
// never write a relationship, an hour, a mood or a tie themselves: they return orders, and the week
// runner (G-69) applies each through its owner. `amount: null` means "the owning system's class size".
import type { WorldDate } from '@gm/schema';

export type Order =
  /** L1.1.2 memory, held by `holderId` about `aboutId` (the coach unless stated). */
  | { readonly kind: 'memory'; readonly holderId: number; readonly aboutId: number; readonly memoryClass: string; readonly amount: number | null; readonly halfLifeWeeks: number | null; readonly sourceEventId: number | null }
  /** A memory written to everyone in a group (the team, the staff) who knows of it. */
  | { readonly kind: 'group_memory'; readonly group: 'team' | 'staff' | 'upstairs' | 'knowers'; readonly teamId: number; readonly aboutId: number; readonly memoryClass: string; readonly amount: number | null; readonly sourceEventId: number | null }
  /** E7 hours charge. */
  | { readonly kind: 'hours'; readonly personId: number; readonly minutes: number; readonly what: string }
  /** L6.5.1 fan mood. */
  | { readonly kind: 'fan_mood'; readonly teamId: number; readonly delta: number }
  /** L5.4.3 booster mood. */
  | { readonly kind: 'booster_mood'; readonly teamId: number; readonly delta: number }
  /** S4 standing with the boss (lower rungs). */
  | { readonly kind: 'standing_with_boss'; readonly personId: number; readonly bossId: number; readonly delta: number }
  /** X7 / L4.2.3 tie with a dated source event. */
  | { readonly kind: 'tie'; readonly aId: number; readonly bId: number; readonly strength: number; readonly sourceEventId: number; readonly date: WorldDate }
  /** L7.3.2 high school coach familiarity. */
  | { readonly kind: 'familiarity'; readonly holderId: number; readonly aboutId: number; readonly delta: number }
  /** An act handed to the system that owns it (L9.3.1 act set: ownerSystem and event from acts.json). */
  | { readonly kind: 'owner_event'; readonly ownerSystem: string; readonly event: string; readonly crisisId: number | null; readonly targetIds: readonly number[]; readonly ask: boolean }
  /** L9.3.2: closing a crisis without meeting its cause leaves the trigger armed in the owning system. */
  | { readonly kind: 'trigger_armed'; readonly crisisId: number; readonly causeEventIds: readonly number[] }
  /** L2.4.4 culture file precedent. */
  | { readonly kind: 'culture_precedent'; readonly teamId: number; readonly crisisId: number; readonly typeId: string; readonly actIds: readonly string[] }
  /** H2 scouting gain for an opponent tied to a clinic attendee (L8.4.3). */
  | { readonly kind: 'scouting_note'; readonly teamId: number; readonly aboutTeamId: number; readonly concept: string }
  /** S6 notice event for the coach (L8.4.3, L8.5.1). */
  | { readonly kind: 'notice'; readonly personId: number; readonly what: string }
  /** X4 notability input for a person or team. */
  | { readonly kind: 'notability'; readonly personId: number | null; readonly teamId: number | null; readonly what: string; readonly score: number };
