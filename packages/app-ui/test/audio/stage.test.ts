// Sound stage: the composition step that starts the sound stack. Engine from the G-98 settings, menu
// music on menu screens only, each play's PV-00 feed into crowd, cadence, ambience and field sounds,
// and every sound named on the captions strip on its tick.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { FakeAudioContext } from '../../src/audio/engine/index.ts';
import {
  CAMERA_CUE_SOUND, RULING_STINGER, SoundStage, SoundStageCaptions, fieldSoundFor, placeFromNav, planFieldSounds, settingsGetter,
  type StageFeed,
} from '../../src/audio/stage/index.ts';
import { CUE_TABLE } from '../../src/presentation/cues/cue-table.ts';
import { RECIPE_CUE_SOUND, captionForRow, captionForSound } from '../../src/presentation/captions/index.ts';
import { SCREENS, initialNav } from '../../src/shell/index.ts';
import recorded from './crowd/recorded-game.json' with { type: 'json' };

const DEFAULTS: Record<string, unknown> = {
  'audio.masterVolume': 100, 'audio.masterOn': true,
  'audio.crowdVolume': 100, 'audio.crowdOn': true,
  'audio.officialsVolume': 100, 'audio.officialsOn': true,
  'audio.contactVolume': 100, 'audio.contactOn': true,
  'audio.cadenceVolume': 100, 'audio.cadenceOn': true,
  'audio.uiVolume': 100, 'audio.uiOn': true,
  'audio.ambienceVolume': 100, 'audio.ambienceOn': false,
  'audio.musicVolume': 100, 'audio.menuMusicOn': false,
  'audio.mono': false, 'accessibility.captions': 'auto',
};

function stageWith(over: Record<string, unknown> = {}) {
  const ac = new FakeAudioContext();
  const values = { ...DEFAULTS, ...over };
  return { ac, values, stage: new SoundStage({ ctx: ac, settings: settingsGetter(values) }) };
}

const CONDITIONS = { noise: 0.6, noiseBase: 0.85, windMph: 0, windDirDeg: 0, gustMph: 0, precip: 'none', roof: 'open', daylight: true } as const;

function feed(playId: string, cues: StageFeed['cues'], over: Partial<StageFeed> = {}): StageFeed {
  return {
    formatVersion: 1, visibility: 'user-visible', playId, ticksPerSecond: 10,
    perspective: { homeSide: 0, userSide: 0 }, conditions: CONDITIONS,
    result: { yardsGained: 4, noPlay: false }, cues, missing: [], ...over,
  } as StageFeed;
}

/** Runs the frame loop from the context's current time to `until`, in 50 ms steps. */
function runTo(ac: FakeAudioContext, stage: SoundStage, until: number) {
  const out = { cadence: [] as ReturnType<SoundStage['frame']>['cadence'], field: [] as ReturnType<SoundStage['frame']>['field'] };
  while (ac.currentTime < until) {
    ac.currentTime = Math.round((ac.currentTime + 0.05) * 1000) / 1000;
    const r = stage.frame();
    out.cadence.push(...r.cadence); out.field.push(...r.field);
  }
  return out;
}

const PLAY = feed('7:12', [
  { kind: 'cadence', seq: 1, tick: -20, side: 1, count: 'voiced' },
  { kind: 'cadence', seq: 2, tick: -10, side: 1, count: 'silent' },
  { kind: 'snap', seq: 3, tick: 0, x: 40, y: 26, slots: [] },
  { kind: 'contact', seq: 4, tick: 12, x: 42, y: 26, tier: 3, slots: [] },
  { kind: 'tackle', seq: 5, tick: 30, x: 46, y: 20, slots: [] },
  { kind: 'whistle', seq: 6, tick: 31, x: 46, y: 20, slots: [] },
  { kind: 'ruling', seq: 7, tick: 31, ruling: 'touchdown', favours: 0 },
] as unknown as StageFeed['cues']);

