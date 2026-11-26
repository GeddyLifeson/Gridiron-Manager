// Alerts (O1.4.3): a thin line at the top right shows the newest alert for 6 s; a bell opens the
// day's list. Three levels set by the owning system, which the user may raise or lower per category.
// No alert takes keyboard focus. During a game only game alerts appear, in the console's booth line.
// Time is passed in (milliseconds), so the queue is testable.

/** O1.4.3: the alert line shows the newest alert for 6 s. */
export const ALERT_SHOW_MS = 6000;
/** O1.4.3: more than five alerts in one second fold into one line with a count. */
export const ALERT_BURST = { count: 5, windowMs: 1000 } as const;

export type AlertLevel = 'urgent' | 'normal' | 'quiet';
export interface Alert { id: string; category: string; level: AlertLevel; text: string; at: number; route?: string }

export interface AlertLine { text: string | null; burstCount: number; level: AlertLevel | null }

/** The level after the user's per-category setting (navigation.alertLevels). */
export const effectiveLevel = (a: Alert, overrides: Record<string, unknown> = {}): AlertLevel => {
  const o = overrides[a.category];
  return o === 'urgent' || o === 'normal' || o === 'quiet' ? o : a.level;
};

/** What the alert line shows at time `now`. Quiet alerts go only to the list. */
export function alertLine(alerts: readonly Alert[], now: number, overrides: Record<string, unknown> = {}, gameDay = false): AlertLine {
  const shown = alerts.filter((a) => effectiveLevel(a, overrides) !== 'quiet' && (!gameDay || a.category === 'game'));
  const live = shown.filter((a) => now - a.at >= 0 && now - a.at < ALERT_SHOW_MS);
  if (gameDay || live.length === 0) return { text: null, burstCount: 0, level: null };
  const newest = live.reduce((x, y) => (y.at >= x.at ? y : x));
  const burst = live.filter((a) => newest.at - a.at < ALERT_BURST.windowMs);
  const level = burst.some((a) => effectiveLevel(a, overrides) === 'urgent') ? 'urgent' : 'normal';
  if (burst.length > ALERT_BURST.count) return { text: null, burstCount: burst.length, level };
  return { text: newest.text, burstCount: 0, level: effectiveLevel(newest, overrides) };
}

/** Urgent alerts also mark the Office hub (O1.4.3). */
export const officeMarked = (alerts: readonly Alert[], overrides: Record<string, unknown> = {}): boolean =>
  alerts.some((a) => effectiveLevel(a, overrides) === 'urgent');
