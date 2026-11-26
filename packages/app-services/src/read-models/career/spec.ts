// Read-model specs (P1.3.2) of the coach's own screens and the assignment list. The career, contract, money,
// life and record state is not in world tables the filter can serve yet (CR-CS-2), so the host passes each
// input in through a source, as the game plan, install and recruiting screens do. Each model builds only for
// the coach himself: another observer, or the public, gets an empty model (S3: these screens are "self",
// ladder/screens.json; E5 PRIVATE_SECTIONS time, family and money are his alone).
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import { buildAssignmentsView, type AssignmentsInput } from './assignments.ts';
import { buildCareerView, type CareerInput } from './career.ts';
import { buildContractView, type ContractInput } from './contract.ts';
import { buildFinanceView, type FinanceInput } from './finance.ts';
import { buildLifeView, type LifeInput } from './life.ts';
import { buildJobMarketView, type JobMarketInput } from './market.ts';
import { buildRecordView, type RecordInput } from './record.ts';
import type { AssignmentsView, CareerView, ContractView, FinanceView, JobMarketView, LifeView, RecordView } from './types.ts';

/** Model name by registry screen id (screens.json) and the Office assignment list (O7.2.1). */
export const CAREER_MODELS = {
  'coach.career': 'coachCareer',
  'coach.job_market': 'coachJobMarket',
  'coach.contract': 'coachContract',
  'coach.record': 'coachRecord',
  'coach.finance': 'coachFinance',
  'coach.life': 'coachLife',
  assignments: 'coachAssignments',
} as const;

/** Flat parameters: the coach whose screen it is. */
export type CoachParams = { readonly personId: number };

/** Inputs per model for one coach; null when the save holds none for him. */
export interface CareerSources {
  career(personId: number): CareerInput | null;
  jobMarket(personId: number): JobMarketInput | null;
  contract(personId: number): ContractInput | null;
  record(personId: number): RecordInput | null;
  finance(personId: number): FinanceInput | null;
  life(personId: number): LifeInput | null;
  assignments(personId: number): AssignmentsInput | null;
}

/** Zod schemas of the seven views, with a visibility class on every field (@gm/schema read-models/career.ts). */
export interface CareerSchemas {
  career: Schema; jobMarket: Schema; contract: Schema; record: Schema; finance: Schema; life: Schema; assignments: Schema;
}

function selfSpec<I, V>(name: string, data: Schema, source: (personId: number) => I | null, build: (i: I) => V): ReadModelSpec<CoachParams, V | null> {
  return {
    name, data, taskIds: [],
    build: (world, p) => {
      if (world.observer.personId === null || world.observer.personId !== p.personId) return { data: null };
      const input = source(p.personId);
      return { data: input === null ? null : build(input) };
    },
  };
}

export function careerSpecs(s: CareerSchemas, src: CareerSources): ReadModelSpec<CoachParams, unknown>[] {
  return [
    selfSpec<CareerInput, CareerView>(CAREER_MODELS['coach.career'], s.career, (id) => src.career(id), buildCareerView),
    selfSpec<JobMarketInput, JobMarketView>(CAREER_MODELS['coach.job_market'], s.jobMarket, (id) => src.jobMarket(id), buildJobMarketView),
    selfSpec<ContractInput, ContractView>(CAREER_MODELS['coach.contract'], s.contract, (id) => src.contract(id), buildContractView),
    selfSpec<RecordInput, RecordView>(CAREER_MODELS['coach.record'], s.record, (id) => src.record(id), buildRecordView),
    selfSpec<FinanceInput, FinanceView>(CAREER_MODELS['coach.finance'], s.finance, (id) => src.finance(id), buildFinanceView),
    selfSpec<LifeInput, LifeView>(CAREER_MODELS['coach.life'], s.life, (id) => src.life(id), buildLifeView),
    selfSpec<AssignmentsInput, AssignmentsView>(CAREER_MODELS.assignments, s.assignments, (id) => src.assignments(id), buildAssignmentsView),
  ];
}
