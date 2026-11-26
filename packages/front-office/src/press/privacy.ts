// What the room may ask about. The press only knows what is public or what leaked to a reporter (G-27
// observer filter, L6.3.1); personal and harmful topics never touch an imported real person (X14, A6.3.1,
// K8.7.1 rule 6); personal-life questions need a public event and the setting on (H7.2.1 edge case).
import type { Topic } from './catalogue.ts';
import type { PressEvent, PressSession } from './types.ts';

const PROTECTED = new Set(['personal', 'harmful']);

/** The event reached the room: public, or carried by a leak. */
export function known(e: PressEvent): boolean {
  return e.public || e.fromLeak;
}

/** X14: a personal or harmful question never names an imported person. */
export function touchesImported(e: PressEvent, s: PressSession): boolean {
  return e.personIds.some((id) => s.world.origins[id] === 'imported');
}

/** May this event be asked about under this topic? */
export function askable(t: Topic, e: PressEvent, s: PressSession): boolean {
  if (!known(e)) return false;
  const harmful = PROTECTED.has(t.harm) || PROTECTED.has(e.harm);
  if (harmful && touchesImported(e, s)) return false;
  if (t.harm === 'personal' && !s.settings.personalTopics) return false;
  return true;
}

/** Codes whose pointed (fault) wording is held back after a serious injury in the game (H7.2.1 edge case). */
export const FAULT_CODES: ReadonlySet<string> = new Set([
  'result_overall', 'specific_play', 'decision_call', 'unit_performance', 'player_performance', 'qb_performance', 'officiating_rules', 'penalties',
]);

/** A player was seriously hurt in the game this session follows. */
export function faultSuppressed(s: PressSession): boolean {
  return s.events.some((e) => e.seriousInjury === true && e.daysAgo <= 1 && known(e));
}
