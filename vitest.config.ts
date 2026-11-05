import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'apps'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules',
        'dist',
        'apps',
        'tests',
        '**/*.d.ts',
        'src/api/openapi.ts', // Generated file
        'e2e/**',             // Playwright e2e tests
        'scripts/**',         // Build/setup scripts
        '*.config.ts',        // Root config files (vitest, capacitor)
        '*.config.js',        // Any JS config files
        'src/index.ts',       // Entry point with startup logic
        'src/cli/**',         // CLI entry points; their logic lives in src/lib and is tested there
        'src/api/server.ts',  // Server bootstrap - tested via integration
        'src/api/routes/**',  // API routes - require integration tests
        'src/api/middleware/**', // Middleware - require integration tests
        'src/api/schemas/**', // Zod schemas - static definitions
        'src/db/**',          // Database layer - require DB connection
        'src/queues/**',      // Queue processors - require Redis
        'src/auth/**',        // Auth - require integration tests
        'src/lib/review/**',  // Human review - require external services
        'src/lib/alerts/telegram.ts',    // Telegram API - external service
        'src/lib/alerts/browser-push.ts', // Browser push - requires browser
        // twilio.ts is now mocked + unit-tested in tests/unit/twilio.test.ts
        'src/lib/safety/disclaimers.ts', // Static disclaimer content
        'src/lib/ollama/models.ts',      // Static model definitions
        'src/types/**',       // Type definitions only
      ],
      thresholds: {
        statements: 65,
        branches: 60,
        functions: 60,
        lines: 65,
      },
    },
    testTimeout: 10000,
  },
});





































