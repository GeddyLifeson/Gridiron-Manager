// The play-by-play row (J11.9.1). Built from the same reading of the play record as the credit rows,
// so a box score cannot disagree with it (P3.1.1). Everything in the row is a called value or
// something a scout could chart from film.
import { Contract } from '@gm/engine-core';
import { readPlay, enforcedPenalties, wholeYardsBetween, type PlayFacts, type StatsDeps } from './facts.ts';

type PlayRecord = Contract.PlayRecord;
type PlayByPlayRow = Contract.PlayByPlayRow;

/** Call kinds that are a called pass (J15.3.2 "dropback share"). An option play or a trick play counts when a pass, a sack or a scramble came of it. */
const CALLED_PASS = new Set<string>(['dropback_pass', 'quick_pass', 'play_action', 'movement_pass', 'screen']);

export type TextParamType = 'person' | 'yards' | 'count';

/** One text template (P4.6.1): key, default English text, and the typed parameters it needs. Wording belongs to content; these are the keys the engine emits and a plain default for logs. */
export interface TextTemplate {
  readonly key: string;
  readonly default: string;
  readonly params: Readonly<Record<string, TextParamType>>;
}

export const PLAY_TEXT_TEMPLATES: readonly TextTemplate[] = [
  { key: 'pbp.no_play', default: 'No play.', params: {} },
  { key: 'pbp.run', default: '{carrier} runs for {yards}.', params: { carrier: 'person', yards: 'yards' } },
  { key: 'pbp.scramble', default: '{carrier} scrambles for {yards}.', params: { carrier: 'person', yards: 'yards' } },
  { key: 'pbp.kneel', default: '{carrier} kneels for {yards}.', params: { carrier: 'person', yards: 'yards' } },
  { key: 'pbp.spike', default: '{passer} spikes the ball.', params: { passer: 'person' } },
  { key: 'pbp.pass_complete', default: '{passer} pass complete to {receiver} for {yards}.', params: { passer: 'person', receiver: 'person', yards: 'yards' } },
  { key: 'pbp.pass_incomplete', default: '{passer} pass incomplete.', params: { passer: 'person' } },
  { key: 'pbp.pass_incomplete_target', default: '{passer} pass incomplete, intended for {target}.', params: { passer: 'person', target: 'person' } },
  { key: 'pbp.sack', default: '{passer} sacked for {yards}.', params: { passer: 'person', yards: 'yards' } },
  { key: 'pbp.interception', default: '{passer} pass intercepted by {defender}, returned for {returnYards}.', params: { passer: 'person', defender: 'person', returnYards: 'yards' } },
  { key: 'pbp.fumble_lost', default: '{fumbler} fumbles, recovered by {defender}.', params: { fumbler: 'person', defender: 'person' } },
  { key: 'pbp.punt', default: '{kicker} punts {distance}.', params: { kicker: 'person', distance: 'yards' } },
  { key: 'pbp.punt_returned', default: '{kicker} punts {distance}, {returner} returns for {returnYards}.', params: { kicker: 'person', distance: 'yards', returner: 'person', returnYards: 'yards' } },
  { key: 'pbp.field_goal_good', default: '{kicker} {distance} field goal is good.', params: { kicker: 'person', distance: 'yards' } },
  { key: 'pbp.field_goal_missed', default: '{kicker} {distance} field goal is no good.', params: { kicker: 'person', distance: 'yards' } },
  { key: 'pbp.try_kick_good', default: '{kicker} extra point is good.', params: { kicker: 'person' } },
  { key: 'pbp.try_kick_failed', default: '{kicker} extra point is no good.', params: { kicker: 'person' } },
  { key: 'pbp.two_point_good', default: 'Two-point try is good.', params: {} },
  { key: 'pbp.two_point_failed', default: 'Two-point try fails.', params: {} },
  { key: 'pbp.kickoff', default: '{kicker} kicks off {distance}.', params: { kicker: 'person', distance: 'yards' } },
  { key: 'pbp.kickoff_returned', default: '{kicker} kicks off {distance}, {returner} returns for {returnYards}.', params: { kicker: 'person', distance: 'yards', returner: 'person', returnYards: 'yards' } },
  { key: 'pbp.safety_kick', default: 'Safety kick.', params: {} },
  { key: 'pbp.play', default: 'Play.', params: {} },
];

const TEMPLATE_BY_KEY = new Map(PLAY_TEXT_TEMPLATES.map((t) => [t.key, t]));

