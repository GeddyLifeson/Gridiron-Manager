// CR-G38-1: zod twins of the college program records, with a visibility class per field, proposed for
// packages/schema/src/world/college-program.ts and `worldSchemas()`. Kept in the test folder because
// this package may not edit schema (game-build-plan section 2). The tests parse every state the
// module produces with these, so the shapes cannot drift apart.
// Visibility: AD and president dispositions and booster wealth, mood and ties are truth (the coach
// sees words and a history, T9.1.1, L5.4.3); budget lines and staff pay are own_team (W-14); the
// exchange history is own_team; facility grades are public (shown as bands).
import { z } from 'zod';
import { own, pub, truth } from '@gm/schema';
import { BUDGET_LINES, FACILITY_KINDS, LIMITED_SEATS, PAY_ROLES, PROGRAM_TIERS } from '../../src/college-program/index.ts';

const id = () => pub(z.number().int().positive(), 'id');
const unit = () => truth(z.number().min(0).max(1), 'ratio');
const cents = () => own(z.number().int().min(0), 'cents');
const Holder = z.enum(['head_coach', 'athletic_director', 'general_manager']);
const Line = z.enum(BUDGET_LINES);

export const AthleticDirectorSchema = z.object({
  personId: id(), patience: unit(), footballKnowledge: unit(), riskAppetite: unit(), boosterCloseness: unit(),
  interim: pub(z.boolean()), hiredCurrentCoach: pub(z.boolean()),
  startYear: pub(z.number().int(), 'season_year'), plannedEndYear: truth(z.number().int(), 'season_year'),
}).strict();

export const PresidentSchema = z.object({ personId: id(), academicStrictness: unit(), footballPriority: unit() }).strict();

export const PowerSchema = own(z.object({
  roster: Holder, contracts: Holder, staff: Holder, draft: z.null(), reports: z.literal('athletic_director'),
  generalManagerReportsTo: z.enum(['head_coach', 'athletic_director']),
}).strict());

export const BudgetSchema = z.object({
  year: pub(z.number().int(), 'season_year'),
  totalCents: cents(),
  lines: own(z.object(Object.fromEntries(BUDGET_LINES.map((l) => [l, cents()])) as Record<(typeof BUDGET_LINES)[number], ReturnType<typeof cents>>).strict()),
  seatsFrozen: own(z.boolean()),
}).strict().refine((b) => Object.values(b.lines).reduce((s, v) => s + v, 0) <= b.totalCents, { message: 'lines never exceed the total (T9.2.1)' });

const AdRequestSchema = z.object({
  kind: z.enum(['budget_line', 'staff_seat', 'facility_project', 'schedule_preference', 'discipline_matter', 'set_budget_total']),
  line: Line.optional(), amountCents: z.number().int().min(0).optional(), note: z.string().optional(),
}).strict();

export const AdExchangeSchema = own(z.object({
  year: z.number().int(), week: z.number().int().min(0), request: AdRequestSchema,
  outcome: z.enum(['granted', 'deferred', 'refused']),
  reason: z.enum(['strong_results', 'boosters_pleased', 'money_available', 'interim_ad', 'needs_board', 'no_money', 'poor_results', 'boosters_unhappy', 'not_coach_decision', 'no_amount']),
}).strict());

export const FacilitySchema = z.object({
  kind: pub(z.enum(FACILITY_KINDS)), exists: pub(z.boolean()), grade: pub(z.number().min(0).max(100), 'index'), lastBuiltYear: pub(z.number().int(), 'season_year'),
}).strict();

export const FacilityProjectSchema = z.object({
  id: pub(z.string().min(1)), kind: pub(z.enum(FACILITY_KINDS)), mode: pub(z.enum(['build', 'renovate'])), costCents: cents(),
  startYear: pub(z.number().int(), 'season_year'), buildYears: pub(z.number().int().min(1), 'count'), funded: pub(z.boolean()),
}).strict();

export const BoosterGroupSchema = z.object({
  id: id(), leaderPersonId: id(),
  wealthCents: truth(z.number().int().min(0), 'cents'),
  givingHistoryCents: own(z.array(z.number().int().min(0)), 'cents'),
  mood: truth(z.number().min(0).max(100), 'index'),
  closeness: unit(),
  toldCoachWillLookAway: truth(z.boolean()),
  disassociated: pub(z.boolean()),
  ties: truth(z.record(z.string(), z.number().min(0).max(1)), 'ratio'),
}).strict();

export const StaffSeatSchema = z.object({
  jobId: id(), personId: id(),
  payRole: pub(z.enum([...PAY_ROLES, 'support'])),
  counts: pub(z.array(z.enum(LIMITED_SEATS))),
  pool: own(z.enum(['staff_pool', 'support_staff'])),
  salaryCents: cents(),
}).strict();

export const ProgramStateSchema = z.object({
  teamId: id(), tier: pub(z.enum(PROGRAM_TIERS)),
  ad: AthleticDirectorSchema, president: PresidentSchema, power: PowerSchema, budget: BudgetSchema,
  facilities: z.array(FacilitySchema), projects: z.array(FacilityProjectSchema), boosters: z.array(BoosterGroupSchema),
  staff: z.array(StaffSeatSchema), exchanges: z.array(AdExchangeSchema),
  warnedSeats: own(z.array(z.enum(LIMITED_SEATS))),
}).strict();
