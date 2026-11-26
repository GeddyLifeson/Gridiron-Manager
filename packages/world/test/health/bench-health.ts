// Bench: cost of the health step per season when games DO report injuries, on a small world with the test
// double game port plus a TEST DOUBLE injury report (NOT an injury rate: a load, `--per-team-game`
// injuries per team per game). Run: npx tsx packages/world/test/health/bench-health.ts --seasons=5 --per-team-game=2
import { readFileSync } from 'node:fs';
import { medical } from '@gm/league';
import { stream, seedFromHex } from '@gm/engine-core';
import { COLLEGE_LOOKUP, CONTENT, NAMES, PRO_LOOKUP, generation, loop, setup, testGamePort } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';
import * as health from '../../src/health/index.ts';

const arg = (k: string, d: string): string => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const SEASONS = Number(arg('seasons', '5'));
const PER = Number(arg('per-team-game', '2'));
const REGIONS = ['knee', 'ankle', 'hamstring', 'concussion', 'shoulder', 'foot', 'groin', 'calf', 'back', 'neck', 'quadriceps', 'hip', 'ribs', 'elbow', 'hand', 'toe'];

const s = setup({ seedHex: '0000000000001869', size: 'small' as generation.SizePreset, firstSeasonYear: 2021, historySeasons: SEASONS });
const w = loop.createWorld({ setup: s, content: CONTENT, names: NAMES, eventTypes: [...turnover.TURNOVER_EVENT_TYPES, ...health.HEALTH_EVENT_TYPES] });
const score = testGamePort();
const port: loop.GamePort = (req) => {
  const r = stream(seedFromHex(req.seedHex), 'bench.injury', []);
  const injuries: loop.GameInjury[] = [];
  for (const teamId of [req.game.homeTeamId, req.game.awayTeamId]) {
    const roster = req.world.rosters.get(teamId) ?? [];
    for (let k = 0; k < PER && roster.length; k++) {
      const region = REGIONS[r.int(0, REGIONS.length - 1)]!;
      injuries.push({ personId: roster[r.int(0, roster.length - 1)]!, teamId, mechanism: 'contact_lower', region, severitySeed: r.uniform(), headImpact: region === 'concussion', evaluationMissed: false });
    }
  }
  return { ...score(req), injuries };
};
const schedule = loop.historySchedule({
  regularGames: (c) => CONTENT.levels[c.level as 'pro' | 'college'].seasonGames,
  postseasonField: (c) => (c.level === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)('playoff.field_size'),
});
const rules = { pro: health.medicalRulesFrom('pro', PRO_LOOKUP).rules, college: health.medicalRulesFrom('college', COLLEGE_LOOKUP).rules };
const binding: health.HealthBinding = {
  catalogue: medical.catalogueFrom(JSON.parse(readFileSync(new URL('../../../football-content/data/injuries/catalogue.json', import.meta.url), 'utf8')).rows),
  rules: (l) => rules[l], levelOfTeam: (x, id) => turnover.levelOfTeam(x, id),
};
let ms = 0;
const step = health.healthStep(binding);
const sys = loop.systemsFrom({ games: loop.gamesStep(schedule, port), leaving: loop.leavingStep(), health: (ctx) => { const t = performance.now(); const r = step(ctx); ms += performance.now() - t; return r; } }, 'bench');
for (let i = 0; i < SEASONS; i++) {
  const t = performance.now(); ms = 0;
  const sum = loop.runSeason(w, sys, schedule);
  const h = health.healthOf(w);
  console.log(JSON.stringify({ season: sum.seasonYear, games: sum.games, healthMs: Math.round(ms), seasonMs: Math.round(performance.now() - t), opened: h.opened, open: h.cases.length, history: h.history.length, logRows: w.log.rows().length }));
}
