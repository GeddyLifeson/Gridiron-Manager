// Grading players (N1.4). The play-by-play sheet, the staff grader, the user's own sheet, the totals
// at the foot, the display scales and the grade policy.
//
// What happened on each snap is read from the truth record (mental errors, contests) and from film
// (candidate loafs). It never leaves this file as such: a staff sheet is that truth passed through the
// grader's accuracy and his lean toward favourites (rule 1), so a sheet is an estimate and can be
// wrong. A user's sheet is his own marks; it is compared with what happened only privately, as an
// evidence event for N4 and N5 (rule 2, E9.1.1).
import { stream, type WorldSeed } from '@gm/engine-core';
import { param } from './params.ts';
import { loafCandidates } from './loafs.ts';
import scales from './scales.json' with { type: 'json' };
import type { FilmSource, Grader, Side } from './types.ts';
import type { GradeSheet, SnapMark } from './schemas.ts';
import { playIdOf } from './chart.ts';

/** What happened to one player on one snap. Internal to the grader. */
interface SnapTruth {
  readonly playId: string;
  readonly personId: number;
  readonly mental: boolean;
  readonly won: number;
  readonly lost: number;
  readonly loafCandidate: boolean;
}

/** Wins without a loss that make a "4" on the line coach's scale (N1.4.2: rare, a 3 and then some). Assumption. */
const DECISIVE_WINS = 2;

function snapTruths(src: FilmSource): SnapTruth[] {
  const playId = playIdOf(src.gameId, src.playNumber);
  const tps = src.ticksPerSecond;
  const snap = src.truth.events.find((e) => e.type === 'snap');
  const dead = src.truth.events.find((e) => e.type === 'dead_ball');
  const injured = new Set<number>();
  for (const e of src.truth.events) if (e.type === 'injury') { const s = src.slots.find((x) => x.personId === e.playerId); if (s) injured.add(s.slot); }
  const sides: Side[] = [];
  for (const s of src.slots) sides[s.slot] = s.side;
  let loafSlots = new Set<number>();
  if (snap && dead && src.trajectory.formatVersion === 1) {
    loafSlots = new Set(loafCandidates({
      trajectory: src.trajectory, ticksPerSecond: tps, sides, offenseSide: src.row.offense as Side,
      snapTick: Math.round(snap.t * tps), whistleTick: Math.round(dead.t * tps), injured,
    }).map((c) => c.slot));
  }
  return src.slots.map((s) => {
    let won = 0, lost = 0, mental = false;
    for (const e of src.truth.events) {
      if (e.type === 'contest') { if (e.winnerId === s.personId) won++; if (e.loserId === s.personId) lost++; }
      if (e.type === 'mental_error' && e.playerId === s.personId) mental = true;
    }
    return { playId, personId: s.personId, mental, won, lost, loafCandidate: loafSlots.has(s.slot) };
  });
}

function truthMark(t: SnapTruth): SnapMark {
  return {
    playId: t.playId,
    assignment: t.mental ? 'wrong' : 'right',
    technique: t.lost > t.won ? 'minus' : t.won > t.lost ? 'plus' : 'zero',
    lostContest: t.lost > t.won,
    loaf: t.loafCandidate,
    loafCandidate: t.loafCandidate,
    note: '',
  };
}

/** Score of one snap (N1.4.1 rule 3): the lowest line that applies. */
export function snapScore(m: SnapMark): number {
  const scores: number[] = [];
  if (m.assignment === 'wrong') scores.push(param('grade.mentalError'));
  if (m.loaf) scores.push(param('grade.loaf'));
  if (m.technique === 'minus' || m.lostContest) scores.push(param('grade.minus'));
  if (!scores.length) scores.push(m.technique === 'plus' ? param('grade.plusPlus') : param('grade.zero'));
  return Math.min(...scores);
}

