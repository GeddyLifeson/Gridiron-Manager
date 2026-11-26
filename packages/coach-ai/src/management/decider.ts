// The AI head coach as a decider (J11.6.1): answers the game-management requests of the flow. Call
// requests are K4's; here they return null, and K4 reads `fourthDown`, `twoDownTerritory` and `clockPlan`
// to constrain its call (K4.1.1, K4.5.2). The request and answer shapes mirror @gm/schema structurally:
// coach-ai may not import schema (P1.2.1).
//
// Everything football comes through `StaffPort`, built by the game layer from the observer-filtered view
// of this coach's staff (K9, G-27): the scoreboard, the staff's estimates and the valued option lists.
import { challengeDecision, type ChallengeAspect } from './challenge.ts';
import { overtimeChoice, penaltyChoice, runoffChoice, tossCall, tossChoice, type TossInput, type ValuedOption } from './elections.ts';
import { timeoutDecision, type TimeoutMoment } from './timeouts.ts';
import { tryChoice } from './try.ts';
import type { ClockMode } from './clock.ts';
import type { CoachInputs, Env, LogRow, Situation, StaffEstimates } from './types.ts';

export type RequestType = 'toss_call' | 'toss_choice' | 'snapping_call' | 'opposing_call' | 'timeout' | 'challenge' | 'penalty_choice' | 'try_choice' | 'runoff_choice' | 'overtime_choice';

export interface RequestLike {
  readonly requestId: number;
  readonly type: RequestType;
  readonly side: 0 | 1;
  readonly options: readonly { readonly optionId: string }[];
  readonly defaultOptionId: string | null;
}
export interface ViewLike { readonly request: RequestLike }

export interface DecisionLike {
  requestId: number; type: RequestType; side: 0 | 1; optionId: string | null; snappingCall: null; opposingCall: null;
  acceptedAtPlayClockTenths: number | null; actor: { kind: 'ai'; personId: number | null };
}

/** What the game layer supplies for each request. A method returning null means "no view": the default applies. */
export interface StaffPort<V extends ViewLike> {
  env(view: V): Env;
  situation(view: V): Situation;
  estimates(view: V): StaffEstimates;
  toss(view: V): TossInput | null;
  valued(view: V): readonly ValuedOption[] | null;
  timeout(view: V): { moment: TimeoutMoment; mode: ClockMode; reserveTimeout: boolean; legal: boolean } | null;
  challenge(view: V): { aspects: readonly ChallengeAspect[]; challengesUsed: number } | null;
  /** Receives the log row of each decision that has one (N3). */
  log?(row: LogRow): void;
}

/** Option ids of the flow (engine-game `OPT`), passed in so no id is typed twice. */
export interface OptionIds { readonly none: string; readonly timeout: string; readonly tryKick: string; readonly tryTwo: string; readonly defer: string }

export interface ManagementDecider<V extends ViewLike> { readonly side: 0 | 1; decide(view: V): DecisionLike | null }

export function createManagementDecider<V extends ViewLike>(cfg: { side: 0 | 1; personId: number | null; coach: CoachInputs; staff: StaffPort<V>; ids: OptionIds }): ManagementDecider<V> {
  const { staff, coach, ids } = cfg;
  const answer = (r: RequestLike, optionId: string): DecisionLike | null => {
    // An id the request does not offer is never sent: the default applies instead.
    if (!r.options.some((o) => o.optionId === optionId)) return null;
    return { requestId: r.requestId, type: r.type, side: r.side, optionId, snappingCall: null, opposingCall: null, acceptedAtPlayClockTenths: null, actor: { kind: 'ai', personId: cfg.personId } };
  };
  return {
    side: cfg.side,
    decide(view: V): DecisionLike | null {
      const r = view.request;
      if (r.side !== cfg.side) return null;
      const offered = (xs: readonly ValuedOption[] | null) => (xs ? xs.filter((x) => r.options.some((o) => o.optionId === x.optionId)) : []);
      switch (r.type) {
        case 'snapping_call': case 'opposing_call': return null;
        case 'toss_call': return answer(r, tossCall(r.options.map((o) => o.optionId), staff.env(view).draws));
        case 'toss_choice': {
          const t = staff.toss(view);
          const options = offered(t ? t.options : null);
          if (!t || options.length === 0) return null;
          return answer(r, tossChoice({ ...t, options, deferId: r.options.some((o) => o.optionId === ids.defer) ? ids.defer : null }, staff.env(view).draws).optionId);
        }
        case 'overtime_choice': {
          const options = offered(staff.valued(view));
          return options.length === 0 ? null : answer(r, overtimeChoice(options, staff.env(view).draws).optionId);
        }
        case 'penalty_choice': case 'runoff_choice': {
          const options = offered(staff.valued(view));
          if (options.length === 0) return null;
          const pick = r.type === 'penalty_choice' ? penaltyChoice : runoffChoice;
          return answer(r, pick(options, coach, staff.env(view).draws).optionId);
        }
        case 'try_choice': {
          const res = tryChoice(staff.env(view), { situation: staff.situation(view), estimates: staff.estimates(view), coach });
          staff.log?.(res.log);
          return answer(r, res.choice === 'kick' ? ids.tryKick : ids.tryTwo);
        }
        case 'timeout': {
          const t = staff.timeout(view);
          if (!t) return null;
          const res = timeoutDecision(staff.env(view), { situation: staff.situation(view), coach, ...t });
          return answer(r, res.call ? ids.timeout : ids.none);
        }
        case 'challenge': {
          const c = staff.challenge(view);
          if (!c) return null;
          const aspects = c.aspects.filter((a) => r.options.some((o) => o.optionId === a.optionId));
          const res = challengeDecision(staff.env(view), { situation: staff.situation(view), coach, aspects, challengesUsed: c.challengesUsed });
          return answer(r, res.optionId ?? ids.none);
        }
      }
    },
  };
}
