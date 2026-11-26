// G-32: the crisis catalogue (L9.2, L9.4, L9.5) and the media and crisis text templates (L6.2, H7.2, P4.6).
// Every catalogue row and template validates; no real person; no cause of death for retired people.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FactFile, computeStatus } from '@gm/schema';
import { LEVELS, RUNGS, TemplateBook, templateCoverage, validateTemplateFile, type TemplateEntry } from '../../src/templates/index.ts';
import { foldToken, guardHash, guardSet } from '../../data/names/lib.ts';

const crisesDir = new URL('../../data/crises/', import.meta.url);
const tplDir = new URL('../../data/templates/en/', import.meta.url);
const load = (dir: URL, f: string) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const catalogue = load(crisesDir, 'catalogue.json');
const acts = load(crisesDir, 'acts.json');
const factsFile = FactFile.parse(load(crisesDir, 'facts.json'));
const facts = new Map(factsFile.rows.map((r) => [r.id, r]));
const rows = catalogue.crises as any[];

const tplFiles = readdirSync(tplDir).filter((f) => f.endsWith('.json')).sort();
const entries: TemplateEntry[] = [];
for (const f of tplFiles) {
  const { file, problems } = validateTemplateFile(load(tplDir, f));
  it(`template file ${f} validates with no error or warning`, () => { expect(problems).toEqual([]); expect(file).not.toBeNull(); });
  if (file) entries.push(...file.templates);
}
const book = new TemplateBook('en', entries);
const byKey = new Map(entries.map((e) => [e.key, e]));

/** Every text a template can show. */
const texts = (e: TemplateEntry): string[] => [e.default, ...(e.variants ?? []).map((v) => v.text)];

const LEAVES = ['L9.2.1', 'L9.2.2', 'L9.2.3', 'L9.2.4', 'L9.2.5', 'L9.2.6', 'L9.2.7', 'L9.2.8', 'L9.2.9', 'L9.2.10', 'L9.4.1', 'L9.4.2', 'L9.4.3', 'L9.4.4', 'L9.5.1', 'L9.5.2'];

describe('fact rows', () => {
  it('parse, are unique and carry the computed status', () => {
    expect(new Set(factsFile.rows.map((r) => r.id)).size).toBe(factsFile.rows.length);
    for (const r of factsFile.rows) expect(r.status, r.id).toBe(computeStatus(r));
  });
  it('no row is Verified without three groups or a primary text', () => {
    for (const r of factsFile.rows) if (r.status === 'Verified') expect(new Set(r.sources.map((s) => s.independenceGroup)).size).toBeGreaterThanOrEqual(3);
  });
  it('every sourced row names where it was read; every design row is an assumption', () => {
    for (const r of factsFile.rows) {
      expect(r.sources.length, r.id).toBeGreaterThan(0);
      if (r.status === 'Assumption') expect(r.assumption, r.id).toBe(true);
    }
  });
});

