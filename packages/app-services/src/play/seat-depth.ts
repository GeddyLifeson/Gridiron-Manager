// The user's depth chart in the seat's played game (M2.1, M2.2, M2.4, I6.1). The depth chart screen
// (read-models depth-chart) owns the chart; this file turns it into the seat team the engine plays.
//
// Units. Each call takes its chart unit: offense the package its personnel names (`off:<code>`) or the base
// offense; defense the package whose trigger names the offense's personnel (M2.2.1 rule 3) or the base defense;
// a kick or return call the special-teams unit for its kind (punt, field goal and try, kickoff; punt return,
// kick return, blocks). The engine reads these through the depth keys `offense:<code>`, `kick:<kind>` and
// `return:<kind>` (chart caller `depthRoster`) and the plain unit keys as the fallback. A kind the chart has no
// unit for plays the unit's default (the kickoff unit, else the first kick unit; the first return unit), and an
// engine unit the chart does not cover at all keeps the placeholder eleven.
//
// Slots. The engine's content port places a unit's eleven by list order (world season tick-content.ts:
// OFFENSE_ROLES, DEFENSE_ROLES, KICK_ROLES, RETURN_ROLES), so the chart's starters are put in slot order: a job
// whose label names the slot takes it (LT to LT, QB to Q, NB, which maps to SAM, to SAM), then each open slot
// takes the first unplaced starter whose position group fits it, then anyone left. The aliases and group fits
// are ASSUMPTIONS (A5.2.1) about how chart job labels read; who starts is always the chart's (G-56 lineupFor).
//
// Ratings. With a `playerOf` source (a generated world's people, `simPlayerFromPerson`) each person plays with
// his own attributes, measurables, drill results and long-term load. Without one, the placeholder values.
import { depth } from '@gm/league';
import { ATTRIBUTE_IDS, type PersonRecord, type SimPlayer, type SimTeam } from '@gm/schema';
import { simDepthFor, unitOrder, availability, type DepthChartInput } from '../read-models/depth-chart/index.ts';
import type { LineupFor } from '../commands/game-calling/index.ts';

/** What the session needs of the depth chart screen's input, plus where each person's game ratings come from. */
export type SeatDepth = Pick<DepthChartInput, 'chart' | 'defs' | 'people' | 'actives'> & {
  /** A person as the engine reads him (his own ratings), or null for the placeholder values. */
  readonly playerOf?: (personId: number) => SimPlayer | null;
};

const ENGINE_UNITS = ['offense', 'defense', 'kick', 'return'] as const;
type EngineUnit = typeof ENGINE_UNITS[number];

const KICK_KINDS = ['punt', 'field_goal', 'try_kick', 'kickoff', 'onside_kick', 'safety_kick', 'fair_catch_kick'] as const;
const RETURN_KINDS = ['punt_return', 'punt_block', 'kick_return', 'hands_team', 'field_goal_block', 'try_block'] as const;

/** Chart unit id patterns for each kick and return kind, most specific first. */
const KIND_UNIT: Readonly<Record<string, readonly RegExp[]>> = {
  punt: [/punt(?!.*(return|block))/],
  field_goal: [/field|fg/, /pat|extra|try/], try_kick: [/pat|extra|try/, /field|fg/],
  kickoff: [/kickoff(?!.*return)/], onside_kick: [/onside/, /kickoff(?!.*return)/], safety_kick: [/kickoff(?!.*return)/], fair_catch_kick: [/kickoff(?!.*return)/],
  punt_return: [/punt.*return|pr$/], punt_block: [/punt.*(block|rush)/, /punt.*return/],
  kick_return: [/kick.*return|kr$/], hands_team: [/hands|onside.*return/, /kick.*return/],
  field_goal_block: [/(field|fg).*block|block/], try_block: [/(pat|try|extra).*block|block/],
};

