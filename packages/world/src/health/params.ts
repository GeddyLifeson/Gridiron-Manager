// Constants of the world's health binding (D11 off-screen). Every row is a named Assumption until the
// world holds generated medical staff (L4) and a daily consultant roster; the medical numbers themselves
// (recovery, setbacks, protocol, re-injury) stay in league.medical.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.health';
const ROWS: readonly Row[] = [
  // D11.3.2 "skill" of the club's medical staff, 0 to 1. The world generates no physicians or trainers yet,
  // so every club's staff sits at the middle of the scale (the value the league.medical tests use).
  ['staff.diagnosticAccuracy', 0.5, 0, 1, 'ratio', 'assumption', 'D11.3.2', 'Middle of the 0 to 1 scale until medical staff are generated people (L4). No source read'],
  // D11.3.1 caution: a cautious physician clears later.
  ['staff.caution', 0.5, 0, 1, 'ratio', 'assumption', 'D11.3.1', 'Middle of the 0 to 1 scale until medical staff are generated people (L4). No source read'],
  // D11.4.2: an independent consultant is on call every day to confirm a concussion clearance (1) or never (0).
  ['consultant.availableDaily', 1, 0, 1, 'boolean', 'assumption', 'D11.4.2', 'Consultants are designated per club for the league year (F-injury-0002 covers game days only). No source read for other days'],
  // D11.4.2 prior-concussion effect looks back this far; older concussion days are dropped from the person summary.
  ['history.concussionKeepDays', 3653, 365, 36525, 'days', 'assumption', 'D11.4.2', 'Ten years, longer than league.medical priorConcussionWindowDays, so the summary never cuts what the protocol reads. Storage bound only'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a health binding constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown world health parameter ${name}`);
  return v;
}