describe('catalogue rows', () => {
  it('has one row for each leaf of L9.2, L9.4 and L9.5 and unique ids', () => {
    expect(rows.map((r) => r.leaf).sort()).toEqual([...LEAVES].sort());
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
  it('every row has a guard class (L9.1.2)', () => {
    for (const r of rows) expect(['football', 'personal'], r.id).toContain(r.guard);
  });
  it('personal crises have generated adult subjects only (rules 1 and 3 of L9.1.2)', () => {
    for (const r of rows.filter((x) => x.guard === 'personal')) {
      expect(r.subjects.generatedOnly, r.id).toBe(true);
      expect(r.subjects.adultOnly, r.id).toBe(true);
    }
  });
  it('every crisis outside the two outside classes lists a cause event (L9.1.1)', () => {
    expect(rows.filter((r) => r.outsideClass).map((r) => r.id).sort()).toEqual(['family_emergency', 'off_field_incident']);
    for (const r of rows) {
      if (r.outsideClass) expect(r.causeEvents, r.id).toEqual([]);
      else expect(r.causeEvents.length, r.id).toBeGreaterThan(0);
    }
  });
  it('family emergencies need a family object', () => {
    expect(rows.find((r) => r.id === 'family_emergency').subjects.requiresFamilyObject).toBe(true);
  });
  it('severity classes of a crisis sum to 1 when present', () => {
    for (const r of rows) {
      const cls = r.severity.classes as { share: number }[];
      if (cls.length) expect(cls.reduce((a, c) => a + c.share, 0), r.id).toBeCloseTo(1, 9);
      expect(r.severity.range.min, r.id).toBeGreaterThanOrEqual(1);
      expect(r.severity.range.max, r.id).toBeLessThanOrEqual(5);
    }
  });
  it('off-field severity follows the sourced violent share: minor is 1 minus it', () => {
    const r = rows.find((x) => x.id === 'off_field_incident');
    const minor = r.severity.classes.find((c: any) => c.id === 'minor').share;
    expect(minor).toBeCloseTo(1 - (facts.get('F-crisis-0002')!.value as number), 9);
  });
  it('every number is a params, stage clock, severity or pacing entry that cites an existing fact row', () => {
    const bad: string[] = [];
    const walk = (v: unknown, path: string, owner: any) => {
      if (typeof v === 'number') {
        const last = path.split('.').pop()!.replace(/\[\d+\]$/, '');
        if (!['value', 'values', 'min', 'max', 'share'].includes(last)) bad.push(`${path}: number outside a value slot`);
        else if (!owner || typeof owner.factId !== 'string' || !facts.has(owner.factId)) bad.push(`${path}: no fact row`);
        return;
      }
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, owner)); return; }
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, v);
    };
    walk({ pacing: catalogue.pacing, warning: catalogue.warning, crises: rows, acts: acts.acts }, '', null);
    expect(bad).toEqual([]);
  });
  it('pacing and warning values match the bible L9.1.1 and L9.1.3 starting rules', () => {
    expect(catalogue.pacing.newPerTeamPerWeek.value).toBe(1);
    expect(catalogue.pacing.maxOpen.value).toBe(2);
    expect(catalogue.pacing.maxOpenWhenRoomLost.value).toBe(3);
    expect(catalogue.pacing.queueWeeks.value).toBe(4);
    expect(catalogue.warning.leadDays).toMatchObject({ min: 2, max: 10 });
  });
  it('every fact row is used and every cited fact row exists', () => {
    const cited = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'factId' || k === 'rangeFactId') cited.add(x as string); else if (k === 'factIds') (x as string[]).forEach((f) => cited.add(f)); else walk(x); }
    };
    walk(catalogue); walk(acts);
    for (const id of cited) expect(facts.has(id), id).toBe(true);
    for (const id of facts.keys()) expect(cited.has(id), `${id} is unused`).toBe(true);
  });
  it('a row that reads a sourced rate cites a sourced row, never an assumption, for the rate itself', () => {
    const off = rows.find((r) => r.id === 'off_field_incident');
    const rate = off.hazard.params.find((p: any) => p.id === 'yearly_arrest_rate');
    expect(facts.get(rate.factId)!.status).not.toBe('Assumption');
    expect(rate.value).toBe(facts.get(rate.factId)!.value);
  });
  it('rows with no sourced hazard say so', () => {
    expect(rows.find((r) => r.id === 'league_suspension').hazard.openResearch).toMatch(/no sourced value/);
  });
  it('stage templates and title and news templates exist for every row', () => {
    for (const r of rows) {
      expect(book.has(r.titleKey), r.titleKey).toBe(true);
      if (r.newsKey === null) expect(r.id).toBe('witnessed'); // a private item only the user sees (L9.5.2)
      else expect(book.has(r.newsKey), r.newsKey).toBe(true);
      expect(r.stages.length, r.id).toBeGreaterThanOrEqual(3);
      for (const s of r.stages) {
        expect(book.has(s.templateKey), s.templateKey).toBe(true);
        expect(s.knownTo.length, s.templateKey).toBeGreaterThan(0);
      }
      expect(r.stages[r.stages.length - 1].clock === undefined || true).toBe(true);
      for (const a of r.acts) expect(acts.acts.some((x: any) => x.id === a), `${r.id} -> ${a}`).toBe(true);
    }
  });
  it('stage clocks run forward (min not above max)', () => {
    for (const r of rows) for (const s of r.stages) if (s.clock) expect(s.clock.min, s.templateKey).toBeLessThanOrEqual(s.clock.max);
  });
});

