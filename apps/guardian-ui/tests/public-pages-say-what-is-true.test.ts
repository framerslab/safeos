/**
 * The public pages say what the software does
 *
 * Reads the source of every page a visitor can open before using the app (the
 * home page, About, FAQ, Help and its guides, Tutorials, Tutorial, the blog,
 * the old support address, Privacy, Terms, Security, Lost & Found and its
 * match gallery, Setup), every component those pages and the root layout
 * render (listed below with the page that renders it), the root layout's
 * metadata, the sitemap, the web app manifest, the social card, the home
 * page's diagram, the README's product sections and the changelog's
 * Unreleased section. Code comments are left out: the check is on what a
 * visitor reads. It fails on any phrase from two lists:
 *
 * - money words: SafeOS asks for no money and is not a charity, so no page
 *   says nonprofit, charity, donate, donation, tax-exempt, tax-deductible or
 *   501(c)(3), not even in the negative, and no page asks for a sponsorship
 *   or links the old /donate address (the changelog may name it once);
 * - claims the code does not back: each entry names what the code does
 *   instead, so a failure says why the phrase is untrue.
 *
 * It also checks that every page naming babies carries the not-a-medical-
 * device sentence, that each page saying the model waits for movement names
 * the five-second check during a Security alert, that the README names the
 * cloud models the server selects, that every public page has its own title,
 * description, canonical address and social card, that the quick-start links
 * name presets that exist, and that every internal link and every link into
 * the repository on GitHub has a destination.
 *
 * One sentence is allowed to name breathing and SIDS: the statement that
 * SafeOS is not a medical device. It is removed before the check.
 */

import fs from 'fs';
import path from 'path';

const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..');

