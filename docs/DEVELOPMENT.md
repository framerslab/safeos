# SafeOS Guardian - Development Guide

This guide covers local development setup, testing, code style, and contribution guidelines.

---

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** (comes with Node.js; CI uses npm)
- **Bash** and the **SQLite CLI** (`sqlite3`), required by the default server test
  suite to exercise the documented backup and recovery commands
- **Ollama** (optional, for LLM-enhanced analysis)

---

## Local Setup

### 1. Clone the Repository

```bash
git clone https://github.com/framerslab/safeos.git
cd safeos
```

### 2. Install Dependencies

```bash
# Server (repository root)
npm install --legacy-peer-deps

# Web app
cd apps/guardian-ui
npm ci
cd ../..
```

Commands below run from the repository root unless they start with
`cd apps/guardian-ui`.

### 3. Start Development Servers

```bash
# Start both API and UI
npm run dev

# Or separately:
npm run api   # API on port 3001
npm run ui    # UI on port 3000
```

### 4. (Optional) Setup Ollama

```bash
# Install Ollama
brew install ollama  # macOS

# Start server
ollama serve &

# Pull models
ollama pull moondream
ollama pull llava:7b
```

---

## Project Structure

```
safeos/
├── src/                    # Backend source code
│   ├── api/                # Express API
│   ├── db/                 # Database layer
│   ├── lib/                # Core libraries
│   ├── queues/             # Job queues
│   └── types/              # TypeScript types
├── apps/
│   └── guardian-ui/        # Next.js frontend
├── tests/                  # Test suites
│   ├── unit/               # Unit tests
│   └── integration/        # Integration tests
├── docs/                   # Documentation
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Available Scripts

Repository root (the server):

| Script | Description |
|--------|-------------|
| `npm run dev` | Start API + UI in development mode |
| `npm run api` | Start API server only |
| `npm run ui` | Start UI dev server only |
| `npm run build` | Compile the server with `tsc` (fails on a type error) |
| `npm run build:ui` | Build the web app's static export |
| `npm test` | Run the server's Vitest suite (`tests/`) |
| `npm run test:watch` | Run the server's tests in watch mode |
| `npm run test:coverage` | Run the server's tests with coverage |
| `npm run lint` | Run ESLint on `src` and `tests` (`eslint.config.js`) |
| `npm run typecheck` | Type check the server |
| `npm run ollama:check` | Verify Ollama connection |
| `npm run ollama:pull` | Pull required Ollama models |

`apps/guardian-ui` (the web app):

| Script | Description |
|--------|-------------|
| `npm test` | Run the web app's Jest suite (`apps/guardian-ui/tests`) |
| `npm run lint` | Run `next lint` (`.eslintrc.json`). The lockfile carries no ESLint, so first run `npm install --no-save eslint@8.57.1 eslint-config-next@14.2.35`, the same command CI runs |
| `npx tsc --noEmit` | Type check the web app |
| `npm run build` | Build the static export into `out/` |

---

## Testing

### Running Tests

```bash
# Server tests
npm test

# Run specific test file
npm test -- tests/unit/frame-analyzer.test.ts

# Run with coverage
npm run test:coverage

# Watch mode (re-runs on file changes)
npm run test:watch

# Web app tests
cd apps/guardian-ui && npm test && cd ../..
```

A test that fails on master for a reason not yet fixed is marked with the
runner's own known-failure marker (`it.fails` in Vitest, `test.failing` in
Jest) and a one-line reason, and is listed in issue 2. It still runs: the
marker turns red the day the test starts passing, so the mark comes off with
the fix.

### Test Structure

```
tests/
├── unit/
│   ├── frame-analyzer.test.ts
│   ├── escalation.test.ts
│   ├── content-filter.test.ts
│   └── ...
└── integration/
    ├── api/
    │   ├── streams.test.ts
    │   ├── alerts.test.ts
    │   └── ...
    └── websocket.test.ts
```

### Writing Tests

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FrameAnalyzer } from '../../src/lib/analysis/frame-analyzer';

describe('FrameAnalyzer', () => {
  let analyzer: FrameAnalyzer;

  beforeEach(() => {
    analyzer = new FrameAnalyzer();
  });

  it('should detect motion above threshold', async () => {
    const result = await analyzer.analyze({
      frameData: 'base64...',
      motionScore: 15,
      audioLevel: 5,
    });

    expect(result.concernLevel).toBe('medium');
  });

  it('should fallback to cloud when local fails', async () => {
    vi.spyOn(analyzer, 'analyzeLocal').mockRejectedValue(new Error('Ollama unavailable'));

    const result = await analyzer.analyze({ frameData: 'base64...' });

    expect(result.isCloudFallback).toBe(true);
  });
});
```

