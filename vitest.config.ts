import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json.
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // `server-only` throws under a browser-like resolver; tests exercise the
      // same modules directly, so it is stubbed out here.
      'server-only': fileURLToPath(
        new URL('./tests/stubs/server-only.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts?(x)', 'tests/integration/**/*.test.ts?(x)'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['modules/**/*.ts', 'lib/**/*.ts'],
      exclude: ['**/index.ts', '**/*.d.ts'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
})
