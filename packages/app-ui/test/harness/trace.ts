// Q1.5.2 keyboard-only full game: a scripted key trace is played call by call against a virtual
// play clock that is never paused or slowed. A call passes when its keys fit inside the clock that
// was running when the call began. The console (G-60) supplies its own KeyDriver; until then the
// shell's VirtualKeyboard is the driver and traces cover the keys the shell owns.
import type { KeyOutcome } from './keyboard.ts';

export type CallKind = 'offense' | 'defense' | 'special' | 'timeout' | 'challenge' | 'penalty' | 'substitution' | 'other';
export const REQUIRED_CALL_KINDS: readonly CallKind[] = ['offense', 'defense', 'special', 'timeout', 'challenge', 'penalty'];

export interface TraceCall {
  label: string;
  kind: CallKind;
  keys: readonly string[];
  /** Seconds left on the play clock when the call starts. From the B1 table for the level; never a literal here. */
  clockSeconds: number;
  /** Time the user spends reading before the first key, in milliseconds. The trace states it so a slow read is visible. */
  readMs?: number;
}
export interface KeyTrace {
  id: string;
  /** S1 rung (1 to 9) and level of the seat the trace plays. */
  rung: number;
  level: 'pro' | 'college';
  calls: readonly TraceCall[];
}
/** What a trace needs from a keyboard: the shell's VirtualKeyboard or the console's driver. */
export interface KeyDriver { press(key: string): KeyOutcome; readonly nowMs: number }

export interface CallResult {
  label: string; kind: CallKind; presses: number; spentMs: number; budgetMs: number; passed: boolean;
  /** The reach cost ran past the clock: a delay-of-game foul caused by the interface. */
  delayOfGame: boolean;
  /** Keys that resolved to nothing: a trace key the map does not bind is a trace error. */
  unbound: string[];
}
export interface TraceResult { id: string; passed: boolean; calls: CallResult[]; missingKinds: CallKind[]; worstMs: number }

/** Plays a trace. The clock only runs forward: nothing here can stop or slow it. */
export function runTrace(trace: KeyTrace, driver: KeyDriver, required: readonly CallKind[] = REQUIRED_CALL_KINDS): TraceResult {
  const calls: CallResult[] = [];
  for (const c of trace.calls) {
    const start = driver.nowMs;
    const unbound: string[] = [];
    for (const k of c.keys) {
      const o = driver.press(k);
      if (o.effect === 'ignored' && o.action === undefined) unbound.push(k);
    }
    const spentMs = driver.nowMs - start + (c.readMs ?? 0);
    const budgetMs = c.clockSeconds * 1000;
    calls.push({ label: c.label, kind: c.kind, presses: c.keys.length, spentMs, budgetMs, passed: spentMs <= budgetMs && unbound.length === 0, delayOfGame: spentMs > budgetMs, unbound });
  }
  const seen = new Set(trace.calls.map((c) => c.kind));
  const missingKinds = required.filter((k) => !seen.has(k));
  return { id: trace.id, passed: calls.every((c) => c.passed) && missingKinds.length === 0, calls, missingKinds, worstMs: Math.max(0, ...calls.map((c) => c.spentMs)) };
}

/** A core under test: the probe sends a command and reports whether the core took it. */
export interface PauseProbe { send(command: string): { accepted: boolean } }
export const PAUSE_COMMANDS = ['Pause', 'Hold', 'StopClock', 'SlowClock', 'Freeze'] as const;

/** Q1.5.2 acceptance 2: a pause command injected during a live game is refused by the core. */
export function pauseRefusals(probe: PauseProbe, commands: readonly string[] = PAUSE_COMMANDS): { command: string; accepted: boolean }[] {
  return commands.map((command) => ({ command, accepted: probe.send(command).accepted }));
}
