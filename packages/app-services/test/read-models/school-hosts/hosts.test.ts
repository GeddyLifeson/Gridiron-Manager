// Plan item 3d: the school read model through the observer filter, and the player designer, editors and
// settings hosts. Each screen model parses through its @gm/schema read-model schema (P1.3.2), so no field
// is unclassed or truth, and the hosts only route: the cores decide.
import { describe, expect, it } from 'vitest';
import { EditorsData, PlayerDesignerData, READ_MODELS, SchoolData } from '@gm/schema';
import { DMATH, stream, deriveSeed, seedFromNumber, seedToHex } from '@gm/engine-core';
import { designer, generator } from '@gm/people';
import { ReadModelRegistry, buildReadModel, crawlReadModels, crawlPassed, observerFor, tablesOf, PUBLIC_OBSERVER } from '../../../src/observer/index.ts';
import { schoolSpec, SCHOOL_MODEL, emptySchoolInput, buildSchoolView, type SchoolView } from '../../../src/read-models/school/index.ts';
import { playerDesignerHost } from '../../../src/read-models/player-designer/index.ts';
import { editorsHost, buildEditorsView } from '../../../src/read-models/editors/index.ts';
import { settingsHost } from '../../../src/read-models/settings/index.ts';
import { settings } from '../../../src/index.ts';
import { fixtureTables, USER, ASSISTANT, AWAY_COACH } from '../../observer/fixture-world.ts';
import { CARD, EDITOR_DEFS, modEntries, schoolInput } from './fixture.ts';

function parses(schema: { safeParse(v: unknown): { success: boolean; error?: { issues: unknown[] } } }, v: unknown): void {
  const r = schema.safeParse(v);
  if (!r.success) throw new Error(JSON.stringify(r.error?.issues.slice(0, 4)));
}

describe('school read model (N5, G-27)', () => {
  const registry = () => new ReadModelRegistry().register(schoolSpec(SchoolData, (id) => (id === USER ? schoolInput(USER) : id === ASSISTANT ? emptySchoolInput(ASSISTANT, 'pro') : null)));

  it('is registered in READ_MODELS and gathers the teaching module figures', () => {
    expect(READ_MODELS.school).toBeDefined();
    const world = tablesOf(fixtureTables());
    const v = buildReadModel<SchoolView | null>(registry(), world, observerFor(world, USER), SCHOOL_MODEL).model.data!;
    expect(v.personId).toBe(USER);
    const lessons = v.map.courses.flatMap((c) => c.lessons);
    expect(lessons.find((l) => l.id === 'rules.downs')?.state).toBe('passed');
    expect(lessons.find((l) => l.id === 'rules.play_clock')?.state).toBe('attempted');
    expect(v.map.passed).toBe(1);
    expect(v.drills.callSpeed).toHaveLength(2);
    expect(v.drills.recognition.byFamily.map((a) => [a.key, a.n, a.correct])).toEqual([['cover_2', 1, 0], ['cover_3', 2, 1]]);
    expect(v.drills.recognition.mostMissed).toBe('cover_2');
    expect(v.drills.clock).toEqual([{ key: 'kneel_out', n: 2, correct: 2, share: 1 }, { key: 'timeout_use', n: 1, correct: 0, share: 0 }]);
    expect(v.current).toEqual(CARD);
    expect(v.development.offers[0]?.duty).toBe('play_calling_offense');
  });

  it('a new user sees every lesson not started; the public observer and a seat with no records get null', () => {
    const world = tablesOf(fixtureTables());
    const fresh = buildReadModel<SchoolView | null>(registry(), world, observerFor(world, ASSISTANT), SCHOOL_MODEL).model.data!;
    expect(fresh.map.passed).toBe(0);
    expect(fresh.map.courses.flatMap((c) => c.lessons).every((l) => l.state === 'not_started')).toBe(true);
    expect(buildReadModel(registry(), world, PUBLIC_OBSERVER, SCHOOL_MODEL).model.data).toBeNull();
    expect(buildReadModel(registry(), world, observerFor(world, AWAY_COACH), SCHOOL_MODEL).model.data).toBeNull();
  });

  it('a source that hands back someone else\'s records builds nothing', () => {
    const world = tablesOf(fixtureTables());
    const leaky = new ReadModelRegistry().register(schoolSpec(SchoolData, () => schoolInput(USER)));
    expect(buildReadModel(leaky, world, observerFor(world, ASSISTANT), SCHOOL_MODEL).model.data).toBeNull();
  });

  it('passes the crawler for every seat', () => {
    const world = tablesOf(fixtureTables());
    const observers = [USER, ASSISTANT, AWAY_COACH].map((id) => ({ name: `person ${id}`, observer: observerFor(world, id) })).concat([{ name: 'public', observer: PUBLIC_OBSERVER }]);
    const r = crawlReadModels({ registry, source: world, observers, params: () => [{}] });
    expect(r.errors).toEqual([]);
    expect(r.schemaHits).toEqual([]);
    expect(r.sentinelHits).toEqual([]);
    expect(crawlPassed(r)).toBe(true);
  });

  it('a college save builds and parses', () => {
    const v = buildSchoolView({ ...schoolInput(USER), level: 'college' });
    parses(SchoolData, v);
    expect(v.level).toBe('college');
  });
});

