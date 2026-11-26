// G-60 game-day console screen (O2.1.1 regions, O2.1.2 sideline panel, O2.2 call sheet panel, O2.4 prompts,
// O2.5.2 hint bar). It draws the console read model and nothing else: every number and word arrives computed by
// app-services (read-models/game-calling), and every key goes to the console core through the shell (the shell
// passes the console its keys while it owns the keyboard, O1.3.1). Regions never move or resize between snaps.
// The view type is structural until app-services exports the game-calling barrel (integrator request).
import type { ReactNode } from 'react';
import TEXT from './text.json';
import { Strip as ScoreStrip, stripModel, type StripLook, type StripTeam } from '../../presentation/strip/index.ts';
import { BannerBar, type BannerQueue, type BannerGate } from '../../presentation/banners/index.ts';

const STRINGS = TEXT as Record<string, string>;

export function ct(id: string, slots: Record<string, string | number> = {}): string {
  const raw = STRINGS[id] ?? id;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(slots[k] ?? ''));
}

export interface ConsoleEntryVM { id: string; label: string; key: string | null; readiness: 'ready' | 'shaky' | 'not_installed'; replacement: string | null; selected: boolean }
export interface ConsoleBoxVM { id: string; title: string; row: number; col: number; letter: string; focused: boolean; empty: boolean; count: number; entries: readonly ConsoleEntryVM[]; tooMany: boolean }
export interface ConsoleControlVM { left: number; enabled: boolean; reason: string | null; key: string | null }

/** Same shape as app-services `ConsoleView` (read-models/game-calling). */
export interface ConsoleViewModel {
  unit: 'offense' | 'defense' | 'special' | null;
  step: string;
  strip: {
    quarter: number; clock: string; clockRunning: boolean; score: readonly [number, number]; downDistance: string | null; spot: string; hash: string;
    timeouts: readonly [number, number]; playClockTenths: number; latestTenths: number | null; radioTenths: number | null; late: boolean;
    shortClock: boolean; playClockLengthTenths: number;
  };
  sheet: { boxes: readonly ConsoleBoxVM[]; focusHow: string };
  callLine: { text: string; spokenTenths: number; tags: readonly string[]; personnel: string | null; substitution: boolean; sent: boolean; committed: boolean; relay: string } | null;
  sideline: {
    personnel: string; opponentPersonnel: string | null; booth: { role: string; text: string; agePlays: number } | null; tendency: { text: string; sample: number } | null;
    tempo: string; relay: string; cadence: string | null; timeout: ConsoleControlVM; challenge: ConsoleControlVM;
  };
  prompt: { kind: 'options' | 'fourth'; options: readonly { key: string | null; labelKey: string; isDefault: boolean }[] } | null;
  hint: readonly { key: string; action: string }[];
  notice: string | null;
  queue?: readonly { box: string; label: string }[];
  precommit?: { choice: string; bookLine: string | null; key: string | null } | null;
  unitAlert?: { alerted: string | null; reversal: boolean } | null;
}

const sec = (tenths: number): string => (tenths / 10).toFixed(1);

/** Fixed layout (O2.1.1): strip, field 55%, sheet 70% wide, sideline 30% wide, hint bar. */
const GRID = {
  display: 'grid', height: '100%', minWidth: 1280, minHeight: 720,
  gridTemplateRows: 'auto 55fr 45fr auto', gridTemplateColumns: '70fr 30fr',
  gridTemplateAreas: '"strip strip" "field field" "sheet side" "hint hint"',
} as const;

/**
 * The PV-05 score strip and banner bar (plan 3.4, O2.1.3, MB-14), drawn in the strip region when the host
 * supplies what the console view does not hold: the generated teams, possession, the timeouts per half
 * (a rule value) and the play's public conditions from the presentation feed (PV-00).
 */
export interface ConsolePresentation {
  readonly teams: readonly [StripTeam, StripTeam];
  readonly possession: 0 | 1 | null;
  readonly timeoutsPerHalf: number;
  /** True from the snap to the whistle. */
  readonly live: boolean;
  readonly conditions: { readonly noise: number | null; readonly noiseBase: number; readonly windMph: number; readonly gustMph: number; readonly windDirDeg: number; readonly indoors: boolean };
  /** Classic lamp board or plain text (`stripLook(theme)`: high contrast is always plain). */
  readonly look: StripLook;
  /** The banner queue and its gate (nothing shows with the play clock under 10 s). */
  readonly banners?: { readonly queue: BannerQueue; readonly gate: BannerGate; readonly now?: () => number };
}

