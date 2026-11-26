// CR-G38-1 round trip: every program state the module produces parses with the proposed zod twins.
import { describe, expect, it } from 'vitest';
import { compliance } from '@gm/league';
import { generateBoosters, hire, proposeProject, raiseRequest, rollFacilities, scanForbidden } from './schema-helpers.ts';
import { ProgramStateSchema } from './proposed-schemas.ts';
import { COLLEGE, D, DOLLAR, MILLION, MemorySink, program, rng, seat } from './fixtures.ts';

describe('proposed program schemas', () => {
  it('a built-up program round-trips through JSON and parses', () => {
    let p = program('power', 3);
    p = { ...p, boosters: generateBoosters('power', 1.2, 1, [900, 901, 902], rng(3, 'b')) };
    const h = hire(p, compliance.emptyCompliance(), seat({ counts: ['graduate_assistant'], salaryCents: 10_000 * DOLLAR }), COLLEGE, new MemorySink(),
      { hirerPersonId: 10, hirerRole: 'head_coach', hirerOrigin: 'user', competitionId: 1, date: D(2026, 1), tier: 1, source: 'user' });
    if (!h.ok) throw new Error('refused');
    p = h.program;
    const proj = proposeProject('ix', 'indoor_field', 'build', 30 * MILLION, 2026, 2, p.facilities);
    if (!proj.ok) throw new Error('bad project');
    const rolled = rollFacilities(p.facilities, [{ ...proj.project, funded: true }], 2029);
    p = { ...p, facilities: rolled.facilities, projects: rolled.projects };
    p = { ...p, exchanges: raiseRequest(p.exchanges, p.ad, { kind: 'schedule_preference' }, { year: 2026, week: 1, totalBudgetCents: p.budget.totalCents, headroomCents: MILLION, resultsVsExpectation: 0, boosterMood: 50 }).history };
    const back = JSON.parse(JSON.stringify(p));
    expect(ProgramStateSchema.parse(back)).toEqual(back);
    expect(scanForbidden()).toEqual([]);
  });
});
