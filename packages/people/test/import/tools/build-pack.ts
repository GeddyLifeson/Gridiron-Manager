// Builds a people pack from the project data folder on the user's own machine and runs the import on it
// (D13.6.1 acceptance). Never writes inside the repository: the pack holds real names (A6.3.2).
// Usage: npx tsx packages/people/test/import/tools/build-pack.ts [DATA_DIR] [OUT_DIR] [--snapshot 2025] [--plain-teams]
// With CFBD_KEY_FILE pointing at a file holding a CollegeFootballData key, college head coaches are fetched too.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseCsv, readCell, encodePack, decodePack } from '../../../src/pack/index.ts';
import { buildProjectPack, importPack, cfbdCoachRows, CFBD_HOST, CFBD_COACHES_PATH, type SourceRow } from '../../../src/import/index.ts';
import { rng } from '../../generator/helpers.ts';

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const snapshot = Number(flag('--snapshot') ?? 2025);
const plain = args.includes('--plain-teams'); if (plain) args.splice(args.indexOf('--plain-teams'), 1);
const dataDir = resolve(args[0] ?? '/mnt/project-files/data/people');
const outDir = args[1] ? resolve(args[1]) : undefined;
if (outDir && outDir.startsWith(resolve(join(import.meta.dirname, '../../../../..')))) throw new Error('refusing to write a real-name pack inside the repository (A6.3.2)');

function rows(name: string): SourceRow[] {
  const p = join(dataDir, name);
  if (!existsSync(p)) { console.log(`missing ${name}`); return []; }
  const parsed = parseCsv(readFileSync(p, 'utf8'));
  const [head, ...body] = parsed.rows;
  return body.map((r) => Object.fromEntries(head!.map((h, i) => [h, readCell(r[i] ?? '')])));
}

const t0 = performance.now();
const src = {
  nflPlayers: rows('nfl_players.csv'), nflPlayerSeasons: rows('nfl_player_seasons_1999_2025.csv'), nflSnapCounts: rows('nfl_snap_counts_2012_2025.csv'),
  nflHeadCoachSeasons: rows('nfl_head_coach_seasons_1999_2025.csv'), nflOfficials: rows('nfl_officials.csv'),
  collegePlayers: rows('college_players.csv'), collegeRosterSeasons: rows('college_roster_seasons_2010_2026.csv'),
} as Parameters<typeof buildProjectPack>[0];
const keyFile = process.env['CFBD_KEY_FILE'];
if (keyFile && existsSync(keyFile)) {
  const key = readFileSync(keyFile, 'utf8').trim();
  const res = await fetch(`${CFBD_HOST}${CFBD_COACHES_PATH}?minYear=${snapshot - 15}&maxYear=${snapshot}`, { headers: { Authorization: `Bearer ${key}` } });
  if (res.ok) { const c = cfbdCoachRows(await res.json()); src.cfbdCoaches = c; console.log(`CFBD coaches: ${c.people.length}`); } else console.log(`CFBD fetch failed: ${res.status}`);
} else console.log('CFBD key not provided: college coaches stay generated');

const { pack, notes } = buildProjectPack(src, { packId: 'project-people', name: 'Project people (local)', version: String(snapshot), author: 'local build', snapshotSeason: snapshot, teamNames: plain ? 'plain' : 'omitted' });
notes.forEach((n) => console.log(`note: ${n}`));
const files = encodePack(pack);
const dec = decodePack(files, { worldStartYear: snapshot + 1 });
const fails = dec.report.problems.filter((p) => p.severity === 'fail');
const bySev: Record<string, number> = {};
for (const p of dec.report.problems) bySev[`${p.severity}:${p.code}`] = (bySev[`${p.severity}:${p.code}`] ?? 0) + 1;
for (const p of dec.report.problems.filter((x) => x.code === 'duplicate_key' || x.code === 'bad_row').slice(0, 5)) console.log('problem', p.code, p.column ?? '', p.message.replace(/"[^"]*"/g, '"<value>"').slice(0, 160));
console.log('validation', dec.report.status, JSON.stringify(bySev), JSON.stringify(dec.report.counts));
if (outDir) { mkdirSync(outDir, { recursive: true }); for (const f of files) writeFileSync(join(outDir, f.path), f.bytes); console.log(`pack written to ${outDir}`); }

const imp = importPack(files, { worldStartYear: snapshot + 1, rnd: rng(20261126), firstPersonId: 1 });
const league = JSON.parse(readFileSync(join(import.meta.dirname, '../../../../rules-data/data/league/proleague_2026.json'), 'utf8')) as { values: { key: string; value: number }[] };
const limit = league.values.find((v) => v.key === 'roster.active_inactive_limit')!.value;
const pro = imp.preview?.counts['pro.player'] ?? 0;
console.log('import', imp.status, JSON.stringify(imp.preview?.counts), 'edited', imp.preview?.edited);
console.log('gaps', JSON.stringify(imp.preview?.gaps));
console.log('flags', JSON.stringify(imp.preview?.flags));
console.log('links', imp.links?.edges.length, 'family flags', imp.links?.familyFlags.length);
// U3.1.3 acceptance: imported starters (snap share over the starter line last season) average within 3 ISS of 50.
const starters = imp.people.filter((p) => p.mainValue !== null && (p.priorCareer.seasons.filter((s) => s.season === snapshot && s.role === 'player')[0]?.stats['snap_share'] ?? 0) > 0.7);
const sm = starters.reduce((a, p) => a + p.mainValue!, 0) / Math.max(1, starters.length);
console.log(`starters ${starters.length}, mean main-role value ${sm.toFixed(2)} -> ${Math.abs(sm - 50) <= 3 ? 'PASS' : 'FAIL'}`);
console.log(`acceptance: schema failures ${fails.length}; pro players ${pro} vs 32 x ${limit} = ${32 * limit} -> ${pro >= 32 * limit && fails.length === 0 ? 'PASS' : 'FAIL'}`);
console.log(`elapsed ${Math.round(performance.now() - t0)} ms`);
