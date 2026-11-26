// The personnel report (H2.3.1): a team's depth chart with a graded card per player, in words and bands,
// and the summary of best players and weak links. The same builder serves the opponent and the user's own
// team (K3 reads the same report on the user's team), so the staff's eye on its own players (the career
// year's scouting desk, PR 285) and the pro scouts' book on an opponent read alike.
//
// Grades come from the club's PersonView rows that the observer filter passed (P3.2.3), else from the
// host's estimate store (`ScoutingDesk.estimates` has this shape), turned into a PersonView with G-19
// `toPersonView`. Either way they are estimates: the true attributes never come here (MA-48).
//
// Readings (named in README.md):
// - SR-1 Expected starters are the first name at every role of every offense and defense unit.
// - SR-2 Group grades are the equal-weight mean of the group's graded attributes (G-19 `roleGrade` with
//   weights 1/k): a reading aid until F1 and G content publish role weights (D6.2.2).
// - SR-3 Overall is the mean over the position's primary groups (G-20 catalogue relevance 'p').
// - SR-4 Contests: pass protection reads the `ol_pass` group of OT and IOL starters; coverage reads the
//   `coverage` group of CB and S starters.
import { generator, scouting } from '@gm/people';
import type { PersonView } from '@gm/schema';
import type { ObservedWorld } from '../../observer/index.ts';
import { ageAt, displayName, peopleById, worldDate, type DateLike } from '../people/world.ts';
import type { DepthUnitView, GroupGrade, PersonnelCard, PersonnelGrade, PersonnelReportView, PersonnelSummary, PersonnelUsage, ScoutingSubject } from './types.ts';

type Row = Record<string, unknown>;
type Side = DepthUnitView['side'];

/** The host's estimate store for one club, shaped like `ScoutingDesk.estimates` (PR 285). */
export type EstimateStore = (clubId: number, personId: number) => Readonly<Record<string, scouting.Estimate>> | null;

export interface PersonnelInput {
  readonly subject: ScoutingSubject;
  /** The viewer's club, whose staff graded the players. */
  readonly clubId: number;
  /** The team the report is about. */
  readonly teamId: number;
  readonly scaleId?: string;
  readonly estimates?: EstimateStore;
  readonly usage?: (personId: number) => PersonnelUsage | null;
}

/** Age used when a birth date is not readable (drift rate only). */
const AGE_WHEN_UNKNOWN = 26;
const STRENGTHS_SHOWN = 2;

export const CONTESTS = {
  passProtection: { group: 'ol_pass', positions: ['OT', 'IOL'] },
  coverage: { group: 'coverage', positions: ['CB', 'S'] },
} as const;

export function sideOfUnit(unitId: string): Side | null {
  if (unitId.startsWith('off:')) return 'offense';
  if (unitId.startsWith('def:')) return 'defense';
  if (unitId.startsWith('st:')) return 'special_teams';
  return null;
}

function profile(position: string): generator.ProfilePosition | null {
  return generator.POSITION_TO_PROFILE[position] ?? null;
}

function primaryGroups(position: string): string[] {
  const p = profile(position);
  if (!p) return [];
  return Object.entries(generator.POSITION_RELEVANCE[p]).filter(([, r]) => r === 'p').map(([g]) => g).sort();
}

interface Graded { readonly attribute: string; readonly e: scouting.Estimate }

/** The club's watched estimates of a person, aged to the screen date (D6.4.4). Public-only ones are left out. */
function watched(view: PersonView, at: DateLike, age: number): Graded[] {
  const out: Graded[] = [];
  for (const a of Object.keys(view.perAttribute).sort()) {
    const e = scouting.ageTo(scouting.fromBelief(view.perAttribute[a]!), at, age);
    if (e.publicOnly || e.lastEvidence === null) continue;
    out.push({ attribute: a, e });
  }
  return out;
}

/** Equal-weight mean of the graded attributes in `attrs` (SR-2), shown in the display scale. */
function meanGrade(scale: scouting.GradeScale, group: string, attrs: ReadonlySet<string>, graded: readonly Graded[]): { view: GroupGrade; mean: number } | null {
  const mine = graded.filter((g) => attrs.has(g.attribute));
  if (!mine.length) return null;
  const k = mine.length;
  // Weights 1/k; the first takes the rounding remainder so they sum to exactly 1 (checkWeights).
  const w: Record<string, number> = {};
  mine.forEach((g, i) => { w[g.attribute] = i === 0 ? 1 - (k - 1) / k : 1 / k; });
  const r = scouting.roleGrade(Object.fromEntries(mine.map((g) => [g.attribute, g.e])), w);
  const b = scouting.formatBand(scale, r.mean, r.variance);
  return { view: { group, label: scouting.grade(scale, r.mean).text, bandText: b.text, confidence: scouting.confidenceWord(r.variance), attributes: k }, mean: r.mean };
}

const groupAttrs = (groups: readonly string[]): Set<string> => new Set(groups.flatMap((g) => generator.GROUPS[g] ?? []));
const groupGrade = (scale: scouting.GradeScale, group: string, graded: readonly Graded[]) => meanGrade(scale, group, groupAttrs([group]), graded);

function viewFor(world: ObservedWorld, inp: PersonnelInput, personId: number): PersonView | null {
  const row = (world.table('personViews') as readonly Row[]).find((v) => v.personId === personId && v.observerTeamId === inp.clubId);
  if (row && row.perAttribute) return row as unknown as PersonView;
  const est = inp.estimates?.(inp.clubId, personId);
  return est ? scouting.toPersonView({ observerTeamId: inp.clubId, personId, estimates: est }) : null;
}

