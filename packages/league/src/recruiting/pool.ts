// T4.1.1 the prospect pool and the class year; T4.1.2 junior college prospects; T4.4.2 the circle.
// The body and true quality of each prospect come from the person generator (G-17) through
// `ProspectFactory`; this file decides how many, where, at which position, the public star rating,
// preferences, the circle, the academic record and the commitment threshold.
import regionsJson from './data/regions.json' with { type: 'json' };
import shapeJson from './data/roster-shape.json' with { type: 'json' };
import { clamp, type ProspectFactory, type StreamFor } from './context.ts';
import { P } from './params.ts';
import { prospectsChanged } from './indexes.ts';
import {
  POSITION_GROUPS, PREFERENCE_KEYS,
  type CircleMember, type CircleRelation, type Edge, type PositionGroup, type Preferences, type Prospect, type ProspectSource,
  type ProspectStatus, type RecruitingState, type SchoolTie,
} from './types.ts';

const REGIONS = regionsJson as unknown as { states: string[]; share: Record<string, Record<string, number>> };
/** T4.8.1 starting shape of a roster by position (Assumption in the bible; the user may ignore it). */
export const ROSTER_SHAPE = shapeJson.shape as Readonly<Record<PositionGroup, number>>;

function shapeTotal(): number { return POSITION_GROUPS.reduce((a, g) => a + ROSTER_SHAPE[g], 0); }

/** Home state for a position group, drawn from the measured hometown density (T4.1.1, regions.json). */
export function drawRegion(position: PositionGroup, u: number): string {
  const share = REGIONS.share[position] ?? REGIONS.share['ALL']!;
  let acc = 0;
  for (const s of REGIONS.states) {
    acc += share[s] ?? 0;
    if (u < acc) return s;
  }
  return REGIONS.states[REGIONS.states.length - 1]!;
}

export function regionShare(position: PositionGroup, region: string): number {
  return REGIONS.share[position]?.[region] ?? 0;
}

function drawPosition(u: number): PositionGroup {
  const total = shapeTotal();
  let acc = 0;
  for (const g of POSITION_GROUPS) {
    acc += ROSTER_SHAPE[g] / total;
    if (u < acc) return g;
  }
  return POSITION_GROUPS[POSITION_GROUPS.length - 1]!;
}

/** Preference weights of one person, drawn around the means with a spread, normalised to sum to 1 (T4.1.1). */
function drawPrefs(rng: ReturnType<StreamFor>, relation: CircleRelation): Preferences {
  const raw: Record<string, number> = {};
  let sum = 0;
  for (const key of PREFERENCE_KEYS) {
    let mean = P(`pref.${key}`);
    if (key === 'distance' && relation !== 'self') mean *= P('pref.circleDistanceBoost');
    if (key === 'money' && relation === 'adviser') mean *= P('pref.adviserMoneyBoost');
    const w = Math.max(0, mean * (1 + P('pref.spread') * (rng.uniform() + rng.uniform() - 1)));
    raw[key] = w;
    sum += w;
  }
  const out = {} as Record<(typeof PREFERENCE_KEYS)[number], number>;
  for (const key of PREFERENCE_KEYS) out[key] = sum > 0 ? raw[key]! / sum : 1 / PREFERENCE_KEYS.length;
  return out;
}

export interface CircleIds {
  /** A person id for a family member, trainer or adviser of the prospect (X1). */
  member(prospectId: number, relation: CircleRelation): number;
  /** The head coach of a high school: shared by every prospect from that school, across years. */
  highSchoolCoach(region: string, schoolIndex: number): number;
}

/**
 * T4.4.2 circle: the prospect 0.40, the most involved parent 0.30, a second parent 0.10 where present,
 * the high school coach 0.10, and a trainer or adviser 0.10 shared. Each weight is drawn within half its
 * mean either side, then normalised, so some homes are run by a parent and some by the player.
 */
