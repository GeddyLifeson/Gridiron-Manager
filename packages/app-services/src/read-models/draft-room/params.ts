// Tuning constants of the draft room (G-34/G-76 screen, item 7 of plans/unbuilt-work.md). No real-world
// number lives here: clock lengths, rounds and days come from the league rules through the draft module
// (G-34); pick values from the fitted chart. The values below are a starting value a bible leaf states, or
// named assumptions.
import type { ParamFile } from '@gm/schema';

export const PARAMS: ParamFile = {
  module: 'app-services.draft-room',
  version: 'item7.1',
  params: [
    {
      name: 'draft_room.lean_top', value: 3, min: 1, max: 5, unit: 'count', belongsTo: 'M4.5.1',
      basis: 'bible', leaf: 'M4.5.1', constrainedBy: 'test draft-room/model: the lean names the top three on the board', status: 'starting',
    },
    {
      name: 'draft_room.need_high', value: 0.6, min: 0, max: 1, unit: 'ratio', belongsTo: 'M1.4.1',
      basis: 'assumption', leaf: 'M1.4.1', constrainedBy: 'test draft-room/model: need words; needs show as words, never the 0 to 1 number', status: 'starting',
    },
    {
      name: 'draft_room.need_some', value: 0.3, min: 0, max: 1, unit: 'ratio', belongsTo: 'M1.4.1',
      basis: 'assumption', leaf: 'M1.4.1', constrainedBy: 'test draft-room/model: need words', status: 'starting',
    },
    {
      name: 'draft_room.ticker_length', value: 12, min: 1, max: 50, unit: 'count', belongsTo: 'C7.3.1',
      basis: 'assumption', leaf: 'C7.3.1', constrainedBy: 'test draft-room/model: the ticker keeps the latest entries, newest first', status: 'starting',
    },
    {
      name: 'draft_room.voice_mention', value: 0.34, min: 0, max: 1, unit: 'ratio', belongsTo: 'M3.6.2',
      basis: 'assumption', leaf: 'M3.6.2', constrainedBy: 'test draft-room/commands: a mention moves the board less than a recommend, a recommend less than an insist', status: 'starting',
    },
    {
      name: 'draft_room.voice_recommend', value: 0.67, min: 0, max: 1, unit: 'ratio', belongsTo: 'M3.6.2',
      basis: 'assumption', leaf: 'M3.6.2', constrainedBy: 'test draft-room/commands: voice strength order', status: 'starting',
    },
    {
      name: 'draft_room.voice_insist', value: 1, min: 0, max: 1, unit: 'ratio', belongsTo: 'M3.6.2',
      basis: 'assumption', leaf: 'M3.6.2', constrainedBy: 'test draft-room/commands: voice strength order', status: 'starting',
    },
  ],
};

export function param(name: string): number {
  const p = PARAMS.params.find((x) => x.name === name);
  if (!p) throw new Error(`draft-room: unknown parameter ${name}`);
  return p.value;
}
