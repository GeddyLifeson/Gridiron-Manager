// Where the officials stand and who rules on what (B11.1.1). The bible gives the starting places in
// words and marks them Unverified; the distances are parameters with basis `assumption` until the
// mechanics manual is read. Officials are placed once, at the snap, in the play frame, and do not
// move during the play: the deep officials cover what happens downfield.
import { OfficialPosition, type PlayTruth, type RulingContext } from '@gm/schema';
import { CREW, type DetectionFamily } from './params.ts';

export interface OfficialSpot {
  readonly position: OfficialPosition;
  /** Index in the contract's position list: the `official` scope field of the `officials` stream (J13.2.1). */
  readonly index: number;
  readonly x: number;
  readonly y: number;
  /** False when this game's crew does not hold the position (B11.1.1 edge case). */
  readonly present: boolean;
}

export const OFFICIAL_POSITIONS: readonly OfficialPosition[] = OfficialPosition.options;

/** Stream index of the replay booth and of replay assist: they follow the seven field officials. */
export const BOOTH_STREAM_INDEX = OFFICIAL_POSITIONS.length;
export const ASSIST_STREAM_INDEX = OFFICIAL_POSITIONS.length + 1;

/** Primary watch of each position by foul family, from the table of B11.1.1 rule 3. */
export const WATCH: Readonly<Record<OfficialPosition, readonly DetectionFamily[]>> = {
  referee: ['roughing_and_safety', 'offensive_holding', 'conduct'],
  umpire: ['offensive_holding', 'pre_snap', 'conduct'],
  down_judge: ['pre_snap'],
  line_judge: ['pre_snap'],
  field_judge: ['defensive_coverage', 'special_teams_blocks'],
  side_judge: ['defensive_coverage', 'special_teams_blocks'],
  back_judge: ['defensive_coverage', 'pre_snap', 'special_teams_blocks'],
};

/** The seven positions for one play, in the field frame. A position the crew lacks is still placed, marked absent. */
export function officialSpots(truth: PlayTruth, ctx: RulingContext): OfficialSpot[] {
  const g = ctx.geometry;
  const num = (name: string) => ctx.params.num(name);
  const dir = truth.attackDir;
  const ox = truth.originX;
  const oy = truth.originY;
  const onField = (x: number) => (x < 0 ? 0 : x > g.lengthYd ? g.lengthYd : x);
  const across = (y: number) => (y < 0 ? 0 : y > g.widthYd ? g.widthYd : y);
  const deep = onField(ox + dir * num(CREW.deepWingDepthYd));
  const place: Record<OfficialPosition, readonly [number, number]> = {
    referee: [onField(ox - dir * num(CREW.refereeDepthYd)), across(oy - dir * num(CREW.refereeOffsetYd))],
    umpire: [onField(ox - dir * num(CREW.umpireDepthYd)), across(oy + dir * num(CREW.refereeOffsetYd))],
    down_judge: [ox, 0],
    line_judge: [ox, g.widthYd],
    field_judge: [deep, g.widthYd],
    side_judge: [deep, 0],
    back_judge: [onField(ox + dir * num(CREW.backJudgeDepthYd)), g.centreY],
  };
  return OFFICIAL_POSITIONS.map((position, index) => ({
    position, index, x: place[position][0], y: place[position][1], present: ctx.crew.positions.includes(position),
  }));
}

export interface View {
  readonly official: OfficialSpot;
  /** The spot lies inside the ruling official's watch zone. */
  readonly covered: boolean;
  /** The position that should have ruled is not in this crew, so another official took it (B11.1.1 edge case). */
  readonly missing: boolean;
}

function nearest(list: readonly OfficialSpot[], x: number, y: number): OfficialSpot | undefined {
  let best: OfficialSpot | undefined;
  let bestD = 0;
  for (const o of list) {
    const d = (o.x - x) * (o.x - x) + (o.y - y) * (o.y - y);
    if (!best || d < bestD) { best = o; bestD = d; }
  }
  return best;
}

/**
 * The official who rules on an act at a spot. For a foul it is the nearest official whose primary
 * watch holds the foul's family; for any other ruling, the nearest official. B11.3.1 rule 4 says
 * that when two officials disagree the one with the better view prevails, so the official with the
 * best view decides alone, and one draw from his stream is the crew's call.
 */
export function viewOf(spots: readonly OfficialSpot[], x: number, y: number, family: DetectionFamily | null, ctx: RulingContext): View {
  const pool = (list: readonly OfficialSpot[]) => {
    const watching = family ? list.filter((o) => WATCH[o.position].includes(family)) : [];
    return watching.length ? watching : list;
  };
  const ideal = nearest(pool(spots), x, y);
  if (!ideal) throw new Error('no official positions');
  const present = spots.filter((o) => o.present);
  const official = ideal.present ? ideal : (nearest(pool(present), x, y) ?? ideal);
  const r = ctx.params.num(CREW.zoneRadiusYd);
  const d = (official.x - x) * (official.x - x) + (official.y - y) * (official.y - y);
  return { official, covered: d <= r * r, missing: !ideal.present };
}
