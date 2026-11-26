// The defense's pre-snap checks and disguise for a tick-engine play (J5.5, G2.5.1), from the defense designer's
// starter calls (football-content defense-designer/calls.ts). The designer resolves its call against the offense's
// actual formation: the first check whose looks all hold is the one the signal caller can make, and its patch is
// compiled to the engine contract for the defenders it names. Its disguise is the spots the named defenders show
// before they stem. The engine (presnap plan) decides whether the caller sees the look, makes the check in time and
// reaches each man; the tick resolver then plays the patched assignments.
//
// PROVISIONAL (Assumption): the engine's calls are the starter and full-set calls, not designer calls, so each takes
// the checks and disguise of the designer call of its coverage family (DESIGNER_FOR_FAMILY), and designer slot ids
// map to the engine's defensive roles by position (SLOT_ROLES). Both go when the game runs designer calls itself.
import { type Assignment, type PlayPoint, type RuleSet } from '@gm/schema';
import { defenseDesigner as dd } from '@gm/football-content';
import type { perception as perceptionModule, presnap } from '@gm/engine-core';

type PresnapDefenseCalls = { readonly checks: readonly presnap.DefensiveCheck[]; readonly disguise: readonly presnap.Disguise[] };
const NONE: PresnapDefenseCalls = { checks: [], disguise: [] };

/** Engine coverage family (or call id) to the designer call whose checks and disguise it takes. */
export const DESIGNER_FOR_FAMILY: Readonly<Record<string, string>> = {
  cover3: 'dd_over_3_sky', cover1: 'dd_nickel_1_robber', cover4: 'dd_nickel_quarters', cover0: 'dd_base_0_six', def_tampa2: 'dd_base_tampa_2',
};
/** Designer slot id to the engine roles that play it, first found wins. Linemen are not mapped: no check moves them. */
export const SLOT_ROLES: Readonly<Record<string, readonly string[]>> = {
  S: ['SAM', 'NB'], NB: ['NB', 'SAM'], M: ['MIKE'], W: ['WILL'], SS: ['SS'], FS: ['FS'], LC: ['LCB'], RC: ['RCB'],
};
const DL = new Set(['DE', 'DT', 'NT']);
/** The designer's lateral is right-positive; the engine's play frame is left-positive (D-11). */
const flip = (py: number): number => (py === 0 ? 0 : -py);
/** The look is drawn on the middle of the field: the engine's starter calls align without regard to the hash. */
const MID: dd.BoardSituation = { ballYd: 0, qbArm: 'right' };

export interface PresnapCallsPort {
  /** Checks (with patches) and disguise for this play; none for a call no designer call covers. */
  of(defenseKey: string, family: string, D: readonly Assignment[], O: readonly Assignment[], qbSlot: number, rules: RuleSet): PresnapDefenseCalls;
}

/**
 * `prepare` turns a compiled designer assignment into the port's form (the rally and drop rules, bound selectors),
 * `perceptionOf` gives the defender's perception settings for it (his keys).
 */
