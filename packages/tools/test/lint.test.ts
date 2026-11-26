import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintDependencies, lintCorePurity, lintFacts, lintPackageTable, loadFacts, lintForbiddenKeys, lintUiProjection } from '../src/lint.ts';
import { RULE_SET_FILES } from '@gm/rules-data';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function fakeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'gm-lint-'));
  const map = { packages: {
    schema: { kind: 'core', mayImport: [] },
    'engine-core': { kind: 'core', mayImport: ['schema'] },
    officiating: { kind: 'core', mayImport: ['schema'] },
    store: { kind: 'app', mayImport: ['schema'] },
    'app-services': { kind: 'app', mayImport: ['schema'] },
    'app-ui': { kind: 'app', mayImport: ['app-services'] },
    tools: { kind: 'tool', mayImport: ['@any'] },
  } };
  mkdirSync(join(root, 'packages/tools'), { recursive: true });
  writeFileSync(join(root, 'packages/tools/package-map.json'), JSON.stringify(map));
  for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), c); }
  return root;
}

describe('the repository passes its own lints', () => {
  it('package table, dependencies, purity, forbidden keys and facts are clean', () => {
    expect(lintPackageTable(ROOT)).toEqual([]);
    expect(lintDependencies(ROOT)).toEqual([]);
    expect(lintCorePurity(ROOT)).toEqual([]);
    expect(lintForbiddenKeys(ROOT)).toEqual([]);
    expect(lintUiProjection(ROOT)).toEqual([]);
    expect(lintFacts(ROOT).problems).toEqual([]);
  });
});

describe('dependency lint catches banned imports (P1.2.2 acceptance)', () => {
  it('names the rule for a banned import, a core->app import, a deep import and a cycle', () => {
    const root = fakeRepo({
      'packages/schema/src/index.ts': "import { x } from '@gm/engine-core';\n",
      'packages/engine-core/src/index.ts': "import { s } from '@gm/store';\nimport { y } from '@gm/schema/src/inner.ts';\nimport { z } from '@gm/schema';\n",
      'packages/officiating/src/index.ts': "import fs from 'node:fs';\n",
    });
    const rules = lintDependencies(root).map((p) => p.rule);
    expect(rules).toContain('P1.2.1 may-import');
    expect(rules).toContain('P1.2.2 core imports app/tool');
    expect(rules).toContain('P1.2.2 internal files');
    expect(rules).toContain('P1.2.2 cycle');
    expect(rules).toContain('P1.1.1 core external import');
  });
});

describe('core purity lint (P1.1.1 acceptance 1, P1.1.2 acceptance 2)', () => {
  it('flags clock, random, transcendental math, exponent, level branches and literals', () => {
    const root = fakeRepo({
      'packages/engine-core/src/a.ts': "const t = Date.now(); const r = Math.random(); const s = Math.sin(1); const p = 2 ** 3;\nif (level === 'college') {}\n// Math.cos in a comment is fine\nconst q = 'Math.exp in a string is fine';\n",
      'packages/officiating/src/b.ts': 'export const playClock = 40;\nexport const ok = [0, 1];\n',
    });
    const msgs = lintCorePurity(root).map((p) => `${p.rule}: ${p.message}`);
    expect(msgs.some((m) => m.includes('Date'))).toBe(true);
    expect(msgs.some((m) => m.includes('Math.random'))).toBe(true);
    expect(msgs.some((m) => m.includes('Math.sin'))).toBe(true);
    expect(msgs.some((m) => m.includes('**'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('P1.1.2 level word'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('P1.1.2 numeric literal') && m.includes('40'))).toBe(true);
    expect(msgs.some((m) => m.includes('Math.cos') || m.includes('Math.exp'))).toBe(false);
  });
});

describe('fact links (Q6.2.1, Q1.2.1, Q6.3.1 acceptance)', () => {
  const rows = loadFacts(ROOT);
  const clone = () => JSON.parse(JSON.stringify(RULE_SET_FILES));
  it('removing a factId from a rule value fails', () => {
    const files = clone();
    files[0].values[0].factId = 'F-rule-9999';
    expect(lintFacts(ROOT, { files, rows }).problems.map((p) => p.rule)).toContain('Q6.2.1 fact link');
  });
  it('changing the play clock in a rule-set file without changing the register fails', () => {
    const files = clone();
    const v = files[0].values.find((x: { key: string }) => x.key === 'clock.play_clock_s');
    v.value = 45;
    expect(lintFacts(ROOT, { files, rows }).problems.map((p) => p.rule)).toContain('Q6.2.1 fact value');
  });
  it('a missing key in one level file fails (P1.3.3)', () => {
    const files = clone();
    files[1].values = files[1].values.filter((x: { key: string }) => x.key !== 'catch.feet_required' && x.key !== 'series.downs');
    expect(lintFacts(ROOT, { files, rows }).problems.map((p) => p.message).join('\n')).toContain('missing required key series.downs');
  });
  it('a rule row below Rulebook only fails, and a typed status that differs from the computed one fails', () => {
    const r2 = JSON.parse(JSON.stringify(rows));
    // The first rule-domain row: facts/measured-rate.json sorts before facts/rule.json.
    const i = r2.findIndex((r: { domain: string }) => r.domain === 'rule');
    r2[i].sources = [{ ...r2[i].sources[0], howRead: 'model knowledge', primary: false }];
    const rules = lintFacts(ROOT, { rows: r2 }).problems.map((p) => p.rule);
    expect(rules).toContain('Q6.1.2 computed status');
    r2[i].status = 'Unverified';
    expect(lintFacts(ROOT, { rows: r2 }).problems.map((p) => p.rule)).toContain('Q6.3.1 rule status');
  });
});

describe('UI projection lint (D6.5.1, O6.5.1 rule 2, MA-48)', () => {
  it('flags projection internals and projected numbers in the UI layer, and nothing else', () => {
    const root = fakeRepo({
      'packages/app-services/src/read.ts': "import { project, gradeCells, band as b } from '@gm/people';\nexport { halfWidth } from '@gm/people';\nconst x = people.scouting.project(input);\n",
      'packages/app-ui/src/card.ts': "const t = `${read.projection.mean}`;\nconst ok = scouting.potentialRead(i);\nconst c = row.band;\n// scouting.project( in a comment is fine\n",
      'shells/browser/src/main.ts': "import type { Projection } from '@gm/people';\n",
      'packages/store/src/db.ts': "import { project } from '@gm/people';\n",
    });
    const p = lintUiProjection(root);
    expect(p.every((x) => x.rule === 'D6.5.1 no projected number in UI')).toBe(true);
    const where = p.map((x) => `${x.file.replace(/\\/g, '/')}:${x.line}`).sort();
    expect(where).toEqual([
      'packages/app-services/src/read.ts:1', 'packages/app-services/src/read.ts:1', 'packages/app-services/src/read.ts:2', 'packages/app-services/src/read.ts:3',
      'packages/app-ui/src/card.ts:1', 'shells/browser/src/main.ts:1',
    ]);
  });
});