function playText(f: PlayFacts): { textKey: string; textParams: Record<string, string | number> } {
  const params: Record<string, string | number> = {};
  const person = (name: string, id: number | null): boolean => {
    if (id === null) return false;
    params[name] = id;
    return true;
  };
  const pick = (key: string, ok: boolean) => (ok ? { textKey: key, textParams: params } : { textKey: 'pbp.play', textParams: {} });
  if (!f.counts) return { textKey: 'pbp.no_play', textParams: {} };
  const rt = f.record.final.resultType;

  if (f.punt) {
    params.distance = f.punt.gross;
    const ok = person('kicker', f.punt.punterId);
    if (f.kickReturn && f.kickReturn.returned) {
      params.returnYards = f.kickReturn.yards;
      return pick('pbp.punt_returned', ok && person('returner', f.kickReturn.returnerId));
    }
    return pick('pbp.punt', ok);
  }
  if (f.placeKick) {
    const ok = person('kicker', f.placeKick.kickerId);
    if (f.placeKick.kind === 'try_kick') return pick(f.placeKick.good ? 'pbp.try_kick_good' : 'pbp.try_kick_failed', ok);
    params.distance = f.placeKick.distanceYd ?? 0;
    return pick(f.placeKick.good ? 'pbp.field_goal_good' : 'pbp.field_goal_missed', ok);
  }
  if (f.kickoff) {
    params.distance = f.kickoff.distanceYd;
    const ok = person('kicker', f.kickoff.kickerId);
    if (f.kickReturn && f.kickReturn.returned) {
      params.returnYards = f.kickReturn.yards;
      return pick('pbp.kickoff_returned', ok && person('returner', f.kickReturn.returnerId));
    }
    return pick('pbp.kickoff', ok);
  }
  // A fair-catch kick is a place kick and reads as one above; the only kick left here is a safety kick.
  if (f.kick) return { textKey: 'pbp.safety_kick', textParams: {} };
  if (f.isTry) return { textKey: rt === 'try_good' ? 'pbp.two_point_good' : 'pbp.two_point_failed', textParams: {} };

  if (rt === 'fumble_lost') {
    const lost = f.fumbles.find((x) => x.credited && x.lost && x.side === f.offense);
    return pick('pbp.fumble_lost', lost !== undefined && person('fumbler', lost.playerId) && person('defender', lost.recoveredById));
  }
  switch (f.base) {
    case 'run':
      params.yards = f.yards;
      return pick(f.scramble ? 'pbp.scramble' : 'pbp.run', person('carrier', f.carrierId));
    case 'kneel':
      params.yards = f.yards;
      return pick('pbp.kneel', person('carrier', f.carrierId));
    case 'spike':
      return pick('pbp.spike', person('passer', f.passerId));
    case 'completion':
      params.yards = f.yards;
      return pick('pbp.pass_complete', person('passer', f.passerId) && person('receiver', f.receiverId));
    case 'incompletion': {
      const ok = person('passer', f.passerId);
      if (f.targetId !== null) return pick('pbp.pass_incomplete_target', ok && person('target', f.targetId));
      return pick('pbp.pass_incomplete', ok);
    }
    case 'sack':
      params.yards = f.yards;
      return pick('pbp.sack', person('passer', f.passerId));
    case 'interception':
      params.returnYards = f.interceptionReturnYards;
      return pick('pbp.interception', person('passer', f.passerId) && person('defender', f.interceptorId));
    case 'none':
      return { textKey: 'pbp.play', textParams: {} };
  }
}

