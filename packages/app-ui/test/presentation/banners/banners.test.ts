// PV-05 banner queue (plan 3.4 acceptance): one at a time, ranked, Escape skips, nothing shown with the
// play clock under 10 s, reduced motion halves and stills; plus the feed and game-event mapping.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BannerQueue, BANNER_TABLE, BANNER_KINDS, bannerLines, bannersFromFeed, bannerForGameEvent, isSkipKey, BannerView, gateOpen,
  type BannerGate, type FeedForBanners,
} from '../../../src/presentation/banners/index.ts';
import { cueRow } from '../../../src/presentation/cues/cue-table.ts';

const open: BannerGate = { playClockTenths: 250, live: false, reducedMotion: false };
const teams = ['HARBOR', 'RIDGE'] as const;

describe('banner queue (plan 3.4)', () => {
  it('shows one banner at a time, best rank first, then oldest first', () => {
    const q = new BannerQueue();
    q.enqueue({ kind: 'timeout', key: 'a' }, 0);
    q.enqueue({ kind: 'touchdown', key: 'b', slots: { team: 'RIDGE' } }, 10);
    q.enqueue({ kind: 'sack', key: 'c' }, 20);
    q.enqueue({ kind: 'kickoff', key: 'd' }, 30); // same rank as timeout, later
    const first = q.step(40, open)!;
    expect(first.kind).toBe('touchdown');
    expect(q.pending.length).toBe(3);
    const order = [first.kind];
    let t = 40;
    while (q.showing || q.pending.length) {
      t += 100;
      const s = q.step(t, open);
      if (s && s.kind !== order[order.length - 1]) order.push(s.kind);
      expect(s === null || q.showing === s).toBe(true);
    }
    expect(order).toEqual(['touchdown', 'timeout', 'kickoff']);
    // The sack waited past its short maxWait behind three longer banners, so it went stale.
    expect(q.dropped).toEqual([{ kind: 'sack', key: 'c', reason: 'stale' }]);
    // Never two at once: each shown banner starts at or after the previous one ended.
    for (let k = 1; k < q.log.length; k++) expect(q.log[k]!.startMs).toBeGreaterThanOrEqual(q.log[k - 1]!.endMs);
  });

  it('runs each banner for its table length on the wall clock', () => {
    const q = new BannerQueue();
    q.enqueue({ kind: 'timeout', key: 'a' }, 0);
    const s = q.step(1000, open)!;
    expect(s.endMs - s.startMs).toBe(BANNER_TABLE.kinds.timeout!.durationMs);
    expect(q.step(1000 + BANNER_TABLE.kinds.timeout!.durationMs - 1, open)).not.toBeNull();
    expect(q.step(1000 + BANNER_TABLE.kinds.timeout!.durationMs, open)).toBeNull();
    expect(q.log[0]!.ended).toBe('timeout');
  });

  it('a better-ranked arrival waits for the showing banner instead of cutting in', () => {
    const q = new BannerQueue();
    q.enqueue({ kind: 'sack', key: 'a' }, 0);
    q.step(0, open);
    q.enqueue({ kind: 'touchdown', key: 'b' }, 500);
    expect(q.step(600, open)!.kind).toBe('sack');
  });

  it('Escape (or a click) skips the showing banner and the next one follows', () => {
    expect(isSkipKey('Escape')).toBe(true);
    expect(isSkipKey('Enter')).toBe(false);
    const q = new BannerQueue();
    q.enqueue({ kind: 'touchdown', key: 'a' }, 0);
    q.enqueue({ kind: 'timeout', key: 'b' }, 0);
    q.step(0, open);
    expect(q.skip(200)).toBe(true);
    expect(q.log[0]).toMatchObject({ kind: 'touchdown', endMs: 200, ended: 'skipped' });
    expect(q.step(200, open)!.kind).toBe('timeout');
    expect(new BannerQueue().skip(0)).toBe(false);
  });

  it('shows nothing while the play clock is under 10 s or the ball is live, and takes a showing bar down', () => {
    expect(gateOpen({ ...open, playClockTenths: 99 })).toBe(false);
    expect(gateOpen({ ...open, playClockTenths: 100 })).toBe(true);
    expect(gateOpen({ ...open, playClockTenths: null })).toBe(true);
    expect(gateOpen({ ...open, live: true })).toBe(false);
    const q = new BannerQueue();
    q.enqueue({ kind: 'timeout', key: 'a' }, 0);
    expect(q.step(0, { ...open, playClockTenths: 90 })).toBeNull();
    expect(q.pending.length).toBe(1);
    expect(q.step(100, open)!.kind).toBe('timeout');
    expect(q.step(200, { ...open, playClockTenths: 95 })).toBeNull();
    expect(q.log[0]!.ended).toBe('gate');
    expect(q.step(300, open)).toBeNull(); // not shown again
    q.enqueue({ kind: 'sack', key: 'b' }, 400);
    expect(q.step(400, { ...open, live: true })).toBeNull();
  });

  it('property: over random event streams no banner ever shows under the 10 s play clock or two at once', () => {
    let seed = 12345; // fixed LCG: deterministic test input, not game randomness
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const kinds = BANNER_KINDS;
    for (let run = 0; run < 50; run++) {
      const q = new BannerQueue();
      let showingSince: number | null = null;
      for (let t = 0; t < 120_000; t += 100) {
        if (rnd() < 0.02) q.enqueue({ kind: kinds[Math.floor(rnd() * kinds.length)]!, key: `${run}:${t}` }, t);
        const pc = Math.floor(rnd() * 400);
        const g: BannerGate = { playClockTenths: rnd() < 0.2 ? null : pc, live: rnd() < 0.1, reducedMotion: run % 2 === 1 };
        const s = q.step(t, g);
        if (s) {
          expect(g.live).toBe(false);
          expect(g.playClockTenths === null || g.playClockTenths >= 100).toBe(true);
          if (showingSince === null) showingSince = s.startMs;
        } else showingSince = null;
      }
      for (let k = 1; k < q.log.length; k++) expect(q.log[k]!.startMs).toBeGreaterThanOrEqual(q.log[k - 1]!.endMs);
    }
  });

  it('reduced motion halves every banner length', () => {
    for (const kind of BANNER_KINDS) {
      const q = new BannerQueue();
      q.enqueue({ kind, key: 'x' }, 0);
      const s = q.step(0, { ...open, reducedMotion: true })!;
      expect(s.endMs - s.startMs).toBe(Math.round(BANNER_TABLE.kinds[kind]!.durationMs / 2));
    }
  });

  it('drops a banner that waited past its maxWait, and duplicates of one event', () => {
    const q = new BannerQueue();
    q.enqueue({ kind: 'sack', key: 'a' }, 0);
    q.enqueue({ kind: 'sack', key: 'a' }, 5);
    expect(q.dropped).toEqual([{ kind: 'sack', key: 'a', reason: 'duplicate' }]);
    expect(q.step(BANNER_TABLE.kinds.sack!.maxWaitMs + 1, { ...open, live: true })).toBeNull();
    expect(q.dropped[1]).toEqual({ kind: 'sack', key: 'a', reason: 'stale' });
    expect(q.pending.length).toBe(0);
  });
});

