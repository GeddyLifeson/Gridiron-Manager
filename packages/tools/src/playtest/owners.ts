// Who owns each kind of fix the playtest reports (R4 thread workflow). Module ids are the build jobs that wrote
// the code; the two integrators own the shared files (team memory, 2026-11-26): command registry, schema and
// gates go to the schema integrator; barrels, exports, package map and screen routes go to the exports one.
export const OWNERS = {
  schemaIntegrator: 'Integrate: schema, golden and gate (COMMANDS registry, schema, PARAMS)',
  exportsIntegrator: 'Integrate: exports and screen routes (barrels, composition root, routes)',
  worldService: 'app-services WorldService (P1.3) via the schema integrator',
  engine: 'engine-game flow / officiating (thread "Fix engine bugs from module testing")',
  console: 'G-60 game-day console (app-services commands/game-calling)',
  gameFrame: 'G-62 game-day frame (career gameday, app-services game-frame)',
  gameplan: 'G-68 game plan and call sheet (app-services gameplan)',
  practice: 'G-65 practice planning',
  recruiting: 'T4 recruiting (world recruiting, career college-program)',
  evaluations: 'G-72 people screens and D6 scouting (app-services people)',
  market: 'G-80 coach job market (career market)',
  careerRun: 'G-89 scripted career runs (headless career-run)',
  worldLoop: 'G-81 world loop and G-87 season runner (world loop, world season)',
  home: 'G-72 office screens (app-services home)',
  rosterMoves: 'G-70 roster moves (app-services roster-moves)',
  careerYear: 'Career year: season to season on the live world and its save (app-services play, thread "Run the career offseason and save the world")',
  saves: 'G-83 saves (store, app-services WorldService)',
} as const;
