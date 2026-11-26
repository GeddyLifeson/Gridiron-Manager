// The console's special-teams sheet built from the special-teams call menu (football-content data copies of
// menuGroups for both 2026 rule sets): one box per kicking unit, and the console opens the box holding the
// called kick or return kind (O2.4.2) with the menu's content ids on the entries.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { DecisionRequest } from '@gm/schema';
import { ConsoleKeyDriver, assignKeys, initialConsole, openRequest, type OpenInput, type SheetSituation } from '../../src/commands/game-calling/index.ts';
import { specialTeamsSheet, type SpecialMenuGroup } from '../../src/commands/game-calling/special-sheet.ts';
import { RESERVED, resolve, testConsoleConfig } from './fixtures.ts';

const groups = (ruleset: string): SpecialMenuGroup[] =>
  (JSON.parse(readFileSync(new URL(`../../../football-content/data/special-teams/menu-${ruleset}.json`, import.meta.url), 'utf8')) as { groups: SpecialMenuGroup[] }).groups;
const INPUTS = { readiness: () => 'ready' as const, spokenTenths: () => 12, onBand: () => true, signal: () => false };
const SIT: SheetSituation = { down: null, distance: null, toGoal: 65, twoMinute: false, lastPlayOfHalf: false, scoreDiff: 0, personnel: null, suddenChange: false, noHuddle: false };
const req = (type: DecisionRequest['type']): DecisionRequest => ({ requestId: 3, type, side: 0, options: [], deadlinePlayClockTenths: 150, windowTenths: null, defaultOptionId: null });
const open = (over: Partial<OpenInput>): OpenInput => ({
  request: req('snapping_call'), situation: SIT, kind: 'own_kick', playClockTenths: 400, atMs: 0, personnelOnField: '11', insideTwoMinute: false,
  legal: { timeout: true, challenge: false }, timeoutReason: null, challengeReason: null, offenseSetTenths: 150, afterTimeout: false, suggestion: null, ...over,
});

for (const ruleset of ['pro_2026', 'college_2026']) {
  describe(`special-teams sheet from the menu (${ruleset})`, () => {
    const sheet = specialTeamsSheet(`st-${ruleset}`, groups(ruleset), INPUTS);
    const cfg = testConsoleConfig({ sheets: { ...testConsoleConfig().sheets, special: sheet }, keys: { ...testConsoleConfig().keys, special: assignKeys(sheet, RESERVED) } });
    const focus = (o: Partial<OpenInput>) => { const d = new ConsoleKeyDriver(initialConsole(cfg), { resolve, keyIntervalMs: 200 }); d.state = openRequest(d.state, open(o)); return d.state.focus.boxId; };

    it('has one box per kicking unit with no overlap, every entry carrying its content id', () => {
      expect(sheet.boxes.map((b) => b.id)).toEqual(expect.arrayContaining(['st_kickoff', 'st_punt', 'st_punt_return', 'st_field_goal', 'st_field_goal_block', 'st_onside', 'st_hands_team', 'st_try']));
      const cells = sheet.boxes.map((b) => `${b.row},${b.col}`);
      expect(new Set(cells).size).toBe(cells.length);
      for (const b of sheet.boxes) for (const e of b.entries) expect(e.call.unit === 'offense' ? e.call.playContentId : e.call.callContentId).toBe(e.id);
    });
    it('opens the box holding the called kick or return kind', () => {
      expect(focus({ kickKind: 'punt' })).toBe('st_punt');
      expect(focus({ kickKind: 'kickoff' })).toBe('st_kickoff');
      expect(focus({ kickKind: 'onside_kick' })).toBe('st_onside');
      expect(focus({ kickKind: 'try_kick' })).toBe('st_field_goal');
      expect(focus({ request: req('opposing_call'), kind: 'opponent_kick', kickKind: 'kick_return' })).toBe('st_kickoff_return');
    });
    it('labels a fake with the look it needs', () => {
      const fake = sheet.boxes.flatMap((b) => b.entries).find((e) => e.id === 'st.punt.fake_pp_pass')!;
      expect(fake.label).toContain('needs:');
    });
  });
}
