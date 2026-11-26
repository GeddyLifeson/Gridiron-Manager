// Test fixtures for the compliance pipeline. Rule values here are FIXTURES copied from the bible leaves
// (C11.2.4 work-rule fines, L8.2.1 injury-report fines, L8.2.3 signal recording, I11.8.1 feigned-injury
// minimums); the real values arrive from G-10 with fact rows. Nothing here is triple-verified.
import { stream, seedFromNumber } from '@gm/engine-core';
import { WorldEvent, type RandomStream, type RuleSet, type WorldDate } from '@gm/schema';
import {
  K, emptyCompliance, type Act, type CaseResponse, type ComplianceContext, type EventDraft, type EventSink, type PartyRef, type StreamFor,
} from '../../src/compliance/index.ts';

export const DOLLAR = 100; // cents
const draftSchema = WorldEvent.omit({ id: true, notability: true });

export class MemorySink implements EventSink {
  readonly events: (EventDraft & { id: number })[] = [];
  append(d: EventDraft): number {
    draftSchema.parse(d);
    const id = this.events.length + 1;
    this.events.push({ ...d, id });
    return id;
  }
  ofType(t: string) { return this.events.filter((e) => e.type === t); }
}

export function ruleSet(values: Record<string, number | boolean | string>, id = 'fixture'): RuleSet {
  const get = (k: string) => {
    if (!(k in values)) throw new Error(`no rule ${k}`);
    return values[k]!;
  };
  return {
    id, level: 'pro', seasonYear: 2026,
    num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string,
    keys: () => Object.keys(values),
  };
}

const c = (id: string, f: string) => K.classField(id, f);

/** Pro fixture: amounts from C11.2.4 (2 of 3 / Verified), L8.2.1, L8.2.3, I11.8.1. */
export const PRO_VALUES: Record<string, number | boolean | string> = {
  [K.detectWindowYears]: 5,
  [K.unionVisitsPerYear]: 8,
  [K.cooperationReducesTier]: true,
  [K.headCoachResponsible]: false,
  [c('work_rules_practice', 'fine_head_coach_first_cents')]: 100_000 * DOLLAR,
  [c('work_rules_practice', 'fine_head_coach_repeat_cents')]: 250_000 * DOLLAR,
  [c('work_rules_practice', 'club_fine_first_cents')]: 250_000 * DOLLAR,
  [c('work_rules_practice', 'club_fine_repeat_cents')]: 500_000 * DOLLAR,
  [c('work_rules_practice', 'pick_round_first')]: 0,
  [c('work_rules_practice', 'pick_round_repeat')]: 4,
  [c('work_rules_practice', 'practice_cancel')]: 'ota_week',
  [c('injury_report_shading', 'fine_head_coach_first_cents')]: 25_000 * DOLLAR,
  [c('injury_report_shading', 'club_fine_first_cents')]: 75_000 * DOLLAR,
  [c('signal_recording', 'fine_head_coach_first_cents')]: 500_000 * DOLLAR,
  [c('signal_recording', 'club_fine_first_cents')]: 250_000 * DOLLAR,
  [c('signal_recording', 'pick_round_first')]: 1,
  [c('feigned_injury', 'club_fine_first_cents')]: 350_000 * DOLLAR,
  [c('feigned_injury', 'fine_head_coach_first_cents')]: 100_000 * DOLLAR,
  [c('feigned_injury', 'fine_assistant_first_cents')]: 50_000 * DOLLAR,
  [c('feigned_injury', 'fine_player_first_cents')]: 50_000 * DOLLAR,
  // College classes do not exist under the pro set.
  ...Object.fromEntries(['recruiting_contact', 'transfer_tampering', 'pay_rules', 'countable_hours', 'eligibility_academic', 'roster_limit', 'failure_to_cooperate'].map((x) => [c(x, 'applies'), false])),
};

/** College fixture: T9.5.1 rule 4 window 4, head coach responsibility (Bylaw 11.1.1.1), T9.5.3 observed means. */
export const COLLEGE_VALUES: Record<string, number | boolean | string> = {
  [K.detectWindowYears]: 4,
  [K.cooperationReducesTier]: true,
  [K.headCoachResponsible]: true,
  [c('recruiting_contact', 'suspension_games_first')]: 4,
  [c('recruiting_contact', 'probation_years')]: 3,
  [c('recruiting_contact', 'show_cause_years')]: 6,
};

export const D = (seasonYear: number, dayIndex: number): WorldDate => ({ seasonYear, dayIndex });

export function party(personId: number, role: PartyRef['role'], teamId = 1, origin: PartyRef['origin'] = 'generated'): PartyRef {
  return { personId, role, teamId, origin };
}

export function act(over: Partial<Act> & { classId: string }): Act {
  return {
    actor: party(10, 'head_coach'), orderedBy: null, knew: [], date: D(2026, 100), competitionId: 1, gain: 0.5,
    tier: 1, source: 'sim', ...over,
  };
}

export function realStreams(seed: number, name: string): StreamFor {
  return (scope) => stream(seedFromNumber(seed), name, scope);
}

/** A stream whose `chance` answers by a script on the scope; other draws are not used by the pipeline. */
export function scripted(answer: (scope: readonly (string | number)[], p: number) => boolean): StreamFor {
  return (scope) => {
    const s: RandomStream = {
      name: 'scripted', draws: 0,
      nextU32: () => 0, uniform: () => 0, normal: () => 0, pick: () => 0, int: (lo) => lo,
      chance: (p) => answer(scope, p),
    };
    return s;
  };
}

export function ctx(over: Partial<ComplianceContext> & { rules: RuleSet }): ComplianceContext {
  return {
    enforcement: realStreams(1, 'enforcement'),
    grievance: () => false,
    complianceStrictness: () => 0,
    mediaLeakWeekly: () => 0,
    bodyStrictness: () => 1,
    headCoachOf: () => null,
    monitoring: () => 0,
    respond: (): CaseResponse => 'fight',
    ...over,
  };
}

export const META = { tier: 1 as const, source: 'sim' as const };
export { emptyCompliance };
