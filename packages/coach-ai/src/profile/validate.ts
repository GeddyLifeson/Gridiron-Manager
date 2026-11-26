// Profile validator (K2.1.1 acceptance, K2.7.1 forbidden parameters, K2.1.4 rule 1 reader rule).
// Runs on plain data (a loaded save row or a content file), so it checks shape as well as names.
import { BEHAVIOR_KEYS, BEHAVIOR_READERS, DEFENSE_RATE_KEYS, EMPHASIS_KEYS, EMPHASIS_READERS, OFFENSE_RATE_KEYS, PERSONNEL_KEYS, SYSTEM_RATE_READERS, TENDENCY_KEYS, TENDENCY_READERS } from './keys.ts';
import { TEMPLATES } from './population.ts';

export interface ProfileProblem { readonly path: string; readonly rule: string; readonly message: string }

/**
 * K2.7.1 rules 1 to 5 as key patterns, applied to every key at every depth. Rule 6 (no reader) is
 * `checkReaders`. The fields of the record are fixed below, so an unlisted key also fails (strictness).
 */
export const PROFILE_FORBIDDEN_KEYS: readonly { re: RegExp; rule: string }[] = [
  { re: /foul|penalt|fumble|discipline/i, rule: 'K2.7.1 rule 1: no field changes a foul or fumble rate' },
  { re: /tenure|sinceHired|honeymoon|yearsAtClub|newCoach/i, rule: 'K2.7.1 rule 2: no result modifier keyed to time since hire' },
  { re: /points?$|^xp$|xp$|experience|^level$|level$|perk|unlock|skill|rating|overall|tree/i, rule: 'K2.7.1 rule 3: no point, experience, level, unlock, perk or overall value' },
  { re: /difficulty|handicap|slider/i, rule: 'K2.7.1 rule 4: no field read by a difficulty or handicap setting' },
  { re: /label|archetype|template|class$|reputation|descriptor|motivation/i, rule: 'K2.7.1 rule 5: no stored label, archetype or reputation number (K2.1.1 rule 3 and 4)' },
];

const TOP = ['personId', 'league', 'role', 'system', 'tendencies', 'behavior', 'memory', 'lineage', 'imported', 'version'];
const SYSTEM = ['primarySide', 'offenseFamily', 'defenseFamily', 'specialTeamsFamily', 'playbookId', 'personnelWeights', 'tempoBase', 'offenseRates', 'defenseRates', 'sheetSize'];
const TEMPO = ['huddleShare', 'noHuddleShare', 'snapAtPlayClockS'];
const SHEET = ['offenseCalls', 'defenseCalls'];
const MEMORY = ['opponentNotes', 'ownTendencyLog'];
const NOTE_ROW = ['bucket', 'observed', 'count', 'worked', 'lastSeason', 'lastWeek', 'weight'];
const LINEAGE_ROW = ['mentorId', 'seasons', 'lastSeason'];
const LEAGUES = ['pro', 'college'];
const ROLES = ['headCoach', 'offensiveCoordinator', 'defensiveCoordinator', 'specialTeamsCoordinator', 'positionCoach'];
const SIDES = ['offense', 'defense', 'specialTeams'];
const TEMPLATE_IDS = new Set(TEMPLATES.map((t) => t.id));

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function scanKeys(x: unknown, path: string, out: ProfileProblem[]): void {
  if (Array.isArray(x)) { x.forEach((v, i) => scanKeys(v, `${path}[${i}]`, out)); return; }
  if (typeof x === 'string' && TEMPLATE_IDS.has(x)) out.push({ path, rule: 'K2.2.1 rule 2', message: `template name "${x}" stored on a person` });
  if (!isObj(x)) return;
  for (const [k, v] of Object.entries(x)) {
    // Opponent-note maps are keyed by person ids, not field names.
    if (!path.endsWith('.opponentNotes')) for (const f of PROFILE_FORBIDDEN_KEYS) if (f.re.test(k)) out.push({ path: `${path}.${k}`, rule: f.rule, message: `forbidden key ${k}` });
    scanKeys(v, `${path}.${k}`, out);
  }
}

