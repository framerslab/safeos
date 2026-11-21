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
| `npm run build` | Build the static export into `out/`. Its `prebuild` step, `node scripts/generate-site-qr.mjs`, first writes the home page's QR code of the site's address (`NEXT_PUBLIC_SITE_URL`, read from the environment and the same `.env` files Next.js reads, or `https://safeos.sh`) to `public/home/site-qr.svg` with the `qrcode` package; the file is not committed |

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

# Web app: Lost & Found in a browser (Chromium), the way CI runs it
cd apps/guardian-ui
NEXT_PUBLIC_STATIC_MODE=true npm run build
npx playwright install chromium
python3 -m http.server 4173 --bind 127.0.0.1 --directory out &
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/lost-found-edge.spec.ts --project=chromium

# Web app: Watch for on Monitor (Chromium) on the same served build; its axe
# checks read axe-core, a dev dependency that npm ci installs
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/watch-for.spec.ts --project=chromium

# Web app: the alert walk (Chromium) on the same served build, the way CI runs it
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/alerts-repeat.spec.ts --project=chromium
```

The browser test (`apps/guardian-ui/e2e/lost-found-edge.spec.ts`) enrols a
subject from a striped picture, feeds Chromium's fake camera the same stripes
from a clip it writes itself, starts the monitor and reads the Edge value of
the saved match in the gallery. With `PLAYWRIGHT_BASE_URL` set, Playwright
tests the site at that address and starts no development server. CI runs this
spec and the alert walk (`apps/guardian-ui/e2e/alerts-repeat.spec.ts`), which
hands the monitor a canvas camera whose picture keeps changing and checks when
its alerts come again. The walk needs desktop Chromium and skips under the
other projects in `playwright.config.ts`. The other files in
`apps/guardian-ui/e2e` are not run in CI.

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
| `ci.yml` | Web app Lost & Found browser test | In Chromium, on the static build: a subject enrolled from a striped picture is matched against the same stripes on the fake camera, and the match saved in the gallery shows an Edge value above 0 (`apps/guardian-ui/e2e/lost-found-edge.spec.ts`); Monitor's Watch for offers Motion and sound and Lost and Found with the pet's photo, name, count and Change pet, No pet saved and Add a pet, Choose a pet, the comparison starting and stopping with the choice during a watch, setup and Monitor showing one choice, one row from 320 to 768 px, and axe finding nothing at 390 and 1280 px in both looks (`apps/guardian-ui/e2e/watch-for.spec.ts`, with axe-core from the dev dependencies) |
| `ci.yml` | Web app alert walk | In Chromium, on the static build, with a test camera whose picture keeps changing and a tone on the microphone (`apps/guardian-ui/e2e/alerts-repeat.spec.ts`): a continuing motion, pixel or sound event alerts again once the longer of its severity's cooldown and the Cooldown Period has passed, on its one card with "Repeated N times"; a rise to critical alerts at once; a picture that pauses for a moment now and then is one event; after Stop and Start, or with a detector turned off and on again, a new event alerts at once on a new card. The same spec run under Firefox skips |
| `ci.yml` | Compose ports | `scripts/check-compose-ports.sh` resolves every compose file (overrides on top of each base, every profile on) with `docker compose config` and fails when a service other than the `caddy` proxy publishes a port on any address but loopback (`127.0.0.0/8`, `::1`) or uses host networking; the fixtures in `scripts/testdata/compose-ports` must be rejected or accepted as their folder names say |
| `deploy-pages.yml` | build | The static export builds in static mode (no API, no analytics ids). On `master` it then deploys GitHub Pages; this is the only workflow that deploys the site |
| `docker-publish.yml` | Build & push | On `master`, builds and pushes `ghcr.io/<owner>/safeos-api` and `ghcr.io/<owner>/safeos-ui` for `linux/amd64` and `linux/arm64` (a 64-bit Raspberry Pi pulls the same tags). On a pull request that changes the Dockerfile or anything copied into the images it builds both platforms without pushing. This is the only workflow that publishes images |
| `pictures.yml` | Capture pictures | Screenshots of the web app (see below), with browser checks of the home page and the app's pages for the pull request's own build |
| `pictures.yml` | Capture the home page pictures | Makes the pictures the home page itself shows, from the sample clip through Chromium's fake camera (see below) |

`measure.yml` (Measure) is apart from these: it runs on each push to
`master` and by hand, never on a pull request. It records how fast the watch,
the detection model and Lost & Found matching run in Chromium with the CPU
slowed, and a slow number does not fail it. See [Performance](./PERFORMANCE.md).

Concurrency: a newer push to a pull request cancels that pull request's older
runs, and a pull request never cancels a run on `master`. On `master`, every
commit's checks run to the end (each run has its own group). The Pages deploy
and the image publish run one at a time and a running one is never cancelled;
while one runs, only the newest waiting one is kept, so when several commits
land at once the site and the `latest` images go straight to the newest.

### Pictures

`pictures.yml` builds the static site, serves it inside the job, opens each
route in Chromium with Playwright at 390, 820, 1280 and 1920 pixels wide (one
width for each layout), in the light and the dark look, and uploads the
full-page PNG files as the run's `pictures` artifact
(`<route>-<width>-<look>.png`).

Pull-request picture runs also capture the base commit with the same routes,
widths and looks. The `pictures` artifact contains the proposed change and
`pictures-before` contains the base, so visible changes can be compared without
a separate manual workflow run. Camera-dependent and authenticated states still
need to be identified separately in the pull request.

When `/setup/` is among the routes, both versions also capture setup's camera
step after a refused camera request (`setup-camera-refused-<width>-<look>.png`).
For the pull request's own build the script then walks setup from a first visit
to the dashboard with no camera: after a refused request, with no camera found,
and in the runner's own browser, which has no camera. Each walk reads what the
step says, presses **Continue without the camera**, finishes setup, lands on the
dashboard and reloads it. At 320, 390 and 1280 pixels it checks that Back, the
request key and the new key are whole and on screen, that the new key is reached
with Tab and pressed with Enter, and that the scenario step shows **Continue**
beside Back for a scenario already chosen. The headless browser has no prompt,
so the refused and none-found answers are given to the page's camera request by
the script; the third walk uses the browser's own answer. A finding fails the run.

When `/dashboard/` is captured, both versions also capture the dashboard after
setup (`dashboard-setup-<width>-<look>.png`), and the pull request's own build
checks that each of the four ways to watch opens its page. For the pull
request's own build the script also walks the app's pages
(`apps/guardian-ui/scripts/app-checks.mjs`): the header, the phone bar and the
footer at every width from 320 px, each page with scripts off and with its
script held, the dashboard in each state (before setup, the camera blocked or
in use, notifications blocked or not asked, a second tab, alerts new, the
stores held, a private window) at every width with its first screen counted,
sizes and contrast against the readable look's figures, the old addresses and
the offline page. The camera in these walks is a stand-in that draws a
changing picture, and the browser's answers for the camera and notifications
are given by the script. A finding fails the run.

- On a pull request: add the label `pictures`. It runs on the labelling and on
  every later push to that pull request, for the routes in `DEFAULT_ROUTES`
  (home, monitoring, setup, dashboard, history, settings, notifications, models, nap,
  admin, privacy, FAQ and help).
- By hand: Actions, Pictures, Run workflow. Give a branch, tag or commit and the
  routes separated by spaces (for example `/ /about/ /faq/`).
- The capture script is `apps/guardian-ui/scripts/capture-pictures.mjs`; with
  the export served locally it runs as
  `node scripts/capture-pictures.mjs http://127.0.0.1:4173 pictures / /monitor/`.