export function playByPlayFromFacts(f: PlayFacts, next: PlayRecord | null, deps: StatsDeps): PlayByPlayRow {
  const g = deps.geometry;
  const { record, offense, defense } = f;
  const { situation, calls, final } = record;
  const snapping = calls.snapping;
  const opposing = calls.opposing;
  const offenseCall = snapping.unit === 'offense' ? snapping : null;
  const defenseCall = opposing.unit === 'defense' ? opposing : null;
  const dir = situation.attackDir;

  const passBase = f.base === 'completion' || f.base === 'incompletion' || f.base === 'spike' || f.base === 'interception';
  const calledPass = offenseCall !== null && CALLED_PASS.has(offenseCall.kind);
  const dropback = calledPass || f.scramble || passBase || f.base === 'sack';

  let passLocation: PlayByPlayRow['passLocation'] = null;
  if (passBase && f.base !== 'spike' && f.release) {
    // Play frame: positive is the offense's left (contract decision D-11).
    const lateral = (f.release.landingSpot.y - situation.ballY) * dir;
    const half = deps.params.num('stats.passLocation.middleHalfWidthYd');
    passLocation = lateral > half ? 'left' : lateral < -half ? 'right' : 'middle';
  }
  const runLocation = f.base === 'run' && !f.scramble && offenseCall ? offenseCall.runDirection : null;

  const air = passBase && f.base !== 'spike' && f.release ? Math.round(f.release.airYd) + 0 : null;
  const yardsGained = f.counts ? wholeYardsBetween(g, situation.ballX, situation.ballX + final.yardsGained * dir, dir) : 0;

  let snapToSnapTenths: number | null = null;
  if (next && next.situation.driveNumber === situation.driveNumber && next.situation.period === situation.period) {
    const used = situation.clockTenths - next.situation.clockTenths;
    if (used >= 0) snapToSnapTenths = used;
  }

  const firstDown = f.counts && (f.firstDownEarned
    || (record.seriesAfter.firstDownAwarded && record.seriesAfter.possession === offense && !final.changeOfPossession));
  const text = playText(f);

  return {
    gameId: record.gameId,
    playIndex: record.index,
    driveNumber: situation.driveNumber,
    period: situation.period,
    clockTenths: situation.clockTenths,
    offense,
    playKind: situation.playKind,
    down: situation.down,
    distanceYd: situation.distanceYd,
    ballOnYd: Contract.yardsFromOwnGoal(g, situation.ballX, dir),
    yardsToGoalYd: Contract.yardsToGoal(g, situation.ballX, dir),
    goalToGo: situation.goalToGo,
    scoreOffense: situation.score[offense],
    scoreDefense: situation.score[defense],
    resultType: final.resultType,
    noPlay: !f.counts,
    offenseKind: offenseCall ? offenseCall.kind : null,
    kickKind: snapping.unit === 'kick' ? snapping.kickKind : null,
    dropback,
    scramble: f.scramble,
    shotgun: offenseCall ? offenseCall.shotgun : false,
    noHuddle: offenseCall ? offenseCall.tempo !== 'huddle' : false,
    playAction: offenseCall ? offenseCall.kind === 'play_action' : false,
    motion: offenseCall ? offenseCall.motionId !== null : false,
    personnelCode: offenseCall ? offenseCall.personnelCode : null,
    yardsGained,
    airYd: air,
    yardsAfterCatch: f.base === 'completion' && air !== null ? f.yards - air : null,
    passLocation,
    runLocation,
    rushers: defenseCall ? defenseCall.rushers : null,
    boxCount: defenseCall ? defenseCall.boxCount : null,
    coverageFamily: defenseCall ? defenseCall.coverageFamily : null,
    pressure: f.pressure,
    sack: f.base === 'sack',
    interception: f.base === 'interception',
    fumbleLost: f.counts && final.resultType === 'fumble_lost',
    touchdown: f.counts && final.score !== null && final.score.type === 'touchdown',
    firstDown,
    kickDistanceYd: f.placeKick ? f.placeKick.distanceYd : f.punt ? f.punt.gross : f.kickoff ? f.kickoff.distanceYd : null,
    penalties: enforcedPenalties(record).map((p) => ({ foulId: p.foulId, side: p.side, yards: p.yards })),
    snapToSnapTenths,
    epBefore: null,
    epAfter: null,
    textKey: text.textKey,
    textParams: text.textParams,
  };
}

export function playByPlay(record: PlayRecord, next: PlayRecord | null, deps: StatsDeps): PlayByPlayRow {
  return playByPlayFromFacts(readPlay(record, deps), next, deps);
}

/**
 * Plain text of one row from the default templates, for logs and headless runs. The game's own text
 * comes from the content templates through the interface (P4.6.1); this only fills the defaults.
 */
export function renderPlayText(row: Pick<PlayByPlayRow, 'textKey' | 'textParams'>, names: Contract.RosterNames): string {
  const template = TEMPLATE_BY_KEY.get(row.textKey);
  if (!template) throw new Error(`no play text template ${row.textKey}`);
  let text = template.default;
  for (const [name, type] of Object.entries(template.params)) {
    const value = row.textParams[name];
    if (value === undefined) throw new Error(`play text ${row.textKey} is missing parameter ${name}`);
    const shown = type === 'person' ? names.playerName(Number(value)) : type === 'yards' ? `${value} yd` : String(value);
    text = text.split(`{${name}}`).join(shown);
  }
  return text;
}
