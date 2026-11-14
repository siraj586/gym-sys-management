import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './src/test/globalSetup.ts',
    setupFiles: ['./src/test/setupEnv.ts'],
    // Test files share one database, so they run one after another.
    fileParallelism: false,
  },
});
