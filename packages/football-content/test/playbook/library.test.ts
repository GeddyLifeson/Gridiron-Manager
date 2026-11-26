// G-67 acceptance, G3 playbook manager: library, families and grid, roles, series, size report, versions,
// import and export, permissions and search. Each test names the leaf whose acceptance it checks.
import { describe, expect, it } from 'vitest';
import { scanForbiddenJson, ParamFile, RuleKeyManifest } from '@gm/schema';
import * as pb from '../../src/playbook/index.ts';
import { book500, lcg, part, play, validate, CONCEPT_WORDS } from './fixtures.ts';

describe('module contract', () => {
  it('PARAMS and RULE_KEYS parse against the schema and carry no forbidden keys', () => {
    expect(ParamFile.safeParse(pb.PARAMS).success).toBe(true);
    expect(RuleKeyManifest.safeParse(pb.RULE_KEYS).success).toBe(true);
    expect(scanForbiddenJson('playbook-params', pb.PARAMS)).toEqual([]);
    for (const p of pb.PARAMS.params) expect(p.value >= p.min && p.value <= p.max, p.name).toBe(true);
  });
  it('radio values are read by key, absent keys mean no radio', () => {
    const none = pb.radioRules({ keys: () => [], num: () => { throw new Error('x'); }, bool: () => { throw new Error('x'); } });
    expect(none).toEqual({ cutoffS: null, defenseSpeakers: 0, equityOnFailure: false });
    const vals: Record<string, number | boolean> = { 'comm.c2p_allowed': true, 'comm.c2p_cutoff_seconds': 15, 'comm.c2p_receivers_defense': 1, 'comm.c2p_equity_on_failure': true };
    const r = pb.radioRules({ keys: () => Object.keys(vals), num: (k) => vals[k] as number, bool: (k) => vals[k] as boolean });
    expect(r).toEqual({ cutoffS: 15, defenseSpeakers: 1, equityOnFailure: true });
    const off: Record<string, number | boolean> = { ...vals, 'comm.c2p_allowed': false };
    expect(pb.radioRules({ keys: () => Object.keys(off), num: (k) => off[k] as number, bool: (k) => off[k] as boolean }).cutoffS).toBeNull();
  });
});

describe('G3.1.1 playbook object', () => {
  it('builds the starting book from the starter content, one home section per play', () => {
    const { book } = pb.starterBook('T');
    expect(book.plays.size).toBe(20);
    for (const p of book.plays.values()) expect(p.section.length).toBeGreaterThan(0);
    expect(pb.playsIn(book, 'offense', ['two_minute']).map((p) => p.id).sort()).toEqual(['kneel_victory', 'spike_clock']);
  });
  it('a 1,500-play book opens (builds and indexes) in under 1 s', () => {
    const t0 = globalThis.performance.now();
    const c = catalogue();
    const book = pb.generateBook(pb.emptyBook('T'), c, 1500);
    const words = pb.defaultWordList(book, 'concept');
    pb.buildSearchIndex(book, words);
    expect(globalThis.performance.now() - t0).toBeLessThan(1000);
    expect(book.plays.size).toBe(1500);
  });
  it('editing a shared formation updates every dependent play and re-validates each', () => {
    const { book } = book500();
    const r = pb.editPart(book, { ...book.parts.get('f0')!, content: 'illegal' }, validate);
    expect(r.dependents.length).toBe(50);
    expect(r.failed.length).toBe(50);
    for (const id of r.dependents) expect(r.book.plays.get(id)!.status).toBe('draft');
    expect(r.book.plays.get('p.1.sr.0')!.status).toBe('valid');
  });
  it('deleting a part in use is blocked; an unused part deletes', () => {
    const { book } = book500();
    expect(() => pb.deletePart(book, 'f0')).toThrow(/used by 50/);
    expect(pb.deletePart(book, 'tag.alert').parts.has('tag.alert')).toBe(false);
  });
  it('every generated pro offensive book falls in the 600 to 1,000 range at creation', () => {
    const r = lcg(7);
    const c = catalogue();
    for (let i = 0; i < 200; i++) {
      const n = pb.generatedBookSize(r());
      expect(n).toBeGreaterThanOrEqual(600);
      expect(n).toBeLessThanOrEqual(1000);
    }
    expect(pb.generatedBookSize(0)).toBe(600);
    expect(pb.generatedBookSize(0.999999)).toBe(1000);
    const book = pb.generateBook(pb.emptyBook('T'), c, pb.generatedBookSize(0.5));
    expect(book.plays.size).toBe(800);
  });
  it('retired plays keep their entry and restore to draft; illegal status jumps refuse', () => {
    const { book } = book500();
    const ret = pb.setStatus(book, 'p.0.sr.0', 'retired');
    expect(pb.playsIn(ret, 'offense').some((p) => p.id === 'p.0.sr.0')).toBe(false);
    expect(pb.playsIn(ret, 'offense', [], true).some((p) => p.id === 'p.0.sr.0')).toBe(true);
    expect(pb.setStatus(ret, 'p.0.sr.0', 'draft').plays.get('p.0.sr.0')!.status).toBe('draft');
    expect(() => pb.setStatus(ret, 'p.0.sr.0', 'installed')).toThrow();
  });
});

