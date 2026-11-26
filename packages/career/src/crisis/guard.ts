// L9.1.2 the real-person guard: the single rule every event generator in career checks. Built on the
// schema's protection check (`mayReceiveEvent`, `guardClassOf`, P3.2.2 / X2.1.2) and adding the rules
// L9.1.2 states beyond it: minors never get personal events (rule 3), imported people get no family
// objects, no quotes and no character labels (rules 2 and 4). There is no switch: nothing here reads a
// setting, a mod flag or a debug value (rule 7).
import { guardClassOf, type HarmClass, type PersonOrigin } from '@gm/schema';
import type { GuardClass } from './catalogue.ts';

/** What the guard needs to know about a person on the event date. */
export interface GuardPerson {
  readonly personId: number;
  readonly origin: PersonOrigin;
  /** Under 18 on the event date (L9.1.2 inputs). */
  readonly minor: boolean;
  /** Holds a family object (L7.3.1); imported people never do. */
  readonly hasFamily?: boolean;
}

export type GuardRole = 'subject' | 'actor' | 'victim' | 'witness';
export type DenialReason = 'imported' | 'minor' | 'no_family';

export interface Denial {
  readonly what: string;
  readonly personId: number;
  readonly role: GuardRole;
  readonly reason: DenialReason;
}

export type GuardResult = { readonly ok: true } | { readonly ok: false; readonly denials: readonly Denial[] };

/** The guard class for a history event type, from its stored harm class (one source of truth, X2.1.2 rule 2). */
export function guardOfHarm(h: HarmClass): GuardClass { return guardClassOf(h); }

/**
 * Allow or deny one proposed event. Football events land on everyone. A personal event may not name an
 * imported person in any role (rule 1) nor a minor (rule 3); when it needs a family object, the subject
 * must hold one (rule 4).
 */
export function guardCheck(
  what: string,
  cls: GuardClass,
  people: readonly { readonly person: GuardPerson; readonly role: GuardRole }[],
  opts: { readonly requiresFamily?: boolean } = {},
): GuardResult {
  if (cls === 'football') return { ok: true };
  const denials: Denial[] = [];
  for (const { person, role } of people) {
    if (person.origin === 'imported') denials.push({ what, personId: person.personId, role, reason: 'imported' });
    else if (person.minor) denials.push({ what, personId: person.personId, role, reason: 'minor' });
    else if (opts.requiresFamily && role === 'subject' && person.hasFamily !== true) denials.push({ what, personId: person.personId, role, reason: 'no_family' });
  }
  return denials.length === 0 ? { ok: true } : { ok: false, denials };
}

/** People a generator may pick as the subject of a class. Empty list: the event does not occur (rule 1). */
export function eligibleSubjects<P extends GuardPerson>(cls: GuardClass, candidates: readonly P[], requiresFamily = false): P[] {
  return candidates.filter((p) => guardCheck('pick', cls, [{ person: p, role: 'subject' }], { requiresFamily }).ok);
}

/** Rule 2: no generated quotation is ever attributed to an imported person. */
export function quoteAllowed(p: Pick<GuardPerson, 'origin'>): boolean { return p.origin !== 'imported'; }

/** Rule 4: imported people have no family objects. */
export function mayHoldFamily(p: Pick<GuardPerson, 'origin'>): boolean { return p.origin !== 'imported'; }

/** Rule 4: a label that implies character is never shown for an imported person; football-record labels may be. */
export function labelAllowed(p: Pick<GuardPerson, 'origin'>, kind: 'football' | 'character'): boolean {
  return kind === 'football' || p.origin !== 'imported';
}
