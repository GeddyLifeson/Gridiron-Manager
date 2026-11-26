// The decision bar (I5.1.1, I5.1.2, O2.4.2, O2.4.3, O2.4.4, O2.5.3). One head coach decision at a time,
// in rule order (penalty first), with its real-time limit, what happens at zero, the user's own chart cell,
// the analyst's line once he has said it, and the hold-to-confirm guard on rare irreversible keys.
// Options are the engine's legal list exactly; nothing here decides what is legal.
import { param } from './params.ts';
import type {
  ChartInput, DecisionBarView, DecisionKind, DecisionOptionInput, GameManagementInputs, LiveGameInput, PendingDecision,
} from './types.ts';

/** Rule order when decisions are pending at once (I5.1.1 edge case: penalty first). */
export const RULE_ORDER: readonly DecisionKind[] = ['penalty', 'runoff', 'challenge', 'fourth_down', 'try', 'kickoff', 'overtime_toss', 'coin_toss', 'kneel'];

/** Kinds that run on the play clock (I5.1.1: fourth down and tries run on the play clock). */
const ON_PLAY_CLOCK: ReadonlySet<DecisionKind> = new Set(['fourth_down', 'try', 'kickoff', 'kneel']);

export function sortByRule(pending: readonly PendingDecision[]): PendingDecision[] {
  return [...pending].sort((a, b) => RULE_ORDER.indexOf(a.kind) - RULE_ORDER.indexOf(b.kind) || a.openedAtS - b.openedAtS || (a.id < b.id ? -1 : 1));
}

const clamp0 = (v: number) => (v > 0 ? v : 0);

/** Seconds left to answer (I5.1.1). Always real time: there is no slower mode in a game (I2.1.2). */
export function secondsLeft(d: PendingDecision, live: LiveGameInput, challengeWindowS: number | null): number {
  const playClock = live.playClockTenths / 10;
  const elapsed = live.realTimeS - d.openedAtS;
  if (ON_PLAY_CLOCK.has(d.kind)) return clamp0(playClock);
  if (d.kind === 'penalty' || d.kind === 'runoff') return clamp0(param('game_management.penalty_answer_s') - elapsed);
  if (d.kind === 'challenge') return clamp0(challengeWindowS ?? playClock);
  return clamp0(param('game_management.toss_answer_s') - elapsed);
}

const has = (opts: readonly DecisionOptionInput[], id: string) => opts.some((o) => o.id === id);

/**
 * What happens when the timer runs out (I5.1.1): the standing instruction, else the conservative default:
 * punt or kick, kick the extra point, accept the yardage, no challenge. Where the engine tags an option as
 * the conservative one, that tag wins; kinds the leaf does not name take the first legal option (A-G61-4),
 * except the kneel offer, which is never automatic (O2.4.4).
 */
export function onExpiry(d: PendingDecision, inputs: Pick<GameManagementInputs, 'standing' | 'staff' | 'live'>): { optionId: string; by: 'standing_rule' | 'default' } {
  const opts = d.options;
  const rule = inputs.standing[d.kind];
  if (rule !== undefined && has(opts, rule)) return { optionId: rule, by: 'standing_rule' };
  const tagged = opts.find((o) => o.conservative);
  if (tagged) return { optionId: tagged.id, by: 'default' };
  const pick = (id: string) => (has(opts, id) ? id : null);
  let id: string | null = null;
  switch (d.kind) {
    case 'fourth_down': {
      const range = inputs.staff.fgRangeYardsToGoal, ytg = inputs.live.yardsToGoalYd;
      id = range !== null && ytg !== null && ytg <= range ? pick('field_goal') ?? pick('punt') : pick('punt') ?? pick('field_goal');
      break;
    }
    case 'try': id = pick('kick'); break;
    case 'challenge': id = pick('let_go'); break;
    case 'kneel': id = pick('decline'); break;
    default: id = null;
  }
  return { optionId: id ?? opts[0]!.id, by: 'default' };
}