describe('G3.1.2 families and grid', () => {
  it('every play belongs to exactly one family; variants show under the parent', () => {
    const { book } = book500();
    const fams = pb.families(book);
    const all = fams.flatMap((f) => f.plays);
    expect(all.length).toBe(book.plays.size);
    expect(new Set(all).size).toBe(book.plays.size);
    expect(fams.length).toBe(CONCEPT_WORDS.length);
  });
  it('filling a grid cell yields a valid play or reports why; concept profile costs less than digit or descriptive', () => {
    let { book } = book500();
    book = pb.withParts(book, [part('fx', 'formation', 'Heavy'), part('fbad', 'formation', 'Broken', { content: 'illegal' })]);
    const ok = pb.fillCell(book, 'c0', 'fx', 'concept', validate, 'new.1');
    expect(ok.play!.status).toBe('valid');
    expect(ok.failures).toEqual([]);
    const bad = pb.fillCell(ok.book, 'c0', 'fbad', 'concept', validate, 'new.2');
    expect(bad.play!.status).toBe('draft');
    expect(bad.failures[0]).toMatch(/illegal/);
    expect(pb.fillCell(book, 'c0', 'fx', 'concept', validate, 'n').units).toBeLessThan(pb.fillCell(book, 'c0', 'fx', 'digit', validate, 'n').units);
    expect(pb.fillCell(book, 'c0', 'fx', 'concept', validate, 'n').units).toBeLessThan(pb.fillCell(book, 'c0', 'fx', 'descriptive', validate, 'n').units);
    const grid = pb.conceptGrid(ok.book);
    expect(grid.cells.get('c0')!.get('fx')!.state).toBe('exists');
    expect(grid.thin).toContain('fx');
    expect(grid.rowFormations.get('c0')!.carried).toBe(11);
  });
});

describe('G3.2.1 roles', () => {
  const setup = () => {
    let { book } = book500();
    book = pb.replacePlay(book, { ...book.plays.get('p.0.sr.1')!, role: 'complement' });
    book = pb.replacePlay(book, { ...book.plays.get('p.0.sr.2')!, role: 'constraint', status: 'installed' });
    return book;
  };
  it('the review lists every base play with no linked complement', () => {
    const book = setup();
    const links = pb.addLink(book, [], { base: 'p.0.sr.0', reaction: 'safety fits fast', answer: 'p.0.sr.1' });
    const r = pb.review(book, links, () => ({ called: 0, lastCalledWeek: null, readinessEstimate: 0, gamesInstalled: 5 }), [{ base: 'p.0.sr.0', reaction: 'end crashes' }], ['p.0.sr.0', 'p.0.sr.1']);
    expect(r.baseWithoutComplement).not.toContain('p.0.sr.0');
    expect(r.baseWithoutComplement).toContain('p.0.sr.3');
    expect(r.reactionsWithoutAnswer).toEqual([{ base: 'p.0.sr.0', reaction: 'end crashes' }]);
    expect(r.constraintsNeverCalled).toEqual(['p.0.sr.2']);
  });
  it('a reaction seen on 2 of the last 6 base calls is not reported; on 3 of 6 it is', () => {
    const book = setup();
    const links = pb.addLink(book, [], { base: 'p.0.sr.0', reaction: 'end crashes', answer: 'p.0.sr.2' });
    const calls = (seen: number) => Array.from({ length: 6 }, (_, i) => ({ playId: 'p.0.sr.0', reactions: i < seen ? ['end crashes'] : [] }));
    expect(pb.boothReport(links, calls(2))).toEqual([]);
    expect(pb.boothReport(links, calls(3))).toEqual([{ base: 'p.0.sr.0', reaction: 'end crashes', seen: 3, answers: ['p.0.sr.2'] }]);
  });
  it('flags a plan whose shot share is above 10%', () => {
    let book = setup();
    book = pb.replacePlay(book, { ...book.plays.get('p.0.sr.4')!, role: 'shot' });
    const r = pb.review(book, [], () => undefined, [], ['p.0.sr.4', 'p.0.sr.5', 'p.0.sr.6']);
    expect(r.shotFlag).toBe(true);
  });
});

