import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['evals/cases/**/eval.ts'],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    pool: 'forks',
    maxConcurrency: 1,
    reporters: ['verbose'],
  },
});
