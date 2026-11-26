// The film filter (K9.1.1 item 3, N1.1.2, N1.2.1, O2.6.2). A reviewed bridge from the save's play
// record to what one club's film room may hold. Rules:
//  - Positions, facings, move modes and the ball are film: everyone gets them (hidden contest values
//    scrubbed, scrub.ts).
//  - Events are what a camera shows: snap, throw, catch, drop, tackle, fumble, out of bounds, kick
//    landing, whistle, and the officials' flags. Nothing names a fault, a contest winner or a motive.
//  - The viewer's own unit gets its own call exactly (a coach knows his calls). The other unit's
//    coaching-set fields come from the staff chart, with the charter's error rate, or are uncharted.
//  - The base set is exact on film of the viewer's own games and charted at a small error rate on
//    other clubs' film (N1.2.1).
//  - The engine's truth record, the call value and the opponent's called ids never leave this file.
import { stream, tick, type WorldSeed } from '@gm/engine-core';
import { ep } from '@gm/models';
import type { PlayTruth } from '@gm/schema';
import { registerBridge } from '../../observer/index.ts';
import { param } from './params.ts';
import { scrubTrajectory } from './scrub.ts';
import { BASE_FIELDS, COACHING_FIELDS, type AssignmentLine, type BaseField, type Charter, type CoachingField, type FieldSource, type FilmSource, type Side } from './types.ts';
import type { BaseSet, CoachingSet, FilmEvent, FilmRecord } from './schemas.ts';

registerBridge({
  name: 'film.filter',
  leaf: 'K9.1.1 item 3; N1.1.2; N1.2.1; O2.6.2',
  module: 'app-services/src/read-models/film/chart.ts',
  whitelistTest: 'packages/app-services/test/read-models/film/chart.test.ts',
});

export const playIdOf = (gameId: number, playNumber: number): string => `${gameId}:${playNumber}`;

/** Plausible wrong values a charter may write when he misreads a field (content vocabulary, not facts). */
export const DEFAULT_VOCAB: Readonly<Record<CoachingField, readonly string[]>> = {
  personnel: ['10', '11', '12', '13', '20', '21', '22'],
  defPersonnel: ['base', 'nickel', 'dime', 'goal_line'],
  front: ['even', 'odd', 'under', 'over', 'tite'],
  coverage: ['cover0', 'cover1', 'cover2', 'cover3', 'cover4', 'cover6', 'two_man', 'other'],
  pressure: ['none', 'five_man', 'six_man', 'zone_pressure'],
  protection: ['slide', 'man', 'half_slide', 'max'],
  concept: ['quick', 'dropback', 'play_action', 'screen', 'run'],
  runScheme: ['inside_zone', 'outside_zone', 'power', 'counter', 'trap', 'draw'],
  target: [],
};

export interface ChartOptions {
  readonly viewerTeamId: number;
  readonly seed: WorldSeed;
  readonly charter: Charter | null;
  /** True once the staff (or the user) has charted this play's coaching set (N1.6.1 charting time). */
  readonly charted: boolean;
  readonly vocab?: Readonly<Record<CoachingField, readonly string[]>>;
}

/** Side of the viewer's club in this play, or null on other clubs' film. */
export function viewerSide(src: FilmSource, teamId: number): Side | null {
  return src.teams[0] === teamId ? 0 : src.teams[1] === teamId ? 1 : null;
}

const slotOf = (src: FilmSource, personId: number | null | undefined): number | undefined =>
  personId == null ? undefined : src.slots.find((s) => s.personId === personId)?.slot;

/** Visible events on the trajectory's clock (tick 0 is the snap or the kick). */
export function publicEvents(src: FilmSource): FilmEvent[] {
  const tps = src.ticksPerSecond;
  const tk = (t: number) => Math.round(t * tps);
  const out: FilmEvent[] = [];
  const tr: PlayTruth = src.truth;
  let whistleTick: number | null = null;
  for (const e of tr.events) {
    switch (e.type) {
      case 'snap': out.push({ kind: 'snap', tick: tk(e.t), x: src.lineOfScrimmageX, y: centreYOf(src) }); break;
      case 'pass_release': {
        if (e.spike) break;
        const passer = slotOf(src, e.passerId), target = slotOf(src, e.targetId);
        out.push({ kind: 'throw', tick: tk(e.t), x: e.releaseSpot.x, y: e.releaseSpot.y, slots: passer === undefined ? [] : target === undefined ? [passer] : [passer, target] });
        break;
      }
      case 'catch_point': {
        const kind = e.outcome === 'catch' || e.outcome === 'interception' ? 'catch' : e.outcome === 'drop' ? 'drop' : null;
        const who = slotOf(src, e.catcherId ?? e.intendedId);
        if (kind) out.push({ kind, tick: tk(e.t), x: e.spot.x, y: e.spot.y, slots: who === undefined ? [] : [who] });
        break;
      }
      case 'tackle_attempt':
        if (e.outcome === 'made') out.push({ kind: 'tackle', tick: tk(e.t), x: e.spot.x, y: e.spot.y, slots: e.tacklerIds.map((id) => slotOf(src, id)).filter((s): s is number => s !== undefined) });
        break;
      case 'fumble': out.push({ kind: 'fumble', tick: tk(e.t), x: e.spot.x, y: e.spot.y }); break;
      case 'boundary':
        if (e.kind === 'player_out_of_bounds' || e.kind === 'ball_out_of_bounds') out.push({ kind: 'outOfBounds', tick: tk(e.t), x: e.spot.x, y: e.spot.y });
        break;
      case 'kick': out.push({ kind: 'kickLanding', tick: tk(e.t + e.hangTimeS), x: e.landingSpot.x, y: e.landingSpot.y }); break;
      case 'dead_ball': whistleTick = tk(e.t); out.push({ kind: 'whistle', tick: whistleTick, x: e.spot.x, y: e.spot.y }); break;
      default: break; // contests, pressures, mental errors, fouls in truth, injuries, details: not film
    }
  }
  // The officials' flags: the play-by-play row's accepted penalties (the called result). The flag is
  // drawn at the whistle until officiating hands film the throw tick of each flag (CR-G63-3).
  if (src.row.penalties.length && whistleTick !== null) {
    const w = out.find((e) => e.kind === 'whistle')!;
    out.push({ kind: 'flag', tick: whistleTick, x: w.x, y: w.y });
  }
  return out.sort((a, b) => a.tick - b.tick);
}

