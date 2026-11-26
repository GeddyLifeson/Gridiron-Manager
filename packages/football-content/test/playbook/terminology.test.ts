// G-67 acceptance, G4 terminology and call grammar: templates, rendering and parsing, families, word list,
// numbering, spoken length and limits, wristbands, codes, signals, dummies, defensive language, line words,
// and the cost of renaming. Each test names the leaf whose acceptance it checks.
import { describe, expect, it } from 'vitest';
import * as pb from '../../src/playbook/index.ts';
import { book500, lcg, part, play, CONCEPT_WORDS } from './fixtures.ts';

describe('G4.1.1 call parts and order', () => {
  it('for a 500-play book every play renders to a unique string and parsing each returns the original play', () => {
    const { book, words, template } = book500();
    expect(pb.collisions(book, words, template)).toEqual([]);
    const ix = pb.buildIndex(book, words, template);
    for (const p of book.plays.values()) {
      const text = pb.renderPlay(book, words, template, p.id);
      const r = pb.parseCall(ix, text);
      expect(r.auto, text).toEqual({ playId: p.id, tags: [] });
    }
  });
  it('a template under which two plays render alike is reported; snap count must stay last', () => {
    const { book, words } = book500();
    const t = pb.familyTemplate('offense', 'concept', 'kill');
    const noFormation = { ...t, sentBefore: [...t.sentBefore, 'formation' as const] };
    expect(pb.collisions(book, words, noFormation).length).toBeGreaterThan(0);
    expect(() => pb.moveSlot(t, 'snap_count', 0)).toThrow(/last/);
    expect(pb.checkTemplate(pb.moveSlot(t, 'motion', 2))).toEqual([]);
  });
  it('a packaged call renders play A, the kill word, then play B without the shared picture', () => {
    const { book, words, template } = book500();
    const r = pb.renderCall(book, words, template, { playId: 'p.0.sr.0', tags: [], second: { playId: 'p.0.sr.1', tags: [] } });
    expect(r.text).toBe('Doubles Right Mesh Kill Smash');
  });
  it('the starter book renders every play uniquely under all three family templates', () => {
    const { book, killPartId } = pb.starterBook('T');
    for (const fam of ['digit', 'descriptive', 'concept'] as const) {
      const words = pb.defaultWordList(book, fam);
      expect(pb.collisions(book, words, pb.familyTemplate('offense', fam, killPartId))).toEqual([]);
      expect(pb.collisions(book, words, pb.familyTemplate('defense', fam))).toEqual([]);
    }
    const words = pb.defaultWordList(book, 'descriptive');
    expect(pb.renderPlay(book, words, pb.familyTemplate('offense', 'descriptive', killPartId), 'quick_stick')).toBe('Gun Trips Right Base Stick');
    expect(pb.renderPlay(book, words, pb.familyTemplate('offense', 'concept', killPartId), 'quick_stick')).toBe('Gun Trips Right Stick');
    expect(pb.renderPlay(book, words, pb.familyTemplate('defense', 'descriptive'), 'def_cover0_six_man')).toBe('4-3 base 6 Man Cover 0');
  });
});

describe('G4.1.2 huddle procedure', () => {
  const proc = (repeats: 1 | 2): pb.HuddleProcedure => ({ repeats, repeatSnapCount: false, lineBreaksEarly: false, receiversBySignal: false });
  it('doubling the repeats raises stage 4 time by the spoken length and lowers the measured mishear rate in 10,000 calls', () => {
    const L = 2.6;
    expect(pb.huddleSeconds(L, proc(2)) - pb.huddleSeconds(L, proc(1))).toBeCloseTo(L, 10);
    const r = lcg(11);
    let once = 0;
    let twice = 0;
    for (let i = 0; i < 10000; i++) {
      if (r() < pb.mishearChance(L, 0.8, 0.4, 1)) once++;
      if (r() < pb.mishearChance(L, 0.8, 0.4, 2)) twice++;
    }
    expect(twice).toBeLessThan(once);
  });
  it('mishear rises with noise, length and low knowledge', () => {
    expect(pb.mishearChance(2, 1, 0.5, 1)).toBeGreaterThan(pb.mishearChance(2, 0, 0.5, 1));
    expect(pb.mishearChance(4, 0.5, 0.5, 1)).toBeGreaterThan(pb.mishearChance(2, 0.5, 0.5, 1));
    expect(pb.mishearChance(2, 0.5, 0.1, 1)).toBeGreaterThan(pb.mishearChance(2, 0.5, 0.9, 1));
  });
});

