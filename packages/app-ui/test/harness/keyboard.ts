// G-73 virtual keyboard: feeds physical key codes through the same pipeline the shell's keydown
// handler uses (chordOf -> pending hub letter -> actionFor -> navActionFor -> navReducer) so
// keyboard-only claims can be tested without a display. The clock is virtual: the harness never
// reads the wall clock, so a trace is repeatable. Mirrors `onKey` in src/shell/Shell.tsx; the real
// browser run in scripts/ui/keyboard-crawl.ts checks the two have not drifted apart.
import {
  initialNav, navReducer, navActionFor, applyOverrides, actionFor, chordOf, contextsFor, SCREENS,
  type NavState, type NavAction, type ScreenRecord, type Binding, type KeyOverrides, type KeyInput,
} from '../../src/shell/index.ts';

/** Actions the console leaves to the shell while it owns the keyboard (O1.3.1). Same set as Shell.tsx. */
const CONSOLE_GLOBALS = new Set(['nav.back', 'help.keys']);

export interface KeyOutcome {
  chord: string;
  /** The key-map action the chord resolved to; undefined when nothing is bound. */
  action: string | undefined;
  /** What the shell did with it: a navigation action, `advance`, `passed-to-console`, or `ignored`. */
  effect: NavAction['type'] | 'advance' | 'passed-to-console' | 'screen-letter' | 'ignored';
  atMs: number;
}

export interface KeyboardOptions {
  path?: string;
  screens?: readonly ScreenRecord[];
  keyOverrides?: KeyOverrides;
  /** Virtual milliseconds one key press takes. A named test assumption, not a measured value. */
  keyIntervalMs?: number;
  /** A text field has focus: global keys are inactive (O1.3.1). */
  textFocus?: boolean;
}

export class VirtualKeyboard {
  nav: NavState;
  nowMs = 0;
  readonly log: KeyOutcome[] = [];
  readonly bindings: Binding[];
  readonly screens: readonly ScreenRecord[];
  textFocus: boolean;
  /** Times the shell asked its host to advance (Space on Today). */
  advances = 0;
  private readonly keyIntervalMs: number;

  constructor(o: KeyboardOptions = {}) {
    this.screens = o.screens ?? SCREENS;
    this.nav = initialNav(o.path, this.screens);
    this.bindings = applyOverrides(o.keyOverrides).bindings;
    this.keyIntervalMs = o.keyIntervalMs ?? 0;
    this.textFocus = o.textFocus ?? false;
  }

  get screenId(): string { return this.nav.location.screenId; }
  get presses(): number { return this.log.length; }

  /** Presses one key. Accepts `Digit5`, `Shift+Slash`, or a full event shape. */
  press(key: string | KeyInput): KeyOutcome {
    const e: KeyInput = typeof key === 'string' ? parseChord(key) : key;
    this.nowMs += this.keyIntervalMs;
    const chord = chordOf(e);
    const out = (effect: KeyOutcome['effect'], action?: string): KeyOutcome => {
      const o: KeyOutcome = { chord, action, effect, atMs: this.nowMs };
      this.log.push(o);
      return o;
    };
    if (this.nav.overlay === 'palette') return out('ignored'); // the palette's own field handles its keys
    if (!chord || this.textFocus) return out('ignored');
    const plain = !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
    if (this.nav.pendingHub && /^Key[A-Z]$/.test(e.code) && plain) {
      this.nav = navReducer(this.nav, { type: 'screenKey', letter: e.code.slice(3).toLowerCase() }, this.screens);
      return out('screen-letter');
    }
    const action = actionFor(chord, contextsFor(this.nav), this.bindings);
    if (!action) { this.nav = navReducer(this.nav, { type: 'clearPending' }, this.screens); return out('ignored'); }
    const consoleOwns = this.nav.mode === 'gameday' && this.nav.location.screenId === 'game.console';
    if (consoleOwns && !CONSOLE_GLOBALS.has(action) && action !== 'hub.game') return out('passed-to-console', action);
    if (action === 'office.advance') {
      if (this.nav.location.screenId === 'office.today') { this.advances++; return out('advance', action); }
      return out('ignored', action);
    }
    const a = navActionFor(action);
    if (!a) return out('ignored', action);
    this.nav = navReducer(this.nav, a, this.screens);
    return out(a.type, action);
  }

  /** Presses several keys in order. */
  pressAll(keys: readonly string[]): KeyOutcome[] { return keys.map((k) => this.press(k)); }

  /** Starts or ends a game, as the host does (O1.4.2). Not a key press. */
  startGame(): void { this.nav = navReducer(this.nav, { type: 'startGame' }, this.screens); }
  endGame(): void { this.nav = navReducer(this.nav, { type: 'endGame' }, this.screens); }
}

/** `Ctrl+Shift+KeyA` -> a key event. The last part is the physical code. */
export function parseChord(chord: string): KeyInput {
  const parts = chord.split('+');
  const code = parts.pop()!;
  return { code, ctrlKey: parts.includes('Ctrl'), altKey: parts.includes('Alt'), shiftKey: parts.includes('Shift'), metaKey: parts.includes('Meta') };
}

/** The physical code of a hub number key (`'5'` -> `Digit5`) and of a screen letter (`'t'` -> `KeyT`). */
export const digitCode = (d: string): string => `Digit${d}`;
export const letterCode = (l: string): string => `Key${l.toUpperCase()}`;
