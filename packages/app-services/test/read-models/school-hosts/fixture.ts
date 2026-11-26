// Fixtures for the school, player designer, editors and settings hosts (plan item 3d). The school records
// are one user's: a placed lesson, a failed attempt, two call-speed sessions, a recognition run, protection
// and clock answers, and one "Something to work on" card with its development entry.
import type { teaching } from '../../../src/index.ts';
import type { SchoolInput } from '../../../src/read-models/school/index.ts';
import type { EditorDefLike, ModEntryLike } from '../../../src/read-models/editors/index.ts';

type AttemptResult = teaching.AttemptResult;

const attempt = (lessonId: string, score: number, drawKey: string): AttemptResult => ({
  lessonId, packId: `${lessonId}.pack`, drawKey, score, passed: score >= 0.7, answers: [], errorsByType: {}, medianSeconds: 9,
});

export const CARD: teaching.WorkOnCard = {
  bucket: 'fourth_down:own_40_to_50', decisionType: 'fourth_down', games: 6, decisions: 9,
  chosen: { punt: 8, go: 1 }, modelFavoured: { punt: 3, go: 6 }, costPerGame: 0.021, lesson: 'situations.fourth_down', drill: null,
};

export function schoolInput(personId: number): SchoolInput {
  return {
    personId, level: 'pro',
    lessons: new Map([
      ['rules.downs', { lessonId: 'rules.downs', attempts: [], placed: true }],
      ['rules.play_clock', { lessonId: 'rules.play_clock', attempts: [attempt('rules.play_clock', 0.5, 'a|b|c')], placed: false }],
    ]),
    callSessions: [
      { reps: [{ seconds: 9, deadline: 15, correctSection: true }, { seconds: 17, deadline: 15, correctSection: true }, { seconds: 11, deadline: 15, correctSection: false }] },
      { reps: [{ seconds: 8, deadline: 15, correctSection: true }, { seconds: 10, deadline: 15, correctSection: true }] },
    ],
    recognition: [
      { clipId: 'c1', family: 'cover_3', disguise: 0, correct: true, parts: { shell: true, coverage: true, pressure: true } },
      { clipId: 'c2', family: 'cover_3', disguise: 1, correct: false, parts: { shell: true, coverage: false, pressure: true } },
      { clipId: 'c3', family: 'cover_2', disguise: 0, correct: false, parts: { shell: false, coverage: false, pressure: true } },
    ],
    protection: [{ lookId: 'l1', pressure: 'nickel_fire', correct: true }, { lookId: 'l2', pressure: 'nickel_fire', correct: false }],
    clock: [{ problemId: 'k1', type: 'kneel_out', correct: true }, { problemId: 'k2', type: 'kneel_out', correct: true }, { problemId: 'k3', type: 'timeout_use', correct: false }],
    development: [{ card: CARD, shownAfterGame: 12, status: 'pending' }],
    offers: [{ duty: 'play_calling_offense', lessons: ['situations.fourth_down'], drills: ['call_speed'] }],
    current: CARD,
  };
}

export const EDITOR_DEFS: readonly EditorDefLike[] = [
  { id: 'play-designer', title: 'Play designer', certifiedAllowed: true },
  { id: 'rule-set-editor', title: 'Rule-set editor', certifiedAllowed: false },
];

export function modEntries(): ModEntryLike[] {
  return [
    {
      origin: 'good-pack', packId: 'user.good', name: 'Good pack', version: '1.0.0', author: 'Someone', kinds: ['playbooks'], signature: 'unsigned', selectable: true,
      problems: [{ severity: 'info', code: 'pack.note', packId: 'user.good', file: 'pack.json', path: '$', message: 'note' }], ignored: [], neutralised: [],
    },
    {
      origin: 'bad-pack.zip', packId: 'user.bad', name: 'Bad pack', version: '0.1.0', author: '?', kinds: ['people'], signature: 'signature_not_checked', selectable: false,
      problems: [
        { severity: 'warning', code: 'item.unknown_field', packId: 'user.bad', file: 'people/a.json', path: '$.x', message: 'unknown field x' },
        { severity: 'error', code: 'pack.duplicate_id', packId: 'user.bad', file: 'pack.json', path: '$.id', message: 'duplicate id' },
      ],
      ignored: [{ file: 'logo.png', reason: 'images are not loaded' }],
      neutralised: [{ file: 'people/a.json', path: '$.name', what: 'markup' }, { file: 'people/a.json', path: '$.bio', what: 'control_chars' }],
    },
  ];
}
