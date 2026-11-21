// Checks the home page on the built static site in a real browser.
//
// scripts/capture-pictures.mjs runs it for the pull request's own build when
// the home page is among the routes. Each block walks one part of the page as
// a visitor would: the page before any script runs, the header, the look
// switch, the headline, the start key, the capture, the five uses, how it
// works, what sets off an alert, the free part, the questions, the footer and
// what a search result or a shared link shows. It also saves the page from
// top to bottom at 820 and 1920 pixels in both looks. Every finding is
// printed, and the count of findings is returned; any finding fails the run.
import path from 'node:path';
import { checkPublicChrome, starsHanded } from './public-chrome-checks.mjs';

const LOOKS = ['light', 'dark'];
const HEADLINE = 'Free motion and sound alerts from an old phone or laptop';
const LEAD = 'SafeOS Guardian runs in your browser. The device watching the room sounds the alert when something moves or gets loud.';
const STATEMENT = 'SafeOS adds an alert. It does not replace a person nearby. A phone or a browser can sleep, lose power or drop the camera, so stay within reach.';
const NEEDS_SCRIPT = 'Setup needs JavaScript. The rest of this page reads without it.';
const CAPTION = 'SafeOS watching a recorded clip of a kitten. Captured from the app while it ran.';
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
// The longest walk takes about fifteen seconds on the CI runner.
const WALK_LIMIT_MS = 180_000;

// Straight and curly apostrophes are one character to a reader; so are a
// space and a non-breaking space.
const plain = (text) => (text || '').replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// A person who has finished setup on this device. Seeded on the first page of
// the visit only: later pages read what the earlier ones left, so a page that
// cleared the saved setup is seen.
const SETUP_DONE = () => {
  if (sessionStorage.getItem('home-checks-seeded')) return;
  sessionStorage.setItem('home-checks-seeded', '1');
  localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
    isComplete: true, selectedScenario: 'pet',
    acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
  }, version: 0 }));
  localStorage.setItem('guardian-onboarding-complete', 'true');
};

