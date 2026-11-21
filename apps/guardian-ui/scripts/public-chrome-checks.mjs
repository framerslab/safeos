// Checks what every public page shares, on the built static site in a real
// browser: the header's row and its links, the GitHub link with the
// repository's star count, the keys, the footer's makers and About's part on
// who builds SafeOS.
//
// scripts/home-checks.mjs runs it at the end of its own walk, for the pull
// request's own build. It walks:
// - the row at 820, 1024, 1280, 1440 and 1920 pixels in both looks: four
//   links at a tablet, Privacy as the fifth from 1024 pixels, GitHub with its
//   count between the links and the look switch; a hovered link beside the
//   page being read;
// - the start key at 820 and 1280 pixels: one width for "Start setup" and
//   "Open dashboard", so nothing beside it moves once setup is done;
// - a row that runs short, text growing step by step at 1100 pixels: GitHub
//   leaves first, then Privacy, then the links move into the Menu, and the
//   row never runs off the screen;
// - the Menu's start row and its GitHub row at 390 pixels;
// - every request each public page and each app page makes while it loads
//   and for ten seconds after: none goes to a host but the site's own;
// - the keys of every public page: 6 pixel corners, 44 pixels tall or more,
//   one fill, and no key of the older set;
// - the key sheet: the four kinds of key laid out on a public page with the
//   site's own stylesheet, each at rest, under the pointer, focused, pressed
//   and inactive, in both looks. Each form is pictured, its label, edge, ring
//   and glyph are measured from the picture's pixels, and the pictures are
//   set side by side as keys-sheet-<look>.png;
// - the footer's makers and its GitHub link at 390, 820 and 1280 pixels,
//   every row of it on one line, and
//   About's part at 390, 820 and 1280 pixels.
// It returns its findings as sentences; any finding fails the run.
import path from 'node:path';

const LOOKS = ['light', 'dark'];
const REPOSITORY = 'https://github.com/framerslab/safeos';
const WALK_LIMIT_MS = 180_000;
// The bars fixed to the screen would cover a part taller than it, so they are
// left out of the pictures of a part.
const NO_BARS = 'nav[aria-label="Site"], nav[aria-label="Mobile navigation"] { visibility: hidden !important; }';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The look's colours as a browser reports them (src/styles/design-system.css
// and the visitor pages' quiet tone in the light look).
export const TONES = {
  dark: {
    page: 'rgb(11, 19, 27)', panel: 'rgb(16, 26, 36)', ink: 'rgb(244, 245, 246)', quiet: 'rgb(196, 201, 209)', line: 'rgb(156, 163, 175)',
    accent: 'rgb(74, 222, 128)', accentHover: 'rgb(134, 239, 172)', onAccent: 'rgb(11, 19, 27)',
  },
  light: {
    page: 'rgb(248, 249, 250)', panel: 'rgb(241, 243, 244)', ink: 'rgb(15, 18, 21)', quiet: 'rgb(33, 37, 41)', line: 'rgb(73, 80, 87)',
    accent: 'rgb(20, 83, 45)', accentHover: 'rgb(5, 46, 22)', onAccent: 'rgb(255, 255, 255)',
  },
};

const PUBLIC_PAGES = ['/', '/about/', '/faq/', '/tutorials/', '/blog/', '/blog/how-safeos-guardian-works/', '/privacy/', '/terms/', '/help/', '/help/integrations/telegram/', '/404.html'];
const APP_PAGES = ['/dashboard/', '/monitor/', '/history/', '/settings/', '/setup/', '/security/', '/wildlife/', '/lost-found/'];
// The pages whose keys are read one by one.
const KEY_PAGES = ['/', '/about/', '/faq/', '/tutorials/', '/blog/', '/privacy/', '/terms/', '/404.html'];

/**
 * The star count the build was handed, with the words the pages make of it;
 * null when the build was handed none. This is the walk's own reading of the
 * rule (the number cut down, never rounded up), written apart from the app's
 * (src/lib/github-stars.ts) so that one checks the other.
 */
export function starsHanded(env = process.env) {
  const count = env.NEXT_PUBLIC_GITHUB_STARS || '';
  const day = env.NEXT_PUBLIC_GITHUB_STARS_DATE || '';
  if (!/^[1-9]\d{0,8}$/.test(count) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const n = Number(count);
  const [year, month, date] = day.split('-').map(Number);
  // A day the calendar does not have (2026-02-30) is no day, as the app reads it.
  const probe = new Date(Date.UTC(year, month - 1, date));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== date) return null;
  const tenth = (unit) => { const tenths = Math.floor(n / (unit / 10)); return `${Math.floor(tenths / 10)}${tenths % 10 ? `.${tenths % 10}` : ''}`; };
  const short = n < 1_000 ? String(n) : n < 100_000 ? `${tenth(1_000)}k` : n < 1_000_000 ? `${Math.floor(n / 1_000)}k` : `${tenth(1_000_000)}M`;
  const word = n === 1 ? 'star' : 'stars';
  const exact = `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ${word}`;
  const counted = `${date} ${MONTHS[month - 1]} ${year}`;
  return {
    count: n,
    short,
    word,
    exact,
    name: `SafeOS on GitHub ${short} ${word}`,
    description: n < 1_000 ? `Counted ${counted}.` : `${exact}, counted ${counted}.`,
    sentence: `${exact} on GitHub, counted ${counted}.`,
  };
}

// A person who has finished setup on this device.
const SETUP_DONE = () => {
  localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
    isComplete: true, selectedScenario: 'pet',
    acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
  }, version: 0 }));
  localStorage.setItem('guardian-onboarding-complete', 'true');
};

const numbers = (colour) => (colour.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const linear = (value) => { const s = value / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
/** The contrast of two colours, each "rgb(r, g, b)" or [r, g, b]. */
const contrast = (a, b) => {
  const [first, second] = [a, b].map((colour) => luminance(typeof colour === 'string' ? numbers(colour) : colour));
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};
const rgb = (triple) => `rgb(${triple.join(', ')})`;

// Runs in a blank page. Reads a picture's pixels: the colour at each point
// asked for; in each strip asked for, the colour furthest in contrast from
// the picture's first pixel that fills three pixels or more (an edge, a ring
// or a glyph, drawn at full strength somewhere along the strip); and, for the
// words in the box asked for, the same figures the readability rule reads:
// the ground is the box's commonest colour, the ink every pixel at 1.5:1 or
// more from it on the words' side, the core the median of the ink's
// strongest 4 per cent, and the strokes the median of the ink at least half
// way (in contrast) from the ground to the core. The strokes' figure keeps
// the anti-aliased half of each stroke; the minimum is held to it.
function readPicture({ base64, points = [], strips = [], words = null }) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('the picture of the key did not load'));
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const drawing = canvas.getContext('2d');
      drawing.drawImage(image, 0, 0);
      const { data, width, height } = drawing.getImageData(0, 0, canvas.width, canvas.height);
      const lin = (value) => { const s = value / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      const light = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const at = (x, y) => { const i = (Math.round(y) * width + Math.round(x)) * 4; return [data[i], data[i + 1], data[i + 2]]; };
      const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
      const corner = at(0, 0);
      const cornerLight = light(...corner);
      const out = { corner, points: points.map(([x, y]) => (inside(x, y) ? at(x, y) : null)), strips: [], words: null };
      for (const strip of strips) {
        const seen = new Map();
        for (let y = Math.max(0, strip.y); y < Math.min(height, strip.y + strip.height); y += 1) {
          for (let x = Math.max(0, strip.x); x < Math.min(width, strip.x + strip.width); x += 1) {
            const colour = at(x, y);
            const key = colour.join(',');
            seen.set(key, (seen.get(key) || 0) + 1);
          }
        }
        let best = null;
        for (const [key, count] of seen) {
          if (count < 3) continue;
          const colour = key.split(',').map(Number);
          const figure = ratio(light(...colour), cornerLight);
          if (!best || figure > best.ratio) best = { colour, ratio: figure };
        }
        out.strips.push(best);
      }
      if (words) {
        const pixels = [];
        for (let y = Math.max(0, words.y); y < Math.min(height, words.y + words.height); y += 1) {
          for (let x = Math.max(0, words.x); x < Math.min(width, words.x + words.width); x += 1) pixels.push(at(x, y));
        }
        const median = (list) => [0, 1, 2].map((channel) => { const values = list.map((colour) => colour[channel]).sort((a, b) => a - b); return values[Math.floor(values.length / 2)]; });
        const buckets = new Map();
        for (const colour of pixels) {
          const key = ((colour[0] >> 4) << 8) | ((colour[1] >> 4) << 4) | (colour[2] >> 4);
          buckets.set(key, (buckets.get(key) || 0) + 1);
        }
        const top = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const first = median(pixels.filter((colour) => (((colour[0] >> 4) << 8) | ((colour[1] >> 4) << 4) | (colour[2] >> 4)) === top));
        const ground = median(pixels.filter((colour) => [0, 1, 2].every((channel) => Math.abs(colour[channel] - first[channel]) <= 12)));
        const groundLight = light(...ground);
        const lights = pixels.map((colour) => light(...colour));
        const lighter = lights.filter((value) => value > groundLight && ratio(value, groundLight) >= 1.5).length;
        const darker = lights.filter((value) => value < groundLight && ratio(value, groundLight) >= 1.5).length;
        const wordsLighter = lighter >= darker;
        const ink = [];
        for (let i = 0; i < pixels.length; i += 1) {
          if (ratio(lights[i], groundLight) >= 1.5 && (lights[i] > groundLight) === wordsLighter) ink.push(i);
        }
        if (ink.length >= 20) {
          const distance = (i) => Math.abs(Math.log(ratio(lights[i], groundLight)));
          const distances = ink.map(distance).sort((a, b) => b - a);
          const strongest = Math.max(Math.min(ink.length, 6), Math.round(ink.length * 0.04));
          const cut = distances[strongest - 1];
          const core = median(ink.filter((i) => distance(i) >= cut).map((i) => pixels[i]));
          const coreRatio = ratio(light(...core), groundLight);
          const half = ink.filter((i) => distance(i) >= 0.5 * Math.log(coreRatio));
          const strokes = half.length ? median(half.map((i) => pixels[i])) : core;
          out.words = { ground, core: coreRatio, strokes: ratio(light(...strokes), groundLight) };
        }
      }
      resolve(out);
    };
    image.src = `data:image/png;base64,${base64}`;
  });
}

