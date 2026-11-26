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
import { FinalPanel, PlayLog, StaffStrip, keyForIn, useLiveSession } from './ConsoleHost.tsx';
import { rt } from './text.ts';
import { teamSources } from './sources/team.ts';
import type { CareerPort, GameSession, SeasonToday } from './port.ts';
import type { SoundStage } from '../audio/stage/index.ts';

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

interface LiveConsoleProps { readonly port: CareerPort; readonly session: GameSession; readonly bindings: readonly Binding[]; readonly now?: (() => number) | undefined; readonly soundStage: SoundStage | null; onDone(): void }

/** The console route while a game is open: the live session drawn through the G-60 console. */
function LiveConsole({ port, session, bindings, now, soundStage, onDone }: LiveConsoleProps): ReactNode {
  useLiveSession(session, { bindings, keysActive: true, ...(now ? { now } : {}) });
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
    <div data-live-console data-step={session.final ? 'final' : session.driver.state.step} data-unit={session.driver.state.open?.unit ?? ''} style={{ height: '100%' }}>
      {session.final ? <FinalPanel session={session} names={names} onDone={onDone} /> : <StaffStrip session={session} bindings={bindings} />}
      {createElement(GameConsole, { view, field })}
    </div>
  );
}

export function CareerRoot({ port, bindings = DEFAULT_KEYMAP.bindings, soundStage = null, now }: CareerRootProps): ReactNode {
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const [session, setSession] = useState<GameSession | null>(null);
  // The shell is opened afresh on the office after a game, so it does not stay on the closed console.
  const [shellKey, nextShell] = useReducer((n: number) => n + 1, 0);
  const today = useMemo(() => port.today(), [port, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const gameDay = session !== null || (today.nextGame !== null && today.nextGame.daysToGame === 0);

  // Game day: the shell switches to game mode and opens the console; the game starts when it does.
  useEffect(() => {
    if (gameDay && session === null) setSession(port.startGame());
  }, [gameDay, session, port]);

  const advance = useCallback(() => { port.advanceToGameDay(); bump(); }, [port]);
  const done = useCallback(() => {
    if (session) port.finishGame(session);
    setSession(null);
    bump();
    nextShell();
  }, [port, session]);
  const delegate = useCallback(() => { port.delegateGame(); bump(); }, [port]);

  const routes: RouteTable = useMemo(() => {
    const t = buildRoutes({
      ...teamSources(port),
      home: { view: () => homeFromSeason(port.today()), dispatch: (i) => { if (i.kind === 'advance') advance(); } },
    });
    t['game.console'] = {
      render: () => (session ? createElement(LiveConsole, { port, session, bindings, now, soundStage, onDone: done }) : createElement(GameConsole, { view: null })),
    };
    return t;
  }, [port, session, bindings, now, soundStage, advance, done, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const context: ShellContext = {
    teamName: today.teamName, record: recordText(today.record), phaseLabel: today.stageLabel,
    dateLabel: `${today.seasonYear}`, gameDay,
  };
  return (
    <Shell
      key={shellKey} routes={routes} context={context} initialPath="/office/today" onAdvance={advance} soundStage={soundStage}
      display={{ theme: 'classic' }}
      // The console takes the whole width on game day (O2.1.1 fixed layout); the season panel returns after the game.
      sidePanel={gameDay ? undefined : <SeasonPanel today={today} canDelegate={today.nextGame !== null} onDelegate={delegate} />}
    />
  );
}