function listFiles(dir: string, exts: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

const app = (...parts: string[]) => path.join(APP_ROOT, ...parts);
const component = (...parts: string[]) => app('src', 'components', ...parts);

// Every file in these route folders is read, so a layout added beside a page
// (for its metadata) is read too.
const PUBLIC_ROUTES = [
  'about',
  'faq',
  'help',
  'tutorials',
  'tutorial',
  'blog',
  'donate',
  'privacy',
  'terms',
  'security',
  'lost-found',
  'setup',
];
const PUBLIC_ROUTE_DIRS = PUBLIC_ROUTES.map((r) => app('src', 'app', r));

// Single files that must exist: a renamed file must be renamed here too.
// Each component is listed with the page that renders it.
const PUBLIC_FILES = [
  app('src', 'app', 'page.tsx'),
  app('src', 'app', 'layout.tsx'),
  app('src', 'app', 'sitemap.ts'),
  app('src', 'app', 'not-found.tsx'),
  component('home', 'HomeCTA.tsx'), // home
  component('UseCaseShowcase.tsx'), // home
  component('DiagramZoomable.tsx'), // home
  component('NotAMedicalDevice.tsx'), // home, FAQ, Help, Tutorials, Tutorial, blog post, Terms
  component('ModelDownloadProgress.tsx'), // Security
  component('CameraFeed.tsx'), // Security
  component('SecurityPanel.tsx'), // Security
  component('IntrusionGallery.tsx'), // Security
  component('LostFoundSetup.tsx'), // Lost & Found
  component('SubjectPreview.tsx'), // Lost & Found
  component('MatchGallery.tsx'), // Lost & Found matches
  component('CameraPicker.tsx'), // Setup
  component('Logo.tsx'), // header, Setup, not-found
  component('StatusBanner.tsx'), // root layout: every page
  component('NotificationPermission.tsx'), // root layout: every page
  component('PWAInstallPrompt.tsx'), // root layout: every page
  component('KeyboardShortcutsModal.tsx'), // root layout: every page
  component('NotificationDropdown.tsx'), // header: every page
  component('layout', 'Nav.tsx'), // every page
  component('layout', 'Footer.tsx'), // every page
  component('layout', 'MobileBottomNav.tsx'), // every page
  app('public', 'manifest.json'),
  app('public', 'og-image.svg'),
  app('public', 'diagrams', 'how-it-works.svg'),
];

const README = path.join(REPO_ROOT, 'README.md');
const CHANGELOG = path.join(REPO_ROOT, 'CHANGELOG.md');

const SCANNED = [
  ...PUBLIC_FILES,
  ...PUBLIC_ROUTE_DIRS.flatMap((d) => listFiles(d, ['.tsx', '.ts'])),
];

// The one statement that may name breathing and SIDS (the not-a-medical-device
// line); it is cut out before the phrases are matched.
const MEDICAL_SENTENCE = 'SafeOS is not a medical device: it does not monitor breathing and cannot prevent SIDS.';
const ALLOWED_SENTENCES = [
  /SafeOS is not a medical device: it does not monitor breathing and cannot prevent SIDS\./g,
];

type Phrase = { pattern: RegExp; why: string };

const MONEY_WORDS: Phrase[] = [
  { pattern: /\bnon-?profit/i, why: 'SafeOS is not a nonprofit' },
  { pattern: /\bcharit(y|ies|able)\b/i, why: 'SafeOS is not a charity' },
  { pattern: /\bdonat(e|es|ed|ing|ions?|ors?)\b/i, why: 'safeos.sh asks for no donations' },
  { pattern: /\btax[- ]?(exempt|deductible)/i, why: 'no money word, not even in the negative' },
  { pattern: /501\s*\(\s*c\s*\)\s*\(\s*3\s*\)/i, why: 'no money word' },
  { pattern: /\bsponsor(s|ship|ships)?\b/i, why: 'safeos.sh asks for no sponsorship' },
  { pattern: /Support Us/, why: 'safeos.sh asks for no money' },
  { pattern: /\/donate\b/, why: 'the old support address is linked from nowhere' },
];

const UNBACKED_CLAIMS: Phrase[] = [
  // Lost & Found: src/lib/visual-fingerprint.ts and src/lib/subject-matcher.ts
  { pattern: /cosine/i, why: 'the matcher scores colours and a weighted mix (compareFingerprints); no cosine similarity exists' },
  { pattern: /sobel/i, why: 'the edge grid is a difference between neighbouring pixels; there is no Sobel kernel' },
  {
    pattern: /missing (pet or )?persons?|(pets?|pet),? (or|and) (a )?(person|people)|pets, people|Pet\/Person/i,
    why: 'the matcher compares colours on your own camera; it does not find or identify a person',
  },
  {
    pattern: /Family member or friend|label="Person"/,
    why: 'the matcher is never offered for finding a person',
  },
  {
    pattern: /\ban(other)? animal (with|of) (your|the same|similar)/i,
    why: 'the matcher compares image regions (subject-matcher.ts); it never establishes that a region is an animal',
  },
  {
    pattern: /AI[- ]Enhanced|Higher accuracy, needs internet/i,
    why: 'the hybrid setting only slows the same local matcher from 500 to 900 ms (monitor/page.tsx)',
  },
  {
    pattern: /local\/offline AI|browser-based vision AI/i,
    why: 'the monitor runs no model; COCO-SSD runs on Security and Wildlife only',
  },
  // Storage and privacy: src/lib/pixel-detection.ts keeps three frames; the
  // ten-minute buffer, human review and the rate limiter exist only in the
  // optional server; src/lib/sync-service.ts does not encrypt.
  { pattern: /5\s*(–|-|&ndash;)\s*10[\s-]*min/i, why: 'the browser keeps three frames, not a 5 to 10 minute buffer' },
  { pattern: /\bblurr?ed\b|\banonymi[sz]/i, why: 'nothing blurs or anonymizes an image (human-review anonymizer returns undefined)' },
  { pattern: /\bencrypt/i, why: 'the sync service sends queued actions with no encryption step' },
  {
    pattern: /thresholds? per[- ]scenario|per[- ]scenario (confidence )?thresholds?/i,
    why: 'the detection threshold is a Security and Wildlife setting only',
  },
  {
    pattern: /misuse patterns|monitor(s|ing)? for misuse|track(s|ing)?\s+(potential\s+)?abuse|abuse prevention/i,
    why: 'safeos.sh has no server and no telemetry, so nothing watches for misuse',
  },
  { pattern: /rate[- ]limitation/i, why: 'safeos.sh has no server, so it rate-limits nothing' },
  { pattern: /systems operational/i, why: 'a fixed string with no status check behind it' },
  {
    pattern: /(data|video|audio|frames?|streams?|feed)\b[^.]{0,30}never leaves?|never leaves? your (device|browser)|always stays? local/i,
    why: 'the model download reaches Google and a connected server receives frames',
  },
  {
    pattern: /no data is sent to external servers|nothing is sent to external servers|all (ml inference|processing) (runs|happens) locally/i,
    why: 'the model download reaches Google and a connected server receives frames',
  },
  {
    pattern: /nothing leaves|processing happens either in your browser/i,
    why: 'a server with a cloud key sends frames to that provider when Ollama is down or fails (analysis-queue.ts)',
  },
  {
    pattern: /kept in memory and clear on reload/i,
    why: 'Monitor alerts are saved in IndexedDB and restored after a reload (monitoring-store.ts)',
  },
  {
    pattern: /gemini-flash-1\.5|gpt-4o-mini|claude-3-haiku/i,
    why: 'src/lib/analysis/cloud-fallback.ts selects other models',
  },
  // Email: src/lib/alerts/notification-manager.ts and the notifications page
  {
    pattern: /Every user of (the|that) deployment can (then )?opt in/i,
    why: 'the server key sends alert email only for an operator owner (notification-manager.ts)',
  },
  {
    pattern: /key[^.]{0,40}(stored in|stays in) (this|your) browser(&apos;|'|’)s local storage|only sent to the (API )?server when an alert (fires|dispatches|is dispatched)/i,
    why: 'the notifications page never saves a personal key (saveToStorage drops it)',
  },
  {
    pattern: /to the same address automatically/i,
    why: 'saving the notifications page does not turn on alert email; the test sends one message',
  },
  // Detection: the monitor runs no model; COCO-SSD runs on Security and Wildlife only
  { pattern: /AI Baby (&|&amp;|and) Pet Monitor|AI monitor for babies|AI-powered monitoring|Free AI monitoring|AI baby monitor|AI pet camera/i, why: 'the baby, pet and elderly monitor runs no model' },
  { pattern: /The AI will/i, why: 'the monitor page runs no model' },
  { pattern: /\bViT\b|transformers\.js/i, why: 'the ViT analyzer is not wired into the app' },
  { pattern: /night vision/i, why: 'nothing implements night vision' },
  { pattern: /unusual (activity|stillness)/i, why: 'nothing detects unusual activity' },
  { pattern: /\bbark(s|ing)?\b|\bmeow/i, why: 'the sound alert is a loudness threshold; it recognises no animal sound' },
  { pattern: /cry (recognition|detection)|distress detection|distinguish between normal sleep sounds/i, why: 'a crying pattern only shows in the overlay; the alert is a loudness threshold' },
  { pattern: /escape attempt|\bescaping\b|\bescaped\b|escape artist/i, why: 'nothing detects an escape; the monitor compares frames' },
  { pattern: /theft prevention|intruder detection/i, why: 'Security counts people in view; it prevents nothing' },
  {
    pattern: /no motion, no inference|only (runs|fires?) when the screening|CV models only fire when/i,
    why: 'while Security is triggered or alerting it runs the model every five seconds without a motion gate (security/page.tsx, forceDetection)',
  },
  { pattern: /motion-triggered recording/i, why: 'Wildlife saves still frames, not recordings' },
  {
    pattern: /\b(wolf|wolves|coyotes?|foxes|fox|deer|rodents?|rabbits?|raccoons?|squirrels?|mice)\b/i,
    why: 'COCO-SSD knows ten animals: dog, cat, bird, horse, sheep, cow, elephant, bear, zebra, giraffe',
  },
  { pattern: /(?<![\d.])(19|18\.0|5|45)\s?MB\b/, why: 'the model download is 18.6 MB (manifest and weights)' },
  // Sensitivity: the monitor's threshold is 100 - sensitivity (monitor/page.tsx)
  {
    pattern: /higher sensitivity[^.]{0,60}fewer alerts|fewer alerts[^.]{0,60}higher sensitivity|Lower values are more sensitive/i,
    why: 'a higher sensitivity lowers the threshold and gives more alerts',
  },
  // Health: nothing measures breathing, illness, falls or confusion
  { pattern: /breath/i, why: 'nothing monitors breathing' },
  { pattern: /\billness|\bsick\b/i, why: 'nothing detects illness' },
  { pattern: /\b(falls|fallen|fall detection)\b(?!\s+back)/i, why: 'nothing detects falls' },
  { pattern: /\bconfusion\b/i, why: 'nothing detects confusion' },
  { pattern: /\bwellness\b/i, why: 'nothing checks anyone\'s wellbeing; the alerts are motion, sound and no movement' },
  { pattern: /health issue|vital signs?|\bapnea\b|heart rate|\bSIDS\b/i, why: 'SafeOS measures no health sign' },
  { pattern: /medical monitoring|medical[- ]device|\bclinical\b|critical[- ]care/i, why: 'SafeOS is not a medical device; only the one sentence says so' },
  { pattern: /"health"/, why: 'the web app is not a health app' },
  // What SafeOS is called
  { pattern: /babysit/i, why: 'SafeOS is never called a babysitter, not even in the negative' },
  { pattern: /\bcarers?\b/i, why: 'SafeOS is never called a carer' },
  { pattern: /security systems?/i, why: 'SafeOS is never described as a security system' },
  // Promises and labels
  { pattern: /legally required/i, why: 'no law requires the setup notice' },
  { pattern: /less than 2 minutes/i, why: 'nothing measures how long setup takes' },
  { pattern: /humanitarian/i, why: 'Frame builds SafeOS and pays for it; it is not labelled as charity work' },
  { pattern: /never charge|always be free|always will be|free forever|will remain completely free|costs?, ever/i, why: 'the free promise is scoped to safeos.sh and the MIT-licensed code' },
  { pattern: /future optional service|usage-based costs/i, why: 'an unbuilt service with possible costs' },
  { pattern: /production-ready|cutting-edge/i, why: 'SafeOS is experimental' },
  { pattern: /coming soon/i, why: 'an empty block for an unbuilt video' },
  // Privacy: GitHub Pages logs each visitor's IP address
  { pattern: /nothing about you is collected|We collect nothing/i, why: 'the host logs each visitor\'s IP address' },
];

type Hit = string;

/** Blanks code comments (keeping line breaks) in a TypeScript source. */
function stripComments(file: string, source: string): string {
  if (!/\.(tsx?|jsx?)$/.test(file)) return source;
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/^[ \t]*\/\/.*$/gm, blank);
}

/** The text a visitor reads in a file: comments blanked, the allowed sentence cut. */
function readable(file: string): string {
  let source = fs.readFileSync(file, 'utf8');
  if (file === README) source = source.slice(0, source.indexOf('\n## Running from source'));
  if (file === CHANGELOG) {
    const start = source.indexOf('## [Unreleased]');
    const end = source.indexOf('\n## [', start + 1);
    source = source.slice(0, start).replace(/[^\n]/g, ' ') + source.slice(start, end < 0 ? undefined : end);
    // The changelog may name the old support address once.
    source = source.replace('`/donate`', '         ');
  }
  source = stripComments(file, source);
  for (const allowed of ALLOWED_SENTENCES) source = source.replace(allowed, (m) => m.replace(/\S/g, ' '));
  return source;
}

/**
 * Collapses whitespace so a phrase split over JSX lines still matches, and
 * keeps the original line of every character for the report.
 */
function collapse(source: string): { text: string; lineOf: number[] } {
  let text = '';
  const lineOf: number[] = [];
  let line = 1;
  let lastWasSpace = false;
  for (const ch of source) {
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        text += ' ';
        lineOf.push(line);
      }
      lastWasSpace = true;
    } else {
      text += ch;
      lineOf.push(line);
      lastWasSpace = false;
    }
    if (ch === '\n') line += 1;
  }
  return { text, lineOf };
}

