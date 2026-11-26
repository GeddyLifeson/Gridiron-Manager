// The live console host (handoff item D): runs a game session against real time and the keyboard, and draws
// it through the G-60 console. The play clock always runs (binding ruling): every animation frame moves the
// session's clock by the real time that passed, so a slow call is late exactly as on a real sideline (I2.1.2).
// Nothing here decides football; keys go to the session's key driver, which resolves them through the live map.
import { useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { gameCalling } from '@gm/app-services';
import { actionFor, chordOf, displayChord, type Binding } from '../shell/keymap.ts';
import type { GameCallingSource } from '../screens/game-calling/index.ts';
import type { ConsoleViewModel } from '../screens/game-calling/GameConsole.tsx';
import { v } from '../tokens/index.ts';
import { rt } from './text.ts';
import type { GameSession } from './port.ts';

/** Longest step one frame may take, so a hidden tab does not run the play clock out in one jump. */
export const MAX_FRAME_MS = 250;
/** Redraw interval of the console while nothing else changes: the play clock reads in tenths (O2.1.1). */
export const REDRAW_MS = 100;

/** The resolve function the session's key driver uses: chord to action in the console's contexts. */
export function resolverFor(bindings: readonly Binding[]): (chord: string, contexts: readonly string[]) => string | undefined {
  return (chord, contexts) => actionFor(chord, contexts, bindings);
}

/** Action to its display chord in the console's own contexts first, so remapped keys show (O2.5.2). */
export function keyForIn(bindings: readonly Binding[]): (action: string) => string | null {
  return (action) => {
    const b = bindings.find((x) => x.action === action && x.context.startsWith('console')) ?? bindings.find((x) => x.action === action);
    return b && b.keys[0] ? displayChord(b.keys[0]) : null;
  };
}

function isTextTarget(t: EventTarget | null): boolean {
  const el = t as { tagName?: string; isContentEditable?: boolean } | null;
  return !!el && (el.isContentEditable === true || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

export interface LiveSessionOptions {
  readonly bindings: readonly Binding[];
  /** False while another screen has the keyboard; the clock still runs (the play clock never stops). */
  readonly keysActive: boolean;
  /** Clock source in milliseconds (outside the core). */
  readonly now?: () => number;
}

/** Steps the session with real time and the keyboard; returns a render counter that changes each frame. */
export function useLiveSession(session: GameSession | null, o: LiveSessionOptions): number {
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  const keysActive = useRef(o.keysActive);
  keysActive.current = o.keysActive;
  const now = o.now ?? (() => performance.now());
  useEffect(() => {
    if (!session) return;
    let last = now();
    let drawn = last;
    let events = session.events.length;
    let raf = 0;
    const frame = () => {
      const t = now();
      const dt = Math.min(MAX_FRAME_MS, Math.max(0, t - last));
      last = t;
      if (!session.final && dt > 0) session.wait(dt);
      // The clocks show tenths: redraw ten times a second, or at once when the game moved on.
      if (t - drawn >= REDRAW_MS || session.events.length !== events || session.final) { drawn = t; events = session.events.length; bump(); }
      if (!session.final) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onKey = (e: KeyboardEvent) => {
      if (!keysActive.current || session.final || isTextTarget(e.target)) return;
      const chord = chordOf(e);
      if (!chord) return;
      // Hub and help keys stay with the shell (O1.3.1); everything else is the console's.
      if (chord === 'Escape' || chord === 'Shift+Slash' || chord === 'F1') return;
      e.preventDefault();
      session.press(chord);
      bump();
    };
    document.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
  return tick;
}

export interface PlayLogProps { readonly lines: readonly gameCalling.PlayLogLine[] }

/** Field region stand-in while the live field has no trajectory to draw (reference resolver): the last plays. */
export function PlayLog({ lines }: PlayLogProps): ReactNode {
  return (
    <section aria-label={rt('root.playLog')} data-play-log style={{ padding: 8, overflow: 'auto', height: '100%', fontFamily: 'monospace', color: v('text.primary') }}>
      {lines.length === 0 ? <p>{rt('root.noPlays')}</p> : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {lines.map((l) => <li key={l.playNumber} data-play={l.playNumber}>Q{l.period} {l.clock} {l.text}</li>)}
        </ol>
      )}
    </section>
  );
}

/** The console route's source for a live session. */
export function liveConsoleSource(session: GameSession, bindings: readonly Binding[], names: { playerName(id: number): string; teamName(side: 0 | 1): string }, extraField?: () => ReactNode): GameCallingSource {
  const keyFor = keyForIn(bindings);
  return {
    view: () => gameCalling.consoleViewOfSession(session, { keyFor }) as unknown as ConsoleViewModel,
    field: () => extraField?.() ?? <PlayLog lines={gameCalling.sessionPlayLog(session, names, 10)} />,
  };
}

export interface FinalProps { readonly session: GameSession; readonly names: { teamName(side: 0 | 1): string }; onDone(): void }

/** The final score and the way back to the office once the game ends (I10 begins here). */
export function FinalPanel({ session, names, onDone }: FinalProps): ReactNode {
  const s = session.situation();
  const me = session.userSide;
  const them = me === 0 ? 1 : 0;
  const won = s.score[me] > s.score[them];
  const tied = s.score[me] === s.score[them];
  return (
    <section role="status" data-final style={{ padding: 16, border: `1px solid ${v('line.default')}`, background: v('surface.panel') }}>
      <h2>{rt('root.final')}</h2>
      <p data-final-score>{names.teamName(0)} {s.score[0]}, {names.teamName(1)} {s.score[1]} · {rt(won ? 'root.won' : tied ? 'root.tied' : 'root.lost')}</p>
      <button type="button" onClick={onDone}>{rt('root.backToOffice')}</button>
    </section>
  );
}

/** Memoised source so the route table stays stable across frames. */
export function useConsoleSource(session: GameSession | null, bindings: readonly Binding[], names: FinalProps['names'] & { playerName(id: number): string }): GameCallingSource | null {
  return useMemo(() => (session ? liveConsoleSource(session, bindings, names) : null), [session, bindings, names]);
}
