import { describe, expect, it } from 'vitest';
import {
  CUE_TABLE, FEED_CADENCE_COUNTS, FEED_CAMERA_KINDS, FEED_KICK_KINDS, FEED_CONTACT_TIERS, FEED_RELAY_OUTCOMES, FEED_RULINGS,
  cueRow, cueRowId, scheduleLane, type CueRow, type CueSound,
} from '../../../src/presentation/cues/cue-table.ts';

const rows = CUE_TABLE.rows;
const sounds: { row: CueRow; sound: CueSound }[] = rows.flatMap((row) => row.sounds.map((sound) => ({ row, sound })));
const uniqueSounds = (lane: string) => {
  const m = new Map<string, CueSound>();
  for (const { sound } of sounds) if (sound.lane === lane) m.set(sound.id, sound);
  return [...m.values()];
};
const overlaps = (xs: { startMs: number; endMs: number }[]) => xs.some((a, i) => xs.some((b, j) => i < j && a.startMs < b.endMs && b.startMs < a.endMs));

describe('cue table shape (PV-02)', () => {
  it('has one row for every presentation feed cue kind', () => {
    const want = [
      ...FEED_CAMERA_KINDS.map((k) => cueRowId(k)),
      ...FEED_KICK_KINDS.map((k) => cueRowId(k)),
      ...FEED_CONTACT_TIERS.map((t) => cueRowId('contact', t)),
      ...FEED_CADENCE_COUNTS.map((c) => cueRowId('cadence', c)),
      ...FEED_RELAY_OUTCOMES.map((o) => cueRowId('relay', o)),
      ...FEED_RULINGS.map((g) => cueRowId('ruling', g)),
    ];
    expect(want).toHaveLength(37);
    for (const id of want) expect(cueRow(id), id).toBeDefined();
  });
  it('has unique row ids and unique sound ids', () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    // One sound may serve several rows only as the same object content (the shared turnover reaction).
    const byId = new Map<string, string>();
    for (const { sound } of sounds) {
      const j = JSON.stringify(sound);
      expect(byId.get(sound.id) ?? j, sound.id).toBe(j);
      byId.set(sound.id, j);
    }
  });
  it('no row lacks information, a source and a bible reference', () => {
    for (const r of rows) {
      expect(r.information.trim().length, r.id).toBeGreaterThan(20);
      expect(r.bible.length, r.id).toBeGreaterThan(0);
      expect(r.source.feedKind, r.id).toBeTruthy();
    }
  });
  it('is all user-visible (I9.3.2) and never reports who won a contest', () => {
    expect(CUE_TABLE.visibility).toBe('user-visible');
    const text = JSON.stringify(rows.map((r) => [r.information, r.sounds.map((s) => s.caption), r.caption]));
    expect(text).not.toMatch(/\b(winner|loser|won the|beat|advantage|true rating|truth)\b/i);
  });
  it('fires every feed cue on its event tick or the whistle tick, never early (MB-1)', () => {
    for (const r of rows.filter((x) => x.source.kind === 'feed' && x.source.feedKind !== 'result')) {
      expect(['event_tick', 'whistle_tick'], r.id).toContain(r.timing);
    }
  });
});

