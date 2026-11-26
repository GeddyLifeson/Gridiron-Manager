// Browser check for the PV-08 crowd driver. Runs the real audio engine and crowd driver in Chromium's
// OfflineAudioContext over the recorded game (test/audio/crowd/recorded-game.json), measures the
// crowd bed's RMS level in a window after each snap, and checks it tracks the engine's `noise`
// (Pearson r on linear RMS). Writes a WAV of the run for listening (build output; nothing ships).
//
//   GM_CHROMIUM=/opt/pw-browsers/chromium npx tsx scripts/audio/render-crowd.ts [plays] [outDir]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// 40 plays by default: the samples come back as one JSON array, and much longer runs exhaust the page.
const N = Number(process.argv[2] ?? 40);
const outDir = resolve(process.argv[3] ?? join(tmpdir(), 'gm-audio-renders'));
const SR = 22_050, PLAY_SECONDS = 8, LEAD = 2, WINDOW = 0.4;
const entry = fileURLToPath(new URL('./render-crowd.entry.ts', import.meta.url));
const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('../../packages/app-ui/test/audio/crowd/recorded-game.json', import.meta.url)), 'utf8'));
const plays = fixture.plays.slice(0, N);

const bundle = await build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', globalName: 'GMCrowd', platform: 'browser' });
const browser = await chromium.launch(process.env.GM_CHROMIUM ? { executablePath: process.env.GM_CHROMIUM, args: ['--no-sandbox'] } : {});
const page = await browser.newPage();
await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
const res: { samples: number[]; reports: unknown[] } = await page.evaluate(({ plays, SR, PLAY_SECONDS, LEAD }) =>
  (globalThis as any).GMCrowd.run(plays, SR, PLAY_SECONDS, LEAD), { plays, SR, PLAY_SECONDS, LEAD });
await browser.close();

const x = Float32Array.from(res.samples);
const rmsAt = (t0: number, t1: number) => {
  let s = 0; const a = Math.floor(t0 * SR), b = Math.floor(t1 * SR);
  for (let i = a; i < b; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, b - a));
};
// Window: the 0.4 s before tick 0 (after the ramp, before any reaction can start on a ruling).
const noise: number[] = [], rms: number[] = [];
plays.forEach((p: { conditions: { noise: number } }, i: number) => {
  const tick0 = i * PLAY_SECONDS + LEAD + 0.5;
  noise.push(p.conditions.noise); rms.push(rmsAt(tick0 - WINDOW, tick0));
});
const n = noise.length, mn = noise.reduce((a, b) => a + b) / n, mr = rms.reduce((a, b) => a + b) / n;
let sab = 0, saa = 0, sbb = 0;
for (let i = 0; i < n; i++) { sab += (noise[i]! - mn) * (rms[i]! - mr); saa += (noise[i]! - mn) ** 2; sbb += (rms[i]! - mr) ** 2; }
const r = sab / Math.sqrt(saa * sbb);

mkdirSync(outDir, { recursive: true });
const wav = Buffer.alloc(44 + x.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + x.length * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(x.length * 2, 40);
for (let i = 0; i < x.length; i++) wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i]! * 32767))), 44 + i * 2);
const wavPath = join(outDir, 'crowd-run.wav');
writeFileSync(wavPath, wav);
const reactions = (res.reports as { reaction: { pick: { kind: string }; outcome: { played: boolean } } | null }[]).filter((q) => q.reaction?.outcome?.played).map((q) => q.reaction!.pick.kind);
console.log(JSON.stringify({ plays: n, pearsonNoiseVsRms: +r.toFixed(4), reactions, wav: wavPath, perPlay: noise.map((v, i) => [v, +rms[i]!.toFixed(4)]) }));
if (!(r > 0.99)) { console.error('FAIL: bed RMS does not track noise'); process.exit(1); }
