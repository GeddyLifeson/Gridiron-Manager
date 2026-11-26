// Defensive call designer read model (G-91; bible O3.2.1, O3.7.2, G2). Builds the plain view object the
// designer screen draws: the defense aligned against the chosen look, gap labels with one name per gap,
// each defender's responsibility by offensive action (run to, run away, pass), the layer summary, the
// checks table (one row per look in the switcher set), validator findings and the hours strip.
//
// The designer core lives in @gm/football-content `defenseDesigner` (src/defense-designer/). It reaches
// app-services through that package's entry point once the integrator adds the barrel line (CR-G91-1), so
// the core is injected here (same pattern as the analytics read models, CR-G71-2): the integrator binds
// `defenseDesignerView(defenseDesigner, input)`. The port below names only what this model reads.
// Holds no football logic of its own beyond labelling: every alignment, gap owner and fit comes from the core.
import type { RuleSet } from '@gm/schema';

export type Side = 'left' | 'right';
export type Severity = 'refuse' | 'rule_failure' | 'warning';

// ---------- the port (structural slice of the core's types) ----------

export interface PortRect { readonly y0: number; readonly y1: number; readonly d0: number; readonly d1: number }
export type PortJob =
  | { readonly kind: 'rush'; readonly gap: string; readonly side: Side; readonly delayS: number }
  | { readonly kind: 'man'; readonly target: string | null; readonly technique: string }
  | { readonly kind: 'bracket'; readonly target: string; readonly part: string }
  | { readonly kind: 'zone'; readonly area: string; readonly side: Side | null; readonly rect: PortRect }
  | { readonly kind: 'spy' };
export interface PortSlot { readonly id: string; readonly pos: string; readonly align: { readonly kind: string; readonly blocker?: string; readonly shade?: string }; readonly gapControl?: 'one' | 'two' }
export interface PortDefender { readonly slot: PortSlot; readonly px: number; readonly py: number; readonly job: PortJob; readonly label: string | null; readonly onLine: boolean }
export interface PortPlayer { readonly role: string; readonly px: number; readonly py: number; readonly onLine: boolean; readonly eligible: boolean }
export interface PortLook { readonly id: string; readonly name: string; readonly personnel: string; readonly players: readonly PortPlayer[]; readonly motion: { readonly role: string; readonly toPy: number; readonly kind: string; readonly timeS: number } | null }
export interface PortResolution {
  readonly look: PortLook;
  readonly reading: { readonly center: PortPlayer; readonly line: Readonly<Record<Side, { readonly gaps: readonly { readonly gap: string; readonly y: number }[] }>> };
  readonly declared: { readonly strong: Side; readonly passStrong: Side };
  readonly checkApplied: { readonly id: string; readonly note: string } | null;
  readonly coverage: { readonly name: string; readonly shell: string };
  readonly pressureCancelled: boolean;
  readonly defenders: readonly PortDefender[];
  readonly matchupNotes: readonly string[];
}
export type PortFitJob = { readonly kind: string; readonly gap?: string; readonly side: Side | null };
export interface PortCall {
  readonly id: string; readonly name: string; readonly status: string;
  readonly package: { readonly name: string; readonly dl: number; readonly lb: number; readonly db: number };
  readonly front: { readonly name: string; readonly convention: string };
  readonly movement: { readonly stunts: readonly unknown[]; readonly pressure: { readonly name: string; readonly family: string } | null };
  readonly coverage: { readonly name: string; readonly shell: string };
  readonly checks: readonly { readonly id: string; readonly when: readonly string[]; readonly note: string }[];
  readonly disguise: { readonly shell: string; readonly moment: string } | null;
}
export interface PortGeometry { readonly halfWidthYd: number; readonly hashYd: number; readonly numbersTopYd: number | null; readonly numbersBottomYd: number | null }
export interface PortFinding { readonly severity: Severity; readonly code: string; readonly formationId: string | null; readonly slot: string | null; readonly message: string; readonly ruleKey: string | null }

