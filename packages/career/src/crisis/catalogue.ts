// The crisis catalogue as the engine reads it (L9.1.1 "A crisis type is a data row"). The rows are
// content owned by G-32 in `packages/football-content/data/crises/` (catalogue.json, acts.json).
// `career` may not import `football-content` (P1.2.1), so the world layer loads the files and passes
// them in; this file only types them and checks the rules the engine depends on.

export interface CatNum { readonly value: number; readonly unit: string; readonly factId: string }
export interface CatRange { readonly min: number; readonly max: number; readonly unit: string; readonly factId: string }

export interface HazardParam {
  readonly id: string;
  readonly value?: number;
  readonly values?: readonly number[];
  readonly unit: string;
  readonly factId: string;
  readonly note?: string;
}

export type GuardClass = 'football' | 'personal';
export type HazardKind = 'weekly_per_person' | 'cause_driven' | 'threshold' | 'wrapper' | 'per_team_season';

export interface CrisisStage {
  readonly id: string;
  readonly templateKey: string;
  /** Who learns of it at this stage: coach, staff, team, owner_or_ad, reporters, public, medical, ... */
  readonly knownTo: readonly string[];
  /** Days the stage lasts. Absent: the owning system advances it, or it is the last stage. */
  readonly clock?: CatRange;
}

export interface CrisisType {
  readonly id: string;
  readonly leaf: string;
  /** Rule-set tags the type applies under. Compared as data, never branched on in code (P1.1.2). */
  readonly levels: readonly string[];
  readonly guard: GuardClass;
  /** The two outside classes (L9.1.1): no cause event needed, generated people only. */
  readonly outsideClass: boolean;
  readonly subjects: { readonly generatedOnly: boolean; readonly adultOnly: boolean; readonly requiresFamilyObject: boolean };
  readonly causeEvents: readonly string[];
  readonly hazard: { readonly kind: HazardKind; readonly params: readonly HazardParam[]; readonly openResearch?: string };
  readonly severity: { readonly range: CatRange; readonly classes: readonly { readonly id: string; readonly share: number; readonly factId: string }[] };
  readonly stages: readonly CrisisStage[];
  readonly acts: readonly string[];
  readonly titleKey: string;
  readonly newsKey: string;
  readonly factIds: readonly string[];
}

export interface CrisisCatalogue {
  readonly contentSchemaVersion: number;
  readonly pacing: { readonly newPerTeamPerWeek: CatNum; readonly maxOpen: CatNum; readonly maxOpenWhenRoomLost: CatNum; readonly queueWeeks: CatNum };
  readonly warning: { readonly leadDays: CatRange; readonly falseAlarmShare: CatNum };
  readonly crises: readonly CrisisType[];
}

export interface ActDef {
  readonly id: string;
  readonly ownerSystem: string;
  /** person, team, council, staff, audience, reporter, boss, family_agent, league_or_school, none */
  readonly involves: string;
  readonly event: string;
  readonly powerNeeded: string | null;
  readonly askIfAboveAuthority: boolean;
  readonly labelKey: string;
  readonly detailKey: string;
  readonly spendsCurrency: boolean;
  readonly graded: boolean;
  readonly minutes?: CatNum;
}

export interface RuleBreakingResponseDef {
  readonly id: string;
  readonly offeredIn: readonly string[];
  readonly pipeline: string;
  readonly warned: boolean;
}

export interface ActsFile {
  readonly acts: readonly ActDef[];
  readonly ruleBreakingResponses: readonly RuleBreakingResponseDef[];
}

/** Every rule the engine relies on, checked when the world loads the files. Empty list = usable. */
export function catalogueProblems(cat: CrisisCatalogue, acts: ActsFile): string[] {
  const out: string[] = [];
  const actIds = new Set(acts.acts.map((a) => a.id));
  const ids = new Set<string>();
  for (const t of cat.crises) {
    if (ids.has(t.id)) out.push(`${t.id}: duplicate crisis type`);
    ids.add(t.id);
    // L9.1.2 acceptance: every event type fails validation without a guard class.
    if (t.guard !== 'football' && t.guard !== 'personal') out.push(`${t.id}: missing guard class (L9.1.2)`);
    // L9.1.1: only outside classes may lack a cause, and outside classes draw on generated adults only.
    if (!t.outsideClass && t.causeEvents.length === 0) out.push(`${t.id}: not an outside class and lists no cause event (L9.1.1)`);
    if (t.outsideClass && !(t.subjects.generatedOnly && t.subjects.adultOnly)) out.push(`${t.id}: outside class must be generated adults only (L9.1.1)`);
    // L9.1.2 rules 1 and 3.
    if (t.guard === 'personal' && !(t.subjects.generatedOnly && t.subjects.adultOnly)) out.push(`${t.id}: personal class must be generated adults only (L9.1.2)`);
    if (t.stages.length === 0) out.push(`${t.id}: no stages`);
    if (t.severity.range.min > t.severity.range.max) out.push(`${t.id}: severity range inverted`);
    for (const s of t.stages) if (s.clock && s.clock.min > s.clock.max) out.push(`${t.id}.${s.id}: clock inverted`);
    for (const a of t.acts) if (!actIds.has(a)) out.push(`${t.id}: unknown act ${a}`);
  }
  // L9.3.1 acceptance: no act spends a currency, none is graded.
  for (const a of acts.acts) {
    if (a.spendsCurrency) out.push(`${a.id}: spends a currency (L9.3.1)`);
    if (a.graded) out.push(`${a.id}: graded (L9.3.1)`);
  }
  for (const r of acts.ruleBreakingResponses) {
    if (!r.warned) out.push(`${r.id}: rule-breaking response offered without a warning (L8.2.5)`);
    for (const t of r.offeredIn) if (!ids.has(t)) out.push(`${r.id}: offered in unknown crisis ${t}`);
  }
  return out;
}

export function crisisType(cat: CrisisCatalogue, id: string): CrisisType {
  const t = cat.crises.find((c) => c.id === id);
  if (!t) throw new Error(`crisis: unknown type ${id}`);
  return t;
}

/** A hazard parameter by id: a single value. Throws when the catalogue lacks it. */
export function hazardValue(t: CrisisType, id: string): number {
  const p = t.hazard.params.find((x) => x.id === id);
  if (!p || p.value === undefined) throw new Error(`crisis: ${t.id} has no hazard value ${id}`);
  return p.value;
}

/** A hazard parameter by id: a list of values. Throws when the catalogue lacks it. */
export function hazardValues(t: CrisisType, id: string): readonly number[] {
  const p = t.hazard.params.find((x) => x.id === id);
  if (!p || !p.values) throw new Error(`crisis: ${t.id} has no hazard list ${id}`);
  return p.values;
}
