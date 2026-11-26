// Lost clubs: extra fictional pro clubs that are founded in the world's past and fold for good
// (Marlon 2026-11-26: "teams can start, end ... all that, like Dwarf Fortress"). Real pro football lost
// about 48 franchises, most of them in the 1920s; a world that runs from football's start should carry a
// matching graveyard of clubs whose names live on only in the record book.
//
// How many and when come from calibration data (./data/lost-clubs.json): the first and last season of
// each real defunct franchise, scaled to the world's club count. Who they are is generated: a fictional
// place built from name parts, a generic nickname, a small open-air ground. Every identity is checked
// against the A6.2.2 blocked terms and against the world's other teams, and redrawn on a hit.
//
// Lost clubs are appended after every content team, so the ids of content teams, places and venues never
// move. A lost club joins the pro competition with no conference: schedules read the competition's
// active teams (lifecycle.ts `activeTeamIds`).
import { stream, type WorldSeed } from '@gm/engine-core';
import { TeamRecord, VenueRecord, type RandomStream } from '@gm/schema';
import type { WorldContent } from './content.ts';
import data from './data/lost-clubs.json' with { type: 'json' };
import { param } from './params.ts';
import { blockedTermHits, type BuiltStructures, type PlaceRecord } from './structures.ts';

export const STREAM_LOST_CLUBS = 'world.lost_clubs';
const FT_PER_M = 3.28084;

export interface LostClubData {
  readonly spans: readonly (readonly [number, number])[];
  readonly presentDayClubs: number;
  readonly placeHeads: readonly string[];
  readonly placeTails: readonly string[];
  readonly nicknames: readonly string[];
  readonly stadiumWords: readonly string[];
  readonly colours: readonly string[];
}

/** The shipped table, with its statuses in the file (`spansStatus`, `countStatus`). */
export function lostClubData(): LostClubData {
  return data as unknown as LostClubData;
}

/** A lost club's span: its first season and the first season it did not play. */
export interface LostClubSpan { readonly teamId: number; readonly founded: number; readonly folded: number }

export interface LostClubsResult {
  /** The structures with the lost clubs appended (a new object; the input is not changed). */
  readonly built: BuiltStructures;
  readonly spans: readonly LostClubSpan[];
}

/**
 * How many lost clubs a world of `proClubs` present-day clubs carries: the real count scaled by club count,
 * rounded. With `fraction` below 1 only that share is kept (a lighter graveyard for tests; the default is 1).
 */
export function lostClubCount(proClubs: number, d: LostClubData = lostClubData(), fraction = 1): number {
  return Math.round((d.spans.length * proClubs * fraction) / d.presentDayClubs);
}

function draw<T>(xs: readonly T[], s: RandomStream): T {
  return xs[s.int(0, xs.length - 1)]!;
}

/**
 * Spans for `n` lost clubs: the real spans in a seeded order, cycling when the world needs more than the
 * table holds. A club whose last season falls before `firstSeasonYear` never existed in this world and is
 * left out; one already playing in that season is founded on day one.
 */
export function lostClubSpans(seed: WorldSeed, n: number, firstSeasonYear: number, d: LostClubData = lostClubData()): { founded: number; folded: number }[] {
  const s = stream(seed, STREAM_LOST_CLUBS, ['spans']);
  const order = d.spans.map((sp, i) => ({ sp, i, k: s.uniform() })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.sp);
  const out: { founded: number; folded: number }[] = [];
  for (let i = 0; i < n; i++) {
    const [first, last] = order[i % order.length]!;
    if (last < firstSeasonYear) continue;
    out.push({ founded: Math.max(first, firstSeasonYear), folded: last + 1 });
  }
  return out;
}

/**
 * Append lost clubs to built structures. `n` is the number of clubs before the first-season cut
 * (`lostClubCount`). Each club has its own keyed stream, so one club's redraws never move another.
 */