const seed = seedFromNumber(3);
const RND: generator.GeneratorRandom = { open: (n, s) => stream(seed, n, s), seedHex: (n, s) => seedToHex(deriveSeed(seed, n, s)), math: DMATH };
const ENV: designer.DesignerEnv = { rnd: RND, editorId: USER, at: { seasonYear: 2030, dayIndex: 200 }, defaultRegion: 'Generated Region', scaleId: 'decimal_5_9' };

describe('player designer host (D13.1)', () => {
  function make(world: designer.DesignerWorld) {
    let next = 500;
    const filed: designer.DesignedPlayer[] = [];
    const existing = generator.generatePlayer({
      personId: 77, position: 'LB', ageYears: 24, seasonYear: 2030, talent: { kind: 'pro_entrant' }, group: 'pro_player',
      homeRegion: 'Generated Region', hometown: null, classKey: { classYear: 2030, classType: 'test', slotIndex: 1 },
    }, RND).record;
    let w = world;
    const host = playerDesignerHost({
      world: () => w, seasonYear: () => 2030, nextPersonId: () => next, env: () => ENV,
      recordOf: (id) => (id === 77 ? existing : null),
      file: (p) => { filed.push(p); next = Math.max(next, p.record.id + 1); },
    });
    return { host, filed, setWorld: (x: designer.DesignerWorld) => { w = x; } };
  }

  it('serves the core view, which parses through PlayerDesignerData before and after a start', () => {
    const { host } = make({ kind: 'none' });
    expect(host.view()).toBeNull();
    host.open();
    parses(PlayerDesignerData, host.view());
    host.dispatch({ kind: 'start_archetype', position: 'DT', archetypeId: 'dt_three_technique' });
    const v = host.view()!;
    expect(v.hasSheet).toBe(true);
    parses(PlayerDesignerData, v);
    expect(READ_MODELS.playerDesigner).toBeDefined();
  });

  it('resolves a copy by person id; an unknown id is refused, not thrown', () => {
    const { host } = make({ kind: 'none' });
    host.dispatch({ kind: 'start_copy', personId: 999, inPlace: false });
    expect(host.view()!.result).toMatchObject({ ok: false, rule: 'D13.1.1' });
    host.dispatch({ kind: 'start_copy', personId: 77, inPlace: true });
    const v = host.view()!;
    expect(v.personId).toBe(77);
    expect(v.position).toBe('LB');
    parses(PlayerDesignerData, v);
  });

  it('a commit is filed through the port and the next new person takes the next id', () => {
    const { host, filed } = make({ kind: 'none' });
    host.dispatch({ kind: 'start_archetype', position: 'DT', archetypeId: 'dt_three_technique' });
    host.dispatch({ kind: 'set_sandbox', on: true });
    host.dispatch({ kind: 'commit' });
    const v = host.view()!;
    if (v.result?.ok !== true) throw new Error(JSON.stringify(v.result));
    expect(filed.map((p) => p.record.id)).toEqual([500]);
    expect(host.filed()).toEqual([500]);
  });

  it('access follows the live world: a career that starts closes the designer (D13.1.1), a certified one too (N4)', () => {
    const t = make({ kind: 'career', started: false, sandboxWorld: false, certified: false });
    t.host.dispatch({ kind: 'start_blank' });
    expect(t.host.view()!.hasSheet).toBe(true);
    t.setWorld({ kind: 'career', started: true, sandboxWorld: false, certified: false });
    t.host.dispatch({ kind: 'commit' });
    expect(t.host.view()!.result).toMatchObject({ ok: false, rule: 'D13.1.1' });
    expect(t.filed).toEqual([]);
    const c = make({ kind: 'career', started: false, sandboxWorld: true, certified: true });
    c.host.open();
    const v = c.host.view()!;
    expect(v.open).toBe(false);
    expect(v.refusal?.rule).toBe('N4');
    parses(PlayerDesignerData, v);
  });
});

