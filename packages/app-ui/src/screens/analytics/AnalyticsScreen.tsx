// Analytics screen (G-71: N2.4 to N2.7, O6.5). Team strength table, the week's fourth-down and
// two-point chart, tracking and load, the analytics staff's report plan, and the standing page "What
// these numbers cannot tell you", which is always reachable and never hidden (N2.7.2 rule 3). Draws read
// models only; holds no football logic.
import type { ReactNode } from 'react';
import TEXT from './text.json';
import {
  ANALYTICS_TABS, type AnalyticsData, type AnalyticsTab, type ChartCell, type FourthOption, type Mark, type StrengthData, type TwoPointRow,
} from './types.ts';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;

/** Analytics text by id with `{slot}` filled; an unknown id shows itself so a gap is visible (O6.6.1). */
export function at(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export const analyticsTextIds = (): string[] => Object.keys(STRINGS);

/** The standing note's items in order (models `strength.LIMITS_NOTE`). */
export const LIMITS_NOTE_IDS: readonly string[] = [
  'limits.averages_not_matchup', 'limits.hidden_injuries', 'limits.fatigue', 'limits.film_only', 'limits.small_samples', 'limits.good_decision_can_lose',
];

const fx = (v: number, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);
const pts = (wp: number) => (wp * 100).toFixed(1);

function MarkTag({ mark }: { mark: Mark }) {
  return <span className={`gm-mark gm-mark-${mark}`} data-mark={mark}>{at(`analytics.mark.${mark}`)}</span>;
}

export function spotLabel(yardsToGoal: number, fieldLength = 100): string {
  const half = fieldLength / 2;
  if (yardsToGoal === half) return at('analytics.spot.mid');
  return yardsToGoal > half ? at('analytics.spot.own', { y: fieldLength - yardsToGoal }) : at('analytics.spot.opp', { y: yardsToGoal });
}

function StrengthView({ data, onOpenGames }: { data: StrengthData; onOpenGames?: (teamId: number) => void }) {
  if (data.teams.length === 0) return <p className="gm-line">{at('analytics.strength.empty')}</p>;
  const band = (v: number, se: number) => `${fx(v)} ± ${se.toFixed(1)}`;
  return (
    <>
      <table className="gm-table" data-view="strength">
        <caption>{at('analytics.strength.caption', { season: data.seasonYear })}</caption>
        <thead>
          <tr>
            {['team', 'offense', 'defense', 'special', 'total', 'games', 'confidence'].map((k) => <th key={k} scope="col">{at(`analytics.strength.${k}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.teams.map((t) => (
            <tr key={t.teamId} data-team={t.teamId}>
              <th scope="row">{t.name}</th>
              <td>{band(t.offense, t.seOffense)}</td>
              <td>{band(t.defense, t.seDefense)}</td>
              <td>{band(t.specialTeams, t.seSpecialTeams)}</td>
              <td>{band(t.total, t.seTotal)}</td>
              <td>
                <button type="button" className="gm-link" onClick={() => onOpenGames?.(t.teamId)} aria-label={at('analytics.strength.openGames', { team: t.name, n: t.gameIds.length })}>
                  {t.games.toFixed(t.games % 1 === 0 ? 0 : 2)}
                </button>
              </td>
              <td><MarkTag mark={t.mark} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="gm-line">{at('analytics.strength.home', { value: data.homeAdvantage.toFixed(1), se: data.homeAdvantageSe.toFixed(1) })}</p>
    </>
  );
}

function cellText(c: ChartCell): string {
  return at('analytics.chart.cell', {
    d: c.distanceYd, spot: spotLabel(c.yardsToGoalYd), option: at(`analytics.chart.optionName.${c.approved}`), edge: pts(c.marginWp),
    call: c.coachsCall ? at('analytics.chart.call') : '',
    shift: c.approved !== c.model ? at('analytics.chart.shifted', { model: at(`analytics.chart.optionName.${c.model}`) }) : '',
  });
}

export function ChartGrid({ cells }: { cells: ChartCell[] }) {
  const yards = [...new Set(cells.map((c) => c.yardsToGoalYd))].sort((a, b) => b - a);
  const dists = [...new Set(cells.map((c) => c.distanceYd))].sort((a, b) => a - b);
  const at2 = new Map(cells.map((c) => [`${c.yardsToGoalYd}:${c.distanceYd}`, c]));
  return (
    <table className="gm-table gm-chart" data-view="chart">
      <caption>{at('analytics.chart.caption')}</caption>
      <thead>
        <tr>
          <th scope="col">{at('analytics.chart.distance')}</th>
          {yards.map((y) => <th key={y} scope="col" title={spotLabel(y)}>{y > 50 ? 100 - y : y}</th>)}
        </tr>
      </thead>
      <tbody>
        {dists.map((d) => (
          <tr key={d}>
            <th scope="row">{d}</th>
            {yards.map((y) => {
              const c = at2.get(`${y}:${d}`);
              if (!c) return <td key={y} />;
              return (
                <td key={y} className={`gm-opt-${c.approved}${c.coachsCall ? ' gm-call' : ''}`} title={cellText(c)} aria-label={cellText(c)} data-mark={c.mark}>
                  {at(`analytics.chart.option.${c.approved}`)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TwoPointGrid({ rows }: { rows: TwoPointRow[] }) {
  const secs = [...new Set(rows.map((r) => r.gameSecondsLeft))].sort((a, b) => b - a);
  const diffs = [...new Set(rows.map((r) => r.scoreDiffBeforeTry))].sort((a, b) => a - b);
  const m = new Map(rows.map((r) => [`${r.scoreDiffBeforeTry}:${r.gameSecondsLeft}`, r]));
  const clock = (s: number) => at('analytics.two.time', { m: Math.floor(s / 60), s: String(s % 60).padStart(2, '0') });
  return (
    <table className="gm-table" data-view="two_point">
      <caption>{at('analytics.two.caption')}</caption>
      <thead><tr><th scope="col">{at('analytics.two.diff')}</th>{secs.map((s) => <th key={s} scope="col">{clock(s)}</th>)}</tr></thead>
      <tbody>
        {diffs.map((d) => (
          <tr key={d}>
            <th scope="row">{fx(d, 0)}</th>
            {secs.map((s) => {
              const r = m.get(`${d}:${s}`);
              return <td key={s} className={r?.coachsCall ? 'gm-call' : undefined}>{r ? at(r.choice === 'two' ? 'analytics.two.two' : 'analytics.two.kick') : ''}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const waiting = () => <p className="gm-line">{at('analytics.waiting')}</p>;
const hidden = () => <p className="gm-line">{at('analytics.hidden')}</p>;

function body(tab: AnalyticsTab, data: AnalyticsData, onOpenGames?: (teamId: number) => void): ReactNode {
  switch (tab) {
    case 'strength':
      return data.strength ? <StrengthView data={data.strength} onOpenGames={onOpenGames} /> : waiting();
    case 'chart':
    case 'two_point': {
      const c = data.chart;
      if (!c) return waiting();
      if (!c.visible) return hidden();
      const ch = c.chart;
      const delivery = <p className="gm-line" data-delivery={ch.delivery}>{at(`analytics.delivery.${ch.delivery}`)}</p>;
      if (tab === 'two_point') return <>{delivery}{ch.twoPoint && <TwoPointGrid rows={ch.twoPoint} />}</>;
      return (
        <>
          {delivery}
          {ch.cells && <ChartGrid cells={ch.cells} />}
          {ch.edits.length > 0 && (
            <section aria-label={at('analytics.chart.edits')}>
              <h2>{at('analytics.chart.edits')}</h2>
              <ul>{ch.edits.map((e) => <li key={e.id}>{at('analytics.chart.edit', { option: at(`analytics.chart.optionName.${e.option}` as `analytics.chart.optionName.${FourthOption}`), offset: fx(e.offsetWp * 100), reason: e.reason })}</li>)}</ul>
            </section>
          )}
        </>
      );
    }
    case 'tracking': {
      const t = data.tracking;
      if (!t) return waiting();
      if (!t.visible) return hidden();
      const r = t.report;
      if (!r.practice) return <p className="gm-line" data-delivery="not_available">{at('analytics.tracking.none')}</p>;
      return (
        <>
          {!r.games && <p className="gm-line">{at('analytics.tracking.practiceOnly')}</p>}
          <table className="gm-table" data-view="tracking">
            <caption>{at('analytics.tracking.caption')}</caption>
            <thead>
              <tr>
                {['player', 'yesterday', 'ratio', 'flag', ...(r.games ? ['top', 'distance', 'sprints'] : [])].map((k) => <th key={k} scope="col">{at(`analytics.tracking.${k}`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((p) => (
                <tr key={p.personId} data-flag={p.flag ?? 'none'}>
                  <th scope="row">{p.name}{p.checkOnHim && <span className="gm-note"> {at('analytics.tracking.check')}</span>}</th>
                  <td>{p.yesterdayYd.toFixed(0)}</td>
                  <td>{p.ratio === null ? at('analytics.tracking.noBase') : p.ratio.toFixed(2) + (p.fromReturnPlan ? at('analytics.tracking.returnPlan') : '')}</td>
                  <td>{p.flag ? at(`analytics.tracking.flag.${p.flag}`) : ''}</td>
                  {r.games && <td>{p.game ? p.game.topSpeedYdS.toFixed(1) : ''}</td>}
                  {r.games && <td>{p.game ? p.game.distanceYd.toFixed(0) : ''}</td>}
                  {r.games && <td>{p.game ? p.game.sprints : ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
    }
    case 'staff': {
      const a = data.access;
      if (!a) return waiting();
      if (!a.visible) return hidden();
      return (
        <table className="gm-table" data-view="staff">
          <caption>{at('analytics.staff.caption', { n: a.plan.analysts })}</caption>
          <thead><tr>{['report', 'hours', 'delivery'].map((k) => <th key={k} scope="col">{at(`analytics.staff.${k}`)}</th>)}</tr></thead>
          <tbody>
            {a.plan.reports.map((p) => (
              <tr key={p.report} data-delivery={p.delivery}>
                <th scope="row">{at(`analytics.report.${p.report}`)}</th>
                <td>{p.hours}</td>
                <td>{at(`analytics.delivery.${p.delivery}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'limits':
      return <ul data-view="limits">{LIMITS_NOTE_IDS.map((id) => <li key={id}>{at(id)}</li>)}</ul>;
  }
}

export interface AnalyticsScreenProps {
  tab: AnalyticsTab;
  data: AnalyticsData;
  onTab(tab: AnalyticsTab): void;
  /** Opens the games behind a team's strength in the film viewer (N2.6.1 what the user sees). */
  onOpenGames?(teamId: number): void;
}

export function AnalyticsScreen({ tab, data, onTab, onOpenGames }: AnalyticsScreenProps) {
  return (
    <div className="gm-analytics" data-tab={tab}>
      <div role="tablist" aria-label={at('analytics.tabs')}>
        {ANALYTICS_TABS.map((k) => (
          <button key={k} type="button" role="tab" id={`gm-analytics-tab-${k}`} aria-selected={k === tab} aria-controls="gm-analytics-panel" onClick={() => onTab(k)}>
            {at(`analytics.tab.${k}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="gm-analytics-panel" aria-labelledby={`gm-analytics-tab-${tab}`}>{body(tab, data, onOpenGames)}</div>
    </div>
  );
}

export function parseTab(v: string | undefined): AnalyticsTab {
  return (ANALYTICS_TABS as readonly string[]).includes(v ?? '') ? (v as AnalyticsTab) : 'strength';
}
