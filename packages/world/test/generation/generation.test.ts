import { describe, expect, it } from 'vitest';
import { seedFromHex, utf8 } from '@gm/engine-core';
import { ParamFile } from '@gm/schema';
import { CONTENT, NAMES, RAW, generation, loop, miniWorld, setup, trimmed } from '../fixtures.ts';

const { bytesToHex, sha256 } = generation;

describe('sha256 (X10.1.2 setup hash)', () => {
  it('matches the FIPS 180-4 test vectors', () => {
    expect(bytesToHex(sha256(utf8('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(bytesToHex(sha256(utf8('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(bytesToHex(sha256(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(bytesToHex(sha256(utf8('a'.repeat(1000))))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });
});

describe('setup record (X10.1.1)', () => {
  it('parameter files are valid', () => {
    expect(ParamFile.safeParse(generation.PARAMS).success).toBe(true);
    expect(ParamFile.safeParse(loop.PARAMS).success).toBe(true);
    for (const p of [...generation.PARAMS.params, ...loop.PARAMS.params]) expect(p.value >= p.min && p.value <= p.max, p.name).toBe(true);
  });
  it('offers no difficulty, slider or modifier field (acceptance)', () => {
    expect(generation.setupFieldProblems(generation.SETUP_FIELDS as string[])).toEqual([]);
    for (const f of ['difficulty', 'injurySlider', 'userTraitBonus', 'luckModifier', 'startingLabel']) expect(generation.setupFieldProblems([f]).length, f).toBeGreaterThan(0);
    expect(() => generation.createSetup({ ...setup(), difficulty: 'easy' } as never)).toThrow(/difficulty/);
  });
  it('presets are 0, 10, 30, 60 with 30 the default', () => {
    expect(generation.historyPresets()).toEqual([0, 10, 30, 60]);
    expect(generation.param('history.default')).toBe(30);
  });
  it('is immutable after creation, with packs sorted', () => {
    const s = generation.createSetup({ ...setup(), packs: [{ id: 'zeta', contentHashHex: 'aabbccdd' }, { id: 'alpha', contentHashHex: '11223344' }], careerCurveDial: 0.5 });
    expect(s.packs.map((p) => p.id)).toEqual(['alpha', 'zeta']);
    expect(() => { (s as { historySeasons: number }).historySeasons = 5; }).toThrow();
    expect(() => { (s.packs as unknown as { id: string }[]).push({ id: 'x' }); }).toThrow();
  });
  it('hides the dial when no pack is loaded', () => {
    expect(() => generation.createSetup({ ...setup(), careerCurveDial: 0.5 })).toThrow(/careerCurveDial/);
  });
  it('a text seed always gives the same 16 hex digits', () => {
    expect(generation.seedHexFromText('my world')).toMatch(/^[0-9a-f]{16}$/);
    expect(generation.seedHexFromText('my world')).toBe(generation.seedHexFromText('my world'));
    expect(generation.seedHexFromText('my world')).not.toBe(generation.seedHexFromText('my world '));
  });
});

describe('world code (X10.1.2)', () => {
  const s = setup();
  const code = generation.worldCode(s, 'gm0.1', 'c1.0');
  it('round-trips, in blocks of five, about 45 characters with no packs', () => {
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{5}-)*[0-9A-HJKMNP-TV-Z]{1,5}$/);
    expect(code.replace(/-/g, '').length).toBeGreaterThanOrEqual(40);
    expect(code.replace(/-/g, '').length).toBeLessThanOrEqual(50);
    const d = generation.decodeWorldCode(code);
    expect(d.ok && d.fields).toEqual(generation.worldCodeFields(s, 'gm0.1', 'c1.0'));
    const lower = generation.decodeWorldCode(code.toLowerCase().replace(/-/g, ' '));
    expect(lower.ok).toBe(true);
  });
  it('carries packs sorted by id with 32 bits of each hash', () => {
    const p = generation.createSetup({ ...s, packs: [{ id: 'real2026', contentHashHex: 'deadbeefcafe0001' }, { id: 'coaches', contentHashHex: '0123456789abcdef' }], careerCurveDial: 0.4 });
    const d = generation.decodeWorldCode(generation.worldCode(p, 'gm0.1', 'c1.0'));
    expect(d.ok && d.fields.packs).toEqual([{ id: 'coaches', hash32Hex: '01234567' }, { id: 'real2026', hash32Hex: 'deadbeef' }]);
  });
  it('a mistyped code is rejected, never decoded into a different world', () => {
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const chars = code.split('');
    let tried = 0;
    chars.forEach((ch, i) => {
      if (ch === '-') return;
      for (const sub of alphabet) {
        if (sub === ch) continue;
        const typo = [...chars]; typo[i] = sub; tried++;
        const d = generation.decodeWorldCode(typo.join(''));
        expect(d.ok, `position ${i} ${ch}->${sub}`).toBe(false);
        if (!d.ok) expect(d.message).toBe('This code has a typo');
      }
    });
    expect(tried).toBeGreaterThan(1000);
    // Two neighbours swapped.
    for (let i = 0; i + 1 < chars.length; i++) {
      if (chars[i] === '-' || chars[i + 1] === '-' || chars[i] === chars[i + 1]) continue;
      const t = [...chars]; [t[i], t[i + 1]] = [t[i + 1]!, t[i]!];
      expect(generation.decodeWorldCode(t.join('')).ok, `swap ${i}`).toBe(false);
    }
    expect(generation.decodeWorldCode('').ok).toBe(false);
  });
  it('names every mismatch before anything is created', () => {
    const p = generation.createSetup({ ...s, packs: [{ id: 'real2026', contentHashHex: 'deadbeefcafe0001' }], careerCurveDial: 0.4 });
    const f = generation.worldCodeFields(p, 'gm0.1', 'c1.0');
    expect(generation.worldCodeMismatches(f, { gameVersion: 'gm0.1', contentVersion: 'c1.0', packs: p.packs })).toEqual([]);
    const m = generation.worldCodeMismatches(f, { gameVersion: 'gm0.2', contentVersion: 'c1.1', packs: [{ id: 'real2026', contentHashHex: 'deadbeeeffffffff' }, { id: 'extra', contentHashHex: '00000000' }] });
    expect(m).toHaveLength(4);
    expect(m.join(' ')).toMatch(/Game version.*Content version.*real2026.*extra/);
    expect(generation.worldCodeMismatches(f, { gameVersion: 'gm0.1', contentVersion: 'c1.0', packs: [] })[0]).toMatch(/not loaded/);
  });
  it('a pack edited locally gives a different code; a changed setup gives a different hash', () => {
    const a = generation.createSetup({ ...s, packs: [{ id: 'p', contentHashHex: 'deadbeef' }], careerCurveDial: 0.4 });
    const b = generation.createSetup({ ...s, packs: [{ id: 'p', contentHashHex: 'deadbeee' }], careerCurveDial: 0.4 });
    expect(generation.worldCode(a, 'g', 'c')).not.toBe(generation.worldCode(b, 'g', 'c'));
    expect(generation.setupHashHex(setup({ historySeasons: 10 }))).not.toBe(generation.setupHashHex(s));
  });
  it('the same code builds an identical world (acceptance, one machine twice)', () => {
    const d = generation.decodeWorldCode(code);
    if (!d.ok) throw new Error('decode');
    const again = setup({ seedHex: d.fields.seedHex });
    expect(generation.setupHashHex(again).slice(0, 16)).toBe(d.fields.setupHash64Hex);
    expect(loop.worldHash(miniWorld({ seedHex: d.fields.seedHex }))).toBe(loop.worldHash(miniWorld()));
    expect(loop.worldHash(miniWorld({ seedHex: '00000000000000a8' }))).not.toBe(loop.worldHash(miniWorld()));
  });
});

describe('structures (X10.2.1, U4.1.1)', () => {
  const seed = seedFromHex(setup().seedHex);
  const small = generation.buildStructures(setup({ size: 'small' }), seed, CONTENT);
  const full = generation.buildStructures(setup({ size: 'full' }), seed, CONTENT);
  it('every team has a venue, a place and a resource band (acceptance)', () => {
    for (const b of [small, full]) {
      expect(generation.structureProblems(b)).toEqual([]);
      for (const t of b.teams) expect(b.places.some((p) => p.id === b.placeOfTeam.get(t.id))).toBe(true);
    }
  });
  it('the pro league is never shrunk; small keeps the top college level, full adds the second', () => {
    const proTeams = (b: generation.BuiltStructures): number => b.competitions.find((c) => c.level === 'pro')!.teamIds.length;
    expect(proTeams(small)).toBe(32);
    expect(proTeams(full)).toBe(32);
    expect(small.teams.length).toBe(32 + 138);
    expect(full.teams.length).toBe(32 + 138 + 128);
    expect(small.competitions.length).toBe(2);
    expect(full.competitions.length).toBe(3);
    expect(small.conferences.filter((c) => c.kind === 'division')).toHaveLength(8);
    for (const d of small.conferences.filter((c) => c.kind === 'division')) expect(d.teamIds).toHaveLength(4);
  });
  it('two runs of one seed are identical; a new place seed changes no team count or conference (acceptance)', () => {
    const again = generation.buildStructures(setup({ size: 'small' }), seed, CONTENT);
    expect(JSON.stringify(again.teams)).toBe(JSON.stringify(small.teams));
    expect(JSON.stringify(again.places)).toBe(JSON.stringify(small.places));
    const taxed = { ...CONTENT, taxProfiles: [{ id: 'tax:a', weight: 3 }, { id: 'tax:b', weight: 2 }, { id: 'tax:c', weight: 1 }] };
    const a = generation.buildStructures(setup({ size: 'small' }), seed, taxed);
    const b = generation.buildStructures(setup({ size: 'small' }), seed, taxed, { stepSeed: { places: seedFromHex('00000000000000ff') } });
    expect(JSON.stringify(a.places)).not.toBe(JSON.stringify(b.places));
    expect(JSON.stringify(b.teams)).toBe(JSON.stringify(a.teams));
    expect(JSON.stringify(b.conferences)).toBe(JSON.stringify(a.conferences));
    expect(a.places.every((p) => p.taxProfileId !== null)).toBe(true);
    // And the resource step's own seed moves only tie-broken bands, never ids, names or conferences.
    const c = generation.buildStructures(setup({ size: 'small' }), seed, CONTENT, { stepSeed: { resources: seedFromHex('00000000000000ff') } });
    expect(c.teams.map((t) => [t.id, t.identity.name, t.conferenceId])).toEqual(small.teams.map((t) => [t.id, t.identity.name, t.conferenceId]));
  });
  it('resource bands split each competition into thirds', () => {
    for (const comp of small.competitions) {
      const bands = comp.teamIds.map((id) => small.teams.find((t) => t.id === id)!.resourceBand);
      for (const b of ['low', 'middle', 'top']) expect(bands.filter((x) => x === b).length).toBeGreaterThanOrEqual(Math.floor(bands.length / 3));
    }
  });
  it('division mates are rivals, and rival seeds are mutual', () => {
    for (const d of small.conferences.filter((c) => c.kind === 'division')) {
      for (const a of d.teamIds) for (const b of d.teamIds) if (a !== b) expect(small.teams.find((t) => t.id === a)!.rivalTeamIds).toContain(b);
    }
    for (const t of full.teams) for (const r of t.rivalTeamIds) expect(full.teams.find((x) => x.id === r)!.rivalTeamIds).toContain(t.id);
  });
  it('no generated identity hits the A6.2.2 blocked terms, and a real pairing is refused', () => {
    for (const t of full.teams) {
      const v = full.venues.find((x) => x.id === t.homeVenueId)!;
      expect(generation.blockedTermHits([t.identity.name, t.identity.nickname, `${t.identity.place} ${t.identity.nickname}`, v.name], CONTENT.blockedTerms), t.identity.name).toEqual([]);
    }
    const city = RAW.blocked.proCities[0]!, nick = RAW.blocked.proNicknames[1]!;
    expect(generation.blockedTermHits([`${city} ${nick}`], CONTENT.blockedTerms).length).toBeGreaterThan(0);
    // The combination rule: an ordinary-word nickname alone is allowed.
    expect(generation.blockedTermHits([`Marlbury ${nick}`], CONTENT.blockedTerms)).toEqual([]);
    const bad = trimmed();
    const clubs = bad.pro.league.clubs.map((c, i) => (i === 0 ? { ...c, city, nickname: nick } : c));
    expect(() => generation.buildStructures(setup(), seed, { ...bad, pro: { ...bad.pro, league: { ...bad.pro.league, clubs } } })).toThrow(/blocked term/);
  });
});

describe('founding people and cultures (X10.2.2)', () => {
  const s = setup();
  const seed = seedFromHex(s.seedHex);
  const content = trimmed();
  const built = generation.buildStructures(s, seed, content);
  const f = generation.foundPeople(s, seed, content, built, NAMES);
  const byId = new Map(f.people.map((p) => [p.id, p]));
  const levelOf = new Map(built.competitions.map((c) => [c.id, c.level]));
  const age = (id: number): number => s.firstSeasonYear - byId.get(id)!.birthDate.seasonYear;

  it('every roster and staff is legal on day one (acceptance)', () => {
    expect(generation.foundingProblems(s, content, built, f)).toEqual([]);
    for (const t of built.teams) expect(f.rosters.get(t.id)!.length).toBe(content.levels[levelOf.get(t.competitionId)!].rosterLimit);
  });
  it('the roster mix follows real rosters scaled to the limit', () => {
    const counts = generation.scaleMix(content.levels.pro.rosterMix, content.levels.pro.rosterLimit);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(content.levels.pro.rosterLimit);
    for (const pos of ['QB', 'K', 'P', 'LS', 'C']) expect(counts[pos], pos).toBeGreaterThanOrEqual(1);
    expect(counts.WR!).toBeGreaterThan(counts.QB!);
    expect(generation.scaleMix({ a: 1, b: 1, c: 1 }, 10)).toEqual({ a: 4, b: 3, c: 3 });
  });
  it('founding pro rosters have a median age of 26, plus or minus 1, with about 80 percent between 23 and 31 (acceptance)', () => {
    const ages = built.teams.filter((t) => levelOf.get(t.competitionId) === 'pro').flatMap((t) => f.rosters.get(t.id)!.map(age)).sort((a, b) => a - b);
    const median = ages[Math.floor(ages.length / 2)]!;
    expect(Math.abs(median - 26)).toBeLessThanOrEqual(1);
    const inBand = ages.filter((a) => a >= 23 && a <= 31).length / ages.length;
    expect(inBand).toBeGreaterThan(0.74);
    expect(inBand).toBeLessThan(0.92);
    expect(ages[0]!).toBeGreaterThanOrEqual(20);
  });
  it('every class year is on every college roster', () => {
    for (const t of built.teams.filter((x) => levelOf.get(x.competitionId) === 'college')) {
      const years = new Set(f.rosters.get(t.id)!.map((id) => f.classYearOf.get(id)));
      expect([...years].sort()).toEqual([0, 1, 2, 3, 4]);
    }
  });
  it('head coaches are 35 to 70, entry chairs 21 to 23, staff 21 to 65, and nobody has years in chair', () => {
    for (const st of f.staffs) {
      for (const seat of st.seats) {
        const a = age(seat.holderPersonId!);
        // Birth dates fall either side of September 1, so football age can read one year high.
        if (seat.positionId === 'pos:head_coach') { expect(a).toBeGreaterThanOrEqual(35); expect(a).toBeLessThanOrEqual(71); }
        else { expect(a).toBeGreaterThanOrEqual(21); expect(a).toBeLessThanOrEqual(66); }
        if (seat.rung !== null && seat.rung <= 1) expect(a).toBeLessThanOrEqual(24);
        expect(seat.holderSince).toEqual({ seasonYear: s.firstSeasonYear, dayIndex: 0 });
      }
    }
  });
  it('contract end years are staggered from 1 to the longest founding deal', () => {
    const years = [...f.staffContractEndYear.values()].map((y) => y - s.firstSeasonYear);
    expect(Math.min(...years)).toBe(1);
    expect(Math.max(...years)).toBe(generation.param('contract.staffMaxYears'));
    expect(new Set(years).size).toBe(generation.param('contract.staffMaxYears'));
  });
  it('founding people are generated, with no past, and no real current name', () => {
    const real = RAW.lib.guardSet(RAW.guard.packed);
    for (const p of f.people) {
      expect(p.origin).toBe('generated');
      expect(p.history.honourEventIds).toEqual([]);
      expect(p.diedYear).toBeNull();
      expect(real.has(RAW.lib.guardHash(p.name.first, p.name.last))).toBe(false);
    }
  });
  it('each team has its bosses and a culture record with no tradition yet', () => {
    for (const t of built.teams) {
      const owners = [t.ownerPersonId, t.athleticDirectorPersonId, t.presidentPersonId].filter((x) => x !== null);
      expect(owners.length).toBe(content.levels[levelOf.get(t.competitionId)!].bossChairs.length);
      expect(f.cultures.find((c) => c.teamId === t.id)!.traditionStrength).toBe(0);
    }
  });
  it('the same seed founds the same people; another seed founds others', () => {
    const again = generation.foundPeople(s, seed, content, built, NAMES);
    expect(JSON.stringify(again.people)).toBe(JSON.stringify(f.people));
    const other = generation.foundPeople(s, seedFromHex('00000000000000a8'), content, built, NAMES);
    expect(JSON.stringify(other.people[10])).not.toBe(JSON.stringify(f.people[10]));
  });
  it('the world starts with one event, dated in the first season', () => {
    const w = miniWorld();
    const rows = w.log.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe(loop.WORLD_FOUNDED);
    expect(rows[0]!.when.date.seasonYear).toBe(s.firstSeasonYear);
  });
});
