// E11.1 to E11.4 acceptance: notes, kinds and prompts, resurfacing, search and export.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  emptyNotebook, writeNote, editNote, deleteNote, mergeNotes, pinNote, rekindNote, searchNotes, exportNotebook,
  notebookForSharedSave, inheritNotebook, promptFor, setPrompt, migrateSubjectId, resurface, indexNotes,
  type Notebook, type Note, type NewNote, type StaffLookup, type AuthorJob,
} from '../../src/coach/index.ts';

const ME = 900;
const JOB_A: AuthorJob = { jobCatalogueId: 'core:position_coach_lb', teamId: 2 };
const JOB_B: AuthorJob = { jobCatalogueId: 'core:head_coach', teamId: 13 };
const at = (seasonYear: number, dayIndex = 0) => ({ world: { seasonYear, dayIndex }, real: null });

function write(nb: Notebook, n: NewNote, y: number, d = 0, job = JOB_A): { nb: Notebook; note: Note } {
  const r = writeNote(nb, n, at(y, d), job);
  if (!r.ok) throw new Error(r.key);
  return { nb: r.notebook, note: r.note };
}

describe('E11.1.1 the note object', () => {
  it('attaches the screen subjects without the user choosing them, and keeps the author job', () => {
    const { note } = write(emptyNotebook(ME), { text: 'Brings zero pressure on third and long when ahead.', subjects: [{ type: 'person', id: 501 }, { type: 'team', id: 4 }, { type: 'team', id: 4 }] }, 2026);
    expect(note.subjects).toEqual([{ type: 'person', id: 501 }, { type: 'team', id: 4 }]);
    expect(note.authorJob).toEqual(JOB_A);
    expect(note.kind).toBe('general');
  });

  it('refuses text over 4,000 characters; edits keep the original date and add an edited date', () => {
    expect(writeNote(emptyNotebook(ME), { text: 'x'.repeat(4001), subjects: [] }, at(2026), JOB_A).ok).toBe(false);
    const { nb, note } = write(emptyNotebook(ME), { text: 'first', subjects: [] }, 2026, 3);
    const r = editNote(nb, note.id, { text: 'second' }, at(2026, 9));
    expect(r.ok && r.note.created.world).toEqual({ seasonYear: 2026, dayIndex: 3 });
    expect(r.ok && r.note.edited?.world).toEqual({ seasonYear: 2026, dayIndex: 9 });
    expect(r.ok && deleteNote(r.notebook, note.id).notes).toEqual([]);
  });

  it('nothing outside display, search and export reads note text (acceptance 3)', () => {
    const dir = join(import.meta.dirname, '../../src');
    const files: string[] = [];
    const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(join(d, e.name)) : files.push(join(d, e.name)); };
    walk(dir);
    const readers = files.filter((f) => f.endsWith('.ts') && /\bn\.text\b|\bnote\.text\b|\.notes\b[\s\S]{0,80}\.text\b/.test(readFileSync(f, 'utf8')));
    expect(readers.map((f) => f.slice(dir.length + 1))).toEqual(['coach/notebook.ts']);
  });
});

describe('E11.2.1 kinds and prompts', () => {
  it('each prompt appears at its trigger and can be disabled; dismissing records nothing', () => {
    let nb = emptyNotebook(ME);
    expect(promptFor(nb, 'game_end', [{ type: 'team', id: 4 }])?.key).toBe('note.prompt.after_game');
    expect(promptFor(nb, 'job_end', [])?.kind).toBe('self');
    expect(promptFor(nb, 'season_end', [])).not.toBeNull();
    nb = setPrompt(nb, 'game_end', false);
    expect(promptFor(nb, 'game_end', [])).toBeNull();
    expect(nb.notes).toEqual([]);
  });

  it('a note can be re-kinded and pinned', () => {
    const { nb, note } = write(emptyNotebook(ME), { text: 'Lets receivers hand-fight.', subjects: [{ type: 'crew', id: 7 }] }, 2026);
    const nb2 = pinNote(rekindNote(nb, note.id, 'official'), note.id, true);
    expect(nb2.notes[0]).toMatchObject({ kind: 'official', pinned: true });
  });
});

