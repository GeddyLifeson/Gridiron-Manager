// The K9.3 information audit as a test, and the swap test of Q1.4.1.
//   K9.3.1 static:  AI decision code and interface code name no truth type and no world state.
//   K9.3.2 dynamic: AI decisions change only when information that AI may have changes.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import * as schema from '@gm/schema';
import { Decision, type PersonView, type WorldEvent } from '@gm/schema';
import {
  auditHidden, auditVisible, auditSource, truthSymbols, hiddenFacts, withTable, observerFor, filterValue, mutateWhere, fullSample, canonical,
  newReport, DECISION_PACKAGES, INTERFACE_PACKAGES, WORLD_STATE_SYMBOLS, PARAMS, type TableSource, type VisibleFact,
} from '../../src/observer/index.ts';
import { fixtureWorld, HOME, AWAY, USER, AWAY_COACH } from './fixture-world.ts';
import { runHonest, runTruthReader, runPlanReader, runBoardReader } from './models.ts';

const root = resolve(__dirname, '../../../..');
const TRUTH = truthSymbols(schema);

function sources(pkg: string): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) out.push({ file: relative(root, p).split('\\').join('/'), text: readFileSync(p, 'utf8') });
    }
  };
  walk(join(root, 'packages', pkg, 'src'));
  return out;
}

describe('static audit (K9.3.1, Q1.4.1 check 1)', () => {
  it('knows which contract names hold truth', () => {
    for (const s of ['PersonRecord', 'PlayingBlock', 'TraitBlock', 'SimPlayer', 'PlayTruth', 'PlayRecord', 'GameState', 'WorldEvent', 'KnowledgeRow', 'MemoryRow', 'CultureRecord']) expect(TRUTH).toContain(s);
    for (const s of ['PersonView', 'ObservedPlayer', 'GameSituation', 'DecisionRequest', 'JobRecord', 'RosterSlot', 'NewsItem']) expect(TRUTH).not.toContain(s);
  });
  it('a truth type imported into a K4 play-calling file fails, with the file and line', () => {
    const k4 = [
      "// K4 play calling. PersonRecord in a comment is fine, and so is 'SimPlayer' in a string.",
      "import type { GameSituation, PersonView } from '@gm/schema';",
      "import type { SimPlayer } from '@gm/schema';",
      'export function callPlay(view: PersonView, s: GameSituation, cheat: SimPlayer) { return cheat.attributes; }',
    ].join('\n');
    expect(auditSource('packages/coach-ai/src/calling/call.ts', k4, TRUTH)).toEqual([
      { file: 'packages/coach-ai/src/calling/call.ts', line: 3, symbol: 'SimPlayer', rule: 'truth type' },
      { file: 'packages/coach-ai/src/calling/call.ts', line: 4, symbol: 'SimPlayer', rule: 'truth type' },
    ]);
  });
  it('a namespace import does not hide it, and a world-state argument fails too (K9.1.1 acceptance)', () => {
    const src = "import * as S from '@gm/schema';\nexport const f = (w: S.WorldState, p: S.PersonRecord) => 1;";
    const found = auditSource('x.ts', src, TRUTH).map((v) => `${v.symbol}: ${v.rule}`);
    expect(found).toContain('PersonRecord: truth type');
    expect(found).toContain('WorldState: world state');
    expect(WORLD_STATE_SYMBOLS).toContain('TableSource');
  });
  it('a reviewed exception is named by file and symbol (the K3.3.1 substitution function)', () => {
    const src = "import type { SimPlayer } from '@gm/schema';";
    expect(auditSource('packages/coach-ai/src/reps/substitute.ts', src, TRUTH, { allow: ['packages/coach-ai/src/reps/substitute.ts#SimPlayer'] })).toEqual([]);
  });
  for (const pkg of [...DECISION_PACKAGES, ...INTERFACE_PACKAGES]) {
    it(`package ${pkg}: no source file names a truth type or the world state`, () => {
      const violations = sources(pkg).flatMap((s) => auditSource(s.file, s.text, TRUTH));
      expect(violations).toEqual([]);
    });
  }
});

