// Tuning constants of the people read models (G-72). No real-world number lives here: roster limits come
// from the league rules (C5) through the caller and grades from G-19. The one value below is a named
// assumption.
import type { ParamFile } from '@gm/schema';

export const PARAMS: ParamFile = {
  module: 'app-services.people',
  version: 'g72.1',
  params: [
    {
      name: 'card.age_when_unknown', value: 25, min: 17, max: 45, unit: 'yr', belongsTo: 'O4.1.2',
      basis: 'assumption', leaf: 'D6.4.4',
      constrainedBy: 'A-G72-1: G-19 needs an age for the time-unseen drift; when the observer cannot read the birth date a mid-career age is used. Only the band width moves, never the grade.',
      status: 'starting',
    },
  ],
};

export function cardParam(name: string): number {
  const p = PARAMS.params.find((x) => x.name === name);
  if (!p) throw new Error(`people: unknown parameter ${name}`);
  return p.value;
}