/** Content port slot order per engine unit (world season tick-content.ts). */
export const SLOTS: Readonly<Record<EngineUnit, readonly string[]>> = {
  offense: ['LT', 'LG', 'C', 'RG', 'RT', 'Q', 'R', 'X', 'Z', 'Y', 'H'],
  defense: ['LDE', 'LDT', 'RDT', 'RDE', 'MIKE', 'WILL', 'SAM', 'LCB', 'RCB', 'SS', 'FS'],
  kick: ['LS', 'LG', 'RG', 'LT', 'RT', 'LE', 'RE', 'LW', 'RW', 'H', 'K'],
  return: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'KR'],
};

type G = depth.PositionGroup;
/** Job labels that name a slot (upper case), and the position groups that may fill it, best first. ASSUMPTION. */
function slotRule(unit: EngineUnit, slot: string, kind: string | null): { names: readonly string[]; groups: readonly G[] } {
  const OL: G[] = ['ol'], line: G[] = ['ol', 'dl', 'lb', 'te'], end: G[] = ['te', 'wr', 'db', 'rb'], wing: G[] = ['lb', 'db', 'rb', 'te'];
  switch (unit) {
    case 'offense': return ({
      LT: { names: ['LT'], groups: OL }, LG: { names: ['LG'], groups: OL }, C: { names: ['C'], groups: OL }, RG: { names: ['RG'], groups: OL }, RT: { names: ['RT'], groups: OL },
      Q: { names: ['QB', 'Q'], groups: ['qb'] }, R: { names: ['RB', 'R', 'HB', 'TB'], groups: ['rb'] },
      X: { names: ['X'], groups: ['wr'] }, Z: { names: ['Z'], groups: ['wr'] }, Y: { names: ['Y', 'TE'], groups: ['te', 'wr'] },
      H: { names: ['H', 'SLOT', 'F', 'FB'], groups: ['wr', 'te', 'rb'] },
    } as Record<string, { names: string[]; groups: G[] }>)[slot]!;
    case 'defense': return ({
      LDE: { names: ['LDE', 'LE', 'DE'], groups: ['dl'] }, LDT: { names: ['LDT', 'DT', 'UT', '3T'], groups: ['dl'] },
      RDT: { names: ['RDT', 'NT', '1T', 'N'], groups: ['dl'] }, RDE: { names: ['RDE', 'RE'], groups: ['dl'] },
      MIKE: { names: ['MIKE', 'MLB', 'M'], groups: ['lb'] }, WILL: { names: ['WILL', 'W'], groups: ['lb'] }, SAM: { names: ['SAM', 'S'], groups: ['lb', 'db'] },
      LCB: { names: ['LCB', 'CB'], groups: ['db'] }, RCB: { names: ['RCB'], groups: ['db'] }, SS: { names: ['SS'], groups: ['db'] }, FS: { names: ['FS'], groups: ['db'] },
    } as Record<string, { names: string[]; groups: G[] }>)[slot]!;
    case 'kick': {
      const punt = kind === 'punt', fg = kind === 'field_goal' || kind === 'try_kick';
      return ({
        LS: { names: ['LS'], groups: ['ls'] }, LG: { names: ['LG', 'PLG'], groups: line }, RG: { names: ['RG', 'PRG'], groups: line },
        LT: { names: ['LT', 'PLT'], groups: line }, RT: { names: ['RT', 'PRT'], groups: line }, LE: { names: ['LE', 'G1'], groups: end }, RE: { names: ['RE', 'G2'], groups: end },
        LW: { names: ['LW'], groups: wing }, RW: { names: ['RW'], groups: wing },
        H: { names: punt ? ['PP', 'H'] : ['H', 'HOLDER'], groups: fg ? ['p', 'qb', 'k'] : wing },
        K: { names: punt ? ['P'] : ['K'], groups: punt ? ['p', 'k'] : ['k', 'p'] },
      } as Record<string, { names: string[]; groups: G[] }>)[slot]!;
    }
    default: return slot === 'KR' ? { names: ['KR', 'PR', 'R'], groups: ['wr', 'db', 'rb'] } : { names: [slot], groups: [] };
  }
}

