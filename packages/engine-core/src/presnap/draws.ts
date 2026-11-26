// J5 draw order (J5 "What a builder needs", J13.2.1). Every pre-snap draw of a team comes from stream
// `presnap` (game, play, team) and is taken at the start of the phase in one fixed order: for each
// draw type below, one block per slot 0 to 10 in slot order, whether or not the action happens.
// Adding a motion or a check therefore never shifts another player's draw.
import { SLOTS_PER_TEAM, type StreamSource } from '@gm/schema';

/** Draw types in the J5 order, with the number of values each slot gets and whether they are normal. */
export const DRAW_TYPES = [
  { name: 'substitution', count: 1, normal: false },
  /** Three per slot: the huddle call, a check, an audible (J5 builder note). */
  { name: 'callDelivery', count: 3, normal: false },
  /** Whether the player misaligns, and which form (J4.5.3, J5.2.1). */
  { name: 'alignment', count: 2, normal: false },
  /** Shell, man or zone, box count, pressure alert (J5.4.1). */
  { name: 'preSnapRead', count: 4, normal: false },
  { name: 'protection', count: 1, normal: false },
  { name: 'defensiveCheck', count: 1, normal: false },
  { name: 'disguiseTiming', count: 1, normal: true },
  { name: 'snapMotion', count: 1, normal: true },
] as const;
export type DrawType = (typeof DRAW_TYPES)[number]['name'];

/** One team's pre-snap draws. `get(type, teamSlot, i)` reads the i-th value of that slot's block. */
export interface TeamDraws {
  readonly team: number;
  get(type: DrawType, teamSlot: number, i?: number): number;
  /** Raw 32-bit outputs consumed: fixed for every play, a check on the fixed order. */
  readonly rawDraws: number;
}

const OFFSET: Record<string, number> = {};
const COUNT: Record<string, number> = {};
let total = 0;
for (const t of DRAW_TYPES) { OFFSET[t.name] = total; COUNT[t.name] = t.count; total += t.count * SLOTS_PER_TEAM; }
/** Values in one team's block. */
export const DRAWS_PER_TEAM = total;

/** Takes every draw of one team for one play, in the fixed J5 order. */
export function drawTeam(streams: StreamSource, gameId: number, playNumber: number, team: number): TeamDraws {
  const s = streams('presnap', [gameId, playNumber, team]);
  const values = new Float64Array(DRAWS_PER_TEAM);
  let k = 0;
  for (const t of DRAW_TYPES) {
    for (let slot = 0; slot < SLOTS_PER_TEAM; slot++) {
      for (let i = 0; i < t.count; i++) values[k++] = t.normal ? s.normal() : s.uniform();
    }
  }
  const rawDraws = s.draws;
  return {
    team, rawDraws,
    get(type: DrawType, teamSlot: number, i = 0): number {
      const c = COUNT[type]!;
      if (teamSlot < 0 || teamSlot >= SLOTS_PER_TEAM || i < 0 || i >= c) throw new Error(`draw ${type}[${teamSlot}][${i}] out of range`);
      return values[OFFSET[type]! + teamSlot * c + i]!;
    },
  };
}
