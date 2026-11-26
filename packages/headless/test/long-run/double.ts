// TEST DOUBLE world for the long-run harness. NOT the game: a toy league where players age, improve,
// decline, retire and are replaced by a new class each season, so the harness has something that ages.
// `agingDecline: false` is Q1.6.4's failure case (no decline: veterans never leave, so ages drift up).
import type { WorldEvent } from '@gm/schema';
import type { LongRunTarget, PersonView, WorldView } from '../../src/long-run/index.ts';

const POSITIONS = ['QB', 'RB', 'WR', 'OL', 'DL', 'LB', 'DB'];
const ROSTER = 42;

/** Small seeded generator (mulberry32), test only. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Person = { id: number; origin: PersonView['origin']; name: { first: string; last: string }; birthDate: { seasonYear: number; dayIndex: number }; diedYear: number | null; roles: PersonView['roles']; playing?: { position: string; attributes: Record<string, number> }; life?: { householdId: number | null } };

export interface DoubleOptions {
  readonly seedHex?: string;
  readonly agingDecline?: boolean;
  readonly teamsPerLevel?: number;
  readonly origin?: PersonView['origin'];
  readonly firstSeason?: number;
  /** Called after each weekly pass, to plant a bug. */
  readonly afterWeek?: (w: DoubleWorld) => void;
}

export interface DoubleWorld extends WorldView {
  date: { seasonYear: number; dayIndex: number };
  week: number;
  passes: number;
  people: Map<number, Person>;
  status: Map<number, 'active' | 'inactive' | 'deceased'>;
  outOfFootballSince: Map<number, number>;
  jobs: Map<number, { id: number; teamId: number; positionId: string; holderPersonId: number | null }>;
  rosters: Map<number, number[]>;
  pools: Map<string, number[]>;
  results: { gameId: number; competitionId: number; seasonYear: number; week: number; homeTeamId: number; awayTeamId: number; homePoints: number; awayPoints: number; passPlays: number; runPlays: number; kind: 'regular' | 'postseason'; title: boolean }[];
  seasons: { seasonYear: number; games: number; points: number; passPlays: number; runPlays: number; pools: Record<string, number>; people: { active: number; inactive: number; deceased: number } }[];
  events: WorldEvent[];
  emit(type: string, personId: number): void;
}

const WEEKS = 8;

