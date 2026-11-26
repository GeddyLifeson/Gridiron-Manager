// Weekly step 11, labels touched by new events (X2.2.2). A label is a query over the log (models.labels);
// nothing about a person is stored but the held state that `label_formed` / `label_faded` rows announce.
// X2.2.2 rule 6: labels are computed as events arrive for tier 1 and tier 2 people, and for tier 3 people
// only on demand (`labelsOn`), from the log. The history run plays every team at tier 3, so there the step
// only moves its cursor: every past label is still computable on demand from the log. The two output rows
// name the label under `definition` and are never evidence (MA-80).
import { labels } from '@gm/models';
import type { WorldEvent } from '@gm/schema';
import type { LiveWorld, StepContext, StepHandler } from '../loop/types.ts';
import content from './content.json' with { type: 'json' };
import { LABEL_FADED, LABEL_FORMED } from './events.ts';
import { param } from './params.ts';

export const LABEL_DEFS: readonly labels.LabelDef[] = (content as unknown as { labels: labels.LabelDef[] }).labels;

/** `LiveWorld.systemState` key of the label pass. */
export const LABELS_KEY = 'labels';
export interface LabelsState {
  cursor: number;
  /** `labelId:subjectId` of labels held by subjects evaluated weekly. */
  readonly held: Record<string, true>;
}
export function labelsStateOf(world: LiveWorld): LabelsState {
  let s = world.systemState.get(LABELS_KEY) as LabelsState | undefined;
  if (!s) { s = { cursor: 1, held: {} }; world.systemState.set(LABELS_KEY, s); }
  return s;
}

function levelOf(world: LiveWorld): (competitionId: number) => string | undefined {
  return (id) => world.competitions.find((c) => c.id === id)?.level;
}

function typesOf(def: labels.LabelDef): string[] { return [...new Set([...def.positive.types, ...def.negative.types])]; }

/** Rows of a label's types in the log, in log order (its population, X2.2.1 rule 3). */
export function rowsOfLabel(world: LiveWorld, def: labels.LabelDef): WorldEvent[] {
  return typesOf(def).flatMap((t) => world.log.ofType(t)).sort((a, b) => a.id - b.id);
}

/** Evidence rows about one subject (actor rows by person, team rows by team). */
function subjectRows(world: LiveWorld, def: labels.LabelDef, subjectId: number, population: readonly WorldEvent[]): WorldEvent[] {
  if (def.subjectBy === 'actor') {
    const types = new Set(typesOf(def));
    return world.log.forPerson(subjectId).filter((e) => types.has(e.type));
  }
  return population.filter((e) => e.where.teamId === subjectId);
}

/** On demand (X2.2.2 rule 6): every label of the set for one subject, as of the world's date. */
export function labelsOn(world: LiveWorld, subjectId: number, defs: readonly labels.LabelDef[] = LABEL_DEFS): labels.LabelResult[] {
  return defs.map((def) => {
    const pop = rowsOfLabel(world, def);
    const ctx: labels.EvalContext = {
      asOf: world.date, levelOf: levelOf(world), baseline: labels.buildBaseline(def, pop, levelOf(world), world.log.reversedIds()),
      origin: def.subjectBy === 'actor' ? world.people.get(subjectId)?.origin : undefined,
      outOfFootball: def.subjectBy === 'actor' && world.outOfFootballSince.has(subjectId),
    };
    return labels.evaluateLabel(def, subjectId, subjectRows(world, def, subjectId, pop), ctx);
  });
}

/** Subjects a row is evidence about for a label, kept to tiers at or under the weekly line (rule 6). */
function weeklySubjects(ctx: StepContext, def: labels.LabelDef, e: WorldEvent): number[] {
  if (!typesOf(def).includes(e.type)) return [];
  const max = param('labels.weeklyTierMax');
  if (e.where.teamId === null || ctx.tierOfTeam(e.where.teamId) > max) return [];
  return labels.subjectsOf(def, e);
}

export interface LabelsBinding { readonly defs?: readonly labels.LabelDef[] }

/** Weekly step 11 (X12.1.1): labels of tier 1 and 2 subjects touched by rows logged since the last pass. */
export function labelsStep(b: LabelsBinding = {}): StepHandler {
  const defs = b.defs ?? LABEL_DEFS;
  // MA-80: the label rows are outputs, never evidence.
  for (const d of defs) if (typesOf(d).some((t) => t === LABEL_FORMED || t === LABEL_FADED)) throw new Error(`label ${d.id} reads label rows (MA-80)`);
  return (ctx) => {
    const { world } = ctx;
    const s = labelsStateOf(world);
    const from = s.cursor, to = world.log.nextId;
    s.cursor = to;
    const max = param('labels.weeklyTierMax');
    // No team at a weekly tier (the history run): nothing is computed now; labels stay computable on demand.
    if (![...world.tiers.values()].some((t) => t <= max)) return { read: to - from, evaluated: 0, formed: 0, faded: 0 };
    let evaluated = 0, formed = 0, faded = 0;
    for (const def of defs) {
      const touched = new Map<number, WorldEvent>();
      for (let id = from; id < to; id++) {
        const e = world.log.get(id);
        if (e) for (const sub of weeklySubjects(ctx, def, e)) touched.set(sub, e);
      }
      if (touched.size === 0) continue;
      const pop = rowsOfLabel(world, def);
      const baseline = labels.buildBaseline(def, pop, levelOf(world), world.log.reversedIds());
      for (const [subjectId, last] of [...touched].sort((a, b) => a[0] - b[0])) {
        const r = labels.evaluateLabel(def, subjectId, subjectRows(world, def, subjectId, pop), {
          asOf: world.date, levelOf: levelOf(world), baseline,
          origin: def.subjectBy === 'actor' ? world.people.get(subjectId)?.origin : undefined,
        });
        evaluated++;
        const key = `${def.id}:${subjectId}`;
        const was = s.held[key] === true;
        if ((r.state === 'held') === was) continue;
        if (r.state === 'held') { s.held[key] = true; formed++; } else { delete s.held[key]; faded++; }
        ctx.emit({
          type: r.state === 'held' ? LABEL_FORMED : LABEL_FADED, date: world.date, competitionId: last.competitionId, teamId: last.where.teamId,
          witnesses: { kind: 'public' }, tier: ctx.tierOfTeam(last.where.teamId!), causeId: last.id,
          actors: def.subjectBy === 'actor' ? [{ personId: subjectId, role: 'subject' }] : [],
          subjects: def.subjectBy === 'actor' ? [{ kind: 'person', id: subjectId }] : [{ kind: 'team', id: subjectId }],
          payload: { definition: def.id, sample: Math.round(r.sample * 100) / 100, z: Math.round(r.z * 100) / 100 },
        });
      }
    }
    return { read: to - from, evaluated, formed, faded };
  };
}
