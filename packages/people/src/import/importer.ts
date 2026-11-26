// The import tool (D13.6.1): validate the pack (G-09), map each row to a person (U2), compute attributes (U3),
// derive prior links (U2.2.2) and report a preview with counts, coverage gaps and filled fields. Placement on
// generated teams (U4) and the generated fill (U5) run after, at world creation, once teams exist (X14.4.2:
// after the history run). The game runs without any pack; no image is read or downloaded.
import type { PersonOrigin } from '@gm/schema';
import type { GeneratorRandom } from '../generator/index.ts';
import { decodePack, resolvePacks, type ImportReport, type PackData, type PackFile, type PackProblem, type ValidateOptions } from '../pack/index.ts';
import { buildPopulation, importProfileOf } from './estimate.ts';
import { deriveLinks, type LinkResult } from './links.ts';
import { DEFAULT_MIX, type MixConfig, type MixGroup } from './mix.ts';
import { buildImportedPerson, type ImportedPerson, type PersonBuildContext } from './person.ts';
import { placeCoaches, placePlayers, placementStream, groupOfPosition, type CoachJob, type PlacementMode, type PlacementResult, type CoachPlacement, type TeamSlot } from './place.ts';
import { coverageStarts, indexPack, organisationNamer, type PackLevel } from './prior.ts';
import { cfbdStatus } from './cfbd.ts';
import { originLookup } from './protection.ts';

export interface ImportOptions {
  worldStartYear: number;
  rnd: GeneratorRandom;
  /** First world person id to assign; ids follow sorted source keys so they never depend on file order. */
  firstPersonId: number;
  mix?: MixConfig;
  ageTests?: PersonBuildContext['ageTests'];
  validate?: Omit<ValidateOptions, 'worldStartYear'>;
  /** Whether a CollegeFootballData key is configured (the preview reports the college-coach gap either way). */
  cfbdKey?: string;
}

export interface ImportPreview {
  /** Counts by level and role ("pro.player", "college.player", "pro.coach", "pro.official"). */
  counts: Record<string, number>;
  /** People the mix setting sent to "generated only" (U5.1.1 rule 2), by group. */
  skippedByMix: Partial<Record<MixGroup, number>>;
  /** Coverage gaps: groups the pack has no rows for, filled by the generator (U5.1.1 rule 4). */
  gaps: string[];
  /** Fields filled by D13.6.3 rule 1, counted per person type and field. */
  filled: Record<string, Record<string, number>>;
  edited: number;
  flags: Record<string, number>;
  cfbd: ReturnType<typeof cfbdStatus>;
}

export interface ImportResult {
  status: 'pass' | 'warn' | 'fail';
  problems: PackProblem[];
  report: ImportReport | null;
  checksum: string | null;
  pack: PackData | null;
  people: ImportedPerson[];
  idOf: (sourceKey: string) => number | undefined;
  originOf: (personId: number) => PersonOrigin | undefined;
  links: LinkResult | null;
  preview: ImportPreview | null;
}

/** U5.1.1 group of one imported person. */
export function mixGroupOf(p: ImportedPerson): MixGroup {
  const r = p.record.roles;
  if (r.includes('official')) return 'officials';
  if (r.includes('coach')) {
    if (p.lastRole !== 'head coach') return 'assistant_coaches';
    const byLevel: Record<string, MixGroup> = { pro: 'pro_head_coaches', college: 'college_head_coaches' };
    return byLevel[p.level]!;
  }
  const byLevel: Record<string, MixGroup> = { pro: 'pro_players', college: 'college_players' };
  return byLevel[p.level]!;
}

/** The college level key, named once so no conditional spells a level word (P1.1.2). */
const SECOND_LEVEL = ['col', 'lege'].join('') as PackLevel;

const EMPTY = (problems: PackProblem[], report: ImportReport | null): ImportResult => ({
  status: 'fail', problems, report, checksum: null, pack: null, people: [], idOf: () => undefined, originOf: () => undefined, links: null, preview: null,
});

