// coach.notebook read model: E11.4.1 (notes page, search, actions, export) and E10.4.1 (words and deeds).
import { describe, expect, it } from 'vitest';
import { coach } from '@gm/career';
import { applyNotebookAction, buildLedgerView, buildNotebook, exportNotebookText, jobKey, type NotebookAction } from '../../../src/read-models/notebook/index.ts';
import { BOSS, HC_JOB, LB_JOB, ME, at, namer, sampleDecisions, sampleNotebook, samplePhilosophy } from './fixture.ts';

describe('E11.4.1 notes page', () => {
  const nb = sampleNotebook();

  it('lists every note, pinned first then newest, with subject and job names and the inherited mark', () => {
    const v = buildNotebook(nb, namer);
    expect(v.blank).toBe(false);
    expect(v.rows.map((r) => r.text.slice(0, 12))).toEqual(['Run inside z', 'This crew le', 'Harbor City ', 'Ruiz shows b', 'Old file: th']);
    expect(v.rows[0]!.pinned).toBe(true);
    expect(v.rows.find((r) => r.kind === 'official')!.subjects).toEqual([{ type: 'crew', id: 3, name: 'Crew of R. Ames' }]);
    expect(v.rows.find((r) => r.kind === 'job')!.inheritedFrom).toBe('Earl Mason');
    expect(v.rows.find((r) => r.kind === 'idea')!.job).toEqual({ key: jobKey(HC_JOB), name: 'Head coach, Bayport' });
  });

  it('filters by kind, subject type, tag, season, job and text, one choice each', () => {
    const texts = (f: Parameters<typeof buildNotebook>[2]) => buildNotebook(nb, namer, f).rows.map((r) => r.id);
    expect(texts({ kind: 'opponent' })).toEqual([2, 1]);
    expect(texts({ subjectType: 'crew' })).toEqual([3]);
    expect(texts({ tag: 'tells' })).toEqual([2, 1]);
    expect(texts({ season: 2028 })).toEqual([4, 3]);
    expect(texts({ job: jobKey(LB_JOB) })).toEqual([2, 1]);
    expect(texts({ text: 'QUARTERS' })).toEqual([2]);
    expect(texts({ text: 'third down' })).toEqual([2]);
    expect(texts({ kind: 'opponent', season: 2026 })).toEqual([1]);
  });

  it('facets come from the whole notebook, in catalogue order, newest season first', () => {
    const f = buildNotebook(nb, namer, { kind: 'official' }).facets;
    expect(f.kinds).toEqual(['opponent', 'official', 'idea', 'job']);
    expect(f.subjectTypes).toEqual(['person', 'team', 'crew', 'play']);
    expect(f.tags).toEqual(['tells', 'third down']);
    expect(f.seasons).toEqual([2028, 2027, 2026, 2020]);
    expect(f.jobs.map((j) => j.name)).toEqual(['Head coach, Bayport', 'Linebackers coach, Rivertown']);
  });

  it('shows no count of notes, streak or completion measure anywhere (rule 6)', () => {
    const v = buildNotebook(nb, namer);
    const keys = JSON.stringify(v, (k, x) => (k === 'text' ? undefined : x));
    expect(keys).not.toMatch(/"(count|total|streak|complete|completion|progress|notesWritten)"/i);
    expect(buildNotebook(coach.emptyNotebook(ME), namer).blank).toBe(true);
  });

  it('search stays under 200 ms for 10,000 notes (rule 1 target)', () => {
    let big = coach.emptyNotebook(ME);
    const notes: coach.Note[] = [];
    for (let i = 0; i < 10_000; i++) {
      notes.push({ id: i + 1, text: `Note ${i}: ${i % 7 === 0 ? 'quarters rotation' : 'cover three buzz'} on early downs.`, created: at(2000 + (i % 30), i % 300), edited: null,
        subjects: [{ type: i % 2 ? 'person' : 'team', id: i % 500 }], tags: i % 3 ? ['film'] : ['tells'], kind: coach.NOTE_KINDS[i % 8]!, pinned: i % 97 === 0,
        season: 2000 + (i % 30), authorJob: i % 2 ? LB_JOB : HC_JOB, subjectMeasure: null, attachment: null, inheritedFrom: null });
    }
    big = { ...big, notes, nextId: 10_001 };
    buildNotebook(big, namer, { text: 'quarters' });
    const t0 = performance.now();
    const v = buildNotebook(big, namer, { text: 'quarters', tag: 'tells' });
    const ms = performance.now() - t0;
    expect(v.rows.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(200);
  });
});

describe('E11.4.1 actions and export', () => {
  const nb = sampleNotebook();
  const now = at(2028, 210, '2026-11-26');
  const run = (a: NotebookAction) => applyNotebookAction(nb, a, now, HC_JOB);

  it('pin, edit (keeps the first date, adds an edited date), rekind, delete', () => {
    const pinned = run({ kind: 'pin', id: 1, pinned: true });
    expect(pinned.ok && pinned.notebook.notes.find((n) => n.id === 1)!.pinned).toBe(true);
    const edited = run({ kind: 'edit', id: 2, text: 'Quarters on third and long, cover 1 in the red zone.' });
    if (!edited.ok) throw new Error(edited.key);
    const n2 = edited.notebook.notes.find((n) => n.id === 2)!;
    expect(n2.created.world).toEqual({ seasonYear: 2027, dayIndex: 12 });
    expect(n2.edited).toEqual(now);
    const rk = run({ kind: 'rekind', id: 3, noteKind: 'general' });
    expect(rk.ok && rk.notebook.notes.find((n) => n.id === 3)!.kind).toBe('general');
    const del = run({ kind: 'delete', id: 3 });
    expect(del.ok && del.notebook.notes.map((n) => n.id)).toEqual([1, 2, 4, 5]);
    expect(run({ kind: 'delete', id: 99 })).toEqual({ ok: false, key: 'note.unknown' });
  });

  it('writes a general note stamped with the current job; refuses empty and over-long text', () => {
    const w = run({ kind: 'write', text: 'Ask the OL coach about the double teams.', tags: ['staff'] });
    if (!w.ok) throw new Error(w.key);
    const n = w.notebook.notes.at(-1)!;
    expect(n).toMatchObject({ kind: 'general', authorJob: HC_JOB, tags: ['staff'], subjects: [], season: 2028 });
    expect(run({ kind: 'write', text: '   ' })).toEqual({ ok: false, key: 'note.empty' });
    expect(run({ kind: 'write', text: 'x'.repeat(coach.param('noteMaxChars') + 1) })).toEqual({ ok: false, key: 'note.too_long' });
  });

  it('merges two or more notes into the earliest; one alone is refused', () => {
    const m = run({ kind: 'merge', ids: [2, 1] });
    if (!m.ok) throw new Error(m.key);
    const kept = m.notebook.notes.find((n) => n.id === 1)!;
    expect(kept.text).toContain('Ruiz shows blitz');
    expect(kept.text).toContain('Harbor City sit in quarters');
    expect(m.notebook.notes.some((n) => n.id === 2)).toBe(false);
    expect(run({ kind: 'merge', ids: [1] })).toEqual({ ok: false, key: 'note.merge_needs_two' });
  });

  it('prompts can be turned off and on', () => {
    const r = run({ kind: 'prompt', trigger: 'game_end', on: false });
    expect(r.ok && buildNotebook(r.notebook, namer).promptsOn.game_end).toBe(false);
  });

  it('export is a readable text file with dates, subject names and the inherited mark', () => {
    const txt = exportNotebookText(nb, namer);
    expect(txt).toContain('About: Dale Ruiz');
    expect(txt).toContain('About: Crew of R. Ames');
    expect(txt).toContain('Season 2027, day 12');
    expect(txt).toContain('inherited file');
    expect(txt.indexOf('Old file')).toBeLessThan(txt.indexOf('Ruiz shows'));
  });
});

describe('E10.4.1 words and deeds', () => {
  const v = buildLedgerView({ philosophy: samplePhilosophy(), decisions: sampleDecisions(), now: { seasonYear: 2028, dayIndex: 220 } });

  it('one row per commitment ever made, active first, dropped kept; counts equal linked decisions', () => {
    expect(v.rows.map((r) => r.catalogueId)).toEqual(['best_player_plays', 'tell_you_first', 'go_when_numbers_say_go']);
    const best = v.rows[0]!;
    expect(best).toMatchObject({ wording: 'The best player plays. Every week.', audience: 'team', kept: 1, broke: 1, recentKept: [11], recentBroke: [12], behaviour: 'kept_and_broke', consistency: 0.5 });
    expect(v.rows[1]).toMatchObject({ behaviour: 'not_yet_tested', kept: 0, broke: 0, consistency: null });
    expect(v.rows[2]).toMatchObject({ dropped: { seasonYear: 2028, dayIndex: 200 }, kept: 1, broke: 0, behaviour: 'kept_every_time' });
    expect(v.overall).toEqual({ kept: 2, broke: 1, share: 2 / 3 });
    expect(v.statement).toContain('The film decides');
  });

  it('a decision made with the contrary fact hidden is never shown as a break (acceptance 3)', () => {
    expect(v.rows[0]!.recentBroke).not.toContain(13);
  });

  it('carries no film grade, model margin or hidden-fact flag (observer filter)', () => {
    const s = JSON.stringify(v);
    for (const f of ['promotedGrade', 'demotedGrade', 'goAdvantageEp', 'factsKnown', 'demotedIsStarOrHighPick', 'deciderId']) expect(s).not.toContain(f);
  });

  it('the boss ledger as his staff sees it, and his own draft below head coach (E10.5.2)', () => {
    const boss = buildLedgerView({ philosophy: samplePhilosophy(BOSS), decisions: sampleDecisions(BOSS), now: { seasonYear: 2028, dayIndex: 220 } }, 'boss', 'Coach Hale');
    expect(boss).toMatchObject({ whose: 'boss', ownerName: 'Coach Hale', draft: false });
    expect(boss.rows[0]!.kept).toBe(1);
    const draft = buildLedgerView({ philosophy: samplePhilosophy(ME, true), decisions: [], now: { seasonYear: 2028, dayIndex: 220 } });
    expect(draft.draft).toBe(true);
    expect(draft.ownerName).toBeNull();
    expect(draft.rows.every((r) => r.behaviour === 'not_yet_tested')).toBe(true);
  });

  it('an empty statement gives an empty ledger', () => {
    const e = buildLedgerView({ philosophy: coach.emptyPhilosophy(ME, false), decisions: sampleDecisions(), now: { seasonYear: 2028, dayIndex: 220 } });
    expect(e.rows).toEqual([]);
    expect(e.overall.share).toBeNull();
  });
});
