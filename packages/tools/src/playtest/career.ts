// One playtest career. The career spine is the G-89 scripted run (rung 0 college nobody to a pro head job, one
// script per seed); each season it ran, the playtest works that season's duties through the app layer at the
// seat's level: the game plan, the game-day frame, game days through the console, and a season of calendar
// commands on the save, with a save round trip every few seasons and at the end. Areas not yet bound are probed
// once per career and reported (stages/coverage.ts).
import { careerRun } from '@gm/headless';
import { seedFromHex } from '@gm/engine-core';
import { OWNERS } from './owners.ts';
import { Recorder } from './recorder.ts';
import { coverage } from './stages/coverage.ts';
import { gameFrame } from './stages/game-frame.ts';
import { gamePlanWeek } from './stages/game-plan.ts';
import { playGameDay } from './stages/game-day.ts';
import { advanceSeason, openCareer, probeCommands, roundTrip, type SaveSession } from './stages/save.ts';
import type { CareerReport, PlaytestOptions } from './types.ts';

const PRO_HEAD_RUNG = 9;
const DAYS_PER_SEASON = 364;
const ROUND_TRIP_EVERY = 5;

export async function runPlaytestCareer(seedHex: string, o: PlaytestOptions): Promise<CareerReport> {
  const t0 = performance.now();
  const rec = new Recorder(seedHex);
  let save: SaveSession | null = null;
  let games = 0;
  let proHeadSeason: number | null = null;

  await rec.stage('save', OWNERS.saves, async () => { save = await openCareer(rec, o.saveDir); return 'career opened'; });
  if (save) await rec.stage('commands', OWNERS.schemaIntegrator, () => probeCommands(rec, save!.svc));
  await rec.stage('home', OWNERS.exportsIntegrator, () => coverage(rec));

  let run: careerRun.CareerRun | null = null;
  await rec.stage('career', OWNERS.careerRun, () => {
    const script = scriptFor(o);
    run = careerRun.runCareer(script, seedFromHex(seedHex));
    const again = careerRun.runCareer(script, seedFromHex(seedHex));
    if (again.hash !== run.hash) rec.add('invalid', 'career', 'career.not_deterministic', 'The same career script and seed gave two different careers.', OWNERS.careerRun);
    rec.add('missing', 'career', 'career.stand_in_seasons', 'Career seasons come from the G-89 stand-in model, not from played seasons: the world loop has no headless coach-season call (CR-G89-3), so game results here do not feed the coach\'s record, job security or offers.', `${OWNERS.careerRun} + ${OWNERS.worldLoop}`);
    return `${run.rows.length} seasons, final rung ${run.final.seat?.rung ?? 'none'} ${run.final.seat?.level ?? ''}`;
  });

  const rows = (run as careerRun.CareerRun | null)?.rows ?? [];
  let prevAge: number | null = null;
  for (const row of rows) {
    rec.season = row.season;
    if (prevAge !== null && row.age !== prevAge + 1) rec.add('invalid', 'career', 'career.age_step', `The coach aged from ${prevAge} to ${row.age} in one season.`, OWNERS.careerRun);
    prevAge = row.age;
    if (row.rung < 0 || row.rung > PRO_HEAD_RUNG) rec.add('invalid', 'career', 'career.rung_range', `Rung ${row.rung} is outside 0 to 9.`, OWNERS.careerRun);
    if (row.employed && row.level === null) rec.add('invalid', 'career', 'career.employed_no_level', 'An employed season has no level.', OWNERS.careerRun);
    if (row.employed && row.rung >= PRO_HEAD_RUNG && row.level === 'pro' && proHeadSeason === null) proHeadSeason = row.season;

    if (row.employed && row.level) {
      const ruleSetId = row.level === 'pro' ? 'pro_2026' : 'college_2026';
      await rec.stage('game_plan', OWNERS.gameplan, () => gamePlanWeek(rec, 7, 1));
      await rec.stage('game_frame', OWNERS.gameFrame, () => gameFrame(rec, ruleSetId));
      for (let g = 0; g < o.gamesPerSeason; g++) {
        const ok = await rec.stage('game_day', OWNERS.console, () => {
          const r = playGameDay(rec, ruleSetId, gameSeed(seedHex, row.season, g), row.season * 100 + g, o.maxStepsPerGame);
          return `${ruleSetId} ${r.score[0]}-${r.score[1]} in ${r.plays} plays, user side ${r.userSide}, ${r.final ? 'final' : 'NOT FINAL'}`;
        });
        if (ok) games++;
      }
    }
    if (save) {
      const s: SaveSession = save;
      await rec.stage('save', OWNERS.saves, async () => { await advanceSeason(rec, s.svc, DAYS_PER_SEASON); return `season ${row.season} advanced`; });
      if ((row.season + 1) % ROUND_TRIP_EVERY === 0) await rec.stage('save', OWNERS.saves, async () => { save = await roundTrip(rec, s); return 'save closed, reopened and replayed'; });
    }
  }
  rec.season = null;
  if (rows.length && proHeadSeason === null) rec.add('note', 'career', 'career.no_pro_head', `The scripted career did not reach a pro head job in ${rows.length} seasons.`, OWNERS.careerRun);
  if (save) {
    const s: SaveSession = save;
    await rec.stage('save', OWNERS.saves, async () => { const r = await roundTrip(rec, s); await r.svc.close(); await r.platform.deleteSave(r.name); return 'final round trip'; });
  }
  return {
    seedHex, script: o.script, reachedProHead: proHeadSeason !== null, proHeadSeason, seasons: rows.length, games,
    stages: rec.stages, findings: rec.findings, ms: Math.round(performance.now() - t0),
  };
}

/** The career script: the bottom-to-pro-head climb kept going for `headSeasons` as pro head coach, or a G-89 script. */
export function scriptFor(o: PlaytestOptions): careerRun.CareerScript {
  if (o.script === 'average_work') return careerRun.tuningScript(careerRun.averageWork(), o.seasons);
  if (o.script === 'fired_and_rehired') return careerRun.firedAndRehired(o.seasons);
  const base = careerRun.rung0ToProHead(o.seasons);
  return { ...base, stopWhen: (s) => s.seat !== null && s.seat.rung === PRO_HEAD_RUNG && s.seat.level === 'pro' && s.seat.seasonsInJob >= o.headSeasons };
}

/** A per-game seed derived from the career seed (hex, 16 digits). */
function gameSeed(seedHex: string, season: number, g: number): string {
  let h = BigInt(`0x${seedHex}`) ^ BigInt(season * 1009 + g * 7919 + 1);
  h = (h * 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
  return h.toString(16).padStart(16, '0');
}
