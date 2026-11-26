// Map one pack person to a world person (D13.6.1 step 2 and 3, U2, X14.1.1). The record is `origin: imported`,
// carries its source key, a neutral trait block, no provenance seed, no portrait, and football facts only.
import { PersonRecord, type GoalRecord, type PersonRole, type TraitBlock } from '@gm/schema';
import type { GeneratorRandom } from '../generator/index.ts';
import type { PackData, PackRow } from '../pack/index.ts';
import {
  estimatePro, estimateCollege, importProfileOf, classYears, coachTendencies, type CoachTendencies, type Confidence, type PlayerEstimate, type Population,
} from './estimate.ts';
import { footballAge, importedStatsOf, isoToWorldDate, priorCareerOf, type PackIndex, type PackLevel, type PriorCareer, type PriorRole } from './prior.ts';
import { param } from './params.ts';

export const IMPORT_STREAM = 'person.import';

/** Everything the import keeps for one person. Fields the contract has no slot for yet are listed in CR-G42-1. */
export interface ImportedPerson {
  record: PersonRecord;
  sourceKey: string;
  /** Level of his latest playing or coaching season before the world start. */
  level: PackLevel;
  /** True when the pack carries an override for him (X14.1.1 `imported_edited`, U3.1.1 edge case). CR-G42-1. */
  edited: boolean;
  /** Per attribute (U3.1.1 outputs). CR-G42-1. */
  confidence: Record<string, Confidence>;
  /** Fields filled by D13.6.3 rule 1, marked `filled`. */
  filled: string[];
  /** Report notes (birth date from experience, tests not aged, overrides applied). */
  flags: string[];
  /** X14.2.1 block. CR-G42-1: P3.2.2 names `prior_career`, the world contract has no slot yet. */
  priorCareer: PriorCareer;
  /** Seasons on or after the world start, hidden from every screen, read only by the dial (U2.2.1 rule 4). */
  futureSeasons: PackRow[];
  /** Main-role value for placement and the U3.1.3 acceptance check (players only). */
  mainValue: number | null;
  /** U3.2.1 profile tendencies (head coaches only). */
  tendencies: CoachTendencies | null;
  /** The role and rung of his last real job, for coach placement (U4.2.2). */
  lastRole: PriorRole | null;
  lastSeason: number | null;
  /** "organisation|season|level" of every playing season before the world start, for kept-together placement. */
  unitKeys: string[];
}

export interface PersonBuildContext {
  pack: PackData;
  index: PackIndex;
  packHash: string;
  worldStartYear: number;
  orgName: (org: string) => string;
  coverage: Record<string, number>;
  population: Population;
  rnd: GeneratorRandom;
  /** Optional D8 ageing of tests (G-20). */
  ageTests?: Parameters<typeof estimatePro>[0]['ageTests'];
}

/** X14.1.1 rule 2: only role-neutral goals, at a neutral intensity, with no year. */
export function importedTraitBlock(roles: readonly PersonRole[]): TraitBlock {
  const goals: GoalRecord[] = [];
  if (roles.includes('player')) goals.push({ goalId: 'start_at_position', target: 'core:role_starter', byYear: null, intensity: 50, status: 'active' });
  if (roles.includes('player') || roles.includes('coach')) goals.push({ goalId: 'win_championship', target: 'core:honour_championship', byYear: null, intensity: 50, status: 'active' });
  return { facets: {}, values: {}, goals, schemaVersion: 1, source: 'imported_neutral' };
}

const num = (v: string | undefined): number | null => (v === undefined || v === '' ? null : Number(v));

