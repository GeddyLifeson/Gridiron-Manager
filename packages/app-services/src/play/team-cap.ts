// The seat team's cap sheet from the live world (team.cap, C6.2 to C6.4): the world's player contracts
// (PR 273, `player_contracts` system state) read into the G-16 cap form and laid out by the cap sheet read
// model. The world's contracts carry base salary only so far (PC-05), so bonuses and proration show as 0.
// Pure: the same world and rules give the same view.
import type { ContractRecord, RuleSet } from '@gm/schema';
import { cap } from '@gm/league';
import { money, type loop } from '@gm/world';
import { buildProCapView, type PlayerCard, type SheetContract } from '../read-models/cap-sheet/index.ts';
import type { ProCapView, ProvenanceLookup } from '../read-models/cap-sheet/types.ts';

type LiveWorld = loop.LiveWorld;
interface RuleRow { readonly key: string; readonly value: unknown; readonly factId?: string }
type PlayerTerms = Extract<ContractRecord['terms'], { kind: 'player' }>;

/** `LiveWorld.systemState` key of the world's player contracts (world contracts module, CONTRACTS_KEY). */
const CONTRACTS_KEY = 'player_contracts';
/** The rules year every league year reads (MO-02: today's rules throughout), as the world's contracts use it. */
export const RULES_YEAR = 2026;

/** A RuleSet over the league rules file's values (the same values the world's contracts module reads). */
export function ruleSetOf(values: readonly RuleRow[], level: 'pro' | 'college'): RuleSet {
  const v = new Map(values.map((r) => [r.key, r.value]));
  const get = (k: string): unknown => {
    if (!v.has(k)) throw new Error(`league ${level} holds no rule ${k}`);
    return v.get(k);
  };
  const keys = [...v.keys()].sort();
  return { id: `seat:${level}`, level: level as RuleSet['level'], seasonYear: RULES_YEAR, num: (k) => Number(get(k)), bool: (k) => Boolean(get(k)), opt: (k) => String(get(k)), keys: () => keys };
}

/** Fact ids from the rules file. The status word is left empty: the screen flags every row not computed as Verified (Q6). */
export function provenanceFrom(values: readonly RuleRow[]): ProvenanceLookup {
  const ids = new Map(values.filter((r) => typeof r.factId === 'string').map((r) => [r.key, r.factId!]));
  return (key) => { const f = ids.get(key); return f ? { factId: f, status: '' } : null; };
}

/**
 * The seat team's pro cap sheet, or null when the league has no cap (college, or no rules) or the world
 * keeps no contracts. Week 0 is the offseason (before June 1: the top-51 rule and designated releases apply).
 */
export function seatCapView(w: LiveWorld, teamId: number, leagueRules: { readonly values?: readonly RuleRow[] } | undefined, level: 'pro' | 'college'): ProCapView | null {
  const values = leagueRules?.values ?? [];
  if (level !== 'pro' || !values.some((r) => r.key === `cap.amount_${RULES_YEAR}`)) return null;
  const state = w.systemState.get(CONTRACTS_KEY) as { readonly active?: readonly ContractRecord[] } | undefined;
  if (!state?.active) return null;
  const rules = ruleSetOf(values, 'pro');
  const leagueYear = w.date.seasonYear;
  const offseason = w.week === 0;
  const contracts: SheetContract[] = [];
  const cards: PlayerCard[] = [];
  for (const c of state.active) {
    if (c.teamId !== teamId || c.terms.kind !== 'player') continue;
    const terms = c.terms as PlayerTerms;
    const p = w.people.get(c.personId) as { name?: { first?: string; last?: string }; playing?: { position?: string; eligibility?: { pro?: { creditedSeasons?: number } } } } | undefined;
    const credited = p?.playing?.eligibility?.pro?.creditedSeasons ?? 0;
    contracts.push({ personId: c.personId, contract: cap.fromTerms(c.id, terms), player: { creditedSeasons: credited, undraftedRookie: false } });
    cards.push({ personId: c.personId, name: [p?.name?.first, p?.name?.last].filter(Boolean).join(' ') || `#${c.personId}`, position: p?.playing?.position ?? '' });
  }
  const rulesCap = cap.capAmount(rules, RULES_YEAR);
  const read = (k: string): number | undefined => (rules.keys().includes(k) ? rules.num(k) : undefined);
  return buildProCapView({
    clubId: teamId, leagueYear, phase: offseason ? 'offseason' : 'season', timing: offseason ? 'on_or_before_june1' : 'after_june1',
    rules, contracts, other: [], adjustmentCents: 0, june1Used: 0, cards, provenance: provenanceFrom(values),
    generatedCapCents: money.generatedCapCents(w, read, RULES_YEAR, rulesCap, leagueYear),
  });
}
