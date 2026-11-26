// The scripted career runner (G-89, S10, Q4.3.1). One script, one seed, one deterministic career: each season
// the script works its duties at its pace (S10.1.1), the stand-in world turns the work into results, the
// boss and owners judge, and every offer stops the run for the script to answer (S10.1.2). The market
// formulas come through `MarketPort` (G-80). Seasons come from the stand-in model in this file until the
// world loop (G-81) can run a coach's season headless (CR-G89-3); the runner's shape does not change then.
import { stream, seedToHex, hash128Hex, canonicalBytes, type WorldSeed } from '@gm/engine-core';
import type { RandomStream } from '@gm/schema';
import { clamp, param } from './params.ts';
import { paceSeason, summaryEventCount } from './pace.ts';
import { standInMarket, type MarketPort } from './market-port.ts';
import type { CareerRun, CareerScript, CareerState, Level, Logged, Offer, RunEvent, Seat, SeasonRow } from './types.ts';

export interface RunOptions {
  readonly market?: MarketPort;
  /**
   * Q4.3.1 ablation: when false, no AI person reads the logged history. A loop whose yield does not change
   * between memory on and off is one the world does not answer.
   */
  readonly memory?: boolean;
}

const NO_LOG: Logged = { oneSeasonStays: 0, tankedSeasons: 0, raids: 0, flipSeasons: 0, firings: 0 };
const STREAM = 'career-run';

const prestigeFor = (level: Level, rung: number, s: RandomStream): number =>
  level === 'pro' ? 25 + Math.floor(s.uniform() * 16) : Math.floor(s.uniform() * (rung >= 9 ? 41 : 31));

export function initialState(script: CareerScript): CareerState {
  const st = script.start;
  const seat: Seat | null = st.rung <= 0 ? null : { rung: st.rung, level: st.level, prestige: 10, teamId: 1, roster: 0.5, seasonsInJob: 0, firstHeadJob: st.rung >= 8 };
  // Rung 0 is outside football (E2.1.1): he is unemployed but not "out" in the S7.3.1 sense.
  return {
    season: 0, age: st.age, seat, lastSeat: null, yearsOut: 0, reputation: 0.3, path: st.rung <= 0 ? 10 : 25,
    lastResults: 0.5, recordResults: 0.5, seasonsEmployed: 0, lastWork: 0.5, running: {}, logged: NO_LOG, nextTeamId: 2,
  };
}

/** Rungs a coach may be offered next (S10.3.1 floor: one rung a season; pro has no rung 8, E2.1.1). */
export function nextRungs(rung: number): readonly number[] {
  if (rung <= 0) return [1];
  if (rung === 7) return [8, 9];
  if (rung >= 9) return [];
  return [rung + 1];
}

function stepUpChance(mv: number, rung: number): number {
  const threshold = param('careerRun.offer.stepUpBase') + param('careerRun.offer.stepUpPerRung') * rung;
  return clamp(0.5 + (mv - threshold) / (2 * param('careerRun.offer.spread')), 0.01, 0.95);
}

/** The offers of one offseason. Every input is public: results, his boss's rating, regard, network, logged history. */
export function offseasonOffers(s: CareerState, market: MarketPort, memory: boolean, rs: RandomStream): Offer[] {
  const cur = s.seat;
  const outside = cur === null;
  const baseRung = cur ? cur.rung : s.lastSeat ? market.comebackRung(s.lastSeat.rung, s.yearsOut) : 0;
  const curSpot = cur ? { rung: cur.rung, prestige: cur.prestige } : null;
  const offers: Offer[] = [];
  let teamId = s.nextTeamId;
  const make = (rung: number, level: Level): Offer => {
    const prestige = prestigeFor(level, rung, rs);
    const spot = { rung, prestige };
    const roster = clamp(0.2 + 0.6 * rs.uniform(), 0, 1);
    return { rung, level, prestige, teamId: teamId++, roster, fit: market.fitLine(spot, curSpot), value: market.jobValue(rung, prestige) };
  };
  const levelFor = (rung: number): Level => {
    const was = cur?.level ?? s.lastSeat?.level ?? 'college';
    if (rung === 8) return 'college';
    if (rung < 6) return was;
    if (was === 'pro') return 'pro';
    return rs.chance(param('careerRun.offer.proShareAt7')) ? 'pro' : 'college';
  };
  const valueFor = (rung: number): number => {
    let mv = market.marketValue({
      rung, path: s.path, results: outside ? s.recordResults : s.lastResults, workRating: s.lastWork, reputation: s.reputation,
      agentReach: rung >= param('careerRun.offer.agentFrom') ? 0.5 : 0, bossTakesCredit: false,
    });
    if (s.lastSeat && outside) mv = market.valueAfterTimeOut(mv, s.yearsOut, false);
    if (memory) mv -= param('careerRun.memory.hopPenalty') * s.logged.oneSeasonStays;
    return mv;
  };
  if (outside && s.lastSeat) {
    // Back in (S7.2.1 scramble): a seat at the comeback rung or up to three rungs down, by market value at that rung.
    for (let r = baseRung; r >= Math.max(1, baseRung - 3); r--) {
      if (rs.chance(stepUpChance(valueFor(r), r - 1))) offers.push(make(r, levelFor(r)));
    }
  } else {
    for (const r of nextRungs(baseRung)) {
      const level = levelFor(r);
      if (rs.chance(stepUpChance(valueFor(r), r))) offers.push(make(r, level));
    }
    if (cur && rs.chance(param('careerRun.offer.lateralChance'))) offers.push(make(cur.rung, levelFor(cur.rung)));
  }
  return offers;
}

