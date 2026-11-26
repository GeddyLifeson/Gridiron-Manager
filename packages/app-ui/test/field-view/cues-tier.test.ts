// PV-04 field cues by contact tier (plans/presentation-build-plan.md section 8; O6.4.1, MB-1, MB-2, MB-17;
// section 7 no-flashing rule through the PR 209 flash limiter).
import { describe, expect, it } from 'vitest';
import {
  FieldRenderer, buildCues, limitFlashes, switchedOn, cueSwitch, CUE_FOR, resolveTeamColours, lastTick, param,
  type FieldContact, type RenderOptions, type FilmEventKind, type Cue,
} from '../../src/field-view/index.ts';
import { CUE_TABLE } from '../../src/presentation/cues/cue-table.ts';
import { FLASH_RULE, maxInWindow } from '../../src/presentation/flash/flash.ts';
import { fixturePlay, PRO, RecordingContext } from './fixtures.ts';

const colours = resolveTeamColours({ primary: '#ffffff', alternate: '#000000' }, { primary: '#101010', alternate: '#ffffff' });
const base: RenderOptions = { mode: 'film', orientation: 'offenseUp', zoom: 'wide', userSide: 0, colours };
/** FIXTURE contacts: offensive line slots 0 to 4 against defensive slots 11 to 14, one per tier. */
const contacts: FieldContact[] = [
  { kind: 'contact', tick: 2, x: 35, y: 26, tier: 1, slots: [0, 11] },
  { kind: 'contact', tick: 3, x: 35, y: 27, tier: 2, slots: [1, 12] },
  { kind: 'contact', tick: 4, x: 35, y: 28, tier: 3, slots: [2, 13] },
  { kind: 'contact', tick: 32, x: 50, y: 20, tier: 4, slots: [9, 20] },
];
const EPS = 1e-6;

describe('cues fire on the event tick (MB-1)', () => {
  it('appear exactly at the tick, not a hair before, and leave after cueSeconds', () => {
    const play = fixturePlay();
    const r = new FieldRenderer(play, PRO, { ...base, contacts });
    r.resize(960, 600);
    const len = param('cueSeconds') * play.ticksPerSecond;
    const events: { tick: number; ref: unknown }[] = [...play.events.filter((e) => CUE_FOR[e.kind]).map((e) => ({ tick: e.tick, ref: e })), ...contacts.map((c) => ({ tick: c.tick, ref: c }))];
    for (const ev of events) {
      r.update(ev.tick - EPS, 0); expect(r.cuesShown().some((c) => c.event === ev.ref), `before ${ev.tick}`).toBe(false);
      r.update(ev.tick, 0); expect(r.cuesShown().some((c) => c.event === ev.ref), `at ${ev.tick}`).toBe(true);
      r.update(ev.tick + len - EPS, 0); expect(r.cuesShown().some((c) => c.event === ev.ref)).toBe(true);
      // Past the last stored tick the view holds the final frame, so only check the end inside the play.
      if (ev.tick + len <= lastTick(r.frames)) { r.update(ev.tick + len, 0); expect(r.cuesShown().some((c) => c.event === ev.ref), `after ${ev.tick}`).toBe(false); }
    }
  });
});

describe('contact bars carry the engine tier (MB-2)', () => {
  it('draws one bar per showing contact, with the cue tier, heavier for higher tiers', () => {
    const r = new FieldRenderer(fixturePlay(), PRO, { ...base, contacts });
    r.resize(960, 600);
    const widths = new Map<number, number>();
    for (const c of contacts) {
      r.update(c.tick, 0); r.draw(new RecordingContext());
      const showing = contacts.filter((k) => k.tick <= c.tick && c.tick < k.tick + param('cueSeconds') * 10);
      expect(r.contactBars().map((b) => b.tier).sort()).toEqual(showing.map((k) => k.tier).sort());
      widths.set(c.tier, r.contactBars().find((b) => b.tier === c.tier)!.widthPx);
    }
    for (let t = 2; t <= 4; t++) expect(widths.get(t)!).toBeGreaterThan(widths.get(t - 1)!);
  });
  it('never makes a tier of its own: with the feed source, engaged markers alone draw no bar', () => {
    const r = new FieldRenderer(fixturePlay(), PRO, { ...base, contacts: [] });
    r.resize(960, 600);
    const f = r.frames;
    for (let t = f.firstTick; t <= lastTick(f); t++) { r.update(t, 0); r.draw(new RecordingContext()); expect(r.contactBars()).toEqual([]); }
  });
  it('without the feed source, falls back to the untiered engaged bar', () => {
    const r = new FieldRenderer(fixturePlay(), PRO, base);
    r.resize(960, 600); r.update(10, 0); r.draw(new RecordingContext());
    expect(r.contactBars().length).toBeGreaterThan(0);
    expect(r.contactBars().every((b) => b.tier === 0)).toBe(true);
  });
  it('refuses a tier outside 1 to 4', () => {
    expect(() => buildCues([], 10, [{ ...contacts[0]!, tier: 5 as 1 }])).toThrow();
  });
});