const pick = (best: { id: number; mean: number } | null, id: number, mean: number, higher: boolean) =>
  !best || (higher ? mean > best.mean : mean < best.mean) || (mean === best.mean && id < best.id) ? { id, mean } : best;

export function buildPersonnelReport(world: ObservedWorld, inp: PersonnelInput): PersonnelReportView | null {
  const team = (world.table('teams') as readonly Row[]).find((t) => t.id === inp.teamId);
  if (!team) return null;
  const at = worldDate(world);
  const scale = scouting.scaleById(inp.scaleId ?? scouting.DEFAULT_SCALE_ID);
  const people = peopleById(world);

  const depth: DepthUnitView[] = (world.table('depthCharts') as readonly Row[])
    .filter((d) => d.teamId === inp.teamId && typeof d.unitId === 'string' && d.roles && sideOfUnit(d.unitId) !== null)
    .map((d) => ({
      unitId: d.unitId as string, side: sideOfUnit(d.unitId as string)!,
      roles: Object.keys(d.roles as Record<string, number[]>).sort().map((role) => ({ role, personIds: [...(d.roles as Record<string, number[]>)[role]!] })),
    }))
    .sort((a, b) => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));

  // Who is on the report: the roster, then anyone the depth chart lists.
  const ids = new Set<number>();
  for (const r of world.table('rosterSlots') as readonly Row[]) if (r.teamId === inp.teamId && typeof r.personId === 'number') ids.add(r.personId);
  const roles = new Map<number, string[]>();
  const starters = new Map<number, Side>();
  for (const u of depth) for (const r of u.roles) r.personIds.forEach((id, i) => {
    ids.add(id);
    (roles.get(id) ?? roles.set(id, []).get(id)!).push(`${u.unitId}/${r.role}`);
    if (i === 0 && u.side !== 'special_teams' && !starters.has(id)) starters.set(id, u.side);
  });

  const cards: PersonnelCard[] = [];
  let bestOffense: { id: number; mean: number } | null = null;
  let bestDefense: { id: number; mean: number } | null = null;
  let weakPro: { id: number; mean: number } | null = null;
  let weakCov: { id: number; mean: number } | null = null;

  for (const id of [...ids].sort((a, b) => a - b)) {
    const p = people.get(id);
    if (!p) continue;
    const position = String((p.playing as { position?: unknown } | undefined)?.position ?? '');
    const groups = primaryGroups(position);
    const attrs: string[] = groups.flatMap((g) => generator.GROUPS[g] ?? []);
    const view = at ? viewFor(world, inp, id) : null;
    const age = ageAt(p.birthDate, at) ?? AGE_WHEN_UNKNOWN;
    const graded = view && at ? watched(view, at, age) : [];
    const cells = view && at ? scouting.gradeCells(view, { scale, asOf: at, age, attributes: attrs }) : [];
    const grades: PersonnelGrade[] = cells.map((c) => (c.state === 'graded'
      ? { state: 'graded', attribute: c.attribute, label: c.label, confidence: c.confidence, bandText: c.bandText, n: c.n }
      : { state: 'unwatched', attribute: c.attribute }));
    const groupGrades = groups.map((g) => groupGrade(scale, g, graded)).filter((g): g is NonNullable<typeof g> => g !== null);
    const overall = meanGrade(scale, 'overall', groupAttrs(groups), graded);
    const primary = graded.filter((g) => attrs.includes(g.attribute)).sort((a, b) => b.e.mean - a.e.mean || (a.attribute < b.attribute ? -1 : 1));
    const n = Math.min(STRENGTHS_SHOWN, Math.floor(primary.length / 2));
    const side: Side = starters.get(id) ?? depth.find((u) => u.roles.some((r) => r.personIds.includes(id)))?.side ?? 'special_teams';
    const starter = starters.has(id);
    cards.push({
      personId: id, name: displayName(p.name as Parameters<typeof displayName>[0], id), position, side, starter, roles: roles.get(id) ?? [],
      overall: overall?.view ?? null, groups: groupGrades.map((g) => g.view), grades,
      strengths: primary.slice(0, n).map((g) => g.attribute), weaknesses: primary.slice(primary.length - n).reverse().map((g) => g.attribute),
      usage: inp.usage?.(id) ?? null, unscouted: graded.length === 0,
    });
    if (!starter) continue;
    const prof = profile(position);
    if (overall) {
      if (side === 'offense') bestOffense = pick(bestOffense, id, overall.mean, true);
      if (side === 'defense') bestDefense = pick(bestDefense, id, overall.mean, true);
    }
    if (prof && (CONTESTS.passProtection.positions as readonly string[]).includes(prof)) {
      const g = groupGrade(scale, CONTESTS.passProtection.group, graded);
      if (g) weakPro = pick(weakPro, id, g.mean, false);
    }
    if (prof && (CONTESTS.coverage.positions as readonly string[]).includes(prof)) {
      const g = groupGrade(scale, CONTESTS.coverage.group, graded);
      if (g) weakCov = pick(weakCov, id, g.mean, false);
    }
  }

  const summary: PersonnelSummary = {
    bestOffense: bestOffense?.id ?? null, bestDefense: bestDefense?.id ?? null,
    weakestPassProtector: weakPro?.id ?? null, weakestCoverageDefender: weakCov?.id ?? null,
  };
  const identity = team.identity as { name?: string; nickname?: string } | undefined;
  return {
    subject: inp.subject, teamId: inp.teamId, teamName: [identity?.name, identity?.nickname].filter(Boolean).join(' ') || `Team ${inp.teamId}`,
    scaleId: scale.id, depth, cards, summary,
  };
}
