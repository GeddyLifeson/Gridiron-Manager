// Makes a save with the real application services on the Node platform: test fixtures and the
// cross-platform save check (R1.2.1 gate item 2, P1.4.1 acceptance).
import { dirname, resolve } from 'node:path';
import { WorldService } from '@gm/app-services';
import { NodePlatform } from './node-platform.ts';

export async function newSave(args: string[]): Promise<number> {
  const file = args[0];
  if (!file) { console.error('usage: new-save <dir/name> [--seed hex] [--year 2026] [--advance days]'); return 2; }
  const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1]! : d; };
  const p = new NodePlatform(dirname(resolve(file)));
  const name = file.split(/[\\/]/).pop()!.replace(/\.gmsave$/, '');
  const svc = await WorldService.newCareer(p, { saveName: name, masterSeedHex: opt('seed', '00000000c0ffee01').padStart(16, '0'), startSeasonYear: Number(opt('year', '2026')) });
  const adv = Number(opt('advance', '0'));
  for (let i = 0; i < adv; i++) await svc.run('AdvanceDay', { days: 1 });
  console.log(JSON.stringify(svc.worldSummary().data));
  await svc.close();
  return 0;
}
