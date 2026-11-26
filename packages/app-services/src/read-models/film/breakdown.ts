// Why the play worked or failed (N1.3). The breakdown panel in words and the responsibility line.
// In a career both are opinions: the staff's word on the call (never the engine's number), the
// staff's attribution of contests and busts (right with the coach's accuracy, leaning toward his
// favourites), or the user's own attribution. The engine's values stay in the truth record for N2
// and N4 and appear only in the coaching school (N5, rule 1; E9.3.4 rule 3).
import { stream, type WorldSeed } from '@gm/engine-core';
import { param } from './params.ts';
import { playIdOf, viewerSide } from './chart.ts';
import { CAUSE_TYPES, type CauseType, type FilmSource, type Grader } from './types.ts';
import type { Breakdown, Responsibility } from './schemas.ts';

/** Call value (expected points) beyond which a staff calls a call good or poor. Assumption (design). */
const CALL_WORD_EP = 0.1;
const CALL_WORDS = ['good', 'neutral', 'poor'] as const;

/** The breakdown panel of one play for one club (N1.3.1). */
export function breakdown(src: FilmSource, teamId: number, staff: Grader, seed: WorldSeed): Breakdown {
  const side = viewerSide(src, teamId);
  const playId = playIdOf(src.gameId, src.playNumber);
  const visibleLuck: Breakdown['outcome']['visibleLuck'] = [];
  for (const e of src.truth.events) {
    if (e.type === 'catch_point' && e.outcome === 'tip') visibleLuck.push('tipped_ball');
    if (e.type === 'catch_point' && e.outcome === 'drop') visibleLuck.push('dropped_pass');
    if (e.type === 'tackle_attempt' && e.outcome === 'missed') visibleLuck.push('missed_tackle');
    if (e.type === 'tackle_attempt' && e.outcome === 'broken') visibleLuck.push('broken_tackle');
    if (e.type === 'fumble') visibleLuck.push('fumble');
  }
  const epa = src.row.epBefore !== null && src.row.epAfter !== null ? src.row.epAfter - src.row.epBefore : null;
  const outcome = { result: src.row.resultType, yards: src.row.yardsGained, epa, visibleLuck };
  if (side === null) return { playId, call: null, execution: [], outcome, changedAtLine: false };
  const s = stream(seed, 'film.breakdown', [src.gameId, src.playNumber, teamId, staff.personId]);
  // The call in the staff's words, from the call value they cannot see directly.
  const v = src.callValue;
  const trueWord = v === null ? 'neutral' : v > CALL_WORD_EP ? 'good' : v < -CALL_WORD_EP ? 'poor' : 'neutral';
  const hit = s.uniform(), pick = s.uniform();
  const others = CALL_WORDS.filter((w) => w !== trueWord);
  const call = hit < staff.accuracy ? trueWord : others[Math.floor(pick * others.length)]!;
  // Execution: who on the club's own unit won or lost, as the staff saw it.
  const mine = new Set(src.slots.filter((x) => x.side === side).map((x) => x.personId));
  const execution: Breakdown['execution'] = [];
  for (const e of src.truth.events) {
    if (e.type !== 'contest') continue;
    const who = mine.has(e.winnerId) ? e.winnerId : mine.has(e.loserId) ? e.loserId : null;
    const h = s.uniform();
    if (who === null) continue;
    const won = who === e.winnerId;
    execution.push({ personId: who, won: h < staff.accuracy ? won : !won });
  }
  return { playId, call, execution, outcome, changedAtLine: false };
}

/** The bust behind a failed play, from the truth record. Internal. */
function trueBust(src: FilmSource, teamId: number): { personId: number | null; cause: CauseType } | null {
  const side = viewerSide(src, teamId);
  if (side === null) return null;
  const mine = new Set(src.slots.filter((x) => x.side === side).map((x) => x.personId));
  for (const e of src.truth.events) {
    if (e.type === 'mental_error' && mine.has(e.playerId)) {
      return { personId: e.playerId, cause: e.cause === 'communication' ? 'communication' : e.cause === 'discipline' ? 'freelance' : 'mental' };
    }
  }
  for (const e of src.truth.events) if (e.type === 'contest' && mine.has(e.loserId)) return { personId: e.loserId, cause: 'physical' };
  return null;
}

/** A play failed when it was not a success for the club's unit (N2.2.3 coaching definition via the base set). */
export function playFailed(src: FilmSource, teamId: number, efficiency: boolean | null): boolean {
  const side = viewerSide(src, teamId);
  if (side === null || efficiency === null) return false;
  const onOffense = side === src.row.offense;
  return onOffense ? !efficiency : efficiency;
}

/**
 * The staff responsibility line (N1.3.2 staff mode): the true player and cause with the coach's
 * accuracy (held inside the leaf's 70% to 95% band), else a wrong line. When the true player is one
 * of his favourites, his errors lean toward blaming someone else.
 */
export function staffResponsibility(src: FilmSource, teamId: number, coach: Grader, seed: WorldSeed): Responsibility | null {
  const bust = trueBust(src, teamId);
  if (!bust) return null;
  const playId = playIdOf(src.gameId, src.playNumber);
  const acc = Math.min(param('staff.accuracyMax'), Math.max(param('staff.accuracyMin'), coach.accuracy));
  const s = stream(seed, 'film.responsibility', [src.gameId, src.playNumber, teamId, coach.personId]);
  const hit = s.uniform(), lean = s.uniform(), pick = s.uniform();
  const by = `staff:${coach.personId}`;
  if (hit < acc) return { playId, personId: bust.personId, cause: bust.cause, by };
  const side = viewerSide(src, teamId)!;
  if (bust.personId !== null && coach.favourites.includes(bust.personId) && lean < coach.favouriteLean) {
    const others = src.slots.filter((x) => x.side === side && x.personId !== bust.personId && !coach.favourites.includes(x.personId));
    if (others.length) return { playId, personId: others[Math.floor(pick * others.length)]!.personId, cause: bust.cause, by };
  }
  const wrong = CAUSE_TYPES.filter((c) => c !== bust.cause);
  return { playId, personId: bust.personId, cause: wrong[Math.floor(pick * wrong.length)]!, by };
}

/** The user's own line (self mode): nothing is shown until he assigns it. */
export function userResponsibility(playId: string, personId: number | null, cause: CauseType): Responsibility {
  return { playId, personId, cause, by: 'user' };
}

/** Private score of the user's line against what happened (N5 evidence; never shown in a career). */
export function responsibilityEvidence(src: FilmSource, teamId: number, line: Responsibility): { playId: string; agrees: boolean } {
  const bust = trueBust(src, teamId);
  return { playId: line.playId, agrees: !!bust && bust.personId === line.personId && bust.cause === line.cause };
}
