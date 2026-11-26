// Fixture builders for the calibration tests. Fixture data only: no number here is a real rate.
import type { PlayByPlayRow, GameSummary, GameSituation, DecisionRequest, FieldGeometry, DriveRecord } from '@gm/schema';

export function row(over: Partial<PlayByPlayRow> = {}): PlayByPlayRow {
  return {
    gameId: 1, playIndex: 1, driveNumber: 1, period: 1, clockTenths: 9000, offense: 0, playKind: 'scrimmage',
    down: 1, distanceYd: 10, ballOnYd: 25, yardsToGoalYd: 75, goalToGo: false, scoreOffense: 0, scoreDefense: 0,
    resultType: 'run', noPlay: false, offenseKind: 'run', kickKind: null, dropback: false, scramble: false, shotgun: false,
    noHuddle: false, playAction: false, motion: false, personnelCode: '11', yardsGained: 0, airYd: null, yardsAfterCatch: null,
    passLocation: null, runLocation: 'middle', rushers: null, boxCount: 7, coverageFamily: null, pressure: false, sack: false,
    interception: false, fumbleLost: false, touchdown: false, firstDown: false, kickDistanceYd: null, penalties: [],
    snapToSnapTenths: null, epBefore: null, epAfter: null, textKey: 'fixture', textParams: {},
    ...over,
  };
}

export const run = (yards: number, over: Partial<PlayByPlayRow> = {}) => row({ yardsGained: yards, ...over });
export const pass = (outcome: 'complete' | 'incomplete' | 'interception' | 'sack', yards = 0, over: Partial<PlayByPlayRow> = {}) => row({
  offenseKind: 'dropback_pass', dropback: true, runLocation: null,
  resultType: outcome === 'complete' ? 'pass_complete' : outcome === 'incomplete' ? 'pass_incomplete' : outcome === 'interception' ? 'interception' : 'sack',
  sack: outcome === 'sack', interception: outcome === 'interception', yardsGained: outcome === 'complete' || outcome === 'sack' ? yards : 0,
  airYd: outcome === 'sack' ? null : 8, yardsAfterCatch: outcome === 'complete' ? Math.max(0, yards - 8) : null, ...over,
});

export function drive(over: Partial<DriveRecord> = {}): DriveRecord {
  return { driveNumber: 1, side: 0, startPeriod: 1, startClockTenths: 9000, startX: 35, plays: 6, yards: 30, clockUsedTenths: 1800, result: 'punt', ...over };
}

export function summary(gameId: number, score: [number, number], over: Partial<GameSummary> = {}): GameSummary {
  const line = (side: 0 | 1) => ({ side, points: score[side], scrimmagePlays: 60, turnovers: 1, sacksMade: 2, penaltiesAccepted: 6, penaltyYards: 50, timeoutsUsed: 4, drives: 11 });
  return {
    gameId, ruleSetId: 'pro_2026', resolverId: 'reference', seedHex: '0123456789abcdef', finalScore: score, overtime: false,
    tie: score[0] === score[1], teams: [line(0), line(1)], drives: [drive()], finalStateHash: 'fixture', ...over,
  };
}

export const GEOMETRY: FieldGeometry = {
  lengthYd: 120, widthYd: 53.33, goalLineWestX: 10, goalLineEastX: 110, hashSouthY: 23.58, hashNorthY: 29.75, centreY: 26.67,
  uprightSouthY: 23.58, uprightNorthY: 29.75, crossbarHeightYd: 3.33,
};

export function situation(over: Partial<GameSituation> = {}): GameSituation {
  return {
    gameId: 7, playNumber: 10, driveNumber: 2, playKind: 'scrimmage', period: 2, overtime: false, clockTenths: 6000, clockStatus: 'running',
    playClockAtSnapTenths: 100, offense: 0, attackDir: 1, down: 1, distanceYd: 10, goalToGo: false, ballX: 35, ballY: 26.67, lineToGainX: 45,
    score: [0, 0], timeoutsLeft: [3, 3], insideTwoMinute: false, untimedDown: false, ...over,
  };
}

export function request(over: Partial<DecisionRequest> = {}): DecisionRequest {
  return { requestId: 3, type: 'snapping_call', side: 0, options: [], deadlinePlayClockTenths: 0, windowTenths: null, defaultOptionId: null, ...over };
}