/** What the read model calls on the designer core (`defenseDesigner` namespace of @gm/football-content). */
export interface DefenseDesignerCore<C extends PortCall = PortCall, L extends PortLook = PortLook, R extends PortResolution = PortResolution> {
  readonly LOOKS: readonly L[];
  fieldGeometry(rules: Pick<RuleSet, 'keys' | 'num'>): PortGeometry;
  resolve(call: C, look: L, sit: { ballYd: number; qbArm: Side }, f: PortGeometry): R;
  gapTable(res: R): readonly { readonly side: Side; readonly gap: string; readonly owners: readonly string[] }[];
  fitTable(call: C, res: R, family: 'insideZone' | 'wideZone' | 'power' | 'counter' | 'toss' | 'option', playSide: Side): { readonly rows: readonly { readonly slot: string; readonly job: PortFitJob }[]; readonly errors: readonly string[] };
  boxDefenders(res: R): readonly unknown[];
  conflicts(res: R): readonly string[];
  coverageReport(res: R): { readonly uncovered: readonly string[]; readonly doubled: readonly string[] };
  pressureReport(res: R): { readonly rushers: readonly string[]; readonly family: string; readonly deep: number; readonly freeRushers: Readonly<Record<Side, number>>; readonly hot: readonly { readonly receiver: string; readonly takenBy: string | null }[] };
  validateCall(call: C, f: PortGeometry, opts?: { looks?: readonly L[]; situations?: readonly { ballYd: number; qbArm: Side }[] }): { readonly status: string; readonly findings: readonly PortFinding[]; readonly perLook: readonly { readonly lookId: string; readonly box: number; readonly checkApplied: string | null }[] };
  stuntName(call: C, s: never): string;
}

// ---------- the view ----------

export type RunFamilyId = 'insideZone' | 'wideZone' | 'power' | 'counter' | 'toss' | 'option';
export const RUN_FAMILY_IDS: readonly RunFamilyId[] = ['insideZone', 'wideZone', 'power', 'counter', 'toss', 'option'];

/** One responsibility, as words-ready parts: the screen turns `kind` into text and adds the parts. */
export interface DutyView { readonly kind: string; readonly gap: string | null; readonly side: Side | null; readonly target: string | null; readonly area: string | null; readonly technique: string | null; readonly delayS: number | null }

export interface DefenderView {
  readonly slot: string; readonly pos: string;
  /** Depth past the line (yd) and lateral from the midline, right-positive (yd). */
  readonly px: number; readonly py: number;
  readonly onLine: boolean;
  /** Technique label under the front's convention, linemen only. */
  readonly technique: string | null;
  /** Blocker the lineman aligns on (his key in a read front); null when the call does not set one. */
  readonly key: string | null;
  readonly gapControl: 'one' | 'two' | null;
  readonly runTo: DutyView | null;
  readonly runAway: DutyView | null;
  readonly pass: DutyView;
  /** Zone window for a zone dropper, for the canvas. */
  readonly zone: PortRect | null;
  readonly inBox: boolean;
  readonly conflict: boolean;
}

export interface GapLabelView { readonly side: Side; readonly gap: string; readonly y: number; readonly owners: readonly string[]; readonly flag: 'ok' | 'none' | 'double' }
export interface CheckRowView { readonly lookId: string; readonly lookName: string; readonly box: number; readonly checkId: string | null; readonly note: string | null }
export interface FindingView { readonly severity: Severity; readonly code: string; readonly lookId: string | null; readonly slot: string | null; readonly message: string; readonly ruleKey: string | null }
export interface LayerView {
  readonly package: string; readonly personnel: string;
  readonly front: string; readonly convention: string;
  readonly stunts: readonly string[];
  readonly pressure: { readonly name: string; readonly family: string } | null;
  readonly coverage: { readonly name: string; readonly shell: string };
  readonly checks: number;
  readonly disguise: { readonly shell: string; readonly moment: string } | null;
}
export interface HoursStripView { readonly usedH: number; readonly leftH: number; readonly owner: 'coach' | 'assistant'; readonly ownerName: string; readonly delegable: boolean }