describe('every sound has a visual twin (O5.5.2)', () => {
  it('each sound row has a visual with a cue, a place and a setting switch', () => {
    for (const { row } of sounds) {
      expect(row.visual.cue, row.id).toMatch(/^[a-z0-9_]+$/);
      expect(['field', 'strip', 'banner', 'console', 'film'], row.id).toContain(row.visual.where);
      expect(row.visual.switch, row.id).toMatch(/^(display|audio|accessibility)\.[A-Za-z.]+$/);
    }
  });
  it('each sound has a caption for the captions strip', () => {
    for (const { sound } of sounds) expect(sound.caption.trim().length, sound.id).toBeGreaterThan(2);
  });
  it('a silent count has no sound but is still named', () => {
    const r = cueRow('cadence_silent')!;
    expect(r.sounds).toHaveLength(0);
    expect(r.caption).toBe('silent count');
  });
  it('every bus is one of the eight, and none is music (no music during play)', () => {
    const buses = ['master', 'crowd', 'officials', 'contact', 'cadence', 'ui', 'ambience', 'music'];
    for (const { sound } of sounds) { expect(buses).toContain(sound.bus); expect(sound.bus).not.toBe('music'); }
  });
  it('a sound in a lane has a rank, and crowd reaction ranks follow the MB-7 order and are distinct', () => {
    for (const { sound } of sounds) if (sound.lane !== 'none') expect(sound.rank, sound.id).toBeGreaterThan(0);
    const crowd = uniqueSounds('crowdReaction');
    const order = ['crowd_touchdown', 'crowd_turnover', 'crowd_big_gain', 'crowd_sack', 'crowd_flag_against_home', 'crowd_review_reversal'];
    expect(crowd.map((s) => s.id).sort()).toEqual([...order].sort());
    const ranks = order.map((id) => crowd.find((s) => s.id === id)!.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(order.length);
  });
});

describe('no two crowd reactions play at once, and stingers never overlap', () => {
  const crowdIds = uniqueSounds('crowdReaction').map((s) => s.id);
  const stingerIds = uniqueSounds('stinger').map((s) => s.id);

  it('every pair of crowd reactions fired at the same moment yields one voice', () => {
    for (const a of crowdIds) for (const b of crowdIds) {
      if (a === b) continue;
      expect(scheduleLane('crowdReaction', [{ soundId: a, tickMs: 1000 }, { soundId: b, tickMs: 1000 }]), `${a}+${b}`).toHaveLength(1);
    }
  });
  it('a better reaction cuts a worse one that is sounding; a worse one arriving later is dropped', () => {
    const cut = scheduleLane('crowdReaction', [{ soundId: 'crowd_sack', tickMs: 0 }, { soundId: 'crowd_touchdown', tickMs: 500 }]);
    expect(cut.map((x) => x.soundId)).toEqual(['crowd_sack', 'crowd_touchdown']);
    expect(cut[0]!.endMs).toBe(500);
    expect(overlaps(cut)).toBe(false);
    const drop = scheduleLane('crowdReaction', [{ soundId: 'crowd_touchdown', tickMs: 0 }, { soundId: 'crowd_sack', tickMs: 500 }]);
    expect(drop.map((x) => x.soundId)).toEqual(['crowd_touchdown']);
  });
  it('a play resolves to at most one crowd reaction from all of its rows', () => {
    // A touchdown play that was also a long gain, with a flag against the home side and a reversal.
    const req = ['crowd_review_reversal', 'crowd_flag_against_home', 'crowd_big_gain', 'crowd_touchdown'].map((soundId) => ({ soundId, tickMs: 4000 }));
    const out = scheduleLane('crowdReaction', req);
    expect(out.map((x) => x.soundId)).toEqual(['crowd_touchdown']);
  });
  it('the stinger lane never overlaps for any pair of stingers at any offset', () => {
    for (const a of stingerIds) for (const b of stingerIds) for (const gap of [0, 50, 150, 300, 600, 1200, 2500]) {
      expect(overlaps(scheduleLane('stinger', [{ soundId: a, tickMs: 0 }, { soundId: b, tickMs: gap }])), `${a}+${b}@${gap}`).toBe(false);
    }
  });
  it('a burst of stingers still never overlaps, and nothing starts before it was asked for', () => {
    const burst = Array.from({ length: 40 }, (_, i) => ({ soundId: stingerIds[i % stingerIds.length]!, tickMs: i * 90 }));
    const out = scheduleLane('stinger', burst);
    expect(out.length).toBeGreaterThan(0);
    expect(overlaps(out)).toBe(false);
    for (const o of out) expect(burst.some((b) => b.soundId === o.soundId && b.tickMs <= o.startMs)).toBe(true);
  });
  it('is deterministic', () => {
    const req = [{ soundId: 'whistle', tickMs: 10 }, { soundId: 'referee_mic_tone', tickMs: 200 }, { soundId: 'alert_injury', tickMs: 300 }];
    expect(scheduleLane('stinger', req)).toEqual(scheduleLane('stinger', req));
  });
  it('the whistle is the top stinger, and a penalty has a tone then a conditional groan', () => {
    const whistle = uniqueSounds('stinger').find((s) => s.id === 'whistle')!;
    for (const s of uniqueSounds('stinger')) expect(whistle.rank).toBeLessThanOrEqual(s.rank);
    const pen = cueRow('ruling_penalty')!;
    expect(pen.sounds.map((s) => s.id)).toEqual(['referee_mic_tone', 'crowd_flag_against_home']);
    expect(pen.sounds[1]!.condition).toMatch(/visitor/);
  });
});

describe('era variants (plan 2.1)', () => {
  it('every row has a plain and a classic variant', () => {
    for (const r of rows) { expect(r.era.plain.length, r.id).toBeGreaterThan(0); expect(r.era.classic.length, r.id).toBeGreaterThan(0); }
  });
  it('the whistle warbles in the classic skin, and the projector exists only in film and is off by default', () => {
    expect(cueRow('whistle')!.era.classic).toMatch(/pea/i);
    const p = cueRow('film_projector')!;
    expect(p.visual.where).toBe('film');
    expect(p.sounds[0]!.filmOnly).toBe(true);
    expect(p.sounds[0]!.defaultOn).toBe(false);
  });
  it('organ and band in stoppages carry a gate and ship off until the period fact is checked', () => {
    const a = cueRow('ambience_stoppage')!;
    expect(a.era.gate).toMatch(/PV-10/);
    expect(a.sounds[0]!.defaultOn).toBe(false);
    expect(a.deferred).toBe(true);
  });
  it('carries no real league, team, broadcaster or film-company marks anywhere', () => {
    expect(JSON.stringify(CUE_TABLE)).not.toMatch(/\b(NFL|NCAA|ESPN|CBS|NBC|ABC|Fox|Madden|Monday Night|shield|theme song)\b/);
  });
  it('field cues respect the live-field rules: no flash, shake, hit stop or slow motion', () => {
    for (const r of rows.filter((x) => x.visual.where === 'field')) {
      expect(JSON.stringify(r.visual) + r.information, r.id).not.toMatch(/flash|shake|hit.?stop|slow.?mo/i);
    }
    expect(cueRow('fumble')!.visual.cue).toBe('loose_ball_ring');
  });
  it('film-only sounds have a film visual', () => {
    for (const r of rows) if (r.sounds.some((s) => s.filmOnly)) expect(r.visual.where).toBe('film');
  });
});

describe('big gain and crowd bed', () => {
  it('big gain has no threshold yet; PV-08 sets a sourced one', () => {
    expect(cueRow('big_gain')!.threshold).toBeNull();
  });
  it('the crowd bed is driven by the engine noise, as the noise meter', () => {
    const r = cueRow('crowd_bed')!;
    expect(r.source.qualifier).toBe('noise');
    expect(r.visual.cue).toBe('noise_meter');
  });
});
