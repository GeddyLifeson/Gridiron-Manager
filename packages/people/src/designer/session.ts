// The designer session and its screen model (D13.1, O1 Tools menu). A session holds one sheet; the
// screen sends intents; `designerView` turns the session into a plain model of primitives the screen
// draws. Everything here is pure: the host supplies randomness, the editor and the date.
import { ATTRIBUTE_IDS, type PersonRecord, type WorldDate } from '@gm/schema';
import { GROUPS, PHYSICAL, PROFILE_POSITIONS, POSITION_TO_PROFILE, profileOf } from '../generator/catalogue.ts';
import { placeholderNames, type GeneratorRandom, type NameSource } from '../generator/generate.ts';
import type { PopulationGroup } from '../generator/traits.ts';
import { formatGrade } from '../scouting/display.ts';
import { scaleById } from '../scouting/scales.ts';
import { archetypeById, archetypesFor } from './archetypes.ts';
import { derivedPhysical, designerWarnings, rangeProblems, type DesignerWarning } from './checks.ts';
import { commitSheet, designerAccess, STREAM_DESIGN, type DesignedPlayer, type DesignerWorld, type Refusal } from './commit.ts';
import { applyArchetype, fromArchetype, fromMeasurables, type StartRequest } from './entry.ts';
import { staffGrade } from './grade.ts';
import { blankSheet, isRealPerson, lockedChanges, missingFields, REAL_PERSON_LOCKED, sheetFromRecord, type Sheet, type SheetTests } from './sheet.ts';

export interface DesignerSession {
  world: DesignerWorld;
  seasonYear: number;
  /** Id the next new person takes (the host's id allocator). */
  nextPersonId: number;
  sheet: Sheet | null;
  /** Warnings an archetype start could not draw away. The view shows the live check, which includes them. */
  startWarnings: DesignerWarning[];
  /** Last commit or refused edit, for the screen's message line. */
  result: { ok: true; personId: number } | Refusal | null;
}

export interface DesignerEnv {
  rnd: GeneratorRandom;
  editorId: number | null;
  at: WorldDate | null;
  /** A generated region name for new people (A6.2: never a real address). */
  defaultRegion: string;
  names?: NameSource;
  /** Grade scale id (settings `grades.scale`, D6.2.1). */
  scaleId: string;
}

export type DesignerIntent =
  | { kind: 'start_archetype'; position: string; archetypeId: string; ageYears?: number }
  | { kind: 'start_measurables'; position: string; ageYears: number; heightIn: number; weightLb: number; fortyS: number; fill: 'generate' | 'hand' }
  | { kind: 'start_blank' }
  | { kind: 'start_copy'; record: PersonRecord; inPlace: boolean }
  | { kind: 'apply_archetype'; archetypeId: string }
  | { kind: 'set_field'; path: string; value: number | string | null }
  | { kind: 'set_sandbox'; on: boolean }
  | { kind: 'commit' };

/** Opens the designer (D13.1.1 rules). A closed designer has no sheet and carries the refusal. */
export function openDesigner(world: DesignerWorld, seasonYear: number, nextPersonId: number): DesignerSession {
  const a = designerAccess(world);
  return { world, seasonYear, nextPersonId, sheet: null, startWarnings: [], result: a.ok ? null : a };
}

const groupForAge = (age: number): PopulationGroup => (age <= 18 ? 'recruit' : age <= 22 ? 'college_player' : 'pro_player');

function startRequest(s: DesignerSession, env: DesignerEnv, position: string, ageYears: number): StartRequest {
  return {
    personId: s.nextPersonId, position, ageYears, seasonYear: s.seasonYear, talent: { kind: 'pro_entrant' }, group: groupForAge(ageYears),
    homeRegion: env.defaultRegion, hometown: null, classKey: { classYear: s.seasonYear, classType: 'designer', slotIndex: s.nextPersonId },
  };
}