describe('E11.3.1 resurfacing', () => {
  // Person 501 was a coordinator at college team 2 in 2021; in 2026 he is head coach of pro team 13.
  const staff: StaffLookup = {
    staffOf: (teamId, y) => (teamId === 13 && y === 2026 ? [501, 502] : teamId === 2 && y === 2021 ? [501, 600] : []),
    staffSeasonsOf: (p) => (p === 501 ? [{ teamId: 2, seasonYear: 2021 }, { teamId: 13, seasonYear: 2026 }] : []),
  };

  it('a note on a coordinator in season 1 appears on the scouting screen in season 6, at a new club and level (acceptance 1)', () => {
    const { nb, note } = write(emptyNotebook(ME), { text: 'Loves the boundary blitz.', subjects: [{ type: 'person', id: 501 }], kind: 'opponent' }, 2021, 40);
    const panel = resurface(nb, { surface: 'scouting', subjects: [{ type: 'team', id: 13 }], now: { seasonYear: 2026, dayIndex: 120 }, currentTeamId: 13 }, staff);
    expect(panel.items.map((i) => i.note.id)).toEqual([note.id]);
    expect(panel.items[0]!.reason).toBe('staff_of_team');
    expect(panel.items[0]!.note).toBe(nb.notes[0]); // the same object: never altered (acceptance 3)
    expect(panel.items[0]!.age).toEqual({ key: 'note.age.seasons_ago_other_club', seasons: 5 });
  });

  it('a note on a team is offered with a coach who was on that staff that season, marked as his old team (rule 2)', () => {
    const { nb } = write(emptyNotebook(ME), { text: 'Team 2 shifts late every third down.', subjects: [{ type: 'team', id: 2 }] }, 2021);
    const panel = resurface(nb, { surface: 'person_page', subjects: [{ type: 'person', id: 501 }], now: { seasonYear: 2026, dayIndex: 0 }, currentTeamId: 13 }, staff);
    expect(panel.items[0]!.reason).toBe('old_team');
    const other = write(emptyNotebook(ME), { text: 'x', subjects: [{ type: 'team', id: 2 }] }, 2019).nb;
    expect(resurface(other, { surface: 'person_page', subjects: [{ type: 'person', id: 501 }], now: { seasonYear: 2026, dayIndex: 0 }, currentTeamId: 13 }, staff).total).toBe(0);
  });

  it('game day shows only pinned notes for the opponent and crew (acceptance 2)', () => {
    let nb = emptyNotebook(ME);
    nb = write(nb, { text: 'pinned on coach', subjects: [{ type: 'person', id: 501 }], pinned: true }, 2025).nb;
    nb = write(nb, { text: 'not pinned', subjects: [{ type: 'person', id: 501 }] }, 2025).nb;
    nb = write(nb, { text: 'crew pinned', subjects: [{ type: 'crew', id: 7 }], pinned: true }, 2025).nb;
    const panel = resurface(nb, { surface: 'game_day', subjects: [{ type: 'team', id: 13 }, { type: 'crew', id: 7 }], now: { seasonYear: 2026, dayIndex: 0 }, currentTeamId: 13 }, staff);
    expect(panel.items.map((i) => i.note.text).sort()).toEqual(['crew pinned', 'pinned on coach']);
  });

  it('pinned first, then newest; five shown and a count of the rest; old notes never hidden', () => {
    let nb = emptyNotebook(ME);
    for (let i = 0; i < 8; i++) nb = write(nb, { text: `n${i}`, subjects: [{ type: 'team', id: 4 }], pinned: i === 1 }, 2010 + i).nb;
    const panel = resurface(nb, { surface: 'scouting', subjects: [{ type: 'team', id: 4 }], now: { seasonYear: 2026, dayIndex: 0 }, currentTeamId: 2 }, staff);
    expect(panel.items.map((i) => i.note.text)).toEqual(['n1', 'n7', 'n6', 'n5', 'n4']);
    expect(panel.more).toBe(3);
    expect(panel.total).toBe(8);
    expect(panel.items[1]!.age).toEqual({ key: 'note.age.seasons_ago', seasons: 9 });
  });

  it('a merged subject id is followed (P3 id migration) and the index is reusable', () => {
    let nb = write(emptyNotebook(ME), { text: 'about old id', subjects: [{ type: 'person', id: 77 }] }, 2025).nb;
    nb = migrateSubjectId(nb, 'person', 77, 501);
    const idx = indexNotes(nb);
    expect(resurface(nb, { surface: 'person_page', subjects: [{ type: 'person', id: 501 }], now: { seasonYear: 2026, dayIndex: 0 }, currentTeamId: 13 }, staff, idx).total).toBe(1);
  });
});

