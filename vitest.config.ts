import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10000,
    include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] }
  }
});
