// G-52 acceptance part 1: the reputation record (E5.1, E5.2, E5.7) as a replayable fold over log rows.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ParamFile, ReputationRow } from '@gm/schema';
import impactsJson from '../../src/reputation/impacts.json' with { type: 'json' };
import {
  AUDIENCES, IMPACTS, PARAMS, addImpression, applyEvent, bandOf, emptyState, impactTableProblems, replay, standing, startingTrust, toRows, untracedRows,
  type AudienceId, type ImpactRow,
} from '../../src/reputation/index.ts';
import { COLLEGE, PRO, coach, ctx, ev } from './fixtures.ts';

const shared = (audience: AudienceId) => ({ audience, competitionId: null, teamId: null });
const media = (c = PRO) => ({ audience: 'media' as const, competitionId: c, teamId: null });

describe('params and table', () => {
  it('parse and validate', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    expect(impactTableProblems(impactsJson as unknown as { rows: ImpactRow[] })).toEqual([]);
  });
});

describe('E5.1.1 the record', () => {
  it('a new coach with no past shows "unknown" in every row', () => {
    const s = emptyState();
    for (const a of AUDIENCES) expect(standing(s, 1, { audience: a, competitionId: a === 'media' || a === 'fans' ? PRO : null, teamId: null }, 2030).band).toBe('unknown');
  });

  it('replaying the log rebuilds the record exactly', () => {
    const rows = [
      ev({ type: 'promise_broken', actors: coach(1), witnesses: { kind: 'team', teamId: 10 } }),
      ev({ type: 'season_finished', actors: coach(1), payload: { bands: 2 } }),
      ev({ type: 'game_played', year: 2031, actors: coach(1), payload: { result: 'win', rivalry: true } }),
      ev({ type: 'championship_won', year: 2032, actors: coach(1) }),
    ];
    const a = toRows(replay(rows, ctx()), 1, 2032);
    const b = toRows(replay(rows, ctx()), 1, 2032);
    expect(a).toEqual(b);
    for (const r of a.rows) expect(() => ReputationRow.parse(r)).not.toThrow();
  });

  it('every log row points to an event that exists, and the unknown coach is acted on as neutral', () => {
    const rows = [ev({ type: 'offer_reneged', actors: coach(1) })];
    const s = replay(rows, ctx());
    expect(untracedRows(s, new Set(rows.map((r) => r.id)))).toEqual([]);
    expect(untracedRows(s, new Set())).toHaveLength(1);
    expect(bandOf(10, 0.05)).toBe('unknown');
  });

  it('quiet audiences drift 5 percent toward neutral each season; fans drift faster and toward media', () => {
    const s = replay([ev({ type: 'offer_reneged', actors: coach(1), year: 2030 }), ev({ type: 'game_played', actors: coach(1), year: 2032, payload: { result: 'win', rivalry: false }, teamId: null })], ctx());
    const owners = standing(s, 1, shared('administrators_and_owners'), 2032);
    // -8 * 0.5 reach * 1 = -4 in 2030 (not quiet), then 2031 quiet at 5 percent; 2032 is still open.
    expect(owners.regard).toBeCloseTo(50 - 4 * 0.95, 9);
  });

  it('first impressions are capped and fade to nothing over two seasons', () => {
    const s = emptyState();
    addImpression(s, { subjectId: 1, audience: 'players', competitionId: null, known: 0.9, regardShift: 40, fromSeasonYear: 2030, sourceEventId: 1 });
    const y0 = standing(s, 1, shared('players'), 2030);
    expect(y0.known).toBeCloseTo(0.3, 9);
    expect(y0.regard).toBeCloseTo(60, 9);
    expect(standing(s, 1, shared('players'), 2031).regard).toBeCloseTo(55, 9);
    expect(standing(s, 1, shared('players'), 2032).band).toBe('unknown');
  });
});