describe('engine from the G-98 settings', () => {
  it('builds every bus volume, switch and mono from the store, and follows later changes', () => {
    const { stage, values } = stageWith({ 'audio.masterVolume': 50, 'audio.crowdOn': false, 'audio.mono': true });
    expect(stage.engine.busSetting('master')).toEqual({ volumePct: 50, on: true });
    expect(stage.engine.busSetting('crowd').on).toBe(false);
    expect(stage.engine.busSetting('ambience').on).toBe(false);
    expect(stage.engine.busSetting('music').on).toBe(false);
    stage.applySettings(settingsGetter({ ...values, 'audio.crowdOn': true, 'audio.contactVolume': 30, 'audio.mono': false }));
    expect(stage.engine.busSetting('crowd').on).toBe(true);
    expect(stage.engine.busSetting('contact').volumePct).toBe(30);
  });

  it('pans mono to the centre when the setting is on', () => {
    const { ac, stage } = stageWith({ 'audio.mono': true });
    stage.setPlace({ hub: 'game', inGame: true, offseason: false });
    stage.play(PLAY, { tick0At: 1 });
    const r = runTo(ac, stage, 4);
    const contact = r.field.find((e) => e.kind === 'contact')!;
    expect(contact.outcome.played && contact.outcome.pan).toBe(0);
  });
});

describe('menu music follows the screen', () => {
  it('is off by default', () => {
    const { stage } = stageWith();
    stage.setPlace({ hub: 'week', inGame: false, offseason: false });
    expect(stage.musicTrack).toBeNull();
  });

  it('plays on menu screens and never on game or film screens or during a game', () => {
    const { stage, values } = stageWith({ 'audio.menuMusicOn': true });
    expect(stage.engine.busSetting('music').on).toBe(true);
    stage.setPlace({ hub: 'title', inGame: false, offseason: false });
    expect(stage.musicTrack).toBe('title');
    stage.setPlace({ hub: 'week', inGame: false, offseason: false });
    expect(stage.musicTrack).toBe('weekHub');
    stage.setPlace({ hub: 'film', inGame: false, offseason: false });
    expect(stage.musicTrack).toBeNull();
    stage.setPlace({ hub: 'week', inGame: false, offseason: true });
    expect(stage.musicTrack).toBe('offseason');
    stage.setPlace({ hub: 'game', inGame: true, offseason: false });
    expect(stage.musicTrack).toBeNull();
    // A reference screen opened during a game (glossary, settings) is still under the game.
    stage.setPlace({ hub: 'league', inGame: true, offseason: false });
    expect(stage.musicTrack).toBeNull();
    stage.setPlace({ hub: 'coach', inGame: false, offseason: false });
    expect(stage.musicTrack).toBe('career');
    stage.applySettings(settingsGetter({ ...values, 'audio.menuMusicOn': false }));
    expect(stage.musicTrack).toBeNull();
  });

  it('takes the place from the shell navigation: game day is in the game on any screen', () => {
    const nav = initialNav('/week/schedule');
    const week = placeFromNav(nav, SCREENS);
    expect(week.inGame).toBe(false);
    expect(placeFromNav({ ...nav, mode: 'gameday' }, SCREENS).inGame).toBe(true);
    const consoleScreen = SCREENS.find((s) => s.id === 'game.console')!;
    expect(placeFromNav({ ...nav, location: { ...nav.location, screenId: consoleScreen.id } }, SCREENS)).toMatchObject({ hub: 'game', inGame: true });
  });
});