/** Where the ball sat at the snap, from the first stored frame (format 1); the field centre otherwise. */
function centreYOf(src: FilmSource): number {
  try {
    const first = tick.decodeTrajectory(src.trajectory)[0];
    if (first) return first.ball.y;
  } catch { /* fixture formats without a ball spot */ }
  return 0;
}

function baseExact(src: FilmSource, perspectiveTeam: number): BaseSet {
  const r = src.row;
  const off = src.calls.snapping;
  const offenseTeam = src.teams[r.offense as Side];
  const odk: BaseSet['odk'] = r.kickKind !== null || off.unit === 'kick' ? 'K' : offenseTeam === perspectiveTeam ? 'O' : 'D';
  const pass = r.dropback;
  const offCall = off.unit === 'offense' ? off : null;
  const backs = offCall ? Number(offCall.personnelCode[0]) : null;
  const measured: ep.MeasuredPlay | null = r.down !== null && r.distanceYd !== null
    ? { down: r.down, distanceYd: r.distanceYd, yardsGained: r.yardsGained, pass, epa: (r.epAfter ?? 0) - (r.epBefore ?? 0), kneelOrSpike: r.offenseKind === 'kneel' || r.offenseKind === 'spike', turnover: r.interception || r.fumbleLost, negative: r.yardsGained < 0 }
    : null;
  return {
    quarter: r.period,
    odk,
    down: r.down,
    distance: r.distanceYd,
    yardLine: r.ballOnYd,
    hash: src.hash,
    gainLoss: r.yardsGained,
    playType: r.kickKind ?? r.offenseKind ?? r.playKind,
    playDirection: r.runLocation ?? r.passLocation,
    result: r.resultType,
    motionDirection: offCall ? (offCall.motionId ? 'motion' : 'none') : null,
    offFormation: offCall?.formationId ?? null,
    backfield: backs === null || Number.isNaN(backs) ? null : `${backs}-back`,
    offStrength: offCall?.strength ?? null,
    series: r.driveNumber,
    efficiency: measured && !measured.kneelOrSpike ? ep.isSuccess(measured, ep.defaultDefinitions().success) : null,
  };
}

/** The base set as this club's film room holds it (N1.2.1). */
export function baseSet(src: FilmSource, opts: ChartOptions): BaseSet {
  const side = viewerSide(src, opts.viewerTeamId);
  const perspective = side === null ? src.teams[src.row.offense as Side] : opts.viewerTeamId;
  const exact = baseExact(src, perspective);
  if (side !== null) return exact;
  // Other clubs' film: each field is misread at the small base rate.
  const s = stream(opts.seed, 'film.chart.base', [src.gameId, src.playNumber, opts.viewerTeamId]);
  const out: Record<string, unknown> = { ...exact };
  const rate = param('chart.baseErrorRate');
  for (const f of BASE_FIELDS) {
    const miss = s.chance(rate);
    const pick = s.uniform();
    if (miss) out[f] = misread(f, exact[f], pick);
  }
  return out as BaseSet;
}

/** A plausible wrong value for a base-set field: a number off by one, a direction swapped, a flag flipped. */
function misread(f: BaseField, v: unknown, u: number): unknown {
  if (v === null) return v;
  if (typeof v === 'boolean') return !v;
  if (typeof v === 'number') return f === 'quarter' || f === 'down' || f === 'series' ? Math.max(1, v + (u < 0.5 ? -1 : 1)) : v + (u < 0.5 ? -1 : 1);
  if (f === 'hash' || f === 'playDirection') { const opts = ['left', 'middle', 'right'].filter((x) => x !== v); return opts[Math.floor(u * opts.length)]; }
  return v; // free text (formation, play type, result) is read off the scoreboard and the call sheet
}

