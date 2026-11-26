// The player card (O4.1.1 to O4.1.5). One builder for the user's players and for other clubs' players:
// what differs is only what the observer's club knows. Grades come from the club's PersonView through
// G-19 `gradeCells` (MA-48: a grade someone assigned, who, when, how much was watched; an attribute
// nobody watched shows no number). Measured values are numbers with units and no band. Knowledge,
// medical state and the person reads are the staff's estimates in words, passed in by the world side
// that computed them (K6 accuracy, L1.1.1 reads with their draws); the true values never come here.
import type { PersonView } from '@gm/schema';
import { scouting } from '@gm/people';
import type { ObservedWorld } from '../../observer/index.ts';
import { cardParam } from './params.ts';
import type {
  CardGrade, HealthRow, KnowledgeRead, Measured, MedicalReport, PersonTab, PlayerCardView, PromiseRow, WordRead,
} from './types.ts';
import { ageAt, compareDate, contractLine, displayName, peopleById, seenRead, visibleEventIds, worldDate, type DateLike } from './world.ts';

/** What the world side supplies for a card beyond the tables: staff reads already made, in words. */
export interface CardReads {
  readonly altPositions?: readonly string[];
  /** The position coach's knowledge estimates (O4.1.3, K6). Null when nobody on staff has a read. */
  readonly knowledge?: readonly KnowledgeRead[] | null;
  readonly medical?: MedicalReport | null;
  /** True for a rookie with no professional film (O4.1.2 edge case). */
  readonly noProFilm?: boolean;
  readonly person?: {
    readonly rolePromisedKey?: string | null; readonly roleGivenKey?: string | null;
    readonly morale?: WordRead | null; readonly trust?: WordRead | null; readonly respect?: WordRead | null;
    readonly personality?: readonly { readonly traitKey: string; readonly readKey: string; readonly confidenceKey: string }[];
    readonly standingKey?: string | null; readonly closestTeammates?: readonly number[];
    readonly meetings?: PersonTab['meetings'];
    readonly offField?: readonly { readonly eventId: number; readonly textKey: string }[];
  };
}

export interface CardOptions {
  /** Display scale id (D6.2.1 setting; default decimal 5.0 to 9.0). */
  readonly scaleId?: string;
  /** Attributes in display order; every stored one when absent. */
  readonly attributes?: readonly string[];
  /** The coach whose promises the Person tab lists (the user). */
  readonly coachId?: number | null;
}

/** Measured keys and their units (O4.1.2: measured values show as numbers with units and no band). */
const MEASURE_UNIT: Readonly<Record<string, string>> = {
  fortyS: 's', tenSplitS: 's', threeConeS: 's', shuttleS: 's', verticalIn: 'in', broadIn: 'in', heightIn: 'in', weightLb: 'lb', armIn: 'in', handIn: 'in',
};

type Row = Record<string, unknown>;

function gradeRows(view: PersonView | undefined, at: DateLike | null, age: number | null, opts: CardOptions): CardGrade[] {
  if (!view || !at || !view.perAttribute) return [];
  const cells = scouting.gradeCells(view, {
    scale: scouting.scaleById(opts.scaleId ?? scouting.DEFAULT_SCALE_ID), asOf: at, age: age ?? cardParam('card.age_when_unknown'),
    ...(opts.attributes ? { attributes: opts.attributes } : {}),
  });
  return cells.map((c): CardGrade => (c.state === 'graded'
    ? { state: 'graded', attribute: c.attribute, text: c.text, label: c.label, confidence: c.confidence, bandText: c.bandText, grader: c.grader, n: c.n, asOf: { seasonYear: c.as_of.seasonYear, dayIndex: c.as_of.dayIndex } }
    : { state: 'unwatched', attribute: c.attribute, text: c.text }));
}

function healthRow(r: Row): HealthRow | null {
  if (typeof r.id !== 'number' || typeof r.typeId !== 'string') return null;
  const est = r.estimatedDays as unknown;
  const returnDays = Array.isArray(est) && est.length === 2 && typeof est[0] === 'number' && typeof est[1] === 'number'
    ? [Math.min(est[0], est[1]), Math.max(est[0], est[1])] as const : null;
  const occurred = r.occurred as DateLike | undefined;
  return {
    injuryId: r.id, typeId: r.typeId, bodyRegion: typeof r.bodyRegion === 'string' ? r.bodyRegion : '', designation: typeof r.designation === 'string' ? r.designation : null,
    returnDays, status: typeof r.status === 'string' ? r.status : 'active', occurred: occurred ? { seasonYear: occurred.seasonYear, dayIndex: occurred.dayIndex } : { seasonYear: 0, dayIndex: 0 },
  };
}

