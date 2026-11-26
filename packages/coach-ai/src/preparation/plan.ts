// K3.4.1 building the game plan. The output follows the G6 plan object (looks board, themes, menus,
// protection plan, rules of the week, emphasis, special teams, contingencies) so the user-side screens
// and K4 read an AI plan and a user plan the same way. G-68 owns the stored schema; `AiGamePlan` is this
// module's structural copy of it and the integrator's adapter is one-to-one (DECISIONS.md, CR-G74-2).
import type { EmphasisBlock } from '../profile/index.ts';
import type { PrepDepth } from './depth.ts';
import type { MatchupRow, StaffGrade } from './matchups.ts';
import { param } from './params.ts';
import { cellKey, OTHER_LOOK, type CallOption, type PayoffTable, type Unit } from './payoffs.ts';
import type { LookShare, ScoutingReport } from './scouting.ts';

export interface MenuEntry {
  readonly callId: string;
  /** Carried over from the standing menu (rule 1), an installed call brought back, or new this week (rule 3). */
  readonly source: 'standing' | 'installed' | 'new';
  /** New call aimed at a scouted tendency (rule 3, G6.2.2). */
  readonly wrinkle: boolean;
  readonly wrinkleTarget: string | null;
  /** Estimated value against the scouted looks, weighted by look share, less the install cost. */
  readonly value: number;
  /** Order the call joined the menu: practice gives reps in this order when the week is too short (K3.5.1). */
  readonly order: number;
  /** Planned snaps a game from the sheet's stored mixes; null until the sheet is built. */
  readonly plannedSnaps: number | null;
}

export interface Theme {
  readonly kind: 'attack' | 'protect' | 'exploit' | 'help' | 'tendency';
  /** Pairing id for a matchup theme, the tendency cell (measure and key) for a tendency theme. */
  readonly ref: string;
  readonly side: 'offense' | 'defense';
  /** The player the theme is about, when it is a matchup. */
  readonly playerId: number | null;
  readonly strength: number;
}

export interface Contingency {
  readonly kind: 'backupQuarterback' | 'weather';
  /** A short package every staff names, or a full version (rule 6, G6.5.2, G7.8.1). */
  readonly full: boolean;
  readonly calls: readonly string[];
}

export interface WeekRule { readonly against: string; readonly callId: string }

export interface AiGamePlan {
  readonly teamId: number;
  readonly gameId: number;
  readonly opponentId: number;
  /** G6.1.1: the opponent's looks by situation, as this staff charted them. */
  readonly looksBoard: { readonly offense: readonly BoardRow[]; readonly defense: readonly BoardRow[] };
  readonly themes: readonly Theme[];
  readonly offenseMenu: readonly MenuEntry[];
  /** G6.3.2: rushers the staff thinks beat their blocker, each to get help. */
  readonly protectionPlan: readonly { readonly pairingId: string; readonly rusherId: number; readonly blockerId: number }[];
  readonly defenseMenu: readonly MenuEntry[];
  readonly rulesOfWeek: {
    /** Best call against each of the opponent's most common looks. */
    readonly answers: readonly WeekRule[];
    /** G6.4.1: the default call when they show something not on film. */
    readonly unscoutedDefault: string | null;
    /** Rule 5: the named answer for the opponent's best player, if the staff's grades flag one. */
    readonly namedAnswer: { readonly playerId: number; readonly role: string } | null;
    /** K3.1.1 rule 7: how often the opposing coach goes on fourth down (public record), for I2.3.7 and K5. */
    readonly opponentFourthDownGoRate: number | null;
  };
  /** G6.4.2 dials as the coach sets them: his `tendencies.emphasis` (K2.1.3 rule 4), offsets from neutral in -1 to +1. */
  readonly emphasis: EmphasisBlock;
  readonly specialTeamsMenu: readonly MenuEntry[];
  /** G6.5.1: per kicking unit, the scouted threat and the planned answer. */
  readonly specialTeamsAnswers: readonly { readonly unit: string; readonly threat: string; readonly callId: string }[];
  readonly contingencies: readonly Contingency[];
  /** K1.3.1 standing instructions for named players, one per matchup theme. */
  readonly standingInstructions: readonly { readonly playerId: number; readonly instruction: Theme['kind']; readonly pairingId: string }[];
  /** I2.5.2 default freedom for the quarterback, passed through from the staff's standing choice. */
  readonly quarterbackFreedom: string | null;
}

