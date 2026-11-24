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
| `npm run build` | Build the static export into `out/`. Its `prebuild` step first runs `node scripts/generate-site-qr.mjs`, which writes the home page's QR code of the site's address (`NEXT_PUBLIC_SITE_URL`, read from the environment and the same `.env` files Next.js reads, or `https://safeos.sh`) to `public/home/site-qr.svg` with the `qrcode` package, then `node scripts/generate-notices.mjs`, which writes `public/third-party-notices.txt` from `package-lock.json`: each package the lockfile does not mark `dev` or `devOptional` (an optional package npm left out on the build machine, such as a compiler build for another platform, is not listed), with its version, its licence and the first copyright line of its licence file, the COCO dataset's line, and each package's licence text whole, once for the packages that share it word for word (a package with no licence file of its own and the licence Apache-2.0 takes `scripts/licenses/Apache-2.0.txt`). Neither file is committed |

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

# Web app: the alert pictures walk; its sample-clip walks read the clip's .y4m and
# .wav made with ffmpeg, as CI makes them
ffmpeg -nostdin -v error -y -i public/home/sample-clip.mp4 -an -pix_fmt yuv420p /tmp/sample-clip.y4m
ffmpeg -nostdin -v error -y -i public/home/sample-clip.mp4 -vn -ac 1 -ar 48000 -c:a pcm_s16le /tmp/sample-clip.wav
SAMPLE_CLIP_Y4M=/tmp/sample-clip.y4m SAMPLE_CLIP_WAV=/tmp/sample-clip.wav PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 \
  npx playwright test e2e/alert-pictures.spec.ts --project=chromium --workers=2 --grep-invert "A watch alert.s notification"
# The notification walks run alone: a notification waits 300 ms for its picture
SAMPLE_CLIP_Y4M=/tmp/sample-clip.y4m SAMPLE_CLIP_WAV=/tmp/sample-clip.wav PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 \
  npx playwright test e2e/alert-pictures.spec.ts --project=chromium --workers=1 --grep "A watch alert.s notification"

