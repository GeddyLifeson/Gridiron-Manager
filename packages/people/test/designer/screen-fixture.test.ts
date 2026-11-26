// The player designer screen (app-ui, G-92) renders from a fixture of this module's screen model. This
// test rebuilds the fixture and fails when the model changes shape or content without the fixture, so the
// screen's declared type and the model cannot drift apart. GM_WRITE_FIXTURES=1 rewrites it.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyIntent, designerView, openDesigner, type DesignerEnv, type DesignerIntent, type DesignerView, type DesignerWorld } from '../../src/designer/index.ts';
import { rng } from '../generator/helpers.ts';

const FIXTURE = join(__dirname, '..', '..', '..', 'app-ui', 'test', 'screens', 'player-designer', 'fixtures.json');
const ENV: DesignerEnv = { rnd: rng(4), editorId: 1, at: { seasonYear: 2030, dayIndex: 200 }, defaultRegion: 'Generated Region', scaleId: 'decimal_5_9' };

function view(intents: DesignerIntent[], world: DesignerWorld = { kind: 'none' }): DesignerView {
  let s = openDesigner(world, 2030, 100);
  for (const i of intents) s = applyIntent(s, i, ENV).session;
  return designerView(s, ENV);
}

export function buildFixtures(): Record<string, DesignerView> {
  return {
    empty: view([]),
    closed: view([], { kind: 'career', started: true, sandboxWorld: false, certified: false }),
    archetype: view([{ kind: 'start_archetype', position: 'CB', archetypeId: 'cb_nickel' }]),
    warned: view([
      { kind: 'start_archetype', position: 'OT', archetypeId: 'ot_road_grader' },
      { kind: 'set_field', path: 'weightLb', value: 330 }, { kind: 'set_field', path: 'tests.fortyS', value: 4.3 },
    ]),
    blank: view([{ kind: 'start_blank' }], { kind: 'career', started: false, sandboxWorld: false, certified: false }),
  };
}

describe('screen fixture (G-92)', () => {
  it('matches the screen model', () => {
    const fresh = JSON.parse(JSON.stringify(buildFixtures()));
    if (process.env.GM_WRITE_FIXTURES === '1') writeFileSync(FIXTURE, `${JSON.stringify(fresh, null, 1)}\n`);
    expect(existsSync(FIXTURE)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE, 'utf8'))).toEqual(fresh);
  });
});