/** The chart's starters of one unit (job to person), placed in the engine unit's slot order. */
export function slotOrder(unit: EngineUnit, kind: string | null, lineup: Readonly<Record<string, number>>, jobs: readonly depth.JobDef[], groupOf: (id: number) => G | undefined): number[] {
  const labelOf = (job: string) => (jobs.find((j) => j.job === job)?.mapsTo ?? job).toUpperCase();
  const left = Object.entries(lineup).map(([job, id]) => ({ label: labelOf(job), id }));
  const placed: (number | null)[] = SLOTS[unit].map(() => null);
  const take = (i: number, k: number) => { placed[i] = left[k]!.id; left.splice(k, 1); };
  const rules = SLOTS[unit].map((s) => slotRule(unit, s, kind));
  // 1. A job named for the slot (first alias wins over later ones across all slots).
  for (let i = 0; i < placed.length; i++) {
    for (const name of rules[i]!.names) { const k = left.findIndex((x) => x.label === name); if (k >= 0) { take(i, k); break; } }
  }
  // 2. The first unplaced starter whose position group fits, best-fitting group first.
  for (let i = 0; i < placed.length; i++) {
    if (placed[i] !== null) continue;
    for (const g of rules[i]!.groups) { const k = left.findIndex((x) => groupOf(x.id) === g); if (k >= 0) { take(i, k); break; } }
  }
  // 3. Anyone left, in chart order.
  for (let i = 0; i < placed.length; i++) if (placed[i] === null && left.length) take(i, 0);
  return placed.filter((x): x is number => x !== null);
}

export interface EngineUnitMap {
  /** Default chart unit per engine unit (null: placeholder eleven). */
  readonly base: Record<EngineUnit, string | null>;
  /** Chart unit per kick and return kind (only kinds the chart has a unit for). */
  readonly kinds: Readonly<Record<string, string>>;
  /** Offensive personnel packages: code to chart unit. */
  readonly offense: Readonly<Record<string, string>>;
  /** Defensive packages by offensive personnel they answer (trigger), code to chart unit. */
  readonly defense: Readonly<Record<string, string>>;
}

/** Which chart unit plays each engine unit and each kick, return and personnel variant. */
export function engineUnits(defs: readonly depth.UnitDef[]): EngineUnitMap {
  const order = unitOrder(defs).map((id) => depth.unitDef(defs, id));
  const side = (s: depth.UnitSide) => order.filter((d) => depth.unitSide(d.unitId) === s);
  const st = side('st');
  const isReturn = (d: depth.UnitDef) => /return|block|rush|hands|pr$|kr$/.test(d.unitId);
  const kickUnits = st.filter((d) => !isReturn(d)), returnUnits = st.filter(isReturn);
  const kinds: Record<string, string> = {};
  for (const kind of [...KICK_KINDS, ...RETURN_KINDS]) {
    const pool = (KICK_KINDS as readonly string[]).includes(kind) ? kickUnits : returnUnits;
    for (const re of KIND_UNIT[kind] ?? []) { const d = pool.find((u) => re.test(u.unitId)); if (d) { kinds[kind] = d.unitId; break; } }
  }
  const offense: Record<string, string> = {}, defense: Record<string, string> = {};
  for (const d of side('off')) { const m = /^off:(\d\d)$/.exec(d.unitId); if (m) offense[m[1]!] = d.unitId; }
  for (const d of side('def')) for (const code of d.trigger?.personnel ?? []) defense[code] ??= d.unitId;
  return {
    base: {
      offense: side('off').find((d) => d.base === undefined)?.unitId ?? null,
      defense: side('def').find((d) => d.base === undefined)?.unitId ?? null,
      kick: kinds['kickoff'] ?? kickUnits[0]?.unitId ?? null,
      return: kinds['kick_return'] ?? returnUnits[0]?.unitId ?? null,
    },
    kinds, offense, defense,
  };
}

export interface SeatTeam {
  readonly team: SimTeam;
  /** The console's lineup for a call: the chart unit for the call, in slot order. */
  readonly lineup: LineupFor;
  readonly units: EngineUnitMap;
}