# Web app: a Lost and Found sighting (Chromium) on the same served build
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/lost-found-sighting.spec.ts --project=chromium
```

The browser test (`apps/guardian-ui/e2e/lost-found-edge.spec.ts`) enrols a
subject from a striped picture, feeds Chromium's fake camera the same stripes
from a clip it writes itself, starts the monitor and reads the Edge value the
sighting's alert keeps as data. The sighting walk
(`apps/guardian-ui/e2e/lost-found-sighting.spec.ts`) hands the watch a canvas
camera drawing the same stripes and checks the sighting's entry, its pictures
beside the pet's photo, its run and repeats, the live box, the opened picture,
History, keeping off, Delete all pictures and the notification. The alert
pictures walk (`apps/guardian-ui/e2e/alert-pictures.spec.ts`) checks each
alert's picture, box and close-up on the card, the live box, the opened
picture, History, Keep alert pictures and its notice, the room rule, other
tabs and profiles, the notification's picture, the privacy page and the
third-party notices, from the sample clip on Chromium's fake camera and from
canvas cameras. With `PLAYWRIGHT_BASE_URL` set, Playwright
tests the site at that address and starts no development server. CI runs this
spec, the sighting walk, the alert walk (`apps/guardian-ui/e2e/alerts-repeat.spec.ts`),
which hands the monitor a canvas camera whose picture keeps changing and checks
when its alerts come again, and the alert pictures walk. The walk needs desktop Chromium and skips under the
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
| `ci.yml` | Web app Lost & Found browser test | In Chromium, on the static build: a subject enrolled from a striped picture is compared with the same stripes on the fake camera, and the sighting's saved alert keeps an Edge score above 0 (`apps/guardian-ui/e2e/lost-found-edge.spec.ts`); a sighting tops the alert list with the camera's picture, its box, the close-up and the pet's saved photo, repeats on its entry after the Cooldown Period, starts a new entry after 40 seconds out of view, opens large, lists in History beside an earlier version's frame with no score, keeps nothing with keeping off, and sends a notification with no pet photo (`apps/guardian-ui/e2e/lost-found-sighting.spec.ts`); Monitor's Watch for offers Motion and sound and Lost and Found with the pet's photo, name, count and Change pet, No pet saved and Add a pet, Choose a pet, the comparison starting and stopping with the choice during a watch, setup and Monitor showing one choice, one row from 320 to 768 px, and axe finding nothing at 390 and 1280 px in both looks (`apps/guardian-ui/e2e/watch-for.spec.ts`, with axe-core from the dev dependencies) |
| `ci.yml` | Web app alert walk | In Chromium, on the static build, with a test camera whose picture keeps changing and a tone on the microphone (`apps/guardian-ui/e2e/alerts-repeat.spec.ts`): a continuing motion, pixel or sound event alerts again once the longer of its severity's cooldown and the Cooldown Period has passed, on its one card with "Repeated N times"; a rise to critical alerts at once; a picture that pauses for a moment now and then is one event; after Stop and Start, or with a detector turned off and on again, a new event alerts at once on a new card. Then, from the sample clip on Chromium's fake camera (its `.y4m` and `.wav` made with ffmpeg in the job) and from canvas cameras, with two workers, and its notification walks after them with one (`apps/guardian-ui/e2e/alert-pictures.spec.ts`): each alert's picture, box and close-up on its card, the live box, the opened picture with Show the box, Save picture and Delete picture, History's rows, Keep alert pictures with its notice, ages and Delete all pictures, the room rule, other tabs and profiles, the notification's picture, the privacy page's sentences and `/third-party-notices.txt`, and setup's camera step carrying the notice's choice. Both specs skip under Firefox; the same step then checks Settings > Notifications in Firefox itself (`apps/guardian-ui/e2e/notification-picture-firefox.spec.ts`), where the notification's picture switch is inactive because Firefox shows a notification's words alone |
| `ci.yml` | Compose ports | `scripts/check-compose-ports.sh` resolves every compose file (overrides on top of each base, every profile on) with `docker compose config` and fails when a service other than the `caddy` proxy publishes a port on any address but loopback (`127.0.0.0/8`, `::1`) or uses host networking; the fixtures in `scripts/testdata/compose-ports` must be rejected or accepted as their folder names say |
| `deploy-pages.yml` | build | The static export builds in static mode (no API, no analytics ids). On `master` it then deploys GitHub Pages; this is the only workflow that deploys the site |
| `docker-publish.yml` | Build & push | On `master`, builds and pushes `ghcr.io/<owner>/safeos-api` and `ghcr.io/<owner>/safeos-ui` for `linux/amd64` and `linux/arm64` (a 64-bit Raspberry Pi pulls the same tags). On a pull request that changes the Dockerfile or anything copied into the images it builds both platforms without pushing. This is the only workflow that publishes images |
| `pictures.yml` | Capture pictures | Screenshots of the web app (see below), with browser checks of the home page and the app's pages for the pull request's own build |
| `pictures.yml` | Capture the home page pictures | Makes the pictures the home page itself shows, from the sample clip through Chromium's fake camera, then captures each alert picture state (see below) |

`measure.yml` (Measure) is apart from these: it runs on each push to
`master` and by hand, never on a pull request. It records how fast the watch,
the detection model and Lost & Found matching run in Chromium with the CPU
slowed, and a slow number does not fail it. See [Performance](./PERFORMANCE.md).

The star count beside the public header's GitHub link is read when the site is
built, never by a visitor's browser. Before the build, `deploy-pages.yml` and
`pictures.yml` run `apps/guardian-ui/scripts/read-github-stars.mjs`. It asks
GitHub's REST API for the repository once
([Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository),
the field `stargazers_count`) and appends `NEXT_PUBLIC_GITHUB_STARS` and
`NEXT_PUBLIC_GITHUB_STARS_DATE` to the job's environment; the build writes them
into every page (`apps/guardian-ui/src/lib/github-stars.ts`). The script needs
no token. The workflows give it the run's own read-only token, because GitHub
counts a request without one against the runner's address, at 60 requests an
hour ([Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)).
When GitHub does not answer within ten seconds, answers with an error, or
answers with anything but a whole number above zero, the script prints a
warning, writes nothing and ends with success: the pages then show the link's
word alone. To see a count in a local build, set the two values yourself, for
example `NEXT_PUBLIC_GITHUB_STARS=58 NEXT_PUBLIC_GITHUB_STARS_DATE=2026-11-18 npm run build`.

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
need to be identified separately in the pull request. A route the base commit's
build answers 404 for, and whose page the base commit lacks (a page the pull
request adds), is logged as `not in the base build: <route>` and skipped in the
base capture, not failed (`apps/guardian-ui/scripts/base-routes.mjs`). A 404 for
a page the base commit holds fails, as does any 404 in the pull request's own
capture or in a run without `PICTURE_VERSION`.

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
the offline page, and Settings: the list of settings pages with each row's
value and axe on the settings parts, its first screen counted with each of its
rows whole above the phone bar, Lost and Found's pet, quiet hours read by the
page's clock, a server's rows and Your own server's page, the alert volume's
knob, filled track and edged empty track read from its pixels on the page's own
ground, a browser that
refuses storage, the focus order clear of the app's header and the phone bar,
larger text, the list's values offline, every control
of `apps/guardian-ui/scripts/settings-inventory.json` changed and read back from
its store, and the clears pressed on Data on this device. A settings walk fails
on any browser confirm box. The camera in these walks is a stand-in that draws a
changing picture, and the browser's answers for the camera and notifications
are given by the script. A finding fails the run.

- On a pull request: add the label `pictures`. It runs on the labelling and on
  every later push to that pull request, for the routes in `DEFAULT_ROUTES`
  (home, monitoring, setup, dashboard, history, settings, Data on this device,
  Alert sounds, notifications, models, nap, admin, privacy, FAQ and help).
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

It then walks what every public page shares
(`apps/guardian-ui/scripts/public-chrome-checks.mjs`): the row's links at 820,
1024, 1280, 1440 and 1920 pixels with GitHub and its star count; a row that
runs short, which gives up GitHub first, then Privacy; every request each
public page and each app page makes for ten seconds, none of it to another
host; the keys of every public page; the footer's makers and About's part on
who builds SafeOS. For the key sheet it lays the four kinds of key out on a
public page with the site's own stylesheet, pictures each at rest, under the
pointer, focused, pressed and inactive in both looks, measures its label, edge,
ring and glyph from the picture's pixels, and saves the pictures side by side
as `keys-sheet-<look>.png`. Both versions of a pull request also capture the
public header and footer on their own (`site-header-<width>-<look>.png`,
`site-footer-<width>-<look>.png`), the open Menu at 390 pixels
(`site-menu-390-<look>.png`) and About's part
(`about-builders-<width>-<look>.png`), so the two read side by side.

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

#### The alert pictures

After the home captures, the same job runs
`apps/guardian-ui/scripts/alert-picture-captures.mjs <base-url> <out-dir> <y4m> <wav>`
on the served site. It seeds a device with the notice about alert pictures
answered, raises alerts from the sample clip and saves each state at 390 by 844
and 1440 by 900, in both looks, at a device scale factor of 2, clipped to the
state's own part of the page: `card`, `sound-card`, `opened`, `history`,
`watch-group`, `settings-group`, `notice`, `notification-setting`,
`live-box` and, on a first visit, setup's camera step as `setup-choice`, then, with a striped pet enrolled and a striped clip it writes,
`sighting` and, in the same visit, the dashboard's Since you last looked as
`dashboard-sighting`. Each file is `alert-<state>-<width>-<look>.png`. A state it cannot
reach fails the step and names the state. The files are the run's
`alert-pictures` artifact; a pull request that changes them copies them into
`docs/pictures/pr-<number>/alert/` with a README naming the run.

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
