// Tuning constants of the game-day console (G-60). Every value is a starting value the bible names (basis
// `bible`, with the leaf) or a test-side assumption. Clock values are integer tenths of a second. No rule value
// is written here: rule values are read by key (keys.ts).
import type { ParamFile, TuningParam } from '@gm/schema';

export const MODULE = 'app-services.game-calling';

const P = (name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string, constrainedBy: string): TuningParam =>
  ({ name: `console.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting' });

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: [
    P('chordTimeoutTenths', 15, 5, 50, 'tenths_s', 'bible', 'O2.2.2', 'I2.6.3 two presses per entry'),
    P('radioBaseTenths', 20, 0, 60, 'tenths_s', 'bible', 'I2.4.1', 'I2.1.1 acceptance 1 set time'),
    P('wristbandBaseTenths', 20, 0, 60, 'tenths_s', 'bible', 'I2.4.1', 'I2.1.1 acceptance 1 set time'),
    P('wristbandReadTenths', 8, 5, 10, 'tenths_s', 'bible', 'I2.4.1', 'I2.4.1 0.5 to 1 s look-down'),
    P('signalTenths', 30, 0, 60, 'tenths_s', 'bible', 'I2.4.1', 'I2.1.1 acceptance 1 set time'),
    P('messengerTenths', 60, 0, 120, 'tenths_s', 'bible', 'I2.4.1', 'I2.1.1 acceptance 1 set time'),
    P('huddleBaseTenths', 40, 0, 100, 'tenths_s', 'bible', 'I2.1.1', 'I2.1.1 acceptance 1 set time'),
    P('alignTenths', 55, 40, 70, 'tenths_s', 'bible', 'I2.1.1', 'I2.1.1 stage 5, 4 to 7 s'),
    P('substitutionTenths', 30, 20, 40, 'tenths_s', 'bible', 'I2.3.3', 'I2.3.3 2 to 4 s'),
    P('minPresnapTenths', 30, 0, 80, 'tenths_s', 'bible', 'I2.1.3', 'I2.1.3 rule 1'),
    P('defIdentifyTenths', 35, 20, 50, 'tenths_s', 'bible', 'I3.1.1', 'I3.1.1 stage 1, 2 to 5 s'),
    P('defSubTenths', 45, 30, 60, 'tenths_s', 'bible', 'I3.1.1', 'I3.1.1 stage 3, 3 to 6 s'),
    P('defTellTenths', 20, 0, 60, 'tenths_s', 'bible', 'I3.1.1', 'I3.1.1 stage 5'),
    P('defAlignTenths', 30, 20, 40, 'tenths_s', 'bible', 'I3.1.1', 'I3.1.1 stage 6, 2 to 4 s'),
    P('guardHoldTenths', 4, 0, 20, 'tenths_s', 'bible', 'O2.5.3', 'O2.5.3 hold-to-confirm'),
    P('guardMinClockTenths', 30, 0, 100, 'tenths_s', 'bible', 'O2.5.3', 'O2.5.3 no guard under 3 s'),
    P('twoMinuteTenths', 1200, 0, 3000, 'tenths_s', 'assumption', 'O2.5.3', 'O2.5.3 timeout guard in the last two minutes'),
    P('queueMax', 4, 1, 10, 'count', 'bible', 'I2.3.6', 'I2.3.6 queue size'),
    P('boxWarnEntries', 10, 4, 20, 'count', 'bible', 'I3.2.2', 'I3.2.2 box with more than 10 calls warns'),
  ],
};

export type ConsoleParam =
  | 'chordTimeoutTenths' | 'radioBaseTenths' | 'wristbandBaseTenths' | 'wristbandReadTenths' | 'signalTenths' | 'messengerTenths'
  | 'huddleBaseTenths' | 'alignTenths' | 'substitutionTenths' | 'minPresnapTenths' | 'defIdentifyTenths' | 'defSubTenths'
  | 'defTellTenths' | 'defAlignTenths' | 'guardHoldTenths' | 'guardMinClockTenths' | 'twoMinuteTenths' | 'queueMax' | 'boxWarnEntries';

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name, p.value]));

/** A starting value by short name. A parameter table, when given, wins (D-09 tuning). */
export function param(name: ConsoleParam, table?: { has(n: string): boolean; num(n: string): number }): number {
  const full = `console.${name}`;
  if (table?.has(full)) return table.num(full);
  return BY_NAME.get(full)!;
}