Download the artifact from the run's summary page, or with
`gh run download <run id> -n pictures`.

For the pull request's own build the capture script also checks the home page
in the browser, part by part (`apps/guardian-ui/scripts/home-checks.mjs`): the
page with scripts off and with its main script blocked, the visitor header at
every width from 320 px, the Menu, the look switch, the headline's lines, the
start key before and after setup, the capture's crop at each width, the layout
and the words of each part, the footer, the title and cards, sizes and
contrast against the readable look's figures, and the page offline after one
visit. It saves the page from top to bottom at 820 and 1920 pixels too. A
finding fails the run.

#### The home page's own pictures

The home page's first screen shows a capture of the monitor, and nothing on it
is drawn by hand or made by an image model. The job "Capture the home page
pictures" makes it:

1. It builds the same commit and converts the committed sample clip,
   `apps/guardian-ui/public/home/sample-clip.mp4`, to a `.y4m` and a `.wav`
   file with ffmpeg. Neither is committed.
2. `apps/guardian-ui/scripts/home-captures.mjs` starts Chromium with
   `--use-fake-device-for-media-stream`, `--use-file-for-fake-video-capture`
   and `--use-file-for-fake-audio-capture`, with the camera and microphone
   granted, so the unchanged monitor reads the clip through its real camera
   path.
3. For each look it seeds a finished setup and the Custom preset in
   `scripts/home-capture-settings.json` (the default preset with pixel
   detection off), opens `/monitor/`, presses "Start Monitoring" and waits
   until the alert list holds a motion alert.
4. It saves the three crops in both looks (`capture-phone-*`,
   `capture-portrait-*`, `capture-landscape-*`, each a `.png` and a `.webp`;
   the portrait crop is the 390 px monitor's camera view with two whole rows
   of readout tiles, at its own ratio, near 4:5, and the job fails a frame
   that cuts a tile; the home page gives each crop's box the ratio of its
   file),
   `screenshots/dashboard.png` and `screenshots/monitoring.png` (the two the
   web app manifest names), the shared-link card `home/card.jpg` (from
   `scripts/home-card.html`, a page the site does not serve) and
   `home/provenance.json`: the run, the commit, the clip's sha256 and each
   file's viewport, width, height and bytes.

A crop is kept only at the size it asks for: one that runs past the edge of
the screen is saved cut short, and the job fails on it. The landscape crop is
16:10 from the top of the 1280 px monitor's grid; where the grid starts too
far down the 1000 px screen for it, the script first moves the page up until
the crop ends inside the screen.

The files are uploaded as the run's `home-pictures` artifact. To ship them,
download it and copy it over `apps/guardian-ui/public/`:

```bash
gh run download <run id> -n home-pictures -D /tmp/home-pictures
cp -R /tmp/home-pictures/home /tmp/home-pictures/screenshots apps/guardian-ui/public/
```

`tests/home-capture-files.test.ts` fails when a capture, the card or an install
screenshot is missing or differs from `provenance.json`, and when the clip's
record (`public/home/sample-clip.json`) lacks its source, author, licence or
words. A pull request that changes what the monitor draws commits the captures
again from its own run.

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
wscat -c ws://localhost:3001/ws
```

Send an `authenticate` message with a live session within five seconds and
wait for `connected`. See [WebSocket API](API.md#websocket-api); do not put a
session token in the URL.

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

- [Performance](./PERFORMANCE.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Configuration Reference](./CONFIGURATION.md)
- [API Documentation](./API.md)
