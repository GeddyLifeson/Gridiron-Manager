// The game-day frame around the snaps (G-62; I1, I10): the pregame timeline from the first deadline to kickoff,
// the halftime session, and the postgame media session, through the career gameday functions the frame screens
// name. The rule values come from the rule set and the league file by key. `GameDayRules` has six values with
// no rule key yet; the playtest uses the values the gameday tests use and reports the gap.
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameday } from '@gm/career';
import { resolveRuleSet } from '@gm/rules-data';
import { OWNERS } from '../owners.ts';
import type { Recorder } from '../recorder.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
type Row = { key: string; value: number | boolean };

function leagueFile(level: 'pro' | 'college'): Map<string, number | boolean> {
  const f = join(ROOT, 'packages/rules-data/data/league', level === 'pro' ? 'proleague_2026.json' : 'collegeleague_2026.json');
  return new Map((JSON.parse(readFileSync(f, 'utf8')) as { values: Row[] }).values.map((r) => [r.key, r.value]));
}

/** Values with no rule key (the gameday tests type them in). Reported as a finding every career. */
const UNKEYED = { radioDesignated: 3, tossMinutesBefore: 3, fieldPresenceMin: 10, lateFieldPenaltyYd: 15, endZoneDepthFt: 30, officiatingReviewMaxPlays: 9 } as const;

export function gameDayRules(rec: Recorder, ruleSetId: string): gameday.GameDayRules {
  const rs = resolveRuleSet(ruleSetId);
  const pro = rs.level === 'pro';
  const lg = leagueFile(pro ? 'pro' : 'college');
  const lnum = (k: string): number | null => { const v = lg.get(k); return typeof v === 'number' ? v : null; };
  rec.add('missing', 'game_frame', 'rules.unkeyed_values', `GameDayRules needs ${Object.keys(UNKEYED).length} values with no rule key (${Object.keys(UNKEYED).join(', ')}), and rules-data has no resolver for the league files; no production code builds GameDayRules.`, `${OWNERS.gameFrame}; keys via ${OWNERS.schemaIntegrator}`);
  return {
    activeLimit: pro ? lnum('roster.active_limit') : null,
    activeLimitShortLine: pro ? lnum('roster.active_limit_short_line') : null,
    activeMinLinemen: pro ? lnum('roster.active_min_linemen') : null,
    elevationsMaxPerGame: pro ? lnum('roster.elevations_max_per_game') ?? 0 : 0,
    reportDeadlineMin: pro ? lnum('roster.inactives_due_minutes_before_kickoff') : null,
    emergencyQbActiveQbs: pro ? lnum('roster.emergency_qb_active_qbs') ?? 0 : 0,
    emergencyQbFromPracticeSquad: pro ? lg.get('roster.emergency_qb_from_practice_squad') === true : false,
    radioAllowed: rs.bool('comm.c2p_allowed'),
    radioOnFieldOffense: rs.num('comm.c2p_receivers_offense'),
    radioOnFieldDefense: rs.num('comm.c2p_receivers_defense'),
    radioDesignatedOffense: pro ? UNKEYED.radioDesignated : 0,
    radioDesignatedDefense: pro ? UNKEYED.radioDesignated : 0,
    captainsMax: rs.num('toss.captains_max'),
    deferAllowed: rs.bool('toss.defer_allowed'),
    tossMinutesBefore: UNKEYED.tossMinutesBefore,
    fieldPresenceMin: pro ? UNKEYED.fieldPresenceMin : 0,
    lateFieldPenaltyYd: pro ? UNKEYED.lateFieldPenaltyYd : 0,
    challengeDesigneeAllowed: pro,
    halftimeMin: rs.num('clock.halftime_min'),
    endZoneDepthFt: UNKEYED.endZoneDepthFt,
    officiatingReviewMaxPlays: pro ? UNKEYED.officiatingReviewMaxPlays : 0,
  };
}

export function gameFrame(rec: Recorder, ruleSetId: string): string {
  const area = 'game_frame';
  const rules = gameDayRules(rec, ruleSetId);
  let s = gameday.startPregame({ rules, emergencyQbPossible: rules.emergencyQbActiveQbs > 0 });
  let done = 0;
  let refusedLegal = 0;
  for (let guard = 0; guard < 200 && s.now > 0; guard++) {
    for (const id of Object.keys(s.tasks)) {
      const r = gameday.doTask(s, id as Parameters<typeof gameday.doTask>[1]);
      if (r.ok) { s = r.state; done++; }
      else if (r.reason === 'no_budget' || r.reason === 'unknown_task' || r.reason === 'not_owner') refusedLegal += r.reason === 'unknown_task' ? 1 : 0;
    }
    const before = s.now;
    s = gameday.advanceToNextDeadline(s);
    if (s.now === before) { s = gameday.runToKickoff(s); break; }
  }
  if (s.now !== 0) rec.add('stuck', area, 'pregame.never_kickoff', `The pregame timeline stopped at ${s.now} minutes before kickoff.`, OWNERS.gameFrame);
  if (refusedLegal) rec.add('invalid', area, 'pregame.unknown_task', 'The pregame state lists a task doTask does not know.', OWNERS.gameFrame);
  const open = Object.entries(s.tasks).filter(([, t]) => (t as { state?: string }).state === 'open').map(([k]) => k);
  if (open.length) rec.add('invalid', area, 'pregame.open_at_kickoff', `Tasks still open at kickoff: ${open.join(', ')}.`, OWNERS.gameFrame);
  const half = gameday.openHalftime(rules.halftimeMin, 'offense');
  if (typeof half === 'string') rec.add('invalid', area, `halftime.refused:${half}`, `Opening halftime with the rule set's ${rules.halftimeMin} minutes was refused (${half}).`, OWNERS.gameFrame);
  else {
    const left = gameday.halftimeLeft(half);
    if (left.staff < 0 || left.player < 0) rec.add('invalid', area, 'halftime.negative_time', 'Halftime opened with negative time left.', OWNERS.gameFrame, left);
  }
  const media = gameday.runMediaSession([], 'skip');
  if (!media.acts.some((a) => a.classId === 'media_policy')) rec.add('rule', area, 'media.skip_not_breach', 'Skipping postgame media is not logged as a media policy breach (I10.4.1).', OWNERS.gameFrame);
  rec.add('missing', area, 'frame.not_driven_by_game', 'Nothing joins the frame to a played game: the pregame timeline, halftime and postgame are separate state machines with no host that runs them around a GameCallingSession or feeds the game log to drawQuestions.', `${OWNERS.gameFrame}; composition via ${OWNERS.exportsIntegrator}`);
  return `pregame ${done} tasks done, kickoff at ${s.now}`;
}