describe('G4.1.3 parser', () => {
  it('answers in under 100 ms for a 500-play book', () => {
    const { book, words, template } = book500();
    const ix = pb.buildIndex(book, words, template);
    let worst = 0;
    for (const s of ['Trips Left Dagger', 'Bunch Rigth Shalow', 'Empty Texas', 'Pistol Left Dino Kill Hank']) {
      const t0 = globalThis.performance.now();
      pb.parseCall(ix, s);
      worst = Math.max(worst, globalThis.performance.now() - t0);
    }
    expect(worst).toBeLessThan(100);
  });
  it('with one misspelled word in each of 1,000 planted strings, the intended play ranks first in at least 95%', () => {
    const { book, words, template } = book500();
    const ix = pb.buildIndex(book, words, template);
    const ids = [...book.plays.keys()];
    const r = lcg(5);
    let first = 0;
    for (let i = 0; i < 1000; i++) {
      const id = ids[Math.floor(r() * ids.length)]!;
      const toks = pb.renderPlay(book, words, template, id).split(' ');
      const k = Math.floor(r() * toks.length);
      const w = toks[k]!;
      const at = Math.floor(r() * w.length);
      toks[k] = w.slice(0, at) + 'q' + w.slice(at + 1);
      const res = pb.parseCall(ix, toks.join(' '));
      if (res.candidates[0]?.call.playId === id) first++;
    }
    expect(first).toBeGreaterThanOrEqual(950);
  });
  it('a phonetic key finds "Spyder" for "Spider"; "F9" splits but a word holding both stays whole', () => {
    let book = pb.withParts(pb.emptyBook('T'), [part('f', 'formation', 'Gun'), part('sp', 'concept', 'Spider'), part('r968', 'concept', '968'), part('h', 'tag', 'H'), part('n9', 'tag', '9'), part('x2', 'tag', 'X2')]);
    book = pb.addPlay(book, play('a', { formation: 'f', concept: 'sp' }));
    book = pb.addPlay(book, play('b', { formation: 'f', concept: 'r968' }, { tags: ['h', 'n9'] }));
    book = pb.addPlay(book, play('c', { formation: 'f', concept: 'r968' }, { tags: ['x2'] }));
    const words = pb.defaultWordList(book, 'descriptive');
    const ix = pb.buildIndex(book, words, pb.familyTemplate('offense', 'descriptive'));
    expect(pb.parseCall(ix, 'Gun Spyder').candidates[0]!.call.playId).toBe('a');
    expect(pb.tokenize(ix, 'Gun 968 H9')).toEqual(['gun', '968', 'h', '9']);
    expect(pb.tokenize(ix, 'Gun 968 X2')).toEqual(['gun', '968', 'x2']);
    expect(pb.parseCall(ix, 'Gun 968 H9').auto).toEqual({ playId: 'b', tags: [] });
  });
  it('a two-play string with a kill word returns a packaged call; an ambiguous string never auto-selects', () => {
    const { book, words, template } = book500();
    const ix = pb.buildIndex(book, words, template);
    const r = pb.parseCall(ix, 'Doubles Right Mesh Kill Smash');
    expect(r.auto).toEqual({ playId: 'p.0.sr.0', tags: [], second: { playId: 'p.0.sr.1', tags: [] } });
    const amb = pb.parseCall(ix, 'Doubles Mesh');
    expect(amb.auto).toBeNull();
    expect(amb.candidates.length).toBeGreaterThanOrEqual(2);
  });
  it('a wristband cell code returns the same play as its full string; older code meanings show greyed', () => {
    const { book, words, template } = book500();
    const ix = pb.buildIndex(book, words, template);
    const fmt: pb.BandFormat = { flaps: 2, sides: 2, cellsPerSide: 12, scheme: 'color_number', colors: ['Red', 'Blue'], wearers: 'qb' };
    const band = pb.buildBand(3, fmt, [{ playId: 'p.4.sl.7', tags: [] }], () => 1);
    const older: pb.CodeTable = { week: 2, rows: [{ word: 'Red 1', kind: 'play', call: { playId: 'p.0.sr.0', tags: [] } }] };
    const res = pb.parseCall(ix, 'red 1', { codes: [older, { week: 3, rows: [], cells: band }], currentWeek: 3 });
    const full = pb.parseCall(ix, pb.renderPlay(book, words, template, 'p.4.sl.7'));
    expect(res.auto).toEqual(full.auto);
    expect(res.code!.older[0]!.call).toEqual({ playId: 'p.0.sr.0', tags: [] });
  });
  it('flags an uninstalled tag and a digit call with an unassigned receiver', () => {
    let book = pb.withParts(pb.emptyBook('T'), [part('f', 'formation', 'Gun', { runners: 4 }), part('r968', 'concept', '968'), part('h', 'tag', 'Hot')]);
    book = pb.addPlay(book, play('b', { formation: 'f', concept: 'r968' }));
    const words = pb.defaultWordList(book, 'digit');
    const ix = pb.buildIndex(book, words, pb.familyTemplate('offense', 'descriptive'));
    const r = pb.parseCall(ix, 'Gun 968 Hot', { installedTags: new Set() });
    expect(r.candidates[0]!.flags.join('|')).toMatch(/uninstalled tag h/);
    expect(r.candidates[0]!.flags.join('|')).toMatch(/unassigned receiver/);
  });
});

