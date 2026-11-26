// G-60 console screen: the five fixed regions render (O2.1.1), the G-61 panel sits in the sideline region
// when given, and every text id the screen and the console's notices and prompts use exists (O6.6.1).
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GameConsole, gameCallingRoutes, missingConsoleText, type ConsoleViewModel } from '../../../src/screens/game-calling/index.ts';

// Built by hand in the read model's shape (app-ui tests cannot reach app-services until its barrel line lands).
const entry = (id: string, label: string, key: string, selected = false) => ({ id, label, key, readiness: 'ready' as const, replacement: null, selected });
const control = (key: string) => ({ left: 3, enabled: true, reason: null, key });
function view(): ConsoleViewModel {
  return {
    unit: 'offense', step: 'select',
    strip: { quarter: 1, clock: '15:00', clockRunning: false, score: [0, 0], downDistance: '1st & 10', spot: 'own 25', hash: 'middle', timeouts: [3, 3], playClockTenths: 392, latestTenths: 180, radioTenths: 150, late: false, shortClock: false, playClockLengthTenths: 400 },
    sheet: { focusHow: 'base', boxes: [
      { id: 'first', title: 'first', row: 1, col: 0, letter: 'D', focused: true, empty: false, count: 2, tooMany: false, entries: [entry('e1', 'Inside zone', '1', true), entry('e2', 'Power', '2')] },
      { id: 'red', title: 'red', row: 0, col: 0, letter: 'A', focused: false, empty: true, count: 0, tooMany: false, entries: [] },
    ] },
    callLine: { text: 'Inside zone Flip', spokenTenths: 21, tags: ['Flip'], personnel: '11', substitution: false, sent: false, committed: false, relay: 'radio' },
    sideline: { personnel: '11', opponentPersonnel: null, booth: null, tendency: null, tempo: 'huddle', relay: 'radio', cadence: null, timeout: control('KeyT'), challenge: control('KeyC') },
    prompt: null, hint: [{ key: 'Enter', action: 'call.confirm' }], notice: null,
  };
}

describe('G-60 console screen', () => {
  it('draws the five regions and the call line', () => {
    const html = renderToStaticMarkup(createElement(GameConsole, { view: view() }));
    for (const r of ['strip', 'field', 'sheet', 'sideline', 'hint']) expect(html).toContain(`data-region="${r}"`);
    expect(html).toContain('Inside zone');
    expect(html).toContain('data-command="game.timeout"');
  });

  it('embeds the game management panel in the sideline region in place of its own controls', () => {
    const panel = createElement('section', { 'data-panel': 'game-management' }, 'panel');
    const routes = gameCallingRoutes({ view, sideline: () => panel });
    const html = renderToStaticMarkup(createElement(() => routes['game.console']!.render({} as never)));
    const side = html.slice(html.indexOf('data-region="sideline"'));
    expect(side).toContain('data-panel="game-management"');
    expect(html).not.toContain('data-command="game.timeout"');
  });

  it('every text id it uses exists', () => {
    const src = readFileSync(join(__dirname, '../../../src/screens/game-calling/GameConsole.tsx'), 'utf8');
    const ids = [...src.matchAll(/ct\('([a-zA-Z.]+)'/g)].map((m) => m[1]!);
    const consoleSrc = readFileSync(join(__dirname, '../../../../app-services/src/commands/game-calling/console.ts'), 'utf8')
      + readFileSync(join(__dirname, '../../../../app-services/src/commands/game-calling/session.ts'), 'utf8')
      + readFileSync(join(__dirname, '../../../../app-services/src/read-models/game-calling/index.ts'), 'utf8');
    const notices = [...consoleSrc.matchAll(/'(console\.[a-zA-Z]+)'/g)].map((m) => m[1]!).filter((id) => !/^console\.(offense|defense|special|prompt)$/.test(id));
    expect(ids.length).toBeGreaterThan(5);
    expect(missingConsoleText([...ids, ...notices])).toEqual([]);
  });
});

describe('G-60 console with the PV-05 score strip and banners', () => {
  const pres = async (look: 'classic' | 'plain') => {
    const { BannerQueue } = await import('../../../src/presentation/banners/index.ts');
    return {
      teams: [{ short: 'Harbor', primary: '#1d4f91', secondary: '#ffffff' }, { short: 'Ridge', primary: '#9b2226', secondary: '#ffffff' }] as const,
      possession: 0 as const, timeoutsPerHalf: 3, live: false,
      conditions: { noise: 0.4, noiseBase: 0.3, windMph: 8, gustMph: 12, windDirDeg: 90, indoors: false },
      look, banners: { queue: new BannerQueue(), gate: { playClockTenths: 392, live: false, reducedMotion: false }, now: () => 0 },
    };
  };
  it('draws every strip item in the strip region, keeps the coach clock line, and is routed through the source', async () => {
    const { STRIP_ITEMS } = await import('../../../src/presentation/strip/index.ts');
    for (const look of ['classic', 'plain'] as const) {
      const p = await pres(look);
      const routes = gameCallingRoutes({ view, presentation: () => p });
      const html = renderToStaticMarkup(createElement(() => routes['game.console']!.render({} as never)));
      const strip = html.slice(html.indexOf('data-region="strip"'), html.indexOf('data-region="field"'));
      for (const item of STRIP_ITEMS) expect(strip, `${look} ${item}`).toContain(`data-item="${item}"`);
      expect(strip).toContain(`data-look="${look}"`);
      expect(strip).toContain('data-part="clock-line"');
      expect(strip).toContain('18.0');
    }
  });
  it('without presentation the strip region keeps the plain console line', () => {
    const html = renderToStaticMarkup(createElement(GameConsole, { view: view() }));
    expect(html).not.toContain('data-look=');
    expect(html).toContain('Q1 15:00');
  });
});
