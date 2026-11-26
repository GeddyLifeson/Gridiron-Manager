// G-92 designer session and screen model: intents in, a primitives-only view out.
import { describe, expect, it } from 'vitest';
import { ATTRIBUTE_IDS } from '@gm/schema';
import { applyIntent, designerView, openDesigner, type DesignerEnv, type DesignerIntent, type DesignerSession } from '../../src/designer/index.ts';
import { generatePlayer } from '../../src/generator/index.ts';
import { req, rng } from '../generator/helpers.ts';

const ENV: DesignerEnv = { rnd: rng(), editorId: 1, at: { seasonYear: 2030, dayIndex: 200 }, defaultRegion: 'Generated Region', scaleId: 'decimal_5_9' };

function run(s: DesignerSession, ...intents: DesignerIntent[]) {
  let cur = s;
  let committed = null;
  for (const i of intents) { const r = applyIntent(cur, i, ENV); cur = r.session; committed = r.committed ?? committed; }
  return { session: cur, committed };
}

describe('designer session (D13.1.1)', () => {
  it('a closed designer shows the refusal and no sheet', () => {
    const s = openDesigner({ kind: 'career', started: true, sandboxWorld: false, certified: false }, 2030, 100);
    const v = designerView(s, ENV);
    expect(v.open).toBe(false);
    expect(v.refusal?.rule).toBe('D13.1.1');
    expect(run(s, { kind: 'start_blank' }).session.sheet).toBeNull();
  });
  it('archetype start, edits, a warning, the sandbox switch, and a commit that takes the next id', () => {
    const s = openDesigner({ kind: 'none' }, 2030, 100);
    const a = run(s, { kind: 'start_archetype', position: 'DT', archetypeId: 'dt_three_technique' });
    let v = designerView(a.session, ENV);
    expect(v.hasSheet).toBe(true);
    expect(v.archetypes.map((x) => x.id)).toContain('dt_nose_tackle');
    expect(v.canCommit).toBe(true);
    expect(v.staffGrade?.text).toMatch(/position coach, graded 300 snaps of film/);
    expect(v.sections.find((x) => x.id === 'idl')!.fields[0]!.ceilingPath).toBe('ceilings.get_off');
    const b = run(a.session, { kind: 'set_field', path: 'weightLb', value: 330 }, { kind: 'set_field', path: 'tests.fortyS', value: 4.3 });
    v = designerView(b.session, ENV);
    expect(v.canCommit).toBe(false);
    expect(v.blockers).toContain('warnings');
    expect(v.warnings.some((w) => w.fields.includes('tests.fortyS'))).toBe(true);
    expect(v.sections.find((x) => x.id === 'tests')!.fields.find((f) => f.path === 'tests.fortyS')!.warned).toBe(true);
    const refused = run(b.session, { kind: 'commit' });
    expect(refused.committed).toBeNull();
    expect(refused.session.result && !refused.session.result.ok && refused.session.result.rule).toBe('D13.1.2');
    const ok = run(b.session, { kind: 'set_sandbox', on: true }, { kind: 'commit' });
    expect(ok.committed?.record.id).toBe(100);
    expect(ok.committed?.sandbox).toBe(true);
    expect(ok.session.nextPersonId).toBe(101);
    expect(ok.session.result).toEqual({ ok: true, personId: 100 });
  });
  it('blank start lists every missing field; unknown fields and bad numbers are refused', () => {
    const s = run(openDesigner({ kind: 'none' }, 2030, 100), { kind: 'start_blank' }).session;
    const v = designerView(s, ENV);
    expect(v.missing.length).toBe(8 + 2 * ATTRIBUTE_IDS.length);
    expect(v.blockers).toEqual(['missing']);
    const bad = run(s, { kind: 'set_field', path: 'attributes.no_such', value: 3 });
    expect(bad.session.result && !bad.session.result.ok).toBe(true);
    const nan = run(s, { kind: 'set_field', path: 'heightIn', value: 'tall' });
    expect(nan.session.result && !nan.session.result.ok).toBe(true);
    const pos = run(s, { kind: 'set_field', path: 'position', value: 'ZZ' });
    expect(pos.session.result && !pos.session.result.ok).toBe(true);
    const good = run(s, { kind: 'set_field', path: 'position', value: 'CB' }, { kind: 'set_field', path: 'attributes.zone_coverage', value: 61 });
    expect(good.session.sheet!.position).toBe('CB');
    expect(good.session.sheet!.attributes.zone_coverage).toBe(61);
    expect(designerView(good.session, ENV).archetypes.length).toBeGreaterThan(0);
  });
  it('measurables start computes the physical panel; applying an archetype later needs a body first', () => {
    const s = run(openDesigner({ kind: 'none' }, 2030, 100), { kind: 'start_measurables', position: 'WR', ageYears: 22, heightIn: 73, weightLb: 200, fortyS: 4.45, fill: 'generate' }).session;
    const v = designerView(s, ENV);
    expect(v.derived.map((d) => d.attribute)).toEqual(['play_strength', 'explosiveness', 'stamina', 'durability']);
    expect(v.canCommit).toBe(true);
    const lean = run(s, { kind: 'apply_archetype', archetypeId: 'wr_deep_threat' }).session;
    expect(lean.sheet!.archetypeId).toBe('wr_deep_threat');
    const blank = run(openDesigner({ kind: 'none' }, 2030, 100), { kind: 'start_blank' }, { kind: 'set_field', path: 'position', value: 'WR' }, { kind: 'apply_archetype', archetypeId: 'wr_slot' });
    expect(blank.session.result && !blank.session.result.ok && blank.session.result.problems).toContain('heightIn');
    const wrong = run(s, { kind: 'apply_archetype', archetypeId: 'cb_nickel' });
    expect(wrong.session.result && !wrong.session.result.ok).toBe(true);
  });
  it('edit in place keeps the id; real-person locks show on the view and refuse the edit', () => {
    const rec = generatePlayer(req('LB', 5), ENV.rnd).record;
    const inPlace = run(openDesigner({ kind: 'none' }, 2030, 100), { kind: 'start_copy', record: rec, inPlace: true }, { kind: 'commit' });
    expect(inPlace.committed?.record.id).toBe(rec.id);
    expect(inPlace.session.nextPersonId).toBe(100);
    const real = { ...rec, origin: 'imported' as const, externalRef: { source: 'pack', key: 'k' }, traitBlock: { facets: {}, values: {}, goals: [], schemaVersion: 1, source: 'imported_neutral' as const } };
    const s = run(openDesigner({ kind: 'none' }, 2030, 100), { kind: 'start_copy', record: real, inPlace: true }).session;
    const v = designerView(s, ENV);
    expect(v.realPerson).toBe(true);
    expect(v.sections[0]!.fields.find((f) => f.path === 'lastName')!.locked).toBe(true);
    const r = run(s, { kind: 'set_field', path: 'lastName', value: 'X' });
    expect(r.session.result && !r.session.result.ok && r.session.result.rule).toBe('D13.6.2');
    expect(run(s, { kind: 'set_field', path: 'weightLb', value: 240 }).session.sheet!.weightLb).toBe(240);
  });
  it('a career world before start says the world will be marked edited', () => {
    const s = run(openDesigner({ kind: 'career', started: false, sandboxWorld: false, certified: false }, 2030, 100), { kind: 'start_archetype', position: 'S', archetypeId: 's_single_high' });
    expect(designerView(s.session, ENV).marksWorldEdited).toBe(true);
    expect(run(s.session, { kind: 'commit' }).committed?.marksWorldEdited).toBe(true);
  });
});
