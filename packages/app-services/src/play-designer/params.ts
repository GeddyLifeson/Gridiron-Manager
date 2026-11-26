// Play designer screen starting values (O3.1, O3.7.2). Screen config, never rule values.
import type { ParamFile } from '@gm/schema';

const p = (name: string, value: number, min: number, max: number, unit: string, leaf: string, basis: 'bible' | 'assumption' = 'bible') => ({
  name, value, min, max, unit, belongsTo: 'app-services.play-designer', basis, leaf, constrainedBy: 'Q1.1.3', status: 'starting' as const,
});

export const PARAMS: ParamFile = {
  module: 'app-services.play-designer',
  version: '1',
  params: [
    /** O3.1.3: "Validation runs ... after each edit, debounced by 150 ms." */
    p('designer.validate.debounceMs', 150, 0, 1000, 'ms', 'O3.1.3'),
    /** O3.1.1: "from 10 yards behind the line to 25 yards past it". */
    p('designer.canvas.behindYd', 10, 5, 20, 'yd', 'O3.1.1'),
    p('designer.canvas.pastYd', 25, 10, 60, 'yd', 'O3.1.1'),
    /** O3.7.2: "shows the charge before an action that costs more than a threshold (starting value 0.5 hours)". */
    p('designer.hours.warnAboveH', 0.5, 0, 4, 'h', 'O3.7.2'),
    /** Keyboard nudge per arrow press, before snapping. */
    p('designer.keys.nudgeYd', 1, 0.5, 5, 'yd', 'O3.1.2', 'assumption'),
    /** Keyboard route leg when no number key was pressed. */
    p('designer.keys.legYd', 5, 1, 30, 'yd', 'O3.1.2', 'assumption'),
  ],
};

export function designerParam(name: string): number {
  const row = PARAMS.params.find((r) => r.name === name);
  if (!row) throw new Error(`unknown play designer parameter ${name}`);
  return row.value;
}
