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
    {
      name: 'careerScreens.hoursCulture', value: 0.5, min: 0, max: 1, unit: 'ratio', belongsTo: 'S4.1.1',
      basis: 'assumption', leaf: 'E7.7.2',
      constrainedBy: 'test career-live: the boss\'s hours culture (S4.1.1) is not on people yet: a new boss gets this flagged mid-range default in the coach\'s file (career.coach, CS-3, MA-82)', status: 'starting',
    },
    {
      name: 'careerScreens.startDebtCents', value: 0, min: 0, max: 50_000_000, unit: 'cents', belongsTo: 'E6.1.2',
      basis: 'assumption', leaf: 'E6.1.2',
      constrainedBy: 'test career-state: starting student debt is 0 until a source is found (coordinator ruling 2026-11-26, CS-1)', status: 'starting',
    },
    {
      name: 'careerScreens.startMonthlyCostsCents', value: 0, min: 0, max: 5_000_000, unit: 'cents', belongsTo: 'E6.1.2',
      basis: 'assumption', leaf: 'E6.1.2',
      constrainedBy: 'test career-state: starting monthly costs are 0 until a source is found (coordinator ruling 2026-11-26, CS-1)', status: 'starting',
    },
    {
      name: 'careerScreens.riskLevel', value: 3, min: 1, max: 5, unit: 'index', belongsTo: 'E6.6.2',
      basis: 'assumption', leaf: 'E6.6.2',
      constrainedBy: 'test career-state: the middle risk level until he sets one; E6.6.2 gives no default (CS-6)', status: 'starting',
    },
    {
      name: 'careerScreens.savingsRate', value: 0, min: 0, max: 1, unit: 'ratio', belongsTo: 'E6.6.2',
      basis: 'assumption', leaf: 'E6.6.2',
      constrainedBy: 'test career-state: nothing is saved until he sets a rate; E6.6.2 gives no default (CS-6)', status: 'starting',
    },
  ],
};

export function param(name: string): number {
  const p = PARAMS.params.find((x) => x.name === name);
  if (!p) throw new Error(`career-screens: unknown parameter ${name}`);
  return p.value;
}
