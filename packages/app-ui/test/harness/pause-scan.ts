// Q1.5.2 second assertion (Marlon, 2026-11-25): no game-state command may pause, slow or hold the
// play clock outside practice tools and the coaching school. The scan reads every key-map action
// and every screen record and names each one that sounds like a clock stop.
import { DEFAULT_KEYMAP, SCREENS, type Binding, type ScreenRecord } from '../../src/shell/index.ts';

const CLOCK_STOP = /(^|[._\-\s])(pause|hold|freeze|slow|slowdown|stop[_\-\s]?clock|rewind|step|resume)([._\-\s]|$)/i;

export interface PauseFinding { kind: 'binding' | 'screen'; id: string; why: string }

export interface PauseScanOptions {
  bindings?: readonly Binding[];
  screens?: readonly ScreenRecord[];
  /** Hubs where a pause is allowed: the coaching school. */
  allowedHubs?: readonly string[];
  /** Screen ids where a pause is allowed: practice tools. */
  allowedScreens?: readonly string[];
  /** Key contexts that never run during a live game. */
  allowedContexts?: readonly string[];
}

export function findPauseCommands(o: PauseScanOptions = {}): PauseFinding[] {
  const bindings = o.bindings ?? DEFAULT_KEYMAP.bindings;
  const screens = o.screens ?? SCREENS;
  const hubs = new Set(o.allowedHubs ?? ['school']);
  const ids = new Set(o.allowedScreens ?? ['week.practice']);
  const ctx = new Set(o.allowedContexts ?? []);
  const out: PauseFinding[] = [];
  for (const b of bindings) if (!ctx.has(b.context) && CLOCK_STOP.test(b.action)) out.push({ kind: 'binding', id: `${b.context}|${b.action}`, why: 'key action stops or slows a clock' });
  for (const s of screens) {
    if (hubs.has(s.hub) || ids.has(s.id)) continue;
    if (!s.modes.includes('gameday') && s.hub !== 'game') continue; // a screen that cannot open during a game cannot pause it
    const text = [s.id, s.title, ...s.search_terms].join(' ');
    if (CLOCK_STOP.test(text)) out.push({ kind: 'screen', id: s.id, why: `game-time screen mentions a clock stop: ${text}` });
  }
  return out;
}