const rel = (file: string) => path.relative(REPO_ROOT, file);

function findPhrases(phrases: Phrase[], files: string[] = [...SCANNED, README, CHANGELOG]): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const { text, lineOf } = collapse(readable(file));
    for (const { pattern, why } of phrases) {
      const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      for (const match of Array.from(text.matchAll(global))) {
        const at = match.index ?? 0;
        hits.push(`${rel(file)}:${lineOf[at]} "${match[0]}" (${why})`);
      }
    }
  }
  return hits;
}

// -----------------------------------------------------------------------------
// Routes and links
// -----------------------------------------------------------------------------

/** The folder of the route that answers an internal address, or null. */
function routeDir(address: string): string | null {
  const clean = address.split(/[?#]/)[0].replace(/\/+$/, '');
  let dir = app('src', 'app');
  for (const segment of clean.split('/').filter(Boolean)) {
    const next = path.join(dir, segment);
    if (fs.existsSync(next) && fs.statSync(next).isDirectory()) {
      dir = next;
      continue;
    }
    const dynamic = fs.readdirSync(dir).find((name) => /^\[[^\]]+\]$/.test(name));
    if (!dynamic) return null;
    dir = path.join(dir, dynamic);
  }
  return dir;
}

function hasDestination(address: string): boolean {
  const clean = address.split(/[?#]/)[0];
  if (fs.existsSync(app('public', clean)) && fs.statSync(app('public', clean)).isFile()) return true;
  const dir = routeDir(address);
  return !!dir && fs.existsSync(path.join(dir, 'page.tsx'));
}

/** GitHub's anchor for a markdown heading. */
function anchorOf(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s/g, '-');
}

function anchorsIn(markdownFile: string): Set<string> {
  const anchors = new Set<string>();
  for (const line of fs.readFileSync(markdownFile, 'utf8').split('\n')) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) anchors.add(anchorOf(heading[1]));
  }
  return anchors;
}

