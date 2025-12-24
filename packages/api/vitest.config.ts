import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load env file based on mode (defaults to .env)
  // This ensures DATABASE_URL and other env vars are available for integration tests
  const env = loadEnv(mode, process.cwd(), '');

  return {
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts'],
      exclude: ['node_modules', 'dist'],
      testTimeout: 30000,
      hookTimeout: 30000,
      // Run test files sequentially to avoid database isolation issues
      fileParallelism: false,
      // Run tests within a file sequentially (not in parallel)
      sequence: {
        concurrent: false,
      },
      // Ensure external deps are properly resolved
      deps: {
        interopDefault: true,
      },
      // Inject environment variables for Prisma and other services
      env,
    },
  };
});
