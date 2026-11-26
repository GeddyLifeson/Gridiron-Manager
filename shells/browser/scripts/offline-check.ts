// G-06 acceptance: the browser build loads offline after the first visit (P2.3.2).
// Builds the bundle, serves it, visits once online, stops the server, then reloads in a fresh
// tab and starts a career with no network at all. Run: npm run gate:offline -w @gm/shell-browser
import { createServer, type Server } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DIST = join(ROOT, 'shells/browser/dist');
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.map': 'application/json', '.css': 'text/css' };

function serve(port: number): Promise<{ server: Server; port: number }> {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    const file = join(DIST, path === '/' ? 'index.html' : path);
    if (!file.startsWith(DIST) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => {
    const a = server.address();
    r({ server, port: typeof a === 'object' && a ? a.port : port });
  }));
}

async function main(): Promise<number> {
  if (!process.argv.includes('--no-build')) {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFileSync(npm, ['run', 'build:browser'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  }
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const check = (name: string, ok: boolean, detail?: string) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); };

  let browser;
  try { browser = await chromium.launch(); } catch {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  }
  const ctx = await browser.newContext();
  const first = await serve(0);
  // The plain save-file start (?saves=1): the check is that a career starts and saves with no network.
  const origin = `http://127.0.0.1:${first.port}/?saves=1`;
  const page = await ctx.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Start' }).waitFor();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((k) => k.startsWith('gm-shell-'));
    return names.length ? (await (await caches.open(names[0]!)).keys()).length : 0;
  });
  check('service worker active and files cached after first visit', cached > 3, `${cached} files`);
  await page.close();

  // Network gone: stop the server, then reload cold in a new tab.
  await new Promise<void>((r) => { first.server.closeAllConnections(); first.server.close(() => r()); });
  const offline = await ctx.newPage();
  const failed: string[] = [];
  offline.on('requestfailed', (r) => failed.push(r.url()));
  await offline.goto(origin);
  try {
    await offline.getByRole('button', { name: 'Start' }).waitFor({ timeout: 15_000 });
    check('page loads with the server stopped', true);
  } catch (e) { check('page loads with the server stopped', false, (e as Error).message.split('\n')[0]); }
  try {
    await offline.getByLabel('Save name').fill('offline-career');
    await offline.getByLabel('World seed').fill('00000000beef0003');
    await offline.getByRole('button', { name: 'Start' }).click();
    await offline.getByRole('button', { name: 'Advance one day' }).click();
    await offline.getByText('Season 2026, day 1').waitFor({ timeout: 15_000 });
    check('a career starts, advances and saves offline (SQLite wasm loaded from cache)', true);
  } catch (e) { check('a career starts, advances and saves offline', false, (e as Error).message.split('\n')[0]); }
  check('no failed requests while offline', failed.length === 0, failed.join(', '));
  await browser.close();

  const ok = checks.every((c) => c.ok);
  const out = join(ROOT, 'shells/browser/dist');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'offline-check.json'), JSON.stringify({ ok, checks }, null, 2) + '\n');
  return ok ? 0 : 1;
}
main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
