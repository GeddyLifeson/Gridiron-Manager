// coach.notebook screen (E11.4.1, E10.4.1, E10.5.2): fed by the app-services read model through a host.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { coach } from '@gm/career';
// The barrel line for this read model is owed by the exports integrator; until then the test reads the folder.
import { applyNotebookAction, buildLedgerView, buildNotebook, exportNotebookText } from '../../../../app-services/src/read-models/notebook/index.ts';
import { BOSS, HC_JOB, ME, at, namer, sampleDecisions, sampleNotebook, samplePhilosophy } from '../../../../app-services/test/read-models/notebook/fixture.ts';
import {
  LedgerPage, NO_FILTER, NOTEBOOK_SCREEN_ID, NotebookScreen, hasNbText, notebookRoutes, notebookStateFromView, nt, viewFromNotebookState,
  type NotebookHost, type UiLedgerView, type UiNotebookFilter, type UiNotebookView,
} from '../../../src/screens/notebook/index.ts';

function host(opts: { boss?: boolean; draft?: boolean; empty?: boolean } = {}) {
  let nb = opts.empty ? coach.emptyNotebook(ME) : sampleNotebook();
  const exports: string[] = [];
  const now = { seasonYear: 2028, dayIndex: 220 };
  const h: NotebookHost = {
    notebook: (f: UiNotebookFilter): UiNotebookView => buildNotebook(nb, namer, f),
    ledger: () => ({
      own: buildLedgerView({ philosophy: samplePhilosophy(ME, opts.draft ?? false), decisions: sampleDecisions(), now }) satisfies UiLedgerView,
      boss: opts.boss ? buildLedgerView({ philosophy: samplePhilosophy(BOSS), decisions: sampleDecisions(BOSS), now }, 'boss', 'Coach Hale') : null,
    }),
    act: (a) => {
      const r = applyNotebookAction(nb, a, at(2028, 220), HC_JOB);
      if (r.ok) nb = r.notebook;
      return r.ok ? { ok: true } : { ok: false, key: r.key };
    },
    exportText: () => { exports.push(exportNotebookText(nb, namer)); },
  };
  return { h, exports, get nb() { return nb; } };
}

const page = (h: NotebookHost, tab: 'notes' | 'ledger' = 'notes', filter: UiNotebookFilter = NO_FILTER, readOnly = false) =>
  renderToStaticMarkup(createElement(NotebookScreen, { source: h, tab, filter, readOnly, onState: () => {} }));

describe('E11.4.1 notes page', () => {
  it('shows every note with its date, kind, job, subjects, tags, pin and inherited mark; pinned first', () => {
    const html = page(host().h);
    expect(html).toContain('data-screen="coach.notebook"');
    const ids = [...html.matchAll(/data-note="(\d+)"/g)].map((m) => Number(m[1]));
    expect(ids).toEqual([4, 3, 2, 1, 5]);
    expect(html).toContain('Pinned · </strong>Season 2028, day 30 · Idea · Head coach, Bayport');
    expect(html).toContain('About: Dale Ruiz');
    expect(html).toContain('Tags: third down, tells');
    expect(html).toContain('Inherited file, written by Earl Mason');
    for (const label of ['Search', 'Kind', 'About', 'Tag', 'Season', 'Written as']) expect(html).toContain(label);
    expect(html).toContain('Export notebook as text');
  });

  it('filters from the address and says when nothing matches', () => {
    const { tab, filter } = notebookStateFromView({ q: 'quarters', kind: 'opponent' });
    expect(tab).toBe('notes');
    const html = page(host().h, tab, filter);
    expect([...html.matchAll(/data-note="(\d+)"/g)].map((m) => m[1])).toEqual(['2']);
    expect(page(host().h, 'notes', { ...NO_FILTER, text: 'zzz' })).toContain('No note matches.');
  });

  it('address round trip keeps tab and every filter', () => {
    const f: UiNotebookFilter = { text: 'blitz', kind: 'player', subjectType: 'person', tag: 'tells', season: 2027, job: 'core:head_coach@13' };
    expect(notebookStateFromView(viewFromNotebookState('ledger', f))).toEqual({ tab: 'ledger', filter: f });
    expect(viewFromNotebookState('notes', NO_FILTER)).toEqual({});
    expect(notebookStateFromView({ kind: 'nonsense', season: 'x' }).filter).toEqual(NO_FILTER);
  });

  it('an empty notebook says how to write a note and shows no count anywhere (rule 6)', () => {
    const html = page(host({ empty: true }).h);
    expect(html).toContain(nt('nb.blank'));
    const full = page(host().h);
    expect(full).not.toMatch(/\b\d+ notes?\b/i);
    expect(full).not.toMatch(/streak|complet/i);
  });

  it('read only hides every write control', () => {
    const html = page(host().h, 'notes', NO_FILTER, true);
    expect(html).toContain('Read only.');
    for (const s of ['>Pin<', '>Edit<', '>Delete<', 'Add note', 'Merge selected']) expect(html).not.toContain(s);
    expect(html).toContain('Export notebook as text');
  });

  it('host actions change the notebook: pin, edit, merge, delete, write; export writes subject names', () => {
    const t = host();
    expect(t.h.act({ kind: 'pin', id: 1, pinned: true })).toEqual({ ok: true });
    expect(t.h.act({ kind: 'edit', id: 4, text: 'Inside zone from 12 personnel when ahead, and from 11 on early downs.' })).toEqual({ ok: true });
    expect(t.h.act({ kind: 'merge', ids: [1] })).toEqual({ ok: false, key: 'note.merge_needs_two' });
    expect(t.h.act({ kind: 'merge', ids: [1, 2] })).toEqual({ ok: true });
    expect(t.h.act({ kind: 'delete', id: 3 })).toEqual({ ok: true });
    expect(t.h.act({ kind: 'write', text: 'Check the punt team splits.' })).toEqual({ ok: true });
    const html = page(t.h);
    expect([...html.matchAll(/data-note="(\d+)"/g)].map((m) => Number(m[1]))).toEqual([4, 1, 6, 5]);
    expect(html).toContain('Edited Season 2028, day 220');
    t.h.exportText();
    expect(t.exports[0]).toContain('About: Dale Ruiz');
    for (const key of ['note.merge_needs_two', 'note.too_long', 'note.empty', 'note.unknown']) expect(hasNbText(`nb.error.${key}`), key).toBe(true);
  });
});

