import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { medical } from '@gm/league';
import { foulsInjuries, stream, seedFromHex } from '@gm/engine-core';
import { NAMES, PRO_LOOKUP, COLLEGE_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';
import * as health from '../../src/health/index.ts';

const content = trimmed();
const CATALOGUE = medical.catalogueFrom(JSON.parse(readFileSync(new URL('../../../football-content/data/injuries/catalogue.json', import.meta.url), 'utf8')).rows);
const lookup = (lvl: 'pro' | 'college') => (k: string) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);
const RULES = { pro: health.medicalRulesFrom('pro', lookup('pro')).rules, college: health.medicalRulesFrom('college', lookup('college')).rules };
const binding: health.HealthBinding = { catalogue: CATALOGUE, rules: (lvl) => RULES[lvl], levelOfTeam: (w, id) => turnover.levelOfTeam(w, id) };

/**
 * TEST DOUBLE game port that reports injuries: the test score double plus, from a seeded draw, an injury to
 * a roster player of either team. NOT the engine and NOT an injury rate: only enough reports for the step.
 */
function injuringPort(perGame = 0.6, regions: readonly string[] = ['knee', 'ankle', 'hamstring', 'concussion', 'shoulder', 'acl_tear']): loop.GamePort {
  const score = testGamePort();
  return (req) => {
    const base = score(req);
    const s = stream(seedFromHex(req.seedHex), 'test.injury', []);
    const injuries: loop.GameInjury[] = [];
    if (s.chance(perGame)) {
      const teamId = s.chance(0.5) ? req.game.homeTeamId : req.game.awayTeamId;
      const roster = req.world.rosters.get(teamId) ?? [];
      if (roster.length > 0) {
        const region = regions[s.int(0, regions.length - 1)]!;
        injuries.push({
          personId: roster[s.int(0, roster.length - 1)]!, teamId, mechanism: region === 'concussion' ? 'head_impact' : 'contact_lower',
          region, severitySeed: s.uniform(), headImpact: region === 'concussion', evaluationMissed: false,
        });
      }
    }
    return { ...base, injuries };
  };
}

function build(port: loop.GamePort, withHealth = true) {
  const w = loop.createWorld({ setup: setup({}), content, names: NAMES, eventTypes: [...turnover.TURNOVER_EVENT_TYPES, ...health.HEALTH_EVENT_TYPES] });
  const sys = loop.systemsFrom({
    games: loop.gamesStep(testSchedule, port), leaving: loop.leavingStep(),
    ...(withHealth ? { health: health.healthStep(binding) } : {}),
  }, 'test: not bound');
  return { w, sys };
}

describe('diagnosis from the engine report (J10.6.1 to D11.2.1)', () => {
  it('names the catalogue row by region and bands the seed into grades, grade 1 lowest', () => {
    expect(health.diagnosisOf(CATALOGUE, 'knee', 0.05)).toEqual({ typeId: 'knee', grade: 1 });
    expect(health.diagnosisOf(CATALOGUE, 'knee', 0.5)).toEqual({ typeId: 'knee', grade: 2 });
    expect(health.diagnosisOf(CATALOGUE, 'knee', 0.999)).toEqual({ typeId: 'knee', grade: 3 });
  });
  it('sends a region the catalogue lacks to all_other, and a row with no numeric grades to grade null', () => {
    expect(health.diagnosisOf(CATALOGUE, 'spleen', 0.2).typeId).toBe('all_other');
    expect(health.diagnosisOf(CATALOGUE, 'hamstring', 0.2).grade).toBeNull();
  });
  it('knows every region the engine can name (fouls-injuries REGION_TABLE)', () => {
    for (const rows of Object.values(foulsInjuries.REGION_TABLE)) for (const [region] of rows) expect(CATALOGUE.has(region), region).toBe(true);
  });
});

describe('the bridge from engine truth events', () => {
  const events = [
    { type: 'tackle' },
    { type: 'injury', playerId: 1003, mechanism: 'head_impact', region: 'concussion', severitySeed: 0.4, headImpact: true },
    { type: 'injury', playerId: 2105, mechanism: 'contact_lower', region: 'knee', severitySeed: 0.7, headImpact: false },
  ];
  const map = new Map([[1003, { personId: 50, teamId: 1 }], [2105, { personId: 77, teamId: 2 }]]);
  it('maps injury events to world people in event order, and marks a missed concussion', () => {
    const out = health.injuriesFromTruth(events, (id) => map.get(id), new Set([1003]));
    expect(out.map((i) => [i.personId, i.region, i.evaluationMissed])).toEqual([[50, 'concussion', true], [77, 'knee', false]]);
  });
  it('refuses an injured player the port cannot name', () => {
    expect(() => health.injuriesFromTruth(events, () => undefined)).toThrow(/no world person/);
  });
});

