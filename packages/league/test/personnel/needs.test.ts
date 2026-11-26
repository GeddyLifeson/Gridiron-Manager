import { describe, expect, it } from 'vitest';
import {
  checkPriority, checkProfile, coachShare, defaultTemplate, fitPreview, fitScore, fragility, fragilityBoard, futureNeed, gmNeedWeights, isVersatile,
  needsBoard, P, PARAMS, priorityChange, profileFor, templateWarnings, tierWeight, versatileJobs, type PositionPriority,
} from '../../src/personnel/index.ts';
import { CB_PROFILE, g, player, QB_PROFILE, S_PROFILE } from './helpers.ts';

describe('params', () => {
  it('every parameter is in range and names its leaf', () => {
    for (const p of PARAMS.params) {
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
      expect(p.leaf).toMatch(/^[A-Z]\d/);
    }
  });
});

describe('M1.2.1 job profile and fit', () => {
  it('fit is the weighted mean of graded values, cut 15 per minimum missed', () => {
    const p = player(1, ['CB'], 60);
    expect(fitScore(p, CB_PROFILE).mean).toBeCloseTo(60);
    const slow = { ...p, grades: { ...p.grades, speed: g(40) } };
    // (2*40 + 60 + 60) / 4 = 50, minus 15 for the speed minimum.
    expect(fitScore(slow, CB_PROFILE).mean).toBeCloseTo(50 - P.fitMinimumMissPenalty);
    expect(fitScore(slow, CB_PROFILE).minimumsMissed).toEqual(['speed']);
  });
  it('a thinly scouted player has a wider fit band', () => {
    const thin = player(1, ['CB'], 60, { grades: { speed: g(60, 200), press: g(60, 200), ball: g(60, 200) } });
    const firm = player(2, ['CB'], 60, { grades: { speed: g(60, 10), press: g(60, 10), ball: g(60, 10) } });
    expect(fitScore(thin, CB_PROFILE).variance).toBeGreaterThan(fitScore(firm, CB_PROFILE).variance);
  });
  it('changing a weight reorders the preview at once', () => {
    const a = player(1, ['CB'], 60, { grades: { speed: g(70), press: g(40), ball: g(60) } });
    const b = player(2, ['CB'], 60, { grades: { speed: g(52), press: g(75), ball: g(60) } });
    expect(fitPreview([a, b], CB_PROFILE)[0]!.personId).toBe(1);
    const pressHeavy = { ...CB_PROFILE, weights: { speed: 1, press: 4, ball: 1 } };
    expect(fitPreview([a, b], pressHeavy)[0]!.personId).toBe(2);
  });
  it('an unset job uses the family default and carries the marker', () => {
    const used = profileFor('CB', { CB: { ...CB_PROFILE, weights: {} } }, { CB: CB_PROFILE });
    expect(used?.familyDefault).toBe(true);
    expect(checkProfile({ ...CB_PROFILE, weights: {} })).toHaveLength(1);
    expect(checkProfile(CB_PROFILE)).toEqual([]);
  });
});

describe('M1.2.2 versatility', () => {
  it('a player with no reps at a second job never carries the tag, whatever his attributes', () => {
    const p = player(1, ['CB'], 80, { jobKnowledge: { CB: 90 } });
    expect(versatileJobs(p, [CB_PROFILE, S_PROFILE])).toEqual(['CB']);
    expect(isVersatile(p, [CB_PROFILE, S_PROFILE])).toBe(false);
    const repped = { ...p, jobKnowledge: { CB: 90, S: 75 } };
    expect(isVersatile(repped, [CB_PROFILE, S_PROFILE])).toBe(true);
  });
});

describe('M1.1.1 position priority', () => {
  const pp: PositionPriority = { tiers: { QB: 'premium', CB: 'core', S: 'replaceable' } };
  it('every installed job appears exactly once', () => {
    expect(checkPriority(pp, ['QB', 'CB', 'S'])).toEqual([]);
    expect(checkPriority(pp, ['QB', 'CB', 'S', 'TE'])).toEqual(['job TE has no tier']);
  });
  it('tier weights 1.5, 1.0, 0.6 and changes are logged', () => {
    expect([tierWeight('premium'), tierWeight('core'), tierWeight('replaceable')]).toEqual([1.5, 1, 0.6]);
    expect(priorityChange(pp, { tiers: { ...pp.tiers, S: 'core' } })).toEqual([{ job: 'S', from: 'replaceable', to: 'core' }]);
  });
});

describe('M1.3.1 roster template', () => {
  const ctx = { linemenRow: 'OL', minLinemen: 8, heaviestPersonnel: { TE: 3 }, specialTeams: [{ unit: 'punt', needed: 11, available: 11 }] };
  it('the starting 53 sums to the limit and passes', () => {
    expect(templateWarnings(defaultTemplate(53), { ...ctx, heaviestPersonnel: { TE: 2 } })).toEqual([]);
  });
  it('each warning fires', () => {
    const t = defaultTemplate(53);
    const short = { ...t, rows: { ...t.rows, OL: 7, TE: 3 } };
    const w = templateWarnings(short, { ...ctx, specialTeams: [{ unit: 'punt', needed: 11, available: 9 }] }).map((x) => x.kind).sort();
    expect(w).toEqual(['linemen', 'personnel', 'special_teams', 'total']);
  });
});