export interface BoardRow { readonly bucket: string; readonly looks: readonly LookShare[] }

export interface Balance {
  /** Group of a call for the balance target (run or pass, pressure or base). */
  readonly groupOf: (c: CallOption) => string;
  /** Wanted share of the menu per group, from the coach's system rates (K2.1.2, read here per K2 SYSTEM_RATE_READERS). */
  readonly targets: Readonly<Record<string, number>>;
}

export interface MenuInput {
  readonly unit: Unit;
  readonly calls: readonly CallOption[];
  readonly table: PayoffTable;
  readonly looks: readonly LookShare[];
  /** Plan size limit: `system.sheetSize` for the side (G6.6.1). */
  readonly sizeLimit: number;
  /** This week's practice time against a normal week, 0 to 1 (a short week is under 1, C2). */
  readonly practiceShare: number;
  readonly balance?: Balance | null;
  /** Look ids named by strong tendency rows, strongest first: what a wrinkle is aimed at. */
  readonly tendencyLooks?: readonly string[];
}

/** Share-weighted value of a call against the scouted looks; an unseen share falls on the `other` class. */
export function callValue(c: CallOption, table: PayoffTable, looks: readonly LookShare[]): number {
  let v = 0;
  let seen = 0;
  for (const l of looks) {
    const cell = table.cells.get(cellKey(c.callId, l.look));
    if (!cell) continue;
    v += l.share * cell.mean;
    seen += l.share;
  }
  const other = table.cells.get(cellKey(c.callId, OTHER_LOOK));
  if (other && seen < 1) v += (1 - seen) * other.mean;
  return v;
}

const byValue = <T extends { value: number; c: CallOption }>(a: T, b: T) => b.value - a.value || (a.c.callId < b.c.callId ? -1 : 1);

/** Rules 1 to 3: standing menu, then ranked additions, to the plan size limit. */
export function buildMenu(inp: MenuInput, depth: PrepDepth): MenuEntry[] {
  const ready = param('plan.readyLine');
  const scored = inp.calls.filter((c) => c.unit === inp.unit).map((c) => {
    const raw = callValue(c, inp.table, inp.looks);
    const isNew = c.readiness < ready;
    return { c, raw, isNew, value: raw - (isNew ? param('plan.installCostEp') * (1 - c.readiness) : 0) };
  });
  const limit = Math.max(0, Math.floor(inp.sizeLimit));
  const picked: { c: CallOption; value: number; source: MenuEntry['source']; wrinkleTarget: string | null }[] = [];
  const has = new Set<string>();
  const take = (s: (typeof scored)[number], source: MenuEntry['source'], wrinkleTarget: string | null = null) => {
    picked.push({ c: s.c, value: s.value, source, wrinkleTarget });
    has.add(s.c.callId);
  };

  // Rule 1: the standing menu (carry-over calls the team already runs well).
  for (const s of scored.filter((x) => x.c.carryOver && !x.isNew).sort(byValue)) if (picked.length < limit) take(s, 'standing');

  // Rule 3: new calls are limited by the staff and by the week's practice time.
  let newLeft = Math.min(Math.floor(depth.newCalls * Math.min(1, Math.max(0, inp.practiceShare))), limit - picked.length);
  // Wrinkles first: the new call that does best against a look a strong tendency row names.
  const targets = inp.tendencyLooks?.length ? inp.tendencyLooks : inp.looks.slice(0, 1).map((l) => l.look);
  for (let w = 0; w < depth.wrinkles && newLeft > 0 && targets.length; w++) {
    const target = targets[w % targets.length]!;
    const best = scored.filter((x) => x.isNew && !has.has(x.c.callId))
      .map((x) => ({ x, v: inp.table.cells.get(cellKey(x.c.callId, target))?.mean ?? Number.NEGATIVE_INFINITY }))
      .sort((a, b) => b.v - a.v || (a.x.c.callId < b.x.c.callId ? -1 : 1))[0];
    if (!best || best.v === Number.NEGATIVE_INFINITY) break;
    take(best.x, 'new', target);
    newLeft--;
  }

  // Rule 2: everything else by value, new calls counted against the limit, toward the system's balance.
  const pool = scored.filter((x) => !has.has(x.c.callId)).sort(byValue);
  const count = (g: string) => picked.filter((p) => inp.balance!.groupOf(p.c) === g).length;
  while (picked.length < limit) {
    const open = pool.filter((x) => !has.has(x.c.callId) && (!x.isNew || newLeft > 0));
    if (!open.length) break;
    let next = open[0]!;
    if (inp.balance) {
      // The group furthest under its wanted share of the finished menu goes next, if it has a call left.
      const groups = Object.keys(inp.balance.targets).sort();
      const short = groups.map((g) => ({ g, gap: inp.balance!.targets[g]! * limit - count(g) })).sort((a, b) => b.gap - a.gap || (a.g < b.g ? -1 : 1));
      for (const s of short) {
        const cand = open.find((x) => inp.balance!.groupOf(x.c) === s.g);
        if (cand) { next = cand; break; }
      }
    }
    take(next, next.isNew ? 'new' : 'installed');
    if (next.isNew) newLeft--;
  }
  return picked.map((p, order) => ({ callId: p.c.callId, source: p.source, wrinkle: p.wrinkleTarget !== null, wrinkleTarget: p.wrinkleTarget, value: p.value, order, plannedSnaps: null }));
}