export function drawCircle(rng: ReturnType<StreamFor>, prospectId: number, region: string, ids: CircleIds, advisersAllowed: boolean, schools: number): CircleMember[] {
  const rows: { relation: CircleRelation; mean: number; id: number }[] = [
    { relation: 'self', mean: P('circle.self'), id: prospectId },
    { relation: 'parent', mean: P('circle.parent'), id: ids.member(prospectId, 'parent') },
  ];
  if (rng.chance(P('circle.secondParentShare'))) rows.push({ relation: 'second_parent', mean: P('circle.secondParent'), id: ids.member(prospectId, 'second_parent') });
  rows.push({ relation: 'hs_coach', mean: P('circle.hsCoach'), id: ids.highSchoolCoach(region, rng.int(0, Math.max(0, schools - 1))) });
  if (rng.chance(P('circle.outsiderShare'))) {
    const relation: CircleRelation = advisersAllowed && rng.chance(P('circle.adviserShareOfOutsiders')) ? 'adviser' : 'trainer';
    rows.push({ relation, mean: P('circle.outsider'), id: ids.member(prospectId, relation) });
  }
  const w = rows.map((r) => r.mean * (1 + P('circle.spread') * (rng.uniform() + rng.uniform() - 1)));
  const total = w.reduce((a, b) => a + b, 0);
  return rows.map((r, i) => ({ memberId: r.id, relation: r.relation, influence: w[i]! / total, prefs: drawPrefs(rng, r.relation) }));
}

export interface ClassRequest {
  readonly classYear: number;
  /** Programs that recruit this class (every college program in the world). */
  readonly programs: number;
  /** Top-subdivision programs in the world (T4.1.1 scales the star tiers by world size). */
  readonly topPrograms: number;
  /** Team ids a prospect may hold as a favourite, with a weight each (prestige). */
  readonly favourites: readonly { readonly teamId: number; readonly weight: number }[];
  /** Advisers appear only where the rule year allows players to be paid (T4.4.2, T7). */
  readonly advisersAllowed: boolean;
}

function percentileOf(index: number, n: number, u: number): number { return clamp((index + u) / n, 0, 1); }

/**
 * T4.1.1: one senior class. Size = class per program x programs x pool oversize. Positions by the T4.8.1
 * shape, home states by the measured density for the position, true quality by stratified percentile.
 * The public star rating is a noisy read of true quality (correlation 0.5, Assumption; less for linemen),
 * and the tiers are filled by count: about 32 five-stars and 370 four-stars at real-world size, scaled by
 * the number of top-subdivision programs in the world.
 */
export function generateClass(state: RecruitingState, req: ClassRequest, factory: ProspectFactory, ids: CircleIds, rng: StreamFor): Prospect[] {
  const n = Math.round(P('pool.classPerProgram') * req.programs * P('pool.oversize'));
  const s = rng(['class', req.classYear]);
  const made: Prospect[] = [];
  for (let i = 0; i < n; i++) {
    const position = drawPosition(s.uniform());
    const region = drawRegion(position, s.uniform());
    const percentile = percentileOf(i, n, s.uniform());
    const body = factory.create({ classYear: req.classYear, source: 'high_school', slot: i, position, region, percentile });
    made.push(buildProspect(body, req, position, region, percentile, 'high_school', ids, rng));
  }
  assignStars(made, req.topPrograms, s);
  for (const p of made) addProspect(state, p);
  return made;
}