describe('M1.4.1 needs board', () => {
  const profiles = { CB: CB_PROFILE, S: S_PROFILE };
  const pp: PositionPriority = { tiers: { CB: 'premium', S: 'core' } };
  const roster = [player(1, ['CB'], 78), player(2, ['CB'], 62), player(3, ['S'], 70), player(4, ['S', 'CB'], 64)];
  it('removing the best player at a job raises that job\'s need score', () => {
    const before = needsBoard({ players: roster, profiles, priority: pp, targetCounts: { CB: 2, S: 2 } }).find((r) => r.job === 'CB')!;
    const after = needsBoard({ players: roster.filter((p) => p.personId !== 1), profiles, priority: pp, targetCounts: { CB: 2, S: 2 } }).find((r) => r.job === 'CB')!;
    expect(after.score).toBeGreaterThan(before.score);
  });
  it('a player at two jobs counts at his primary for the starter gap and at both for depth', () => {
    const rows = needsBoard({ players: [player(4, ['S', 'CB'], 64)], profiles, priority: pp, targetCounts: {} });
    const cb = rows.find((r) => r.job === 'CB')!;
    expect(cb.starter).toBeNull();
    expect(cb.backup?.personId).toBe(4);
  });
  it('an injured player is not counted as available', () => {
    const hurt = roster.map((p) => (p.personId === 1 ? { ...p, unavailable: true } : p));
    const row = needsBoard({ players: hurt, profiles, priority: pp, targetCounts: {} }).find((r) => r.job === 'CB')!;
    expect(row.starter?.personId).toBe(2);
  });
});

describe('M1.4.2 depth risk', () => {
  it('the cascade is the depth chart\'s own and the quarterback shows first', () => {
    const ps = [player(1, ['QB'], 80), player(2, ['QB'], 55, { jobKnowledge: { QB: 40 } }), player(3, ['CB'], 70), player(4, ['CB'], 69)];
    const qb = fragility({ job: 'QB', depth: [1, 2], players: ps, profile: QB_PROFILE, lossChance: 0.1 });
    const cb = fragility({ job: 'CB', depth: [3, 4], players: ps, profile: CB_PROFILE, lossChance: 0.9 });
    expect(qb.replacementId).toBe(2);
    expect(qb.dropOff).toBeCloseTo(25 + P.fragilityKnowledgeWeight * 40);
    expect(fragilityBoard([cb, qb], ['QB'])[0]!.job).toBe('QB');
    const out = fragility({ job: 'QB', depth: [1, 2], players: ps.map((p) => (p.personId === 1 ? { ...p, unavailable: true } : p)), profile: QB_PROFILE, lossChance: 0.1 });
    expect(out.starterId).toBe(2);
  });
});

describe('M1.4.3 future need', () => {
  it('a college senior starter always raises a flag at his job', () => {
    const senior = player(1, ['CB'], 70, { contractYearsLeft: null, eligibilityLeft: 1 });
    expect(futureNeed([senior], { declineStartAge: { CB: 30 } })).toEqual([{ kind: 'last_eligibility', personId: 1 }]);
  });
  it('a pro player in his decline band or final contract year is flagged', () => {
    const vet = player(2, ['CB'], 70, { age: 31, contractYearsLeft: 1 });
    expect(futureNeed([vet], { declineStartAge: { CB: 30 } }).map((f) => f.kind)).toEqual(['decline_band', 'contract_ending']);
  });
});

describe('M1.5.1 needs memo', () => {
  const gm = needsBoard({
    players: [player(1, ['CB'], 50), player(2, ['S'], 72)], profiles: { CB: CB_PROFILE, S: S_PROFILE }, priority: { tiers: { CB: 'premium', S: 'core' } }, targetCounts: {},
  });
  it('with influence at 100 percent the first weighted need is the memo\'s first item', () => {
    const w = gmNeedWeights(gm, { needs: ['S', 'CB'], targets: [], keep: [], readyToLose: [] }, { approval: 0, finalSay: true });
    expect(w[0]!.job).toBe('S');
  });
  it('the coach share runs 30 to 70 percent by approval', () => {
    expect(coachShare({ approval: 0, finalSay: false })).toBeCloseTo(0.3);
    expect(coachShare({ approval: 1, finalSay: false })).toBeCloseTo(0.7);
  });
  it('asking for more than three items lowers each ask', () => {
    const few = gmNeedWeights(gm, { needs: ['S'], targets: [], keep: [], readyToLose: [] }, { approval: 1, finalSay: false }).find((x) => x.job === 'S')!;
    const many = gmNeedWeights(gm, { needs: ['S', 'A', 'B', 'C', 'D', 'E'], targets: [], keep: [], readyToLose: [] }, { approval: 1, finalSay: false }).find((x) => x.job === 'S')!;
    expect(many.weight).toBeLessThan(few.weight);
  });
});