/**
 * Rule 4: the top matchup edges and the top strong tendency rows. `ourOffense` holds our offense against
 * their defense, `ourDefense` their offense against our defense; edges favour the offense when positive.
 */
export function buildThemes(ourOffense: readonly MatchupRow[], ourDefense: readonly MatchupRow[], report: ScoutingReport, depth: PrepDepth): Theme[] {
  const m: Theme[] = [];
  for (const r of ourOffense) m.push(r.edge >= 0
    ? { kind: 'attack', ref: r.id, side: 'offense', playerId: r.defensePlayerId, strength: r.edge }
    : { kind: 'protect', ref: r.id, side: 'offense', playerId: r.defensePlayerId, strength: -r.edge });
  for (const r of ourDefense) m.push(r.edge >= 0
    ? { kind: 'help', ref: r.id, side: 'defense', playerId: r.offensePlayerId, strength: r.edge }
    : { kind: 'exploit', ref: r.id, side: 'defense', playerId: r.offensePlayerId, strength: -r.edge });
  m.sort((a, b) => b.strength - a.strength || (a.ref < b.ref ? -1 : 1));
  const tendency: Theme[] = report.strong.slice(0, depth.themes).map((c) => ({
    kind: 'tendency' as const, ref: `${c.measure}:${c.key}`, side: c.side === 'offense' ? 'defense' as const : 'offense' as const, playerId: null, strength: c.calls,
  }));
  return [...m.slice(0, depth.themes), ...tendency];
}

export interface PlanInput {
  readonly teamId: number;
  readonly gameId: number;
  readonly opponentId: number;
  readonly report: ScoutingReport;
  readonly board: AiGamePlan['looksBoard'];
  readonly offense: MenuInput;
  readonly defense: MenuInput;
  readonly specialTeams?: MenuInput | null;
  readonly ourOffenseMatchups: readonly MatchupRow[];
  readonly ourDefenseMatchups: readonly MatchupRow[];
  /** Contest kinds that are pass-rush pairings, for the protection plan. */
  readonly rushContests: readonly string[];
  readonly opponentStar: StaffGrade | null;
  /** Readiness of each offensive call with the backup quarterback in (G7.8.1). */
  readonly backupReadiness: (callId: string) => number;
  /** J12 forecast passes the G6.5.2 line for a weather plan. */
  readonly weatherPlanDue: boolean;
  readonly opponentFourthDownGoRate: number | null;
  /** The defensive caller's `tendencies.emphasis`. */
  readonly emphasis: EmphasisBlock;
  readonly quarterbackFreedom?: string | null;
}