describe('G3.2.2 series', () => {
  it('two identical plays score 1.0; a run and its exact play-action copy score 1.0 until the fake ends', () => {
    const { book } = pb.starterBook('T');
    const iz = book.plays.get('run_inside_zone_right')!;
    expect(pb.similarity(iz.look!, iz.look!)).toBe(1);
    const pa: pb.PlayEntry = { ...iz, id: 'pa_copy', role: 'complement' };
    const b2 = pb.addPlay(book, pa);
    expect(pb.scoreSeries(b2, { id: 's', name: 'zone', plays: ['run_inside_zone_right', 'pa_copy'] }).score).toBe(1);
    const moved = { ...iz, id: 'other', look: iz.look!.map((s) => (s.role === 'R' ? { ...s, move: [s.move[0], -s.move[1] - 3] as const } : s)) };
    expect(pb.similarity(iz.look!, moved.look)).toBeCloseTo(10 / 11, 10);
  });
  it('deterministic angle: matches atan2 within 0.01 degree', () => {
    for (let i = 0; i < 360; i += 7) {
      const r = (i * Math.PI) / 180;
      const want = (Math.atan2(Math.sin(r), Math.cos(r)) * 180) / Math.PI;
      expect(Math.abs(pb.angleDeg(Math.sin(r), Math.cos(r)) - want)).toBeLessThan(0.01);
    }
  });
});

describe('G3.3.1 size report', () => {
  const inputs = (planSize: number): pb.SizeInputs => ({ teamReps: 180, meetingUnits: 20, unitsPerRep: 0.1, decayPerUnit: 0.05, newInstall: 5, planSize });
  it('R = 180 team reps prints a readiness ceiling of 40', () => {
    expect(pb.readinessCeiling(180)).toBe(40);
  });
  it('raising the plan above the ceiling turns the warning amber without changing knowledge', () => {
    const { book } = book500();
    expect(pb.sizeReport(book, inputs(40)).warning).toBe('none');
    expect(pb.sizeReport(book, inputs(41)).warning).toBe('amber');
  });
  it('retiring a section lowers the upkeep number by that section\'s units', () => {
    let { book } = book500();
    for (const id of [...book.plays.keys()].slice(0, 60)) book = pb.replacePlay(book, { ...book.plays.get(id)!, status: 'installed' });
    book = pb.replacePlay(book, { ...book.plays.get('p.0.sr.0')!, section: ['quick'] });
    const r = pb.sizeReport(book, inputs(30));
    const quick = r.sectionUpkeep.find((s) => s.section === 'offense/quick')!;
    expect(pb.upkeepWithout(book, inputs(30), 'offense/quick')).toBeCloseTo(r.upkeep - quick.units, 10);
    expect(quick.units).toBeGreaterThan(0);
  });
  it('red when upkeep plus new install exceeds capacity; mid-season signings listed first', () => {
    let { book } = book500();
    for (const id of book.plays.keys()) book = pb.replacePlay(book, { ...book.plays.get(id)!, status: 'installed' });
    const r = pb.sizeReport(book, { ...inputs(30), decayPerUnit: 1, playersBehind: [{ personId: 'a', estimate: 0.2, signedInSeason: false }, { personId: 'b', estimate: 0.5, signedInSeason: true }] });
    expect(r.warning).toBe('red');
    expect(r.playersBehind).toEqual(['b', 'a']);
  });
});

