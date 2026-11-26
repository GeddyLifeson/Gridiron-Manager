// G-67 screens: the library read model (O3.3.1) shows exactly what the G3.5.1 search returns, the lock state
// of every control names who holds it (G3.4.3), and the commands go through the job check first.
import { describe, expect, it } from 'vitest';
import { playbook as pb } from '@gm/football-content';
import { buildPlaybookView, filterOf } from '../../../src/read-models/playbook/index.ts';
import { runPlaybookCommand, type CommandContext, type PlaybookState } from '../../../src/commands/playbook/index.ts';
import { book1000, COORDINATOR, POSITION_COACH, starter, TEAM, validate } from './fixture.ts';

const view = (filter = {}, over = {}) => buildPlaybookView({ ...starter(), teamId: TEAM, side: 'offense', filter, ...over });

describe('playbook library read model (O3.3.1)', () => {
  it('lists every live offense play with its rendered call, parts and length', () => {
    const s = starter();
    const v = view();
    const live = [...s.book.plays.values()].filter((p) => p.book === 'offense' && p.status !== 'retired');
    expect(v.rows.map((r) => r.id).sort()).toEqual(live.map((p) => p.id).sort());
    expect(v.total).toBe(live.length);
    for (const r of v.rows) {
      expect(r.call.length).toBeGreaterThan(0);
      expect(r.lengthS).toBeGreaterThan(0);
      expect(r.formation).not.toBe('');
    }
    expect(v.sections.reduce((n, x) => n + x.count, 0)).toBe(live.length);
  });
  it('usage and call records show with their sample; plays with no sample show none', () => {
    const v = view();
    const first = v.rows.find((r) => r.called > 0)!;
    expect(first).toMatchObject({ called: 6, lastCalledWeek: 3, readinessEstimate: 0.8, avgResult: 5.5, sample: 6 });
    expect(v.rows.filter((r) => r.id !== first.id).every((r) => r.avgResult === null && r.sample === 0 && r.readinessEstimate === null)).toBe(true);
  });
  it('filters return exactly what the G3.5.1 search returns', () => {
    const s = starter();
    const opt = view().options.formation[0]!;
    const formation = opt.id;
    const v = view({ formation });
    expect(v.rows.length).toBeGreaterThan(0);
    const parse = pb.buildIndex(s.book, s.words, s.template);
    const want = pb.search(pb.buildSearchIndex(s.book, s.words, parse), { book: 'offense', formation, includeRetired: false }, s.usage).map((p) => p.id);
    expect(v.rows.map((r) => r.id)).toEqual(want);
    expect(v.rows.every((r) => r.formation === opt.word)).toBe(true);
  });
  it('flat read-model parameters become the filter (empty and null fields drop out)', () => {
    expect(filterOf({ teamId: 1, side: 'offense', text: '', formation: 'Trips', role: null, includeRetired: true })).toEqual({ formation: 'Trips', includeRetired: true });
  });
  it('a coordinator holds his side; a position coach sees locks that name the holder and offer a suggestion', () => {
    expect(view().locks.edit_side_playbook).toEqual({ allowed: true, heldBy: null, suggest: false });
    const locked = view({}, { holder: POSITION_COACH }).locks.edit_side_playbook;
    expect(locked).toEqual({ allowed: false, heldBy: 'coordinator', suggest: true });
  });
  it('the word list flags duplicates and shows how many plays use each word', () => {
    const s = starter();
    const id = [...s.words.entries.values()].find((e) => e.type === 'formation')!.partId;
    const other = [...s.words.entries.values()].find((e) => e.type === 'formation' && e.partId !== id)!;
    const words = pb.rename(s.words, id, other.word);
    const v = buildPlaybookView({ ...s, words, teamId: TEAM, side: 'offense' });
    expect(v.words.find((w) => w.partId === id)!.duplicate).toBe(true);
    expect(v.words.find((w) => w.partId === id)!.usedBy).toBeGreaterThan(0);
  });
  it('the size report shows when the host passes practice and meeting inputs', () => {
    const v = view({}, { size: { teamReps: 400, meetingUnits: 60, unitsPerRep: 0.25, decayPerUnit: 0.02, newInstall: 10, planSize: 60 } });
    expect(v.size).not.toBeNull();
    expect(['none', 'amber', 'red']).toContain(v.size!.warning);
  });
  it('a 1,000-play book filters in under 100 ms', () => {
    const b = book1000();
    buildPlaybookView({ ...b, teamId: TEAM, side: 'offense', filter: { concept: 'c2' } });
    const t0 = performance.now();
    const v = buildPlaybookView({ ...b, teamId: TEAM, side: 'offense', filter: { concept: 'c2' } });
    const ms = performance.now() - t0;
    expect(v.rows.length).toBe(40);
    expect(v.total).toBe(1000);
    expect(ms).toBeLessThan(100);
  });
});

