// G-79 seat read models and commands, fed by the career seats core: the live view carries no truth (index rule
// 9), the role report shows entries beside what the film shows, and commands are refused without the right.
import { describe, expect, it } from 'vitest';
import { buildSeatView, buildRoleReportView, LIVE_FORBIDDEN } from '../../src/read-models/seats/index.ts';
import { checkSeatCommand, isSeatCommand } from '../../src/commands/seats/index.ts';
// Inputs mirror career seats outputs (GamedayRole, SeatLayout, BoothLine, RoleReport); the career core's own tests
// cover how they are made. Hand-built here because app-services tests may import only package entry points, and
// the seats namespace joins the career entry with CR-G79-1.
type Ch = 'offense' | 'defense' | 'special_teams' | 'head_coach' | 'analyst';
const RIGHTS: Record<string, string[]> = {
  booth_coverage: ['report'], position_bench: ['substitute_group', 'correct'], charter: ['chart', 'flag'], head_coach: ['game_management', 'intervene', 'challenge', 'timeout'],
};
const role = (r: string, channel: Ch = 'offense', location: 'booth' | 'sideline' = 'booth') => ({ seatId: 4, role: r, location, channel, comm: 'headset' as const, watch: 'w', report: 'r', rights: RIGHTS[r]! });
const layout = (booth: boolean, tasks: string[]) => ({ panel: booth ? 'pick_lists' : 'head_coach_console', task: 't', view: booth ? 'booth_overhead' as const : 'sideline' as const, zoomMin: booth ? 0 : 0.5, gameWaits: false, tasks });
const ALL: Ch[] = ['offense', 'defense', 'special_teams', 'analyst', 'head_coach'];
const report = (n: number) => ({
  games: 1, accuracy: { value: 1, n }, byFamily: { cover3: n >= 10 ? { value: 1, n } : 'not_enough_yet' as const }, medianSeconds: 2,
  advice: { matchedModel: 'not_enough_yet' as const, workedOut: 'not_enough_yet' as const }, corrections: { given: 0, worked: 0 }, signalErrorsPerGame: 0, lateRelaysPerGame: 0, estimated: false,
});

describe('seat view', () => {
  const r = role('booth_coverage');
  const line = { shown: [{ id: 1, kind: 'report', fromSeat: 4, body: { playId: 3, look: 'cover3/buzz', truth: 'cover1/robber', grade: 1 } }], queued: [] };
  const v = buildSeatView({
    role: r, layout: layout(true, ['report', 'answer_caller']), selectedChannel: 'offense', listenable: ['offense'], line,
    open: { ask: 'coverage', secondsLeft: 3.26, phase: 'post' }, pad: ['cover3/buzz', 'cover3/sky', 'cover1/robber'],
    corrections: [{ id: 'c:1', playerId: 7, kind: 'eyes' }], correctionsLeft: 2, onField: null, simulated: false,
  });
  it('groups the pad by family and keeps the timer', () => {
    expect(v.pad).toEqual([{ family: 'cover3', variants: ['buzz', 'sky'] }, { family: 'cover1', variants: ['robber'] }]);
    expect(v.open).toEqual({ ask: 'coverage', secondsLeft: 3.3, phase: 'post' });
    expect(v.canPickChannel).toBe(false);
    expect(v.view).toBe('booth_overhead');
  });
  it('carries no truth or grade into the live view', () => {
    const json = JSON.stringify(v);
    for (const k of LIVE_FORBIDDEN) expect(json).not.toContain(`"${k}"`);
    expect(v.line[0]!.text).toBe('playId: 3, look: cover3/buzz');
    // A booth seat has no corrections task.
    expect(v.corrections).toEqual([]);
  });
  it('the head coach may pick a channel', () => {
    const hc = role('head_coach', 'head_coach', 'sideline');
    const hv = buildSeatView({ role: hc, layout: layout(false, ['call', 'game_management', 'channel']), selectedChannel: 'defense', listenable: ALL, line: { shown: [], queued: [] }, open: null, pad: [], corrections: [], correctionsLeft: 0, onField: null, simulated: false });
    expect(hv.canPickChannel).toBe(true);
    expect(hv.channels).toContain('analyst');
  });
});

describe('role report view', () => {
  it('shows "not enough yet" as null and lists entries beside the film', () => {
    const recs = Array.from({ length: 4 }, (_, i) => ({ kind: 'booth', playId: i, entry: 'cover3/buzz', truth: 'cover3/buzz', seconds: 2, simulated: false }));
    const v = buildRoleReportView(report(4), recs);
    expect(v.families).toEqual([{ family: 'cover3', pct: null, n: null }]);
    expect(v.accuracyPct).toBe(100);
    expect(v.events[0]).toMatchObject({ yours: 'cover3/buzz', film: 'cover3/buzz' });
  });
});

describe('seat commands', () => {
  it('refuses a command the seat has no right to send', () => {
    expect(checkSeatCommand({ type: 'seat.report_look', playId: 1, phase: 'post', look: 'cover3' }, RIGHTS.booth_coverage!, ['offense'])).toEqual({ ok: true });
    expect(checkSeatCommand({ type: 'seat.correct', optionId: 'c', way: 'words' }, RIGHTS.booth_coverage!, ['offense'])).toEqual({ ok: false, reason: 'no_right' });
    expect(checkSeatCommand({ type: 'seat.substitute', sendIn: [1], takeOut: [2] }, RIGHTS.position_bench!, ['offense']).ok).toBe(true);
    expect(checkSeatCommand({ type: 'seat.channel', channel: 'defense' }, RIGHTS.charter!, ['offense'])).toEqual({ ok: false, reason: 'not_listenable' });
    expect(isSeatCommand({ type: 'seat.nope' })).toBe(false);
  });
});