export function doubleTarget(opts: DoubleOptions = {}): LongRunTarget & { world: DoubleWorld } {
  const r = rng(Number.parseInt((opts.seedHex ?? '00000000000000a7').slice(-8), 16));
  const decline = opts.agingDecline ?? true;
  const nTeams = opts.teamsPerLevel ?? 16;
  const first = opts.firstSeason ?? 2000;
  let nextId = 1, nextEvent = 1;
  const people = new Map<number, Person>();
  const status = new Map<number, 'active' | 'inactive' | 'deceased'>();
  const teams = Array.from({ length: nTeams * 2 }, (_, i) => ({ id: i + 1 }));
  const competitions = [
    { id: 1, level: 'pro' as const, ruleSetId: 'pro_2026', teamIds: teams.slice(0, nTeams).map((t) => t.id) },
    { id: 2, level: 'college' as const, ruleSetId: 'college_2026', teamIds: teams.slice(nTeams).map((t) => t.id) },
  ];
  const attrs = (base: number): Record<string, number> => ({ speed: base + (r() - 0.5) * 16, strength: base + (r() - 0.5) * 16, awareness: base + (r() - 0.5) * 16 });
  const newPlayer = (season: number, age: number, pos: string): number => {
    const id = nextId++;
    people.set(id, { id, origin: opts.origin ?? 'generated', name: { first: `F${id}`, last: `L${id}` }, birthDate: { seasonYear: season - age, dayIndex: 100 }, diedYear: null, roles: ['player'], playing: { position: pos, attributes: attrs(45 + r() * 10) } });
    status.set(id, 'active');
    return id;
  };
  const rosters = new Map<number, number[]>();
  for (const t of teams) rosters.set(t.id, Array.from({ length: ROSTER }, (_, i) => newPlayer(first, 22 + Math.floor(r() * 10), POSITIONS[i % POSITIONS.length]!)));
  const jobs = new Map<number, { id: number; teamId: number; positionId: string; holderPersonId: number | null }>();
  for (const t of teams) {
    const id = nextId++;
    people.set(id, { id, origin: opts.origin ?? 'generated', name: { first: `C${id}`, last: `K${id}` }, birthDate: { seasonYear: first - 45, dayIndex: 10 }, diedYear: null, roles: ['coach'] });
    status.set(id, 'active');
    jobs.set(t.id, { id: t.id, teamId: t.id, positionId: 'pos:head_coach', holderPersonId: id });
  }

  const world: DoubleWorld = {
    date: { seasonYear: first, dayIndex: 0 }, week: 0, passes: 0, competitions, teams, people, status, outOfFootballSince: new Map(), jobs, rosters,
    pools: new Map(), results: [], seasons: [], userPersonId: null, events: [],
    log: { rows: () => world.events },
    emit: (type, personId) => {
      world.events.push({ id: nextEvent++, type, when: { date: { ...world.date }, period: null, clockTenths: null }, competitionId: null, where: { teamId: null, venueId: null }, actors: [], subjects: [{ kind: 'person', id: personId }], payload: {}, witnesses: { kind: 'public' }, causeId: null, notability: null, tier: 3, source: 'sim' } as unknown as WorldEvent);
    },
  };

  const runWeek = (): void => {
    for (const c of competitions) {
      const ids = c.teamIds, n = ids.length;
      for (let i = 0; i < n / 2; i++) {
        const a = ids[(i + world.week) % n]!, b = ids[(n - 1 - i + world.week) % n]!;
        if (a === b) continue;
        let hp = 3 + Math.floor(r() * 40), ap = 3 + Math.floor(r() * 40);
        if (hp === ap) hp++;
        world.results.push({ gameId: world.passes * 100 + i + c.id * 10_000, competitionId: c.id, seasonYear: world.date.seasonYear, week: world.week, homeTeamId: a, awayTeamId: b, homePoints: hp, awayPoints: ap, passPlays: 30 + Math.floor(r() * 10), runPlays: 25 + Math.floor(r() * 8), kind: 'regular', title: false });
      }
    }
    world.passes++;
    world.week++;
    world.date = { seasonYear: world.date.seasonYear, dayIndex: world.date.dayIndex + 7 };
    opts.afterWeek?.(world);
  };

  const runSeasonPoint = (): void => {
    const season = world.date.seasonYear;
    for (const [teamId, ids] of rosters) {
      const keep: number[] = [];
      const gone: string[] = [];
      for (const pid of ids) {
        const p = people.get(pid)!;
        const age = season - p.birthDate.seasonYear;
        const delta = age < 27 ? 2 : decline ? -(age - 26) * 1.2 : 0;
        for (const k of Object.keys(p.playing!.attributes)) p.playing!.attributes[k] = Math.max(0, Math.min(100, p.playing!.attributes[k]! + delta + (r() - 0.5) * 2));
        const ovr = Object.values(p.playing!.attributes).reduce((a, b) => a + b, 0) / 3;
        const retire = ovr < 42 || (decline && age >= 29 && r() < (age - 28) * 0.06);
        if (retire) { world.outOfFootballSince.set(pid, season); status.set(pid, 'inactive'); world.emit('player_retired', pid); gone.push(p.playing!.position); } else keep.push(pid);
      }
      for (const pos of gone) keep.push(newPlayer(season + 1, 21 + Math.floor(r() * 2), pos));
      rosters.set(teamId, keep);
    }
    const points = world.results.reduce((a, g) => a + g.homePoints + g.awayPoints, 0);
    world.seasons.push({ seasonYear: season, games: world.results.length, points, passPlays: 0, runPlays: 0, pools: {}, people: { active: 0, inactive: 0, deceased: 0 } });
    world.results = [];
    world.passes++;
    world.week = 0;
    world.date = { seasonYear: season + 1, dayIndex: 0 };
  };

  return {
    world,
    view: () => world,
    weeksInSeason: () => WEEKS,
    runWeek,
    runSeasonPoint,
    hash: () => `${world.date.seasonYear}:${world.week}:${world.passes}:${people.size}:${world.events.length}`,
    eventType: (id) => (id === 'player_retired' ? { importedAllowed: true, harmClass: 'none' } : id === 'arrest' ? { importedAllowed: false, harmClass: 'harmful' } : undefined),
    unbound: () => [{ step: 'moves', reason: 'test double' }],
  };
}
