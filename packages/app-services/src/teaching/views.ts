// Screen data of the school (O1 hub `school`: lessons, drills, my development). Built from the user's
// school records, which live in the save once the integrator adds their table (CR-G94-1); until then
// callers pass them in. No football logic is decided here.
import { CURRICULUM, GLOSSARY_SNAPSHOT, fitsLevel, prerequisites, type Curriculum, type GlossaryRow, type LevelTag } from './curriculum.ts';
import { courseState, lessonState, type CourseState, type LessonRecord, type LessonState } from './grading.ts';
import type { DutyOffer, Improvement, WorkOnCard } from './picker.ts';

export interface MapLesson {
  readonly id: string;
  readonly title: string;
  readonly minutes: number;
  readonly level: LevelTag;
  readonly state: LessonState;
  /** Shown, never enforced (N5.1.1). */
  readonly prerequisites: readonly string[];
  /** False while no graded scenario pack is solved for the lesson: it can be studied but not passed yet. */
  readonly gradable: boolean;
  /** Terms with fewer than three independent sources (A5): the term card shows their status. */
  readonly flaggedTerms: readonly { readonly id: string; readonly status: string }[];
  /** The lesson's rule answer differs by level and the save is at the other level. */
  readonly otherLevel: boolean;
}

export interface MapCourse { readonly id: string; readonly order: number; readonly title: string; readonly state: CourseState; readonly lessons: readonly MapLesson[] }

export interface CurriculumMap { readonly courses: readonly MapCourse[]; readonly passed: number; readonly mastered: number; readonly total: number }

export function curriculumMap(records: ReadonlyMap<string, LessonRecord>, level: 'pro' | 'college', c: Curriculum = CURRICULUM, glossary: readonly GlossaryRow[] = GLOSSARY_SNAPSHOT): CurriculumMap {
  const status = new Map(glossary.map((g) => [g.id, g.status]));
  let passed = 0, mastered = 0;
  const courses = [...c.courses].sort((a, b) => a.order - b.order).map((k) => ({
    id: k.id, order: k.order, title: k.title, state: courseState(c, k.id, records),
    lessons: c.lessons.filter((l) => l.course === k.id).map((l): MapLesson => {
      const state = lessonState(records.get(l.id));
      if (state === 'passed') passed++;
      if (state === 'mastered') { passed++; mastered++; }
      return {
        id: l.id, title: l.title, minutes: l.minutes, level: l.level, state, prerequisites: prerequisites(c, l.id), gradable: l.pack !== null,
        flaggedTerms: l.terms.map((t) => ({ id: t, status: status.get(t) ?? 'missing' })).filter((t) => t.status !== 'Verified'),
        otherLevel: !fitsLevel(l, level),
      };
    }),
  }));
  return { courses, passed, mastered, total: c.lessons.length };
}

export interface DevelopmentEntry { readonly card: WorkOnCard; readonly shownAfterGame: number; readonly status: Improvement }

/** "My development" page (N5.4.1, N5.5.1 rule 4): patterns over the career and every duty offer made. */
export interface DevelopmentPage { readonly patterns: readonly DevelopmentEntry[]; readonly offers: readonly DutyOffer[] }

export function developmentPage(entries: readonly DevelopmentEntry[], offers: readonly DutyOffer[]): DevelopmentPage {
  return { patterns: [...entries].sort((a, b) => b.shownAfterGame - a.shownAfterGame), offers: [...offers] };
}