/** Exact coaching-set values of each unit, from the calls. Used only for the viewer's own unit. */
function coachingExact(src: FilmSource): { offense: Record<CoachingField, string | null>; defense: Record<CoachingField, string | null> } {
  const snap = src.calls.snapping, opp = src.calls.opposing;
  const empty = (): Record<CoachingField, string | null> => Object.fromEntries(COACHING_FIELDS.map((f) => [f, null])) as Record<CoachingField, string | null>;
  const offense = empty(), defense = empty();
  if (snap.unit === 'offense') {
    offense.personnel = snap.personnelCode;
    offense.protection = snap.protectionId;
    offense.concept = snap.playContentId ?? snap.kind;
    offense.runScheme = snap.kind === 'run' || snap.kind === 'draw' ? (snap.playContentId ?? snap.kind) : null;
    const rel = src.truth.events.find((e) => e.type === 'pass_release');
    const tgt = rel && rel.type === 'pass_release' ? src.slots.find((s) => s.personId === rel.targetId) : undefined;
    offense.target = tgt ? `#${tgt.jersey} ${tgt.role}` : null;
  }
  if (opp.unit === 'defense') {
    defense.defPersonnel = opp.packageId;
    defense.front = opp.frontId;
    defense.coverage = opp.coverageId ?? opp.coverageFamily;
    defense.pressure = opp.pressureId ?? 'none';
  }
  return { offense, defense };
}

const OFFENSE_FIELDS: readonly CoachingField[] = ['personnel', 'protection', 'concept', 'runScheme', 'target'];
const DEFENSE_FIELDS: readonly CoachingField[] = ['defPersonnel', 'front', 'coverage', 'pressure'];

/** The coaching set as this club holds it: own unit from the call, the other unit charted (N1.2.1). */
export function coachingSet(src: FilmSource, opts: ChartOptions): CoachingSet {
  const side = viewerSide(src, opts.viewerTeamId);
  const exact = coachingExact(src);
  const offenseSide = src.row.offense as Side;
  const vocab = opts.vocab ?? DEFAULT_VOCAB;
  const s = stream(opts.seed, 'film.chart.coaching', [src.gameId, src.playNumber, opts.viewerTeamId]);
  const values = {} as Record<CoachingField, string | null>;
  const sources = {} as Record<CoachingField, FieldSource>;
  for (const f of COACHING_FIELDS) {
    const isOffenseField = OFFENSE_FIELDS.includes(f);
    const unitSide: Side = isOffenseField ? offenseSide : ((1 - offenseSide) as Side);
    const truthValue = isOffenseField ? exact.offense[f] : DEFENSE_FIELDS.includes(f) ? exact.defense[f] : null;
    // Draw for every field every time, so charting one more field never moves another (J13.2.1).
    const hit = s.uniform(), pick = s.uniform();
    if (side === unitSide) { values[f] = truthValue; sources[f] = 'call'; continue; }
    if (!opts.charted || !opts.charter) { values[f] = null; sources[f] = 'uncharted'; continue; }
    sources[f] = 'staff';
    if (truthValue === null || hit < opts.charter.accuracy) { values[f] = truthValue; continue; }
    const wrong = vocab[f].filter((v) => v !== truthValue);
    values[f] = wrong.length ? wrong[Math.floor(pick * wrong.length)]! : truthValue;
  }
  return { values, sources };
}

/** Called assignment lines of the viewer's own unit; none for the other unit (N1.1.2 rules). */
export function ownAssignments(src: FilmSource, teamId: number): AssignmentLine[] {
  const side = viewerSide(src, teamId);
  if (side === null) return [];
  return src.assignments.filter((a) => src.slots.find((s) => s.slot === a.slot)?.side === side);
}

/** The whole film record of one play for one club. The only way a play reaches a film screen. */
export function filmRecord(src: FilmSource, opts: ChartOptions): FilmRecord {
  const side = viewerSide(src, opts.viewerTeamId);
  return {
    playId: playIdOf(src.gameId, src.playNumber),
    gameId: src.gameId,
    playNumber: src.playNumber,
    kind: src.kind,
    teams: [src.teams[0], src.teams[1]],
    viewerSide: side,
    ticksPerSecond: src.ticksPerSecond,
    trajectory: scrubTrajectory(src.trajectory),
    slots: src.slots.map((s) => ({ slot: s.slot, side: s.side, personId: s.personId, jersey: s.jersey, role: s.role })),
    events: publicEvents(src),
    situation: { lineOfScrimmageX: src.lineOfScrimmageX, lineToGainX: src.lineToGainX, attackDir: src.truth.attackDir === 1 ? 1 : -1, offenseSide: src.row.offense as Side },
    base: baseSet(src, opts),
    coaching: coachingSet(src, opts),
    assignments: ownAssignments(src, opts.viewerTeamId).map((a) => ({ slot: a.slot, words: a.words, points: a.points.map((p) => ({ x: p.x, y: p.y })), author: 'call' as const })),
    epa: src.row.epBefore !== null && src.row.epAfter !== null ? src.row.epAfter - src.row.epBefore : null,
    clockTenths: src.row.clockTenths,
    offenseMargin: src.row.scoreOffense - src.row.scoreDefense,
  };
}