describe('E10.4.1 words and deeds', () => {
  it('one row per commitment with wording, when and to whom, the measure, kept and broke counts and the latest examples', () => {
    const html = page(host().h, 'ledger');
    expect(html).toContain('Your words and your decisions');
    expect(html).toContain('The film decides who plays.');
    expect(html).toContain('The best player plays. Every week.');
    expect(html).toContain('Season 2028, day 0, to the team');
    expect(html).toContain('Kept it 1 times and broke it 1 times.');
    expect(html).toContain('Latest broken: #12');
    expect(html).toContain('Not yet tested.');
    expect(html).toContain('Dropped Season 2028, day 200');
    expect(html).toContain('Across every commitment: kept 2, broke 1.');
    expect(html).not.toContain('#13');
    expect(html).not.toMatch(/consistent|inconsistent|liar|honest|trust/i);
  });

  it('below head coach: his own statement is a private draft, and the boss ledger shows as the staff sees it', () => {
    const html = page(host({ draft: true, boss: true }).h, 'ledger');
    expect(html).toContain('Private draft.');
    expect(html).toContain('Coach Hale: words and decisions, as the staff sees them');
    expect(html).toContain('data-ledger="boss"');
  });

  it('every catalogue commitment and measure has text', () => {
    for (const e of coach.COMMITMENT_CATALOGUE) {
      expect(hasNbText(e.textKey), e.textKey).toBe(true);
      expect(hasNbText(`nb.measure.${e.measure}`), e.measure).toBe(true);
    }
    for (const k of coach.NOTE_KINDS) expect(hasNbText(`nb.kind.${k}`)).toBe(true);
    for (const s of coach.SUBJECT_TYPES) expect(hasNbText(`nb.subject.${s}`)).toBe(true);
  });

  it('an empty statement says so', () => {
    const empty = buildLedgerView({ philosophy: coach.emptyPhilosophy(ME, false), decisions: [], now: { seasonYear: 2028, dayIndex: 1 } });
    const html = renderToStaticMarkup(createElement(LedgerPage, { ledger: empty }));
    expect(html).toContain('No statement written.');
    expect(html).toContain('No commitments made.');
  });
});

describe('route', () => {
  it('notebookRoutes renders coach.notebook from the address view', () => {
    const r = notebookRoutes(host().h);
    expect(Object.keys(r)).toEqual([NOTEBOOK_SCREEN_ID]);
    const el = r[NOTEBOOK_SCREEN_ID]!.render({
      screen: { id: NOTEBOOK_SCREEN_ID } as never, location: { screenId: NOTEBOOK_SCREEN_ID, view: { tab: 'ledger' } } as never,
      readOnly: false, navigate: () => {}, setView: () => {},
    });
    expect(renderToStaticMarkup(el as never)).toContain('data-ledger="own"');
  });
});
