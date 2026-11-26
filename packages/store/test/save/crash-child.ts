// Child process of the real-kill test: opens (or creates) the career file and plays the scripted
// season from wherever the file stands, until it is killed or the season ends.
import { SaveFile } from '../../src/save/save-file.ts';
import { cleanRun, deps, newSave, resume, seasonScript } from './helpers.ts';
import { NodeSqliteDriver, nodeSqlite } from './node-sqlite-driver.ts';

const [file, weeks] = process.argv.slice(2);
const script = seasonScript(Number(weeks));
const clean = await cleanRun(script);
const driver = new NodeSqliteDriver(nodeSqlite()!, file!);
const exists = (await driver.all<{ c: number }>("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'header'"))[0]!.c > 0
  && (await driver.all('SELECT id FROM header')).length > 0;
const save = exists ? await SaveFile.open(driver, deps()) : await newSave(driver);
process.stdout.write('writing\n');
await resume(save, script, clean);
await save.close();
