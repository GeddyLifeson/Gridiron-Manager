// Game-day seat panels below head coach (G-79; O7.4.1, O7.4.2, S5). One console frame with the lower panel
// swapped by seat: pick lists for booth eyes, the charting form, the signal card, the substitution counter, the
// position group with its corrections, the decision card. A caller's seat shows the G-60 call sheet instead. The
// role report after the game shows the user's entries beside what the film shows. No football logic here: the
// view shapes are declared structurally because app-ui may import only the public entry of app-services, which
// gains these models when the integrator adds them (CR-G79-1).
import type { ReactNode } from 'react';
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;

/** Screen text by id with `{slot}` filled; an unknown id shows itself so a gap is visible (O6.6.1). */
export function st(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

type ChannelName = 'offense' | 'defense' | 'special_teams' | 'head_coach' | 'analyst';

export interface SeatPanelView {
  role: string;
  location: 'booth' | 'sideline';
  channel: ChannelName;
  canPickChannel: boolean;
  channels: readonly ChannelName[];
  noHeadset: boolean;
  panel: string;
  task: string;
  view: 'booth_overhead' | 'sideline';
  zoomMin: number;
  gameWaits: boolean;
  open: { ask: string; secondsLeft: number; phase: 'pre' | 'post' | null } | null;
  pad: readonly { family: string; variants: readonly string[] }[];
  corrections: readonly { id: string; playerId: number; kind: string }[];
  correctionsLeft: number;
  onField: number | null;
  line: readonly { id: number; kind: string; fromSeat: number; text: string }[];
  queued: readonly { id: number; channel: ChannelName; ageS: number }[];
  simulated: boolean;
}

export interface RoleReportPanelView {
  games: number;
  accuracyPct: number | null;
  families: readonly { family: string; pct: number | null; n: number | null }[];
  medianSeconds: number | null;
  adviceMatchedPct: number | null;
  adviceWorkedPct: number | null;
  correctionsGiven: number;
  correctionsWorked: number;
  signalErrorsPerGame: number | null;
  lateRelaysPerGame: number | null;
  estimated: boolean;
  events: readonly { kind: string; playId: number | null; yours: string | null; film: string | null; seconds: number | null; estimated: boolean }[];
}

/** A command as app-services defines it (commands/seats); sent through the host. */
export interface SeatCommandOut { type: string; [k: string]: unknown }

const words = (s: string): string => s.replace(/_/g, ' ');
const pctText = (p: number | null): string => (p === null ? st('rr.notEnough') : `${p}%`);

function PickLists({ v, send, readOnly }: { v: SeatPanelView; send: (c: SeatCommandOut) => void; readOnly: boolean }): ReactNode {
  const phase = v.open?.phase ?? 'post';
  const familyOnly = v.open?.ask === 'family';
  return (
    <section aria-label={st('seat.pad.title')} data-panel="pick_lists">
      <h3>{st('seat.pad.title')}{familyOnly ? ` (${st('seat.pad.familyOnly')})` : ''}</h3>
      {v.pad.map((f) => (
        <div key={f.family} role="group" aria-label={words(f.family)}>
          <button type="button" disabled={readOnly} onClick={() => send({ type: 'seat.report_look', phase, look: f.family })}>{words(f.family)}</button>
          {familyOnly ? null : f.variants.map((x) => (
            <button key={x} type="button" disabled={readOnly} onClick={() => send({ type: 'seat.report_look', phase, look: `${f.family}/${x}` })}>{words(x)}</button>
          ))}
        </div>
      ))}
    </section>
  );
}

function Corrections({ v, send, readOnly }: { v: SeatPanelView; send: (c: SeatCommandOut) => void; readOnly: boolean }): ReactNode {
  return (
    <section aria-label={st('seat.corr.title', { left: v.correctionsLeft })} data-panel="position_group">
      <h3>{st('seat.corr.title', { left: v.correctionsLeft })}</h3>
      {v.onField !== null ? <p>{st('seat.onField', { n: v.onField })}</p> : null}
      <ul>
        {v.corrections.map((c) => (
          <li key={c.id} data-correction={c.id}>
            {`#${c.playerId} ${words(c.kind)} `}
            {(['words', 'picture', 'walkthrough'] as const).map((w) => (
              <button key={w} type="button" disabled={readOnly || v.correctionsLeft <= 0} onClick={() => send({ type: 'seat.correct', optionId: c.id, way: w })}>{st(`seat.corr.${w}`)}</button>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LowerPanel({ v, send, readOnly }: { v: SeatPanelView; send: (c: SeatCommandOut) => void; readOnly: boolean }): ReactNode {
  switch (v.panel) {
    case 'pick_lists': return <PickLists v={v} send={send} readOnly={readOnly} />;
    case 'position_group': return <Corrections v={v} send={send} readOnly={readOnly} />;
    case 'decision_card': return <section data-panel="decision_card"><h3>{st('seat.advice.title')}</h3></section>;
    case 'charting_form': return <section data-panel="charting_form"><h3>{st('seat.chart.title')}</h3></section>;
    case 'signal_card': return <section data-panel="signal_card"><h3>{st('seat.signal.title')}</h3></section>;
    case 'substitution_counter': return <section data-panel="substitution_counter"><h3>{st('seat.sub.title')}</h3>{v.onField !== null ? <p>{st('seat.onField', { n: v.onField })}</p> : null}</section>;
    default: return <section data-panel={v.panel}><h3>{st('seat.sheet.title')}</h3></section>;
  }
}

export interface SeatPanelProps {
  view: SeatPanelView | null;
  send: (c: SeatCommandOut) => void;
  readOnly?: boolean;
  /** For a caller's seat the host passes the G-60 call sheet here. */
  callSheet?: ReactNode;
}

/** The seat's lower panel, its line on the sheet, the open task timer, and the booth line on its channel. */
export function SeatPanel({ view: v, send, readOnly = false, callSheet }: SeatPanelProps): ReactNode {
  if (!v) return <p>{st('seat.none')}</p>;
  return (
    <div role="region" aria-label={st(`panel.${v.panel}`)} data-seat={v.role} data-view={v.view}>
      <p data-line>{st('seat.line', { role: st(`role.${v.role}`), location: st(`loc.${v.location}`), channel: st(`ch.${v.channel}`) })}</p>
      {v.noHeadset ? <p>{st('seat.noHeadset')}</p> : null}
      {v.simulated ? <p>{st('seat.simulated')}</p> : null}
      <button type="button" disabled={readOnly} onClick={() => send({ type: 'seat.standing_rules', on: !v.simulated })}>{st(v.simulated ? 'seat.standing.off' : 'seat.standing.on')}</button>
      <p data-open>{v.open ? st('seat.open', { ask: words(v.open.ask), sec: v.open.secondsLeft }) : st('seat.open.none')}</p>
      {v.canPickChannel ? (
        <div role="group" aria-label={st('seat.channel.pick')}>
          {v.channels.map((c) => (
            <button key={c} type="button" aria-pressed={c === v.channel} disabled={readOnly} onClick={() => send({ type: 'seat.channel', channel: c })}>{st(`ch.${c}`)}</button>
          ))}
        </div>
      ) : null}
      {v.panel === 'call_sheet' && callSheet ? callSheet : <LowerPanel v={v} send={send} readOnly={readOnly} />}
      <section aria-label={st('seat.lineTitle')} data-booth-line>
        <h3>{st('seat.lineTitle')}</h3>
        {v.line.length === 0 ? <p>{st('seat.lineEmpty')}</p> : <ol>{v.line.map((m) => <li key={m.id}>{m.text}</li>)}</ol>}
        {v.queued.length ? <p>{st('seat.queued', { n: v.queued.length })}</p> : null}
      </section>
    </div>
  );
}

/** The role report after the game (S5.5.1): measures, then each graded event beside what the film shows. */
export function RoleReportPanel({ view: r }: { view: RoleReportPanelView | null }): ReactNode {
  if (!r) return <p>{st('seat.none')}</p>;
  const d = (x: string | number | null) => (x === null ? st('rr.dash') : String(x));
  return (
    <section aria-label={st('rr.title')} data-role-report>
      <h2>{st('rr.title')}</h2>
      {r.estimated ? <p>{st('rr.estimated')}</p> : null}
      <p>{st('rr.games', { n: r.games })}</p>
      <p>{st('rr.accuracy', { pct: r.accuracyPct === null ? st('rr.notEnough') : r.accuracyPct })}</p>
      {r.medianSeconds !== null ? <p>{st('rr.speed', { sec: r.medianSeconds })}</p> : null}
      <ul>
        {r.families.map((f) => (
          <li key={f.family}>{st('rr.family', { family: words(f.family), value: f.pct === null ? st('rr.notEnough') : st('rr.familyValue', { pct: f.pct, n: f.n ?? 0 }) })}</li>
        ))}
      </ul>
      <p>{st('rr.advice', { matched: pctText(r.adviceMatchedPct), worked: pctText(r.adviceWorkedPct) })}</p>
      <p>{st('rr.corrections', { given: r.correctionsGiven, worked: r.correctionsWorked })}</p>
      <p>{st('rr.signals', { errors: d(r.signalErrorsPerGame), late: d(r.lateRelaysPerGame) })}</p>
      <table>
        <caption>{st('rr.events')}</caption>
        <thead><tr><th>{st('rr.col.play')}</th><th>{st('rr.col.kind')}</th><th>{st('rr.col.yours')}</th><th>{st('rr.col.film')}</th><th>{st('rr.col.sec')}</th></tr></thead>
        <tbody>
          {r.events.map((e, i) => (
            <tr key={i}><td>{d(e.playId)}</td><td>{words(e.kind)}</td><td>{e.yours === null ? st('rr.dash') : words(e.yours)}</td><td>{e.film === null ? st('rr.dash') : words(e.film)}</td><td>{d(e.seconds)}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Every text id the panels use exists (O6.6.1); returns the missing ones. */
export function missingSeatText(ids: readonly string[]): string[] {
  return ids.filter((id) => STRINGS[id] === undefined);
}