export interface DefenseDesignerView {
  readonly callId: string; readonly callName: string;
  readonly status: string;
  readonly look: { readonly id: string; readonly name: string; readonly personnel: string };
  readonly looks: readonly { readonly id: string; readonly name: string }[];
  readonly field: { readonly halfWidthYd: number; readonly hashYd: number; readonly ballYd: number };
  readonly offense: readonly PortPlayer[];
  readonly motion: { readonly role: string; readonly toPy: number; readonly kind: string } | null;
  readonly strong: Side; readonly passStrong: Side;
  readonly defenders: readonly DefenderView[];
  readonly selected: string | null;
  readonly family: RunFamilyId;
  readonly gaps: readonly GapLabelView[];
  readonly box: number;
  readonly pressure: { readonly rushers: number; readonly family: string; readonly deep: number; readonly freeLeft: number; readonly freeRight: number; readonly hotUnanswered: readonly string[] };
  readonly uncovered: readonly string[];
  readonly checkApplied: { readonly id: string; readonly note: string } | null;
  readonly layers: LayerView;
  readonly checks: readonly CheckRowView[];
  /** Validator findings: those for the shown look first, then the call-wide ones, then other looks. */
  readonly findings: readonly FindingView[];
  readonly matchupNotes: readonly string[];
  readonly hours: HoursStripView | null;
}

export interface DefenseDesignerInput<C extends PortCall> {
  readonly call: C;
  readonly lookId: string;
  readonly rules: Pick<RuleSet, 'keys' | 'num'>;
  readonly ballYd?: number;
  readonly qbArm?: Side;
  readonly selectedSlot?: string | null;
  readonly family?: RunFamilyId;
  /** O3.7.2 strip from the hour ledger (E7) and delegation settings; null before the ledger exists. */
  readonly hours?: HoursStripView | null;
}

function duty(j: PortJob): DutyView {
  const base = { gap: null, side: null, target: null, area: null, technique: null, delayS: null };
  switch (j.kind) {
    case 'rush': return { ...base, kind: 'rush', gap: j.gap, side: j.side, delayS: j.delayS > 0 ? j.delayS : null };
    case 'man': return { ...base, kind: 'man', target: j.target, technique: j.technique };
    case 'bracket': return { ...base, kind: 'bracket', target: j.target, technique: j.part };
    case 'zone': return { ...base, kind: 'zone', area: j.area, side: j.side };
    case 'spy': return { ...base, kind: 'spy' };
  }
}

function fitDuty(j: PortFitJob | undefined): DutyView | null {
  if (j === undefined) return null;
  return { kind: j.kind, gap: j.gap ?? null, side: j.side, target: null, area: null, technique: null, delayS: null };
}

