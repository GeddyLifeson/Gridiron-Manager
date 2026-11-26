// The career's composition root (O1.5.1, handoff item D): after the new-game picker starts a career, the shell
// is mounted with the office Today screen and the game-day console. Advancing to game day switches the shell to
// game mode, which opens the console; the game runs on real time and the keyboard (the play clock always
// runs); the final goes back into the season and the office shows the result and the standings.
import { createElement, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { LivePlay, type LivePlayLike } from '../presentation/live/LivePlay.tsx';
import { Shell, type RouteTable, type ShellContext } from '../shell/Shell.tsx';
import { DEFAULT_KEYMAP, type Binding } from '../shell/keymap.ts';
import { buildRoutes } from '../routes.ts';
import { GameConsole, type ConsoleViewModel } from '../screens/game-calling/GameConsole.tsx';
import { gameCalling } from '@gm/app-services';
import { homeFromSeason, recordText } from './today.ts';
import { FinalPanel, PlayLog, keyForIn, useLiveSession } from './ConsoleHost.tsx';
import { rt } from './text.ts';
import { v } from '../tokens/index.ts';
import { InGameDesk } from '../screens/game-calling/InGameDesk.tsx';
import { ct } from '../screens/game-calling/GameConsole.tsx';
import { deskAdd, deskSearch, searchAsked } from './desk.ts';
import { teamSources } from './sources/team.ts';
import type { CareerPort, GameSession, SeasonToday, WeekProgress } from './port.ts';
import type { SoundStage } from '../audio/stage/index.ts';
import type { AdvanceTarget } from '../screens/home/view.ts';

export interface CareerRootProps {
  readonly port: CareerPort;
  readonly bindings?: readonly Binding[];
  readonly soundStage?: SoundStage | null;
  /** Clock for the live session in milliseconds (outside the core); the browser's performance clock by default. */
  readonly now?: () => number;
}

/** The season panel beside every screen: record, last result, the seat's table, and the staff option. */
export function SeasonPanel({ today, canDelegate, onDelegate }: { today: SeasonToday; canDelegate: boolean; onDelegate(): void }): ReactNode {
  return (
    <aside aria-label={rt('root.season')} data-season style={{ padding: 8, minWidth: 260 }}>
      <h2 style={{ fontSize: 16 }}>{today.teamName}</h2>
      <p data-record>{rt('root.record', { record: recordText(today.record) })} · {today.stageLabel}</p>
      {today.lastResult ? <p data-last-result>{rt('root.lastResult', { line: today.lastResult })}</p> : null}
      {today.seasonOver ? <p data-season-over>{rt('root.seasonOver')}{today.champion ? ` ${rt('root.champion', { name: today.champion })}` : ''}</p> : null}
      {canDelegate ? <button type="button" data-delegate onClick={onDelegate}>{rt('root.delegate')}</button> : null}
      <h3 style={{ fontSize: 14 }}>{rt('root.standings')}</h3>
      <table data-standings style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr><th align="left">{rt('root.team')}</th><th>{rt('root.w')}</th><th>{rt('root.l')}</th><th>{rt('root.t')}</th><th>{rt('root.pf')}</th><th>{rt('root.pa')}</th></tr></thead>
        <tbody>{today.standings.map((r) => (
          <tr key={r.teamId} data-seat={r.seat ? 'true' : undefined} style={{ fontWeight: r.seat ? 700 : 400 }}>
            <td>{r.name}</td><td align="right">{r.w}</td><td align="right">{r.l}</td><td align="right">{r.t}</td><td align="right">{r.pf}</td><td align="right">{r.pa}</td>
          </tr>
        ))}</tbody>
      </table>
    </aside>
  );
}

/**
 * The week's other games while they play off the main thread: games done of the batch (P2.1.2). Shown on
 * Today, on the console after the final, and in the season panel.
 */
export function WeekProgressLine({ progress }: { progress: WeekProgress }): ReactNode {
  return (
    <p data-week-progress role="status" aria-live="polite" className="gm-line">
      {progress.total > 0 ? rt('root.weekProgress', { done: progress.done, total: progress.total }) : rt('root.weekStarting')}{' '}
      <progress max={Math.max(1, progress.total)} value={progress.done} />
    </p>
  );
}

interface LiveConsoleProps { readonly port: CareerPort; readonly session: GameSession; readonly bindings: readonly Binding[]; readonly now?: (() => number) | undefined; readonly soundStage: SoundStage | null; onDone(): void }

/** The console route while a game is open: the live session drawn through the G-60 console. */
function LiveConsole({ port, session, bindings, now, soundStage, onDone }: LiveConsoleProps): ReactNode {
  useLiveSession(session, { bindings, keysActive: true, ...(now ? { now } : {}) });
  // The playbook desk (search and sideline drawing) opens from its key or button; the clock keeps running.
  const [desk, setDesk] = useState(false);
  const seen = useRef(session.driver.commands.length);
  if (searchAsked(session, seen.current)) { seen.current = session.driver.commands.length; if (!desk) setDesk(true); }
  else seen.current = session.driver.commands.length;
  const keyFor = useMemo(() => keyForIn(bindings), [bindings]);
  const names = useMemo(() => port.names(session), [port, session]);
  const view = gameCalling.consoleViewOfSession(session, { keyFor }) as unknown as ConsoleViewModel;
  // The newest play the resolver drew runs on the live field and goes to the sound stage once (I9.1, O2.3.4).
  const live = port.liveField(session);
  const latest = useRef<LivePlayLike | null>(null);
  const fresh = live?.take() ?? [];
  if (fresh.length) latest.current = fresh[fresh.length - 1] as unknown as LivePlayLike;
  const log = <PlayLog lines={gameCalling.sessionPlayLog(session, names, latest.current ? 4 : 12)} />;
  const field = live && latest.current ? (
    <div data-live-field style={{ display: 'grid', gridTemplateRows: '1fr auto', height: '100%' }}>
      {createElement(LivePlay, {
        play: latest.current, stage: soundStage, geometry: live.geometry, userSide: live.userSide, level: live.level,
        home: live.colours[0], away: live.colours[1], theme: 'classic',
      })}
      {log}
    </div>
  ) : log;
  return (
    <div data-live-console data-step={session.final ? 'final' : session.driver.state.step} data-unit={session.driver.state.open?.unit ?? ''} style={{ height: '100%', position: 'relative' }}>
      {session.final ? <FinalPanel session={session} names={names} onDone={onDone} /> : null}
      {!session.final ? (
        <div data-desk-layer style={{ position: 'absolute', right: 8, top: 8, zIndex: 5, maxWidth: 440, maxHeight: '70%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <button type="button" data-open-desk aria-expanded={desk} onClick={() => setDesk((d) => !d)}>{ct('console.playbook')}</button>
          {desk ? <div style={{ background: v('surface.panel'), overflow: 'auto' }}>{createElement(InGameDesk, { search: (t: string) => deskSearch(session, t), onAdd: (id, d) => deskAdd(session, id, d), onClose: () => setDesk(false) })}</div> : null}
        </div>
      ) : null}
      {createElement(GameConsole, { view, field })}
    </div>
  );
}

export function CareerRoot({ port, bindings = DEFAULT_KEYMAP.bindings, soundStage = null, now }: CareerRootProps): ReactNode {
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const [session, setSession] = useState<GameSession | null>(null);
  // The week's other games while a worker pool plays them; null when nothing is running.
  const [progress, setProgress] = useState<WeekProgress | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const running = useRef(false);
  // The shell is opened afresh on the office after a game, so it does not stay on the closed console.
  const [shellKey, nextShell] = useReducer((n: number) => n + 1, 0);
  const today = useMemo(() => port.today(), [port, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const gameDay = session !== null || (today.nextGame !== null && today.nextGame.daysToGame === 0);

  // Game day: the shell switches to game mode and opens the console; the game starts when it does.
  useEffect(() => {
    if (gameDay && session === null && progress === null) setSession(port.startGame());
  }, [gameDay, session, port, progress]);

  // A hub screen's edit (football desk) redraws the open screen.
  useEffect(() => port.subscribe?.(bump), [port]);

  /**
   * Runs one season move. A port that plays the other games in place returns at once; one that plays them in
   * workers returns a promise, and the screen stays live with their progress until it settles. One at a time.
   */
  const move = useCallback((go: (onProgress: (p: WeekProgress) => void) => void | Promise<void>, after?: () => void) => {
    if (running.current) return;
    setFailure(null);
    const r = go((p) => setProgress(p));
    if (!(r instanceof Promise)) { after?.(); bump(); return; }
    running.current = true;
    setProgress({ done: 0, total: 0 });
    r.then(() => after?.(), (e: unknown) => setFailure(e instanceof Error ? e.message : String(e)))
      .finally(() => { running.current = false; setProgress(null); bump(); });
  }, []);

  const advance = useCallback(() => move((p) => port.advanceToGameDay(p)), [port, move]);
  const step = useCallback((target: AdvanceTarget) => move((p) => (port.advance ? port.advance(target, p) : port.advanceToGameDay(p))), [port, move]);
  const done = useCallback(() => {
    const s = session;
    if (!s) return;
    move((p) => port.finishGame(s, p), () => { setSession(null); nextShell(); });
  }, [port, session, move]);
  const delegate = useCallback(() => move((p) => port.delegateGame(p)), [port, move]);
  const status = progress ? <WeekProgressLine progress={progress} /> : failure ? <p data-week-error role="alert" className="gm-line">{rt('root.weekError', { message: failure })}</p> : null;

  const routes: RouteTable = useMemo(() => {
    const t = buildRoutes({
      ...teamSources(port),
      ...port.sources?.(),
      ...port.routeSources?.(bump),
      home: { view: () => homeFromSeason(port.today(), 0, port.week?.() ?? null), dispatch: (i) => { if (i.kind === 'advance') step(i.target); } },
    });
    t['game.console'] = {
      render: () => (
        <>
          {status}
          {session ? createElement(LiveConsole, { port, session, bindings, now, soundStage, onDone: done }) : createElement(GameConsole, { view: null })}
        </>
      ),
    };
    // Today shows the week's other games while they play (unbuilt-work item 15).
    const todayRoute = t['office.today'];
    if (todayRoute) t['office.today'] = { render: (p) => <>{status}{todayRoute.render(p)}</> };
    return t;
  }, [port, session, bindings, now, soundStage, step, done, version, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const context: ShellContext = {
    teamName: today.teamName, record: recordText(today.record), phaseLabel: today.stageLabel,
    dateLabel: `${today.seasonYear}`, gameDay,
  };
  return (
    <Shell
      key={shellKey} routes={routes} context={context} initialPath="/office/today" onAdvance={advance} soundStage={soundStage}
      display={{ theme: 'classic' }}
      // The console takes the whole width on game day (O2.1.1 fixed layout); the season panel returns after the game.
      sidePanel={gameDay ? undefined : <SeasonPanel today={today} canDelegate={today.nextGame !== null && progress === null} onDelegate={delegate} />}
    />
  );
}