describe('banner table', () => {
  it('covers every banner the plan lists in 3.4', () => {
    for (const k of ['kickoff', 'quarter_end', 'two_minute', 'touchdown', 'field_goal_good', 'safety', 'timeout', 'challenge', 'review_upheld', 'review_reversed', 'injury', 'penalty']) expect(BANNER_KINDS).toContain(k);
  });
  it('every named cue row exists in the PV-02 cue table and draws a banner there', () => {
    for (const [kind, rule] of Object.entries(BANNER_TABLE.kinds)) {
      if (rule.cueRow === null) continue;
      const row = cueRow(rule.cueRow);
      expect(row, kind).toBeDefined();
      expect(row!.visual.where, kind).toBe('banner');
      expect(row!.visual.reducedMotion, kind).toBe('half_and_still');
    }
  });
  it('fills text in capitals and drops empty second lines', () => {
    expect(bannerLines('touchdown', { team: 'Ridge', away: 'Ridge', home: 'Harbor', as: 14, hs: 10 })).toEqual(['TOUCHDOWN RIDGE', 'RIDGE 14   HARBOR 10']);
    expect(bannerLines('sack', {})).toEqual(['SACK']);
  });
});

const feed = (cues: FeedForBanners['cues'], score: [number, number] = [10, 14]): FeedForBanners => ({ playId: 'g1:42', result: { scoreAfter: score }, cues });

