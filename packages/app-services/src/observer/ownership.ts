// Owner rules: for each world or sim shape with private fields, who counts as "own team" (P1.1.4,
// world contract W-14, W-16). A field of class `own_team` or `observer_estimate` is released only to
// an observer the rule names. A shape with no rule releases no private field to anyone: fail closed.
//
// Rules are attached to schema objects, so they apply wherever the shape is nested (a PlayRecord
// inside a GameEvent, a Decision inside a PlayRecord). `scopes` narrow ownership for parts of a shape
// whose owner differs from the row's (one team's line in a prospect row, one side's call in a play).
import {
  PersonRecord, PersonView, TeamRecord, CultureRecord, InjuryRecord, ProspectRecord, ProspectTeamState, ContractRecord,
  WorldEvent, PlayerPlayGrade, SuggestionRecord, JobOpening, LedgerEntry, BalanceSheet, HouseholdRecord, InboxItem,
  EvaluationRecord, PhilosophyRecord, PlayRecord, Decision, ObservedPlayer, GameState,
  type Visibility,
} from '@gm/schema';
import { hasScope, roomScope, type Observer, type TeamScope, type WorldLookup } from './observer.ts';
import { schemaAt, shapeKey, type Schema } from './schema-walk.ts';

export interface Owners {
  readonly everyone?: boolean;
  readonly personIds?: readonly (number | null | undefined)[];
  readonly teams?: readonly { teamId: number | null | undefined; scope: string }[];
}

export const NOBODY: Owners = Object.freeze({});

export function isOwner(o: Observer, owners: Owners): boolean {
  if (owners.everyone) return true;
  if (o.personId !== null && owners.personIds?.includes(o.personId)) return true;
  return !!owners.teams?.some((t) => typeof t.teamId === 'number' && hasScope(o, t.teamId, t.scope));
}

export interface OwnerEnv {
  readonly lookup: WorldLookup;
  /** Team ids by side for sim shapes that carry a side and no game id (a lone Decision). */
  readonly sideTeams?: readonly [number, number] | null;
}

export interface OwnerScope {
  /** `node` is the value at the scoped path, `row` the value the rule is attached to. */
  owners(node: any, row: any, env: OwnerEnv): Owners;
  /** Remove the node itself, not only its private fields, for anyone but an owner. */
  hideUnlessOwner?: boolean;
}

export interface OwnerRule {
  owners(row: any, env: OwnerEnv): Owners;
  /** Remove the whole row for anyone but an owner (its existence is private). */
  hideUnlessOwner?: boolean;
  /** Relative path (`calls.snapping`, `candidates[]`) to a narrower owner. */
  scopes?: Readonly<Record<string, OwnerScope>>;
  /** Relative path to a stricter class than the contract states. May only tighten. */
  tighten?: Readonly<Record<string, Visibility>>;
}

const team = (teamId: number | null | undefined, scope: TeamScope | string) => ({ teamId, scope });
const teamsOf = (env: OwnerEnv, personId: number, scope: TeamScope) => env.lookup.teamsOfPerson(personId).map((t) => team(t, scope));
const sideTeam = (env: OwnerEnv, gameId: number | undefined, side: unknown): number | null => {
  const pair = (gameId !== undefined ? env.lookup.gameTeams(gameId) : null) ?? env.sideTeams ?? null;
  return pair && (side === 0 || side === 1) ? pair[side] : null;
};

const RULES = new Map<object, OwnerRule>();

/** Attaches a rule to a shape. Other packages register rules for their own content shapes here. */
export function registerOwnerRule(schema: Schema, rule: OwnerRule): void {
  const key = shapeKey(schema);
  if (!key) throw new Error('observer: owner rules attach to object schemas');
  if (RULES.has(key)) throw new Error('observer: this shape already has an owner rule');
  RULES.set(key, rule);
}

export function ownerRuleOf(inner: Schema): OwnerRule | undefined {
  const key = shapeKey(inner);
  return key ? RULES.get(key) : undefined;
}

// --- World contract shapes -------------------------------------------------------------------

// A person's file: himself, and the executives or final-say seats of the teams he works for.
registerOwnerRule(PersonRecord, { owners: (p, env) => ({ personIds: [p.id], teams: teamsOf(env, p.id, 'staff_file') }) });

// A person view belongs to the organisation or the person that formed it (P3.2.3). Others do not learn it exists.
registerOwnerRule(PersonView, {
  owners: (v) => ({ personIds: [v.observerPersonId], teams: [team(v.observerTeamId, 'evaluation')] }),
  hideUnlessOwner: true,
});
registerOwnerRule(ObservedPlayer, { owners: (v) => ({ teams: [team(v.observerTeamId, 'evaluation')] }), hideUnlessOwner: true });

registerOwnerRule(TeamRecord, { owners: (t) => ({ teams: [team(t.id, 'governance')] }) });
registerOwnerRule(CultureRecord, { owners: (c) => ({ teams: [team(c.teamId, 'governance')] }) });