function linkProblems(): string[] {
  const problems: string[] = [];
  const internal = /(?:href=|href:\s*|quickStartUrl:\s*|learnMoreUrl:\s*)["'](\/(?!\/)[^"']*)["']/g;
  const repoLink = /https:\/\/github\.com\/framerslab\/safeos(?:\/(?:blob|tree)\/master\/([^#"'\s)`]+))?(?:#([\w-]+))?/g;
  for (const file of SCANNED.filter((f) => /\.tsx?$/.test(f))) {
    const source = stripComments(file, fs.readFileSync(file, 'utf8'));
    for (const match of Array.from(source.matchAll(internal))) {
      if (!hasDestination(match[1])) problems.push(`${rel(file)}: ${match[1]} has no page`);
    }
    for (const match of Array.from(source.matchAll(repoLink))) {
      const target = match[1] ? path.join(REPO_ROOT, match[1]) : README;
      if (!fs.existsSync(target)) {
        problems.push(`${rel(file)}: ${match[0]} names a file that does not exist`);
        continue;
      }
      if (match[2] && target.endsWith('.md') && !anchorsIn(target).has(match[2])) {
        problems.push(`${rel(file)}: ${match[0]} names a heading that does not exist`);
      }
    }
  }
  return problems;
}

// -----------------------------------------------------------------------------
// Metadata
// -----------------------------------------------------------------------------

// Every public address and whether search engines may index it.
const METADATA_ROUTES: { route: string; index: boolean }[] = [
  { route: 'about', index: true },
  { route: 'faq', index: true },
  { route: 'help', index: true },
  { route: 'help/integrations', index: true },
  { route: 'help/integrations/ollama', index: true },
  { route: 'help/integrations/push', index: true },
  { route: 'help/integrations/resend', index: true },
  { route: 'help/integrations/telegram', index: true },
  { route: 'help/integrations/twilio', index: true },
  { route: 'tutorials', index: true },
  { route: 'tutorial', index: true },
  { route: 'blog', index: true },
  { route: 'blog/[slug]', index: true },
  { route: 'privacy', index: true },
  { route: 'terms', index: true },
  { route: 'security', index: true },
  { route: 'lost-found', index: true },
  { route: 'lost-found/gallery', index: true },
  { route: 'setup', index: true },
  { route: 'donate', index: false },
];

function metadataProblems(): string[] {
  const problems: string[] = [];
  for (const { route, index } of METADATA_ROUTES) {
    const dir = app('src', 'app', ...route.split('/'));
    const source = ['page.tsx', 'layout.tsx']
      .map((name) => path.join(dir, name))
      .filter((f) => fs.existsSync(f))
      .map((f) => stripComments(f, fs.readFileSync(f, 'utf8')))
      .join('\n');
    if (!/export (const metadata|function generateMetadata)/.test(source)) {
      problems.push(`/${route}: no metadata of its own (it shows the home page's title and card)`);
      continue;
    }
    // pageMetadata() sets the title, description, canonical address, Open
    // Graph and X card from one set of values.
    if (!/pageMetadata\(/.test(source)) {
      problems.push(`/${route}: its social card is not its own (no pageMetadata call)`);
    }
    if (!index && !/noIndex:\s*true/.test(source)) problems.push(`/${route}: not marked noindex`);
  }
  return problems;
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('the public pages say what the software does', () => {
  it('reads every file it names', () => {
    const missing = [...PUBLIC_FILES, README, CHANGELOG].filter((f) => !fs.existsSync(f)).map(rel);
    expect(missing).toEqual([]);
    expect(SCANNED.length).toBeGreaterThan(PUBLIC_FILES.length);
  });

  it('no page uses a money word or asks for money', () => {
    expect(findPhrases(MONEY_WORDS)).toEqual([]);
  });

  it('no page makes a claim the code does not back', () => {
    expect(findPhrases(UNBACKED_CLAIMS)).toEqual([]);
  });

  it('every page that names babies says SafeOS is not a medical device', () => {
    const pages = [
      app('src', 'app', 'page.tsx'),
      ...PUBLIC_ROUTE_DIRS.flatMap((d) => listFiles(d, ['page.tsx'])),
    ];
    const missing: string[] = [];
    for (const page of pages) {
      const layout = path.join(path.dirname(page), 'layout.tsx');
      const own = [page, ...(fs.existsSync(layout) && page !== app('src', 'app', 'page.tsx') ? [layout] : [])]
        .map((f) => stripComments(f, fs.readFileSync(f, 'utf8')))
        .join('\n');
      if (!/\bbab(y|ies)\b/i.test(own)) continue;
      const source = fs.readFileSync(page, 'utf8');
      if (!source.includes('<NotAMedicalDevice') && !source.includes(MEDICAL_SENTENCE)) missing.push(rel(page));
    }
    if (/\bbab(y|ies)\b/i.test(readable(README)) && !fs.readFileSync(README, 'utf8').includes(MEDICAL_SENTENCE)) {
      missing.push(rel(README));
    }
    expect(missing).toEqual([]);
  });

  it('every description of the motion gate names the five-second check during a Security alert', () => {
    const describing = [
      app('src', 'app', 'page.tsx'),
      app('src', 'app', 'blog', '[slug]', 'page.tsx'),
      app('public', 'diagrams', 'how-it-works.svg'),
    ];
    const missing = describing.filter((f) => !/every five seconds/i.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(missing).toEqual([]);
  });

  it('the README names the cloud models the server selects', () => {
    const fallback = fs.readFileSync(path.join(REPO_ROOT, 'src', 'lib', 'analysis', 'cloud-fallback.ts'), 'utf8');
    const models = Array.from(fallback.matchAll(/const \w+_MODEL = '([^']+)'/g)).map((m) => m[1]);
    expect(models.length).toBe(3);
    const readme = readable(README);
    expect(models.filter((m) => !readme.includes(m))).toEqual([]);
  });

  it('the quick-start links name presets that exist and Security opens the Security page', () => {
    const showcase = fs.readFileSync(component('UseCaseShowcase.tsx'), 'utf8');
    const settings = fs.readFileSync(app('src', 'stores', 'settings-store.ts'), 'utf8');
    const unknown = Array.from(showcase.matchAll(/preset=([\w-]+)/g))
      .map((m) => m[1])
      .filter((id) => !new RegExp(`^\\s+${id}: \\{`, 'm').test(settings));
    expect(unknown).toEqual([]);
    const security = showcase.match(/id: 'security'[\s\S]*?quickStartUrl: '([^']+)'/);
    expect(security?.[1].split('?')[0]).toBe('/security');
  });

  it('every internal link and every link into the repository has a destination', () => {
    expect(linkProblems()).toEqual([]);
  });

  it('every public page has its own title, description, canonical address and social card', () => {
    expect(metadataProblems()).toEqual([]);
  });
});
