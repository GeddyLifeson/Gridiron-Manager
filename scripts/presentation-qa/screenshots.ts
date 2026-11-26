// PV-17 screenshot set and rendered checks, in a real browser (Chromium; Firefox and WebKit when installed).
//
//   npx tsx scripts/presentation-qa/screenshots.ts [--out DIR] [--engine chromium|firefox|webkit]
//        [--theme light|dark|high-contrast] [--vision none|protan|deutan|tritan]
//        [--baseline DIR]   write the screenshots as the baseline set
//        [--compare DIR]    compare against a baseline set (fails above 0.2 % changed pixels)
//
// For every theme and colour-vision palette it draws the gallery (test/presentation-qa/gallery.ts), takes a
// colour and a greyscale screenshot, and checks in the browser's own computed styles:
//   1. every piece of text is at least 4.5:1 against the background it is really drawn on;
//   2. the same page drawn twice is byte-identical (nothing in presentation reads the clock or random);
//   3. under 200 % text the score strip is not clipped (reported as a warning, not a failure);
//   4. with reduced motion on, nothing on the page animates or transitions.
// The pass is slow-ish (about 40 s on a laptop for all 12 variants) and needs no game, so it runs anywhere with a
// browser; the long runs go on Marlon's PC (plan section 8). It writes a manifest, report.json, beside the images.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from 'playwright';
import { GALLERY_VARIANTS, galleryHtml } from '../../packages/app-ui/test/presentation-qa/gallery.ts';
import { CONTRAST_FLOOR } from '../../packages/app-ui/src/tokens/index.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name: string): string | undefined => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const OUT = resolve(arg('out') ?? join(ROOT, 'test-results/presentation-qa'));
const ENGINE = arg('engine') ?? 'chromium';
const CHANGED_PIXEL_LIMIT = 0.002;

const engines: Record<string, BrowserType> = { chromium, firefox, webkit };

async function launch(t: BrowserType): Promise<Browser> {
  try { return await t.launch(); } catch (e) {
    if (t === chromium && existsSync('/opt/pw-browsers/chromium')) return t.launch({ executablePath: '/opt/pw-browsers/chromium' });
    throw e;
  }
}

interface TextFailure { text: string; fg: string; bg: string; ratio: number }

/** Runs in the page: contrast of every text node against its effective background. */
function pageChecks(floor: number): { runs: number; failures: TextFailure[]; stripClipped: boolean; animated: number } {
  const lum = (r: number, g: number, b: number) => {
    const f = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const parse = (s: string): [number, number, number, number] => {
    const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return [0, 0, 0, 0];
    const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
  };
  const hex = (c: number[]) => `#${c.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
  const effectiveBg = (el: Element): [number, number, number] => {
    // Composite translucent backgrounds from the nearest opaque ancestor down.
    const chain: number[][] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) chain.push(c);
      if (c[3] >= 1) break;
    }
    let out: [number, number, number] = [255, 255, 255];
    for (let i = chain.length - 1; i >= 0; i--) { const c = chain[i]!; out = [0, 1, 2].map((k) => c[k]! * c[3]! + out[k]! * (1 - c[3]!)) as [number, number, number]; }
    return out;
  };
  const failures: TextFailure[] = [];
  let runs = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent?.trim();
    const el = n.parentElement;
    if (!text || !el || el.closest('style,title')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue; // the screen-reader-only live regions
    const fgc = parse(cs.color), bg = effectiveBg(el);
    const fg = [0, 1, 2].map((k) => fgc[k]! * fgc[3]! + bg[k]! * (1 - fgc[3]!));
    const [a, b] = [lum(fg[0]!, fg[1]!, fg[2]!), lum(bg[0], bg[1], bg[2])];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    runs++;
    if (ratio < floor) failures.push({ text: text.slice(0, 30), fg: hex(fg), bg: hex(bg), ratio: Math.round(ratio * 100) / 100 });
  }
  const strips = [...document.querySelectorAll('[data-region="strip"]')];
  const stripClipped = strips.some((s) => s.scrollWidth > s.clientWidth + 1);
  const animated = [...document.querySelectorAll('*')].filter((e) => { const c = getComputedStyle(e); return (c.animationName !== 'none' && parseFloat(c.animationDuration) > 0) || parseFloat(c.transitionDuration) > 0; }).length;
  return { runs, failures, stripClipped, animated };
}

async function diffFraction(page: Page, a: Buffer, b: Buffer): Promise<number> {
  await page.evaluate('window.__name = (f) => f');
  return page.evaluate(async ([x, y]) => {
    const load = (s: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:image/png;base64,${s}`; });
    const [ia, ib] = await Promise.all([load(x!), load(y!)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return 1;
    const px = (i: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d')!; g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    const da = px(ia), db = px(ib);
    let changed = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i]! - db[i]!) > 8 || Math.abs(da[i + 1]! - db[i + 1]!) > 8 || Math.abs(da[i + 2]! - db[i + 2]!) > 8) changed++;
    return changed / (da.length / 4);
  }, [a.toString('base64'), b.toString('base64')] as const);
}

