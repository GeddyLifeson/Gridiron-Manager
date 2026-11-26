// People dynamics in the live world: the X12.1.1 steps memory (X6), edges (X7), needs (X5) and the culture
// season pass (X9), each wrapping the `@gm/people` module that owns the rules. Decisions: README.md.
import type { StepHandler } from '../loop/types.ts';
import type { TurnoverBinding } from '../turnover/binding.ts';
import type { LiveWorld } from '../loop/types.ts';
import { cultureStateOf, cultureStep, type CultureBinding } from './culture.ts';
import { edgesOf, edgesStep } from './edges.ts';
import { memoryOf, memoryStep } from './memory.ts';
import { needsOf, needsStep, recordedStarters, type NeedsBinding } from './needs.ts';

export { MODULE, PARAMS, param } from './params.ts';
export * from './shared.ts';
export * from './memory.ts';
export * from './edges.ts';
export * from './needs.ts';
export * from './culture.ts';

export interface PeopleBinding {
  readonly turnover: TurnoverBinding;
  readonly goals: CultureBinding['goals'];
  readonly recordInner?: NeedsBinding['recordInner'];
}

/** The four handlers, ready for `loop.systemsFrom`. */
export function peopleSteps(b: PeopleBinding): { memory: StepHandler; edges: StepHandler; needs: StepHandler; culture: StepHandler } {
  return {
    memory: memoryStep(),
    edges: edgesStep({ startersOf: recordedStarters }),
    needs: needsStep({ turnover: b.turnover, recordInner: b.recordInner }),
    culture: cultureStep({ rule: b.turnover.rule, goals: b.goals }),
  };
}

/** Row counts of the four steps' state, for run logs and the X13.3.1 size budget. */
export function stateSizes(world: LiveWorld): { ties: number; memoryHolders: number; memoryRows: number; needsPeople: number; cultures: number } {
  let memoryRows = 0;
  for (const l of memoryOf(world).rows.values()) memoryRows += l.length;
  return { ties: edgesOf(world).ties.size, memoryHolders: memoryOf(world).rows.size, memoryRows, needsPeople: needsOf(world).people.size, cultures: cultureStateOf(world).working.size };
}
export * from './ties.ts';
