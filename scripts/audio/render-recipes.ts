// Offline render check for the PV-07 recipes (plan 5.2, PV-07 acceptance). Renders every recipe
// through the audio engine's own `buildRecipe`/`buildSustained` in Chromium's OfflineAudioContext,
// measures peak and loudest-400 ms RMS, compares with the Node renderer (`render-offline.ts`), and
// writes 16-bit WAV files for listening or for a third check in Python (scripts/audio/measure_wavs.py).
//
//   npx tsx scripts/audio/render-recipes.ts [outDir]
//
// The WAVs are build outputs for checking only; nothing here ships (no audio files in v1).
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { dbToGain, LOUDNESS_TARGET, loudestWindowRmsDb, peakDb, RECIPES, renderRecipe, trimDb } from '../../packages/app-ui/src/audio/recipes/index.ts';

const outDir = resolve(process.argv[2] ?? join(tmpdir(), 'gm-audio-renders'));
const SR = 48_000;
const MAX_DIFF_DB = 1;

const synthPath = fileURLToPath(new URL('../../packages/app-ui/src/audio/engine/synth.ts', import.meta.url));
const bundle = await build({ entryPoints: [synthPath], bundle: true, write: false, format: 'iife', globalName: 'GMSynth', platform: 'browser' });
const code = bundle.outputFiles[0]!.text;

function wav(samples: Float32Array): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i]! * 32767))), 44 + i * 2);
  return b;
}

mkdirSync(outDir, { recursive: true });
// A machine whose Chromium does not match the pinned Playwright sets GM_CHROMIUM to its browser path.
const browser = await chromium.launch(process.env.GM_CHROMIUM ? { executablePath: process.env.GM_CHROMIUM, args: ['--no-sandbox'] } : {});
const page = await browser.newPage();
await page.addScriptTag({ content: code });
let failures = 0;
const rows: string[] = [];
for (const r of RECIPES) {
  const recipe = { ...r.recipe, gain: dbToGain(trimDb(r.id)) };
  const sustained = r.bed === true;
  const seconds = sustained ? 4 : (await page.evaluate((rc) => (globalThis as any).GMSynth.recipeSeconds(rc), recipe));
  const data: number[] = await page.evaluate(async ({ rc, sustained, seconds, sr }) => {
    const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sr), sr);
    const S = (globalThis as any).GMSynth;
    if (sustained) S.buildSustained(ctx, rc, ctx.destination, 0); else S.buildRecipe(ctx, rc, ctx.destination, 0, 0);
    const buf = await ctx.startRendering();
    return Array.from(buf.getChannelData(0));
  }, { rc: recipe, sustained, seconds, sr: SR });
  const browserX = Float32Array.from(data);
  const nodeX = renderRecipe(recipe, { sustained, seconds });
  const bRms = loudestWindowRmsDb(browserX), nRms = loudestWindowRmsDb(nodeX);
  const bPk = peakDb(browserX), nPk = peakDb(nodeX);
  // Loudness must agree between renderers; peaks only need to stay under the ceiling in the browser
  // (band-limited square waves line up their partials differently, so sample peaks can differ).
  const ok = Math.abs(bRms - nRms) <= MAX_DIFF_DB && Math.abs(bRms - LOUDNESS_TARGET.rmsDb) <= LOUDNESS_TARGET.toleranceDb && bPk <= LOUDNESS_TARGET.peakDb;
  if (!ok) failures++;
  rows.push(`${r.id.padEnd(32)} chromium rms ${bRms.toFixed(2).padStart(7)} peak ${bPk.toFixed(2).padStart(7)} | node rms ${nRms.toFixed(2).padStart(7)} peak ${nPk.toFixed(2).padStart(7)}${ok ? '' : '  MISMATCH'}`);
  writeFileSync(join(outDir, `${r.id}.wav`), wav(browserX));
}
await browser.close();
const report = rows.join('\n') + `\n${RECIPES.length - failures} of ${RECIPES.length} agree within ${MAX_DIFF_DB} dB RMS, sit at the target and stay under the peak ceiling in Chromium\n`;
writeFileSync(join(outDir, 'report.txt'), report);
console.log(report);
process.exit(failures ? 1 : 0);
