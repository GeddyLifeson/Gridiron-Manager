// X10.2.2: founding people and cultures. Every team is staffed and stocked for the first history
// season. All founding people are `origin: generated`, built by the G-17 generator; none has a
// fabricated past (no event dated before the first season, 0 years in chair and on staff).
import { DMATH, deriveSeed, seedToHex, stream, type WorldSeed } from '@gm/engine-core';
import { positions } from '@gm/career';
import { culture, generator } from '@gm/people';
import type { CultureRecord, JobRecord, PersonRecord, RandomStream, TeamRecord, WorldDate } from '@gm/schema';
import type { LevelSpec, PersonNameSource, WorldContent } from './content.ts';
import { param } from './params.ts';
import type { SetupRecord } from './setup.ts';
import type { BuiltStructures } from './structures.ts';

export const STREAM_FOUNDING = 'world.founding';
export const STREAM_CULTURE = 'team.culture';

const CULTURE_BAND: Readonly<Record<TeamRecord['resourceBand'], culture.ResourceBand>> = { low: 'low', middle: 'mid', top: 'high' };
const GROUP_OF_CASCADE: Readonly<Record<positions.CascadeKind, generator.PopulationGroup>> = {
  head_coach: 'head_coach', coordinator: 'coordinator', special_teams_coordinator: 'coordinator', position_coach: 'position_coach',
  strength_head: 'position_coach', analyst_qc: 'entry_coach', graduate_assistant: 'entry_coach', none: 'entry_coach',
};
const BOSS_ROLE: Readonly<Record<LevelSpec['bossChairs'][number], { role: PersonRecord['roles'][number]; group: generator.PopulationGroup; field: 'ownerPersonId' | 'athleticDirectorPersonId' | 'presidentPersonId' }>> = {
  owner: { role: 'owner', group: 'owner', field: 'ownerPersonId' },
  athletic_director: { role: 'administrator', group: 'athletic_director', field: 'athleticDirectorPersonId' },
  president: { role: 'administrator', group: 'athletic_director', field: 'presidentPersonId' },
};

export interface FoundingResult {
  readonly people: PersonRecord[];
  readonly jobs: JobRecord[];
  readonly staffs: positions.Staff[];
  /** Team id to player ids, in roster-slot order. */
  readonly rosters: Map<number, number[]>;
  readonly cultures: CultureRecord[];
  /** Staff person id to the season his founding deal ends (rule 5: staggered). */
  readonly staffContractEndYear: Map<number, number>;
  /** College player id to class year index, 0 for a first-year player (rule 2). */
  readonly classYearOf: Map<number, number>;
  /** Players whose every redraw failed the D13.1.2 plausibility check; kept and reported, never hidden. */
  readonly implausible: number[];
  readonly nextIds: { person: number; job: number };
}

