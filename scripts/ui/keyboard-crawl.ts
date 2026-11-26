// Q1.5.2 in a real browser: bundles the shell alone, serves it, and presses real keys with
// Playwright. For every screen without parameters it presses the hub number and the screen letter
// and checks the page shows that screen; it then compares each result with the harness's virtual
// keyboard, so the pure model in packages/app-ui/test/harness cannot drift from Shell.tsx.
// Usage: npx tsx scripts/ui/keyboard-crawl.ts [--engine chromium|firefox|webkit]
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, firefox, webkit, type Browser } from 'playwright';
import { SCREENS, hasParams, keyForHub } from '../../packages/app-ui/src/shell/index.ts';
import { VirtualKeyboard, digitCode, letterCode } from '../../packages/app-ui/test/harness/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

async function launch(name: string): Promise<Browser> {
  const type = { chromium, firefox, webkit }[name as 'chromium'];
  if (!type) throw new Error(`unknown engine ${name}`);
  try { return await type.launch(); } catch (e) {
    if (name === 'chromium' && existsSync('/opt/pw-browsers/chromium')) return type.launch({ executablePath: '/opt/pw-browsers/chromium' });
    throw e;
  }
}

async function main(): Promise<number> {
  const engine = process.argv.includes('--engine') ? process.argv[process.argv.indexOf('--engine') + 1]! : 'chromium';
  const dir = await mkdtemp(join(tmpdir(), 'gm-ui-'));
  try {
    await build({ entryPoints: [join(HERE, 'page.tsx')], bundle: true, format: 'iife', outfile: join(dir, 'page.js'), jsx: 'automatic', target: 'es2022', logLevel: 'error', define: { 'process.env.NODE_ENV': '"production"' } });
    await writeFile(join(dir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>shell</title></head><body><div id="root"></div><script src="page.js"></script></body></html>');
    const server = createServer(async (req, res) => {
      const p = (req.url ?? '/').split('?')[0]!;
      const f = join(dir, p === '/' ? 'index.html' : p);
      if (!f.startsWith(dir) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' });
      res.end(await readFile(f));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    const url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;
    const browser = await launch(engine);
    let failures = 0, checked = 0;
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const screenNow = () => page.locator('.gm-shell').getAttribute('data-screen');
      for (const s of SCREENS.filter((x) => !hasParams(x))) {
        await page.goto(url);
        await page.locator('.gm-shell').waitFor();
        const keys = [digitCode(keyForHub(s.hub)), letterCode(s.hotkey!)];
        for (const k of keys) await page.keyboard.press(k);
        const real = await screenNow();
        const model = new VirtualKeyboard(); model.pressAll(keys);
        checked++;
        if (real !== s.id || model.screenId !== real) { failures++; console.log(`FAIL ${s.id}: browser ${real}, model ${model.screenId}`); }
      }
      // overlays and back, by key only
      await page.goto(url); await page.locator('.gm-shell').waitFor();
      const dialogs: Array<[string, string]> = [['Shift+Slash', 'keys'], ['F1', 'help']];
      for (const [k, name] of dialogs) {
        await page.keyboard.press(k);
        const open = await page.locator('[role="dialog"]').count();
        await page.keyboard.press('Escape');
        const closed = await page.locator('[role="dialog"]').count();
        checked++;
        if (open !== 1 || closed !== 0) { failures++; console.log(`FAIL ${name} overlay: open ${open}, closed ${closed}`); }
      }
      await page.keyboard.press('Slash');
      checked++;
      if ((await page.locator('input[role="combobox"]').count()) !== 1) { failures++; console.log('FAIL palette did not open on /'); }
    } finally { await browser.close(); server.close(); }
    console.log(`${failures ? 'FAIL' : 'PASS'} real-browser keyboard crawl in ${engine}: ${checked} checks, ${failures} failed`);
    return failures ? 1 : 0;
  } finally { await rm(dir, { recursive: true, force: true }); }
}

process.exit(await main());
