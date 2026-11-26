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
    // Week screens' desk (item 2d).
    row('meeting.newItemMinutes', 10, 1, 60, 'min', 'assumption', 'H4.1.2',
      'A-2d-1: minutes a new agenda item starts with in the editor; H4.1.2 gives each item minutes but no starting length (the user sets it)'),
    // C1.4.1 travel matrix and road time (item 2d travel).
    row('trip.cruiseKmh', 800, 500, 950, 'km/h', 'bible', 'C1.4.1', 'C1.4.1 outputs: flight hours are the distance divided by a starting cruise value of 800 km per hour, plus 1 hour'),
    row('trip.flightFixedHours', 1, 0, 3, 'h', 'bible', 'C1.4.1', 'C1.4.1 outputs: plus 1 hour on every flight'),
    row('trip.roadCircuity', 1.2, 1, 1.6, 'ratio', 'assumption', 'C1.4.1',
      'A-2d-3: road km per great-circle km. No bible value; about 1.2 for the United States in road-circuity studies (Ballou, Rahardja and Sakai 2002), one source, so an assumption'),
    row('trip.busKmh', 90, 60, 110, 'km/h', 'assumption', 'H8.1.1',
      'A-2d-4: average team-bus speed door to door before handling (H8.1.1 adds bus handling). No source; a highway-coach assumption'),
    // Stand-in press corps (item 2d press): no reporters are generated people yet (L6.1.1).
    row('press.reachLocal', 3, 1, 5, 'scale', 'assumption', 'L6.1.1', 'A-2d-5: reach of a local outlet in the stand-in room (L6.1.1 reach 1 to 5), the middle of the scale'),
    row('press.reachNational', 5, 1, 5, 'scale', 'assumption', 'L6.1.1', 'A-2d-5: reach of the national outlet in the stand-in room, the top of the scale'),
    row('press.trust', 50, 0, 100, 'scale', 'assumption', 'L6.1.1', 'A-2d-6: stand-in reporters start neutral toward the coach (L6 trust 0 to 100, the midpoint)'),
    row('press.controversy', 0.5, 0, 1, 'ratio', 'assumption', 'K8.7.1', 'A-2d-6: stand-in appetite for controversy, the middle of K8.7.1 0 to 1'),
    row('press.goodwill', 50, 0, 100, 'scale', 'assumption', 'L6', 'A-2d-6: L6 mean goodwill toward the coach before the media model holds one, the midpoint'),
    row('press.notability', 50, 0, 100, 'scale', 'assumption', 'X4.1.1', 'A-2d-7: notability of a season event until the world news step scores it (X4.1.1 0 to 100, the midpoint)'),
    row('press.streakGames', 3, 2, 6, 'count', 'assumption', 'H7.2.1', 'A-2d-8: games in a row before a winning or losing streak is a press event; no bible count'),
    row('documents.groups', 8, 1, 12, 'count', 'assumption', 'H9.1.2',
      'A-2d-2: position groups that get a players packet (H9.1.2 rule 1, 4 hours per group): QB, RB, WR, TE, OL, DL, LB, DB, the eight football groups of the coach position list (career POSITION_GROUPS) until staffs set their own rooms'),
  ],
};

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name.slice('weekLoop.'.length), p.value]));

export function P(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`week loop: no parameter ${name}`);
  return v;
}
