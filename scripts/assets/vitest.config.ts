// Asset register tests (PV-15). Run: npx vitest run --config scripts/assets/vitest.config.ts
// The root vitest config only includes packages/*/test; the integrator is asked to add scripts/assets/test.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { root: fileURLToPath(new URL('../..', import.meta.url)), include: ['scripts/assets/test/**/*.test.mjs'] } });
