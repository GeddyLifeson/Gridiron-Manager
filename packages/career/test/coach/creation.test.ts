// E1.1 to E1.7 and S2.1 acceptance: creation is background choices with no point spend.
import { describe, expect, it } from 'vitest';
import { CoachingBlock, RelationshipEdge, TraitBlock, scanForbiddenJson, computeStatus } from '@gm/schema';
import {
  createCoach, validateCreation, auditCoach, PRESETS, ORIGINS, choicesFromPreset, choicesFromOrigin, playerOpinionEdge,
  playerOpinionEdgeAfter, COACH_FACTS, PARAMS, RULE_KEYS, START_MODES, PLAYING_LEVELS, SIDES, POSITION_GROUPS, writtenRange,
  type CreationChoices, type CreatedCoach, type Level, type StartMode, type PlayingLevel,
} from '../../src/coach/index.ts';
import { BASE, RULES, YEAR, makeWorld, rng } from './fixture.ts';

const W = makeWorld();
const ok = (c: CreationChoices, seed = c.seed): CreatedCoach => {
  const r = createCoach(c, W, RULES, rng(seed), 900);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.coach;
};

describe('E1.4.1 no points: the coach starts as his past', () => {
  it('a nobody start writes no coaching history and no mentors (E1.6.1 edge case)', () => {
    const c = ok(BASE);
    expect(c.seats).toEqual([]);
    expect(c.mentors).toEqual([]);
    expect(c.edges).toEqual([]);
  });

  it('the coaching block validates against the world contract and holds no ability field (E1.1.1, E1.4.1 acc. 1)', () => {
    for (const p of PRESETS) {
      const c = ok(choicesFromPreset(p, 11, p.level === 'pro' ? 13 : 3));
      const block = { ...c.coaching, demonstratedRecord: {}, historyFacts: c.coaching.historyFacts.map((f) => ({ ...f, refIds: [...f.refIds] })) };
      expect(() => CoachingBlock.parse(block)).not.toThrow();
      expect(() => TraitBlock.parse(c.traitBlock)).not.toThrow();
      for (const e of c.edges) expect(() => RelationshipEdge.parse({ ...e, basisEventIds: [...e.basisEventIds] })).not.toThrow();
      // Every number on the coaching block is a count of seasons in a family; nothing else is numeric.
      for (const [k, v] of Object.entries(c.coaching)) {
        if (k === 'systemFamilies') continue;
        expect(typeof v === 'number', k).toBe(false);
      }
      expect(scanForbiddenJson(`preset:${p.id}`, c)).toEqual([]);
    }
  });

  it('nothing in the created record names a skill, rating, point, trait or experience value', () => {
    const c = ok(choicesFromPreset(PRESETS[1]!, 3, 13));
    const keys: string[] = [];
    const walk = (o: unknown) => {
      if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (!k.includes(':')) keys.push(k); walk(v); }
    };
    walk(c);
    expect(keys.filter((k) => /^(xp|experiencePoints|points|perks?|traits)$|skill|rating|ability|competen|fluency|bonus/i.test(k))).toEqual([]);
  });

  it('two coaches who differ only in background carry the same kind of record (E1.4.1 rule 2)', () => {
    const a = ok({ ...BASE, playing: { level: 'none', positionGroup: 'none', proSeasons: 0 } });
    const b = ok({ ...BASE, age: 32, playing: { level: 'pro_long', positionGroup: 'LB', proSeasons: 10 } });
    expect(Object.keys(a.coaching).sort()).toEqual(Object.keys(b.coaching).sort());
    expect(a.coaching.side).toBe(b.coaching.side);
  });
});