describe('E5.1.2 events', () => {
  it('a well-known coach moves less per event; events with reach 0 change nothing', () => {
    const s = emptyState();
    const c = ctx({ 1: 2 });
    applyEvent(s, ev({ type: 'statement_shown_false', actors: coach(1) }), c);
    expect(s.log).toHaveLength(0);
  });

  it('a retraction reverses the story at half its size', () => {
    const story = ev({ type: 'statement_shown_false', actors: coach(1) });
    const s = replay([story, ev({ type: 'report_retracted', actors: coach(1), causeId: story.id })], ctx());
    expect(standing(s, 1, media(), 2030).regard).toBeCloseTo(50 - 4 + 2, 9);
  });

  it('"with that party only" rows never touch an audience score', () => {
    const s = replay([ev({ type: 'interview_declined', actors: coach(1) })], ctx());
    expect(s.log).toHaveLength(0);
  });
});

describe('E5.2 audiences', () => {
  it('E5.2.1: ten broken promises start the next roster lower than ten kept, results equal', () => {
    const kept = replay(Array.from({ length: 10 }, () => ev({ type: 'promise_kept', actors: [...coach(1), { personId: 50, role: 'player' }], witnesses: { kind: 'team', teamId: 10 } })), ctx({}, { influenceOf: () => 0.5 }));
    const broke = replay(Array.from({ length: 10 }, () => ev({ type: 'promise_broken', actors: [...coach(1), { personId: 50, role: 'player' }], witnesses: { kind: 'team', teamId: 10 } })), ctx({}, { influenceOf: () => 0.5 }));
    const tk = startingTrust(standing(kept, 1, shared('players'), 2030).effective, []);
    const tb = startingTrust(standing(broke, 1, shared('players'), 2030).effective, []);
    expect(tb).toBeLessThan(tk);
    expect(startingTrust(50, [{ influence: 1, trust: 80 }])).toBeGreaterThan(startingTrust(50, []));
  });

  it('E5.2.1: lame duck and removed authority apply once', () => {
    const s = replay([1, 2, 3].map(() => ev({ type: 'lame_duck_season', actors: coach(1) })).concat([1, 2].map(() => ev({ type: 'authority_removed', actors: coach(1) }))), ctx());
    expect(s.log.filter((r) => r.kind === 'lame_duck' && r.key.startsWith('players'))).toHaveLength(1);
    expect(s.log.filter((r) => r.kind === 'authority_removed' && r.key.startsWith('players'))).toHaveLength(1);
  });

  it('E5.2.2: blocking an interview and supporting a move go opposite ways', () => {
    const blocked = replay([ev({ type: 'interview_blocked', actors: coach(1) })], ctx());
    const supported = replay([ev({ type: 'assistant_hired_up', actors: [{ personId: 1, role: 'former_boss' }, { personId: 1, role: 'supported_move' }] })], ctx());
    expect(standing(blocked, 1, shared('peers'), 2030).regard).toBeLessThan(50);
    expect(standing(supported, 1, shared('peers'), 2030).regard).toBeGreaterThan(50);
  });

  it('E5.2.3: backing out of an agreed offer lowers owners', () => {
    const s = replay([ev({ type: 'offer_reneged', actors: coach(1) })], ctx());
    expect(standing(s, 1, shared('administrators_and_owners'), 2030).regard).toBeLessThan(50);
  });

  it('E5.2.3: results are judged against expectation, scaled by bands', () => {
    const one = replay([ev({ type: 'season_finished', actors: coach(1), payload: { bands: 1 } })], ctx());
    const two = replay([ev({ type: 'season_finished', actors: coach(1), payload: { bands: 2 } })], ctx());
    const down = replay([ev({ type: 'season_finished', actors: coach(1), payload: { bands: -1 } })], ctx());
    const o = (s: ReturnType<typeof replay>) => standing(s, 1, shared('administrators_and_owners'), 2030).regard - 50;
    expect(o(two)).toBeCloseTo(2 * o(one), 9);
    expect(o(down)).toBeCloseTo(-o(one), 9);
  });

  it('E5.2.4: two identical fourth-down calls, one converted, produce opposite media events', () => {
    const won = replay([ev({ type: 'decision_second_guessed', actors: coach(1), payload: { modelCorrect: true, won: true } })], ctx());
    const lost = replay([ev({ type: 'decision_second_guessed', actors: coach(1), payload: { modelCorrect: true, won: false } })], ctx());
    expect(standing(won, 1, media(), 2030).regard).toBeGreaterThan(50);
    expect(standing(lost, 1, media(), 2030).regard).toBeLessThan(50);
  });

  it('E5.2.5: fan values are kept per fan base', () => {
    const s = replay([ev({ type: 'left_during_contract', actors: coach(1), teamId: 10 })], ctx());
    const { rows, fanBases } = toRows(s, 1, 2030);
    expect(fanBases).toHaveLength(1);
    expect(fanBases[0]!.teamId).toBe(10);
    expect(rows.some((r) => r.audience === 'fans')).toBe(false);
    expect(standing(s, 1, { audience: 'fans', competitionId: PRO, teamId: 11 }, 2030).regard).toBe(50);
  });
});

