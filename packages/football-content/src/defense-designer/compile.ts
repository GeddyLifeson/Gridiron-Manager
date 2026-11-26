// Compile a resolved call to the engine contract (J4): one Assignment per defender, in slot order, with the
// alignment as a play-frame spot plus the rule it came from. Behaviour and action names are the WP-10
// vocabulary's. Lateral flips once from authored right-positive to the play frame's left-positive (D-11).
import type { Action, Assignment, Condition, WhenClause } from '@gm/schema';
import { act, test } from '../starter/build.ts';
import { baseFits } from './analysis.ts';
import type { Defender, Resolution } from './resolve.ts';
import type { Align } from './types.ts';

const flip = (py: number): number => (py === 0 ? 0 : -py);
const w = (text: string, when: Condition, then: Action[]): WhenClause => ({ when, guard: null, then, text });
const DL = new Set(['DE', 'DT', 'NT']);

function ruleName(a: Align): string {
  switch (a.kind) {
    case 'tech': return `tech:${a.blocker}:${a.shade}:${a.side}`;
    case 'lb': return `lb:${a.gap}:${a.side}`;
    case 'overhang': return `overhang:${a.side}`;
    case 'rcv': return `rcv:${a.n}:${a.side}:${a.depthYd}:${a.leverage}`;
    case 'deep': return `deep:${a.side}:${a.depthYd}:${a.outsideHashYd}`;
    case 'spot': return 'spot';
  }
}

function one(d: Defender, res: Resolution): Assignment {
  const fit = baseFits(res).find((x) => x.slot === d.slot.id)?.job;
  const fitClause: WhenClause[] = fit && fit.kind === 'gap'
    ? [w(`Run read: fit the ${fit.side} ${fit.gap} gap`, test('read', { kind: 'run', dir: 'any' }), [act('switchBehavior', { to: 'runFit' }), act('fit', { gap: fit.gap, side: fit.side, shoulder: 'outside' })])]
    : fit && (fit.kind === 'force' || fit.kind === 'alley')
      ? [w(`Run read: ${fit.kind}`, test('read', { kind: 'run', dir: 'any' }), [act('switchBehavior', { to: 'runFit' }), act(fit.kind === 'force' ? 'contain' : 'fit', fit.kind === 'force' ? {} : { gap: 'alley', side: 'mine', shoulder: 'inside' })])]
      : [];
  let type = 'none';
  let params: Record<string, string | number | boolean> = {};
  let rules: WhenClause[] = [];
  let keys: string[] = ['qb'];
  let gaze = 'quarterback';
  const j = d.job;
  switch (j.kind) {
    case 'rush':
      type = DL.has(d.slot.pos) ? 'passRush' : 'blitz';
      params = { gap: j.gap, side: j.side, delayS: j.delayS };
      rules = [w(`Rush the ${j.side} ${j.gap} gap`, test('timeGt', { s: j.delayS }), [act('rush', { track: 'inside', plan: `${j.gap}Gap` })])];
      keys = ['nearestThreat']; gaze = 'key';
      break;
    case 'man': case 'bracket': {
      type = 'manCover';
      const target = j.target ?? 'none';
      params = j.kind === 'man' ? { man: target, technique: j.technique } : { man: target, bracket: j.part };
      rules = [w('Receiver crosses my face: stay with him', test('crossesFace', { target: 'man' }), [act('trail', { target: 'man' })]), w('Ball in the air to my man: play the ball', test('ballThrownToMyArea'), [act('breakOnBall')])];
      keys = [target]; gaze = 'man';
      break;
    }
    case 'zone':
      type = j.rect.d0 >= 10 ? 'deepZone' : 'zoneDrop';
      params = { zone: j.area, side: j.side ?? 'middle', y0: flip(j.rect.y1), y1: flip(j.rect.y0), d0: j.rect.d0, d1: j.rect.d1 };
      rules = [w('Receiver in my zone: play him', test('threatInZone'), [act('call', { name: 'threatInMyZone' })]), w('Ball thrown to my area: break on it', test('ballThrownToMyArea'), [act('breakOnBall')])];
      break;
    case 'spy':
      type = 'spy';
      rules = [w('Quarterback leaves the pocket: chase', test('qbOutOfPocket'), [act('pursue')])];
      break;
  }
  if (d.label !== null) params = { ...params, tech: d.label };
  return {
    role: d.slot.id,
    behavior: { type, params, path: [] },
    preSnap: { align: { px: d.px, py: flip(d.py), rule: ruleName(d.slot.align) }, onLine: d.onLine, stance: d.onLine ? 'threePoint' : 'twoPoint', motion: [] },
    rules: [...rules, ...fitClause],
    keys,
    gaze,
    technique: {},
    conceptId: `${res.coverage.id}`,
    teachingLoad: d.slot.load ?? 1,
    calls: [],
  };
}

/** G2.1.1 → J4: eleven assignments (one per slot) for the engine and the bench, in slot order. */
export function compileCall(res: Resolution): Assignment[] {
  return res.defenders.map((d) => one(d, res));
}
