// The six evidence families (E9.1.1), the duty families of S3.1.1 and their evidence map (S8.1.1 rule 2),
// and which families each rung can produce (E9.5.1, S8.1.1 rule 3). Nothing here measures a coach: it
// says which logged events may enter his record.

/** E9.1.1 families, numbered as the leaf numbers them. Nothing else is measured. */
export const FAMILIES = ['decisions', 'unit_results', 'teaching', 'work_products', 'evaluations', 'conduct'] as const;
export type FamilyId = (typeof FAMILIES)[number];

/** E9.1.1 family number (1 to 6) for screens that cite the leaf. */
export function familyNumber(f: FamilyId): number { return FAMILIES.indexOf(f) + 1; }

export function isFamily(x: string): x is FamilyId { return (FAMILIES as readonly string[]).includes(x); }

/** S3.1.1 duty families (ownership matrix rows), as ids. */
export const DUTY_FAMILIES = [
  'charting', 'film_tagging', 'scout_cards', 'tendency_reports', 'game_management_charts', 'drills',
  'position_meetings', 'player_grades', 'depth_chart', 'recruiting', 'plan_slice', 'side_game_plan',
  'play_calling', 'staff_management', 'staff_hiring', 'playbook_drawings', 'personnel_reports', 'academics_conduct',
] as const;
export type DutyFamilyId = (typeof DUTY_FAMILIES)[number];

export function isDutyFamily(x: string): x is DutyFamilyId { return (DUTY_FAMILIES as readonly string[]).includes(x); }

/**
 * S8.1.1 rule 2 duty-to-evidence map. Rows S8.1.1 lists are copied; the four S3.1.1 rows S8.1.1 does not
 * list (staff hiring, playbook drawings, personnel reports, academics and conduct) are mapped by the
 * nearest S8.1.1 row: hiring with managing assistants (6), drawings and install sheets with work products
 * (4, truth or boss graded per S3.1.1), personnel reports with evaluations (5), academics and conduct with
 * conduct (6). Those four are this module's reading (README decision 2).
 * `fromRung`: an evidence family that the duty adds only from a rung up (S8.1.1 "From coordinator up").
 */
export interface DutyEvidence { readonly family: FamilyId; readonly fromRung?: number }

export const DUTY_EVIDENCE: Readonly<Record<DutyFamilyId, readonly DutyEvidence[]>> = {
  charting: [{ family: 'work_products' }],
  film_tagging: [{ family: 'work_products' }],
  scout_cards: [{ family: 'work_products' }],
  tendency_reports: [{ family: 'work_products' }],
  game_management_charts: [{ family: 'work_products' }],
  drills: [{ family: 'teaching' }],
  position_meetings: [{ family: 'teaching' }],
  player_grades: [{ family: 'evaluations' }],
  depth_chart: [{ family: 'evaluations' }, { family: 'conduct' }],
  recruiting: [{ family: 'evaluations' }, { family: 'conduct' }],
  plan_slice: [{ family: 'work_products' }, { family: 'unit_results', fromRung: 7 }],
  side_game_plan: [{ family: 'work_products' }, { family: 'unit_results', fromRung: 7 }],
  play_calling: [{ family: 'decisions' }, { family: 'unit_results' }],
  staff_management: [{ family: 'conduct' }],
  staff_hiring: [{ family: 'conduct' }],
  playbook_drawings: [{ family: 'work_products' }],
  personnel_reports: [{ family: 'evaluations' }],
  academics_conduct: [{ family: 'conduct' }],
};

/** The seat a person held at an event's date, as far as the record needs it (S1.1.1 JobRecord subset). */
export interface SeatAt {
  readonly rung: number;
  /** Calls plays for his side (rung 7 adds the play-calling part of family 1 only then, E9.5.1 rule 4). */
  readonly callsPlays: boolean;
  /** The college general manager seat at rung 7 (S1): family 5 only, no coaching family (E9.5.1 rule 4). */
  readonly collegeGm?: boolean;
  /**
   * Duty families the seat owns or recommends (S3.1.1 marks O and R). Observe-only duties are left out:
   * nothing of his is used, so they produce no evidence (S8.1.1 rule 4). Null when the caller does not
   * know the seat's duty set; the rung table alone then gates.
   */
  readonly duties: readonly DutyFamilyId[] | null;
}

/** What part of family 1 a rung allows: none, recommendations only, play calls only, or all decisions. */
export type DecisionScope = 'none' | 'recommendations' | 'play_calls' | 'all';

export interface RungFamilies {
  readonly families: ReadonlySet<FamilyId>;
  readonly decisions: DecisionScope;
}

/**
 * E9.5.1 table (S8.1.1 rule 3 repeats it). Rungs 0 to 3: family 4 and a little of 5. Rungs 4 and 5: 3, 4,
 * 5 and part of 6. Rung 6: adds plan sections and their results (work products already in 4; their
 * results are logged as work-product events, not unit results, until rung 7). Rung 7: adds 2 for his side
 * and the play-calling part of 1 if he calls plays. Rungs 8 and 9: all six.
 * Below head coach a game-management recommendation enters family 1 as a recommendation (S8.1.1 table,
 * E9.4.3 rule 2) from rung 3, where game-management charts are owned (S3.1.1).
 */
export function familiesForSeat(seat: SeatAt): RungFamilies {
  const r = seat.rung;
  if (seat.collegeGm) return { families: new Set<FamilyId>(['evaluations']), decisions: 'none' };
  if (r >= 8) return { families: new Set<FamilyId>(FAMILIES), decisions: 'all' };
  const f = new Set<FamilyId>(['work_products', 'evaluations']);
  if (r >= 4) { f.add('teaching'); f.add('conduct'); }
  let decisions: DecisionScope = r >= 3 ? 'recommendations' : 'none';
  if (r >= 7) {
    f.add('unit_results');
    if (seat.callsPlays) decisions = 'play_calls';
  }
  if (decisions !== 'none') f.add('decisions');
  return { families: f, decisions };
}

/** Families a duty set can feed at a rung (S8.1.1 map), for the week screen's hover line. */
export function familiesForDuties(duties: readonly DutyFamilyId[], rung: number): FamilyId[] {
  const out = new Set<FamilyId>();
  for (const d of duties) for (const e of DUTY_EVIDENCE[d]) if (e.fromRung === undefined || rung >= e.fromRung) out.add(e.family);
  return FAMILIES.filter((f) => out.has(f));
}