describe('G3.4 versions, import, export, starting books', () => {
  it('export then import into an empty save reproduces every play object exactly', () => {
    const { book, words } = book500();
    const file = pb.exportBook(book);
    const json = pb.toJson(file);
    const empty = pb.emptyBook('U');
    const r = pb.importFile(empty, pb.defaultWordList(empty, words.family), pb.fromJson(json), validate);
    expect(r.report.imported.length).toBe(book.plays.size);
    for (const p of book.plays.values()) expect(r.book.plays.get(p.id)).toEqual({ ...p, status: 'draft' });
    expect(pb.toJson(pb.exportBook(r.book))).toBe(pb.toJson({ ...file, plays: file.plays.map((p) => ({ ...p, status: 'draft' as const })) }));
    expect(json).not.toMatch(/called|readiness|result/);
  });
  it('a play that fails validation is never imported as valid; identical parts merge by content', () => {
    const { book, words } = book500();
    const other = pb.addPlay(pb.withParts(book, [part('bad', 'formation', 'Wreck', { content: 'illegal' })]), play('x.1', { formation: 'bad', concept: 'c0' }));
    const r = pb.importFile(book, words, pb.exportPlays(other, ['x.1', 'p.0.sr.0']), validate);
    expect(r.report.failedValidation.map((f) => f.playId)).toEqual(['x.1']);
    for (const id of r.report.imported) expect(r.book.plays.get(id)!.status).toBe('draft');
    expect(r.report.mergedByContent.some((m) => m.incoming === 'f0' && m.existing === 'f0')).toBe(true);
  });
  it('a play edited after a game still shows its game version; restore makes a new version', () => {
    const { book } = book500();
    const p = book.plays.get('p.0.sr.0')!;
    let h = pb.recordVersion(pb.emptyHistory(), p, 1, 'create');
    h = pb.snapshotGame(h, 'g1', book);
    const edited = { ...p, tags: ['tag.alert'] };
    h = pb.recordVersion(h, edited, 2);
    expect(pb.playAsOfGame(h, 'g1', p.id)).toEqual(p);
    expect(pb.compareVersions(h, p.id, 1, 2)).toEqual(['tags']);
    const r = pb.restoreVersion(h, p.id, 1, 3);
    expect(pb.currentVersion(r.history, p.id)).toBe(3);
    expect(r.play).toEqual(p);
  });
  it('a departed coordinator\'s copy does not contain plays added after his departure', () => {
    const { book } = book500();
    let h = pb.emptyHistory();
    h = pb.recordVersion(h, book.plays.get('p.0.sr.0')!, 10);
    h = pb.recordVersion(h, book.plays.get('p.0.sr.1')!, 20);
    h = pb.recordVersion(h, { ...book.plays.get('p.0.sr.0')!, tags: ['tag.alert'] }, 30);
    const view = pb.viewAsOf(h, 15);
    expect([...view.keys()]).toEqual(['p.0.sr.0']);
    expect(view.get('p.0.sr.0')!.tags).toEqual([]);
  });
  it('a book sharing 60% of parts costs less to adopt than one sharing 10%; renaming every word costs only label units', () => {
    const base = book500();
    const mk = (shared: number) => {
      let b = pb.emptyBook('N');
      const ps = [...base.book.parts.values()].filter((p) => p.type === 'concept');
      const keep = Math.round(ps.length * shared);
      const parts = ps.map((p, i) => (i < keep ? p : { ...p, id: `n${i}`, content: `new${i}` }));
      b = pb.withParts(b, [...parts, base.book.parts.get('f0')!]);
      parts.forEach((p, i) => { b = pb.addPlay(b, play(`q${i}`, { formation: 'f0', concept: p.id })); });
      return { book: b, words: pb.defaultWordList(b, 'concept') };
    };
    const r60 = pb.relearnReport(base, mk(0.6));
    const r10 = pb.relearnReport(base, mk(0.1));
    expect(r60.assignmentUnits + r60.labelUnits).toBeLessThan(r10.assignmentUnits + r10.labelUnits);
    let renamed = base.words;
    for (const e of base.words.entries.values()) renamed = pb.rename(renamed, e.partId, `${e.word}x`);
    const rr = pb.relearnReport(base, { book: base.book, words: renamed });
    expect(rr.assignmentUnits).toBe(0);
    expect(rr.labelUnits).toBeGreaterThan(0);
  });
  it('merging two books charges the losing word as a rename', () => {
    const base = book500();
    let otherWords = pb.rename(base.words, 'c0', 'Cheese');
    const merged = pb.mergeBooks(base, { book: base.book, words: otherWords }, ['p.0.sr.0'], () => 'other', validate);
    expect(merged.words.entries.get('c0')!.word).toBe('Cheese');
    expect(merged.renames).toContainEqual({ partId: 'c0', from: 'Mesh', to: 'Cheese' });
    otherWords = base.words;
  });
});