/** A world person as the engine reads him at kickoff: his own ratings, fresh for the day, carrying his long-term load (D10.1.1). */
export function simPlayerFromPerson(p: PersonRecord, seasonYear: number): SimPlayer | null {
  const pl = p.playing;
  if (!pl) return null;
  const attributes: Record<string, number> = {};
  for (const a of ATTRIBUTE_IDS) attributes[a] = pl.attributes[a] ?? 0;
  return {
    playerId: p.id, position: pl.position, jersey: pl.lastJersey ?? p.id % 100, heightIn: pl.heightIn, weightLb: pl.weightLb,
    // D1.1.1: age for football is age on September 1 of the season.
    ageYears: Math.max(0, seasonYear - p.birthDate.seasonYear), attributes, tests: pl.tests,
    gameDay: {
      freshness: 1, freshnessLongTerm: pl.freshnessLongTerm, conditioning: pl.conditioning, playingHurt: [], knowledge: {},
      snapsThisGame: 0, requiredAbsenceDowns: 0, ejected: false, unavailable: false,
    },
  };
}

/**
 * The seat's team for one game: `base` (the placeholder team the real game built) with the chart's players in
 * every engine unit the chart covers. Throws when a unit the chart covers cannot field a full side.
 */
export function seatTeamFromDepth(base: SimTeam, d: SeatDepth): SeatTeam {
  const units = engineUnits(d.defs);
  const available = availability(d);
  const perUnit = (base.depth['offense'] ?? []).length || 11;
  const group = new Map(d.people.map((p) => [p.personId, p.group]));
  const ordered = (unit: EngineUnit, unitId: string, kind: string | null): number[] => {
    const r = depth.lineupFor(depth.resolveUnit(d.chart, d.defs, unitId), available);
    const n = Object.keys(r.lineup).length;
    if (n < perUnit) throw new Error(`season session: depth chart unit ${unitId} fields ${n} of ${perUnit} (empty: ${r.gaps.join(', ') || 'none'})`);
    return slotOrder(unit, kind, r.lineup, depth.unitDef(d.defs, unitId).jobs, (id) => group.get(id)).slice(0, perUnit);
  };
  const out: Record<string, number[]> = { ...simDepthFor(d) };
  const players = new Map<number, SimPlayer>();
  for (const u of ENGINE_UNITS) {
    const unitId = units.base[u];
    if (unitId === null) {
      const ids = base.depth[u] ?? [];
      for (const p of base.players) if (ids.includes(p.playerId)) players.set(p.playerId, p);
      out[u] = [...ids];
    } else out[u] = ordered(u, unitId, u === 'kick' ? 'kickoff' : u === 'return' ? 'kick_return' : null);
  }
  for (const [code, unitId] of Object.entries(units.offense)) out[`offense:${code}`] = ordered('offense', unitId, null);
  for (const [code, unitId] of Object.entries(units.defense)) out[`defense:${code}`] = ordered('defense', unitId, null);
  for (const [kind, unitId] of Object.entries(units.kinds)) {
    const u: EngineUnit = (KICK_KINDS as readonly string[]).includes(kind) ? 'kick' : 'return';
    out[`${u}:${kind}`] = ordered(u, unitId, kind);
  }
  const template = base.players[0]!;
  const placeholder = (id: number): SimPlayer => ({
    ...template, playerId: id, position: group.get(id) ?? template.position, jersey: id % 100,
    attributes: { ...template.attributes }, gameDay: { ...template.gameDay, playingHurt: [], knowledge: {} },
  });
  for (const ids of Object.values(out)) for (const id of ids) if (!players.has(id)) players.set(id, d.playerOf?.(id) ?? placeholder(id));
  const team: SimTeam = { ...base, players: [...players.values()], depth: out };
  // Same lookup as the chart caller's depthRoster: the kind, then the personnel, then the unit.
  const lineup: LineupFor = (unit, personnelCode, detail) => {
    const ids = (detail ? out[`${unit}:${detail}`] : undefined) ?? (personnelCode ? out[`${unit}:${personnelCode}`] : undefined) ?? out[unit] ?? [];
    return ids.slice(0, perUnit).map((playerId) => ({ playerId, role: unit }));
  };
  return { team, lineup, units };
}