describe('fumble is a loose-ball ring, not a flash (A-4)', () => {
  it('maps fumble to looseRing and no cue shape is a flash', () => {
    expect(CUE_FOR.fumble).toBe('looseRing');
    expect(Object.values(CUE_FOR)).not.toContain('flash');
    const fumbleRow = CUE_TABLE.rows.find((r) => r.id === 'fumble')!;
    expect(fumbleRow.visual.cue).toBe('loose_ball_ring');
  });
});

describe('each cue has its own switch (MB-17)', () => {
  it('reads every field cue switch from the cue table', () => {
    for (const kind of Object.keys(CUE_FOR) as FilmEventKind[]) {
      const row = CUE_TABLE.rows.find((r) => r.id === kind)!;
      expect(cueSwitch(kind)).toBe(row.visual.switch);
    }
    for (const t of [1, 2, 3, 4] as const) expect(cueSwitch('contact', t)).toBe('display.cue.contactBar');
  });
  it('a switch turned off removes only its cues', () => {
    const play = fixturePlay();
    const all = buildCues(play.events, 10, contacts);
    const off = switchedOn(all, { 'display.cue.flag': false });
    expect(off.some((c) => c.shape === 'flag')).toBe(false);
    expect(off.length).toBe(all.length - all.filter((c) => c.shape === 'flag').length);
    const r = new FieldRenderer(play, PRO, { ...base, contacts, cueSwitches: { 'display.cue.contactBar': false } });
    r.resize(960, 600); r.update(4, 0); r.draw(new RecordingContext());
    expect(r.contactBars()).toEqual([]);
    expect(r.cuesShown().some((c) => c.shape === 'contact')).toBe(false);
  });
});

describe('flash limiter (plan section 7, PR 209)', () => {
  /** A burst: a contact every 5 ticks (0.5 s) for 15 s, each a fresh onset (the 0.4 s cue ends before the next). Two a second at real speed, four at double. */
  const burst: FieldContact[] = Array.from({ length: 30 }, (_, i) => ({ kind: 'contact' as const, tick: i * 5, x: 30, y: 20, tier: 2 as const, slots: [0, 11] }));
  const onsetMs = (cues: readonly Cue[], speed: number) => {
    const byShape = new Map<string, number[]>();
    const until = new Map<string, number>();
    for (const c of cues) {
      const u = until.get(c.shape) ?? -Infinity;
      if (c.fromTick >= u) byShape.set(c.shape, [...(byShape.get(c.shape) ?? []), (c.fromTick / 10 / speed) * 1000]);
      until.set(c.shape, Math.max(u, c.toTick));
    }
    return byShape;
  };
  it('keeps every shape at three onsets or fewer in any second, at every speed', () => {
    for (const speed of [0.25, 0.5, 1, 2]) {
      const { kept, dropped } = limitFlashes(buildCues([], 10, burst), 10, speed);
      for (const times of onsetMs(kept, speed).values()) expect(maxInWindow(times), `speed ${speed}`).toBeLessThanOrEqual(FLASH_RULE.maxFlashesPerSecond);
      expect(kept.length + dropped.length).toBe(burst.length);
      if (speed === 2) expect(dropped.length).toBeGreaterThan(0); else expect(dropped).toEqual([]);
    }
  });
  it('does not move a kept cue off its tick', () => {
    const { kept } = limitFlashes(buildCues([], 10, burst), 10, 2);
    for (const c of kept) expect(c.fromTick).toBe(c.event.tick);
  });
  it('lets the fixture play through untouched at real and double speed', () => {
    const play = fixturePlay();
    for (const speed of [1, 2]) {
      const r = new FieldRenderer(play, PRO, { ...base, contacts, speed });
      expect(r.cuesDropped()).toEqual([]);
    }
  });
  it('setSpeed re-applies the limit', () => {
    const r = new FieldRenderer(fixturePlay(), PRO, { ...base, contacts: burst, speed: 2 });
    expect(r.cuesDropped().length).toBeGreaterThan(0);
    r.setSpeed(1);
    expect(r.cuesDropped()).toEqual([]);
  });
});
