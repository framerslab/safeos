// Checks the home page on the built static site in a real browser.
//
// scripts/capture-pictures.mjs runs it for the pull request's own build when
// the home page is among the routes. Each block walks one part of the page as
// a visitor would: the page before any script runs, the header, the look
// switch, the headline, the start key, the recorded runs, the five uses, how it
// works, what stays on the device, the free part, the footer and
// what a search result or a shared link shows. It also saves the page from
// top to bottom at 820 and 1920 pixels in both looks. Every finding is
// printed, and the count of findings is returned; any finding fails the run.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { barredWording, homeWordingInputs } from './home-wording.cjs';
import { checkPublicChrome, starsHanded } from './public-chrome-checks.mjs';

const LOOKS = ['light', 'dark'];
const HEADLINE = 'Free motion and sound alerts from an old phone or laptop';
const STATEMENT = 'SafeOS adds an alert. It does not replace a person nearby. A phone or a browser can sleep, lose power or drop the camera, so stay within reach.';
const NEEDS_SCRIPT = 'Setup needs JavaScript. The rest of this page reads without it.';
const DESCRIPTION = 'Get motion and sound alerts from an old phone, tablet or laptop. SafeOS Guardian runs in your browser, free and open source under the MIT License.';
const PAGE_COLOURS = { light: 'rgb(248, 249, 250)', dark: 'rgb(11, 19, 27)' };
const PANEL_COLOURS = { light: 'rgb(241, 243, 244)', dark: 'rgb(16, 26, 36)' };
const INK = { light: 'rgb(15, 18, 21)', dark: 'rgb(244, 245, 246)' };
const THEME_COLOURS = { light: '#f8f9fa', dark: '#0b131b' };
// A solid key's fill and label in each look.
const SOLID_KEY = {
  light: { fill: 'rgb(20, 83, 45)', label: 'rgb(255, 255, 255)' },
  dark: { fill: 'rgb(74, 222, 128)', label: 'rgb(11, 19, 27)' },
};
// The repository's star count, when the build was handed one: the GitHub link
// then shows it and is named with it, and the footer's last line says it.
const STARS = starsHanded();
const GITHUB_NAME = STARS ? STARS.name : 'SafeOS on GitHub';
const GITHUB_HEADER_NAME = STARS?.headerName ?? GITHUB_NAME;
// The longest walk takes about fifteen seconds on the CI runner.
const WALK_LIMIT_MS = 180_000;

// Straight and curly apostrophes are one character to a reader; so are a
// space and a non-breaking space.
export const plain = (text) => (text || '').replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// A person who has finished setup on this device. Seeded on the first page of
// the visit only: later pages read what the earlier ones left, so a page that
// cleared the saved setup is seen. Setup's camera step answers the notice
// about alert pictures, with what it offers at first.
export const SETUP_DONE = () => {
  if (sessionStorage.getItem('home-checks-seeded')) return;
  sessionStorage.setItem('home-checks-seeded', '1');
  localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
    isComplete: true, selectedScenario: 'pet',
    acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
  }, version: 0 }));
  localStorage.setItem('guardian-onboarding-complete', 'true');
  localStorage.setItem('safeos-alert-pictures', JSON.stringify({ state: {
    keep: true, deleteAfterDays: 3, noticeAnswered: true, inNotifications: false,
  }, version: 0 }));
};

// Reads what the readability rule measures: every visible piece of text with
// its size, face and contrast against the colour behind it, and every element
// that scrolls sideways.
export function measureText(root) {
  const parse = (value) => {
    const n = (value.match(/[\d.]+/g) || ['0', '0', '0', '0']).map(Number);
    return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const luminance = (c) => [c.r, c.g, c.b]
    .map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const backgroundOf = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const background = parse(getComputedStyle(node).backgroundColor);
      if (background.a > 0) layers.push(background);
      if (background.a >= 1) break;
    }
    let background = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers.reverse()) background = over(layer, background);
    return background;
  };
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const words = walker.currentNode.textContent.trim();
    const element = walker.currentNode.parentElement;
    if (!words || !element || seen.has(element)) continue;
    if (element.closest('script, style, [hidden], .sr-only')) continue;
    if (element.closest('details:not([open])') && !element.closest('summary')) continue;
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (box.width === 0 || box.height === 0 || style.visibility === 'hidden' || style.clipPath === 'inset(50%)') continue;
    seen.add(element);
    const background = backgroundOf(element);
    const text = over(parse(style.color), background);
    const a = luminance(text);
    const b = luminance(background);
    out.push({
      words: words.slice(0, 40),
      tag: element.tagName.toLowerCase(),
      body: !!element.closest('main') && !!element.closest('h1, h2, h3, p, summary') && !element.closest('a, figcaption, [data-run-caption], .home-detection__tags'),
      size: parseFloat(style.fontSize),
      face: style.fontFamily,
      weight: style.fontWeight,
      figures: style.fontVariantNumeric,
      contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    });
  }
  return out;
}

// Reads a picture of words the way the readability rule measures it, in a
// blank page of its own: the ground is the picture's commonest colour; the
// ink is every pixel on the words' side of the ground at 1.5:1 or more; the
// core is the median of the ink's strongest 4 per cent; the strokes are the
// median of the ink at least half way (in contrast) from the ground to the
// core. The strokes' figure keeps the anti-aliased half of each stroke, so a
// thin face reads under its computed colour; it is the figure the minimum is
// held to. Returns null when the picture holds too little ink to read.
export function readStrokes(base64) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('the picture of the words did not load'));
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const drawing = canvas.getContext('2d');
      drawing.drawImage(image, 0, 0);
      const { data, width, height } = drawing.getImageData(0, 0, canvas.width, canvas.height);
      const count = width * height;
      const linear = (value) => { const s = value / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      const luminance = (r, g, b) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const medianOf = (indexes) => [0, 1, 2].map((channel) => {
        const values = indexes.map((i) => data[i * 4 + channel]).sort((a, b) => a - b);
        return values[Math.floor(values.length / 2)];
      });
      // The ground: the commonest colour to 16 levels a channel, then the
      // median of every pixel within 12 levels of it.
      const buckets = new Map();
      for (let i = 0; i < count; i += 1) {
        const key = ((data[i * 4] >> 4) << 8) | ((data[i * 4 + 1] >> 4) << 4) | (data[i * 4 + 2] >> 4);
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
      const top = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const first = medianOf([...Array(count).keys()].filter((i) => (((data[i * 4] >> 4) << 8) | ((data[i * 4 + 1] >> 4) << 4) | (data[i * 4 + 2] >> 4)) === top));
      const ground = medianOf([...Array(count).keys()].filter((i) => [0, 1, 2].every((c) => Math.abs(data[i * 4 + c] - first[c]) <= 12)));
      const groundLight = luminance(...ground);
      const lights = new Float64Array(count);
      let lighter = 0;
      let darker = 0;
      for (let i = 0; i < count; i += 1) {
        lights[i] = luminance(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
        if (ratio(lights[i], groundLight) >= 1.5) {
          if (lights[i] > groundLight) lighter += 1;
          else darker += 1;
        }
      }
      const wordsLighter = lighter >= darker;
      const ink = new Uint8Array(count);
      for (let i = 0; i < count; i += 1) {
        ink[i] = ratio(lights[i], groundLight) >= 1.5 && (lights[i] > groundLight) === wordsLighter ? 1 : 0;
      }
      // A thin run of rows that is nearly all ink is a rule or an underline, not words.
      if (width >= 40) {
        let start = -1;
        for (let y = 0; y <= height; y += 1) {
          let filled = 0;
          if (y < height) for (let x = 0; x < width; x += 1) filled += ink[y * width + x];
          const full = y < height && filled >= 0.85 * width;
          if (full && start < 0) start = y;
          if (!full && start >= 0) {
            if (y - start <= 4) for (let r = start; r < y; r += 1) ink.fill(0, r * width, (r + 1) * width);
            start = -1;
          }
        }
      }
      const inked = [];
      for (let i = 0; i < count; i += 1) if (ink[i]) inked.push(i);
      if (inked.length < Math.max(20, 0.002 * count)) { resolve(null); return; }
      const distance = (i) => Math.abs(Math.log(ratio(lights[i], groundLight)));
      const distances = inked.map(distance).sort((a, b) => b - a);
      const strongest = Math.max(Math.min(inked.length, 6), Math.round(inked.length * 0.04));
      const cut = distances[strongest - 1];
      const core = medianOf(inked.filter((i) => distance(i) >= cut));
      const coreRatio = ratio(luminance(...core), groundLight);
      const half = inked.filter((i) => distance(i) >= 0.5 * Math.log(coreRatio));
      const strokes = half.length ? medianOf(half) : core;
      resolve({ core: coreRatio, strokes: ratio(luminance(...strokes), groundLight) });
    };
    image.src = `data:image/png;base64,${base64}`;
  });
}

// Allow the browser to paint a newly decoded SVG before taking a screenshot.
const paint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export async function loadHomeQr(page) {
  const qr = page.locator('#one-device .home-qr img');
  // The exported page keeps its lazy image; the camera captures the whole
  // document at once and needs the image painted even beyond the viewport.
  await qr.evaluate((image) => { image.loading = 'eager'; });
  await qr.scrollIntoViewIfNeeded({ timeout: 15_000 });
  await page.waitForFunction((image) => image.complete && image.naturalWidth > 0,
    await qr.elementHandle(), { timeout: 15_000 });
  await qr.evaluate((image) => image.decode());
  await page.evaluate(paint);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.evaluate(paint);
}

export async function screenshotWithHomeQr(page, options) {
  const qr = await page.locator('#one-device .home-qr img').evaluate((image, { clip, scale }) => {
    const rect = image.getBoundingClientRect();
    const density = scale === 'css' ? 1 : window.devicePixelRatio;
    return {
      x: Math.round((rect.left + window.scrollX - (clip?.x ?? 0)) * density),
      y: Math.round((rect.top + window.scrollY - (clip?.y ?? 0)) * density),
      width: Math.round(rect.width * density),
      height: Math.round(rect.height * density),
    };
  }, options);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const png = await page.screenshot(options);
    const visible = await page.evaluate(async ({ png, qr }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const drawing = canvas.getContext('2d');
      drawing.imageSmoothingEnabled = false;
      drawing.drawImage(image, qr.x, qr.y, qr.width, qr.height, 0, 0, size, size);
      const { data } = drawing.getImageData(0, 0, size, size);
      let black = 0;
      let white = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        const colour = data.slice(i, i + 3);
        if (colour.every((channel) => channel < 32)) black += 1;
        if (colour.every((channel) => channel > 223)) white += 1;
      }
      return black > size * size * 0.12 && white > size * size * 0.25;
    }, { png: png.toString('base64'), qr });
    if (visible) return;
    await page.evaluate(paint);
  }
  throw new Error('The QR code is missing from the captured pixels');
}

async function withOpenDisclosures(page, read) {
  for (const card of await page.locator('.home-detection__card').all()) {
    const id = await card.evaluate((details) => {
      details.open = true;
      return details.dataset.card;
    });
    try {
      await read(id, card.locator('.home-detection__body'));
    } finally {
      await card.evaluate((details) => { details.open = false; });
    }
  }
}

