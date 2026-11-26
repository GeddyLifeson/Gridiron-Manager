// Fit the bootstrap expected points and win probability models from prepared nflverse rows, and write
// the held-out report. Usage (from the repo root):
//   npx tsx packages/models/test/nflverse/fit.ts <train.csv from prepare.py>
// Trains on the 2022 and 2023 regular seasons and holds out 2024. Deterministic: two runs on the same
// file write byte-identical outputs (the determinism test checks the fit routine itself).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DMATH } from '@gm/engine-core';
import { resolveRuleSet } from '@gm/rules-data';
import { fitEpModel, loadEpModel, ep, epProbabilities, NEXT_SCORE_CLASSES, type EpState, type EpTrainingRow } from '../../src/ep/index.ts';
import { fitWpModel, loadWpModel, wp, calibrationBands, type WpState, type WpTrainingRow } from '../../src/wp/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) { console.error('usage: fit.ts <train.csv>'); process.exit(2); }
const TRAIN = new Set([2022, 2023]);
const HOLDOUT = 2024;

interface Raw {
  season: number; half: number; ot: number; gameS: number; halfS: number; down: number; dist: number; yd: number;
  toOff: number; toDef: number; score: number; home: number; rec2h: number; spread: number; kickoff: number;
  cls: number; won: number; nflEp: number; nflWp: number; playType: string;
}
const lines = readFileSync(src, 'utf8').trim().split('\n');
const head = lines[0]!.split(',');
const col = (n: string) => { const i = head.indexOf(n); if (i < 0) throw new Error(`missing column ${n}`); return i; };
const C = {
  season: col('season'), half: col('half'), ot: col('ot'), gameS: col('game_seconds_remaining'), halfS: col('half_seconds_remaining'),
  down: col('down'), dist: col('ydstogo'), yd: col('yardline_100'), toOff: col('posteam_timeouts_remaining'), toDef: col('defteam_timeouts_remaining'),
  score: col('score_differential'), home: col('home'), rec2h: col('rec2h'), spread: col('spread'), kickoff: col('kickoff'),
  cls: col('cls'), won: col('won'), ep: col('ep'), wp: col('wp'), playType: col('play_type'),
};
const raws: Raw[] = lines.slice(1).map((l) => {
  const f = l.split(',');
  const n = (i: number) => (f[i] === '' || f[i] === undefined ? Number.NaN : Number(f[i]));
  return {
    season: n(C.season), half: n(C.half), ot: n(C.ot), gameS: n(C.gameS), halfS: n(C.halfS), down: n(C.down), dist: n(C.dist), yd: n(C.yd),
    toOff: n(C.toOff), toDef: n(C.toDef), score: n(C.score), home: n(C.home), rec2h: n(C.rec2h), spread: n(C.spread), kickoff: n(C.kickoff),
    cls: n(C.cls), won: n(C.won), nflEp: n(C.ep), nflWp: n(C.wp), playType: f[C.playType] ?? '',
  };
});

const epState = (r: Raw): EpState => ({
  kind: r.kickoff ? 'kickoff' : 'scrimmage', down: r.down, distanceYd: r.dist, yardsToGoalYd: r.yd,
  halfSecondsLeft: r.ot ? r.gameS : r.halfS, timeoutsOffense: r.toOff, timeoutsDefense: r.toDef, home: r.home === 1,
});
const wpState = (r: Raw): WpState => ({
  field: epState(r), scoreDiff: r.score, gameSecondsLeft: r.gameS, overtime: r.ot === 1, firstHalf: r.half === 1,
  receivesSecondHalfKickoff: r.rec2h === 1, pregameGap: r.spread,
});
// The expected points model is fitted on regulation halves only (overtime uses win probability only, N2.2.1 edge cases).
const epRows = (rs: Raw[]): EpTrainingRow[] => rs.filter((r) => !r.ot && r.halfS > 0).map((r) => ({ state: epState(r), nextScore: r.cls }));
const wpRows = (rs: Raw[]): WpTrainingRow[] => rs.map((r) => ({ state: wpState(r), result: r.won }));