/** The coach's own clock line (latest snap, radio cut-off, short clock, late), which no stadium board shows. */
function ClockLine({ s }: { s: ConsoleViewModel['strip'] }): ReactNode {
  return (
    <>
      <span aria-label={ct('console.playClock')} data-late={s.late ? 'true' : 'false'}>
        {sec(s.playClockTenths)}
        {s.latestTenths !== null && <span> | {ct('console.latest')} {sec(s.latestTenths)}</span>}
        {s.radioTenths !== null && <span> | {ct('console.radio')} {sec(s.radioTenths)}</span>}
      </span>
      {s.shortClock && <span> {ct('console.shortClock', { len: s.playClockLengthTenths / 10 })}</span>}
      {s.late && <strong> {ct('console.late')}</strong>}
    </>
  );
}

function Strip({ v, p }: { v: ConsoleViewModel; p?: ConsolePresentation | undefined }): ReactNode {
  const s = v.strip;
  if (p) {
    const model = stripModel({
      teams: p.teams, possession: p.possession, quarter: s.quarter, clock: s.clock, clockRunning: s.clockRunning, score: s.score,
      downDistance: s.downDistance, spot: s.spot, timeouts: s.timeouts, timeoutsPerHalf: p.timeoutsPerHalf,
      playClockTenths: p.live ? null : s.playClockTenths, live: p.live, ...p.conditions,
    });
    return (
      <div role="region" aria-label={ct('console.situation')} style={{ gridArea: 'strip', overflow: 'hidden' }} data-region="strip">
        <ScoreStrip model={model} look={p.look} />
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden' }} data-part="clock-line"><ClockLine s={s} /></div>
        {p.banners && <BannerBar queue={p.banners.queue} gate={p.banners.gate} look={p.look} {...(p.banners.now ? { now: p.banners.now } : {})} />}
      </div>
    );
  }
  return (
    <div role="region" aria-label={ct('console.situation')} style={{ gridArea: 'strip', whiteSpace: 'nowrap', overflow: 'hidden' }} data-region="strip">
      <span>Q{s.quarter} {s.clock}</span> <span>{s.score[0]}-{s.score[1]}</span> <span>{s.downDistance ?? ''}</span> <span>{s.spot} {s.hash}</span>{' '}
      <span>TO {s.timeouts[0]}/{s.timeouts[1]}</span>{' '}
      <ClockLine s={s} />
    </div>
  );
}