describe('a play feed drives the stack on its ticks', () => {
  it('plays cadence, snap, contact and whistle on their ticks and the crowd reaction on the ruling', () => {
    const { ac, stage } = stageWith();
    stage.setPlace({ hub: 'game', inGame: true, offseason: false });
    const report = stage.play(PLAY, { tick0At: 3 });
    expect(report.bed).toMatchObject({ action: 'set', level: 0.6 });
    expect(report.reaction?.pick.soundId).toBe('crowd.react.touchdown');
    expect(report.reaction?.at).toBeCloseTo(3 + 3.1, 6);

    const r = runTo(ac, stage, 7);
    expect(r.cadence.map((e) => [e.detail, e.at])).toEqual([['voiced', 1], ['silent', 2]]);
    expect(r.cadence[0]!.outcome.played).toBe(true);
    expect(r.cadence[1]!.outcome).toEqual({ played: false, reason: 'silent-count' });
    expect(r.field.map((e) => [e.soundId, e.at])).toEqual([['contact.snap', 3], ['contact.hit.tier3', 4.2], ['officials.whistle.deadBall', 6.1]]);
    for (const e of r.field) expect(e.outcome.played).toBe(true);
    // Contact pans to its field x; the snap at x 40 is left of centre (view centre 60).
    const snap = r.field[0]!.outcome;
    expect(snap.played && snap.pan).toBeLessThan(0);
  });

  it('never plays a cue before its tick or twice', () => {
    const { ac, stage } = stageWith();
    stage.play(PLAY, { tick0At: 3 });
    const early = runTo(ac, stage, 2.5);
    expect(early.field).toHaveLength(0);
    const rest = runTo(ac, stage, 9);
    expect(rest.field.map((e) => e.seq)).toEqual([3, 4, 6]);
    for (const e of [...early.cadence, ...early.field, ...rest.field]) expect(e.at).toBeLessThanOrEqual(ac.currentTime + 0.2);
  });

  it('plays the mic tone on a penalty or review ruling, centred', () => {
    const { ac, stage } = stageWith();
    stage.play(feed('7:13', [{ kind: 'flag', seq: 1, tick: 5, x: 30, y: 10, slots: [], against: 1 }, { kind: 'ruling', seq: 2, tick: 40, ruling: 'penalty', favours: 0 }] as unknown as StageFeed['cues']), { tick0At: 1 });
    const r = runTo(ac, stage, 6);
    expect(r.field.map((e) => e.soundId)).toEqual(['officials.micTone']);
    const o = r.field[0]!.outcome;
    expect(o.played && o.pan).toBe(0);
  });

  it('holds the crowd bed when the feed has no noise value, and eases weather beds from the feed', () => {
    const { stage } = stageWith({ 'audio.ambienceOn': true });
    stage.setPlace({ hub: 'game', inGame: true, offseason: false });
    stage.play(PLAY, { tick0At: 1 });
    const rainy = feed('7:14', [], { conditions: { ...CONDITIONS, noise: null, windMph: 18, precip: 'rain' } } as Partial<StageFeed>);
    const r = stage.play(rainy, { tick0At: 3 });
    expect(r.bed).toEqual({ action: 'held', level: 0.6 });
    expect(stage.engine.bed('ambience.rain')?.source).toBe('synth');
    expect(stage.engine.bed('ambience.wind')?.source).toBe('synth');
  });

  it('leaving the game stops the crowd and weather beds; music may start again', () => {
    const { stage } = stageWith({ 'audio.ambienceOn': true, 'audio.menuMusicOn': true });
    stage.setPlace({ hub: 'game', inGame: true, offseason: false });
    stage.play(feed('1:1', [], { conditions: { ...CONDITIONS, precip: 'rain' } } as Partial<StageFeed>), { tick0At: 1 });
    expect(stage.engine.bed('crowd.bed')).not.toBeNull();
    stage.setPlace({ hub: 'week', inGame: false, offseason: false });
    expect(stage.inGame).toBe(false);
    expect(stage.engine.bed('crowd.bed')).toBeNull();
    expect(stage.engine.bed('ambience.rain')).toBeNull();
    expect(stage.musicTrack).toBe('weekHub');
  });

  it('replays a recorded real game (PV-08 fixture) end to end without a refused feed', () => {
    const { ac, stage } = stageWith();
    stage.setPlace({ hub: 'game', inGame: true, offseason: false });
    let reactions = 0;
    for (const p of (recorded as { plays: Record<string, unknown>[] }).plays) {
      const f = { ...p, visibility: 'user-visible', conditions: { ...CONDITIONS, ...(p.conditions as object) } } as unknown as StageFeed;
      const report = stage.play(f, { tick0At: ac.currentTime + 0.5 });
      expect(report.bed.action).not.toBe('refused');
      if (report.reaction) reactions++;
      runTo(ac, stage, ac.currentTime + 0.5 + Math.max(0, ...f.cues.map((c) => c.tick)) / f.ticksPerSecond + 0.3);
    }
    expect(reactions).toBeGreaterThan(0);
  });
});