// Runs in the page. Lays the four kinds of key out on the page's own ground,
// over the page, with the site's own classes and nothing else: no band, no
// caption. Each key stands on whole pixels, so an edge is one pixel wide in
// the picture.
function layKeySheet() {
  const glyph = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const sheet = document.createElement('div');
  sheet.id = 'key-sheet';
  sheet.tabIndex = -1;
  sheet.style.cssText = 'position:fixed;inset:0;z-index:1000;overflow:auto;box-sizing:border-box;padding:32px;background:var(--color-steel-950);display:grid;grid-template-columns:repeat(4,272px);grid-auto-rows:72px;gap:0 32px;align-content:start;align-items:center;justify-items:start;';
  // The page behind the sheet stays where it is: a stop of the sheet's own
  // comes before its first key, so going back one stop from a key never
  // leaves the sheet, and nothing scrolls while a picture is taken.
  document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important');
  sheet.innerHTML = [
    '<span tabindex="0" data-key="before" style="position:absolute;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0"></span>',
    '<button type="button" class="key key--solid" data-key="solid">Start setup</button>',
    '<button type="button" class="key key--solid" data-key="solid-inactive" aria-disabled="true">Starting the camera…</button>',
    '<button type="button" class="key key--outline" data-key="outline">Try again</button>',
    '<button type="button" class="key key--outline" data-key="outline-inactive" aria-disabled="true">Starting the camera…</button>',
    '<a href="#key-sheet" class="site-header__link" data-key="link">Guides</a>',
    '<a href="#key-sheet" class="site-header__link" aria-current="page" data-key="link-current">FAQ</a>',
    '<a href="#key-sheet" class="link-row" data-key="link-row">Read the code on GitHub</a>',
    '<button type="button" class="key key--word" data-key="word">Menu</button>',
    `<button type="button" class="key--icon" data-key="icon" aria-label="Close">${glyph('M6 6l12 12M18 6 6 18')}</button>`,
    `<button type="button" class="key--icon" data-key="icon-inactive" aria-label="Scroll right" aria-disabled="true">${glyph('M5 12h14M13 6l6 6-6 6')}</button>`,
  ].join('');
  document.querySelector('.visitor-shell').appendChild(sheet);
}

