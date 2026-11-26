// One person's update: need levels, stress, band and coping in the X5 order, emitting events through the
// one protection check. Team-level acts are drawn after every person is updated, by `weekOutcomes`.
import { mayReceiveEvent, type PersonOrigin, type PersonState, type WorldDate } from '@gm/schema';
import { np, type Draw } from './params.ts';
import type { NeedDef, NeedId } from './registry.ts';
import { stepNeedLevel, type NeedCondition, type NeedReference } from './levels.ts';
import { settleTalks, stepStress, type StressBand, type StressEvent, type StressMemo, STRESS_BANDS } from './stress.ts';
import { copingEffects, stepCoping, type CopingHabit, type CopingRecord, type CopingSubject } from './coping.ts';
import { eventType, type NeedsEvent } from './events.ts';

export interface PersonUpdateInput {
  readonly person: { readonly id: number; readonly origin: PersonOrigin; readonly age: number };
  readonly state: PersonState;
  readonly memo: StressMemo;
  readonly coping: CopingRecord | null;
  readonly needs: readonly NeedDef[];
  readonly weights: Readonly<Record<NeedId, number>>;
  readonly conditions: Readonly<Record<NeedId, NeedCondition>>;
  readonly references: Readonly<Record<NeedId, NeedReference>>;
  readonly events: readonly StressEvent[];
  readonly facets: Readonly<Record<string, number>>;
  readonly hasWarmEdge: boolean;
  readonly copingAddressed: boolean;
  readonly weeks?: number;
  /** Date of this update, written as the coping start date. */
  readonly today: WorldDate;
}

export interface PersonUpdate {
  readonly state: PersonState;
  readonly memo: StressMemo;
  readonly coping: CopingRecord | null;
  readonly copingEffects: ReturnType<typeof copingEffects> | null;
  readonly events: readonly NeedsEvent[];
}

/**
 * Runs one update for a generated, designed or imported person. The user's person has no need vector and
 * no stress number (X5.1.1 rule 4, X5.2.4 rule 7): passing it throws, so a wiring mistake is loud.
 */
export function updatePerson(input: PersonUpdateInput, draw: Draw): PersonUpdate {
  if (input.person.origin === 'user') throw new Error('X5: the user person has no needs or stress');
  const weeks = input.weeks ?? 1;
  const isProtected = input.person.origin === 'imported';
  const needLevels: Record<NeedId, number> = {};
  for (const def of input.needs) {
    if (input.weights[def.id] === undefined) continue; // not applicable to this person kind
    const cond = input.conditions[def.id] ?? { met: 1 };
    needLevels[def.id] = stepNeedLevel(input.state.needs[def.id] ?? 0, def, cond, input.references[def.id], weeks);
  }
  const talks = settleTalks(input.memo, needLevels);
  // Coping relief from the habit held going into the week (X5.2.4 rule 4).
  const relief: StressEvent[] = input.coping ? [{ source: `coping:${input.coping.copingId}`, size: -copingEffects(input.coping.copingId).reliefPerWeek * weeks }] : [];
  const band = (STRESS_BANDS as readonly string[]).includes(input.state.stressBand) ? (input.state.stressBand as StressBand) : 'settled';
  const step = stepStress(input.state.stress, band, talks.memo, {
    needLevels, weights: input.weights, events: [...input.events, ...talks.events, ...relief],
    patience: isProtected ? np('needs.trait.facetMid') : (input.facets.patience ?? np('needs.trait.facetMid')), weeks,
  });
  const out: NeedsEvent[] = [];
  const emit = (type: string, payload: NeedsEvent['payload']) => {
    if (mayReceiveEvent(input.person, eventType(type))) out.push({ type, personId: input.person.id, payload });
  };
  if (step.bandChanged) emit('stress_band_changed', { from: band, to: step.band });

  const subject: CopingSubject = { isUser: false, isProtected, age: input.person.age, facets: isProtected ? {} : input.facets, hasWarmEdge: input.hasWarmEdge };
  const change = stepCoping(input.coping, subject, step.memo, input.copingAddressed, draw);
  let coping: CopingRecord | null = input.coping;
  const name = (h: CopingHabit) => ({ coping: h });
  if (change.kind === 'started') { coping = change.record; emit('coping_started', name(change.record.copingId)); }
  if (change.kind === 'stopped') { coping = null; emit('coping_stopped', name(change.previous)); }
  if (change.kind === 'replaced') { coping = change.record; emit('coping_stopped', name(change.previous)); emit('coping_started', name(change.record.copingId)); }

  return {
    state: {
      ...input.state,
      needs: needLevels,
      stress: step.stress,
      stressBand: step.band,
      coping: coping ? { copingId: coping.copingId, since: input.state.coping?.copingId === coping.copingId ? input.state.coping.since : input.today } : null,
    },
    memo: step.memo,
    coping,
    copingEffects: coping ? copingEffects(coping.copingId) : null,
    events: out,
  };
}
