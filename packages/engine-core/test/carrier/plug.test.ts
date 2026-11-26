// The carrier as a tick-resolver plug (WP-23 ports): it replaces the stand-in, keeps every structural
// promise of the truth record and is deterministic. FIXTURE units, so this checks the wiring only.
import { describe, expect, it } from 'vitest';
import { playTruthProblems, type ParamTable } from '@gm/schema';
import { lang } from '@gm/football-lang';
import { PARAMS as BALL_PARAMS } from '../../src/ball/index.ts';
import { PARAMS as CARRIER_PARAMS, carrierPlug, CARRIER_VERSION } from '../../src/carrier/index.ts';
import { PARAMS as CONTEST_PARAMS } from '../../src/contest/index.ts';
import { PARAMS as FIELD_PARAMS } from '../../src/field/index.ts';
import { PARAMS as KIN_PARAMS } from '../../src/kinematics/index.ts';
import { PARAMS as PERCEPTION_PARAMS } from '../../src/perception/index.ts';
import { PARAMS as AI_PARAMS } from '../../src/player-ai/index.ts';
import { PARAMS as PRESNAP_PARAMS } from '../../src/presnap/index.ts';
import { paramTableFromFiles } from '../../src/tick/index.ts';
import { PARAMS as RESOLVER_PARAMS, createTickResolver } from '../../src/tick-resolver/index.ts';
import { CONTENT, playInput, type Kind } from '../tick-resolver/support.ts';

const TABLE: ParamTable = paramTableFromFiles([
  FIELD_PARAMS, KIN_PARAMS, PERCEPTION_PARAMS, PRESNAP_PARAMS, AI_PARAMS, BALL_PARAMS, CONTEST_PARAMS, RESOLVER_PARAMS, CARRIER_PARAMS, ...lang.PARAM_FILES,
]);
const KINDS: readonly Kind[] = ['pass', 'run', 'punt', 'kickoff', 'onside_kick', 'fair_catch_kick'];

describe('carrier plug in the tick resolver', () => {
  const resolver = createTickResolver({ content: CONTENT, plugs: [carrierPlug()] });
  it('replaces the carrier stand-in and reports its version', () => {
    expect(resolver.report.standIns).not.toContain('carrier');
    expect(resolver.report.moduleVersions['carrier']).toBe(CARRIER_VERSION);
  });
  it('keeps the truth record valid and is deterministic on seeded plays of several kinds', () => {
    for (const kind of KINDS) for (let seed = 1; seed <= 8; seed++) {
      const input = () => playInput({ kind, seed, playNumber: seed, params: TABLE, attackDir: seed % 2 === 0 ? 1 : -1 });
      const a = resolver.simulatePlay(input()), b = resolver.simulatePlay(input());
      expect(playTruthProblems(a.truth), `${kind} seed ${seed}`).toEqual([]);
      expect(JSON.stringify(a.truth)).toBe(JSON.stringify(b.truth));
    }
  }, 120_000);
});