// The medical staff's stated range: the injured person and the medical side of his teams (D11, H5).
registerOwnerRule(InjuryRecord, { owners: (i, env) => ({ personIds: [i.personId], teams: teamsOf(env, i.personId, 'medical') }) });

// A prospect row holds one line per team. A team reads its own line and does not see the others.
registerOwnerRule(ProspectRecord, {
  owners: (p) => ({ teams: (p.teams as { teamId: number }[]).map((t) => team(t.teamId, 'evaluation')) }),
});
registerOwnerRule(ProspectTeamState, { owners: (t) => ({ teams: [team(t.teamId, 'evaluation')] }), hideUnlessOwner: true });

// Contract terms marked private are known to the parties (W-14): the person, his agent, the club side.
registerOwnerRule(ContractRecord, { owners: (c) => ({ personIds: [c.personId, c.agentId], teams: [team(c.teamId, 'contracts')] }) });

// An event is seen by its witnesses and by the people who acted in it (W-16, X2.1.2).
registerOwnerRule(WorldEvent, {
  hideUnlessOwner: true,
  owners: (e) => {
    const actors = (e.actors as { personId: number }[]).map((a) => a.personId);
    const w = e.witnesses as { kind: string; teamId?: number; roomKey?: string; personIds?: number[] };
    switch (w.kind) {
      case 'public': return { everyone: true };
      case 'team': return { personIds: actors, teams: [team(w.teamId, 'team')] };
      case 'room': return { personIds: actors, teams: [team(w.teamId, roomScope(w.roomKey ?? ''))] };
      case 'people': return { personIds: [...actors, ...(w.personIds ?? [])] };
      default: return { personIds: actors };
    }
  },
});

registerOwnerRule(PlayerPlayGrade, {
  owners: (g) => ({ personIds: [g.graderPersonId], teams: [team(g.graderTeamId, 'evaluation')] }),
  hideUnlessOwner: true,
});
registerOwnerRule(SuggestionRecord, { owners: (s) => ({ personIds: [s.actorPersonId, s.ownerPersonId] }), hideUnlessOwner: true });

// A search: the hiring team reads the whole list; a candidate reads his own line.
registerOwnerRule(JobOpening, {
  owners: (o) => ({ personIds: (o.candidates as { personId: number }[]).map((c) => c.personId), teams: [team(o.teamId, 'hiring')] }),
  scopes: {
    'candidates[]': { owners: (c, o) => ({ personIds: [c.personId], teams: [team(o.teamId, 'hiring')] }), hideUnlessOwner: true },
  },
});

// Money, household, inbox, evaluations: personal.
registerOwnerRule(LedgerEntry, { owners: (l) => ({ personIds: [l.personId] }), hideUnlessOwner: true });
registerOwnerRule(BalanceSheet, { owners: (b) => ({ personIds: [b.personId] }), hideUnlessOwner: true });
registerOwnerRule(HouseholdRecord, {
  owners: (h) => ({ personIds: [h.headPersonId, ...(h.members as { personId: number }[]).map((m) => m.personId)] }),
  hideUnlessOwner: true,
});
registerOwnerRule(InboxItem, { owners: (i) => ({ personIds: [i.ownerPersonId] }), hideUnlessOwner: true });
registerOwnerRule(EvaluationRecord, { owners: (e) => ({ personIds: [e.byPersonId, e.aboutPersonId] }), hideUnlessOwner: true });

// A coach's written philosophy and team rules: himself and the teams he tells them to.
registerOwnerRule(PhilosophyRecord, { owners: (p, env) => ({ personIds: [p.personId], teams: teamsOf(env, p.personId, 'team') }) });

// --- Sim contract shapes ---------------------------------------------------------------------

// A call's private parts (play id, protection, tags, coverage, pressure) belong to the side that made it.
registerOwnerRule(PlayRecord, {
  owners: () => NOBODY,
  scopes: {
    'calls.snapping': { owners: (_c, r, env) => ({ teams: [team(sideTeam(env, r.gameId, r.situation?.offense), 'team')] }) },
    'calls.opposing': {
      owners: (_c, r, env) => {
        const off = r.situation?.offense;
        return { teams: [team(sideTeam(env, r.gameId, off === 0 ? 1 : off === 1 ? 0 : null), 'team')] };
      },
    },
    'decisions[]': { owners: (d, r, env) => ({ teams: [team(sideTeam(env, r.gameId, d.side), 'team')] }) },
  },
});
registerOwnerRule(Decision, { owners: (d, env) => ({ teams: [team(sideTeam(env, undefined, d.side), 'team')] }) });

// The sim contract marks the game seed public on GameState. A seed predicts outcomes (W-12), so the
// filter treats it as truth until the contract is corrected (request CR-G27-1).
registerOwnerRule(GameState, { owners: () => NOBODY, tighten: { seedHex: 'truth' } });

/** Scope path of a JobOpening candidate line, exported for the whitelist test. */
export const JOB_OPENING_CANDIDATE = schemaAt(JobOpening, 'candidates', '[]');
