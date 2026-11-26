// Whitelist test of the presentation feed bridge (K9.3.1 rule 4) and its fixture tests (PV-00).
// Test data only: no number here is a real-world claim.
import { describe, expect, it } from 'vitest';
import { NEUTRAL_ENVIRONMENT, type FoulRecord, type PlayOutcome } from '@gm/schema';
import { bridges } from '../../../src/observer/index.ts';
import { publicEvents } from '../../../src/read-models/film/index.ts';
import {
  presentationFeed, FEED_CUE_KINDS, FEED_SOURCES, RULING_KINDS, type FeedInput, type FeedRecord, type PresentationExtras, type PresentationFeed,
} from '../../../src/presentation/feed/index.ts';
import { makeSource, person, LOS, TPS, CATCH_T, TACKLE_T, WHISTLE_T } from '../../read-models/film/fixtures.ts';

const outcome = (o: Partial<PlayOutcome> = {}): PlayOutcome => ({
  resultType: 'pass_complete', noPlay: false, snappingSide: 0, possessionAfter: 0, changeOfPossession: false,
  spotX: 59.2, spotY: 10, previousSpotX: LOS, score: null, touchback: false, endedOutOfBounds: false, incomplete: false,
  runnerDownInBounds: true, yardsGained: 19, injuryStoppage: [], enforcement: null, ...o,
});

const foul = (o: Partial<FoulRecord> = {}): FoulRecord => ({
  foulId: 'holding_offense', side: 0, playerId: person(1), spot: { x: LOS + 2, y: 24 }, t: 1.2, timing: 'live', phase: 'pass_play',
  yards: 10, afd: false, lod: false, spotFoul: true, runoffEligible: false, beforeChangeOfPossession: true, sameAct: null,
  called: true, correct: true, flagrant: false, ...o,
} as unknown as FoulRecord);

function input(o: { final?: Partial<PlayOutcome>; fouls?: FoulRecord[]; extras?: PresentationExtras | null; review?: FeedInput['review']; firstDown?: boolean; turnoverOnDowns?: boolean } = {}): FeedInput {
  const src = makeSource();
  return {
    record: {
      gameId: src.gameId, index: src.playNumber, scoreAfter: [10, 7], truth: src.truth,
      called: { fouls: o.fouls ?? [] }, final: outcome(o.final),
      seriesAfter: { firstDownAwarded: o.firstDown ?? true, turnoverOnDowns: o.turnoverOnDowns ?? false },
    },
    ticksPerSecond: TPS, trajectory: src.trajectory, slots: src.slots,
    environment: { ...NEUTRAL_ENVIRONMENT, roof: 'open', windMph: 12, windDirDeg: 90, gustMph: 20, noiseBase: 0.6, precip: 'rain' },
    lineOfScrimmageX: LOS, lineToGainX: LOS + 7, userSide: 0, review: o.review ?? null, extras: o.extras ?? null,
  };
}

const FULL: PresentationExtras = {
  noise: 0.83,
  wind: { mph: 14, dirDeg: 180, gustMph: 22 },
  contacts: [{ t: TACKLE_T / TPS, tier: 3, x: 59.2, y: 10, playerIds: [person(7), person(18), 99999] }],
  presnap: [
    { t: -0.25, side: 0, kind: 'relay_garbled' },
    { t: -0.1, side: 0, kind: 'cadence_hard' },
    { t: -0.05, side: 0, kind: 'cadence_silent' },
  ],
  flagsThrown: [{ foulIndex: 0, t: 1.6 }],
  postHits: [],
};

const kinds = (f: PresentationFeed) => f.cues.map((c) => c.kind);
const rulings = (f: PresentationFeed) => f.cues.flatMap((c) => (c.kind === 'ruling' ? [c.ruling] : []));

/** Field names that exist only in the truth layer (truth.ts, officiating.ts) and must never reach a feed. */
const TRUTH_KEYS = ['winnerId', 'loserId', 'contest', 'correct', 'trueValue', 'trueOutcome', 'severity', 'borderline', 'mental_error', 'marginYd', 'marginS', 'advantage', 'severitySeed', 'eventIndex', 'cause', 'callValue', 'truth'];

describe('presentation feed bridge', () => {
  it('is registered with a whitelist test', () => {
    const b = bridges().find((x) => x.name === 'presentation.feed');
    expect(b?.whitelistTest).toBe('packages/app-services/test/presentation/feed/adapter.test.ts');
  });

  it('holds only whitelisted top-level fields and no truth-layer key anywhere', () => {
    const f = presentationFeed(input({ extras: FULL, fouls: [foul()] }));
    expect(Object.keys(f).sort()).toEqual(['conditions', 'cues', 'formatVersion', 'missing', 'perspective', 'playId', 'result', 'situation', 'ticksPerSecond', 'visibility']);
    const seen = new Set<string>();
    JSON.stringify(f, (k, v) => { seen.add(k); return v; });
    for (const k of TRUTH_KEYS) expect(seen.has(k), k).toBe(false);
    expect(f.visibility).toBe('user-visible');
  });

  it('an uncalled foul in truth never makes a flag, and a contest in truth never makes a cue', () => {
    const src = makeSource({ contests: [{ winner: 11, loser: 0 }] });
    const base = input({ fouls: [foul({ called: false })] });
    const f = presentationFeed({ ...base, record: { ...base.record, truth: src.truth } });
    expect(kinds(f)).not.toContain('flag');
    expect(kinds(f)).not.toContain('contact');
  });
});

