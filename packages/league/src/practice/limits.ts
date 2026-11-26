// Practice against the rules (H3.1.1 rule 4, H3.1.2 prohibited drills, H3.1.3 live without pads,
// H3.3.2 report labels and clearance, H3.6.1 college hours). Nothing here refuses: every break opens the
// L8.2.5 warning once, and confirming turns each hard finding into one violation request for G-28.
// Pro limits come from the G-12 work-rule checker; college hours from the countable-hours keys.
import type { FactStatus } from '@gm/schema';
import type { Activity, Contact, Equipment, HeldActivity, WorkContext, WorkRuleChecker } from '../calendar/work-rules.ts';
import type { RuleLookup } from '../calendar/types.ts';
import type { ViolationRequest } from '../week/edit.ts';
import { KEYS, P, PRACTICE_KEYS } from './params.ts';
import { periodType, plannedMinutes } from './practice.ts';
import type { Participation, ParticipationLabel, Practice } from './types.ts';

export interface PracticeFinding {
  readonly hardness: 'hard' | 'soft';
  readonly classId: string;
  readonly ruleId: string;
  readonly plain: string;
  readonly penalty: string;
  readonly leaf: string;
  readonly status: FactStatus | null;
  readonly period: number | null;
}

const EQUIP: Record<Practice['pads'], Equipment> = { none: 'helmets', shells: 'shells', full: 'pads' };

/** The practice as one calendar activity for the work-rule checker (C11.1.1). */
export function practiceActivity(p: Practice): Activity {
  const tempos = p.periods.map((x) => x.tempo);
  const contact: Contact = tempos.includes('live') ? 'live' : tempos.includes('thud') ? 'thud' : 'none';
  const drills: string[] = [];
  for (const per of p.periods) for (const d of per.drills ?? []) if (!drills.includes(d)) drills.push(d);
  const walkOnly = p.periods.every((x) => x.tempo === 'walk');
  return {
    day: p.day, type: walkOnly ? 'walkthrough' : 'practice', fieldMinutes: plannedMinutes(p), equipment: EQUIP[p.pads], contact,
    footballs: true, teamVsTeam: p.periods.some((x) => periodType(x.type).kind === 'team'), drills, fullSpeed: contact !== 'none', mandatory: true,
  };
}

export interface PracticeLimitEnv {
  readonly rules: RuleLookup;
  /** Pro and any rule set with work-rule records. */
  readonly checker?: WorkRuleChecker;
  readonly ctx?: WorkContext;
  readonly held?: readonly HeldActivity[];
  /** Countable minutes already on the day and in the week outside this practice (H3.6.1 rule 1). */
  readonly otherCountableToday?: number;
  readonly otherCountableWeek?: number;
}

/** Every finding for a planned practice. Hard findings are rule breaks; soft ones are coaching costs. */
export function checkPractice(p: Practice, env: PracticeLimitEnv): PracticeFinding[] {
  const out: PracticeFinding[] = [];
  if (env.checker && env.ctx) {
    const r = env.checker.check(practiceActivity(p), env.ctx, env.held ?? []);
    for (const b of r.broken) out.push({ hardness: 'hard', classId: 'work_rule', ruleId: b.ruleId, plain: b.plain, penalty: b.penalty, leaf: b.leaf, status: b.status, period: null });
  }
  const dayH = env.rules(KEYS.dayHours);
  if (dayH !== undefined) {
    const used = (env.otherCountableToday ?? 0) + plannedMinutes(p);
    if (used > dayH * P('minutes_per_hour')) out.push(hardKey('countable_day_hours', KEYS.dayHours, `practice takes the day to ${used} countable minutes, over the ${dayH}-hour daily limit`, 'H3.6.1'));
    const weekH = env.rules(KEYS.weekHours);
    if (weekH !== undefined && (env.otherCountableWeek ?? 0) + plannedMinutes(p) > weekH * P('minutes_per_hour')) {
      out.push(hardKey('countable_week_hours', KEYS.weekHours, `practice takes the week over the ${weekH}-hour limit`, 'H3.6.1'));
    }
  }
  for (const per of p.periods) {
    if (per.tempo === 'live' && p.pads !== 'full') out.push({ hardness: 'soft', classId: 'coaching', ruleId: 'live_without_pads', plain: `period ${per.number} is live without full pads: injury exposure rises`, penalty: '', leaf: 'H3.1.3', status: null, period: per.number });
    if (periodType(per.type).needsScript && !per.scriptRef) out.push({ hardness: 'soft', classId: 'coaching', ruleId: 'no_script', plain: `period ${per.number} has no script: it runs on the coordinator's draft`, penalty: '', leaf: 'H3.2.1', status: null, period: per.number });
  }
  return out;
}