function exactKeys(x: unknown, keys: readonly string[], path: string, out: ProfileProblem[]): x is Record<string, unknown> {
  if (!isObj(x)) { out.push({ path, rule: 'K2.1.1 shape', message: 'expected an object' }); return false; }
  for (const k of Object.keys(x)) if (!keys.includes(k)) out.push({ path: `${path}.${k}`, rule: 'K2.1.1 shape', message: `unknown field ${k}` });
  for (const k of keys) if (!(k in x)) out.push({ path: `${path}.${k}`, rule: 'K2.1.1 shape', message: `missing field ${k}` });
  return true;
}

function share(x: unknown, path: string, out: ProfileProblem[]): void {
  if (!isNum(x) || x < 0 || x > 1) out.push({ path, rule: 'K2.1.2 shares', message: `share must be a number in 0 to 1, got ${String(x)}` });
}

function finite(x: unknown, path: string, out: ProfileProblem[], lo = -10, hi = 10): void {
  if (!isNum(x) || x < lo || x > hi) out.push({ path, rule: 'K2.1 numbers', message: `number in ${lo} to ${hi} expected, got ${String(x)}` });
}

/** Returns every problem; an empty list means the profile is valid. */
export function validateCoachProfile(p: unknown): ProfileProblem[] {
  const out: ProfileProblem[] = [];
  scanKeys(p, '$', out);
  if (!exactKeys(p, TOP, '$', out)) return out;
  if (typeof p.personId !== 'string' || !p.personId) out.push({ path: '$.personId', rule: 'K2.1.1 shape', message: 'personId must be a non-empty string' });
  if (!LEAGUES.includes(p.league as string)) out.push({ path: '$.league', rule: 'K2.1.1 shape', message: 'unknown league' });
  if (!ROLES.includes(p.role as string)) out.push({ path: '$.role', rule: 'K2.6.1', message: 'unknown role' });
  if (typeof p.imported !== 'boolean') out.push({ path: '$.imported', rule: 'K2.2.2', message: 'imported must be boolean' });
  if (!Number.isInteger(p.version) || (p.version as number) < 1) out.push({ path: '$.version', rule: 'K2.1.1 shape', message: 'version must be a positive integer' });

  const s = p.system;
  if (exactKeys(s, SYSTEM, '$.system', out)) {
    if (!SIDES.includes(s.primarySide as string)) out.push({ path: '$.system.primarySide', rule: 'K2.1.2', message: 'unknown side' });
    for (const k of ['offenseFamily', 'defenseFamily', 'specialTeamsFamily']) if (typeof s[k] !== 'string' || !(s[k] as string).startsWith('family.')) out.push({ path: `$.system.${k}`, rule: 'K2.1.2 rule 3', message: 'family must be a content id' });
    if (s.playbookId !== null && typeof s.playbookId !== 'string') out.push({ path: '$.system.playbookId', rule: 'K2.1.2', message: 'playbookId must be a content id or null' });
    if (exactKeys(s.personnelWeights, PERSONNEL_KEYS, '$.system.personnelWeights', out)) {
      let sum = 0;
      for (const k of PERSONNEL_KEYS) { const v = (s.personnelWeights as Record<string, unknown>)[k]; share(v, `$.system.personnelWeights.${k}`, out); if (isNum(v)) sum += v; }
      if (Math.abs(sum - 1) > 1e-6) out.push({ path: '$.system.personnelWeights', rule: 'K2.1.2', message: `personnel shares sum to ${sum}, not 1` });
    }
    if (exactKeys(s.tempoBase, TEMPO, '$.system.tempoBase', out)) {
      const t = s.tempoBase as Record<string, unknown>;
      share(t.huddleShare, '$.system.tempoBase.huddleShare', out);
      share(t.noHuddleShare, '$.system.tempoBase.noHuddleShare', out);
      if (isNum(t.huddleShare) && isNum(t.noHuddleShare) && Math.abs(t.huddleShare + t.noHuddleShare - 1) > 1e-9) out.push({ path: '$.system.tempoBase', rule: 'K2.1.2', message: 'huddle and no-huddle shares must sum to 1' });
      finite(t.snapAtPlayClockS, '$.system.tempoBase.snapAtPlayClockS', out, 0, 40);
    }
    if (exactKeys(s.offenseRates, OFFENSE_RATE_KEYS, '$.system.offenseRates', out)) for (const k of OFFENSE_RATE_KEYS) share((s.offenseRates as Record<string, unknown>)[k], `$.system.offenseRates.${k}`, out);
    if (exactKeys(s.defenseRates, DEFENSE_RATE_KEYS, '$.system.defenseRates', out)) for (const k of DEFENSE_RATE_KEYS) share((s.defenseRates as Record<string, unknown>)[k], `$.system.defenseRates.${k}`, out);
    if (exactKeys(s.sheetSize, SHEET, '$.system.sheetSize', out)) for (const k of SHEET) finite((s.sheetSize as Record<string, unknown>)[k], `$.system.sheetSize.${k}`, out, 1, 1000);
  }
  if (exactKeys(p.tendencies, [...TENDENCY_KEYS, 'emphasis'], '$.tendencies', out)) {
    for (const k of TENDENCY_KEYS) finite((p.tendencies as Record<string, unknown>)[k], `$.tendencies.${k}`, out, -20, 20);
    const e = (p.tendencies as Record<string, unknown>).emphasis;
    if (exactKeys(e, EMPHASIS_KEYS, '$.tendencies.emphasis', out)) for (const k of EMPHASIS_KEYS) finite((e as Record<string, unknown>)[k], `$.tendencies.emphasis.${k}`, out, -1, 1);
  }
  if (exactKeys(p.behavior, BEHAVIOR_KEYS, '$.behavior', out)) for (const k of BEHAVIOR_KEYS) finite((p.behavior as Record<string, unknown>)[k], `$.behavior.${k}`, out, -6, 6);
  if (exactKeys(p.memory, MEMORY, '$.memory', out)) {
    const m = p.memory as Record<string, unknown>;
    if (m.ownTendencyLog !== null && typeof m.ownTendencyLog !== 'string') out.push({ path: '$.memory.ownTendencyLog', rule: 'K2.1.5', message: 'pointer must be a string or null' });
    if (isObj(m.opponentNotes)) {
      for (const [caller, rows] of Object.entries(m.opponentNotes)) {
        if (!Array.isArray(rows)) { out.push({ path: `$.memory.opponentNotes.${caller}`, rule: 'K2.1.5', message: 'rows must be a list' }); continue; }
        rows.forEach((r, i) => exactKeys(r, NOTE_ROW, `$.memory.opponentNotes.${caller}[${i}]`, out));
      }
    } else out.push({ path: '$.memory.opponentNotes', rule: 'K2.1.5', message: 'expected a map keyed by caller id' });
  }
  if (exactKeys(p.lineage, ['mentors'], '$.lineage', out)) {
    const ms = (p.lineage as Record<string, unknown>).mentors;
    if (Array.isArray(ms)) ms.forEach((r, i) => exactKeys(r, LINEAGE_ROW, `$.lineage.mentors[${i}]`, out));
    else out.push({ path: '$.lineage.mentors', rule: 'K2.5.2', message: 'expected a list' });
  }
  return out;
}

/** K2.1.4 rule 1 and K2.7.1 rule 6: every parameter has a reader. Returns the parameters without one. */
export function checkReaders(): string[] {
  const missing: string[] = [];
  for (const k of BEHAVIOR_KEYS) if (!BEHAVIOR_READERS[k]?.length) missing.push(`behavior.${k}`);
  for (const k of TENDENCY_KEYS) if (!TENDENCY_READERS[k]?.length) missing.push(`tendencies.${k}`);
  if (!EMPHASIS_READERS.length) missing.push('tendencies.emphasis');
  if (!SYSTEM_RATE_READERS.length) missing.push('system rates');
  return missing;
}