const NUMERIC = new Set(['ageYears', 'heightIn', 'weightLb', 'armLengthIn', 'handSizeIn']);
const TEXT = new Set(['position', 'firstName', 'lastName', 'homeRegion', 'hometown']);
const refuse = (rule: string, message: string, problems: string[] = []): Refusal => ({ ok: false, rule, message, problems });

/** Sets one field by sheet path. Returns a refusal for an unknown path or a real person's locked field. */
export function setField(sheet: Sheet, path: string, value: number | string | null): Sheet | Refusal {
  if (isRealPerson(sheet) && (REAL_PERSON_LOCKED as readonly string[]).includes(path)) return refuse('D13.6.2', `${path} cannot be changed on a real person`, [path]);
  const num = (): number | null => (value === null || value === '' ? null : typeof value === 'number' ? value : Number(value));
  if (NUMERIC.has(path)) {
    const n = num();
    if (n !== null && !Number.isFinite(n)) return refuse('D13.1.1', `${path} needs a number`, [path]);
    return { ...sheet, [path]: n };
  }
  if (TEXT.has(path)) {
    const t = value === null || value === '' ? null : String(value);
    if (path === 'position' && t !== null && !POSITION_TO_PROFILE[t]) return refuse('D13.1.1', `unknown position ${t}`, [path]);
    return { ...sheet, [path]: t };
  }
  if (path === 'throwingHand' || path === 'kickingFoot') {
    if (value !== 'left' && value !== 'right') return refuse('D13.1.1', `${path} is left or right`, [path]);
    return { ...sheet, [path]: value };
  }
  const [head, key] = path.split('.');
  const n = num();
  if (n !== null && !Number.isFinite(n)) return refuse('D13.1.1', `${path} needs a number`, [path]);
  if (head === 'tests' && key && key in sheet.tests) return { ...sheet, tests: { ...sheet.tests, [key]: n } as SheetTests };
  if ((head === 'attributes' || head === 'ceilings') && key && (ATTRIBUTE_IDS as readonly string[]).includes(key)) {
    const map = { ...sheet[head] } as Record<string, number>;
    if (n === null) delete map[key]; else map[key] = n;
    return { ...sheet, [head]: map };
  }
  return refuse('D13.1.1', `unknown field ${path}`, [path]);
}

/** Applies one intent. A commit that succeeds returns the designed player for the host to file. */
export function applyIntent(s: DesignerSession, intent: DesignerIntent, env: DesignerEnv): { session: DesignerSession; committed: DesignedPlayer | null } {
  const access = designerAccess(s.world);
  if (!access.ok) return { session: { ...s, result: access }, committed: null };
  const done = (next: Partial<DesignerSession>) => ({ session: { ...s, result: null, ...next }, committed: null });
  const names = env.names ?? placeholderNames;
  switch (intent.kind) {
    case 'start_archetype': {
      const r = fromArchetype(intent.archetypeId, startRequest(s, env, intent.position, intent.ageYears ?? 23), env.rnd, names);
      return done({ sheet: r.sheet, startWarnings: r.warnings });
    }
    case 'start_measurables': {
      const sheet = fromMeasurables({ heightIn: intent.heightIn, weightLb: intent.weightLb, tests: { fortyS: intent.fortyS } }, intent.fill,
        startRequest(s, env, intent.position, intent.ageYears), env.rnd, names);
      return done({ sheet, startWarnings: [] });
    }
    case 'start_blank':
      return done({ sheet: blankSheet(s.nextPersonId, s.seasonYear), startWarnings: [] });
    case 'start_copy':
      return done({ sheet: sheetFromRecord(intent.record, intent.inPlace ? intent.record.id : s.nextPersonId, s.seasonYear), startWarnings: [] });
    case 'apply_archetype': {
      if (!s.sheet || s.sheet.position === null) return { session: { ...s, result: refuse('D13.1.1', 'set a position first', ['position']) }, committed: null };
      const a = archetypeById(intent.archetypeId);
      if (a.position !== profileOf(s.sheet.position)) return { session: { ...s, result: refuse('D13.1.1', `archetype ${a.id} is not for ${s.sheet.position}`) }, committed: null };
      const missingBody = s.sheet.heightIn === null || s.sheet.weightLb === null || s.sheet.tests.fortyS === null;
      if (missingBody) return { session: { ...s, result: refuse('D13.1.1', 'enter height, weight and the 40 first', ['heightIn', 'weightLb', 'tests.fortyS']) }, committed: null };
      return done({ sheet: applyArchetype(s.sheet, a) });
    }
    case 'set_field': {
      if (!s.sheet) return { session: s, committed: null };
      const r = setField(s.sheet, intent.path, intent.value);
      if ('ok' in r) return { session: { ...s, result: r }, committed: null };
      return done({ sheet: r });
    }
    case 'set_sandbox':
      if (!s.sheet) return { session: s, committed: null };
      return done({ sheet: { ...s.sheet, sandbox: intent.on } });
    case 'commit': {
      if (!s.sheet) return { session: { ...s, result: refuse('D13.1.1', 'start a player first') }, committed: null };
      const r = commitSheet({ sheet: s.sheet, world: s.world, editorId: env.editorId, at: env.at, rnd: env.rnd });
      if (!r.ok) return { session: { ...s, result: r }, committed: null };
      const isNew = r.player.record.id === s.nextPersonId;
      return {
        session: { ...s, sheet: null, startWarnings: [], nextPersonId: isNew ? s.nextPersonId + 1 : s.nextPersonId, result: { ok: true, personId: r.player.record.id } },
        committed: r.player,
      };
    }
  }
}