---

## Code Style

### TypeScript Guidelines

- Use strict mode (`"strict": true`)
- Prefer `interface` over `type` for object shapes
- Use descriptive variable names
- Document complex functions with JSDoc

```typescript
/**
 * Analyze a video frame for safety concerns.
 *
 * @param frame - Frame data with motion/audio context
 * @returns Analysis result with concern level and description
 */
export async function analyzeFrame(frame: FrameInput): Promise<AnalysisResult> {
  // Implementation
}
```

### API Route Guidelines

- Use Zod schemas for all input validation
- Use standardized error responses
- Scope all queries by `user_id` for multi-tenancy
- Include pagination for list endpoints

```typescript
// Good: Validated, scoped, paginated
router.get('/', validate(ListQuerySchema, 'query'), async (req, res) => {
  try {
    const db = await getSafeOSDatabase();
    const profileId = getProfileId(req);
    const { limit, offset } = req.query;

    const results = await db.all(
      'SELECT * FROM items WHERE user_id = ? LIMIT ? OFFSET ?',
      [profileId, limit, offset]
    );

    res.json({ results, pagination: { total, limit, offset, hasMore } });
  } catch (error) {
    console.error('Failed to list items:', error);
    internalError(res, 'Failed to list items');
  }
});
```

### Error Handling

Use the standardized error utilities in `src/api/utils/errors.ts`:

```typescript
import { notFound, unauthorized, internalError, badRequest } from '../utils/errors';

// Examples
unauthorized(res);                     // 401
notFound(res, 'Stream');              // 404: "Stream not found"
badRequest(res, 'Invalid date range'); // 400
internalError(res, 'Database error'); // 500
```

### Frontend Guidelines

- Use functional components with hooks
- Use Zustand for state management
- Use Tailwind CSS for styling
- Ensure touch targets are at least 44x44px
- Support responsive breakpoints (mobile, tablet, desktop)

---

## Database Migrations

Migrations are handled automatically in `src/db/index.ts`. To add a new migration:

1. Add SQL to the `migrations` array
2. Migrations run in order on startup
3. Each migration only runs once

```typescript
const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS new_table (
        id TEXT PRIMARY KEY,
        ...
      );
    `,
  },
];
```

---

## API Development

### Adding a New Route

1. Create route file in `src/api/routes/`
2. Add validation schemas in `src/api/schemas/`
3. Register route in `src/api/server.ts`
4. Write tests in `tests/integration/api/`

```typescript
// src/api/routes/example.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { ExampleSchema } from '../schemas';

export const exampleRoutes = Router();
exampleRoutes.use(requireAuth);

exampleRoutes.get('/', validate(ListExampleSchema, 'query'), async (req, res) => {
  // Implementation
});

// src/api/server.ts
import { exampleRoutes } from './routes/example';
app.use('/api/example', exampleRoutes);
```

### Adding Validation Schemas

```typescript
// src/api/schemas/index.ts
import { z } from 'zod';

