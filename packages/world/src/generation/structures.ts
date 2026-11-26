// X10.2.1 and U4.1.1: competitions, conferences, places, teams, venues, resource bands and rival seeds,
// built from content in a fixed order. Each step has its own stream, so a change in one step never
// shifts another (X10.2.1 rule 1). Team identities come from the G-11 content (generated names, checked
// against the A6.2.2 blocked terms again here); nothing real is named.
import { stream, type WorldSeed } from '@gm/engine-core';
import { CompetitionRecord, ConferenceRecord, TeamRecord, VenueRecord, type RandomStream } from '@gm/schema';
import type { BlockedTerms, ContentStadium, WorldContent } from './content.ts';
import { param } from './params.ts';
import type { SetupRecord } from './setup.ts';

export const STRUCTURE_STEPS = ['competitions', 'conferences', 'places', 'teams', 'venues', 'resources', 'rivals'] as const;
export type StructureStep = (typeof STRUCTURE_STEPS)[number];
export const STREAM_STRUCTURE = 'world.structure';

export type ResourceBand = 'low' | 'middle' | 'top';
const BANDS: readonly ResourceBand[] = ['low', 'middle', 'top'];
const FT_PER_M = 3.28084;
const ROOF: Readonly<Record<string, 'open' | 'closed' | 'fixed_dome'>> = { open: 'open', 'fixed dome': 'fixed_dome', retractable: 'closed' };

/** A generated place (U4.1.1): what offers, moves, travel, weather and recruiting read. */
export interface PlaceRecord {
  readonly id: number;
  readonly name: string;
  readonly region: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly altitudeM: number;
  readonly timeZone: string;
  /** Reference location whose climate rows the place borrows (C1.4.2 rule 3). */
  readonly climateId: string;
  /** 1 to 5, from content. */
  readonly marketTier: number;
  /** E6.2.2 profile, drawn by weight; null while content ships no profile table. */
  readonly taxProfileId: string | null;
}

export interface BuiltStructures {
  readonly competitions: CompetitionRecord[];
  readonly conferences: ConferenceRecord[];
  readonly places: PlaceRecord[];
  readonly venues: VenueRecord[];
  readonly teams: TeamRecord[];
  /** Team id to its place id. */
  readonly placeOfTeam: ReadonlyMap<number, number>;
  /** Team id to the content id it was built from (and back), for packs and tests. */
  readonly contentIdOfTeam: ReadonlyMap<number, string>;
  /** Rival seeds with strength (U4, read by X3.3.2). */
  readonly rivalSeeds: readonly { readonly a: number; readonly b: number; readonly strength: number }[];
  readonly nextIds: { competition: number; conference: number; place: number; venue: number; team: number };
}

export interface StructureOptions {
  /** Test hook for the X10.2.1 acceptance: a different seed for one step only. */
  readonly stepSeed?: Partial<Record<StructureStep, WorldSeed>>;
}

const fold = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** A6.2.2 scan of one team identity, with the combination rule. Returns the terms hit. */
export function blockedTermHits(texts: readonly string[], blocked: BlockedTerms): string[] {
  const hay = ` ${fold(texts.join(' '))} `;
  const has = (t: string): boolean => { const f = fold(t); return f.length > 0 && hay.includes(` ${f} `); };
  const out = blocked.phrases.filter(has);
  const city = blocked.realCities.find(has), nick = blocked.realNicknames.find(has);
  if (city !== undefined && nick !== undefined) out.push(`${city} + ${nick}`);
  for (const p of blocked.schoolPairs) if (has(p.school) && has(p.nickname)) out.push(`${p.school} + ${p.nickname}`);
  return out;
}

function seededOrder<T extends { key: number }>(items: readonly T[], s: RandomStream): T[] {
  return items.map((x) => ({ x, tie: s.uniform() })).sort((a, b) => a.x.key - b.x.key || a.tie - b.tie).map((p) => p.x);
}