describe('E1.2.1 playing history', () => {
  it('opening edge with players is +5, +8, +10 and decays to zero over two seasons', () => {
    expect(playerOpinionEdge('none')).toBe(0);
    expect(playerOpinionEdge('small_college')).toBe(0);
    expect(playerOpinionEdge('major_college')).toBe(5);
    expect(playerOpinionEdge('pro_short')).toBe(8);
    expect(playerOpinionEdge('pro_long')).toBe(10);
    expect(playerOpinionEdgeAfter('pro_long', 1)).toBe(5);
    expect(playerOpinionEdgeAfter('pro_long', 2)).toBe(0);
    expect(playerOpinionEdgeAfter('major_college', 2)).toBe(playerOpinionEdgeAfter('none', 2));
  });

  it('pro seasons must match the playing choice (check 2)', () => {
    const bad = validateCreation({ ...BASE, playing: { level: 'pro_short', positionGroup: 'QB', proSeasons: 7 } }, W, RULES);
    expect(bad.problems.map((p) => [p.check, p.key])).toContainEqual([2, 'coach.create.pro_seasons_out_of_range']);
    const bad2 = validateCreation({ ...BASE, playing: { level: 'major_college', positionGroup: 'QB', proSeasons: 2 } }, W, RULES);
    expect(bad2.problems[0]!.check).toBe(2);
  });

  it('a long pro career adds to the minimum age and removes coaching years (E1.2.1 rule 3)', () => {
    const v = validateCreation({ ...BASE, level: 'pro', start: 'position_coach', age: 30, playing: { level: 'pro_long', positionGroup: 'QB', proSeasons: 8 } }, W, RULES);
    expect(v.problems).toEqual([]);
    expect(v.choices.age).toBe(22 + 8 + writtenRange('position_coach', 'pro').min);
    expect(v.notices.map((n) => n.key)).toContain('coach.create.age_moved_up');
  });
});

describe('E1.7.1 validation: named checks, age never moves down', () => {
  it('a graduate assistant start does not exist at the professional level (check 1)', () => {
    const v = validateCreation({ ...BASE, level: 'pro', start: 'graduate_assistant', age: 23 }, W, RULES);
    expect(v.problems[0]).toMatchObject({ check: 1, key: 'coach.create.start_not_at_level' });
    expect(createCoach({ ...BASE, level: 'pro', start: 'graduate_assistant' }, W, RULES, rng(1), 900).ok).toBe(false);
  });

  it('age moves up with a notice and never moves down', () => {
    const up = validateCreation({ ...BASE, level: 'pro', start: 'head_coach', age: 30, firstTeamId: 13 }, W, RULES);
    expect(up.choices.age).toBe(22 + writtenRange('head_coach', 'pro').min);
    const keep = validateCreation({ ...BASE, level: 'pro', start: 'head_coach', age: 60, firstTeamId: 13 }, W, RULES);
    expect(keep.choices.age).toBe(60);
    expect(keep.notices.filter((n) => n.key === 'coach.create.age_moved_up')).toEqual([]);
  });

  it('a mentor who was not a head coach for two seasons inside the span is removed with a note (check 5)', () => {
    const v = validateCreation({ ...BASE, level: 'college', start: 'coordinator', age: 40, coachingSeasons: 12, mentors: [99999], firstTeamId: 3 }, W, RULES);
    expect(v.notices.map((n) => n.key)).toContain('coach.create.mentor_removed_span');
    expect(v.choices.mentors).not.toContain(99999);
    // The start's table asks for one mentor, so an eligible one is filled in and named.
    expect(v.choices.mentors.length).toBe(1);
    expect(v.notices.map((n) => n.key)).toContain('coach.create.mentor_added');
  });

  it('open-jobs mode refuses a team that is not vacant (check 8); free choice moves the sitting coach to the market', () => {
    const c: CreationChoices = { ...BASE, level: 'pro', start: 'head_coach', age: 50, firstTeamId: 14, openJobsOnly: true };
    const r = createCoach(c, W, RULES, rng(1), 900);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.map((p) => p.key)).toContain('coach.create.first_team_not_vacant');
    const free = ok({ ...c, openJobsOnly: false });
    expect(free.firstJob?.teamId).toBe(14);
    expect(free.firstJob?.displacedHeadCoachId).not.toBeNull();
  });
});

