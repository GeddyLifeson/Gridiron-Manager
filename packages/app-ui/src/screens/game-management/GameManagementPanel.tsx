// Game management panel (G-61: O2.1.2, O2.1.3, O2.4, O2.5.3, I5.4.1, I7). The clock strip, the decision
// bar, the timeout and challenge controls with counts and reasons, the booth line with headline counts
// from other channels, and the message and injury tabs. Draws the read model only; holds no football logic.
import TEXT from './text.json';
import { CHANNELS, GM_TABS, type ClockView, type DecisionBarView, type GameManagementData, type GameManagementView, type GmTab, type InjuryRowView, type SidelineView } from './types.ts';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;

/** Panel text by id with `{slot}` filled; an unknown id shows itself so a gap is visible (O6.6.1). */
export function gt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}
export const gmTextIds = (): string[] => Object.keys(STRINGS);

export function mmss(totalS: number): string {
  const s = Math.max(0, Math.ceil(totalS));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function spotText(yardsToGoal: number, fieldLength = 100): string {
  const half = fieldLength / 2;
  if (yardsToGoal === half) return gt('gm.spot.mid');
  return yardsToGoal > half ? gt('gm.spot.own', { y: fieldLength - yardsToGoal }) : gt('gm.spot.opp', { y: yardsToGoal });
}

/** Option label: `gm.option.<id>` when known, else the engine's label id. */
const optionName = (id: string, labelId?: string) => (STRINGS[`gm.option.${id}`] !== undefined ? gt(`gm.option.${id}`) : gt(labelId ?? id));
const pct = (v: number) => (v * 100).toFixed(0);
const edge = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}`;

function ClockStrip({ c }: { c: ClockView }) {
  return (
    <div className="gm-clock" data-part="clock">
      <span>{gt('gm.clock.game', { clock: mmss(c.clockTenths / 10) })}</span>
      <span>{gt('gm.clock.play', { s: Math.ceil(c.playClockTenths / 10) })}</span>
      <span data-status={c.status}>{gt(`gm.clock.${c.status}`)}{c.startsOn ? `, ${gt(`gm.clock.starts.${c.startsOn}`)}` : ''}</span>
      <span>{gt('gm.clock.timeouts', { own: c.timeoutsOwn, opp: c.timeoutsOpp })}</span>
      {c.panel && (
        <p className="gm-line" data-part="arithmetic">
          {gt(`gm.panel.${c.panel.leader}`, { burn: mmss(c.panel.burnS), n: c.panel.kneels, t: c.panel.trailingTimeouts, against: mmss(c.panel.burnAgainstTimeoutsS) })}
          {c.panel.kneelEndsGame ? ` ${gt('gm.panel.kneel_wins')}` : ''}
        </p>
      )}
    </div>
  );
}

function DecisionBar({ bar, keyOf, onPick }: { bar: DecisionBarView; keyOf: (n: number) => string; onPick?: (optionIndex: number) => void }) {
  const expiryName = optionName(bar.onExpiry.optionId, bar.options.find((o) => o.id === bar.onExpiry.optionId)?.labelId);
  return (
    <section className="gm-bar" data-part="bar" data-kind={bar.kind} aria-live="assertive" aria-label={gt(`gm.bar.title.${bar.kind}`)}>
      <h3>{gt(`gm.bar.title.${bar.kind}`)}{bar.mode === 'recommend' ? `: ${gt('gm.bar.recommend')}` : ''}</h3>
      <div className="gm-timer" role="timer" data-seconds={bar.secondsLeft}>{gt('gm.bar.timer', { s: Math.ceil(bar.secondsLeft) })}</div>
      {bar.noticeOnly ? <p className="gm-line">{gt('gm.bar.notice')}</p> : (
        <ol className="gm-options">
          {bar.options.map((o, i) => (
            <li key={o.id}>
              <button type="button" data-option={o.id} data-guarded={o.guarded} onClick={() => onPick?.(i)}>
                <kbd>{keyOf(i + 1) || o.key}</kbd> {optionName(o.id, o.labelId)}
                {o.result && o.result.down !== null && o.result.distanceYd !== null && o.result.yardsToGoalYd !== null
                  ? ` (${gt('gm.bar.result', { down: o.result.down, dist: o.result.distanceYd, spot: spotText(o.result.yardsToGoalYd) })})` : ''}
                {o.guarded ? ` [${gt('gm.bar.hold')}]` : ''}
              </button>
            </li>
          ))}
        </ol>
      )}
      {bar.chart && <p className="gm-line" data-part="chart">{gt('gm.bar.chart', { option: optionName(bar.chart.option), call: bar.chart.coachsCall ? gt('gm.bar.chart.call') : '', mark: bar.chart.mark ? gt('gm.bar.chart.mark', { mark: bar.chart.mark }) : '' })}</p>}
      {bar.fgRangeYardsToGoal !== null && <p className="gm-line">{gt('gm.bar.range', { spot: spotText(bar.fgRangeYardsToGoal) })}</p>}
      {bar.advisor && (
        <p className="gm-line" data-part="advisor">
          {bar.advisor.close
            ? gt('gm.bar.advisor.close', { option: optionName(bar.advisor.optionId), edge: edge(bar.advisor.marginWp) })
            : gt('gm.bar.advisor', {
              option: optionName(bar.advisor.optionId), edge: edge(bar.advisor.marginWp),
              be: bar.advisor.breakEven !== null && bar.advisor.estimate !== null ? gt('gm.bar.advisor.breakeven', { need: pct(bar.advisor.breakEven), est: pct(bar.advisor.estimate) }) : '',
            })}
        </p>
      )}
      {!bar.advisor && bar.advisorDueInS !== null && <p className="gm-line" data-part="advisor-due">{gt('gm.bar.advisor.due')}</p>}
      <p className="gm-line" data-part="expiry">{gt(`gm.bar.expiry.${bar.onExpiry.by}`, { option: expiryName })}</p>
      {bar.queued > 0 && <p className="gm-line">{gt('gm.bar.queued', { n: bar.queued })}</p>}
    </section>
  );
}

function Controls({ view, keyOf }: { view: GameManagementView; keyOf: (action: string) => string }) {
  const t = view.timeout, c = view.challenge;
  if (!t || !c) return null;
  const reason = (k: string | null) => (k === null ? '' : STRINGS[k] !== undefined ? gt(k) : k);
  return (
    <div className="gm-controls" data-part="controls">
      <button type="button" data-control="timeout" disabled={!t.enabled} aria-disabled={!t.enabled} title={reason(t.reasonKey)}>
        <kbd>{keyOf('call.timeout')}</kbd> {gt('gm.control.timeout')} · {gt('gm.control.count', { n: t.count })}
        {!t.enabled && t.reasonKey ? <span className="gm-reason"> {reason(t.reasonKey)}</span> : null}
      </button>
      <button type="button" data-control="challenge" disabled={!c.enabled} aria-disabled={!c.enabled} title={reason(c.reasonKey)}>
        <kbd>{keyOf('call.challenge')}</kbd> {gt('gm.control.challenge')} · {gt('gm.control.count', { n: c.count })}
        {c.byTimeout ? ` (${gt('gm.control.by_timeout')})` : ''}
        {!c.enabled && c.reasonKey ? <span className="gm-reason"> {reason(c.reasonKey)}</span> : null}
      </button>
      {c.enabled && c.windowS !== null && <div className="gm-window" role="timer" data-seconds={c.windowS}>{gt('gm.control.window', { s: Math.ceil(c.windowS) })}</div>}
    </div>
  );
}

function BoothLine({ s }: { s: SidelineView }) {
  return (
    <div className="gm-booth" data-part="booth">
      <p className="gm-line" data-part="channel">{gt('gm.channel', { channel: gt(`gm.channel.${s.channel}`) })}</p>
      {s.line
        ? <p className="gm-booth-line" data-message={s.line.id}>{s.line.speakerRole}: {s.line.clipped}{s.line.ageInPlays !== null ? ` · ${s.line.ageInPlays <= 1 ? gt('gm.booth.age_one') : gt('gm.booth.age', { n: s.line.ageInPlays })}` : ''}</p>
        : <p className="gm-line">{gt('gm.booth.none')}</p>}
      {s.headlines.length > 0 && (
        <ul className="gm-headlines">
          {s.headlines.map((h) => <li key={h.channel} data-channel={h.channel}>{gt('gm.headline', { channel: gt(`gm.channel.${h.channel}`), n: h.count })}</li>)}
        </ul>
      )}
      {s.infoDelayS > 0 && <p className="gm-line" data-part="tired">{gt('gm.booth.delay', { s: s.infoDelayS })}</p>}
    </div>
  );
}

function Messages({ s }: { s: SidelineView }) {
  if (s.list.length === 0) return <p className="gm-line">{gt('gm.messages.empty')}</p>;
  return (
    <ol className="gm-messages">
      {s.list.map((m) => <li key={m.id} data-message={m.id} data-read={m.read}><b>{m.speakerRole} ({m.speakerName})</b>: {m.text}</li>)}
    </ol>
  );
}

function Injuries({ rows }: { rows: readonly InjuryRowView[] }) {
  if (rows.length === 0) return <p className="gm-line">{gt('gm.injuries.empty')}</p>;
  return (
    <table className="gm-table" data-view="injuries">
      <caption>{gt('gm.injuries.caption')}</caption>
      <thead><tr>{['player', 'part', 'status', 'replaced'].map((k) => <th key={k} scope="col">{gt(`gm.injuries.${k}`)}</th>)}</tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.playerId} data-player={r.playerId}>
            <th scope="row">{r.name} ({r.position})</th>
            <td>{r.bodyPart}</td>
            <td>{gt(`gm.injury.${r.word}`)}{r.revised ? ` (${gt('gm.injuries.revised')})` : ''}</td>
            <td>{r.replacedBy ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface GameManagementPanelProps {
  data: GameManagementData;
  tab: GmTab;
  onTab: (tab: GmTab) => void;
  /** The key shown for an action in the live map (O2.5.2). */
  keyOf: (action: string) => string;
  onPick?: (optionIndex: number) => void;
}

export function GameManagementPanel({ data, tab, onTab, keyOf, onPick }: GameManagementPanelProps) {
  if (!data.live) return <section className="gm-panel" aria-label={gt('gm.panel')}><p className="gm-line">{gt('gm.waiting')}</p></section>;
  const v = data.view;
  return (
    <section className="gm-panel" aria-label={gt('gm.panel')} data-seat={v.seat}>
      <ClockStrip c={v.clock} />
      {v.bar && <DecisionBar bar={v.bar} keyOf={(n) => keyOf(`prompt.option_${n}`)} onPick={onPick} />}
      <Controls view={v} keyOf={keyOf} />
      <BoothLine s={v.sideline} />
      <div role="tablist" aria-label={gt('gm.tabs')}>
        {GM_TABS.map((k) => (
          <button key={k} type="button" role="tab" id={`gm-gm-tab-${k}`} aria-selected={k === tab} aria-controls="gm-gm-panel" onClick={() => onTab(k)}>{gt(`gm.tab.${k}`)}</button>
        ))}
      </div>
      <div role="tabpanel" id="gm-gm-panel" aria-labelledby={`gm-gm-tab-${tab}`}>
        {tab === 'messages' ? <Messages s={v.sideline} /> : <Injuries rows={v.injuries} />}
      </div>
    </section>
  );
}

export const parseTab = (v: string | undefined): GmTab => (GM_TABS as readonly string[]).includes(v ?? '') ? (v as GmTab) : 'messages';
export { CHANNELS };