export const ExampleQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  status: z.enum(['active', 'inactive']).optional(),
});
```

---

## Continuous Integration

Every pull request into `master` and every push to `master` runs these
workflows in `.github/workflows/`. Any failing step fails the run; no check
prints an error and carries on.

| Workflow | Job | What it proves |
|---|---|---|
| `ci.yml` | Server type check and lint | `tsc --noEmit` on `src` has no errors; ESLint on `src` and `tests` has no errors (explicit `any` is reported as a warning) |
| `ci.yml` | Server tests | The Vitest suite passes and meets the coverage thresholds in `vitest.config.ts`; the coverage summary (`coverage-summary.json`, `lcov.info`) is uploaded as the `server-coverage` artifact |
| `ci.yml` | Server build | `npm run build` (`tsc`) compiles the server |
| `ci.yml` | Web app type check and lint | `tsc --noEmit` and `next lint` pass for `apps/guardian-ui` |
| `ci.yml` | Web app tests | The web app's Jest suite passes |
| `ci.yml` | Compose ports | `scripts/check-compose-ports.sh` resolves every compose file (overrides on top of each base, every profile on) with `docker compose config` and fails when a service other than the `caddy` proxy publishes a port on any address but loopback (`127.0.0.0/8`, `::1`) or uses host networking; the fixtures in `scripts/testdata/compose-ports` must be rejected or accepted as their folder names say |
| `deploy-pages.yml` | build | The static export builds in static mode (no API, no analytics ids). On `master` it then deploys GitHub Pages; this is the only workflow that deploys the site |
| `docker-publish.yml` | Build & push | On `master`, builds and pushes `ghcr.io/<owner>/safeos-api` and `ghcr.io/<owner>/safeos-ui` for `linux/amd64` and `linux/arm64` (a 64-bit Raspberry Pi pulls the same tags). On a pull request that changes the Dockerfile or anything copied into the images it builds both platforms without pushing. This is the only workflow that publishes images |
| `pictures.yml` | Capture pictures | Screenshots of the web app (see below); runs only when asked |

Concurrency: a newer push to a pull request cancels that pull request's older
runs, and a pull request never cancels a run on `master`. On `master`, every
commit's checks run to the end (each run has its own group). The Pages deploy
and the image publish run one at a time and a running one is never cancelled;
while one runs, only the newest waiting one is kept, so when several commits
land at once the site and the `latest` images go straight to the newest.

### Pictures

`pictures.yml` builds the static site, serves it inside the job, opens each
route in Chromium with Playwright at 390 and 1280 pixels wide, in the light and
the dark look, and uploads the full-page PNG files as the run's `pictures`
artifact (`<route>-<width>-<look>.png`).

Pull-request picture runs also capture the base commit with the same routes,
widths and looks. The `pictures` artifact contains the proposed change and
`pictures-before` contains the base, so visible changes can be compared without
a separate manual workflow run. Camera-dependent and authenticated states still
need to be identified separately in the pull request.

- On a pull request: add the label `pictures`. It runs on the labelling and on
  every later push to that pull request, for the routes in `DEFAULT_ROUTES`
  (home, monitoring, setup, dashboard, settings, notifications, models, nap,
  admin, privacy, FAQ and help).
- By hand: Actions, Pictures, Run workflow. Give a branch, tag or commit and the
  routes separated by spaces (for example `/ /about/ /faq/`).
- The capture script is `apps/guardian-ui/scripts/capture-pictures.mjs`; with
  the export served locally it runs as
  `node scripts/capture-pictures.mjs http://127.0.0.1:4173 pictures / /monitor/`.

Download the artifact from the run's summary page, or with
`gh run download <run id> -n pictures`.

---

## Pull Request Checklist

Before submitting a PR, ensure:

- [ ] All tests pass (`npm test` at the root and in `apps/guardian-ui`)
- [ ] TypeScript compiles without errors (`npm run typecheck`, and `npx tsc --noEmit` in `apps/guardian-ui`)
- [ ] Linting passes (`npm run lint`, and `npm run lint` in `apps/guardian-ui`)
- [ ] New features have tests
- [ ] API changes are documented
- [ ] No hardcoded secrets or credentials
- [ ] Multi-tenancy is enforced (user_id scoping)
- [ ] Pagination is implemented for list endpoints
- [ ] Error handling uses standardized utilities
- [ ] Touch targets are at least 44x44px (UI changes)
- [ ] Responsive design works on mobile (UI changes)

---

## Debugging

### API Debugging

```bash
# Enable debug logging
DEBUG=safeos:* npm run api

# Check database contents
sqlite3 db_data/app.sqlite3 ".tables"
sqlite3 db_data/app.sqlite3 "SELECT * FROM streams LIMIT 5;"
```

### Ollama Debugging

```bash
# Check Ollama status
curl http://localhost:11434/api/version

# List available models
curl http://localhost:11434/api/tags

# Test model inference
curl -X POST http://localhost:11434/api/generate \
  -d '{"model":"moondream","prompt":"Hello"}'
```

### WebSocket Debugging

Use browser DevTools Network tab (WS filter) or:

```bash
# wscat for CLI testing
npm i -g wscat
wscat -c ws://localhost:3001
```

---

## Environment Setup Tips

### VS Code Extensions

- ESLint
- Prettier
- TypeScript Vue Plugin (Volar)
- Tailwind CSS IntelliSense

### Recommended .vscode/settings.json

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

---

## See Also

- [Architecture Overview](./ARCHITECTURE.md)
- [Configuration Reference](./CONFIGURATION.md)
- [API Documentation](./API.md)
