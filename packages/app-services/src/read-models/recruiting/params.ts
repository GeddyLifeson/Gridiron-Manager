// Tuning constants of the recruiting board screen (O7.5.1, T4). No real-world number lives here: contact
// periods, limits and signing dates come from the college rule set and calendar through league recruiting
// (G-36). The values below are display choices, each a named assumption.
import type { ParamFile } from '@gm/schema';

export const PARAMS: ParamFile = {
  module: 'app-services.recruiting-board',
  version: 'rb.1',
  params: [
    {
      name: 'recruitingBoard.confidenceFirmShare', value: 0.35, min: 0.05, max: 0.9, unit: 'ratio', belongsTo: 'MA-48',
      basis: 'assumption', leaf: 'D6.1.1',
      constrainedBy: 'test recruiting-board: a grade whose mean band is at most this share of the prior half-width reads "firm"', status: 'starting',
    },
    {
      name: 'recruitingBoard.confidenceFairShare', value: 0.7, min: 0.1, max: 1, unit: 'ratio', belongsTo: 'MA-48',
      basis: 'assumption', leaf: 'D6.1.1',
      constrainedBy: 'test recruiting-board: at most this share reads "fair", above it "thin"', status: 'starting',
    },
    {
      name: 'recruitingBoard.rowsMax', value: 80, min: 10, max: 500, unit: 'count', belongsTo: 'O7.5.1',
      basis: 'assumption', leaf: 'O7.5.1', constrainedBy: 'test recruiting-board: the board lists at most this many rows and gives the total', status: 'starting',
    },
    {
      name: 'recruitingBoard.nextContactScanDays', value: 60, min: 7, max: 365, unit: 'days', belongsTo: 'O7.5.1',
      basis: 'assumption', leaf: 'O7.5.1', constrainedBy: 'test recruiting-board: next allowed contact is searched this many days ahead, else "not within the window"', status: 'starting',
    },
    {
      name: 'recruitingBoard.calendarDays', value: 120, min: 14, max: 400, unit: 'days', belongsTo: 'O7.5.1',
      basis: 'assumption', leaf: 'O7.5.1', constrainedBy: 'test recruiting-board: the contact calendar covers this many days from today', status: 'starting',
    },
  ],
};

export function param(name: string): number {
  const p = PARAMS.params.find((x) => x.name === name);
  if (!p) throw new Error(`recruiting-board: unknown parameter ${name}`);
  return p.value;
}
