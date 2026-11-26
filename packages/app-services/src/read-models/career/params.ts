// Display choices of the coach screen read models (O4.6.2). No real-world number lives here: return means and
// spreads come from the wealth module's market model (E6.4, facts). Each value is a named assumption.
import type { ParamFile } from '@gm/schema';

export const PARAMS: ParamFile = {
  module: 'app-services.career-screens',
  version: 'cs.1',
  params: [
    {
      name: 'careerScreens.projectionYears', value: 10, min: 1, max: 40, unit: 'count', belongsTo: 'O4.6.2',
      basis: 'assumption', leaf: 'O4.6.2', constrainedBy: 'test career-screens: the finance projection looks this many years ahead', status: 'starting',
    },
    {
      name: 'careerScreens.projectionZ', value: 1.2816, min: 0.5, max: 3, unit: 'ratio', belongsTo: 'O4.6.2',
      basis: 'assumption', leaf: 'O4.6.2',
      constrainedBy: 'test career-screens: the range ends sit this many standard deviations of the mean yearly return from the middle (1.2816 is the 10th and 90th percentile of a normal)', status: 'starting',
    },
  ],
};

export function param(name: string): number {
  const p = PARAMS.params.find((x) => x.name === name);
  if (!p) throw new Error(`career-screens: unknown parameter ${name}`);
  return p.value;
}