/** The line coach's 0 to 4 mark of one snap (N1.4.2), from the same marks. */
export function zeroToFourMark(m: SnapMark, decisive = false): number {
  if (m.assignment === 'wrong') return 0;
  if (m.lostContest) return 1;
  if (m.technique === 'minus') return 2;
  if (m.technique === 'plus' && decisive) return 4;
  return 3;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Totals at the foot of a sheet (N1.4.1 rule 5). */
export function sheetTotals(rows: readonly SnapMark[], decisive: readonly boolean[] = []): Pick<GradeSheet, 'snaps' | 'gameScore' | 'assignmentShare' | 'loafs' | 'zeroToFour'> {
  const n = rows.length;
  if (!n) return { snaps: 0, gameScore: 0, assignmentShare: 0, loafs: 0, zeroToFour: 0 };
  const right = rows.filter((r) => r.assignment === 'right').length;
  return {
    snaps: n,
    gameScore: rows.reduce((a, r) => a + snapScore(r), 0) / n,
    assignmentShare: right / n,
    loafs: rows.filter((r) => r.loaf).length,
    zeroToFour: round1(rows.reduce((a, r, i) => a + zeroToFourMark(r, !!decisive[i]), 0) / n),
  };
}

type Pick3 = 'plus' | 'zero' | 'minus';
const TECH: readonly Pick3[] = ['plus', 'zero', 'minus'];

/** One mark through the grader: right with his accuracy, else wrong, leaning toward excusing favourites (rule 1). */
function staffMark(t: SnapMark, g: Grader, personId: number, s: { uniform(): number }): SnapMark {
  const fav = g.favourites.includes(personId);
  // Fixed draw count per mark (4 fields x 3 draws) so one grader's sheet never shifts another's (J13.2.1).
  const field = <T>(truthV: T, kind: 'flip' | 'tech', favourable: T): T => {
    const hit = s.uniform(), lean = s.uniform(), pick = s.uniform();
    if (hit < g.accuracy) return truthV;
    if (fav && lean < g.favouriteLean) return favourable;
    if (kind === 'flip') return (typeof truthV === 'boolean' ? !truthV : truthV === 'right' ? 'wrong' : 'right') as T;
    const others = TECH.filter((x) => x !== truthV);
    return others[Math.floor(pick * others.length)] as T;
  };
  const assignment = field(t.assignment, 'flip', 'right' as const);
  const technique = field(t.technique, 'tech', t.technique === 'minus' ? 'zero' as const : 'plus' as const);
  const lostContest = field(t.lostContest, 'flip', false);
  const loaf = field(t.loaf, 'flip', false);
  return { ...t, assignment, technique, lostContest, loaf };
}

export interface SheetOptions { readonly seed: WorldSeed; readonly gameId: number }

/**
 * A position coach's sheet for one player over the plays of one game (or practice) he was on the field
 * for. A grader with accuracy 1 and no favourites returns exactly what happened (N1.4.1 acceptance).
 */
export function staffGradeSheet(plays: readonly FilmSource[], personId: number, g: Grader, o: SheetOptions): GradeSheet {
  const rows: SnapMark[] = [];
  const decisive: boolean[] = [];
  for (const src of plays) {
    const t = snapTruths(src).find((x) => x.personId === personId);
    if (!t) continue;
    const s = stream(o.seed, 'film.grade', [src.gameId, src.playNumber, personId, g.personId]);
    rows.push(staffMark(truthMark(t), g, personId, s));
    decisive.push(t.won >= DECISIVE_WINS && t.lost === 0);
  }
  return { gameId: o.gameId, personId, grader: `staff:${g.personId}`, rows, ...sheetTotals(rows, decisive), comments: { coachingPoints: '', workOn: '', summary: '' } };
}

/** The user's own sheet from his marks (rule 2). Candidate loafs are shown to him as prompts only. */
export function userGradeSheet(gameId: number, personId: number, rows: readonly SnapMark[]): GradeSheet {
  return { gameId, personId, grader: 'user', rows: [...rows], ...sheetTotals(rows), comments: { coachingPoints: '', workOn: '', summary: '' } };
}

/** Candidate loafs of every player on a play, as prompts for a grader (rule 4). */
export function loafPrompts(src: FilmSource): { personId: number; playId: string }[] {
  return snapTruths(src).filter((t) => t.loafCandidate).map((t) => ({ personId: t.personId, playId: t.playId }));
}

/**
 * Private comparison of a user's sheet with what happened (rule 2, N1.2.3, E9.1.1 family 4). The
 * result is an evidence event for N4 and N5: never a read model, never a skill value.
 */
export interface GradingEvidence { readonly personId: number; readonly gameId: number; readonly marks: number; readonly agreements: number }
export function gradingEvidence(plays: readonly FilmSource[], sheet: GradeSheet): GradingEvidence {
  let marks = 0, agreements = 0;
  for (const row of sheet.rows) {
    const src = plays.find((p) => playIdOf(p.gameId, p.playNumber) === row.playId);
    const t = src && snapTruths(src).find((x) => x.personId === sheet.personId);
    if (!t) continue;
    const truthM = truthMark(t);
    for (const k of ['assignment', 'technique', 'lostContest', 'loaf'] as const) { marks++; if (truthM[k] === row[k]) agreements++; }
  }
  return { personId: sheet.personId, gameId: sheet.gameId, marks, agreements };
}

// ---------- display scales (N1.4.2) ----------

export const GRADE_SCALES = ['decimal', 'letter', 'hundred', 'tiers', 'assignment', 'zeroToFour'] as const;
export type GradeScale = (typeof GRADE_SCALES)[number];

function interp(points: readonly (readonly number[])[], v: number): number {
  const p = points as readonly [number, number][];
  if (v <= p[0]![0]) return p[0]![1];
  for (let i = 1; i < p.length; i++) {
    const [x1, y1] = p[i]!, [x0, y0] = p[i - 1]!;
    if (v <= x1) return y0 + ((v - x0) / (x1 - x0)) * (y1 - y0);
  }
  return p[p.length - 1]![1];
}
const firstAtLeast = (table: readonly (readonly [number, string])[], v: number) => (table.find(([cut]) => v >= cut) ?? table[table.length - 1]!)[1];

/** Words beside an assignment percentage (N1.4.2 tiers: offensive-line benchmark, other positions Assumption). */
export function assignmentWords(share: number): string {
  if (share >= param('tier.bestShare')) return scales.assignmentWords.best;
  if (share >= param('tier.averageShare')) return scales.assignmentWords.average;
  return scales.assignmentWords.trouble;
}

/** The display text of a sheet's grade on one scale. Display only: no stored value changes. */
export function displayGrade(sheet: Pick<GradeSheet, 'gameScore' | 'assignmentShare' | 'zeroToFour'>, scale: GradeScale): string {
  const dec = interp(scales.decimal.points, sheet.gameScore);
  switch (scale) {
    case 'decimal': return dec.toFixed(scales.decimal.digits);
    case 'hundred': return interp(scales.hundred.points, sheet.gameScore).toFixed(scales.hundred.digits);
    case 'letter': return firstAtLeast(scales.letter.onDecimal as [number, string][], dec);
    case 'tiers': return firstAtLeast(scales.tiers.onDecimal as [number, string][], dec);
    case 'assignment': return `${(sheet.assignmentShare * 100).toFixed(1)}% (${assignmentWords(sheet.assignmentShare)})`;
    case 'zeroToFour': return sheet.zeroToFour.toFixed(1);
  }
}

// ---------- grade policy (N1.4.4) ----------

export type GradePolicy = 'posted' | 'one_on_one' | 'private';
export type PolicyForm = 'loaf_board' | 'effort_points' | 'season_award' | 'morning_sheets';

export interface PolicyPlayer { readonly personId: number; readonly competitiveAboveMedian: boolean; readonly lowConfidence: boolean; readonly leadsLoafBoard: boolean }
export interface PolicyEffect { readonly personId: number; readonly loafRateCut: number; readonly weeks: number; readonly stressStep: boolean; readonly cause: string }

/** Player effects of a room's grade policy, each naming its cause so it traces to the policy in the player's log. */
export function policyEffects(policy: GradePolicy, forms: readonly PolicyForm[], players: readonly PolicyPlayer[]): PolicyEffect[] {
  if (policy === 'private') return [];
  const out: PolicyEffect[] = [];
  const weeks = param('policy.loafBoardWeeks');
  for (const p of players) {
    if (forms.includes('loaf_board') && policy === 'posted') {
      out.push({ personId: p.personId, loafRateCut: p.competitiveAboveMedian ? param('policy.loafBoardCut') : 0, weeks, stressStep: p.lowConfidence && p.leadsLoafBoard, cause: 'grade policy: posted loaf board (N1.4.4)' });
    }
    if (forms.includes('season_award') || forms.includes('effort_points')) {
      out.push({ personId: p.personId, loafRateCut: p.competitiveAboveMedian ? param('policy.awardCut') : 0, weeks, stressStep: false, cause: 'grade policy: effort award (N1.4.4)' });
    }
  }
  return out;
}

/** Grades go to the staff the day after the game (rule 6). Day indexes are calendar days. */
export function staffReleaseDay(gameDay: number): number { return gameDay + 1; }