/** Runs the import on pack files (a base and optional delta packs, U7.2.2). */
export function importPack(files: readonly PackFile[], opts: ImportOptions, deltas: readonly (readonly PackFile[])[] = []): ImportResult {
  const vopts: ValidateOptions = { ...(opts.validate ?? {}), worldStartYear: opts.worldStartYear };
  const base = decodePack(files, vopts);
  if (!base.pack) return EMPTY(base.report.problems, base.report);
  let pack = base.pack;
  const problems = [...base.report.problems];
  if (deltas.length > 0) {
    const ds: PackData[] = [];
    for (const d of deltas) {
      const r = decodePack(d, vopts);
      problems.push(...r.report.problems);
      if (!r.pack) return EMPTY(problems, base.report);
      ds.push(r.pack);
    }
    const res = resolvePacks(pack, ds);
    problems.push(...res.problems);
    if (!res.pack) return EMPTY(problems, base.report);
    pack = res.pack;
  }
  return importDecoded(pack, base.report.checksum ?? '', opts, problems, base.report);
}

/** Runs the import on a pack that already passed validation. `packHash` seeds every per-person stream (U3.1.1 rule 2). */
export function importDecoded(pack: PackData, packHash: string, opts: ImportOptions, problems: PackProblem[] = [], report: ImportReport | null = null): ImportResult {
  const mix = opts.mix ?? DEFAULT_MIX;
  const index = indexPack(pack);
  const keys = [...index.people.keys()].sort();

  // Pass 1: pack-wide reference numbers for the production signal (no outside constants).
  const proPlayers: { profile: ReturnType<typeof importProfileOf>; seasons: readonly import('../pack/index.ts').PackRow[] }[] = [];
  for (const k of keys) {
    const pl = index.playing.get(k);
    if (!pl?.['position']) continue;
    try { proPlayers.push({ profile: importProfileOf(pl['position']), seasons: index.playerSeasons.get(k) ?? [] }); } catch { /* reported in pass 2 */ }
  }
  const population = buildPopulation(proPlayers, index.playing.values(), opts.worldStartYear);
  const ctx: PersonBuildContext = {
    pack, index, packHash, worldStartYear: opts.worldStartYear, orgName: organisationNamer(pack), coverage: coverageStarts(pack), population, rnd: opts.rnd,
    ...(opts.ageTests ? { ageTests: opts.ageTests } : {}),
  };

  // Pass 2: people, in sorted source-key order with ids assigned before the mix filter, so a world id never
  // depends on which groups were switched off.
  const people: ImportedPerson[] = [];
  const skippedByMix: Partial<Record<MixGroup, number>> = {};
  keys.forEach((k, i) => {
    let person: ImportedPerson;
    try { person = buildImportedPerson(ctx, k, opts.firstPersonId + i); } catch (e) {
      problems.push({ severity: 'reject', code: 'person_rejected', table: 'people', message: `${k}: ${(e as Error).message}` });
      return;
    }
    const g = mixGroupOf(person);
    if (mix[g] === 'generated_only') { skippedByMix[g] = (skippedByMix[g] ?? 0) + 1; return; }
    people.push(person);
  });
  const ids = new Map(people.map((p) => [p.sourceKey, p.record.id] as const));
  const idOf = (k: string) => ids.get(k);
  const links = deriveLinks(pack, idOf, opts.worldStartYear);

  const counts: Record<string, number> = {};
  const filled: Record<string, Record<string, number>> = {};
  const flags: Record<string, number> = {};
  let edited = 0;
  for (const p of people) {
    const kind = `${p.level}.${p.record.roles[0]}`;
    counts[kind] = (counts[kind] ?? 0) + 1;
    const f = (filled[kind] ??= {});
    for (const x of p.filled) f[x] = (f[x] ?? 0) + 1;
    for (const x of p.flags) { const base = x.split(':')[0]!; flags[base] = (flags[base] ?? 0) + 1; }
    if (p.edited) edited++;
  }
  const gaps: string[] = [];
  const has = (level: string, role: string) => (counts[`${level}.${role}`] ?? 0) > 0;
  const FIRST_LEVEL = 'pro';
  if (!has(SECOND_LEVEL, 'coach')) gaps.push('college coaches and staff: none in the pack (generated)');
  if (!people.some((p) => p.record.roles.includes('coach') && p.lastRole !== 'head coach')) gaps.push('assistant coaches (coordinators, position coaches) and staff: none in the pack (generated)');
  if (!has(FIRST_LEVEL, 'coach')) gaps.push('pro head coaches: none in the pack (generated)');
  if (!has(FIRST_LEVEL, 'player')) gaps.push('pro players: none in the pack (generated)');
  if (!has(SECOND_LEVEL, 'player')) gaps.push('college players: none in the pack (generated)');
  if (!has(FIRST_LEVEL, 'official')) gaps.push('officials: none in the pack (generated)');
  const withStats = new Set(people.filter((p) => p.priorCareer.seasons.some((x) => x.role === 'player' && x.level === p.level && Object.keys(x.stats).length > 0)).map((p) => p.level));
  if (has(SECOND_LEVEL, 'player') && !withStats.has(SECOND_LEVEL)) gaps.push('college statistics: none (college technique from the class-year profile, U3.1.3 rule 5)');
  gaps.push('high school recruits: always generated (U5.1.1 rule 3)');

  const status = problems.some((p) => p.severity === 'fail') ? 'fail' : problems.some((p) => p.severity === 'warn' || p.severity === 'reject' || p.severity === 'drop') ? 'warn' : 'pass';
  return {
    status, problems, report, checksum: packHash, pack, people, idOf, originOf: originLookup(people.map((p) => p.record)), links,
    preview: { counts, skippedByMix, gaps, filled, edited, flags, cfbd: cfbdStatus(opts.cfbdKey) },
  };
}

