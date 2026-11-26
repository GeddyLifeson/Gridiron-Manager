// Writes the formation reference images: npx tsx packages/football-content/test/starter/build-images.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FORMATIONS, formationSvg } from '../../src/starter/index.ts';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../data/starter/formations');
mkdirSync(dir, { recursive: true });
for (const f of FORMATIONS) writeFileSync(join(dir, `${f.id}.svg`), `${formationSvg(f)}\n`);
console.log(`wrote ${FORMATIONS.length} images to ${dir}`);