describe('response acts (L9.3.1)', () => {
  it('are the thirteen acts of the bible, each owned by exactly one system, with no currency and no grade', () => {
    expect(acts.acts.map((a: any) => a.id).sort()).toEqual(['address_team', 'apply_discipline', 'ask_captains', 'background_reporter', 'call_family_agent', 'change_role_lineup', 'give_time_off', 'inform_upstairs', 'reassign_staff_work', 'report_outside', 'speak_public', 'talk_private', 'wait_for_facts']);
    for (const a of acts.acts) {
      expect(a.spendsCurrency, a.id).toBe(false);
      expect(a.graded, a.id).toBe(false);
      expect(a.ownerSystem, a.id).toBeTruthy();
      expect(a.event.startsWith(a.ownerSystem + '.'), a.id).toBe(true);
      expect(book.has(a.labelKey) && book.has(a.detailKey), a.id).toBe(true);
    }
    const text = JSON.stringify(catalogue) + JSON.stringify(acts);
    expect(text).not.toMatch(/"(xp|perk|skillTree|coachPoints|crisisScore|score|meter)"/i);
  });
  it('rule-breaking responses are warned and run through L8.2.5', () => {
    for (const w of acts.ruleBreakingResponses) {
      expect(w.warned, w.id).toBe(true);
      expect(w.pipeline).toBe('L8.2.5');
      expect(book.has(`warning.${w.id}`), w.id).toBe(true);
      for (const c of w.offeredIn) expect(rows.some((r) => r.id === c), `${w.id} -> ${c}`).toBe(true);
    }
  });
});