describe('E5.7.1 lower rungs and levels', () => {
  it('a rung 2 coach never moves media or fans; coaches and players hear him at 0.05', () => {
    const s = replay([
      ev({ type: 'championship_won', actors: coach(1) }),
      ev({ type: 'statement_shown_false', actors: coach(1) }),
      ev({ type: 'clinic_talk_given', actors: coach(1) }),
    ], ctx({ 1: 2 }));
    expect(s.log.every((r) => !r.key.startsWith('media') && !r.key.startsWith('fans'))).toBe(true);
    const peers = standing(s, 1, shared('peers'), 2030);
    expect(peers.regard).toBeCloseTo(50 + 0.5 * 0.05, 9);
  });

  it('moving levels applies the transfer weights once', () => {
    const rows = [
      ev({ type: 'promise_kept', actors: coach(1), competitionId: COLLEGE }),
      ev({ type: 'statement_shown_false', actors: coach(1), competitionId: COLLEGE }),
      ev({ type: 'level_changed', actors: coach(1), payload: { fromCompetitionId: COLLEGE, toCompetitionId: PRO } }),
    ];
    const s = replay(rows, ctx());
    const before = replay(rows.slice(0, 2), ctx());
    const p0 = standing(before, 1, shared('players'), 2030).regard - 50;
    expect(standing(s, 1, shared('players'), 2030).regard - 50).toBeCloseTo(0.5 * p0, 9);
    // Replaying the same transfer row again changes nothing.
    applyEvent(s, rows[2]!, ctx());
    expect(standing(s, 1, shared('players'), 2030).regard - 50).toBeCloseTo(0.5 * p0, 9);
    // Media at the new competition start neutral with half the known.
    const m = standing(s, 1, { audience: 'media', competitionId: PRO, teamId: null }, 2030);
    expect(m.regard).toBe(50);
    expect(m.known).toBeCloseTo(0.5 * standing(before, 1, { audience: 'media', competitionId: COLLEGE, teamId: null }, 2030).known, 9);
  });
});

describe('E5.1.1 rule 6: nothing in areas J or D reads reputation', () => {
  it('no engine or player package imports the career package or names regard or known', () => {
    const root = join(__dirname, '../../..');
    const bad: string[] = [];
    for (const pkg of ['engine-core', 'engine-game', 'officiating', 'resolver-reference', 'football-lang', 'people']) {
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else if (p.endsWith('.ts')) {
            const code = readFileSync(p, 'utf8');
            if (/@gm\/career/.test(code) || /\.regard\b|reputation\.\w+\(/.test(code)) bad.push(p);
          }
        }
      };
      walk(join(root, pkg, 'src'));
    }
    expect(bad).toEqual([]);
  });

  it('the table only names audiences of the contract', () => {
    for (const r of IMPACTS.rows) for (const a of Object.keys(r.sizes)) expect(AUDIENCES).toContain(a);
  });
});