describe('medical rules until the G-10 keys land', () => {
  it('reads a key the rule set holds and names every fallback it used', () => {
    const r = health.medicalRulesFrom('pro', (k) => (k === 'medical.report_practice_days' ? 2 : undefined));
    expect(r.rules.reportPracticeDays).toBe(2);
    expect(r.fallbackKeys).toContain('medical.concussion_protocol');
    expect(r.fallbackKeys).not.toContain('medical.report_practice_days');
  });
  it('gives college no consultant confirmation and no report, as G-33 built it', () => {
    expect(RULES.college.consultantConfirms).toBe(false);
    expect(RULES.college.reportRule).toBe('none');
  });
});

describe('the health step in the world (D11 off-screen)', () => {
  it('opens a case per reported injury, emits the known ones, and heals them over time', () => {
    const { w, sys } = build(injuringPort());
    loop.runSeason(w, sys, testSchedule);
    const h = health.healthOf(w);
    expect(h.opened).toBeGreaterThan(0);
    expect(h.unreportedGames).toBe(0);
    expect(h.reportedGames).toBe(w.seasons[0]!.games);
    const rows = w.log.rows().filter((r) => r.type === health.PLAYER_INJURED);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(h.opened);
    for (const r of rows) expect(['minor', 'moderate', 'major', 'season_ending', 'unknown']).toContain(r.payload['severity']);
    // The week's report never outlives the week.
    expect(w.systemState.has(loop.GAME_INJURIES_KEY)).toBe(false);
    // Second season: short injuries from the first one healed over the offseason; long ones may still be open.
    loop.runSeason(w, sys, testSchedule);
    const h2 = health.healthOf(w);
    expect(h2.history.length).toBeGreaterThan(0);
    for (const c of h2.cases) expect(c.status).toBe('active');
    const healed = h2.history.reduce((n, [, x]) => n + x.injuries, 0);
    expect(healed + h2.cases.length).toBe(h2.opened);
  });

  it('keeps a recovered concussion in the person history for the prior-concussion effect (D11.4.2)', () => {
    const { w, sys } = build(injuringPort(1, ['concussion']));
    loop.runSeason(w, sys, testSchedule);
    loop.runSeason(w, sys, testSchedule);
    const withDays = health.healthOf(w).history.filter(([, x]) => x.concussionDays.length > 0);
    expect(withDays.length).toBeGreaterThan(0);
  });

  it('shows a player as out while the physician has not cleared him', () => {
    const { w, sys } = build(injuringPort(1, ['acl_tear']));
    loop.runWeek(w, sys);
    const c = health.healthOf(w).cases.find((x) => x.shown.known);
    expect(c).toBeDefined();
    expect(health.isOut(w, c!.personId)).toBe(true);
    expect(health.openCaseOf(w, c!.personId)?.typeId).toBe('acl_tear');
  });

  it('is deterministic: the same seed gives the same world hash', () => {
    const a = build(injuringPort()); loop.runSeason(a.w, a.sys, testSchedule);
    const b = build(injuringPort()); loop.runSeason(b.w, b.sys, testSchedule);
    expect(loop.worldHash(a.w)).toBe(loop.worldHash(b.w));
  });

  it('opens nothing and counts the games when the port reports no injuries (placeholder rosters)', () => {
    const { w, sys } = build(testGamePort());
    loop.runSeason(w, sys, testSchedule);
    const h = health.healthOf(w);
    expect(h.opened).toBe(0);
    expect(h.reportedGames).toBe(0);
    expect(h.unreportedGames).toBe(w.seasons[0]!.games);
  });

  it('leaves a world whose port reports no injuries hashing as before when health is not bound', () => {
    const a = build(testGamePort(), false); loop.runSeason(a.w, a.sys, testSchedule);
    expect(a.w.systemState.size).toBe(0);
  });
});