const train = raws.filter((r) => TRAIN.has(r.season));
const hold = raws.filter((r) => r.season === HOLDOUT);
const tries = JSON.parse(readFileSync(`${src}.tries.json`, 'utf8')) as Record<string, { kicks: number; kicksGood: number; twoPoint: number; twoPointGood: number }>;
let tp = 0, tn = 0;
for (const y of TRAIN) { const t = tries[String(y)]!; tp += t.kicksGood + 2 * t.twoPointGood; tn += t.kicks + t.twoPoint; }
const tryValue = Math.round((tp / tn) * 1e4) / 1e4;

const rules = resolveRuleSet('pro_2026');
const dataHash = createHash('sha256').update(readFileSync(src)).digest('hex').slice(0, 16);
const trainedOn = `nflverse play-by-play, ${[...TRAIN].join(' and ')} regular seasons (prepare.py output sha256 ${dataHash}); bootstrap until engine batches exist`;

console.log(`train rows ${train.length}, holdout rows ${hold.length}, try value ${tryValue}`);
const epFile = fitEpModel(epRows(train), rules, { version: 'bootstrap-nflverse-2022-2023.1', trainedOn, tryValue }, DMATH);
console.log(`ep fitted: scrimmage ${epFile.scrimmage.iterations} iterations (converged ${epFile.scrimmage.converged}), kickoff ${epFile.kickoff.iterations}`);
const epm = loadEpModel(epFile);
const wpFile = fitWpModel(wpRows(train), epm, rules, { version: 'bootstrap-nflverse-2022-2023.1', trainedOn }, DMATH);
console.log(`wp fitted: ${wpFile.iterations} iterations (converged ${wpFile.converged})`);
const wpm = loadWpModel(wpFile, epm);

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
/** Fact rows (facts/stats-models.json) for each published comparison number of the report. */
const FACT = { tryValue: 'F-model-0001', nflEp75: 'F-model-0002', nflEp50: 'F-model-0003', nflEp25: 'F-model-0004', nflWpBrier: 'F-model-0005' } as const;
const curveFact: Record<number, string> = { 75: FACT.nflEp75, 50: FACT.nflEp50, 25: FACT.nflEp25 };
// Check 1 (N2.2.1 acceptance): class shares by yard-line decile, held out and in sample. The bible's
// 1-point limit is set for engine fits on 20,000 games; a single real season is far smaller, so each gap
// is also given in units of its sampling standard error.
const decileTable = (rows: EpTrainingRow[]) => Array.from({ length: 10 }, (_, d) => {
  const rs = rows.filter((r) => r.state.kind === 'scrimmage' && Math.min(9, Math.floor((r.state.yardsToGoalYd - 1) / 10)) === d);
  const pred = new Array<number>(7).fill(0), obs = new Array<number>(7).fill(0);
  for (const r of rs) { const p = epProbabilities(epm, r.state, DMATH); for (let k = 0; k < 7; k++) pred[k]! += p[k]!; obs[r.nextScore]! += 1; }
  let maxGap = 0, maxZ = 0;
  for (let k = 0; k < 7; k++) {
    const pk = pred[k]! / rs.length, ok = obs[k]! / rs.length;
    const se = Math.sqrt(Math.max(pk * (1 - pk), 1e-9) / rs.length);
    maxGap = Math.max(maxGap, Math.abs(pk - ok)); maxZ = Math.max(maxZ, Math.abs(pk - ok) / se);
  }
  return { yardsToGoal: `${d * 10 + 1}-${d * 10 + 10}`, plays: rs.length, predicted: pred.map((p) => r4(p / rs.length)), observed: obs.map((o) => r4(o / rs.length)), maxGapPoints: r4(maxGap * 100), maxGapInSe: r4(maxZ) };
});
const he = epRows(hold).filter((r) => r.state.kind === 'scrimmage');
const deciles = decileTable(he);
const decilesInSample = decileTable(epRows(train)).map(({ yardsToGoal, plays, maxGapPoints, maxGapInSe }) => ({ yardsToGoal, plays, maxGapPoints, maxGapInSe }));
// Held-out check 2 (N2.2.2 acceptance): calibration bands.
const hw = wpRows(hold);
const preds = hw.map((r) => wp(wpm, r.state, DMATH).value);
const bands = calibrationBands(preds, hw.map((r) => r.result)).map((b) => ({ ...b, meanPredicted: r4(b.meanPredicted), observed: r4(b.observed), lo: r4(b.lo), hi: r4(b.hi) }));
const trw = wpRows(train);
const bandsInSample = calibrationBands(trw.map((r) => wp(wpm, r.state, DMATH).value), trw.map((r) => r.result)).map((b) => ({ lo: r4(b.lo), n: b.n, meanPredicted: r4(b.meanPredicted), observed: r4(b.observed) }));
const brier = (p: number[], y: number[]) => p.reduce((a, x, i) => a + (x - y[i]!) * (x - y[i]!), 0) / p.length;
const holdRaw = hold.filter((r) => Number.isFinite(r.nflWp));
const ourOnNfl = holdRaw.map((r) => wp(wpm, wpState(r), DMATH).value);
// Comparisons with the nflfastR columns in the same files (fact rows F-measured-rate-0001..).
const f10 = (yd: number) => ({ kind: 'scrimmage', down: 1, distanceYd: 10, yardsToGoalYd: yd, halfSecondsLeft: 1500, timeoutsOffense: 3, timeoutsDefense: 3, home: false }) as EpState;
// First and 10 at a yard line, more than 10 minutes left in the half, 2024 plays: our mean value, the
// nflfastR mean on the same plays, and the raw mean next-score points on them.
const epCurve = [99, 95, 90, 75, 50, 25, 10].map((yd) => {
  const xs = hold.filter((r) => !r.kickoff && !r.ot && r.down === 1 && r.dist === 10 && r.yd === yd && r.halfS > 600 && Number.isFinite(r.nflEp));
  const m = (f: (r: Raw) => number) => r4(xs.reduce((a, r) => a + f(r), 0) / xs.length);
  return { yardsToGoal: yd, plays: xs.length, nflfastrFact: curveFact[yd] ?? null, ours: m((r) => ep(epm, epState(r), DMATH).value), nflfastr: m((r) => r.nflEp), observedNextScore: m((r) => epFile.classValues[r.cls]!), fixedState: r4(ep(epm, f10(yd), DMATH).value) };
});
const scr = hold.filter((r) => !r.kickoff && !r.ot && r.halfS > 0 && Number.isFinite(r.nflEp));
const mad = scr.reduce((a, r) => a + Math.abs(ep(epm, epState(r), DMATH).value - r.nflEp), 0) / scr.length;