describe('E1.2.2 coaching history and the tree', () => {
  it('every row names a team that existed and the head coach of that season; mentors get 2 to 6 seasons', () => {
    for (const level of ['college', 'pro'] as const) for (let seed = 1; seed <= 40; seed++) {
      const c = ok({ ...BASE, level, start: 'head_coach', age: 50, firstTeamId: level === 'pro' ? 13 : 3, seed }, seed);
      expect(auditCoach(c, W, RULES)).toEqual([]);
      for (const m of c.mentors) {
        const n = c.seats.filter((s) => s.mentorId === m).length;
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(6);
        expect(c.edges.find((e) => e.b === m)?.kind).toBe('mentor');
      }
    }
  });

  it('edge strength is 20 a season, capped at 80, plus a personal term of at most 15', () => {
    const c = ok({ ...BASE, level: 'pro', start: 'coordinator', age: 40, coachingSeasons: 14, firstTeamId: 13 });
    for (const e of c.edges) {
      const n = c.seats.filter((s) => s.teamId !== null && (s.headCoachId === e.b || W.staffSeasons.some((x) => x.personId === e.b && x.teamId === s.teamId && x.seasonYear === s.seasonYear))).length;
      const base = Math.min(80, 20 * n);
      expect(Math.abs(e.strength - base)).toBeLessThanOrEqual(15);
    }
    expect(c.edges.length).toBeGreaterThan(0);
  });

  it('seasons per system family are counted from the staffs worked on', () => {
    const c = ok({ ...BASE, level: 'pro', start: 'coordinator', age: 40, coachingSeasons: 12, firstTeamId: 13 });
    const inLeague = c.seats.filter((s) => s.teamId !== null).length;
    const total = Object.values(c.coaching.systemFamilies).reduce((a, b) => a + b, 0);
    expect(total).toBe(2 * inLeague); // one offensive and one defensive family per season
    expect(c.coaching.offensiveFamily).not.toBeNull();
  });

  it('the same choices and seed give the same record (E1.7.1 acceptance)', () => {
    const c: CreationChoices = { ...BASE, level: 'college', start: 'head_coach', age: 46, firstTeamId: 3, seed: 42 };
    expect(ok(c, 42)).toEqual(ok(c, 42));
  });
});

describe('E1.2.3 education and the graduate assistant rule', () => {
  it('no degree means no graduate assistant rows', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const c = ok({ ...BASE, start: 'position_coach', age: 30, education: { degree: 'none', field: null, military: false, otherWorkYears: 0 }, seed }, seed);
      expect(c.seats.filter((s) => s.seat === 'graduate_assistant')).toEqual([]);
    }
  });

  it('graduate assistant seasons never exceed the rule and each writes a graduate programme fact', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const c = ok({ ...BASE, start: 'coordinator', age: 40, coachingSeasons: 14, firstTeamId: 3, seed }, seed);
      const ga = c.seats.filter((s) => s.seat === 'graduate_assistant');
      expect(ga.length).toBeLessThanOrEqual(RULES.gaMaxSeasons);
      expect(c.coaching.historyFacts.filter((f) => f.kind === 'graduate_program_enrolled').length).toBe(ga.length);
      if (ga.length > 0) expect(c.coaching.historyFacts.some((f) => f.kind.startsWith('degree_master_'))).toBe(true);
    }
  });

  it('a former pro outside the degree window gets no graduate assistant seat (S3.3.4 rule 1)', () => {
    const c = ok({ ...BASE, start: 'position_coach', age: 40, playing: { level: 'pro_long', positionGroup: 'QB', proSeasons: 9 } });
    expect(c.seats.filter((s) => s.seat === 'graduate_assistant')).toEqual([]);
  });
});

