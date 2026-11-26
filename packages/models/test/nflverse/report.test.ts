// The bootstrap fit: the shipped model files are the ones the report describes, and every published
// comparison number in the report cites a fact row with the same value (G-07 acceptance).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FactFile, computeStatus } from '@gm/schema';
import { BASELINE_EP_MODEL, loadEpModel } from '../../src/ep/index.ts';
import { BASELINE_WP_MODEL, loadWpModel } from '../../src/wp/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const report = JSON.parse(readFileSync(join(here, 'report.json'), 'utf8'));
const facts = FactFile.parse(JSON.parse(readFileSync(join(here, '../../../../facts/stats-models.json'), 'utf8'))).rows;
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

describe('G-07 bootstrap models and report', () => {
  it('the shipped files are the fitted files the report describes, and they load', () => {
    expect(sha(BASELINE_EP_MODEL)).toBe(report.modelHashes.ep);
    expect(sha(BASELINE_WP_MODEL)).toBe(report.modelHashes.wp);
    const epm = loadEpModel(BASELINE_EP_MODEL);
    expect(() => loadWpModel(BASELINE_WP_MODEL, epm)).not.toThrow();
    expect(BASELINE_EP_MODEL.scrimmage.converged && BASELINE_EP_MODEL.kickoff.converged && BASELINE_WP_MODEL.converged).toBe(true);
    expect(BASELINE_EP_MODEL.ruleSetId).toBe('pro_2026');
  });

  it('every published comparison number cites a fact row with the same value; status is computed', () => {
    const byId = new Map(facts.map((f) => [f.id, f]));
    const cited: [string, number][] = [[report.tryValueFact, report.tryValue], [report.wp.brierNflfastrFact, report.wp.brierNflfastrSameRows]];
    for (const c of report.ep.firstAndTen) if (c.nflfastrFact) cited.push([c.nflfastrFact, c.nflfastr]);
    expect(cited.length).toBeGreaterThanOrEqual(5);
    for (const [id, value] of cited) {
      const row = byId.get(id);
      expect(row, id).toBeDefined();
      expect(row!.value, id).toBe(value);
      expect(row!.status).toBe(computeStatus(row!));
    }
    expect(BASELINE_EP_MODEL.tryValue).toBe(report.tryValue);
  });

  it('held-out sanity on real 2024 plays: monotone shape and in-sample class shares close to observed', () => {
    const curve = report.ep.firstAndTen.map((c: { ours: number }) => c.ours);
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThan(curve[i - 1]);
    expect(report.ep.worstInSampleGapPoints).toBeLessThan(2);
    expect(report.wp.brier).toBeLessThan(0.2);
  });
});
