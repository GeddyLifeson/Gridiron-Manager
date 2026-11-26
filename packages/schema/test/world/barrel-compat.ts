// Compile-time guard for the integrator's one-line re-export (game-build-plan.md section 2): if any
// world export name clashed with an existing @gm/schema export, `npm run typecheck` would fail here
// with TS2308. Re-exports of the same binding do not clash, so this stays valid after the line lands.
export * from '../../src/index.ts';
export * from '../../src/world/index.ts';