describe('presentation feed from a play record', () => {
  it('camera cues are the film filter list on the same ticks (live and film agree)', () => {
    const src = makeSource();
    const film = publicEvents(src).filter((e) => e.kind !== 'flag');
    const f = presentationFeed(input());
    const cam = f.cues.filter((c) => c.kind !== 'ruling');
    expect(cam.map((c) => [c.kind, c.tick])).toEqual(film.map((e) => [e.kind, e.tick]));
    expect(f.cues.find((c) => c.kind === 'catch')?.tick).toBe(CATCH_T);
    expect(f.cues.find((c) => c.kind === 'whistle')?.tick).toBe(WHISTLE_T);
  });

  it('without the change requests: lists every missing source and invents nothing', () => {
    const f = presentationFeed(input());
    expect(f.missing).toEqual([...FEED_SOURCES].sort());
    expect(f.conditions.noise).toBeNull();
    expect(f.conditions.noiseBase).toBe(0.6);
    expect(f.conditions.windMph).toBe(12);
    expect(f.conditions.gustMph).toBe(20);
    expect(kinds(f).some((k) => k === 'contact' || k === 'cadence' || k === 'relay')).toBe(false);
  });

  it('with every change request: nothing missing, per-play noise and wind win over the game state', () => {
    const f = presentationFeed(input({ extras: FULL, fouls: [foul()] }));
    expect(f.missing).toEqual([]);
    expect(f.conditions.noise).toBe(0.83);
    expect(f.conditions.windMph).toBe(14);
    expect(f.conditions.windDirDeg).toBe(180);
    expect(f.conditions.gustMph).toBe(22);
  });

  it('pre-snap talk comes before the snap; silent counts are kept; garbled relay is named', () => {
    const f = presentationFeed(input({ extras: FULL }));
    const pre = f.cues.filter((c) => c.tick < 0);
    expect(pre.map((c) => c.kind)).toEqual(['relay', 'cadence', 'cadence']);
    expect(pre.flatMap((c) => (c.kind === 'cadence' ? [c.count] : c.kind === 'relay' ? [c.outcome] : []))).toEqual(['garbled', 'hard', 'silent']);
    expect(f.cues.find((c) => c.kind === 'snap')!.seq).toBe(3);
  });

  it('contact keeps the engine tier and tick, maps people to slots and drops people not on the field', () => {
    const f = presentationFeed(input({ extras: FULL }));
    const c = f.cues.find((x) => x.kind === 'contact');
    expect(c && c.kind === 'contact' && [c.tick, c.tier, c.slots]).toEqual([TACKLE_T, 3, [7, 18]]);
    // Same tick as the tackle; contact comes first, so the sound lands with the hit.
    const i = f.cues.findIndex((x) => x.kind === 'contact'), j = f.cues.findIndex((x) => x.kind === 'tackle');
    expect(i).toBeLessThan(j);
  });

  it('flags: at the throw time when officiating gives it, else at the foul time, never before the snap', () => {
    const thrown = presentationFeed(input({ extras: FULL, fouls: [foul()] }));
    const a = thrown.cues.find((c) => c.kind === 'flag');
    expect(a && a.kind === 'flag' && [a.tick, a.against, a.x]).toEqual([16, 0, LOS + 2]);
    const est = presentationFeed(input({ fouls: [foul()] })).cues.find((c) => c.kind === 'flag');
    expect(est?.tick).toBe(12);
    const pre = presentationFeed(input({ fouls: [foul({ t: -0.4, timing: 'before_snap' } as Partial<FoulRecord>)] })).cues.find((c) => c.kind === 'flag');
    expect(pre?.tick).toBe(0);
  });

  it('rulings sit on the whistle tick, after it, and say whom they favour', () => {
    const f = presentationFeed(input());
    const r = f.cues.filter((c) => c.kind === 'ruling');
    expect(r.map((c) => c.tick)).toEqual([WHISTLE_T]);
    expect(f.cues.at(-1)?.kind).toBe('ruling');
    expect(r[0]!.kind === 'ruling' && [r[0]!.ruling, r[0]!.favours]).toEqual(['first_down', 0]);
  });

  it('maps the called outcome to rulings for each kind of result', () => {
    const td = presentationFeed(input({ final: { score: { type: 'touchdown', side: 0, points: 6, scorerId: person(7) } } }));
    expect(rulings(td)).toEqual(['touchdown']);
    const pick = presentationFeed(input({ final: { resultType: 'interception', possessionAfter: 1, changeOfPossession: true }, firstDown: false }));
    expect(rulings(pick)).toEqual(['interception']);
    expect(pick.cues.find((c) => c.kind === 'ruling' && c.ruling === 'interception')).toMatchObject({ favours: 1 });
    expect(rulings(presentationFeed(input({ final: { resultType: 'sack', yardsGained: -7 }, firstDown: false })))).toEqual(['sack']);
    expect(rulings(presentationFeed(input({ final: { resultType: 'pass_incomplete', incomplete: true, yardsGained: 0 }, firstDown: false })))).toEqual(['incomplete']);
    expect(rulings(presentationFeed(input({ final: { resultType: 'pass_incomplete', incomplete: true }, firstDown: false, turnoverOnDowns: true })))).toEqual(['incomplete', 'turnover_on_downs']);
    expect(rulings(presentationFeed(input({ final: { resultType: 'field_goal_missed' }, firstDown: false })))).toEqual(['field_goal_missed']);
    expect(rulings(presentationFeed(input({ final: { resultType: 'field_goal_good', score: { type: 'field_goal', side: 0, points: 3, scorerId: null } }, firstDown: false })))).toEqual(['field_goal_good']);
  });

  it('penalties and reviews: enforced foul favours the other side, offsetting favours nobody, review leads', () => {
    const enf = { enforced: [0], declined: [], offsetting: false, yardsWalked: -10 } as unknown as PlayOutcome['enforcement'];
    const p = presentationFeed(input({ fouls: [foul()], final: { enforcement: enf, noPlay: true }, firstDown: false }));
    expect(p.cues.filter((c) => c.kind === 'ruling')).toMatchObject([{ ruling: 'penalty', favours: 1 }]);
    const off = { enforced: [], declined: [], offsetting: true, yardsWalked: 0 } as unknown as PlayOutcome['enforcement'];
    const o = presentationFeed(input({ fouls: [foul(), foul({ side: 1 })], final: { enforcement: off, noPlay: true }, firstDown: false }));
    expect(o.cues.filter((c) => c.kind === 'ruling')).toMatchObject([{ ruling: 'penalty', favours: null }]);
    const rv = presentationFeed(input({ review: { reversed: true, favours: 1 }, final: { resultType: 'pass_incomplete', incomplete: true }, firstDown: false }));
    expect(rulings(rv)).toEqual(['review_reversed', 'incomplete']);
  });

  it('kick: the foot meeting the ball comes from the kick event, at its tick and spot, with the kicker slot', () => {
    const base = input();
    const kick = { type: 'kick', t: 1.3, kickKind: 'field_goal', kickerId: person(3), kickSpot: { x: LOS - 7, y: 26.65 }, landingSpot: { x: 110, y: 26.65 }, hangTimeS: 1.9, crossedLine: true, blockedById: null };
    const rec = { ...base.record, truth: { ...base.record.truth, events: [...base.record.truth.events, kick] } } as FeedRecord;
    const f = presentationFeed({ ...base, record: rec });
    const k = f.cues.find((c) => c.kind === 'kick');
    expect(k && k.kind === 'kick' && [k.tick, k.x, k.y, k.slots]).toEqual([Math.round(1.3 * TPS), LOS - 7, 26.65, [3]]);
    expect(JSON.stringify(k)).not.toMatch(/landingSpot|hangTime|blocked/);
  });

  it('post hit (CR-PV00-7): placed on its tick with the part struck; missing until the engine publishes it', () => {
    expect(presentationFeed(input()).missing).toContain('postHit');
    const f = presentationFeed(input({ extras: { ...FULL, postHits: [{ t: 2.0, x: 110, y: 27.5, part: 'upright' }] } }));
    const h = f.cues.find((c) => c.kind === 'postHit');
    expect(h && h.kind === 'postHit' && [h.tick, h.x, h.y, h.part]).toEqual([Math.round(2.0 * TPS), 110, 27.5, 'upright']);
    expect(f.missing).not.toContain('postHit');
    expect(presentationFeed(input({ extras: FULL })).cues.some((c) => c.kind === 'postHit')).toBe(false);
  });

  it('is pure: the same input gives the same feed, cues sorted with seq 0..n-1', () => {
    const a = presentationFeed(input({ extras: FULL, fouls: [foul()] }));
    const b = presentationFeed(input({ extras: FULL, fouls: [foul()] }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.cues.map((c) => c.seq)).toEqual(a.cues.map((_, i) => i));
    for (let i = 1; i < a.cues.length; i++) expect(a.cues[i]!.tick).toBeGreaterThanOrEqual(a.cues[i - 1]!.tick);
  });

  it('every cue kind and ruling it can emit is in the published lists (cue table keys)', () => {
    const f = presentationFeed(input({ extras: FULL, fouls: [foul()] }));
    for (const c of f.cues) {
      expect(FEED_CUE_KINDS).toContain(c.kind);
      if (c.kind === 'ruling') expect(RULING_KINDS).toContain(c.ruling);
    }
    expect(f.playId).toBe('7:12');
    expect(f.perspective).toEqual({ homeSide: 0, userSide: 0 });
  });
});
