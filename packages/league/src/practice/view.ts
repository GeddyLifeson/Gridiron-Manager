// The `practice.planner` screen view (H3.1.1 "What the user sees": periods as rows, groups as columns,
// a sidebar with expected reps, load and install coverage; H3.6.1 limits panel). Only plan values,
// counts and labels: no truth-class value (ratings, readiness, hidden coach terms) reaches it (K9.1).
import type { RuleLookup } from '../calendar/types.ts';
import { WEEK_KEYS } from '../week/keys.ts';
import { hasPaddedBudget, keyStatus, type PracticeFinding } from './limits.ts';
import { KEYS, P } from './params.ts';
import { periodType, plannedMinutes, repsInPeriod, transitionMinutes } from './practice.ts';
import type { Coverage } from './script.ts';
import type { Participation, Practice } from './types.ts';

export interface PracticeView {
  readonly practiceId: string;
  readonly pads: string;
  readonly periods: readonly {
    readonly number: number; readonly minutes: number; readonly type: string; readonly plain: string; readonly tempo: string;
    readonly groups: readonly string[]; readonly leader: string; readonly reps: number; readonly load: number; readonly scripted: boolean;
  }[];
  readonly minutes: { readonly planned: number; readonly block: number; readonly transitions: number; readonly remaining: number };
  readonly expectedReps: number;
  readonly coverage: { readonly zero: number; readonly one: number; readonly more: number };
  /** Null when the rule set has no padded budget (H3.6.1 acceptance 2). */
  readonly paddedLeft: number | null;
  /** College countable hours with the key's fact status. College practice limits ship PROVISIONAL (build plan, R1.2.7). */
  readonly hours: { readonly dayLimitMinutes: number; readonly usedToday: number; readonly status: string | null; readonly provisional: boolean } | null;
  readonly findings: readonly { readonly hard: boolean; readonly plain: string; readonly penalty: string; readonly leaf: string }[];
  readonly participation: readonly { readonly personId: string; readonly label: string; readonly reason: string }[];
}

export interface PracticeViewInput {
  readonly practice: Practice;
  readonly rules: RuleLookup;
  readonly coverage: Coverage;
  readonly findings: readonly PracticeFinding[];
  readonly participation: readonly Participation[];
  /** Padded practices already used this season (counter from held activities). */
  readonly paddedUsed: number;
  readonly otherCountableToday?: number;
}

export function practiceView(i: PracticeViewInput): PracticeView {
  const p = i.practice;
  const planned = plannedMinutes(p);
  const periods = p.periods.map((per) => {
    const t = periodType(per.type);
    return {
      number: per.number, minutes: per.minutes, type: t.id, plain: t.plain, tempo: per.tempo, groups: per.groups,
      leader: per.leader.user ? 'you' : per.leader.role, reps: repsInPeriod(per, p), load: t.load, scripted: per.scriptRef !== undefined,
    };
  });
  const limit = i.rules(KEYS.seasonPadded) ?? i.rules(KEYS.collegePadded);
  const dayH = i.rules(KEYS.dayHours);
  const status = keyStatus(KEYS.dayHours) ?? weekKeyStatus(KEYS.dayHours);
  return {
    practiceId: p.id, pads: p.pads, periods,
    minutes: { planned, block: p.blockMinutes, transitions: transitionMinutes(p), remaining: p.blockMinutes - planned },
    expectedReps: periods.reduce((s, x) => s + x.reps, 0),
    coverage: { zero: i.coverage.zero.length, one: i.coverage.one.length, more: i.coverage.more.length },
    paddedLeft: hasPaddedBudget(i.rules) && limit !== undefined ? limit - i.paddedUsed : null,
    hours: dayH === undefined ? null : { dayLimitMinutes: dayH * P('minutes_per_hour'), usedToday: (i.otherCountableToday ?? 0) + planned, status, provisional: true },
    findings: i.findings.map((f) => ({ hard: f.hardness === 'hard', plain: f.plain, penalty: f.penalty, leaf: f.leaf })),
    participation: i.participation.map((x) => ({ personId: x.personId, label: x.label, reason: x.reason })),
  };
}

function weekKeyStatus(key: string): string | null { return WEEK_KEYS.find((k) => k.key === key)?.status ?? null; }
