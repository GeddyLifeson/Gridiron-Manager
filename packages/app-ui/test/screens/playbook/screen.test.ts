// G-67 screen: renders inside the shell frame for football.playbook, every action is a button or form field
// (Q1.5.2), locked controls name their holder and offer a suggestion (G3.4.3), and the filter lives in the
// address so back and forward keep it (O1.1.3).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell, SCREENS } from '../../../src/shell/index.ts';
import { PlaybookScreen, playbookRoute, pbTextIds, pt, SCREEN_ID, filterFromView, filterToView, type PlaybookUi, type Tab, type UiFilter } from '../../../src/screens/playbook/index.ts';

const lock = (allowed: boolean, heldBy: string | null = null, suggest = false) => ({ allowed, heldBy, suggest });
const row = (id: string, over: Partial<PlaybookUi['rows'][number]> = {}): PlaybookUi['rows'][number] => ({
  id, call: `Gun Trips Right ${id}`, family: 'Trips', section: 'dropback', personnel: '11', formation: 'Trips', concept: id, protection: '', tags: [],
  status: 'valid', role: 'base', readinessEstimate: null, called: 0, lastCalledWeek: null, avgResult: null, sample: 0, lengthS: 1.4, words: 4,
  overLimit: false, latestStartS: 13.6, ...over,
});

function view(over: Partial<PlaybookUi> = {}, locks: Partial<PlaybookUi['locks']> = {}): PlaybookUi {
  return {
    teamId: 7, side: 'offense',
    sections: [{ key: 'dropback', count: 3 }],
    rows: [row('Stick', { called: 6, readinessEstimate: 0.8, avgResult: 5.5, sample: 6 }), row('Smash', { overLimit: true }), row('Mesh', { status: 'retired' })],
    total: 3,
    families: [{ key: 'Trips', plays: ['Stick', 'Smash'], gaps: ['Stick'] }],
    words: [
      { partId: 'formation.trips', type: 'formation', word: 'Trips', syllables: 1, usedBy: 3, duplicate: false, soundsLike: [] },
      { partId: 'concept.stick', type: 'concept', word: 'Stick', syllables: 1, usedBy: 1, duplicate: true, soundsLike: ['concept.slick'] },
      { partId: 'concept.slick', type: 'concept', word: 'Slick', syllables: 1, usedBy: 0, duplicate: false, soundsLike: ['concept.stick'] },
    ],
    size: { readinessCeiling: 0.72, upkeep: 50, capacity: 60, warning: 'amber', warnings: ['The book is close to capacity'], sectionUpkeep: [{ section: 'dropback', units: 50, share: 1 }] },
    locks: {
      view: lock(true), draft_play: lock(true), edit_group_coaching_points: lock(true), edit_side_playbook: lock(true), build_plan_and_sheet: lock(true),
      approve: lock(false, 'head_coach', true), draw_scout_cards: lock(true), ...locks,
    },
    filter: {},
    options: { formation: [{ id: 'formation.trips', word: 'Trips' }], concept: [{ id: 'concept.stick', word: 'Stick' }], personnel: [{ id: 'personnel.11', word: '11' }] },
    ...over,
  };
}

const esc = (x: string) => x.replace(/'/g, '&#x27;');
const html = (v: PlaybookUi | null, tab: Tab, readOnly = false) =>
  renderToStaticMarkup(createElement(PlaybookScreen, { view: v, tab, readOnly, onTab: () => {}, onFilter: () => {}, onIntent: () => {} }));

describe('playbook library screen (O3.3.1)', () => {
  it('is registered and its route entry renders in the shell frame with the filter from the address', () => {
    expect(SCREENS.some((s) => s.id === SCREEN_ID)).toBe(true);
    let asked: UiFilter | null = null;
    const host = { view: (_side: string, f: UiFilter) => { asked = f; return view({ filter: f }); }, dispatch: () => {} };
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: '/football/playbook?tab=library&formation=formation.trips&retired=1', routes: { [SCREEN_ID]: playbookRoute(host) } }));
    expect(out).toContain(`data-screen="${SCREEN_ID}"`);
    expect(out).toContain('data-table="library"');
    expect(asked).toEqual({ formation: 'formation.trips', includeRetired: true });
  });
  it('the filter round-trips through the address and leaves other view options alone', () => {
    const f: UiFilter = { text: 'stick', concept: 'concept.stick', includeRetired: true };
    const v = filterToView({ tab: 'library', side: 'defense', formation: 'old' }, f);
    expect(v).toEqual({ tab: 'library', side: 'defense', text: 'stick', concept: 'concept.stick', retired: '1' });
    expect(filterFromView(v)).toEqual(f);
  });
  it('the library shows every row with its call, estimate, sample and length warnings', () => {
    const out = html(view(), 'library');
    expect(out).toContain(pt('pb.count', { shown: 3, total: 3 }));
    expect(out.match(/data-play=/g)?.length).toBe(3);
    expect(out).toContain('80%');
    expect(out).toContain(pt('pb.result', { avg: 5.5, sample: 6 }));
    expect(out).toContain(pt('pb.noEstimate'));
    expect(out).toContain('data-over="true"');
    expect(out).toContain(pt('pb.overLimit'));
    expect(out).toContain(pt('pb.latestStart', { seconds: 13.6 }));
  });
  it('a coordinator gets the bulk and row actions; a position coach sees the holder and a suggest button', () => {
    const out = html(view(), 'library');
    expect(out).toContain(pt('pb.action.retire', { count: 0 }));
    expect(out).toContain(esc(pt('pb.action.duplicate', { call: 'Gun Trips Right Stick' })));
    const pc = html(view({}, { edit_side_playbook: lock(false, 'coordinator', true) }), 'library');
    expect(pc).toContain('data-suggest="true"');
    expect(pc).toContain(pt('pb.action.suggest', { holder: pt('pb.holder.coordinator') }));
    expect(pc).not.toContain(esc(pt('pb.action.setRole', { call: 'Gun Trips Right Stick' })));
  });
  it('read-only shows the note and no change controls; export stays available', () => {
    const out = html(view(), 'library', true);
    expect(out).toContain(esc(pt('pb.readOnly')));
    expect(out).not.toContain(pt('pb.action.retire', { count: 0 }));
    expect(out).toContain(pt('pb.action.export', { count: 0 }));
  });
  it('families show each gap; words show duplicates and sound-alikes by word; size shows the warning', () => {
    expect(html(view(), 'families')).toContain('data-gap="Stick"');
    const w = html(view(), 'words');
    expect(w).toContain('data-duplicate="true"');
    expect(w).toContain(pt('pb.words.soundsLike', { words: 'Slick' }));
    const s = html(view(), 'size');
    expect(s).toContain('data-warning="amber"');
    expect(s).toContain(pt('pb.size.ceiling', { ceiling: '72%' }));
    expect(html(view({ size: null }), 'size')).toContain(pt('pb.size.none').replace(/,/g, ','));
  });
  it('no view shows the empty line', () => {
    expect(html(null, 'library')).toContain(pt('pb.empty'));
  });
  it('every string id used by the screen exists in text.json', () => {
    const ids = pbTextIds();
    for (const id of ['pb.role.base', 'pb.role.shot', 'pb.status.retired', 'pb.holder.coordinator', 'pb.size.warning.red', 'pb.tab.size']) expect(ids).toContain(id);
  });
});
