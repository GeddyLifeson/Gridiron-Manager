// G-60 game-day console screen (O2.1.1 regions, O2.1.2 sideline panel, O2.2 call sheet panel, O2.4 prompts,
// O2.5.2 hint bar). It draws the console read model and nothing else: every number and word arrives computed by
// app-services (read-models/game-calling), and every key goes to the console core through the shell (the shell
// passes the console its keys while it owns the keyboard, O1.3.1). Regions never move or resize between snaps.
// The view type is structural until app-services exports the game-calling barrel (integrator request).
import type { ReactNode } from 'react';
import TEXT from './text.json';

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
  prompt: { kind: 'options' | 'fourth' | 'try'; options: readonly { key: string | null; labelKey: string; isDefault: boolean }[] } | null;
  hint: readonly { key: string; action: string }[];
  notice: string | null;
}

const sec = (tenths: number): string => (tenths / 10).toFixed(1);

/** Fixed layout (O2.1.1): strip, field 55%, sheet 70% wide, sideline 30% wide, hint bar. */
const GRID = {
  display: 'grid', height: '100%', minWidth: 1280, minHeight: 720,
  gridTemplateRows: 'auto 55fr 45fr auto', gridTemplateColumns: '70fr 30fr',
  gridTemplateAreas: '"strip strip" "field field" "sheet side" "hint hint"',
} as const;

function Strip({ v }: { v: ConsoleViewModel }): ReactNode {
  const s = v.strip;
  return (
    <div role="region" aria-label={ct('console.situation')} style={{ gridArea: 'strip', whiteSpace: 'nowrap', overflow: 'hidden' }} data-region="strip">
      <span>Q{s.quarter} {s.clock}</span> <span>{s.score[0]}-{s.score[1]}</span> <span>{s.downDistance ?? ''}</span> <span>{s.spot} {s.hash}</span>{' '}
      <span>TO {s.timeouts[0]}/{s.timeouts[1]}</span>{' '}
      <span aria-label={ct('console.playClock')} data-late={s.late ? 'true' : 'false'}>
        {sec(s.playClockTenths)}
        {s.latestTenths !== null && <span> | {ct('console.latest')} {sec(s.latestTenths)}</span>}
        {s.radioTenths !== null && <span> | {ct('console.radio')} {sec(s.radioTenths)}</span>}
      </span>
      {s.shortClock && <span> {ct('console.shortClock', { len: s.playClockLengthTenths / 10 })}</span>}
      {s.late && <strong> {ct('console.late')}</strong>}
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

function Sideline({ v }: { v: ConsoleViewModel }): ReactNode {
  const s = v.sideline;
  return (
    <div role="region" aria-label={ct('console.sideline')} style={{ gridArea: 'side', overflow: 'hidden' }} data-region="sideline">
      <div>{ct('console.personnel')}: {s.personnel}</div>
      <div>{ct('console.opponent')}: {s.opponentPersonnel ?? '-'}</div>
      <div>{ct('console.booth')}: {s.booth ? `${s.booth.role}: ${s.booth.text.slice(0, 60)}` : '-'}</div>
      <div>{ct('console.tendency')}: {s.tendency ? `${s.tendency.text} (${ct('console.sample', { n: s.tendency.sample })})` : '-'}</div>
      <div>{ct('console.tempo')}: {s.tempo} | {ct('console.relay')}: {s.relay}{s.cadence ? ` | ${ct('console.cadence')}: ${s.cadence}` : ''}</div>
      <Control id="console.timeout" c={s.timeout} command="game.timeout" />
      <Control id="console.challenge" c={s.challenge} command="game.challenge" />
    </div>
  );
}

export interface GameConsoleProps {
  view: ConsoleViewModel | null;
  /** The 2D field view (G-03) drawn by the host for the current snap. */
  field?: ReactNode;
}

export function GameConsole({ view, field }: GameConsoleProps): ReactNode {
  if (!view) return <div role="main" aria-label={ct('console.title')}><p>{ct('console.waiting')}</p></div>;
  return (
    <div role="main" aria-label={ct('console.title')} style={GRID}>
      <Strip v={view} />
      <div role="region" aria-label={ct('console.field')} style={{ gridArea: 'field' }} data-region="field">{field ?? null}</div>
      <Sheet v={view} />
      <Sideline v={view} />
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
