// Curriculum (N5.1.1): courses and lessons as data, a validator, and the curriculum map view.
// Lessons point at bible leaves, starter content and glossary terms; they never restate football.
import CURRICULUM_JSON from './data/curriculum.json' with { type: 'json' };
import GLOSSARY_JSON from './data/glossary-snapshot.json' with { type: 'json' };

export type LevelTag = 'pro' | 'college' | 'both';
export type DrillKind = 'call_speed' | 'recognition' | 'clock' | 'protection';
export const DRILL_KINDS: readonly DrillKind[] = ['call_speed', 'recognition', 'clock', 'protection'];

export interface Course { readonly id: string; readonly order: number; readonly title: string; readonly bible: readonly string[] }

export interface Lesson {
  readonly id: string;
  readonly course: string;
  readonly title: string;
  readonly level: LevelTag;
  readonly minutes: number;
  /** Bible leaves the lesson teaches (F, G, B, I ...). */
  readonly bible: readonly string[];
  /** Starter content ids (formations, plays, defensive calls) shown in the lesson; each carries its sources. */
  readonly content: readonly string[];
  /** A4.5 glossary term ids the lesson introduces. */
  readonly terms: readonly string[];
  /** Graded scenario pack id (N4.3.2 format), or null while no pack is solved. */
  readonly pack: string | null;
  readonly drill?: DrillKind;
}

export interface Curriculum { readonly version: string; readonly courses: readonly Course[]; readonly lessons: readonly Lesson[] }

export interface GlossaryRow { readonly id: string; readonly term: string; readonly level: LevelTag; readonly status: string; readonly sources: number }

export const CURRICULUM: Curriculum = CURRICULUM_JSON as Curriculum;
export const GLOSSARY_SNAPSHOT: readonly GlossaryRow[] = (GLOSSARY_JSON as { terms: GlossaryRow[] }).terms;

/** Lookups the validator needs. Each returns whether the id resolves. */
export interface CurriculumResolvers {
  term(id: string): boolean;
  content(id: string): boolean;
  /** A bible leaf or area id that is written. */
  bible(id: string): boolean;
  pack?(id: string): boolean;
}

/** N5.1.1 acceptance: every listed term exists, every F, G or B id resolves; courses and ids are sound. */
export function validateCurriculum(c: Curriculum, r: CurriculumResolvers): string[] {
  const problems: string[] = [];
  const courseIds = new Set<string>();
  for (const k of c.courses) {
    if (courseIds.has(k.id)) problems.push(`course ${k.id}: duplicate id`);
    courseIds.add(k.id);
    for (const b of k.bible) if (!r.bible(b)) problems.push(`course ${k.id}: bible ${b} does not resolve`);
  }
  const orders = c.courses.map((k) => k.order).sort((a, b) => a - b);
  orders.forEach((o, i) => { if (o !== i + 1) problems.push(`course order: expected ${i + 1}, found ${o}`); });
  const lessonIds = new Set<string>();
  for (const l of c.lessons) {
    if (lessonIds.has(l.id)) problems.push(`lesson ${l.id}: duplicate id`);
    lessonIds.add(l.id);
    if (!courseIds.has(l.course)) problems.push(`lesson ${l.id}: unknown course ${l.course}`);
    if (!l.id.startsWith(`${l.course}.`)) problems.push(`lesson ${l.id}: id must start with its course`);
    if (!(l.minutes > 0)) problems.push(`lesson ${l.id}: minutes must be positive`);
    if (l.bible.length === 0) problems.push(`lesson ${l.id}: names no bible leaf`);
    for (const b of l.bible) if (!r.bible(b)) problems.push(`lesson ${l.id}: bible ${b} does not resolve`);
    for (const t of l.terms) if (!r.term(t)) problems.push(`lesson ${l.id}: term ${t} not in the glossary`);
    for (const x of l.content) if (!r.content(x)) problems.push(`lesson ${l.id}: content ${x} does not resolve`);
    if (l.pack !== null && r.pack && !r.pack(l.pack)) problems.push(`lesson ${l.id}: pack ${l.pack} does not resolve`);
  }
  for (const k of c.courses) if (!c.lessons.some((l) => l.course === k.id)) problems.push(`course ${k.id}: no lessons`);
  return problems;
}

export function lessonById(c: Curriculum, id: string): Lesson | null { return c.lessons.find((l) => l.id === id) ?? null; }

export function lessonsOf(c: Curriculum, courseId: string): Lesson[] { return c.lessons.filter((l) => l.course === courseId); }

/**
 * Prerequisites shown, never enforced (N5.1.1): the lessons before this one in its course, and the last
 * lesson of every earlier course that it names a shared bible area with. Ordering only; nothing is locked.
 */
export function prerequisites(c: Curriculum, lessonId: string): string[] {
  const l = lessonById(c, lessonId);
  if (!l) return [];
  const own = lessonsOf(c, l.course);
  const before = own.slice(0, own.findIndex((x) => x.id === l.id)).map((x) => x.id);
  return before;
}

/** Glossary status of each term a lesson introduces. A term short of three groups is flagged on screen (A5). */
export function termStatus(id: string, glossary: readonly GlossaryRow[] = GLOSSARY_SNAPSHOT): GlossaryRow | null {
  return glossary.find((g) => g.id === id) ?? null;
}

/** A lesson is "level-fit" for a save at `level` when its tag is that level or both. */
export function fitsLevel(l: Lesson, level: 'pro' | 'college'): boolean { return l.level === 'both' || l.level === level; }
