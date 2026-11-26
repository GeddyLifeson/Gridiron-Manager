import { createRoot } from 'react-dom/client';
import { App, soundStage as sound } from '@gm/app-ui';
import { runGolden, compareGolden, goldenInputs, settings, WorldService, newgame, type GoldenReport, type Platform } from '@gm/app-services';
import golden from '../../../golden/golden.json';
import proLeague from '../../../packages/football-content/data/world/pro-league.json';
import college from '../../../packages/football-content/data/world/college.json';
import proLeagueRules from '../../../packages/rules-data/data/league/proleague_2026.json';
import collegeLeagueRules from '../../../packages/rules-data/data/league/collegeleague_2026.json';
import { BrowserPlatform } from './platform-browser.ts';
import { registerOffline } from './offline.ts';
import { DesktopPlatform, isDesktop } from './platform-desktop.ts';
import { captureWebViewErrors } from '../../desktop/bridge/desktop-shell.ts';
import { runGateConformance } from './gate-conformance.ts';

declare global { interface Window { __GATE_RESULT__?: unknown } }

/** Headless gate mode: ?gate=1 in the browser, or --gate <file> on the desktop shell. */
async function gateMode(platform: Platform): Promise<boolean> {
  let outFile: string | null = null;
  if (isDesktop()) {
    const { invoke } = await import('@tauri-apps/api/core');
    outFile = await invoke<string | null>('gate_out_path');
    if (!outFile) return false;
  } else if (!new URLSearchParams(location.search).has('gate')) return false;
  const t0 = performance.now();
  const r = runGolden(goldenInputs());
  const c = compareGolden(r, golden as GoldenReport);
  // Save core conformance on this platform's own storage (Q1.3.1): browser vault or native SQLite.
  const conformance = await runGateConformance(platform);
  // Desktop only: a native SQLite save (P5.1.1) made here, reloaded and replay-checked here; the
  // one-command check then copies it out with --copy-save and replays it in Node.
  let save: { ok: boolean; name?: string; commands?: number; state?: string; problem?: string } | undefined;
  if (outFile) {
    const name = 'gate-desktop';
    try {
      await platform.deleteSave(name);
      const svc = await WorldService.newCareer(platform, { saveName: name, masterSeedHex: '00000000000a11ce', startSeasonYear: 2026 });
      for (const days of [1, 7, 30]) {
        const o = await svc.run('AdvanceDay', { days });
        if (!o.ok) throw new Error(`AdvanceDay ${days} refused: ${o.reason}`);
      }
      await svc.close();
      const again = await WorldService.load(platform, name); // load runs the replay check
      const v = await again.verify();
      await again.close();
      save = { ok: v.ok, name, commands: v.commands, state: v.replayedHash, problem: v.ok ? undefined : v.problems.join('; ') };
    } catch (e) {
      save = { ok: false, name, problem: String(e) };
    }
  }
  const result = {
    suite: 'Q1.3.1 golden-seed determinism (phase 0 dummy game)',
    platform: `${platform.kind}-${navigator.userAgent}`,
    ok: c.ok && conformance.ok && (save?.ok ?? true), digest: r.digest, goldenDigest: (golden as GoldenReport).digest, mismatches: c.mismatches, counts: r.counts,
    save,
    conformance,
    seconds: Math.round((performance.now() - t0) / 100) / 10,
  };
  window.__GATE_RESULT__ = result;
  document.getElementById('root')!.textContent = `${result.ok ? 'PASS' : 'FAIL'} ${result.digest}`;
  if (outFile) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('gate_write_and_exit', { path: outFile, text: JSON.stringify(result, null, 2) + '\n', ok: result.ok });
  }
  return true;
}

/**
 * The sound stack (engine, crowd, cadence, ambience, menu music, captions) from the user's settings,
 * kept in step with every later change. Silent, never fatal, where there is no Web Audio.
 */
async function startSound(): Promise<sound.SoundStage | null> {
  try {
    const { store } = await settings.SettingsStore.open(settings.keyValueSettingsBackend(window.localStorage));
    const stage = sound.createBrowserSoundStage(sound.settingsGetter(store.all()));
    if (!stage) return null;
    store.onChange(() => stage.applySettings(sound.settingsGetter(store.all())));
    sound.unlockOnFirstInput(stage);
    return stage;
  } catch (e) {
    console.warn('sound stage not started:', e);
    return null;
  }
}

async function main() {
  if (!isDesktop()) void registerOffline();
  else captureWebViewErrors();
  const platform: Platform = isDesktop() ? new DesktopPlatform() : await BrowserPlatform.create();
  if (await gateMode(platform)) return;
  // The new-game history runs in its own worker; a cancel ends that worker and starts a fresh one.
  const newGame = {
    client: newgame.workerClient(() => new Worker(new URL('./new-game-worker.ts', import.meta.url), { type: 'module' }) as unknown as newgame.WorkerLike),
    careerStartYear: new Date().getUTCFullYear(),
    now: () => performance.now(),
  };
  // ?quick=pro|college: a season with the level's first team, straight to the office (a check entry).
  // ?saves=1: the plain save-file start (save name and world seed) without the new-game history, for the
  // browser gate's save round trip and the offline check (R1.2.1 item 2, P2.3.2); a check entry like ?quick.
  const query = new URLSearchParams(location.search);
  const quick = query.get('quick');
  const savesOnly = query.get('saves') === '1';
  const leagueContent = { proLeague, college, proLeagueRules, collegeLeagueRules };
  createRoot(document.getElementById('root')!).render(
    <App platform={platform} golden={golden as GoldenReport} soundStage={await startSound()} {...(savesOnly ? {} : { newGame })} leagueContent={leagueContent}
      quickCareer={quick === 'pro' || quick === 'college' ? quick : null} />,
  );
}
void main();