describe('G3.4.3 permissions', () => {
  const actions: pb.PlaybookAction[] = ['view', 'draft_play', 'edit_group_coaching_points', 'edit_side_playbook', 'build_plan_and_sheet', 'approve', 'draw_scout_cards'];
  it('for each job, every control outside its row is locked', () => {
    for (const job of Object.keys(pb.PERMISSIONS) as pb.PlaybookJob[]) for (const a of actions) {
      const g = pb.PERMISSIONS[job][a];
      const own = pb.access({ job, side: 'offense' }, a, 'offense').allowed;
      const other = pb.access({ job, side: 'offense' }, a, 'defense').allowed;
      expect(own).toBe(g === 'yes' || g === 'all' || g === 'own_side');
      expect(other).toBe(g === 'yes' || g === 'all');
    }
  });
  it('a head coach who calls plays holds coordinator rights; a locked control names its holder', () => {
    expect(pb.access({ job: 'position_coach' }, 'edit_side_playbook', 'offense')).toEqual({ allowed: false, suggest: true, heldBy: 'coordinator' });
    expect(pb.suggest('s1', 'user', { job: 'position_coach' }, 'edit_side_playbook', 'offense', 'add play').to).toBe('coordinator');
    expect(pb.jobForRung(7)).toBe('coordinator');
    expect(pb.jobForRung(9)).toBe('head_coach');
  });
});

describe('G3.5.1 search', () => {
  it('every filter combination returns exactly what a brute-force scan returns, in under 100 ms on 1,500 plays', () => {
    const c = catalogue();
    let book = pb.generateBook(pb.emptyBook('T'), c, 1500);
    const r = lcg(3);
    for (const id of [...book.plays.keys()]) if (r() < 0.1) book = pb.replacePlay(book, { ...book.plays.get(id)!, status: 'retired' });
    const words = pb.defaultWordList(book, 'concept');
    const ix = pb.buildSearchIndex(book, words);
    const usage = (id: string): pb.PlayUsage => ({ called: Number(id.slice(4)) % 5, lastCalledWeek: Number(id.slice(4)) % 17, readinessEstimate: (Number(id.slice(4)) % 10) / 10, gamesInstalled: 1 });
    const options: pb.Filters[] = [];
    for (const formation of [undefined, 'F1', 'F3']) for (const concept of [undefined, 'C2']) for (const role of [undefined, 'base', 'constraint'] as const) for (const extra of [{}, { readinessAtLeast: 0.5 }, { calledAtLeast: 3, includeRetired: true }, { text: 'Bravo' }, { lastCalledSince: 9 }]) options.push({ formation, concept, role, ...extra });
    let worst = 0;
    for (const f of options) {
      const t0 = globalThis.performance.now();
      const got = pb.search(ix, f, usage).map((p) => p.id).sort();
      worst = Math.max(worst, globalThis.performance.now() - t0);
      // Independent scan.
      const want = [...book.plays.values()].filter((p) => (f.includeRetired || p.status !== 'retired') && (!f.formation || p.parts.formation === f.formation) && (!f.concept || p.parts.concept === f.concept || p.parts.run === f.concept) && (!f.role || p.role === f.role)
        && (f.readinessAtLeast === undefined || usage(p.id).readinessEstimate >= f.readinessAtLeast) && (f.calledAtLeast === undefined || usage(p.id).called >= f.calledAtLeast)
        && (f.lastCalledSince === undefined || (usage(p.id).lastCalledWeek ?? -1) >= f.lastCalledSince)
        && (!f.text || pb.partIdsOf(p).some((id) => words.entries.get(id)?.word === f.text))).map((p) => p.id).sort();
      expect(got).toEqual(want);
    }
    expect(worst).toBeLessThan(100);
  });
});

/** A catalogue big enough for 1,500 plays: 6 formations x 2 strengths x 3 motions x 15 teaching parts x 3 tags = 1,620. */
export function catalogue(): pb.Catalogue {
  const nato = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar'];
  return {
    personnel: part('P11', 'personnel', '11'),
    formations: ['Wide', 'Tight', 'Heavy', 'Spread', 'Stack', 'Loaded'].map((w, i) => part(`F${i}`, 'formation', w)),
    strengths: [part('SR', 'strength', 'Right'), part('SL', 'strength', 'Left')],
    motions: [null, part('M1', 'motion', 'Zip'), part('M2', 'motion', 'Zoom')],
    teaching: nato.map((w, i) => ({ part: part(`C${i}`, 'concept', w), section: i % 2 ? 'quick' : 'dropback', role: (i % 3 === 0 ? 'constraint' : 'base') as pb.Role })),
    tags: [null, part('T1', 'tag', 'Hot'), part('T2', 'tag', 'Stay')],
  };
}
