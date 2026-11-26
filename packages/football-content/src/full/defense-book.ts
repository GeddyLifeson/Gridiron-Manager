// Defensive calls added with the starter books (books.ts). Nickel Cover 3 is the starter Cover 3 rebuilt for the
// 4-2-5: the nickel back replaces the Sam. Assignments follow the one page read that draws it player by player
// (fourverts-425, read 2026-11-26 for the books): the nickel ("rover") and the strong safety are the flat
// defenders, the two linebackers the hook/curl zones, the corners and the free safety the deep thirds.
import { DEFENSE as STARTER_DEFENSE } from '../starter/index.ts';
import type { Basis, DefenseDef, Slot } from '../starter/types.ts';

const base = STARTER_DEFENSE.find((d) => d.id === 'def_cover3_sky')!;
const byRole = (r: string): Slot => base.slots.find((s) => s.role === r)!;
const c = 'nickelCover3';
const re = (s: Slot, over: Partial<Slot>): Slot => ({ ...s, ...over, concept: c, params: { ...(s.params ?? {}), ...(over.params ?? {}) } });

const NICKEL: Basis = { claim: 'Nickel is five defensive backs; the 4-2-5 swaps a linebacker for the nickel back (the slot corner)', status: 'Verified', sources: ['dudko-nickel', 'haddad-nickel', 'mascolo-nickel'] };

function nickelCover3(): DefenseDef {
  const line = base.slots.filter((s) => ['LDE', 'LDT', 'RDT', 'RDE'].includes(s.role)).map((s) => ({ ...s, concept: c }));
  const ss = byRole('SS'), sam = byRole('SAM'), will = byRole('WILL'), mike = byRole('MIKE');
  return {
    id: 'def_nickel_cover3', name: 'Nickel Cover 3', coverageFamily: 'cover3', package: '4-2-5 nickel, three-deep four-under zone', rushers: 4, boxCount: 6, drawnAgainst: 'gun_2x2_11',
    intent: 'Cover 3 from the nickel: the nickel back and the strong safety take the flats, the two linebackers the hooks, the corners and the free safety the deep thirds. Lighter box than base Cover 3; weak spot is the seam between the flat and hook defenders.',
    slots: [
      ...line,
      re(mike, { params: { zone: 'hookLeft' }, at: [4.5, -1.5] }),
      re(will, { role: 'WILL', params: { zone: 'hookRight', depth: 11, landmark: 'hashOutside' }, at: [4.5, 1.5], rule: 'lb:over:rightHook' }),
      re(sam, { role: 'NB', params: { zone: 'curlFlatRight' }, at: [5, 6], rule: 'rcv:2:right:5:inside' }),
      re(ss, { params: { zone: 'curlFlatLeft', depth: 11, landmark: 'numbersTop' }, at: [5, -6], rule: 'rcv:2:left:5:inside' }),
      ...base.slots.filter((s) => ['LCB', 'RCB', 'FS'].includes(s.role)).map((s) => ({ ...s, concept: c })),
    ],
    basis: [
      NICKEL,
      { claim: 'Cover 3: three-deep, four-under zone; rush four, drop seven; both corners take the outside thirds, the free safety the deep middle', status: 'Verified', sources: ['bowen-cover3', 'schalter-cover2', 'steelersdepot-coverages', '33rd-coverage'] },
      { claim: 'In 4-2-5 Cover 3 the nickel (rover) and the strong safety are the flat defenders and the two linebackers the hook/curl zones; nickel aligned about 5 yd off the line', status: '1 of 3', sources: ['fourverts-425'] },
      { claim: 'Drop depths (11 yd) and the box count are carried from the starter Cover 3; no nickel source gives them', status: 'Assumption', sources: [] },
    ],
  };
}

export const BOOK_DEFENSE: readonly DefenseDef[] = [nickelCover3()];
