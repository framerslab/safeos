// Checks the app's pages on the built static site in a real browser.
//
// scripts/capture-pictures.mjs runs it for the pull request's own build. Each
// block walks one part of the app as a person would: the header and the bar
// on a phone, the page before any script runs, the dashboard in each state,
// the old addresses and the page a device shows offline. Every finding is
// printed, and the count of findings is returned; any finding fails the run.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { SETUP_DONE, measureText, plain, readStrokes } from './home-checks.mjs';

export const LOOKS = ['light', 'dark'];
export const ROW_WIDTHS = [320, 360, 390, 430, 480, 768];
export const LAYOUT_WIDTHS = [390, 820, 1280, 1920];
const WALK_LIMIT_MS = 180_000;
const heightOf = (width) => (width >= 1440 ? 900 : width >= 768 ? 800 : 844);

export async function checkApp(browser, baseUrl, outDir) {
  const problems = [];
  const fail = (message) => problems.push(message);
  const expect = (ok, message) => { if (!ok) fail(message); };
  const address = (route) => new URL(route, baseUrl).toString();

  // One walk, timed: `start` makes its context and its page, `run` walks
  // them. Anything that throws, the context's own setup included, is a
  // finding of this walk; whatever was made is closed, and the next walk runs.
  const walk = async ({ name, width, look }, start, run, check) => {
    const made = {};
    let limit;
    const ranOver = new Promise((_, reject) => {
      limit = setTimeout(() => reject(new Error(`did not finish in ${WALK_LIMIT_MS / 1000} seconds`)), WALK_LIMIT_MS);
    });
    try {
      await Promise.race([(async () => {
        const page = await start(made);
        await run(page, made.context, check);
      })(), ranOver]);
    } catch (err) {
      fail(`${name} at ${width} px, ${look}: ${err.message.split('\n')[0]}`);
    } finally {
      clearTimeout(limit);
      if (made.context) await made.context.close().catch((err) => fail(`${name} at ${width} px, ${look}: its browser did not close: ${err.message.split('\n')[0]}`));
      if (made.folder) await rm(made.folder, { recursive: true, force: true });
    }
  };

  // One walk in a context of its own. `state` seeds the device before the
  // first page loads: 'set-up' (a finished setup), 'new' (nothing saved).
  // The walk is given the page, its context and check(ok, what), which
  // records what was seen under the walk's name, width and look.
  const open = async (options, run, { state = 'set-up', script = null, permissions = ['camera', 'microphone', 'notifications'] } = {}) => {
    const { name, width, height = heightOf(width), look = 'light', ...rest } = options;
    const check = (ok, what) => expect(ok, `${name} at ${width} px, ${look}: ${what}`);
    await walk({ name, width, look }, async (made) => {
      made.context = await browser.newContext({
        viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768, colorScheme: look, ...rest,
      });
      await made.context.grantPermissions(permissions, { origin: new URL(baseUrl).origin });
      if (state === 'set-up') await made.context.addInitScript(SETUP_DONE);
      if (script) await made.context.addInitScript(script);
      return made.context.newPage();
    }, run, check);
  };

  // A walk in a browser profile kept on disk, as a person's own window is.
  // A context made with newContext keeps nothing after it closes.
  const openKept = async (options, run) => {
    const { name, width, height = heightOf(width), look = 'light' } = options;
    const check = (ok, what) => expect(ok, `${name} at ${width} px, ${look}: ${what}`);
    await walk({ name, width, look }, async (made) => {
      made.folder = await mkdtemp(path.join(os.tmpdir(), 'safeos-profile-'));
      made.context = await chromium.launchPersistentContext(made.folder, {
        viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768, colorScheme: look,
        permissions: ['camera', 'microphone', 'notifications'],
      });
      return made.context.pages()[0] || made.context.newPage();
    }, run, check);
  };

  const visit = (page, route) => page.goto(address(route), { waitUntil: 'networkidle', timeout: 60_000 });
  const sidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // The checks of each part are added below this line.
  void open; void openKept; void visit; void sidewaysScroll; void expect; void measureText; void plain; void readStrokes;
  void LOOKS; void ROW_WIDTHS; void LAYOUT_WIDTHS; void outDir;

  // ---------------------------------------------------------------------------
  // The app's frame
  // ---------------------------------------------------------------------------
  // Every app page carries the app's header, the site footer and, on a phone
  // and on every app page but Setup, the bar at the foot of the screen; the
  // reading pages carry the visitor header; no page shows a floating card.

  const PAGE = { light: 'rgb(248, 249, 250)', dark: 'rgb(11, 19, 27)' };
  const INK = { light: 'rgb(15, 18, 21)', dark: 'rgb(244, 245, 246)' };
  const QUIET = { light: 'rgb(33, 37, 41)', dark: 'rgb(196, 201, 209)' };
  const RAISED = { light: 'rgb(232, 235, 238)', dark: 'rgb(21, 33, 45)' };
  const ACCENT = { light: 'rgb(20, 83, 45)', dark: 'rgb(74, 222, 128)' };
  const OTHER = { light: 'dark', dark: 'light' };
  const LARGER_TEXT = 'html { font-size: 200% !important; } * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }';
  const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const DESTINATION_WORDS = ['Dashboard', 'History', 'Settings', 'Help'];
  const rowNames = (look) => ['SafeOS Guardian, dashboard', ...DESTINATION_WORDS, `Switch to the ${OTHER[look]} look`];
  const face = (family) => (family || '').split(',')[0].replace(/["']/g, '').trim();
  const isInter = (family) => /Inter/i.test(face(family));

  // Text at 200 per cent with the spacing overrides, put on a page that has
  // loaded; the header measures its row again on the resize that follows.
  const largerText = async (page) => {
    await page.addStyleTag({ content: LARGER_TEXT });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(500);
  };

  // The page scrolled to its end at once (the page scrolls smoothly).
  const toEnd = (page) => page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));

  // What makes the page wider than the screen, for a finding that names it.
  const widest = (page) => page.evaluate(() => {
    let found = null;
    for (const element of document.body.querySelectorAll('*')) {
      const box = element.getBoundingClientRect();
      if (box.width > 0 && box.right > document.documentElement.clientWidth + 0.5 && (!found || box.right > found.right)) {
        found = { right: box.right, name: `${element.tagName.toLowerCase()}${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/).join('.')}` : ''}` };
      }
    }
    return found ? `${found.name} ends at ${Math.round(found.right)} px` : 'nothing found past the edge';
  });

  // The header's row as drawn: each shown item, left to right, with its box.
  const readRow = () => {
    const header = document.querySelector('header.app-header');
    if (!header) return null;
    const bar = header.querySelector('.app-header__bar');
    const shown = (node) => {
      if (!node) return false;
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden';
    };
    // The lines a control's words take: one, unless a word broke.
    const linesOf = (node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top))).size;
    };
    const barBox = bar.getBoundingClientRect();
    const wordmark = header.querySelector('.app-header__brand--link .wordmark');
    return {
      fold: header.getAttribute('data-fold'),
      wordmark: shown(wordmark),
      bar: { top: barBox.top, bottom: barBox.bottom, left: barBox.left, right: barBox.right, height: barBox.height, scroll: bar.scrollWidth - bar.clientWidth },
      items: [...bar.querySelectorAll('a.app-header__brand--link, span.app-header__brand--plain, a.app-header__link, button.app-header__more, button.look-switch, .look-switch-place')]
        .filter(shown)
        .map((node) => {
          const box = node.getBoundingClientRect();
          const kind = node.matches('.app-header__link') ? 'link' : node.matches('.app-header__more') ? 'more'
            : node.matches('.look-switch, .look-switch-place') ? 'switch' : 'brand';
          return {
            kind,
            name: node.getAttribute('aria-label') || node.textContent.trim(),
            top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height,
            cut: node.scrollWidth > node.clientWidth + 0.5,
            lines: kind === 'link' || kind === 'more' ? linesOf(node) : 1,
          };
        }),
    };
  };

  // The footer's links that open a page of this site: each answers 200.
  const answered = new Map();
  const answers = async (context, href) => {
    const target = href.split('#')[0] || '/';
    if (!answered.has(target)) {
      const response = await context.request.get(address(target), { timeout: 30_000 }).catch((err) => ({ status: () => err.message.split('\n')[0] }));
      answered.set(target, response.status());
    }
    return answered.get(target);
  };

  // Which screen /dashboard/ shows: the redesigned screen, whose first
  // heading says the watching state, or the earlier one with its Quick
  // Actions panel; read as capture-pictures.mjs's openDashboard reads it.
  const whichDashboard = async (page) => {
    const state = page.getByRole('heading', { level: 1, name: /^(Not watching|Watching in another tab)$/ });
    const quickActions = page.locator('.panel')
      .filter({ has: page.getByRole('heading', { name: 'Quick Actions', exact: true }) });
    await Promise.any([state.waitFor({ timeout: 20_000 }), quickActions.waitFor({ timeout: 20_000 })]).catch((err) => {
      const reasons = (err.errors || [err]).map((reason) => reason.message.split('\n')[0]);
      throw new Error(`the dashboard showed neither its watching state nor Quick Actions: ${reasons.join('; ')}`);
    });
    return (await state.count()) > 0 ? 'redesigned' : 'earlier';
  };

  // The phone bar: three places in one row at the foot of every phone width.
  for (const width of [320, 360, 390, 430, 480]) {
    for (const look of LOOKS) {
      await open({ name: 'phone bar', width, look }, async (page, context, check) => {
        await visit(page, '/dashboard/');
        const bar = page.locator('nav.phone-bar[aria-label="App"]');
        if (!(await bar.count()) || !(await bar.isVisible())) throw new Error('no navigation "App" shows at the foot of the screen');
        const seen = await bar.evaluate((nav) => ({
          screen: document.documentElement.clientWidth,
          places: [...nav.querySelectorAll('a')].map((a) => {
            const box = a.getBoundingClientRect();
            return { word: (a.querySelector('.phone-bar__word') || a).textContent.trim(), top: box.top, left: box.left, right: box.right, width: box.width, height: box.height };
          }),
        }));
        const words = seen.places.map((place) => place.word).join(', ');
        check(words === 'Dashboard, History, Settings', `the bar's places read ${words}`);
        const tops = seen.places.map((place) => place.top);
        check(Math.max(...tops) - Math.min(...tops) <= 0.5, `the places' tops are ${tops.map((top) => top.toFixed(1)).join(', ')} px`);
        for (const place of seen.places) {
          check(place.left >= -0.5 && place.right <= seen.screen + 0.5, `${place.word} runs from ${Math.round(place.left)} to ${Math.round(place.right)} px on a ${seen.screen} px screen`);
          if (width === 320) {
            check(place.height >= 63.5 && place.width >= 105.5, `${place.word} is ${Math.round(place.width)} by ${Math.round(place.height)} px, under 106 by 64`);
          }
        }
        const sideways = await sidewaysScroll(page);
        if (sideways > 0) check(false, `the page scrolls ${sideways} px sideways: ${await widest(page)}`);
      });
    }
  }

  // The place of the page being read: marked by its accent line alone, its
  // word in the quiet tone like the other two; a held press shows the
  // raised ground.
  for (const route of ['/dashboard/', '/history/', '/settings/']) {
    for (const look of LOOKS) {
      await open({ name: 'phone bar, the place being read', width: 390, look }, async (page, context, check) => {
        await visit(page, route);
        const places = await page.evaluate(() => [...document.querySelectorAll('nav.phone-bar a')].map((a) => {
          const word = a.querySelector('.phone-bar__word') || a;
          const style = getComputedStyle(word);
          const line = getComputedStyle(a, '::before');
          return {
            href: a.getAttribute('href'), current: a.getAttribute('aria-current'), word: word.textContent.trim(),
            face: style.fontFamily, weight: style.fontWeight, size: style.fontSize, line: style.lineHeight, colour: style.color,
            mark: { content: line.content, height: line.height, colour: line.backgroundColor },
          };
        }));
        if (places.length !== 3) throw new Error(`on ${route} the phone bar has ${places.length} places`);
        const current = places.filter((place) => place.current === 'page');
        check(current.length === 1 && current[0].href === route, `on ${route} the places marked as the page being read are ${current.map((place) => place.word).join(', ') || 'none'}`);
        for (const place of places) {
          check(isInter(place.face) && place.weight === '400' && place.size === '16px' && place.line === '24px',
            `on ${route} ${place.word} is ${face(place.face)} ${place.weight} at ${place.size} on ${place.line} lines`);
          check(place.colour === QUIET[look], `on ${route} ${place.word} is ${place.colour}, not ${QUIET[look]}`);
          if (place.current === 'page') {
            check(place.mark.height === '2px' && place.mark.colour === ACCENT[look],
              `on ${route} the line above ${place.word} is ${place.mark.height} in ${place.mark.colour}, not 2px in ${ACCENT[look]}`);
          } else {
            check(place.mark.content === 'none' || place.mark.content === 'normal', `on ${route} ${place.word} carries a line above it`);
          }
        }
        // A press held on each place, released off the bar so nothing opens.
        for (const word of ['Dashboard', 'History', 'Settings']) {
          const place = page.locator('nav.phone-bar').getByRole('link', { name: word, exact: true });
          const box = await place.boundingBox();
          if (!box) { check(false, `on ${route} ${word} has no box`); continue; }
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          const ground = await place.evaluate((a) => getComputedStyle(a).backgroundColor);
          await page.mouse.move(box.x + box.width / 2, Math.max(box.y - 300, 100));
          await page.mouse.up();
          check(ground === RAISED[look], `on ${route} ${word} held down is ${ground}, not ${RAISED[look]}`);
        }
      });
    }
  }

  // Each place opens its page; a press on the place of the page being read
  // returns that page to its top.
  await open({ name: 'phone bar, presses', width: 390, look: 'dark' }, async (page, context, check) => {
    await visit(page, '/dashboard/');
    for (const [word, route] of [['History', '/history/'], ['Settings', '/settings/'], ['Dashboard', '/dashboard/']]) {
      try {
        await Promise.all([
          page.waitForURL((url) => url.pathname === route, { timeout: 15_000 }),
          page.locator('nav.phone-bar').getByRole('link', { name: word, exact: true }).click(),
        ]);
      } catch (err) {
        check(false, `${word} did not open ${route}: ${err.message.split('\n')[0]}`);
      }
    }
    await visit(page, '/history/');
    await toEnd(page);
    await page.waitForTimeout(300);
    const down = await page.evaluate(() => window.scrollY);
    check(down > 0, '/history/ does not scroll down, so the press on its own place was not tried');
    await page.locator('nav.phone-bar').getByRole('link', { name: 'History', exact: true }).click();
    const top = await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 5_000 })
      .then(() => 0, () => page.evaluate(() => window.scrollY));
    check(top === 0, `a press on History on /history/ left the page ${Math.round(top)} px down`);
  });

  // No phone bar from the tablet width, on Setup or on a reading page.
  for (const [route, width, state] of [['/dashboard/', 768, 'set-up'], ['/dashboard/', 1280, 'set-up'], ['/dashboard/', 1440, 'set-up'], ['/setup/', 390, 'new'], ['/', 390, 'new']]) {
    await open({ name: 'phone bar, where it is not', width }, async (page, context, check) => {
      await visit(page, route);
      check((await page.locator('nav.phone-bar:visible').count()) === 0, `a phone bar shows on ${route}`);
    }, { state });
  }

  // The phone's top bar: the brand alone, plain, on one row; from 768 px the
  // row with the four links, all on one line and inside the screen.
  for (const width of ROW_WIDTHS) {
    for (const look of LOOKS) {
      await open({ name: 'phone top bar', width, look }, async (page, context, check) => {
        await visit(page, '/dashboard/');
        const row = await page.evaluate(readRow);
        if (!row) throw new Error('no app header');
        const tops = row.items.map((item) => item.top);
        check(row.items.length > 0 && Math.max(...tops) - Math.min(...tops) <= 0.5, `the header's items (${row.items.map((item) => item.name).join(', ')}) sit at ${tops.map((top) => top.toFixed(1)).join(', ')} px`);
        for (const item of row.items) {
          check(!item.cut && item.left >= row.bar.left - 0.5 && item.right <= row.bar.right + 0.5, `${item.name} is cut (${Math.round(item.left)} to ${Math.round(item.right)} px in a bar from ${Math.round(row.bar.left)} to ${Math.round(row.bar.right)} px)`);
        }
        check(row.bar.scroll <= 0.5, `the header's row scrolls ${row.bar.scroll} px inside itself`);
        const sideways = await sidewaysScroll(page);
        if (sideways > 0) check(false, `the page scrolls ${sideways} px sideways: ${await widest(page)}`);
        if (width >= 768) return;
        const brand = await page.evaluate(() => {
          const header = document.querySelector('header.app-header');
          const plain = header.querySelector('.app-header__brand--plain');
          const lines = [...plain.querySelectorAll('.wordmark__first, .wordmark__second')].map((line) => {
            const style = getComputedStyle(line);
            const words = line.textContent.trim();
            return { words: style.textTransform === 'uppercase' ? words.toUpperCase() : words, top: line.getBoundingClientRect().top };
          });
          const links = [...header.querySelectorAll('a, button')].filter((control) => {
            const box = control.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && getComputedStyle(control).visibility !== 'hidden';
          });
          return { mark: !!plain.querySelector('svg'), lines, controls: links.map((control) => control.getAttribute('aria-label') || control.textContent.trim()) };
        });
        check(row.items.length === 1 && row.items[0].kind === 'brand', `the top bar shows ${row.items.map((item) => item.name).join(', ')}, not the brand alone`);
        check(brand.mark, 'the top bar has no mark');
        check(brand.lines.map((line) => line.words).join(' / ') === 'SAFEOS / GUARDIAN' && brand.lines.length === 2 && brand.lines[1].top > brand.lines[0].top,
          `the wordmark reads ${brand.lines.map((line) => line.words).join(' / ')}`);
        check(brand.controls.length === 0, `the top bar holds the controls ${brand.controls.join(', ')}`);
        const before = page.url();
        await page.locator('header.app-header .app-header__brand--plain').click();
        await page.waitForTimeout(500);
        check(page.url() === before, `a press on the brand moved the page from ${before} to ${page.url()}`);
      });
    }
  }

  // The header's row from the tablet width: one row 64 px tall, the page
  // being read in the ink with a 2 px accent underline.
  for (const width of [820, 1280, 1440]) {
    for (const look of LOOKS) {
      await open({ name: 'header row', width, look }, async (page, context, check) => {
        await visit(page, '/history/');
        const row = await page.evaluate(readRow);
        if (!row) throw new Error('no app header');
        check(Math.abs(row.bar.height - 64) <= 0.5, `the bar is ${row.bar.height} px tall`);
        const names = row.items.map((item) => item.name);
        check(names.join(', ') === rowNames(look).join(', '), `the row holds ${names.join(', ')}`);
        check(Math.max(...row.items.map((item) => item.top)) < Math.min(...row.items.map((item) => item.bottom)), 'the row is more than one line');
        check(row.items.every((item, k) => k === 0 || item.left >= row.items[k - 1].right - 0.5), 'the row\'s items overlap or stand out of order');
        const seen = await page.evaluate(() => {
          const header = document.querySelector('header.app-header');
          const links = [...header.querySelectorAll('.app-header__links a')].map((a) => {
            const style = getComputedStyle(a);
            return {
              word: a.textContent.trim(), current: a.getAttribute('aria-current'), face: style.fontFamily, weight: style.fontWeight,
              size: style.fontSize, line: style.lineHeight, colour: style.color,
              underline: { line: style.textDecorationLine, thickness: style.textDecorationThickness, colour: style.textDecorationColor },
            };
          });
          const box = header.querySelector('.app-header__links').getBoundingClientRect();
          const wordmark = header.querySelector('.app-header__brand--link .wordmark');
          const mark = wordmark ? getComputedStyle(wordmark) : null;
          return {
            links, middle: (box.left + box.right) / 2, screen: document.documentElement.clientWidth / 2,
            wordmark: mark && { face: mark.fontFamily, size: mark.fontSize }, ground: getComputedStyle(header).backgroundColor,
          };
        });
        check(seen.ground === PAGE[look], `the bar's ground is ${seen.ground}, not ${PAGE[look]}`);
        for (const link of seen.links) {
          check(isInter(link.face) && link.weight === '400' && link.size === '16px' && link.line === '24px',
            `${link.word} is ${face(link.face)} ${link.weight} at ${link.size} on ${link.line} lines`);
          const colour = link.word === 'History' ? INK[look] : QUIET[look];
          check(link.colour === colour, `${link.word} is ${link.colour}, not ${colour}`);
        }
        const history = seen.links.find((link) => link.word === 'History');
        check(history?.current === 'page', 'History is not marked as the page being read');
        check(!!history && /underline/.test(history.underline.line) && history.underline.thickness === '2px' && history.underline.colour === ACCENT[look],
          `History's underline is ${history ? `${history.underline.line} ${history.underline.thickness} ${history.underline.colour}` : 'missing'}`);
        check(seen.links.filter((link) => link.current === 'page').length === 1, 'more than one link is marked as the page being read');
        if (width === 1440) check(Math.abs(seen.middle - seen.screen) <= 2, `the four links' middle is ${seen.middle.toFixed(1)} px, the screen's ${seen.screen.toFixed(1)} px`);
        const size = width >= 1440 ? '18px' : '16px';
        check(!!seen.wordmark && /Space_Grotesk|Space Grotesk/i.test(face(seen.wordmark.face)) && seen.wordmark.size === size,
          `the wordmark is ${seen.wordmark ? `${face(seen.wordmark.face)} at ${seen.wordmark.size}` : 'missing'}, not Space Grotesk at ${size}`);
      });
    }
  }

  // Each of the four links and the mark opens its page; the pointer over a
  // link draws a 1 px ink underline, and the page being read keeps its own.
  await open({ name: 'header row, presses and hover', width: 1280, look: 'light' }, async (page, context, check) => {
    await visit(page, '/settings/');
    for (const [word, route] of [['Dashboard', '/dashboard/'], ['History', '/history/'], ['Settings', '/settings/'], ['Help', '/help/']]) {
      try {
        await Promise.all([
          page.waitForURL((url) => url.pathname === route, { timeout: 15_000 }),
          page.locator('header.app-header .app-header__links').getByRole('link', { name: word, exact: true }).click(),
        ]);
      } catch (err) {
        check(false, `${word} did not open ${route}: ${err.message.split('\n')[0]}`);
      }
    }
  });
  await open({ name: 'header row, presses and hover', width: 1024, look: 'dark' }, async (page, context, check) => {
    await visit(page, '/help/');
    try {
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/dashboard/', { timeout: 15_000 }),
        page.locator('header.app-header a.app-header__brand--link').click(),
      ]);
    } catch (err) {
      check(false, `the mark did not open /dashboard/: ${err.message.split('\n')[0]}`);
    }
  });
  for (const look of LOOKS) {
    await open({ name: 'header row, presses and hover', width: 1280, look }, async (page, context, check) => {
      await visit(page, '/history/');
      await page.locator('header.app-header .app-header__links').getByRole('link', { name: 'Settings', exact: true }).hover();
      const seen = await page.evaluate(() => Object.fromEntries(['/settings', '/history'].map((section) => {
        const style = getComputedStyle(document.querySelector(`header.app-header .app-header__links a[data-section="${section}"]`));
        return [section, { colour: style.color, line: style.textDecorationLine, thickness: style.textDecorationThickness, underline: style.textDecorationColor }];
      })));
      const settings = seen['/settings'];
      const history = seen['/history'];
      check(settings.colour === INK[look] && /underline/.test(settings.line) && settings.thickness === '1px' && settings.underline === INK[look],
        `Settings under the pointer is ${settings.colour} with ${settings.line} ${settings.thickness} ${settings.underline}`);
      check(/underline/.test(history.line) && history.thickness === '2px' && history.underline === ACCENT[look],
        `History beside the pointer has ${history.line} ${history.thickness} ${history.underline}`);
    });
  }

  // What leaves the header: no bell, no Help key, no GitHub, no reading
  // pages, no ways.
  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'header, what it leaves out', width, look }, async (page, context, check) => {
        await visit(page, '/dashboard/');
        const controls = await page.evaluate(() => {
          const header = document.querySelector('header.app-header');
          if (!header) return null;
          return [...header.querySelectorAll('a, button, [role="button"], [role="link"]')].map((control) => ({
            button: control.matches('button, [role="button"]'),
            name: (control.getAttribute('aria-label') || control.textContent || '').replace(/\s+/g, ' ').trim(),
          }));
        });
        if (!controls) throw new Error('no app header');
        for (const control of controls) {
          check(!/Notifications|GitHub|About|FAQ|Blog|Monitor|Lost & Found|Security|Wildlife/i.test(control.name), `the header holds ${control.button ? 'a button' : 'a link'} named "${control.name}"`);
          check(!(control.button && /^(Help|\?)$/i.test(control.name)), `the header holds a button named "${control.name}"`);
        }
      });
    }
  }

  // The look switch: the whole page in one frame, a name that says what a
  // press does, a status, a choice that stays; with storage refused the look
  // changes for the visit and nothing throws.
  for (const look of LOOKS) {
    await open({ name: 'look switch', width: 1024, look }, async (page, context, check) => {
      await visit(page, '/history/');
      const key = page.locator('header.app-header button.look-switch');
      await key.waitFor({ timeout: 10_000 });
      const next = OTHER[look];
      check((await key.getAttribute('aria-label')) === `Switch to the ${next} look`, `the key is named "${await key.getAttribute('aria-label')}"`);
      const seen = await page.evaluate(() => new Promise((resolve) => {
        const ground = () => getComputedStyle(document.body).backgroundColor;
        const before = { classes: document.documentElement.className, ground: ground() };
        document.querySelector('header.app-header button.look-switch').click();
        requestAnimationFrame(() => resolve({ before, classes: document.documentElement.className, ground: ground() }));
      }));
      check(seen.before.ground === PAGE[look], `the page's ground before the press is ${seen.before.ground}, not ${PAGE[look]}`);
      check(seen.classes.split(/\s+/).includes(next) && !seen.classes.split(/\s+/).includes(look) && seen.ground === PAGE[next],
        `the frame after the press has the class "${seen.classes}" and the ground ${seen.ground}, not ${next} and ${PAGE[next]}`);
      check((await key.getAttribute('aria-label')) === `Switch to the ${look} look`, `after the press the key is named "${await key.getAttribute('aria-label')}"`);
      const status = await page.locator('header.app-header [role="status"]').textContent();
      const said = next === 'dark' ? 'Dark look on' : 'Light look on';
      check((status || '').trim() === said, `the status reads "${(status || '').trim()}", not "${said}"`);
      await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
      const kept = await page.evaluate(() => document.documentElement.className);
      check(kept.split(/\s+/).includes(next), `after a reload the page's class is "${kept}", not ${next}`);
    });
    await open({ name: 'look switch', width: 1024, look }, async (page, context, check) => {
      await visit(page, '/history/');
      const key = page.locator('header.app-header button.look-switch');
      await key.waitFor({ timeout: 10_000 });
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message.split('\n')[0]));
      await key.click();
      await page.waitForTimeout(500);
      const classes = await page.evaluate(() => document.documentElement.className);
      check(classes.split(/\s+/).includes(OTHER[look]), `with storage refused, a press left the page's class at "${classes}"`);
      check(errors.length === 0, `with storage refused, a press threw: ${errors.join('; ')}`);
    }, {
      script: () => {
        Storage.prototype.setItem = function setItem() {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        };
      },
    });
  }

  // Larger text at 820 px: the wordmark folds, More stands before the look
  // switch on the row's one line, and its panel holds what moved.
  for (const look of LOOKS) {
    await open({ name: 'header, larger text', width: 820, look }, async (page, context, check) => {
      await visit(page, '/history/');
      await largerText(page);
      const row = await page.evaluate(readRow);
      if (!row) throw new Error('no app header');
      check(!row.wordmark, 'the wordmark shows');
      const more = row.items.find((item) => item.kind === 'more');
      if (!more) throw new Error(`no More key in the row (${row.items.map((item) => item.name).join(', ')}, fold ${row.fold})`);
      const links = row.items.filter((item) => item.kind === 'link');
      const last = links[links.length - 1];
      const lookKey = row.items.find((item) => item.kind === 'switch');
      check(!!last && more.left >= last.right - 0.5, `More starts at ${Math.round(more.left)} px, before the last link's end at ${last ? Math.round(last.right) : '?'} px`);
      check(!!lookKey && lookKey.left >= more.right - 0.5 && lookKey.right >= Math.max(...row.items.map((item) => item.right)) - 0.5,
        'the look switch is not the row\'s right-most item after More');
      check(Math.max(...row.items.map((item) => item.top)) < Math.min(...row.items.map((item) => item.bottom)), 'the row is more than one line');
      for (const item of row.items) check(item.lines === 1, `${item.name}'s words break over ${item.lines} lines (fold ${row.fold})`);
      await page.locator('header.app-header button.app-header__more').click();
      const panel = page.locator('#app-more');
      await panel.waitFor({ state: 'visible', timeout: 5_000 });
      // The panel fades in. It is pictured once its own animation has ended,
      // so the picture holds the rows; a panel left short of drawn in full is
      // a finding.
      const drawn = await panel.evaluate(async (node) => {
        await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {})));
        return getComputedStyle(node).opacity;
      });
      check(drawn === '1', `More's open panel is drawn at opacity ${drawn}, not 1`);
      await page.screenshot({ path: path.join(outDir, `header-more-820-${look}.png`) });
      const rows = await page.evaluate(() => {
        const bar = document.querySelector('header.app-header .app-header__bar').getBoundingClientRect();
        return [...document.querySelectorAll('#app-more a')].map((a) => {
          const box = a.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return {
            word: a.textContent.trim(), height: box.height, top: box.top, bottom: box.bottom, left: box.left, right: box.right,
            onScreen: box.top >= -0.5 && box.left >= -0.5 && box.bottom <= window.innerHeight + 0.5 && box.right <= document.documentElement.clientWidth + 0.5,
            underBar: box.top >= bar.bottom - 0.5, reached: !!hit && a.contains(hit),
          };
        });
      });
      const words = rows.map((item) => item.word);
      check(words.includes('Help'), `More's panel holds ${words.join(', ') || 'nothing'}, not Help`);
      if (!links.some((item) => item.name === 'Settings')) check(words.includes('Settings'), 'Settings is neither in the row nor in More\'s panel');
      for (const item of rows) {
        check(item.height >= 47.5, `More's row ${item.word} is ${item.height} px tall`);
        check(item.onScreen, `More's row ${item.word} runs off the screen (${Math.round(item.left)}, ${Math.round(item.top)} to ${Math.round(item.right)}, ${Math.round(item.bottom)})`);
        check(item.underBar, `More's row ${item.word} starts at ${Math.round(item.top)} px, inside the bar`);
        check(item.reached, `the middle of More's row ${item.word} is covered`);
      }
      await page.keyboard.press('Escape');
      const afterEscape = await page.evaluate(() => ({
        hidden: document.getElementById('app-more').hidden,
        onMore: document.activeElement?.classList.contains('app-header__more') ?? false,
      }));
      check(afterEscape.hidden && afterEscape.onMore, `after Escape the panel is ${afterEscape.hidden ? 'closed' : 'open'} and focus is ${afterEscape.onMore ? 'on More' : 'elsewhere'}`);
      await page.locator('header.app-header button.app-header__more').click();
      await panel.waitFor({ state: 'visible', timeout: 5_000 });
      const spot = await page.evaluate(() => {
        const header = document.querySelector('header.app-header');
        const below = document.getElementById('app-more').getBoundingClientRect().bottom;
        const takesFocus = 'a[href], button, input, select, textarea, summary, label, iframe, video[controls], audio[controls], [tabindex]:not([tabindex="-1"]), [contenteditable]';
        for (let y = window.innerHeight - 12; y > below + 4; y -= 16) {
          for (const x of [12, window.innerWidth / 2, window.innerWidth - 12]) {
            const hit = document.elementFromPoint(x, y);
            if (hit && !header.contains(hit) && !hit.closest(takesFocus)) return { x, y };
          }
        }
        return null;
      });
      if (!spot) throw new Error('no place outside the header to press');
      await page.mouse.click(spot.x, spot.y);
      const closed = await page.waitForFunction(() => document.getElementById('app-more').hidden
        && document.activeElement?.classList.contains('app-header__more'), null, { timeout: 3_000 }).then(() => true, () => false);
      check(closed, 'a press outside More\'s panel did not close it with focus on More');
    });
  }

  // Larger text at every tablet width: a row that runs short folds or
  // scrolls inside itself, and no word in it, More's included, breaks.
  await open({ name: 'header, larger text, every tablet width', width: 768, look: 'dark' }, async (page, context, check) => {
    await visit(page, '/history/');
    await largerText(page);
    for (let width = 768; width < 1024; width += 8) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(300);
      const row = await page.evaluate(readRow);
      if (!row) throw new Error('no app header');
      for (const item of row.items.filter((one) => one.lines > 1)) {
        check(false, `at ${width} px ${item.name}'s words break over ${item.lines} lines (fold ${row.fold})`);
      }
    }
  });

  // Larger text on a phone: the bar keeps one row and scrolls inside itself.
  for (const look of LOOKS) {
    await open({ name: 'phone bar, larger text', width: 390, look }, async (page, context, check) => {
      await visit(page, '/dashboard/');
      await largerText(page);
      const seen = await page.evaluate(() => {
        const nav = document.querySelector('nav.phone-bar');
        if (!nav) return null;
        return {
          screen: document.documentElement.clientWidth,
          scrollWidth: nav.scrollWidth,
          clientWidth: nav.clientWidth,
          line: getComputedStyle(nav).boxShadow,
          edge: getComputedStyle(nav).maskImage,
          places: [...nav.querySelectorAll('a')].map((a) => {
            const box = a.getBoundingClientRect();
            const word = a.querySelector('.phone-bar__word') || a;
            return { word: word.textContent.trim(), top: box.top, left: box.left, right: box.right, cut: word.scrollWidth > word.clientWidth + 0.5 };
          }),
        };
      });
      if (!seen) throw new Error('no phone bar');
      const tops = seen.places.map((place) => place.top);
      check(Math.max(...tops) - Math.min(...tops) <= 0.5, `the places' tops are ${tops.map((top) => top.toFixed(1)).join(', ')} px`);
      for (const place of seen.places) check(!place.cut, `${place.word} is cut`);
      const width = Math.max(...seen.places.map((place) => place.right)) - Math.min(...seen.places.map((place) => place.left));
      if (width > seen.screen + 0.5) check(seen.scrollWidth > seen.clientWidth, `the places take ${Math.round(width)} px and the bar does not scroll inside itself`);
      // The bar's top line is drawn inside the bar, where the faded edge
      // does not cut it away; the edge is faded while places lie past it and
      // plain once the bar is scrolled to its end.
      check(/inset/.test(seen.line), `the bar's top line is drawn outside the bar (${seen.line}), where a faded edge cuts it away`);
      if (seen.scrollWidth > seen.clientWidth) {
        check(/gradient/.test(seen.edge), `places lie past the bar's right edge and the edge is not faded (${seen.edge})`);
        const atEnd = await page.evaluate(async () => {
          const nav = document.querySelector('nav.phone-bar');
          nav.scrollTo({ left: nav.scrollWidth, behavior: 'instant' });
          await new Promise((resolve) => setTimeout(resolve, 300));
          return getComputedStyle(nav).maskImage;
        });
        check(atEnd === 'none', `the bar scrolled to its end keeps a faded edge (${atEnd})`);
      }
      const sideways = await sidewaysScroll(page);
      if (sideways > 0) check(false, `the page scrolls ${sideways} px sideways: ${await widest(page)}`);
    });
  }

  // The order of focus: the skip link, the header row, the page, the footer
  // and, on a phone, the bar's places last; Enter on the skip link moves
  // focus into the page; a control reached backwards is not under the bar.
  const stop = () => {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      name: (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim(),
      ring: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
      inBar: !!element.closest('nav.phone-bar'),
      inMain: !!element.closest('#main-content'),
      onScreen: box.top >= -0.5 && box.left >= -0.5 && box.bottom <= window.innerHeight + 0.5 && box.right <= document.documentElement.clientWidth + 0.5,
      key: element.outerHTML.slice(0, 120),
    };
  };
  await open({ name: 'focus order', width: 1280, look: 'dark' }, async (page, context, check) => {
    await visit(page, '/dashboard/');
    const order = [];
    for (let i = 0; i < 7; i += 1) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(stop));
    }
    const names = order.map((item) => item?.name ?? 'nothing').join(' > ');
    const wanted = ['Skip to content', ...rowNames('dark')].join(' > ');
    check(names === wanted, `Tab from the top reaches ${names}`);
    for (const item of order.filter(Boolean)) check(item.ring === `solid 2px ${ACCENT.dark}`, `${item.name} is ringed ${item.ring}`);
  });
  await open({ name: 'focus order', width: 390, look: 'dark' }, async (page, context, check) => {
    await visit(page, '/dashboard/');
    const order = [];
    for (let i = 0; i < 250; i += 1) {
      await page.keyboard.press('Tab');
      const item = await page.evaluate(stop);
      if (!item || (order.length > 0 && item.key === order[0].key)) break;
      order.push(item);
    }
    check(order[0]?.name === 'Skip to content', `the first stop is ${order[0]?.name ?? 'nothing'}`);
    check(!!order[1]?.inMain, `the second stop, ${order[1]?.name ?? 'nothing'}, is not in the main content`);
    const last = order.slice(-3);
    check(last.length === 3 && last.every((item) => item.inBar) && last.map((item) => item.name).join(', ') === 'Dashboard, History, Settings',
      `the last three stops are ${last.map((item) => `${item.name}${item.inBar ? ' (bar)' : ''}`).join(', ')}`);
    for (const item of last.filter((one) => one.inBar)) {
      check(item.ring === `solid 2px ${ACCENT.dark}`, `the bar's ${item.name} is ringed ${item.ring}`);
      check(item.onScreen, `the bar's ${item.name} is not wholly on screen while focused`);
    }
  });
  for (const width of [390, 1280]) {
    await open({ name: 'focus order', width, look: 'dark' }, async (page, context, check) => {
      await visit(page, '/dashboard/');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      const inside = await page.evaluate(() => !!document.activeElement?.closest('#main-content'));
      check(inside, 'Enter on the skip link left focus outside the main content');
    });
    await open({ name: 'focus order', width, look: 'light' }, async (page, context, check) => {
      await visit(page, '/dashboard/');
      const ready = await page.evaluate(() => {
        const main = document.getElementById('main-content');
        const controls = [...main.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
          .filter((control) => {
            const box = control.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && getComputedStyle(control).visibility !== 'hidden';
          });
        if (controls.length < 2) return 'the main content has fewer than two controls';
        controls[0].setAttribute('data-first-stop', '');
        controls[1].focus({ preventScroll: true });
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
        return window.scrollY > 0 ? '' : 'the page does not scroll down';
      });
      if (ready) throw new Error(ready);
      await page.keyboard.press('Shift+Tab');
      await page.waitForTimeout(1_000);
      const seen = await page.evaluate(() => ({
        first: !!document.activeElement?.hasAttribute('data-first-stop'),
        name: (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        top: document.activeElement?.getBoundingClientRect().top ?? -1,
        foot: document.querySelector('header.app-header')?.getBoundingClientRect().bottom ?? 0,
      }));
      check(seen.first, `Shift+Tab reached "${seen.name}", not the page's first control`);
      check(seen.top >= seen.foot - 0.5, `"${seen.name}" stands at ${Math.round(seen.top)} px, under the header's foot at ${Math.round(seen.foot)} px`);
    });
  }

  // A focused place's ring is drawn whole. The bar scrolls inside itself,
  // so whatever is drawn outside the bar's own box is cut away.
  await open({ name: 'phone bar, focus ring', width: 390, look: 'dark' }, async (page, context, check) => {
    await visit(page, '/dashboard/');
    // From the bar's first place the keyboard reaches History, Settings,
    // History again and Dashboard.
    await page.locator('nav.phone-bar a').first().focus();
    for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      const seen = await page.evaluate(() => {
        const place = document.activeElement;
        const bar = place?.closest('nav.phone-bar');
        if (!bar) return null;
        const style = getComputedStyle(place);
        const reach = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
        const box = place.getBoundingClientRect();
        const edge = bar.getBoundingClientRect();
        return {
          name: (place.querySelector('.phone-bar__word') || place).textContent.trim(),
          ring: `${style.outlineStyle} ${style.outlineWidth}`,
          past: { top: edge.top - (box.top - reach), left: edge.left - (box.left - reach), right: box.right + reach - edge.right, foot: box.bottom + reach - edge.bottom },
        };
      });
      if (!seen) throw new Error(`${key} from a place of the phone bar left the bar`);
      check(seen.ring === 'solid 2px', `${seen.name} is ringed ${seen.ring}`);
      const cut = Object.entries(seen.past).filter(([, px]) => px > 0.5).map(([side, px]) => `${px.toFixed(1)} px past the bar's ${side}`);
      check(cut.length === 0, `the ring round ${seen.name} is cut: it is drawn ${cut.join(', ')}`);
    }
  });

  // A held press leaves a link's and a key's words at their full strength,
  // and More moves 1 px down at its own size.
  const held = async (page, control, read) => {
    const box = await control.boundingBox();
    if (!box) return null;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(400);
    const seen = await control.evaluate(read);
    // Released off the control, so nothing opens.
    await page.mouse.move(box.x + box.width / 2, box.y > 400 ? box.y - 300 : box.y + 300);
    await page.mouse.up();
    return seen;
  };
  const drawnAs = (element) => ({ opacity: getComputedStyle(element).opacity, transform: getComputedStyle(element).transform });
  for (const look of LOOKS) {
    await open({ name: 'pressed states', width: 390, look }, async (page, context, check) => {
      await visit(page, '/dashboard/');
      for (const word of ['Dashboard', 'History', 'Settings']) {
        const seen = await held(page, page.locator('nav.phone-bar').getByRole('link', { name: word, exact: true }), drawnAs);
        if (!seen) { check(false, `${word} has no box in the phone bar`); continue; }
        check(seen.opacity === '1', `${word} held down in the phone bar is drawn at opacity ${seen.opacity}, not 1`);
      }
    });
    await open({ name: 'pressed states', width: 820, look }, async (page, context, check) => {
      await visit(page, '/history/');
      await largerText(page);
      const more = await held(page, page.locator('header.app-header button.app-header__more'), drawnAs);
      if (!more) throw new Error('no More key in the row under larger text');
      check(more.opacity === '1', `More held down is drawn at opacity ${more.opacity}, not 1`);
      check(more.transform === 'matrix(1, 0, 0, 1, 0, 1)', `More held down is drawn with ${more.transform}, not 1 px lower at its own size`);
      const link = await held(page, page.locator('header.app-header .app-header__links').getByRole('link', { name: 'Dashboard', exact: true }), drawnAs);
      if (!link) throw new Error('Dashboard has no box in the header row');
      check(link.opacity === '1', `Dashboard held down in the header row is drawn at opacity ${link.opacity}, not 1`);
    });
  }

  // One site footer on every app page, outside the main content, with its
  // six groups, its last line and links that answer.
  const footerRuns = [
    ...['/dashboard/', '/history/', '/settings/', '/monitor/'].flatMap((route) => LOOKS.map((look) => ({ route, width: 1280, look, state: 'set-up' }))),
    { route: '/history/', width: 390, look: 'light', state: 'set-up' },
    { route: '/history/', width: 390, look: 'light', state: 'new' },
  ];
  for (const run of footerRuns) {
    await open({ name: 'footer on app pages', width: run.width, look: run.look }, async (page, context, check) => {
      await visit(page, run.route);
      const screen = run.route === '/dashboard/' ? await whichDashboard(page) : null;
      const seen = await page.evaluate(() => {
        const main = document.getElementById('main-content');
        const footers = [...document.querySelectorAll('footer')];
        const outside = footers.filter((footer) => !main || !main.contains(footer));
        const own = outside[0];
        const nav = own?.querySelector('nav[aria-label="Site links"]');
        return {
          inMain: footers.length - outside.length,
          outside: outside.length,
          wrapped: !!own?.closest('.app-shell__footer'),
          nav: !!nav,
          groups: nav ? [...nav.querySelectorAll('h2')].map((heading) => heading.textContent.trim()) : [],
          links: nav ? [...nav.querySelectorAll('a')].map((a) => ({ words: a.textContent.trim(), href: a.getAttribute('href') || '' })) : [],
          last: own?.querySelector('.site-footer__last')?.textContent ?? '',
        };
      });
      check(seen.outside === 1 && seen.wrapped, `${run.route} has ${seen.outside} footers outside the main content${seen.wrapped ? '' : ', none inside the app\'s footer wrapper'}`);
      if (screen === 'earlier') {
        // The earlier dashboard screen closes with its own footer until it leaves.
        check(seen.inMain <= 1, `${run.route} has ${seen.inMain} footers inside the main content`);
      } else {
        check(seen.inMain === 0, `${run.route}${screen ? ` (the ${screen} screen)` : ''} has ${seen.inMain} footers inside the main content`);
      }
      check(seen.nav, 'the footer has no navigation "Site links"');
      const groups = seen.groups.join(', ');
      check(groups === 'Use it, Uses, Learn, About, Legal, From Frame', `the footer's groups are ${groups}`);
      const words = seen.links.map((link) => link.words);
      check(words.includes('Privacy') && words.includes('Terms'), `the footer's links are ${words.join(', ')}`);
      check(/^© \d{4} Frame\. SafeOS code is MIT-licensed\.$/.test(plain(seen.last)), `the footer's last line reads "${plain(seen.last)}"`);
      const start = run.state === 'new' ? 'Start setup' : 'Open dashboard';
      const use = await page.waitForFunction((want) => {
        const link = document.querySelector('.app-shell__footer nav[aria-label="Site links"] a');
        return link && link.textContent.trim() === want ? want : false;
      }, start, { timeout: 10_000 }).then(() => start, () => page.evaluate(() => document.querySelector('.app-shell__footer nav[aria-label="Site links"] a')?.textContent.trim() ?? 'nothing'));
      check(use === start, `"Use it" reads "${use}", not "${start}"`);
      for (const link of seen.links.filter((one) => one.href.startsWith('/'))) {
        const status = await answers(context, link.href);
        check(status === 200, `${link.words} (${link.href}) answers ${status}`);
      }
      if (run.width === 390) {
        await toEnd(page);
        await page.waitForTimeout(500);
        const end = await page.evaluate(() => ({
          last: document.querySelector('.app-shell__footer .site-footer__last')?.getBoundingClientRect().bottom ?? Infinity,
          bar: document.querySelector('nav.phone-bar')?.getBoundingClientRect().top ?? 0,
        }));
        check(end.last <= end.bar + 0.5, `at the end of ${run.route} the footer's last line ends at ${Math.round(end.last)} px, under the phone bar from ${Math.round(end.bar)} px`);
      }
      // The six links to entries of the home page, pressed once.
      if (run.route !== '/history/' || run.width !== 1280 || run.look !== 'light') return;
      for (const link of seen.links.filter((one) => /^\/#./.test(one.href))) {
        const id = link.href.slice(2);
        await visit(page, run.route);
        try {
          await Promise.all([
            page.waitForURL((url) => url.pathname === '/' && url.hash === `#${id}`, { timeout: 15_000 }),
            page.locator(`.app-shell__footer nav[aria-label="Site links"] a[href="${link.href}"]`).click(),
          ]);
          const inView = await page.waitForFunction((target) => {
            const element = document.getElementById(target);
            if (!element) return false;
            const box = element.getBoundingClientRect();
            return box.bottom > 0 && box.top < window.innerHeight;
          }, id, { timeout: 10_000 }).then(() => true, () => false);
          const exists = await page.evaluate((target) => !!document.getElementById(target), id);
          check(exists, `the home page has no element with the id ${id} (${link.words})`);
          if (exists) check(inView, `a press on ${link.words} left #${id} out of view`);
        } catch (err) {
          check(false, `${link.words} (${link.href}) did not open the home page at #${id}: ${err.message.split('\n')[0]}`);
        }
      }
    }, { state: run.state });
  }

  // The reading pages keep the visitor header, with no app navigation and
  // no bar at the foot of the screen, whatever it is called: their only
  // navigations are the header's and the footer's.
  for (const route of ['/', '/about/', '/faq/', '/blog/', '/privacy/', '/terms/']) {
    for (const width of [390, 1280]) {
      for (const look of LOOKS) {
        await open({ name: 'visitor pages', width, look }, async (page, context, check) => {
          await visit(page, route);
          const count = await page.locator('nav[aria-label="Site"]').count();
          if (count !== 1) throw new Error(`${route} has ${count} navigations named "Site"`);
          await page.waitForFunction(() => document.querySelector('nav[aria-label="Site"] .site-header__start')?.textContent.trim() === 'Open dashboard', null, { timeout: 10_000 })
            .catch(() => undefined);
          const seen = await page.evaluate(() => {
            const nav = document.querySelector('nav[aria-label="Site"]');
            const shown = (node) => {
              const box = node.getBoundingClientRect();
              return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden';
            };
            return {
              links: [...nav.querySelectorAll('.site-header__links a')].map((a) => ({ words: a.textContent.trim(), shown: shown(a) })),
              menu: [...nav.querySelectorAll('button, a')].some((control) => shown(control) && (control.getAttribute('aria-label') || control.textContent.trim()) === 'Menu'),
              start: nav.querySelector('.site-header__start')?.textContent.trim() ?? '',
              app: document.querySelectorAll('nav[aria-label="App"]').length,
              bar: document.querySelectorAll('nav.phone-bar').length,
              words: nav.textContent,
              navigations: [...document.querySelectorAll('nav, [role="navigation"]')].map((one) => one.getAttribute('aria-label') || 'one with no name').sort(),
              // What the foot of the screen shows: a navigation fixed there,
              // under whatever class or name, is a bar this page does not carry.
              foot: (() => {
                const fixed = [];
                for (let node = document.elementFromPoint(document.documentElement.clientWidth / 2, window.innerHeight - 2); node; node = node.parentElement) {
                  if (getComputedStyle(node).position === 'fixed' && node.matches('nav, [role="navigation"]')) {
                    fixed.push(node.getAttribute('aria-label') || node.className || node.tagName.toLowerCase());
                  }
                }
                return fixed.join(', ');
              })(),
            };
          });
          const destinations = seen.links.map((link) => link.words).join(', ');
          check(destinations === 'How it works, Uses, Privacy, FAQ', `on ${route} the navigation "Site" holds ${destinations}`);
          if (width >= 1280) check(seen.links.every((link) => link.shown), `on ${route} not every destination shows in the row`);
          if (width < 768) check(seen.menu, `on ${route} no Menu key shows`);
          check(seen.start === 'Open dashboard', `on ${route} the start key reads "${seen.start}"`);
          check(seen.app === 0, `${route} has ${seen.app} navigations named "App"`);
          check(seen.bar === 0, `${route} has a phone bar`);
          check(seen.navigations.join(', ') === 'Site, Site links', `the navigations on ${route} are ${seen.navigations.join(', ')}, not Site and Site links alone`);
          check(!seen.foot, `a navigation is fixed at the foot of the screen on ${route}: ${seen.foot}`);
          check(!/\b(Monitor|Security)\b/.test(seen.words), `the header on ${route} names Monitor or Security`);
        });
      }
    }
  }

  // No floating card: a phone that reports iPhone Safari, with notifications
  // not granted, shows neither card after 10 seconds, and nothing covers the
  // phone bar.
  for (const look of LOOKS) {
    await open({ name: 'no floating card', width: 390, look, userAgent: IPHONE_SAFARI }, async (page, context, check) => {
      await visit(page, '/dashboard/');
      // A card that asks for notifications shows only where the browser has
      // not been asked yet; in any other state this walk could not find one.
      const asked = await page.evaluate(() => (typeof Notification === 'undefined' ? 'not known to this browser' : Notification.permission));
      check(asked === 'default', `notifications are ${asked} here, not waiting to be asked for, so a card that asks for them would not show`);
      await page.waitForTimeout(10_000);
      for (const words of ['Install SafeOS', 'Enable notifications']) {
        check((await page.getByText(words).count()) === 0, `"${words}" shows after 10 seconds`);
      }
      const hit = await page.evaluate(() => {
        const bar = document.querySelector('nav.phone-bar');
        if (!bar) return 'no phone bar';
        const box = bar.getBoundingClientRect();
        const element = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        if (element && bar.contains(element)) return '';
        return element ? `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className ? `.${element.className.trim().split(/\s+/).join('.')}` : ''}` : 'nothing';
      });
      check(!hit, `the middle of the phone bar shows ${hit}`);
    }, {
      permissions: ['camera', 'microphone'],
      // Headless Chromium says notifications are denied where they are not
      // granted; a person's browser that has not been asked says 'default'.
      script: () => {
        if (typeof Notification === 'undefined') return;
        Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'default' });
        Notification.requestPermission = () => Promise.resolve('default');
      },
    });
  }

  // The frame holds the screen's edges: while an app page scrolls, no part of
  // the page's own content stays at the top of the screen under the header,
  // or at its foot over the page's words and under the bar.
  for (const width of [390, 1280]) {
    for (const route of ['/settings/notifications/', '/monitor/', '/security/', '/wildlife/', '/admin/']) {
      await open({ name: 'page parts while the page scrolls', width, look: 'dark' }, async (page, context, check) => {
        await visit(page, route);
        const stuck = await page.evaluate(async () => {
          const main = document.getElementById('main-content');
          if (!main) return null;
          const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
          const named = (element) => `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className ? `.${element.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}`;
          // A part in the page's flow keeps its place on the page wherever
          // the page is scrolled to; a part that sticks moves with the screen.
          const parts = [...main.querySelectorAll('*')].filter((element) => getComputedStyle(element).position === 'sticky');
          const reach = document.documentElement.scrollHeight - window.innerHeight;
          const places = parts.map(() => []);
          for (const top of [0, Math.min(300, reach), Math.round(reach / 2)]) {
            window.scrollTo({ top, behavior: 'instant' });
            await frame();
            parts.forEach((part, i) => places[i].push(part.getBoundingClientRect().top + window.scrollY));
          }
          return parts
            .map((part, i) => ({ name: named(part), moved: Math.max(...places[i]) - Math.min(...places[i]) }))
            .filter((part) => part.moved > 0.5)
            .map((part) => `${part.name} moves ${Math.round(part.moved)} px with the screen`);
        });
        if (!stuck) throw new Error(`${route} has no main content`);
        for (const part of stuck) check(false, `on ${route}, as the page scrolls, ${part}`);
      });
    }
  }

  // Before setup the header is the same as after it.
  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'before setup', width, look }, async (page, context, check) => {
        await visit(page, '/history/');
        const row = await page.evaluate(readRow);
        if (!row) throw new Error('no app header');
        const names = row.items.map((item) => item.name).join(', ');
        if (width >= 768) {
          check(names === rowNames(look).join(', '), `the row holds ${names}`);
        } else {
          check(row.items.length === 1 && row.items[0].kind === 'brand', `the top bar shows ${names}, not the brand alone`);
        }
      }, { state: 'new' });
    }
  }

  // The frame's words at each layout width: sizes, faces, weights and
  // contrast from computed styles, then each quiet word from its own pixels.
  const FRAME_PARTS = ['header.app-header', 'nav.phone-bar', '.app-shell__footer'];
  for (const width of LAYOUT_WIDTHS) {
    for (const look of LOOKS) {
      await open({ name: 'frame, readable', width, look }, async (page, context, check) => {
        await visit(page, '/history/');
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: path.join(outDir, `frame-history-${width}-${look}.png`), fullPage: true });
        let measured = 0;
        for (const selector of FRAME_PARTS) {
          const part = await page.$(selector);
          if (!part) {
            if (selector !== 'nav.phone-bar') check(false, `the page has no ${selector}`);
            continue;
          }
          for (const text of await page.evaluate(measureText, part)) {
            measured += 1;
            const where = `"${text.words}" in ${selector}`;
            check(text.size >= 16, `${where} is ${text.size} px, under 16`);
            check(['400', '700'].includes(text.weight), `${where} has weight ${text.weight}`);
            check(!/mono/i.test(face(text.face)), `${where} is set in ${face(text.face)}`);
            check(text.contrast >= 7, `${where} has contrast ${text.contrast.toFixed(2)}, under 7`);
          }
        }
        check(measured > 20, `only ${measured} pieces of the frame's text were measured`);
        const marked = await page.evaluate((selectors) => {
          const out = [];
          for (const selector of selectors) {
            const part = document.querySelector(selector);
            if (!part) continue;
            const probe = document.createElement('span');
            probe.style.color = 'var(--color-steel-200)';
            part.appendChild(probe);
            const quiet = getComputedStyle(probe).color;
            probe.remove();
            const blocks = new Set();
            const walker = document.createTreeWalker(part, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              if (!walker.currentNode.textContent.trim()) continue;
              let element = walker.currentNode.parentElement;
              // Words inside a line (a name, a number) are measured with it.
              while (element && element !== part && getComputedStyle(element).display === 'inline') element = element.parentElement;
              if (element) blocks.add(element);
            }
            for (const element of blocks) {
              if (element.closest('script, style, [hidden], .sr-only, .skip-link')) continue;
              const box = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              if (box.width < 4 || box.height < 4 || style.visibility === 'hidden' || style.opacity === '0') continue;
              if (style.color !== quiet) continue;
              element.setAttribute('data-measure', String(out.length));
              out.push({ words: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), part: selector });
            }
          }
          return out;
        }, FRAME_PARTS);
        const scratch = await context.newPage();
        let covered = false;
        for (const [index, item] of marked.entries()) {
          if (item.part === '.app-shell__footer' && !covered) {
            // The fixed header and bar would cover footer words scrolled under them.
            await page.addStyleTag({ content: 'header.app-header, nav.phone-bar { visibility: hidden !important; }' });
            covered = true;
          }
          const picture = await page.locator(`[data-measure="${index}"]`).screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
          const read = await scratch.evaluate(readStrokes, picture.toString('base64'));
          if (!read) continue;
          check(read.strokes >= 7, `"${item.words}" in ${item.part} measures ${read.strokes.toFixed(2)}:1 on its strokes (core ${read.core.toFixed(2)}:1), under 7`);
        }
        await scratch.close();
        check(marked.length > 10, `only ${marked.length} quiet words of the frame were measured from the pixels`);
      });
    }
  }

  // An element shows only when it and every element round it are opaque:
  // the browser counts an element with opacity 0 as visible.
  const opacityOf = (page, selector) => page.evaluate((s) => {
    const element = document.querySelector(s);
    if (!element) return -1;
    let opacity = 1;
    for (let node = element; node; node = node.parentElement) opacity *= parseFloat(getComputedStyle(node).opacity);
    return opacity;
  }, selector);
  // The look's other values; the page, the ink, the quiet tone, the raised
  // ground and the accent are read from the frame's own above.
  const PANEL = { light: 'rgb(241, 243, 244)', dark: 'rgb(16, 26, 36)' };
  const LINE = { light: 'rgb(73, 80, 87)', dark: 'rgb(156, 163, 175)' };
  const ACCENT_HOVER = { light: 'rgb(5, 46, 22)', dark: 'rgb(134, 239, 172)' };
  const ALERT = { light: 'rgb(153, 27, 27)', dark: 'rgb(251, 146, 60)' };
  void PANEL; void LINE; void ACCENT_HOVER; void ALERT;

  // ---------------------------------------------------------------------------
  // The page before script runs
  // ---------------------------------------------------------------------------
  // The header, the phone bar and the footer are in the served HTML and in
  // the device's look, so an app page reads and its links work with scripts
  // off, while its script is on its way and when its script never arrives.

  const HEADER_ROW = ['Dashboard', 'History', 'Settings', 'Help'];
  const headerLink = (words) => `header.app-header .app-header__links a[data-section="/${words.toLowerCase()}"]`;

  for (const look of LOOKS) {
    await open({ name: 'app page, scripts off', width: 1280, look, javaScriptEnabled: false }, async (page, context, check) => {
      await visit(page, '/history/');
      for (const selector of ['header.app-header .app-header__brand--link', ...HEADER_ROW.map(headerLink)]) {
        const opacity = await opacityOf(page, selector);
        check(opacity === 1, `${selector} is drawn at opacity ${opacity}, not 1`);
      }
      const seen = await page.evaluate((link) => {
        const header = document.querySelector('header.app-header');
        const place = document.querySelector('header.app-header .look-switch-place');
        return {
          words: [...document.querySelectorAll('header.app-header .app-header__links a')].map((a) => a.textContent.trim()),
          ground: header ? getComputedStyle(header).backgroundColor : 'no header',
          colour: getComputedStyle(document.querySelector(link)).color,
          current: document.querySelector('header.app-header [aria-current="page"]')?.textContent.trim() || 'none',
          switches: document.querySelectorAll('.look-switch').length,
          place: place ? place.getBoundingClientRect().width : 0,
        };
      }, headerLink('Dashboard'));
      check(seen.words.join(', ') === HEADER_ROW.join(', '), `the header's links read ${seen.words.join(', ')}`);
      check(seen.ground === PAGE[look], `the header's background is ${seen.ground}, not ${PAGE[look]}`);
      check(seen.colour === QUIET[look], `Dashboard in the header is ${seen.colour}, not ${QUIET[look]}`);
      check(seen.current === 'History', `the page marked as being read is ${seen.current}, not History`);
      check(seen.switches === 0, `${seen.switches} look switches show before script`);
      check(seen.place === 44, `the look switch's place is ${seen.place} px wide, not 44`);
      const footer = await opacityOf(page, 'footer nav[aria-label="Site links"]');
      check(footer === 1, `the footer's "Site links" is drawn at opacity ${footer}, not 1`);
      await page.screenshot({ path: path.join(outDir, `frame-scripts-off-1280-${look}.png`), fullPage: true });
      await page.locator(headerLink('Settings')).click();
      await page.waitForLoadState('load');
      check(new URL(page.url()).pathname === '/settings/', `a press on Settings opened ${page.url()}`);
    });

    await open({ name: 'phone bar, scripts off', width: 390, look, javaScriptEnabled: false }, async (page, context, check) => {
      await visit(page, '/history/');
      const opacity = await opacityOf(page, 'nav.phone-bar');
      check(opacity === 1, `the phone bar is drawn at opacity ${opacity}, not 1`);
      const seen = await page.evaluate(() => {
        const bar = document.querySelector('nav.phone-bar');
        if (!bar) return null;
        return {
          foot: bar.getBoundingClientRect().bottom,
          screen: window.innerHeight,
          ground: getComputedStyle(bar).backgroundColor,
          words: [...bar.querySelectorAll('a')].map((a) => (a.querySelector('.phone-bar__word') || a).textContent.trim()),
          counts: bar.querySelectorAll('.new-count').length,
        };
      });
      if (!seen) throw new Error('/history/ has no phone bar');
      check(Math.abs(seen.foot - seen.screen) <= 0.5, `the bar's foot is at ${seen.foot} px, not at the screen's foot (${seen.screen} px)`);
      check(seen.ground === PAGE[look], `the bar's background is ${seen.ground}, not ${PAGE[look]}`);
      check(seen.words.join(', ') === 'Dashboard, History, Settings', `the bar's places read ${seen.words.join(', ')}`);
      check(seen.counts === 0, `the bar shows ${seen.counts} counts of new alerts before script`);
      await page.locator('nav.phone-bar a').filter({ hasText: 'Dashboard' }).click();
      await page.waitForLoadState('load');
      check(new URL(page.url()).pathname === '/dashboard/', `a press on Dashboard opened ${page.url()}`);
    });

    await open({ name: 'header, script held', width: 1280, look }, async (page, context, check) => {
      await context.route('**/_next/static/chunks/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        await route.continue().catch(() => {});
      });
      await page.goto(address('/history/'), { waitUntil: 'commit', timeout: 60_000 });
      // The stylesheet and the fonts have arrived; the script has not.
      await page.waitForFunction(() => {
        const header = document.querySelector('header.app-header');
        return !!header && getComputedStyle(header).position === 'fixed';
      }, null, { timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      const read = () => page.evaluate((selectors) => ({
        lefts: selectors.map((s) => document.querySelector(s)?.getBoundingClientRect().left ?? null),
        hrefs: selectors.map((s) => document.querySelector(s)?.getAttribute('href') || ''),
        history: document.querySelector('header.app-header .app-header__links a[data-section="/history"]')?.textContent.trim() || '',
        place: document.querySelector('header.app-header .look-switch-place')?.getBoundingClientRect().width ?? 0,
        switched: !!document.querySelector('header.app-header .look-switch'),
      }), HEADER_ROW.map(headerLink));
      const before = await read();
      check(!before.switched, 'the look switch showed before the held script arrived, so this walk read the page after its script');
      for (const selector of ['header.app-header .app-header__brand--link', ...HEADER_ROW.map(headerLink)]) {
        const opacity = await opacityOf(page, selector);
        check(opacity === 1, `while the script is held, ${selector} is drawn at opacity ${opacity}, not 1`);
      }
      HEADER_ROW.forEach((words, i) => check(before.hrefs[i] !== '', `while the script is held, ${words} has no address`));
      check(before.place === 44, `while the script is held, the look switch's place is ${before.place} px wide, not 44`);
      check(before.history === 'History', `while the script is held, History reads "${before.history}"`);
      await page.locator('header.app-header .look-switch').waitFor({ timeout: 30_000 });
      const after = await read();
      HEADER_ROW.forEach((words, i) => {
        const moved = before.lefts[i] === null || after.lefts[i] === null ? Infinity : Math.abs(after.lefts[i] - before.lefts[i]);
        check(moved <= 0.5, `${words} moved ${moved} px once the script arrived (${before.lefts[i]} to ${after.lefts[i]})`);
      });
    });
  }

  await open({ name: 'app page, script blocked', width: 390, look: 'light' }, async (page, context, check) => {
    await context.route('**/_next/static/chunks/**', (route) => route.abort());
    await page.goto(address('/history/'), { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(2_000);
    const parts = [
      ['the header\'s brand', 'header.app-header .app-header__brand--plain'],
      ['Dashboard in the phone bar', 'nav.phone-bar a[href^="/dashboard"]'],
      ['History in the phone bar', 'nav.phone-bar a[href^="/history"]'],
      ['Settings in the phone bar', 'nav.phone-bar a[href^="/settings"]'],
      ['the footer\'s "Site links"', 'footer nav[aria-label="Site links"]'],
    ];
    for (const [name, selector] of parts) {
      const opacity = await opacityOf(page, selector);
      check(opacity === 1, `with its script blocked, ${name} is drawn at opacity ${opacity}, not 1`);
    }
  });

  for (const problem of problems) console.error(`failed app check: ${problem}`);
  return problems.length;
}
