// What is open now (O1.4.1, O1.4.2, O1.1.3). The phase never hides information: it only marks a
// screen read-only, with one line saying why. A game-day screen outside game day shows the Game
// hub's "no game now" line.
import type { ScreenRecord } from './registry.ts';

export interface ScreenAvailability { readOnly: boolean; lineId: string | null }

export function availability(s: ScreenRecord, phase: string | null, gameDay: boolean): ScreenAvailability {
  if (s.hub === 'game' && !gameDay) return { readOnly: true, lineId: 'shell.noGameNow' };
  if (s.phases.length && phase !== null && !s.phases.includes(phase)) return { readOnly: true, lineId: 'shell.readOnly' };
  return { readOnly: false, lineId: null };
}