function buildProspect(
  body: ReturnType<ProspectFactory['create']>, req: ClassRequest, position: PositionGroup, region: string, percentile: number,
  source: ProspectSource, ids: CircleIds, rng: StreamFor,
): Prospect {
  const r = rng(['prospect', body.personId]);
  const schools = Math.max(1, Math.round(P('pool.feederSchools') * regionShare(position, region)));
  const circle = drawCircle(r, body.personId, region, ids, req.advisersAllowed, schools);
  let favouriteTeamId: number | null = null;
  if (req.favourites.length > 0 && r.chance(P('pool.favouriteShare'))) favouriteTeamId = req.favourites[r.pick(req.favourites.map((f) => f.weight))]!.teamId;
  const drive = r.uniform();
  const gpa = clamp(P('academic.gpaMean') + P('academic.gpaDriveSlope') * (drive - P('half')) + P('academic.gpaSd') * r.normal(), P('academic.gpaFloor'), P('academic.gpaCeiling'));
  const shortCourses = r.chance(P('academic.shortCoursesShare')) ? r.int(1, Math.max(1, Math.round(P('academic.shortCoursesMax')))) : 0;
  const before = Math.max(0, Math.round(P('academic.coreBeforeFinalTypical')) - shortCourses);
  const ems = Math.max(0, Math.min(before, Math.round(P('academic.emsTypical')) - (r.chance(P('academic.shortEmsShare')) ? 1 : 0)));
  return {
    personId: body.personId,
    origin: body.origin === 'user' ? 'generated' : body.origin,
    source, classYear: req.classYear, position, region,
    heightIn: body.heightIn, weightLb: body.weightLb,
    publicStars: Math.round(P('stars.floor')), publicRank: null,
    trueQuality: body.trueQuality, fortyS: body.fortyS, truePercentile: percentile,
    favouriteTeamId, circle,
    openness: r.uniform(),
    pleaser: r.chance(P('read.pleaserShare')),
    dislikesNegative: r.chance(P('negative.dislikeShare')),
    commitThreshold: clamp(P('commit.thresholdMean') + P('commit.thresholdSd') * r.normal(), P('commit.thresholdMin'), P('commit.thresholdMax')),
    commitMargin: clamp(P('commit.marginMean') + P('commit.marginSd') * r.normal(), P('commit.marginMin'), P('commit.marginMax')),
    academics: { drive, coreGpa: gpa, coreCourses: before, coreBeforeFinalYear: before, coreBeforeFinalYearEms: ems },
    juco: null,
  };
}

/** Star tiers by count after a noisy public score (T4.1.1). Lines get more noise than skill positions. */
export function assignStars(class_: Prospect[], topPrograms: number, s: ReturnType<StreamFor>): void {
  const n = class_.length;
  if (n === 0) return;
  const mean = class_.reduce((a, p) => a + p.trueQuality, 0) / n;
  const sd = Math.sqrt(class_.reduce((a, p) => a + (p.trueQuality - mean) * (p.trueQuality - mean), 0) / n) || 1;
  const scored = class_.map((p) => {
    const rho = p.position === 'OL' || p.position === 'DL' ? P('stars.correlationLine') : P('stars.correlation');
    const z = (p.trueQuality - mean) / sd;
    return { p, score: rho * z + Math.sqrt(Math.max(0, 1 - rho * rho)) * s.normal() };
  }).sort((a, b) => b.score - a.score || a.p.personId - b.p.personId);
  const scale = topPrograms / P('stars.realTopPrograms');
  const five = Math.round(P('stars.fiveNational') * scale);
  const four = Math.round(P('stars.fourNational') * scale);
  const three = Math.round(P('stars.threeShare') * n);
  const listed = Math.round(P('stars.publishedListPerTopProgram') * topPrograms);
  scored.forEach(({ p }, i) => {
    p.publicStars = Math.round(i < five ? P('stars.five') : i < five + four ? P('stars.four') : i < five + four + three ? P('stars.three') : P('stars.floor'));
    p.publicRank = i < listed ? i + 1 : null;
  });
}

export function addProspect(state: RecruitingState, p: Prospect): void {
  state.prospects[p.personId] = p;
  const st: ProspectStatus = { status: 'open', teamId: null, sinceDay: null, decommits: 0, droppedBy: [], signedDay: null, signedEarly: false, waitsForFebruary: null };
  state.status[p.personId] = st;
  prospectsChanged(state);
}