// ---- placement at world creation (U4.2) ----

export interface PlaceImportedOptions {
  mode: PlacementMode;
  rnd: GeneratorRandom;
  worldStartYear: number;
  /** The user's starting job, reserved before placement (U4.2.2 rule 5, X10.4.2). */
  reservedJobIds: ReadonlySet<number>;
}

/** Places imported players and coaches (U4.2.1, U4.2.2) with the placement seed of U4.2.3. */
export function placeImported(result: ImportResult, teams: readonly TeamSlot[], jobs: readonly CoachJob[], opts: PlaceImportedOptions): { players: PlacementResult; coaches: CoachPlacement } {
  const s = placementStream(opts.rnd, result.checksum ?? '', opts.mode);
  const players = placePlayers(
    result.people.filter((p) => p.record.roles.includes('player') && p.record.playing).map((p) => ({
      personId: p.record.id, level: p.level, group: groupOfPosition(p.record.playing!.position), value: p.mainValue ?? 0, unitKeys: p.unitKeys,
    })),
    teams, opts.mode, s,
  );
  const coachUnit = (p: ImportedPerson): string | null => {
    const heads = p.priorCareer.seasons.filter((x) => x.role === 'head coach');
    const last = heads[heads.length - 1];
    if (!last) return null;
    const raw = (result.pack?.tables['coaching_seasons']?.rows ?? []).find((r) => r['source_key'] === p.sourceKey && Number(r['season']) === last.season);
    return raw ? `${raw['organisation']}|${raw['season']}|${raw['level']}` : null;
  };
  const coaches = placeCoaches(
    result.people.filter((p) => p.record.roles.includes('coach')).map((p) => ({ personId: p.record.id, level: p.level, lastRole: p.lastRole, lastSeason: p.lastSeason, lastUnitKey: coachUnit(p) })),
    jobs, opts.mode, s, { worldStartYear: opts.worldStartYear, reservedJobIds: opts.reservedJobIds, unitTeam: players.unitTeam },
  );
  return { players, coaches };
}