/** Whole-number counts in the shape of `mix` that sum to `total` (largest remainder; ties by code). */
export function scaleMix(mix: Readonly<Record<string, number>>, total: number): Record<string, number> {
  const entries = Object.entries(mix).filter(([, n]) => n > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const sum = entries.reduce((a, [, n]) => a + n, 0);
  if (sum <= 0) throw new Error('roster mix is empty');
  const exact = entries.map(([k, n]) => ({ k, x: (n * total) / sum }));
  const out: Record<string, number> = {};
  let used = 0;
  for (const e of exact) { out[e.k] = Math.floor(e.x); used += out[e.k]!; }
  const rest = [...exact].sort((a, b) => (b.x - Math.floor(b.x)) - (a.x - Math.floor(a.x)) || (a.k < b.k ? -1 : 1));
  for (let i = 0; i < total - used; i++) out[rest[i % rest.length]!.k]!++;
  return out;
}

/** Inverse of a piecewise-linear curve through (0, min), (0.1, q10), (0.5, median), (0.9, q90), (1, max). */
export function curveAge(u: number): number {
  const pts: readonly (readonly [number, number])[] = [
    [0, param('age.proMin')], [0.1, param('age.proQ10')], [0.5, param('age.proMedian')], [0.9, param('age.proQ90')], [1, param('age.proMax')],
  ];
  for (let i = 1; i < pts.length; i++) {
    const [u0, a0] = pts[i - 1]!, [u1, a1] = pts[i]!;
    if (u <= u1) return Math.floor(a0 + ((u - u0) / (u1 - u0)) * (a1 - a0) + 0.5);
  }
  return param('age.proMax');
}

/** Triangular draw on [min, max] with the given mode, as a whole age. One uniform. */
export function triangularAge(s: RandomStream, min: number, mode: number, max: number): number {
  const u = s.uniform();
  const m = Math.min(max, Math.max(min, mode));
  const cut = max === min ? 1 : (m - min) / (max - min);
  const x = u < cut ? min + DMATH.sqrt(u * (max - min) * (m - min)) : max - DMATH.sqrt((1 - u) * (max - min) * (max - m));
  return Math.min(max, Math.max(min, Math.floor(x + 0.5)));
}

function seatAge(s: RandomStream, kind: positions.CascadeKind, rung: number | null): number {
  if (GROUP_OF_CASCADE[kind] === 'head_coach') return triangularAge(s, param('age.headCoachMin'), param('age.headCoachMode'), param('age.headCoachMax'));
  if (rung !== null && rung <= param('age.entryRungMax')) return s.int(param('age.staffMin'), param('age.entryMax'));
  const min = Math.min(param('age.staffMax'), param('age.staffMin') + param('age.yearsPerRung') * (rung ?? 0));
  return triangularAge(s, min, min + param('age.staffModeOffset'), param('age.staffMax'));
}

export function foundPeople(setup: SetupRecord, seed: WorldSeed, content: WorldContent, built: BuiltStructures, names: PersonNameSource): FoundingResult {
  const year = setup.firstSeasonYear;
  const date: WorldDate = { seasonYear: year, dayIndex: 0 };
  const rnd: generator.GeneratorRandom = {
    open: (name, scope) => stream(seed, name, scope),
    seedHex: (name, scope) => seedToHex(deriveSeed(seed, name, scope)),
    math: DMATH,
  };
  const levelOf = new Map(built.competitions.map((c) => [c.id, c.level]));
  const compName = new Map(built.competitions.map((c) => [c.id, c.name]));
  const regionOfPlace = new Map(built.places.map((p) => [p.id, p]));
  const people: PersonRecord[] = [];
  const jobs: JobRecord[] = [];
  const staffs: positions.Staff[] = [];
  const rosters = new Map<number, number[]>();
  const cultures: CultureRecord[] = [];
  const staffContractEndYear = new Map<number, number>();
  const classYearOf = new Map<number, number>();
  const implausible: number[] = [];
  const next = { person: 1, job: 1 };

  for (const team of built.teams) {
    const level = levelOf.get(team.competitionId)!;
    const spec = content.levels[level];
    const place = regionOfPlace.get(built.placeOfTeam.get(team.id)!)!;
    const draw = (kind: string, slot: number): RandomStream => stream(seed, STREAM_FOUNDING, [team.id, kind, slot]);
    const nonPlayer = (kind: string, slot: number, role: PersonRecord['roles'][number], group: generator.PopulationGroup, age: number, s: RandomStream): PersonRecord => {
      const p = generator.generateNonPlayer({
        personId: next.person++, roles: [role], group, ageYears: age, seasonYear: year,
        classKey: { classYear: year, classType: `founding:${team.id}:${kind}`, slotIndex: slot },
        homeRegion: place.region, hometown: null, name: names(s, year - age),
      }, rnd);
      people.push(p);
      return p;
    };

    // Bosses (L5, T9): the chairs the level's content names.
    spec.bossChairs.forEach((chair, i) => {
      const b = BOSS_ROLE[chair];
      const s = draw('boss', i);
      const age = triangularAge(s, param('age.bossMin'), param('age.bossMode'), param('age.bossMax'));
      team[b.field] = nonPlayer('boss', i, b.role, b.group, age, s).id;
    });

    // Staff (S1.2.2 sizes through the positions catalogue), every seat filled on day one.
    let staff = positions.generateStaff({ teamId: team.id, level, band: team.resourceBand, limits: positions.limitsFrom(spec.staffLimits), firstSeatId: next.job, date });
    next.job += staff.seats.length;
    staff.seats.forEach((seat, i) => {
      const kind = positions.CATALOGUE.position(seat.positionId).cascadeKind;
      const s = draw('staff', i);
      const age = seatAge(s, kind, seat.rung);
      const p = nonPlayer('staff', i, seat.rung === null ? 'staff' : 'coach', GROUP_OF_CASCADE[kind], age, s);
      staff = positions.fillSeat(staff, seat.seatId, p.id, date);
      staffContractEndYear.set(p.id, year + s.int(1, param('contract.staffMaxYears')));
    });
    staffs.push(staff);
    for (const seat of staff.seats) if (seat.rung !== null) jobs.push(positions.toJobRecord(staff, seat));

    // Players: the real position mix scaled to the level's roster limit.
    const counts = scaleMix(spec.rosterMix, spec.rosterLimit);
    const roster: number[] = [];
    const classYears = param('age.collegeClassYears');
    let slot = 0;
    for (const position of Object.keys(counts).sort()) {
      for (let k = 0; k < counts[position]!; k++, slot++) {
        const s = draw('player', slot);
        const classYear = slot % classYears;
        const age = spec.ageModel === 'curve' ? curveAge(s.uniform()) : param('age.collegeFirstYear') + classYear;
        const g = generator.generatePlayer({
          personId: next.person++, position, ageYears: age, seasonYear: year, talent: spec.talent(s),
          classKey: { classYear: year, classType: `founding:${team.id}:player`, slotIndex: slot },
          group: spec.playerGroup as generator.PopulationGroup, homeRegion: place.region, hometown: null,
        }, rnd, (ns) => names(ns, year - age));
        people.push(g.record);
        roster.push(g.record.id);
        if (spec.ageModel === 'class_years') classYearOf.set(g.record.id, classYear);
        if (g.failures.length > 0) implausible.push(g.record.id);
      }
    }
    rosters.set(team.id, roster);

    // Culture (X9.5.1) on the `team.culture` stream.
    const cs = stream(seed, STREAM_CULTURE, [team.id]);
    cultures.push(culture.toCultureRecord(culture.generateCulture({
      teamId: team.id, level, resources: CULTURE_BAND[team.resourceBand], violationClasses: spec.violationClasses,
      labels: content.labelIds, firstYear: year, games: content.seasonGamesByLevelId?.[compName.get(team.competitionId)!] ?? spec.seasonGames, draw: () => cs.uniform(),
    })));
  }
  return { people, jobs, staffs, rosters, cultures, staffContractEndYear, classYearOf, implausible, nextIds: next };
}

/** X10.2.2 acceptance checks that need no other module. Empty when the founding is sound. */
export function foundingProblems(setup: SetupRecord, content: WorldContent, built: BuiltStructures, f: FoundingResult): string[] {
  const out: string[] = [];
  const levelOf = new Map(built.competitions.map((c) => [c.id, c.level]));
  const byId = new Map(f.people.map((p) => [p.id, p]));
  for (const t of built.teams) {
    const spec = content.levels[levelOf.get(t.competitionId)!];
    const roster = f.rosters.get(t.id) ?? [];
    if (roster.length !== spec.rosterLimit) out.push(`team ${t.id}: ${roster.length} players, limit ${spec.rosterLimit}`);
    for (const chair of spec.bossChairs) if (t[BOSS_ROLE[chair].field] === null) out.push(`team ${t.id}: no ${chair}`);
    const staff = f.staffs.find((s) => s.teamId === t.id);
    if (!staff) { out.push(`team ${t.id}: no staff`); continue; }
    for (const p of positions.staffProblems(staff)) out.push(`team ${t.id}: ${p}`);
    for (const b of positions.limitBreaches(staff, positions.limitsFrom(spec.staffLimits))) out.push(`team ${t.id}: ${b.key} ${b.count} over ${b.limit}`);
    for (const s of staff.seats) {
      if (s.holderPersonId === null) out.push(`team ${t.id}: seat ${s.catalogueId} is empty on day one`);
      else if (s.holderSince?.seasonYear !== setup.firstSeasonYear) out.push(`team ${t.id}: seat ${s.catalogueId} has years in chair`);
    }
    if (spec.ageModel === 'class_years') {
      const present = new Set(roster.map((id) => f.classYearOf.get(id)));
      for (let y = 0; y < param('age.collegeClassYears'); y++) if (!present.has(y)) out.push(`team ${t.id}: class year ${y} is missing`);
    }
  }
  for (const p of f.people) {
    if (p.origin !== 'generated') out.push(`person ${p.id}: founding people are generated`);
    if (p.history.honourEventIds.length > 0) out.push(`person ${p.id}: founding people have no past`);
  }
  if (byId.size !== f.people.length) out.push('a person id was issued twice');
  return out;
}