// ---- screen model (primitives only)

export interface ViewField {
  path: string;
  value: number | string | null;
  kind: 'number' | 'text' | 'side';
  locked: boolean;
  missing: boolean;
  warned: boolean;
  /** Attribute rows carry their ceiling beside them. */
  ceilingPath?: string;
  ceiling?: number | null;
}

export interface DesignerView {
  open: boolean;
  refusal: { rule: string; message: string } | null;
  hasSheet: boolean;
  entry: string | null;
  personId: number | null;
  position: string | null;
  positions: readonly string[];
  archetypes: readonly { id: string; labelId: string }[];
  /** Every position's archetypes, for the start panel before a sheet exists. */
  archetypeCatalog: Readonly<Record<string, readonly { id: string; labelId: string }[]>>;
  archetypeId: string | null;
  realPerson: boolean;
  sandbox: boolean;
  /** A career world is marked "edited" when a designed player is saved into it (D13.1.1). */
  marksWorldEdited: boolean;
  sections: readonly { id: string; fields: readonly ViewField[] }[];
  derived: readonly { attribute: string; value: number }[];
  staffGrade: { text: string; sourceText: string } | null;
  warnings: readonly { fields: readonly string[]; kind: 'record' | 'z' | 'joint'; value: number; oneIn: number | null }[];
  missing: readonly string[];
  /** Why the sheet cannot be saved now; empty when it can. */
  blockers: readonly string[];
  canCommit: boolean;
  result: { ok: true; personId: number } | { ok: false; rule: string; message: string; problems: readonly string[] } | null;
}

const IDENTITY = ['position', 'ageYears', 'firstName', 'lastName', 'homeRegion', 'hometown', 'throwingHand', 'kickingFoot'];
const BODY = ['heightIn', 'weightLb', 'armLengthIn', 'handSizeIn'];
const TESTS: readonly (keyof SheetTests)[] = ['fortyS', 'tenSplitS', 'threeConeS', 'shuttleS', 'verticalIn', 'broadIn', 'benchReps'];

