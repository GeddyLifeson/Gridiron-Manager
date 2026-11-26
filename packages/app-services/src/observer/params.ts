// Tuning constants of the observer module (plans/game-build-plan.md G-27). No real-world number
// lives here: every value is a starting value a bible leaf states, or a named assumption.
import type { ParamFile } from '@gm/schema';

export const PARAMS: ParamFile = {
  module: 'app-services.observer',
  version: 'g27.1',
  params: [
    {
      name: 'observer.bridge.max_count', value: 25, min: 1, max: 100, unit: 'count', belongsTo: 'K9.3.1',
      basis: 'bible', leaf: 'K9.3.1', constrainedBy: 'test observer/bridges: the bridge list stays under this count', status: 'starting',
    },
    {
      name: 'observer.audit.marked_people', value: 10, min: 1, max: 1000, unit: 'count', belongsTo: 'Q1.4.2',
      basis: 'bible', leaf: 'Q1.4.2', constrainedBy: 'test observer/crawler: marked people in the true-value search', status: 'starting',
    },
    {
      name: 'observer.audit.swap_games', value: 500, min: 1, max: 100000, unit: 'count', belongsTo: 'Q1.4.1',
      basis: 'bible', leaf: 'Q1.4.1', constrainedBy: 'Q1.4.1 swap test run size once the coach AI exists (G-58, G-59)', status: 'starting',
    },
    {
      name: 'observer.audit.rank_margin', value: 0, min: 0, max: 1, unit: 'ratio', belongsTo: 'Q1.4.2',
      basis: 'assumption', leaf: 'Q1.4.2', constrainedBy: 'test observer/rank: a visible column may not follow the true order more closely than the estimate does', status: 'starting',
    },
  ],
};

export function param(name: string): number {
  const p = PARAMS.params.find((x) => x.name === name);
  if (!p) throw new Error(`observer: unknown parameter ${name}`);
  return p.value;
}