describe('E1.7.2 presets and S2.1.1 origins', () => {
  it('every preset passes creation validation unedited', () => {
    for (const p of PRESETS) {
      const choices = choicesFromPreset(p, 5, p.level === 'pro' ? 13 : 3);
      const v = validateCreation(choices, W, RULES);
      expect(v.problems, p.id).toEqual([]);
      expect(v.choices.age, p.id).toBe(p.age);
      expect(createCoach(choices, W, RULES, rng(5), 900).ok, p.id).toBe(true);
    }
  });

  it('presets hold only past facts', () => {
    const allowed = ['id', 'start', 'level', 'experienced', 'age', 'playing', 'education', 'coachingSeasons', 'identity', 'household', 'patternKey'];
    for (const p of PRESETS) expect(Object.keys(p).filter((k) => !allowed.includes(k))).toEqual([]);
  });

  it('every origin card creates a valid nobody start, and entrant weights sum to one', () => {
    for (const o of ORIGINS) {
      const c = ok(choicesFromOrigin(o.id, 'college', 1));
      expect(c.start).toBe('nobody');
      expect(c.origin).toBe(o.id);
    }
    expect(ORIGINS.reduce((s, o) => s + o.entrantWeight, 0)).toBeCloseTo(1, 9);
  });

  it('the retread preset writes a prior head job; the play caller writes none', () => {
    const retread = ok(choicesFromPreset(PRESETS.find((p) => p.id === 'retread_head_coach')!, 9, 13));
    expect(retread.seats.some((s) => s.seat === 'head_coach')).toBe(true);
    expect(retread.firstReads.map((r) => r.key)).toContain('coach.read.owners.has_run_a_program');
    const young = ok(choicesFromPreset(PRESETS[0]!, 9, 13));
    expect(young.seats.some((s) => s.seat === 'head_coach')).toBe(false);
  });
});

describe('E1.7.1 fuzz: no confirmed record fails checks 1 to 8', () => {
  it('10,000 random choice sets', () => {
    const r = rng(2026);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r.uniform() * xs.length)]!;
    const int = (lo: number, hi: number) => lo + Math.floor(r.uniform() * (hi - lo + 1));
    const people = [...new Set(W.headStints.map((s) => s.personId))];
    let confirmed = 0;
    for (let i = 0; i < 10000; i++) {
      const level = pick<Level>(['college', 'pro']);
      const start = pick<StartMode>(START_MODES);
      const pl = pick<PlayingLevel>(PLAYING_LEVELS);
      const pro = pl === 'pro_short' ? int(1, 4) : pl === 'pro_long' ? int(5, 15) : 0;
      const degree = pick(['none', 'bachelor', 'master'] as const);
      const choices: CreationChoices = {
        ...BASE, level, start, experienced: start === 'head_coach' && r.uniform() < 0.3,
        playing: { level: pl, positionGroup: pl === 'none' ? 'none' : pick(POSITION_GROUPS.filter((g) => g !== 'none')), proSeasons: pro },
        education: { degree, field: degree === 'none' ? null : 'other', military: r.uniform() < 0.1, otherWorkYears: int(0, 5) },
        mentors: Array.from({ length: int(0, 3) }, () => pick(people)),
        coachingSeasons: r.uniform() < 0.5 ? null : int(0, 26),
        identity: { ...BASE.identity, side: pick(SIDES) },
        age: int(16, 70),
        firstTeamId: r.uniform() < 0.8 ? pick(W.teams).id : null,
        openJobsOnly: r.uniform() < 0.5,
        seed: i,
      };
      const res = createCoach(choices, W, RULES, rng(i), 900);
      if (!res.ok) { expect(res.problems.length).toBeGreaterThan(0); continue; }
      confirmed++;
      expect(auditCoach(res.coach, W, RULES)).toEqual([]);
      const again = validateCreation({ ...choices, age: YEAR - res.coach.birthDate.seasonYear, mentors: res.coach.mentors, coachingSeasons: res.coach.seats.length }, W, RULES);
      expect(again.problems).toEqual([]);
    }
    expect(confirmed).toBeGreaterThan(1000);
  });
});

describe('Sources and constants', () => {
  it('fact rows compute their status and print provisional when short of three sources', () => {
    for (const f of COACH_FACTS) {
      expect(computeStatus(f)).toBe(f.status);
      expect(computeStatus(f)).not.toBe('Verified');
    }
  });

  it('every parameter names its leaf and basis; rule keys name their owner leaf', () => {
    for (const p of PARAMS.params) {
      expect(p.leaf).toMatch(/^[A-Z]\d+(\.\d+)*$/);
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
    }
    expect(RULE_KEYS.map((k) => k.key)).toEqual(['staff.ga_max_seasons', 'staff.ga_degree_window_years']);
  });
});
