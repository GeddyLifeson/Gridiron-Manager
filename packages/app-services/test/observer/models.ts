// Test read models and toy deciders. The honest ones read an ObservedWorld; the cheats reach the raw
// world the way a careless bridge or AI function would.
import { z } from 'zod';
import { pub, est, truth } from '@gm/schema';
import type { PersonRecord, PersonView } from '@gm/schema';
import { ObservedWorld, ReadModelRegistry, observerFor, type ReadModelSpec, type TableSource } from '../../src/observer/index.ts';

export const RosterCardData = z.object({
  teamId: pub(z.number().int(), 'id'),
  players: pub(z.array(z.object({
    personId: pub(z.number().int(), 'id'),
    name: pub(z.string()),
    armEstimate: est(z.number(), 'iss').nullable(),
    confidence: est(z.number(), 'ratio').nullable(),
  }))),
});

/** Honest: a roster list ordered by the observer's own estimate. */
export const rosterCard: ReadModelSpec<{ teamId: number }, z.infer<typeof RosterCardData>> = {
  name: 'rosterCard',
  data: RosterCardData,
  taskIds: ['depth_chart.set'],
  build(world, { teamId }) {
    const views = new Map(world.table('personViews').map((v) => [v.personId, v]));
    const names = new Map(world.table('people').map((p) => [p.id, `${p.name?.first} ${p.name?.last}`]));
    const players = world.table('rosterSlots').filter((s) => s.teamId === teamId).map((s) => {
      const belief = views.get(s.personId)?.perAttribute?.arm_strength;
      return { personId: s.personId!, name: names.get(s.personId) ?? '', armEstimate: belief?.estimate ?? null, confidence: belief?.confidence ?? null };
    }).sort((a, b) => (b.armEstimate ?? -1) - (a.armEstimate ?? -1) || a.personId - b.personId);
    return { data: { teamId, players }, meta: { 'players.armEstimate': { sampleSize: 6, source: 'staff', unit: 'iss' } } };
  },
};

export const InboxData = z.object({ subjects: pub(z.array(z.string())) });
export const inboxList: ReadModelSpec<Record<string, never>, z.infer<typeof InboxData>> = {
  name: 'inboxList',
  data: InboxData,
  build: (world) => ({ data: { subjects: world.table('inbox').map((i) => i.subjectKey ?? '') } }),
};

export const honestRegistry = () => new ReadModelRegistry().register(rosterCard).register(inboxList);

/** A leak of the kind Q1.4.2's rank test names: estimates shown, but rows ordered by the true value. */
export function sortLeakRegistry(raw: TableSource): ReadModelRegistry {
  const trueArm = () => new Map((raw.rows('people') as PersonRecord[]).map((p) => [p.id, p.playing?.attributes.arm_strength ?? 0]));
  return new ReadModelRegistry().register({
    ...rosterCard,
    build(world: ObservedWorld, params: { teamId: number }) {
      const r = rosterCard.build(world, params);
      const t = trueArm();
      r.data.players.sort((a, b) => t.get(b.personId)! - t.get(a.personId)!);
      return r;
    },
  });
}

/** A leak of the plain kind: the true value copied into a visible number. */
export function valueLeakRegistry(raw: TableSource): ReadModelRegistry {
  return new ReadModelRegistry().register({
    ...rosterCard,
    build(world: ObservedWorld, params: { teamId: number }) {
      const r = rosterCard.build(world, params);
      const people = new Map((raw.rows('people') as PersonRecord[]).map((p) => [p.id, p]));
      for (const p of r.data.players) p.armEstimate = people.get(p.personId)!.playing!.tests.fortyS;
      return r;
    },
  });
}

/** What Q1.4.2's acceptance names: a true rating added to a read-model shape. */
export const TruthInSchema = z.object({ personId: pub(z.number().int(), 'id'), trueArm: truth(z.number(), 'iss') });
export const NoClassInSchema = z.object({ personId: pub(z.number().int(), 'id'), note: z.string() });

// --- Toy AI: which quarterback does a coach start, and whom does he scout first? -------------------

export interface ToyDecisions { starter: number; scoutFirst: number; blitzMore: boolean }

/** Honest AI: takes a view and no world (K9.1.1 acceptance). Decides from its own estimates and the public record. */
export function honestCoach(view: ObservedWorld, teamId: number): ToyDecisions {
  const mine = new Set(view.table('rosterSlots').filter((s) => s.teamId === teamId).map((s) => s.personId));
  const beliefs = view.table('personViews') as PersonView[];
  const arm = (v: PersonView) => v.perAttribute.arm_strength?.estimate ?? 0;
  const best = (list: PersonView[]) => [...list].sort((a, b) => arm(b) - arm(a) || a.personId - b.personId)[0]!.personId;
  const lastMargin = Number(view.table('events').find((e) => e.type === 'game.result')?.payload?.margin ?? 0);
  return { starter: best(beliefs.filter((v) => mine.has(v.personId))), scoutFirst: best(beliefs.filter((v) => !mine.has(v.personId))), blitzMore: lastMargin < 0 };
}

export const runHonest = (teamId: number, coachId: number) => (source: TableSource) =>
  honestCoach(new ObservedWorld(source, observerFor(source, coachId)), teamId);

/** Cheat 1: starts the player with the best TRUE arm. */
export const runTruthReader = (teamId: number, coachId: number) => (source: TableSource): ToyDecisions => {
  const d = runHonest(teamId, coachId)(source);
  const mine = new Set((source.rows('rosterSlots') as { teamId: number; personId: number }[]).filter((s) => s.teamId === teamId).map((s) => s.personId));
  const people = (source.rows('people') as PersonRecord[]).filter((p) => mine.has(p.id));
  return { ...d, starter: [...people].sort((a, b) => b.playing!.attributes.arm_strength! - a.playing!.attributes.arm_strength!)[0]!.id };
};

/** Cheat 2: reads the other staff's private meeting (their unrevealed plan). */
export const runPlanReader = (teamId: number, coachId: number) => (source: TableSource): ToyDecisions => {
  const d = runHonest(teamId, coachId)(source);
  const plan = (source.rows('events') as { type: string; payload: { plan?: string } }[]).find((e) => e.type === 'staff.meeting')?.payload.plan ?? '';
  return { ...d, blitzMore: plan === 'attack the boundary' };
};

/** Cheat 3: reads the other organisation's scouting board. */
export const runBoardReader = (teamId: number, coachId: number) => (source: TableSource): ToyDecisions => {
  const d = runHonest(teamId, coachId)(source);
  const theirs = (source.rows('personViews') as PersonView[]).filter((v) => v.observerTeamId !== teamId);
  return { ...d, scoutFirst: [...theirs].sort((a, b) => b.perAttribute.arm_strength!.estimate - a.perAttribute.arm_strength!.estimate)[0]!.personId };
};