describe('playbook commands (G3.4.3, O3.3.1)', () => {
  const state = (): PlaybookState => { const s = starter(); return { book: s.book, words: s.words, links: [], history: pb.emptyHistory() }; };
  const ctx = (holder = COORDINATOR): CommandContext => ({ holder, side: 'offense', validate, stamp: 1, newId: 'new.1', userId: 'u1' });
  const firstId = (s: PlaybookState) => [...s.book.plays.values()].find((p) => p.book === 'offense')!.id;

  it('retire takes plays out of the library and restore brings them back as drafts, each with a version', () => {
    const s = state();
    const id = firstId(s);
    const r = runPlaybookCommand(s, ctx(), { kind: 'retire', playIds: [id] });
    if (!r.ok) throw new Error(r.refusal);
    expect(buildPlaybookView({ ...starter(), book: r.state.book, teamId: TEAM, side: 'offense' }).rows.some((x) => x.id === id)).toBe(false);
    const back = runPlaybookCommand(r.state, ctx(), { kind: 'restore', playIds: [id] });
    if (!back.ok) throw new Error(back.refusal);
    expect(back.state.book.plays.get(id)!.status).toBe('draft');
    expect(back.state.history.versions.get(id)!.length).toBe(2);
  });
  it('a position coach cannot retire: the command becomes a suggestion to the coordinator', () => {
    const r = runPlaybookCommand(state(), ctx(POSITION_COACH), { kind: 'retire', playIds: [firstId(state())] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal).toBe('held by coordinator');
    expect(r.suggestion).toMatchObject({ id: 'new.1', from: 'u1', to: 'coordinator', action: 'edit_side_playbook', answer: 'pending' });
  });
  it('duplicate makes a draft copy that points at its parent', () => {
    const s = state();
    const r = runPlaybookCommand(s, ctx(), { kind: 'duplicate', playId: firstId(s) });
    if (!r.ok) throw new Error(r.refusal);
    expect(r.state.book.plays.get('new.1')).toMatchObject({ status: 'draft', parentId: firstId(s) });
  });
  it('renaming a word to one already used in its type is refused; a fresh word re-renders the calls', () => {
    const s = state();
    const forms = [...s.words.entries.values()].filter((e) => e.type === 'formation');
    const dup = runPlaybookCommand(s, ctx(), { kind: 'rename_word', partId: forms[0]!.partId, word: forms[1]!.word });
    expect(dup.ok).toBe(false);
    const ok = runPlaybookCommand(s, ctx(), { kind: 'rename_word', partId: forms[0]!.partId, word: 'Zebra' });
    if (!ok.ok) throw new Error(ok.refusal);
    expect(ok.state.words.entries.get(forms[0]!.partId)!.word).toBe('Zebra');
    expect(ok.notes[0]).toMatch(/re-rendered/);
  });
  it('set role and export: the role changes and the export file round-trips', () => {
    const s = state();
    const id = firstId(s);
    const r = runPlaybookCommand(s, ctx(), { kind: 'set_role', playId: id, role: 'shot' });
    if (!r.ok) throw new Error(r.refusal);
    expect(r.state.book.plays.get(id)!.role).toBe('shot');
    const e = runPlaybookCommand(r.state, ctx(POSITION_COACH), { kind: 'export', playIds: [id] });
    if (!e.ok) throw new Error(e.refusal);
    expect(pb.fromJson(e.file!).plays.map((p) => p.id)).toEqual([id]);
  });
});
