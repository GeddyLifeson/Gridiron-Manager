// G-11: generated places, teams and stadiums. Covers C1.1 (shape), C1.2 (clubs, rivalries), C1.3 (stadiums),
// C1.4.2 (climate rows cite sources), T2.1 and T2.2 (college slots), T2.4 (rivals, density) and the A6.2.2 scan.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = new URL('../../data/world/', import.meta.url);
const load = (f: string) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const pro = load('pro-league.json');
const college = load('college.json');
const refsFile = load('reference-locations.json');
const blocked = load('blocked-terms.json');

type Team = { place: string; nickname: string; name?: string; abbreviation: string };

/** A6.2.2 scan: marks only. Returns the reasons a team identity would be rejected. */
function scanIdentity(t: Team): string[] {
  const hits: string[] = [];
  const place = t.place.toLowerCase();
  const nick = t.nickname.toLowerCase();
  const realNicks = new Set<string>([...blocked.proNicknames, ...blocked.otherLeagueNicknames].map((s: string) => s.toLowerCase()));
  const realCities = blocked.proCities.map((s: string) => s.toLowerCase());
  if (realNicks.has(nick) && realCities.includes(place)) hits.push('real pro city and nickname');
  for (const c of blocked.colleges as { school: string; nickname: string }[]) {
    const s = c.school.toLowerCase();
    if (place === s || (t.name ?? '').toLowerCase() === s) hits.push(`real school ${c.school}`);
    if (place === s && nick === c.nickname.toLowerCase()) hits.push(`real school and nickname ${c.school}`);
  }
  for (const w of [...blocked.conferencesAndLeagues, ...blocked.eventsAndTrophies] as string[]) {
    if (place === w.toLowerCase() || t.abbreviation.toLowerCase() === w.toLowerCase()) hits.push(`real name ${w}`);
  }
  return hits;
}
const idents = (): Team[] => [
  ...pro.league.clubs.map((c: any) => ({ place: c.city, nickname: c.nickname, abbreviation: c.abbreviation })),
  ...college.schools.map((s: any) => ({ place: s.place, name: s.name, nickname: s.nickname, abbreviation: s.abbreviation })),
];

describe('C1.1.1 pro league shape', () => {
  it('has 2 conferences, 4 divisions each, 4 clubs per division, 32 clubs', () => {
    expect(pro.league.conferences).toHaveLength(2);
    const clubs = pro.league.clubs;
    expect(clubs).toHaveLength(32);
    for (const conf of pro.league.conferences) {
      expect(conf.divisions).toHaveLength(4);
      for (const d of conf.divisions) expect(clubs.filter((c: any) => c.divisionId === d.id)).toHaveLength(4);
    }
    expect(new Set(clubs.map((c: any) => c.id)).size).toBe(32);
  });
  it('C1.2.1 abbreviations are unique and no division shares a primary colour', () => {
    const clubs = pro.league.clubs;
    expect(new Set(clubs.map((c: any) => c.abbreviation)).size).toBe(32);
    for (const c of clubs) expect(c.abbreviation).toMatch(/^[A-Z]{2,4}$/);
    const byDiv = new Map<string, string[]>();
    for (const c of clubs) byDiv.set(c.divisionId, [...(byDiv.get(c.divisionId) ?? []), c.primaryColour.toLowerCase()]);
    for (const cols of byDiv.values()) expect(new Set(cols).size).toBe(cols.length);
  });
  it('C1.2.1 market tier 1 to 5 and every club has one stadium', () => {
    for (const c of pro.league.clubs) {
      expect(c.marketTier).toBeGreaterThanOrEqual(1);
      expect(c.marketTier).toBeLessThanOrEqual(5);
      expect(pro.stadiums.filter((s: any) => s.clubId === c.id)).toHaveLength(1);
      expect(pro.stadiums.some((s: any) => s.id === c.stadiumId)).toBe(true);
    }
  });
  it('C1.2.3 rivalry extras name real clubs, strength 2 or 3 or 1', () => {
    const ids = new Set(pro.league.clubs.map((c: any) => c.id));
    for (const r of pro.rivalries) {
      expect(ids.has(r.a) && ids.has(r.b) && r.a !== r.b).toBe(true);
      expect([1, 2, 3]).toContain(r.strength);
    }
  });
});

describe('C1.3.1 stadium records', () => {
  it('has the C1.3.1 fields in range', () => {
    for (const s of pro.stadiums) {
      expect(['open', 'fixed dome', 'retractable']).toContain(s.roof);
      expect(['natural grass', 'hybrid grass', 'artificial turf']).toContain(s.surface.type);
      expect(s.noiseFactor).toBeGreaterThanOrEqual(0.8);
      expect(s.noiseFactor).toBeLessThanOrEqual(1.2);
      expect(s.windExposure).toBeGreaterThanOrEqual(0);
      expect(s.windExposure).toBeLessThanOrEqual(1);
      if (s.roof === 'fixed dome') expect(s.windExposure).toBe(0);
      expect(s.capacity).toBeGreaterThan(40000);
      expect(Math.abs(s.latitude)).toBeLessThan(90);
    }
  });
});

