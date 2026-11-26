// The coach's own screens (O4.6.1 to O4.6.3, O7.6.1): career and ladder, job market, contract, record,
// money and life. Each draws a read model and turns presses into intents; nothing here computes a value.
// No skills tab, radar, progress bar or level number (O4.6.1); reputation and state are words with reasons.
import type { ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { ct, money, words } from './text.ts';
import type { CareerView, ContractView, FinanceView, JobMarketView, LifeView, RecordView } from './types.ts';

export type Intent = { command: string; target?: string | number; value?: string };
type OnIntent = ((i: Intent) => void) | undefined;

const box = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };
const H2 = ({ children }: { children: ReactNode }) => <h2 style={{ fontSize: '1rem' }}>{children}</h2>;

/** A control that runs a command: rendered only when the seat holds the right (O7.1.1, Q1.5.3 crawl). */
function Act({ rights, command, label, onIntent, target, value }: { rights: readonly string[]; command: string; label: string; onIntent: OnIntent; target?: string | number; value?: string }) {
  if (!rights.includes(command)) return null;
  return <button type="button" data-command={command} onClick={() => onIntent?.({ command, target, value })}>{label}</button>;
}

function Tabs<T extends string>({ tabs, tab, onTab }: { tabs: readonly T[]; tab: T; onTab(t: T): void }) {
  return (
    <div role="tablist" className="gm-tabs">
      {tabs.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => onTab(t)}>{ct(`tab.${t}`)}</button>)}
    </div>
  );
}

// ---------- coach.career ----------

export const CAREER_TABS = ['career', 'history', 'tree', 'reputation'] as const;
export type CareerTab = (typeof CAREER_TABS)[number];
export const parseCareerTab = (s: string | undefined): CareerTab => ((CAREER_TABS as readonly string[]).includes(s ?? '') ? (s as CareerTab) : 'career');