export function buildPlan(inp: PlanInput, depth: PrepDepth): AiGamePlan {
  const offenseMenu = buildMenu(inp.offense, depth);
  const defenseMenu = buildMenu(inp.defense, depth);
  const specialTeamsMenu = inp.specialTeams ? buildMenu(inp.specialTeams, depth) : [];
  const themes = buildThemes(inp.ourOffenseMatchups, inp.ourDefenseMatchups, inp.report, depth);

  const rush = new Set(inp.rushContests);
  const protectionPlan = inp.ourOffenseMatchups.filter((r) => rush.has(r.contest) && r.edge < 0)
    .sort((a, b) => a.edge - b.edge || (a.id < b.id ? -1 : 1)).slice(0, depth.themes)
    .map((r) => ({ pairingId: r.id, rusherId: r.defensePlayerId, blockerId: r.offensePlayerId }));

  // Rule 5: the defensive rules of the week come from the same ranking on the defensive side.
  const onMenu = new Set(defenseMenu.map((e) => e.callId));
  const bestAgainst = (look: string): string | null => {
    let best: { id: string; v: number } | null = null;
    for (const id of [...onMenu].sort()) {
      const v = inp.defense.table.cells.get(cellKey(id, look))?.mean;
      if (v !== undefined && (!best || v > best.v)) best = { id, v };
    }
    return best?.id ?? null;
  };
  const answers: WeekRule[] = [];
  for (const l of inp.defense.looks.slice(0, param('plan.themesMax'))) { const id = bestAgainst(l.look); if (id) answers.push({ against: l.look, callId: id }); }

  // G6.5.1: each kicking unit's most common scouted look and the best menu call against it.
  const stMenu = new Set(specialTeamsMenu.map((e) => e.callId));
  const specialTeamsAnswers: { unit: string; threat: string; callId: string }[] = [];
  if (inp.specialTeams) {
    const top = new Map<string, { observed: string; count: number }>();
    for (const r of inp.report.specialTeams) { const cur = top.get(r.unit); if (!cur || r.count > cur.count) top.set(r.unit, { observed: r.observed, count: r.count }); }
    for (const unit of [...top.keys()].sort()) {
      const threat = `${unit}:${top.get(unit)!.observed}`;
      let best: { id: string; v: number } | null = null;
      for (const c of inp.specialTeams.calls) {
        if (!stMenu.has(c.callId) || (c.fits && !c.fits.includes(unit))) continue;
        const v = inp.specialTeams.table.cells.get(cellKey(c.callId, threat))?.mean ?? inp.specialTeams.table.cells.get(cellKey(c.callId, OTHER_LOOK))?.mean;
        if (v !== undefined && (!best || v > best.v || (v === best.v && c.callId < best.id))) best = { id: c.callId, v };
      }
      if (best) specialTeamsAnswers.push({ unit, threat, callId: best.id });
    }
  }

  // Rule 6: every staff names a backup quarterback package; only better preparers build full versions.
  const ready = param('plan.readyLine');
  const suits = offenseMenu.filter((e) => inp.backupReadiness(e.callId) >= ready).sort((a, b) => b.value - a.value || (a.callId < b.callId ? -1 : 1));
  const contingencies: Contingency[] = [{
    kind: 'backupQuarterback', full: depth.fullContingencies,
    calls: (depth.fullContingencies ? suits : suits.slice(0, param('plan.backupPackageCalls'))).map((e) => e.callId),
  }];
  if (depth.fullContingencies && inp.weatherPlanDue) {
    const drop = new Set(inp.offense.calls.filter((c) => c.tags.includes('weather_drop')).map((c) => c.callId));
    contingencies.push({ kind: 'weather', full: true, calls: offenseMenu.filter((e) => !drop.has(e.callId)).map((e) => e.callId) });
  }

  const standingInstructions = themes.filter((t) => t.kind !== 'tendency' && t.playerId !== null)
    .map((t) => ({ playerId: t.playerId!, instruction: t.kind, pairingId: t.ref }));

  return {
    teamId: inp.teamId, gameId: inp.gameId, opponentId: inp.opponentId, looksBoard: inp.board, themes, offenseMenu, protectionPlan, defenseMenu,
    rulesOfWeek: {
      answers, unscoutedDefault: bestAgainst(OTHER_LOOK),
      namedAnswer: inp.opponentStar ? { playerId: inp.opponentStar.playerId, role: inp.opponentStar.role } : null,
      opponentFourthDownGoRate: inp.opponentFourthDownGoRate,
    },
    emphasis: { ...inp.emphasis }, specialTeamsMenu, specialTeamsAnswers,
    contingencies: contingencies.slice(0, param('plan.contingenciesMax')), standingInstructions,
    quarterbackFreedom: inp.quarterbackFreedom ?? null,
  };
}

/** Count of calls a plan added for this opponent: new calls and wrinkles (K3.4.1 acceptance). */
export function opponentSpecificCalls(plan: AiGamePlan): number {
  return [...plan.offenseMenu, ...plan.defenseMenu].filter((e) => e.source === 'new').length;
}