describe('T2.1 / T2.2 college slots', () => {
  const top = college.schools.filter((s: any) => s.level === 'college_top');
  const second = college.schools.filter((s: any) => s.level === 'college_second');
  const size = (id: string) => college.schools.filter((s: any) => s.conferenceId === id).length;
  it('top subdivision: 138 teams, 10 conferences of 18,16,17,16,8,14,10,14,13,10, 2 independents', () => {
    expect(top).toHaveLength(138);
    const confs = college.conferences.filter((c: any) => c.level === 'college_top');
    expect(confs.map((c: any) => size(c.id)).sort((a: number, b: number) => b - a)).toEqual([18, 17, 16, 16, 14, 14, 13, 10, 10, 8]);
    expect(confs.filter((c: any) => c.tier === 'power').map((c: any) => size(c.id)).sort((a: number, b: number) => b - a)).toEqual([18, 17, 16, 16]);
    expect(college.independents).toHaveLength(2);
    expect(top.filter((s: any) => s.independent)).toHaveLength(2);
  });
  it('second subdivision: 128 teams in 13 conferences, none below 8', () => {
    expect(second).toHaveLength(128);
    const confs = college.conferences.filter((c: any) => c.level === 'college_second');
    expect(confs).toHaveLength(13);
    for (const c of confs) expect(size(c.id)).toBeGreaterThanOrEqual(8);
  });
  it('every school has exactly one conference or is a listed independent, and ids and abbreviations are unique', () => {
    const ids = new Set(college.schools.map((s: any) => s.id));
    expect(ids.size).toBe(266);
    const abbr = [...college.schools.map((s: any) => s.abbreviation), ...pro.league.clubs.map((c: any) => c.abbreviation)];
    expect(new Set(abbr).size).toBe(abbr.length);
    for (const s of college.schools) expect(Boolean(s.conferenceId) !== Boolean(s.independent)).toBe(true);
  });
  it('T2.4.1 every school has 1 to 3 rivals and the density check is recorded', () => {
    for (const s of college.schools) {
      const n = college.rivalries.filter((r: any) => r.a === s.id || r.b === s.id).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
    }
    expect(college.densityCheck).toHaveLength(9);
  });
  it('the college levels table lists all four levels', () => {
    expect(college.levels.map((l: any) => l.id)).toEqual(['college_top', 'college_second', 'college_lower', 'high_school']);
  });
});

describe('A6.2.2 scan (zero hits) and planted real names', () => {
  it('finds no real mark in any generated identity, conference or league', () => {
    for (const t of idents()) expect(scanIdentity(t), `${t.place} ${t.nickname}`).toEqual([]);
    for (const c of college.conferences) {
      expect(blocked.conferencesAndLeagues.map((s: string) => s.toLowerCase())).not.toContain(c.name.toLowerCase());
      expect(blocked.conferencesAndLeagues.map((s: string) => s.toLowerCase())).not.toContain(c.abbreviation.toLowerCase());
    }
    for (const c of pro.league.conferences) expect(blocked.conferencesAndLeagues).not.toContain(c.name);
    expect(blocked.conferencesAndLeagues).not.toContain(pro.league.name);
    expect(blocked.conferencesAndLeagues).not.toContain(pro.league.abbreviation);
  });
  it('catches planted real names', () => {
    expect(scanIdentity({ place: 'Dallas', nickname: 'Cowboys', abbreviation: 'DAL' })).not.toEqual([]);
    expect(scanIdentity({ place: 'Ohio State', nickname: 'Buckeyes', abbreviation: 'OSU' })).not.toEqual([]);
    expect(scanIdentity({ place: 'Zanzibar', nickname: 'Cowboys', abbreviation: 'SEC' })).not.toEqual([]);
  });
  it('has no image or logo field anywhere (A6.2.1 rule 3)', () => {
    const text = JSON.stringify([pro, college]);
    expect(text).not.toMatch(/"(logo|image|img|icon|headshot|crest)[A-Za-z]*"\s*:/i);
  });
});

describe('C1.4.2 climate rows cite sources (Q6)', () => {
  it('every reference location has a source citation and a status; filled normals have 12 months', () => {
    const used = new Set<string>([...pro.league.clubs, ...college.schools].map((x: any) => x.referenceLocationId));
    const have = new Set(refsFile.locations.map((l: any) => l.id));
    for (const id of used) expect(have.has(id), id).toBe(true);
    for (const l of refsFile.locations) {
      expect(l.climate.source.citation).toMatch(/NOAA/);
      expect(l.climate.status).toBeTruthy();
      if (l.climate.normals) {
        for (const k of ['tempF', 'precipIn', 'snowIn']) expect(l.climate.normals[k]).toHaveLength(12);
        expect(l.climate.source.url).toMatch(/^https:/);
        expect(l.climate.station.id).toMatch(/^USW/);
      } else expect(l.climate.status).toMatch(/^PENDING/);
    }
  });
  it('no generated team or school carries a real reference-location name as its own place', () => {
    const real = new Set(refsFile.locations.map((l: any) => l.name.toLowerCase()));
    for (const t of idents()) expect(real.has(t.place.toLowerCase()), t.place).toBe(false);
  });
});