/** The user's own chart cell for this situation (G7, N2.4.2 via G-71), or null when none was built. */
export function chartLine(d: PendingDecision, live: LiveGameInput, chart: ChartInput | null): DecisionBarView['chart'] {
  if (!chart) return null;
  if (d.kind === 'fourth_down' && chart.cells && chart.cells.length > 0 && live.yardsToGoalYd !== null && live.distanceYd !== null) {
    const ytg = live.yardsToGoalYd, dist = live.distanceYd;
    let best = chart.cells[0]!, bestKey = Infinity;
    for (const c of chart.cells) {
      const key = Math.abs(c.distanceYd - dist) * 1000 + Math.abs(c.yardsToGoalYd - ytg);
      if (key < bestKey) { best = c; bestKey = key; }
    }
    return { option: best.approved, coachsCall: best.coachsCall, mark: best.mark };
  }
  if (d.kind === 'try' && chart.twoPoint && chart.twoPoint.length > 0) {
    const diff = live.score[live.ownSide] - live.score[1 - live.ownSide as 0 | 1];
    const rows = chart.twoPoint.filter((r) => r.scoreDiffBeforeTry === diff);
    if (rows.length === 0) return null;
    let best = rows[0]!;
    for (const r of rows) if (Math.abs(r.gameSecondsLeft - live.gameSecondsLeft) < Math.abs(best.gameSecondsLeft - live.gameSecondsLeft)) best = r;
    return { option: best.choice, coachsCall: best.coachsCall, mark: null };
  }
  return null;
}

/** Hold-to-confirm on rare irreversible keys (O2.5.3). Certified games use the full list for every user. */
export function guarded(d: PendingDecision, o: DecisionOptionInput, inputs: Pick<GameManagementInputs, 'coach' | 'live'>): boolean {
  const setting = inputs.coach.certified ? 'on' : inputs.coach.guards;
  if (setting === 'off') return false;
  if (inputs.live.playClockTenths / 10 < param('game_management.guard_min_play_clock_s')) return false;
  const challenge = d.kind === 'challenge' && o.id !== 'let_go';
  if (setting === 'minimal') return challenge; // A-G61-3: "minimal" keeps only the challenge flag
  const ownTerritoryGo = d.kind === 'fourth_down' && o.id === 'go' && inputs.live.yardsToGoalYd !== null && inputs.live.yardsToGoalYd > inputs.live.fieldLengthYd / 2;
  return challenge || ownTerritoryGo || (d.kind === 'penalty' && o.declines === true);
}

export function buildDecisionBar(inputs: GameManagementInputs): DecisionBarView | null {
  const seat = inputs.coach.seat;
  if (seat !== 'head_coach' && seat !== 'advisor') return null; // I5.1.1 by rung: below head coach no bar, the advisor recommends
  const queue = sortByRule(inputs.pending);
  const d = queue[0];
  if (!d || d.options.length === 0) return null;
  const { live, staff, coach } = inputs;
  const adv = staff.advisor && staff.advisor.decisionId === d.id ? staff.advisor : null;
  // The analyst speaks after his delay; a tired coach takes it in later still (E7.4.2 via G-53).
  const advisorAt = adv ? d.openedAtS + adv.delayS + coach.infoDelayS : null;
  const advisorHeard = advisorAt !== null && live.realTimeS >= advisorAt;
  return {
    id: d.id,
    kind: d.kind,
    mode: seat === 'head_coach' ? 'decide' : 'recommend',
    options: d.options.map((o, i) => ({ id: o.id, labelId: o.labelId, key: String(i + 1), result: o.result ?? null, guarded: guarded(d, o, inputs) })),
    secondsLeft: secondsLeft(d, live, inputs.controls.challenge.windowS),
    onExpiry: onExpiry(d, inputs),
    chart: chartLine(d, live, inputs.chart),
    advisor: adv && advisorHeard ? { optionId: adv.optionId, marginWp: adv.marginWp, breakEven: adv.breakEven, estimate: adv.estimate, close: adv.close } : null,
    advisorDueInS: advisorAt !== null && !advisorHeard ? advisorAt - live.realTimeS : null,
    fgRangeYardsToGoal: d.kind === 'fourth_down' ? staff.fgRangeYardsToGoal : null,
    noticeOnly: d.noticeOnly === true,
    queued: queue.length - 1,
    holdS: param('game_management.guard_hold_s'),
  };
}
