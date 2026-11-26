// N2.4.1 decision chart and two-point chart on the bootstrap win probability model (G-07). The staff
// estimates here are test values, not facts.
import { describe, it, expect } from 'vitest';
import { MATH, baselineWp, fixtureRules } from '../helpers/fixtures.ts';
import {
  buildDecisionChart, chartCell, chartRuleValues, editLog, neutralBase, fourthDownOutcomes,
  type ChartEstimates, type ChartEdit,
} from '../../src/strength/index.ts';

const rules = chartRuleValues(fixtureRules({ 'try.kick_points': 1, 'try.two_point_points': 2, 'series.yards_to_gain': 10, 'field.goal_to_goal_yd': 100, 'fg.miss_spot_min_yardline': 20 }));
const model = baselineWp();
const base = neutralBase(3, 0, false);

/** A kicker who makes everything inside `range` yards of kick distance at a falling rate. Kick distance = LOS + 17. */
function estimates(range: number): ChartEstimates {
  return {
    convert: (d) => (d <= 1 ? 0.7 : d <= 3 ? 0.55 : d <= 6 ? 0.42 : 0.3),
    fieldGoal: (ytg) => { const k = ytg + 17; return k > range ? 0 : k <= 30 ? 0.97 : 0.97 - (k - 30) * 0.012; },
    missedFieldGoalSpot: (ytg) => 100 - (ytg + 7),
    punt: (ytg) => (ytg < 35 ? null : Math.max(20, 100 - (ytg - 42))),
    kickTry: 0.95,
    twoPoint: 0.48,
  };
}

describe('N2.4.1 decision chart', () => {
  const chart = buildDecisionChart(model, base, rules, estimates(55), [], MATH);

  it('rule 1: every yard line by every distance up to the maximum, with the margin in win probability', () => {
    expect(chart.cells.length).toBe(99 * 15 - (15 * 14) / 2);
    for (const c of chart.cells) {
      expect(c.margin).toBeGreaterThanOrEqual(0);
      expect(c.options.length).toBeGreaterThan(0);
    }
  });

  it('acceptance 2: every cell marked go has a go win probability at least as high as the other options', () => {
    const go = chart.cells.filter((c) => c.approved === 'go');
    expect(go.length).toBeGreaterThan(0);
    for (const c of go) {
      const g = c.options.find((o) => o.option === 'go')!.wp;
      for (const o of c.options) expect(g).toBeGreaterThanOrEqual(o.wp);
    }
  });

  it('acceptance 1: cutting the kicker’s range by 5 yards flips the field goal cells at the edge of range', () => {
    const short = buildDecisionChart(model, base, rules, estimates(50), [], MATH);
    const flipped = chart.cells.filter((c, i) => c.model === 'field_goal' && short.cells[i]!.model !== 'field_goal');
    expect(flipped.length).toBeGreaterThan(0);
    for (const c of flipped) expect(c.yardsToGoalYd + 17).toBeGreaterThan(50);
  });

  it('rule 2: a cell whose margin is under 1 point is a coach’s call; a big edge is not', () => {
    for (const c of chart.cells) if (c.margin < 0.01) expect(c.coachsCall).toBe(true);
    const fourthAndOneAtGoal = chart.cells.find((c) => c.yardsToGoalYd === 1 && c.distanceYd === 1)!;
    expect(fourthAndOneAtGoal.model).toBe('go');
    const deep = chart.cells.find((c) => c.yardsToGoalYd === 90 && c.distanceYd === 15)!;
    expect(deep.model).toBe('punt');
    const firm = chart.cells.filter((c) => !c.coachsCall);
    expect(firm.length).toBeGreaterThan(0);
    for (const c of firm) expect(c.margin).toBeGreaterThanOrEqual(0.01);
  });

  it('rules 3 and 4: edits are offsets, kept by the live recomputation with the real score and clock; acceptance 3: each edit is logged with its reason', () => {
    const edit: ChartEdit = { id: 'e1', region: { minYardsToGoal: 40, maxYardsToGoal: 60, minDistance: 1, maxDistance: 4 }, option: 'go', offsetWp: 0.05, reason: 'game_plan_aggression' };
    const edited = buildDecisionChart(model, base, rules, estimates(55), [edit], MATH);
    const changed = edited.cells.filter((c) => c.model !== c.approved);
    expect(changed.length).toBeGreaterThan(0);
    for (const c of changed) { expect(c.approved).toBe('go'); expect(c.yardsToGoalYd).toBeGreaterThanOrEqual(40); }
    const log = editLog(edited);
    expect(log).toEqual([{ decisionType: 'decision_chart_edit', editId: 'e1', option: 'go', offsetWp: 0.05, reason: 'game_plan_aggression', cellsChanged: changed.length }]);
    // Live: trailing late, the same edit still applies.
    const live = chartCell(model, { ...base, scoreDiff: -4, gameSecondsLeft: 300, halfSecondsLeft: 300 }, rules, estimates(55), 45, 4, [edit], MATH);
    expect(live.approved).toBe('go');
  });

  it('a field goal miss never gives the opponent the ball inside the minimum spot; out of range drops the kick column', () => {
    const outs = fourthDownOutcomes(base, rules, estimates(55), 30, 5);
    const miss = outs.field_goal![1]!;
    expect('state' in miss && miss.state.field.yardsToGoalYd).toBeLessThanOrEqual(80);
    expect(fourthDownOutcomes(base, rules, estimates(55), 60, 5).field_goal).toBeUndefined();
    expect(() => fourthDownOutcomes(base, rules, estimates(55), 3, 5)).toThrow();
  });

  it('the two-point chart covers every score difference and time, and prefers two when it gains', () => {
    expect(chart.twoPoint.length).toBe(31 * 6);
    for (const c of chart.twoPoint) {
      expect(c.choice === 'two' ? c.twoWp >= c.kickWp : c.kickWp >= c.twoWp).toBe(true);
    }
    // Down 2 points after the touchdown with 2 minutes left: tying matters more than leading by a point.
    const down2 = chart.twoPoint.find((c) => c.scoreDiffBeforeTry === -2 && c.gameSecondsLeft === 120)!;
    expect(down2.choice).toBe('two');
  });

  it('confidence marks come with every cell; output is deterministic', () => {
    for (const c of chart.cells.slice(0, 50)) expect(['solid', 'fair', 'thin']).toContain(c.confidence.mark);
    const again = buildDecisionChart(model, base, rules, estimates(55), [], MATH);
    expect(JSON.stringify(again.cells)).toBe(JSON.stringify(chart.cells));
  });
});