describe('G4.2.1 language families', () => {
  it('the same play has different spoken lengths in the three families', () => {
    const parts = [
      { id: 'f', type: 'formation' as const, content: 'f', words: { descriptive: 'Brown Right Slot', digit: 'Brown Right Slot', concept: 'Slot' } },
      { id: 'p', type: 'protection' as const, content: 'p', words: { descriptive: '372', digit: '372', concept: '372' }, isDefault: true },
      { id: 'c', type: 'concept' as const, content: 'c', words: { descriptive: 'Y Stick Z Spot H Flat', digit: '846 H Flat', concept: 'Stick' } },
    ];
    let book = pb.withParts(pb.emptyBook('T'), parts);
    book = pb.addPlay(book, play('s', { formation: 'f', protection: 'p', concept: 'c' }));
    const len = (fam: pb.LanguageFamily) => { const w = pb.defaultWordList(book, fam); return pb.spokenLength(pb.renderCall(book, w, pb.familyTemplate('offense', fam), { playId: 's', tags: [] }), w); };
    const d = len('digit');
    const s = len('descriptive');
    const c = len('concept');
    expect(new Set([d, s, c]).size).toBe(3);
    expect(c).toBeLessThan(d);
    expect(d).toBeLessThan(s);
  });
  it('learning profiles keep the sourced direction: concept costs most up front and transfers most', () => {
    const P = pb.LEARNING_PROFILES;
    expect(P.concept.newPassPlay).toBeGreaterThan(P.descriptive.newPassPlay);
    expect(P.descriptive.newPassPlay).toBeGreaterThan(P.digit.newPassPlay);
    expect(P.concept.spotTransfer).toBeGreaterThan(P.digit.spotTransfer);
    expect(P.concept.knownFromNewFormation).toBeLessThan(P.digit.knownFromNewFormation);
  });
});

describe('G4.2.2 word list', () => {
  it('no two parts of one type share a word; the confusion warning fires on a planted similar pair', () => {
    const { book } = book500();
    let words = pb.defaultWordList(book, 'concept');
    expect(pb.checkWords(words).filter((p) => p.kind === 'duplicate')).toEqual([]);
    words = pb.rename(words, 'c1', 'Mesh');
    expect(pb.checkWords(words)).toContainEqual({ kind: 'duplicate', a: 'c0', b: 'c1', type: 'concept' });
    words = pb.rename(words, 'c1', 'Mush');
    expect(pb.checkWords(words).some((p) => p.kind === 'confusion' && p.a === 'c0' && p.b === 'c1')).toBe(true);
  });
  it('code words that sound like line check words are warned across types', () => {
    const book = pb.withParts(pb.emptyBook('T'), [part('a', 'audible', 'Omaha'), part('b', 'check', 'Omana')]);
    const w = pb.defaultWordList(book, 'concept');
    expect(pb.checkWords(w)).toEqual([]);
    expect(pb.checkWords(w, [['audible', 'check']]).length).toBe(1);
  });
  it('a declared naming scheme cuts the units of parts that follow it by 20%', () => {
    const book = pb.withParts(pb.emptyBook('T'), [part('r', 'formation', 'Rip'), part('l', 'formation', 'Bunch')]);
    const w: pb.WordList = { ...pb.defaultWordList(book, 'concept'), scheme: { name: 'R right', follows: (e) => e.word.startsWith('R') } };
    expect(pb.wordUnits(w, 'r', 1)).toBeCloseTo(0.8, 10);
    expect(pb.wordUnits(w, 'l', 1)).toBe(1);
  });
});