function openPromises(world: ObservedWorld, personId: number, coachId: number | null | undefined): PromiseRow[] {
  if (typeof coachId !== 'number') return [];
  return (world.table('promises') as readonly Row[])
    .filter((p) => p.toPersonId === personId && p.fromPersonId === coachId && p.status === 'open' && typeof p.id === 'number')
    .map((p) => ({
      promiseId: p.id as number, subjectKey: String(p.subjectKey ?? ''), made: p.made as DateLike, due: (p.due as DateLike | null | undefined) ?? null,
    }))
    .sort((a, b) => (a.due && b.due ? compareDate(a.due, b.due) : a.due ? -1 : b.due ? 1 : 0) || a.promiseId - b.promiseId);
}

/** Builds one player's card as `clubId`'s staff knows him. Null when the observer cannot see the person. */
export function buildPlayerCard(world: ObservedWorld, clubId: number, personId: number, reads: CardReads = {}, opts: CardOptions = {}): PlayerCardView | null {
  const people = peopleById(world);
  const p = people.get(personId);
  if (!p) return null;
  const at = worldDate(world);
  const playing = (p.playing ?? {}) as { position?: string; lastJersey?: number | null; heightIn?: number; weightLb?: number; eligibility?: { pro?: { accruedSeasons?: number } } };
  const slot = (world.table('rosterSlots') as readonly Row[]).find((r) => r.personId === personId && typeof r.teamId === 'number');
  const ownPlayer = !!slot && slot.teamId === clubId;
  const age = ageAt(p.birthDate, at);
  const imported = p.origin === 'imported';
  const view = (world.table('personViews') as readonly Row[]).find((v) => v.personId === personId && v.observerTeamId === clubId) as unknown as PersonView | undefined;

  const measured: Measured[] = [];
  if (typeof playing.heightIn === 'number') measured.push({ key: 'heightIn', value: playing.heightIn, unit: 'in' });
  if (typeof playing.weightLb === 'number') measured.push({ key: 'weightLb', value: playing.weightLb, unit: 'lb' });
  for (const [k, v] of Object.entries(view?.publicMeasurements ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (typeof v === 'number' && !measured.some((m) => m.key === k)) measured.push({ key: k, value: v, unit: MEASURE_UNIT[k] ?? '' });
  }

  const injuries = (world.table('injuries') as readonly Row[]).filter((r) => r.personId === personId).map(healthRow).filter((r): r is HealthRow => r !== null)
    .sort((a, b) => compareDate(b.occurred, a.occurred) || a.injuryId - b.injuryId);

  const seen = visibleEventIds(world);
  let person: PersonTab | null = null;
  if (reads.person || ownPlayer) {
    const r = reads.person ?? {};
    const base: PersonTab = {
      rolePromisedKey: r.rolePromisedKey ?? null, roleGivenKey: r.roleGivenKey ?? null,
      morale: seenRead(r.morale, seen), trust: seenRead(r.trust, seen), respect: seenRead(r.respect, seen),
      openPromises: openPromises(world, personId, opts.coachId),
      standingKey: r.standingKey ?? null, closestTeammates: [...(r.closestTeammates ?? [])], meetings: [...(r.meetings ?? [])],
    };
    // A6: an imported real-roster player has no personality read beyond football and no off-field log.
    person = imported ? base : {
      ...base,
      personality: [...(r.personality ?? [])],
      offField: (r.offField ?? []).filter((e) => seen.has(e.eventId)),
    };
  }

  const notes = ((view?.notes ?? []) as readonly { date: DateLike; staffId: number; textKey: string }[])
    .map((n) => ({ date: { seasonYear: n.date.seasonYear, dayIndex: n.date.dayIndex }, textKey: n.textKey, byStaffId: n.staffId }));

  return {
    personId, clubId, ownPlayer,
    header: {
      personId, name: displayName(p.name as { first?: string; last?: string } | undefined, personId),
      jersey: typeof slot?.jersey === 'number' ? slot.jersey : typeof playing.lastJersey === 'number' ? playing.lastJersey : null,
      position: playing.position ?? '', altPositions: [...(reads.altPositions ?? [])], age,
      heightIn: playing.heightIn ?? null, weightLb: playing.weightLb ?? null, experience: playing.eligibility?.pro?.accruedSeasons ?? null,
      status: ownPlayer && typeof slot?.list === 'string' ? slot.list : null,
      contract: ownPlayer ? contractLine(world, personId, clubId, at) : null,
      designed: p.origin === 'designed', imported,
    },
    grades: gradeRows(view, at, age, opts),
    gradesNoteKey: reads.noProFilm ? 'card.grades.collegeAndCampOnly' : null,
    measured,
    knowledge: reads.knowledge ? [...reads.knowledge] : null,
    health: { current: injuries.filter((i) => i.status === 'active'), history: injuries.filter((i) => i.status !== 'active'), medical: reads.medical ?? null },
    person,
    notes,
  };
}
