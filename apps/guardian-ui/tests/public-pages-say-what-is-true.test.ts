/**
 * The public pages say what the software does
 *
 * Reads the source of every page a visitor can open before using the app (the
 * home page, About, FAQ, Help and its guides, Tutorials, Tutorial, the blog,
 * the old support address, Privacy, Terms, Security, Lost & Found and its
 * match gallery, Setup, the dashboard and Nap Mode), every component those
 * pages and the root layout render (listed below with the page that renders
 * it; every file of the folders of the components built in the readable
 * look: the home page's, the visitor header's and footer's, and the app
 * header's and phone bar's), the root layout's
 * metadata, the helper that owns every page's title and cards, the sitemap,
 * the web app manifest, the social card, the README's diagram, the README's
 * product sections (its models, notification channels and privacy among
 * them), the security policy every page's footer links, the quick start
 * guide in docs/, and the changelog's Unreleased section. Code comments are
 * left out: the check is on what a visitor reads. It fails on any phrase from
 * two lists:
 *
 * - money words: SafeOS asks for no money and is not a charity, so no page
 *   says nonprofit, charity, donate, donation, tax-exempt, tax-deductible or
 *   501(c)(3), not even in the negative, and no page asks for a sponsorship
 *   or links the old /donate address (the changelog may name it once);
 * - claims the code does not back: each entry names what the code does
 *   instead, so a failure says why the phrase is untrue.
 *
 * The sample clip's record and its caption and description files say what is
 * in the clip (a kitten grooms itself and a dog barks), so they are read with
 * the money words and the health entries only: a caption that says a dog
 * barks is no claim that SafeOS recognises a bark, and no page says it does.
 *
 * Lost and Found's screens are read for score words too: the comparison is
 * of colours and coarse shape, so a sighting is a question the person
 * checks, never a match, a confidence or a quality.
 *
 * It also checks that every page naming babies carries the not-a-medical-
 * device sentence (the home page is read with the components it renders),
 * that each file describing the motion gate names the five-second check
 * during a Security alert, that the README names the cloud models the server
 * selects, that every public page has its own title, description, canonical
 * address and social card, that every internal link and every link into
 * the repository on GitHub has a destination, and that the blog's links to
 * lines of code are pinned to a commit and open the lines their words name.
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
  'analytics',
  'profiles',
  'blog',
  'donate',
  'privacy',
  'terms',
  'security',
  'lost-found',
  'setup',
  'dashboard',
  'nap',
];
const PUBLIC_ROUTE_DIRS = PUBLIC_ROUTES.map((r) => app('src', 'app', r));

// Single files that must exist: a renamed file must be renamed here too.
// Each component is listed with the page that renders it.
const PUBLIC_FILES = [
  app('src', 'app', 'page.tsx'),
  app('src', 'app', 'layout.tsx'),
  app('src', 'app', 'sitemap.ts'),
  app('src', 'app', 'not-found.tsx'),
  component('home', 'HomeSections.tsx'), // home
  component('home', 'HomeRuns.tsx'), // home
  component('home', 'HomeDetection.tsx'), // home
  component('home', 'UseStartLink.tsx'), // home
  component('home', 'HomeStart.tsx'), // home
  component('visitor', 'VisitorHeader.tsx'), // home and the other public pages
  component('visitor', 'VisitorFooter.tsx'), // home and the other public pages
  component('visitor', 'GitHubLink.tsx'), // visitor header and footer: the link to the code and its star count
  component('visitor', 'MakerMark.tsx'), // visitor footer, About, blog: the makers' marks
  app('src', 'lib', 'github-stars.ts'), // visitor header and footer: the star count's words
  component('visitor', 'LookSwitch.tsx'), // visitor header
  component('visitor', 'StartLink.tsx'), // visitor header and footer, home
  component('layout', 'SiteShell.tsx'), // root layout: every page
  app('src', 'lib', 'page-metadata.ts'), // every public page's title and cards
  component('NotAMedicalDevice.tsx'), // home, FAQ, Help, Tutorials, blog post, Terms
  component('ModelDownloadProgress.tsx'), // Security
  component('CameraFeed.tsx'), // Security
  component('SecurityPanel.tsx'), // Security
  component('IntrusionGallery.tsx'), // Security
  component('LostFoundSetup.tsx'), // Lost & Found
  component('SubjectPreview.tsx'), // Lost & Found
  component('MatchGallery.tsx'), // Lost & Found matches
  component('CameraPicker.tsx'), // Setup
  component('DeviceConnections.tsx'), // Privacy
  component('Logo.tsx'), // header, Setup, not-found
  component('StatusBanner.tsx'), // root layout: every page
  component('KeyboardShortcutsModal.tsx'), // root layout: every page
  component('app', 'AppHeader.tsx'), // app pages
  component('app', 'PhoneBar.tsx'), // app pages but Setup
  app('public', 'manifest.json'),
  app('public', 'og-image.svg'),
  app('public', 'diagrams', 'how-it-works.svg'),
];

const README = path.join(REPO_ROOT, 'README.md');
const CHANGELOG = path.join(REPO_ROOT, 'CHANGELOG.md');
// The security policy: every page's footer links it.
const SECURITY = path.join(REPO_ROOT, 'SECURITY.md');
// The quick start guide, with its tips for each use and its privacy lines.
const QUICKSTART = path.join(REPO_ROOT, 'docs', 'QUICKSTART.md');
// The README's sections read with the pages: all of them before "Running from source".
const README_SECTIONS_READ = ['## How the deep learning runs in your browser', '## Models', '## Notification channels', '## Privacy guarantees'];

// Every file of the components built in the readable look is read, so one
// added there is read too.
const LOOK_COMPONENT_DIRS = [component('home'), component('visitor'), component('app'), component('settings'), component('dashboard'), component('watch')];

const SCANNED = Array.from(new Set([
  ...PUBLIC_FILES,
  ...PUBLIC_ROUTE_DIRS.flatMap((d) => listFiles(d, ['.tsx', '.ts'])),
  ...LOOK_COMPONENT_DIRS.flatMap((d) => listFiles(d, ['.tsx', '.ts'])),
]));

// The sample clip's record and its caption and description files, which say
// what is in the clip, and the record of the Lost and Found example's photos
// of the same kitten.
const CLIP_FILES = [
  app('public', 'home', 'sample-clip.json'),
  app('public', 'home', 'sample-clip.captions.vtt'),
  app('public', 'home', 'sample-clip.descriptions.vtt'),
  app('public', 'home', 'lost-found', 'photos.json'),
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

// Health: nothing measures breathing, illness, falls or confusion. These are
// also the claims the sample clip's own words are held to.
const HEALTH_CLAIMS: Phrase[] = [
  { pattern: /breath/i, why: 'nothing monitors breathing' },
  { pattern: /\billness|\bsick\b/i, why: 'nothing detects illness' },
  { pattern: /\b(falls|fallen|fall detection)\b(?!\s+back)/i, why: 'nothing detects falls' },
  { pattern: /\bconfusion\b/i, why: 'nothing detects confusion' },
  { pattern: /\bwellness\b/i, why: 'nothing checks anyone\'s wellbeing; the alerts are motion, sound and no movement' },
  { pattern: /health issue|vital signs?|\bapnea\b|heart rate|\bSIDS\b/i, why: 'SafeOS measures no health sign' },
  { pattern: /medical monitoring|medical[- ]device|\bclinical\b|critical[- ]care/i, why: 'SafeOS is not a medical device; only the one sentence says so' },
  { pattern: /"health"/, why: 'the web app is not a health app' },
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
  { pattern: /cry (recognition|detection)|distress (detection|calls?)|distinguish between normal sleep sounds/i, why: 'a crying pattern only shows in the overlay; the alert is a loudness threshold' },
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
  ...HEALTH_CLAIMS,
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
  // Storage: Wildlife keeps its sightings with their pictures in localStorage
  // (stores/animal-alert-store.ts); People's frames (stores/security-store.ts and
  // client-db.ts) and the pets (stores/lost-found-store.ts and client-db.ts) are
  // in both localStorage and IndexedDB.
  {
    pattern: /saved frames[^.]{0,100}\b(in|to) (its |(your|the) browser(\\?'|&apos;|’)s )?\[?IndexedDB/i,
    why: 'Wildlife keeps its sightings and their pictures in localStorage; People\'s frames and the pets are in localStorage and IndexedDB',
  },
  // The security policy: src/api/server.ts, src/auth/email-auth.ts,
  // src/api/routes/auth.ts and src/components/BackendSettings.tsx
  {
    pattern: /All AI processing runs in (your|the) browser/i,
    why: 'a server the person runs analyses frames with Ollama, or a cloud provider when Ollama is down or fails (analysis-queue.ts)',
  },
  {
    pattern: /No data leaves your device|Camera feeds are never transmitted/i,
    why: 'the model download reaches Google, the host logs addresses, a spoken alert may use an online voice and the monitor sends frames to a server the person connects',
  },
  { pattern: /\bJWT\b/, why: 'a server session token is 32 random bytes or a random UUID (email-auth.ts generateToken, routes/auth.ts)' },
  {
    pattern: /CORS configured for specific origins/i,
    why: 'name the setting: the server answers the origins in SAFEOS_ALLOWED_ORIGINS, or with none set safeos.sh, the app shells and localhost (server.ts)',
  },
  {
    pattern: /(backend|server) connections require HTTPS|cloud sync uses HTTPS/i,
    why: 'the app saves any server address it is given; nothing in it requires https (BackendSettings.tsx)',
  },
  { pattern: /within 48 hours/i, why: 'no answer time is promised' },
  { pattern: /permission each session/i, why: 'a browser may keep a camera permission between visits' },
  { pattern: /\d+\s?MB IndexedDB/i, why: 'the browser sets how much a site may store; SafeOS sets no figure' },
  { pattern: /Export IndexedDB data/i, why: 'Data on this device exports the settings alone' },
  // The README: public/sw.js, src/lib/ollama/client.ts, the web app's notifications
  { pattern: /activates after tabs[^.]{0,40}close/i, why: 'the service worker skips waiting once the new build is stored whole (public/sw.js)' },
  { pattern: /Every model runs client-side/i, why: 'the optional server runs Ollama and cloud models' },
  { pattern: /~\s?500\s?ms|\b2\s?(–|-|&ndash;)\s?5\s?s\b|\b5\s?(–|-|&ndash;)\s?10\s?s\b/, why: 'no run measured the server models\' latency' },
  { pattern: /llama3\.2-vision/i, why: 'the server pulls and uses moondream and llava:7b alone (ollama/client.ts)' },
  { pattern: /~\s?4\s?GB\b/, why: 'llava:7b is a 4.7 GB download (https://ollama.com/library/llava)' },
  { pattern: /push works straight from/i, why: 'the web app makes no push subscription; its notifications come from the open page' },
  // Lost and Found: nothing measures a fingerprint's size
  { pattern: /(under|<)\s?1\s?KB/i, why: 'nothing measures the size of a fingerprint' },
  // Detection: lib/detection-model.ts asks for WebGL; TensorFlow.js runs on the processor without it
  {
    pattern: /graphics chip(?![^.]{0,100}processor)/i,
    why: 'without hardware WebGL, TensorFlow.js runs the model on the processor, slower (detection-model.ts setBackend)',
  },
  {
    pattern: /(?<!(up to|at most) )twice a second/i,
    why: 'Lost and Found checks every 500 ms only while the device keeps up (monitor/page.tsx setInterval)',
  },
  { pattern: /low-power state/i, why: 'nothing reads or sets the graphics chip\'s power state' },
  // Spoken alerts: People, Wildlife and Lost & Found speak with a voice on this device, and
  // with an online voice once the person chooses one under Spoken alert voice
  // (tts-alerts.ts findSpokenAlertVoice); that voice's maker receives the words.
  {
    pattern: /No cloud uploads|nothing (is )?uploaded in PWA-only/i,
    why: 'a spoken alert in an online voice the person chose sends its words to the browser\'s maker (tts-alerts.ts)',
  },
  {
    pattern: /(speak (their|its) alerts?|a spoken alert) through one of the browser(&apos;|'|’)s voices|can go through one of the browser(&apos;|'|’)s online voices|some voices are an online service/i,
    why: 'spoken alerts use a voice on this device, and an online voice only once the person chooses one (tts-alerts.ts findSpokenAlertVoice)',
  },
];

// Lost and Found's screens: setup, the pet's cards, the gallery, the
// full-screen pictures, the Lost & Found page and its gallery, the watch (the
// notification and the link to the saved pictures) and the store (the spoken
// line).
const LOST_FOUND_SCREENS = [
  component('LostFoundSetup.tsx'),
  component('SubjectPreview.tsx'),
  component('MatchGallery.tsx'),
  component('LostFoundMediaOverlay.tsx'),
  app('src', 'app', 'lost-found', 'page.tsx'),
  app('src', 'app', 'lost-found', 'gallery', 'page.tsx'),
  app('src', 'app', 'monitor', 'page.tsx'),
  app('src', 'stores', 'lost-found-store.ts'),
];

const LOST_FOUND_SCORE_WORDS: Phrase[] = [
  {
    pattern: /Match Detected|Potential Match|potential matches|matches found|consecutive match|Recent Matches|Match History|View Matches|High(est)? Confidence|Current Match Confidence|>\s*Confidence\s*<|% confidence|Fewer, accurate|likelihood of match|has been detected|when detected|colours match|can match too|better matching|improves matching/,
    why: 'Lost and Found compares colours and coarse shape: a sighting is a question the person checks, with no score, percentage or quality word',
  },
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

function findPhrases(phrases: Phrase[], files: string[] = [...SCANNED, README, CHANGELOG, SECURITY, QUICKSTART]): Hit[] {
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

// Files the build writes into public/ before it exports (package.json "prebuild"), each with the
// script that writes it: a link to one has a destination while its script is there.
const BUILT_FILES: Record<string, string> = {
  '/third-party-notices.txt': app('scripts', 'generate-notices.mjs'),
};

function hasDestination(address: string): boolean {
  const clean = address.split(/[?#]/)[0];
  if (BUILT_FILES[clean]) return fs.existsSync(BUILT_FILES[clean]);
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
  { route: 'tutorial', index: false },
  { route: 'blog', index: true },
  { route: 'blog/[slug]', index: true },
  { route: 'privacy', index: true },
  { route: 'terms', index: true },
  { route: 'security', index: false },
  { route: 'lost-found', index: false },
  { route: 'lost-found/gallery', index: true },
  { route: 'wildlife', index: false },
  { route: 'setup', index: false },
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
    // Graph and X card from one set of values. appPageMetadata() sets the
    // same fields and always asks search engines not to index the page.
    if (!/\b(?:pageMetadata|appPageMetadata)\(/.test(source)) {
      problems.push(`/${route}: its social card is not its own (no pageMetadata or appPageMetadata call)`);
    }
    if (!index && !/noIndex:\s*true|\bappPageMetadata\(/.test(source)) problems.push(`/${route}: not marked noindex`);
  }
  return problems;
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('the public pages say what the software does', () => {
  it('reads every file it names', () => {
    const missing = [...PUBLIC_FILES, ...CLIP_FILES, README, CHANGELOG, SECURITY, QUICKSTART].filter((f) => !fs.existsSync(f)).map(rel);
    expect(missing).toEqual([]);
    // The README's models, notification channels and privacy are among its sections read.
    const readme = readable(README);
    expect(README_SECTIONS_READ.filter((heading) => !readme.includes(`\n${heading}\n`))).toEqual([]);
    expect(SCANNED.length).toBeGreaterThan(PUBLIC_FILES.length);
    // The home page's, the visitor shell's, the app frame's, Settings' own
    // rows' and the dashboard's files are among them.
    for (const dir of LOOK_COMPONENT_DIRS) expect([rel(dir), SCANNED.some((f) => f.startsWith(dir + path.sep))]).toEqual([rel(dir), true]);
  });

  it('the sample clip\'s record, captions and descriptions use no money word and make no health claim', () => {
    expect(HEALTH_CLAIMS.length).toBe(8);
    expect(findPhrases([...MONEY_WORDS, ...HEALTH_CLAIMS], CLIP_FILES)).toEqual([]);
  });

  it('the clip\'s words say what is in the clip, and no page says SafeOS recognises a sound', () => {
    // A caption may say a dog barks; that entry of the list is for pages.
    const clipWords = CLIP_FILES.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    expect(clipWords).toMatch(/a dog barks/);
    expect(clipWords).not.toMatch(/recogni[sz]e|detects? (a |the )?bark|SafeOS (hears|knows)/i);
  });

  it('no page uses a money word or asks for money', () => {
    expect(findPhrases(MONEY_WORDS)).toEqual([]);
  });

  it('no Lost and Found screen shows a score word', () => {
    expect(LOST_FOUND_SCREENS.filter((f) => !fs.existsSync(f)).map(rel)).toEqual([]);
    expect(findPhrases(LOST_FOUND_SCORE_WORDS, LOST_FOUND_SCREENS)).toEqual([]);
  });

  it('no page makes a claim the code does not back', () => {
    expect(findPhrases(UNBACKED_CLAIMS)).toEqual([]);
  });

  it('every page that names babies says SafeOS is not a medical device', () => {
    const home = app('src', 'app', 'page.tsx');
    const pages = [
      home,
      ...PUBLIC_ROUTE_DIRS.flatMap((d) => listFiles(d, ['page.tsx'])),
    ];
    // The home page's words are in the components it renders, so it is read with them.
    const homeComponents = listFiles(component('home'), ['.tsx']);
    const missing: string[] = [];
    for (const page of pages) {
      const layout = path.join(path.dirname(page), 'layout.tsx');
      const files = page === home ? [page, ...homeComponents] : [page, ...(fs.existsSync(layout) ? [layout] : [])];
      const own = files.map((f) => stripComments(f, fs.readFileSync(f, 'utf8'))).join('\n');
      if (!/\bbab(y|ies)\b/i.test(own)) continue;
      const source = (page === home ? files : [page]).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
      if (!source.includes('<NotAMedicalDevice') && !source.includes(MEDICAL_SENTENCE)) missing.push(rel(page));
    }
    if (/\bbab(y|ies)\b/i.test(readable(README)) && !fs.readFileSync(README, 'utf8').includes(MEDICAL_SENTENCE)) {
      missing.push(rel(README));
    }
    expect(missing).toEqual([]);
    // The home page names babies, and carries the sentence under its baby entry.
    expect(homeComponents.some((f) => /\bbab(y|ies)\b/i.test(fs.readFileSync(f, 'utf8')))).toBe(true);
  });

  it('every description of the motion gate names the five-second check during a Security alert', () => {
    // The home page describes no gate: it names the four things that set off an alert.
    const describing = [
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

  it('every internal link and every link into the repository has a destination', () => {
    expect(linkProblems()).toEqual([]);
  });

  it('the blog\'s links to lines of code are pinned to a commit, so the lines stay the ones it quotes', () => {
    const blog = stripComments('page.tsx', fs.readFileSync(app('src', 'app', 'blog', '[slug]', 'page.tsx'), 'utf8'));
    const toLines = Array.from(blog.matchAll(/href="(https:\/\/github\.com\/framerslab\/safeos\/blob\/[^"]*(CameraFeed\.tsx|monitor\/page\.tsx|person-detection\.ts)[^"]*)"/g))
      .map((m) => m[1]);
    expect(toLines.length).toBeGreaterThanOrEqual(3);
    expect(toLines.filter((link) => !/\/blob\/[0-9a-f]{40}\/[^#]+#L\d+-L\d+$/.test(link))).toEqual([]);
    // The lines a link opens are the lines its words name, and the reverse.
    const linked = new Set(toLines.map((link) => link.replace(/^.*#L(\d+)-L(\d+)$/, '$1-$2')));
    const named = new Set(Array.from(blog.matchAll(/(?:at lines|around lines|\/\/ lines) (\d+)(?:&ndash;|-)(\d+)/g))
      .map((m) => `${m[1]}-${m[2]}`));
    expect(named.size).toBeGreaterThanOrEqual(3);
    expect(Array.from(named).filter((range) => !linked.has(range))).toEqual([]);
    expect(Array.from(linked).filter((range) => !named.has(range))).toEqual([]);
  });

  it('every public page has its own title, description, canonical address and social card', () => {
    expect(metadataProblems()).toEqual([]);
  });
});