describe('dynamic audit: paired worlds (K9.3.2, Q1.4.1 check 2)', () => {
  const world = fixtureWorld();
  const coach = observerFor(world, AWAY_COACH);
  const tables = ['people', 'personViews', 'personStates', 'knowledge', 'events', 'teams', 'cultures', 'injuries', 'prospects', 'contracts', 'memories', 'games'];

  it('the fact list is everything the filter withholds from that seat, by table and field', () => {
    const ids = hiddenFacts(world, coach).map((f) => f.id);
    for (const id of [
      'people:$.playing.attributes:truth', 'people:$.traitBlock:truth', 'people:$.coaching.hidden:truth', 'knowledge:$.value:truth',
      'personViews:$:hidden_row',          // the other staff's estimates
      'events:$:hidden_row',               // the other staff's meeting: their unrevealed plan
      'prospects:$.teams[]:hidden_row',    // the other team's board line
      'contracts:$.terms.salary:not_owner', 'games:$.seedHex:truth', 'injuries:$.trueDaysToMilestone:truth', 'cultures:$.labelPreferences:truth',
    ]) expect(ids).toContain(id);
    // Each fact changes hidden values only: the seat's own filtered tables are identical in both worlds.
    const person = hiddenFacts(world, coach).find((f) => f.id === 'people:$.playing.attributes:truth')!.apply();
    expect(person.changed).toBeGreaterThan(100);
    expect(canonical(person.source.rows('people'))).not.toBe(canonical(world.rows('people')));
  });

  it('an AI that decides from its view makes the same decisions in every paired world: zero divergences', () => {
    const r = auditHidden({ source: world, observer: coach, run: runHonest(AWAY, AWAY_COACH), tables });
    expect(r.divergences).toEqual([]);
    expect(r.checked.length).toBeGreaterThan(40);
    // The user's side is audited the same way: the interface is bound by the same list (K9.1.1).
    expect(auditHidden({ source: world, observer: observerFor(world, USER), run: runHonest(HOME, USER), tables }).divergences).toEqual([]);
  });

  it('a test AI that reads a true rating is caught', () => {
    const r = auditHidden({ source: world, observer: coach, run: runTruthReader(AWAY, AWAY_COACH), tables });
    expect(r.divergences.map((d) => [d.fact, d.kind])).toEqual([['people:$.playing.attributes:truth', 'output']]);
  });
  it('a test AI that reads the other staff\'s unrevealed plan is caught', () => {
    const r = auditHidden({ source: world, observer: coach, run: runPlanReader(AWAY, AWAY_COACH), tables });
    expect(r.divergences.map((d) => d.fact)).toEqual(['events:$:hidden_row']);
  });
  it('a test AI that reads the other organisation\'s board is caught', () => {
    const r = auditHidden({ source: world, observer: coach, run: runBoardReader(AWAY, AWAY_COACH), tables });
    expect(r.divergences.map((d) => d.fact)).toEqual(['personViews:$:hidden_row']);
  });

  it('reverse test: each kind of visible fact can change a decision (K9.3.2 rule 5)', () => {
    const edit = <T>(table: string, f: (rows: T[]) => void) => (s: TableSource) => { const rows = structuredClone(s.rows(table)) as T[]; f(rows); return withTable(s, table, rows); };
    const facts: VisibleFact[] = [
      { id: 'own estimate moves', type: 'own_estimate', apply: edit<PersonView>('personViews', (rows) => { rows.find((v) => v.observerTeamId === AWAY && v.personId === 109)!.perAttribute.arm_strength!.estimate = 99; }) },
      { id: 'public result changes', type: 'public_record', apply: edit<WorldEvent>('events', (rows) => { rows.find((e) => e.type === 'game.result')!.payload.margin = -3; }) },
    ];
    expect(auditVisible({ source: world, run: runHonest(AWAY, AWAY_COACH), facts })).toEqual([]);
    // A process that ignores everything passes the hidden audit and fails this one.
    expect(auditHidden({ source: world, observer: coach, run: () => 'always the same', tables }).divergences).toEqual([]);
    expect(auditVisible({ source: world, run: () => 'always the same', facts })).toEqual(['own_estimate', 'public_record']);
  });

  it('a test AI that reads the user\'s call before the snap is caught (Q1.4.1 acceptance)', () => {
    // The user's side (0) has answered a call request; the AI on side 1 decides next.
    const pending = { ...(fullSample(Decision) as Record<string, unknown>), side: 0 };
    const sides: [number, number] = [HOME, AWAY];
    const report = newReport();
    filterValue(Decision, pending, coach, { sideTeams: sides, report });
    const hidden = new Set(report.dropped.filter((d) => d.reason === 'not_owner').map((d) => d.path));
    expect([...hidden]).toEqual(['$.snappingCall', '$.opposingCall']);
    const swapped = mutateWhere(Decision, pending, (p) => (hidden.has(p) ? 'all' : null)).value;
    expect(canonical(swapped)).not.toBe(canonical(pending));

    const honest = (d: unknown) => canonical(filterValue(Decision, d, coach, { sideTeams: sides }));
    const cheat = (d: unknown) => canonical((d as { snappingCall: unknown }).snappingCall);
    expect(honest(swapped)).toBe(honest(pending));
    expect(cheat(swapped)).not.toBe(cheat(pending));
  });

  it('the swap test run size for real coach AI is a stated starting value', () => {
    expect(PARAMS.params.find((p) => p.name === 'observer.audit.swap_games')).toMatchObject({ value: 500, basis: 'bible', leaf: 'Q1.4.1' });
  });
});
