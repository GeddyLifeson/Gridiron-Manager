// The new-game flow (Marlon 2026-11-26; X10.1, X10.3, E1.7): your coach, how long the world's past runs
// (a few seasons up to the full span since 1869), the past played with progress, a look over it in the
// legends browser, rerun with a new seed as often as wanted, then the coach checked against the world and
// the career started in the modern day. The screen holds no football logic: every answer comes from the
// app-services new-game client, which runs the history in a worker.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { newgame } from '@gm/app-services';
import { LegendsScreen, type LegendsData, type LegendsTab, type Link } from '../legends/index.ts';
import { duration, nt, words } from './text.ts';

type Size = 'small' | 'standard' | 'full';
type Step = 'coach' | 'world' | 'running' | 'review' | 'confirm';

export interface NewGameFlowProps {
  client: newgame.NewGameClient;
  /** The season the career starts in (the modern day). */
  careerStartYear: number;
  /** Fresh entropy for a world seed, drawn by the shell (J13.4.1: never in core). */
  randomSeedHex(): string;
  /** Called once the coach is confirmed: the start record and the generated world. */
  onStart(start: newgame.CareerStart, world: newgame.StartedWorld): void;
  /** Wall clock in ms for the elapsed and time-left lines (shell supplied). */
  now?: () => number;
  benchmarkRatio?: number;
  /** The save name the field starts with (the host passes a free one); default career-1. */
  initialSaveName?: string;
}

const box: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 8, padding: 16, margin: '12px 0', background: 'var(--panel)' };
const row: React.CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' };
const STEPS: Step[] = ['coach', 'world', 'running', 'review', 'confirm'];

function Steps({ at }: { at: Step }) {
  return (
    <ol aria-label={nt('title')} style={{ display: 'flex', gap: 16, listStyle: 'none', padding: 0, flexWrap: 'wrap' }}>
      {STEPS.map((s, i) => <li key={s} aria-current={s === at ? 'step' : undefined} style={{ fontWeight: s === at ? 700 : 400, color: s === at ? 'var(--text)' : 'var(--muted)' }}>{i + 1}. {nt(`step.${s}`)}</li>)}
    </ol>
  );
}

