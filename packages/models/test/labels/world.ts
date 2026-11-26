// Seeded test world for the label engine: coaches who call fourth downs and make promises, players who
// attend meetings, at two levels over several seasons. Rows are built as WorldEvent and parsed by the
// schema, in simulation order with increasing ids. Behaviour rates are test inputs, not facts.
import { WorldEvent, type PersonOrigin, type WitnessRule } from '@gm/schema';
import type { LabelDef } from '../../src/labels/index.ts';

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const LEVEL: Record<number, string> = { 1: 'pro', 2: 'college' };
export const levelOf = (c: number) => LEVEL[c];

export interface Coach { id: number; teamId: number; comp: number; goRate: number; keepRate: number; origin: PersonOrigin }
export interface Player { id: number; teamId: number; comp: number; lateRate: number; origin: PersonOrigin }

export interface WorldSpec {
  seed: number;
  firstYear: number;
  seasons: number;
  coaches: number;
  gamesPerSeason: number;
  /** Go rate of a coach: baseline unless listed (test inputs). */
  baselineGo: number;
  /** Share of coaches who differ from baseline, half aggressive and half conservative. */
  deviantShare: number;
  playersPerTeam: number;
  reversals: number;
  /** Coach id -> go rate by season index, overrides the drawn rate. */
  script?: Map<number, (seasonIndex: number) => number>;
  importedCoachIds?: number[];
}

export interface World { rows: WorldEvent[]; coaches: Coach[]; players: Player[]; byId: Map<number, WorldEvent>; spec: WorldSpec; originOf: (id: number) => PersonOrigin }

type Draft = Omit<WorldEvent, 'id'>;

function row(type: string, year: number, day: number, comp: number, teamId: number, actors: { personId: number; role: string }[], payload: WorldEvent['payload'], witnesses: WitnessRule, causeId: number | null = null): Draft {
  return {
    type, when: { date: { seasonYear: year, dayIndex: day }, period: null, clockTenths: null }, competitionId: comp,
    where: { teamId, venueId: null }, actors, subjects: [], payload, witnesses, causeId, notability: null, tier: 1, source: 'sim',
  };
}

export function buildWorld(spec: WorldSpec): World {
  const r = rng(spec.seed);
  const coaches: Coach[] = [];
  const players: Player[] = [];
  const imported = new Set(spec.importedCoachIds ?? []);
  let pid = 1;
  for (let i = 0; i < spec.coaches; i++) {
    const roll = r();
    const goRate = roll < spec.deviantShare / 2 ? spec.baselineGo + 0.3 : roll < spec.deviantShare ? spec.baselineGo - 0.2 : spec.baselineGo;
    const keep = r();
    const c: Coach = { id: pid++, teamId: i + 1, comp: i % 2 === 0 ? 1 : 2, goRate, keepRate: keep < 0.2 ? 0.45 : keep < 0.4 ? 0.98 : 0.8, origin: 'generated' };
    if (imported.has(c.id)) c.origin = 'imported';
    coaches.push(c);
  }
  for (const c of coaches) for (let k = 0; k < spec.playersPerTeam; k++) {
    const roll = r();
    players.push({ id: pid++, teamId: c.teamId, comp: c.comp, lateRate: roll < 0.15 ? 0.3 : 0.04, origin: 'generated' });
  }
  const origins = new Map<number, PersonOrigin>();
  for (const c of coaches) origins.set(c.id, c.origin);
  for (const p of players) origins.set(p.id, p.origin);

  const drafts: Draft[] = [];
  for (let s = 0; s < spec.seasons; s++) {
    const year = spec.firstYear + s;
    for (let g = 0; g < spec.gamesPerSeason; g++) {
      const day = 240 + g * 7;
      for (const c of coaches) {
        const go = spec.script?.get(c.id)?.(s) ?? c.goRate;
        const chances = 2 + Math.floor(r() * 4);
        for (let k = 0; k < chances; k++) {
          drafts.push(row('fourth_down_decision', year, day, c.comp, c.teamId, [{ personId: c.id, role: 'caller' }], { went: r() < go, close: true }, { kind: 'public' }));
        }
        if (r() < 0.6) {
          const kept = r() < c.keepRate;
          const to = players.find((p) => p.teamId === c.teamId)!;
          drafts.push(row(kept ? 'promise_kept' : 'promise_broken', year, day, c.comp, c.teamId, [{ personId: c.id, role: 'promiser' }, { personId: to.id, role: 'promised_to' }], {}, { kind: 'people', personIds: [c.id, to.id] }));
        }
      }
      for (const p of players) {
        drafts.push(row(r() < p.lateRate ? 'late_to_meeting' : 'meeting_attended', year, day - 1, p.comp, p.teamId, [{ personId: p.id, role: 'player' }], {}, { kind: 'team', teamId: p.teamId }));
      }
    }
  }
  drafts.sort((a, b) => a.when.date.seasonYear - b.when.date.seasonYear || a.when.date.dayIndex - b.when.date.dayIndex);
  const rows: WorldEvent[] = drafts.map((d, i) => WorldEvent.parse({ id: i + 1, ...d }));
  // Stat corrections at the end of the last season, each reversing one earlier fourth-down row.
  const fourth = rows.filter((e) => e.type === 'fourth_down_decision');
  const lastYear = spec.firstYear + spec.seasons - 1;
  for (let k = 0; k < spec.reversals; k++) {
    const target = fourth[Math.floor(r() * fourth.length)]!;
    rows.push(WorldEvent.parse({ id: rows.length + 1, ...row('stat_corrected', lastYear, 360, target.competitionId!, target.where.teamId!, [], { field: 'went' }, { kind: 'public' }, target.id) }));
  }
  const byId = new Map(rows.map((e) => [e.id, e]));
  return { rows, coaches, players, byId, spec, originOf: (id) => origins.get(id) ?? 'generated' };
}

