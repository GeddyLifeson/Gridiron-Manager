// Football hub sources (plan item 2b): a started career's football screens read the seat's desk, the screen
// intents become desk commands, the call sheet the user edits is the sheet the console opens with, and the
// route table the career root builds holds every football screen.
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { play } from '@gm/app-services';
import { footballSources, gameplanCommand, startCareerSeason, firstTeamKey, resolverFor } from '../../src/app-root/index.ts';
import { buildRoutes } from '../../src/routes.ts';
import { DEFAULT_KEYMAP } from '../../src/shell/keymap.ts';
import type { ScreenProps } from '../../src/shell/Shell.tsx';

const ROOT = resolvePath(import.meta.dirname, '../../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (...p: string[]): any => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
const CONTENT = {
  proLeague: read('packages', 'football-content', 'data', 'world', 'pro-league.json'),
  college: read('packages', 'football-content', 'data', 'world', 'college.json'),
  proLeagueRules: read('packages', 'rules-data', 'data', 'league', 'proleague_2026.json'),
  collegeLeagueRules: read('packages', 'rules-data', 'data', 'league', 'collegeleague_2026.json'),
};

const props = (screenId: string, view: Record<string, string> = {}): ScreenProps => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  screen: { id: screenId } as any, location: { path: '/', view } as any, readOnly: false, navigate: () => {}, setView: () => {},
});

describe('football sources', () => {
  it('the screen intents become desk commands', () => {
    const d = new play.FootballDesk({ teamId: 2, ruleSetId: 'pro_2026', level: 'pro' });
    d.prepare('5');
    const box = d.sheets().offense.boxes.find((b) => b.entries.length > 2)!;
    const [a, b] = [box.entries[0]!.id, box.entries[1]!.id];
    expect(gameplanCommand(d, 'offense', { kind: 'move_entry', boxId: box.id, entryId: a, by: 1 })).toMatchObject({ kind: 'reorder_box', entryIds: [b, a, ...box.entries.slice(2).map((e) => e.id)] });
    expect(gameplanCommand(d, 'offense', { kind: 'move_entry', boxId: box.id, entryId: a, by: -1 })).toBeNull();
    expect(gameplanCommand(d, 'offense', { kind: 'add_entry', boxId: box.id, playId: 'x' })).toMatchObject({ kind: 'add_entry', entry: { call: { playId: 'x' } } });
    expect(gameplanCommand(d, 'offense', { kind: 'print', paper: 'letter', keyHints: true })).toBeNull();
    expect(gameplanCommand(d, 'offense', { kind: 'drop_entry', fromBoxId: box.id, entryId: a, toBoxId: 'b2', at: 0 })).toEqual({ kind: 'transfer_entry', fromBoxId: box.id, entryId: a, toBoxId: 'b2', at: 0 });
    expect(gameplanCommand(d, 'offense', { kind: 'start_from_last_week' })).toBeNull();
  });

  it('dispatch runs the command and asks the root to redraw', () => {
    const d = new play.FootballDesk({ teamId: 2, ruleSetId: 'pro_2026', level: 'pro' });
    d.prepare('5');
    let redraws = 0;
    const s = footballSources(d, { onChange: () => redraws++ });
    const box = d.sheets().defense.boxes.find((b) => b.entries.length > 1)!;
    s.gameplan.dispatch('defense', { kind: 'remove_entry', boxId: box.id, entryId: box.entries[0]!.id });
    expect(redraws).toBe(1);
    expect(s.gameplan.view('defense', { situation: null, paper: 'letter', keyHints: true })!.sheet.boxes.find((x) => x.id === box.id)!.entries.length).toBe(box.entries.length - 1);
    s.install.view('offense', 'week');
    s.install.dispatch('offense', { kind: 'fill' });
    expect(redraws).toBe(2);
    expect(s.install.view('offense', 'week')!.days.some((x) => x.cards.length > 0)).toBe(true);
    // Last week's sheet: none until a game has been prepared for, then the screen's action restores it.
    expect(s.gameplan.hasLastWeek!('defense')).toBe(false);
    d.prepare('6');
    expect(s.gameplan.hasLastWeek!('defense')).toBe(true);
    s.gameplan.dispatch('defense', { kind: 'start_from_last_week' });
    expect(redraws).toBe(3);
    expect(d.sheets().defense.boxes.find((x) => x.id === box.id)!.entries.length).toBe(box.entries.length - 1);
    // Folders: the playbook route's folder intents reach the desk.
    s.playbook.dispatch('offense', { kind: 'create_folder', name: 'Openers' });
    expect(s.playbook.view('offense', {})!.folders.map((f) => f.name)).toEqual(['Openers']);
  });

  for (const level of ['pro', 'college'] as const) {
    it(`${level}: a started career has the football screens, and the console opens with the user's edited sheet`, () => {
      const port = startCareerSeason(CONTENT, { level, ruleSetId: `${level}_2026`, seasonYear: 2026, seedHex: '00000000000000a7', seat: { key: firstTeamKey(CONTENT, level) } },
        { resolve: resolverFor(DEFAULT_KEYMAP.bindings), bindings: DEFAULT_KEYMAP.bindings });
      const today = port.today();
      // The football screens come through the port's hub sources (one spread in the career root).
      const sources = port.sources!() as ReturnType<typeof footballSources>;
      const routes = buildRoutes(sources);
      for (const id of ['football.game_plan', 'football.call_sheet', 'football.print', 'football.playbook', 'football.install', 'football.defense_designer']) {
        expect(routes[id], id).toBeDefined();
        const html = renderToStaticMarkup(routes[id]!.render(props(id)) as never);
        expect(html.length, id).toBeGreaterThan(200);
      }
      const OPTS = { situation: null, paper: 'letter' as const, keyHints: true };
      const sheet = sources.gameplan.view('offense', OPTS)!.sheet;
      expect(sheet.gameId).not.toBe('next');
      // The call sheet shows the seat's own calls (the starter book), named the way the caller says them.
      const sheetHtml = renderToStaticMarkup(routes['football.call_sheet']!.render(props('football.call_sheet')) as never);
      expect(sheetHtml).toContain(sheet.boxes.flatMap((b) => b.entries)[0]!.call);
      // Edit through the screen intent; the root is asked to redraw; then open the game: the console's sheet is the edited one.
      let redraws = 0;
      const off = port.subscribe!(() => redraws++);
      const box = sheet.boxes.find((b) => b.entries.length > 1)!;
      sources.gameplan.dispatch('offense', { kind: 'remove_entry', boxId: box.id, entryId: box.entries[0]!.id });
      expect(redraws).toBe(1);
      off();
      expect(today.nextGame).not.toBeNull();
      port.advanceToGameDay();
      const session = port.startGame();
      expect(session.final).toBe(false);
      const consoleSheet = session.driver.state.cfg.sheets.offense!;
      expect(consoleSheet.id).toContain(sheet.gameId);
      expect(consoleSheet.boxes.find((b) => b.id === box.id)!.entries.length).toBe(box.entries.length - 1);
    });
  }
});
