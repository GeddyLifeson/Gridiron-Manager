// Formations added by the full set (F2, G1.2.2). Same conventions as the starter formations: right-positive lateral,
// five linemen one yard apart, splits and depths are design values (Assumption) because the sources give landmarks, not yardage.
import type { Basis, FormationDef, FormationPlayer } from '../starter/types.ts';

const P = (role: string, px: number, py: number, onLine: boolean): FormationPlayer => ({ role, px, py, onLine });
const LINE: FormationPlayer[] = [P('LT', 0, -2, true), P('LG', 0, -1, true), P('C', 0, 0, true), P('RG', 0, 1, true), P('RT', 0, 2, true)];

const PERSONNEL: Basis = { claim: 'Personnel code is backs then tight ends; receivers are the remainder of five', status: 'Verified', sources: ['frenz-personnel', 'kozora-personnel', 'rollins-personnel'] };
const SPLITS: Basis = { claim: 'Exact splits and depths are design values; coaches align receivers at or near the numbers and slots just outside the hashes', status: 'Assumption', sources: [] };
const ROLES: Basis = { claim: 'X is the split end on the line, Z the flanker off the line, Y the tight end', status: 'Verified', sources: ['haddad-lettering', 'jones-lettering', 'kelly-lettering'] };

export const FULL_FORMATIONS: readonly FormationDef[] = [
  {
    id: 'uc_12_singleback', name: 'Singleback, 12 personnel, under center', personnel: '12', shotgun: false, structure: '2 wide, two tight ends',
    players: [...LINE, P('Q', -0.6, 0, false), P('R', -6, 0, false), P('X', 0, -17, true), P('H', 0, -3, true), P('Y', 0, 3, true), P('Z', -1, 16, false)],
    basis: [PERSONNEL, SPLITS, ROLES],
  },
];