export function CareerScreen({ view, tab, onTab, onIntent }: { view: CareerView; tab: CareerTab; onTab(t: CareerTab): void; onIntent?: OnIntent }): ReactNode {
  return (
    <section className="gm-career">
      <p className="gm-line">{view.name} · {ct('career.now', { job: view.jobTitle, level: view.level })}</p>
      <Tabs tabs={CAREER_TABS} tab={tab} onTab={onTab} />
      {tab === 'career' ? (
        <div>
          <H2>{ct('career.ladder')}</H2>
          {(['college', 'pro'] as const).map((lvl) => (
            <div key={lvl} style={box} aria-label={ct(`career.level.${lvl}`)}>
              <strong>{ct(`career.level.${lvl}`)}</strong>
              <ol reversed>
                {[...view.ladder[lvl]].sort((a, b) => b.rung - a.rung).map((r) => (
                  <li key={`${lvl}-${r.rung}-${r.title}`} data-rung={r.rung} aria-current={r.current ? 'true' : undefined} style={{ fontWeight: r.current ? 700 : 400 }}>
                    {r.title}{r.current ? ` · ${ct('career.here')}` : r.held ? ` · ${ct('career.held')}` : ''}
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {view.enrolment ? <p>{view.enrolment.line}</p> : null}
          <Act rights={view.rights} command="career.export" label={ct('career.export')} onIntent={onIntent} />
        </div>
      ) : null}
      {tab === 'history' ? (
        view.history.length === 0 ? <p>{ct('career.noHistory')}</p> : (
          <ol>{view.history.map((s, i) => <li key={i}>{s.endSeason === null ? ct('career.since', { from: s.season }) : ct('career.until', { from: s.season, to: s.endSeason })}: {s.jobTitle}, {s.team} ({s.level}) · {words(s.how)}</li>)}</ol>
        )
      ) : null}
      {tab === 'tree' ? (
        view.network.length === 0 ? <p>{ct('career.noNetwork')}</p> : (
          <ul>{view.network.map((p, i) => <li key={i}>{p.name}{p.imported ? ` (${ct('career.imported')})` : ''}: {p.together} · {p.nowJob}, {p.nowTeam}</li>)}</ul>
        )
      ) : null}
      {tab === 'reputation' ? (
        view.reputation.length === 0 ? <p>{ct('career.noReputation')}</p> : (
          <dl>{view.reputation.map((r) => [<dt key={`t${r.group}`}>{words(r.group)}: {r.word}</dt>, <dd key={`d${r.group}`}>{r.reasons.join('; ') || ct('career.noReputation')}</dd>])}</dl>
        )
      ) : null}
    </section>
  );
}

// ---------- coach.job_market ----------

export function JobMarketScreen({ view, onIntent }: { view: JobMarketView; onIntent?: OnIntent }): ReactNode {
  return (
    <section className="gm-market">
      <p className="gm-line" data-window={view.windowOpen ? 'open' : 'closed'}>{ct('market.window')}: {view.windowLine}</p>
      <H2>{ct('market.openings')}</H2>
      {view.openings.length === 0 ? <p>{ct('market.none')}</p> : (
        <table>
          <tbody>
            {view.openings.map((o) => (
              <tr key={o.id} data-opening={o.id}>
                <td>{o.title}</td><td>{o.team}</td><td>{o.level}</td><td>{words(o.side)}</td><td>{o.region}</td>
                <td>{ct('market.pay')}: {o.payCents === null ? ct('market.unknownPay') : money(o.payCents)}</td>
                <td>{words(o.party)} · {words(o.reason)} · {words(o.stage)}</td><td>{ct(`fit.${o.fit}`)}</td>
                <td>{o.applied ? ct('market.applied') : view.windowOpen ? <Act rights={view.rights} command="market.apply" label={ct('market.apply')} onIntent={onIntent} target={o.id} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <H2>{ct('market.applications')}</H2>
      {view.applications.length === 0 ? <p>{ct('market.noApplications')}</p> : (
        <ul>{view.applications.map((a) => <li key={a.openingId}>{view.openings.find((o) => o.id === a.openingId)?.title ?? a.openingId} · {words(a.route)} · {a.date} · {a.response ? ct('market.response', { text: a.response }) : ct('market.noResponse')}</li>)}</ul>
      )}
      <H2>{ct('market.interviews')}</H2>
      {view.interviews.length === 0 ? <p>{ct('market.noInterviews')}</p> : (
        <ul>{view.interviews.map((x) => <li key={x.openingId}>{x.date} · {x.with} · {words(x.stage)}</li>)}</ul>
      )}
      <H2>{ct('market.offers')}</H2>
      {view.offers.length === 0 ? <p>{ct('market.noOffers')}</p> : view.offers.map((o) => (
        <div key={o.offerId} style={box} data-offer={o.offerId}>
          <strong>{o.title}, {o.team} ({o.level})</strong>
          <p>{money(o.salaryCents)} · {ct('market.years', { years: o.years })} · {ct(o.callsPlays ? 'market.calls' : 'market.noCalls')} · {ct(`security.${o.staffSecurityKey}`)}</p>
          {o.bossReportKeys.length ? <p>{o.bossReportKeys.map(words).join('; ')}</p> : null}
          {o.whatChanges.length ? <><p>{ct('market.whatChanges')}</p><ul>{o.whatChanges.map((w) => <li key={w}>{words(w.replace(/^market\.change\./, ''))}</li>)}</ul></> : null}
          {o.offsetNote ? <p>{ct('market.offset')}</p> : null}
          <p>{ct('market.deadline', { date: o.deadline })} · {words(o.state)}</p>
          {o.state === 'live' ? <>
            <Act rights={view.rights} command="market.answer_offer" label={ct('market.accept')} onIntent={onIntent} target={o.offerId} value="accept" />{' '}
            <Act rights={view.rights} command="market.answer_offer" label={ct('market.decline')} onIntent={onIntent} target={o.offerId} value="decline" />
          </> : null}
        </div>
      ))}
      <H2>{ct('market.signs')}</H2>
      {view.signs.length === 0 ? <p>{ct('market.noSigns')}</p> : <ul>{view.signs.map((s, i) => <li key={i}>{s.date}: {words(s.sign)} ({s.source})</li>)}</ul>}
      {view.yearOut ? <>
        <H2>{ct('market.yearOut')}</H2>
        <ul>{view.yearOut.map((y) => <li key={y.id}>{words(y.id)} · {ct('perWeek', { hours: y.weeklyHours })} · {ct(y.onField ? 'onField' : 'offField')} <Act rights={view.rights} command="market.year_out" label={ct('market.choose')} onIntent={onIntent} value={y.id} /></li>)}</ul>
      </> : null}
    </section>
  );
}

// ---------- coach.contract ----------

export function ContractScreen({ view }: { view: ContractView }): ReactNode {
  if (view.team === null) return <section className="gm-contract"><p>{ct('contract.none')}</p></section>;
  return (
    <section className="gm-contract">
      <p className="gm-line">{view.jobTitle}, {view.team}{view.yearsLeft !== null ? ` · ${ct('contract.yearsLeft', { years: view.yearsLeft })}` : ''}</p>
      <dl>{view.terms.map((t) => [<dt key={`t${t.label}`}>{t.label}</dt>, <dd key={`d${t.label}`}>{t.value}</dd>])}</dl>
      {view.clauses.length ? <><H2>{ct('contract.clauses')}</H2><ul>{view.clauses.map((c) => <li key={c}>{c}</li>)}</ul></> : null}
    </section>
  );
}

// ---------- coach.record ----------

export function RecordScreen({ view, onIntent }: { view: RecordView; onIntent?: OnIntent }): ReactNode {
  const tot = view.seasons.reduce((a, s) => ({ w: a.w + s.wins, l: a.l + s.losses, t: a.t + s.ties }), { w: 0, l: 0, t: 0 });
  const rec = (w: number, l: number, t: number) => (t ? `${w}-${l}-${t}` : `${w}-${l}`);
  return (
    <section className="gm-record">
      <H2>{ct('record.seasons')}</H2>
      {view.seasons.length === 0 ? <p>{ct('record.none')}</p> : (
        <table>
          <thead><tr><th>{ct('record.season')}</th><th>{ct('record.team')}</th><th>{ct('record.job')}</th><th>{ct('record.result')}</th><th>{ct('record.finish')}</th></tr></thead>
          <tbody>
            {view.seasons.map((s) => <tr key={`${s.season}-${s.team}`}><td>{s.season}</td><td>{s.team}</td><td>{s.jobTitle}</td><td>{rec(s.wins, s.losses, s.ties)}</td><td>{s.finish}</td></tr>)}
            <tr data-total="career"><td>{ct('record.career')}</td><td /><td /><td>{rec(tot.w, tot.l, tot.t)}</td><td /></tr>
          </tbody>
        </table>
      )}
      <H2>{ct('record.demonstrated')}</H2>
      {view.families.map((f) => <div key={f.family} style={box}><strong>{words(f.family)}</strong>{f.lines.length ? <ul>{f.lines.map((l) => <li key={l}>{l}</li>)}</ul> : <p>{ct('record.none')}</p>}</div>)}
      <H2>{ct('record.certified')}</H2>
      {view.certified.length === 0 ? <p>{ct('record.none')}</p> : <ul>{view.certified.map((c) => <li key={c.season}>{c.season}: {c.result}</li>)}</ul>}
      <Act rights={view.rights} command="career.export" label={ct('career.export')} onIntent={onIntent} />
    </section>
  );
}

// ---------- coach.finance ----------

export function FinanceScreen({ view, onIntent }: { view: FinanceView; onIntent?: OnIntent }): ReactNode {
  const m = (c: number) => money(c, view.currency);
  const list = (title: string, rows: readonly { label: string; cents: number }[]) => (
    <div style={box}><H2>{title}</H2><ul>{rows.map((r) => <li key={r.label}>{r.label}: {m(r.cents)}</li>)}</ul></div>
  );
  const nw = view.netWorth;
  const lo = Math.min(0, ...nw.map((p) => p.cents)), hi = Math.max(1, ...nw.map((p) => p.cents));
  const pts = nw.map((p, i) => `${nw.length > 1 ? (i * 300) / (nw.length - 1) : 0},${80 - ((p.cents - lo) * 80) / (hi - lo)}`).join(' ');
  return (
    <section className="gm-finance">
      <H2>{ct('finance.netWorth')}</H2>
      <p>{nw.length ? m(nw[nw.length - 1]!.cents) : m(0)}</p>
      <svg role="img" aria-label={ct('finance.netWorth')} viewBox="0 0 300 80" width="300" height="80"><polyline points={pts} fill="none" stroke={v('text.ink')} strokeWidth="2" /></svg>
      <p>{view.projection ? ct('finance.projection', { years: view.projection.years, low: m(view.projection.range.lowCents), mid: m(view.projection.range.midCents), high: m(view.projection.range.highCents) }) : ct('finance.noProjection')}</p>
      {list(ct('finance.income'), view.income.map((r) => ({ label: words(r.source), cents: r.cents })))}
      {list(ct('finance.taxes'), view.taxes.map((r) => ({ label: r.place, cents: r.cents })))}
      {list(ct('finance.spending'), view.spending.map((r) => ({ label: words(r.item), cents: r.cents })))}
      <div style={box}><H2>{ct('finance.holdings')}</H2><ul>{view.holdings.map((x) => <li key={x.name}>{x.name} · {words(x.risk)} · {m(x.valueCents)} · {ct('finance.return', { pct: x.returnPct.toFixed(1) })}</li>)}</ul></div>
      <div style={box}><H2>{ct('finance.advisers')}</H2><ul>{view.advisers.map((x) => <li key={x.name}>{x.name}: {x.feeLine}</li>)}</ul></div>
      <div style={box}><H2>{ct('finance.offers')}</H2>
        {view.offers.length === 0 ? <p>{ct('finance.noOffers')}</p> : <ul>{view.offers.map((o) => <li key={o.id}>{words(o.kind)}: {o.terms} · {o.deadline} <Act rights={view.rights} command="finance.answer_offer" label={ct('finance.answer')} onIntent={onIntent} target={o.id} /></li>)}</ul>}
      </div>
      <div style={box}><H2>{ct('finance.plan')}</H2>
        <p>{ct('finance.savingRate', { pct: view.plan.savingRatePct })} · {ct('finance.risk', { risk: words(view.plan.risk) })}</p>
        <Act rights={view.rights} command="finance.plan" label={ct('finance.change')} onIntent={onIntent} />
      </div>
    </section>
  );
}

// ---------- coach.life ----------

export function LifeScreen({ view, onIntent }: { view: LifeView; onIntent?: OnIntent }): ReactNode {
  const used = view.hours.reduce((s, r) => s + r.hours, 0);
  return (
    <section className="gm-life">
      <H2>{ct('life.hours')}</H2>
      <p>{view.week} · {ct('life.available', { used: Math.round(used * 10) / 10, available: view.hoursAvailable })}</p>
      <ul>{view.hours.map((r) => <li key={r.task}>{words(r.task)}: {r.hours} h</li>)}</ul>
      <p>{ct('life.sleep')}: {view.sleep.word}, {ct(`trend.${view.sleep.trend}`)} · {ct('life.energy')}: {view.energy.word}, {ct(`trend.${view.energy.trend}`)}</p>
      <div style={box}><H2>{ct('life.effects')}</H2>{view.effects.length === 0 ? <p>{ct('life.noEffects')}</p> : <ul>{view.effects.map((e) => <li key={e.id} data-effect={e.id}>{e.line}</li>)}</ul>}</div>
      <div style={box}><H2>{ct('life.health')}</H2>{view.health.length === 0 ? <p>{ct('life.noHealth')}</p> : <ul>{view.health.map((x) => <li key={x}>{x}</li>)}</ul>}</div>
      <div style={box}><H2>{ct('life.family')}</H2>{view.family.length === 0 ? <p>{ct('life.noFamily')}</p> : <ul>{view.family.map((f, i) => <li key={i}>{f.date}: {f.event}{f.owed ? ` · ${ct('life.owed', { what: f.owed })}` : ''}</li>)}</ul>}</div>
      <div style={box}><H2>{ct('life.template')}</H2><ul>{view.template.map((r) => <li key={r.task}>{words(r.task)}: {r.hours} h</li>)}</ul>
        <Act rights={view.rights} command="life.template" label={ct('life.changeTemplate')} onIntent={onIntent} />
      </div>
    </section>
  );
}
