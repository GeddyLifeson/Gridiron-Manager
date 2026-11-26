// The module plugged into the tick resolver (WP-23 port). The other two plugs stay stand-ins, so this
// checks wiring and the truth record's promises, not football outcomes.
import { describe, expect, it } from 'vitest';
import { playTruthProblems, type PlayInput, type RuleSet } from '@gm/schema';
import { PARAMS as FI_PARAMS, LIVE_FOULS, foulsInjuriesPlug } from '../../src/fouls-injuries/index.ts';
import { createTickResolver } from '../../src/tick-resolver/index.ts';
import { paramTableFromFiles } from '../../src/tick/index.ts';
import { CONTENT, RULES, playInput, type Kind } from '../tick-resolver/support.ts';
import { PARAMS as FIELD_PARAMS } from '../../src/field/index.ts';
import { PARAMS as KIN_PARAMS } from '../../src/kinematics/index.ts';
import { PARAMS as PERCEPTION_PARAMS } from '../../src/perception/index.ts';
import { PARAMS as AI_PARAMS } from '../../src/player-ai/index.ts';
import { PARAMS as PRESNAP_PARAMS } from '../../src/presnap/index.ts';
import { PARAMS as BALL_PARAMS } from '../../src/ball/index.ts';
import { PARAMS as CONTEST_PARAMS } from '../../src/contest/index.ts';
import { PARAMS as TR_PARAMS } from '../../src/tick-resolver/index.ts';
import { lang } from '@gm/football-lang';

const TABLE = paramTableFromFiles([FIELD_PARAMS, KIN_PARAMS, PERCEPTION_PARAMS, PRESNAP_PARAMS, AI_PARAMS, BALL_PARAMS, CONTEST_PARAMS, TR_PARAMS, FI_PARAMS, ...lang.PARAM_FILES]);
/** FIXTURE: the resolver's fixture rules plus every foul this module commits and its two keys. */
const extra: Record<string, number | boolean | string> = {
  'foul.ineligible_downfield.yards': 1, 'foul.low_block.rule': 'tight_end_box_only',
  // Player AI reads these once holding and interference exist (its deliberate-foul cost estimate).
  'foul.offensive_holding.yards': 10, 'foul.dpi.spot_foul': true, 'foul.dpi.yards': 0, 'foul.dpi.max_yards': 0, 'foul.dpi.afd': true,
};
for (const id of LIVE_FOULS) if (!(`foul.${id}.exists` in extra)) extra[`foul.${id}.exists`] = id !== 'targeting';
const WITH: RuleSet = {
  ...RULES, id: 'fixture_presnap_fi',
  num: (k) => (k in extra ? (extra[k] as number) : RULES.num(k)),
  bool: (k) => (k in extra ? (extra[k] as boolean) : RULES.bool(k)),
  opt: (k) => (k in extra ? (extra[k] as string) : RULES.opt(k)),
  keys: () => [...RULES.keys(), ...Object.keys(extra)],
};
const input = (kind: Kind, seed: number): PlayInput => ({ ...playInput({ kind, seed, playNumber: seed, params: TABLE }), rules: WITH });
const KINDS: readonly Kind[] = ['pass', 'run', 'punt', 'field_goal', 'kickoff'];

describe('fouls and injuries plugged into the tick resolver', () => {
  const resolver = createTickResolver({ content: CONTENT, plugs: [foulsInjuriesPlug()] });
  it('is no longer a stand-in', () => {
    expect(resolver.report.standIns).not.toContain('foulsInjuries');
    expect(resolver.report.moduleVersions['foulsInjuries']).toMatch(/^fouls-injuries-/);
  });
  const counts = new Map<string, number>();
  it('keeps every truth-record promise and is deterministic', () => {
    for (const kind of KINDS) for (let seed = 1; seed <= 12; seed++) {
      const a = resolver.simulatePlay(input(kind, seed)), b = resolver.simulatePlay(input(kind, seed));
      expect(playTruthProblems(a.truth), `${kind} ${seed}`).toEqual([]);
      expect(JSON.stringify(a.truth)).toBe(JSON.stringify(b.truth));
      for (const d of a.deltas) expect(d.hitLoad).toBeGreaterThanOrEqual(0);
      for (const e of a.truth.events) if (e.type === 'foul_committed' || e.type === 'injury') counts.set(e.type === 'injury' ? `injury:${e.mechanism}` : `${kind}:${e.foulId}`, (counts.get(e.type === 'injury' ? `injury:${e.mechanism}` : e.foulId) ?? 0) + 1);
    }
    if (process.env['GM_FI_RATES']) console.log(Object.fromEntries(counts));
  });
});
