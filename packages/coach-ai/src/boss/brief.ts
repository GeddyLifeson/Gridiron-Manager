// S4.1.1 the boss as the user meets him: the one-page brief on arrival, and the "what I know about my
// boss" panel that fills in from events. Hidden facets are never shown as numbers: an event reveals a
// facet as words, from what the boss just did (late report shows standards, a challenge shows ego).
import { B, share, zShare } from './params.ts';
import type { Boss, BossFacets } from './types.ts';

/**
 * S4.1.1 edge case: with the people pack loaded, a real coach's personality facets read neutral
 * (ego, loyalty_to_staff, hours_culture). Football fields come from data. Applied once when the boss
 * record is built; every function here reads `boss.facets` as already neutralised.
 */
export function neutralForImported(facets: BossFacets, imported: boolean): BossFacets {
  if (!imported) return facets;
  const mid = B('facet_max') / 2;
  return { ...facets, ego: mid, loyaltyToStaff: mid, hoursCulture: mid };
}

export interface BossBrief {
  readonly bossId: number;
  /** System family and terminology he must work in (S4.1.1). Content ids (F14, G4). */
  readonly systemFamily: string;
  readonly terminology: string;
  /** Two or three stated priorities: the sections or families he weights most, heaviest first. */
  readonly priorities: readonly string[];
  /** How late work may be before he treats it as late, hours. Strict bosses allow none. */
  readonly deadlineSlackHours: number;
}


export function briefFor(boss: Boss): BossBrief {
  const sys = boss.profile.system;
  const family = sys.primarySide === 'defense' ? sys.defenseFamily : sys.primarySide === 'specialTeams' ? sys.specialTeamsFamily : sys.offenseFamily;
  const focus = Object.entries(boss.facets.detailFocus).filter(([, w]) => w > 1).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const n = focus.length >= 3 && focus[2]![1] >= focus[0]![1] / 2 ? 3 : 2;
  return {
    bossId: boss.personId,
    systemFamily: family,
    terminology: sys.playbookId ?? family,
    priorities: focus.slice(0, n).map(([k]) => k),
    deadlineSlackHours: B('deadline_slack_max_hours') * (1 - share(boss.facets.standards)),
  };
}

export type RevealEvent = 'late_report' | 'challenge' | 'credit_moment' | 'long_week' | 'asked_why';
export type RevealedFacet = 'standards' | 'ego' | 'loyaltyToStaff' | 'hoursCulture' | 'teaching';
export type Band = 'low' | 'middle' | 'high';

const EVENT_FACET: Readonly<Record<RevealEvent, RevealedFacet>> = {
  late_report: 'standards', challenge: 'ego', credit_moment: 'loyaltyToStaff', long_week: 'hoursCulture', asked_why: 'teaching',
};

/** Words for what he did, by facet and band. The panel shows these, never a number. */
const WORDS: Readonly<Record<RevealedFacet, Readonly<Record<Band, string>>>> = {
  standards: { low: 'let a late report slide', middle: 'noted the late report', high: 'was angry about a late report' },
  ego: { low: 'took the challenge and thanked you', middle: 'heard the challenge out', high: 'took the challenge personally' },
  loyaltyToStaff: { low: 'took the credit himself', middle: 'credited "the staff"', high: 'named his assistants in public' },
  hoursCulture: { low: 'sent the staff home early', middle: 'kept normal hours', high: 'expects the lights on past midnight' },
  teaching: { low: 'would not explain the decision', middle: 'explained it briefly', high: 'walked you through his reasons' },
};

function band(v: number): Band {
  return v < 1 / 3 ? 'low' : v < 2 / 3 ? 'middle' : 'high';
}

export interface Observation { readonly facet: RevealedFacet; readonly band: Band; readonly words: string; readonly day: number }

/** What the event shows about him. Teaching is a K2 behaviour z (E9.3.1); the rest are facets. */
export function reveal(boss: Boss, event: RevealEvent, day: number): Observation {
  const facet = EVENT_FACET[event];
  const v = facet === 'teaching' ? zShare(boss.profile.behavior.teaching) : share(boss.facets[facet]);
  const b = band(v);
  return { facet, band: b, words: WORDS[facet][b], day };
}

/** The panel: latest observation per facet, plus how many times he has seen it. */
export type KnownAboutBoss = Readonly<Partial<Record<RevealedFacet, { readonly last: Observation; readonly seen: number }>>>;

export function learn(panel: KnownAboutBoss, o: Observation): KnownAboutBoss {
  const prev = panel[o.facet];
  return { ...panel, [o.facet]: { last: o, seen: (prev?.seen ?? 0) + 1 } };
}
