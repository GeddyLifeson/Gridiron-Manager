// The release gate's own tests (G-100). Run: npx vitest run --config scripts/release/vitest.config.ts
// (the root vitest config only includes packages/*/test; the integrator is asked to add scripts/release/test).
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { root: fileURLToPath(new URL('../..', import.meta.url)), include: ['scripts/release/test/**/*.test.ts'], testTimeout: 120_000 } });
