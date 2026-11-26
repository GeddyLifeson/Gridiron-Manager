// One recruiting cycle in a small world, shared by the world-simulation test and the calibration tool.
import { generateClass, generateJucoClass, recruitingWeek, interestTable, trueStanding, POSITION_GROUPS, type RecruitingState } from '../../src/recruiting/index.ts';
import { D, circleIds, context, factory, freshState, hook, makePrograms, people } from './fixtures.ts';

export interface SimResult {
  state: RecruitingState;
  metrics: Record<string, number>;
}

export function runCycle(opts: { programs?: number; seed?: number; fire?: { teamId: number; day: number } } = {}): SimResult {
  const n = opts.programs ?? 30;
  const programs = makePrograms(n);
  const { ctx, facts } = context(programs, opts.seed ?? 7);
  const state = freshState();
  const h = hook();
  const ids = circleIds();
  const req = { classYear: 2027, programs: n, topPrograms: n, favourites: programs.map((p) => ({ teamId: p.teamId, weight: p.prestige })), advisersAllowed: true };
  const hs = generateClass(state, req, factory(opts.seed ?? 3), ids, ctx.rng);
  generateJucoClass(state, req, factory((opts.seed ?? 3) + 1), ids, ctx.rng);
  const ppl = people(opts.seed ?? 11);
  let committedTopAug = 0;
  const top = hs.filter((p) => p.publicRank !== null && p.publicRank <= Math.round(400 * n / 136));
  const commitsByWeek: number[] = [];
  let decommitsAfterFire = 0; let decommitsBeforeFire = 0;
  let readOff = 0; let readN = 0;
  for (let day = D('2026-01-07'); day <= D('2027-02-03'); day += 7) {
    if (opts.fire && day >= opts.fire.day && day - 7 < opts.fire.day) facts.fire(opts.fire.teamId, opts.fire.day, 99999);
    const s = recruitingWeek(state, ctx, h, { classYear: 2027, day, aiPrograms: programs, people: ppl });
    commitsByWeek.push(s.commits);
    if (opts.fire) {
      const fired = opts.fire.teamId;
      void fired;
    }
    if (day <= D('2026-08-05') && day + 7 > D('2026-08-05')) committedTopAug = top.filter((p) => state.status[p.personId]!.status !== 'open').length;
  }
  // Staff reads against truth at the end of the summer snapshot is gone; measure now on pursued, open-at-some-point prospects.
  for (const b of Object.values(state.boards)) for (const r of Object.values(b.reads)) {
    if (r.standing === 'unknown' || r.evidence.every((e) => e.kind === 'public_list')) continue;
    readN++;
    if (r.standing !== trueStanding(state, ctx, r.prospectId, r.teamId)) readOff++;
  }
  const hsP = Object.values(state.prospects).filter((p) => p.source === 'high_school');
  const everCommitted = hsP.filter((p) => state.status[p.personId]!.status !== 'open' || state.status[p.personId]!.decommits > 0 || state.status[p.personId]!.droppedBy.length > 0);
  const commits = commitsByWeek.reduce((a, b) => a + b, 0);
  const decommits = hsP.reduce((a, p) => a + state.status[p.personId]!.decommits, 0);
  const drops = hsP.reduce((a, p) => a + state.status[p.personId]!.droppedBy.length, 0);
  const signed = Object.values(state.prospects).filter((p) => state.status[p.personId]!.status === 'signed');
  const signedHs = signed.filter((p) => p.source === 'high_school');
  const topTeams = new Set(programs.filter((p) => p.tier === 'top').map((p) => p.teamId));
  const topSignees = signed.filter((p) => topTeams.has(state.status[p.personId]!.teamId!)).length;
  const topOffers = state.offers.filter((o) => topTeams.has(o.teamId)).length;
  void decommitsAfterFire; void decommitsBeforeFire; void interestTable; void POSITION_GROUPS;
  const metrics = {
    prospects: hsP.length,
    five: hsP.filter((p) => p.publicStars === 5).length,
    four: hsP.filter((p) => p.publicStars === 4).length,
    topListed: top.length,
    topCommittedAugShare: committedTopAug / Math.max(1, top.length),
    commits, decommits, drops,
    decommitShare: decommits / Math.max(1, commits),
    dropShare: drops / Math.max(1, commits),
    everCommitted: everCommitted.length,
    signed: signed.length, signedHs: signedHs.length,
    earlyShare: signedHs.filter((p) => state.status[p.personId]!.signedEarly).length / Math.max(1, signedHs.length),
    jucoShare: (signed.length - signedHs.length) / Math.max(1, signed.length),
    topOffersPerSignee: topOffers / Math.max(1, topSignees),
    readOffShare: readOff / Math.max(1, readN),
    violations: state.violations.length,
    perProgramSigned: signed.length / n,
  };
  return { state, metrics };
}
