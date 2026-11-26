// Design constants of the fit-based interview (Marlon 2026-11-26 14:26: interviews have no right or
// wrong answers; candidates answer what they believe and are hired when that fits the people hiring).
// Every value is a design starting value (basis "assumption", leaf named). None is a real-world fact:
// what real interviews cover sits in facts.json with computed status.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [name: string, value: number, min: number, max: number, unit: string, leaf: string];

export const MODULE = 'career.interviews';

const ROWS: readonly Row[] = [
  // Beliefs drawn from the X1 block: how much a trait moves a stance, and the person's own spread.
  ['belief.traitWeight', 0.6, 0, 1, 'ratio', 'L4.2.2'],
  ['belief.ownSd', 0.45, 0, 2, 'stance units', 'L4.2.2'],
  // Importance: how much a panel member cares about a stance grows with how strongly he holds it.
  ['care.base', 0.35, 0, 1, 'ratio', 'E2.3.2'],
  ['care.perConviction', 0.65, 0, 2, 'ratio', 'E2.3.2'],
  // E2.3.2 "opposite of the coach just fired": share by which a fired head coach's stance pushes the appointer's want the other way.
  ['opposite.pull', 0.5, 0, 1, 'ratio', 'E2.3.2'],
  // Panel: who sits in. The head coach joins assistants' interviews from this rung up; the lead interviewer's voice counts double.
  ['panel.headSitsInFromRung', 5, 0, 9, 'rung', 'L4.2.2'],
  ['panel.leadWeight', 2, 0, 10, 'ratio', 'L4.2.2'],
  // Questions per interview by rung band (same slate for every candidate of one opening).
  ['slate.entry', 4, 1, 20, 'count', 'S6.4.1'],
  ['slate.assistant', 6, 1, 20, 'count', 'S6.4.1'],
  ['slate.coordinator', 8, 1, 20, 'count', 'S6.4.1'],
  ['slate.head', 10, 1, 20, 'count', 'E2.4.3'],
  // Shortlist: how many candidates of a pool get an interview.
  ['shortlist.entry', 3, 1, 30, 'count', 'S6.4.1'],
  ['shortlist.assistant', 4, 1, 30, 'count', 'S6.4.1'],
  ['shortlist.head', 6, 1, 30, 'count', 'E2.4.3'],
  // Shortlist score (before the interview): referral, record and tie.
  ['shortlist.referralWeight', 0.45, 0, 1, 'ratio', 'S6.2.1'],
  ['shortlist.recordWeight', 0.35, 0, 1, 'ratio', 'E2.3.2'],
  ['shortlist.tieWeight', 0.2, 0, 1, 'ratio', 'L4.2.3'],
  // Hire score after interviews: fit leads (Marlon 14:26), then referral, record and tie.
  // Hire score after interviews (Marlon 14:26 and 14:52): the graded work and the fit with the panel's views lead
  // equally, then referrals, record and tie. S6.4.1's 0.5/0.3/0.2 blend predates the fit ruling.
  ['hire.practicalWeight', 0.35, 0, 1, 'ratio', 'S6.4.1'],
  ['hire.fitWeight', 0.35, 0, 1, 'ratio', 'E2.3.2'],
  ['hire.referralWeight', 0.15, 0, 1, 'ratio', 'S6.2.1'],
  ['hire.recordWeight', 0.1, 0, 1, 'ratio', 'E2.3.2'],
  ['hire.tieWeight', 0.05, 0, 1, 'ratio', 'L4.2.3'],
  // Fit spreads less than graded work (measured 2026-11-26 over 800 shortlisted candidates: fit mean 0.69 sd 0.08,
  // practical sd 0.23), so it is stretched around its centre before blending, giving the two equal pull.
  ['fit.centre', 0.69, 0, 1, 'ratio', 'E2.3.2'],
  ['fit.stretch', 2.8, 1, 10, 'ratio', 'E2.3.2'],
  // Graded practical work for AI candidates (S6.4.1 "AI use"): grade = logistic(craft + noise), craft a hidden z per person.
  ['practical.noiseSd', 0.5, 0, 3, 'z', 'S6.4.1'],
  ['practical.slope', 1.2, 0.1, 5, 'per z', 'S6.4.1'],
  ['hire.noiseSd', 0.05, 0, 1, 'score units', 'E2.3.2'],
  // Referrals: a reference with no tie to the hirer still counts a little; strength of the word itself.
  ['referral.strangerShare', 0.25, 0, 1, 'ratio', 'S6.2.1'],
  ['referral.maxReferees', 3, 1, 10, 'count', 'L4.2.2'],
  // Offers: the candidate's own read of fit with the job moves his acceptance (reverse questions).
  ['accept.fitWeight', 0.3, 0, 1, 'probability', 'L4.2.3'],
  ['accept.fitNeutral', 0.6, 0, 1, 'ratio', 'L4.2.3'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'interviews.1',
  params: ROWS.map(([name, value, min, max, unit, leaf]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis: 'assumption', leaf,
    constrainedBy: `${leaf} and Marlon 2026-11-26 14:26 fit ruling (module assumption, tune against hiring outcomes)`,
    status: 'starting',
  })),
};

const VALUES = new Map(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value] as const));

/** Read one design constant by its short name; throws on an unknown name. */
export function param(name: string): number {
  const v = VALUES.get(name);
  if (v === undefined) throw new Error(`interviews: unknown parameter ${name}`);
  return v;
}

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
