// A team's game week for the gameplan screens: the starter book (G-67), the offense template sheet (G-68),
// a small menu, a scouting board and a head coach card. Reps, readiness estimates, counts and chart cells
// are made-up test numbers, not football facts. The two rule values are test stubs for the card's
// kneel-down table (the real ones come from the rule set).
import { gameplan as gp, playbook as pb } from '@gm/football-content';
import type { GameplanSource } from '../../../src/read-models/gameplan/index.ts';
import type { GameplanState } from '../../../src/commands/gameplan/index.ts';

export const TEAM = 7;
export const COORDINATOR: pb.Holder = { job: 'coordinator', side: 'offense' };
export const HEAD_COACH: pb.Holder = { job: 'head_coach' };
export const POSITION_COACH: pb.Holder = { job: 'position_coach', side: 'offense' };

const STUB_RULES = { num: (k: string): number => (k === 'clock.play_clock_s' ? 40 : 3) };

export function book(): { book: pb.Playbook; words: pb.WordList; template: pb.Template; ids: string[] } {
  const { book: b0, killPartId } = pb.starterBook(String(TEAM));
  const ids = [...b0.plays.values()].filter((p) => p.book === 'offense' && p.status !== 'retired').map((p) => p.id).slice(0, 6);
  let b = b0;
  for (const id of ids.slice(0, 4)) b = pb.replacePlay(b, { ...b.plays.get(id)!, situations: ['first_10'] });
  return { book: b, words: pb.defaultWordList(b, 'descriptive'), template: pb.familyTemplate('offense', 'descriptive', killPartId), ids };
}

const call = (playId: string): pb.Call => ({ playId, tags: [] });

export function state(): GameplanState & { ids: string[] } {
  const { ids } = book();
  const menu: gp.MenuEntry[] = [
    { id: 'm1', side: 'offense', call: call(ids[0]!), situationIds: ['first_10'], targetReps: 6 },
    { id: 'm2', side: 'offense', call: call(ids[1]!), situationIds: ['first_10', 'third_short'], targetReps: 4 },
    { id: 'm3', side: 'offense', call: call(ids[2]!), situationIds: ['third_short'], targetReps: 3 },
  ];
  let sheet = gp.offenseTemplate();
  sheet = gp.addEntry(sheet, 'first_10', { id: 'e1', call: call(ids[0]!) });
  sheet = gp.addEntry(sheet, 'first_10', { id: 'e2', call: call(ids[1]!) });
  sheet = gp.addEntry(sheet, 'third_short', { id: 'e3', call: call(ids[2]!), rank: 1 });
  sheet = { ...sheet, script: [{ id: 's1', call: call(ids[0]!), purpose: 'show_formation' }, { id: 's2', call: call(ids[1]!), purpose: 'early_completion', watchingFor: 'their slot defender' }] };
  const card: gp.HeadCoachCard = {
    fourth: [{ distanceYd: 1, yardsToGoalYd: 40, call: 'go', trace: 't' }, { distanceYd: 5, yardsToGoalYd: 40, call: 'punt', trace: 't' }],
    twoPoint: [{ scoreDiff: -2, goForTwo: true, trace: 't' }, { scoreDiff: 1, goForTwo: false, trace: 't' }],
    timeoutRules: ['keep one for the second half'], inBoundsPlayS: 6, kneel: [], fieldGoalLine: { withWind: 37, intoWind: 30 },
    crewTendencies: [], trickHistory: [], depthCard: [], standingInstructions: [], edits: [], stale: [],
  };
  return { menu, approval: { state: 'draft' }, matchups: [{ id: 'x', ours: 'Slot', theirs: 'Nickel', rule: 'target' }], proposal: null, sheet, card, ids };
}

export const WEEK: gp.WeekInstall = { shortWeek: false, capacityUnits: 30, today: 0, repsFrom: () => 60, projectReadiness: () => 0.7 };

export const BOARD: gp.LooksBoard = {
  cells: [
    { bucket: 'first_10', look: 'two_high', count: 18, n: 30, rate: 0.6, lo: 0.48, hi: 0.71, refs: [] },
    { bucket: 'third_short', look: 'zero_pressure', count: 2, n: 4, rate: null, lo: null, hi: null, refs: [] },
  ],
  stale: false, callerChanged: false,
};

/** The host's source for one state; readiness is the staff's estimate. */
export function sourceFor(s: GameplanState, holder: pb.Holder = COORDINATOR): GameplanSource {
  const b = book();
  return (teamId, unit) => (teamId !== TEAM || unit !== 'offense' ? null : {
    holder, book: b.book, words: b.words, template: b.template, cutoffS: 15, rules: STUB_RULES,
    menu: s.menu, board: BOARD, week: WEEK, themes: [], sequences: [], culled: 20, approval: s.approval, matchups: s.matchups, proposal: s.proposal,
    repsAssigned: (id) => ({ m1: 5, m2: 2, m3: 0 } as Record<string, number>)[id] ?? 0, repsAvailable: 60, qbDislikes: new Set<string>(),
    sheet: s.sheet, card: s.card, table: gp.proReference2024(),
    readiness: (c) => (c.playId === b.ids[0] ? 0.82 : c.playId === b.ids[2] ? null : 0.6),
    timesCalled: (c, sit) => (c.playId === b.ids[0] && sit === 'first_10' ? 9 : 0),
    practiced: () => true, needsDoubtful: () => null, audibleReps: () => 4,
  });
}