/** Build the designer view for one call against one look. Throws on an unknown look id. */
export function defenseDesignerView<C extends PortCall, L extends PortLook, R extends PortResolution>(
  core: DefenseDesignerCore<C, L, R>, input: DefenseDesignerInput<C>,
): DefenseDesignerView {
  const look = core.LOOKS.find((l) => l.id === input.lookId);
  if (look === undefined) throw new Error(`defense designer view: unknown look ${input.lookId}`);
  const f = core.fieldGeometry(input.rules);
  const sit = { ballYd: input.ballYd ?? 0, qbArm: input.qbArm ?? ('right' as Side) };
  const family = input.family ?? 'insideZone';
  const res = core.resolve(input.call, look, sit, f);
  const centerY = res.reading.center.py;
  const sideOf = (py: number): Side => (py < centerY ? 'left' : 'right');
  const fits: Record<Side, ReturnType<typeof core.fitTable>> = { left: core.fitTable(input.call, res, family, 'left'), right: core.fitTable(input.call, res, family, 'right') };
  const box = new Set(core.boxDefenders(res));
  const conflicted = new Set(core.conflicts(res));

  const defenders: DefenderView[] = res.defenders.map((d) => {
    const mine = sideOf(d.py);
    const away: Side = mine === 'left' ? 'right' : 'left';
    const fitOf = (s: Side) => fits[s].rows.find((x) => x.slot === d.slot.id)?.job;
    return {
      slot: d.slot.id, pos: d.slot.pos, px: d.px, py: d.py, onLine: d.onLine,
      technique: d.label,
      key: d.slot.align.kind === 'tech' && d.slot.align.blocker !== undefined ? d.slot.align.blocker : null,
      gapControl: d.slot.gapControl ?? null,
      runTo: fitDuty(fitOf(mine)), runAway: fitDuty(fitOf(away)), pass: duty(d.job),
      zone: d.job.kind === 'zone' ? d.job.rect : null,
      inBox: box.has(d), conflict: conflicted.has(d.slot.id),
    };
  });

  const lineGaps = new Map<string, number>();
  for (const s of ['left', 'right'] as const) for (const g of res.reading.line[s].gaps) lineGaps.set(`${s}:${g.gap}`, g.y);
  const gaps: GapLabelView[] = core.gapTable(res).map((g) => ({
    side: g.side, gap: g.gap, y: lineGaps.get(`${g.side}:${g.gap}`) ?? 0, owners: [...g.owners],
    flag: g.owners.length === 0 ? 'none' : g.owners.length > 1 ? 'double' : 'ok',
  }));

  const pr = core.pressureReport(res);
  const cov = core.coverageReport(res);
  const v = core.validateCall(input.call, f, { looks: core.LOOKS, situations: [sit] });
  const lookName = new Map(core.LOOKS.map((l) => [l.id, l.name]));
  const checkNote = new Map(input.call.checks.map((c) => [c.id, c.note]));
  const rank = (x: PortFinding): number => (x.formationId === look.id ? 0 : x.formationId === null ? 1 : 2);
  const sevRank: Record<Severity, number> = { refuse: 0, rule_failure: 1, warning: 2 };
  const findings: FindingView[] = [...v.findings]
    .map((x, i) => ({ x, i }))
    .sort((a, b) => rank(a.x) - rank(b.x) || sevRank[a.x.severity] - sevRank[b.x.severity] || a.i - b.i)
    .map(({ x }) => ({ severity: x.severity, code: x.code, lookId: x.formationId, slot: x.slot, message: x.message, ruleKey: x.ruleKey }));

  const call = input.call;
  return {
    callId: call.id, callName: call.name, status: v.status,
    look: { id: look.id, name: look.name, personnel: look.personnel },
    looks: core.LOOKS.map((l) => ({ id: l.id, name: l.name })),
    field: { halfWidthYd: f.halfWidthYd, hashYd: f.hashYd, ballYd: sit.ballYd },
    offense: res.look.players.map((p) => ({ role: p.role, px: p.px, py: p.py, onLine: p.onLine, eligible: p.eligible })),
    motion: res.look.motion ? { role: res.look.motion.role, toPy: res.look.motion.toPy, kind: res.look.motion.kind } : null,
    strong: res.declared.strong, passStrong: res.declared.passStrong,
    defenders,
    selected: input.selectedSlot != null && defenders.some((d) => d.slot === input.selectedSlot) ? input.selectedSlot : null,
    family,
    gaps,
    box: box.size,
    pressure: { rushers: pr.rushers.length, family: pr.family, deep: pr.deep, freeLeft: pr.freeRushers.left, freeRight: pr.freeRushers.right, hotUnanswered: pr.hot.filter((h) => h.takenBy === null).map((h) => h.receiver) },
    uncovered: [...cov.uncovered],
    checkApplied: res.checkApplied ? { id: res.checkApplied.id, note: res.checkApplied.note } : null,
    layers: {
      package: call.package.name, personnel: `${call.package.dl}-${call.package.lb}-${call.package.db}`,
      front: call.front.name, convention: call.front.convention,
      stunts: call.movement.stunts.map((s) => core.stuntName(call, s as never)),
      pressure: call.movement.pressure ? { name: call.movement.pressure.name, family: call.movement.pressure.family } : null,
      coverage: { name: call.coverage.name, shell: call.coverage.shell },
      checks: call.checks.length,
      disguise: call.disguise ? { shell: call.disguise.shell, moment: call.disguise.moment } : null,
    },
    checks: v.perLook.map((p) => ({ lookId: p.lookId, lookName: lookName.get(p.lookId) ?? p.lookId, box: p.box, checkId: p.checkApplied, note: p.checkApplied ? checkNote.get(p.checkApplied) ?? null : null })),
    findings,
    matchupNotes: [...res.matchupNotes],
    hours: input.hours ?? null,
  };
}
