import { createRoot } from 'react-dom/client';
import { App } from '@gm/app-ui';
import { runGolden, compareGolden, goldenInputs, type GoldenReport, type Platform } from '@gm/app-services';
import golden from '../../../golden/golden.json';
import { BrowserPlatform } from './platform-browser.ts';
import { DesktopPlatform, isDesktop } from './platform-desktop.ts';

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
  const result = {
    suite: 'Q1.3.1 golden-seed determinism (phase 0 dummy game)',
    platform: `${platform.kind}-${navigator.userAgent}`,
    ok: c.ok, digest: r.digest, goldenDigest: (golden as GoldenReport).digest, mismatches: c.mismatches, counts: r.counts,
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

async function main() {
  const platform: Platform = isDesktop() ? new DesktopPlatform() : await BrowserPlatform.create();
  if (await gateMode(platform)) return;
  createRoot(document.getElementById('root')!).render(<App platform={platform} golden={golden as GoldenReport} />);
}
void main();
