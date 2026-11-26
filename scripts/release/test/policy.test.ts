import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadPolicy, permitReason } from '../lib/policy.ts';
import { trackedFiles } from '../lib/git.ts';

const ROOT = join(import.meta.dirname, '../../..');
const policy = loadPolicy(join(ROOT, 'scripts/release/data/policy.json'));

describe('G-100 scan policy', () => {
  it('permits provenance files, comments, annotation keys, generic words and code identifiers', () => {
    expect(permitReason(policy, 'facts/cap.json', '"quote": "x"', 'NFL', 'mark')).toBe('provenance-file');
    expect(permitReason(policy, 'packages/career/src/market/facts.json', undefined, 'Sean Payton', 'name')).toBe('provenance-file');
    expect(permitReason(policy, 'packages/a/src/x.ts', '// read from the NFL rulebook', 'NFL', 'mark')).toBe('comment');
    expect(permitReason(policy, 'packages/a/src/x.json', '  "source": "NCAA Bylaw 11"', 'NCAA', 'mark')).toBe('annotation-key');
    expect(permitReason(policy, 'packages/a/src/x.ts', 'const x = playoffs;', 'playoff', 'mark')).toBe('generic-term');
    expect(permitReason(policy, 'packages/a/src/x.ts', 'const U_ACC = 7;', 'ACC', 'mark')).toBe('identifier');
  });
  it('fails everything a player could see', () => {
    expect(permitReason(policy, 'packages/app-ui/src/shell/text.json', '  "title": "NFL Standings"', 'NFL', 'mark')).toBeNull();
    expect(permitReason(policy, 'packages/a/src/x.ts', "const label = 'ACC Tournament';", 'ACC', 'mark')).toBeNull();
    expect(permitReason(policy, 'packages/a/src/x.ts', "claim: 'Origin: Jack Lambert'", 'Jack Lambert', 'name')).toBeNull();
    expect(permitReason(policy, 'content/world/teams.json', '"place": "Detroit"', 'detroit lions', 'mark')).toBeNull();
    expect(permitReason(policy, 'packages/a/src/x.ts', "'College Football Playoff'", 'college football playoff', 'mark')).toBeNull();
  });
  it('keeps every provenance file out of the presentation layer and the shells', () => {
    const prov = trackedFiles(ROOT).filter((f) => policy.provenanceFiles.some((r) => new RegExp(r).test(f)) && !/\/test\//.test(f));
    const names = prov.map((f) => f.split('/').pop()!.replace(/\.(json|ts)$/, ''));
    const layers = trackedFiles(ROOT).filter((f) => /^(packages\/(app-ui|app-services)\/src|shells\/[^/]+\/(src|bridge))\//.test(f) && /\.(ts|tsx|js)$/.test(f));
    const bad: string[] = [];
    for (const f of layers) {
      const text = readFileSync(join(ROOT, f), 'utf8');
      for (const m of text.matchAll(/(?:from|import\(|require\()\s*['"]([^'"]+)['"]/g)) {
        const spec = m[1]!;
        if (/(^|\/)(facts[^/]*|fact-rows)(\.json)?$/.test(spec) || /content\/calibration|starter\/sources/.test(spec)) bad.push(`${f} -> ${spec}`);
      }
    }
    expect(bad).toEqual([]);
    expect(names.length).toBeGreaterThan(0);
  });
});