/** One season of results from the work (stand-in for G-81; CR-1: the coach matters more on weak rosters). */
export function seasonResults(roster: number, work: number, rs: RandomStream): number {
  const effect = param('careerRun.season.coachShare') * ((work - 70) / 30) * (1.2 - roster);
  return clamp(roster + effect + param('careerRun.season.noise') * rs.normal(), 0, 1);
}

export function runCareer(script: CareerScript, seed: WorldSeed, opts: RunOptions = {}): CareerRun {
  const market = opts.market ?? standInMarket;
  const memory = opts.memory ?? true;
  const pol = script.policy;
  let s = initialState(script);
  const rows: SeasonRow[] = [];
  const events: RunEvent[] = [];
  let yieldSum = 0;
  for (let season = 0; season < script.seasons; season++) {
    const rs = stream(seed, STREAM, [script.id, season, 'season']);
    const os = stream(seed, STREAM, [script.id, season, 'offers']);
    s = { ...s, season };
    const ctx = { state: s };
    let work = 0, simShare = 0, results = 0, fired = false, released = false;
    const acts: string[] = [];
    let logged = s.logged;
    let reputation = s.reputation;
    let path = s.path;
    let seat = s.seat;
    let running = s.running;
    if (seat) {
      const mode = script.certified ? 'full' : pol.pace(ctx);
      const paced = paceSeason(mode, pol.families, s.running, (f, st) => pol.grade(f, ctx, st), rs, { held: pol.heldWeeks?.(ctx) ?? [], certified: script.certified ?? false });
      if (mode === 'season_summary') {
        // S10.1.1: the whole season in one step with three to five decision events, each one a pause.
        const n = summaryEventCount(rs);
        for (let i = 0; i < n; i++) events.push({ season, type: 'summary_decision', simulated: false, data: { index: i } });
      }
      const sims = paced.grades.filter((g) => g.simulated);
      simShare = paced.grades.length ? sims.length / paced.grades.length : 0;
      for (const f of pol.families) {
        const fam = paced.grades.filter((g) => g.family === f);
        const simN = fam.filter((g) => g.simulated).length;
        events.push({ season, type: 'duty_family_season', simulated: simN === fam.length, data: { family: f, played: fam.length - simN, simulated: simN } });
      }
      work = paced.mean;
      running = paced.running;
      const head = seat.rung >= 8;
      const tank = head && (pol.tank?.(ctx) ?? false);
      const raid = head && (pol.raid?.(ctx) ?? false);
      const flip = seat.level === 'college' && seat.rung >= 8 && (pol.flip?.(ctx) ?? false);
      let roster = seat.roster;
      results = seasonResults(roster, work, rs);
      if (tank) { results = clamp(results - 0.25, 0, 1); acts.push('tank'); logged = { ...logged, tankedSeasons: logged.tankedSeasons + 1 }; }
      if (raid) { const keep = memory ? Math.max(0, 1 - param('careerRun.memory.raidDecay') * logged.raids) : 1; results = clamp(results + param('careerRun.loop.raidRosterGain') * keep, 0, 1); acts.push('raid'); logged = { ...logged, raids: logged.raids + 1 }; if (memory) path -= param('careerRun.memory.raidPeerHit'); }
      reputation = clamp(param('careerRun.season.reputationKeep') * reputation + (1 - param('careerRun.season.reputationKeep')) * (0.5 * results + 0.5 * work / 100), 0, 1);
      if (tank && memory) reputation = clamp(reputation - param('careerRun.memory.tankOwnerHit'), 0, 1);
      if (tank) roster += param('careerRun.loop.tankRosterGain');
      if (flip) {
        acts.push('flip');
        logged = { ...logged, flipSeasons: logged.flipSeasons + 1 };
        roster += param('careerRun.loop.flipRosterGain') - (memory ? param('careerRun.memory.flipRecruitHit') * logged.flipSeasons : 0);
      }
      path = clamp(path + param('careerRun.offer.pathGrowth') * Math.max(0, work - 50) / 20, 0, 100);
      seat = { ...seat, roster: clamp(roster, 0, 1), seasonsInJob: seat.seasonsInJob + 1 };
      events.push({ season, type: 'season', simulated: simShare === 1, data: { rung: seat.rung, level: seat.level, work: round3(work), results: round3(results), simulatedShare: round3(simShare) } });
      // E4: owners judge a head coach on results against the roster they see; owners notice tanking (L5.2.6).
      if (head && seat.seasonsInJob > param('careerRun.season.graceSeasons')) {
        const k = param('careerRun.season.expectRosterShare');
        const shortfall = k * seat.roster + (1 - k) * 0.5 - results - param('careerRun.season.firingGap');
        let p = clamp(shortfall * param('careerRun.season.firingSlope'), 0, 0.9);
        if (tank && memory) p = clamp(p + param('careerRun.memory.tankOwnerHit'), 0, 0.95);
        if (rs.chance(p)) fired = true;
      }
      if (fired) {
        const r = market.firingRegard({ firstHeadJob: seat.firstHeadJob, seasonsInJob: seat.seasonsInJob, rosterQuality: seat.roster, forCause: false });
        reputation = clamp(reputation + r.owners / 100, 0, 1);
        path = clamp(path + r.peers, 0, 100);
        logged = { ...logged, firings: logged.firings + 1 };
        events.push({ season, type: 'fired', simulated: false, data: { rung: seat.rung, peers: r.peers, owners: r.owners, payContinues: r.payContinues } });
      } else if (!head && rs.chance(param('careerRun.season.headTurnover') * param('careerRun.season.cascadeShare'))) {
        released = true;
        events.push({ season, type: 'released', simulated: false, data: { rung: seat.rung } });
      }
    } else if (!s.lastSeat) {
      // Rung 0, outside football (E2.1.1, S2): volunteering, clinics and high school work build a first path.
      path = clamp(path + param('careerRun.offer.outsidePathGrowth'), 0, 100);
    } else {
      // A year out (E2.7.2, S7.3.1): standing with coaches slips unless he visits staffs or works in public.
      const visits = (pol.yearOut?.(ctx) ?? 'rest') === 'visit_staffs';
      path = clamp(path - (visits ? 0 : 12 * param('careerRun.offer.monthlyPathLoss')), 0, 100);
    }
    const lost = fired || released;
    const held: Seat | null = lost ? null : seat;
    const lastSeat = lost ? seat : s.lastSeat;
    const yearsOut = held ? 0 : s.lastSeat || lost ? s.yearsOut + (s.seat ? 0 : 1) : 0;
    let mid: CareerState = { ...s, seat: held, lastSeat, yearsOut, reputation, path, logged, lastResults: s.seat ? results : s.lastResults, recordResults: s.seat ? (s.recordResults * s.seasonsEmployed + results) / (s.seasonsEmployed + 1) : s.recordResults, seasonsEmployed: s.seasonsEmployed + (s.seat ? 1 : 0), lastWork: s.seat ? work / 100 : s.lastWork };
    // Offseason (S10.1.2): every offer stops the run.
    const offers = offseasonOffers(mid, market, memory, os);
    mid = { ...mid, nextTeamId: mid.nextTeamId + offers.length };
    for (const o of offers) events.push({ season, type: 'offer_pause', simulated: false, data: { rung: o.rung, level: o.level, fit: o.fit, value: o.value } });
    const pick = offers.length ? pol.choose(offers, { state: mid }) : null;
    let moved: string | null = null;
    if (pick) {
      // Q4.3.1 job hopping as hirers read it: leaving after one season for a seat that is not a rung up.
      const leftAfterOne = mid.seat !== null && mid.seat.seasonsInJob <= 1 && pick.rung <= mid.seat.rung;
      if (leftAfterOne) mid = { ...mid, logged: { ...mid.logged, oneSeasonStays: mid.logged.oneSeasonStays + 1 } };
      const everHead = (mid.seat?.rung ?? 0) >= 8 || (mid.lastSeat?.rung ?? 0) >= 8;
      mid = { ...mid, seat: { rung: pick.rung, level: pick.level, prestige: pick.prestige, teamId: pick.teamId, roster: pick.roster, seasonsInJob: 0, firstHeadJob: pick.rung >= 8 && !everHead }, yearsOut: 0 };
      moved = `${pick.level}:${pick.rung}:${pick.fit}`;
      events.push({ season, type: 'hired', simulated: false, data: { rung: pick.rung, level: pick.level, fit: pick.fit } });
    }
    const rowSeat = s.seat;
    if (rowSeat) yieldSum += market.jobValue(rowSeat.rung, rowSeat.prestige);
    rows.push({
      season, age: s.age, employed: rowSeat !== null, rung: rowSeat?.rung ?? 0, level: rowSeat?.level ?? null, prestige: rowSeat?.prestige ?? 0,
      work: round3(work), simulatedShare: round3(simShare), results: round3(results), fired, released, offers: offers.length, moved, loopActs: acts,
    });
    s = { ...mid, age: s.age + 1, running };
    if (script.stopWhen?.(s)) break;
  }
  const body = { rows, events };
  return { scriptId: script.id, seedHex: seedToHex(seed), rows, events, final: s, yield: round3(yieldSum), hash: hash128Hex(canonicalBytes(body)) };
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000;
