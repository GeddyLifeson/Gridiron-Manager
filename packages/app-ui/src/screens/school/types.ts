// Coaching school data as the screen draws it (G-94, N5). Same shapes as app-services
// src/teaching/views.ts and drills.ts; app-ui imports only the app-services entry point, so the shapes are
// written here too until the integrator re-exports them (CR-G94-1).

export type LessonState = 'not_started' | 'attempted' | 'passed' | 'mastered';
export type CourseState = 'not_started' | 'in_progress' | 'passed';
export type DrillKind = 'call_speed' | 'recognition' | 'clock' | 'protection';
export type Improvement = 'pending' | 'improved' | 'not_yet';

export interface MapLesson {
  id: string; title: string; minutes: number; level: 'pro' | 'college' | 'both'; state: LessonState;
  prerequisites: string[]; gradable: boolean; flaggedTerms: { id: string; status: string }[]; otherLevel: boolean;
}
export interface MapCourse { id: string; order: number; title: string; state: CourseState; lessons: MapLesson[] }
export interface CurriculumMap { courses: MapCourse[]; passed: number; mastered: number; total: number }

export interface Accuracy { key: string; n: number; correct: number; share: number }
export interface DrillsData {
  callSpeed: { session: number; median: number; worst: number }[];
  recognition: { byFamily: Accuracy[]; mostMissed: string | null };
  protection: Accuracy[];
  clock: Accuracy[];
}

export interface WorkOnCard {
  bucket: string; decisionType: string; games: number; decisions: number;
  chosen: Record<string, number>; modelFavoured: Record<string, number>; costPerGame: number; lesson: string | null; drill: DrillKind | null;
}
export interface DevelopmentEntry { card: WorkOnCard; shownAfterGame: number; status: Improvement }
export interface DutyOffer { duty: string; lessons: string[]; drills: DrillKind[] }
export interface DevelopmentPage { patterns: DevelopmentEntry[]; offers: DutyOffer[] }

export interface SchoolData { map: CurriculumMap; drills: DrillsData; development: DevelopmentPage; current: WorkOnCard | null }

export const SCHOOL_TABS = ['lessons', 'drills', 'development'] as const;
export type SchoolTab = (typeof SCHOOL_TABS)[number];