describe('G4.2.3 run and protection numbering', () => {
  const runs = [0, 1, 2, 3, 4].flatMap((gap) => (['left', 'right'] as const).map((side) => ({ id: `iz.${gap}.${side}`, backDigit: 2, gapFromCenter: gap, side })));
  it('every run gets a unique number under both side conventions; flipping charges once per changed word', () => {
    for (const n of [pb.STARTING_NUMBERING, { ...pb.STARTING_NUMBERING, evenSide: 'left' as const }]) {
      const ws = runs.map((r) => pb.runNumber(n, r).word);
      expect(new Set(ws).size).toBe(runs.length);
    }
    const f = pb.flipSides(pb.STARTING_NUMBERING, runs);
    expect(f.renamed.size).toBe(runs.length);
    expect(pb.runNumber(pb.STARTING_NUMBERING, { backDigit: 6, gapFromCenter: 3, side: 'left' }).word).toBe('67');
  });
  it('builder checks: run equals protection, mirrored runs differ only by side digit; no-back formation falls back', () => {
    const n = pb.STARTING_NUMBERING;
    const numbered = runs.map((r) => ({ id: r.id, scheme: 'iz', series: r.gapFromCenter, side: r.side, word: pb.runNumber(n, r).word }));
    expect(pb.checkNumbering(numbered, [pb.protectionNumber(3, 94)])).toEqual([]);
    expect(pb.checkNumbering(numbered, ['24'])[0]).toMatch(/equals a protection/);
    const fb = pb.runNumber(n, { backDigit: null, gapFromCenter: 1, side: 'right', schemeNumber: '19' });
    expect(fb).toEqual({ word: '19', warning: expect.stringMatching(/no back/) });
    expect(pb.protectionNumber(3, 94)).toBe('394');
  });
  it('"six-seven" counts 3 syllables', () => {
    expect(pb.syllablesOf({ word: '67', syllables: null, say: 'digits' })).toBe(3);
    expect(pb.spokenNumber('394', 'grouped')).toEqual(['three', 'ninety', 'four']);
  });
});

describe('G4.3.1 spoken length', () => {
  it('hand-counted words count right before corrections, and a user correction wins', () => {
    const cases: [string, number][] = [['Mesh', 1], ['Smash', 1], ['Dagger', 2], ['Shallow', 2], ['Levels', 2], ['Trips', 1], ['Bunch', 1], ['Pistol', 2], ['Scissors', 2], ['Yankee', 2], ['Texas', 2], ['Doubles', 2], ['Victory', 3], ['Spider', 2], ['Flood', 1], ['Curl', 1], ['Choice', 1], ['Angle', 2], ['Wheel', 1], ['Pivot', 2]];
    let off = 0;
    for (const [w, n] of cases) { const got = pb.syllablesOf({ word: w, syllables: null, say: 'digits' }); expect(Math.abs(got - n), w).toBeLessThanOrEqual(1); if (got !== n) off++; }
    expect(off).toBeLessThanOrEqual(2);
    expect(pb.syllablesOf({ word: 'Ohio', syllables: 3, say: 'digits' })).toBe(3);
  });
  it('syllable and token models both give seconds; longer calls take longer', () => {
    const { book, words, template } = book500();
    const short = pb.renderPlay(book, words, template, 'p.0.sr.0');
    const r1 = pb.renderCall(book, words, template, { playId: 'p.0.sr.0', tags: [] });
    const r2 = pb.renderCall(book, words, template, { playId: 'p.0.sr.0', tags: [], second: { playId: 'p.0.sr.8', tags: [] } });
    expect(short.length).toBeGreaterThan(0);
    expect(pb.spokenLength(r2, words)).toBeGreaterThan(pb.spokenLength(r1, words));
    expect(pb.spokenLength(r1, words, 'token')).toBeCloseTo(3 * 0.65, 10);
  });
});