export function buildStructures(setup: SetupRecord, seed: WorldSeed, content: WorldContent, opts: StructureOptions = {}): BuiltStructures {
  const open = (step: StructureStep): RandomStream => stream(opts.stepSeed?.[step] ?? seed, STREAM_STRUCTURE, [step]);
  const collegeLevels = content.collegeLevelsBySize[setup.size];
  if (!collegeLevels) throw new Error(`world size ${setup.size} has no college level list in content`);
  const next = { competition: 1, conference: 1, place: 1, venue: 1, team: 1 };

  // (a) competitions and levels (C1, T).
  const competitions: CompetitionRecord[] = [];
  const pro = content.levels.pro, col = content.levels.college;
  const mkCompetition = (name: string, level: 'pro' | 'college', spec: typeof pro): CompetitionRecord => {
    const c = CompetitionRecord.parse({
      id: next.competition++, name, level, ruleSetId: spec.ruleSetId, leagueRulesId: spec.leagueRulesId, conferenceIds: [], teamIds: [],
      seasonFormat: `${spec.leagueRulesId}:season`, postseasonFormat: `${spec.leagueRulesId}:postseason`,
    });
    competitions.push(c);
    return c;
  };
  const proComp = mkCompetition(content.pro.league.name, 'pro', pro);
  const collegeComp = new Map<string, CompetitionRecord>();
  const schoolLevels = content.college.levels;
  for (const lv of collegeLevels) {
    const hasSchools = schoolLevels.some((l) => l.id === lv && l.teams !== null);
    if (!hasSchools) throw new Error(`college level ${lv} has no schools in content`);
    collegeComp.set(lv, mkCompetition(lv, 'college', col));
  }

  // (b) conferences and divisions.
  const conferences: ConferenceRecord[] = [];
  const confByContent = new Map<string, ConferenceRecord>();
  const mkConference = (contentId: string, competitionId: number, parentId: number | null, name: string, kind: 'conference' | 'division'): ConferenceRecord => {
    const c = ConferenceRecord.parse({ id: next.conference++, competitionId, parentId, name, kind, teamIds: [] });
    conferences.push(c); confByContent.set(contentId, c);
    competitions.find((x) => x.id === competitionId)!.conferenceIds.push(c.id);
    return c;
  };
  for (const cf of content.pro.league.conferences) {
    const parent = mkConference(cf.id, proComp.id, null, cf.name, 'conference');
    for (const d of cf.divisions) mkConference(d.id, proComp.id, parent.id, `${cf.name} ${d.label}`, 'division');
  }
  for (const cf of content.college.conferences) {
    const comp = collegeComp.get(cf.level);
    if (comp) mkConference(cf.id, comp.id, null, cf.name, 'conference');
  }

  // (c) places. One per team site, with the climate and time zone weather and travel read.
  const placeStream = open('places');
  const taxWeights = content.taxProfiles.map((t) => t.weight);
  const places: PlaceRecord[] = [];
  const mkPlace = (name: string, region: string, latitude: number, longitude: number, altitudeM: number, timeZone: string, climateId: string, marketTier: number): PlaceRecord => {
    const taxProfileId = taxWeights.length > 0 ? content.taxProfiles[placeStream.pick(taxWeights)]!.id : null;
    const p: PlaceRecord = { id: next.place++, name, region, latitude, longitude, altitudeM, timeZone, climateId, marketTier, taxProfileId };
    places.push(p);
    return p;
  };
  const regionOf = new Map(content.locations.map((l) => [l.id, l.region]));
  const stadiumOfClub = new Map(content.pro.stadiums.map((s) => [s.clubId, s]));
  const schools = content.college.schools.filter((s) => collegeComp.has(s.level));
  const sites: { contentId: string; place: PlaceRecord }[] = [];
  for (const club of content.pro.league.clubs) {
    const st = stadiumOfClub.get(club.id);
    if (!st) throw new Error(`club ${club.id} has no stadium in content`);
    sites.push({ contentId: club.id, place: mkPlace(club.city, regionOf.get(club.referenceLocationId) ?? '', st.latitude, st.longitude, st.altitudeM, st.timeZone, club.referenceLocationId, club.marketTier) });
  }
  for (const s of schools) sites.push({ contentId: s.id, place: mkPlace(s.place, s.region, s.latitude, s.longitude, s.altitudeM, s.timeZone, s.referenceLocationId, s.sizeTier) });
  const placeByContent = new Map(sites.map((s) => [s.contentId, s.place]));

  // (d) teams and names (U4), (e) venues. Venue ids are issued with the team so both tables keep content order.
  const venues: VenueRecord[] = [];
  const teams: TeamRecord[] = [];
  const teamByContent = new Map<string, TeamRecord>();
  const contentIdOfTeam = new Map<number, string>();
  const placeOfTeam = new Map<number, number>();
  const mkTeam = (contentId: string, comp: CompetitionRecord, conf: ConferenceRecord | null, identity: { name: string; nickname: string; place: string; abbreviation: string; colours: string[] }, stadium: ContentStadium, altitudeM: number, climateId: string, prestige: number): void => {
    const hits = blockedTermHits([identity.name, identity.nickname, `${identity.place} ${identity.nickname}`, stadium.name], content.blockedTerms);
    if (hits.length > 0) throw new Error(`team ${contentId} uses a blocked term (${hits.join(', ')}): A6.2.2`);
    const roof = ROOF[stadium.roof];
    if (!roof) throw new Error(`stadium ${stadium.id}: unknown roof ${stadium.roof}`);
    const place = placeByContent.get(contentId)!;
    const venue = VenueRecord.parse({
      id: next.venue++, name: stadium.name, place: place.name, surfaceType: stadium.surface.type, roof, altitudeFt: altitudeM * FT_PER_M,
      capacity: stadium.capacity, noiseBase: Math.min(1, Math.max(0, stadium.noiseFactor)), climateId,
    });
    venues.push(venue);
    const team = TeamRecord.parse({
      id: next.team++, competitionId: comp.id, conferenceId: conf?.id ?? null, identity, homeVenueId: venue.id,
      ownerPersonId: null, athleticDirectorPersonId: null, presidentPersonId: null,
      finalSay: { roster: null, contracts: null, draft: null, staffHiring: null },
      resourceBand: 'middle', facilities: {}, rivalTeamIds: [], prestige,
    });
    teams.push(team); teamByContent.set(contentId, team); contentIdOfTeam.set(team.id, contentId); placeOfTeam.set(team.id, place.id);
    comp.teamIds.push(team.id);
    conf?.teamIds.push(team.id);
    if (conf?.parentId != null) conferences.find((c) => c.id === conf.parentId)!.teamIds.push(team.id);
  };
  for (const club of content.pro.league.clubs) {
    const st = stadiumOfClub.get(club.id)!;
    mkTeam(club.id, proComp, confByContent.get(club.divisionId) ?? null, { name: `${club.city} ${club.nickname}`, nickname: club.nickname, place: club.city, abbreviation: club.abbreviation, colours: [club.primaryColour, club.secondaryColour] }, st, st.altitudeM, club.referenceLocationId, param('prestige.neutral'));
  }
  const historyMax = Math.max(1, ...schools.map((s) => s.footballHistoryLevel));
  for (const s of schools) {
    mkTeam(s.id, collegeComp.get(s.level)!, s.conferenceId ? confByContent.get(s.conferenceId) ?? null : null, { name: s.name, nickname: s.nickname, place: s.place, abbreviation: s.abbreviation, colours: [s.primaryColour, s.secondaryColour] }, s.stadium, s.altitudeM, s.referenceLocationId, s.footballHistoryLevel / historyMax);
  }

  // (f) resource bands (X9.1.1): thirds of each competition by market or school size; ties fall to the step's stream.
  const resStream = open('resources');
  for (const comp of competitions) {
    const ranked = seededOrder(comp.teamIds.map((id) => ({ id, key: places.find((p) => p.id === placeOfTeam.get(id))!.marketTier })), resStream);
    ranked.forEach((r, i) => {
      const t = teams.find((x) => x.id === r.id)!;
      t.resourceBand = BANDS[Math.min(BANDS.length - 1, Math.floor((i * BANDS.length) / ranked.length))]!;
    });
  }

  // (g) team-level rival seeds (U4): content pairs, plus every division pair at strength 1 (C1.2.3).
  const rivalSeeds: { a: number; b: number; strength: number }[] = [];
  const seen = new Set<string>();
  const addRival = (a: number, b: number, strength: number): void => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (lo === hi || seen.has(`${lo}:${hi}`)) return;
    seen.add(`${lo}:${hi}`); rivalSeeds.push({ a: lo, b: hi, strength });
    teams.find((t) => t.id === lo)!.rivalTeamIds.push(hi);
    teams.find((t) => t.id === hi)!.rivalTeamIds.push(lo);
  };
  for (const r of [...content.pro.rivalries, ...content.college.rivalries]) {
    const a = teamByContent.get(r.a), b = teamByContent.get(r.b);
    if (a && b) addRival(a.id, b.id, r.strength);
  }
  for (const d of conferences.filter((c) => c.kind === 'division')) {
    for (const a of d.teamIds) for (const b of d.teamIds) if (a < b) addRival(a, b, 1);
  }
  for (const t of teams) t.rivalTeamIds.sort((x, y) => x - y);
  return { competitions, conferences, places, venues, teams, placeOfTeam, contentIdOfTeam, rivalSeeds, nextIds: next };
}

/** X10.2.1 acceptance: every team has a venue, a place and a resource band. Empty when all do. */
export function structureProblems(b: BuiltStructures): string[] {
  const out: string[] = [];
  const venueIds = new Set(b.venues.map((v) => v.id));
  for (const t of b.teams) {
    if (!venueIds.has(t.homeVenueId)) out.push(`team ${t.id} has no venue`);
    if (!b.placeOfTeam.has(t.id)) out.push(`team ${t.id} has no place`);
    if (!BANDS.includes(t.resourceBand)) out.push(`team ${t.id} has no resource band`);
  }
  for (const c of b.competitions) if (c.teamIds.length === 0) out.push(`competition ${c.id} has no teams`);
  return out;
}