// Read text from each visible CSS range. Canvas glyph extents let the pixel
// sampler tell a short glyph at 18 px from a longer glyph at a smaller size.
function pageWordBoxes(disclosure) {
  const shell = document.querySelector('.visitor-shell');
  const strip = shell.querySelector('.home-run__strip');
  const root = disclosure === 'run-steps' ? strip
    : disclosure ? shell.querySelector(`[data-card="${disclosure}"] .home-detection__body`) : shell;
  const stripBounds = strip.getBoundingClientRect();
  let clip;
  if (disclosure) {
    const rect = root.getBoundingClientRect();
    const x = Math.floor(rect.left + window.scrollX);
    const y = Math.floor(rect.top + window.scrollY);
    clip = {
      x, y,
      width: Math.ceil(rect.right + window.scrollX) - x,
      height: Math.ceil(rect.bottom + window.scrollY) - y,
    };
  }
  const canvas = document.createElement('canvas').getContext('2d');
  const boxes = [];
  const rectangle = (rect) => ({
    x: rect.x + window.scrollX - (clip?.x ?? 0),
    y: rect.y + window.scrollY - (clip?.y ?? 0),
    width: rect.width, height: rect.height,
  });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement;
    if (element.closest('script, style, [hidden], .sr-only, .skip-link, #site-menu, svg')) continue;
    if (element.closest('details:not([open])') && !element.closest('summary')) continue;
    const style = getComputedStyle(element);
    if (!element.getClientRects().length || style.visibility === 'hidden' || style.clipPath === 'inset(50%)') continue;
    const body = element.closest('main :is(h1,h2,h3,p,.home-detection__summary,.home-diagram__node,.home-server__list)')
      && !element.closest('a, button, figcaption, [data-run-caption], .home-detection__tags, .home-diagram__inputs');
    const range = document.createRange();
    canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    for (const word of node.textContent.matchAll(/\S+/g)) {
      const label = word[0];
      range.setStart(node, word.index);
      range.setEnd(node, word.index + label.length);
      const rects = Array.from(range.getClientRects());
      if (!rects.length) continue;
      const metrics = canvas.measureText(label);
      const meaningful = /[\p{L}\p{N}]/u.test(label);
      for (const rect of rects) {
        if (rect.width < 1 || rect.height < 1) continue;
        const run = element.closest('button[data-run]')?.dataset.run;
        if (run && (rect.left < stripBounds.left || rect.right > stripBounds.right)) continue;
        boxes.push({
          name: label, type: meaningful ? body ? 'body' : 'label' : 'glyph',
          ...(run ? { runStep: run } : {}),
          size: parseFloat(style.fontSize),
          expectedInkHeight: rects.length === 1 ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent : null,
          ...rectangle(rect),
        });
      }
    }
  }
  if (clip) return { scale: window.devicePixelRatio, width: clip.width, height: clip.height, clip, boxes };

  for (const element of shell.querySelectorAll('main .home-benefit svg, main .home-use .home-h3 svg, main .home-detection__glyph svg, main .home-diagram__glyph svg, main .home-server__list svg')) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 1 && rect.height > 1) boxes.push({ name: element.closest('li, details').textContent.trim().slice(0, 45), type: 'glyph', ...rectangle(rect) });
  }
  for (const element of shell.querySelectorAll('.home-use__key, .home-diagram__node, .home-detection__card')) {
    const rect = element.getBoundingClientRect();
    // Sample the actual top edge and a strip of its backing colour.
    boxes.push({ name: element.textContent.trim().slice(0, 45), type: 'edge',
      x: rect.x + rect.width / 4 + window.scrollX, y: rect.y - 3 + window.scrollY,
      width: rect.width / 2, height: 4 });
  }
  return { scale: window.devicePixelRatio, width: document.documentElement.clientWidth, height: document.documentElement.scrollHeight, boxes };
}

// Measure the words themselves so inline link boxes cannot hide uneven line spacing.
function readLines(selector) {
  const root = document.querySelector(selector);
  const lines = new Map();
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (let i = 0; i < node.length; i += 1) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0) continue;
      const top = Math.round(rect.top * 2) / 2;
      lines.set(top, (lines.get(top) || '') + node.data[i]);
    }
  }
  return [...lines].sort(([a], [b]) => a - b).map(([top, text]) => ({ top, text: text.trim() }));
}

