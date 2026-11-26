import { describe, expect, it } from 'vitest';
import {
  aiReview, archiveSaving, checkPersonnel, createWeekDocuments, documentView, lateness, loadFactor, moveDoc, newVersion, panel,
  reachesRecipients, reviewHours, selfScoutDue, sizeWarnings, studyMinutes, userReview, DOC_TYPES,
} from '../../src/week/index.ts';
import { at, collegeWeek, proWeek, rng } from './fixtures.ts';

const opts = { groups: 8, planScale: 1, countable: false, selfScoutDue: false };

describe('document records (H9.1.1)', () => {
  it('every game week creates one record of each weekly type; per-practice types once per practice', () => {
    const w = proWeek();
    const docs = createWeekDocuments(w, opts);
    const weekly = DOC_TYPES.filter((t) => !t.perPractice && !t.awayOnly && !t.countableOnly && !t.cadence).map((t) => t.id);
    for (const t of weekly) expect(docs.filter((d) => d.type === t).length).toBe(1);
    expect(docs.filter((d) => d.type === 'scout_cards').length).toBe(3);
    expect(docs.some((d) => d.type === 'travel_itinerary')).toBe(false);
    expect(createWeekDocuments(proWeek({ home: false }), opts).some((d) => d.type === 'travel_itinerary')).toBe(true);
    expect(createWeekDocuments(w, { ...opts, selfScoutDue: true }).some((d) => d.type === 'self_scout')).toBe(true);
    const col = createWeekDocuments(collegeWeek({ home: false }), { ...opts, countable: true });
    expect(col.some((d) => d.type === 'academic_availability') && col.some((d) => d.type === 'travel_roster')).toBe(true);
  });
  it('self-scout falls on the bye, then every fourth week', () => {
    expect(selfScoutDue(null, true)).toBe(true);
    expect([1, 2, 3, 4, 8].map((n) => selfScoutDue(n, false))).toEqual([false, false, false, true, true]);
  });
  it('no unpublished document reaches recipients; a new version supersedes', () => {
    const d = createWeekDocuments(proWeek(), opts).find((x) => x.type === 'players_packet')!;
    expect(reachesRecipients(d)).toBe(false);
    const pub = moveDoc(moveDoc(d, 'draft', at(d.dueAt.day, 6)), 'published', at(d.dueAt.day, 7));
    expect(reachesRecipients(pub)).toBe(true);
    const v = newVersion(pub, at(d.dueAt.day, 12));
    expect(v.old.state).toBe('superseded');
    expect(v.next.version).toBe(2);
    expect(() => moveDoc(d, 'published', at(0, 0))).toThrow();
  });
  it('a late document reduces study time by exactly the lateness', () => {
    const d = createWeekDocuments(proWeek(), opts).find((x) => x.type === 'players_packet')!;
    const late = moveDoc(moveDoc(d, 'draft', d.dueAt), 'published', { day: d.dueAt.day, minute: d.dueAt.minute + 95 });
    expect(lateness(late)).toBe(95);
    expect(studyMinutes(late, 300)).toBe(205);
  });
  it('the view never carries quality or errors, and the exceptions panel never sorts by quality', () => {
    const d = { ...createWeekDocuments(proWeek(), opts)[0]!, quality: 0.2, errors: ['x'] };
    const v = documentView(d, d.dueAt);
    expect('quality' in v || 'errors' in v).toBe(false);
    expect(panel([d], d.dueAt, 'exceptions')).toEqual([]);
    expect(panel([d], { day: d.dueAt.day + 1, minute: 0 }, 'exceptions').length).toBe(1);
  });
});

describe('authors and review (H9.1.2)', () => {
  it('an overloaded author works at lower quality, never below the floor', () => {
    expect(loadFactor(10, 20)).toBe(1);
    expect(loadFactor(40, 20)).toBe(0.5);
    expect(loadFactor(100, 20)).toBe(0.5);
    expect(loadFactor(25, 20)).toBe(0.8);
  });
  it('an AI head coach catches errors at his hidden rate', () => {
    const d = { ...createWeekDocuments(proWeek(), opts)[0]!, errors: Array.from({ length: 10000 }, (_, i) => `e${i}`) };
    const r = aiReview(d, 0.3, rng(7));
    expect(r.caught.length / 10000).toBeGreaterThan(0.28);
    expect(r.caught.length / 10000).toBeLessThan(0.32);
  });
  it('the user catches exactly what he marks; a wrong mark adds an error', () => {
    const d = { ...createWeekDocuments(proWeek(), opts)[0]!, errors: ['a', 'b', 'c'] };
    const r = userReview(d, ['a', 'z']);
    expect(r.caught).toEqual(['a']);
    expect(r.doc.errors).toEqual(['b', 'c', 'wrong_fix:z']);
  });
  it('review costs a share of the document hours', () => {
    const d = createWeekDocuments(proWeek(), opts).find((x) => x.type === 'staff_scouting_report')!;
    expect(reviewHours(d)).toBeCloseTo(3, 9);
  });
});

describe('archive and size warnings (H9.3.3, H9.4.1)', () => {
  it('a repeat opponent saves hours inside the window, less with turnover', () => {
    expect(archiveSaving(200, true, 0)).toBe(0.3);
    expect(archiveSaving(200, true, 0.5)).toBe(0.15);
    expect(archiveSaving(400, true, 0)).toBe(0);
    expect(archiveSaving(200, false, 0)).toBe(0);
  });
  it('size ranges warn but never limit', () => {
    expect(sizeWarnings({ callSheet: 120, openingScript: 20, wristband: 150, tipSheetLines: 5 })).toEqual([]);
    expect(sizeWarnings({ callSheet: 200, openingScript: 40, wristband: 250, tipSheetLines: 7 }).length).toBe(4);
  });
  it('plays naming inactive players are flagged after a depth change', () => {
    expect(checkPersonnel([{ id: 'p1', players: [1, 2] }, { id: 'p2', players: [3] }], new Set([1, 2]))).toEqual(['p2']);
  });
});
