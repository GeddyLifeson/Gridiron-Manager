// Starting numbers of the scripted career runs (G-89). The bible states the pacing ones (S10.1.1: the
// 5-point simulation pull, 4 key weeks; S10.3.1: the climb targets; Q4.3.1: the 25% margin over 30
// seasons). Everything that shapes the stand-in season and offer model is this module's Assumption: it
// exists only so scripted careers can run before the world loop (G-81) drives real seasons, and it is
// replaced by the world's own season results when G-81 lands (README, CR-G89-3).
import type { ParamFile, TuningParam } from '@gm/schema';

const b = (name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string): TuningParam => ({
  name, value, min, max, unit, belongsTo: 'career-run', basis: 'bible', leaf, constrainedBy, status: 'starting',
});
const a = (name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string): TuningParam => ({
  name, value, min, max, unit, belongsTo: 'career-run', basis: 'assumption', leaf, constrainedBy, status: 'starting',
});

export const PARAMS: ParamFile = {
  module: 'career-run',
  version: '1',
  params: [
    // S10.1.1 week modes.
    b('careerRun.pace.simPull', 5, 0, 30, 'grade points', 'S10.1.1', 'rule 1: simulated mean pulled 5 points down'),
    b('careerRun.pace.keyWeeks', 4, 1, 17, 'weeks', 'S10.1.1', 'key weeks starting value 4'),
    a('careerRun.pace.seasonWeeks', 13, 10, 18, 'weeks', 'S10.1.1', '12 to 14 game season (middle)'),
    a('careerRun.pace.unplayedMedian', 70, 0, 100, 'grade', 'S10.1.1', 'rule 2: median AI coach for the seat (E9.1.3 case 3)'),
    a('careerRun.pace.unplayedSpread', 12, 0, 50, 'grade points', 'S10.1.1', 'rule 2: wider spread than a played family'),
    a('careerRun.pace.minSpread', 2, 0, 20, 'grade points', 'S10.1.1', 'floor on a running spread from few samples'),
    b('careerRun.pace.summaryEventsMin', 3, 0, 10, 'events', 'S10.1.1', 'season summary: three to five decision events'),
    b('careerRun.pace.summaryEventsMax', 5, 0, 10, 'events', 'S10.1.1', 'season summary: three to five decision events'),
    // S10.3.1 acceptance.
    b('careerRun.target.coordinatorRung', 7, 0, 9, 'rung', 'S10.3.1', 'perfect work reaches rung 7'),
    b('careerRun.target.coordinatorYearsMin', 8, 1, 30, 'years', 'S10.3.1', 'in 8 to 14 game years'),
    b('careerRun.target.coordinatorYearsMax', 14, 1, 30, 'years', 'S10.3.1', 'in 8 to 14 game years'),
    a('careerRun.target.perfectShare', 0.8, 0, 1, 'share', 'S10.3.1', '"across seeds": share of seeds that must land in the window'),
    a('careerRun.target.averageRung9Max', 0.5, 0, 1, 'share', 'S10.3.1', '"usually do not reach rung 9": under half'),
    // Q4.3.1 loop search.
    b('careerRun.loop.seasons', 30, 1, 60, 'seasons', 'Q4.3.1', 'acceptance over 30 seasons'),
    b('careerRun.loop.margin', 0.25, 0, 2, 'share', 'Q4.3.1', 'starting margin 25% (Assumption in the leaf)'),
    a('careerRun.loop.responseFloor', 0.02, 0, 1, 'share', 'Q4.3.1', 'yield change below which the world "did not respond"'),
    // Stand-in season model (replaced by G-81 seasons).
    a('careerRun.season.coachShare', 0.35, 0, 1, 'ratio', 'Q3.2.6', 'CR-1: coach effect, larger on weak rosters'),
    a('careerRun.season.noise', 0.1, 0, 1, 'ratio', 'J14', 'season-to-season luck in win share'),
    a('careerRun.season.reputationKeep', 0.6, 0, 1, 'ratio', 'E5', 'running reputation keeps this share each season'),
    a('careerRun.season.firingGap', 0.1, 0, 1, 'ratio', 'E4.4.1', 'results this far below expectation start firing risk'),
    a('careerRun.season.expectRosterShare', 0.5, 0, 1, 'share', 'E4.2', 'owner expectation: this share roster, the rest a .500 season'),
    a('careerRun.season.firingSlope', 3, 0, 20, 'ratio', 'E4.4.1', 'firing chance per unit of shortfall past the gap'),
    a('careerRun.season.graceSeasons', 1, 0, 5, 'seasons', 'E4.4.1', 'first season in a head job is not fired for results'),
    a('careerRun.season.cascadeShare', 0.5, 0, 1, 'share', 'S7.1.1', 'assistants let go when their head coach is fired'),
    a('careerRun.season.headTurnover', 0.12, 0, 1, 'share', 'E2.3.4', 'yearly chance an assistant head coach leaves anyway'),
    // Stand-in offers.
    a('careerRun.offer.stepUpBase', 25, 0, 100, 'market value', 'E2.4.1', 'market value at which a step-up offer is even'),
    a('careerRun.offer.stepUpPerRung', 5, 0, 20, 'market value', 'E2.4.1', 'extra value needed per rung'),
    a('careerRun.offer.spread', 10, 1, 50, 'market value', 'E2.4.1', 'width of the offer chance ramp'),
    a('careerRun.offer.lateralChance', 0.35, 0, 1, 'share', 'E2.3.3', 'chance of a lateral offer each offseason'),
    a('careerRun.offer.pathGrowth', 8, 0, 50, 'path points', 'E2.4.1', 'network path gained per season on a staff at median work; scales with work above 50'),
    a('careerRun.offer.outsidePathGrowth', 5, 0, 50, 'path points', 'S2', 'path gained per season at rung 0 (volunteering, clinics, high school)'),
    a('careerRun.offer.proShareAt7', 0.4, 0, 1, 'share', 'S1.1.3', 'share of rung 6+ offers that are pro seats'),
    a('careerRun.offer.monthlyPathLoss', 1, 0, 10, 'path points', 'S7.3.1', 'G-80 out.monthlyPeerLoss: each month out without visits or public work'),
    a('careerRun.offer.agentFrom', 7, 0, 9, 'rung', 'E2.4.1', 'agent reach counts from this rung'),
    // Q4.3.1 loop effects and the X2 memory that answers them.
    a('careerRun.memory.hopPenalty', 12, 0, 100, 'market value', 'Q4.3.1', 'hirers read each logged one-season stay'),
    a('careerRun.memory.tankOwnerHit', 0.25, 0, 1, 'ratio', 'L5.2.6', 'owners notice a tanked season (reputation loss)'),
    a('careerRun.memory.raidPeerHit', 6, 0, 100, 'path points', 'Q4.3.1', 'peers cut ties with a raider, per raid'),
    a('careerRun.memory.raidDecay', 0.3, 0, 1, 'share', 'L4', 'each logged raid cuts what the next one brings (assistants and agents remember)'),
    a('careerRun.memory.flipRecruitHit', 0.04, 0, 1, 'ratio', 'T', 'recruits remember broken promises, roster loss per flip season'),
    a('careerRun.loop.tankRosterGain', 0.06, 0, 1, 'ratio', 'C7', 'roster gain from a higher pick after a tanked season'),
    a('careerRun.loop.raidRosterGain', 0.03, 0, 1, 'ratio', 'L4', 'results gain from a raided assistant'),
    a('careerRun.loop.flipRosterGain', 0.04, 0, 1, 'ratio', 'T', 'roster gain from mass offers and flips'),
  ],
};

/** Read one value by name. Throws on an unknown name. */
export function param(name: string): number {
  const row = PARAMS.params.find((r) => r.name === name);
  if (!row) throw new Error(`career-run: unknown param ${name}`);
  return row.value;
}

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