/**
 * T4.1.2: a junior college class. Older players with one or two seasons used, film from fast simulation,
 * and an academic transfer record that moves each term. Count per program is an Assumption.
 */
export function generateJucoClass(state: RecruitingState, req: ClassRequest, factory: ProspectFactory, ids: CircleIds, rng: StreamFor): Prospect[] {
  const n = Math.round(P('juco.perProgram') * req.programs);
  const s = rng(['juco', req.classYear]);
  const made: Prospect[] = [];
  for (let i = 0; i < n; i++) {
    const position = drawPosition(s.uniform());
    const region = drawRegion(position, s.uniform());
    const percentile = clamp(s.uniform(), 0, 1);
    const body = factory.create({ classYear: req.classYear, source: 'juco', slot: i, position, region, percentile });
    const base = buildProspect(body, req, position, region, percentile, 'juco', ids, rng);
    const r = rng(['juco_record', body.personId]);
    const qualifier = r.chance(P('juco.qualifierShare'));
    const used = r.chance(P('juco.twoSeasonShare')) ? Math.round(P('juco.seasonsTwoYear')) : 1;
    const terms = used * Math.round(P('juco.termsPerYear'));
    made.push({
      ...base,
      juco: {
        qualifierOutOfHighSchool: qualifier, seasonsUsed: used, fullTimeTerms: terms,
        transferableHours: Math.max(0, Math.round(terms * (P('juco.hoursPerTermMean') + P('juco.hoursPerTermSd') * r.normal()))),
        transferGpa: clamp(P('juco.gpaMean') + P('juco.gpaSd') * r.normal(), P('academic.gpaFloor'), P('academic.gpaCeiling')),
        graduated: used >= Math.round(P('juco.seasonsTwoYear')) && r.chance(P('juco.graduateShare')),
      },
    });
  }
  assignStars(made, req.topPrograms, s);
  for (const p of made) addProspect(state, p);
  return made;
}

/** T4.5.3: a non-qualifier leaves the incoming class and enters the junior college pool (T4.1.2). */
export function toJucoPool(state: RecruitingState, prospectId: number, nextClassYear: number): Prospect | null {
  const p = state.prospects[prospectId];
  if (!p) return null;
  const moved: Prospect = {
    ...p, source: 'juco', classYear: nextClassYear,
    juco: { qualifierOutOfHighSchool: false, seasonsUsed: 0, fullTimeTerms: 0, transferableHours: 0, transferGpa: p.academics.coreGpa, graduated: false },
  };
  addProspect(state, moved);
  return moved;
}

/** A person who already exists in the world, as recruiting reads him (the body `ProspectFactory` would make). */
export interface ProspectBody {
  readonly personId: number;
  readonly origin: Prospect['origin'];
  readonly position: PositionGroup;
  readonly region: string;
  readonly heightIn: number;
  readonly weightLb: number;
  /** Overall true quality on the internal skill scale (D6.1). Truth. */
  readonly trueQuality: number;
  readonly fortyS: number;
}

/**
 * T4.1.1 for a world that makes its people elsewhere (the X11 cohort pass): one high school class from
 * people who already exist. The true percentile is each body's rank in the class by true quality, ties by
 * person id; preferences, the circle, the academic record and the star rating are drawn as in
 * `generateClass`, from each prospect's own keyed stream.
 */
export function classFromBodies(state: RecruitingState, req: ClassRequest, bodies: readonly ProspectBody[], ids: CircleIds, rng: StreamFor): Prospect[] {
  const ranked = [...bodies].sort((a, b) => a.trueQuality - b.trueQuality || a.personId - b.personId);
  const n = ranked.length;
  const made = ranked.map((body, i) => buildProspect(
    { personId: body.personId, origin: body.origin, heightIn: body.heightIn, weightLb: body.weightLb, trueQuality: body.trueQuality, fortyS: body.fortyS },
    req, body.position, body.region, n <= 1 ? P('half') : i / (n - 1), 'high_school', ids, rng,
  ));
  assignStars(made, req.topPrograms, rng(['class', req.classYear]));
  for (const p of made) addProspect(state, p);
  return made;
}