describe('captions name every sound the feed asks for, on its tick', () => {
  it('names the cadence, the silent count, the snap, contact, whistle and crowd at their times', () => {
    const { ac, stage } = stageWith({ 'accessibility.captions': 'on' });
    stage.setPlace({ hub: 'game', inGame: true, offseason: false });
    stage.play(PLAY, { tick0At: 3 });
    const seen = new Map<string, number>();
    while (ac.currentTime < 8) {
      ac.currentTime = Math.round((ac.currentTime + 0.05) * 1000) / 1000;
      stage.frame();
      for (const l of stage.captionLines()) if (!seen.has(l.text)) seen.set(l.text, l.fromMs);
    }
    const at = (text: string | null) => seen.get(text!);
    expect(at(captionForSound('cadence.voiced'))).toBeGreaterThanOrEqual(1000);
    expect(at(captionForRow('cadence_silent'))).toBeGreaterThanOrEqual(2000);
    expect(at(captionForSound('contact.snap'))).toBeGreaterThanOrEqual(3000);
    expect(at(captionForSound('contact.hit.tier3'))).toBeGreaterThanOrEqual(4200);
    expect(at(captionForSound('officials.whistle.deadBall'))).toBeGreaterThanOrEqual(6100);
    expect(at(captionForSound('crowd.react.touchdown'))).toBeGreaterThanOrEqual(6100);
    // Nothing shows before its tick.
    expect(at(captionForSound('contact.hit.tier3'))).toBeLessThan(4200 + 500);
  });

  it('still names a sound whose bus is off: with sound off the captions are the sound', () => {
    const { ac, stage } = stageWith({ 'audio.contactOn': false, 'audio.crowdOn': false, 'accessibility.captions': 'on' });
    stage.setPlace({ hub: 'game', inGame: true, offseason: false });
    stage.play(PLAY, { tick0At: 1 });
    const r = runTo(ac, stage, 3);
    expect(r.field.find((e) => e.kind === 'contact')!.outcome).toEqual({ played: false, reason: 'bus-off' });
    const texts: string[] = [];
    ac.currentTime = 1.25;
    for (const l of stage.captionLines(2250)) texts.push(l.text);
    expect(texts).toContain(captionForSound('contact.hit.tier3'));
  });

  it('shows the strip by the captions setting: auto only when nothing can be heard', () => {
    expect(stageWith().stage.captionsShown).toBe(false);
    expect(stageWith({ 'audio.masterOn': false }).stage.captionsShown).toBe(true);
    expect(stageWith({ 'audio.masterVolume': 0 }).stage.captionsShown).toBe(true);
    expect(stageWith({ 'accessibility.captions': 'on' }).stage.captionsShown).toBe(true);
    expect(stageWith({ 'accessibility.captions': 'off', 'audio.masterOn': false }).stage.captionsShown).toBe(false);
  });

  it('the view renders nothing without a stage, and a hidden strip until the first frame', () => {
    expect(renderToStaticMarkup(createElement(SoundStageCaptions, { stage: null }))).toBe('');
    const { stage } = stageWith({ 'accessibility.captions': 'on' });
    expect(renderToStaticMarkup(createElement(SoundStageCaptions, { stage, schedule: () => () => {} }))).toBe('');
  });
});

describe('field sounds match the PV-02 cue table', () => {
  const feedRows = CUE_TABLE.rows.filter((r) => r.source.kind === 'feed' || ['kick', 'post_hit'].includes(r.id));

  it('every feed cue with a non-crowd, non-cadence sound plays that sound, and silent cues play none', () => {
    for (const row of feedRows) {
      if (row.id === 'big_gain' || row.id === 'crowd_bed' || row.id.startsWith('weather_')) continue;
      const kind = row.source.feedKind;
      if (kind === 'cadence' || kind === 'relay') continue;
      const want = row.sounds.filter((s) => s.lane !== 'crowdReaction').map((s) => s.id);
      const cue = kind === 'contact' ? { kind, seq: 1, tick: 0, tier: Number(String(row.source.qualifier).replace('tier ', '')) }
        : kind === 'ruling' ? { kind, seq: 1, tick: 0, ruling: row.source.qualifier ?? '' }
        : { kind: row.id === 'post_hit' ? 'postHit' : row.id === 'kick' ? 'kick' : kind, seq: 1, tick: 0 };
      const got = fieldSoundFor(cue);
      expect(got === null ? [] : [RECIPE_CUE_SOUND[got]], row.id).toEqual(want);
    }
  });

  it('every mapped recipe has a caption', () => {
    for (const id of [...Object.values(CAMERA_CUE_SOUND), ...Object.values(RULING_STINGER)]) expect(captionForSound(id), id).not.toBeNull();
  });

  it('plans in tick order and never pans the mic tone', () => {
    const plan = planFieldSounds(PLAY);
    expect(plan.map((p) => p.tick)).toEqual([0, 12, 31]);
    const ruling = planFieldSounds(feed('x', [{ kind: 'ruling', seq: 1, tick: 3, ruling: 'review_reversed', favours: 1, x: 10 }] as unknown as StageFeed['cues']));
    expect(ruling[0]!.fieldX).toBeUndefined();
  });
});

describe('the shell mounts the strip', () => {
  it('renders the captions slot only when a stage is given', async () => {
    const { Shell } = await import('../../src/shell/index.ts');
    const { stage } = stageWith();
    expect(renderToStaticMarkup(createElement(Shell, { initialPath: '/week/schedule' }))).not.toContain('gm-captions"');
    expect(renderToStaticMarkup(createElement(Shell, { initialPath: '/week/schedule', soundStage: stage }))).toContain('class="gm-captions"');
  });
});
