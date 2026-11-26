// The game summary the calibration harness reads (J14.6.1, J15.2.1). A query over play records and
// their credit rows, like everything else in this module.
import { Contract } from '@gm/engine-core';
import { creditsFromFacts } from './credits.ts';
import { readPlay, type StatsDeps } from './facts.ts';

type PlayRecord = Contract.PlayRecord;
type DriveRecord = Contract.DriveRecord;
type GameSummary = Contract.GameSummary;
type Side = Contract.Side;

/** The contract's `final` argument, plus what play records do not hold. */
export interface SummaryFinal {
  readonly score: readonly [number, number];
  readonly tie: boolean;
  readonly stateHash: string;
  readonly ruleSetId: string;
  readonly seedHex: string;
  /** Needed only for a game with no play records. */
  readonly gameId?: number;
  readonly resolverId?: 'reference' | 'tick';
  /**
   * Timeouts charged to each team. They are game events (`timeout_charged`), not play records, so the
   * caller supplies them from the event log. Left out, the summary reports 0 for both teams.
   */
  readonly timeoutsUsed?: readonly [number, number];
}

const SCRIMMAGE_BASES = new Set<string>(['run', 'kneel', 'completion', 'incompletion', 'spike', 'interception', 'sack']);

export function summary(records: readonly PlayRecord[], drives: readonly DriveRecord[], final: SummaryFinal, deps: StatsDeps): GameSummary {
  const firstRecord = records[0];
  const gameId = final.gameId ?? firstRecord?.gameId;
  if (gameId === undefined) throw new Error('summary needs a game id: no play records and none given');

  const plays: [number, number] = [0, 0];
  const turnovers: [number, number] = [0, 0];
  const sacks: [number, number] = [0, 0];
  const penalties: [number, number] = [0, 0];
  const penaltyYards: [number, number] = [0, 0];
  let overtime = false;

  for (const record of records) {
    const f = readPlay(record, deps);
    if (record.situation.overtime) overtime = true;
    if (f.counts && !f.isTry) {
      // Official count of scrimmage plays: rushes, pass attempts and sacks, kneels and spikes included (J15.2.1 note).
      if (SCRIMMAGE_BASES.has(f.base)) plays[f.offense] += 1;
      if (f.base === 'interception') turnovers[f.offense] += 1;
      for (const fu of f.fumbles) if (fu.credited && fu.lost) turnovers[fu.side] += 1;
    }
    for (const c of creditsFromFacts(f, deps)) {
      if (c.statId === 'sacks') sacks[c.side] += c.value;
      else if (c.statId === 'penalties') penalties[c.side] += c.value;
      else if (c.statId === 'penalty_yards') penaltyYards[c.side] += c.value;
    }
  }

  const line = (side: Side) => ({
    side,
    points: final.score[side],
    scrimmagePlays: plays[side],
    turnovers: turnovers[side],
    // Half sacks of one play always sum to a whole sack; rounding only removes float dust.
    sacksMade: Math.round(sacks[side]),
    penaltiesAccepted: penalties[side],
    penaltyYards: penaltyYards[side],
    timeoutsUsed: final.timeoutsUsed ? final.timeoutsUsed[side] : 0,
    drives: drives.filter((d) => d.side === side).length,
  });

  return {
    gameId,
    ruleSetId: final.ruleSetId,
    resolverId: final.resolverId ?? firstRecord?.truth.resolverId ?? 'reference',
    seedHex: final.seedHex,
    finalScore: [final.score[0], final.score[1]],
    overtime,
    tie: final.tie,
    teams: [line(0), line(1)],
    drives: [...drives],
    finalStateHash: final.stateHash,
  };
}
