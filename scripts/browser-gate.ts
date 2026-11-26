// Browser half of the phase 0 gate (R1.2.1 items 1 and 2):
//  1. builds the browser bundle, serves it, and runs the golden set (?gate=1) in every installed
//     browser engine (Chromium, Firefox, WebKit), comparing hashes byte for byte with golden.json,
//     and the store's save conformance career on that browser's own storage (Q1.3.1);
//  2. creates a career through the real interface in the browser, exports the save, and replays it
//     with the Node headless runner; then imports a Node-made save into the browser and loads it.
// Usage: npm run gate:browser            (run `npx playwright install` once to get all three engines)
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium, firefox, webkit, type BrowserType, type Browser } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'shells/browser/dist');
const OUT = join(ROOT, 'test-results');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.map': 'application/json', '.css': 'text/css' };

async function serve(): Promise<{ url: string; close: () => void }> {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    const file = join(DIST, path === '/' ? 'index.html' : path);
    if (!file.startsWith(DIST) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}/`, close: () => server.close() };
}

async function launch(t: BrowserType): Promise<Browser | null> {
  try { return await t.launch(); } catch (e1) {
    if (t === chromium && existsSync('/opt/pw-browsers/chromium')) {
      try { return await t.launch({ executablePath: '/opt/pw-browsers/chromium' }); } catch { /* fall through */ }
    }
    console.log(`  ${t.name()}: not installed here (${(e1 as Error).message.split('\n')[0]}); run "npx playwright install ${t.name()}"`);
    return null;
  }
}

async function main(): Promise<number> {
  if (!process.argv.includes('--no-build')) execFileSync(npm, ['run', 'build:browser'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  await mkdir(OUT, { recursive: true });
  const srv = await serve();
  let failures = 0, ran = 0;
  try {
    for (const t of [chromium, firefox, webkit]) {
      const browser = await launch(t);
      if (!browser) continue;
      ran++;
      const version = browser.version();
      const page = await browser.newPage();
      await page.goto(`${srv.url}?gate=1`);
      await page.waitForFunction(() => (window as unknown as { __GATE_RESULT__?: unknown }).__GATE_RESULT__, null, { timeout: 180_000 });
      const result = await page.evaluate(() => (window as unknown as { __GATE_RESULT__: Record<string, unknown> }).__GATE_RESULT__) as {
        ok: boolean; digest: string; mismatches: string[]; seconds: number;
        conformance?: { ok: boolean; got: { digest: string; stateHash: string } | null; replays: number; problems: string[]; seconds: number };
      };
      const label = `browser-${t.name()}`;
      await writeFile(join(OUT, `gate-${label}.json`), JSON.stringify({ ...result, platform: label, engineVersion: version }, null, 2) + '\n');
      console.log(`${result.ok ? 'PASS' : 'FAIL'} golden set in ${t.name()} ${version}: digest ${result.digest}, ${result.seconds}s`);
      for (const m of result.mismatches) console.log(`  mismatch: ${m}`);
      // Save core conformance (Q1.3.1) ran inside the page on this browser's own storage; its result is part of ok.
      const conf = result.conformance;
      if (!conf) console.log(`FAIL save conformance in ${t.name()}: the page reported none`);
      else console.log(`${conf.ok ? 'PASS' : 'FAIL'} save conformance in ${t.name()}: digest ${conf.got?.digest ?? '-'}, state ${conf.got?.stateHash ?? '-'}, ${conf.replays} replays, ${conf.seconds}s`);
      for (const p of conf?.problems ?? []) console.log(`  problem: ${p}`);
      if (!conf) failures++;
      if (!result.ok) failures++;

      if (t === chromium) failures += await saveRoundTrip(browser, srv.url);
      await browser.close();
    }
  } finally { srv.close(); }
  if (ran === 0) { console.log('FAIL no browser engine could be launched'); return 1; }
  return failures ? 1 : 0;
}

/** R1.2.1 item 2: a save written on one platform opens on the others. */
async function saveRoundTrip(browser: Browser, url: string): Promise<number> {
  let failures = 0;
  const tmp = join(OUT, 'tmp-saves');
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  // Browser -> Node.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url);
  await page.getByLabel('Save name').fill('from-browser');
  await page.getByLabel('World seed').fill('00000000beef0001');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Advance one day' }).click();
  await page.getByText('Season 2026, day 1').waitFor();
  const bytes = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('saves');
    const f = await (await dir.getFileHandle('from-browser.gmsave')).getFile();
    return Array.from(new Uint8Array(await f.arrayBuffer()));
  });
  const file = join(tmp, 'from-browser.gmsave');
  await writeFile(file, Uint8Array.from(bytes));
  try {
    const out = execFileSync(npx, ['tsx', 'packages/headless/src/cli.ts', 'replay', file], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
    console.log(`PASS browser save opens in Node: ${out.trim().split('\n').pop()}`);
  } catch (e) { console.log(`FAIL browser save in Node: ${(e as { stdout?: string }).stdout ?? e}`); failures++; }

  // Node -> browser.
  execFileSync(npx, ['tsx', 'packages/tools/src/cli.ts', 'new-save', join(tmp, 'from-node'), '--seed', '00000000beef0002', '--advance', '2'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  const nodeBytes = Array.from(await readFile(join(tmp, 'from-node.gmsave')));
  await page.evaluate(async (b) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('saves', { create: true });
    const w = await (await dir.getFileHandle('from-node.gmsave', { create: true })).createWritable();
    await w.write(new Uint8Array(b)); await w.close();
  }, nodeBytes);
  await page.reload();
  await page.getByRole('button', { name: 'from-node' }).click();
  try {
    await page.getByText('Season 2026, day 2').waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Check save (replay the log)' }).click();
    const status = await page.getByRole('status').textContent({ timeout: 10_000 });
    if (!status?.startsWith('Save check passed')) throw new Error(status ?? 'no status');
    console.log(`PASS Node save opens in the browser: ${status}`);
  } catch (e) { console.log(`FAIL Node save in the browser: ${(e as Error).message}`); failures++; }
  await ctx.close();
  await writeFile(join(OUT, 'save-roundtrip.json'), JSON.stringify({ ok: failures === 0, checked: ['browser->node', 'node->browser'] }, null, 2) + '\n');
  return failures;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