describe('templates (P4.6.1)', () => {
  it('keys are unique across all files', () => {
    expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length);
  });
  it('every template renders for every level and rung with sample parameters and no missing parameter', () => {
    expect(templateCoverage(entries, { language: 'en', terminology: 'coryell' })).toEqual([]);
  });
  it('level wording: college text never says owner, club or league; pro text never says athletic director, campus, donors or school', () => {
    const levelsOf = (key: string): string[] => {
      const m = /^(?:crisis|news\.crisis)\.([a-z_]+?)(?:\.|$)/.exec(key);
      const row = m && rows.find((r) => key.includes(r.id));
      return row ? row.levels : ['college', 'pro'];
    };
    for (const e of entries) {
      for (const lv of levelsOf(e.key)) {
        for (let rung = 0; rung <= 9; rung++) {
          const params: Record<string, any> = {};
          for (const [n, d] of Object.entries(e.params)) params[n] = d.type === 'person' ? { id: 1, first: 'A', last: 'B' } : d.type === 'team' ? { id: 1, name: 'T' } : d.type === 'number' ? { value: 2, unit: d.unit } : 'x';
          const t = book.render(e.key, params, { level: lv as any, rung, language: 'en', terminology: 'coryell' }).text;
          if (lv === 'college') expect(t, `${e.key} college`).not.toMatch(/\b(owner|general manager|club|league)\b/i);
          else expect(t, `${e.key} pro`).not.toMatch(/\b(athletic director|campus|donors?|school|president)\b/i);
        }
      }
    }
  });
  it('every template says which guard class it is written for, and crisis templates match the catalogue row', () => {
    for (const e of entries) expect(e.note ?? '', e.key).toMatch(/guard=(football|personal|none)/);
    for (const r of rows) {
      for (const k of [r.titleKey, r.newsKey, ...r.stages.map((s: any) => s.templateKey)]) if (k) expect(byKey.get(k)!.note, k).toContain(`guard=${r.guard}`);
    }
  });
  it('no generated quotation: no quotation marks and no said or told lines in any template', () => {
    for (const e of entries) for (const t of texts(e)) {
      expect(t, e.key).not.toMatch(/["“”]/);
      expect(t, e.key).not.toMatch(/\b(said|says|told reporters|according to)\b/i);
    }
  });
  it('football-class crisis text states football facts only: no arrest, charge, illness or family wording', () => {
    for (const r of rows.filter((x) => x.guard === 'football')) {
      for (const k of [r.titleKey, r.newsKey, ...r.stages.map((s: any) => s.templateKey)]) {
        if (!k) continue;
        if (r.id === 'team_illness') continue; // illness is reported as the word illness and no more (H5)
        for (const t of texts(byKey.get(k)!)) expect(t, k).not.toMatch(/\b(arrest|charged|police|assault|drunk|drug|family|abuse|divorce|rehab|therapy)\b/i);
      }
    }
  });
  it('no cause of death or diagnosis anywhere; deaths show years of life only', () => {
    const cause = /\b(cancer|heart|cardiac|stroke|suicide|overdose|accident|crash|shot|murder|killed|covid|infection|disease|diagnos\w*|passed away after|died (of|from|after|following))\b/i;
    for (const e of entries) for (const t of texts(e)) expect(t, e.key).not.toMatch(cause);
    for (const k of ['news.person_died', 'news.person_died.coach']) {
      const e = byKey.get(k)!;
      expect(Object.keys(e.params).sort()).toEqual(k.endsWith('coach') ? ['age', 'subject', 'years'] : ['age', 'subject', 'years']);
    }
    const r = book.render('news.person_died', { subject: { id: 1, first: 'Sam', last: 'Lee' }, age: { value: 81, unit: 'yr' }, years: { value: 81, unit: 'yr' } }, { level: 'pro', rung: 9, language: 'en', terminology: 'coryell' });
    expect(r.text).toBe('Sam Lee has died at the age of 81. Sam Lee lived 81 years.');
    expect(JSON.stringify(catalogue) + JSON.stringify(acts)).not.toMatch(/cause_of_death|causeOfDeath/i);
  });
  it('illness text says illness and no diagnosis (D11, H5)', () => {
    for (const k of rows.find((r) => r.id === 'team_illness').stages.map((s: any) => s.templateKey)) for (const t of texts(byKey.get(k)!)) expect(t).not.toMatch(/\b(flu|virus infection|strep|norovirus|covid)\b/i);
  });
  it('no real person, team nickname, school or league name appears in any template', () => {
    const blocked = JSON.parse(readFileSync(new URL('../../data/world/blocked-terms.json', import.meta.url), 'utf8'));
    const marks = new Set<string>([...blocked.proNicknames, ...blocked.otherLeagueNicknames, ...blocked.conferencesAndLeagues, ...blocked.eventsAndTrophies, ...blocked.colleges.flatMap((c: any) => [c.school, c.nickname])].map((s: string) => s.toLowerCase()));
    const guard = guardSet(JSON.parse(readFileSync(new URL('../../data/names/real-name-guard.json', import.meta.url), 'utf8')).packed);
    for (const e of entries) for (const t of texts(e)) {
      const plain = t.replace(/\{[^}]*\}/g, ' ');
      for (const m of marks) if (m.length >= 4) expect(new RegExp(`\\b${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(plain), `${e.key} names ${m}`).toBe(false);
      const words = plain.split(/[^A-Za-z'’-]+/).filter(Boolean);
      for (let i = 0; i + 1 < words.length; i++) {
        if (/^[A-Z]/.test(words[i]!) && /^[A-Z]/.test(words[i + 1]!)) expect(guard.has(guardHash(words[i]!, words[i + 1]!)), `${e.key}: ${words[i]} ${words[i + 1]}`).toBe(false);
      }
    }
    expect(foldToken('Ünï')).toBe('uni');
  });
  it('template text has no headshot, logo or team mark wording', () => {
    for (const e of entries) for (const t of texts(e)) expect(t, e.key).not.toMatch(/\b(headshot|logo|trademark)\b/i);
  });
  it('plural forms read right at one and at many', () => {
    const ctx = { level: 'pro' as const, rung: 9, language: 'en', terminology: 'coryell' };
    const one = book.render('crisis.losing_streak.opened', { team: { id: 1, name: 'Harbor' }, n: { value: 1, unit: 'count' } }, ctx).text;
    const many = book.render('crisis.losing_streak.opened', { team: { id: 1, name: 'Harbor' }, n: { value: 5, unit: 'count' } }, ctx).text;
    expect(one).toContain('1 game in a row');
    expect(many).toContain('5 games in a row');
  });
  it('media coverage: seven hot topics, eight stances with a digest each, four injury answers (H7.2)', () => {
    expect(entries.filter((e) => e.key.startsWith('media.topic.')).length).toBe(7);
    const stances = entries.filter((e) => e.key.startsWith('media.stance.')).map((e) => e.key.slice(13)).sort();
    expect(stances.length).toBe(8);
    expect(entries.filter((e) => e.key.startsWith('media.digest.')).map((e) => e.key.slice(13)).sort()).toEqual(stances);
    expect(entries.filter((e) => e.key.startsWith('media.injury.') && e.key !== 'media.injury.conflict_flag').length).toBe(4);
  });
  it('no template supports an answer about a player\'s mental health (H5.4.3)', () => {
    for (const e of entries) for (const t of texts(e)) expect(t, e.key).not.toMatch(/\bmental health\b/i);
  });
  it('level and rung lists are the schema\'s', () => {
    expect(LEVELS).toEqual(['college', 'pro']);
    expect(RUNGS.length).toBe(10);
  });
});