export function addLostClubs(
  built: BuiltStructures, seed: WorldSeed, content: WorldContent, n: number, firstSeasonYear: number, d: LostClubData = lostClubData(),
): LostClubsResult {
  // The pro competition is the one built from the content league (structures.ts names it so).
  const pro = built.competitions.find((c) => c.name === content.pro.league.name);
  if (!pro) throw new Error('lost clubs: the world has no competition for the content pro league');
  const spans = lostClubSpans(seed, n, firstSeasonYear, d);
  const competitions = built.competitions.map((c) => (c.id === pro.id ? { ...c, teamIds: [...c.teamIds] } : c));
  const proComp = competitions.find((c) => c.id === pro.id)!;
  const places = [...built.places], venues = [...built.venues], teams = [...built.teams];
  const placeOfTeam = new Map(built.placeOfTeam), contentIdOfTeam = new Map(built.contentIdOfTeam);
  const next = { ...built.nextIds };
  const usedPlaces = new Set(places.map((p) => p.name.toLowerCase()));
  const usedNames = new Set(teams.map((t) => t.identity.name.toLowerCase()));
  const usedAbbr = new Set(teams.map((t) => t.identity.abbreviation));
  const taxWeights = content.taxProfiles.map((t) => t.weight);
  const out: LostClubSpan[] = [];
  spans.forEach((span, i) => {
    const s = stream(seed, STREAM_LOST_CLUBS, ['club', i]);
    const loc = draw(content.locations, s);
    let place = '', nickname = '', stadiumName = '', tries = 0;
    for (;;) {
      if (++tries > param('lost.nameTries')) throw new Error(`lost club ${i}: no free name after ${tries - 1} draws`);
      place = `${draw(d.placeHeads, s)}${draw(d.placeTails, s)}`;
      nickname = draw(d.nicknames, s);
      stadiumName = `${place} ${draw(d.stadiumWords, s)}`;
      const name = `${place} ${nickname}`;
      if (usedPlaces.has(place.toLowerCase()) || usedNames.has(name.toLowerCase())) continue;
      if (blockedTermHits([name, nickname, place, stadiumName], content.blockedTerms).length > 0) continue;
      break;
    }
    usedPlaces.add(place.toLowerCase());
    usedNames.add(`${place} ${nickname}`.toLowerCase());
    let abbr = place.slice(0, 3).toUpperCase();
    for (let k = 0; usedAbbr.has(abbr); k++) abbr = `${place.slice(0, 2).toUpperCase()}${String.fromCharCode(65 + (k % 26))}`;
    usedAbbr.add(abbr);
    const taxProfileId = taxWeights.length > 0 ? content.taxProfiles[s.pick(taxWeights)]!.id : null;
    const p: PlaceRecord = {
      id: next.place++, name: place, region: loc.region, latitude: loc.lat, longitude: loc.lon, altitudeM: loc.elevationM, timeZone: loc.timeZone,
      climateId: loc.id, marketTier: s.int(param('lost.marketTierMin'), param('lost.marketTierMax')), taxProfileId,
    };
    places.push(p);
    const venue = VenueRecord.parse({
      id: next.venue++, name: stadiumName, place: place, surfaceType: 'natural grass', roof: 'open', altitudeFt: loc.elevationM * FT_PER_M,
      capacity: s.int(param('lost.capacityMin'), param('lost.capacityMax')), noiseBase: param('lost.noiseBase'), climateId: loc.id,
    });
    venues.push(venue);
    const colours = [draw(d.colours, s), draw(d.colours, s)];
    const team = TeamRecord.parse({
      id: next.team++, competitionId: proComp.id, conferenceId: null,
      identity: { name: `${place} ${nickname}`, nickname, place, abbreviation: abbr, colours },
      homeVenueId: venue.id, ownerPersonId: null, athleticDirectorPersonId: null, presidentPersonId: null,
      finalSay: { roster: null, contracts: null, draft: null, staffHiring: null },
      resourceBand: 'low', facilities: {}, rivalTeamIds: [], prestige: param('prestige.neutral'),
    });
    teams.push(team);
    proComp.teamIds.push(team.id);
    placeOfTeam.set(team.id, p.id);
    contentIdOfTeam.set(team.id, `lost.${i}`);
    out.push({ teamId: team.id, founded: span.founded, folded: span.folded });
  });
  return { built: { ...built, competitions, places, venues, teams, placeOfTeam, contentIdOfTeam, nextIds: next }, spans: out };
}
