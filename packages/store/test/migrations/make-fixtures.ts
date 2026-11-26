// Writes the migration fixtures (Q1.2.3) and their expected values. Run once per new format:
//   npx tsx packages/store/test/migrations/make-fixtures.ts
// Existing fixture files are never rewritten: a released format's fixture is fixed for good. Pass
// --force only together with a migration that changes outcomes, and say why in the commit (Q1.2.3).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_SPECS, runFixture, writeFixture, type FixtureExpect } from '../../src/migrations/fixtures.ts';
import { HASHES, memoryDb } from '../save/helpers.ts';

const dir = join(import.meta.dirname, 'fixtures');
const manifestPath = join(dir, 'manifest.json');
const force = process.argv.includes('--force');
const manifest: Record<string, FixtureExpect & { format: number; kind: string }> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const env = { open: (b?: Uint8Array) => memoryDb(b), hashes: HASHES };

for (const spec of FIXTURE_SPECS) {
  const file = join(dir, `${spec.name}.gmsave`);
  if (existsSync(file) && manifest[spec.name] && !force) { console.log(`keep ${spec.name}`); continue; }
  const bytes = await writeFixture(spec, env);
  const r = await runFixture(spec.name, bytes, env);
  if (!r.ok) throw new Error(`${spec.name}: ${r.problems.join('; ')}`);
  writeFileSync(file, bytes);
  manifest[spec.name] = { format: spec.format, kind: spec.kind, stateHash: r.stateHash, stateHashAfterWeek: r.stateHashAfterWeek, certified: r.certified, seasonYear: r.seasonYear };
  console.log(`wrote ${spec.name}: ${bytes.length} bytes, from format ${r.migratedFrom || spec.format}`);
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