// Reads what the readability rule measures: every visible piece of text with
// its size, face and contrast against the colour behind it, and every element
// that scrolls sideways.
function measureText(root) {
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
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (box.width === 0 || box.height === 0 || style.visibility === 'hidden') continue;
    seen.add(element);
    const background = backgroundOf(element);
    const text = over(parse(style.color), background);
    const a = luminance(text);
    const b = luminance(background);
    out.push({
      words: words.slice(0, 40),
      tag: element.tagName.toLowerCase(),
      body: !!element.closest('main') && !!element.closest('h1, h2, h3, p, summary') && !element.closest('a, figcaption'),
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
function readStrokes(base64) {
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

export async function checkHomePage(browser, baseUrl, outDir) {
  const problems = [];
  const home = new URL('/', baseUrl).toString();
  const origin = new URL(baseUrl).origin;
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
          lead: visible(document.querySelector('.home-lead')),
          start: document.querySelector('.home-first a.key--start')?.getAttribute('href'),
          startWords: document.querySelector('.home-first a.key--start')?.textContent.trim(),
          statement: visible(statement),
          line: visible(line) && line.textContent.trim() === NEEDS,
          lineUnderStatement: !!line && !!statement && line.getBoundingClientRect().top >= statement.getBoundingClientRect().bottom,
          sections: [...document.querySelectorAll('main h2')].filter(visible).length,
          footer: visible(document.querySelector('footer nav[aria-label="Site links"]')),
          menu: document.querySelector('nav[aria-label="Site"] .site-header__menu-key')?.getAttribute('href'),
          menuTag: document.querySelector('nav[aria-label="Site"] .site-header__menu-key')?.tagName,
          switchShown: !!document.querySelector('.look-switch'),
          footerStart: document.querySelector('footer nav a')?.textContent.trim(),
          background: getComputedStyle(document.body).backgroundColor,
          opacity,
        };
      }, NEEDS_SCRIPT);
      expect(seen.h1 && seen.lead && seen.statement, `first visit, scripts off, ${look}: the headline, the lead or the statement is not shown`);
      expect(/^\/setup\/?$/.test(seen.start || '') && seen.startWords === 'Start setup', `first visit, scripts off, ${look}: the start key is "${seen.startWords}" to ${seen.start}`);
      expect(seen.line && seen.lineUnderStatement, `first visit, scripts off, ${look}: "${NEEDS_SCRIPT}" does not show under the statement`);
      expect(seen.sections === 6, `first visit, scripts off, ${look}: ${seen.sections} part headings show, not 6`);
      expect(seen.footer, `first visit, scripts off, ${look}: the footer's links do not show`);
      expect(seen.menuTag === 'A' && seen.menu === '#site-links', `header, scripts off, ${look}: Menu is a ${seen.menuTag} to ${seen.menu}, not a link to the footer's links`);
      expect(!seen.switchShown, `look switch, scripts off, ${look}: a look switch is shown`);
      expect(seen.footerStart === 'Start setup', `footer, scripts off, ${look}: the footer's start link reads "${seen.footerStart}"`);
      expect(seen.background === PAGE_COLOURS[look], `first visit, scripts off, ${look}: the page is ${seen.background}, not ${PAGE_COLOURS[look]}`);
      expect(seen.opacity === 1, `first visit, scripts off, ${look}: the headline's opacity is ${seen.opacity}`);
      // A question opens with scripts off.
      const question = page.locator('details.home-q').nth(1);
      await question.locator('summary').click();
      expect(await question.evaluate((element) => element.open), `questions, scripts off, ${look}: a pressed question does not open`);
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

  // Nothing blocked: the line hides once the app has started; every request
  // stays on the site; no cookie; no card or sheet appears, however long the
  // visitor stays, before setup or after it.
  for (const setupDone of [false, true]) {
    await open({ name: 'first visit, requests', width: setupDone ? 390 : 1280, height: setupDone ? 844 : 800 }, async (page) => {
      const hosts = new Set();
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:') hosts.add(url.origin);
      });
      await visit(page);
      await page.waitForTimeout(8_000);
      const elsewhere = [...hosts].filter((host) => host !== origin);
      expect(elsewhere.length === 0, `first visit: the page asked ${elsewhere.join(', ')}`);
      expect((await page.evaluate(() => document.cookie)) === '', 'first visit: the page set a cookie');
      expect(await page.locator('#home-needs-script').isHidden(), `first visit: "${NEEDS_SCRIPT}" still shows after the app started`);
      for (const words of ['Enable notifications', 'Install SafeOS', 'Install App']) {
        expect((await page.getByText(words).count()) === 0, `first visit: "${words}" shows on the home page${setupDone ? ' after setup' : ''}`);
      }
    }, { setupDone });
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
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => {
        const element = document.activeElement;
        return element.getAttribute('aria-label') || element.textContent.trim();
      }));
    }
    const wanted = ['Skip to content', 'SafeOS Guardian, home', 'How it works', 'Uses', 'Guides', 'FAQ', 'Privacy', GITHUB_NAME, 'Switch to the light look', 'Start setup'];
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
          await page.screenshot({ path: path.join(outDir, `home-${width}-${look}.png`), fullPage: true });
        }
        if (![390, 820, 1280, 1920].includes(width)) return;
        // Open every question so its answer is measured too.
        await page.evaluate(() => document.querySelectorAll('details').forEach((details) => { details.open = true; }));
        const texts = await page.evaluate(measureText, await page.evaluateHandle(() => document.querySelector('.visitor-shell')));
        const bodySize = width >= 1440 ? 20 : 18;
        for (const text of texts) {
          const where = `at ${width} px, ${look}: "${text.words}"`;
          if (text.size < 16) fail(`readability ${where} is ${text.size} px, under 16`);
          if (/mono/i.test(text.face.split(',')[0])) fail(`readability ${where} is set in ${text.face.split(',')[0]}`);
          if (!['400', '700'].includes(text.weight)) fail(`readability ${where} has weight ${text.weight}`);
          if (text.body && text.tag === 'p' && text.size < bodySize) fail(`readability ${where} is body text at ${text.size} px, under ${bodySize}`);
          if (text.contrast < (text.body ? 12 : 7)) fail(`readability ${where} has contrast ${text.contrast.toFixed(2)}, under ${text.body ? 12 : 7}`);
        }
        expect(texts.length > 60, `readability at ${width} px, ${look}: only ${texts.length} pieces of text were measured`);
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

  // The words measured from their own pixels, as the readability rule
  // measures them: body text and headings at 12:1 or more on their strokes,
  // every other word in the quiet tone at 7:1 or more. A computed colour can
  // pass while a thin face's strokes read under it.
  for (const width of [390, 820, 1280, 1920]) {
    for (const look of LOOKS) {
      await open({ name: 'readable, measured from the pixels', width, height: width >= 1440 ? 900 : width >= 768 ? 800 : 844, look }, async (page, context) => {
        await visit(page);
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => document.querySelectorAll('details').forEach((details) => { details.open = true; }));
        const marked = await page.evaluate(() => {
          const shell = document.querySelector('.visitor-shell');
          const probe = document.createElement('span');
          probe.style.color = 'var(--color-steel-200)';
          shell.appendChild(probe);
          const quiet = getComputedStyle(probe).color;
          probe.remove();
          const blocks = new Set();
          const walker = document.createTreeWalker(shell, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent.trim()) continue;
            let element = walker.currentNode.parentElement;
            // Words inside a sentence (a name, a number) are measured with it.
            while (element && element !== shell && getComputedStyle(element).display === 'inline') element = element.parentElement;
            if (element && element !== shell) blocks.add(element);
          }
          const out = [];
          for (const element of blocks) {
            if (element.closest('script, style, [hidden], .sr-only, .skip-link, #site-menu')) continue;
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            if (box.width < 4 || box.height < 4 || style.visibility === 'hidden' || style.opacity === '0') continue;
            const body = !!element.closest('main') && !!element.closest('h1, h2, h3, p, summary') && !element.closest('a, figcaption');
            if (!body && style.color !== quiet) continue;
            element.setAttribute('data-measure', String(out.length));
            out.push({ words: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), body, header: !!element.closest('nav[aria-label="Site"]') });
          }
          return out;
        });
        const scratch = await context.newPage();
        let headerHidden = false;
        for (const [index, item] of [...marked.entries()].sort((a, b) => Number(b[1].header) - Number(a[1].header))) {
          if (!item.header && !headerHidden) {
            // The fixed bar would cover words scrolled under it, and links
            // inside a sentence are measured as links, not as its words.
            await page.evaluate(() => {
              const style = document.createElement('style');
              style.textContent = 'nav[aria-label="Site"] { visibility: hidden !important; } main p a { color: transparent !important; text-decoration-color: transparent !important; }';
              document.head.appendChild(style);
            });
            headerHidden = true;
          }
          const picture = await page.locator(`[data-measure="${index}"]`).screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
          const read = await scratch.evaluate(readStrokes, picture.toString('base64'));
          if (!read) continue;
          const least = item.body ? 12 : 7;
          if (read.strokes < least) fail(`readability at ${width} px, ${look}: "${item.words}" measures ${read.strokes.toFixed(2)}:1 on its strokes (core ${read.core.toFixed(2)}:1), under ${least}`);
        }
        await scratch.close();
        expect(marked.length > 30, `readability at ${width} px, ${look}: only ${marked.length} pieces of text were measured from the pixels`);
      });
    }
  }

  // Text at 200 per cent with the spacing overrides: nothing scrolls sideways
  // and the header keeps one row.
  for (const width of [320, 390, 820, 1280]) {
    await open({ name: 'first visit, larger text', width, height: 800 }, async (page) => {
      await visit(page);
      await page.addStyleTag({ content: 'html { font-size: 200% !important; } * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }' });
      await page.waitForTimeout(500);
      expect((await sidewaysScroll(page)) <= 0, `larger text at ${width} px: the page scrolls sideways`);
      const row = await page.evaluate(() => {
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
          wordmark: !!wordmark && wordmark.getBoundingClientRect().width > 0 && getComputedStyle(wordmark).visibility !== 'hidden',
        };
      });
      expect(row.rows === 1 && !row.over, `header, larger text at ${width} px: the header is not one row`);
      // The row keeps the mark, the wordmark, the look switch and Menu; only
      // the links move into the Menu. At 320 px a Menu key in 200 per cent
      // text leaves no room for the wordmark beside the look switch.
      if (width >= 390) expect(row.wordmark, `header, larger text at ${width} px: the wordmark left the row`);
      else console.log(`header, larger text at ${width} px: the wordmark is ${row.wordmark ? 'in' : 'out of'} the row`);
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

  // A visitor who chose the other look asks only for the capture in that look.
  for (const [device, chosen, choose] of [
    ['dark', 'light', () => localStorage.setItem('guardian-theme', JSON.stringify({ state: { themeMode: 'light', resolvedTheme: 'light', accessibility: {} }, version: 0 }))],
    ['light', 'dark', () => localStorage.setItem('guardian-theme', JSON.stringify({ state: { themeMode: 'dark', resolvedTheme: 'dark', accessibility: {} }, version: 0 }))],
  ]) {
    await open({ name: 'capture, chosen look', width: 390, look: device }, async (page, context) => {
      const asked = [];
      const installed = [];
      page.on('request', (request) => {
        const address = new URL(request.url()).pathname;
        if (address.startsWith('/home/capture-')) asked.push(address);
      });
      // The service worker's own requests: the installed copy it saves.
      context.on('request', (request) => {
        if (request.serviceWorker()) installed.push(new URL(request.url()).pathname);
      });
      await visit(page);
      expect(asked.length > 0 && asked.every((address) => address.includes(`-${chosen}.`)),
        `capture: on a ${device} device with the ${chosen} look chosen, the page asked for ${asked.join(', ') || 'no capture'}`);
      await page.evaluate(() => Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('the installed copy was not ready within 60 seconds')), 60_000)),
      ]));
      // The installed copy holds the WebP crops the page and the look switch
      // show; a phone does not download the PNG copies, the card or the
      // install screenshots with it.
      const heavy = installed.filter((address) => /^\/home\/capture-.*\.png$|^\/home\/card\.jpg$|^\/screenshots\//.test(address));
      expect(installed.some((address) => address.startsWith('/home/capture-') && address.endsWith('.webp')),
        `capture: the installed copy asked for no capture (${installed.length} service worker requests seen)`);
      expect(heavy.length === 0, `capture: the installed copy downloads ${heavy.join(', ')}`);
    }, { script: choose });
  }

  // The first screen's counts.
  for (const [width, height, controls] of [[390, 844, 4], [1280, 800, 10]]) {
    await open({ name: 'first visit, first screen', width, height, look: 'dark' }, async (page) => {
      await visit(page);
      const count = await page.evaluate(() => [...document.querySelectorAll('a, button, summary')].filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.top < window.innerHeight && box.bottom > 0 && getComputedStyle(element).visibility !== 'hidden'
          && !element.classList.contains('skip-link');
      }).length);
      expect(count === controls, `first visit: the first screen at ${width} by ${height} holds ${count} controls, not ${controls}`);
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
          const want = phone ? ['SafeOS Guardian, home', 'Switch to the dark look|Switch to the light look', 'Menu']
            : screen < 1024 ? ['SafeOS Guardian, home', 'How it works', 'Uses', 'Guides', 'FAQ', 'Switch to the dark look|Switch to the light look', 'Start setup']
              : ['SafeOS Guardian, home', 'How it works', 'Uses', 'Guides', 'FAQ', 'Privacy', githubName, 'Switch to the dark look|Switch to the light look', 'Start setup'];
          if (names.length !== want.length || names.some((name, i) => !want[i].split('|').includes(name))) out.push(`its items are ${names.join(', ')}`);
          if (nav.querySelector('[aria-label="Help"], [aria-label*="otification"]')) out.push('it holds a bell or a shortcuts key');
          if (nav.querySelector('svg path[d^="M12 2C6.477"]')) out.push('it holds the GitHub logo');
          const links = nav.querySelector('.site-header__links');
          if (!phone) {
            const box = links.getBoundingClientRect();
            const centre = box.left + box.width / 2;
            if (screen >= 1440 && Math.abs(centre - screen / 2) > 2) out.push(`the links are centred at ${Math.round(centre)} of ${screen}`);
            if (screen < 1440 && centre > screen / 2) out.push('the links do not follow the mark');
          }
          if (getComputedStyle(nav).boxShadow !== 'none') out.push('the bar draws a line in the first screen');
          return out;
        }, GITHUB_NAME);
        for (const p of found) fail(`header at ${width} px, ${look}: ${p}`);
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
      await page.mouse.click(195, 760);
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

  // The other public pages carry the app's bottom navigation on a phone; the
  // footer's last line still reads above it at the end of the page.
  for (const address of ['/faq/', '/privacy/']) {
    await open({ name: 'footer, bottom navigation', width: 390 }, async (page) => {
      await visit(page, new URL(address, baseUrl).toString());
      await page.locator('nav[aria-label="Mobile navigation"]').waitFor({ timeout: 15_000 });
      // The page scrolls smoothly; the walk goes straight to its end.
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await page.waitForTimeout(500);
      const seen = await page.evaluate(() => ({
        end: Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight) <= 1,
        last: document.querySelector('.site-footer__last').getBoundingClientRect().bottom,
        nav: document.querySelector('nav[aria-label="Mobile navigation"]').getBoundingClientRect().top,
      }));
      expect(seen.end, `footer on ${address} at 390 px: the walk did not reach the end of the page`);
      expect(seen.last <= seen.nav, `footer on ${address} at 390 px: its last line ends at ${Math.round(seen.last)} px, under the bottom navigation from ${Math.round(seen.nav)} px`);
    });
  }

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

  for (const look of LOOKS) {
    const other = look === 'light' ? 'dark' : 'light';
    await open({ name: 'look switch, look switch', width: 390, look }, async (page) => {
      await visit(page);
      const state = () => page.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        scheme: document.documentElement.style.colorScheme,
        theme: [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => meta.getAttribute('content')).join(','),
        said: document.querySelector('.site-header [role="status"]')?.textContent.trim(),
        capture: [...document.querySelectorAll('img[data-capture]')].filter((image) => image.offsetParent !== null).map((image) => image.dataset.capture).join(','),
      }));
      const before = await state();
      expect(before.background === PAGE_COLOURS[look], `look switch: with the device set to ${look} the page is ${before.background}`);
      // Every frame from the press on is read: in the first frame the page
      // shows the new look, each solid key already has its fill and label.
      await page.evaluate((want) => {
        window.__lookFrames = null;
        const keys = () => [...document.querySelectorAll('.key--solid')].filter((key) => key.offsetParent !== null);
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
      const key = page.getByRole('button', { name: `Switch to the ${other} look`, exact: true });
      await key.click();
      await page.getByRole('button', { name: `Switch to the ${look} look`, exact: true }).waitFor({ timeout: 5_000 });
      await page.waitForFunction(() => window.__lookFrames !== null, null, { timeout: 5_000 })
        .catch(() => fail('look switch: the page never showed the new look in a frame'));
      const firstFrame = (await page.evaluate(() => window.__lookFrames)) || [];
      expect(firstFrame.length > 0, 'look switch: no solid key is shown on the first screen');
      for (const solid of firstFrame) {
        expect(solid.fill === SOLID_KEY[other].fill && solid.label === SOLID_KEY[other].label,
          `look switch: in the first frame of the ${other} look, "${solid.name}" is ${solid.label} on ${solid.fill}, not ${SOLID_KEY[other].label} on ${SOLID_KEY[other].fill}`);
      }
      const after = await state();
      expect(after.background === PAGE_COLOURS[other], `look switch: after a press the page is ${after.background}, not ${PAGE_COLOURS[other]}`);
      expect(after.said === `${other === 'dark' ? 'Dark' : 'Light'} look on`, `look switch: the press announced "${after.said}"`);
      // Every theme-color tag the page carries reads the chosen look's colour.
      expect(after.scheme === other && !!after.theme && after.theme.split(',').every((colour) => colour === THEME_COLOURS[other]),
        `look switch: after a press color-scheme is ${after.scheme} and theme-color ${after.theme}`);
      if (after.capture) expect(after.capture.endsWith(`-${other}`), `capture: after a press the capture shown is ${after.capture}`);
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
  // Headline and lead, the start key and the statement, the capture
  // ---------------------------------------------------------------------------

  const H1_LINES = { 320: [1, 4], 390: [1, 3], 768: [2, 2], 820: [2, 2], 1024: [3, 3], 1280: [3, 3], 1440: [3, 3], 1920: [3, 3] };
  const CROPS = { 320: 'phone', 390: 'phone', 768: 'landscape', 820: 'landscape', 1024: 'portrait', 1280: 'portrait', 1440: 'landscape', 1920: 'landscape' };
  const record = await (await fetch(new URL('/home/sample-clip.json', baseUrl))).json();
  // The portrait crop holds the camera view and two whole rows of readout
  // tiles, so its ratio is its file's own, near 4:5; its box takes that ratio.
  const captureRecord = await (await fetch(new URL('/home/provenance.json', baseUrl))).json();
  const portraitFile = captureRecord.files.find((entry) => entry.path === 'home/capture-portrait-dark.webp');
  const RATIOS = { phone: 16 / 9, landscape: 16 / 10, portrait: portraitFile ? portraitFile.width / portraitFile.height : 4 / 5 };
  expect(RATIOS.portrait > 0.78 && RATIOS.portrait < 0.9, `capture: the portrait crop's file is ${RATIOS.portrait.toFixed(3)} wide for its height, not near 4:5`);
  for (const width of Object.keys(H1_LINES).map(Number)) {
    for (const look of LOOKS) {
      const height = width === 1440 || width === 1920 ? 900 : width >= 768 ? 800 : 844;
      await open({ name: 'first screen', width, height, look }, async (page) => {
        await visit(page);
        const seen = await page.evaluate(() => {
          const h1 = document.querySelector('h1');
          const style = getComputedStyle(h1);
          const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
          const image = [...document.querySelectorAll('img[data-capture]')].find((element) => element.offsetParent !== null);
          const slot = [...document.querySelectorAll('.capture__slot')].find((element) => element.getBoundingClientRect().height > 0);
          const key = document.querySelector('.home-first a.key--start');
          const keyStyle = getComputedStyle(key);
          return {
            h1s: document.querySelectorAll('h1').length,
            headline: h1.textContent.trim(),
            lines: Math.round(h1.getBoundingClientRect().height / parseFloat(style.lineHeight)),
            ink: style.color,
            face: style.fontFamily,
            lead: document.querySelector('.home-lead').textContent.trim(),
            statement: document.querySelector('.home-statement').textContent.trim(),
            caption: document.querySelector('.capture__caption').textContent.trim(),
            order: ['h1', '.home-lead', '.home-capture', '.home-first a.key--start', '.home-statement'].map((selector) => Math.round(box(selector).top)),
            bottoms: ['h1', '.home-lead', '.capture__frame', '.home-first a.key--start', '.home-statement'].map((selector) => Math.round(box(selector).bottom)),
            lefts: { text: box('.home-first__text').left, textRight: box('.home-first__text').right, capture: box('.capture__frame').left, captureRight: box('.capture__frame').right, wrap: box('.home-first__grid').left, wrapRight: box('.home-first__grid').right },
            tops: { h1: box('h1').top, capture: box('.capture__frame').top },
            keys: document.querySelectorAll('.home-first a.key, .home-first button').length,
            key: { width: key.getBoundingClientRect().width, height: key.getBoundingClientRect().height, column: box('.home-first__start').width, colour: keyStyle.color, fill: keyStyle.backgroundColor, href: key.getAttribute('href') },
            statementSize: parseFloat(getComputedStyle(document.querySelector('.home-statement')).fontSize),
            statementInk: getComputedStyle(document.querySelector('.home-statement')).color,
            capture: image ? { id: image.dataset.capture, alt: image.getAttribute('alt'), loaded: image.complete && image.naturalWidth > 0 } : null,
            slot: slot ? { name: slot.className, ratio: slot.getBoundingClientRect().width / slot.getBoundingClientRect().height } : null,
            ticks: document.querySelectorAll('.capture__frame .corner-ticks i').length,
            screen: window.innerHeight,
          };
        });
        const at = `at ${width} px, ${look}`;
        expect(seen.h1s === 1 && seen.headline === HEADLINE, `headline ${at}: ${seen.h1s} H1 reading "${seen.headline}"`);
        expect(plain(seen.lead) === LEAD, `headline ${at}: the lead reads "${seen.lead}"`);
        const [least, most] = H1_LINES[width];
        expect(seen.lines >= least && seen.lines <= most, `headline ${at}: the headline has ${seen.lines} lines, not ${least === most ? most : `at most ${most}`}`);
        expect(seen.ink === INK[look], `headline ${at}: the headline is ${seen.ink}`);
        expect(/Space_Grotesk|Space Grotesk/i.test(seen.face), `headline ${at}: the headline's face is ${seen.face}`);
        expect(plain(seen.statement) === STATEMENT, `start key ${at}: the statement reads "${seen.statement}"`);
        expect(seen.statementSize >= 18 && seen.statementInk === INK[look], `start key ${at}: the statement is ${seen.statementSize} px in ${seen.statementInk}`);
        expect(seen.keys === 1, `start key ${at}: the first screen holds ${seen.keys} keys`);
        expect(/^\/setup\/?$/.test(seen.key.href || ''), `start key ${at}: the start key opens ${seen.key.href}`);
        expect(Math.abs(seen.key.height - (width >= 1440 ? 56 : 52)) < 0.5, `start key ${at}: the start key is ${seen.key.height} px tall`);
        if (width < 768) expect(Math.abs(seen.key.width - seen.key.column) < 0.5, `start key ${at}: the start key is ${seen.key.width} px wide in a ${seen.key.column} px column`);
        else expect(seen.key.width < seen.key.column - 40, `start key ${at}: the start key is as wide as its column`);
        expect(plain(seen.caption) === CAPTION, `capture ${at}: the caption reads "${seen.caption}"`);
        expect(seen.ticks === 4, `capture ${at}: ${seen.ticks} corner ticks`);
        const crop = CROPS[width];
        expect(!!seen.slot && seen.slot.name.includes(`capture__slot--${crop}`) && Math.abs(seen.slot.ratio - RATIOS[crop]) < 0.02,
          `capture ${at}: the capture's box is ${seen.slot ? `${seen.slot.name} at ${seen.slot.ratio.toFixed(3)}` : 'missing'}, not the ${crop} crop`);
        expect(!!seen.capture && seen.capture.id === `${crop}-${look}` && seen.capture.loaded, `capture ${at}: the capture shown is ${seen.capture ? `${seen.capture.id}, loaded ${seen.capture.loaded}` : 'missing'}`);
        if (seen.capture) expect(seen.capture.alt === record.words.captureAlt[crop], `capture ${at}: the capture's text equivalent is not the record's for the ${crop} crop`);
        // The order and the layout of the first screen.
        const sorted = (list) => list.every((value, i) => i === 0 || value >= list[i - 1]);
        if (width < 768) {
          expect(sorted(seen.order), `headline ${at}: the first screen's order is not headline, lead, capture, key, statement`);
        } else if (width < 1024) {
          expect(seen.lefts.textRight - seen.lefts.text <= 640.5, `headline ${at}: the text block is ${Math.round(seen.lefts.textRight - seen.lefts.text)} px wide`);
          expect(seen.order[2] > seen.order[4], `capture ${at}: the capture is not under the text block`);
          expect(Math.abs((seen.lefts.captureRight - seen.lefts.capture) - (seen.lefts.wrapRight - seen.lefts.wrap - 64)) < 1, `capture ${at}: the capture is not as wide as the container`);
        } else {
          const columns = width >= 1440 ? 6 : 7;
          const gap = width >= 1440 ? 32 : 24;
          const container = seen.lefts.wrapRight - seen.lefts.wrap - (width >= 1440 ? 128 : 64);
          const column = (container - 11 * gap) / 12;
          expect(Math.abs((seen.lefts.textRight - seen.lefts.text) - (columns * column + (columns - 1) * gap)) < 1, `headline ${at}: the words are not in the left ${columns} of twelve columns`);
          expect(seen.lefts.capture > seen.lefts.textRight, `capture ${at}: the capture is not at the right of the words`);
          expect(Math.abs(seen.tops.capture - seen.tops.h1) <= 16, `capture ${at}: the capture's top is ${Math.round(seen.tops.capture - seen.tops.h1)} px from the headline's`);
        }
        if ((width === 390 && height === 844) || (width === 1440 && height === 900)) {
          expect(seen.bottoms.every((bottom) => bottom <= seen.screen), `headline ${at}: the first screen does not hold the headline, the lead, the capture, the key and the statement (bottoms ${seen.bottoms.join(', ')} of ${seen.screen})`);
        }
      });
    }
  }

  // The capture's file blocked: the box keeps its size and shows the text equivalent.
  await open({ name: 'capture, file blocked', width: 390, look: 'dark' }, async (page, context) => {
    await context.route('**/home/capture-*', (route) => route.abort());
    await visit(page);
    const error = page.locator('.capture__slot--phone .capture__pic--dark .capture__error');
    await error.waitFor({ timeout: 10_000 });
    const seen = await page.evaluate(() => {
      const slot = document.querySelector('.capture__slot--phone').getBoundingClientRect();
      return { ratio: slot.width / slot.height, words: document.querySelector('.capture__slot--phone .capture__pic--dark .capture__error p').textContent.trim(), caption: document.querySelector('.capture__caption').getBoundingClientRect().height > 0 };
    });
    expect(Math.abs(seen.ratio - 16 / 9) < 0.02, `capture, file blocked: the box is ${seen.ratio.toFixed(3)} wide for its height`);
    expect(seen.words === record.words.captureAlt.phone && seen.caption, 'capture, file blocked: the box does not show the text equivalent with the caption under it');
    await page.screenshot({ path: path.join(outDir, 'home-capture-blocked-390-dark.png') });
  });

  // The start key opens setup; the words that left the page are gone.
  await open({ name: 'words', width: 1280, height: 800 }, async (page) => {
    await visit(page);
    const words = plain(await page.evaluate(() => {
      document.querySelectorAll('details').forEach((details) => { details.open = true; });
      return document.querySelector('.visitor-shell').innerText;
    }));
    const count = (needle) => words.split(needle).length - 1;
    expect(count('It does not replace a person nearby.') === 1, `start key: "It does not replace a person nearby." appears ${count('It does not replace a person nearby.')} times`);
    expect(count('SafeOS is not a medical device: it does not monitor breathing and cannot prevent SIDS.') === 1, 'uses: the not-a-medical-device sentence does not appear exactly once');
    for (const gone of ['Experimental Supplemental Monitoring Tool', 'lo-tech', 'tech-savvy', 'supplemental', 'supplementary', 'NOT a replacement', 'babysitter', 'carer',
      'security system', 'Takes less than 2 minutes', 'Deep learning', 'cosine', 'Sobel', 'Blurred', 'humanitarian', 'always be free', 'never charge', 'Future optional service',
      'nonprofit', 'charity', 'donate', 'donation', 'tax-exempt', 'tax-deductible', 'identify', 'FREE', 'Quick Start', 'All systems operational', 'All rights reserved',
      'Your camera\'s pictures stay in your browser', 'never leaves', '100% local', 'No telemetry', 'Who can see my camera?', 'What does it cost?', 'vital', 'falls', 'COCO-SSD']) {
      expect(!words.toLowerCase().includes(gone.toLowerCase()) || (gone === 'FREE' && !words.includes('FREE')), `the page says "${gone}"`);
    }
    expect(!/\bAI\b/.test(words), 'alerts: the page says "AI"');
    for (const health of ['medical', 'breathing', 'SIDS']) expect(count(health) === 1, `uses: "${health}" appears ${count(health)} times`);
    expect(count('account') === 1, `questions: the word "account" appears ${count('account')} times`);
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

  const LAYOUTS = {
    390: { uses: '1,1,1,1,1', alerts: '1,1,1,1', footer: '2,2,2', qr: false },
    820: { uses: '2,2,1', alerts: '2,2', footer: '3,3', qr: 160 },
    1280: { uses: '2,3', alerts: '2,2', footer: '6', qr: 200 },
    1440: { uses: '3,2', alerts: '3,1', footer: '6', qr: 200 },
  };
  for (const width of [390, 820, 1280, 1440]) {
    for (const look of LOOKS) {
      await open({ name: 'parts, layout', width, height: 900, look }, async (page) => {
        await visit(page);
        const at = `at ${width} px, ${look}`;
        const layout = LAYOUTS[width];
        expect((await columnsOf(page, '.home-use')) === layout.uses, `uses ${at}: the entries sit in rows of ${await columnsOf(page, '.home-use')}, not ${layout.uses}`);
        expect((await columnsOf(page, '.home-alert')) === layout.alerts, `alerts ${at}: the entries sit in rows of ${await columnsOf(page, '.home-alert')}, not ${layout.alerts}`);
        expect((await columnsOf(page, '.site-footer__groups > div')) === layout.footer, `footer ${at}: the groups sit in rows of ${await columnsOf(page, '.site-footer__groups > div')}, not ${layout.footer}`);
        const seen = await page.evaluate(() => {
          const box = (selector) => document.querySelector(selector).getBoundingClientRect();
          const qr = document.querySelector('.home-qr img');
          const style = (selector) => getComputedStyle(document.querySelector(selector));
          const questions = [...document.querySelectorAll('.home-q > summary')].map((summary) => summary.getBoundingClientRect());
          return {
            qr: qr.getBoundingClientRect().width,
            qrAlt: qr.getAttribute('alt'),
            steps: box('.home-steps'),
            qrBox: box('.home-qr'),
            note: box('.home-how__note'),
            noteFill: style('.home-how__note').backgroundColor,
            free: style('#free').backgroundColor,
            closing: style('.home-closing').textAlign,
            closingBand: getComputedStyle(document.querySelector('.home-closing').closest('section')).backgroundColor,
            closingKey: box('.home-closing a.key'),
            closingWords: box('.home-closing__words'),
            footer: style('footer').backgroundColor,
            questionRows: Math.min(...questions.map((row) => row.height)),
            questionColumns: new Set(questions.map((row) => Math.round(row.left))).size,
            links: [...document.querySelectorAll('main .link-row, main .home-use__medical a, footer nav a')].map((link) => ({ words: link.textContent.trim(), height: link.getBoundingClientRect().height })),
            cells: [...document.querySelectorAll('.home-use')].map((cell) => Math.round(cell.getBoundingClientRect().width)),
            freeLinks: [...document.querySelectorAll('.home-free__links li')].map((item) => Math.round(item.getBoundingClientRect().top)),
            boxed: [...document.querySelectorAll('.home-use, .home-alert, .home-step, .home-q')].filter((entry) => {
              const entryStyle = getComputedStyle(entry);
              return entryStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(entryStyle.borderRadius) > 0;
            }).length,
          };
        });
        if (layout.qr) {
          expect(Math.abs(seen.qr - layout.qr) < 0.5, `how it works ${at}: the QR code is ${seen.qr} px wide, not ${layout.qr}`);
          expect(seen.qrBox.left >= seen.steps.right - 1, `how it works ${at}: the QR panel is not beside the steps`);
        } else {
          expect(seen.qr === 0, `how it works ${at}: a QR code shows on a phone`);
        }
        expect(seen.qrAlt === 'QR code for https://safeos.sh/', `how it works ${at}: the QR code's text equivalent is "${seen.qrAlt}"`);
        expect(seen.free === PANEL_COLOURS[look] && seen.closingBand === PANEL_COLOURS[look] && seen.footer === PANEL_COLOURS[look],
          `bands ${at}: the bands are ${seen.free}, ${seen.closingBand} and ${seen.footer}, not the panel colour`);
        expect(seen.questionRows >= 48, `questions ${at}: a question's row is ${seen.questionRows} px tall`);
        expect(seen.questionColumns === (width === 820 || width === 1440 ? 2 : 1), `questions ${at}: the questions sit in ${seen.questionColumns} columns`);
        expect(seen.boxed === 0, `${at}: ${seen.boxed} text entries are boxed`);
        if (width === 390) {
          for (const link of seen.links) expect(link.height >= 43.5, `${at}: the link "${link.words}" is ${link.height} px tall`);
          expect(seen.closingKey.top > seen.closingWords.bottom, `start key ${at}: the closing block's key is not under its line`);
        } else {
          for (const link of seen.links) expect(link.height >= 24, `${at}: the link "${link.words}" is ${link.height} px tall`);
        }
        if (width === 820 || width === 1280) {
          expect(seen.closing === 'center' && seen.closingKey.top > seen.closingWords.bottom, `start key ${at}: the closing block is not centred with its key under its line`);
        }
        if (width === 1440) {
          expect(seen.closingKey.left > seen.closingWords.right - 1 && Math.abs(seen.closingKey.height - 56) < 0.5, `start key ${at}: the closing block is not one row with a 56 px key`);
          expect(Math.min(...seen.cells) >= 424, `uses ${at}: a cell of the grid is ${Math.min(...seen.cells)} px wide`);
        }
        if (width === 1280) expect(new Set(seen.freeLinks).size === 2, `free and open ${at}: the four links are not a grid of two by two`);
        if (width === 1280) expect(seen.noteFill === PANEL_COLOURS[look], `how it works ${at}: the server note is not in the panel`);
      });
    }
  }

  // The words of each part, the anchors and the links.
  await open({ name: 'parts, words', width: 1280, height: 800 }, async (page) => {
    await visit(page);
    const seen = await page.evaluate(() => {
      const text = (element) => (element ? element.textContent.replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim() : '');
      const part = (id) => document.getElementById(id);
      return {
        h2s: [...document.querySelectorAll('main h2')].map(text),
        uses: [...document.querySelectorAll('.home-use')].map((entry) => ({ id: entry.querySelector('h3').id, title: text(entry.querySelector('h3')), words: [...entry.querySelectorAll('p')].map(text), links: [...entry.querySelectorAll('a')].map((a) => `${text(a)} ${a.href} ${a.target}`) })),
        steps: [...document.querySelectorAll('ol.home-steps > li')].map((step) => ({ action: text(step.querySelector('h3')), words: text(step.querySelector('p')) })),
        note: text(document.querySelector('.home-how__note p')),
        noteLink: document.querySelector('.home-how__note a').href,
        qrCaption: text(document.querySelector('.home-qr figcaption')),
        alerts: [...document.querySelectorAll('.home-alert')].map((entry) => ({ title: text(entry.querySelector('h3')), words: [...entry.querySelectorAll('p')].map(text) })),
        aside: text(document.querySelector('.home-alerts__aside p')),
        asideLink: `${text(document.querySelector('.home-alerts__aside a'))} ${document.querySelector('.home-alerts__aside a').href}`,
        openers: part('alerts').querySelectorAll('details, button').length,
        free: [...document.querySelectorAll('.home-free__words p')].map(text),
        freeLinks: [...document.querySelectorAll('.home-free__links a')].map((a) => `${text(a)} ${a.getAttribute('href')}`),
        questions: [...document.querySelectorAll('.home-q')].map((details) => ({ question: text(details.querySelector('summary')), open: details.open, answer: text(details.querySelector('.home-q__answer p')), links: [...details.querySelectorAll('a')].map((a) => `${text(a)} ${a.getAttribute('href')}`) })),
        all: `${text(document.querySelector('.home-questions__all'))} ${document.querySelector('.home-questions__all').getAttribute('href')}`,
        closing: [...document.querySelectorAll('.home-closing h2, .home-closing p, .home-closing a')].map(text),
        footer: [...document.querySelectorAll('.site-footer__groups > div')].map((group) => `${text(group.querySelector('h2'))}: ${[...group.querySelectorAll('a')].map((a) => `${text(a)} ${a.getAttribute('href')}${a.target ? ` ${a.target}` : ''}`).join(' | ')}`),
        brand: [...document.querySelectorAll('.site-footer__brand p')].map(text),
        last: text(document.querySelector('.site-footer__last')),
        structured: [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) => JSON.parse(script.textContent)),
      };
    });
    const same = (got, want, what) => expect(JSON.stringify(got) === JSON.stringify(want), `${what}: ${JSON.stringify(got)}`);
    same(seen.h2s, ['What people set it up for', 'One device does the watching and the alerting', 'Four things set off an alert', 'Free on safeos.sh, with the code in the open', 'Questions people ask first', 'Start with the device you have'], 'the part headings are');
    same(seen.uses.map((entry) => `${entry.id}: ${entry.title}`), ['baby-nap: A baby\'s nap', 'pet-out: A pet while you are out', 'elderly-parent: An elderly parent', 'lost-pet: A lost pet near home', 'wildlife: Backyard wildlife'], 'uses: the entries are');
    same(seen.uses[0].words, ['Motion and loud-sound alerts for a short nap while you are close by. It reacts to movement and noise in the room.', 'SafeOS is not a medical device: it does not monitor breathing and cannot prevent SIDS. Safe-sleep guidance (NIH)'], 'uses: the baby entry reads');
    same(seen.uses[0].links, ['Safe-sleep guidance (NIH) https://safetosleep.nichd.nih.gov/reduce-risk/reduce _blank'], 'uses: the baby entry links');
    same(seen.uses[1].words, ['Leave it watching for a short while. It can play a sound you recorded when it sees motion, and History lists each alert for when you are back.'], 'uses: the pet entry reads');
    same(seen.uses[2].words, ['Set it up together, with their agreement. It alerts in the room on motion, a loud sound or a set time of stillness. It cannot tell why nothing has moved or whether someone needs help. Reaching your own phone takes a server you run.'], 'uses: the elderly entry reads');
    same(seen.uses[3].words, ['Point a camera at the yard or the porch. SafeOS compares what it sees with the colours in your pet\'s photos and alerts on a likely match. It cannot tell your pet from a look-alike, so post an alert on PawBoost or Petco Love Lost too.'], 'uses: the lost pet entry reads');
    same(seen.uses[3].links, ['PawBoost https://www.pawboost.com/ ', 'Petco Love Lost https://lost.petcolove.org/ '], 'uses: the lost pet entry links');
    same(seen.uses[4].words, ['The Wildlife page uses an object-detection model to spot 10 kinds of animal, birds, cats and dogs among them. It saves a picture of each sighting in your browser.'], 'uses: the wildlife entry reads');
    same(seen.steps, [
      { action: 'Open safeos.sh on the device that will watch.', words: 'An old phone, a tablet or a laptop works. Plug it in and set its screen to stay on, because a device that sleeps stops watching.' },
      { action: 'Go through setup.', words: 'It has 6 short steps. You say what you are watching, and at step 4 the browser asks for the camera and microphone.' },
      { action: 'Stay within earshot.', words: 'When something moves or gets loud, the device plays an alert sound, shows a notification and lists the alert in History.' },
    ], 'how it works: the steps read');
    expect(seen.note === 'Want the alert on another phone? Email, text and Telegram alerts need a server you run yourself.', `how it works: the server note reads "${seen.note}"`);
    expect(seen.noteLink === 'https://github.com/framerslab/safeos/blob/master/docs/DEPLOYMENT.md#option-b-full-stack-deployment', `how it works: the server guide link is ${seen.noteLink}`);
    expect(seen.qrCaption === 'Scan to open safeos.sh on the phone or tablet that will watch.', `how it works: the QR caption reads "${seen.qrCaption}"`);
    same(seen.alerts, [
      { title: 'Motion', words: ['The camera picture changes by more than the amount you set.'] },
      { title: 'A loud sound', words: ['The microphone level stays above the level you set.'] },
      { title: 'Stillness', words: ['Nothing has moved for a time you set, from 1 to 60 minutes.'] },
      { title: 'A person or an animal', words: ['The Security and Wildlife pages run an object-detection model in your browser. It finds people and 10 kinds of animal: dog, cat, bird, horse, sheep, cow, elephant, bear, zebra and giraffe.', 'That model is 18.6 MB, downloaded from Google\'s storage. The download starts only after you agree, and Google sees your IP address when it does.'] },
    ], 'alerts: the entries read');
    expect(seen.aside === 'The everyday monitor compares each camera frame with the one before and measures how loud the room is.', `alerts: the everyday-monitor line reads "${seen.aside}"`);
    expect(seen.asideLink === 'Read the detection code on GitHub https://github.com/framerslab/safeos/tree/master/apps/guardian-ui/src/lib', `alerts: the code link is ${seen.asideLink}`);
    expect(seen.openers === 0, 'alerts: an entry opens or closes');
    same(seen.free, ['SafeOS at safeos.sh is free, and this site has no paid tier or subscription. Frame builds SafeOS and pays for it.', 'The code is MIT-licensed, so anyone can read it, change it and run it.', 'SafeOS is experimental software, provided as is.'], 'free and open: the sentences read');
    same(seen.freeLinks.map((link) => link.replace(/\/$/, '')), ['Read the code on GitHub https://github.com/framerslab/safeos', 'The MIT License https://github.com/framerslab/safeos/blob/master/LICENSE',
      'The offline check that runs before each deploy https://github.com/framerslab/safeos/blob/master/apps/guardian-ui/scripts/check-offline-start.mjs', 'How SafeOS works, in detail /blog/how-safeos-guardian-works'], 'free and open: the links are');
    same(seen.questions.map((entry) => ({ ...entry, links: entry.links.map((link) => link.replace(/\/$/, '')) })), [
      { question: 'Can an old phone be the camera?', open: false, answer: 'Yes. SafeOS runs in the browser on phones, tablets and computers. Plug the device in and set its screen to stay on, because a device that sleeps stops watching. The FAQ lists the browsers.', links: ['See the browser list in the FAQ /faq'] },
      { question: 'Where does the alert go?', open: false, answer: 'To the device that is watching. It plays a sound, shows a notification and lists the alert in History. Email, text and Telegram alerts need a server you run yourself.', links: [] },
      { question: 'Can I see the camera from another device?', open: false, answer: 'No. safeos.sh shows the camera only on the device that is watching.', links: [] },
      { question: 'Does it work without internet?', open: false, answer: 'Yes, after your browser has saved the app\'s files on a visit online. Motion and sound alerts then work with no connection. The Security and Wildlife pages also need their model saved first.', links: [] },
      { question: 'Do I need an account?', open: false, answer: 'No. Open safeos.sh on the device that will watch and go through setup.', links: [] },
      { question: 'Where are my pictures kept?', open: false, answer: 'In the browser on the device that watches. Saved frames, photos and alerts are kept in its storage, and they go to a server only if you connect one of your own.', links: ['Read the privacy page /privacy'] },
    ], 'questions: the questions read');
    expect(seen.all.replace(/\/$/, '') === 'All questions and answers /faq', `questions: the link to the FAQ is ${seen.all}`);
    same(seen.closing, ['Start with the device you have', 'Setup has 6 short steps and asks for the camera at step 4.', 'Start setup'], 'start key: the closing block reads');
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

    // All six questions can be open together, by pointer and by keyboard.
    for (const summary of await page.locator('.home-q > summary').all()) await summary.click();
    expect((await page.locator('.home-q[open]').count()) === 6, 'questions: the six questions cannot be open together');
    const first = page.locator('.home-q > summary').first();
    await first.focus();
    await page.keyboard.press('Enter');
    expect(!(await page.locator('.home-q').first().evaluate((details) => details.open)), 'questions: Enter does not close an open question');
    await page.keyboard.press('Space');
    expect(await page.locator('.home-q').first().evaluate((details) => details.open), 'questions: Space does not open a question');
  });

  // The header's and the footer's anchors land below the bar, not under it.
  for (const [from, link, hash, target] of [
    ['/', 'Uses', '#uses', '#uses-title'],
    ['/', 'How it works', '#how-it-works', '#how-title'],
    ['/faq/', 'A lost pet near home', '#lost-pet', '#lost-pet'],
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
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    const seen = await page.evaluate(() => {
      const image = [...document.querySelectorAll('img[data-capture]')].find((element) => element.offsetParent !== null);
      return { h1: document.querySelector('h1')?.textContent.trim(), capture: !!image && image.complete && image.naturalWidth > 0, steps: document.querySelectorAll('ol.home-steps > li').length };
    });
    expect(seen.h1 === HEADLINE && seen.steps === 3, 'offline: the page does not show from the installed copy');
    expect(seen.capture, 'capture, offline: the capture does not show from the installed copy');
    await page.locator('.home-q > summary').nth(3).click();
    expect(await page.locator('.home-q').nth(3).evaluate((details) => details.open), 'questions, offline: a question does not open');
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
