// The named career scripts (G-89): the S10.3.1 tuning pair ("perfect work", "average work"), the two
// acceptance runs (rung 0 to pro head coach; fired and rehired), and the Q4.3.1 greedy loop agents, which
// all work like the standard AI coach and add one loop.
import type { RandomStream } from '@gm/schema';
import type { WeekMode } from './pace.ts';
import type { CareerPolicy, CareerScript, Offer, PolicyContext } from './types.ts';

/** S3 duty families a season's work is graded in (the families the boss weighs, S10.1.1). */
export const FAMILIES = ['film', 'practice', 'game_plan', 'game_day'] as const;

const work = (mean: number, spread: number) => (_f: string, _c: PolicyContext, s: RandomStream): number => mean + spread * s.normal();

/** Best offer above the current seat's value; ties go to the earlier offer. */
export function bestStepUp(offers: readonly Offer[], ctx: PolicyContext, preferPro = false): Offer | null {
  const seat = ctx.state.seat;
  let best: Offer | null = null;
  const score = (o: Offer): number => o.value + (preferPro && o.level === 'pro' ? 20 : 0);
  for (const o of offers) {
    // A pro-minded coach on a pro staff does not drop to a college seat below the top level (rung 8).
    if (preferPro && seat?.level === 'pro' && o.level === 'college' && o.rung < 9) continue;
    const up = seat === null || o.rung > seat.rung || o.fit === 'step_up' || o.fit === 'well_above';
    if (!up) continue;
    if (!best || score(o) > score(best)) best = o;
  }
  return best;
}

/** Take anything when out of work, otherwise only a step up. */
const takeStepUpOrAnyWhenOut = (preferPro: boolean) => (offers: readonly Offer[], ctx: PolicyContext): Offer | null => {
  if (ctx.state.seat === null && offers.length) return bestStepUp(offers, ctx, preferPro) ?? offers[0]!;
  return bestStepUp(offers, ctx, preferPro);
};

const keyWeeks = (): WeekMode => 'key_weeks';

export function perfectWork(id = 'perfect_work', preferPro = false): CareerPolicy {
  return { id, families: FAMILIES, pace: keyWeeks, grade: work(93, 3), choose: takeStepUpOrAnyWhenOut(preferPro) };
}

/** The standard AI coach for the seat: median work (E9.1.3 case 3), step-ups only. */
export function averageWork(id = 'average_work'): CareerPolicy {
  return { id, families: FAMILIES, pace: keyWeeks, grade: work(70, 8), choose: takeStepUpOrAnyWhenOut(false) };
}

/** Perfect work until the first head job, poor work there until fired, then perfect work again and any seat back in. */
export function firedThenRehired(): CareerPolicy {
  const base = perfectWork('fired_and_rehired');
  const inFirstHead = (c: PolicyContext): boolean => c.state.seat !== null && c.state.seat.rung >= 8 && c.state.logged.firings === 0;
  return {
    ...base,
    // Played in full while it goes wrong, so the poor work is what the owner sees (S10.1.1 rule 1 would
    // otherwise draw the unplayed weeks from his earlier good record).
    pace: (c) => (inFirstHead(c) ? 'full' : 'key_weeks'),
    yearOut: () => 'visit_staffs',
    grade: (f, c, s) => {
      return inFirstHead(c) ? 35 + 5 * s.normal() : base.grade(f, c, s);
    },
  };
}

// ---------- Q4.3.1 greedy loops (each is the standard AI coach plus one loop) ----------

export function jobHopper(): CareerPolicy {
  return {
    ...averageWork('loop_job_hopping'),
    // Accept and leave jobs every season: any offer that is not a step down.
    choose: (offers) => {
      let best: Offer | null = null;
      for (const o of offers) if (o.fit !== 'step_down' && (!best || o.value > best.value)) best = o;
      return best;
    },
  };
}

export function tanker(): CareerPolicy {
  return { ...averageWork('loop_tanking'), tank: (c) => (c.state.seat?.seasonsInJob ?? 0) % 2 === 0 };
}

export function staffRaider(): CareerPolicy {
  return { ...averageWork('loop_staff_raids'), raid: () => true };
}

export function recruitFlipper(): CareerPolicy {
  return { ...averageWork('loop_recruiting_flips'), flip: () => true };
}

// ---------- scripts ----------

export const START_BOTTOM = { rung: 0, level: 'college' as const, age: 22 };

/** G-89 acceptance run 1: rung 0 to pro head coach, perfect work, preferring pro seats; stops after one pro head season. */
export function rung0ToProHead(seasons = 30): CareerScript {
  return {
    id: 'rung0_to_pro_head', policy: perfectWork('rung0_to_pro_head', true), start: START_BOTTOM, seasons,
    stopWhen: (s) => s.seat !== null && s.seat.rung === 9 && s.seat.level === 'pro' && s.seat.seasonsInJob >= 1,
  };
}

/** S10.2.1 higher start as a coordinator (age about 36). */
export const START_COORDINATOR = { rung: 7, level: 'college' as const, age: 36 };

/**
 * G-89 acceptance run 2: fired from the first head job and hired again. Starts as a coordinator (S10.2.1)
 * so the firing and the comeback both fall inside a normal career length.
 */
export function firedAndRehired(seasons = 20): CareerScript {
  return { id: 'fired_and_rehired', policy: firedThenRehired(), start: START_COORDINATOR, seasons };
}

export const tuningScript = (policy: CareerPolicy, seasons = 25): CareerScript => ({ id: policy.id, policy, start: START_BOTTOM, seasons });