describe('E11.4.1 notebook screen, search and export', () => {
  function big(n: number): Notebook {
    let nb = emptyNotebook(ME);
    for (let i = 0; i < n; i++) nb = write(nb, { text: `Note ${i}: ${i % 3 === 0 ? 'cover two' : 'boundary blitz'} on third down`, subjects: [{ type: i % 2 ? 'team' : 'person', id: 100 + (i % 50) }], tags: i % 5 === 0 ? ['redzone'] : [], kind: i % 2 ? 'opponent' : 'player' }, 2020 + (i % 6), i % 300, i % 4 ? JOB_A : JOB_B).nb;
    return nb;
  }

  it('filters by kind, subject type, tag, season and job, plus full text', () => {
    const nb = big(300);
    expect(searchNotes(nb, { text: 'COVER TWO' }).length).toBe(100);
    expect(searchNotes(nb, { tags: ['redzone'] }).length).toBe(60);
    expect(searchNotes(nb, { kinds: ['opponent'], subjectTypes: ['team'] }).length).toBe(150);
    expect(searchNotes(nb, { season: 2020 }).every((n) => n.season === 2020)).toBe(true);
    expect(searchNotes(nb, { jobCatalogueId: JOB_B.jobCatalogueId }).length).toBe(75);
  });

  it('searches 10,000 notes quickly (target 200 ms)', () => {
    const nb = big(10000);
    const t0 = performance.now();
    const hits = searchNotes(nb, { text: 'boundary', tags: ['redzone'] });
    const ms = performance.now() - t0;
    expect(hits.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(400); // the leaf's 200 ms target with headroom for slow test machines
  });

  it('exports 1,000 notes as readable text with dates and subjects', () => {
    const txt = exportNotebook(big(1000), (s) => `${s.type} #${String(s.id)}`);
    expect(txt.split('\n').filter((l) => l.startsWith('# Season ')).length).toBe(1000);
    expect(txt).toContain('About: person #100');
    expect(txt).toContain('Tags: redzone');
  });

  it('a shared save holds no note text unless the box is ticked; an inherited file is marked', () => {
    const nb = big(10);
    expect(notebookForSharedSave(nb, false).notes).toEqual([]);
    expect(notebookForSharedSave(nb, true).notes.length).toBe(10);
    const next = inheritNotebook(nb, emptyNotebook(901));
    expect(next.notes.every((n) => n.inheritedFrom === ME)).toBe(true);
    expect(exportNotebook(next, () => 'x')).toContain('inherited file');
  });

  it('merge joins texts in date order and keeps the earliest date', () => {
    let nb = emptyNotebook(ME);
    nb = write(nb, { text: 'later', subjects: [{ type: 'team', id: 1 }], tags: ['a'] }, 2026, 5).nb;
    nb = write(nb, { text: 'earlier', subjects: [{ type: 'team', id: 2 }], tags: ['b'] }, 2026, 1).nb;
    const r = mergeNotes(nb, [1, 2]);
    expect(r.ok && r.note.text).toBe('earlier\n\nlater');
    expect(r.ok && r.notebook.notes.length).toBe(1);
    expect(r.ok && r.note.subjects.length).toBe(2);
  });
});
