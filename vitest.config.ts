import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/release/test/**/*.test.ts', 'scripts/assets/test/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
