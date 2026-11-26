import { describe, it, expect } from 'vitest';
import { parseBibleFile, scopeOf, parsePhaseGates } from '../lib/bible.ts';
import { resolveOwns, parseBibleRefs, parseGamePlan, parseEnginePlan, ownerOf } from '../lib/plans.ts';

const LEAVES = `## X1 Area
### X1.1.1 First leaf   [v1, both]

**Purpose.** Something.

**Acceptance criteria.** 1. It works.
2. It still works.

**Open questions.** None.

### X1.1.2 Later leaf   [v2]

**Acceptance criteria.** Never in v1.

### X1.1.3 Retired

**Purpose.** Gone.

---
### X1.1.4 No criterion   [v1]

**Purpose.** Missing its criterion.
`;

describe('bible parser', () => {
  it('reads each leaf, its tag, scope and full acceptance text', () => {
    const l = parseBibleFile(LEAVES, 'x.md');
    expect(l.map((x) => x.id)).toEqual(['X1.1.1', 'X1.1.2', 'X1.1.3', 'X1.1.4']);
    expect(l[0]).toMatchObject({ title: 'First leaf', tag: 'v1, both', inScope: true, criterion: '1. It works. 2. It still works.' });
    expect(l[1]!.inScope).toBe(false);
    expect(l[2]!.inScope).toBe(false);
    expect(l[3]!.criterion).toBe('');
  });
  it('scope: v1 anywhere in the tag is in; only-later and retired are out; no version is assumed v1 and says so', () => {
    expect(scopeOf('v1 mouse, v2 controller and touch', 'x').inScope).toBe(true);
    expect(scopeOf('later', 'x').inScope).toBe(false);
    expect(scopeOf('v1, both, retired 2026-11-25', 'x').inScope).toBe(false);
    const s = scopeOf('level: both', 'x');
    expect(s.inScope).toBe(true);
    expect(s.note).toMatch(/treated as v1/);
  });
  it('reads numbered gate items per phase', () => {
    const g = parsePhaseGates(`### R1.2.1 Phase 0: foundations   [v1, both]\n\n**Rules and logic.** Gate: **x**\n1. First item.\n2. Second item.\n\n**Football facts used.** None.\n3. not a gate item\n### R1.2.2 Phase 1   [v1]\n**Rules and logic.** Gate:\n1. Only.\n`);
    expect(g.map((x) => `${x.phase}#${x.item}`)).toEqual(['R1.2.1#1', 'R1.2.1#2', 'R1.2.2#1']);
  });
});

describe('plan parser', () => {
  it('resolves relative owned paths against the last package', () => {
    expect(resolveOwns('`packages/store/src/save/`, `src/log/`, `src/snapshot/`')).toEqual(['packages/store/src/save/', 'packages/store/src/log/', 'packages/store/src/snapshot/']);
    expect(resolveOwns('screens `settings`')).toEqual(['packages/app-ui/src/screens/settings/']);
    expect(resolveOwns('`packages/schema/src/world/**` (new files only, with its own `index.ts`)')).toEqual(['packages/schema/src/world/']);
  });
  it('expands bible ranges and drops parentheticals', () => {
    expect(parseBibleRefs('P4.1 to P4.3, Q1.7.2 (season), F')).toEqual(['P4.1', 'P4.2', 'P4.3', 'Q1.7.2', 'F']);
  });
  it('reads game rows and engine headings', () => {
    const g = parseGamePlan('| G-99 | Coach validation tooling | Q5 | `packages/headless/src/validation/` | G-63 | Blind film test runs | Sonnet |');
    expect(g[0]).toMatchObject({ id: 'G-99', owns: ['packages/headless/src/validation/'], bible: ['Q5'], acceptance: 'Blind film test runs' });
    const e = parseEnginePlan('**WP-03 Kicks, restarts, overtime.** Package officiating.\n- Owns: `packages/officiating/src/kick/`, `src/restart/`.\n- Bible: B6, B10.\n- Acceptance: overtime runs to a result.\n');
    expect(e[0]).toMatchObject({ id: 'WP-03', owns: ['packages/officiating/src/kick/', 'packages/officiating/src/restart/'], bible: ['B6', 'B10'], acceptance: 'overtime runs to a result.' });
  });
  it('the most specific bible reference owns a leaf', () => {
    const wps = parseGamePlan('| G-1 | a | Q5 | `scripts/a/` | x | y | z |\n| G-2 | b | Q5.2.1 | `scripts/b/` | x | y | z |');
    expect(ownerOf('Q5.2.1', wps)).toBe('G-2');
    expect(ownerOf('Q5.3.1', wps)).toBe('G-1');
    expect(ownerOf('Q50.1.1', wps)).toBeUndefined();
  });
});
