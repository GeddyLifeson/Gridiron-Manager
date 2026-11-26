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
  {
    id: 'uc_flexbone_30', name: 'Flexbone, under center', personnel: '30', shotgun: false, structure: 'two split ends, two slotbacks, one fullback',
    players: [...LINE, P('Q', -0.6, 0, false), P('F', -4, 0, false), P('H', -1.5, -3.5, false), P('Y', -1.5, 3.5, false), P('X', 0, -14, true), P('Z', 0, 14, true)],
    basis: [
      { claim: 'The fullback (B-back) aligns four yards off the ball', status: '1 of 3', sources: ['donovan-veer'] },
      { claim: 'Flexbone: a fullback behind the quarterback, two slotbacks (A-backs) just off the line outside the tackles, two split ends; personnel code 30 counts the slotbacks as backs', status: 'Assumption', sources: [] },
      SPLITS],
  },
  {
    id: 'gun_bunch_right_11', name: 'Gun Trips Bunch Right, 11 personnel', personnel: '11', shotgun: true, structure: '3x1 bunch',
    players: [...LINE, P('Q', -4.5, 0, false), P('R', -4.5, -2.2, false), P('X', 0, -17, true), P('Y', 0, 7, true), P('H', -1, 6, false), P('Z', -1, 8, false)],
    basis: [PERSONNEL,
      { claim: 'Bunch: three receivers in a tight cluster; the point man is number two', status: 'Verified', sources: ['campbell-formations', 'heck-bunch', 'kuchar-bunch-rub'] },
      { claim: 'The two others align a yard behind the point man and a yard to either side', status: '1 of 3', sources: ['yfo-trail'] },
      { claim: 'Where the bunch sits: on the numbers, four yards from the tackle, or tight enough for the point man to block down', status: 'Conflict', sources: ['yfo-trail', 'kuchar-bunch-rub', 'heck-bunch'] },
      { claim: 'The point man five yards outside the tackle is a design value between those sources', status: 'Assumption', sources: [] }],
  },
  {
    id: 'gun_empty_3x2_11', name: 'Gun Empty (3x2), 11 personnel', personnel: '11', shotgun: true, structure: '3x2, no back',
    players: [...LINE, P('Q', -4.5, 0, false), P('X', 0, -17, true), P('R', -1, -8, false), P('H', -1, 6.5, false), P('Y', -1, 11, false), P('Z', 0, 17, true)],
    basis: [PERSONNEL,
      { claim: 'Empty: five eligible receivers split out, the quarterback alone in the backfield, no back to help protect', status: 'Verified', sources: ['campbell-formations', 'cfbtrack-empty', 'fourverts-empty'] },
      { claim: 'The running back splits out as the fifth receiver here (3x2); which personnel goes empty is a design choice', status: 'Assumption', sources: [] },
      SPLITS],
  },
  {
    id: 'uc_goal_line_23', name: 'Goal Line, 23 personnel, under center', personnel: '23', shotgun: false, structure: 'three tight ends, I backs',
    players: [...LINE, P('Q', -0.6, 0, false), P('F', -3.5, 0, false), P('R', -6, 0, false), P('H', 0, -3, true), P('Y', 0, 3, true), P('Z', -1, 4, false)],
    basis: [PERSONNEL,
      { claim: 'On the goal line offenses bring heavy personnel: 23 (three tight ends, two backs), seven blockers on the line, or double-tight three-back sets', status: 'Verified', sources: ['coiner-goalline', 'fdpb-goalline', 'schrader-goalline'] },
      { claim: 'Here Z is the third tight end, aligned as a wing off the right end; the role letter is reused because the formation has no wide receiver', status: 'Assumption', sources: [] },
      SPLITS],
  },
];