function hardKey(ruleId: string, key: string, plain: string, leaf: string): PracticeFinding {
  return { hardness: 'hard', classId: 'work_rule', ruleId, plain, penalty: 'NCAA infractions process (T9.5)', leaf, status: keyStatus(key), period: null };
}

/** Fact status of a key this module or the week carries (PROVISIONAL flag for the screen), null when G-10 owns it. */
export function keyStatus(key: string): FactStatus | null {
  return PRACTICE_KEYS.find((k) => k.key === key)?.status ?? null;
}

/** True when the rule set shows a padded budget at all (H3.6.1 acceptance 2: no value, no budget). */
export function hasPaddedBudget(rules: RuleLookup): boolean {
  return rules(KEYS.seasonPadded) !== undefined || rules(KEYS.collegePadded) !== undefined;
}

/** Confirmed hard findings become violation requests (one each), the same path as the week editor. */
export function violationRequests(fs: readonly PracticeFinding[], blockId: string, weekId: string, teamId: number): ViolationRequest[] {
  return fs.filter((f) => f.hardness === 'hard').map((f) => ({ classId: f.classId, ruleId: f.ruleId, blockId, plain: f.plain, penalty: f.penalty, weekId, teamId }));
}

export interface ParticipationFinding {
  readonly personId: string;
  /** `false_report` and `uncleared` are breakable acts; `overrule` is a logged decision (N3). */
  readonly kind: 'false_report' | 'uncleared' | 'overrule';
  readonly plain: string;
}

/**
 * The sheet against medicine and the report (H3.3.2 rule 2 and edge case). `filed` is the label the club
 * files on the league report; `implied` the one the actual share implies.
 */
export function participationFindings(sheet: readonly Participation[], implied: ReadonlyMap<string, ParticipationLabel>, filed: ReadonlyMap<string, ParticipationLabel>): ParticipationFinding[] {
  const out: ParticipationFinding[] = [];
  for (const p of sheet) {
    const imp = implied.get(p.personId) ?? p.label;
    const f = filed.get(p.personId) ?? imp;
    if (f !== imp) out.push({ personId: p.personId, kind: 'false_report', plain: `report says ${f} but he practised ${imp}` });
    const m = p.medical;
    if (!m) continue;
    if ((!m.cleared || m.protocol) && p.label !== 'did_not_participate') out.push({ personId: p.personId, kind: 'uncleared', plain: m.protocol ? 'practising a player in the concussion protocol' : 'practising a player the doctors have not cleared' });
    else if (m.recommend !== p.label) out.push({ personId: p.personId, kind: 'overrule', plain: `medical staff recommended ${m.recommend}` });
  }
  return out;
}

export function participationRequests(fs: readonly ParticipationFinding[], weekId: string, teamId: number): ViolationRequest[] {
  return fs.filter((f) => f.kind !== 'overrule').map((f) => ({
    classId: f.kind === 'false_report' ? 'injury_report' : 'medical_clearance', ruleId: f.kind, blockId: null, plain: f.plain,
    penalty: f.kind === 'false_report' ? 'league fine (C11)' : 'league discipline (C11)', weekId, teamId,
  }));
}
