import type { PackFile } from '../../src/pack/index.ts';

const ENC = new TextEncoder();
export const file = (path: string, text: string): PackFile => ({ path, bytes: ENC.encode(text) });

export const manifest = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    schema_id: 'people_pack', schema_version: 1, pack_id: 'test-pack', name: 'Test pack', version: '1', author: 'tests',
    contains: 'generated', source_statement: 'made by the test suite', ...extra,
  });

export const PEOPLE = 'source_key,name_first,name_last,birth_date\nk1,Ann,Alder,2001-05-04\nk2,Bo,Birch,1990-01-31\n';
export const PLAYING = 'source_key,position,height_in,weight_lb,level\nk1,QB,74,215,pro\nk2,LT,77,310,college\n';

export const basePack = (extra: Record<string, unknown> = {}): PackFile[] => [
  file('pack.json', manifest(extra)),
  file('people.csv', PEOPLE),
  file('playing.csv', PLAYING),
];
