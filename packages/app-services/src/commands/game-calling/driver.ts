// The console's key driver (Q1.5.2, G-73 harness `KeyDriver`): physical keys through the live key map into the
// console state machine, on a virtual clock. The shell hands the console every key while it owns the keyboard
// (O1.3.1); this is the other half of that pipeline. The key map is injected (the shell's `actionFor`), so a
// remapped key works here exactly as on screen. Nothing here reads the wall clock: the host advances `nowMs`
// (a real-time measure in a game, a scripted one in a test). There is no pause: time only goes forward.
import { param } from './params.ts';
import { pressKey, settle, tick, type ConsoleCommand, type ConsoleState, type StepResult } from './console.ts';

/** Key contexts the console is in (keymap.default.json `contexts`), innermost last. */
export function consoleContexts(s: ConsoleState): string[] {
  if (!s.open || s.step === 'prompt' || s.step === 'fourth') return ['global', 'console.offense', 'console.prompt'];
  return ['global', `console.${s.open.unit}`];
}

/** Global actions the shell keeps while the console owns the keyboard (same set as Shell.tsx). */
export const SHELL_KEEPS: ReadonlySet<string> = new Set(['nav.back', 'help.keys', 'hub.game']);

/** Same shape as the harness's KeyOutcome, so `runTrace` reads it unchanged. */
export interface ConsoleKeyOutcome {
  chord: string;
  action: string | undefined;
  effect: 'passed-to-console' | 'ignored';
  atMs: number;
}

export interface ConsoleKeyDriverOptions {
  /** The live key map: chord and active contexts to an action (the shell's `actionFor`). */
  readonly resolve: (chord: string, contexts: readonly string[]) => string | undefined;
  /** Virtual milliseconds one key press takes. A named test assumption, not a measured value. */
  readonly keyIntervalMs?: number;
  readonly onCommand?: (c: ConsoleCommand, s: ConsoleState) => void;
}

export class ConsoleKeyDriver {
  state: ConsoleState;
  nowMs: number;
  readonly log: ConsoleKeyOutcome[] = [];
  readonly commands: ConsoleCommand[] = [];
  private readonly o: ConsoleKeyDriverOptions;

  constructor(initial: ConsoleState, o: ConsoleKeyDriverOptions) {
    this.state = initial;
    this.nowMs = initial.nowMs;
    this.o = o;
  }

  private take(r: StepResult): void {
    this.state = r.state;
    for (const c of r.commands) { this.commands.push(c); this.o.onCommand?.(c, this.state); }
  }

  /** Lets real time pass with no key (the user reading). Applies deadlines and commits sent calls. */
  wait(ms: number): void {
    this.nowMs += ms;
    this.take(tick(this.state, this.nowMs));
  }

  /** Waits until a sent call can no longer be recalled and is committed, or the deadline applies. */
  settle(stepMs = 100): void {
    for (let guard = 0; guard < 10_000; guard++) {
      if (!this.state.open || this.state.step === 'idle' || this.state.step === 'prompt') return;
      if (this.state.sent?.committed) return;
      const r = this.state.sent ? settle(this.state, this.nowMs) : tick(this.state, this.nowMs);
      this.take(r);
      if (r.handled) return;
      this.nowMs += stepMs;
    }
  }

  /**
   * Presses one key: `Digit5`, `Shift+KeyB`, or `Hold+KeyC` for a key held past the guard time (O2.5.3).
   * The hold time counts against the play clock.
   */
  press(key: string): ConsoleKeyOutcome {
    const held = key.startsWith('Hold+');
    const chord = held ? key.slice(5) : key;
    this.nowMs += (this.o.keyIntervalMs ?? 0) + (held ? param('guardHoldTenths', this.state.cfg.table) * 100 : 0);
    const action = this.o.resolve(chord, consoleContexts(this.state));
    const code = chord.split('+').pop()!;
    const out = (effect: ConsoleKeyOutcome['effect'], a: string | undefined): ConsoleKeyOutcome => {
      const o = { chord, action: a, effect, atMs: this.nowMs };
      this.log.push(o);
      return o;
    };
    if (action && SHELL_KEEPS.has(action)) return out('ignored', action);
    const before = this.state;
    const r = pressKey(this.state, action, code, held, this.nowMs);
    this.take(r);
    this.take(tick(this.state, this.nowMs));
    const boxed = action === undefined && r.handled && before.pendingBox?.atMs !== this.state.pendingBox?.atMs;
    return out(r.handled ? 'passed-to-console' : 'ignored', action ?? (boxed || r.handled ? 'call.box_select' : undefined));
  }

  pressAll(keys: readonly string[]): ConsoleKeyOutcome[] { return keys.map((k) => this.press(k)); }

  /** Q1.5.2 pause probe: the console has no command that stops, holds or slows a clock. */
  send(command: string): { accepted: boolean } {
    void command;
    return { accepted: false };
  }
}

/** Letters the console contexts bind (O2.2.2): box letters skip them. Reads the live key map's bindings. */
export function consoleReservedKeys(bindings: readonly { readonly context: string; readonly keys: readonly string[] }[]): string[] {
  const out = new Set<string>();
  for (const b of bindings) if (b.context.startsWith('console.')) for (const k of b.keys) if (/^Key[A-Z]$/.test(k)) out.add(k);
  return [...out].sort();
}
