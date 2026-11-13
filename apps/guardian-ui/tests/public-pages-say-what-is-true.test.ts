/**
 * The public pages say what the software does
 *
 * Reads the source of every page a visitor can open before using the app (the
 * home page and the components it renders, About, FAQ, Help and its guides,
 * Tutorials, Tutorial, the blog, the old support address, Privacy, Terms,
 * Security, Lost & Found), the root layout's metadata, the site header and
 * footer, the sitemap, the web app manifest, the social card and the home
 * page's diagram, and fails on
 * any phrase from two lists:
 *
 * - money words: SafeOS asks for no money and is not a charity, so no page
 *   says nonprofit, charity, donate, donation, tax-exempt, tax-deductible or
 *   501(c)(3), not even in the negative, and no page asks for a sponsorship
 *   or links the old /donate address;
 * - claims the code does not back: each entry names what the code does
 *   instead, so a failure says why the phrase is untrue.
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

// Every file in these route folders is read, so a layout added beside a page
// (for its metadata) is read too.
const PUBLIC_ROUTE_DIRS = [
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
].map((r) => app('src', 'app', r));

// Single files that must exist: a renamed file must be renamed here too.
const PUBLIC_FILES = [
  app('src', 'app', 'page.tsx'),
  app('src', 'app', 'layout.tsx'),
  app('src', 'app', 'sitemap.ts'),
  app('src', 'app', 'lost-found', 'page.tsx'),
  app('src', 'components', 'home', 'HomeCTA.tsx'),
  app('src', 'components', 'UseCaseShowcase.tsx'),
  app('src', 'components', 'NotAMedicalDevice.tsx'),
  app('src', 'components', 'ModelDownloadProgress.tsx'),
  app('src', 'components', 'layout', 'Nav.tsx'),
  app('src', 'components', 'layout', 'Footer.tsx'),
  app('src', 'components', 'layout', 'MobileBottomNav.tsx'),
  app('public', 'manifest.json'),
  app('public', 'og-image.svg'),
  app('public', 'diagrams', 'how-it-works.svg'),
];

// Files a later change may add; read when present.
const OPTIONAL_FILES = [app('src', 'app', 'not-found.tsx')];

const SCANNED = [
  ...PUBLIC_FILES,
  ...OPTIONAL_FILES.filter((f) => fs.existsSync(f)),
  ...PUBLIC_ROUTE_DIRS.flatMap((d) => listFiles(d, ['.tsx', '.ts'])),
];

// The one statement that may name breathing and SIDS (the not-a-medical-device
// line); it is cut out before the phrases are matched.
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
  // Detection: the monitor runs no model; COCO-SSD runs on Security and Wildlife only
  { pattern: /AI Baby (&|&amp;|and) Pet Monitor|AI monitor for babies|AI-powered monitoring|Free AI monitoring|AI baby monitor|AI pet camera/i, why: 'the baby, pet and elderly monitor runs no model' },
  { pattern: /The AI will/i, why: 'the monitor page runs no model' },
  { pattern: /\bViT\b|transformers\.js/i, why: 'the ViT analyzer is not wired into the app' },
  { pattern: /night vision/i, why: 'nothing implements night vision' },
  { pattern: /unusual (activity|stillness)/i, why: 'nothing detects unusual activity' },
  { pattern: /\bbark(s|ing)?\b|\bmeow/i, why: 'the sound alert is a loudness threshold; it recognises no animal sound' },
  { pattern: /cry (recognition|detection)|distress detection|distinguish between normal sleep sounds/i, why: 'a crying pattern only shows in the overlay; the alert is a loudness threshold' },
  { pattern: /motion-triggered recording/i, why: 'Wildlife saves still frames, not recordings' },
  {
    pattern: /\b(wolf|wolves|coyotes?|foxes|fox|deer|rodents?|rabbits?|raccoons?|squirrels?|mice)\b/i,
    why: 'COCO-SSD knows ten animals: dog, cat, bird, horse, sheep, cow, elephant, bear, zebra, giraffe',
  },
  { pattern: /(?<![\d.])(19|18\.0|5|45)\s?MB\b/, why: 'the model download is 18.6 MB (manifest and weights)' },
  // Health: nothing measures breathing, illness, falls or confusion
  { pattern: /breath/i, why: 'nothing monitors breathing' },
  { pattern: /\billness|\bsick\b/i, why: 'nothing detects illness' },
  { pattern: /\b(falls|fallen|fall detection)\b(?!\s+back)/i, why: 'nothing detects falls' },
  { pattern: /\bconfusion\b/i, why: 'nothing detects confusion' },
  { pattern: /health issue|vital signs?|\bapnea\b|heart rate|\bSIDS\b/i, why: 'SafeOS measures no health sign' },
  { pattern: /medical monitoring|\bclinical\b|critical[- ]care/i, why: 'SafeOS is not a medical device' },
  { pattern: /"health"/, why: 'the web app is not a health app' },
  // Promises and labels
  { pattern: /legally required/i, why: 'no law requires the setup notice' },
  { pattern: /less than 2 minutes/i, why: 'nothing measures how long setup takes' },
  { pattern: /humanitarian/i, why: 'Frame builds SafeOS and pays for it; it is not labelled as charity work' },
  { pattern: /never charge|always be free|always will be|free forever|will remain completely free|costs?, ever/i, why: 'the free promise is scoped to safeos.sh and the MIT-licensed code' },
  { pattern: /future optional service|usage-based costs/i, why: 'an unbuilt service with possible costs' },
  { pattern: /production-ready|cutting-edge/i, why: 'SafeOS is experimental' },
  { pattern: /coming soon/i, why: 'an empty block for an unbuilt video' },
];

type Hit = string;

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

function findPhrases(phrases: Phrase[]): Hit[] {
  const hits: Hit[] = [];
  for (const file of SCANNED) {
    let source = fs.readFileSync(file, 'utf8');
    for (const allowed of ALLOWED_SENTENCES) source = source.replace(allowed, (m) => m.replace(/\S/g, ' '));
    const { text, lineOf } = collapse(source);
    for (const { pattern, why } of phrases) {
      const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      for (const match of Array.from(text.matchAll(global))) {
        const at = match.index ?? 0;
        hits.push(`${path.relative(REPO_ROOT, file)}:${lineOf[at]} "${match[0]}" (${why})`);
      }
    }
  }
  return hits;
}

describe('the public pages say what the software does', () => {
  it('reads every file it names', () => {
    const missing = PUBLIC_FILES.filter((f) => !fs.existsSync(f)).map((f) => path.relative(REPO_ROOT, f));
    expect(missing).toEqual([]);
    expect(SCANNED.length).toBeGreaterThan(PUBLIC_FILES.length);
  });

  it('no page uses a money word or asks for money', () => {
    expect(findPhrases(MONEY_WORDS)).toEqual([]);
  });

  it('no page makes a claim the code does not back', () => {
    expect(findPhrases(UNBACKED_CLAIMS)).toEqual([]);
  });
});
