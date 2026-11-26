// Shared shapes of the college module (G-37).
import type { PersonOrigin, RandomStream } from '@gm/schema';

/** Absolute day number of the calendar engine (G-12 `dayNumber`). */
export type Day = number;

/** Uniform draws in [0, 1) come from a J13 stream the caller supplies (league may not import engine-core). */
export type Stream = Pick<RandomStream, 'uniform'>;

/**
 * X14 / L9.1.2: an imported real person is never the subject of a dispute, an academic event, a
 * medical retirement or a rule-breaking event. Sporting events (a transfer, a cut) are allowed.
 */
export function mayCarryPersonalEvent(origin: PersonOrigin): boolean {
  return origin !== 'imported';
}

/** Words the staff uses for a player's plans (T6.2.1, T8.4.1). There is no risk number (K9). */
export type StaffRead = 'says_staying' | 'nothing_heard' | 'agent_asking_around';