describe('editors host (P7.1, P7.5)', () => {
  function make(certified: boolean, browser: boolean) {
    const calls: string[] = [];
    let entries = modEntries();
    const host = editorsHost({
      folder: () => (browser ? null : 'C:/Users/someone/Documents/Gridiron Manager/user-content'), certified: () => certified,
      scan: () => { calls.push('scan'); return entries; }, editors: () => EDITOR_DEFS,
      ...(browser ? { importPack: () => { calls.push('import'); entries = entries.slice(0, 1); } } : {}),
      exportErrors: (e) => calls.push(`export:${e.packId}`), openEditor: (id) => calls.push(`open:${id}`),
    });
    return { host, calls };
  }

  it('lists each pack with problems worst first and a neutralised count; parses through EditorsData', () => {
    const { host } = make(false, false);
    const v = host.view();
    parses(EditorsData, v);
    expect(READ_MODELS.editors).toBeDefined();
    const bad = v.packs.find((p) => p.packId === 'user.bad')!;
    expect(bad.problems.map((p) => p.severity)).toEqual(['error', 'warning']);
    expect(bad.neutralisedCount).toBe(2);
    expect(bad.selectable).toBe(false);
    expect(v.canImport).toBe(false);
    expect(v.folder).not.toBeNull();
  });

  it('rescans on request, exports a pack\'s errors, and refuses unknown packs or editors', () => {
    const { host, calls } = make(false, false);
    host.dispatch({ type: 'rescan' });
    host.dispatch({ type: 'export_errors', packId: 'user.bad', origin: 'bad-pack.zip' });
    host.dispatch({ type: 'export_errors', packId: 'user.none', origin: 'x' });
    expect(host.refusal()?.rule).toBe('P7.1.1');
    host.dispatch({ type: 'open_editor', editorId: 'nope' });
    expect(host.refusal()?.rule).toBe('P7.5.1');
    host.dispatch({ type: 'import' });
    expect(host.refusal()?.rule).toBe('P7.1.1');
    expect(calls).toEqual(['scan', 'scan', 'export:user.bad']);
  });

  it('the browser imports a file and rescans; the rule-set editor stays shut in a certified career', () => {
    const { host, calls } = make(true, true);
    expect(host.view().folder).toBeNull();
    expect(host.view().canImport).toBe(true);
    host.dispatch({ type: 'import' });
    expect(host.view().packs).toHaveLength(1);
    host.dispatch({ type: 'open_editor', editorId: 'rule-set-editor' });
    expect(host.refusal()).toMatchObject({ rule: 'P7.5.1' });
    host.dispatch({ type: 'open_editor', editorId: 'play-designer' });
    expect(host.refusal()).toBeNull();
    expect(calls).toEqual(['scan', 'import', 'scan', 'open:play-designer']);
    parses(EditorsData, buildEditorsView({ folder: null, canImport: false, certified: true, entries: [], editors: [] }));
  });
});

describe('settings host (O5.3.1)', () => {
  async function make(over: { certified?: boolean; midSeason?: boolean } = {}) {
    const { store } = await settings.SettingsStore.open(settings.memorySettingsBackend());
    const blocks: Record<string, settings.SettingValue>[] = [];
    const logged: settings.SettingChange[] = [];
    const host = settingsHost({
      store, certified: () => over.certified ?? false, afterCreation: () => true, midSeason: () => over.midSeason ?? false,
      writeSaveBlock: (b) => blocks.push(b), logChange: (c) => logged.push(c),
    });
    return { host, store, blocks, logged };
  }
  // The one save-scope setting that may change after creation (outside a certified career).
  const PACKS = 'gameplay.contentPacks';
  const userKey = () => settings.SETTINGS.find((d) => d.scope === 'user' && d.type === 'boolean')!;

  it('a save-scope change writes the save header, and the decision log only mid-season', async () => {
    const a = await make({ midSeason: false });
    a.host.set(PACKS, ['user.good']);
    await a.host.settled();
    expect(a.host.values()[PACKS]).toEqual(['user.good']);
    expect(a.blocks).toEqual([expect.objectContaining({ [PACKS]: ['user.good'] })]);
    expect(a.logged).toEqual([]);
    const b = await make({ midSeason: true });
    b.host.set(PACKS, ['user.good']);
    b.host.reset(PACKS);
    await b.host.settled();
    expect(b.logged.map((c) => c.to)).toEqual([['user.good'], []]);
    const c = await make({ certified: true, midSeason: true });
    c.host.set(PACKS, ['user.good']);
    await c.host.settled();
    expect(c.host.last()).toMatchObject({ ok: false });
    expect(c.logged).toEqual([]);
  });

  it('a user-scope change touches neither the save nor the log; a bad value is refused and kept as the last result', async () => {
    const d = userKey();
    const t = await make({ midSeason: true });
    t.host.set(d.key, !d.default);
    await t.host.settled();
    expect(t.blocks).toEqual([]);
    expect(t.logged).toEqual([]);
    t.host.set(d.key, 'not a boolean' as unknown as boolean);
    await t.host.settled();
    expect(t.host.last()?.ok).toBe(false);
  });

  it('a setting fixed at creation refuses after the career exists', async () => {
    const t = await make();
    t.host.set('gameplay.certified', true);
    await t.host.settled();
    expect(t.host.last()).toMatchObject({ ok: false });
    expect(t.blocks).toEqual([]);
  });
});