/** The screen model for a session. */
export function designerView(s: DesignerSession, env: DesignerEnv): DesignerView {
  const access = designerAccess(s.world);
  const positions = [...PROFILE_POSITIONS];
  const archetypeCatalog = access.ok ? Object.fromEntries(positions.map((p) => [p, archetypesFor(p).map((a) => ({ id: a.id, labelId: a.labelId }))])) : {};
  const closed = (): DesignerView => ({
    open: access.ok, refusal: access.ok ? null : { rule: access.rule, message: access.message }, hasSheet: false, entry: null, personId: null, position: null,
    positions, archetypes: [], archetypeCatalog, archetypeId: null, realPerson: false, sandbox: false, marksWorldEdited: s.world.kind === 'career', sections: [], derived: [],
    staffGrade: null, warnings: [], missing: [], blockers: [], canCommit: false, result: s.result,
  });
  if (!access.ok || !s.sheet) return closed();
  const sh = s.sheet;
  const missing = missingFields(sh);
  const miss = new Set(missing);
  const warnings = designerWarnings(sh, env.rnd.math);
  const warned = new Set(warnings.flatMap((w) => w.fields));
  const real = isRealPerson(sh);
  const locked = new Set<string>(real ? REAL_PERSON_LOCKED : []);
  const rec = sh as unknown as Record<string, unknown>;
  const field = (path: string, value: number | string | null, kind: ViewField['kind']): ViewField =>
    ({ path, value, kind, locked: locked.has(path), missing: miss.has(path), warned: warned.has(path) });
  const sections: { id: string; fields: ViewField[] }[] = [
    { id: 'identity', fields: IDENTITY.map((p) => field(p, (rec[p] ?? null) as number | string | null, p === 'throwingHand' || p === 'kickingFoot' ? 'side' : NUMERIC.has(p) ? 'number' : 'text')) },
    { id: 'body', fields: BODY.map((p) => field(p, (rec[p] ?? null) as number | null, 'number')) },
    { id: 'tests', fields: TESTS.map((k) => field(`tests.${k}`, sh.tests[k], 'number')) },
  ];
  const attrRow = (id: string): ViewField => ({
    ...field(`attributes.${id}`, sh.attributes[id as keyof typeof sh.attributes] ?? null, 'number'),
    ceilingPath: `ceilings.${id}`, ceiling: sh.ceilings[id as keyof typeof sh.ceilings] ?? null,
    missing: miss.has(`attributes.${id}`) || miss.has(`ceilings.${id}`),
  });
  sections.push({ id: 'physical', fields: PHYSICAL.map(attrRow) });
  for (const [g, list] of Object.entries(GROUPS)) sections.push({ id: g, fields: list.map(attrRow) });
  const d = derivedPhysical(sh);
  const derived = d ? (Object.entries(d) as [string, number][]).map(([attribute, value]) => ({ attribute, value })) : [];
  let grade: DesignerView['staffGrade'] = null;
  if (sh.position !== null && sh.ageYears !== null && env.at) {
    const g = staffGrade(sh.position, sh.attributes, env.at, sh.ageYears, env.rnd.open(STREAM_DESIGN, [sh.personId, 'grade']));
    if (g) {
      const t = formatGrade(scaleById(env.scaleId), g.mean, g.variance, { grader: 'position coach', on: g.on, watched: [{ count: g.snaps, what: 'snaps of film' }] });
      grade = { text: t.text, sourceText: t.sourceText };
    }
  }
  const blockers: string[] = [];
  if (missing.length) blockers.push('missing');
  if (rangeProblems(sh).length) blockers.push('range');
  if (lockedChanges(sh).length) blockers.push('locked');
  if (warnings.length && !sh.sandbox) blockers.push('warnings');
  return {
    open: true, refusal: null, hasSheet: true, entry: sh.entry, personId: sh.personId, position: sh.position, positions,
    archetypes: sh.position !== null && POSITION_TO_PROFILE[sh.position] ? archetypesFor(sh.position).map((a) => ({ id: a.id, labelId: a.labelId })) : [],
    archetypeCatalog, archetypeId: sh.archetypeId, realPerson: real, sandbox: sh.sandbox, marksWorldEdited: s.world.kind === 'career',
    sections, derived, staffGrade: grade,
    warnings: warnings.map((w) => ({ fields: w.fields, kind: w.kind, value: w.value, oneIn: w.oneIn })),
    missing, blockers, canCommit: blockers.length === 0, result: s.result,
  };
}
