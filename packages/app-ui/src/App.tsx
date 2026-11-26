// The front door: the new-game flow and the load list, both opening the career root. The phase 0
// developer panels (empty world, world summary, determinism check) show only with `devTools`.
// Screens hold no football logic and import only the public interface of app-services (P1.2.2, P1.3.2).
import { useCallback, useEffect, useState } from 'react';
import {
  WorldService, runGolden, compareGolden, goldenInputs, VERSIONS,
  type Platform, type WorldSummaryModel, type GoldenReport, newgame,
} from '@gm/app-services';
import { NewGameFlow } from './screens/new-game/index.ts';
import { SoundStageCaptions, type SoundStage } from './audio/stage/index.ts';
import { CareerRoot, firstTeamKey, resolverFor, startCareerSeason, type CareerPort, type LeagueContent } from './app-root/index.ts';
import { DEFAULT_KEYMAP } from './shell/keymap.ts';
import { gameCalling, type gameCallingCommands } from '@gm/app-services';

export interface AppProps {
  platform: Platform;
  golden: GoldenReport;
  /** The sound stage built by the shell host; absent or null runs silent. */
  soundStage?: SoundStage | null;
  /** The four league files the season is built from (the shell host imports them). */
  leagueContent?: LeagueContent;
  /** The console setup for a game (the sheet bridge); by default the staff drafts both sides from the content book. */
  consoleConfig?: (ruleSetId: string, gameId: string) => gameCallingCommands.ConsoleConfig;
  /** Check entry (?quick=pro|college): a season with the level's first team, straight to the office. */
  quickCareer?: 'pro' | 'college' | null;
  /** Shows the phase 0 developer panels (the shell sets it from ?dev=1). Off for players. */
  devTools?: boolean;
  /**
   * The new-game flow (coach, history length, the past played, review, rerun, start). Absent keeps the
   * phase 0 new-career box. `onStart` belongs to the career root; without one the phase 0 world opens.
   */
  newGame?: {
    client: newgame.NewGameClient;
    careerStartYear: number;
    now?: () => number;
    onStart?: (start: newgame.CareerStart, world: newgame.StartedWorld) => void;
  };
}

/** A save name not in `taken`: the wanted name, else its stem with the lowest free -n (career-1 taken: career-2). */
export function freeSaveName(wanted: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (wanted && !used.has(wanted)) return wanted;
  const stem = (wanted || 'career').replace(/-\d+$/, '') || 'career';
  for (let n = 1; ; n += 1) if (!used.has(`${stem}-${n}`)) return `${stem}-${n}`;
}

/** Rule set of each level's 2026 season (A2 scope: one rule year per level). */
const RULE_SET_OF = { pro: 'pro_2026', college: 'college_2026' } as const;


type Gate = { state: 'idle' | 'running' } | { state: 'done'; ok: boolean; digest: string; mismatches: string[]; seconds: number };

const box: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 8, padding: 16, margin: '12px 0', background: 'var(--panel)' };

