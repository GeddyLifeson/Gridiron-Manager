// Writes the menu-music scores (PV-11) to assets/music/scores/*.musicxml and a MuseScore Studio
// conversion job that renders them to assets/music/*.ogg.
//
//   npx tsx scripts/music/compose.ts            write the scores and the job file
//   npx tsx scripts/music/compose.ts --check    fail if the committed scores are out of date
//
// Render (Windows, MuseScore Studio 4):
//   "C:\Program Files\MuseScore 4\bin\MuseScore4.exe" -j assets\music\scores\render-job.json --sound-profile "MuseScore Basic"
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { COMPOSITIONS } from '../../packages/app-ui/src/audio/music/compositions.ts';
import { MUSIC_DIR } from '../../packages/app-ui/src/audio/music/menu-music.ts';
import { toMusicXml } from '../../packages/app-ui/src/audio/music/musicxml.ts';

const scoresDir = join(MUSIC_DIR, 'scores');
const check = process.argv.includes('--check');
const files: Array<[string, string]> = COMPOSITIONS.map((c) => [join(scoresDir, `${c.id}.musicxml`), toMusicXml(c)]);
// Paths in the job are relative to the folder MuseScore is started from (the repo root).
const job = COMPOSITIONS.map((c) => ({ in: `${MUSIC_DIR}/scores/${c.id}.musicxml`, out: [`${MUSIC_DIR}/${c.id}.ogg`, `${MUSIC_DIR}/scores/${c.id}.mscz`] }));
files.push([join(scoresDir, 'render-job.json'), `${JSON.stringify(job, null, 2)}\n`]);

let stale = 0;
if (!check) mkdirSync(scoresDir, { recursive: true });
for (const [path, text] of files) {
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) { console.error(`out of date: ${path}`); stale++; }
  } else {
    writeFileSync(path, text);
    console.log(`wrote ${path}`);
  }
}
if (stale) { console.error('run: npx tsx scripts/music/compose.ts'); process.exit(1); }