describe('G4.3.2 length limits', () => {
  // Bible G4.3.2 asks for "a 13-word call under 4 s"; with the G4.3.1 starting values (5 syllables/s plus
  // 0.2 s per boundary) no 13-word call is under 4 s (12 boundaries alone are 2.4 s), so the word warning is
  // checked on its own. Reported to the bible fixes thread.
  it('13 words draw the word warning and 12 do not, whatever the seconds; latest start is cutoff + length', () => {
    const ws = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
    const book = pb.withParts(pb.emptyBook('T'), ws.map((w, i) => part(`t${i}`, 'tag', w)));
    const words = pb.defaultWordList(book, 'descriptive');
    const mk = (n: number): pb.Rendered => ({ tokens: ws.slice(0, n).map((w, i) => ({ slot: 'tag' as const, partId: `t${i}`, word: w, half: 1 as const })), text: ws.slice(0, n).join(' ') });
    expect(pb.lengthWarning(mk(13), words, 15, false).overWords).toBe(true);
    expect(pb.lengthWarning(mk(12), words, 15, false).overWords).toBe(false);
    expect(pb.lengthWarning(mk(13), words, 15, true).overWords).toBe(false);
    const w = pb.lengthWarning(mk(13), words, 15, false, 'token', 1);
    expect(w.latestStartS).toBeCloseTo(15 + w.lengthS, 10);
    expect(w.latestBandStartS).toBe(16);
    expect(pb.lengthWarning(mk(3), words, null, false).latestStartS).toBeNull();
    const four = pb.lengthWarning(mk(5), words, 15, false);
    expect(four.lengthS).toBeCloseTo(5 / 5 + 4 * 0.2, 10);
    expect(four.overSeconds).toBe(false);
  });
  it('defining an alias drops the relay length to one word; early recognition caps relay for a fluent quarterback', () => {
    const { book, words, template } = book500();
    const long = pb.renderCall(book, words, template, { playId: 'p.0.sr.0', tags: ['tag.alert'], second: { playId: 'p.0.sr.9', tags: [] } });
    const alias: pb.Rendered = { tokens: [{ slot: 'tag', partId: 'tag.alert', word: 'Alert', half: 1 }], text: 'Alert' };
    expect(pb.relayLength(long, words, 0.3, alias)).toBeCloseTo(pb.spokenLength(alias, words), 10);
    expect(pb.relayLength(long, words, 0.95)).toBeLessThan(pb.spokenLength(long, words));
    expect(pb.aliasAllowed(0.3)).toBe(true);
    expect(pb.aliasAllowed(0.7)).toBe(false);
  });
  it('band suggestions sort by expected uses times seconds saved', () => {
    const w = (lengthS: number): pb.LengthWarning => ({ overSeconds: lengthS > 4, overWords: false, lengthS, words: 5, latestStartS: null, latestBandStartS: null });
    const s = pb.bandSuggestions([{ id: 'a', warning: w(5), expectedUses: 1 }, { id: 'b', warning: w(4.5), expectedUses: 4 }, { id: 'c', warning: w(3), expectedUses: 9 }]);
    expect(s.map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('G4.4.1 wristbands', () => {
  const fmt = (wearers: 'qb' | 'all'): pb.BandFormat => ({ flaps: 4, sides: 2, cellsPerSide: 25, scheme: 'number', colors: [], wearers });
  it('a band call\'s relay time is independent of call length; team-wide bands cut huddle time for a 5 s call', () => {
    expect(pb.bandTiming(fmt('qb'), 2, 0.4, 0).relayS).toBe(pb.bandTiming(fmt('qb'), 6, 0.4, 0).relayS);
    expect(pb.bandTiming(fmt('all'), 5, 0.4, 0).huddleS).toBeLessThan(pb.bandTiming(fmt('qb'), 5, 0.4, 0).huddleS);
  });
  it('capacity and the dirty dozen are enforced; a play changed after printing is caught', () => {
    const calls = Array.from({ length: 201 }, (_, i) => ({ playId: `p${i}`, tags: [] }));
    expect(() => pb.buildBand(1, fmt('qb'), calls, () => 1)).toThrow(/holds 200/);
    expect(() => pb.buildBand(1, fmt('qb'), [], () => 1, calls.slice(0, 13))).toThrow(/dirty dozen/);
    const band = pb.buildBand(1, fmt('qb'), calls.slice(0, 3), () => 1);
    expect(pb.staleCells(band, (id) => (id === 'p1' ? 2 : 1))).toEqual(['2']);
    expect(pb.lookupSeconds(0)).toBeGreaterThan(pb.lookupSeconds(100));
    expect(pb.lookupError(0)).toBe(0.01);
  });
});

describe('G4.4.2 code words', () => {
  it('a code word resolves to exactly one call; an indicator cuts pre-snap time to the set value', () => {
    const t: pb.CodeTable = { week: 1, rows: [{ word: 'Omaha', kind: 'indicator' }, { word: 'Lion', kind: 'play', call: { playId: 'x', tags: [] } }, { word: 'Same', kind: 'repeat' }] };
    expect(pb.checkCodeTable(t)).toEqual([]);
    expect(pb.checkCodeTable({ week: 1, rows: [...t.rows, { word: 'lion', kind: 'play', call: { playId: 'y', tags: [] } }] })[0]).toMatch(/two things/);
    expect(pb.lookupCode([t], 1, 'LION').hit!.call).toEqual({ playId: 'x', tags: [] });
    expect(pb.indicatorPresnapSeconds()).toBe(1.5);
    expect(pb.codeTeachingUnits(10, 3, 'concept')).toBeLessThan(pb.codeTeachingUnits(10, 3, 'digit'));
    const big: pb.CodeTable = { week: 1, rows: Array.from({ length: 21 }, (_, i) => ({ word: `w${i}`, kind: 'play' as const, call: { playId: 'x', tags: [] } })) };
    expect(pb.packageWarning(big)).toMatch(/21 play codes/);
  });
});

describe('G4.4.3 signals', () => {
  it('decode chance is zero for a signal set never used in a game', () => {
    expect(pb.decodeChance({ n: 0, effort: 2, signs: 1, dummies: 0 })).toBe(0);
  });
  // Holds for per-game exposure of one call up to about 20 showings; above that 1 - (1 - q)^n saturates for the
  // single-sign case and the ratio rises past a quarter (noted to the bible fixes thread).
  it('with three dummies and three signs per call, decode chance is below a quarter of the single-signaler, single-sign case', () => {
    for (const n of [1, 3, 5, 8, 12, 16]) {
      const a = pb.decodeChance({ n, effort: 1, signs: 1, dummies: 0 });
      const b = pb.decodeChance({ n, effort: 1, signs: 3, dummies: 3 });
      expect(b).toBeLessThan(a / 4);
    }
  });
  it('matches 1 - (1 - q)^n, covering and television exposures move n as the leaf says', () => {
    const q = pb.decodeQ({ effort: 1.5, signs: 2, dummies: 1 });
    expect(q).toBeCloseTo(0.04 * 1.5 * 0.5 * 0.85, 12);
    expect(pb.decodeChance({ n: 10, effort: 1.5, signs: 2, dummies: 1 })).toBeCloseTo(1 - (1 - q) ** 10, 12);
    expect(pb.decodeChance({ n: 10, effort: 1.5, signs: 2, dummies: 1, tv: true })).toBeCloseTo(1 - (1 - q) ** 15, 10);
    expect(pb.decodeChance({ n: 10, effort: 1.5, signs: 2, dummies: 1, covered: true })).toBeCloseTo(1 - (1 - q) ** 8, 10);
    expect(pb.leakValue(false, true)).toBe(0.5);
  });
  it('a total coach-to-player failure on one side under the equity rule removes the other side\'s radio until restored', () => {
    expect(pb.radioState(true, { side: 'home', total: true, restored: false })).toEqual({ home: false, away: false });
    expect(pb.radioState(true, { side: 'home', total: true, restored: true })).toEqual({ home: true, away: true });
    expect(pb.radioState(true, { side: 'home', total: false, restored: false })).toEqual({ home: true, away: true });
    expect(pb.radioState(false, { side: 'home', total: true, restored: false })).toEqual({ home: false, away: true });
  });
});

describe('G4.4.4 dummy calls', () => {
  it('with r = 0.3 the defense needs about 43% more exposures than with r = 0', () => {
    // Same confidence needs k(1 - r) equal, so k grows by 1 / 0.7 = 1.4286.
    const c0 = pb.dummyConfidence(10, 0);
    let k = 10;
    while (pb.dummyConfidence(k, 0.3) < c0 - 1e-12) k += 0.001;
    expect(k / 10).toBeCloseTo(1 / 0.7, 2);
    expect(pb.exposuresToAct(0.3)).toBeGreaterThan(pb.exposuresToAct(0));
    expect(pb.dummyConfidence(3, 0)).toBeCloseTo(1 - 0.7 ** 3, 12);
  });
  it('hurry-up drops dummies; own players mistake dummies less with knowledge', () => {
    expect(pb.dummyInForce(pb.defaultDummies(), true)).toEqual({ rate: 0, costS: 0 });
    expect(pb.dummyInForce(pb.defaultDummies(), false).rate).toBe(0.3);
    expect(pb.dummyOwnMistake(0)).toBe(0.02);
    expect(pb.dummyOwnMistake(1)).toBe(0);
  });
  it('deterministic powers match the platform within 1e-12 relative', () => {
    for (const [x, y] of [[0.7, 3.3], [0.96, 120.5], [0.5, 0.25], [0.999, 9999.5]] as const) {
      expect(Math.abs(pb.powReal(x, y) - x ** y) / x ** y).toBeLessThan(1e-12);
    }
  });
});

describe('G4.4.5 and G4.5.1 defensive relay', () => {
  const D = ['DE1', 'DT1', 'DT2', 'DE2', 'SAM', 'MIKE', 'WILL', 'CB1', 'CB2', 'FS', 'SS'];
  const chain = pb.defaultChain('MIKE', ['DE1', 'DT1', 'DT2', 'DE2', 'SAM', 'WILL'], 'FS', ['CB1', 'CB2', 'SS']);
  it('with the chain\'s first link forced to fail, all eleven play the previous call', () => {
    const p = pb.deliveryChances(chain, D, 0.5, () => 0.5, { firstLinkFails: true });
    for (const d of D) expect(p.get(d)).toBe(0);
  });
  it('with all eleven wearing bands and the first link failed, band wearers still play the sent call', () => {
    const p = pb.deliveryChances(chain, D, 0.5, () => 0.5, { firstLinkFails: true, bandWearers: new Set(D) });
    for (const d of D) expect(p.get(d)).toBeCloseTo(0.99, 10);
  });
  it('at noise 1.0 a three-link voice chain delivers less often than at noise 0, and less than a signal chain at noise 1.0', () => {
    const voice: pb.ChainLink[] = [{ from: 'sideline', to: ['A'], kind: 'voice', carries: 'call' }, { from: 'A', to: ['B'], kind: 'voice', carries: 'front' }, { from: 'B', to: ['C'], kind: 'voice', carries: 'coverage' }];
    const signal = voice.map((l) => ({ ...l, kind: 'signal' as const }));
    const k = () => 0.5;
    expect(pb.fullDelivery(voice, 1, k)).toBeLessThan(pb.fullDelivery(voice, 0, k));
    expect(pb.fullDelivery(voice, 1, k)).toBeLessThan(pb.fullDelivery(signal, 1, k));
    expect(pb.chainSeconds(voice)).toBeCloseTo(1.8, 10);
  });
  it('a board reaches defenders when the speaker-helmet player is off the field', () => {
    expect(pb.speakerOnField('MIKE', 'WILL', new Set(['WILL']))).toBe('WILL');
    expect(pb.speakerOnField('MIKE', 'WILL', new Set(['SAM']))).toBe('signals');
    const p = pb.deliveryChances([], D, 1, () => 0, { everyoneReads: true });
    for (const d of D) expect(p.get(d)).toBeCloseTo(0.99, 10);
    expect(pb.defenseBandInRange(48)).toBe(true);
    expect(pb.wrongCardError(true)).toBe(0.002);
  });
});

describe('G4.5.2 defensive naming', () => {
  it('stunt names follow the drawn order; a mismatched name is refused', () => {
    expect(pb.stuntName(['tackle', 'end'])).toBe('TE');
    expect(pb.stuntName(['tackle', 'end'], undefined, 'X')).toBe('TEX');
    expect(pb.checkStuntName('TEX', ['tackle', 'end'])).toBeNull();
    expect(pb.checkStuntName('ET', ['tackle', 'end'])).toMatch(/disagrees/);
  });
  it('no two declaration words in a pair share a first letter', () => {
    expect(pb.checkDeclarationPairs([{ meaning: 'rotation', a: 'Rip', b: 'Liz' }])).toEqual([]);
    expect(pb.checkDeclarationPairs([{ meaning: 'field_boundary', a: 'Fire', b: 'Flame' }]).length).toBe(1);
  });
  it('a plan with 21 coverage words draws the warning', () => {
    const parts = Array.from({ length: 21 }, (_, i) => part(`cv${i}`, 'coverage', `Cov${String.fromCharCode(65 + i)}`));
    let book = pb.withParts(pb.emptyBook('T'), [...parts, part('fr', 'front', 'Over')]);
    parts.forEach((p, i) => { book = pb.addPlay(book, play(`d${i}`, { front: 'fr', coverage: p.id }, { book: 'defense', section: ['base', 'coverage'] })); });
    const words = pb.defaultWordList(book, 'descriptive');
    const ids = [...book.plays.keys()];
    expect(pb.coverageWordWarning(book, words, ids)).toMatch(/21 coverage words/);
    expect(pb.coverageWordWarning(book, words, ids.slice(0, 20))).toBeNull();
  });
});

describe('G4.6.1 line words', () => {
  it('each audible has a unique word; max noise without signals reaches fewer wide receivers than low noise', () => {
    expect(pb.checkLineWords([{ word: 'Omaha', cls: 'indicator' }, { word: 'Lion', cls: 'audible', call: { playId: 'x', tags: [] } }])).toEqual([]);
    expect(pb.checkLineWords([{ word: 'Lion', cls: 'audible', call: { playId: 'x', tags: [] } }, { word: 'lion', cls: 'dummy' }]).length).toBe(1);
    expect(pb.hearChance(1, 20)).toBeLessThan(pb.hearChance(0.1, 20));
    expect(pb.hearChance(1, 20, true)).toBeGreaterThan(pb.hearChance(1, 20, false));
  });
  it('a heard kill call runs the second play with formation and motion unchanged in 100% of chalk trials', () => {
    const { book } = book500();
    const call: pb.Call = { playId: 'p.3.sr.0', tags: [], second: { playId: 'p.3.sr.5', tags: [] } };
    for (let i = 0; i < 100; i++) {
      const run = pb.applyKill(call, true);
      expect(run.playId).toBe('p.3.sr.5');
      expect(book.plays.get(run.playId)!.parts.formation).toBe(book.plays.get(call.playId)!.parts.formation);
    }
    expect(pb.applyKill(call, false).playId).toBe('p.3.sr.0');
    expect(pb.reactionSeconds('audible')).toBe(1.5);
  });
});

describe('G4.7.1 renaming cost', () => {
  it('renaming one formation changes only the label layer; a full family switch costs more than renaming ten words', () => {
    const base = book500();
    const words = pb.rename(base.words, 'f0', 'Deuces');
    const r = pb.relearnReport(base, { book: base.book, words });
    expect(r.assignmentUnits).toBe(0);
    expect(r.renamedParts).toEqual([{ partId: 'f0', from: 'Doubles', to: 'Deuces' }]);
    const units = () => 1;
    const ten = pb.renameUnits(CONCEPT_WORDS.slice(0, 10).map((_, i) => `c${i}`), units);
    expect(pb.familySwitchUnits(base.words, 'digit', units)).toBeGreaterThan(ten);
  });
  it('label levels and interference follow the starting values', () => {
    expect(pb.labelAfterRename(0.9)).toBeCloseTo(0.36, 10);
    expect(pb.labelRelearnUnits(2)).toBe(1);
    expect(pb.signingLabelShare(true, 1)).toBe(0.3);
    expect(pb.interferenceMultiplier(0.85, 2)).toBe(1.5);
    expect(pb.interferenceMultiplier(0.85, 4)).toBe(1);
    expect(pb.interferenceMultiplier(0.5, 1)).toBe(1);
  });
});