describe('banners from the feed (rulings as called)', () => {
  it('maps scores, turnovers, penalties and reviews; incomplete and first down stay on the strip', () => {
    const reqs = bannersFromFeed(feed([
      { kind: 'snap', seq: 0 },
      { kind: 'ruling', seq: 1, ruling: 'touchdown', favours: 1 },
      { kind: 'ruling', seq: 2, ruling: 'interception', favours: 0 },
      { kind: 'ruling', seq: 3, ruling: 'incomplete', favours: null },
      { kind: 'ruling', seq: 4, ruling: 'first_down', favours: 1 },
      { kind: 'ruling', seq: 5, ruling: 'penalty', favours: 1 },
      { kind: 'ruling', seq: 6, ruling: 'review_reversed', favours: 0 },
    ]), { teams, penalty: { foul: 'HOLDING', against: 0, playerNumber: 72, enforcement: '10 YARDS, REPEAT 2ND DOWN', outcome: 'accepted' }, reviewText: 'ruled incomplete' });
    expect(reqs.map((r) => r.kind)).toEqual(['touchdown', 'turnover', 'penalty', 'review_reversed']);
    expect(reqs.map((r) => r.key)).toEqual(['g1:42:1', 'g1:42:2', 'g1:42:5', 'g1:42:6']);
    expect(bannerLines(reqs[0]!.kind, reqs[0]!.slots)).toEqual(['TOUCHDOWN RIDGE', 'RIDGE 14   HARBOR 10']);
    expect(bannerLines(reqs[1]!.kind, reqs[1]!.slots)).toEqual(['TURNOVER', 'INTERCEPTION, HARBOR BALL']);
    expect(bannerLines(reqs[2]!.kind, reqs[2]!.slots)).toEqual(['FLAG: HOLDING #72 HARBOR', 'ACCEPTED: 10 YARDS, REPEAT 2ND DOWN']);
    expect(bannerLines(reqs[3]!.kind, reqs[3]!.slots)).toEqual(['AFTER REVIEW: REVERSED', 'RULED INCOMPLETE']);
  });
  it('a penalty with no card yet still shows a flag banner', () => {
    const [r] = bannersFromFeed(feed([{ kind: 'ruling', seq: 0, ruling: 'penalty', favours: null }]), { teams });
    expect(bannerLines(r!.kind, r!.slots)).toEqual(['FLAG: PENALTY']);
  });
});

describe('banners for game events outside the feed', () => {
  it('kickoff, quarter end, two-minute warning, timeout, challenge and injury', () => {
    const lines = (ev: Parameters<typeof bannerForGameEvent>[0]) => { const r = bannerForGameEvent(ev, teams, [3, 7]); return bannerLines(r.kind, r.slots); };
    expect(lines({ kind: 'kickoff', key: 'k' })).toEqual(['KICKOFF', 'RIDGE AT HARBOR']);
    expect(lines({ kind: 'quarter_end', key: 'q1', quarterLabel: '1ST' })).toEqual(['END OF 1ST QUARTER', 'RIDGE 7   HARBOR 3']);
    expect(lines({ kind: 'quarter_end', key: 'ot', quarterLabel: 'OT' })).toEqual(['END OF OT', 'RIDGE 7   HARBOR 3']);
    expect(lines({ kind: 'two_minute', key: 't' })).toEqual(['TWO-MINUTE WARNING', 'RIDGE 7   HARBOR 3']);
    expect(lines({ kind: 'timeout', key: 'to', side: 0, left: 2 })).toEqual(['TIMEOUT HARBOR', '2 LEFT']);
    expect(lines({ kind: 'challenge', key: 'c', side: 1, what: 'spot of the ball' })).toEqual(['CHALLENGE', 'RIDGE: SPOT OF THE BALL']);
    expect(lines({ kind: 'injury', key: 'i', side: 1, playerNumber: 23 })).toEqual(['INJURY TIMEOUT', 'RIDGE #23']);
  });
});

describe('banner view', () => {
  it('draws the bar with a status line in both looks, and nothing when the queue is empty', () => {
    const q = new BannerQueue();
    q.enqueue({ kind: 'two_minute', key: 'a', slots: { away: 'RIDGE', home: 'HARBOR', as: 7, hs: 3 } }, 0);
    const b = q.step(0, open);
    for (const look of ['classic', 'plain'] as const) {
      const html = renderToStaticMarkup(createElement(BannerView, { banner: b, look, onSkip: () => {} }));
      expect(html).toContain('TWO-MINUTE WARNING');
      expect(html).toContain('role="status"');
      expect(html).toContain(`data-look="${look}"`);
      expect(html).toContain('Skip');
    }
    const none = renderToStaticMarkup(createElement(BannerView, { banner: null, look: 'classic', onSkip: () => {} }));
    expect(none).not.toContain('<button');
  });
});
