// Coaching school view (G-94, bible N5; screens.json `school.lessons`, `school.drills`). One builder turns
// the user's school records into what the school screen draws: the curriculum map (N5.1), the drill
// records (N5.3), "my development" (N5.4, N5.5) and the current "Something to work on" card. Every number
// comes from the teaching module; this file only gathers. The records are the user's own and stay so: no
// world person's rating is read here.
import {
  accuracyByFamily, callSpeedSeries, curriculumMap, developmentPage, mostMissed, protectionAccuracy,
  CURRICULUM, GLOSSARY_SNAPSHOT,
  type Accuracy, type CallSession, type Curriculum, type CurriculumMap, type DevelopmentEntry, type DevelopmentPage,
  type DutyOffer, type GlossaryRow, type LessonRecord, type ProtectionResult, type RecognitionResult, type WorkOnCard,
} from '../../teaching/index.ts';

/** One answered clock problem (N5.3.3). `type` is the problem type of the clock problem pack. */
export interface ClockResult { readonly problemId: string; readonly type: string; readonly correct: boolean }

/** The school records of one user. They live in the save once the school table lands (CR-G94-1); the host passes them in until then. */
export interface SchoolInput {
  readonly personId: number;
  readonly level: 'pro' | 'college';
  readonly lessons: ReadonlyMap<string, LessonRecord>;
  readonly callSessions: readonly CallSession[];
  readonly recognition: readonly RecognitionResult[];
  readonly protection: readonly ProtectionResult[];
  readonly clock: readonly ClockResult[];
  readonly development: readonly DevelopmentEntry[];
  readonly offers: readonly DutyOffer[];
  /** The card shown after the last game, or null (at most one per game, N5.4.1 rule 3). */
  readonly current: WorkOnCard | null;
  /** Override for tests and packs; the shipped curriculum and glossary snapshot otherwise. */
  readonly curriculum?: Curriculum;
  readonly glossary?: readonly GlossaryRow[];
}

export interface SchoolDrills {
  readonly callSpeed: readonly { readonly session: number; readonly median: number; readonly worst: number }[];
  readonly recognition: { readonly byFamily: readonly Accuracy[]; readonly mostMissed: string | null };
  readonly protection: readonly Accuracy[];
  readonly clock: readonly Accuracy[];
}

/** The school screen's data (app-ui `SchoolData` plus who and which level). */
export interface SchoolView {
  readonly personId: number;
  readonly level: 'pro' | 'college';
  readonly map: CurriculumMap;
  readonly drills: SchoolDrills;
  readonly development: DevelopmentPage;
  readonly current: WorkOnCard | null;
}

/** Clock accuracy by problem type, in key order (the same shape as the other drill lists). */
export function clockAccuracy(rs: readonly ClockResult[]): Accuracy[] {
  const m = new Map<string, { n: number; c: number }>();
  for (const r of rs) { const x = m.get(r.type) ?? { n: 0, c: 0 }; x.n++; if (r.correct) x.c++; m.set(r.type, x); }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, x]) => ({ key, n: x.n, correct: x.c, share: x.c / x.n }));
}

export function buildSchoolView(input: SchoolInput): SchoolView {
  return {
    personId: input.personId,
    level: input.level,
    map: curriculumMap(input.lessons, input.level, input.curriculum ?? CURRICULUM, input.glossary ?? GLOSSARY_SNAPSHOT),
    drills: {
      callSpeed: callSpeedSeries(input.callSessions),
      recognition: { byFamily: accuracyByFamily(input.recognition), mostMissed: mostMissed(input.recognition) },
      protection: protectionAccuracy(input.protection),
      clock: clockAccuracy(input.clock),
    },
    development: developmentPage(input.development, input.offers),
    current: input.current,
  };
}

/** A user with no school records yet: every lesson not started, empty drill lists. */
export function emptySchoolInput(personId: number, level: 'pro' | 'college'): SchoolInput {
  return { personId, level, lessons: new Map(), callSessions: [], recognition: [], protection: [], clock: [], development: [], offers: [], current: null };
}