export async function checkHomePage(browser, baseUrl, outDir) {
  const problems = [];
  const home = new URL('/', baseUrl).toString();
  const origin = new URL(baseUrl).origin;
  const runResponse = await fetch(new URL('/home/runs/runs.json', baseUrl));
  if (!runResponse.ok) throw Error('The exported home has no run manifest');
  const runRecord = await runResponse.json();
  const firstRun = runRecord.runs[0];
  const fail = (message) => problems.push(message);
  const expect = (ok, message) => { if (!ok) fail(message); };

  const open = async (options, run, { setupDone = false, script = null } = {}) => {
    const { width, height = 844, look = 'light', ...rest } = options;
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: width < 768,
      hasTouch: width < 768,
      colorScheme: look,
      ...rest,
    });
    if (setupDone) await context.addInitScript(SETUP_DONE);
    if (script) await context.addInitScript(script);
    const page = await context.newPage();
    // A call that waits on the page for ever (one that waits for an event
    // the page never sends) would hold the job until its own time limit.
    // Each walk gets three minutes; one that runs over is a finding with its
    // name, and closing its context ends the call it was waiting on.
    let limit;
    const ranOver = new Promise((_, reject) => {
      limit = setTimeout(() => reject(new Error(`did not finish in ${WALK_LIMIT_MS / 1000} seconds`)), WALK_LIMIT_MS);
    });
    try {
      await Promise.race([run(page, context), ranOver]);
    } catch (err) {
      fail(`${options.name || 'home page'} at ${width} px, ${look}: ${err.message.split('\n')[0]}`);
    } finally {
      clearTimeout(limit);
      await context.close();
    }
  };
  const visit = (page, address = home) => page.goto(address, { waitUntil: 'networkidle', timeout: 60_000 });
  const sidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  await open({ name: 'home explanation', width: 390 }, async (page) => {
    await visit(page);
    const section = page.locator('#how-it-works');
    const heading = section.getByRole('heading', { name: 'Deep learning, in your browser.', exact: true });
    if (!(await heading.isVisible())) throw new Error('How it works: Deep learning, in your browser. missing');
    const cards = section.locator('details');
    if (await cards.count() !== 6) throw new Error('How it works must have six disclosures');
    const first = cards.first();
    await first.locator('summary').press('Space');
    if (!(await first.evaluate((card) => card.open))) throw new Error('Space did not open the first disclosure');
  });

  for (const width of [390, 1440]) {
    await open({ name: 'diagram and disclosure accessibility', width }, async (page, context) => {
      await visit(page);
      const sources = await page.locator('[data-node="lost-found"]').ariaSnapshot();
      expect(/From[\s\S]*Camera[\s\S]*Your pet[’']s photos/.test(sources),
        `diagram at ${width} px: Lost and Found sources missing from the accessibility snapshot`);
      const alert = await page.locator('[data-node="alert"]').ariaSnapshot();
      expect(/From[\s\S]*Motion[\s\S]*People and Wildlife/.test(alert),
        `diagram at ${width} px: the alert inputs are missing from the accessibility snapshot`);

      const session = await context.newCDPSession(page);
      try {
        const { root } = await session.send('DOM.getDocument');
        const { nodeIds } = await session.send('DOM.querySelectorAll', {
          nodeId: root.nodeId, selector: '.home-detection__card > summary',
        });
        const summaries = await page.locator('.home-detection__card > summary').allInnerTexts();
        expect(nodeIds.length === 6, `disclosures at ${width} px: expected six accessible summaries`);
        for (const [index, nodeId] of nodeIds.entries()) {
          const { nodes: [summary] } = await session.send('Accessibility.getPartialAXTree', {
            nodeId, fetchRelatives: false,
          });
          expect(plain(summary?.name?.value) === plain(summaries[index]),
            `disclosure at ${width} px: Chromium names "${summaries[index]}" as "${summary?.name?.value}"`);
        }
      } finally {
        await session.detach();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // The page reads before any script runs and asks for nothing
  // ---------------------------------------------------------------------------

  for (const look of LOOKS) {
    await open({ name: 'first visit, scripts off', width: 390, look, javaScriptEnabled: false }, async (page) => {
      await visit(page);
      const seen = await page.evaluate((NEEDS) => {
        const visible = (element) => !!element && element.getBoundingClientRect().height > 0 && getComputedStyle(element).visibility !== 'hidden';
        const line = document.getElementById('home-needs-script');
        const statement = document.querySelector('.home-statement');
        let opacity = 1;
        for (let node = document.querySelector('h1'); node; node = node.parentElement) opacity *= parseFloat(getComputedStyle(node).opacity);
        return {
          h1: visible(document.querySelector('h1')),
          benefits: document.querySelectorAll('.home-benefit').length,
          start: document.querySelector('.home-first a.key--start')?.getAttribute('href'),
          startWords: document.querySelector('.home-first a.key--start')?.textContent.trim(),
          statement: visible(statement),
          line: visible(line) && line.textContent.trim() === NEEDS,
          lineUnderStatement: !!line && !!statement && line.getBoundingClientRect().top >= statement.getBoundingClientRect().bottom,
          sections: [...document.querySelectorAll('main h2')].filter((heading) => visible(heading) && !heading.classList.contains('sr-only')).length,
          footer: visible(document.querySelector('footer nav[aria-label="Site links"]')),
          menu: document.querySelector('nav[aria-label="Site"] .site-header__menu-key')?.getAttribute('href'),
          menuTag: document.querySelector('nav[aria-label="Site"] .site-header__menu-key')?.tagName,
          switchShown: !!document.querySelector('.look-switch'),
          footerStart: document.querySelector('footer nav a')?.textContent.trim(),
          background: getComputedStyle(document.body).backgroundColor,
          opacity,
          poster: getComputedStyle(document.querySelector('.home-run__first-poster')).backgroundImage,
          labels: [...document.querySelectorAll('.home-runs button[data-run]')].map((key) => key.textContent.trim()),
          captions: document.querySelector('.home-runs noscript')?.textContent.trim(),
        };
      }, NEEDS_SCRIPT);
      expect(seen.h1 && seen.benefits === 3 && seen.statement, `first visit, scripts off, ${look}: the headline, benefits or statement is missing`);
      expect(/^\/setup\/?$/.test(seen.start || '') && seen.startWords === 'Start setup', `first visit, scripts off, ${look}: the start key is "${seen.startWords}" to ${seen.start}`);
      expect(seen.line && seen.lineUnderStatement, `first visit, scripts off, ${look}: "${NEEDS_SCRIPT}" does not show under the statement`);
      expect(seen.sections === 5, `first visit, scripts off, ${look}: ${seen.sections} part headings show, expected 5`);
      expect(seen.footer, `first visit, scripts off, ${look}: the footer's links do not show`);
      expect(seen.menuTag === 'A' && seen.menu === '#site-links', `header, scripts off, ${look}: Menu is a ${seen.menuTag} to ${seen.menu}, not a link to the footer's links`);
      expect(!seen.switchShown, `look switch, scripts off, ${look}: a look switch is shown`);
      expect(seen.footerStart === 'Start setup', `footer, scripts off, ${look}: the footer's start link reads "${seen.footerStart}"`);
      expect(seen.background === PAGE_COLOURS[look], `first visit, scripts off, ${look}: the page is ${seen.background}, not ${PAGE_COLOURS[look]}`);
      expect(seen.opacity === 1, `first visit, scripts off, ${look}: the headline's opacity is ${seen.opacity}`);
      expect(seen.poster.includes(firstRun.variants.square[look].poster.webp.path), 'Scripts off: ' + firstRun.key + ' poster for ' + look);
      expect(seen.labels.join(',') === runRecord.runs.map(({ key }) => key).join(','), 'Scripts off: every run label is present');
      expect(runRecord.runs.slice(1).every(({ description }) => seen.captions?.includes(description)), 'Scripts off: every run caption is present');
      // A disclosure opens with scripts off.
      const question = page.locator('details.home-detection__card').nth(1);
      await question.locator('summary').click();
      expect(await question.evaluate((element) => element.open), `disclosures, scripts off, ${look}: a pressed card does not open`);
      await page.screenshot({ path: path.join(outDir, `home-scripts-off-390-${look}.png`), fullPage: true });
    });

    // The main script blocked, scripts on: the page still reads and the line stays.
    await open({ name: 'first visit, main script blocked', width: 390, look }, async (page, context) => {
      await context.route('**/_next/static/chunks/**', (route) => route.abort());
      await page.goto(home, { waitUntil: 'load', timeout: 60_000 });
      // The line comes back once the page has waited five seconds for the app.
      await page.waitForTimeout(7_000);
      const seen = await page.evaluate(() => {
        let opacity = 1;
        for (let node = document.querySelector('h1'); node; node = node.parentElement) opacity *= parseFloat(getComputedStyle(node).opacity);
        const line = document.getElementById('home-needs-script');
        return { opacity, line: !!line && line.getBoundingClientRect().height > 0, h1: document.querySelector('h1')?.textContent.trim() };
      });
      expect(seen.opacity === 1 && seen.h1 === HEADLINE, `first visit, main script blocked, ${look}: the headline is not readable (opacity ${seen.opacity})`);
      expect(seen.line, `first visit, main script blocked, ${look}: "${NEEDS_SCRIPT}" does not show`);
    });
  }

  // Scripts on and the app still loading (a slow phone or connection): the
  // line does not tell this visitor that setup needs JavaScript.
  await open({ name: 'first visit, app still loading', width: 390 }, async (page, context) => {
    await context.route('**/_next/static/chunks/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      await route.continue().catch(() => {});
    });
    await page.goto(home, { waitUntil: 'commit', timeout: 60_000 });
    await page.waitForFunction(() => document.getElementById('home-needs-script')?.nextElementSibling?.tagName === 'SCRIPT', null, { timeout: 30_000 });
    const seen = await page.evaluate(() => {
      const line = document.getElementById('home-needs-script');
      return { shown: !!line && line.getBoundingClientRect().height > 0, started: document.documentElement.getAttribute('data-app-started') };
    });
    expect(!seen.shown, `first visit, app still loading: "${NEEDS_SCRIPT}" shows to a visitor whose scripts run (app started: ${seen.started})`);
  });

  function observePermissionRequests() {
    window.homePermissionRequests = [];
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = () => {
        window.homePermissionRequests.push('camera or microphone');
        return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      };
    }
    if (window.Notification) {
      Notification.requestPermission = () => {
        window.homePermissionRequests.push('notifications');
        return Promise.resolve('denied');
      };
    }
  }

  // Nothing blocked: the line hides once the app has started; every request
  // stays on the site; no cookie; no card or sheet appears, however long the
  // visitor stays, before setup or after it.
  for (const setupDone of [false, true]) {
    await open({ name: 'first visit, requests', width: setupDone ? 390 : 1280, height: setupDone ? 844 : 800 }, async (page, context) => {
      const hosts = new Set();
      context.on('request', (request) => {
        const url = new URL(request.url());
        if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:') hosts.add(url.origin);
      });
      await visit(page);
      await page.waitForTimeout(8_000);
      const elsewhere = [...hosts].filter((host) => host !== origin);
      const permissionRequests = await page.evaluate(() => window.homePermissionRequests);
      expect(permissionRequests.length === 0, `first visit requested permission: ${permissionRequests.join(', ')}`);
      expect(elsewhere.length === 0, `first visit: the page asked ${elsewhere.join(', ')}`);
      expect((await page.evaluate(() => document.cookie)) === '', 'first visit: the page set a cookie');
      expect(await page.locator('#home-needs-script').isHidden(), `first visit: "${NEEDS_SCRIPT}" still shows after the app started`);
      for (const words of ['Enable notifications', 'Install SafeOS', 'Install App']) {
        expect((await page.getByText(words).count()) === 0, `first visit: "${words}" shows on the home page${setupDone ? ' after setup' : ''}`);
      }
    }, { setupDone, script: observePermissionRequests });
  }

  // A saved server address: every request that leaves the site goes to it.
  await open({ name: 'first visit, saved server', width: 1280, height: 800 }, async (page, context) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
    await context.route('https://server.example.test/**', (route) => route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"status":"ok"}' }));
    const hosts = new Set();
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (/^(https?|wss?):$/.test(url.protocol) && url.origin !== origin) hosts.add(url.host);
    });
    await visit(page);
    await page.waitForTimeout(3_000);
    const others = [...hosts].filter((host) => host !== 'server.example.test');
    expect(others.length === 0, `first visit, saved server: the page asked ${others.join(', ')}`);
    expect(hosts.has('server.example.test'), 'first visit, saved server: the saved address was not checked');
  }, { script: () => localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://server.example.test', wsUrl: 'wss://server.example.test/ws' })) });

  // The skip link, the landmarks and the headings.
  await open({ name: 'first visit, skip link', width: 1280, height: 800, look: 'dark' }, async (page) => {
    await visit(page);
    await page.keyboard.press('Tab');
    const skip = await page.evaluate(() => {
      const element = document.activeElement;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { words: element.textContent.trim(), shown: box.width >= 120 && box.height >= 44 && box.top >= 0 && style.opacity === '1' && style.clipPath === 'none', outline: style.outlineStyle, width: Math.round(box.width), height: Math.round(box.height) };
    });
    expect(skip.words === 'Skip to content' && skip.shown, `first visit: the first Tab stop is "${skip.words}", ${skip.width} by ${skip.height} px, shown ${skip.shown}`);
    expect(skip.outline !== 'none', 'first visit: the skip link shows no ring');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement?.id === 'main-content'), 'first visit: Enter on the skip link does not move focus to the main content');
    const marks = await page.evaluate(() => ({
      mains: document.querySelectorAll('main').length,
      h1s: document.querySelectorAll('h1').length,
      navs: [...document.querySelectorAll('nav')].map((nav) => nav.getAttribute('aria-label')),
      footers: document.querySelectorAll('footer').length,
    }));
    expect(marks.mains === 1 && marks.h1s === 1, `first visit: ${marks.mains} main landmarks and ${marks.h1s} H1 headings`);
    expect(marks.navs.join(' | ') === 'Site | Site links', `first visit: the navigation landmarks are ${marks.navs.join(' | ')}`);
    // The Tab order of the header, from a fresh visit: a reload would keep
    // the skip link's #main-content and start Tab there.
    await visit(page);
    const order = [];
    for (let i = 0; i < 9; i += 1) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => {
        const element = document.activeElement;
        return element.getAttribute('aria-label') || element.textContent.trim();
      }));
    }
    const wanted = ['Skip to content', 'How it works', 'Uses', 'Guides', 'FAQ', 'Privacy', GITHUB_HEADER_NAME, 'Switch to the light look', 'Start setup'];
    expect(order.join(' > ') === wanted.join(' > '), `header: the Tab order is ${order.join(' > ')}`);
  });

  // No sideways scroll, the readable sizes and contrast, at each width in
  // both looks; the page from top to bottom at 820 and 1920 pixels.
  for (const width of [320, 390, 820, 1280, 1440, 1920]) {
    for (const look of LOOKS) {
      await open({ name: 'first visit, readable', width, height: width >= 1440 ? 900 : width >= 768 ? 800 : 844, look }, async (page) => {
        await visit(page);
        expect((await sidewaysScroll(page)) <= 0, `first visit at ${width} px, ${look}: the page scrolls sideways`);
        if (width === 820 || width === 1920) {
          await loadHomeQr(page);
          expect(await page.locator('.home-qr img').evaluate((image) => image.complete && image.naturalWidth > 0),
            `full page at ${width} px, ${look}: the QR has not loaded`);
          await screenshotWithHomeQr(page, { path: path.join(outDir, `home-${width}-${look}.png`), fullPage: true });
        }
        if (![390, 820, 1280, 1440, 1920].includes(width)) return;

        const shell = await page.locator('.visitor-shell').elementHandle();
        const texts = await page.evaluate(measureText, shell);
        expect(texts.length > 60, `readability at ${width} px, ${look}: only ${texts.length} pieces of text were measured`);
        await withOpenDisclosures(page, async (id, body) => {
          const disclosure = await page.evaluate(measureText, await body.elementHandle());
          expect(disclosure.some((text) => text.body), `readability at ${width} px, ${look}: no CSS readings for ${id}`);
          texts.push(...disclosure);
        });

        const bodySize = width >= 1440 ? 20 : 18;
        for (const text of texts) {
          const where = `at ${width} px, ${look}: "${text.words}"`;
          if (text.size < 16) fail(`readability ${where} is ${text.size} px, under 16`);
          if (/mono/i.test(text.face.split(',')[0])) fail(`readability ${where} is set in ${text.face.split(',')[0]}`);
          if (!['400', '700'].includes(text.weight)) fail(`readability ${where} has weight ${text.weight}`);
          if (text.body && text.tag === 'p' && text.size < bodySize) fail(`readability ${where} is body text at ${text.size} px, under ${bodySize}`);
          if (text.contrast < (text.body ? 12 : 7)) fail(`readability ${where} has contrast ${text.contrast.toFixed(2)}, under ${text.body ? 12 : 7}`);
        }
        // Tabular figures for the numbers only: a word set with them takes
        // Inter's figure-width hyphen ("loud - sound").
        const figures = await page.evaluate(() => {
          const out = { numbers: [], hyphens: [] };
          const walker = document.createTreeWalker(document.querySelector('.visitor-shell'), NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const words = walker.currentNode.textContent;
            const element = walker.currentNode.parentElement;
            if (!element || !words.trim() || element.closest('script, style, [hidden], .sr-only')) continue;
            if (element.getBoundingClientRect().width === 0 || getComputedStyle(element).visibility === 'hidden') continue;
            const tabular = /tabular-nums/.test(getComputedStyle(element).fontVariantNumeric);
            if (/\d/.test(words) && !tabular) out.numbers.push(words.trim().slice(0, 40));
            if (/\p{L}-\p{L}/u.test(words) && tabular) out.hyphens.push(words.trim().slice(0, 40));
          }
          return out;
        });
        for (const words of figures.numbers) fail(`readability at ${width} px, ${look}: "${words}" holds a number without tabular figures`);
        for (const words of figures.hyphens) fail(`readability at ${width} px, ${look}: "${words}" is set with tabular figures, which widen its hyphen`);
      });
    }
  }

  // Pair the full page and each open disclosure with their exact CSS word
  // ranges at both widths and in both looks.
  const readability = [];
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    for (const look of LOOKS) {
      await open({ name: 'readability pictures', width, height, look, deviceScaleFactor: 2, reducedMotion: 'reduce' }, async (page) => {
        await visit(page);
        await page.evaluate(() => document.fonts.ready);
        await loadHomeQr(page);
        expect(await page.locator('.home-qr img').evaluate((image) => image.complete && image.naturalWidth > 0),
          `readability at ${width} px, ${look}: the QR has not loaded`);
        const file = `home-readability-${width}-${look}.png`;
        const sample = await page.evaluate(pageWordBoxes);
        expect(sample.boxes.length > 100, `readability ${file}: only ${sample.boxes.length} ranges`);
        await screenshotWithHomeQr(page, { path: path.join(outDir, file), fullPage: true, scale: 'device', caret: 'hide' });
        const variant = [{ file, ...sample }];
        await withOpenDisclosures(page, async (id) => {
          const file = `home-readability-${id}-${width}-${look}.png`;
          const { clip, ...sample } = await page.evaluate(pageWordBoxes, id);
          await page.screenshot({
            path: path.join(outDir, file), clip, fullPage: true, scale: 'device', caret: 'hide',
            style: 'nav[aria-label="Site"] { visibility: hidden !important; }',
          });
          variant.push({ file, disclosure: id, ...sample });
        });
        if (width === 390) {
          await page.locator('.home-run__strip').evaluate((strip) => { strip.scrollLeft = strip.scrollWidth; });
          await page.evaluate(paint);
          const file = `home-readability-run-steps-${width}-${look}.png`;
          const { clip, ...steps } = await page.evaluate(pageWordBoxes, 'run-steps');
          await page.screenshot({ path: path.join(outDir, file), clip, fullPage: true, scale: 'device', caret: 'hide' });
          variant.push({ file, ...steps });
        }
        readability.push(...variant);
        const stepIds = new Set(variant.flatMap(({ boxes }) => boxes.map(({ runStep }) => runStep)));
        expect(runRecord.runs.every(({ id }) => stepIds.has(id)), `readability at ${width} px, ${look}: missing a run step's visible letters`);
        const disclosureIds = await page.locator('.home-detection__card').evaluateAll((cards) => cards.map((card) => card.dataset.card));
        const measured = new Set(variant.filter((entry) => entry.boxes.some((box) => box.type === 'body'))
          .map(({ disclosure }) => disclosure));
        expect(disclosureIds.length === 6 && disclosureIds.every((id) => measured.has(id)),
          `readability at ${width} px, ${look}: missing open disclosure words for ${disclosureIds.filter((id) => !measured.has(id)).join(', ')}`);
        expect(variant.some((entry) => entry.disclosure === 'storage' &&
          entry.boxes.some((box) => box.name === 'privacy' && box.type === 'label')),
        `readability at ${width} px, ${look}: missing the open privacy link`);
      });
    }
  }
  // Each displayed recording uses the recorded crop-relative CSS rectangles.
  // Project through native recorded pixels to the actual image's size on /.
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    const height = width < 768 ? 844 : 900;
    for (const look of LOOKS) {
      await open({ name: 'recorded poster pixels', width, height, look, deviceScaleFactor: 2,
        reducedMotion: 'reduce', serviceWorkers: 'block' }, async (page) => {
        await visit(page);
        await page.evaluate(() => document.fonts.ready);
        for (const [index, run] of runRecord.runs.entries()) {
          if (index) await page.locator('button[data-run="' + run.id + '"]').click();
          const variant = run.variants[width < 1280 ? 'square' : 'wide'][look];
          const posterWords = variant.words.map(({ word }) => word).join(' ');
          if (run.id === 'dashboard') {
            expect(posterWords.includes('Since you last looked') && posterWords.includes('Movement at')
              && posterWords.includes('Sound at'), 'Dashboard poster omits the watch’s alerts at ' + width + ' px, ' + look);
          }
          if (run.id === 'watching') {
            expect(posterWords.includes('Motion') && posterWords.includes('Sound'),
              'Watching poster omits a meter at ' + width + ' px, ' + look);
          }
          const poster = page.locator('.home-run__poster img');
          await page.waitForFunction((name) => {
            const image = document.querySelector('.home-run__poster img');
            return image?.complete && image.naturalWidth > 0 && new URL(image.currentSrc).pathname.startsWith(name);
          }, '/' + variant.poster.webp.path.replace(/\.webp$/, ''), { timeout: 15000 });
          await poster.evaluate((image) => image.decode());
          await poster.scrollIntoViewIfNeeded();
          await page.evaluate(paint);
          const frame = await poster.boundingBox();
          if (!frame || !variant.words.length) throw Error('No poster word ranges for ' + run.id);
          const media = variant.poster.webp;
          const display = Math.min(frame.width / media.width, frame.height / media.height);
          const startX = frame.x + (frame.width - media.width * display) / 2;
          const startY = frame.y + (frame.height - media.height * display) / 2;
          const factor = variant.scale * display;
          const boxes = variant.words.map((word) => ({
            name: word.word, type: 'poster', size: word.size * factor,
            expectedInkHeight: word.inkHeight === undefined ? null : word.inkHeight * factor,
            x: startX + word.x * factor, y: startY + word.y * factor,
            width: word.width * factor, height: word.height * factor,
          }));
          const file = 'home-readability-run-' + run.id + '-' + width + '-' + look + '.png';
          await page.screenshot({ path: path.join(outDir, file), scale: 'device', caret: 'hide' });
          readability.push({ file, run: run.id, width, height, scale: 2, boxes });
        }
      });
    }
  }
  await writeFile(path.join(outDir, 'home-readability-boxes.json'), JSON.stringify(readability));

  await open({ name: 'narrow diagram', width: 320 }, async (page) => {
    await visit(page);
    expect((await sidewaysScroll(page)) === 0, '320 px: the page scrolls sideways');
    const columns = await page.locator('.home-diagram__band').evaluateAll((bands) =>
      bands.every((band) => new Set([...band.children].map((node) => Math.round(node.getBoundingClientRect().left))).size === 1)
    );
    expect(columns, '320 px: the diagram is in more than one column');
  });

  // Text at 200 per cent with the spacing overrides: nothing scrolls sideways
  // and the header keeps one row.
  for (const width of [320, 390, 820, 1280]) {
    await open({ name: 'first visit, larger text', width, height: 800 }, async (page) => {
      await visit(page);
      await page.addStyleTag({ content: 'html { font-size: 200% !important; } * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }' });
      await page.waitForTimeout(500);
      expect((await sidewaysScroll(page)) <= 0, `larger text at ${width} px: the page scrolls sideways`);
      const row = await page.evaluate(() => {
        const stacked = (group) => {
          const children = [...group.children].map((child) => child.getBoundingClientRect());
          return children.every((box, index) => index === 0 ||
            (Math.abs(box.left - children[0].left) < 1 && box.top >= children[index - 1].bottom - 0.5));
        };
        const bar = document.querySelector('nav[aria-label="Site"] .site-header__bar');
        const tops = [...bar.querySelectorAll('a, button')].filter((element) => element.getBoundingClientRect().width > 0)
          .map((element) => { const box = element.getBoundingClientRect(); return Math.round(box.top + box.height / 2); });
        const cut = [...document.querySelectorAll('main a.key, main .link-row, main summary')].filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.textContent.trim());
        const wordmark = bar.querySelector('.wordmark');
        return {
          rows: new Set(tops).size,
          over: bar.scrollWidth > bar.clientWidth + 1,
          menu: !!document.querySelector('.site-header__menu-key')?.getBoundingClientRect().width,
          cut,
          diagramStacks: [...document.querySelectorAll('.home-diagram__band')].every(stacked),
          cardsStack: stacked(document.querySelector('.home-detection__cards')),
          deviceStacks: stacked(document.querySelector('.home-how')),
          wordmark: !!wordmark && wordmark.getBoundingClientRect().width > 0 && getComputedStyle(wordmark).visibility !== 'hidden',
        };
      });
      expect(row.rows === 1 && !row.over, `header, larger text at ${width} px: the header is not one row`);
      // The row keeps the mark, the wordmark, the look switch and Menu; only
      // the links move into the Menu. At 320 px a Menu key in 200 per cent
      // text leaves no room for the wordmark beside the look switch.
      if (width >= 390) expect(row.wordmark, `header, larger text at ${width} px: the wordmark left the row`);
      else console.log(`header, larger text at ${width} px: the wordmark is ${row.wordmark ? 'in' : 'out of'} the row`);
      expect(row.diagramStacks, `larger text at ${width} px: diagram has not stacked`);
      expect(row.cardsStack, `larger text at ${width} px: the six cards have not stacked`);
      expect(row.deviceStacks, `larger text at ${width} px: the device section has not stacked`);
      if (width === 820) expect(row.menu, 'header, larger text at 820 px: the links did not move into the Menu');
      expect(row.cut.length === 0, `larger text at ${width} px: cut labels: ${row.cut.join(', ')}`);
      await page.screenshot({ path: path.join(outDir, `home-larger-text-${width}-light.png`) });
    });
  }

  // Scripts off, text at 200 per cent: nothing can move the links into the
  // Menu, so they scroll sideways inside the row; the page does not, and
  // every key of the header stays on the screen.
  for (const width of [820, 1280]) {
    await open({ name: 'header, scripts off, larger text', width, height: 800, javaScriptEnabled: false }, async (page) => {
      await visit(page);
      // page.addStyleTag waits for the style element's load event, which a
      // page with scripts off never sends; the element is added directly.
      await page.evaluate(() => {
        const style = document.createElement('style');
        style.textContent = 'html { font-size: 200% !important; }';
        document.head.appendChild(style);
      });
      await page.waitForTimeout(300);
      expect((await sidewaysScroll(page)) <= 0, `header, scripts off, larger text at ${width} px: the page scrolls sideways`);
      const row = await page.evaluate(() => {
        const screen = document.documentElement.clientWidth;
        const bar = document.querySelector('nav[aria-label="Site"] .site-header__bar');
        const links = bar.querySelector('.site-header__links');
        const shown = [...bar.querySelectorAll('a, button')].filter((element) => element.getBoundingClientRect().width > 0);
        const off = shown.filter((element) => {
          const box = element.getBoundingClientRect();
          return (box.left < -0.5 || box.right > screen + 0.5) && !links.contains(element);
        }).map((element) => element.getAttribute('aria-label') || element.textContent.trim());
        const linksBox = links.getBoundingClientRect();
        return {
          off,
          over: bar.scrollWidth > bar.clientWidth + 1,
          linksInside: linksBox.left >= -0.5 && linksBox.right <= screen + 0.5,
          linksScroll: links.scrollWidth <= links.clientWidth + 1 || getComputedStyle(links).overflowX === 'auto',
        };
      });
      expect(row.off.length === 0 && !row.over, `header, scripts off, larger text at ${width} px: ${row.off.join(', ') || 'the row'} runs off the screen`);
      expect(row.linksInside && row.linksScroll, `header, scripts off, larger text at ${width} px: the links do not stay inside the row (inside ${row.linksInside}, scroll ${row.linksScroll})`);
    });
  }

  // ---------------------------------------------------------------------------
  // Visitor header
  // ---------------------------------------------------------------------------

  for (const width of [320, 360, 390, 430, 480, 768, 820, 1024, 1280, 1440, 1920]) {
    for (const look of LOOKS) {
      await open({ name: 'header, header', width, height: 800, look }, async (page) => {
        await visit(page);
        const header = page.locator('nav[aria-label="Site"]');
        if (look === 'light') await header.screenshot({ path: path.join(outDir, `header-${width}-light.png`) });
        const found = await header.evaluate((nav, githubName) => {
          const out = [];
          const bar = nav.querySelector('.site-header__bar');
          const barBox = bar.getBoundingClientRect();
          const screen = document.documentElement.clientWidth;
          const phone = screen < 768;
          const height = phone ? 56 : 64;
          if (Math.abs(barBox.height - height) > 0.5) out.push(`the bar is ${Math.round(barBox.height)} px tall, not ${height}`);
          const controls = [...bar.querySelectorAll('a, button')].filter((element) => element.getBoundingClientRect().width > 0 && getComputedStyle(element).visibility !== 'hidden');
          const names = controls.map((element) => element.getAttribute('aria-label') || element.textContent.trim());
          const centres = new Set(controls.map((element) => { const box = element.getBoundingClientRect(); return Math.round(box.top + box.height / 2); }));
          if (centres.size !== 1) out.push(`its items sit on ${centres.size} rows`);
          for (const element of controls) {
            const box = element.getBoundingClientRect();
            const name = element.getAttribute('aria-label') || element.textContent.trim();
            if (box.left < -0.5 || box.right > screen + 0.5) out.push(`${name} runs off the screen`);
            if (box.height < 43.5) out.push(`${name} is ${Math.round(box.height)} px tall`);
          }
          const want = phone ? [githubName, 'Switch to the dark look|Switch to the light look', 'Menu']
            : screen < 1024 ? ['How it works', 'Uses', 'Guides', 'FAQ', githubName, 'Switch to the dark look|Switch to the light look', 'Start setup']
              : ['How it works', 'Uses', 'Guides', 'FAQ', 'Privacy', githubName, 'Switch to the dark look|Switch to the light look', 'Start setup'];
          if (names.length !== want.length || names.some((name, i) => !want[i].split('|').includes(name))) out.push(`its items are ${names.join(', ')}`);
          if (nav.querySelector('[aria-label="Help"], [aria-label*="otification"]')) out.push('it holds a bell or a shortcuts key');
          const links = nav.querySelector('.site-header__links');
          if (!phone) {
            const box = links.getBoundingClientRect();
            const centre = box.left + box.width / 2;
            if (screen >= 1440 && Math.abs(centre - screen / 2) > 2) out.push(`the links are centred at ${Math.round(centre)} of ${screen}`);
            if (screen < 1440 && centre > screen / 2) out.push('the links do not follow the mark');
          }
          if (getComputedStyle(nav).boxShadow !== 'none') out.push('the bar draws a line in the first screen');
          return out;
        }, GITHUB_HEADER_NAME);
        for (const p of found) fail(`header at ${width} px, ${look}: ${p}`);
        await page.keyboard.press('Tab');
        const headerKeys = await header.locator('.site-header__bar :is(a,button):visible').all();
        for (const key of headerKeys) {
          const focus = await key.evaluate((control) => {
            control.focus();
            const style = getComputedStyle(control);
            const rect = control.getBoundingClientRect();
            return { active: document.activeElement === control, ring: style.outlineWidth, offset: style.outlineOffset,
              covered: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('a,button') !== control };
          });
          expect(focus.active && focus.ring === '2px' && focus.offset === '2px' && !focus.covered,
            `header at ${width} px, ${look}: ${await key.textContent()} focus ${JSON.stringify(focus)}`);
        }
        expect((await sidewaysScroll(page)) <= 0, `header at ${width} px, ${look}: the page scrolls sideways`);
        // Once the page has moved under the bar, a 1 px line in the line colour.
        await page.evaluate(() => window.scrollTo(0, 600));
        await page.waitForFunction(() => getComputedStyle(document.querySelector('nav[aria-label="Site"]')).boxShadow !== 'none', null, { timeout: 5_000 })
          .catch(() => fail(`header at ${width} px, ${look}: no line under the bar once the page has moved under it`));
      });
    }
  }

  for (const look of LOOKS) {
    await open({ name: 'header, Menu', width: 390, look }, async (page) => {
      await visit(page);
      const key = page.locator('nav[aria-label="Site"] button.site-header__menu-key');
      const menu = page.locator('#site-menu');
      const sizes = await page.evaluate(() => {
        const look = document.querySelector('.look-switch').getBoundingClientRect();
        const menuKey = document.querySelector('.site-header__menu-key').getBoundingClientRect();
        return { look: [look.width, look.height], key: [menuKey.width, menuKey.height], gap: menuKey.left - look.right };
      });
      expect(sizes.look[0] === 44 && sizes.look[1] === 44, `look switch: the look switch is ${sizes.look.join(' by ')} px`);
      expect(sizes.key[0] >= 64 && sizes.key[1] >= 44, `header: the Menu key is ${sizes.key.join(' by ')} px`);
      expect(Math.abs(sizes.gap - 8) < 0.5, `header: the look switch and Menu are ${sizes.gap} px apart`);
      await key.click();
      await menu.waitFor({ timeout: 5_000 });
      const opened = await page.evaluate(() => {
        const menuKey = document.querySelector('.site-header__menu-key');
        const rows = [...document.querySelectorAll('#site-menu a')];
        return {
          words: [...menuKey.querySelectorAll('.menu-key__words span')].filter((span) => getComputedStyle(span).visibility !== 'hidden').map((span) => span.textContent).join(''),
          name: menuKey.getAttribute('aria-label'),
          expanded: menuKey.getAttribute('aria-expanded'),
          controls: menuKey.getAttribute('aria-controls'),
          width: menuKey.getBoundingClientRect().width,
          rows: rows.map((row) => row.textContent.trim()),
          heights: rows.map((row) => Math.round(row.getBoundingClientRect().height)),
          animation: getComputedStyle(document.getElementById('site-menu')).animationName,
        };
      });
      expect(opened.words === 'Close' && opened.name === 'Close menu' && opened.expanded === 'true' && opened.controls === 'site-menu',
        `header: the open Menu key shows "${opened.words}", is named "${opened.name}", aria-expanded ${opened.expanded}`);
      expect(Math.abs(opened.width - sizes.key[0]) < 0.5, `header: the Menu key changes width when open (${sizes.key[0]} to ${opened.width})`);
      const wantedRows = `Start setup, How it works, Uses, Guides, FAQ, Privacy, About SafeOS, Blog, ${STARS ? GITHUB_NAME : 'GitHub'}`;
      expect(opened.rows.join(', ') === wantedRows, `header: the Menu's rows are ${opened.rows.join(', ')}`);
      expect(opened.heights.every((height) => height >= 48), `header: the Menu's rows are ${opened.heights.join(', ')} px tall`);
      expect(opened.animation === 'site-menu-in', `header: the Menu panel's animation is ${opened.animation}`);
      // The picture shows the Menu as a visitor reads it, after its fade.
      await menu.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)).then(() => true));
      const drawn = await menu.evaluate((element) => ({
        opacity: getComputedStyle(element).opacity,
        fading: element.getAnimations().filter((animation) => animation.playState === 'running').length,
      }));
      expect(drawn.opacity === '1' && drawn.fading === 0, `header: the open Menu is pictured while its panel fades in (opacity ${drawn.opacity})`);
      await page.screenshot({ path: path.join(outDir, `home-menu-open-390-${look}.png`) });
      await page.keyboard.press('Escape');
      expect(await menu.isHidden(), 'header: Escape leaves the Menu open');
      expect(await key.evaluate((element) => element === document.activeElement), 'header: after Escape, focus is not on the Menu key');
      await key.click();
      await menu.waitFor({ timeout: 5_000 });
      await page.mouse.click(8, 760);
      expect(await menu.isHidden(), 'header: a press outside leaves the Menu open');
      expect(await key.evaluate((element) => element === document.activeElement), 'header: after a press outside, focus is not on the Menu key');
    });
  }

  // The Menu on a short screen scrolls inside itself; with reduced motion it shows at once.
  await open({ name: 'header, short screen', width: 320, height: 300, reducedMotion: 'reduce' }, async (page) => {
    await visit(page);
    await page.locator('nav[aria-label="Site"] button.site-header__menu-key').click();
    const menu = page.locator('#site-menu');
    await menu.waitFor({ timeout: 5_000 });
    const last = await menu.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      const rows = [...element.querySelectorAll('a')];
      const box = rows[rows.length - 1].getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, screen: window.innerHeight, duration: getComputedStyle(element).animationDuration, name: getComputedStyle(element).animationName };
    });
    expect(last.bottom <= last.screen + 0.5 && last.top >= 0, `header at 320 by 300: the Menu's last row sits at ${Math.round(last.top)} to ${Math.round(last.bottom)} of ${last.screen} px and the Menu does not scroll to it`);
    expect(last.name === 'none' || parseFloat(last.duration) < 0.001, `header, reduced motion: the Menu panel still fades (${last.name}, ${last.duration})`);
  });

  // Guides, FAQ and Privacy open with their own H1 and the same header and footer.
  await open({ name: 'header, links', width: 1280, height: 800 }, async (page) => {
    await visit(page);
    const footerGroups = await page.evaluate(() => [...document.querySelectorAll('footer h2')].map((heading) => heading.textContent.trim()).join(', '));
    for (const [link, address] of [['Guides', '/tutorials/'], ['FAQ', '/faq/'], ['Privacy', '/privacy/']]) {
      await visit(page);
      await Promise.all([
        page.waitForURL((url) => url.pathname === address, { timeout: 15_000 }),
        page.locator('nav[aria-label="Site"] .site-header__links').getByRole('link', { name: link, exact: true }).click(),
      ]);
      await page.locator('h1').first().waitFor({ timeout: 15_000 });
      const there = await page.evaluate(() => ({
        current: document.querySelector('nav[aria-label="Site"] [aria-current="page"]')?.textContent.trim(),
        groups: [...document.querySelectorAll('footer h2')].map((heading) => heading.textContent.trim()).join(', '),
        h1: document.querySelector('h1')?.textContent.trim(),
      }));
      expect(there.current === link, `header: on ${address} the link of the page being read is "${there.current}"`);
      expect(there.groups === footerGroups, `footer: ${address} has the footer groups ${there.groups}`);
      expect(!!there.h1 && there.h1 !== HEADLINE, `header: ${address} has no H1 of its own`);
    }
    await visit(page);
    const github = page.locator('nav[aria-label="Site"]').getByRole('link', { name: 'SafeOS on GitHub' });
    expect((await github.getAttribute('href')) === 'https://github.com/framerslab/safeos' && !(await github.getAttribute('target')),
      'header: the GitHub link does not open the repository in the same tab');
  });

  // After setup the start key reads "Open dashboard" in the header, the first
  // screen, the closing block, the Menu and the footer.
  for (const width of [390, 1280]) {
    await open({ name: 'start key, setup done', width, height: width === 390 ? 844 : 800 }, async (page) => {
      await visit(page);
      await page.getByText('Setup is done on this device.', { exact: true }).waitFor({ timeout: 10_000 });
      const seen = await page.evaluate(() => ({
        first: [...document.querySelectorAll('.home-first a')].map((a) => `${a.textContent.trim()} ${a.getAttribute('href')}`),
        closing: document.querySelector('.home-closing a')?.textContent.trim(),
        footer: document.querySelector('footer nav a')?.textContent.trim(),
        header: document.querySelector('.site-header__start')?.textContent.trim(),
        menu: document.querySelector('#site-menu a')?.textContent.trim(),
        h1: document.querySelector('h1').textContent.trim(),
      }));
      expect(/^Open dashboard \/dashboard\/?$/.test(seen.first[0] || '') && /^Run setup again \/setup\/?\?again=1$/.test(seen.first[1] || ''),
        `start key, setup done at ${width} px: the first screen's keys are ${seen.first.join(' | ')}`);
      expect([seen.closing, seen.footer, seen.header, seen.menu].every((words) => words === 'Open dashboard'),
        `start key, setup done at ${width} px: the start links read ${[seen.closing, seen.footer, seen.header, seen.menu].join(', ')}`);
      expect(seen.h1 === HEADLINE, 'headline, setup done: the headline changed');
      await page.screenshot({ path: path.join(outDir, `home-setup-done-${width}-light.png`) });
      // "Run setup again" opens setup at its first step and stays there.
      await Promise.all([
        page.waitForURL((url) => /^\/setup\/?$/.test(url.pathname), { timeout: 15_000 }),
        page.getByRole('link', { name: 'Run setup again', exact: true }).click(),
      ]);
      await page.getByRole('button', { name: /Begin Setup/i }).waitFor({ timeout: 15_000 });
      await page.waitForTimeout(2_000);
      const address = new URL(page.url());
      expect(/^\/setup\/?$/.test(address.pathname) && address.search === '?again=1', `start key: "Run setup again" ended at ${address.pathname}${address.search}`);
      const kept = await page.evaluate(() => ({
        complete: JSON.parse(localStorage.getItem('safeos-onboarding') || '{}').state?.isComplete ?? null,
        flag: localStorage.getItem('guardian-onboarding-complete'),
      }));
      expect(kept.complete === true && kept.flag === 'true', `start key: opening "Run setup again" changed the saved setup (${JSON.stringify(kept)})`);
      // Nothing was reset: the home page still says setup is done, and setup
      // with no parameter goes on to the dashboard.
      await visit(page);
      await page.getByText('Setup is done on this device.', { exact: true }).waitFor({ timeout: 10_000 });
      await page.goto(new URL('/setup/', baseUrl).toString(), { waitUntil: 'load' });
      await page.waitForURL((url) => /^\/dashboard\/?$/.test(url.pathname), { timeout: 15_000 })
        .catch(() => fail('start key: setup with no parameter does not go on to the dashboard after setup is done'));
    }, { setupDone: true });
  }

  // ---------------------------------------------------------------------------
  // Look switch
  // ---------------------------------------------------------------------------

  // Presses the look switch and reads every frame from the press on: in the
  // first frame the page shows the new look, each solid key shown already has
  // the new look's fill and label.
  const pressLookSwitch = async (page, look, width) => {
    const other = look === 'light' ? 'dark' : 'light';
    await page.evaluate((want) => {
      window.__lookFrames = null;
      const keys = () => [...document.querySelectorAll('.key--solid')].filter((key) => key.getClientRects().length > 0);
      const read = () => {
        if (getComputedStyle(document.body).backgroundColor === want) {
          window.__lookFrames = keys().map((key) => ({
            name: key.textContent.trim(),
            fill: getComputedStyle(key).backgroundColor,
            label: getComputedStyle(key).color,
          }));
          return;
        }
        requestAnimationFrame(read);
      };
      requestAnimationFrame(read);
    }, PAGE_COLOURS[other]);
    await page.getByRole('button', { name: `Switch to the ${other} look`, exact: true }).click();
    await page.getByRole('button', { name: `Switch to the ${look} look`, exact: true }).waitFor({ timeout: 5_000 });
    await page.waitForFunction(() => window.__lookFrames !== null, null, { timeout: 5_000 })
      .catch(() => fail(`look switch, ${width}: the page never showed the new look in a frame`));
    const firstFrame = (await page.evaluate(() => window.__lookFrames)) || [];
    expect(firstFrame.length > 0, `look switch, ${width}: no solid key is shown`);
    for (const solid of firstFrame) {
      expect(solid.fill === SOLID_KEY[other].fill && solid.label === SOLID_KEY[other].label,
        `look switch, ${width}: in the first frame of the ${other} look, "${solid.name}" is ${solid.label} on ${solid.fill}, not ${SOLID_KEY[other].label} on ${SOLID_KEY[other].fill}`);
    }
  };

  for (const look of LOOKS) {
    const other = look === 'light' ? 'dark' : 'light';
    await open({ name: 'look switch, look switch', width: 390, look, reducedMotion: 'reduce' }, async (page) => {
      await visit(page);
      await page.waitForFunction(() => document.querySelector('.home-run__poster img')?.complete);
      const state = () => page.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        scheme: document.documentElement.style.colorScheme,
        theme: [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => meta.getAttribute('content')).join(','),
        said: document.querySelector('.site-header [role="status"]')?.textContent.trim(),
        poster: document.querySelector('.home-run__poster img')?.currentSrc,
      }));
      const before = await state();
      expect(before.background === PAGE_COLOURS[look], `look switch: with the device set to ${look} the page is ${before.background}`);
      await pressLookSwitch(page, look, 390);
      const after = await state();
      expect(after.background === PAGE_COLOURS[other], `look switch: after a press the page is ${after.background}, not ${PAGE_COLOURS[other]}`);
      expect(after.said === `${other === 'dark' ? 'Dark' : 'Light'} look on`, `look switch: the press announced "${after.said}"`);
      // Every theme-color tag the page carries reads the chosen look's colour.
      expect(after.scheme === other && !!after.theme && after.theme.split(',').every((colour) => colour === THEME_COLOURS[other]),
        `look switch: after a press color-scheme is ${after.scheme} and theme-color ${after.theme}`);
      await page.waitForFunction((look) => document.querySelector('.home-run__poster img')?.currentSrc.endsWith('-' + look + '.webp'), other);
      await page.screenshot({ path: path.join(outDir, `home-after-look-switch-390-${look}.png`) });
      // The choice is kept: a reload and another page are in the chosen look.
      await page.reload({ waitUntil: 'networkidle' });
      expect((await state()).background === PAGE_COLOURS[other], 'look switch: the chosen look is lost on reload');
      await visit(page, new URL('/faq/', baseUrl).toString());
      expect(await page.evaluate((want) => document.documentElement.classList.contains(want), other), 'look switch: the FAQ page is not in the chosen look');
      // Space and Enter press the key.
      await visit(page);
      await page.getByRole('button', { name: `Switch to the ${look} look`, exact: true }).focus();
      await page.keyboard.press('Space');
      await page.getByRole('button', { name: `Switch to the ${other} look`, exact: true }).waitFor({ timeout: 5_000 });
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: `Switch to the ${look} look`, exact: true }).waitFor({ timeout: 5_000 });
    });

    // At 1280 pixels the header's start key is shown beside the first
    // screen's: both turn in the frame the page turns.
    await open({ name: 'look switch, 1280', width: 1280, look }, async (page) => {
      await visit(page);
      await pressLookSwitch(page, look, 1280);
      await page.screenshot({ path: path.join(outDir, `home-after-look-switch-1280-${look}.png`) });
    });

    // A browser that refuses storage: the look changes for the visit and no error shows.
    await open({ name: 'look switch, storage refused', width: 390, look }, async (page) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await visit(page);
      await page.getByRole('button', { name: `Switch to the ${other} look`, exact: true }).click();
      await page.waitForFunction((want) => getComputedStyle(document.body).backgroundColor === want, PAGE_COLOURS[other], { timeout: 5_000 })
        .catch(() => fail('look switch, storage refused: the look does not change'));
      expect(errors.length === 0, `look switch, storage refused: the page reported ${errors.join('; ')}`);
      expect(await page.locator('h1').isVisible(), 'first visit, storage refused: the page does not read');
    }, { script: () => {
      // This browser will not store the look choice.
      const store = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === 'guardian-theme') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        return store.call(this, key, value);
      };
    } });
  }

  // ---------------------------------------------------------------------------
  // Headline, setup and first-screen player.
  // ---------------------------------------------------------------------------

  const firstScreenBounds = [];
  const H1_LINES = { 320: [4, 4], 390: [3, 3], 768: [2, 2], 820: [2, 2], 1024: [3, 4], 1280: [3, 3], 1440: [3, 3], 1920: [3, 3] };
  for (const width of Object.keys(H1_LINES).map(Number)) {
    for (const look of LOOKS) {
      const height = width === 1440 || width === 1920 ? 900 : width >= 768 ? 800 : 844;
      await open({ name: 'first screen', width, height, look, reducedMotion: 'reduce' }, async (page) => {
        await visit(page);
        const expectedPoster = '/' + firstRun.variants[width < 1280 ? 'square' : 'wide'][look].poster.webp.path;
        await page.waitForFunction((url) => {
          const image = document.querySelector('.home-run__poster img');
          return image?.currentSrc.endsWith(url) && image.complete && image.naturalWidth > 0;
        }, expectedPoster);
        const seen = await page.evaluate(() => {
          const h1 = document.querySelector('h1');
          const style = getComputedStyle(h1);
          const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
          const image = document.querySelector('.home-run__poster img');
          const frame = box('.home-run__frame');
          const caption = document.querySelector('[data-run-caption]');
          const captionHeight = caption.getBoundingClientRect().height;
          const captionStyle = getComputedStyle(caption);
          const order = ['h1', '.home-first a.key--start', '.home-statement', '.home-run__frame'];
          const key = document.querySelector('.home-first a.key--start');
          const keyStyle = getComputedStyle(key);
          return {
            h1s: document.querySelectorAll('h1').length,
            headline: h1.textContent.trim(),
            lines: Math.round(h1.getBoundingClientRect().height / parseFloat(style.lineHeight)),
            ink: style.color,
            face: style.fontFamily,
            lockup: box('.home-lockup').height > 0,
            mark: box('.home-lockup .site-mark').width,
            lockupName: document.querySelector('.home-lockup').getAttribute('aria-label'),
            statement: document.querySelector('.home-statement').textContent.trim(),
            caption: caption.textContent.trim(),
            captionLines: Math.round(captionHeight / parseFloat(captionStyle.lineHeight)),
            captionBottom: caption.getBoundingClientRect().bottom,
            controlsBottom: box('.home-run__controls').bottom,
            order: order.map((selector) => Math.round(box(selector).top)),
            bottoms: order.map((selector) => Math.round(box(selector).bottom)),
            lefts: { text: box('.home-first__text').left, textRight: box('.home-first__text').right, capture: frame.left, captureRight: frame.right, wrap: box('.home-first__grid').left, wrapRight: box('.home-first__grid').right },
            tops: { text: box('.home-first__text').top, capture: frame.top },
            keys: document.querySelectorAll('.home-first__start a, .home-first__start button').length,
            steps: Array.from(document.querySelectorAll('.home-runs button[data-run]'), (key) => key.textContent.trim()),
            playerFollowsSetup: Boolean(document.querySelector('.home-first__start').compareDocumentPosition(document.querySelector('.home-runs')) & Node.DOCUMENT_POSITION_FOLLOWING),
            key: { width: key.getBoundingClientRect().width, height: key.getBoundingClientRect().height, column: box('.home-first__start').width, colour: keyStyle.color, fill: keyStyle.backgroundColor, href: key.getAttribute('href') },
            statementSize: parseFloat(getComputedStyle(document.querySelector('.home-statement')).fontSize),
            statementInk: getComputedStyle(document.querySelector('.home-statement')).color,
            poster: image?.getAttribute('alt'),
            ratio: frame.width / frame.height,
            width: frame.width,
            height: frame.height,
            ticks: document.querySelectorAll('.home-run__frame .corner-ticks i').length,
            groups: ['nav .look-switch', 'nav .site-header__menu-key', '.home-first__start a.key', '.home-run__controls']
              .filter((selector) => box(selector)?.width > 0).length,
            screen: window.innerHeight,
          };
        });
        const at = `at ${width} px, ${look}`;
        const firstScreen = { viewportWidth: width, look, ...seen, alternateCaptions: [] };
        firstScreenBounds.push(firstScreen);
        expect(seen.h1s === 1 && seen.headline === HEADLINE, `headline ${at}: ${seen.h1s} H1 reading "${seen.headline}"`);
        expect(seen.lockupName === 'SafeOS Guardian' && seen.lockup === (width >= 768), `headline ${at}: incorrect lockup visibility or name`);
        if (width >= 768) expect(seen.mark === 64, `headline ${at}: the shield is ${seen.mark} px wide`);
        const [least, most] = H1_LINES[width];
        expect(seen.lines >= least && seen.lines <= most, `headline ${at}: the headline has ${seen.lines} lines, not ${least === most ? most : `at most ${most}`}`);
        expect(seen.ink === INK[look], `headline ${at}: the headline is ${seen.ink}`);
        expect(/Space_Grotesk|Space Grotesk/i.test(seen.face), `headline ${at}: the headline's face is ${seen.face}`);
        expect(plain(seen.statement) === STATEMENT, `start key ${at}: the statement reads "${seen.statement}"`);
        expect(seen.statementSize >= 18 && seen.statementInk === INK[look], `start key ${at}: the statement is ${seen.statementSize} px in ${seen.statementInk}`);
        expect(seen.keys === 1, `start key ${at}: the first screen holds ${seen.keys} keys`);
        expect(/^\/setup\/?$/.test(seen.key.href || ''), `start key ${at}: the start key opens ${seen.key.href}`);
        expect(Math.abs(seen.key.height - 56) < 0.5, `start key ${at}: the start key is ${seen.key.height} px tall`);
        if (width < 768) expect(Math.abs(seen.key.width - seen.key.column) < 0.5, `start key ${at}: the start key is ${seen.key.width} px wide in a ${seen.key.column} px column`);
        else expect(seen.key.width < seen.key.column - 40, `start key ${at}: the start key is as wide as its column`);
        expect(seen.caption === firstRun.description && seen.poster === firstRun.description, firstRun.key + ' needs its caption and poster description ' + at);
        expect(seen.steps.join(',') === runRecord.runs.map(({ key }) => key).join(','), 'Run order ' + at + ': ' + seen.steps);
        expect(seen.playerFollowsSetup, 'The player must follow setup in the page ' + at);
        expect(seen.ticks === 4, 'Recording corner ticks ' + at + ': ' + seen.ticks);
        expect(Math.abs(seen.ratio - (width < 1280 ? 1 : 1.6)) < 0.005,
          'Recording aspect ratio ' + at + ': ' + seen.ratio);
        if (width < 1024) {
          for (let i = 0; i + 1 < seen.order.length; i += 1) {
            expect(seen.bottoms[i] <= seen.order[i + 1], 'First-screen blocks overlap ' + at + ' at ' + seen.bottoms[i] + ' and ' + seen.order[i + 1]);
          }
        } else {
          expect(seen.lefts.capture > seen.lefts.textRight, 'The recording must be beside the copy ' + at);
          expect(Math.abs(seen.tops.capture - seen.tops.text) < 1, 'The recording and lockup must start level ' + at);
        }
        if ([320, 390, 768, 1440, 1920].includes(width)) {
          const wanted = { 320: 288, 390: 358, 768: 480, 1440: 730, 1920: 820 }[width];
          expect(Math.abs(seen.width - wanted) < 1, 'Recording width ' + at + ': ' + seen.width + ' px, expected ' + wanted);
        }
        if (width === 390) {
          expect(seen.groups === 4 && seen.key.width === 358, 'First-screen controls ' + at + ': ' + seen.groups + ' groups, setup ' + seen.key.width + ' px');
          expect(seen.controlsBottom <= 788 && seen.captionBottom <= 836 && seen.captionLines <= 2,
            'First-screen bounds ' + at + ': controls end at ' + seen.controlsBottom + ', description ends at ' + seen.captionBottom + ' over ' + seen.captionLines + ' lines');
        }
        if (width >= 1280) expect(seen.captionLines === 1, 'Desktop caption lines ' + at + ': ' + seen.captionLines);
        if (width === 320) {
          expect(seen.captionLines <= 2 && seen.captionBottom <= seen.screen,
            'First-screen caption ' + at + ': ends at ' + seen.captionBottom + ' over ' + seen.captionLines + ' lines');
          expect((await sidewaysScroll(page)) <= 0, 'The first screen scrolls sideways ' + at);
        }
        if (width === 320 || width === 390 || width >= 1280) {
          for (const run of runRecord.runs.slice(1)) {
            await page.locator('button[data-run="' + run.id + '"]').click();
            const caption = await page.locator('[data-run-caption]').evaluate((element) => {
              const box = element.getBoundingClientRect();
              return { lines: Math.round(box.height / parseFloat(getComputedStyle(element).lineHeight)), bottom: box.bottom + scrollY };
            });
            firstScreen.alternateCaptions.push({ id: run.id, ...caption });
            const maxLines = width >= 1280 ? 1 : 2;
            expect(caption.lines <= maxLines && (width >= 1280 || caption.bottom <= (width === 390 ? 836 : height)),
              run.key + ' caption ' + at + ': ends at ' + caption.bottom + ' over ' + caption.lines + ' lines');
          }
        }
      });
    }
  }

  await writeFile(path.join(outDir, 'home-first-bounds.json'), JSON.stringify(firstScreenBounds, null, 2));

  // The start key opens setup; the words that left the page are gone.
  await open({ name: 'words', width: 1280, height: 800 }, async (page) => {
    await visit(page);
    const [words, ...names] = (await page.locator('.visitor-shell').evaluate(homeWordingInputs)).map(plain);
    const count = (needle) => words.split(needle).length - 1;
    expect(count('It does not replace a person nearby.') === 1, `start key: "It does not replace a person nearby." appears ${count('It does not replace a person nearby.')} times`);
    expect(count('SafeOS is not a medical device: it does not monitor breathing and cannot prevent SIDS.') === 1, 'uses: the not-a-medical-device sentence does not appear exactly once');
    for (const gone of ['Experimental Supplemental Monitoring Tool', 'tech-savvy', 'supplementary', 'NOT a replacement', 'babysitter', 'carer',
      'security system', 'Takes less than 2 minutes', 'cosine', 'Sobel', 'Blurred', 'always be free', 'never charge', 'Future optional service',
      'nonprofit', 'charity', 'tax-exempt', 'tax-deductible', 'FREE', 'Quick Start', 'All systems operational', 'All rights reserved',
      'Your camera\'s pictures stay in your browser', 'never leaves', '100% local', 'No telemetry', 'Who can see my camera?', 'What does it cost?', 'vital', 'falls']) {
      expect(!words.toLowerCase().includes(gone.toLowerCase()) || (gone === 'FREE' && !words.includes('FREE')), `the page says "${gone}"`);
    }
    expect(!/\bAI\b/.test(words), 'alerts: the page says "AI"');
    for (const health of ['medical', 'breathing', 'SIDS']) expect(count(health) === 1, `uses: "${health}" appears ${count(health)} times`);
    expect(count('No account') === 1, 'free: expected one no-account line');
    for (const text of [words, ...names]) {
      const barred = text.match(barredWording)?.[0];
      expect(!barred, `home wording: barred word "${barred}"`);
    }
    await Promise.all([
      page.waitForURL((url) => /^\/setup\/?$/.test(url.pathname), { timeout: 15_000 }),
      page.locator('.home-first a.key--start').click(),
    ]);
    await page.getByRole('button', { name: /Begin Setup/i }).waitFor({ timeout: 15_000 });
  });

  // ---------------------------------------------------------------------------
  // The parts of the page and the closing block
  // ---------------------------------------------------------------------------

  const columnsOf = (page, selector) => page.evaluate((query) => {
    const rows = new Map();
    for (const item of document.querySelectorAll(query)) {
      const top = Math.round(item.getBoundingClientRect().top);
      rows.set(top, (rows.get(top) || 0) + 1);
    }
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map((row) => row[1]).join(',');
  }, selector);

  const layouts = {
    390: { uses: '1,1,1,1,1', cards: '1,1,1,1,1,1', footer: '2,2,2' },
    820: { uses: '2,2,1', cards: '2,2,2', footer: '3,3' },
    1280: { uses: '3,2', cards: '2,2,2', footer: '6' },
    1440: { uses: '3,2', cards: '3,3', footer: '6' },
  };
  for (const width of [390, 820, 1280, 1440]) {
    for (const look of LOOKS) {
      await open({ name: 'parts, layout', width, height: 900, look }, async (page) => {
        await visit(page);
        const at = `at ${width} px, ${look}`;
        for (const [selector, layout] of [
          ['.home-use', layouts[width].uses],
          ['.home-detection__card', layouts[width].cards],
          ['.site-footer__groups > div', layouts[width].footer],
        ]) {
          const rows = await columnsOf(page, selector);
          expect(rows === layout, `${selector} ${at}: rows of ${rows}, expected ${layout}`);
        }
        const seen = await page.evaluate(() => {
          const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
          const fill = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor;
          const deviceWrap = document.querySelector('#one-device .home-wrap');
          const deviceWrapStyle = getComputedStyle(deviceWrap);
          return {
            deviceWidth: deviceWrap.clientWidth - parseFloat(deviceWrapStyle.paddingLeft) - parseFloat(deviceWrapStyle.paddingRight),
            qr: rect('.home-qr img'),
            qrBox: rect('.home-qr'),
            steps: rect('.home-steps'),
            centeredCode: (() => {
              const range = document.createRange();
              range.selectNodeContents(document.querySelector('.home-detection__code a'));
              const text = range.getBoundingClientRect();
              const cards = rect('.home-detection__cards');
              return Math.abs(text.left + text.width / 2 - cards.left - cards.width / 2) < 1;
            })(),
            panel: rect('.home-how'),
            panelFill: fill('.home-how'),
            panelBorder: parseFloat(getComputedStyle(document.querySelector('.home-how')).borderTopWidth),
            server: rect('.home-how__note'),
            serverRule: parseFloat(getComputedStyle(document.querySelector('.home-how__note')).borderTopWidth),
            panelFills: ['#free', '.home-closing', 'footer'].map((selector) => {
              return selector === '.home-closing' ? getComputedStyle(document.querySelector(selector).closest('section')).backgroundColor : fill(selector);
            }),
            benefits: [...document.querySelectorAll('.home-benefit')].map((item) => {
              const style = getComputedStyle(item);
              return { fill: style.backgroundColor, edge: style.borderTopWidth };
            }),
            controls: [...document.querySelectorAll('.home-use__key, .home-detection summary, .home-first .key--start, .home-closing .key--start')].map((key) => ({
              name: key.textContent.trim().slice(0, 45),
              minimum: key.matches('summary') ? 64 : key.matches('.key--start') ? 56 : 48,
              height: key.getBoundingClientRect().height,
            })),
          };
        });
        expect(Math.abs(seen.qr.width - 200) < 0.5, `device ${at}: the QR code is ${seen.qr.width} px wide`);
        expect(width < 768 ? seen.qrBox.top >= seen.steps.bottom : seen.qrBox.left >= seen.steps.right,
          `device ${at}: the QR placement is wrong`);
        expect(seen.centeredCode, `detection code ${at}: the link is not centred under the cards`);
        if (width === 390) {
          expect(Math.abs(seen.qr.left + seen.qr.width / 2 - width / 2) < 1, `device ${at}: the QR is off-centre`);
        }
        if (width >= 1280) {
          const columnGap = width >= 1440 ? 32 : 24;
          expect(Math.abs(seen.panel.width - (seen.deviceWidth * 2 - columnGap) / 3) < 1 &&
            Math.abs(seen.panel.left + seen.panel.width / 2 - width / 2) < 1,
          `device ${at}: expected eight centred columns, got ${seen.panel.width}px`);
          expect(seen.panelFill === PANEL_COLOURS[look] && seen.panelBorder > 0 && seen.serverRule > 0 &&
            seen.server.top >= Math.max(seen.qrBox.bottom, seen.steps.bottom) &&
            seen.server.left > seen.panel.left && seen.server.right < seen.panel.right && seen.server.bottom < seen.panel.bottom,
          `device ${at}: the steps, QR and server rule should share the panel`);
        }
        expect(seen.panelFills.every((fill) => fill === PANEL_COLOURS[look]), `bands ${at}: wrong surface colours`);
        expect(seen.benefits.length === 3 && seen.benefits.every(({ fill, edge }) => fill === PANEL_COLOURS[look] && edge === '0px'),
          `benefits ${at}: expected three unoutlined tinted panels`);
        for (const key of seen.controls) expect(key.height >= key.minimum - 0.5, `${at}: "${key.name}" is ${key.height} px tall, expected ${key.minimum}`);
        for (const selector of ['.home-use:has(#lost-pet) p', '.home-free__words p:first-child']) {
          const lines = await page.evaluate(readLines, selector);
          const leading = await page.locator(selector).evaluate((p) => parseFloat(getComputedStyle(p).fontSize) * 1.55);
          const gaps = lines.slice(1).map(({ top }, index) => top - lines[index].top);
          expect(gaps.length > 0 && gaps.every((gap) => Math.abs(gap - leading) <= 1),
            `paragraph leading ${at}, ${selector}: ${gaps.join(', ')} px, expected ${leading.toFixed(1)} px`);
        }
        if (width >= 1280) {
          const lines = await page.evaluate(readLines, '.home-detection__lead');
          expect(lines.length > 0 && lines.every(({ text }) => text.length <= 64),
            `detection lead ${at}: line lengths ${lines.map(({ text }) => text.length).join(', ')} exceed 64 characters`);
        }
        if (width === 390) {
          const checkLinks = async () => {
            const links = await page.locator('.visitor-shell a[href]:visible').evaluateAll((anchors) => anchors.map((anchor) => ({
              name: anchor.getAttribute('aria-label') || anchor.textContent.trim(),
              fragments: [...anchor.getClientRects()].map((rect) => rect.height),
            })));
            for (const { name, fragments } of links) {
              expect(fragments.length > 0 && fragments.every((height) => height >= 43.5),
                `phone link ${at}: "${name}" has targets of ${fragments.join(', ')} px, expected 44 px`);
            }
          };
          await page.locator('[data-card="storage"] > summary').press('Space');
          await checkLinks();
          await page.locator('.site-header__menu-key').click();
          await checkLinks();
        }
      });
    }
  }

  await open({ name: 'parts and links', width: 1280, height: 800 }, async (page) => {
    await visit(page);
    const seen = await page.evaluate(() => {
      const text = (element) => (element?.textContent || '').replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
      return {
        h2s: [...document.querySelectorAll('main h2')].map(text),
        benefits: [...document.querySelectorAll('.home-benefit h3')].map(text),
        model: text(document.querySelector('[data-card="people-animals"] .home-detection__tags')),
        useLinks: [...document.querySelectorAll('#uses .home-use__key')].map((link) => link.getAttribute('href')),
        noteLink: document.querySelector('.home-how__note a').href,
        codeLink: document.querySelector('.home-detection__code a').href,
        qr: document.querySelector('.home-qr img').alt,
        closing: [...document.querySelectorAll('.home-closing h2, .home-closing p, .home-closing a')].map(text),
        footer: [...document.querySelectorAll('.site-footer__groups > div')].map((group) => `${text(group.querySelector('h2'))}: ${[...group.querySelectorAll('a')].map((a) => `${text(a)} ${a.getAttribute('href')}${a.target ? ` ${a.target}` : ''}`).join(' | ')}`),
        brand: [...document.querySelectorAll('.site-footer__brand p')].map(text),
        last: text(document.querySelector('.site-footer__last')),
        structured: [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) => JSON.parse(script.textContent)),
      };
    });
    const same = (got, want, what) => expect(JSON.stringify(got) === JSON.stringify(want), `${what}: ${JSON.stringify(got)}`);
    same(seen.h2s, ['What SafeOS is', 'Deep learning, in your browser.', 'One device does the watching and the alerting', 'What people set it up for', 'Free on safeos.sh, with the code in the open', 'Start with the device you have'], 'home section order');
    same(seen.benefits, ['Lo-tech and portable', 'Supplemental alerts', 'Privacy first'], 'benefit headings');
    expect(/^COCO-SSD on TensorFlow\.js · \d+\.\d+ MB, after you agree$/.test(seen.model), `model card tags: ${seen.model}`);
    same(seen.useLinks, ['monitor', 'monitor', 'monitor', 'lost-found', 'wildlife'].map((way) => `/setup/?next=${way}`), 'home setup destinations');
    expect(seen.noteLink === 'https://github.com/framerslab/safeos/blob/master/docs/DEPLOYMENT.md#option-b-full-stack-deployment', `server guide: ${seen.noteLink}`);
    expect(seen.codeLink === 'https://github.com/framerslab/safeos/tree/master/apps/guardian-ui/src/lib', `detection code: ${seen.codeLink}`);
    expect(seen.qr === 'QR code for https://safeos.sh/', `device: QR alternative text is "${seen.qr}"`);
    same(seen.closing, ['Start with the device you have', 'Setup has 6 short steps and asks for the camera at step 4.', 'Start setup'], 'closing block');
    const slashless = (line) => line.replace(/(\/[a-z-]+)\/(?= |$)/g, '$1');
    same(seen.footer.map(slashless), [
      'Use it: Start setup /setup',
      'Uses: A baby\'s nap /#baby-nap | A pet while you are out /#pet-out | An elderly parent /#elderly-parent | A lost pet near home /#lost-pet | Backyard wildlife /#wildlife',
      'Learn: How it works /#how-it-works | Guides /tutorials | FAQ /faq | Help /help | Blog /blog',
      `About: About SafeOS /about | ${GITHUB_NAME} https://github.com/framerslab/safeos | Discord https://wilds.ai/discord | team@frame.dev mailto:team@frame.dev`,
      'Legal: Privacy /privacy | Terms /terms | MIT License https://github.com/framerslab/safeos/blob/master/LICENSE | Security policy https://github.com/framerslab/safeos/blob/master/SECURITY.md',
      'From Frame: Frame https://frame.dev | AgentOS https://agentos.sh | Paracosm https://paracosm.agentos.sh',
    ], 'footer: the groups are');
    same(seen.brand, ['SafeOS Guardian', 'Motion and sound alerts that run in your browser.'], 'footer: the brand block reads');
    expect(seen.last === `© ${new Date().getFullYear()} Frame. SafeOS code is MIT-licensed.${STARS ? ` ${STARS.sentence}` : ''}`, `footer: the last line reads "${seen.last}"`);
    // The structured data.
    const kinds = seen.structured.map((block) => block['@type']).sort().join(', ');
    expect(kinds === 'Organization, WebApplication', `search and card: the structured data blocks are ${kinds}`);
    const application = seen.structured.find((block) => block['@type'] === 'WebApplication') || {};
    expect(application.description === DESCRIPTION && application.applicationCategory === 'UtilitiesApplication' && application.offers?.price === '0'
      && /^\d+\.\d+\.\d+/.test(application.softwareVersion || '') && !application.aggregateRating && !application.review,
    `search and card: the WebApplication block is ${JSON.stringify(application).slice(0, 300)}`);

    const summaries = page.locator('#how-it-works details > summary');
    await summaries.first().press('Space');
    expect(await page.locator('[data-card="motion"]').evaluate((details) => details.open), 'disclosures: Space did not open Motion and stillness');
    await summaries.nth(3).press('Enter');
    expect(await page.locator('[data-card="lost-found"]').evaluate((details) => details.open), 'disclosures: Enter did not open Lost and Found');
    expect(await page.locator('#how-it-works details[open]').count() === 1, 'disclosures: only one should stay open');
  });

  await open({ name: 'returning use links', width: 390 }, async (page) => {
    await visit(page);
    const keys = await page.locator('#uses .home-use__key').evaluateAll((links) => links.map((link) => [link.textContent.trim(), link.pathname]));
    const want = ['Motion and sound', 'Motion and sound', 'Motion and sound', 'Lost and Found', 'Wildlife']
      .map((name, i) => [`Open ${name}`, `/${['monitor', 'monitor', 'monitor', 'lost-found', 'wildlife'][i]}/`]);
    expect(JSON.stringify(keys) === JSON.stringify(want), `returning use destinations: ${JSON.stringify(keys)}`);
  }, { setupDone: true });

  // The header's and the footer's anchors land below the bar, not under it.
  for (const [from, link, hash, target] of [
    ['/', 'Uses', '#uses', '#uses-title'],
    ['/', 'How it works', '#how-it-works', '#detection-title'],
    ...[
      ['A baby’s nap', 'baby-nap'],
      ['A pet while you are out', 'pet-out'],
      ['An elderly parent', 'elderly-parent'],
      ['A lost pet near home', 'lost-pet'],
      ['Backyard wildlife', 'wildlife'],
    ].map(([link, id]) => ['/faq/', link, `#${id}`, `#${id}`]),
  ]) {
    await open({ name: 'anchors', width: 1280, height: 800, look: 'dark', reducedMotion: 'reduce' }, async (page) => {
      await visit(page, new URL(from, baseUrl).toString());
      const scope = from === '/' ? page.locator('nav[aria-label="Site"] .site-header__links') : page.locator('footer');
      await scope.getByRole('link', { name: link, exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/' && url.hash === hash, { timeout: 15_000 });
      await page.locator(target).waitFor({ timeout: 15_000 });
      await page.waitForTimeout(800);
      const seen = await page.evaluate((selector) => ({
        top: document.querySelector(selector).getBoundingClientRect().top,
        bar: document.querySelector('nav[aria-label="Site"]').getBoundingClientRect().bottom,
        screen: window.innerHeight,
      }), target);
      expect(seen.top >= seen.bar && seen.top < seen.screen, `the "${link}" link from ${from}: its heading sits at ${Math.round(seen.top)} px with the bar ending at ${Math.round(seen.bar)}`);
    });
  }

  // ---------------------------------------------------------------------------
  // Search result and shared link
  // ---------------------------------------------------------------------------

  await open({ name: 'search and card', width: 1280, height: 800 }, async (page) => {
    await visit(page);
    const tags = await page.evaluate(() => {
      const meta = (selector) => document.querySelector(selector)?.getAttribute('content') ?? null;
      return {
        title: document.title,
        description: meta('meta[name="description"]'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
        keywords: meta('meta[name="keywords"]'),
        ogImage: meta('meta[property="og:image"]'),
        ogAlt: meta('meta[property="og:image:alt"]'),
        ogType: meta('meta[property="og:image:type"]'),
        xImage: meta('meta[name="twitter:image"]'),
        ogTitle: meta('meta[property="og:title"]'),
        lang: document.documentElement.lang,
      };
    });
    expect(tags.title === `${HEADLINE} | SafeOS Guardian`, `search and card: the title is "${tags.title}"`);
    expect(tags.description === DESCRIPTION && tags.description.length === 146, `search and card: the description is "${tags.description}"`);
    expect(/^https?:\/\/[^/]+\/$/.test(tags.canonical || ''), `search and card: the canonical address is ${tags.canonical}`);
    expect(tags.keywords === null, 'search and card: a keywords tag is present');
    expect(tags.lang === 'en', `search and card: the page's language is ${tags.lang}`);
    expect(!!tags.ogImage && new URL(tags.ogImage).pathname === '/home/card.jpg' && tags.xImage === tags.ogImage && tags.ogType === 'image/jpeg',
      `search and card: the card pictures are ${tags.ogImage} (${tags.ogType}) and ${tags.xImage}`);
    expect(tags.ogAlt === 'SafeOS Guardian watching a recorded clip of a kitten, beside the words Free motion and sound alerts from an old phone or laptop.', `search and card: the card's text equivalent is "${tags.ogAlt}"`);
    for (const file of ['/home/card.jpg', '/screenshots/dashboard.png', '/screenshots/monitoring.png']) {
      const response = await page.request.get(new URL(file, baseUrl).toString());
      expect(response.ok(), `${file.includes('card') ? 'card' : 'install screenshot'}: ${file} answers ${response.status()}`);
      if (file.includes('card') && response.ok()) expect((await response.body()).length < 300_000, 'search and card: the card is not under 300 KB');
    }
    for (const other of ['/about/', '/faq/']) {
      await visit(page, new URL(other, baseUrl).toString());
      const card = await page.evaluate(() => document.querySelector('meta[property="og:image"]')?.getAttribute('content'));
      expect(!!card && new URL(card).pathname === '/home/card.jpg', `search and card: ${other} shows the card ${card}`);
    }
    const manifest = await (await page.request.get(new URL('/manifest.json', baseUrl).toString())).json();
    expect(manifest.description === 'Motion and sound alerts that run in your browser. By Frame.' && manifest.background_color === '#0b131b' && manifest.theme_color === '#0b131b'
      && manifest.categories.join(',') === 'utilities,lifestyle', `search and card: the manifest reads ${JSON.stringify({ d: manifest.description, b: manifest.background_color, t: manifest.theme_color, c: manifest.categories })}`);
    const sitemap = await (await page.request.get(new URL('/sitemap.xml', baseUrl).toString())).text();
    const entry = sitemap.match(/<url>\s*<loc>[^<]*\/<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/);
    expect(!!entry && /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(entry[1]), `search and card: the sitemap gives the home page ${entry ? entry[1] : 'no day'}`);
    expect(!/\/donate\b/.test(sitemap), 'search and card: the sitemap lists the forwarding page');
  });

  // The page after one visit online, with the connection gone.
  await open({ name: 'offline', width: 390, look: 'dark' }, async (page, context) => {
    await visit(page);
    await page.evaluate(() => Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('the installed copy was not ready within 60 seconds')), 60_000)),
    ]));
    await page.waitForFunction(async (url) => Boolean(await caches.match(url)), '/' + firstRun.variants.square.dark.poster.webp.path);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('.home-run__poster img')?.naturalWidth > 0);
    const seen = await page.evaluate(() => {
      const image = document.querySelector('.home-run__poster img');
      return { h1: document.querySelector('h1')?.textContent.trim(), capture: !!image && image.complete && image.naturalWidth > 0, steps: document.querySelectorAll('ol.home-steps > li').length };
    });
    expect(seen.h1 === HEADLINE && seen.steps === 3, 'offline: the page does not show from the installed copy');
    expect(seen.capture, 'Offline: the first poster does not show from the installed copy');
    await page.locator('.home-detection__card > summary').nth(3).click();
    expect(await page.locator('.home-detection__card').nth(3).evaluate((details) => details.open), 'disclosures, offline: a card does not open');
    await page.getByRole('button', { name: /^Switch to the/ }).click();
    expect((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === PAGE_COLOURS.light, 'look switch, offline: the look does not change');
    await Promise.all([
      page.waitForURL((url) => /^\/setup\/?$/.test(url.pathname), { timeout: 15_000 }),
      page.locator('.home-first a.key--start').click(),
    ]);
    await page.getByRole('button', { name: /Begin Setup/i }).waitFor({ timeout: 15_000 });
  });

  // The row's links, GitHub with its count, the keys and the makers' marks.
  for (const p of await checkPublicChrome(browser, baseUrl, outDir)) fail(p);

  for (const p of problems) console.error(`failed home page check: ${p}`);
  console.log(`checked the home page: ${problems.length} findings`);
  return problems.length;
}
