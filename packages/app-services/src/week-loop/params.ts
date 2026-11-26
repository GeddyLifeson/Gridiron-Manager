// Tuning constants of the seat's week loop (H1.1.3 with H2.1, H2.5.1, H1.2.2). Every value is a starting value
// a bible leaf states (basis `bible`) or a named assumption: the season has no staff people yet (K6), so the
// staff that breaks down film, charts and drafts the sheet is an average one until generated staffs play.
import type { ParamFile, TuningParam } from '@gm/schema';

type Basis = TuningParam['basis'];
const row = (name: string, value: number, min: number, max: number, unit: string, basis: Basis, leaf: string, constrainedBy: string): TuningParam =>
  ({ name: `weekLoop.${name}`, value, min, max, unit, belongsTo: 'app-services.weekLoop', basis, leaf, constrainedBy, status: 'starting' });

export const PARAMS: ParamFile = {
  module: 'app-services.weekLoop',
  version: 'wl.1',
  params: [
    // H2.1.1 breakdown scope.
    row('breakdown.games', 4, 1, 17, 'count', 'bible', 'H2.1.1', 'H2.1.1: "last N games (starting default 4)"'),
    row('breakdown.advanceHours', 24, 0, 120, 'h', 'assumption', 'H2.1.1',
      'H2.1.1 rule 2: QC coaches begin the next opponent during the current week, so a four-game breakdown is ready on G-6; the hours of that head start are not stated'),
    row('staff.qcCount', 3, 1, 10, 'count', 'assumption', 'K6', 'quality-control staff breaking down film until generated staffs play (K6); a stand-in, not a sourced staff size'),
    row('staff.qcSpeed', 1, 0.7, 1.3, 'ratio', 'assumption', 'H2.1.1', 'H2.1.1 rule 1 speed factor 0.7 to 1.3: an average QC coach'),
    row('staff.qcHours', 30, 1, 120, 'h', 'assumption', 'H2.1.1', 'hours each QC coach gives to breakdown before the game-plan day'),
    // H2.1.2 tagging and K2.1.4 coordinator skill, average until staff people exist.
    row('staff.taggerSkill', 0.5, 0, 1, 'ratio', 'assumption', 'H2.1.2', 'H2.1.2 rule 5 tagging skill 0 to 1: the middle of the range'),
    row('staff.disguise', 0, 0, 1, 'ratio', 'assumption', 'H2.1.2', 'disguise of a charted call; the play record carries no J5 disguise value yet'),
    row('staff.preparationZ', 0, -3, 3, 'z', 'assumption', 'K2.1.4', 'average coordinator (z 0), the same stand-in the game-day console setup uses'),
    row('staff.evaluationZ', 0, -3, 3, 'z', 'assumption', 'K2.1.4', 'average coordinator (z 0)'),
    row('staff.tellHours', 0, 0, 40, 'h', 'assumption', 'K3.1.1', 'K3.1.1 rule 4: no staff hours set aside for tells until the week screen offers the choice'),
    // H1.2.2 install: available team reps.
    row('install.teamMinuteShare', 0.4, 0.1, 0.9, 'share', 'assumption', 'H1.2.2',
      'share of a practice block spent in team periods (H3.1.1 period kinds); the template blocks carry minutes, not periods'),
  ],
};

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name.slice('weekLoop.'.length), p.value]));

export function P(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`week loop: no parameter ${name}`);
  return v;
}