const report = {
  note: 'Bootstrap fit to real play-by-play. Comparison numbers cite facts/stats-models.json rows; the shipped model is replaced by fits to engine batches (N2.2.1 rule 1).',
  trainedOn, holdout: `${HOLDOUT} regular season`, tryValue, tryValueFact: FACT.tryValue,
  ep: { trainPlays: epFile.scrimmage.trainingPlays + epFile.kickoff.trainingPlays, holdoutPlays: he.length, classes: NEXT_SCORE_CLASSES, deciles, worstDecileGapPoints: Math.max(...deciles.map((d) => d.maxGapPoints)), worstDecileGapInSe: Math.max(...deciles.map((d) => d.maxGapInSe)), decilesInSample, worstInSampleGapPoints: Math.max(...decilesInSample.map((d) => d.maxGapPoints)), firstAndTen: epCurve, meanAbsDiffVsNflfastr: r4(mad) },
  wp: { trainPlays: wpFile.trainingPlays, holdoutPlays: hw.length, bands, bandsInSample, brier: r4(brier(preds, hw.map((r) => r.result))), brierNflfastrFact: FACT.nflWpBrier, brierNflfastrSameRows: r4(brier(holdRaw.map((r) => r.nflWp), holdRaw.map((r) => r.won))), brierOursSameRows: r4(brier(ourOnNfl, holdRaw.map((r) => r.won))) },
  modelHashes: {
    ep: createHash('sha256').update(JSON.stringify(epFile)).digest('hex'),
    wp: createHash('sha256').update(JSON.stringify(wpFile)).digest('hex'),
  },
};
writeFileSync(join(here, '../../src/ep/baseline-nflverse.json'), JSON.stringify(epFile) + '\n');
writeFileSync(join(here, '../../src/wp/baseline-nflverse.json'), JSON.stringify(wpFile) + '\n');
writeFileSync(join(here, 'report.json'), JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ worstDecileGap: report.ep.worstDecileGapPoints, firstAndTen: epCurve, mad: report.ep.meanAbsDiffVsNflfastr, brier: report.wp.brier, brierNfl: report.wp.brierNflfastrSameRows }, null, 1));