export function NewGameFlow({ client, careerStartYear, randomSeedHex, onStart, now = () => 0, benchmarkRatio = 1, initialSaveName = 'career-1' }: NewGameFlowProps): ReactNode {
  const [step, setStep] = useState<Step>('coach');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Coach
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [level, setLevel] = useState<'college' | 'pro'>('college');
  const [way, setWay] = useState<'origin' | 'preset'>('origin');
  const [originId, setOriginId] = useState(newgame.coachCards.origins[0]!.id);
  const [presetId, setPresetId] = useState(newgame.coachCards.presets[0]!.id);
  const [saveName, setSaveName] = useState(initialSaveName);
  const coachSeed = useMemo(() => parseInt(randomSeedHex().slice(0, 8), 16), [randomSeedHex]);

  // World
  const [choices, setChoices] = useState<newgame.HistoryChoice[]>([]);
  const [seasons, setSeasons] = useState(0);
  const [seed, setSeed] = useState(() => randomSeedHex());
  const [size, setSize] = useState<Size>('small');
  const [est, setEst] = useState<newgame.Estimate | null>(null);

  // Run and review
  const [rerun, setRerun] = useState(0);
  const [progress, setProgress] = useState<newgame.Progress | null>(null);
  const [review, setReview] = useState<newgame.DraftReview | null>(null);
  const [tab, setTab] = useState<'seasons' | 'teams' | 'coaches' | 'hall' | 'legends'>('seasons');
  const [legendsTab, setLegendsTab] = useState<LegendsTab>('search');
  const [legends, setLegends] = useState<newgame.DraftLegendsData | null>(null);
  const runStarted = useRef(0);

  // Confirm
  const [options, setOptions] = useState<newgame.CoachOptions | null>(null);
  const [firstTeamId, setFirstTeamId] = useState<number | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [validation, setValidation] = useState<newgame.CreationValidation | null>(null);

  useEffect(() => {
    void client.choices(careerStartYear).then((c) => { setChoices(c); setSeasons((s) => s || (c.find((x) => x.seasons > 0)?.seasons ?? 0)); });
  }, [client, careerStartYear]);

  const choice: newgame.WorldChoice = { seedHex: seed, size, historySeasons: seasons, careerStartYear };
  useEffect(() => {
    if (step !== 'world' || !/^[0-9a-f]{16}$/.test(seed)) return;
    let live = true;
    void client.estimate(choice, benchmarkRatio).then((e) => { if (live) setEst(e); }).catch(() => {});
    return () => { live = false; };
  }, [client, step, seed, size, seasons, careerStartYear, benchmarkRatio]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (e: unknown) => { setError(nt('error', { message: e instanceof Error ? e.message : String(e) })); setBusy(false); };

  const coachChoices = (): newgame.CreationChoices => {
    const base = way === 'origin'
      ? newgame.coachCards.fromOrigin(originId, level, coachSeed)
      : newgame.coachCards.fromPreset(presetId, coachSeed, firstTeamId, openOnly);
    return { ...base, level: way === 'origin' ? level : base.level, name: { first: first.trim() || base.name.first, last: last.trim() || base.name.last }, firstTeamId: firstTeamId ?? base.firstTeamId, openJobsOnly: openOnly };
  };

  const play = async (n: number) => {
    setError(''); setStep('running'); setProgress(null); setReview(null); setLegends(null); setRerun(n);
    runStarted.current = now();
    try {
      const r = await client.run(choice, n, setProgress);
      setReview(r); setStep('review'); setTab('seasons');
    } catch (e) {
      if (e instanceof Error && e.message === 'cancelled') { setStep('world'); return; }
      fail(e); setStep('world');
    }
  };

  const openLegends = async (q: newgame.DraftLegendsQuery, t: LegendsTab) => {
    try { setLegends(await client.legends(q)); setLegendsTab(t); } catch (e) { fail(e); }
  };

  const toConfirm = async () => {
    setError(''); setBusy(true);
    try {
      const o = await client.coachOptions();
      setOptions(o);
      const c = coachChoices();
      if (newgame.coachCards.needsFirstTeam(c) && firstTeamId === null) {
        const pick = o.teams.find((t) => t.level === c.level && t.vacant) ?? o.teams.find((t) => t.level === c.level) ?? null;
        setFirstTeamId(pick?.id ?? null);
        setOpenOnly(Boolean(pick?.vacant));
      }
      setStep('confirm'); setBusy(false);
    } catch (e) { fail(e); }
  };

  const choicesKey = JSON.stringify(step === 'confirm' ? coachChoices() : null);
  useEffect(() => {
    if (step !== 'confirm') return;
    let live = true;
    void client.validateCoach(coachChoices()).then((v) => { if (live) setValidation(v); }).catch(fail);
    return () => { live = false; };
  }, [client, step, choicesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setError(''); setBusy(true);
    try {
      const r = await client.start(coachChoices(), saveName);
      if (!r.ok) { setValidation((v) => (v ? { ...v, problems: r.problems, notices: r.notices } : v)); setBusy(false); return; }
      setBusy(false);
      onStart(r.start, r.world);
    } catch (e) { fail(e); }
  };

  const lengthLabel = (c: newgame.HistoryChoice) => (c.seasons === 0 ? nt('world.length.none', { year: careerStartYear })
    : c.full ? nt('world.length.full', { n: c.seasons, from: c.firstSeasonYear }) : nt('world.length.seasons', { n: c.seasons, from: c.firstSeasonYear }));

  return (
    <section style={box} aria-label={nt('title')} data-testid="new-game">
      <h2 style={{ fontSize: 17 }}>{nt('title')}</h2>
      <Steps at={step} />

      {step === 'coach' && (
        <div data-testid="ng-coach">
          <p style={{ color: 'var(--muted)' }}>{nt('coach.lead')}</p>
          <div style={row}>
            <label>{nt('coach.first')} <input value={first} onChange={(e) => setFirst(e.target.value)} /></label>
            <label>{nt('coach.last')} <input value={last} onChange={(e) => setLast(e.target.value)} /></label>
            <label>{nt('coach.save')} <input value={saveName} onChange={(e) => setSaveName(e.target.value.replace(/[^\w-]/g, ''))} /></label>
          </div>
          <fieldset style={row}>
            <legend>{nt('coach.way')}</legend>
            <label><input type="radio" name="ng-way" checked={way === 'origin'} onChange={() => setWay('origin')} /> {nt('coach.way.origin')}</label>
            <label><input type="radio" name="ng-way" checked={way === 'preset'} onChange={() => setWay('preset')} /> {nt('coach.way.preset')}</label>
          </fieldset>
          {way === 'origin' ? (
            <div style={row}>
              <label>{nt('coach.level')} <select value={level} onChange={(e) => setLevel(e.target.value as 'college' | 'pro')}>
                <option value="college">{nt('coach.level.college')}</option><option value="pro">{nt('coach.level.pro')}</option>
              </select></label>
              <label>{nt('coach.origin')} <select value={originId} onChange={(e) => setOriginId(e.target.value)}>
                {newgame.coachCards.origins.map((o) => <option key={o.id} value={o.id}>{words(o.id)} (age {o.ageMin === o.ageMax ? o.ageMin : `${o.ageMin}-${o.ageMax}`})</option>)}
              </select></label>
            </div>
          ) : (
            <div style={row}>
              <label>{nt('coach.preset')} <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                {newgame.coachCards.presets.map((p) => <option key={p.id} value={p.id}>{words(p.id)} ({p.level}, {words(p.start)}, age {p.age})</option>)}
              </select></label>
            </div>
          )}
          <button onClick={() => setStep('world')} disabled={!saveName}>{nt('coach.next')}</button>
        </div>
      )}

      {step === 'world' && (
        <div data-testid="ng-world">
          <p style={{ color: 'var(--muted)' }}>{nt('world.lead')}</p>
          <fieldset>
            <legend>{nt('world.length')}</legend>
            {choices.map((c) => (
              <div key={c.seasons}><label><input type="radio" name="ng-length" checked={seasons === c.seasons} onChange={() => setSeasons(c.seasons)} /> {lengthLabel(c)}</label></div>
            ))}
            <label>{nt('world.length.custom')} <input type="number" min={0} max={choices.at(-1)?.seasons ?? 0} value={seasons} style={{ width: 80 }}
              onChange={(e) => setSeasons(Math.max(0, Math.min(choices.at(-1)?.seasons ?? 0, Math.floor(Number(e.target.value) || 0))))} data-testid="ng-seasons" /></label>
          </fieldset>
          <div style={row}>
            <label>{nt('world.seed')} <input value={seed} style={{ fontFamily: 'monospace' }} onChange={(e) => setSeed(e.target.value.replace(/[^0-9a-f]/gi, '').slice(0, 16).toLowerCase())} /></label>
            <button onClick={() => setSeed(randomSeedHex())}>{nt('world.seed.random')}</button>
            <label>{nt('world.size')} <select value={size} onChange={(e) => setSize(e.target.value as Size)}>
              {(['small', 'standard', 'full'] as const).map((s) => <option key={s} value={s}>{nt(`world.size.${s}`)}</option>)}
            </select></label>
          </div>
          {est && <p data-testid="ng-estimate">{nt('world.estimate', { time: duration(est.seconds) })}{est.provisional ? ` ${nt('world.estimate.provisional')}` : ''}</p>}
          <div style={row}>
            <button onClick={() => setStep('coach')}>{nt('world.back')}</button>
            <button onClick={() => void play(0)} disabled={seed.length !== 16}>{nt('world.go')}</button>
          </div>
        </div>
      )}

      {step === 'running' && (
        <div data-testid="ng-running" aria-live="polite">
          {progress ? (
            <>
              <p>{progress.week >= 0 ? nt('run.week', { season: progress.seasonYear, week: progress.week + 1, done: progress.done, of: progress.of }) : nt('run.season', { season: progress.seasonYear, done: progress.done, of: progress.of })} {nt('run.games', { n: progress.gamesPlayed })}</p>
              <progress max={progress.of} value={progress.done} style={{ width: '100%' }} />
              {progress.seedStep > 0 && <p>{nt('run.retry')}</p>}
              {progress.champions.length > 0 && <p>{nt('run.champions')}: {progress.champions.map((c) => `${c.team} (${c.competition})`).join(', ')}</p>}
              <p>{nt('run.teams', { n: progress.teamsActive })} · {nt('run.people', { n: progress.people })} · {nt('run.hall', { n: progress.hallMembers })}</p>
              <p style={{ color: 'var(--muted)' }}>
                {nt('run.elapsed', { time: duration((now() - runStarted.current) / 1000) })}
                {progress.done > 0 && progress.done < progress.of ? ` · ${nt('run.left', { time: duration(((now() - runStarted.current) / 1000 / progress.done) * (progress.of - progress.done)) })}` : ''}
              </p>
            </>
          ) : <p>{nt('busy')}</p>}
          <button onClick={() => client.cancel()}>{nt('run.cancel')}</button>
        </div>
      )}

      {step === 'review' && review && (
        <div data-testid="ng-review">
          <p>{nt('review.lead', { code: review.worldCode, seed: review.seedHex, rerun: review.rerun })}</p>
          <p>{nt('review.span', { from: review.firstSeasonYear, to: review.careerStartYear - 1, n: review.seasonsRun })} {nt('review.people', review.people)}</p>
          {review.failedTwice && <p role="alert">{nt('review.failed', { failures: review.validation.failures.join('; ') })}</p>}
          {review.unbound.length > 0 && <p style={{ color: 'var(--muted)' }}>{nt('review.unbound', { steps: review.unbound.map((u) => words(u.step)).join(', ') })}</p>}
          <div role="tablist" style={row}>
            {(['seasons', 'teams', 'coaches', 'hall', 'legends'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); if (t === 'legends' && !legends) void openLegends({ search: '' }, 'search'); }}>{nt(`review.tab.${t}`)}</button>
            ))}
          </div>
          {tab === 'seasons' && (
            <table data-testid="ng-seasons-table"><thead><tr><th align="left">{nt('review.col.season')}</th><th align="left">{nt('review.col.champions')}</th></tr></thead>
              <tbody>{review.seasons.map((s) => <tr key={s.seasonYear}><td>{s.seasonYear}</td><td>{s.champions.map((c) => (
                <button key={c.teamId} className="gm-link" onClick={() => { setTab('legends'); void openLegends({ link: { kind: 'team', id: c.teamId } }, 'page'); }}>{c.team} ({c.competition})</button>
              ))}</td></tr>)}</tbody></table>
          )}
          {tab === 'teams' && (
            <table><thead><tr><th align="left">{nt('review.col.team')}</th><th align="left">{nt('review.col.competition')}</th><th>{nt('review.col.founded')}</th><th>{nt('review.col.folded')}</th><th>{nt('review.col.titles')}</th><th>{nt('review.col.record')}</th></tr></thead>
              <tbody>{review.teams.map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.competition}</td><td align="center">{t.founded}</td><td align="center">{t.folded ?? ''}</td><td align="center">{t.titles}</td><td align="center">{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ''}</td></tr>)}</tbody></table>
          )}
          {tab === 'coaches' && (
            <table><thead><tr><th align="left">{nt('review.col.coach')}</th><th>{nt('review.col.seasons')}</th><th>{nt('review.col.titles')}</th><th align="left">{nt('review.col.teams')}</th></tr></thead>
              <tbody>{review.coaches.map((c) => <tr key={c.personId}><td><button className="gm-link" onClick={() => { setTab('legends'); void openLegends({ link: { kind: 'person', id: c.personId } }, 'page'); }}>{c.name}</button></td><td align="center">{c.headSeasons}</td><td align="center">{c.titles}</td><td>{c.teams.join(', ')}</td></tr>)}</tbody></table>
          )}
          {tab === 'hall' && (review.hall.length === 0 ? <p>{nt('review.hall.none')}</p> : (
            <table><thead><tr><th align="left">{nt('review.col.coach')}</th><th>{nt('review.col.hall')}</th><th>{nt('review.col.kind')}</th><th>{nt('review.col.class')}</th></tr></thead>
              <tbody>{review.hall.map((h) => <tr key={`${h.hall}:${h.personId}`}><td>{h.name}</td><td>{words(h.hall)}</td><td>{h.kind}</td><td>{h.season}</td></tr>)}</tbody></table>
          ))}
          {tab === 'legends' && legends && (
            <LegendsScreen tab={legendsTab} data={legends as unknown as LegendsData}
              onTab={(t) => setLegendsTab(t)}
              onOpen={(l: Link) => void openLegends({ link: { kind: l.kind, id: l.id } }, 'page')}
              onSearch={(text) => void openLegends({ search: text }, 'search')} />
          )}
          <div style={row}>
            <button onClick={() => void play(rerun + 1)}>{nt('review.rerun')}</button>
            <button onClick={() => setStep('world')}>{nt('review.change')}</button>
            <button onClick={() => void toConfirm()} disabled={busy}>{nt('review.keep')}</button>
          </div>
        </div>
      )}

      {step === 'confirm' && options && (
        <div data-testid="ng-confirm">
          <p>{nt('confirm.lead')}</p>
          {newgame.coachCards.needsFirstTeam(coachChoices()) && (
            <div style={row}>
              <label>{nt('confirm.team')} <select value={firstTeamId ?? ''} onChange={(e) => setFirstTeamId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{nt('confirm.team.none')}</option>
                {options.teams.filter((t) => t.level === coachChoices().level).map((t) => <option key={t.id} value={t.id}>{t.vacant ? nt('confirm.team.vacant', { name: t.name }) : t.name}</option>)}
              </select></label>
              <label><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> {nt('confirm.openOnly')}</label>
            </div>
          )}
          {validation && validation.notices.length > 0 && (
            <div><p>{nt('confirm.notices')}</p><ul>{validation.notices.map((n, i) => <li key={i}>{words(n.key)} {Object.values(n.params).join(' ')}</li>)}</ul></div>
          )}
          {validation && validation.problems.length > 0 && (
            <div role="alert"><p>{nt('confirm.problems')}</p><ul>{validation.problems.map((p, i) => <li key={i}>{words(p.key)} {Object.values(p.params).join(' ')}</li>)}</ul></div>
          )}
          <div style={row}>
            <button onClick={() => setStep('review')}>{nt('confirm.back')}</button>
            <button onClick={() => void start()} disabled={busy || !validation || validation.problems.length > 0} data-testid="ng-start">{nt('confirm.start', { year: careerStartYear })}</button>
          </div>
        </div>
      )}

      {busy && <p>{nt('busy')}</p>}
      {error && <p role="alert" style={{ color: 'var(--accent)' }}>{error}</p>}
    </section>
  );
}