/**
 * Close a class once it has enrolled (the world keeps one cycle of state, not every class ever recruited):
 * remove its prospects and everything that names them or their circles (statuses, ties, offers, board rows,
 * reads, claims, promises, memory, violations). High school coaches stay, with their edges and memory, because
 * they are shared across years (T4.4.2). Class plans are cleared so the next class plans against the roster
 * as it now stands. Containers are replaced, so the derived look-up tables rebuild.
 */
export function dropClass(state: RecruitingState, classYear: number, keepUsageFromDay?: number): number {
  const gone = new Set<number>();
  const keepCoaches = new Set<number>();
  for (const p of Object.values(state.prospects)) {
    if (p.classYear !== classYear) {
      for (const m of p.circle) if (m.relation === 'hs_coach') keepCoaches.add(m.memberId);
      continue;
    }
    gone.add(p.personId);
    for (const m of p.circle) if (m.relation === 'hs_coach') keepCoaches.add(m.memberId); else gone.add(m.memberId);
  }
  for (const id of keepCoaches) gone.delete(id);
  const keepRec = <V>(rec: Record<number, V>): Record<number, V> => {
    const out: Record<number, V> = {};
    for (const k of Object.keys(rec)) if (!gone.has(Number(k))) out[Number(k)] = rec[Number(k)]!;
    return out;
  };
  const prospects = keepRec(state.prospects);
  const dropped = Object.keys(state.prospects).length - Object.keys(prospects).length;
  state.prospects = prospects;
  state.status = keepRec(state.status);
  const ties: Record<string, SchoolTie> = {};
  for (const [k, t] of Object.entries(state.ties)) if (!gone.has(t.prospectId)) ties[k] = t;
  state.ties = ties;
  state.tieTeams = keepRec(state.tieTeams);
  const edges: Record<string, Edge> = {};
  for (const [k, e] of Object.entries(state.edges)) if (!gone.has(e.fromId) && !gone.has(e.toId)) edges[k] = e;
  state.edges = edges;
  state.offers = state.offers.filter((o) => !gone.has(o.prospectId));
  for (const b of Object.values(state.boards)) {
    b.grades = keepRec(b.grades);
    b.reads = keepRec(b.reads);
    b.circles = keepRec(b.circles);
    b.firmness = keepRec(b.firmness);
    b.academics = keepRec(b.academics);
    b.queue = b.queue.filter((id) => !gone.has(id));
    b.builtClasses = b.builtClasses.filter((y) => y !== classYear);
  }
  state.plans = {};
  state.named = {};
  // Day-pool usage before the given day can no longer count against any pool still open.
  if (keepUsageFromDay !== undefined) {
    const used: Record<string, string[]> = {};
    for (const [k, list] of Object.entries(state.daysUsed)) {
      const kept = list.filter((x) => Number(x.slice(x.indexOf('@') + 1)) >= keepUsageFromDay);
      if (kept.length > 0) used[k] = kept;
    }
    state.daysUsed = used;
  }
  // A violation about no prospect (a camp, a day-pool breach) is dropped with the day-pool usage of its time;
  // the act itself stays in the compliance log and its archive (G-28), which is what history reads.
  state.violations = state.violations.filter((v) => (v.prospectId === null ? keepUsageFromDay === undefined || v.day >= keepUsageFromDay : !gone.has(v.prospectId)));
  state.memory = state.memory.filter((m) => !gone.has(m.holderId));
  state.promises = state.promises.filter((p) => !gone.has(p.prospectId));
  state.claims = state.claims.filter((c) => !gone.has(c.prospectId));
  prospectsChanged(state);
  return dropped;
}