function Sheet({ v }: { v: ConsoleViewModel }): ReactNode {
  const rows = Math.max(1, ...v.sheet.boxes.map((b) => b.row + 1));
  const cols = Math.max(1, ...v.sheet.boxes.map((b) => b.col + 1));
  return (
    <div role="region" aria-label={ct('console.sheet')} style={{ gridArea: 'sheet', overflow: 'hidden' }} data-region="sheet">
      {v.callLine && (
        <div data-call-line="true">
          <strong>{v.callLine.text}</strong> <span>{ct('console.spoken', { s: sec(v.callLine.spokenTenths) })}</span>
          {v.callLine.substitution && <span> {ct('console.sub')}</span>}
          {v.callLine.sent && <span> {ct(v.callLine.committed ? 'console.committed' : 'console.sent')} ({v.callLine.relay})</span>}
        </div>
      )}
      {v.prompt && (
        <ol data-prompt={v.prompt.kind}>
          {v.prompt.options.map((o) => <li key={o.labelKey} data-default={o.isDefault ? 'true' : 'false'}>{o.key ?? ''} {ct(o.labelKey)}</li>)}
        </ol>
      )}
      <div style={{ display: 'grid', gridTemplateRows: `repeat(${rows}, auto)`, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {v.sheet.boxes.map((b) => (
          <section key={b.id} style={{ gridRow: b.row + 1, gridColumn: b.col + 1, outline: b.focused ? '2px solid currentColor' : undefined }} data-box={b.id} data-focused={b.focused ? 'true' : 'false'}>
            <h4>{b.letter} {b.title} ({b.count})</h4>
            {b.empty && <p>{ct('console.empty')}</p>}
            {b.tooMany && <p>{ct('console.tooMany')}</p>}
            <ul>
              {b.entries.map((e) => (
                <li key={e.id} aria-selected={e.selected}>
                  {e.key ?? ''} {e.label} <small>{ct(`console.${e.readiness}`)}</small>
                  {e.replacement && <small> {ct('console.replacement', { name: e.replacement })}</small>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Control({ id, c, command }: { id: string; c: ConsoleControlVM; command: string }): ReactNode {
  return (
    <div data-command={command} aria-disabled={!c.enabled}>
      {c.key ?? ''} {ct(id)} {ct('console.left', { n: c.left })} {!c.enabled && c.reason ? `(${ct(c.reason)})` : ''}
    </div>
  );
}

function Sideline({ v, panel }: { v: ConsoleViewModel; panel?: ReactNode }): ReactNode {
  const s = v.sideline;
  return (
    <div role="region" aria-label={ct('console.sideline')} style={{ gridArea: 'side', overflow: 'hidden' }} data-region="sideline">
      <div>{ct('console.personnel')}: {s.personnel}</div>
      <div>{ct('console.opponent')}: {s.opponentPersonnel ?? '-'}</div>
      <div>{ct('console.booth')}: {s.booth ? `${s.booth.role}: ${s.booth.text.slice(0, 60)}` : '-'}</div>
      <div>{ct('console.tendency')}: {s.tendency ? `${s.tendency.text} (${ct('console.sample', { n: s.tendency.sample })})` : '-'}</div>
      <div>{ct('console.tempo')}: {s.tempo} | {ct('console.relay')}: {s.relay}{s.cadence ? ` | ${ct('console.cadence')}: ${s.cadence}` : ''}</div>
      {v.precommit && (
        <div data-part="precommit">{v.precommit.key ?? ''} {ct('console.ifShort')}: {ct(v.precommit.choice)}{v.precommit.bookLine ? ` | ${ct('console.book')}: ${v.precommit.bookLine}` : ''}</div>
      )}
      {v.unitAlert?.reversal && <div data-part="reversal">{ct('console.reversal')}</div>}
      {v.queue && v.queue.length > 0 && (
        <div data-part="queue">{ct('console.queue')}: {v.queue.map((q) => `${q.box}: ${q.label}`).join(' | ')}</div>
      )}
      {panel ?? (<>
        <Control id="console.timeout" c={s.timeout} command="game.timeout" />
        <Control id="console.challenge" c={s.challenge} command="game.challenge" />
      </>)}
    </div>
  );
}

export interface GameConsoleProps {
  view: ConsoleViewModel | null;
  /** The 2D field view (G-03) drawn by the host for the current snap. */
  field?: ReactNode;
  /**
   * The game management panel (G-61 `GameManagementPanel`: decision bar, clock arithmetic, timeout and challenge
   * controls, sideline feed), drawn in the sideline region (O2.1.2). When present it replaces the console's own
   * timeout and challenge rows; the console's keys still answer them.
   */
  sideline?: ReactNode;
  /** PV-05 score strip and banners. Without it the strip region shows the console's plain text line. */
  presentation?: ConsolePresentation;
}

export function GameConsole({ view, field, sideline, presentation }: GameConsoleProps): ReactNode {
  if (!view) return <div role="main" aria-label={ct('console.title')}><p>{ct('console.waiting')}</p></div>;
  return (
    <div role="main" aria-label={ct('console.title')} style={GRID}>
      <Strip v={view} p={presentation} />
      <div role="region" aria-label={ct('console.field')} style={{ gridArea: 'field' }} data-region="field">{field ?? null}</div>
      <Sheet v={view} />
      <Sideline v={view} panel={sideline} />
      <div role="region" aria-label={ct('console.hints')} style={{ gridArea: 'hint', whiteSpace: 'nowrap', overflow: 'hidden' }} data-region="hint">
        {view.hint.map((h) => `${h.key} ${h.action}`).join('  ')}
        {view.notice && <span> | {ct(view.notice)}</span>}
      </div>
    </div>
  );
}

/** Every text id the screen uses exists (O6.6.1); returns the missing ones. */
export function missingConsoleText(ids: readonly string[]): string[] {
  return ids.filter((id) => STRINGS[id] === undefined);
}