async function main(): Promise<number> {
  const type = engines[ENGINE];
  if (!type) throw new Error(`unknown engine ${ENGINE}`);
  const browser = await launch(type);
  const shots = join(OUT, ENGINE);
  mkdirSync(shots, { recursive: true });
  const wantTheme = arg('theme'), wantVision = arg('vision');
  const variants = GALLERY_VARIANTS.filter((v) => (!wantTheme || v.theme === wantTheme) && (!wantVision || v.vision === wantVision));
  const baselineDir = arg('baseline'), compareDir = arg('compare');
  const report: Record<string, unknown>[] = [];
  let failures = 0;
  // tsx wraps named functions with an `__name` helper that does not exist inside the page.
  const NAME_SHIM = 'window.__name = (f) => f';
  const compare = await browser.newPage();
  await compare.evaluate(NAME_SHIM);
  try {
    for (const v of variants) {
      const name = `${v.theme}-${v.vision}`;
      const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      const html = galleryHtml(v);
      await page.setContent(html, { waitUntil: 'load' });
      const colour = await page.screenshot({ fullPage: true });
      const colourAgain = await page.screenshot({ fullPage: true });
      await page.addStyleTag({ content: 'html{filter:grayscale(1)}' });
      const grey = await page.screenshot({ fullPage: true });
      await page.evaluate(() => { document.querySelectorAll('style').forEach((s) => { if (s.textContent === 'html{filter:grayscale(1)}') s.remove(); }); });
      await page.evaluate(NAME_SHIM);
      const checks = await page.evaluate(pageChecks, CONTRAST_FLOOR.text);

      // 200 % text, to see whether the strip is clipped.
      await page.setContent(galleryHtml({ ...v, textScalePct: 200 }), { waitUntil: 'load' });
      await page.evaluate(NAME_SHIM);
      const big = await page.evaluate(pageChecks, CONTRAST_FLOOR.text);
      await page.close();

      const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex').slice(0, 16);
      writeFileSync(join(shots, `${name}.png`), colour);
      writeFileSync(join(shots, `${name}.grey.png`), grey);
      const row: Record<string, unknown> = {
        variant: name, runs: checks.runs, contrastFailures: checks.failures, stableTwice: colour.equals(colourAgain),
        animatedWithReducedMotion: checks.animated, stripClippedAt200pct: big.stripClipped, contrastFailuresAt200pct: big.failures.length,
        colourSha: sha(colour), greySha: sha(grey),
      };
      let bad = checks.failures.length > 0 || !colour.equals(colourAgain) || checks.animated > 0 || big.failures.length > 0;
      for (const [kind, buf] of [['', colour], ['.grey', grey]] as const) {
        if (baselineDir) { mkdirSync(join(baselineDir, ENGINE), { recursive: true }); writeFileSync(join(baselineDir, ENGINE, `${name}${kind}.png`), buf); }
        if (compareDir) {
          const f = join(compareDir, ENGINE, `${name}${kind}.png`);
          if (!existsSync(f)) { row[`compare${kind}`] = 'no baseline'; bad = true; continue; }
          const frac = await diffFraction(compare, readFileSync(f), buf);
          row[`changedPixels${kind}`] = Math.round(frac * 1e6) / 1e6;
          if (frac > CHANGED_PIXEL_LIMIT) bad = true;
        }
      }
      if (bad) failures++;
      report.push({ ...row, ok: !bad });
      console.log(`${bad ? 'FAIL' : 'ok  '} ${name}: ${checks.runs} text runs, ${checks.failures.length} under ${CONTRAST_FLOOR.text}:1${big.stripClipped ? ', strip clipped at 200% text (warning)' : ''}`);
    }
    if (process.argv.includes('--self-check')) {
      // Check the checker: a planted grey-on-grey line and a planted pair of pages that differ must both be caught.
      const page = await browser.newPage({ viewport: { width: 400, height: 200 } });
      await page.setContent('<body style="background:#777777"><p style="color:#808080">planted</p></body>');
      await page.evaluate(NAME_SHIM);
      const planted = await page.evaluate(pageChecks, CONTRAST_FLOOR.text);
      const a = await page.screenshot();
      await page.setContent('<body style="background:#777777"><p style="color:#808080;margin-top:40px">planted</p><div style="width:300px;height:100px;background:#000"></div></body>');
      const frac = await diffFraction(compare, a, await page.screenshot());
      await page.close();
      const caught = planted.failures.length === 1 && frac > CHANGED_PIXEL_LIMIT;
      console.log(`self-check: planted low contrast ${planted.failures.length === 1 ? 'caught' : 'MISSED'}, planted pixel change ${frac > CHANGED_PIXEL_LIMIT ? 'caught' : 'MISSED'}`);
      if (!caught) failures++;
    }
  } finally {
    await compare.close();
    await browser.close();
  }
  writeFileSync(join(OUT, `report-${ENGINE}.json`), JSON.stringify({ engine: ENGINE, version: browser.version?.() ?? null, variants: report }, null, 2) + '\n');
  console.log(`${report.length} variants, ${failures} failed; screenshots and report in ${OUT}`);
  return failures ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
