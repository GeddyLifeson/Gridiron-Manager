// Writes packages/app-ui/src/audio/recipes/trims.json: the dB trim that puts each recipe's loudest
// 400 ms RMS at the loudness target (PV-07). Run after changing a recipe:
//   npx tsx scripts/audio/calibrate-recipes.ts
// Prints each recipe's peak after trim, so a recipe whose peak breaks the ceiling can be reshaped.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RECIPES } from '../../packages/app-ui/src/audio/recipes/recipes.ts';
import { renderRecipe } from '../../packages/app-ui/src/audio/recipes/render-offline.ts';
import { LOUDNESS_TARGET, loudestWindowRmsDb, peakDb } from '../../packages/app-ui/src/audio/recipes/loudness.ts';

const trims: Record<string, number> = {};
for (const r of RECIPES) {
  const x = renderRecipe(r.recipe, { sustained: r.bed === true });
  const rms = loudestWindowRmsDb(x);
  const trim = Math.round((LOUDNESS_TARGET.rmsDb - rms) * 10) / 10;
  trims[r.id] = trim;
  const pk = peakDb(x) + trim;
  console.log(`${r.id.padEnd(32)} raw rms ${rms.toFixed(1).padStart(6)}  trim ${trim.toFixed(1).padStart(6)}  peak ${pk.toFixed(1).padStart(6)}${pk > LOUDNESS_TARGET.peakDb ? '  OVER CEILING' : ''}`);
}
const out = fileURLToPath(new URL('../../packages/app-ui/src/audio/recipes/trims.json', import.meta.url));
writeFileSync(out, JSON.stringify(trims, null, 2) + '\n');
console.log(`wrote ${Object.keys(trims).length} trims`);