// Runs in the page. What a key is, as the browser computes it.
function readKey(name) {
  const element = document.querySelector(`[data-key="${name}"]`);
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  return {
    box: { x: box.left, y: box.top, width: box.width, height: box.height },
    radius: style.borderTopLeftRadius,
    fill: style.backgroundColor,
    colour: style.color,
    weight: style.fontWeight,
    size: style.fontSize,
    face: style.fontFamily.split(',')[0],
    edge: `${style.borderLeftWidth} ${style.borderLeftStyle} ${style.borderLeftColor}`,
    ring: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor} ${style.outlineOffset}`,
    ringShown: element.matches(':focus-visible'),
    transform: style.transform,
    opacity: style.opacity,
    underline: `${style.textDecorationLine} ${style.textDecorationThickness} ${style.textDecorationColor}`,
    cursor: style.cursor,
    focused: document.activeElement === element,
  };
}

// The controls whose names are read: the header's and the footer's buttons,
// every icon key and the look switch.
const NAMED_CONTROLS = 'nav[aria-label="Site"] button, footer.site-footer button, .key--icon, .look-switch';

/**
 * The key of an aria snapshot's line, as YAML reads it. Playwright writes the
 * key bare, or in single quotes with each quote inside doubled when the name
 * needs it (a colon and a space, for one): `- 'button "Close: Menu"':` gives
 * `button "Close: Menu"`. A bare key ends at a colon with a space or the end
 * after it, which a bare key cannot hold.
 */
export function snapshotKey(line) {
  const rest = line.replace(/^\s*- /, '');
  if (rest.startsWith("'")) {
    let key = '';
    for (let i = 1; i < rest.length; i += 1) {
      if (rest[i] !== "'") key += rest[i];
      else if (rest[i + 1] === "'") {
        key += "'";
        i += 1;
      } else break;
    }
    return key;
  }
  const end = rest.search(/:(\s|$)/);
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * How many of a page's shown controls have no accessible name, as Playwright's
 * accessibility tree works it out (accname 1.2: aria-labelledby through
 * elements that exist, hidden parts left out unless the label itself is
 * hidden). A named control's snapshot opens with its role and its name in
 * quotes; an unnamed one gives its role alone.
 */
export async function unnamedControls(page, selector = NAMED_CONTROLS) {
  const controls = page.locator(selector);
  let unnamed = 0;
  const count = await controls.count();
  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i);
    if (!(await control.isVisible())) continue;
    const key = snapshotKey((await control.ariaSnapshot()).split('\n')[0]);
    if (!/^[\w-]+ ["/]/.test(key)) unnamed += 1;
  }
  return unnamed;
}

export async function checkPublicChrome(browser, baseUrl, outDir) {
  const problems = [];
  const fail = (message) => problems.push(message);
  const expect = (ok, message) => { if (!ok) fail(message); };
  const origin = new URL(baseUrl).origin;
  const address = (route) => new URL(route, baseUrl).toString();
  const stars = starsHanded();
  console.log(stars ? `public chrome: the build was handed ${stars.exact}; the row shows ${stars.short}` : 'public chrome: the build was handed no star count; the GitHub link is its word alone');

  const open = async (options, run) => {
    const { name, width, height = 800, look = 'light', setupDone = false, ...rest } = options;
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: width < 768,
      hasTouch: width < 768,
      colorScheme: look,
      deviceScaleFactor: 1,
      ...rest,
    });
    if (setupDone) await context.addInitScript(SETUP_DONE);
    const page = await context.newPage();
    let limit;
    const ranOver = new Promise((_, reject) => {
      limit = setTimeout(() => reject(new Error(`did not finish in ${WALK_LIMIT_MS / 1000} seconds`)), WALK_LIMIT_MS);
    });
    try {
      await Promise.race([run(page, context), ranOver]);
    } catch (err) {
      fail(`${name} at ${width} px, ${look}: ${String(err.message).split('\n')[0]}`);
    } finally {
      clearTimeout(limit);
      await context.close();
    }
  };
  const visit = (page, route = '/') => page.goto(address(route), { waitUntil: 'networkidle', timeout: 60_000 });
  const inter = (face) => /inter/i.test(face);

  // ---------------------------------------------------------------------------
  // The row's links and GitHub with its count
  // ---------------------------------------------------------------------------

  // Runs in the page. The row as a visitor sees it.
  const readRow = () => {
    const visible = (element) => !!element && element.getBoundingClientRect().width > 0 && getComputedStyle(element).visibility !== 'hidden';
    const box = (element) => { const b = element.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, width: b.width, height: b.height }; };
    const type = (element) => {
      const style = getComputedStyle(element);
      return { face: style.fontFamily.split(',')[0], size: style.fontSize, line: style.lineHeight, weight: style.fontWeight, colour: style.color, figures: style.fontVariantNumeric, underline: `${style.textDecorationLine} ${style.textDecorationThickness} ${style.textDecorationColor}` };
    };
    const nav = document.querySelector('nav[aria-label="Site"]');
    const bar = nav.querySelector('.site-header__bar');
    const links = [...nav.querySelectorAll('.site-header__links a')].filter(visible);
    const github = bar.querySelector('.site-header__github');
    const piece = github?.querySelector('.star-count');
    const word = piece?.querySelector('[translate="no"]');
    const star = piece?.querySelector('svg');
    const number = piece?.querySelector('.num');
    const described = github?.getAttribute('aria-describedby');
    return {
      links: links.map((link) => ({ words: link.textContent.trim(), ...type(link), ...box(link), current: link.getAttribute('aria-current') })),
      menuKey: visible(nav.querySelector('.site-header__menu-key')),
      over: bar.scrollWidth > bar.clientWidth + 1,
      short: nav.getAttribute('data-short'),
      collapsed: nav.getAttribute('data-collapsed'),
      lookSwitch: box(nav.querySelector('.look-switch, .look-switch-place')),
      github: visible(github) ? {
        ...box(github),
        ...type(github),
        label: github.getAttribute('aria-label'),
        href: github.getAttribute('href'),
        target: github.getAttribute('target'),
        current: github.getAttribute('aria-current'),
        words: github.textContent.replace(/\s+/g, ' ').trim(),
        described: described ? document.getElementById(described)?.textContent.trim() ?? null : null,
        pictures: github.querySelectorAll('img').length,
        glyphs: github.querySelectorAll('svg').length,
        word: word ? box(word) : null,
        star: star ? { ...box(star), hidden: star.getAttribute('aria-hidden'), stroke: getComputedStyle(star.querySelector('path')).stroke, fill: getComputedStyle(star.querySelector('path')).fill } : null,
        number: number ? { ...box(number), ...type(number), words: number.textContent } : null,
      } : null,
    };
  };

  for (const width of [820, 1024, 1280, 1440, 1920]) {
    for (const look of LOOKS) {
      await open({ name: 'row', width, height: width >= 1440 ? 900 : 800, look }, async (page) => {
        await visit(page);
        const tone = TONES[look];
        const at = `row at ${width} px, ${look}`;
        const row = await page.evaluate(readRow);
        const wanted = width < 1024 ? 'How it works, Uses, Guides, FAQ' : 'How it works, Uses, Guides, FAQ, Privacy';
        expect(row.links.map((link) => link.words).join(', ') === wanted, `${at}: the links are ${row.links.map((link) => link.words).join(', ')}`);
        expect(!row.menuKey && !row.over, `${at}: the row shows a Menu key or runs off the screen`);
        for (const link of row.links) {
          expect(inter(link.face) && link.size === '16px' && link.line === '24px' && link.weight === '400', `${at}: "${link.words}" is set in ${link.face} ${link.weight} at ${link.size} on ${link.line}`);
          expect(link.colour === tone.quiet && link.underline.startsWith('none'), `${at}: "${link.words}" at rest is ${link.colour} with ${link.underline}`);
          expect(link.height >= 43.5, `${at}: "${link.words}" is ${link.height} px tall`);
        }
        if (width < 1024) {
          expect(!row.github, `${at}: the row holds a GitHub link`);
          return;
        }
        const github = row.github;
        expect(!!github, `${at}: the row holds no GitHub link`);
        if (!github) return;
        const last = row.links[row.links.length - 1];
        expect(github.left >= last.right && github.right <= row.lookSwitch.left, `${at}: GitHub does not stand between the links and the look switch (${Math.round(github.left)} to ${Math.round(github.right)})`);
        expect(github.href === REPOSITORY && !github.target && !github.current, `${at}: the GitHub link opens ${github.href}${github.target ? ` in ${github.target}` : ''}${github.current ? ', marked as the page being read' : ''}`);
        expect(github.pictures === 0 && github.height >= 43.5, `${at}: the GitHub link holds a picture or is ${github.height} px tall`);
        expect(github.colour === tone.quiet && inter(github.face) && github.size === '16px' && github.weight === '400', `${at}: the GitHub link is ${github.colour} in ${github.face} ${github.weight} at ${github.size}`);
        const named = page.locator('nav[aria-label="Site"] .site-header__bar').getByRole('link', { name: stars ? stars.name : 'SafeOS on GitHub', exact: true });
        expect((await named.count()) === 1, `${at}: no link of the row is named "${stars ? stars.name : 'SafeOS on GitHub'}"`);
        if (!stars) {
          expect(github.label === 'SafeOS on GitHub' && github.words === 'GitHub' && github.glyphs === 0, `${at}: with no count the GitHub link reads "${github.words}" with ${github.glyphs} glyphs`);
          return;
        }
        expect(github.label === null && github.words === stars.name, `${at}: the GitHub link's own content reads "${github.words}"`);
        expect(github.described === stars.description, `${at}: the GitHub link is described as "${github.described}"`);
        expect(github.glyphs === 1 && github.star?.hidden === 'true', `${at}: the GitHub link holds ${github.glyphs} glyphs`);
        expect(github.width >= 88, `${at}: the GitHub link is ${github.width} px wide`);
        const missing = [['word', github.word], ['star', github.star], ['count', github.number]].filter(([, part]) => !part).map(([name]) => name);
        expect(missing.length === 0, `${at}: the GitHub link shows no ${missing.join(', no ')}`);
        if (missing.length > 0) return;
        expect(Math.abs(github.star.width - 16) < 0.5 && Math.abs(github.star.height - 16) < 0.5, `${at}: the star is ${github.star.width} by ${github.star.height} px`);
        expect(github.star.stroke === github.colour && github.star.fill === 'none', `${at}: the star is drawn ${github.star.stroke} with the fill ${github.star.fill}, not outlined in the link's tone`);
        expect(github.number.words === stars.short, `${at}: the count reads "${github.number.words}", not ${stars.short}`);
        expect(/tabular-nums/.test(github.number.figures) && github.number.size === '16px' && github.number.line === '24px' && github.number.weight === '400' && github.number.colour === tone.quiet,
          `${at}: the count is set ${github.number.figures} ${github.number.weight} at ${github.number.size} in ${github.number.colour}`);
        const gaps = [github.star.left - github.word.right, github.number.left - github.star.right];
        expect(gaps.every((gap) => Math.abs(gap - 6) < 0.75), `${at}: the word, the star and the count are ${gaps.map((gap) => gap.toFixed(1)).join(' and ')} px apart`);
        // Under the pointer: the ink, with a 1 px ink underline.
        await page.locator('nav[aria-label="Site"] .site-header__bar .site-header__github').hover();
        await page.waitForTimeout(150);
        const hovered = (await page.evaluate(readRow)).github;
        expect(hovered.colour === tone.ink && hovered.underline === `underline 1px ${tone.ink}`, `${at}: the hovered GitHub link is ${hovered.colour} with ${hovered.underline}`);
        if (width === 1280) await page.locator('nav[aria-label="Site"]').screenshot({ path: path.join(outDir, `header-github-hover-1280-${look}.png`) });
      });
    }
  }

  // A hovered link beside the page being read: 1 px in the ink against 2 px
  // in the look's green.
  for (const look of LOOKS) {
    await open({ name: 'row, the page being read', width: 1280, look }, async (page) => {
      await visit(page, '/faq/');
      const tone = TONES[look];
      await page.locator('nav[aria-label="Site"] .site-header__links').getByRole('link', { name: 'Guides', exact: true }).hover();
      await page.waitForTimeout(150);
      const links = (await page.evaluate(readRow)).links;
      const guides = links.find((link) => link.words === 'Guides');
      const faq = links.find((link) => link.words === 'FAQ');
      expect(guides?.colour === tone.ink && guides?.underline === `underline 1px ${tone.ink}`, `row on /faq/, ${look}: the hovered "Guides" is ${guides?.colour} with ${guides?.underline}`);
      expect(faq?.current === 'page' && faq?.colour === tone.ink && faq?.underline === `underline 2px ${tone.accent}`, `row on /faq/, ${look}: "FAQ" is ${faq?.colour} with ${faq?.underline}, aria-current ${faq?.current}`);
      await page.locator('nav[aria-label="Site"]').screenshot({ path: path.join(outDir, `header-faq-hover-1280-${look}.png`) });
    });
  }

  // The start key holds one width for its two labels, so nothing beside it
  // moves once setup is done on this device: the same width and the same
  // left edge for "Start setup" and "Open dashboard", at least 160 px.
  for (const width of [820, 1280]) {
    const seen = {};
    for (const setupDone of [false, true]) {
      const words = setupDone ? 'Open dashboard' : 'Start setup';
      await open({ name: `start key, ${setupDone ? 'set up' : 'first visit'}`, width, setupDone }, async (page) => {
        await visit(page);
        await page.locator('nav[aria-label="Site"] .site-header__start').filter({ hasText: words }).waitFor({ timeout: 10_000 });
        seen[words] = await page.evaluate(() => {
          const nav = document.querySelector('nav[aria-label="Site"]');
          const key = nav.querySelector('.site-header__start').getBoundingClientRect();
          const look = nav.querySelector('.look-switch, .look-switch-place').getBoundingClientRect();
          return { left: key.left, width: key.width, look: look.left };
        });
      });
    }
    const first = seen['Start setup'];
    const done = seen['Open dashboard'];
    if (!first || !done) continue;
    const at = `start key at ${width} px`;
    expect(first.width >= 160 && done.width >= 160, `${at}: "Start setup" is ${first.width} px wide and "Open dashboard" ${done.width} px, under 160`);
    expect(Math.abs(first.width - done.width) < 0.5 && Math.abs(first.left - done.left) < 0.5,
      `${at}: "Start setup" is ${first.width} px wide from ${first.left} px and "Open dashboard" ${done.width} px wide from ${done.left} px`);
    expect(Math.abs(first.look - done.look) < 0.5, `${at}: the look switch moves from ${first.look} px to ${done.look} px once setup is done`);
  }

  // A row that runs short: with the window at 1100 px the text grows in
  // steps of 2 per cent. GitHub leaves first, then Privacy, then the links
  // and the start key move into the Menu; the row never runs off the screen.
  await open({ name: 'row, running short', width: 1100 }, async (page) => {
    await visit(page);
    const stages = [];
    for (let size = 100; size <= 200; size += 2) {
      await page.evaluate((value) => {
        document.documentElement.style.setProperty('font-size', `${value}%`, 'important');
        window.dispatchEvent(new Event('resize'));
      }, size);
      await page.waitForTimeout(200);
      const row = await page.evaluate(readRow);
      const names = row.links.map((link) => link.words);
      const stage = row.menuKey ? 3 : !names.includes('Privacy') ? 2 : !row.github ? 1 : 0;
      stages.push(stage);
      expect(!row.over, `row running short, text at ${size} per cent: the row runs off the screen`);
      if (stage === 2) expect(!row.github && names.join(', ') === 'How it works, Uses, Guides, FAQ', `row running short, text at ${size} per cent: with Privacy out the row holds ${names.join(', ')}${row.github ? ' and GitHub' : ''}`);
      if (stage === 3) expect(names.length === 0 && !row.github, `row running short, text at ${size} per cent: the Menu key shows beside ${names.join(', ')}`);
    }
    expect(stages[0] === 0, `row running short: at the usual text size the row is at stage ${stages[0]}`);
    expect(stages.every((stage, index) => index === 0 || stage >= stages[index - 1]), `row running short: the stages went ${stages.join('')}`);
    expect([0, 1, 2, 3].every((stage) => stages.includes(stage)), `row running short: not every stage was seen (GitHub out, then Privacy out, then the Menu): ${stages.join('')}`);
  });

  // ---------------------------------------------------------------------------
  // The Menu's start row and its GitHub row
  // ---------------------------------------------------------------------------

  for (const look of LOOKS) {
    await open({ name: 'Menu rows', width: 390, height: 844, look }, async (page) => {
      await visit(page);
      const tone = TONES[look];
      await page.locator('nav[aria-label="Site"] button.site-header__menu-key').click();
      await page.locator('#site-menu').waitFor({ timeout: 5_000 });
      const menu = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#site-menu a')];
        const start = rows[0];
        const github = rows[rows.length - 1];
        const style = (element) => getComputedStyle(element);
        const piece = github.querySelector('.star-count');
        return {
          start: { classes: start.className, height: start.getBoundingClientRect().height, radius: style(start).borderTopLeftRadius, fill: style(start).backgroundColor, colour: style(start).color, weight: style(start).fontWeight, face: style(start).fontFamily.split(',')[0] },
          rows: rows.slice(1).map((row) => ({ words: row.textContent.replace(/\s+/g, ' ').trim(), height: row.getBoundingClientRect().height, colour: style(row).color, weight: style(row).fontWeight, size: style(row).fontSize })),
          github: {
            href: github.getAttribute('href'),
            height: github.getBoundingClientRect().height,
            star: piece ? getComputedStyle(piece.querySelector('svg path')).stroke : null,
            number: piece ? { words: piece.querySelector('.num').textContent, colour: style(piece.querySelector('.num')).color } : null,
          },
        };
      });
      expect(/\bkey\b/.test(menu.start.classes) && /\bkey--solid\b/.test(menu.start.classes), `Menu, ${look}: the start row's classes are "${menu.start.classes}"`);
      expect(Math.abs(menu.start.height - 48) < 0.5 && menu.start.radius === '6px', `Menu, ${look}: the start row is ${menu.start.height} px tall with ${menu.start.radius} corners`);
      expect(menu.start.fill === tone.accent && menu.start.colour === tone.onAccent && menu.start.weight === '700' && inter(menu.start.face), `Menu, ${look}: the start row is ${menu.start.colour} on ${menu.start.fill} in ${menu.start.face} ${menu.start.weight}`);
      for (const row of menu.rows) {
        expect(row.height >= 47.5 && row.colour === tone.ink && row.weight === '400' && row.size === '16px', `Menu, ${look}: the row "${row.words}" is ${row.height} px tall in ${row.colour} at ${row.weight} and ${row.size}`);
      }
      expect(menu.github.href === REPOSITORY, `Menu, ${look}: the last row opens ${menu.github.href}`);
      if (stars) {
        expect(menu.github.number?.words === stars.short && menu.github.number?.colour === tone.ink && menu.github.star === tone.ink, `Menu, ${look}: the GitHub row shows ${menu.github.number?.words} in ${menu.github.number?.colour} with a star in ${menu.github.star}`);
        expect((await page.locator('#site-menu').getByRole('link', { name: stars.name, exact: true }).count()) === 1, `Menu, ${look}: no row is named "${stars.name}"`);
      } else {
        expect(menu.github.number === null, `Menu, ${look}: with no count the GitHub row shows a number`);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // No page asks another host anything
  // ---------------------------------------------------------------------------

  // Every request a page makes while it loads and for ten seconds after, the
  // service worker's and its sockets' among them. The page itself must load:
  // an error page asks nothing and would pass. The deliberate visit to
  // /404.html may be answered 404 by a server that serves it for every
  // missing address; here it is a file of its own.
  const asked = async (route, width, setupDone) => {
    const others = new Set();
    let status = 0;
    await open({ name: `requests of ${route}`, width, height: width < 768 ? 844 : 800, setupDone }, async (page, context) => {
      context.on('request', (request) => {
        const url = new URL(request.url());
        if (/^(data|blob|about):$/.test(url.protocol)) return;
        if (url.origin !== origin) others.add(url.origin);
      });
      // A socket's handshake is no request of the context's: ws is read as http, wss as https.
      page.on('websocket', (socket) => {
        const url = new URL(socket.url());
        if (new URL(socket.url().replace(/^ws(s?):/, 'http$1:')).origin !== origin) others.add(url.origin);
      });
      const response = await page.goto(address(route), { waitUntil: 'load', timeout: 60_000 });
      status = response ? response.status() : 0;
      await page.waitForTimeout(10_000);
    });
    return { others: [...others], status };
  };
  const visits = [];
  for (const width of [390, 1280]) {
    for (const route of PUBLIC_PAGES) visits.push({ route, width, setupDone: false });
    for (const route of APP_PAGES) {
      visits.push({ route, width, setupDone: false });
      visits.push({ route, width, setupDone: true });
    }
  }
  for (let i = 0; i < visits.length; i += 6) {
    await Promise.all(visits.slice(i, i + 6).map(async ({ route, width, setupDone }) => {
      const { others, status } = await asked(route, width, setupDone);
      const loads = route === '/404.html' ? status === 200 || status === 404 : status === 200;
      expect(loads, `requests: ${route} at ${width} px${setupDone ? ', set up' : ', first visit'} was answered ${status}, so its requests were not read`);
      expect(others.length === 0, `requests: ${route} at ${width} px${setupDone ? ', set up' : ', first visit'} asks ${others.join(', ')}`);
    }));
  }

  // ---------------------------------------------------------------------------
  // A page whose own script is gone before React starts
  // ---------------------------------------------------------------------------

  // The first load is answered 404 for the app's main script, as a deploy that
  // replaced it would answer; the page reloads once, and React starts.
  await open({ name: 'a missing app script before React starts', width: 1280 }, async (page) => {
    let refused = 0;
    await page.route('**/_next/static/chunks/main-app-*.js', async (route) => {
      if (refused === 0) {
        refused += 1;
        await route.fulfill({ status: 404, body: '' });
      } else {
        await route.continue();
      }
    });
    let loads = 0;
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) loads += 1; });
    await page.goto(address('/faq/'), { waitUntil: 'commit', timeout: 60_000 });
    const started = await page.waitForSelector('nav[aria-label="Site"][data-script="true"]', { timeout: 30_000 }).then(() => true, () => false);
    expect(refused === 1 && loads === 2 && started, `a missing app script: ${refused} answered 404, ${loads} loads, React ${started ? 'started' : 'never started'}`);
  });

  // ---------------------------------------------------------------------------
  // The name check gets the hard cases right
  // ---------------------------------------------------------------------------

  // Two keys named by their labels, one of them a name the snapshot quotes,
  // and three with no name: a glyph hidden from the accessibility tree, the
  // same glyph reached through aria-labelledby, and a label whose id does not
  // exist.
  await open({ name: 'the name check', width: 1280 }, async (page) => {
    await page.setContent(`<main>
      <button class="key--icon" aria-label="Close">×</button>
      <button class="key--icon" aria-label="Close: Menu">×</button>
      <button class="key--icon"><span aria-hidden="true">×</span></button>
      <span id="glyph-label"><span aria-hidden="true">×</span></span>
      <button class="key--icon" aria-labelledby="glyph-label"></button>
      <button class="key--icon" aria-labelledby="no-such-id"></button>
    </main>`);
    const unnamed = await unnamedControls(page);
    expect(unnamed === 3, `the name check: ${unnamed} of the five keys read as unnamed, where three have no name`);
  });

  // ---------------------------------------------------------------------------
  // The keys of every public page
  // ---------------------------------------------------------------------------

  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'keys of the public pages', width, height: width < 768 ? 844 : 800, look }, async (page) => {
        const tone = TONES[look];
        for (const route of KEY_PAGES) {
          await visit(page, route);
          const at = `keys on ${route} at ${width} px, ${look}`;
          const seen = await page.evaluate(() => {
            const visible = (element) => element.getBoundingClientRect().width > 0 && getComputedStyle(element).visibility !== 'hidden';
            const keys = [...document.querySelectorAll('.key')].filter(visible).map((key) => {
              const style = getComputedStyle(key);
              return {
                words: key.getAttribute('aria-label') || key.textContent.trim(),
                classes: key.className,
                radius: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].join(' '),
                height: key.getBoundingClientRect().height,
                fill: style.backgroundColor,
                colour: style.color,
                weight: style.fontWeight,
                face: style.fontFamily.split(',')[0],
                inHeader: !!key.closest('nav[aria-label="Site"]'),
                first: !!key.closest('.home-first'),
              };
            });
            return { keys, older: document.querySelectorAll('.btn').length };
          });
          expect(seen.keys.length > 0, `${at}: the page shows no key`);
          expect(seen.older === 0, `${at}: ${seen.older} elements carry the older set's class`);
          // An icon key is a glyph with no word: it needs a name. Read on
          // the header, the footer and every key of this set.
          const unnamed = await unnamedControls(page);
          expect(unnamed === 0, `${at}: ${unnamed} icon keys have no name`);
          for (const key of seen.keys) {
            expect(key.radius === '6px 6px 6px 6px', `${at}: "${key.words}" has the corners ${key.radius}`);
            expect(key.height >= 43.5, `${at}: "${key.words}" is ${key.height} px tall`);
            if (!/\bkey--solid\b/.test(key.classes)) continue;
            expect(key.fill === tone.accent && key.colour === tone.onAccent && key.weight === '700' && inter(key.face), `${at}: the solid key "${key.words}" is ${key.colour} on ${key.fill} in ${key.face} ${key.weight}`);
            if (route === '/' && key.inHeader) expect(Math.abs(key.height - 44) < 0.5, `${at}: the header's start key is ${key.height} px tall`);
            if (route === '/' && key.first) expect(Math.abs(key.height - 52) < 0.5, `${at}: the first screen's start key is ${key.height} px tall`);
          }
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // The key sheet: each kind in each of its forms, pictured and measured
  // ---------------------------------------------------------------------------

  const PAD = 8;
  const KINDS = [
    { name: 'solid', inactive: 'solid-inactive', label: true },
    { name: 'outline', inactive: 'outline-inactive', label: true },
    { name: 'link', other: 'link-current', label: true },
    { name: 'link-row', label: true },
    { name: 'word', label: true },
    { name: 'icon', inactive: 'icon-inactive', label: false },
  ];
  for (const look of LOOKS) {
    await open({ name: 'key sheet', width: 1280, height: 800, look }, async (page, context) => {
      const tone = TONES[look];
      const scratch = await context.newPage();
      await visit(page);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(layKeySheet);
      const tiles = {};
      // A picture of one key with 8 px of the ground around it, and what its pixels read.
      const picture = async (name, form, ask) => {
        const key = await page.evaluate(readKey, name);
        const clip = { x: Math.round(key.box.x) - PAD, y: Math.round(key.box.y) - PAD, width: Math.ceil(key.box.width) + 2 * PAD, height: Math.ceil(key.box.height) + 2 * PAD };
        const shot = await page.screenshot({ clip, animations: 'disabled', caret: 'hide', scale: 'css' });
        tiles[`${name} ${form}`] = shot.toString('base64');
        const middle = PAD + Math.floor(key.box.height / 2);
        const read = await scratch.evaluate(readPicture, {
          base64: shot.toString('base64'),
          // A point 3 px inside the left edge, and one in the ring's band, 3 px outside it.
          points: [[PAD + 3, middle], [PAD - 3, middle]],
          // The left edge, between the corners.
          strips: [{ x: PAD, y: PAD + 8, width: 1, height: Math.max(1, Math.floor(key.box.height) - 16) }, ...(ask.glyph ? [{ x: PAD + 8, y: PAD + 8, width: 28, height: 28 }] : [])],
          words: ask.words ? { x: PAD + 4, y: PAD + 4, width: Math.floor(key.box.width) - 8, height: Math.floor(key.box.height) - 8 } : null,
        });
        return { key, inside: read.points[0] ? rgb(read.points[0]) : null, ringBand: read.points[1] ? rgb(read.points[1]) : null, edge: read.strips[0], glyph: read.strips[1] || null, words: read.words, ground: rgb(read.corner) };
      };
      const rest = async () => {
        await page.mouse.move(1270, 790);
        await page.evaluate(() => document.activeElement?.blur());
        await page.waitForTimeout(250);
      };
      const hover = async (name) => {
        const { box } = await page.evaluate(readKey, name);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(250);
      };
      // Focus from the keyboard: back one stop and forward again.
      const focus = async (name) => {
        await page.locator(`[data-key="${name}"]`).focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await page.waitForTimeout(150);
      };
      const words = (read, least, what) => {
        expect(!!read.words, `${what}: its label holds too little ink to read`);
        if (read.words) expect(read.words.strokes >= least, `${what}: its label measures ${read.words.strokes.toFixed(2)}:1 on its strokes (core ${read.words.core.toFixed(2)}:1), under ${least}`);
      };
      // An edge is drawn at full strength along its strip; a glyph's thin
      // lines may cover no pixel whole, so a glyph is held to its measure and
      // its colour is read from the key itself.
      const drawn = (found, colour, what, { exact = true } = {}) => {
        expect(!!found, `${what} is not in the picture`);
        if (!found) return;
        if (exact) expect(numbers(colour).every((value, channel) => Math.abs(value - found.colour[channel]) <= 6), `${what} is drawn ${rgb(found.colour)}, not ${colour}`);
        expect(found.ratio >= 4.5, `${what} measures ${found.ratio.toFixed(2)}:1 against the ground, under 4.5`);
      };

      for (const kind of KINDS) {
        const at = `key sheet, ${look}: the ${kind.name} key`;
        // At rest.
        await rest();
        const still = await picture(kind.name, 'rest', { words: kind.label, glyph: kind.name === 'icon' });
        expect(still.ground === tone.page, `${at} stands on ${still.ground}, not the page's ${tone.page}`);
        expect(still.key.box.height >= 43.5, `${at} is ${still.key.box.height} px tall`);
        expect(still.key.transform === 'none' && still.key.opacity === '1', `${at} at rest has the transform ${still.key.transform} and the opacity ${still.key.opacity}`);
        if (kind.name === 'solid') {
          expect(still.key.radius === '6px' && still.inside === tone.accent && still.key.colour === tone.onAccent && still.key.weight === '700', `${at} at rest is ${still.key.colour} at ${still.key.weight} on ${still.inside} with ${still.key.radius} corners`);
          expect(contrast(tone.accent, tone.page) >= 4.5, `${at}: its fill measures ${contrast(tone.accent, tone.page).toFixed(2)}:1 against the page`);
          words(still, 7, `${at} at rest`);
        }
        if (kind.name === 'outline') {
          expect(still.key.radius === '6px' && still.inside === tone.page && still.key.colour === tone.ink && still.key.weight === '400', `${at} at rest is ${still.key.colour} at ${still.key.weight} on ${still.inside} with ${still.key.radius} corners`);
          drawn(still.edge, tone.line, `${at}: its edge at rest`);
          words(still, 7, `${at} at rest`);
        }
        if (kind.name === 'link') {
          expect(still.key.colour === tone.quiet && still.key.weight === '400' && still.key.underline.startsWith('none'), `${at} at rest is ${still.key.colour} at ${still.key.weight} with ${still.key.underline}`);
          words(still, 7, `${at} at rest`);
          const current = await picture(kind.other, 'rest', { words: true });
          expect(current.key.colour === tone.ink && current.key.weight === '400' && current.key.underline === `underline 2px ${tone.accent}`, `${at} of the page being read is ${current.key.colour} at ${current.key.weight} with ${current.key.underline}`);
        }
        if (kind.name === 'link-row') {
          expect(still.key.colour === tone.ink && still.key.weight === '700' && still.key.size === '18px' && still.key.underline === `underline 2px ${tone.accent}`, `${at} at rest is ${still.key.colour} at ${still.key.weight} and ${still.key.size} with ${still.key.underline}`);
          words(still, 7, `${at} at rest`);
        }
        if (kind.name === 'word') {
          expect(still.key.radius === '6px' && still.inside === tone.page && still.key.colour === tone.ink && still.key.weight === '700' && still.key.box.width >= 64, `${at} at rest is ${still.key.colour} at ${still.key.weight} on ${still.inside}, ${still.key.box.width} px wide`);
          words(still, 7, `${at} at rest`);
        }
        if (kind.name === 'icon') {
          expect(still.key.radius === '6px' && Math.abs(still.key.box.width - 44) < 0.5 && Math.abs(still.key.box.height - 44) < 0.5, `${at} is ${still.key.box.width} by ${still.key.box.height} px with ${still.key.radius} corners`);
          expect(still.key.colour === tone.ink, `${at}: its glyph at rest is ${still.key.colour}`);
          drawn(still.glyph, tone.ink, `${at}: its glyph at rest`, { exact: false });
        }

        // Under the pointer.
        await hover(kind.name);
        const over = await picture(kind.name, 'hover', { words: kind.label, glyph: kind.name === 'icon' });
        if (kind.name === 'solid') expect(over.inside === tone.accentHover, `${at} under the pointer is filled ${over.inside}, not ${tone.accentHover}`);
        if (kind.name === 'outline') {
          expect(over.inside === tone.panel, `${at} under the pointer is filled ${over.inside}, not ${tone.panel}`);
          drawn(over.edge, tone.ink, `${at}: its edge under the pointer`);
        }
        if (kind.name === 'link') expect(over.key.colour === tone.ink && over.key.underline === `underline 1px ${tone.ink}`, `${at} under the pointer is ${over.key.colour} with ${over.key.underline}`);
        if (kind.name === 'link-row') expect(over.key.underline === `underline 3px ${tone.accent}`, `${at} under the pointer has ${over.key.underline}`);
        if (kind.name === 'word' || kind.name === 'icon') expect(over.inside === tone.panel, `${at} under the pointer is filled ${over.inside}, not ${tone.panel}`);
        if (kind.label) words(over, 7, `${at} under the pointer`);

        // Focused from the keyboard: a 2 px ring in the look's green, 2 px outside.
        await rest();
        await focus(kind.name);
        const ringed = await picture(kind.name, 'focus', { words: false });
        expect(ringed.key.focused && ringed.key.ringShown, `${at} did not take keyboard focus`);
        expect(ringed.key.ring === `2px solid ${tone.accent} 2px`, `${at} focused has the ring ${ringed.key.ring}`);
        expect(ringed.ringBand === tone.accent, `${at} focused: 3 px outside its edge the picture is ${ringed.ringBand}, not the ring's ${tone.accent}`);
        expect(contrast(tone.accent, tone.page) >= 4.5, `${at}: its ring measures ${contrast(tone.accent, tone.page).toFixed(2)}:1 against the page`);
        if (kind.name !== 'link' && kind.name !== 'link-row') expect(ringed.key.radius === '6px', `${at} focused has ${ringed.key.radius} corners`);

        // Pressed: 1 px lower at full strength.
        await rest();
        await hover(kind.name);
        await page.mouse.down();
        await page.waitForTimeout(200);
        const pressed = await picture(kind.name, 'pressed', { words: false });
        await page.mouse.up();
        expect(pressed.key.transform === 'matrix(1, 0, 0, 1, 0, 1)' && pressed.key.opacity === '1', `${at} pressed has the transform ${pressed.key.transform} and the opacity ${pressed.key.opacity}`);
        if (kind.name === 'solid') expect(pressed.key.fill === tone.accentHover, `${at} pressed is filled ${pressed.key.fill}`);
        if (kind.name === 'link') expect(pressed.key.colour === tone.ink, `${at} pressed is ${pressed.key.colour}`);

        // Inactive: a dashed edge and words, never dimness alone.
        if (kind.inactive) {
          await rest();
          const off = await picture(kind.inactive, 'rest', { words: kind.label, glyph: kind.name === 'icon' });
          expect(off.key.opacity === '1' && off.key.cursor === 'default', `${at} inactive has the opacity ${off.key.opacity} and the cursor ${off.key.cursor}`);
          if (kind.name === 'icon') {
            expect(off.key.colour === tone.line, `${at}: its glyph when inactive is ${off.key.colour}`);
            drawn(off.glyph, tone.line, `${at}: its glyph when inactive`, { exact: false });
          } else {
            expect(off.inside === tone.page && off.key.edge === `1px dashed ${tone.line}` && off.key.colour === tone.quiet && off.key.weight === '400', `${at} inactive is ${off.key.colour} at ${off.key.weight} on ${off.inside} with the edge ${off.key.edge}`);
            drawn(off.edge, tone.line, `${at}: its dashed edge`);
            words(off, 7, `${at} inactive`);
            // The solid key keeps its size when it turns inactive.
            if (kind.name === 'solid') expect(Math.abs(off.key.box.height - still.key.box.height) < 0.5, `${at} is ${still.key.box.height} px tall and ${off.key.box.height} px when inactive`);
          }
          // It keeps its place in the focus order, says why, and a press moves nothing.
          await focus(kind.inactive);
          const reached = await page.evaluate(readKey, kind.inactive);
          expect(reached.focused, `${at} inactive is skipped by the keyboard`);
          await hover(kind.inactive);
          await page.mouse.down();
          await page.waitForTimeout(150);
          const held = await page.evaluate(readKey, kind.inactive);
          await page.mouse.up();
          expect(held.transform === 'none' && held.opacity === '1', `${at} inactive moves when pressed (${held.transform})`);
        }
      }

      // The pictures side by side: one row a kind; at rest, under the
      // pointer, focused, pressed, then inactive or the page being read.
      await scratch.setViewportSize({ width: 1280, height: 800 });
      await scratch.evaluate(({ rows, ground }) => {
        document.body.style.cssText = `margin:0;padding:24px;background:${ground};display:grid;grid-template-columns:repeat(5,max-content);gap:8px 16px;align-items:center;justify-content:start;`;
        for (const row of rows) {
          for (const tile of row) {
            const cell = tile ? document.createElement('img') : document.createElement('span');
            if (tile) cell.src = `data:image/png;base64,${tile}`;
            document.body.appendChild(cell);
          }
        }
        return Promise.all([...document.images].map((image) => image.decode()));
      }, {
        rows: KINDS.map((kind) => [
          tiles[`${kind.name} rest`], tiles[`${kind.name} hover`], tiles[`${kind.name} focus`], tiles[`${kind.name} pressed`],
          kind.inactive ? tiles[`${kind.inactive} rest`] : kind.other ? tiles[`${kind.other} rest`] : null,
        ]),
        ground: tone.page,
      });
      await scratch.screenshot({ path: path.join(outDir, `keys-sheet-${look}.png`), fullPage: true });
      await scratch.close();
    });
  }

  // Reduced motion: a pressed key does not move.
  await open({ name: 'key sheet, reduced motion', width: 1280, height: 800, look: 'dark', reducedMotion: 'reduce' }, async (page) => {
    await visit(page);
    await page.evaluate(layKeySheet);
    for (const name of ['solid', 'outline', 'link', 'link-row', 'word', 'icon']) {
      const { box } = await page.evaluate(readKey, name);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(150);
      const held = await page.evaluate(readKey, name);
      await page.mouse.up();
      expect(held.transform === 'none' && held.opacity === '1', `key sheet, reduced motion: the pressed ${name} key has the transform ${held.transform} and the opacity ${held.opacity}`);
    }
  });

  // The look switch in the real header is the icon key: 44 px, 6 px corners,
  // a glyph in the ink, a name that says what a press does.
  for (const look of LOOKS) {
    await open({ name: 'look switch', width: 1280, look }, async (page) => {
      await visit(page);
      const tone = TONES[look];
      const key = page.locator('nav[aria-label="Site"] button.look-switch');
      await key.waitFor({ timeout: 10_000 });
      const read = () => key.evaluate((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height, radius: style.borderTopLeftRadius, fill: style.backgroundColor, colour: style.color, name: element.getAttribute('aria-label'), transform: style.transform, opacity: style.opacity, glyph: element.querySelector('svg').getBoundingClientRect().width };
      });
      const still = await read();
      expect(still.width === 44 && still.height === 44 && still.radius === '6px' && still.glyph === 22, `look switch, ${look}: it is ${still.width} by ${still.height} px with ${still.radius} corners and a ${still.glyph} px glyph`);
      expect(still.colour === tone.ink && /^Switch to the (dark|light) look$/.test(still.name || ''), `look switch, ${look}: its glyph is ${still.colour} and its name "${still.name}"`);
      await key.hover();
      await page.waitForTimeout(250);
      expect((await read()).fill === tone.panel, `look switch, ${look}: under the pointer it is filled ${(await read()).fill}`);
      await page.mouse.down();
      await page.waitForTimeout(150);
      const held = await read();
      expect(held.transform === 'matrix(1, 0, 0, 1, 0, 1)' && held.opacity === '1', `look switch, ${look}: pressed it has the transform ${held.transform} and the opacity ${held.opacity}`);
      await page.mouse.move(640, 600);
      await page.mouse.up();
    });
  }

  // ---------------------------------------------------------------------------
  // The footer: the makers' marks and the GitHub link with its count
  // ---------------------------------------------------------------------------

  // Runs in the page. The footer's last group and its GitHub link.
  const readFooter = () => {
    const groups = [...document.querySelectorAll('.site-footer__groups > div')];
    const makers = groups[groups.length - 1];
    const shown = (image) => getComputedStyle(image).display !== 'none';
    const rows = [...makers.querySelectorAll('li > a')].map((row) => {
      const images = [...row.querySelectorAll('img')];
      const mark = images.find(shown);
      const name = row.querySelector('span:not(.maker-mark)');
      const style = getComputedStyle(name);
      return {
        name: name.textContent.trim(),
        href: row.getAttribute('href'),
        target: row.getAttribute('target'),
        height: row.getBoundingClientRect().height,
        marks: images.filter(shown).length,
        mark: mark ? { src: new URL(mark.currentSrc || mark.src).pathname, host: new URL(mark.currentSrc || mark.src).origin, alt: mark.getAttribute('alt'), width: mark.getBoundingClientRect().width, height: mark.getBoundingClientRect().height, loaded: mark.complete && mark.naturalWidth > 0 } : null,
        place: row.querySelector('.maker-mark').getBoundingClientRect().width,
        gap: name.getBoundingClientRect().left - row.querySelector('.maker-mark').getBoundingClientRect().right,
        left: name.getBoundingClientRect().left,
        type: `${style.fontFamily.split(',')[0]} ${style.fontWeight} ${style.fontSize} ${style.lineHeight}`,
        colour: style.color,
      };
    });
    const github = document.querySelector('.site-footer__link--github');
    const piece = github.querySelector('.star-count');
    const title = makers.querySelector('h2');
    // The line the link's first words stand on, to tell whether the word
    // GitHub and its count stand on the same one.
    let firstLine = null;
    if (github.firstChild && github.firstChild.nodeType === Node.TEXT_NODE) {
      const range = document.createRange();
      range.selectNodeContents(github.firstChild);
      firstLine = range.getBoundingClientRect().top;
    }
    return {
      title: title.textContent.trim(),
      titleType: `${getComputedStyle(title).fontFamily.split(',')[0]} ${getComputedStyle(title).fontWeight} ${getComputedStyle(title).fontSize}`,
      rows,
      github: {
        words: github.textContent.replace(/\s+/g, ' ').trim(),
        height: github.getBoundingClientRect().height,
        piece: piece ? { height: piece.getBoundingClientRect().height, number: piece.querySelector('.num').textContent, star: piece.querySelector('svg').getBoundingClientRect().width } : null,
        lines: piece && firstLine !== null && piece.getBoundingClientRect().top - firstLine > 12 ? 2 : 1,
        over: github.scrollWidth > github.clientWidth + 1,
      },
      // Every link of the footer, to tell whether each stands on one line.
      links: [...document.querySelectorAll('.site-footer__groups a')].map((link) => ({
        words: link.textContent.replace(/\s+/g, ' ').trim(),
        height: link.getBoundingClientRect().height,
      })),
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  };
  const FORMS = {
    dark: { Frame: '/logos/frame-icon-dark.svg', AgentOS: '/logos/agentos-icon.svg', Paracosm: '/logos/paracosm-icon-color.svg' },
    light: { Frame: '/logos/frame-icon-light.svg', AgentOS: '/logos/agentos-icon.svg', Paracosm: '/logos/paracosm-icon-color-light.svg' },
  };
  const MAKERS = { Frame: 'https://frame.dev', AgentOS: 'https://agentos.sh', Paracosm: 'https://paracosm.agentos.sh' };
  const toFooter = async (page) => {
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForFunction(() => [...document.querySelectorAll('.site-footer__groups img')].filter((image) => getComputedStyle(image).display !== 'none').every((image) => image.complete), null, { timeout: 15_000 });
  };
  const checkMakers = (footer, look, at) => {
    const tone = TONES[look];
    expect(footer.title === 'From Frame' && /Space Grotesk|space/i.test(footer.titleType) && footer.titleType.endsWith('700 16px'), `${at}: the last group is "${footer.title}" in ${footer.titleType}`);
    expect(footer.rows.map((row) => row.name).join(', ') === 'Frame, AgentOS, Paracosm', `${at}: the makers' rows are ${footer.rows.map((row) => row.name).join(', ')}`);
    for (const row of footer.rows) {
      expect(row.href === MAKERS[row.name] && !row.target, `${at}: the ${row.name} row opens ${row.href}${row.target ? ` in ${row.target}` : ''}`);
      expect(row.marks === 1 && row.mark?.src === FORMS[look][row.name], `${at}: the ${row.name} row shows ${row.marks} marks, ${row.mark?.src}, not ${FORMS[look][row.name]}`);
      expect(row.mark?.host === origin && row.mark?.loaded, `${at}: the ${row.name} mark is asked from ${row.mark?.host} and ${row.mark?.loaded ? 'loaded' : 'did not load'}`);
      expect(row.mark?.alt === '' && row.mark?.width === 24 && row.mark?.height === 24, `${at}: the ${row.name} mark is ${row.mark?.width} by ${row.mark?.height} px with the text equivalent "${row.mark?.alt}"`);
      expect(Math.abs(row.gap - 8) < 0.5, `${at}: the ${row.name} mark and its name are ${row.gap} px apart`);
      expect(/inter/i.test(row.type) && row.type.endsWith('400 16px 24px') && row.colour === tone.quiet, `${at}: the name ${row.name} is set ${row.type} in ${row.colour}`);
    }
    expect(footer.sideways <= 0, `${at}: the page scrolls sideways`);
  };

  for (const width of [390, 820, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'footer', width, height: width < 768 ? 844 : 800, look }, async (page) => {
        await visit(page);
        await toFooter(page);
        const at = `footer at ${width} px, ${look}`;
        const footer = await page.evaluate(readFooter);
        checkMakers(footer, look, at);
        for (const row of footer.rows) {
          if (width < 768) expect(row.height >= 43.5, `${at}: the ${row.name} row is ${row.height} px tall`);
          else expect(row.height >= 24, `${at}: the ${row.name} row is ${row.height} px tall`);
        }
        if (stars) {
          expect(footer.github.words === stars.name, `${at}: the GitHub link reads "${footer.github.words}"`);
          expect(footer.github.piece?.number === stars.short && footer.github.piece?.star === 16, `${at}: the GitHub link shows ${footer.github.piece?.number} beside a ${footer.github.piece?.star} px star`);
          // The word GitHub, the star and the count never part.
          expect((footer.github.piece?.height ?? 99) < 30, `${at}: the word GitHub and its count stand on more than one line`);
          // From 390 px the link and its count are one line.
          expect(footer.github.lines === 1, `${at}: the GitHub link with its count takes ${footer.github.lines} lines`);
        } else {
          expect(footer.github.words === 'SafeOS on GitHub' && footer.github.piece === null, `${at}: with no count the GitHub link reads "${footer.github.words}"`);
        }
        expect(!footer.github.over, `${at}: the GitHub link runs out of its column`);
        // Every row of the footer is one line from 390 px: a row is 44 px
        // tall on a phone and 32 px from the tablet width, and two lines of
        // 24 px make 48.
        const oneLine = width < 768 ? 46 : 40;
        const wrapped = footer.links.filter((link) => link.height >= oneLine);
        expect(footer.links.length > 0 && wrapped.length === 0, `${at}: rows on more than one line: ${wrapped.map((link) => `"${link.words}" ${link.height} px`).join(', ')}`);
        await page.locator('footer.site-footer').screenshot({ path: path.join(outDir, `footer-makers-${width}-${look}.png`), style: NO_BARS });
      });
    }
  }

  // The look switch changes Frame's and Paracosm's marks to the form made for
  // the other look; AgentOS's one file stays.
  await open({ name: 'footer, look switch', width: 1280, look: 'light' }, async (page) => {
    await visit(page);
    await toFooter(page);
    checkMakers(await page.evaluate(readFooter), 'light', 'footer before the look switch');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.getByRole('button', { name: 'Switch to the dark look' }).click();
    await toFooter(page);
    checkMakers(await page.evaluate(readFooter), 'dark', 'footer after the look switch');
  });

  // A mark whose file does not load leaves its place empty; its name stands
  // at the same left edge as the other two.
  // No service worker here: its installed copy would answer for the file.
  await open({ name: 'footer, a mark that does not load', width: 390, height: 844, look: 'dark', serviceWorkers: 'block' }, async (page, context) => {
    await context.route('**/logos/agentos-icon.svg', (route) => route.abort());
    await visit(page);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(1_500);
    const footer = await page.evaluate(readFooter);
    const lefts = footer.rows.map((row) => Math.round(row.left));
    expect(new Set(lefts).size === 1, `footer, a mark that does not load: the names start at ${lefts.join(', ')} px`);
    expect(footer.rows.every((row) => row.place === 24), `footer, a mark that does not load: the marks' places are ${footer.rows.map((row) => row.place).join(', ')} px wide`);
    expect(footer.rows.find((row) => row.name === 'AgentOS')?.mark?.loaded === false, 'footer, a mark that does not load: the blocked mark loaded');
  });

  // ---------------------------------------------------------------------------
  // About: who builds SafeOS
  // ---------------------------------------------------------------------------

  for (const width of [390, 820, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'About, who builds SafeOS', width, height: width < 768 ? 844 : 800, look }, async (page) => {
        await visit(page, '/about/');
        const tone = TONES[look];
        const at = `About at ${width} px, ${look}`;
        const part = page.locator('section.who-builds');
        await part.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => [...document.querySelectorAll('.who-builds img')].filter((image) => getComputedStyle(image).display !== 'none').every((image) => image.complete), null, { timeout: 15_000 });
        const seen = await page.evaluate(() => {
          const section = document.querySelector('section.who-builds');
          const type = (element) => { const style = getComputedStyle(element); return `${style.fontFamily.split(',')[0]} ${style.fontWeight} ${style.fontSize} ${style.lineHeight}`; };
          const box = (element) => { const b = element.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, width: b.width, height: b.height }; };
          const shown = (image) => getComputedStyle(image).display !== 'none';
          const title = section.querySelector('h2');
          // The words a reader sees: the page's scripts hold its words too.
          const read = document.querySelector('#main-content').innerText;
          return {
            tellings: (read.match(/Who builds SafeOS/gi) || []).length,
            gone: ['Built by Frame.dev', 'Visit Frame.dev', 'Makers of SafeOS and AgentOS', 'Who Builds It'].filter((words) => read.toLowerCase().includes(words.toLowerCase())),
            oldMark: document.querySelectorAll('img[src*="/logos/frame.svg"]').length,
            title: { words: title.textContent.trim(), type: type(title), colour: getComputedStyle(title).color, level: title.tagName },
            also: { words: section.querySelector('.who-builds__also').textContent.trim(), colour: getComputedStyle(section.querySelector('.who-builds__also')).color, type: type(section.querySelector('.who-builds__also')) },
            main: box(section.querySelector('.who-builds__main')),
            others: box(section.querySelector('.who-builds__others')),
            section: box(section),
            entries: [...section.querySelectorAll('.who-builds__entry')].map((entry) => {
              const marks = [...entry.querySelectorAll('img')].filter(shown);
              const name = entry.querySelector('h3');
              const line = entry.querySelector('p');
              const row = entry.querySelector('a');
              return {
                name: name.textContent.trim(),
                nameType: type(name),
                nameBox: box(name),
                box: box(entry),
                line: line.textContent.replace(/\s+/g, ' ').trim(),
                lineType: type(line),
                lineColour: getComputedStyle(line).color,
                lineWidth: line.getBoundingClientRect().width,
                marks: marks.length,
                mark: marks[0] ? { ...box(marks[0]), src: new URL(marks[0].currentSrc || marks[0].src).pathname, alt: marks[0].getAttribute('alt'), loaded: marks[0].complete && marks[0].naturalWidth > 0, linked: !!marks[0].closest('a') } : null,
                row: { words: row.textContent.trim(), href: row.getAttribute('href'), target: row.getAttribute('target'), classes: row.className, ...box(row), colour: getComputedStyle(row).color, underline: `${getComputedStyle(row).textDecorationLine} ${getComputedStyle(row).textDecorationThickness} ${getComputedStyle(row).textDecorationColor}` },
              };
            }),
            sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });
        expect(seen.tellings === 1 && seen.gone.length === 0 && seen.oldMark === 0, `${at}: "Who builds SafeOS" stands ${seen.tellings} times; still on the page: ${seen.gone.join(', ') || 'none'}; ${seen.oldMark} pictures of the old mark`);
        expect(seen.title.words === 'Who builds SafeOS' && seen.title.level === 'H2' && /space/i.test(seen.title.type) && / 700 /.test(seen.title.type) && seen.title.colour === tone.ink, `${at}: the heading is ${seen.title.level} "${seen.title.words}" in ${seen.title.type}, ${seen.title.colour}`);
        expect(seen.also.words === 'Also from Frame' && seen.also.colour === tone.quiet && seen.also.type.endsWith('400 16px 24px'), `${at}: the label reads "${seen.also.words}" in ${seen.also.type}, ${seen.also.colour}`);
        expect(seen.entries.map((entry) => entry.name).join(', ') === 'Frame, AgentOS, Paracosm', `${at}: the entries are ${seen.entries.map((entry) => entry.name).join(', ')}`);
        const lines = {
          Frame: 'Frame builds SafeOS and pays for its development, so an old phone or laptop can watch a room, a porch or a yard for free.',
          AgentOS: 'An open-source framework for building software agents in TypeScript.',
          Paracosm: 'An open-source simulator that plays out what-if questions with software agents.',
        };
        const rows = { Frame: 'frame.dev', AgentOS: 'agentos.sh', Paracosm: 'paracosm.agentos.sh' };
        for (const entry of seen.entries) {
          const what = `${at}: the ${entry.name} entry`;
          expect(entry.line === lines[entry.name], `${what} reads "${entry.line}"`);
          expect(/space/i.test(entry.nameType) && / 700 20px /.test(` ${entry.nameType} `), `${what}: its name is set ${entry.nameType}`);
          expect(/inter/i.test(entry.lineType) && entry.lineType.endsWith('400 18px 28px') && entry.lineColour === tone.ink && entry.lineWidth <= 640.5, `${what}: its line is set ${entry.lineType} in ${entry.lineColour}, ${Math.round(entry.lineWidth)} px wide`);
          expect(entry.marks === 1 && entry.mark?.src === FORMS[look][entry.name] && entry.mark?.loaded, `${what} shows ${entry.marks} marks, ${entry.mark?.src}`);
          expect(entry.mark?.width === 40 && entry.mark?.height === 40 && entry.mark?.alt === '' && !entry.mark?.linked, `${what}: its mark is ${entry.mark?.width} by ${entry.mark?.height} px, text equivalent "${entry.mark?.alt}"${entry.mark?.linked ? ', inside a link' : ''}`);
          expect(entry.row.words === rows[entry.name] && entry.row.href === MAKERS[entry.name] && !entry.row.target && entry.row.classes === 'link-row', `${what}: its link row reads "${entry.row.words}" to ${entry.row.href}${entry.row.target ? ` in ${entry.row.target}` : ''}`);
          expect(entry.row.height >= 43.5 && entry.row.width >= 88 && entry.row.colour === tone.ink && entry.row.underline === `underline 2px ${tone.accent}`, `${what}: its link row is ${Math.round(entry.row.width)} by ${entry.row.height} px in ${entry.row.colour} with ${entry.row.underline}`);
          // On a phone the mark stands over its name; from the tablet width at its left.
          if (width < 768) expect(entry.mark.top + entry.mark.height <= entry.nameBox.top + 0.5 && Math.abs(entry.mark.left - entry.nameBox.left) < 0.5, `${what}: on a phone its mark does not stand over its name`);
          else expect(entry.mark.left + entry.mark.width <= entry.nameBox.left && Math.abs(entry.mark.top - entry.nameBox.top) < 8, `${what}: its mark does not stand at the left of its name`);
        }
        const [frame, agentos, paracosm] = seen.entries;
        if (width < 768) {
          expect(Math.abs(agentos.box.left - frame.box.left) < 0.5 && Math.abs(paracosm.box.left - frame.box.left) < 0.5 && paracosm.box.top > agentos.box.top, `${at}: the entries are not one column`);
        } else if (width < 1024) {
          expect(Math.abs(agentos.box.top - paracosm.box.top) < 0.5 && paracosm.box.left > agentos.box.left && agentos.box.top > frame.box.top, `${at}: the two other entries do not stand side by side under Frame's`);
        } else {
          expect(Math.abs(seen.main.top - seen.others.top) < 0.5 && seen.others.left > seen.main.left + seen.main.width - 0.5, `${at}: the two parts do not stand side by side with level tops (${seen.main.top} and ${seen.others.top})`);
          expect(Math.abs(seen.main.width / seen.section.width - 7 / 12) < 0.06, `${at}: Frame's part takes ${Math.round(seen.main.width)} of ${Math.round(seen.section.width)} px, not 7 of 12 columns`);
          expect(paracosm.box.top > agentos.box.top && Math.abs(paracosm.box.left - agentos.box.left) < 0.5, `${at}: the two other entries are not one under the other`);
        }
        expect(seen.sideways <= 0, `${at}: the page scrolls sideways`);
        await part.screenshot({ path: path.join(outDir, `about-who-builds-${width}-${look}.png`), style: NO_BARS });
      });
    }
  }

  console.log(`checked the public pages' header, keys and footer: ${problems.length} findings`);
  return problems;
}