/** Fixture label definitions (test content, not the shipped list). */
export function fixtureLabels(thresholdOn: number): LabelDef[] {
  const fourth = (went: boolean) => ({ types: ['fourth_down_decision'], actorRole: 'caller', payloadEquals: { went } });
  return [
    { id: 'goes_for_it_on_fourth_down', appliesTo: ['coach'], phrase: 'label.goes_for_it', kind: 'game_management', subjectBy: 'actor', measure: 'rate', positive: fourth(true), negative: fourth(false), direction: 'above', thresholdOn, windowSeasons: 2, opposes: 'kicks_on_fourth_down', consumers: ['test'] },
    { id: 'kicks_on_fourth_down', appliesTo: ['coach'], phrase: 'label.kicks', kind: 'game_management', subjectBy: 'actor', measure: 'rate', positive: fourth(true), negative: fourth(false), direction: 'below', thresholdOn, windowSeasons: 2, opposes: 'goes_for_it_on_fourth_down', consumers: ['test'] },
    { id: 'keeps_his_word', appliesTo: ['coach'], phrase: 'label.keeps_word', kind: 'conduct', minSample: 6, subjectBy: 'actor', measure: 'rate', positive: { types: ['promise_kept'], actorRole: 'promiser' }, negative: { types: ['promise_broken'], actorRole: 'promiser' }, direction: 'above', thresholdOn, windowSeasons: 3, consumers: ['test'] },
    { id: 'breaks_his_word', appliesTo: ['coach'], phrase: 'label.breaks_word', kind: 'conduct', minSample: 6, subjectBy: 'actor', measure: 'rate', positive: { types: ['promise_kept'], actorRole: 'promiser' }, negative: { types: ['promise_broken'], actorRole: 'promiser' }, direction: 'below', thresholdOn, windowSeasons: 3, consumers: ['test'] },
    { id: 'late_to_meetings', appliesTo: ['player'], phrase: 'label.late', kind: 'conduct', subjectBy: 'actor', measure: 'count', positive: { types: ['late_to_meeting'], actorRole: 'player' }, negative: { types: ['meeting_attended'], actorRole: 'player' }, direction: 'above', thresholdOn, windowSeasons: 2, consumers: ['test'] },
    { id: 'program_goes_for_it', appliesTo: ['program'], phrase: 'label.program_goes', kind: 'game_management', subjectBy: 'team', measure: 'rate', positive: fourth(true), negative: fourth(false), direction: 'above', thresholdOn, windowSeasons: 2, consumers: ['test'] },
  ];
}
