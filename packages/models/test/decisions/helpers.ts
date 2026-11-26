// Test fixtures for the decision log. Values are fixtures, not facts.
import { decisionType } from '../../src/decisions/catalogue.ts';
import type { DecisionRecord, ModelView, TruthView } from '../../src/decisions/types.ts';

export const USER = 101;
export const BOSS = 102;
export const OC = 103;

export function record(id: string, type: string, over: Partial<DecisionRecord> = {}): DecisionRecord {
  const def = decisionType(type);
  const inGame = def.scope === 'game';
  return {
    id,
    time: { worldDate: '2027-10-03', gameId: inGame ? 7 : null, playIndex: inGame ? 12 : null, period: inGame ? 2 : null, gameClockTenths: inGame ? 4200 : null },
    actor: { kind: 'user', personId: USER },
    rung: 'job.head_coach',
    type,
    owner: def.owners[0]!,
    teamId: 3,
    situation: inGame ? { down: 4, distance: 2, yardLine: 38, scoreDiff: -3 } : { week: 5, opponentTeamId: 9 },
    options: [
      { optionId: 'a', labelKey: 'opt.a', detail: null },
      { optionId: 'b', labelKey: 'opt.b', detail: { play: 'inside_zone' } },
    ],
    chosen: 'a',
    information: [{ source: 'scouting.tendencies', viewed: true, value: { runRate: 0.41, sample: 212 }, modelLacks: null }],
    timeTaken: { tenthsFromPrompt: 85, playClockLeftTenths: inGame ? 120 : null },
    attribution: { creditedPersonId: USER, basis: 'own_decision', viaPersonId: null },
    notMade: false,
    supersedes: null,
    snapshotId: null,
    violationLogId: type === 'rule_breaking_act' ? 'viol-1' : null,
    ...over,
  };
}

/** A view of the right kind for the record (chosen 'a'). */
export function viewFor(r: DecisionRecord): { view: ModelView; truth: TruthView | null } {
  const kind = decisionType(r.type).view;
  if (kind === 'game_management') {
    return {
      view: {
        kind, modelId: 'wp.test', chosen: r.chosen, best: 'b', cost: 0.04, margin: 0.06, class: 'toss_up', lacks: [],
        options: [
          { optionId: 'a', value: 0.57, low: 0.54, high: 0.6, sparse: false },
          { optionId: 'b', value: 0.61, low: 0.58, high: 0.64, sparse: false },
        ],
      },
      truth: { kind, best: 'b', cost: 0.05, options: [] },
    };
  }
  if (kind === 'play_call') {
    return { view: { kind, modelId: 'calltable.test', foresight: 0.12, foresightSample: 400, predictability: 0.3 }, truth: { kind, hindsight: -0.4, engineForesight: 0.1 } };
  }
  return { view: { kind, followUps: ['2027-10-31'] }, truth: null };
}

export const SEGMENT = { gameVersion: '0.1.0', seed: 'seed-1', settings: { certified: false } };
