// World creation and calendar commands for the empty world (P3.2.1, C4). Pure core: commands in,
// new state and events out (P1.1.1, P1.1.3). Validation order per P1.3.1: schema, permission,
// football legality, state preconditions.
import {
  WorldState, commandSpec, CreateWorldPayload, AdvanceDayPayload, RenameCompetitionPayload,
  type CommandEnvelope,
} from '@gm/schema';
import { RULE_SET_FILES, LEAGUE_RULES_IDS } from '@gm/rules-data';

export const WORLD_FORMAT_VERSION = 1;
/** Day indexes in a calendar year (C4 owns the real calendar; phase 0 needs only a counter). */
export const DAYS_PER_YEAR = 365;

export interface WorldEvent { readonly type: string; readonly detail: string }

export type ApplyResult =
  | { ok: true; world: WorldState; events: WorldEvent[] }
  | { ok: false; reason: string; code: 'schema' | 'permission' | 'legality' | 'precondition' | 'unknown' };

export function emptyWorld(): WorldState {
  return {
    formatVersion: WORLD_FORMAT_VERSION,
    masterSeedHex: '0000000000000000',
    calendar: { seasonYear: 0, dayIndex: 0 },
    competitions: [],
    teams: [],
    people: [],
    nextIds: { competition: 1, team: 1, person: 1 },
    userPersonId: null,
  };
}

function reject(code: Exclude<ApplyResult, { ok: true }>['code'], reason: string): ApplyResult {
  return { ok: false, code, reason };
}

export function applyCommand(world: WorldState, cmd: CommandEnvelope): ApplyResult {
  const spec = commandSpec(cmd.type);
  if (!spec) return reject('unknown', `no such command: ${cmd.type}`);
  const parsed = spec.payload.safeParse(cmd.payload);
  if (!parsed.success) return reject('schema', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  // Permission (S3): phase 0 has system actors only. A real job table arrives with S3 in phase 6.
  if (cmd.actor.job !== 'system' && spec.task.startsWith('system.')) return reject('permission', `${cmd.actor.job} does not own ${spec.task}`);

  switch (cmd.type) {
    case 'CreateWorld': {
      const p = parsed.data as ReturnType<typeof CreateWorldPayload.parse>;
      if (world.competitions.length > 0) return reject('precondition', 'the world already exists');
      const next: WorldState = { ...emptyWorld(), masterSeedHex: p.masterSeedHex, calendar: { seasonYear: p.startSeasonYear, dayIndex: 0 } };
      let id = 1;
      for (const c of p.competitions) {
        const rs = RULE_SET_FILES.find((f) => f.ruleset_id === c.ruleSetId);
        if (!rs) return reject('legality', `unknown rule set ${c.ruleSetId}`);
        if (rs.level !== c.level) return reject('legality', `rule set ${c.ruleSetId} is for ${rs.level} competitions`);
        if (!(LEAGUE_RULES_IDS as readonly string[]).includes(c.leagueRulesId)) return reject('legality', `unknown league rules ${c.leagueRulesId}`);
        next.competitions.push({ id: id++, name: c.name, level: c.level, ruleSetId: c.ruleSetId, leagueRulesId: c.leagueRulesId, teamIds: [] });
      }
      next.nextIds = { competition: id, team: 1, person: 1 };
      return { ok: true, world: WorldState.parse(next), events: [{ type: 'worldCreated', detail: `${next.competitions.length} competitions` }] };
    }
    case 'AdvanceDay': {
      const p = parsed.data as ReturnType<typeof AdvanceDayPayload.parse>;
      if (world.competitions.length === 0) return reject('precondition', 'create a world first');
      let { seasonYear, dayIndex } = world.calendar;
      dayIndex += p.days;
      const events: WorldEvent[] = [];
      while (dayIndex >= DAYS_PER_YEAR) { dayIndex -= DAYS_PER_YEAR; seasonYear += 1; events.push({ type: 'newYear', detail: String(seasonYear) }); }
      events.push({ type: 'dayAdvanced', detail: `${p.days}` });
      return { ok: true, world: { ...world, calendar: { seasonYear, dayIndex } }, events };
    }
    case 'RenameCompetition': {
      const p = parsed.data as ReturnType<typeof RenameCompetitionPayload.parse>;
      const c = world.competitions.find((x) => x.id === p.competitionId);
      if (!c) return reject('precondition', `no competition ${p.competitionId}`);
      return { ok: true, world: { ...world, competitions: world.competitions.map((x) => (x.id === c.id ? { ...x, name: p.name } : x)) }, events: [{ type: 'renamed', detail: p.name }] };
    }
    default:
      return reject('unknown', `command ${cmd.type} has no handler`);
  }
}

/** True when the command advances time, which makes it a checkpoint for the hash chain (P5.3.2). */
export function isCheckpoint(type: string): boolean {
  return type === 'CreateWorld' || type === 'AdvanceDay';
}
