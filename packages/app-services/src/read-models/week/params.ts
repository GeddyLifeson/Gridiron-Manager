// Tuning constants of the week screens' read models (item 9: meetings, travel, documents, press
// conference). No real-world number lives here: rule values come from the league rules through
// @gm/league `week`, and meeting and travel constants are the week module's own (G-69 params.json).
import type { ParamFile } from '@gm/schema';

export const PARAMS: ParamFile = {
  module: 'app-services.week',
  version: 'w9.1',
  params: [
    {
      name: 'travel.body_time_note_hours', value: 2, min: 1, max: 4, unit: 'h', belongsTo: 'H8.2.1',
      basis: 'bible', leaf: 'H8.2.1',
      constrainedBy: 'H8.2.1 "What the user sees": the travel card states the body time of kickoff when the gap is 2 hours or more.',
      status: 'starting',
    },
    {
      name: 'press.answer_seconds', value: 30, min: 10, max: 120, unit: 's', belongsTo: 'O4.5.2',
      basis: 'assumption', leaf: 'O4.5.2',
      constrainedBy: 'A-W9-1: O4.5.2 gives each press answer a time limit but no length. When it runs out the coach gives the bland answer (H7.2.1 session default).',
      status: 'starting',
    },
    {
      name: 'meeting.night_before_from_minute', value: 1080, min: 960, max: 1320, unit: 'min', belongsTo: 'H4.2.3',
      basis: 'assumption', leaf: 'H4.2.3',
      constrainedBy: 'A-W9-2: a team meeting on G-1 that starts at or after 18:00 is the night-before meeting (H4.2.3 "the evening before the game"; H8.1.2 orders it after dinner).',
      status: 'starting',
    },
  ],
};

export function weekParam(name: string): number {
  const p = PARAMS.params.find((x) => x.name === name);
  if (!p) throw new Error(`week screens: unknown parameter ${name}`);
  return p.value;
}