export function createPresnapCalls(
  prepare: (a: Assignment) => Assignment,
  perceptionOf: (a: Assignment) => perceptionModule.PerceptionConfig,
): PresnapCallsPort {
  const byId = new Map(dd.DESIGNER_CALLS.map((c) => [c.id, c]));
  const cache = new WeakMap<RuleSet, WeakMap<readonly Assignment[], Map<string, PresnapDefenseCalls>>>();
  const geometry = new WeakMap<RuleSet, dd.FieldGeometry | null>();

  const lookOf = (O: readonly Assignment[], qbSlot: number): dd.OffLook => ({
    id: 'play', name: 'play', personnel: '',
    players: O.map((a, i) => ({ role: a.role, px: a.preSnap.align.px, py: flip(a.preSnap.align.py), onLine: a.preSnap.onLine, eligible: i !== qbSlot && !LINE_ROLES.has(a.role) })),
    motion: null,
  });
  const slotOf = (D: readonly Assignment[], id: string): number => {
    for (const r of SLOT_ROLES[id] ?? []) { const i = D.findIndex((a) => a.role === r); if (i >= 0) return i; }
    return -1;
  };
  // A compiled designer zone names its area but not its side; the port's drop path reads the side from the name.
  const sided = (a: Assignment): Assignment => {
    const pr = a.behavior.params, zone = pr['zone'];
    if (typeof zone !== 'string' || typeof pr['y0'] !== 'number' || typeof pr['y1'] !== 'number') return a;
    const mid = ((pr['y0'] as number) + (pr['y1'] as number)) / 2;
    const d0 = typeof pr['d0'] === 'number' ? (pr['d0'] as number) : 0, d1 = typeof pr['d1'] === 'number' ? (pr['d1'] as number) : d0;
    const name = Math.abs(mid) < 1 ? zone : `${zone}${mid > 0 ? 'Left' : 'Right'}`;
    return { ...a, behavior: { ...a.behavior, params: { ...pr, zone: name, workTo: (d0 + d1) / 2 } } };
  };
  const asEngine = (a: Assignment, like: Assignment): Assignment => prepare(sided({ ...a, role: like.role, conceptId: like.conceptId }));

  const build = (call: dd.DefensiveCall, D: readonly Assignment[], O: readonly Assignment[], qbSlot: number, f: dd.FieldGeometry): PresnapDefenseCalls => {
    const look = lookOf(O, qbSlot);
    const checks: presnap.DefensiveCheck[] = [];
    const res = dd.resolve(call, look, MID, f);
    const check = res.checkApplied;
    if (check !== null) {
      const base = dd.resolve({ ...call, checks: [] }, look, MID, f);
      const compiled = dd.compileCall(res);
      const patch: presnap.CheckPatch[] = [];
      call.slots.forEach((s, k) => {
        const named = check.patch.slots?.[s.id] !== undefined;
        const cancelled = res.pressureCancelled && !DL.has(s.pos) && base.defenders[k]!.job.kind === 'rush';
        if (!named && !cancelled) return;
        const ts = slotOf(D, s.id);
        if (ts < 0) return;
        const a = asEngine(compiled[k]!, D[ts]!);
        patch.push({ teamSlot: ts, assignment: a, perception: perceptionOf(a) });
      });
      const when = check.when;
      const trigger: presnap.PictureTrigger = when.includes('motion') ? 'motion' : when.length === 1 && when[0] === 'empty' ? 'empty' : when.length === 1 && when[0] === 'bunch' ? 'bunch' : 'formation';
      if (patch.length > 0) checks.push({ name: check.id, trigger, patch });
    }
    const disguise: presnap.Disguise[] = [];
    const dg = call.disguise;
    if (dg !== null) {
      const shown = dd.compileCall(dd.resolve({ ...call, checks: [], slots: call.slots.map((s) => (dg.positions[s.id] ? { ...s, align: dg.positions[s.id]! } : s)) }, look, MID, f));
      call.slots.forEach((s, k) => {
        if (!dg.positions[s.id]) return;
        const ts = slotOf(D, s.id);
        if (ts < 0) return;
        const at = shown[k]!.preSnap.align;
        disguise.push({ teamSlot: ts, shown: { px: at.px, py: at.py } as PlayPoint });
      });
    }
    return checks.length === 0 && disguise.length === 0 ? NONE : { checks, disguise };
  };

  return {
    of(defenseKey, family, D, O, qbSlot, rules) {
      const id = DESIGNER_FOR_FAMILY[defenseKey] ?? DESIGNER_FOR_FAMILY[family];
      const call = id === undefined ? undefined : byId.get(id);
      if (call === undefined) return NONE;
      let f = geometry.get(rules);
      if (f === undefined) {
        try { f = dd.fieldGeometry(rules); } catch { f = null; }
        geometry.set(rules, f);
      }
      if (f === null) return NONE;
      let byO = cache.get(rules);
      if (byO === undefined) { byO = new WeakMap(); cache.set(rules, byO); }
      let byKey = byO.get(O);
      if (byKey === undefined) { byKey = new Map(); byO.set(O, byKey); }
      const key = `${call.id}|${defenseKey}`;
      let out = byKey.get(key);
      if (out === undefined) {
        try { out = build(call, D, O, qbSlot, f); } catch { out = NONE; }
        byKey.set(key, out);
      }
      return out;
    },
  };
}

const LINE_ROLES = new Set(['LT', 'LG', 'C', 'RG', 'RT']);