function randomSeedHex(): string {
  // The wall clock and platform random are allowed here: world creation is outside the core (J13.4.1).
  // Marked for the PV-01 lint: fresh entropy for a new world seed, never presentation.
  const a = Math.floor(Math.random() * 0xffffffff) >>> 0; // allow-platform-random: J13.4.1
  const b = (Date.now() >>> 0) ^ Math.floor(Math.random() * 0xffffffff); // allow-platform-random: J13.4.1
  return a.toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

export function App({ platform, golden, soundStage = null, newGame, leagueContent, consoleConfig, quickCareer = null, devTools = false }: AppProps) {
  // A host without the new-game flow is the phase 0 build itself: its panels stay.
  const devPanels = devTools || !newGame;
  const [career, setCareer] = useState<CareerPort | null>(null);
  useEffect(() => {
    if (!quickCareer || !leagueContent || career) return;
    const setup = consoleConfig ?? ((id: string, gameId: string) => gameCalling.staffConsoleConfig(id, gameId, DEFAULT_KEYMAP.bindings));
    const ruleSetId = RULE_SET_OF[quickCareer];
    setCareer(startCareerSeason(leagueContent, { level: quickCareer, ruleSetId, seasonYear: 2026, seedHex: randomSeedHex(), seat: { key: firstTeamKey(leagueContent, quickCareer) } },
      { consoleConfig: (gameId) => setup(ruleSetId, gameId), resolve: resolverFor(DEFAULT_KEYMAP.bindings) }));
  }, [quickCareer, leagueContent, consoleConfig, career]);
  const [saves, setSaves] = useState<{ name: string; sizeBytes: number }[] | null>(null);
  const [svc, setSvc] = useState<WorldService | null>(null);
  const [summary, setSummary] = useState<WorldSummaryModel | null>(null);
  const [seed, setSeed] = useState(randomSeedHex());
  const [name, setName] = useState('career-1');
  const [msg, setMsg] = useState('');
  const [gate, setGate] = useState<Gate>({ state: 'idle' });

  const refresh = useCallback(async () => setSaves(await platform.listSaves()), [platform]);
  useEffect(() => { void refresh(); }, [refresh]);
  // The phase 0 screen is the title screen for menu music (off unless the user turned it on).
  useEffect(() => { soundStage?.setPlace({ hub: 'title', inGame: false, offseason: false }); }, [soundStage]);

  const open = async (s: WorldService) => { setSvc(s); setSummary(s.worldSummary()); await refresh(); };

  const newCareer = async () => {
    setMsg('');
    try { await open(await WorldService.newCareer(platform, { saveName: name, masterSeedHex: seed.padStart(16, '0'), startSeasonYear: 2026 })); }
    catch (e) { setMsg((e as Error).message); }
  };
  // The career root: the season of the seat's level from the generated world, on the office and the console.
  const enterCareer = (start: newgame.CareerStart, world: newgame.StartedWorld) => {
    if (!leagueContent) { setMsg('This build has no league content, so the career cannot open.'); return; }
    const setup = consoleConfig ?? ((id: string, gameId: string) => gameCalling.staffConsoleConfig(id, gameId, DEFAULT_KEYMAP.bindings));
    try {
      setCareer(startCareerSeason(leagueContent, { level: start.level, ruleSetId: start.ruleSetId, seasonYear: start.careerStartYear, seedHex: start.seedHex, seat: { world, teamId: start.seatTeamId } },
        { consoleConfig: (gameId) => setup(start.ruleSetId, gameId), resolve: resolverFor(DEFAULT_KEYMAP.bindings) }));
    } catch (e) { setMsg((e as Error).message); }
  };
  const startFromNewGame = async (start: newgame.CareerStart, world: newgame.StartedWorld) => {
    if (newGame?.onStart) { newGame.onStart(start, world); return; }
    setMsg('');
    // The career save: its header holds the recipe the start is rebuilt from on load (the history and
    // the coach are pure functions of it). A taken name moves to the next free one.
    const saveName = freeSaveName(start.saveName, (await platform.listSaves()).map((x) => x.name));
    const who = `${start.coach.name.first} ${start.coach.name.last}`;
    try {
      const s = await WorldService.newCareer(platform, {
        saveName, masterSeedHex: start.seedHex, startSeasonYear: start.careerStartYear,
        career: { recipeJson: JSON.stringify(start.recipe), userPersonId: start.coach.personId, userJob: start.seatKind === 'entry' ? 'entry' : start.coach.start, summary: `${who}, ${start.seatTeamName}, ${start.careerStartYear}` },
      });
      await s.close();
    } catch (e) { setMsg(`The career could not be saved: ${(e as Error).message}`); return; }
    await refresh();
    enterCareer({ ...start, saveName }, world);
  };
  const load = async (n: string) => {
    setMsg('');
    try {
      if (svc) { await svc.close(); setSvc(null); setSummary(null); }
      const s = await WorldService.load(platform, n);
      const recipe = s.careerRecipeJson();
      if (recipe === null) {
        if (devPanels) { await open(s); return; }
        await s.close();
        setMsg(`${n} is a phase 0 developer world, not a career. Open the page with ?dev=1 to look at it.`);
        return;
      }
      await s.close();
      if (!newGame) { setMsg('This build has no new-game service, so a career save cannot be rebuilt.'); return; }
      // Rebuild the start from the recipe: the world's past is played again, then the coach is created.
      const r = JSON.parse(recipe) as newgame.CareerRecipe;
      setMsg(`Opening ${n}: playing the world's past again.`);
      await newGame.client.run(r.choice, r.rerun, (p) => setMsg(`Opening ${n}: season ${p.seasonYear}, ${p.done} of ${p.of} seasons played.`));
      const out = await newGame.client.start(r.choices, n);
      if (!out.ok) { setMsg(`${n} could not be rebuilt: ${out.problems.map((p) => p.key).join(', ')}`); return; }
      setMsg('');
      enterCareer(out.start, out.world);
    } catch (e) { setMsg((e as Error).message); }
  };
  const advance = async () => {
    if (!svc) return;
    const r = await svc.run('AdvanceDay', { days: 1 });
    if (!r.ok) setMsg(r.reason);
    setSummary(svc.worldSummary());
  };
  const check = async () => {
    if (!svc) return;
    const v = await svc.verify();
    setMsg(v.ok ? `Save check passed: ${v.commands} commands replayed to state ${v.replayedHash}.` : `Save check failed: ${v.problems.join('; ')}`);
  };
  const runGate = () => {
    setGate({ state: 'running' });
    setTimeout(() => {
      const t0 = performance.now();
      const r = runGolden(goldenInputs());
      const c = compareGolden(r, golden);
      setGate({ state: 'done', ok: c.ok, digest: r.digest, mismatches: c.mismatches, seconds: Math.round((performance.now() - t0) / 100) / 10 });
    }, 30);
  };

  const s = summary?.data;
  if (career) return <CareerRoot port={career} soundStage={soundStage} />;
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '16px' }}>
      <h1 style={{ fontSize: 22 }}>Gridiron Manager</h1>
      {devPanels && <p style={{ color: 'var(--muted)' }}>Phase 0 build: an empty world, saves, and the determinism check. Platform: {platform.kind}. Engine {VERSIONS.engine}, save format {VERSIONS.saveFormat}.</p>}

      {!svc && newGame && saves && (
        <NewGameFlow client={newGame.client} careerStartYear={newGame.careerStartYear} randomSeedHex={randomSeedHex} onStart={(s, w) => void startFromNewGame(s, w)}
          initialSaveName={freeSaveName('career-1', saves.map((x) => x.name))} {...(newGame.now ? { now: newGame.now } : {})} />
      )}
      {!svc && (
        <section style={box} aria-label="Careers">
          {devPanels && (<>
            <h2 style={{ fontSize: 17 }}>{newGame ? 'Empty world (phase 0 developer check)' : 'New career'}</h2>
            <label>Save name <input value={name} onChange={(e) => setName(e.target.value.replace(/[^\w-]/g, ''))} /></label>{' '}
            <label>World seed <input value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9a-f]/gi, '').slice(0, 16).toLowerCase())} style={{ fontFamily: 'monospace' }} /></label>{' '}
            <button onClick={newCareer} disabled={!name || !seed}>Start</button>
          </>)}
          <h2 style={{ fontSize: 17, marginTop: devPanels ? 20 : 0 }}>Load</h2>
          {!saves || saves.length === 0 ? <p>No saves yet.</p> : (
            <ul>{saves.map((x) => <li key={x.name}><button onClick={() => load(x.name)}>{x.name}</button> <small>{Math.round(x.sizeBytes / 1024)} KB</small></li>)}</ul>
          )}
        </section>
      )}

      {devPanels && svc && s && (
        <section style={box} aria-label="World">
          <h2 style={{ fontSize: 17 }}>World: {svc.saveName}</h2>
          <p>Season {s.calendar.seasonYear}, day {s.calendar.dayIndex}. Seed <code>{s.masterSeedHex}</code>. State hash <code>{s.stateHash}</code>.</p>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead><tr><th align="left">Competition</th><th align="left">Level</th><th align="left">Rule set</th><th align="right">Teams</th></tr></thead>
            <tbody>{s.competitions.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.level}</td><td><code>{c.ruleSetId}</code></td><td align="right">{c.teamCount}</td></tr>)}</tbody>
          </table>
          <p>People: {s.peopleCount}. Teams, people and schedules arrive in later phases.</p>
          <button onClick={advance}>Advance one day</button>{' '}
          <button onClick={check}>Check save (replay the log)</button>{' '}
          <button onClick={async () => { await svc.close(); setSvc(null); setSummary(null); await refresh(); }}>Close</button>
        </section>
      )}

      {msg && <p role="status" style={{ ...box, borderColor: 'var(--accent)' }}>{msg}</p>}

      {devPanels && <section style={box} aria-label="Determinism check">
        <h2 style={{ fontSize: 17 }}>Determinism check</h2>
        <p style={{ color: 'var(--muted)' }}>Runs the golden-seed set (200 plays, 20 games and a season per rule set, plus the math and stream files) and compares every hash with the committed golden file.</p>
        <button onClick={runGate} disabled={gate.state === 'running'}>{gate.state === 'running' ? 'Running…' : 'Run determinism check'}</button>
        {gate.state === 'done' && (
          <p data-testid="gate-result">{gate.ok ? 'PASS' : 'FAIL'}: digest <code>{gate.digest}</code>, golden <code>{golden.digest}</code>, {gate.seconds}s{gate.mismatches.length ? `. Mismatches: ${gate.mismatches.join('; ')}` : ''}</p>
        )}
      </section>}
      <SoundStageCaptions stage={soundStage} />
    </main>
  );
}