/** Builds one imported person. `personId` is the world id the caller assigns (stable order: sorted source keys). */
export function buildImportedPerson(ctx: PersonBuildContext, sourceKey: string, personId: number): ImportedPerson {
  const ix = ctx.index;
  const p = ix.people.get(sourceKey);
  if (!p) throw new Error(`no people row for ${sourceKey}`);
  const pl = ix.playing.get(sourceKey);
  const seasonsAll = ix.playerSeasons.get(sourceKey) ?? [];
  const coaching = ix.coachingSeasons.get(sourceKey) ?? [];
  const officiating = ix.officialSeasons.get(sourceKey) ?? [];
  const scope = `${ctx.packHash.slice(0, 16)}:${sourceKey}`;
  const s = ctx.rnd.open(IMPORT_STREAM, [scope, 'person']);
  const flags: string[] = [];
  const filled: string[] = [];

  const before = (rows: readonly PackRow[]) => rows.filter((r) => Number(r['season']) < ctx.worldStartYear);
  const latest = (rows: readonly PackRow[]) => before(rows).reduce<number | null>((m, r) => Math.max(m ?? -Infinity, Number(r['season'])), null);
  const lastPlay = latest(seasonsAll), lastCoach = latest(coaching), lastOfficial = latest(officiating);

  // Roles: a person with real coaching seasons is a coach now if coaching is his latest football job.
  const roles: PersonRole[] = [];
  const isCoachNow = lastCoach !== null && (lastPlay === null || lastCoach >= lastPlay);
  const isOfficial = officiating.length > 0 && !isCoachNow && (lastPlay === null || (lastOfficial ?? -Infinity) >= lastPlay);
  if (isCoachNow) roles.push('coach');
  else if (isOfficial) roles.push('official');
  if (!isCoachNow && !isOfficial && (pl || seasonsAll.length > 0)) roles.push('player');
  if (roles.length === 0) roles.push(coaching.length > 0 ? 'coach' : officiating.length > 0 ? 'official' : 'player');

  const level: PackLevel = (() => {
    if (roles.includes('coach')) {
      const last = before(coaching).sort((a, b) => Number(b['season']) - Number(a['season']))[0];
      return ((last?.['level'] ?? coaching[0]?.['level']) as PackLevel) ?? 'pro';
    }
    if (pl?.['level']) return pl['level'] as PackLevel;
    const last = before(seasonsAll).sort((a, b) => Number(b['season']) - Number(a['season']))[0];
    return ((last?.['level'] ?? 'pro') as PackLevel);
  })();

  // Birth date, or an age from experience (D13.6.1 edge case; D13.6.3 rule 1), flagged.
  let birth: { seasonYear: number; dayIndex: number };
  if (p['birth_date']) birth = isoToWorldDate(p['birth_date']);
  else {
    const cy = classYears(pl?.['class_year']);
    const exp = num(pl?.['years_exp']);
    const firstSeason = [...seasonsAll, ...coaching].reduce((m, r) => Math.min(m, Number(r['season'])), Infinity);
    let age: number;
    if (cy !== null) age = param('college.ageFreshman') + cy - 1;
    else if (exp !== null) age = param('pro.rookieAge') + exp;
    else if (Number.isFinite(firstSeason)) age = param('pro.rookieAge') + (ctx.worldStartYear - firstSeason);
    else age = param('pro.rookieAge');
    const dayIndex = s.int(0, 364);
    birth = { seasonYear: ctx.worldStartYear - age - (dayIndex > 243 ? 1 : 0), dayIndex };
    flags.push('birth_date_from_experience');
    filled.push('birth_date');
  }
  const ageYears = footballAge(birth, ctx.worldStartYear);

  const { prior, futureSeasons } = priorCareerOf(ix, sourceKey, ctx.worldStartYear, ctx.orgName);
  const firstRow = prior.seasons[0]?.season;
  const covKey = roles.includes('coach') ? 'coaching_seasons' : roles.includes('official') ? 'official_seasons' : 'player_seasons';
  const cov = ctx.coverage[covKey];
  const draftYear = prior.draft?.year ?? null;
  if (cov !== undefined && firstRow === cov && (draftYear === null || draftYear < cov)) prior.incompleteBefore = cov;

  const position = pl?.['position'] ?? (roles.includes('player') ? '' : null);
  let est: PlayerEstimate | null = null;
  let confidence: Record<string, Confidence> = {};
  let edited = false;
  if (roles.includes('player') && position) {
    const profile = importProfileOf(position);
    const estimators: Record<PackLevel, () => PlayerEstimate> = {
      pro: () => estimatePro({ profile, level, playing: pl, seasons: seasonsAll, ageYears, worldStartYear: ctx.worldStartYear, population: ctx.population, stream: ctx.rnd.open(IMPORT_STREAM, [scope, 'estimate']), math: ctx.rnd.math, ...(ctx.ageTests ? { ageTests: ctx.ageTests } : {}) }),
      college: () => estimateCollege({ personId, profile, position, playing: pl, ageYears, worldStartYear: ctx.worldStartYear, rnd: ctx.rnd, scopeKey: scope }),
    };
    est = estimators[level]();
    confidence = est.confidence;
    filled.push(...est.filled);
    flags.push(...est.notes);
    // Pack overrides (P7.3.1): skip the estimate for those fields only and mark the person edited.
    for (const o of ix.overrides.get(sourceKey) ?? []) {
      const a = o['attribute']!, v = Number(o['value']);
      if (a in est.attributes && Number.isFinite(v)) {
        est.attributes[a] = Math.min(100, Math.max(0, v));
        est.ceilings[a] = Math.max(est.ceilings[a]!, est.attributes[a]!);
        confidence[a] = 'measured';
        edited = true;
      } else flags.push(`override_ignored:${a}`);
    }
    if (edited) flags.push('imported_edited');
  } else if (roles.includes('player')) {
    flags.push('no_position');
  }

  const yearsExp = num(pl?.['years_exp']);
  const playedAt = (lv: PackLevel) => prior.seasons.filter((x) => x.role === 'player' && x.level === lv);
  const collegeSeasons = playedAt('college');
  const proSeasons = playedAt('pro');
  const hometown = [p['hometown_city'], p['hometown_region']].filter((x) => x && x.length > 0).join(', ');
  const importedStats = importedStatsOf(prior);
  const coachBlock = roles.includes('coach') ? {
    side: null, positionGroupTaught: 'none' as const, offensiveFamily: null, defensiveFamily: null, systemFamilies: {}, philosophyId: null,
    demonstratedRecord: {}, historyFacts: [],
  } : undefined;

  const record = PersonRecord.parse({
    id: personId,
    origin: 'imported',
    externalRef: { source: ctx.pack.manifest.pack_id, key: sourceKey },
    provenance: null,
    name: { first: p['name_first']!, last: p['name_last']!, suffix: p['name_suffix'] ? p['name_suffix'] : null, nickname: null },
    birthDate: birth,
    hometown: hometown.length > 0 ? hometown : null,
    appearanceSeed: s.nextU32(),
    roles,
    agentId: null,
    diedYear: null,
    ...(est ? {
      playing: {
        position: position!,
        lastJersey: null,
        heightIn: est.heightIn,
        weightLb: est.weightLb,
        attributes: est.attributes,
        tests: est.tests,
        ceilings: est.ceilings,
        hidden: est.hidden,
        conditioning: est.attributes['stamina']!,
        freshnessLongTerm: 1,
        eligibility: {
          college: { seasonsOfCompetitionUsed: collegeSeasons.length, clockStartYear: collegeSeasons[0]?.season ?? null, redshirtUsed: false },
          // Accrued and credited seasons follow C5 rules owned by G-15 and G-16; the pack's years of experience is the start.
          pro: { seasonsOnRoster: proSeasons.length, accruedSeasons: yearsExp ?? proSeasons.length, creditedSeasons: yearsExp ?? proSeasons.length },
        },
      },
    } : {}),
    ...(coachBlock ? { coaching: coachBlock } : {}),
    life: { householdId: null, homeRegion: p['hometown_region'] ?? '' },
    history: { honourEventIds: [], importedStats },
    traitBlock: importedTraitBlock(roles),
  });

  const lastCoachRow = before(coaching).sort((a, b) => Number(b['season']) - Number(a['season']))[0];
  const lastRole: PriorRole | null = roles.includes('coach') ? ((lastCoachRow?.['role'] as PriorRole) ?? null) : roles.includes('official') ? 'official' : roles.includes('player') ? 'player' : null;
  const lastSeason = roles.includes('coach') ? lastCoach : roles.includes('official') ? lastOfficial : lastPlay;
  const unitKeys = before(seasonsAll).filter((r) => r['organisation']).map((r) => `${r['organisation']}|${r['season']}|${r['level']}`).sort();

  return {
    record, sourceKey, level, edited, confidence, filled: [...new Set(filled)], flags, priorCareer: prior, futureSeasons,
    mainValue: est ? est.mainValue : null,
    tendencies: roles.includes('coach') && lastRole === 'head coach' ? coachTendencies() : null,
    lastRole, lastSeason, unitKeys,
  };
}
