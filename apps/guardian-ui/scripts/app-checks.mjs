// Checks the app's pages on the built static site in a real browser.
//
// scripts/capture-pictures.mjs runs it for the pull request's own build, and
// scripts/setup-checks.mjs runs its walks of setup in a job of their own. Each
// block walks one part of the app as a person would: the header and the bar
// on a phone, the page before any script runs, the dashboard in each state,
// the old addresses and the page a device shows offline. Every finding is
// printed, and the count of findings is returned; any finding fails the run.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SETUP_DONE, measureText, plain, readStrokes } from './home-checks.mjs';
import { TONES, starsHanded } from './public-chrome-checks.mjs';

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

  // APP_CHECKS_PART=setup runs setup's walks alone, in a job of their own;
  // APP_CHECKS_PART=rest runs every other walk; unset, every walk runs.
  const PART = process.env.APP_CHECKS_PART || 'all';
  const partRuns = (name) => PART === 'all' || (PART === 'setup') === /^setup\b/.test(name);

  // One walk, timed: `start` makes its context and its page, `run` walks
  // them. Anything that throws, the context's own setup included, is a
  // finding of this walk; whatever was made is closed, and the next walk runs.
  const walk = async ({ name, width, look }, start, run, check) => {
    if (!partRuns(name)) return;
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
      if (made.folder) await rm(made.folder, { recursive: true, force: true }).catch((err) => fail(`${name} at ${width} px, ${look}: its profile folder was not removed: ${err.message.split('\n')[0]}`));
    }
  };

  // A headless browser reads Notification.permission as denied whatever its
  // window allows, so a walk whose window allows notifications tells the
  // page so. A walk that answers otherwise adds its own answer after this.
  const NOTIFICATIONS_ALLOWED = () => {
    try {
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
    } catch (e) { /* this browser has no notifications */ }
  };

  // One walk in a context of its own. `state` seeds the device before the
  // first page loads: 'set-up' (a finished setup), 'new' (nothing saved).
  // The walk is given the page, its context and check(ok, what), which
  // records what was seen under the walk's name, width and look.
  const open = async (options, run, { state = 'set-up', script = null, permissions = ['camera', 'microphone', 'notifications'], windowStorage = 'kept' } = {}) => {
    const { name, width, height = heightOf(width), look = 'light', ...rest } = options;
    const check = (ok, what) => expect(ok, `${name} at ${width} px, ${look}: ${what}`);
    await walk({ name, width, look }, async (made) => {
      made.context = await browser.newContext({
        viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768, colorScheme: look, ...rest,
      });
      // A grant of no names would leave the camera blocked: a new device's walk grants nothing.
      if (permissions.length > 0) await made.context.grantPermissions(permissions, { origin: new URL(baseUrl).origin });
      if (permissions.includes('notifications')) await made.context.addInitScript(NOTIFICATIONS_ALLOWED);
      if (state === 'set-up') await made.context.addInitScript(SETUP_DONE);
      // A context made here keeps nothing on disk, as a private window. Walks
      // say so only when they mean to: the others tell the app this window's
      // storage is kept.
      if (windowStorage === 'kept') await made.context.addInitScript(() => { try { sessionStorage.setItem('safeos-window-storage', 'kept'); } catch (e) { /* storage refused */ } });
      if (script) await made.context.addInitScript(script);
      const page = await made.context.newPage();
      // A setup walk that meets the wrong screen says so in seconds, not in half a minute a press.
      if (/^setup\b/.test(name)) page.setDefaultTimeout(15_000);
      return page;
    }, run, check);
  };

  // A walk in a browser profile kept on disk, as a person's own window is,
  // launched by the browser's own type. A context made with newContext keeps
  // nothing after it closes.
  const openKept = async (options, run) => {
    const { name, width, height = heightOf(width), look = 'light' } = options;
    const check = (ok, what) => expect(ok, `${name} at ${width} px, ${look}: ${what}`);
    await walk({ name, width, look }, async (made) => {
      made.folder = await mkdtemp(path.join(os.tmpdir(), 'safeos-profile-'));
      made.context = await browser.browserType().launchPersistentContext(made.folder, {
        viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768, colorScheme: look,
        permissions: ['camera', 'microphone', 'notifications'],
      });
      await made.context.addInitScript(NOTIFICATIONS_ALLOWED);
      return made.context.pages()[0] || made.context.newPage();
    }, run, check);
  };

  const visit = (page, route) => page.goto(address(route), { waitUntil: 'networkidle', timeout: 60_000 });
  const sidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // The checks of each part are added below this line.

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
  const stars = starsHanded();
  const githubName = stars ? `SafeOS on GitHub, ${stars.exact}` : 'SafeOS on GitHub';
  const rowNames = (look) => ['SafeOS Guardian, dashboard', ...DESTINATION_WORDS, githubName, `Switch to the ${OTHER[look]} look`];
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

  const pressRowArrows = async (page, selector, check) => {
    const row = page.locator(selector);
    const left = row.getByRole('button', { name: 'Scroll left', exact: true });
    const right = row.getByRole('button', { name: 'Scroll right', exact: true });
    const arrows = await left.isVisible() && await right.isVisible();
    check(arrows, `${selector} has no pair of named scroll buttons`);
    if (!arrows) return;
    const scroller = row.locator('.key-row__keys');
    const read = () => scroller.evaluate((el) => ({
      left: el.scrollLeft,
      width: el.clientWidth,
      end: el.scrollWidth - el.clientWidth,
    }));
    const start = await read();
    check(start.end > 1, `${selector} has arrows but no scroll range`);
    check(await left.isDisabled() && await right.isEnabled(), `${selector} has the wrong arrows available at its start`);
    if (start.end <= 1 || !(await right.isEnabled())) return;

    const node = await scroller.elementHandle();
    const toEdge = async (button, direction) => {
      for (let i = 0; i < 12; i += 1) {
        const current = await read();
        const edge = direction === 1 ? current.end : 0;
        if (Math.abs(current.left - edge) <= 1) return true;
        const step = direction * Math.max(current.width * 0.8, 44);
        const target = Math.max(0, Math.min(current.end, current.left + step));
        await button.click({ timeout: 4_000 });
        // The scroll and the arrow's state must settle before another press.
        const moved = await page.waitForFunction(({ el, x }) => Math.abs(el.scrollLeft - x) <= 1,
          { el: node, x: target }, { timeout: 2_000 }).then(() => true, () => false);
        if (!moved) return false;
      }
      return false;
    };
    const reachedEnd = await toEdge(right, 1);
    check(reachedEnd, `${selector} did not reach its end with Scroll right`);
    if (!reachedEnd) return;
    await page.waitForFunction((button) => button.getAttribute('aria-disabled') === 'true',
      await right.elementHandle(), { timeout: 2_000 });
    check(await left.isEnabled(), `${selector} leaves Scroll left inactive at its end`);
    const reachedStart = await toEdge(left, -1);
    check(reachedStart, `${selector} did not reach its start with Scroll left`);
    if (!reachedStart) return;
    await page.waitForFunction((button) => button.getAttribute('aria-disabled') === 'true',
      await left.elementHandle(), { timeout: 2_000 });
    check(await right.isEnabled(), `${selector} leaves Scroll right inactive at its start`);
  };

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
    // The lines a control's words take: one, unless a word broke. Read from
    // the words' own boxes: a box the control holds (History's count) stands
    // on the words' line with a top of its own. A box that starts below the
    // bottom of the line before it starts a line.
    const linesOf = (node) => {
      const range = document.createRange();
      const boxes = [];
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        range.selectNodeContents(text);
        boxes.push(...[...range.getClientRects()].filter((rect) => rect.width > 0));
      }
      boxes.sort((a, b) => a.top - b.top);
      let lines = 0;
      let bottom = -Infinity;
      for (const box of boxes) {
        if (box.top >= bottom - 0.5) lines += 1;
        bottom = Math.max(bottom, box.bottom);
      }
      return lines;
    };
    const barBox = bar.getBoundingClientRect();
    const wordmark = header.querySelector('.app-header__brand--link .wordmark');
    return {
      fold: header.getAttribute('data-fold'),
      wordmark: shown(wordmark),
      bar: { top: barBox.top, bottom: barBox.bottom, left: barBox.left, right: barBox.right, height: barBox.height, scroll: bar.scrollWidth - bar.clientWidth },
      items: [...bar.querySelectorAll('a.app-header__brand--link, span.app-header__brand--plain, a.app-header__link, a.app-header__github, button.app-header__more, button.look-switch, .look-switch-place')]
        .filter(shown)
        .map((node) => {
          const box = node.getBoundingClientRect();
          const kind = node.matches('.app-header__link') ? 'link' : node.matches('.app-header__more') ? 'more'
            : node.matches('.look-switch, .look-switch-place') ? 'switch' : node.matches('.app-header__github') ? 'github' : 'brand';
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

  // The phone's top bar holds the plain brand and GitHub. From 768 px the
  // destinations join them on the same line.
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
        check(row.items.map((item) => item.kind).join(',') === 'brand,github', `the top bar shows ${row.items.map((item) => item.name).join(', ')}`);
        check(brand.mark, 'the top bar has no mark');
        check(brand.lines.map((line) => line.words).join(' / ') === 'SAFEOS / GUARDIAN' && brand.lines.length === 2 && brand.lines[1].top > brand.lines[0].top,
          `the wordmark reads ${brand.lines.map((line) => line.words).join(' / ')}`);
        check(brand.controls.length === 1 && brand.controls[0] === githubName, `the top bar holds the controls ${brand.controls.join(', ')}`);
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

  // The header excludes the shortcuts, reading pages and ways to watch.
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
          check(!/Notifications|About|FAQ|Blog|Monitor|Lost & Found|Security|Wildlife/i.test(control.name), `the header holds ${control.button ? 'a button' : 'a link'} named "${control.name}"`);
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
      const github = row.items.find((item) => item.kind === 'github');
      check(!!last && !!github && github.left >= last.right - 0.5 && more.left >= github.right - 0.5,
        'GitHub must sit between the destinations and More');
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
          scrollWidth: nav.querySelector('.key-row__keys').scrollWidth,
          clientWidth: nav.querySelector('.key-row__keys').clientWidth,
          line: getComputedStyle(nav).boxShadow,
          edge: getComputedStyle(nav.querySelector('.key-row__keys')).maskImage,
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
      check(/inset/.test(seen.line), `the bar's top line is drawn outside the bar (${seen.line})`);
      if (seen.scrollWidth > seen.clientWidth) {
        check(/gradient/.test(seen.edge), `places lie past the bar's right edge and the edge is not faded (${seen.edge})`);
        await pressRowArrows(page, 'nav.phone-bar', check);
      }
      const sideways = await sidewaysScroll(page);
      if (sideways > 0) check(false, `the page scrolls ${sideways} px sideways: ${await widest(page)}`);
    });
  }

  for (const [route, selector] of [
    ['/wildlife/', '.way-head__keys'],
    ['/dashboard/', 'nav.phone-bar'],
    ['/404.html', 'main .key-row'],
  ]) {
    await open({ name: `sideways keys on ${route}`, width: 320, look: 'light', reducedMotion: 'reduce' }, async (page, context, check) => {
      await visit(page, route);
      await largerText(page);
      await pressRowArrows(page, selector, check);
      const outside = await sidewaysScroll(page);
      if (outside > 0) check(false, `${route} scrolls ${outside} px outside the row: ${await widest(page)}`);
    });
  }

  await open({ name: 'header keeps focus on a narrower window', width: 1280, look: 'dark' }, async (page, context, check) => {
    await visit(page, '/history/');
    await largerText(page);
    await page.setViewportSize({ width: 1920, height: 800 });
    const header = page.locator('header.app-header');
    const help = header.locator('.app-header__links').getByRole('link', { name: 'Help', exact: true });
    await help.focus();
    check(await help.evaluate((link) => link === document.activeElement), 'Help did not start with focus');
    await page.setViewportSize({ width: 820, height: 800 });
    const more = header.getByRole('button', { name: 'More', exact: true });
    await more.waitFor({ timeout: 5_000 });
    check(await more.evaluate((key) => key === document.activeElement), 'focus did not move to More when Help folded into it');
  });

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
    for (let i = 0; i <= rowNames('dark').length; i += 1) {
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
    check(order[1]?.name === githubName && order[1]?.ring === `solid 2px ${ACCENT.dark}`,
      `the second stop is ${order[1]?.name ?? 'nothing'} with ring ${order[1]?.ring ?? 'none'}`);
    check(!!order[2]?.inMain, `the third stop, ${order[2]?.name ?? 'nothing'}, is outside the main content`);
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
      // The last line ends with the star count's sentence when the build was handed a count.
      const handed = starsHanded();
      const lastLine = new RegExp(`^© \\d{4} Frame\\. SafeOS code is MIT-licensed\\.${handed ? ` ${handed.sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` : ''}$`);
      check(lastLine.test(plain(seen.last)), `the footer's last line reads "${plain(seen.last)}"`);
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
          check(destinations === 'How it works, Uses, Guides, FAQ, Privacy', `on ${route} the navigation "Site" holds ${destinations}`);
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

  // The page's own parts that are fixed to the screen with the frame drawn
  // over their middle: the header covers a part fixed at the top, the bar one
  // fixed at the foot, and a press there reaches the frame, not the part.
  const underFrame = () => {
    const main = document.getElementById('main-content');
    if (!main) return [];
    const named = (element) => `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className ? `.${element.className.trim().split(/\s+/).slice(0, 4).join('.')}` : ''}`;
    const covered = [];
    for (const part of main.querySelectorAll('*')) {
      const style = getComputedStyle(part);
      if (style.position !== 'fixed' || style.visibility === 'hidden') continue;
      const box = part.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      if (box.width === 0 || box.height === 0 || x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
      const frame = document.elementFromPoint(x, y)?.closest('header.app-header, nav.phone-bar');
      if (frame) covered.push(`${named(part)} is fixed to the screen under ${frame.matches('nav') ? 'the phone bar' : 'the app header'}`);
    }
    return covered;
  };

  // The frame holds the screen's edges: while an app page scrolls, no part of
  // the page's own content stays at the top of the screen under the header,
  // or at its foot over the page's words and under the bar, and no part the
  // page fixes to the screen lies under either.
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
        for (const part of await page.evaluate(underFrame)) check(false, `on ${route}, ${part}`);
      });
    }
  }

  // A panel or a picture opened over a page covers the whole screen, the frame
  // included: its close key stands on the screen, a press there reaches the
  // key and a press on its last control reaches that control, and neither
  // reaches the header or the bar.
  const overlayPresses = (overlay) => {
    const landsOn = (control, within) => {
      const box = control.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      const frame = hit?.closest('header.app-header, nav.phone-bar');
      if (frame) return frame.matches('nav') ? 'the phone bar' : 'the app header';
      if (!hit) return 'nothing';
      return within.contains(hit) ? null : hit.tagName.toLowerCase();
    };
    const controls = [...overlay.querySelectorAll('button, input, select, textarea, a[href]')].filter((control) => {
      const box = control.getBoundingClientRect();
      return box.width > 1 && box.height > 1;
    });
    const key = controls[0].getBoundingClientRect();
    const screen = document.documentElement.clientWidth;
    const offScreen = key.left < -0.5 || key.right > screen + 0.5
      ? `runs from ${Math.round(key.left)} to ${Math.round(key.right)} px on a ${screen} px screen`
      : null;
    const close = landsOn(controls[0], controls[0]);
    const last = controls[controls.length - 1];
    last.scrollIntoView({ block: 'end' });
    return { close, offScreen, last: landsOn(last, last) };
  };
  const checkOverlay = async (overlay, check, what) => {
    await overlay.waitFor({ timeout: 10_000 });
    const lands = await overlay.evaluate(overlayPresses);
    check(!lands.offScreen, `on ${what}, the close key ${lands.offScreen}`);
    check(!lands.close, `on ${what}, a press on the close key lands on ${lands.close}`);
    check(!lands.last, `on ${what}, a press on the last control lands on ${lands.last}`);
    // The browser's own account of the press says why it did not close.
    const stuck = await overlay.locator('button').first().click({ timeout: 5_000 })
      .then(() => overlay.waitFor({ state: 'detached', timeout: 5_000 }))
      .then(() => null, (err) => err.message.split('\n').map((line) => line.trim()).filter(Boolean).slice(-8).join(' / '));
    check(!stuck, `on ${what}, pressing the close key leaves it open: ${stuck}`);
  };

  // What a page fixes to the screen is laid out to the page's width, so a page
  // wider than the phone puts a panel's close key past the screen's edge. The
  // keys of a way's page keep one line, and so do each key's words. Wider than
  // their place, they scroll inside it with the right edge faded until the end
  // is reached. Motion and sound's modes menu opens on the screen and whole:
  // neither the row's scroll nor its faded edge cuts it.
  // A part inside a box that scrolls or clips sideways cannot widen the page,
  // so only the parts outside such a box are named.
  const pushesPast = (page) => page.evaluate(() => {
    const edge = document.documentElement.clientWidth;
    const content = document.querySelector('.app-content');
    const clipped = (part) => {
      for (let up = part.parentElement; up && up !== content; up = up.parentElement) {
        if (getComputedStyle(up).overflowX !== 'visible') return true;
      }
      return false;
    };
    let right = edge + 0.5;
    let found = null;
    for (const part of document.querySelectorAll('.app-content *')) {
      const box = part.getBoundingClientRect();
      if (box.width > 0 && box.right > right && getComputedStyle(part).position !== 'fixed' && !clipped(part)) {
        right = box.right;
        found = `${part.tagName.toLowerCase()} "${(part.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30)}"`;
      }
    }
    return found ? `${found} ends at ${Math.round(right)} px` : 'nothing in the page\'s content is past the edge';
  });
  // The words of each key in the page's own header that take more than one
  // line: the tops of a key's words differ by more than half a line.
  const brokenKeys = () => {
    const head = document.querySelector('.app-content header');
    if (!head) return [];
    return [...head.querySelectorAll('button, a')].filter((key) => {
      const boxes = [];
      const texts = document.createTreeWalker(key, NodeFilter.SHOW_TEXT);
      for (let text = texts.nextNode(); text; text = texts.nextNode()) {
        if (!text.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        boxes.push(...[...range.getClientRects()].filter((box) => box.width > 0));
      }
      if (boxes.length < 2) return false;
      const tops = boxes.map((box) => box.top);
      const line = Math.min(...boxes.map((box) => box.height));
      return Math.max(...tops) - Math.min(...tops) > line / 2;
    }).map((key) => (key.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30));
  };
  const readKeyRow = () => {
    const row = document.querySelector('.way-head__keys');
    if (!row) return null;
    const keys = row.querySelector('.key-row__keys');
    const box = row.getBoundingClientRect();
    const middle = box.top + box.height / 2;
    return {
      scrolls: row.classList.contains('key-row'),
      past: keys.scrollWidth - keys.clientWidth,
      marked: row.hasAttribute('data-more'),
      mask: getComputedStyle(keys).maskImage,
      offLine: [...keys.children].filter((key) => {
        const place = key.getBoundingClientRect();
        return Math.abs(place.top + place.height / 2 - middle) > 1;
      }).map((key) => (key.textContent || '').trim().slice(0, 30)),
    };
  };
  // 1024 px is the narrowest width where a way's name and its keys share a row.
  for (const width of [...ROW_WIDTHS, 1024]) {
    for (const route of ['/lost-found/', '/security/', '/wildlife/']) {
      await open({ name: 'a way page, its width', width, look: 'dark' }, async (page, context, check) => {
        await visit(page, route);
        const sideways = await sidewaysScroll(page);
        if (sideways > 0) check(false, `${route} scrolls ${sideways} px sideways: ${await pushesPast(page)}`);
        if (route === '/lost-found/') return;
        const broken = await page.evaluate(brokenKeys);
        check(broken.length === 0, `on ${route} the words of ${broken.map((words) => `"${words}"`).join(', ')} break over two lines`);
        const row = await page.evaluate(readKeyRow);
        if (!row) throw new Error(`${route} has no row of keys`);
        check(row.offLine.length === 0, `on ${route} the keys ${row.offLine.join(', ')} leave the row's line`);
        check(row.scrolls, `on ${route} the keys' row does not scroll inside itself`);
        if (route === '/wildlife/' && width === 320) check(row.past > 1, 'the keys fit at 320 px, so their scroll goes unread');
        if (row.past > 1) {
          check(row.marked && row.mask !== 'none', `on ${route} the keys run ${row.past} px past their row with no faded edge`);
          await pressRowArrows(page, '.way-head__keys', check);
        } else {
          check(!row.marked, `on ${route} the keys fit and their row is marked as running over`);
        }
        // The browser's own account of the press says why it did not open.
        const missed = await page.getByRole('button', { name: 'Settings', exact: true }).click({ timeout: 5_000 })
          .then(() => page.locator('.fixed.inset-0', { has: page.locator('h2') }).waitFor({ timeout: 5_000 }))
          .then(() => null, (err) => {
            const lines = err.message.split('\n').map((line) => line.trim()).filter(Boolean);
            return (lines.length > 9 ? [lines[0], ...lines.slice(-8)] : lines).join(' / ');
          });
        check(!missed, `on ${route} a press on Settings does not open its panel: ${missed}`);
      });
    }
  }

  // The watch's bar: the heading "Watch for" and Mute alerts share one row at
  // every phone and tablet width in both looks, and the page never scrolls
  // sideways. At 200 per cent text the row keeps its one line and scrolls
  // inside itself with its arrow keys.
  // Each Watch for option is 48 px tall with its words on one line from
  // 390 px up; only larger text breaks them.
  const optionsRead = (page) => page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.querySelectorAll('.watch-for__option')].map((option) => {
      const words = option.querySelector('span');
      return {
        name: words?.textContent.trim() ?? '',
        height: option.getBoundingClientRect().height,
        oneLine: words ? words.getBoundingClientRect().height <= parseFloat(getComputedStyle(words).lineHeight) * 1.5 : false,
      };
    });
  });
  const barRow = (page) => page.evaluate(() => {
    const heading = [...document.querySelectorAll('h2')].find((h) => h.textContent.trim() === 'Watch for');
    const mute = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Mute alerts');
    if (!heading || !mute) return null;
    const middle = (part) => { const box = part.getBoundingClientRect(); return box.top + box.height / 2; };
    const row = heading.closest('.watch-bar');
    return {
      apart: Math.abs(middle(heading) - middle(mute)),
      sameRow: !!row && row === mute.closest('.watch-bar'),
      more: row?.getAttribute('data-more') ?? null,
      arrows: row ? [...row.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')).filter(Boolean) : [],
    };
  });
  for (const look of LOOKS) {
    for (const width of ROW_WIDTHS) {
      await open({ name: "watch, the bar's row", width, look }, async (page, context, check) => {
        await visit(page, '/monitor/');
        const bar = await barRow(page);
        check(bar, `at ${width} px /monitor/ has no heading "Watch for" or no key "Mute alerts"`);
        if (!bar) return;
        check(bar.sameRow, `at ${width} px "Watch for" and Mute alerts are not in one row`);
        check(bar.apart <= 1, `at ${width} px the middles of "Watch for" and Mute alerts lie ${bar.apart.toFixed(1)} px apart`);
        const sideways = await sidewaysScroll(page);
        check(sideways === 0, `at ${width} px /monitor/ scrolls ${sideways} px sideways: ${await pushesPast(page)}`);
        if (width >= 390) {
          const options = await optionsRead(page);
          check(options.length === 2, `at ${width} px Watch for shows ${options.length} options, not 2`);
          for (const option of options) {
            check(option.oneLine, `at ${width} px the option ${option.name} breaks its words onto two lines`);
            check(option.height <= 48.5, `at ${width} px the option ${option.name} is ${option.height.toFixed(1)} px tall, over 48`);
          }
        }
      });
    }
    await open({ name: "watch, the bar's row with larger text", width: 390, look }, async (page, context, check) => {
      await visit(page, '/monitor/');
      await largerText(page);
      const bar = await barRow(page);
      check(bar, 'at 200 per cent text /monitor/ has no heading "Watch for" or no key "Mute alerts"');
      if (!bar) return;
      check(bar.sameRow && bar.apart <= 1, `at 200 per cent text "Watch for" and Mute alerts leave one row (${bar.apart.toFixed(1)} px apart)`);
      check(bar.more !== null, 'at 200 per cent text the bar\'s row is not marked as holding more');
      check(bar.arrows.includes('Scroll right'), `at 200 per cent text the bar's row has no key "Scroll right" (${bar.arrows.join(', ') || 'none'})`);
      if (!bar.arrows.includes('Scroll right')) return;
      // The key moves the row's keys, and the page itself does not scroll sideways.
      await page.locator('.watch-bar').getByRole('button', { name: 'Scroll right', exact: true }).click();
      const moved = await page.waitForFunction(
        () => (document.querySelector('.watch-bar .key-row__keys')?.scrollLeft ?? 0) > 0, null, { timeout: 3_000 },
      ).then(() => true, () => false);
      check(moved, 'at 200 per cent text Scroll right does not move the bar\'s row');
      const sideways = await sidewaysScroll(page);
      check(sideways === 0, `at 200 per cent text /monitor/ scrolls ${sideways} px sideways after Scroll right`);
    });
  }

  // These walks are about what the opened part covers, so the key that opens
  // it is pressed wherever the page has put it.
  for (const width of [390, 1280]) {
    for (const route of ['/security/', '/wildlife/']) {
      await open({ name: 'a way page, its Settings panel', width, look: 'dark' }, async (page, context, check) => {
        await visit(page, route);
        await page.getByRole('button', { name: 'Settings', exact: true }).dispatchEvent('click');
        await checkOverlay(page.locator('.fixed.inset-0', { has: page.locator('h2') }), check, `${route} Settings panel`);
      });
    }
    await open({ name: 'a saved match, opened large', width, look: 'dark' }, async (page, context, check) => {
      await visit(page, '/lost-found/gallery/');
      await page.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('safeos-guardian');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const saving = database.transaction('match_frame', 'readwrite');
          saving.objectStore('match_frame').put({
            id: 'saved-match', subjectId: 'saved-pet', frameData: '', thumbnailData: '', confidence: 80, timestamp: Date.now(),
            details: { colorMatch: 80, dominantMatch: 80, edgeMatch: 80, sizeMatch: 80 },
            region: null, acknowledged: false, notes: '', exported: false,
          });
          saving.onerror = () => reject(saving.error);
          saving.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      }));
      await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
      await page.getByRole('button', { name: 'Open this picture', exact: true }).dispatchEvent('click');
      await checkOverlay(page.locator('.fixed.inset-0', { hasText: 'No image available' }), check, 'the match opened large');
    });
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
          check(row.items.map((item) => item.kind).join(',') === 'brand,github', `the top bar shows ${names}`);
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
        let inked = 0;
        for (const [index, item] of marked.entries()) {
          if (item.part === '.app-shell__footer' && !covered) {
            // The fixed header and bar would cover footer words scrolled under them.
            await page.addStyleTag({ content: 'header.app-header, nav.phone-bar { visibility: hidden !important; }' });
            covered = true;
          }
          const picture = await page.locator(`[data-measure="${index}"]`).screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
          const read = await scratch.evaluate(readStrokes, picture.toString('base64'));
          if (!read) continue;
          inked += 1;
          check(read.strokes >= 7, `"${item.words}" in ${item.part} measures ${read.strokes.toFixed(2)}:1 on its strokes (core ${read.core.toFixed(2)}:1), under 7`);
        }
        await scratch.close();
        check(inked > 10, `only ${inked} of ${marked.length} quiet words of the frame were measured from the pixels; ${marked.length - inked} had too little ink to measure`);
      });
    }
  }

  // Settings' first rows on a phone are the look row and the Help row. From
  // the tablet width the header row holds both and the rows are not shown.
  const SETTINGS_LOOK_ROW = '.settings-phone-rows button.settings-row';
  const SETTINGS_HELP_ROW = '.settings-phone-rows a.settings-row';
  // The first two controls in the page's own content, with their boxes and
  // the style of the words they show.
  const firstControls = () => {
    const main = document.getElementById('main-content');
    if (!main) return [];
    return [...main.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
      .filter((control) => {
        const box = control.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(control).visibility !== 'hidden';
      })
      .slice(0, 2)
      .map((control) => {
        const box = control.getBoundingClientRect();
        const holder = [...control.querySelectorAll('span')].find((span) => span.textContent.trim()) || control;
        const style = getComputedStyle(holder);
        return {
          tag: control.tagName.toLowerCase(),
          name: (control.getAttribute('aria-label') || control.textContent || '').replace(/\s+/g, ' ').trim(),
          href: control.getAttribute('href'),
          width: box.width,
          height: box.height,
          words: { family: style.fontFamily, weight: style.fontWeight, size: style.fontSize, color: style.color },
        };
      });
  };
  const controlSeen = (control) => (control ? `the ${control.tag === 'a' ? 'link' : control.tag} "${control.name}"` : 'nothing');
  // Where the focused control's ring is cut: by a box round it that clips
  // what overflows it, or by the fixed header drawn over it.
  const ringCut = () => {
    const element = document.activeElement;
    if (!element || element === document.body) return ['nothing is focused'];
    const style = getComputedStyle(element);
    const reach = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
    const box = element.getBoundingClientRect();
    const ring = { top: box.top - reach, left: box.left - reach, right: box.right + reach, bottom: box.bottom + reach };
    const cuts = [];
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      const own = getComputedStyle(node);
      if (own.overflowX === 'visible' && own.overflowY === 'visible') continue;
      const edge = node.getBoundingClientRect();
      const top = edge.top + node.clientTop;
      const left = edge.left + node.clientLeft;
      const past = { top: top - ring.top, left: left - ring.left, right: ring.right - (left + node.clientWidth), foot: ring.bottom - (top + node.clientHeight) };
      const named = `${node.tagName.toLowerCase()}${typeof node.className === 'string' && node.className.trim() ? `.${node.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}`;
      for (const [side, px] of Object.entries(past)) if (px > 0.5) cuts.push(`${px.toFixed(1)} px past the ${side} of ${named}`);
    }
    const header = document.querySelector('header.app-header');
    const foot = header ? header.getBoundingClientRect().bottom : 0;
    if (ring.top < foot - 0.5) cuts.push(`${(foot - ring.top).toFixed(1)} px under the top bar`);
    return cuts;
  };

  for (const look of LOOKS) {
    await open({ name: 'settings rows on a phone', width: 390, look }, async (page, context, check) => {
      await visit(page, '/settings/');
      // The look row takes its place once the page's script has run.
      await page.locator(SETTINGS_LOOK_ROW).waitFor({ timeout: 10_000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      const [first, second] = await page.evaluate(firstControls);
      const named = `Switch to the ${OTHER[look]} look`;
      if (!first || first.tag !== 'button' || first.name !== named) {
        throw new Error(`the first control in the page is ${controlSeen(first)}, not the button "${named}"`);
      }
      const helpPath = second?.href ? new URL(second.href, page.url()).pathname : '';
      check(second?.tag === 'a' && second.name === 'Help' && helpPath === '/help/', `the second control in the page is ${controlSeen(second)} to "${helpPath}", not the link "Help" to /help/`);
      for (const control of [first, second].filter(Boolean)) {
        check(control.height >= 47.5 && control.width >= 357.5, `${controlSeen(control)} is ${control.width.toFixed(1)} px wide and ${control.height.toFixed(1)} px tall, not 358 by 48 or more`);
        const { family, weight, size, color } = control.words;
        check(isInter(family) && weight === '700' && size === '16px' && color === INK[look],
          `the words of ${controlSeen(control)} are ${face(family)} ${weight} at ${size} in ${color}, not Inter 700 at 16px in ${INK[look]}`);
      }
      await page.screenshot({ path: path.join(outDir, `settings-rows-390-${look}.png`) });
      // Held down, each row is drawn 1 px lower with its words at full strength.
      for (const [what, selector] of [['the look row', SETTINGS_LOOK_ROW], ['the Help row', SETTINGS_HELP_ROW]]) {
        const seen = await held(page, page.locator(selector), drawnAs);
        if (!seen) { check(false, `${what} has no box`); continue; }
        check(seen.opacity === '1' && seen.transform === 'matrix(1, 0, 0, 1, 0, 1)', `${what} held down is drawn at opacity ${seen.opacity} with ${seen.transform}, not 1 px lower at opacity 1`);
      }
      // A press turns the page and the rows' ground to the other look in the
      // frame that follows it.
      const pressed = await page.evaluate((selector) => new Promise((resolve) => {
        const rows = document.querySelector('.settings-phone-rows');
        const read = () => ({ classes: document.documentElement.className, ground: getComputedStyle(rows).backgroundColor });
        const before = read();
        document.querySelector(selector).click();
        requestAnimationFrame(() => resolve({ before, after: read() }));
      }), SETTINGS_LOOK_ROW);
      const next = OTHER[look];
      const classes = pressed.after.classes.split(/\s+/);
      check(pressed.before.ground === PAGE[look], `the rows stand on ${pressed.before.ground} before the press, not ${PAGE[look]}`);
      check(classes.includes(next) && !classes.includes(look) && pressed.after.ground === PAGE[next],
        `the frame after the press has the class "${pressed.after.classes}" and the rows stand on ${pressed.after.ground}, not ${next} and ${PAGE[next]}`);
      const said = ((await page.locator('.settings-phone-rows [role="status"]').textContent()) || '').trim();
      const wanted = next === 'dark' ? 'Dark look on' : 'Light look on';
      check(said === wanted, `after the press the status reads "${said}", not "${wanted}"`);
      await page.locator(SETTINGS_HELP_ROW).click();
      await page.waitForURL((url) => url.pathname === '/help/', { timeout: 20_000 }).catch(() => {});
      check(new URL(page.url()).pathname === '/help/', `a press on the Help row opened ${page.url()}`);
    });
  }
  await open({ name: 'settings rows, larger text', width: 390, look: 'light' }, async (page, context, check) => {
    await visit(page, '/settings/');
    const row = page.locator(SETTINGS_LOOK_ROW);
    await row.waitFor({ timeout: 10_000 });
    await largerText(page);
    const seen = await row.evaluate((element) => ({ past: element.scrollWidth - element.clientWidth, height: element.getBoundingClientRect().height }));
    check(seen.past <= 0, `the look row's words run ${seen.past} px past the row`);
    check(seen.height > 48, `the look row is ${seen.height.toFixed(1)} px tall, not taller than 48 px`);
    const sideways = await sidewaysScroll(page);
    if (sideways > 0) check(false, `the page scrolls ${sideways} px sideways: ${await widest(page)}`);
  });
  for (const width of [820, 1280]) {
    await open({ name: 'settings rows, from the tablet', width, look: 'light' }, async (page, context, check) => {
      await visit(page, '/settings/');
      await page.locator('header.app-header button.look-switch').waitFor({ timeout: 10_000 });
      const rows = await page.evaluate(() => {
        const part = document.querySelector('.settings-phone-rows');
        return part ? { height: part.getBoundingClientRect().height, display: getComputedStyle(part).display } : null;
      });
      check(!!rows, 'the page has no look row and Help row to leave out');
      if (rows) check(rows.height === 0, `the look row and the Help row show: their part is ${rows.height.toFixed(1)} px tall (display ${rows.display})`);
      const row = await page.evaluate(readRow);
      if (!row) throw new Error('no app header');
      check(row.items.some((item) => item.kind === 'switch') && row.items.some((item) => item.kind === 'link' && item.name === 'Help'),
        `the header row holds ${row.items.map((item) => item.name).join(', ')}, not the look switch and Help`);
    });
  }
  await open({ name: 'settings rows, focus', width: 390, look: 'dark' }, async (page, context, check) => {
    await visit(page, '/settings/');
    await page.locator(SETTINGS_LOOK_ROW).waitFor({ timeout: 10_000 }).catch(() => {});
    // Tab past the header's stops to the first stop in the page.
    const passed = [];
    let reached = null;
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const item = await page.evaluate(stop);
      if (item?.inMain) { reached = item; break; }
      passed.push(item?.name ?? 'nothing');
    }
    for (const [i, wanted] of ['Switch to the light look', 'Help'].entries()) {
      if (i > 0) {
        await page.keyboard.press('Tab');
        reached = await page.evaluate(stop);
      }
      if (!reached || reached.name !== wanted) {
        throw new Error(`Tab after ${passed.join(' > ') || 'nothing'} reaches ${reached?.name ?? 'nothing in the page'}, not "${wanted}"`);
      }
      passed.push(reached.name);
      check(reached.ring === `solid 2px ${ACCENT.dark}`, `"${wanted}" is ringed ${reached.ring}, not solid 2px ${ACCENT.dark}`);
      const cut = await page.evaluate(ringCut);
      check(cut.length === 0, `the ring round "${wanted}" is cut: it is drawn ${cut.join(', ')}`);
    }
  });

  // Titles and robots tags: each app page is titled with its own name and
  // " | SafeOS" and asks search engines not to index it. robots.txt keeps a
  // crawler from none of them, since a crawler that may not fetch a page
  // never reads its tag, and the sitemap lists none of them. A reading page
  // keeps the site's own pattern in its title.
  await open({ name: 'titles and robots tags', width: 1280, look: 'light' }, async (page, context, check) => {
    const titles = [
      ['/dashboard/', 'Dashboard | SafeOS'],
      ['/monitor/', 'Motion and sound | SafeOS'],
      ['/lost-found/', 'Lost and Found | SafeOS'],
      ['/security/', 'People | SafeOS'],
      ['/wildlife/', 'Wildlife | SafeOS'],
      ['/history/', 'History | SafeOS'],
      ['/settings/', 'Settings | SafeOS'],
      ['/settings/detection/', 'Settings | SafeOS'],
      ['/setup/?again=1', 'Setup | SafeOS'],
    ];
    const head = () => ({
      title: document.title,
      robots: [...document.querySelectorAll('meta[name="robots"]')].map((tag) => tag.getAttribute('content') || '').join('; '),
    });
    for (const [route, title] of titles) {
      await visit(page, route);
      const seen = await page.evaluate(head);
      check(seen.title === title, `${route} is titled "${seen.title}", not "${title}"`);
      check(/\bnoindex\b/.test(seen.robots), `${route} carries ${seen.robots ? `the robots tag "${seen.robots}"` : 'no robots tag'}, not one that holds noindex`);
    }
    await visit(page, '/about/');
    const about = await page.evaluate(head);
    check(about.title.endsWith(' | SafeOS Guardian'), `/about/ is titled "${about.title}", which does not end " | SafeOS Guardian"`);

    const sections = [...new Set(titles.map(([route]) => `/${route.split('/')[1]}/`))];
    const read = async (file) => {
      const response = await context.request.get(address(file), { timeout: 30_000 });
      if (!response.ok()) throw new Error(`${file} answers ${response.status()}`);
      return response.text();
    };
    // A Disallow line keeps a crawler from every address that starts with it.
    const kept = (await read('/robots.txt')).split('\n').map((line) => line.match(/^\s*Disallow:\s*(\S+)/i)?.[1]).filter(Boolean);
    for (const section of sections) {
      const rule = kept.find((start) => section.startsWith(start));
      check(!rule, `robots.txt keeps a crawler from ${section} with "Disallow: ${rule}", so the page's noindex tag is never read`);
    }
    const listed = [...(await read('/sitemap.xml')).matchAll(/<loc>([^<]+)<\/loc>/g)].map((entry) => new URL(entry[1].trim()).pathname);
    for (const wanted of ['/', '/help/']) check(listed.includes(wanted), `the sitemap does not list ${wanted}`);
    for (const section of sections) {
      const found = listed.filter((pathname) => pathname.startsWith(section));
      check(found.length === 0, `the sitemap lists ${found.join(', ')}`);
    }
  });

  // Help opens at the entry an address names: the dashboard's links to
  // /help/#camera and /help/#notifications land on Troubleshooting with the
  // entry's heading in view, below the header, and the address keeps its
  // fragment. Help with no fragment opens as before, at Getting Started.
  const HELP_ENTRIES = [['#camera', 'Camera not working'], ['#notifications', 'Notifications not appearing']];
  // The page scrolls smoothly: wait until it has stood still for a few frames.
  const scrollSettled = (page) => page.evaluate(() => new Promise((resolve) => {
    let last = -1;
    let still = 0;
    const started = performance.now();
    const frame = () => {
      still = window.scrollY === last ? still + 1 : 0;
      last = window.scrollY;
      if (still >= 5 || performance.now() - started > 3000) resolve();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }));
  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'help entries', width, look }, async (page, context, check) => {
        for (const [fragment, title] of HELP_ENTRIES) {
          // Each address is opened afresh: from another Help address the
          // browser would only move to the fragment, with no new page.
          await page.goto('about:blank');
          await visit(page, `/help/${fragment}`);
          const heading = page.getByRole('heading', { name: title, exact: true });
          const shown = await heading.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
          check(shown, `/help/${fragment} shows no heading "${title}"`);
          if (!shown) continue;
          await scrollSettled(page);
          const seen = await heading.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const header = document.querySelector('header.app-header')?.getBoundingClientRect();
            const bar = document.querySelector('nav.phone-bar');
            const barBox = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect() : null;
            return {
              top: box.top,
              bottom: box.bottom,
              headerFoot: header ? header.bottom : 0,
              screenFoot: barBox && barBox.height > 0 ? barBox.top : window.innerHeight,
              by: barBox && barBox.height > 0 ? 'the phone bar' : 'the screen',
            };
          });
          check(seen.top >= seen.headerFoot - 0.5, `"${title}" at /help/${fragment} starts ${Math.round(seen.top)} px from the top, above the header's foot at ${Math.round(seen.headerFoot)} px`);
          check(seen.bottom <= seen.screenFoot + 0.5, `"${title}" at /help/${fragment} ends ${Math.round(seen.bottom)} px from the top, past ${seen.by} at ${Math.round(seen.screenFoot)} px`);
          const hash = new URL(page.url()).hash;
          check(hash === fragment, `/help/${fragment} leaves the address at "${hash || 'no fragment'}"`);
        }
        await visit(page, '/help/');
        const start = page.getByRole('heading', { name: 'Getting Started with SafeOS', exact: true });
        const opens = await start.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
        check(opens, '/help/ shows no heading "Getting Started with SafeOS"');
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
      // The script is held until the frame before it has been read, however
      // long the fonts take.
      let release;
      const held = new Promise((resolve) => { release = resolve; });
      await context.route('**/_next/static/chunks/**', async (route) => {
        await held;
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
      release();
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

  // ---------------------------------------------------------------------------
  // Offline
  // ---------------------------------------------------------------------------
  // The worker stores every page of the build when it installs, so an app
  // page opens with no connection: from a press in the header or the bar, and
  // from its address typed without the closing slash or with a query. An
  // address the installed copy does not hold shows the offline page, which
  // says so in the look and leads back to the dashboard. "Clear All Local
  // Data" empties the installed copy, and the load that follows fills it.

  // The installed copy is whole once the worker controls the page.
  const installed = (page) => page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i += 1) await new Promise((r) => setTimeout(r, 100));
    const names = (await caches.keys()).filter((name) => name.startsWith('safeos-shell-'));
    return names.length === 1 && (await (await caches.open(names[0])).keys()).length > 0;
  });
  const OFFLINE_H1 = 'This page is not on this device';
  const OFFLINE_SENTENCE = 'This device is offline, and this page is not saved on it. The dashboard opens without a connection.';

  // One visit with a connection, then none.
  const visitThenOffline = async (page, context, route = '/dashboard/') => {
    await visit(page, route);
    if (!(await installed(page))) throw new Error(`the installed copy is not whole after a visit to ${route}`);
    await context.setOffline(true);
  };

  // What the address shows once it has settled: its first heading and how
  // many characters its main content holds.
  const shown = async (page) => {
    await page.waitForFunction(() => (document.getElementById('main-content')?.innerText || '').trim().length > 0, null, { timeout: 8_000 })
      .catch(() => undefined);
    return page.evaluate(() => ({
      h1: (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim(),
      main: (document.getElementById('main-content')?.innerText || '').trim().length,
    }));
  };
  const itsPage = (seen) => seen.h1 !== OFFLINE_H1 && seen.main > 0;
  // A page opened by a press draws its own heading in place of the one
  // before it; a page whose script did not arrive keeps the old one.
  const headingChanges = (page, before) => page.waitForFunction(
    (previous) => (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim() !== previous, before, { timeout: 15_000 },
  ).catch(() => undefined);
  const whatShows = (seen) => (seen.main > 0 ? `a page headed "${seen.h1}"` : `"${seen.h1 || 'no heading'}" and no main content`);

  // The offline page, opened for an address the build does not have.
  const openOfflinePage = async (page, context) => {
    await visitThenOffline(page, context);
    await page.goto(address('/no-such-page/'), { waitUntil: 'load', timeout: 30_000 });
    const h1 = await page.evaluate(() => (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim());
    if (h1 !== OFFLINE_H1) throw new Error(`/no-such-page/ opened offline is headed "${h1 || 'nothing'}", not "${OFFLINE_H1}"`);
  };

  await open({ name: 'offline, typed addresses', width: 390, look: 'light' }, async (page, context, check) => {
    await visitThenOffline(page, context);
    // Each address opens its own page: a nonempty page under another heading fails.
    for (const [typed, heading] of [['/monitor', 'Motion and sound'], ['/history', 'History'], ['/monitor/?source=shortcut', 'Motion and sound']]) {
      await visit(page, typed);
      const seen = await shown(page);
      check(itsPage(seen) && seen.h1 === heading, `${typed} opened offline shows ${whatShows(seen)}, not its stored page headed "${heading}"`);
    }
  });

  for (const look of LOOKS) {
    await open({ name: 'offline, pages never opened', width: 1280, look }, async (page, context, check) => {
      await visitThenOffline(page, context);
      let before = (await shown(page)).h1;
      for (const words of ['History', 'Settings', 'Help']) {
        await page.locator(headerLink(words)).click();
        const current = await page.locator(`${headerLink(words)}[aria-current="page"]`).waitFor({ timeout: 15_000 }).then(() => true, () => false);
        await headingChanges(page, before);
        const seen = await shown(page);
        check(current, `a press on ${words} in the header, offline, does not make it the place being read`);
        check(itsPage(seen) && seen.h1 !== before, `a press on ${words} in the header, offline, shows ${whatShows(seen)}${seen.h1 === before ? ', the page before it' : ''}`);
        before = seen.h1;
      }
    });
    await open({ name: 'offline, the phone bar', width: 390, look }, async (page, context, check) => {
      await visitThenOffline(page, context);
      let before = (await shown(page)).h1;
      for (const words of ['History', 'Settings', 'Dashboard']) {
        const place = `nav.phone-bar a[href^="/${words.toLowerCase()}"]`;
        await page.locator(place).click();
        const current = await page.locator(`${place}[aria-current="page"]`).waitFor({ timeout: 15_000 }).then(() => true, () => false);
        await headingChanges(page, before);
        const seen = await shown(page);
        check(current, `a press on ${words} in the phone bar, offline, does not make it the place being read`);
        check(itsPage(seen) && seen.h1 !== before, `a press on ${words} in the phone bar, offline, shows ${whatShows(seen)}${seen.h1 === before ? ', the page before it' : ''}`);
        before = seen.h1;
      }
    });
  }

  for (const width of [390, 820, 1280, 1440]) {
    for (const look of LOOKS) {
      await open({ name: 'offline page', width, look }, async (page, context, check) => {
        await openOfflinePage(page, context);
        const seen = await page.evaluate(() => {
          const words = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
          const box = (node) => {
            if (!node) return null;
            const { left, right, top, bottom, width, height } = node.getBoundingClientRect();
            return { left, right, top, bottom, width, height };
          };
          const h1 = document.querySelector('h1');
          const sentence = document.querySelector('p');
          const key = [...document.querySelectorAll('button')].find((button) => words(button) === 'Try again');
          const link = [...document.querySelectorAll('a')].find((anchor) => words(anchor) === 'Open dashboard');
          const small = [];
          for (const element of document.body.querySelectorAll('*:not(script):not(style)')) {
            if (![...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) continue;
            const size = parseFloat(getComputedStyle(element).fontSize);
            if (size < 16) small.push(`"${words(element).slice(0, 40)}" at ${size} px`);
          }
          const edge = key ? getComputedStyle(key) : null;
          return {
            headings: document.querySelectorAll('h1').length,
            sentences: [...document.querySelectorAll('p')].map(words),
            words: words(document.body),
            link: link ? link.getAttribute('href') : null,
            page: getComputedStyle(document.body).backgroundColor,
            ink: [h1, sentence].map((node) => (node ? getComputedStyle(node).color : 'nothing')),
            edge: edge ? ['Top', 'Right', 'Bottom', 'Left'].map((side) => `${edge[`border${side}Style`]} ${edge[`border${side}Width`]} ${edge[`border${side}Color`]}`) : [],
            small,
            boxes: { h1: box(h1), key: box(key), link: box(link), block: box(document.querySelector('main')) },
            screen: document.documentElement.clientWidth,
          };
        });
        check(seen.headings === 1, `the page has ${seen.headings} first-level headings`);
        check(seen.sentences.length === 1 && seen.sentences[0] === OFFLINE_SENTENCE, `the page's sentence reads "${seen.sentences.join(' / ')}"`);
        check(!/monitoring server/i.test(seen.words), 'the page names a monitoring server');
        check(seen.page === PAGE[look], `the page's ground is ${seen.page}, not ${PAGE[look]}`);
        check(seen.ink.every((colour) => colour === INK[look]), `the heading and the sentence are ${seen.ink.join(' and ')}, not ${INK[look]}`);
        check(seen.small.length === 0, `text under 16 px: ${seen.small.join(', ')}`);
        const sideways = await sidewaysScroll(page);
        check(sideways <= 0, `the page scrolls ${sideways} px sideways (${await widest(page)})`);
        const { h1, key, link, block } = seen.boxes;
        if (!key || !link || !block) throw new Error(`the page has ${key ? 'a' : 'no'} key "Try again", ${link ? 'a' : 'no'} link "Open dashboard" and ${block ? 'a' : 'no'} main part`);
        check(seen.link === '/dashboard/', `"Open dashboard" leads to ${seen.link}`);
        check(key.height >= 44, `"Try again" is ${key.height} px tall`);
        check(link.height >= 44, `"Open dashboard" is ${link.height} px tall`);
        check(seen.edge.every((side) => side === `solid 1px ${LINE[look]}`), `the key's edge is ${seen.edge.join(', ')}, not solid 1px ${LINE[look]}`);
        if (width === 820) {
          const off = Math.abs((block.left + block.right) / 2 - seen.screen / 2);
          check(block.width <= 640.5, `the block is ${block.width} px wide, over 640 px`);
          check(off <= 2, `the block's centre is ${off} px from the screen's`);
          check(key.width < block.width - 1, `the key is ${key.width} px wide, as wide as the block (${block.width} px), not at its own width`);
        }
        if (width < 768) check(Math.abs(key.width - (block.width - 32)) <= 1, `the key is ${key.width} px wide, not across the column (${block.width - 32} px)`);
        if (width >= 1280) {
          const seventh = block.left + (block.width * 7) / 12;
          check(h1.left >= block.left && h1.right <= seventh + 1, `the heading spans ${Math.round(h1.left)} to ${Math.round(h1.right)} px, outside the left 7 of 12 columns (${Math.round(block.left)} to ${Math.round(seventh)} px)`);
          check(key.left > h1.right, `the key starts at ${Math.round(key.left)} px, not right of the heading's right edge (${Math.round(h1.right)} px)`);
          check(link.left > h1.right, `the link starts at ${Math.round(link.left)} px, not right of the heading's right edge (${Math.round(h1.right)} px)`);
          check(Math.abs(key.top - h1.top) <= 8, `the key's top (${Math.round(key.top)} px) and the heading's (${Math.round(h1.top)} px) differ by more than 8 px`);
        }
        await page.screenshot({ path: path.join(outDir, `offline-page-${width}-${look}.png`), fullPage: true });

        for (const wanted of ['Try again', 'Open dashboard']) {
          await page.keyboard.press('Tab');
          const stop = await page.evaluate(() => {
            const element = document.activeElement;
            const style = getComputedStyle(element);
            return { name: (element.textContent || '').replace(/\s+/g, ' ').trim() || element.tagName.toLowerCase(), ring: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}` };
          });
          if (stop.name !== wanted) throw new Error(`Tab reaches "${stop.name}", not "${wanted}"`);
          check(stop.ring === `solid 2px ${ACCENT[look]}`, `"${wanted}" is ringed ${stop.ring}, not solid 2px ${ACCENT[look]}`);
        }
        await page.getByRole('link', { name: 'Open dashboard', exact: true }).click();
        const arrived = await page.waitForURL((url) => url.pathname === '/dashboard/', { timeout: 15_000 }).then(() => true, () => false);
        const after = await shown(page);
        check(arrived && itsPage(after), `a press on "Open dashboard", offline, ends at ${new URL(page.url()).pathname} with ${whatShows(after)}`);
      });
    }
  }

  await open({ name: 'offline page, larger text', width: 390, look: 'dark' }, async (page, context, check) => {
    await openOfflinePage(page, context);
    await largerText(page);
    const sideways = await sidewaysScroll(page);
    check(sideways <= 0, `the page scrolls ${sideways} px sideways (${await widest(page)})`);
    const cut = await page.evaluate(() => [...document.querySelectorAll('h1, p, button, a')]
      .filter((element) => element.scrollWidth > element.clientWidth + 0.5 && element.clientWidth > 0)
      .map((element) => `${element.tagName.toLowerCase()} "${(element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30)}" (${element.scrollWidth} px of words in ${element.clientWidth} px)`));
    check(cut.length === 0, `words are cut: ${cut.join(', ')}`);
  });

  // Clear all data, pressed on Settings, Data on this device: the key, then
  // the question asked in place, with no browser confirm box. `confirm`
  // presses "Clear all data" and waits for the load that follows it; else
  // "Cancel". Returns the question's words, or null when none showed within
  // 10 seconds.
  const clearOnDataPage = async (page, { confirm }) => {
    await visit(page, '/settings/data/');
    await page.getByRole('button', { name: 'Clear all data on this device', exact: true }).click({ timeout: 15_000 });
    const question = page.locator('.set-confirm__question');
    const words = await question.waitFor({ timeout: 10_000 }).then(() => question.innerText()).then(plain).catch(() => null);
    if (confirm) {
      await Promise.all([
        page.waitForEvent('load', { timeout: 60_000 }),
        page.getByRole('button', { name: 'Clear all data', exact: true }).click(),
      ]);
    } else {
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    return words;
  };

  await open({ name: 'installed copy after clearing', width: 390, look: 'light' }, async (page, context, check) => {
    page.on('dialog', (dialog) => {
      check(false, `a browser ${dialog.type()} box opened: "${dialog.message()}"`);
      dialog.dismiss().catch(() => {});
    });
    await visit(page, '/settings/');
    if (!(await installed(page))) throw new Error('the installed copy is not whole after a visit to /settings/');
    await clearOnDataPage(page, { confirm: true });
    // The load that follows the clear has a connection, so the worker
    // stores the build's files again.
    let whole = false;
    for (let i = 0; i < 60 && !whole; i += 1) {
      whole = await installed(page).catch(() => false);
      if (!whole) await page.waitForTimeout(500);
    }
    if (!whole) throw new Error('30 seconds after the reload that follows "Clear all data" the installed copy is still empty');
    await context.setOffline(true);
    await visit(page, '/dashboard/');
    const seen = await shown(page);
    check(itsPage(seen), `/dashboard/ opened offline after the clear shows ${whatShows(seen)}`);
  });

  // Offline, the question before "Clear all data" says that SafeOS will not
  // open again until the device is back online, since the installed copy goes
  // with the rest and only a load with a connection stores it again.
  // Cancelled, it clears nothing.
  const ASK_ONLINE = 'Clear all data on this device? Alerts, pictures, pets, sounds and settings leave this device.';
  const ASK_OFFLINE = `${ASK_ONLINE} SafeOS will not open again until you are back online.`;
  // What a clear would change: the setup record's finished setup and use.
  const setupRecord = (page) => page.evaluate(() => {
    try {
      const state = JSON.parse(localStorage.getItem('safeos-onboarding') || 'null')?.state;
      return state ? JSON.stringify({ isComplete: state.isComplete, selectedScenario: state.selectedScenario }) : null;
    } catch (e) {
      return 'unreadable';
    }
  });

  await open({ name: 'clearing while offline', width: 390, look: 'light' }, async (page, context, check) => {
    await visit(page, '/settings/');
    if (!(await installed(page))) throw new Error('the installed copy is not whole after a visit to /settings/');
    const kept = await setupRecord(page);
    if (kept === null) throw new Error('the setup record is not saved on /settings/ before the presses');
    page.on('dialog', (dialog) => {
      check(false, `a browser ${dialog.type()} box opened: "${dialog.message()}"`);
      dialog.dismiss().catch(() => {});
    });
    await context.setOffline(true);
    const offline = await clearOnDataPage(page, { confirm: false });
    check(offline === ASK_OFFLINE, `offline, "Clear all data on this device" asks ${offline === null ? 'nothing' : `"${offline}"`}, not "${ASK_OFFLINE}"`);
    await visit(page, '/dashboard/');
    const seen = await shown(page);
    check(seen.h1 !== OFFLINE_H1, `/dashboard/ opened offline after the dismissed question shows ${whatShows(seen)}`);
    const after = await setupRecord(page);
    check(after === kept, `after the dismissed question the setup record reads ${after}, not ${kept}`);

    await context.setOffline(false);
    const online = await clearOnDataPage(page, { confirm: false });
    check(online === ASK_ONLINE, `online, "Clear all data on this device" asks ${online === null ? 'nothing' : `"${online}"`}, not "${ASK_ONLINE}"`);
  });

  // A camera for the walks: a small picture that keeps changing, with a quiet
  // sound track where asked. The page's own request is counted, and a walk
  // can make the next request wait, or fail with a browser's error name.
  const FAKE_CAMERA = () => {
    // asked: each request's constraints; answers: answers given in order
    // before answer; firstFrameMs: the picture's first drawing comes after
    // it; microphone: false refuses a request for sound as a device with no
    // microphone does; blockOnRefuse: a refusal first records the camera as
    // blocked, as a press on Block does; sound: 'noise' puts loud noise on the
    // sound track, where 'tone' is silent.
    window.__camera = {
      requests: 0, answer: 'ok', waitMs: 0, live: [],
      asked: [], answers: [], firstFrameMs: 0, microphone: true, blockOnRefuse: false, sound: 'tone',
    };
    const media = navigator.mediaDevices;
    if (!media) return;
    media.getUserMedia = async (constraints) => {
      const camera = window.__camera;
      camera.asked.push(JSON.parse(JSON.stringify(constraints || {})));
      camera.requests += 1;
      if (camera.waitMs) await new Promise((resolve) => setTimeout(resolve, camera.waitMs));
      // A walk can also hold the request until it lets it go.
      if (camera.held) await camera.held;
      const answer = camera.answers.length ? camera.answers.shift() : camera.answer;
      if (answer !== 'ok') {
        if (answer === 'NotAllowedError' && camera.blockOnRefuse && typeof window.__setCameraState === 'function') window.__setCameraState('denied');
        throw new DOMException('camera', answer);
      }
      if (constraints && constraints.audio && !camera.microphone) throw new DOMException('microphone', 'NotFoundError');
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const pen = canvas.getContext('2d');
      let tick = 0;
      const draw = () => {
        tick += 1;
        pen.fillStyle = tick % 2 ? '#202020' : '#e0e0e0';
        pen.fillRect(0, 0, 320, 180);
        pen.fillStyle = '#808080';
        pen.fillRect((tick * 16) % 320, 40, 80, 80);
      };
      const start = () => { draw(); setInterval(draw, 150); };
      if (camera.firstFrameMs) setTimeout(start, camera.firstFrameMs);
      else start();
      const stream = canvas.captureStream(10);
      if (constraints && constraints.audio) {
        const audio = new AudioContext();
        const out = audio.createMediaStreamDestination();
        if (camera.sound === 'noise') {
          const buffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
          const samples = buffer.getChannelData(0);
          for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
          const source = audio.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          source.connect(out);
          source.start();
        } else {
          audio.createOscillator().connect(out);
        }
        out.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      }
      camera.live.push(stream);
      return stream;
    };
  };
  const cameraRequests = (page) => page.evaluate(() => window.__camera.requests);
  const camerasOn = (page) => page.evaluate(() => window.__camera.live.filter((s) => s.getVideoTracks().some((t) => t.readyState === 'live')).length);

  // ---------------------------------------------------------------------------
  // The four ways' pages
  // ---------------------------------------------------------------------------
  // Each way's page is headed and titled with the way's name as the dashboard
  // writes it. Lost and Found, with no pet saved, offers its add key first.

  const WAY_NAMES = [
    ['/monitor/', 'Motion and sound'],
    ['/lost-found/', 'Lost and Found'],
    ['/security/', 'People'],
    ['/wildlife/', 'Wildlife'],
  ];
  // The page's own first heading; Lost and Found draws it once it has read
  // the pets saved on the device.
  const firstHeading = async (page) => {
    const heading = page.locator('#main-content h1').first();
    await heading.waitFor({ timeout: 20_000 });
    return plain(await heading.textContent());
  };

  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'way pages, their names', width, look }, async (page, context, check) => {
        for (const [route, name] of WAY_NAMES) {
          await visit(page, route);
          const heading = await firstHeading(page);
          check(heading === name, `${route} is headed "${heading}", not "${name}"`);
          const title = await page.title();
          check(title === `${name} | SafeOS`, `${route} is titled "${title}", not "${name} | SafeOS"`);
        }
      });
    }
  }

  await open({ name: 'Lost and Found with no pet saved', width: 390, look: 'light' }, async (page, context, check) => {
    await visit(page, '/lost-found/');
    await firstHeading(page);
    const first = await page.evaluate(() => {
      const heading = document.querySelector('#main-content h1');
      const next = [...document.querySelectorAll('#main-content button, #main-content a')]
        .find((element) => heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
      return next ? { tag: next.tagName.toLowerCase(), name: (next.getAttribute('aria-label') || next.textContent || '').replace(/\s+/g, ' ').trim() } : null;
    });
    check(first && first.name.startsWith('Add'), first
      ? `the first key after the heading is ${first.tag === 'a' ? 'the link' : 'the button'} "${first.name}", not the add key`
      : 'no key or link follows the heading');
  });

  // One watch at a time across the device's tabs. While one tab watches, a
  // way's own start key in another tab asks before anything starts; Cancel
  // keeps the first tab's watch, Watch here ends it, camera and all.

  const QUESTION = 'Watch here instead? The other tab stops.';
  // The dialog stands on the panel. Its words take the panel's ink, as the
  // panels of the visitor pages do: white in the dark look, where body text in
  // the page's ink reads under 12:1 on its strokes (visitor.css), and the
  // look's ink in the light look.
  const PANEL_INK = { light: INK.light, dark: 'rgb(255, 255, 255)' };
  // A pet saved on this device, as Lost and Found's own setup saves one.
  const SAVED_PET = () => new Promise((resolve, reject) => {
    const request = indexedDB.open('safeos-guardian');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const createdAt = new Date().toISOString();
      const saving = database.transaction('subject_profile', 'readwrite');
      saving.objectStore('subject_profile').put({
        id: 'walk-pet', name: 'Mittens', type: 'pet', description: '',
        fingerprint: {
          id: 'walk-pet', name: 'Mittens', colorHistogram: [], dominantColors: [], averageColor: { r: 180, g: 120, b: 60 },
          colorVariance: 0, estimatedSizeRatio: 0.2, edgeSignature: [], referenceImages: [], createdAt, version: 2,
        },
        referenceImages: [], createdAt, lastActiveAt: null, matchCount: 0,
      });
      saving.onerror = () => reject(saving.error);
      saving.oncomplete = () => {
        database.close();
        resolve();
      };
    };
  });
  const theQuestion = (page) => page.getByRole('dialog', { name: QUESTION });
  const focusedOn = (page) => page.evaluate(() => (document.activeElement?.textContent || '').replace(/\s+/g, ' ').trim());
  const gone = (locator) => locator.waitFor({ state: 'detached', timeout: 5_000 }).then(() => true, () => false);
  // Two tabs of one browser: the first watches on /monitor/, the second is
  // Lost and Found with the saved pet chosen and its start key in view.
  const twoTabs = async (page, context) => {
    await visit(page, '/monitor/');
    await page.getByRole('button', { name: 'Start watching', exact: true }).click();
    await page.getByRole('button', { name: 'Stop watching', exact: true }).waitFor({ timeout: 20_000 });
    const second = await context.newPage();
    await visit(second, '/lost-found/');
    await firstHeading(second);
    await second.evaluate(SAVED_PET);
    await second.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await second.locator('#main-content h3', { hasText: 'Mittens' }).first().click();
    const startKey = second.locator('#main-content').getByRole('button', { name: 'Start Monitoring', exact: true });
    await startKey.waitFor({ timeout: 20_000 });
    return { second, startKey };
  };

  await open({ name: "second tab, a way's own key", width: 1280, look: 'light' }, async (page, context, check) => {
    const { second, startKey } = await twoTabs(page, context);
    await startKey.click();
    const asked = await theQuestion(second).waitFor({ timeout: 5_000 }).then(() => true, () => false);
    check(asked, `a press on the start key of /lost-found/, while /monitor/ watches in another tab, showed no dialog named "${QUESTION}"`);
    if (!asked) return;
    const keys = (await theQuestion(second).getByRole('button').allTextContents()).map(plain);
    check(keys.join(' | ') === 'Watch here | Cancel', `the dialog's keys read ${keys.map((key) => `"${key}"`).join(', ')}, not "Watch here" then "Cancel"`);
    const first = await focusedOn(second);
    check(first === 'Cancel', `focus starts on "${first}", not Cancel`);
    const requests = await cameraRequests(second);
    check(requests === 0, `the second tab asked for the camera ${requests} times before the person chose`);

    await theQuestion(second).getByRole('button', { name: 'Cancel', exact: true }).click();
    check(await gone(theQuestion(second)), 'Cancel left the dialog open');
    const back = await focusedOn(second);
    check(back === 'Start Monitoring', `after Cancel focus is on "${back}", not the start key`);
    check(await page.getByRole('button', { name: 'Stop watching', exact: true }).count() === 1, 'after Cancel the first tab no longer reads Stop watching');

    await startKey.click();
    await theQuestion(second).waitFor({ timeout: 5_000 });
    await theQuestion(second).getByRole('button', { name: 'Watch here', exact: true }).click();
    const ended = await page.getByRole('button', { name: 'Start watching', exact: true }).waitFor({ timeout: 10_000 }).then(() => true, () => false);
    check(ended, 'after Watch here the first tab does not read Start watching');
    const on = await camerasOn(page);
    check(on === 0, `after Watch here the first tab holds ${on} live cameras`);
    // The start then runs in the second tab: Lost and Found's key opens Monitor with the pet.
    const opened = await second.waitForURL((url) => url.pathname === '/monitor/', { timeout: 10_000 }).then(() => true, () => false);
    check(opened, `after Watch here the second tab stays on ${new URL(second.url()).pathname}, not Monitor`);
  }, { script: FAKE_CAMERA });

  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await open({ name: "second tab, the dialog's look", width, look }, async (page, context, check) => {
        const { second, startKey } = await twoTabs(page, context);
        // Pressed from the keyboard, with the pointer moved off the pet it
        // chose (at 390 px a key of the dialog opens under it), so no pointer
        // rests on a key of the dialog and the ring shows on Cancel as a
        // keyboard user sees it.
        await second.mouse.move(0, 0);
        await startKey.focus();
        await second.keyboard.press('Enter');
        await theQuestion(second).waitFor({ timeout: 5_000 });
        // Cancel takes focus with its ring drawn whole: the keys' row scrolls
        // inside itself, so a ring drawn past its box would be cut away.
        const focused = await second.evaluate(() => {
          const key = document.activeElement;
          const style = getComputedStyle(key);
          return { name: (key.textContent || '').trim(), ring: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}` };
        });
        check(focused.name === 'Cancel', `focus starts on "${focused.name}", not Cancel`);
        check(focused.ring === `solid 2px ${ACCENT[look]}`, `Cancel is ringed ${focused.ring}, not solid 2px ${ACCENT[look]}`);
        const cut = await second.evaluate(ringCut);
        check(cut.length === 0, `the ring round Cancel is cut: it is drawn ${cut.join(', ')}`);
        const seen = await theQuestion(second).evaluate((dialog) => ({
          ground: getComputedStyle(dialog).backgroundColor,
          words: getComputedStyle(dialog.querySelector('#other-tab-question')).color,
          keys: [...dialog.querySelectorAll('button')].map((key) => {
            const style = getComputedStyle(key);
            return {
              name: key.textContent.trim(),
              color: style.color,
              edges: ['Top', 'Right', 'Bottom', 'Left'].map((side) => `${style[`border${side}Width`]} ${style[`border${side}Style`]} ${style[`border${side}Color`]}`),
              height: key.getBoundingClientRect().height,
            };
          }),
        }));
        check(seen.ground === PANEL[look], `the dialog's ground is ${seen.ground}, not ${PANEL[look]}`);
        check(seen.words === PANEL_INK[look], `the question is ${seen.words}, not ${PANEL_INK[look]}`);
        check(seen.keys.length === 2, `the dialog holds ${seen.keys.length} keys, not 2`);
        for (const key of seen.keys) {
          check(key.color === PANEL_INK[look], `"${key.name}" is labelled in ${key.color}, not ${PANEL_INK[look]}`);
          for (const edge of key.edges) check(edge === `1px solid ${LINE[look]}`, `"${key.name}" has the edge ${edge}, not 1px solid ${LINE[look]}`);
          check(key.height >= 44, `"${key.name}" is ${key.height} px tall, under 44`);
        }
        const texts = await second.evaluate(measureText, await theQuestion(second).elementHandle());
        check(texts.length >= 3, `only ${texts.length} pieces of the dialog's text were measured`);
        for (const text of texts) {
          check(text.size >= 16, `"${text.words}" is ${text.size} px, under 16`);
          check(['400', '700'].includes(text.weight), `"${text.words}" has weight ${text.weight}`);
        }
        await second.screenshot({ path: path.join(outDir, `other-tab-dialog-${width}-${look}.png`) });
        await second.keyboard.press('Escape');
        check(await gone(theQuestion(second)), 'Escape left the dialog open');
      }, { script: FAKE_CAMERA });
    }
  }

  // Alerts saved on this device, written as the app's own stores hold them.
  // The page has loaded once, so the database exists; the walk reloads after.
  const PICTURE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const seedAlerts = (page, saved) => page.evaluate(async ({ saved, picture }) => {
    const { motion = [], pets = [], matches = [], people = [], sightings = [] } = saved;
    const iso = (at) => new Date(at).toISOString();
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('safeos-guardian');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const put = (store, rows) => new Promise((resolve, reject) => {
      if (rows.length === 0) { resolve(); return; }
      const tx = db.transaction(store, 'readwrite');
      rows.forEach((row) => tx.objectStore(store).put(row));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    await put('alert_cache', motion.map(({ id, at, seen = false, message = 'Motion detected: 60% (threshold: 40% · zone: Whole frame)' }) => ({
      id, monitoring: true, producer: 'monitoring', savedBeforeUpgrade: false, retentionClass: 'new',
      acknowledgementOrder: seen ? 0 : 1, streamId: 'local', severity: 'low', message, acknowledged: seen,
      timestamp: iso(at), createdAt: iso(at), syncedAt: iso(at),
    })));
    await put('subject_profile', pets.map(({ id, name, type = 'pet', at = 0, photo }) => ({
      id, name, type, description: '', fingerprint: {}, referenceImages: [photo || picture],
      createdAt: iso(at), lastActiveAt: null, matchCount: 0,
    })));
    await put('match_frame', matches.map(({ id, pet, at, confidence = 80, seen = false, ...more }) => ({
      id, subjectId: pet, frameData: picture, thumbnailData: picture, confidence, timestamp: at,
      details: { colorMatch: confidence, dominantMatch: confidence, edgeMatch: confidence, sizeMatch: confidence },
      region: null, acknowledged: seen, notes: '', exported: false, ...more,
    })));
    await put('intrusion_frame', people.map(({ id, at, count = 1, seen = false }) => ({
      id, frameData: picture, thumbnailData: picture, timestamp: at, personCount: count, allowedCount: 0,
      detections: [], acknowledged: seen, notes: '', exported: false,
    })));
    db.close();
    if (sightings.length > 0) {
      const kept = JSON.parse(localStorage.getItem('safeos-animal-alerts') || '{"state":{},"version":0}');
      kept.state.detectionHistory = [
        ...sightings.map(({ id, at, animal = 'bird', seen = false }) => ({
          id, type: animal, displayName: animal, sizeCategory: 'small', dangerLevel: 'none', confidence: 0.9,
          bbox: [0, 0, 10, 10], timestamp: at, frameData: picture, acknowledged: seen, notes: '', exported: false,
        })),
        ...(kept.state.detectionHistory || []),
      ];
      localStorage.setItem('safeos-animal-alerts', JSON.stringify(kept));
    }
  }, { saved, picture: PICTURE });
  // The device's first run has written what it held; with nothing saved, an
  // empty list. Read after the page's own read of its alerts, which ends
  // after the page has loaded.
  const firstRunDone = (page) => page.waitForFunction(() => localStorage.getItem('safeos-history-seen') !== null, null, { timeout: 10_000 }).catch(() => {});
  // A walk's device after its first run: one page opened, then the alerts saved, then a reload.
  const withNew = async (page, route, saved) => {
    await visit(page, route);
    await firstRunDone(page);
    await seedAlerts(page, saved);
    await page.reload({ waitUntil: 'networkidle' });
  };
  const motionAlerts = (count) => Array.from({ length: count }, (_, i) => ({ id: `motion-${Date.now() - i * 60_000}-walk${i}`, at: Date.now() - i * 60_000 }));

  // ---------------------------------------------------------------------------
  // The device's alerts
  // ---------------------------------------------------------------------------
  // What counts as one alert and what is new decide the count on History:
  // one Motion and sound record is one alert; frames of one way that follow
  // each other with no gap over 30 seconds are one; a Lost and Found frame
  // that did not sound and a frame of a person are none. Nothing saved before
  // the first run is new, and History marks the new alerts as seen when it
  // opens. The count stands after History's word in the phone bar and the
  // header, the number in the ink beside the problem glyph.

  // History's link where the width shows it: the phone bar's place under
  // 768 px, the header's link from there.
  const historyLink = (width) => (width < 768 ? 'nav.phone-bar a[href^="/history"]' : headerLink('History'));
  // What History reads and is named; with `want`, false until it reads that.
  const readHistory = ({ selector, want }) => {
    const link = document.querySelector(selector);
    const word = link && (link.querySelector('.phone-bar__word') || link);
    const words = word ? word.textContent.replace(/\s+/g, ' ').trim() : '';
    if (want && words !== want) return false;
    return { words, name: link ? link.getAttribute('aria-label') || words : '' };
  };
  // What History reads once it reads `expected`, or after 10 seconds. The
  // count arrives after the page has read its alerts, so where no count is
  // expected History is read again 3 seconds later.
  const historyReads = async (page, width, expected) => {
    const selector = historyLink(width);
    await page.waitForFunction(readHistory, { selector, want: expected }, { timeout: 10_000 }).catch(() => {});
    if (expected === 'History') await page.waitForTimeout(3_000);
    return page.evaluate(readHistory, { selector, want: null });
  };
  const checkHistory = (check, seen, words, name = words) => {
    check(seen.words === words, `History reads "${seen.words}", not "${words}"`);
    check(seen.name === name, `History is named "${seen.name}", not "${name}"`);
  };
  // The phone bar's places on one row where the bar shows, and the header's
  // row on one line with no word broken.
  const checkOneRow = async (page, check) => {
    const places = await page.evaluate(() => {
      const bar = document.querySelector('nav.phone-bar');
      if (!bar || bar.getBoundingClientRect().height === 0) return null;
      return [...bar.querySelectorAll('a')].map((a) => a.getBoundingClientRect().top);
    });
    if (places) check(Math.max(...places) - Math.min(...places) <= 0.5, `the bar's places' tops are ${places.map((top) => top.toFixed(1)).join(', ')} px`);
    const row = await page.evaluate(readRow);
    if (!row) {
      check(false, 'no app header');
      return;
    }
    check(row.items.length > 0 && Math.max(...row.items.map((item) => item.top)) < Math.min(...row.items.map((item) => item.bottom)), 'the header is more than one row');
    for (const item of row.items.filter((one) => one.lines > 1)) check(false, `${item.name}'s words break over ${item.lines} lines`);
  };
  // Opens History's own list of what this device saved.
  const localTimeline = async (page) => {
    await page.getByRole('button', { name: 'Local Timeline' }).click();
    await page.waitForTimeout(1_000);
  };
  const timelineHolds = async (page, words) => {
    const entries = page.getByText(words, { exact: true });
    await entries.first().waitFor({ timeout: 15_000 }).catch(() => {});
    return entries.count();
  };

  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'count on History', width, look }, async (page, context, check) => {
        await withNew(page, '/settings/', { motion: motionAlerts(3) });
        checkHistory(check, await historyReads(page, width, 'History 3'), 'History 3', 'History, 3 new alerts');
        const seen = await page.evaluate(({ selector, alert }) => {
          const link = document.querySelector(selector);
          const number = link?.querySelector('.new-count .num');
          const mark = link?.querySelector('.new-count svg.problem-mark');
          if (!link || !number || !mark) return null;
          const style = getComputedStyle(number);
          const filled = [];
          for (let node = number; node && node !== link.parentElement; node = node.parentElement) {
            if (getComputedStyle(node).backgroundColor === alert) filled.push(node.tagName.toLowerCase());
          }
          return {
            face: style.fontFamily, weight: style.fontWeight, size: style.fontSize, colour: style.color,
            fill: getComputedStyle(mark).fill, hidden: mark.getAttribute('aria-hidden'),
            before: Boolean(mark.compareDocumentPosition(number) & Node.DOCUMENT_POSITION_FOLLOWING),
            filled,
          };
        }, { selector: historyLink(width), alert: ALERT[look] });
        if (!seen) {
          check(false, 'History shows no number with the problem glyph');
          return;
        }
        check(isInter(seen.face) && seen.weight === '700' && seen.size === '16px', `the number is ${face(seen.face)} ${seen.weight} at ${seen.size}, not Inter 700 at 16px`);
        check(seen.colour === INK[look], `the number is ${seen.colour}, not ${INK[look]}`);
        check(seen.fill === ALERT[look], `the glyph is filled ${seen.fill}, not ${ALERT[look]}`);
        check(seen.hidden === 'true', `the glyph's aria-hidden is ${seen.hidden}, not true`);
        check(seen.before, 'the glyph does not stand before the number');
        check(seen.filled.length === 0, `${seen.filled.join(', ')} behind the number is filled in ${ALERT[look]}`);
        await checkOneRow(page, check);
      });
    }

    await open({ name: 'count above 99', width, look: 'light' }, async (page, context, check) => {
      const people = Array.from({ length: 20 }, (_, i) => ({ id: `intrusion-walk${i}`, at: Date.now() - i * 60_000 }));
      await withNew(page, '/settings/', { motion: motionAlerts(100), people });
      checkHistory(check, await historyReads(page, width, 'History 99+'), 'History 99+', 'History, 120 new alerts');
    });
  }

  await open({ name: 'nothing saved before the first run is new', width: 390, look: 'light' }, async (page, context, check) => {
    await visit(page, '/settings/');
    await firstRunDone(page);
    const at = Date.now();
    await seedAlerts(page, {
      motion: motionAlerts(100),
      pets: [{ id: 'pet-walk', name: 'Mittens' }],
      matches: Array.from({ length: 10 }, (_, i) => ({ id: `match-walk${i}`, pet: 'pet-walk', at: at - i * 60_000, alerted: true })),
      people: Array.from({ length: 10 }, (_, i) => ({ id: `intrusion-walk${i}`, at: at - i * 60_000 })),
    });
    await page.evaluate(() => localStorage.removeItem('safeos-history-seen'));
    await page.reload({ waitUntil: 'networkidle' });
    checkHistory(check, await historyReads(page, 390, 'History'), 'History');
    await seedAlerts(page, { motion: [{ id: `motion-${Date.now()}-after`, at: Date.now() }] });
    await page.reload({ waitUntil: 'networkidle' });
    checkHistory(check, await historyReads(page, 390, 'History 1'), 'History 1', 'History, 1 new alert');
  });

  await open({ name: 'one alert for one stay in view', width: 390, look: 'light' }, async (page, context, check) => {
    const from = Date.now() - 10 * 60_000;
    await withNew(page, '/settings/', { people: Array.from({ length: 12 }, (_, i) => ({ id: `intrusion-stay${i}`, at: from + i * 5_000 })) });
    checkHistory(check, await historyReads(page, 390, 'History 1'), 'History 1', 'History, 1 new alert');
    await seedAlerts(page, { people: [{ id: 'intrusion-stay12', at: from + 11 * 5_000 + 40_000 }] });
    await page.reload({ waitUntil: 'networkidle' });
    checkHistory(check, await historyReads(page, 390, 'History 2'), 'History 2', 'History, 2 new alerts');
  });

  await open({ name: 'a frame that did not sound is no alert', width: 390, look: 'light' }, async (page, context, check) => {
    const at = Date.now() - 5 * 60_000;
    await withNew(page, '/settings/', {
      pets: [{ id: 'pet-walk', name: 'Mittens' }],
      matches: Array.from({ length: 6 }, (_, i) => ({ id: `match-quiet${i}`, pet: 'pet-walk', at: at + i * 5_000, confidence: 55, alerted: false })),
    });
    checkHistory(check, await historyReads(page, 390, 'History'), 'History');
    await visit(page, '/history/');
    await localTimeline(page);
    const listed = await timelineHolds(page, 'Could this be Mittens?');
    check(listed === 6, `History lists ${listed} of the six frames`);
    await visit(page, '/settings/');
    await seedAlerts(page, {
      matches: [0, 2_000].map((later, i) => ({ id: `match-sounded${i}`, pet: 'pet-walk', at: Date.now() - 2_000 + later, alerted: true })),
    });
    await page.reload({ waitUntil: 'networkidle' });
    checkHistory(check, await historyReads(page, 390, 'History 1'), 'History 1', 'History, 1 new alert');
  });

  for (const width of [390, 1280]) {
    await open({ name: 'a person is never an alert here', width, look: 'light' }, async (page, context, check) => {
      const at = Date.now() - 60_000;
      await withNew(page, '/settings/', {
        pets: [{ id: 'person-walk', name: 'Sam', type: 'person' }],
        matches: [0, 1, 2].map((i) => ({ id: `match-sam${i}`, pet: 'person-walk', at: at + i * 2_000, confidence: 90, alerted: true })),
      });
      checkHistory(check, await historyReads(page, width, 'History'), 'History');
      const frame = await page.evaluate(() => [...document.querySelectorAll('header.app-header, nav.phone-bar')]
        .flatMap((part) => [part.textContent, ...[...part.querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label'))])
        .join(' '));
      check(!/Sam/.test(frame), 'the header or the phone bar names Sam');
      await visit(page, '/history/');
      await localTimeline(page);
      const listed = await timelineHolds(page, 'Could this be Sam?');
      check(listed === 3, `History lists ${listed} of the three frames`);
    });
  }

  for (const look of LOOKS) {
    await open({ name: 'History lists a sighting and marks alerts as seen when it opens', width: 390, look }, async (page, context, check) => {
      await withNew(page, '/settings/', { sightings: [{ id: 'animal-1', at: Date.now() }] });
      checkHistory(check, await historyReads(page, 390, 'History 1'), 'History 1', 'History, 1 new alert');
      await page.locator(historyLink(390)).click();
      await page.waitForURL((url) => url.pathname === '/history/', { timeout: 15_000 });
      await localTimeline(page);
      const entry = page.locator('div.rounded-xl').filter({ has: page.getByText('Looks like a bird', { exact: true }) });
      await entry.first().waitFor({ timeout: 15_000 }).catch(() => {});
      check((await entry.count()) === 1, `History lists ${await entry.count()} entries reading "Looks like a bird"`);
      if ((await entry.count()) === 1) {
        check((await entry.locator('img').count()) === 1, 'the sighting is listed with no picture');
        check((await entry.getByText('Wildlife', { exact: true }).count()) === 1, 'the sighting is not listed as Wildlife');
      }
      await page.goBack();
      await page.waitForURL((url) => url.pathname === '/settings/', { timeout: 15_000 });
      checkHistory(check, await historyReads(page, 390, 'History'), 'History');
    });

    await open({ name: 'count, script held', width: 1280, look }, async (page, context, check) => {
      await visit(page, '/settings/');
      await firstRunDone(page);
      await seedAlerts(page, { motion: motionAlerts(2) });
      // Read in one go: History opens and marks its alerts as seen, so the
      // count stands only until the marks are saved. With `want`, false until
      // History reads that.
      const read = ({ selectors, want }) => {
        const history = document.querySelector(selectors[1]);
        const word = history ? history.textContent.replace(/\s+/g, ' ').trim() : '';
        if (want && word !== want) return false;
        const bar = document.querySelector('header.app-header .app-header__bar');
        const items = bar ? [...bar.querySelectorAll('a.app-header__brand--link, a.app-header__link, a.app-header__github, button.app-header__more, button.look-switch, .look-switch-place')]
          .filter((node) => node.getBoundingClientRect().width > 0) : [];
        return {
          word,
          lefts: selectors.map((s) => document.querySelector(s)?.getBoundingClientRect().left ?? null),
          oneLine: items.length > 0 && Math.max(...items.map((node) => node.getBoundingClientRect().top)) < Math.min(...items.map((node) => node.getBoundingClientRect().bottom)),
          cut: items.filter((node) => node.scrollWidth > node.clientWidth + 0.5).map((node) => node.getAttribute('aria-label') || node.textContent.trim()),
        };
      };
      const selectors = [headerLink('Dashboard'), headerLink('History')];
      // The count can stand for less than a frame, so a poll from outside can
      // pass it by. An observer set before the page's own script reads the
      // row at the change that shows the count.
      await context.addInitScript({
        content: `(() => {
          const read = ${read.toString()};
          const args = ${JSON.stringify({ selectors, want: 'History 2' })};
          new MutationObserver(() => {
            if (window.__countShown) return;
            const seen = read(args);
            if (seen) window.__countShown = seen;
          }).observe(document, { subtree: true, childList: true, characterData: true });
        })();`,
      });
      await context.route('**/_next/static/chunks/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        await route.continue().catch(() => {});
      });
      await page.goto(address('/history/'), { waitUntil: 'commit', timeout: 60_000 });
      await page.waitForFunction(() => {
        const header = document.querySelector('header.app-header');
        return !!header && getComputedStyle(header).position === 'fixed';
      }, null, { timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      const before = await page.evaluate(read, { selectors, want: null });
      check(before.word === 'History', `while the script is held, History reads "${before.word}"`);
      const after = await page.waitForFunction(() => window.__countShown || false, null, { timeout: 30_000 })
        .then((handle) => handle.jsonValue(), () => null);
      if (!after) {
        const now = await page.evaluate(read, { selectors, want: null });
        check(false, `History reads "${now.word}", not "History 2"`);
        return;
      }
      ['Dashboard', 'History'].forEach((words, i) => {
        const moved = before.lefts[i] === null || after.lefts[i] === null ? Infinity : Math.abs(after.lefts[i] - before.lefts[i]);
        check(moved <= 0.5, `${words} moved ${moved} px when the count arrived (${before.lefts[i]} to ${after.lefts[i]})`);
      });
      check(after.oneLine, 'the header row is more than one line once the count shows');
      check(after.cut.length === 0, `${after.cut.join(', ')} is cut once the count shows`);
    });
  }

  for (const width of [390, 820]) {
    for (const look of LOOKS) {
      await open({ name: 'count, larger text', width, look }, async (page, context, check) => {
        await withNew(page, '/settings/', { motion: motionAlerts(3) });
        await historyReads(page, width, 'History 3');
        await largerText(page);
        if (width === 390) {
          const seen = await page.evaluate(() => {
            const bar = document.querySelector('nav.phone-bar');
            const place = bar?.querySelector('a[href^="/history"]');
            const word = place?.querySelector('.phone-bar__word');
            const number = word?.querySelector('.new-count .num');
            if (!bar || !word || !number) return null;
            const range = document.createRange();
            range.selectNodeContents(word.firstChild);
            const wordTop = range.getClientRects()[0]?.top ?? null;
            range.selectNodeContents(number);
            const numberTop = range.getClientRects()[0]?.top ?? null;
            return {
              wordTop, numberTop,
              places: [...bar.querySelectorAll('a')].map((a) => {
                const words = a.querySelector('.phone-bar__word') || a;
                return { word: words.textContent.trim(), top: a.getBoundingClientRect().top, cut: words.scrollWidth > words.clientWidth + 0.5 };
              }),
            };
          });
          if (!seen) {
            check(false, 'History in the phone bar shows no count');
            return;
          }
          const apart = seen.wordTop === null || seen.numberTop === null ? Infinity : Math.abs(seen.wordTop - seen.numberTop);
          check(apart <= 2, `the count's top is ${apart.toFixed(1)} px from History's word's`);
          const tops = seen.places.map((place) => place.top);
          check(Math.max(...tops) - Math.min(...tops) <= 0.5, `the places' tops are ${tops.map((top) => top.toFixed(1)).join(', ')} px`);
          for (const place of seen.places) check(!place.cut, `${place.word} is cut`);
        } else {
          const row = await page.evaluate(readRow);
          if (!row) throw new Error('no app header');
          check(Math.max(...row.items.map((item) => item.top)) < Math.min(...row.items.map((item) => item.bottom)), 'the row is more than one line');
          for (const item of row.items) {
            check(!item.cut, `${item.name} is cut`);
            check(item.lines === 1, `${item.name}'s words break over ${item.lines} lines`);
          }
          const counted = row.items.find((item) => item.kind === 'link' && item.name === 'History, 3 new alerts');
          check(!!counted, `the row's History is named ${row.items.filter((item) => item.kind === 'link').map((item) => `"${item.name}"`).join(', ')}, with no "History, 3 new alerts"`);
          const more = row.items.some((item) => item.kind === 'more');
          check(Number(row.fold) < 2 || more, `the row folded to ${row.fold} and shows no More`);
        }
      });
    }
  }

  // Setup, the two steps: step 1 left by Continue without the camera, the use
  // given by its name. Returns setup's main, as the six-step helper did.
  const STEP1_H1 = 'Use this device to watch a place';
  const STEP2_H1 = 'What is it watching?';
  const heading = (page, name) => page.getByRole('heading', { level: 1, name, exact: true });
  const throughSetup = async (page, use) => {
    const step = page.locator('#main-content main');
    await heading(page, STEP1_H1).waitFor({ timeout: 20_000 });
    await step.getByRole('button', { name: 'Continue without the camera', exact: true }).click();
    await heading(page, STEP2_H1).waitFor({ timeout: 10_000 });
    await step.getByRole('radio', { name: use, exact: true }).check();
    return step;
  };
  const lastKey = (page) => page.locator('#main-content main .setup-last-key');
  const onboardingOf = (page) => page.evaluate(() => (JSON.parse(localStorage.getItem('safeos-onboarding') || '{}').state || {}));
  const cameraOf = (page) => page.evaluate(() => (JSON.parse(localStorage.getItem('safeos-camera') || '{}').state || {}));
  const TRACK = { light: 'rgb(222, 226, 230)', dark: 'rgb(27, 40, 53)' };
  // The notice a device that has not answered it meets before its first
  // watch, and its own start key.
  const noticeStart = (page) => page.getByRole('dialog', { name: 'Each alert keeps a picture', exact: true }).getByRole('button', { name: 'Start watching', exact: true });

  // The camera's permission as the browser reports it, and a way for a walk
  // to change it, as a person does in the site's settings.
  const CAMERA_STATUS = (state) => {
    const listeners = new Set();
    const status = {
      state,
      onchange: null,
      addEventListener: (type, listener) => { if (type === 'change') listeners.add(listener); },
      removeEventListener: (type, listener) => { listeners.delete(listener); },
    };
    window.__setCameraState = (next) => {
      status.state = next;
      const event = new Event('change');
      if (typeof status.onchange === 'function') status.onchange(event);
      listeners.forEach((listener) => listener(event));
    };
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (asked) => (asked && asked.name === 'camera' ? Promise.resolve(status) : query(asked));
  };
  // A browser with no camera request on the page.
  const NO_CAMERA_REQUEST = () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, get: () => undefined });
  };
  const settingsOf = (page) => page.evaluate(() => (JSON.parse(localStorage.getItem('safeos-settings') || '{}').state || {}));
  const pathOf = (page) => new URL(page.url()).pathname.replace(/\/$/, '') || '/';

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------
  // Setup's last key names where its press goes: the way whose row on the
  // dashboard opened setup, or the dashboard, and it opens that page once. A
  // use applies the Motion and sound setting it stands for, and a second run
  // that chooses another use applies that one at the last key.

  // The address once it reads `path`, or after `ms`.
  const reaches = (page, path, ms) => page.waitForURL((url) => (url.pathname.replace(/\/$/, '') || '/') === path, { timeout: ms }).catch(() => {});

  await open({ name: 'setup, a way named', width: 390, look: 'light' }, async (page, context, check) => {
    await visit(page, '/setup/?next=lost-found');
    await throughSetup(page, 'A pet');
    const key = lastKey(page);
    const reads = plain(await key.innerText());
    if (reads !== 'Open Lost and Found') {
      check(false, `the last key reads "${reads}", not "Open Lost and Found"`);
      return;
    }
    check((await page.getByRole('button', { name: /Launch Dashboard/ }).count()) === 0, 'a button reads "Launch Dashboard"');
    await key.click();
    await reaches(page, '/lost-found', 20_000);
    check(pathOf(page) === '/lost-found', `the last key opens ${pathOf(page)}, not /lost-found`);
    await page.waitForTimeout(2_000);
    check(pathOf(page) === '/lost-found', `two seconds after the last key the address is ${pathOf(page)}, not /lost-found`);
    await visit(page, '/setup/');
    await reaches(page, '/dashboard', 10_000);
    check(pathOf(page) === '/dashboard', `setup opened again on this device ends on ${pathOf(page)}, not /dashboard`);
  }, { state: 'new' });

  await open({ name: 'setup, the dashboard named', width: 1280, look: 'dark' }, async (page, context, check) => {
    await visit(page, '/setup/');
    await throughSetup(page, 'A pet');
    const key = lastKey(page);
    const reads = plain(await key.innerText());
    if (reads !== 'Open dashboard') {
      check(false, `the last key reads "${reads}", not "Open dashboard"`);
      return;
    }
    await key.click();
    await reaches(page, '/dashboard', 20_000);
    check(pathOf(page) === '/dashboard', `the last key opens ${pathOf(page)}, not /dashboard`);
  }, { state: 'new' });

  await open({ name: "setup, a use's setting", width: 390, look: 'light' }, async (page, context, check) => {
    const holds = async (when, preset, motion) => {
      const saved = await settingsOf(page);
      const seen = { preset: saved.activePresetId, motion: saved.globalSettings ? saved.globalSettings.motionSensitivity : undefined };
      check(seen.preset === preset && seen.motion === motion, `${when} the saved setting is ${seen.preset} at ${seen.motion}, not ${preset} at ${motion}`);
    };
    // The last key, whatever it reads, and the page it opens.
    const finish = async (when) => {
      await lastKey(page).click();
      await reaches(page, '/dashboard', 20_000);
      check(pathOf(page) === '/dashboard', `${when} the last key opens ${pathOf(page)}, not /dashboard`);
    };

    await visit(page, '/setup/');
    await throughSetup(page, 'A baby');
    await holds('with the baby use, before the last key,', 'infant_sleep', 98);
    await finish('with the baby use,');
    await holds('with the baby use, after the last key,', 'infant_sleep', 98);

    await visit(page, '/setup/?again=1');
    await throughSetup(page, 'An elderly relative');
    await holds('run again with the elderly use, before the last key,', 'infant_sleep', 98);
    await finish('run again with the elderly use,');
    await holds('run again with the elderly use, after the last key,', 'maximum', 80);
  }, { state: 'new' });

  // Holds each database's answer for three seconds, so every read of the saved
  // alerts and pets waits, as on a slow device.
  const HOLD_STORES = () => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      const request = open.apply(this, args);
      request.addEventListener('success', (event) => {
        event.stopImmediatePropagation();
        setTimeout(() => request.dispatchEvent(new Event('success')), 3000);
      }, { once: true });
      return request;
    };
  };

  // The browser's answers for the camera and for notifications on this site,
  // given here: a headless browser has no prompt to refuse.
  const CAMERA_ANSWER = (state) => {
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (asked) => (asked && asked.name === 'camera'
      ? Promise.resolve({ state, onchange: null, addEventListener() {}, removeEventListener() {} })
      : query(asked));
  };
  const NOTIFICATIONS_ANSWER = (state) => {
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => state });
    window.__notificationAsks = 0;
    Notification.requestPermission = async () => {
      window.__notificationAsks += 1;
      return state;
    };
  };

  // What a device remembers of its last watch, as the way pages write it.
  const remember = (page, { way, pet, session }) => page.evaluate((kept) => {
    if (kept.way) localStorage.setItem('safeos-last-way', JSON.stringify(kept.pet ? { way: kept.way, pet: kept.pet } : { way: kept.way }));
    if (kept.session) localStorage.setItem('safeos-watch-session', JSON.stringify(kept.session));
  }, { way, pet, session });
  const clockAt = (page, at) => page.evaluate((t) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(t)), at);
  const lineOf = (page) => page.locator('#dash-line').innerText().then(plain);

  // The first screen as a person sees it at 390 by 844, the phone bar
  // included; what stands behind the bar is not seen. The mark is the brand's
  // own drawing, counted as a picture is, and so are the small pictures of
  // the settings list's rows (their meters, volume bar, quiet band and pet's
  // photo); the skip link stands off screen until it has focus: none counts.
  // Setup's walks count inside a root of their own, with their own bar, and
  // name the parts whose parent's box holds them and the drawings counted as
  // one box each.
  const firstScreen = (page, { root = 'body', bar: barAt = 'nav.phone-bar', inside = '.drawn-frame, .key--solid', drawn = '' } = {}) => page.evaluate(({ root, barAt, inside, drawn }) => {
    const foot = window.innerHeight;
    const bar = document.querySelector(barAt);
    const barTop = bar ? bar.getBoundingClientRect().top : foot;
    const ground = getComputedStyle(document.querySelector('.app-shell')).backgroundColor;
    const clear = 'rgba(0, 0, 0, 0)';
    const seen = (el) => {
      if (el.closest('.sr-only, .skip-link, .site-mark, .set-pic, .set-pic-pet')) return false;
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const limit = bar && bar.contains(el) ? foot : barTop;
      return box.width >= 2 && box.height >= 2 && box.top < limit && box.bottom > 0
        && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
    };
    const parts = [...(document.querySelector(root) || document.body).querySelectorAll('*')].filter(seen);
    const controls = parts.filter((el) => el.matches('a[href], button'))
      .map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim());
    const styles = new Set();
    const colours = new Set();
    const boxes = [];
    for (const el of parts) {
      const style = getComputedStyle(el);
      if ([...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) {
        styles.add([style.fontFamily.split(',')[0].trim(), style.fontWeight, style.fontSize, style.color].join(' '));
        colours.add(style.color);
      }
      const edges = ['Top', 'Right', 'Bottom', 'Left']
        .filter((side) => parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== 'none');
      for (const side of edges) colours.add(style[`border${side}Color`]);
      if (style.backgroundColor !== clear) colours.add(style.backgroundColor);
      const filled = style.backgroundColor !== clear && style.backgroundColor !== ground;
      const shadow = style.boxShadow === 'none' ? null : (style.boxShadow.match(/rgba?\([^)]*\)/) || [null])[0];
      if (shadow) colours.add(shadow);
      // A drawing's colours are those of its shapes. Its <svg> root and its
      // groups paint nothing, whatever fill they would hand down.
      if (el instanceof SVGGeometryElement) {
        if (style.fill !== 'none') colours.add(style.fill);
        if (style.stroke !== 'none') colours.add(style.stroke);
      }
      const before = getComputedStyle(el, '::before');
      const marked = before.content !== 'none' && before.backgroundColor !== clear;
      if (marked) colours.add(before.backgroundColor);
      if (drawn && el.matches(drawn)) {
        boxes.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
      } else if ((edges.length || filled || shadow || marked) && !el.parentElement.closest(inside)) {
        boxes.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${marked ? '::before' : ''}`);
      }
    }
    return { controls, styles: [...styles], colours: [...colours], boxes };
  }, { root, barAt, inside, drawn });

  // ---------------------------------------------------------------------------
  // The dashboard
  // ---------------------------------------------------------------------------
  // One page on every device: whether it watches and its one key, the four
  // ways to watch, and the alerts since the person last looked. Before setup
  // the key is Start setup and each row opens setup with its way named; the
  // page never forwards to setup and nothing opens over it.

  const STATEMENT = 'SafeOS adds an alert. It does not replace a person nearby. A phone or a browser can sleep, lose power or drop the camera, so stay within reach.';
  const BEFORE_SETUP = 'Set up this device first. Setup asks for the camera and the microphone.';
  const MOTION_LINE = 'Start watching uses Motion and sound.';
  const NOTHING_NEW = 'Nothing new since you last looked.';
  const FORGETS = 'This browser forgets SafeOS when the window closes. Your settings and alerts last for this visit.';
  const NOTIFICATIONS_BLOCKED = 'Alerts show in this tab only. Notifications are blocked for safeos.sh in this browser.';
  const OUT_OF_ROOM = "This device is out of room, so new alerts and pictures cannot be saved. Free room on the device, or clear SafeOS's saved data in Settings.";
  const NEEDS_SCRIPT_WORDS = 'SafeOS needs JavaScript to watch. Turn it on for safeos.sh, then reload this page.';
  const NEEDS_CONNECTION = 'Needs a connection the first time.';
  const CAMERA_WORDS = {
    blocked: "The camera is blocked for safeos.sh in this browser. Allow it in the site's settings, then press Start watching.",
    inUse: 'The camera is in use by another tab or app. Close it, then press Start watching.',
    failed: 'The camera did not start. Press Start watching to try again.',
  };
  const WAY_ROWS = ['Motion and sound', 'Lost and Found', 'People', 'Wildlife'];
  const WAY_PATHS = ['/monitor', '/lost-found', '/security', '/wildlife'];
  const WAY_IDS = ['monitor', 'lost-found', 'security', 'wildlife'];
  const isGrotesk = (family) => /Space_Grotesk|Space Grotesk/i.test(face(family));

  // The watching state, once it shows; a finding names what the address
  // showed instead. Then the device's setup record and saved pets are read.
  const stateShown = async (page) => {
    const which = await whichDashboard(page).catch((err) => err.message.split('\n')[0]);
    if (which === 'earlier') throw new Error('the page shows the earlier dashboard, with Quick Actions, not the watching state');
    if (which !== 'redesigned') throw new Error(which);
  };
  const dashRead = (page) => page.locator('section.dash-state[data-read="yes"]').waitFor({ state: 'attached', timeout: 20_000 })
    .catch(() => { throw new Error('the dashboard did not finish reading this device within 20 seconds'); });
  const openDash = async (page) => {
    await visit(page, '/dashboard/');
    await stateShown(page);
    await dashRead(page);
  };
  const startKey = (page) => page.locator('.dash-key-place .dash-key');
  // The dashboard's own Start setup. Before setup the footer's start link
  // reads Start setup too, so a walk names the one it presses.
  const setupKey = (page) => page.locator('main.dash').getByRole('link', { name: 'Start setup', exact: true });
  // The key's words, its aria-disabled and how it is drawn.
  const keyState = (page) => page.evaluate(() => {
    const key = document.querySelector('.dash-key-place .dash-key');
    if (!key) return { words: 'no key', disabled: null, background: null, color: null, edges: [] };
    const style = getComputedStyle(key);
    return {
      words: (key.textContent || '').replace(/\s+/g, ' ').trim(),
      disabled: key.getAttribute('aria-disabled'),
      background: style.backgroundColor,
      color: style.color,
      edges: ['Top', 'Right', 'Bottom', 'Left'].map((side) => `${style[`border${side}Width`]} ${style[`border${side}Style`]} ${style[`border${side}Color`]}`),
    };
  });
  // An element's words as a reader takes them, or null when it is not there.
  const wordsAt = (page, selector) => page.evaluate((s) => {
    const element = document.querySelector(s);
    return element ? (element.textContent || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim() : null;
  }, selector);
  // True once the element reads `wanted`, false after `ms`.
  const waitWords = (page, selector, wanted, ms = 10_000) => page.waitForFunction(({ s, w }) => {
    const element = document.querySelector(s);
    return !!element && (element.textContent || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim() === w;
  }, { s: selector, w: wanted }, { timeout: ms }).then(() => true, () => false);
  // The sentences of a part that say what stands in the way, each with
  // whether the problem glyph stands before its words.
  const problemsOf = (page, part = '.dash-problems') => page.evaluate((s) => [...document.querySelectorAll(`${s} p.dash-problem`)].map((p) => ({
    words: (p.textContent || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim(),
    glyph: !!p.firstElementChild && p.firstElementChild.matches('svg.problem-mark'),
  })), part);
  const saysProblem = (page, wanted, part = '.dash-problems', ms = 10_000) => page.waitForFunction(({ s, w }) => [...document.querySelectorAll(`${s} p.dash-problem`)]
    .some((p) => (p.textContent || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim() === w), { s: part, w: wanted }, { timeout: ms }).then(() => true, () => false);
  // The sentence `wanted` in the part, after the problem glyph.
  const checkProblem = async (page, check, wanted, part = '.dash-problems', when = '') => {
    const said = await saysProblem(page, wanted, part);
    if (!said) {
      const held = (await problemsOf(page, part)).map((p) => `"${p.words}"`).join(', ') || 'nothing';
      check(false, `${when}${part} does not say "${wanted}"; it holds ${held}`);
      return false;
    }
    const sentence = (await problemsOf(page, part)).find((p) => p.words === wanted);
    check(sentence && sentence.glyph, `${when}"${wanted}" does not follow the problem glyph`);
    return true;
  };
  // Where Help's entry stands once the page has scrolled to it.
  const helpEntryInView = async (page, check, title) => {
    const heading = page.getByRole('heading', { name: title, exact: true });
    const shown = await heading.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
    check(shown, `${new URL(page.url()).pathname}${new URL(page.url()).hash} shows no heading "${title}"`);
    if (!shown) return;
    await scrollSettled(page);
    const seen = await heading.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const header = document.querySelector('header.app-header')?.getBoundingClientRect();
      const bar = document.querySelector('nav.phone-bar');
      const barBox = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect() : null;
      return {
        top: box.top,
        bottom: box.bottom,
        headerFoot: header ? header.bottom : 0,
        screenFoot: barBox && barBox.height > 0 ? barBox.top : window.innerHeight,
      };
    });
    check(seen.top >= seen.headerFoot - 0.5, `"${title}" starts ${Math.round(seen.top)} px from the top, above the header's foot at ${Math.round(seen.headerFoot)} px`);
    check(seen.bottom <= seen.screenFoot + 0.5, `"${title}" ends ${Math.round(seen.bottom)} px from the top, past the screen's foot at ${Math.round(seen.screenFoot)} px`);
  };
  // A press on a control that opens a page; the address once it reads `to`.
  const pressTo = async (page, locator, to, ms = 20_000) => {
    await locator.click();
    await reaches(page, to, ms);
  };
  // A history step back or forward, which the app's router answers in the page.
  const back = async (page) => { await page.goBack({ waitUntil: 'commit', timeout: 15_000 }).catch(() => {}); };
  const forward = async (page) => { await page.goForward({ waitUntil: 'commit', timeout: 15_000 }).catch(() => {}); };
  // The watch's frame: the panel at 16:9 inside four ticks, Start watching
  // inside it, the camera menu under it; a start shows "Starting the camera…"
  // and Cancel, then the live picture and Stop watching; a refused camera is
  // named inside the frame with Try again.
  const frameReading = (page) => page.evaluate(() => {
    const frame = document.querySelector('.watch-frame');
    if (!frame) return null;
    const box = frame.getBoundingClientRect();
    const ticks = [...frame.querySelectorAll('.corner-ticks > i')].filter((tick) => {
      const style = getComputedStyle(tick);
      return parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) >= 2 && tick.getBoundingClientRect().width > 0;
    }).length;
    const key = (name) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === name);
    const start = key('Start watching');
    const stop = key('Stop watching');
    const picker = document.querySelector('.watch-grid__controls select');
    const inside = (part) => {
      if (!part) return false;
      const own = part.getBoundingClientRect();
      return own.left >= box.left - 0.5 && own.right <= box.right + 0.5 && own.top >= box.top - 0.5 && own.bottom <= box.bottom + 0.5;
    };
    return {
      ratio: box.width / box.height,
      width: box.width,
      height: box.height,
      ticks,
      startHeight: start ? start.getBoundingClientRect().height : null,
      startInside: inside(start),
      stopHeight: stop ? stop.getBoundingClientRect().height : null,
      pickerUnder: !!picker && picker.getBoundingClientRect().top >= box.bottom - 0.5,
      video: inside(frame.querySelector('video')),
    };
  });
  for (const look of LOOKS) {
    for (const width of [390, 1280]) {
      await open({ name: 'watch, the frame', width, look }, async (page, context, check) => {
        await visit(page, '/monitor/');
        const rest = await frameReading(page);
        check(rest, `at ${width} px /monitor/ has no camera frame`);
        if (!rest) return;
        check(Math.abs(rest.width - rest.height * 16 / 9) <= 1, `at ${width} px the frame is ${rest.width.toFixed(1)} by ${rest.height.toFixed(1)} px, not 16:9`);
        check(rest.ticks === 4, `at ${width} px the frame draws ${rest.ticks} corner ticks, not 4`);
        check(rest.startHeight !== null && rest.startHeight >= 51.5, `at ${width} px Start watching is ${rest.startHeight} px tall, not 52`);
        check(rest.startInside, `at ${width} px Start watching is not inside the frame`);
        check(rest.pickerUnder, `at ${width} px the camera menu is not under the frame`);

        const savedAt = Date.now() - 60_000;
        await seedAlerts(page, { motion: [{ id: `motion-${savedAt}-kept`, at: savedAt }] });
        const savedTime = await page.evaluate((at) => new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(at), savedAt);
        await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
        // The request is held until both keys of the start are read.
        await page.evaluate(() => { window.__camera.held = new Promise((resolve) => { window.__camera.release = resolve; }); });
        await page.getByRole('button', { name: 'Start watching', exact: true }).click();
        const starting = await page.getByRole('button', { name: 'Starting the camera…', exact: true }).waitFor({ timeout: 10_000 }).then(() => true, () => false);
        check(starting, `at ${width} px a press does not show "Starting the camera…"`);
        const cancel = await page.getByRole('button', { name: 'Cancel', exact: true }).count();
        check(cancel === 1, `at ${width} px while the camera starts there are ${cancel} keys named Cancel, not 1`);
        await page.evaluate(() => { window.__camera.release(); window.__camera.held = null; });
        await page.getByRole('button', { name: 'Stop watching', exact: true }).waitFor({ timeout: 20_000 });
        const live = await frameReading(page);
        check(live?.video, `at ${width} px the live picture is not inside the frame`);
        check(live?.stopHeight !== null && live?.stopHeight >= 51.5, `at ${width} px Stop watching is ${live?.stopHeight} px tall, not 52`);
        await page.getByRole('button', { name: 'Stop watching', exact: true }).click();
        const back = await page.getByRole('button', { name: 'Start watching', exact: true }).waitFor({ timeout: 10_000 }).then(() => true, () => false);
        check(back, `at ${width} px Stop watching does not give Start watching back`);
        const kept = await page.locator('[data-alert-card]').getByText(`Motion at ${savedTime}`, { exact: true }).count();
        check(kept > 0, `at ${width} px the saved alert leaves the list when the watch stops`);

        await context.addInitScript(CAMERA_ANSWER, 'denied');
        await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
        await page.evaluate(() => { window.__camera.answer = 'NotAllowedError'; });
        await page.getByRole('button', { name: 'Start watching', exact: true }).click();
        const blocked = page.locator('.watch-frame').getByText(
          'The browser blocked the camera for this site. To allow it, open the site settings from the address bar, set Camera to Allow, then press Try again.',
          { exact: true },
        );
        check(await blocked.waitFor({ timeout: 10_000 }).then(() => true, () => false), `at ${width} px a refused camera is not named inside the frame`);
        const tryAgain = await page.locator('.watch-frame').getByRole('button', { name: 'Try again', exact: true }).count();
        check(tryAgain === 1, `at ${width} px a refused camera shows ${tryAgain} keys named Try again inside the frame`);
      }, { script: FAKE_CAMERA });
    }

    await open({ name: 'watch, another tab', width: 1280, look }, async (page, context, check) => {
      await visit(page, '/monitor/');
      await page.getByRole('button', { name: 'Start watching', exact: true }).click();
      await page.getByRole('button', { name: 'Stop watching', exact: true }).waitFor({ timeout: 20_000 });
      const second = await context.newPage();
      await visit(second, '/monitor/');
      const says = await second.locator('.watch-frame').getByText('Watching in another tab', { exact: true }).waitFor({ timeout: 5_000 }).then(() => true, () => false);
      check(says, 'a second /monitor/ does not show "Watching in another tab" over its frame');
      await second.getByRole('button', { name: 'Start watching', exact: true }).click();
      const asked = await theQuestion(second).waitFor({ timeout: 5_000 }).then(() => true, () => false);
      check(asked, `Start watching, while another tab watches, showed no dialog named "${QUESTION}"`);
      if (!asked) return;
      // The watch page's question names its second key: Keep the other tab.
      const keys = (await theQuestion(second).getByRole('button').allTextContents()).map(plain);
      check(keys.join(' | ') === 'Watch here | Keep the other tab', `the dialog's keys read ${keys.map((key) => `"${key}"`).join(', ')}, not "Watch here" then "Keep the other tab"`);
      const first = await focusedOn(second);
      check(first === 'Keep the other tab', `focus starts on "${first}", not on Keep the other tab`);
      await second.keyboard.press('Escape');
      check(await gone(theQuestion(second)), 'Escape left the dialog open');
      const back = await focusedOn(second);
      check(back === 'Start watching', `after Escape focus is on "${back}", not Start watching`);
    }, { script: FAKE_CAMERA });

    // Try again after a failed start asks first while another tab watches,
    // as Start watching does, and asks for no camera before the answer.
    await open({ name: 'watch, Try again while another tab watches', width: 390, look }, async (page, context, check) => {
      await visit(page, '/monitor/');
      await page.evaluate(() => { window.__camera.answer = 'NotAllowedError'; });
      await page.getByRole('button', { name: 'Start watching', exact: true }).click();
      const tryAgain = page.getByRole('button', { name: 'Try again', exact: true });
      await tryAgain.waitFor({ timeout: 20_000 });
      const second = await context.newPage();
      await visit(second, '/monitor/');
      await second.getByRole('button', { name: 'Start watching', exact: true }).click();
      await second.getByRole('button', { name: 'Stop watching', exact: true }).waitFor({ timeout: 20_000 });
      const requests = await cameraRequests(page);
      await tryAgain.click();
      const asked = await theQuestion(page).waitFor({ timeout: 5_000 }).then(() => true, () => false);
      check(asked, `Try again, while another tab watches, showed no dialog named "${QUESTION}"`);
      check((await cameraRequests(page)) === requests, 'Try again asked for the camera before the question was answered');
      await page.screenshot({ path: path.join(outDir, `watch-try-again-other-tab-390-${look}.png`) });
      await second.close();
    }, { script: FAKE_CAMERA });

    // A microphone lost while watching is named beside Sound, and the watch goes on.
    await open({ name: 'watch, a microphone lost while watching', width: 390, look }, async (page, context, check) => {
      await visit(page, '/monitor/');
      await page.getByRole('button', { name: 'Start watching', exact: true }).click();
      await page.getByRole('button', { name: 'Stop watching', exact: true }).waitFor({ timeout: 20_000 });
      const ended = await page.evaluate(() => {
        const tracks = window.__camera.live.flatMap((stream) => stream.getAudioTracks());
        for (const track of tracks) {
          track.stop();
          track.dispatchEvent(new Event('ended'));
        }
        return tracks.length;
      });
      check(ended > 0, 'the watch holds no microphone to lose');
      const words = 'No microphone found. Sound alerts are off. Connect a microphone, then stop and start watching.';
      const named = await page.locator('.watch-meters').getByText(words, { exact: true }).waitFor({ timeout: 10_000 }).then(() => true, () => false);
      check(named, `a microphone lost while watching is not named beside Sound as "${words}"`);
      check(await page.getByRole('button', { name: 'Stop watching', exact: true }).isVisible(), 'the watch stopped when the microphone was lost');
      await page.locator('.watch-frame').screenshot({ path: path.join(outDir, `watch-microphone-lost-390-${look}.png`) });
    }, { script: FAKE_CAMERA });
  }

  // The watch's meters: inside the ticks, one row each on a phone, side by
  // side from a tablet, each name and state word on one line at a desktop;
  // the words 16 px or more, names at 12:1 and state words at 7:1 on their
  // ground; no sideways scroll at 320 px.
  const meterReading = (page) => page.evaluate(() => {
    const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
    const lum = ([r, g, b]) => {
      const part = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * part(r) + 0.7152 * part(g) + 0.0722 * part(b);
    };
    const ground = (element) => {
      for (let part = element; part; part = part.parentElement) {
        const colour = rgb(getComputedStyle(part).backgroundColor);
        if (colour.length === 3 || (colour.length === 4 && colour[3] > 0.5)) return colour;
      }
      return rgb(getComputedStyle(document.body).backgroundColor);
    };
    const ratio = (element) => {
      const a = lum(rgb(getComputedStyle(element).color));
      const b = lum(ground(element));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const frame = document.querySelector('.watch-frame')?.getBoundingClientRect();
    const strip = document.querySelector('.watch-meters')?.getBoundingClientRect();
    const meters = [...document.querySelectorAll('.watch-meter:not(.watch-meter--pet)')].map((meter) => {
      const name = meter.querySelector('.watch-meter__name');
      const state = meter.querySelector('.watch-meter__state');
      const track = meter.querySelector('[role="meter"]');
      const box = (part) => part?.getBoundingClientRect();
      const middle = (part) => { const b = box(part); return b ? b.top + b.height / 2 : null; };
      return {
        name: name?.textContent.trim() ?? '',
        top: box(meter).top,
        sameLine: name && state ? Math.abs(middle(name) - middle(state)) <= 1 : false,
        trackUnder: name && track ? box(track).top >= box(name).bottom - 0.5 : false,
        sizes: [name, state].filter(Boolean).map((part) => parseFloat(getComputedStyle(part).fontSize)),
        nameRatio: name ? ratio(name) : 0,
        stateRatio: state ? ratio(state) : 0,
      };
    });
    return {
      inside: !!frame && !!strip && strip.left >= frame.left - 0.5 && strip.right <= frame.right + 0.5 && strip.bottom <= frame.bottom + 0.5 && strip.top >= frame.top - 0.5,
      meters,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  // A meter stands empty until its own first reading (Motion's needs two
  // pictures to compare), so the walks wait until every meter has its state
  // word or its problem line.
  const everyMeterRead = (page) => page.waitForFunction(() => {
    const meters = [...document.querySelectorAll('.watch-meter:not(.watch-meter--pet)')];
    return meters.length > 0 && meters.every((meter) => meter.querySelector('.watch-meter__state, .watch-meter__problem'));
  }, null, { timeout: 10_000 }).catch(() => {});
  for (const look of LOOKS) {
    for (const width of [320, 390, 820, 1024, 1280, 1920]) {
      await open({ name: 'watch, the meters', width, look }, async (page, context, check) => {
        await visit(page, '/monitor/');
        await page.getByRole('button', { name: 'Start watching', exact: true }).click();
        await page.getByRole('button', { name: 'Stop watching', exact: true }).waitFor({ timeout: 20_000 });
        await everyMeterRead(page);
        const read = await meterReading(page);
        check(read.meters.length > 0, `at ${width} px the live picture shows no meter`);
        const names = read.meters.map((meter) => meter.name);
        for (const kind of ['Motion', 'Sound']) check(names.includes(kind), `at ${width} px the live picture has no meter ${kind} (${names.join(', ') || 'none'})`);
        check(read.inside, `at ${width} px the meters' strip is not inside the frame`);
        if (width === 320) check(read.sideways === 0, `at 320 px /monitor/ scrolls ${read.sideways} px sideways while watching`);
        for (const meter of read.meters) {
          if (width === 390 || width === 1280) check(meter.sameLine, `at ${width} px the meter ${meter.name} has its name and state word on two lines`);
          if (width === 390) check(meter.trackUnder, `at 390 px the meter ${meter.name} has its bar beside its name, not under it`);
          check(meter.sizes.every((size) => size >= 15.5), `at ${width} px the meter ${meter.name} has words of ${meter.sizes.join(', ')} px`);
          check(meter.nameRatio >= 12, `at ${width} px the name ${meter.name} stands at ${meter.nameRatio.toFixed(2)}:1, under 12:1`);
          check(meter.stateRatio >= 7, `at ${width} px the state word of ${meter.name} stands at ${meter.stateRatio.toFixed(2)}:1, under 7:1`);
        }
        // From 1024 px each name keeps one line beside its longest state word,
        // "Over the line", written into every meter at once.
        if (width >= 1024) {
          const longest = await page.evaluate(() => [...document.querySelectorAll('.watch-meter:not(.watch-meter--pet)')].map((meter) => {
            const name = meter.querySelector('.watch-meter__name');
            const state = meter.querySelector('.watch-meter__state');
            if (state) state.textContent = 'Over the line';
            return {
              name: name?.textContent.trim() ?? '',
              oneLine: name ? name.getBoundingClientRect().height <= parseFloat(getComputedStyle(name).lineHeight) * 1.5 : false,
            };
          }));
          for (const meter of longest) check(meter.oneLine, `at ${width} px the meter's name ${meter.name} breaks onto two lines beside "Over the line"`);
        }
        if (width === 820) {
          const tops = read.meters.map((meter) => Math.round(meter.top));
          check(new Set(tops).size === 1, `at 820 px the meters do not stand side by side (tops ${tops.join(', ')})`);
        }
      }, { script: FAKE_CAMERA });
    }
  }

  // While watching on a phone the picture, the meters and Stop watching come
  // first, then the alert list: its heading and the newest entry's first line
  // stand in a 390 by 844 px screen, above the phone bar.
  const newestReading = (page) => page.evaluate(() => {
    const bar = document.querySelector('nav.phone-bar');
    const foot = bar ? bar.getBoundingClientRect().top : window.innerHeight;
    const heading = document.getElementById('watch-list-name');
    const body = document.querySelector('.watch-list__body');
    const stop = [...document.querySelectorAll('button')].find((key) => key.textContent.trim() === 'Stop watching');
    if (!heading || !body || !stop) return null;
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (node.textContent.trim() && !node.parentElement.closest('.sr-only') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    const first = walker.nextNode();
    let line = null;
    if (first) {
      const range = document.createRange();
      range.selectNodeContents(first);
      line = range.getClientRects()[0] ?? null;
    }
    const list = heading.closest('section') ?? heading;
    const top = stop.getBoundingClientRect().bottom;
    const between = [...document.querySelectorAll('.watch-grid select, .watch-grid label, .watch-grid p')]
      .filter((part) => !list.contains(part) && !part.closest('.sr-only'))
      .filter((part) => { const box = part.getBoundingClientRect(); return box.height > 0 && box.top >= top - 0.5 && box.bottom <= list.getBoundingClientRect().top + 0.5; })
      .map((part) => `"${(part.textContent || part.getAttribute('aria-label') || part.tagName).replace(/\s+/g, ' ').trim().slice(0, 48)}"`);
    return {
      foot,
      heading: heading.getBoundingClientRect().bottom,
      words: first ? first.textContent.trim() : '',
      line: line ? line.bottom : null,
      between,
    };
  });
  for (const look of LOOKS) {
    await open({ name: 'watch, the newest alert while watching', width: 390, height: 844, look }, async (page, context, check) => {
      await visit(page, '/monitor/');
      await page.getByRole('button', { name: 'Start watching', exact: true }).click();
      await page.getByRole('button', { name: 'Stop watching', exact: true }).waitFor({ timeout: 20_000 });
      const came = await page.locator('.watch-list__new').first().waitFor({ timeout: 20_000 }).then(() => true, () => false);
      check(came, 'no alert came while watching the changing picture');
      if (!came) return;
      await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
      await page.waitForTimeout(300);
      const read = await newestReading(page);
      check(read, '/monitor/ has no Stop watching, no heading "Alerts" or no list while watching');
      if (!read) return;
      const between = read.between.length ? `; between Stop watching and the list: ${read.between.join(', ')}` : '';
      check(read.heading <= read.foot + 0.5, `the heading "Alerts" ends at ${Math.round(read.heading)} px, under the phone bar at ${Math.round(read.foot)} px${between}`);
      check(read.line !== null && read.line <= read.foot + 0.5, `the newest entry's first line "${read.words}" ends at ${read.line === null ? 'no place' : `${Math.round(read.line)} px`}, under the phone bar at ${Math.round(read.foot)} px${between}`);
      await page.screenshot({ path: path.join(outDir, `watch-newest-alert-390-${look}.png`) });
    }, { script: FAKE_CAMERA });
  }

  // The watch's settings fold under one row below the alert list: the row is
  // 44 px tall, a press anywhere along it opens the settings in place, and
  // its key then reads Hide settings.
  const foldReading = (page) => page.evaluate(() => {
    const key = [...document.querySelectorAll('button')].find((button) => /^(Show|Hide) settings$/.test(button.textContent.trim()));
    const row = key?.closest('.watch-disclosure');
    const side = document.querySelector('.watch-grid__side');
    if (!key || !row || !side) return null;
    const box = row.getBoundingClientRect();
    return {
      key: key.textContent.trim(),
      expanded: key.getAttribute('aria-expanded'),
      top: box.top,
      bottom: box.bottom,
      left: box.left,
      right: box.right,
      height: box.height,
      underList: box.top >= side.getBoundingClientRect().bottom - 0.5,
      panelUnder: (() => {
        const panel = document.getElementById('watch-settings');
        return panel ? panel.getBoundingClientRect().top >= box.bottom - 0.5 : null;
      })(),
    };
  });
  for (const look of LOOKS) {
    for (const width of [390, 1280]) {
      await open({ name: 'watch, the settings', width, look }, async (page, context, check) => {
        await visit(page, '/monitor/');
        const rest = await foldReading(page);
        check(rest, `at ${width} px /monitor/ has no row for Settings for this watch with Show settings`);
        if (!rest) return;
        check(rest.key === 'Show settings' && rest.expanded === 'false', `at ${width} px the settings row reads "${rest.key}" with aria-expanded ${rest.expanded}, not Show settings, folded`);
        check(rest.underList, `at ${width} px the settings row is not under the alert list`);
        check(rest.height >= 43.5, `at ${width} px the settings row is ${rest.height.toFixed(1)} px tall, under 44`);
        // A press at the row's other end, on the heading's side, away from the key's words.
        await page.locator('.watch-disclosure').first().scrollIntoViewIfNeeded();
        const placed = await foldReading(page);
        await page.mouse.click(placed.left + 4, placed.top + placed.height / 2);
        const opened = await foldReading(page);
        check(opened?.key === 'Hide settings' && opened?.expanded === 'true', `at ${width} px a press at the settings row's other end leaves it reading "${opened?.key}"`);
        check(opened?.panelUnder === true, `at ${width} px the settings do not open in place under their row`);
      });
    }
  }

  const watchRuns = (page) => page.getByRole('button', { name: 'Stop watching', exact: true }).waitFor({ timeout: 20_000 }).then(() => true, () => false);

  // ---------------------------------------------------------------------------
  // The watch, read whole: its first screen, its words and sizes, its focus
  // order, larger text, reduced motion, its layouts, offline and the look.
  // ---------------------------------------------------------------------------
  const watchRead = (page) => page.locator('.watch-grid').waitFor({ timeout: 20_000 }).then(() => page.evaluate(() => document.fonts.ready));
  for (const look of LOOKS) {
    await open({ name: 'watch, the first screen', width: 390, look }, async (page, context, check) => {
      await visit(page, '/monitor/');
      await watchRead(page);
      const counted = await firstScreen(page);
      // The frame's four corner ticks are its drawing, as the dashboard's drawn
      // frame is; a fully clear colour paints nothing.
      counted.boxes = counted.boxes.filter((box) => box !== 'i.');
      counted.colours = counted.colours.filter((colour) => !/^rgba\(.*,\s*0\)$/.test(colour));
      check(counted.controls.length <= 8, `the first screen holds ${counted.controls.length} controls, over 8: ${counted.controls.map((name) => `"${name}"`).join(', ')}`);
      check(counted.styles.length <= 8, `the first screen sets its words in ${counted.styles.length} styles, over 8: ${counted.styles.join('; ')}`);
      check(counted.boxes.length <= 8, `the first screen draws ${counted.boxes.length} rules and boxes, over 8: ${counted.boxes.join(', ')}`);
      const most = look === 'dark' ? 7 : 8;
      check(counted.colours.length <= most, `the first screen uses ${counted.colours.length} colours, over ${most}: ${counted.colours.join(', ')}`);
      await page.screenshot({ path: path.join(outDir, `watch-first-screen-390-${look}.png`) });
    });

    for (const width of [320, 390, 768, 1100, 1440]) {
      for (const watching of [false, true]) {
        await open({ name: `watch, its words and sizes${watching ? ' while watching' : ''}`, width, look }, async (page, context, check) => {
          await visit(page, '/monitor/');
          await watchRead(page);
          if (watching) {
            await page.getByRole('button', { name: 'Start watching', exact: true }).click();
            await page.getByRole('button', { name: 'Stop watching', exact: true }).waitFor({ timeout: 20_000 });
            await everyMeterRead(page);
          }
          const watch = await page.$('main.watch');
          if (!watch) throw new Error('the page has no main.watch');
          const texts = await page.evaluate(measureText, watch);
          check(texts.length > 5, `only ${texts.length} pieces of the watch's text were measured`);
          const option = await page.evaluate(() => [...document.querySelectorAll('[role="radiogroup"] label')].flatMap((label) => [...label.querySelectorAll('*')].map((part) => part.textContent.trim())).filter(Boolean));
          for (const text of texts) {
            const where = `"${text.words}" (${text.tag})`;
            const least = option.includes(text.words) && width < 360 ? 15 : 16;
            check(text.size >= least - 0.5, `${where} is ${text.size} px, under ${least}`);
            check(!/mono/i.test(face(text.face)), `${where} is set in ${face(text.face)}`);
            check(['400', '600'].includes(text.weight) || text.tag === 'h1', `${where} has weight ${text.weight}, not 400 or 600`);
            const contrast = text.body ? 12 : 7;
            check(text.contrast >= contrast, `${where} has contrast ${text.contrast.toFixed(2)}, under ${contrast}`);
          }
          // The sentences read as body text: 18 px, 20 px from 1440.
          const body = width >= 1440 ? 20 : 18;
          const sentences = await page.evaluate(() => [...document.querySelectorAll('.watch-list__empty p, .watch-for__line')]
            .filter((element) => element.getBoundingClientRect().height > 0 && !element.closest('.sr-only'))
            .map((element) => ({ words: element.textContent.trim().slice(0, 40), size: parseFloat(getComputedStyle(element).fontSize) })));
          for (const sentence of sentences) check(Math.abs(sentence.size - body) < 0.5, `"${sentence.words}" is ${sentence.size} px, not ${body}`);
          // Every time and count in tabular figures.
          const figures = await page.evaluate(() => [...document.querySelectorAll('main.watch .num')]
            .filter((element) => !getComputedStyle(element).fontVariantNumeric.includes('tabular-nums'))
            .map((element) => element.textContent.trim()));
          check(figures.length === 0, `${figures.map((f) => `"${f}"`).join(', ')} not in tabular figures`);
          // The strokes of the bar's row and, while watching, of the strip, read
          // from their pixels: a part that cannot be pictured or measured fails.
          const scratch = await context.newPage();
          for (const [what, selector, needed] of [["the bar's row", '.watch-bar', true], ['the meters', '.watch-meters', watching]]) {
            const part = page.locator(selector).first();
            if (!(await part.count())) {
              check(!needed, `${what} is not on the page to measure`);
              continue;
            }
            const picture = await part.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' }).catch((err) => {
              check(false, `${what} could not be pictured: ${err.message.split('\n')[0]}`);
              return null;
            });
            if (!picture) continue;
            const read = await scratch.evaluate(readStrokes, picture.toString('base64'));
            check(read !== null, `${what} shows too few strokes to measure`);
            if (read) check(read.strokes >= 7, `${what} measures ${read.strokes.toFixed(2)}:1 on its strokes, under 7`);
          }
          await scratch.close();
        }, { script: FAKE_CAMERA });
      }
    }

    await open({ name: 'watch, focus', width: 390, look }, async (page, context, check) => {
      await visit(page, '/monitor/');
      await watchRead(page);
      await page.getByRole('button', { name: 'Start watching', exact: true }).click();
      await page.getByRole('button', { name: 'Stop watching', exact: true }).waitFor({ timeout: 20_000 });
      await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.skip-link')?.focus(); });
      const order = [];
      const rings = [];
      const under = [];
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        await scrollSettled(page);
        const seen = await page.evaluate(() => {
          const element = document.activeElement;
          if (!element || element === document.body) return null;
          const name = (element.getAttribute('aria-label') || element.labels?.[0]?.textContent || element.textContent || '').replace(/\s+/g, ' ').trim();
          const ringed = element.closest('.watch-disclosure') && element.matches('.watch-disclosure__key') ? element.closest('.watch-disclosure') : element;
          const style = getComputedStyle(ringed);
          const box = element.getBoundingClientRect();
          const bar = document.querySelector('nav.phone-bar');
          return {
            name,
            ring: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2 && parseFloat(style.outlineOffset) >= 2,
            underBar: !!bar && !bar.contains(element) && box.bottom > bar.getBoundingClientRect().top + 0.5,
          };
        });
        if (!seen) continue;
        order.push(seen.name);
        if (['Mute alerts', 'Stop watching', 'Show settings'].includes(seen.name) && !seen.ring) rings.push(seen.name);
        if (seen.underBar) under.push(seen.name);
        if (seen.name === 'Show settings') break;
      }
      const at = (name) => order.findIndex((seen) => seen === name || seen.startsWith(name));
      const wanted = ['Mute alerts', 'Motion and sound', 'Stop watching', 'Camera', 'Show settings'];
      const places = wanted.map(at);
      check(places.every((place) => place >= 0), `Tab does not reach ${wanted.filter((_, i) => places[i] < 0).join(', ')} (reached ${order.join(' > ')})`);
      check(places.every((place, i) => i === 0 || place > places[i - 1]), `Tab reaches them out of order: ${order.join(' > ')}`);
      check(rings.length === 0, `${rings.join(', ')} show no 2 px ring at a 2 px offset on focus`);
      check(under.length === 0, `${under.join(', ')} sit under the phone bar when focused`);
    }, { script: FAKE_CAMERA });

    await open({ name: 'watch, larger text', width: 390, look }, async (page, context, check) => {
      await visit(page, '/monitor/');
      await watchRead(page);
      await largerText(page);
      const frame = await page.evaluate(() => {
        const screen = document.querySelector('.watch-frame__screen')?.getBoundingClientRect();
        const parts = [...document.querySelectorAll('.watch-frame__drawn > *')].map((part) => part.getBoundingClientRect()).filter((box) => box.height > 0);
        if (!screen || parts.length === 0) return null;
        const overlaps = parts.some((a, i) => parts.some((b, j) => j > i && a.bottom > b.top + 0.5 && b.bottom > a.top + 0.5 && a.right > b.left + 0.5 && b.right > a.left + 0.5));
        return { held: parts.every((box) => box.top >= screen.top - 0.5 && box.bottom <= screen.bottom + 0.5), overlaps };
      });
      check(frame, 'at 200 per cent text the frame has no drawn parts');
      if (!frame) return;
      check(frame.held, 'at 200 per cent text the frame does not grow to hold Start watching and its lines');
      check(!frame.overlaps, 'at 200 per cent text the frame\'s key and lines overlap');
      const sideways = await sidewaysScroll(page);
      check(sideways === 0, `at 200 per cent text /monitor/ scrolls ${sideways} px sideways`);
    });

    await open({ name: 'watch, reduced motion', width: 390, look, reducedMotion: 'reduce' }, async (page, context, check) => {
      await visit(page, '/monitor/');
      await watchRead(page);
      // The camera answers after a minute, so the start stands while it is read.
      await page.evaluate(() => { window.__camera.waitMs = 60_000; });
      await page.getByRole('button', { name: 'Start watching', exact: true }).click();
      const starting = await page.getByRole('button', { name: 'Starting the camera…', exact: true }).waitFor({ timeout: 5_000 }).then(() => true, () => false);
      check(starting, 'a press does not show "Starting the camera…"');
      // The key and the bar read at one moment, while the camera starts.
      const read = await page.evaluate(() => {
        const stillStarting = [...document.querySelectorAll('button')].some((key) => key.textContent.trim() === 'Starting the camera…');
        const growing = document.querySelector('.watch-frame__starting');
        const style = growing ? getComputedStyle(growing) : null;
        return { stillStarting, bar: Boolean(style && style.display !== 'none' && style.animationName !== 'none') };
      });
      check(!starting || read.stillStarting, 'the camera finished starting before the bar was read');
      check(!read.bar, 'under reduced motion the frame shows a growing bar while the camera starts');
    }, { script: FAKE_CAMERA });

    for (const width of [768, 1024, 1440]) {
      await open({ name: 'watch, layouts', width, look }, async (page, context, check) => {
        await visit(page, '/monitor/');
        await watchRead(page);
        await page.getByRole('button', { name: 'Start watching', exact: true }).click();
        await page.getByRole('button', { name: 'Stop watching', exact: true }).waitFor({ timeout: 20_000 });
        const read = await page.evaluate(() => {
          const box = (selector) => document.querySelector(selector)?.getBoundingClientRect() ?? null;
          const heading = [...document.querySelectorAll('h2')].find((h) => h.textContent.trim() === 'Watch for')?.getBoundingClientRect() ?? null;
          const stop = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Stop watching')?.getBoundingClientRect() ?? null;
          return {
            heading,
            options: box('[role="radiogroup"]'),
            stop,
            camera: box('.watch-camera'),
            frame: box('.watch-grid__frame'),
            side: box('.watch-grid__side'),
            grid: box('.watch-grid'),
          };
        });
        if (!read.heading || !read.options || !read.frame || !read.grid) throw new Error('the watch has no bar, options, frame or grid');
        if (width === 768) {
          check(read.options.top >= read.heading.bottom - 0.5, 'at 768 px the options are not under the bar\'s row');
          if (read.stop && read.camera) {
            const sameRow = read.stop.top < read.camera.bottom && read.stop.bottom > read.camera.top;
            check(read.stop.right <= read.camera.left + 0.5 && sameRow, `at 768 px Stop watching does not stand beside the camera menu (Stop ${Math.round(read.stop.top)} to ${Math.round(read.stop.bottom)} px, the menu ${Math.round(read.camera.top)} to ${Math.round(read.camera.bottom)} px)`);
          } else check(false, 'at 768 px Stop watching or the camera menu is missing');
        } else {
          check(read.options.top < read.heading.bottom, `at ${width} px the options are not in the bar's row`);
          check(read.side && read.side.left >= read.frame.right - 0.5, `at ${width} px the alert list does not stand beside the picture`);
          const share = read.frame.width / read.grid.width;
          const want = width >= 1440 ? 7 / 12 : 8 / 12;
          check(Math.abs(share - want) <= 0.06, `at ${width} px the picture takes ${(share * 12).toFixed(1)} of 12 columns, not ${want * 12}`);
        }
      }, { script: FAKE_CAMERA });
    }

    await open({ name: 'watch, offline', width: 390, look }, async (page, context, check) => {
      await visitThenOffline(page, context, '/monitor/');
      await visit(page, '/monitor/');
      const seen = await shown(page);
      check(itsPage(seen) && seen.h1 === 'Motion and sound', `/monitor/ opened offline shows ${whatShows(seen)}`);
      await page.getByRole('button', { name: 'Start watching', exact: true }).click({ timeout: 15_000 }).catch(() => {});
      check(await watchRuns(page), 'offline, Start watching does not start the camera');
    }, { script: FAKE_CAMERA });

    await open({ name: 'watch, the look switch', width: 1280, look }, async (page, context, check) => {
      await visit(page, '/monitor/');
      await watchRead(page);
      const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      check((await ground()) === PAGE[look], `the watch's ground is ${await ground()}, not ${PAGE[look]}`);
      await page.locator('header.app-header button.look-switch').click();
      await page.waitForTimeout(300);
      check((await ground()) === PAGE[OTHER[look]], `after the header's look switch the watch's ground is ${await ground()}, not ${PAGE[OTHER[look]]}`);
    });
    await open({ name: 'watch, the look row', width: 390, look }, async (page, context, check) => {
      await visit(page, '/settings/');
      await page.locator(SETTINGS_LOOK_ROW).click({ timeout: 10_000 });
      await visit(page, '/monitor/');
      await watchRead(page);
      const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      check(ground === PAGE[OTHER[look]], `after Settings' look row the watch's ground is ${ground}, not ${PAGE[OTHER[look]]}`);
    });
  }

  const noCameraOn = (page, ms) => page.waitForFunction(() => window.__camera.live
    .filter((s) => s.getVideoTracks().some((t) => t.readyState === 'live')).length === 0, null, { timeout: ms }).then(() => true, () => false);
  // A pet saved on this device: removed, or put again with a change.
  const forgetPet = (page, id) => page.evaluate(async (petId) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('safeos-guardian');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('subject_profile', 'readwrite');
      tx.objectStore('subject_profile').delete(petId);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, id);
  const changePet = (page, id, change) => page.evaluate(async ({ petId, change: given }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('safeos-guardian');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise((resolve, reject) => {
      const read = db.transaction('subject_profile').objectStore('subject_profile').get(petId);
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('subject_profile', 'readwrite');
      tx.objectStore('subject_profile').put({ ...record, ...given });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, { petId: id, change });
  // Test Alerts' low alert, from the section headed Alert Simulation.
  const lowAlert = (page) => page.locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Alert Simulation', exact: true }) })
    .getByRole('button', { name: 'low', exact: true });
  // The frame's Dashboard where the width shows it.
  const dashboardLink = (page, width) => (width < 768
    ? page.locator('nav.phone-bar a').filter({ hasText: 'Dashboard' })
    : page.locator(headerLink('Dashboard')));
  // The first element of `selector` that has a box, and how opaque it is
  // drawn with every element round it; -1 when none has a box.
  const shownOpacity = (page, selector) => page.evaluate((s) => {
    const element = [...document.querySelectorAll(s)].find((el) => {
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    if (!element) return -1;
    let opacity = 1;
    for (let node = element; node; node = node.parentElement) opacity *= parseFloat(getComputedStyle(node).opacity);
    return opacity;
  }, selector);
  // Words in `main.dash` that run past their box.
  const cutIn = (page) => page.evaluate(() => {
    const cut = [];
    for (const element of document.querySelectorAll('main.dash *')) {
      if (![...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) continue;
      if (element.scrollWidth > element.clientWidth + 1) {
        cut.push(`${element.tagName.toLowerCase()}.${[...element.classList].join('.')} "${element.textContent.trim().slice(0, 40)}" (${element.scrollWidth} in ${element.clientWidth} px)`);
      }
    }
    return cut;
  });
  // The page's boxes of the three parts and the footer, from the page's top.
  const partsOf = (page) => page.evaluate(() => Object.fromEntries([
    ['the watching state', 'section.dash-state'], ['the ways', 'section.ways'], ['since you last looked', 'section.since'], ['the footer', '.app-shell__footer'],
  ].map(([name, selector]) => {
    const element = document.querySelector(selector);
    if (!element) return [name, null];
    const box = element.getBoundingClientRect();
    return [name, { top: box.top + window.scrollY, bottom: box.bottom + window.scrollY, left: box.left, right: box.right }];
  })));
  // The pairs of boxes that overlap.
  const meeting = (parts) => {
    const named = Object.entries(parts).filter(([, box]) => box);
    const met = [];
    for (let i = 0; i < named.length; i += 1) {
      for (let j = i + 1; j < named.length; j += 1) {
        const [a, one] = named[i];
        const [b, two] = named[j];
        const across = Math.min(one.right, two.right) - Math.max(one.left, two.left);
        const down = Math.min(one.bottom, two.bottom) - Math.max(one.top, two.top);
        if (across > 0.5 && down > 0.5) met.push(`${a} and ${b}`);
      }
    }
    return met;
  };

  // Four new alerts, one of each way, all within the last minute: newest
  // first the sighting, the person, Mittens, then the movement.
  const fourNew = (now = Date.now()) => ({
    pets: [{ id: 'pet-mittens', name: 'Mittens' }],
    motion: [{ id: 'motion-walk-4', at: now - 60_000 }],
    matches: [{ id: 'match-walk-1', pet: 'pet-mittens', at: now - 50_000, alerted: true }],
    people: [{ id: 'intrusion-walk-1', at: now - 40_000 }],
    sightings: [{ id: 'animal-walk-1', at: now - 30_000 }],
  });
  const sixNew = () => {
    const saved = fourNew();
    saved.motion = [...saved.motion, ...motionAlerts(2)];
    return saved;
  };
  // A device holding `saved` after its first run, on the dashboard.
  const dashboardWith = async (page, saved) => {
    await withNew(page, '/settings/', saved);
    await openDash(page);
    return saved;
  };
  const countReads = (page, count) => waitWords(page, 'p.dash-new', `${count} new ${count === 1 ? 'alert' : 'alerts'} since you last looked.`);

  // ----- The first screen -----

  // The use setup stored, written after the finished setup. The walk installs
  // it alone (no SETUP_DONE beside it), as the browser runs two init scripts
  // in no set order and SETUP_DONE stores the pet use.
  const USE_STORED = (use) => {
    localStorage.setItem('safeos-onboarding', JSON.stringify({ state: {
      isComplete: true, selectedScenario: use,
      acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
    }, version: 0 }));
    localStorage.setItem('guardian-onboarding-complete', 'true');
  };
  for (const [look, use] of [['light', 'baby'], ['dark', 'security']]) {
    await open({ name: 'dashboard, first screen', width: 390, height: 844, look }, async (page, context, check) => {
      await context.addInitScript(USE_STORED, use);
      await openDash(page);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('safeos-onboarding') || 'null')?.state?.selectedScenario ?? null);
      check(stored === use, `the device holds the ${stored} use, not ${use}`);
      await page.evaluate(() => document.fonts.ready);
      const seen = await page.evaluate(() => {
        const words = (el) => (el ? (el.textContent || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim() : null);
        const key = document.querySelector('.dash-key-place .dash-key');
        const keyBox = key ? key.getBoundingClientRect() : null;
        const bar = document.querySelector('nav.phone-bar');
        return {
          h1: words(document.querySelector('main.dash h1')),
          line: words(document.getElementById('dash-line')),
          key: key ? { words: words(key), width: keyBox.width, height: keyBox.height } : null,
          statement: words(document.querySelector('.dash-statement')),
          label: words(document.querySelector('section.ways h2')),
          rows: [...document.querySelectorAll('section.ways li.way')].map((li) => {
            const box = li.getBoundingClientRect();
            const line = li.querySelector('.way__line');
            return {
              name: words(li.querySelector('.way__name')), width: box.width, height: box.height, bottom: box.bottom,
              lineHeight: line ? line.getBoundingClientRect().height : 0, lineStep: line ? parseFloat(getComputedStyle(line).lineHeight) : 0,
            };
          }),
          barTop: bar ? bar.getBoundingClientRect().top : null,
        };
      });
      check(seen.h1 === 'Not watching', `the heading reads "${seen.h1}", not "Not watching"`);
      check(seen.line === MOTION_LINE, `the line reads "${seen.line}", not "${MOTION_LINE}"`);
      if (!seen.key) {
        check(false, "the key's place holds no key");
      } else {
        check(seen.key.words === 'Start watching', `the key reads "${seen.key.words}", not "Start watching"`);
        check(seen.key.height >= 52, `the key is ${seen.key.height} px tall, under 52`);
        check(Math.abs(seen.key.width - 358) <= 0.5, `the key is ${seen.key.width} px wide, not 358`);
      }
      check(seen.statement === plain(STATEMENT), `the statement reads "${seen.statement}"`);
      check(seen.label === 'Ways to watch', `the ways are headed "${seen.label}", not "Ways to watch"`);
      const names = seen.rows.map((row) => row.name).join(', ');
      check(names === WAY_ROWS.join(', '), `the rows read ${names}, not ${WAY_ROWS.join(', ')}`);
      for (const row of seen.rows) {
        check(row.height >= 74, `the ${row.name} row is ${row.height} px tall, under 74`);
        check(Math.abs(row.width - 358) <= 0.5, `the ${row.name} row is ${row.width} px wide, not 358`);
        check(row.lineStep === 24 && Math.abs(row.lineHeight - row.lineStep) <= 0.5, `the ${row.name} row's line is ${row.lineHeight} px tall on a ${row.lineStep} px line, not one 24 px line`);
      }
      const fourth = seen.rows[3];
      check(seen.barTop !== null, 'the page has no phone bar');
      if (fourth && seen.barTop !== null) check(fourth.bottom <= seen.barTop + 0.5, `the fourth row ends at ${fourth.bottom} px, past the phone bar's top at ${seen.barTop} px`);
      await page.screenshot({ path: path.join(outDir, `dashboard-first-390-${look}.png`) });
    }, { state: 'stored' });
  }

  // The first screen holds 8 controls, 7 text styles, these 8 boxes, and the
  // look's own colours alone: the page, the panel, the ink, the quiet tone,
  // the line, the accent and transparent, and in the light look the solid
  // key's white label (the keys' set gives it one there).
  const FIRST_BOXES = [
    /^span\.drawn-frame$/, /^button\.key\..*key--solid/, /^span\.way__square$/, /^li\.way$/, /^li\.way$/, /^li\.way$/,
    /^nav\.phone-bar\..*look-part/, /^a\.phone-bar__place.*::before$/,
  ];
  const FIRST_CONTROLS = [
    (name) => name === githubName, (name) => name === 'Start watching', ...WAY_ROWS.map((way) => (name) => name.startsWith(`${way}:`)),
    (name) => name === 'Dashboard', (name) => name === 'History', (name) => name === 'Settings',
  ];
  // Each wanted entry matched to one item of `items`, none left over.
  const matchesAll = (items, wanted) => {
    const left = [...items];
    for (const want of wanted) {
      const at = left.findIndex((item) => (typeof want === 'function' ? want(item) : want.test(item)));
      if (at === -1) return false;
      left.splice(at, 1);
    }
    return left.length === 0;
  };
  for (const look of LOOKS) {
    await open({ name: 'first screen, counted', width: 390, height: 844, look }, async (page, context, check) => {
      await openDash(page);
      await page.evaluate(() => document.fonts.ready);
      const seen = await firstScreen(page);
      check(matchesAll(seen.controls, FIRST_CONTROLS),
        `the first screen holds ${seen.controls.length} controls, expected ${FIRST_CONTROLS.length}: ${seen.controls.map((name) => `"${name}"`).join(', ')}`);
      check(seen.styles.length === 7, `the first screen holds ${seen.styles.length} text styles, not 7: ${seen.styles.join(' | ')}`);
      check(seen.boxes.length === 8 && matchesAll(seen.boxes, FIRST_BOXES), `the first screen draws ${seen.boxes.length} boxes, not the 8 named: ${seen.boxes.join(', ')}`);
      const tone = TONES[look];
      const colours = [tone.page, tone.panel, tone.ink, tone.quiet, tone.line, tone.accent, 'rgba(0, 0, 0, 0)', ...(look === 'light' ? [tone.onAccent] : [])];
      check(seen.colours.length === colours.length && colours.every((colour) => seen.colours.includes(colour)),
        `the first screen holds ${seen.colours.length} colours, not the look's ${colours.length}: ${seen.colours.join(', ')}`);
    });
  }

  // The words' sizes, faces, weights and colours at each layout width, then
  // every word of the dashboard measured, and its quiet words from their
  // own pixels.
  const HEADING_TYPE = { 390: ['30px', '46px'], 820: ['40px', '60px'], 1280: ['48px', '72px'], 1920: ['52px', '78px'] };
  for (const width of LAYOUT_WIDTHS) {
    for (const look of LOOKS) {
      await open({ name: 'dashboard, readable', width, look }, async (page, context, check) => {
        await dashboardWith(page, fourNew());
        check(await countReads(page, 4), `the first screen does not read "4 new alerts since you last looked."; it reads "${await wordsAt(page, 'p.dash-new')}"`);
        await page.evaluate(() => document.fonts.ready);
        const wide = width >= 1440;
        const body = wide ? ['20px', '30px'] : ['18px', '28px'];
        const entry = wide ? ['22px', '34px'] : ['20px', '30px'];
        const keyInk = look === 'light' ? 'rgb(255, 255, 255)' : PAGE.dark;
        // [what, selector, face, weight, size, line, colour]; a null is not read.
        const parts = [
          ['the heading', 'main.dash h1', 'grotesk', '700', ...HEADING_TYPE[width], INK[look]],
          ['the line', '#dash-line', 'inter', '400', ...body, INK[look]],
          ['the statement', '.dash-statement', 'inter', '400', ...body, INK[look]],
          ['the new alerts sentence', 'p.dash-new', 'inter', '400', ...body, null],
          ['the label of the ways', 'section.ways .dash-label', 'inter', '400', ...body, null],
          ['the label of the alerts', 'section.since .dash-label', 'inter', '400', ...body, null],
          ["the key's label", '.dash-key-place .dash-key', 'inter', '700', '18px', null, keyInk],
          ["a way's name", '.way__name', 'grotesk', '700', ...entry, INK[look]],
          ["a way's line", '.way__line', 'inter', '400', '16px', '24px', QUIET[look]],
          ["an alert's way", '.since__way', 'inter', '400', '16px', '24px', null],
          ['what an alert was', '.since__what', 'inter', '400', ...body, null],
        ];
        for (const [what, selector, family, weight, size, line, colour] of parts) {
          const styles = await page.evaluate((s) => [...document.querySelectorAll(s)].map((el) => {
            const style = getComputedStyle(el);
            return { family: style.fontFamily, weight: style.fontWeight, size: style.fontSize, line: style.lineHeight, color: style.color, ground: style.backgroundColor };
          }), selector);
          check(styles.length > 0, `the page has no ${what} (${selector})`);
          for (const style of styles) {
            const faceIs = family === 'grotesk' ? isGrotesk(style.family) : isInter(style.family);
            check(faceIs, `${what} is set in ${face(style.family)}, not ${family === 'grotesk' ? 'Space Grotesk' : 'Inter'}`);
            check(style.weight === weight, `${what} has weight ${style.weight}, not ${weight}`);
            check(style.size === size, `${what} is ${style.size}, not ${size}`);
            if (line) check(style.line === line, `${what} stands on a ${style.line} line, not ${line}`);
            if (colour) check(style.color === colour, `${what} is ${style.color}, not ${colour}`);
            if (selector === '.dash-key-place .dash-key') check(style.ground === ACCENT[look], `the key is filled ${style.ground}, not ${ACCENT[look]}`);
          }
        }
        await page.screenshot({ path: path.join(outDir, `dashboard-readable-${width}-${look}.png`), fullPage: true });
        const dash = await page.$('main.dash');
        if (!dash) throw new Error('the page has no main.dash');
        const texts = await page.evaluate(measureText, dash);
        check(texts.length > 20, `only ${texts.length} pieces of the dashboard's text were measured`);
        for (const text of texts) {
          const where = `"${text.words}" (${text.tag})`;
          check(text.size >= 16, `${where} is ${text.size} px, under 16`);
          check(isGrotesk(text.face) || isInter(text.face), `${where} is set in ${face(text.face)}`);
          check(['400', '700'].includes(text.weight), `${where} has weight ${text.weight}`);
          check(!/mono/i.test(face(text.face)), `${where} is set in ${face(text.face)}`);
          const least = text.body ? 12 : 7;
          check(text.contrast >= least, `${where} has contrast ${text.contrast.toFixed(2)}, under ${least}`);
        }
        const marked = await page.evaluate(() => {
          const part = document.querySelector('main.dash');
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
          const out = [];
          for (const element of blocks) {
            if (element.closest('script, style, [hidden], .sr-only')) continue;
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            if (box.width < 4 || box.height < 4 || style.visibility === 'hidden' || style.opacity === '0') continue;
            if (style.color !== quiet) continue;
            element.setAttribute('data-measure', String(out.length));
            out.push(element.textContent.trim().replace(/\s+/g, ' ').slice(0, 40));
          }
          return out;
        });
        // The fixed header and bar would cover words scrolled under them.
        await page.addStyleTag({ content: 'header.app-header, nav.phone-bar { visibility: hidden !important; }' });
        const scratch = await context.newPage();
        let measured = 0;
        for (const [index, words] of marked.entries()) {
          const picture = await page.locator(`[data-measure="${index}"]`).screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
          const read = await scratch.evaluate(readStrokes, picture.toString('base64'));
          if (!read) continue;
          measured += 1;
          check(read.strokes >= 7, `"${words}" measures ${read.strokes.toFixed(2)}:1 on its strokes (core ${read.core.toFixed(2)}:1), under 7`);
        }
        await scratch.close();
        check(measured >= 4, `only ${measured} of ${marked.length} quiet words of the dashboard were measured from the pixels; ${marked.length - measured} had too little ink to measure`);
      });
    }
  }

  // Notifications not asked for: one row asks, above the key, and nothing
  // else asks or floats over the page.
  for (const look of LOOKS) {
    await open({ name: 'notifications, not asked', width: 390, look }, async (page, context, check) => {
      await context.addInitScript(NOTIFICATIONS_ANSWER, 'default');
      await openDash(page);
      const ask = page.getByRole('button', { name: 'Show alerts outside this tab', exact: true });
      const shown = await ask.waitFor({ timeout: 10_000 }).then(() => true, () => false);
      check(shown, 'no button reads "Show alerts outside this tab"');
      if (!shown) return;
      const before = await page.evaluate(() => {
        const asking = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Show alerts outside this tab');
        const key = document.querySelector('.dash-key-place .dash-key');
        return !!asking && !!key && Boolean(asking.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      check(before, '"Show alerts outside this tab" does not stand before "Start watching"');
      const counted = await firstScreen(page);
      const wanted = [...FIRST_CONTROLS, (name) => name === 'Show alerts outside this tab'];
      check(matchesAll(counted.controls, wanted), `the first screen holds ${counted.controls.length} controls, expected ${wanted.length}: ${counted.controls.map((name) => `"${name}"`).join(', ')}`);
      await page.waitForTimeout(10_000);
      const words = plain(await page.evaluate(() => document.body.innerText));
      for (const gone of ['Enable notifications', 'Install SafeOS']) check(!words.includes(gone), `ten seconds on the page reads "${gone}"`);
      const dialogs = await page.locator('[role="dialog"]').count();
      check(dialogs === 0, `ten seconds on ${dialogs} elements have role="dialog"`);
      await ask.click();
      await page.waitForTimeout(500);
      const asks = await page.evaluate(() => window.__notificationAsks);
      check(asks === 1, `a press asked the browser ${asks} times, not once`);
    }, { permissions: ['camera', 'microphone'] });
  }

  for (const look of LOOKS) {
    await open({ name: 'notifications, blocked', width: 390, look }, async (page, context, check) => {
      await context.addInitScript(NOTIFICATIONS_ANSWER, 'denied');
      await openDash(page);
      await checkProblem(page, check, NOTIFICATIONS_BLOCKED);
      const asks = await page.getByRole('button', { name: 'Show alerts outside this tab', exact: true }).count();
      check(asks === 0, 'a button reads "Show alerts outside this tab"');
      const link = page.getByRole('link', { name: 'How to turn on notifications', exact: true });
      if (!(await link.count())) {
        check(false, 'no link reads "How to turn on notifications"');
        return;
      }
      await link.click();
      await page.waitForURL((url) => url.pathname === '/help/' && url.hash === '#notifications', { timeout: 15_000 }).catch(() => {});
      const at = new URL(page.url());
      check(at.pathname === '/help/' && at.hash === '#notifications', `the link opens ${at.pathname}${at.hash}, not /help/#notifications`);
      await helpEntryInView(page, check, 'Notifications not appearing');
    }, { permissions: ['camera', 'microphone'] });
  }

  // The camera: blocked at rest or by a press, in use, or failed to start.
  for (const look of LOOKS) {
    await open({ name: 'camera blocked', width: 390, look }, async (page, context, check) => {
      await context.addInitScript(CAMERA_ANSWER, 'denied');
      await openDash(page);
      await checkProblem(page, check, CAMERA_WORDS.blocked, '.dash-problems', 'at rest ');
      await page.screenshot({ path: path.join(outDir, `dashboard-camera-blocked-390-${look}.png`) });
      const link = page.getByRole('link', { name: 'How to allow the camera', exact: true });
      if (!(await link.count())) {
        check(false, 'no link reads "How to allow the camera"');
        return;
      }
      await link.click();
      await page.waitForURL((url) => url.pathname === '/help/' && url.hash === '#camera', { timeout: 15_000 }).catch(() => {});
      const at = new URL(page.url());
      check(at.pathname === '/help/' && at.hash === '#camera', `the link opens ${at.pathname}${at.hash}, not /help/#camera`);
      await helpEntryInView(page, check, 'Camera not working');
    }, { script: FAKE_CAMERA });

    await open({ name: 'camera blocked', width: 390, look }, async (page, context, check) => {
      await openDash(page);
      await page.evaluate(() => { window.__camera.answer = 'NotAllowedError'; });
      await startKey(page).click();
      await checkProblem(page, check, CAMERA_WORDS.blocked, '.dash-problems', 'after a refused request ');
      const key = await keyState(page);
      check(key.words === 'Start watching' && key.disabled === null, `after a refused request the key reads "${key.words}" with aria-disabled ${key.disabled}`);
    }, { script: FAKE_CAMERA });

    await open({ name: 'camera failed', width: 390, look }, async (page, context, check) => {
      await openDash(page);
      await page.evaluate(() => { window.__camera.answer = 'AbortError'; });
      await startKey(page).click();
      await checkProblem(page, check, CAMERA_WORDS.failed);
      // The pointer leaves the key: under it the key takes its hover fill.
      await page.mouse.move(0, 0);
      await page.waitForTimeout(400);
      const key = await keyState(page);
      check(key.words === 'Start watching', `the key reads "${key.words}", not "Start watching"`);
      check(key.background === ACCENT[look], `the key is filled ${key.background}, not ${ACCENT[look]}`);
    }, { script: FAKE_CAMERA });

    await open({ name: 'camera in use', width: 1280, look }, async (page, context, check) => {
      await openDash(page);
      await page.evaluate(() => { window.__camera.answer = 'NotReadableError'; });
      await startKey(page).click();
      await checkProblem(page, check, CAMERA_WORDS.inUse);
      const allow = await page.getByRole('link', { name: 'How to allow the camera', exact: true }).count();
      check(allow === 0, 'the page offers "How to allow the camera" for a camera in use');
    }, { script: FAKE_CAMERA });
  }

  // A window that keeps nothing once it closes says so; a profile on disk
  // does not.
  const lineAbove = (page, wanted) => page.evaluate((w) => {
    const words = (el) => (el ? (el.textContent || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim() : '');
    const line = document.getElementById('dash-line');
    const sentence = [...document.querySelectorAll('.dash-problems p.dash-problem')].find((p) => words(p) === w);
    return { line: words(line), under: !!line && !!sentence && sentence.getBoundingClientRect().top >= line.getBoundingClientRect().bottom - 0.5 };
  }, wanted);
  // What this window's storage measures, as the page's own check reads it:
  // the answer the page kept, and what a commit asked to reach the disk costs
  // beside one that is not. Printed for each private window walk, so a
  // finding can be read against the window it ran in.
  const storageMeasure = (page) => page.evaluate(async () => {
    let memo = 'unreadable';
    try { memo = sessionStorage.getItem('safeos-window-storage'); } catch (e) { /* storage refused */ }
    try {
      const name = `walk-measure-${Math.random().toString(36).slice(2)}`;
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('s');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const timed = (durability) => new Promise((resolve, reject) => {
        const started = performance.now();
        const payload = new Uint8Array(16384);
        let written = 0;
        const next = () => {
          if (written === 15) {
            resolve(performance.now() - started);
            return;
          }
          const tx = db.transaction('s', 'readwrite', { durability });
          tx.objectStore('s').put(payload, written);
          written += 1;
          tx.oncomplete = next;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        };
        next();
      });
      const hinted = db.transaction('s', 'readwrite', { durability: 'strict' });
      const honoured = hinted.durability;
      hinted.abort();
      await timed('relaxed');
      await timed('strict');
      const ratios = [];
      const costs = [];
      for (let round = 0; round < 7; round += 1) {
        const relaxed = await timed('relaxed');
        const strict = await timed('strict');
        ratios.push(relaxed > 0 ? strict / relaxed : Infinity);
        costs.push(`${relaxed.toFixed(1)}/${strict.toFixed(1)}`);
      }
      db.close();
      indexedDB.deleteDatabase(name);
      ratios.sort((a, b) => a - b);
      return `the page kept "${memo}"; a commit asked to reach the disk costs ${ratios[3].toFixed(2)} times one that is not (durability ${honoured}; ms of each round ${costs.join(' ')})`;
    } catch (err) {
      return `the page kept "${memo}"; the measure failed: ${err && err.message}`;
    }
  });
  for (const look of LOOKS) {
    await open({ name: 'private window', width: 390, look }, async (page, context, check) => {
      await openDash(page);
      await checkProblem(page, check, FORGETS);
      const keys = await startKey(page).count();
      check(keys === 1, `with the sentence the page holds ${keys} keys, not the key`);
      console.log(`measured private window at 390 px, ${look}, a window that keeps nothing: ${await storageMeasure(page)}`);
    }, { windowStorage: 'probe' });

    await open({ name: 'private window', width: 390, look }, async (page, context, check) => {
      await openDash(page);
      if (await checkProblem(page, check, FORGETS, '.dash-problems', 'before setup ')) {
        const seen = await lineAbove(page, FORGETS);
        check(seen.line === BEFORE_SETUP && seen.under, `before setup the sentence stands ${seen.under ? 'under' : 'not under'} the line "${seen.line}"`);
      }
      await pressTo(page, setupKey(page), '/setup');
      await throughSetup(page, 'A pet');
      await pressTo(page, lastKey(page), '/dashboard');
      await stateShown(page);
      await dashRead(page);
      if (await checkProblem(page, check, FORGETS, '.dash-problems', 'after setup ')) {
        const seen = await lineAbove(page, FORGETS);
        check(seen.line === MOTION_LINE && seen.under, `after setup the sentence stands ${seen.under ? 'under' : 'not under'} the line "${seen.line}"`);
      }
    }, { state: 'new', windowStorage: 'probe' });

    await openKept({ name: 'private window', width: 390, look }, async (page, context, check) => {
      await visit(page, '/dashboard/');
      await stateShown(page);
      await dashRead(page);
      await page.waitForTimeout(3_000);
      const said = (await problemsOf(page)).some((p) => p.words === FORGETS);
      check(!said, `a profile kept on disk is told "${FORGETS}"`);
      console.log(`measured private window at 390 px, ${look}, a profile kept on disk: ${await storageMeasure(page)}`);
    });
  }

  // A browser that refuses this site's storage on every call: the page
  // shows a new device's state, and no part of it throws.
  // Each refusal names its call and its key, so an error the page raises
  // says which part let it out.
  const REFUSE_STORAGE = () => {
    for (const name of ['getItem', 'setItem', 'removeItem']) {
      Storage.prototype[name] = function (key) { throw new DOMException(`denied: ${name} of ${key}`, 'SecurityError'); };
    }
  };
  for (const look of LOOKS) {
    await open({ name: 'dashboard, storage refused', width: 390, look }, async (page, context, check) => {
      const raised = [];
      // Each error with the first lines of its stack, which name the part that threw.
      page.on('pageerror', (err) => raised.push([err.message.split('\n')[0], ...(err.stack || '').split('\n').slice(1, 3).map((line) => line.trim())].join(' ')));
      await page.goto(address('/dashboard/'), { waitUntil: 'load', timeout: 60_000 });
      await page.waitForTimeout(3_000);
      const seen = await page.evaluate(() => {
        const words = (el) => (el ? (el.textContent || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim() : null);
        const setup = [...document.querySelectorAll('main.dash a')].find((a) => words(a) === 'Start setup');
        const shown = (el) => !!el && el.getBoundingClientRect().height > 0;
        return {
          h1: words(document.querySelector('main.dash h1')),
          line: words(document.getElementById('dash-line')),
          setup: setup ? setup.getAttribute('href') : null,
          rows: [...document.querySelectorAll('section.ways li.way a')].map((a) => a.getAttribute('href')),
          header: shown(document.querySelector('header.app-header')),
          footer: shown(document.querySelector('.app-shell__footer footer')),
        };
      });
      const errors = raised.length ? `; the page raised ${raised.map((message) => `"${message}"`).join(', ')}` : '; the page raised no error';
      check(seen.h1 === 'Not watching', `three seconds on the heading reads "${seen.h1}", not "Not watching"${errors}`);
      check(seen.line === BEFORE_SETUP, `three seconds on the line reads "${seen.line}", not "${BEFORE_SETUP}"${errors}`);
      check(seen.setup === '/setup/', `three seconds on Start setup ${seen.setup ? `leads to ${seen.setup}` : 'is not there'}${errors}`);
      const wanted = WAY_IDS.map((way) => `/setup/?next=${way}`).join(', ');
      check(seen.rows.join(', ') === wanted, `three seconds on the rows lead to ${seen.rows.join(', ') || 'nothing'}, not ${wanted}${errors}`);
      check(seen.header && seen.footer, `three seconds on the page shows ${seen.header ? 'the' : 'no'} header and ${seen.footer ? 'the' : 'no'} footer${errors}`);
      check(raised.length === 0, `the page raised ${raised.map((message) => `"${message}"`).join(', ')}`);
    }, { state: 'new', script: REFUSE_STORAGE });
  }

  // The saved pets held for three seconds: the places stand still while the
  // device is read.
  for (const [look, reduced] of [['light', false], ['dark', false], ['dark', true]]) {
    const motion = reduced ? { reducedMotion: 'reduce' } : {};
    await open({ name: 'dashboard, stores held', width: 390, look, ...motion }, async (page, context, check) => {
      const said = reduced ? 'under reduced motion, ' : '';
      await withNew(page, '/dashboard/', { pets: [{ id: 'pet-mittens', name: 'Mittens' }] });
      await context.addInitScript(HOLD_STORES);
      await page.goto(address('/dashboard/'), { waitUntil: 'load', timeout: 60_000 });
      const read = () => page.evaluate(() => {
        const state = document.querySelector('section.dash-state');
        const frame = document.querySelector('section.dash-state .drawn-frame[data-loading="true"]');
        const frameBox = frame ? frame.getBoundingClientRect() : null;
        const after = frame ? getComputedStyle(frame, '::after') : null;
        const place = document.querySelector('.dash-key-place');
        const placeBox = place ? place.getBoundingClientRect() : null;
        const rows = [...document.querySelectorAll('section.ways li.way')];
        return {
          read: state ? state.getAttribute('data-read') : null,
          loading: (document.querySelector('p.dash-loading')?.textContent || '').trim(),
          frame: !!frameBox && frameBox.width > 0 && frameBox.height > 0 && getComputedStyle(frame).visibility !== 'hidden',
          bar: after ? { display: after.display, content: after.content } : null,
          place: placeBox ? { top: placeBox.top, height: placeBox.height, empty: place.children.length === 0 && !place.textContent.trim() } : null,
          key: (place?.querySelector('a, button')?.textContent || '').trim(),
          line: (document.getElementById('dash-line')?.textContent || '').trim(),
          rows: rows.map((row) => {
            const link = row.querySelector('a');
            const box = row.getBoundingClientRect();
            return { top: box.top, shown: box.height > 0, href: link ? link.getAttribute('href') : null };
          }),
          photo: !!rows[1]?.querySelector('img[alt="Photo of Mittens"]'),
          square: !!rows[0]?.querySelector('.way__name .way__square'),
        };
      });
      const early = await read();
      check(early.read === 'no', `${said}at once the watching state has data-read "${early.read}", not "no"`);
      check(early.loading === 'Loading the dashboard…', `${said}at once p.dash-loading reads "${early.loading}"`);
      check(early.frame, `${said}at once the drawn frame is not shown loading`);
      if (reduced) check(!!early.bar && early.bar.display === 'none', `${said}the loading bar is drawn with display ${early.bar ? early.bar.display : 'nothing'}`);
      else check(!!early.bar && early.bar.display !== 'none' && early.bar.content !== 'none', `at once the loading bar is ${early.bar ? `display ${early.bar.display}, content ${early.bar.content}` : 'not there'}`);
      check(!!early.place && early.place.height >= 52 && early.place.empty, `${said}at once the key's place is ${early.place ? `${early.place.height} px tall and ${early.place.empty ? 'empty' : 'not empty'}` : 'not there'}`);
      const hrefs = early.rows.map((row) => row.href).join(', ');
      check(early.rows.length === 4 && early.rows.every((row) => row.shown), `${said}at once ${early.rows.filter((row) => row.shown).length} of 4 rows are shown`);
      check(hrefs === '/monitor/, /lost-found/, /security/, /wildlife/', `${said}at once the rows lead to ${hrefs}`);
      await page.waitForTimeout(3_500);
      await page.locator('.dash-key-place .dash-key').waitFor({ timeout: 5_000 }).catch(() => {});
      const late = await read();
      check(late.key === 'Start watching', `${said}3.5 seconds on the key reads "${late.key}", not "Start watching"`);
      check(plain(late.line) === MOTION_LINE, `${said}3.5 seconds on the line reads "${late.line}"`);
      check(late.photo, `${said}3.5 seconds on the Lost and Found row shows no "Photo of Mittens"`);
      check(late.square, `${said}3.5 seconds on Motion and sound has no square`);
      if (early.place && late.place) check(Math.abs(late.place.top - early.place.top) <= 0.5, `${said}the key's place moved from ${early.place.top} to ${late.place.top} px`);
      early.rows.forEach((row, i) => {
        const now = late.rows[i];
        if (now) check(Math.abs(now.top - row.top) <= 0.5, `${said}the ${WAY_ROWS[i]} row moved from ${row.top} to ${now.top} px`);
      });
    });
  }

  for (const look of LOOKS) {
    await open({ name: 'dashboard, alerts held', width: 390, look }, async (page, context, check) => {
      await withNew(page, '/settings/', fourNew());
      await context.addInitScript(HOLD_STORES);
      await page.goto(address('/dashboard/'), { waitUntil: 'load', timeout: 60_000 });
      const early = await page.evaluate(() => ({
        label: (document.querySelector('section.since h2')?.textContent || '').trim(),
        loading: !!document.querySelector('section.since .drawn-frame[data-loading="true"]'),
        count: !!document.querySelector('p.dash-new'),
      }));
      const history = await page.evaluate(readHistory, { selector: historyLink(390), want: null });
      check(early.label === 'Since you last looked', `at once the part below is headed "${early.label}"`);
      check(early.loading, 'at once the part below shows no loading drawn frame');
      check(!early.count, 'at once the first screen shows p.dash-new');
      check(history.words === 'History', `at once History reads "${history.words}"`);
      await page.waitForTimeout(3_500);
      check(await countReads(page, 4), `3.5 seconds on the first screen reads "${await wordsAt(page, 'p.dash-new')}", not "4 new alerts since you last looked."`);
      checkHistory(check, await historyReads(page, 390, 'History 4'), 'History 4', 'History, 4 new alerts');
      const rows = await page.locator('section.since li.since__item').count();
      check(rows === 3, `3.5 seconds on the part below lists ${rows} rows, not 3`);
    });
  }

  // With scripts off: the heading, the line for a page whose script did not
  // start, the frame drawn whole, no key, and the footer's links work.
  for (const look of LOOKS) {
    await open({ name: 'dashboard, scripts off', width: 390, look, javaScriptEnabled: false }, async (page, context, check) => {
      await visit(page, '/dashboard/');
      const seen = await page.evaluate(() => {
        const words = (el) => (el ? (el.textContent || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim() : null);
        const h1 = document.querySelector('main.dash h1');
        const note = document.getElementById('dash-needs-script');
        return {
          h1: words(h1),
          note: words(note),
          after: !!h1 && !!note && Boolean(h1.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING),
          buttons: [...document.querySelectorAll('button')].filter((button) => button.getBoundingClientRect().height > 0).map((button) => button.textContent.trim()),
        };
      });
      check(seen.h1 === 'Not watching', `the heading reads "${seen.h1}", not "Not watching"`);
      check(seen.note === NEEDS_SCRIPT_WORDS, `#dash-needs-script reads "${seen.note}", not "${NEEDS_SCRIPT_WORDS}"`);
      check(seen.after, '#dash-needs-script does not follow the heading');
      for (const [what, selector] of [
        ["the header's brand", 'header.app-header .app-header__brand'],
        ['the heading', 'main.dash h1'],
        ['the line', '#dash-line'],
        ["the footer's Site links", '.app-shell__footer nav[aria-label="Site links"]'],
      ]) {
        const opacity = await shownOpacity(page, selector);
        check(opacity === 1, `${what} is ${opacity === -1 ? 'not shown' : `drawn at opacity ${opacity}, not 1`}`);
      }
      check(seen.buttons.length === 0, `the page shows the buttons ${seen.buttons.map((name) => `"${name}"`).join(', ')}`);
      await page.locator('.app-shell__footer nav[aria-label="Site links"] a[href^="/privacy"]').first().click();
      await page.waitForLoadState('load');
      check(new URL(page.url()).pathname === '/privacy/', `a press on Privacy opened ${new URL(page.url()).pathname}, not /privacy/`);
    });
  }

  // One banner, one main, one level-1 heading, the App navigation, the
  // footer with Site links; the key described by the line; the ways a list.
  for (const state of ['set-up', 'new']) {
    await open({ name: 'dashboard, landmarks', width: 1280, look: 'light' }, async (page, context, check) => {
      await openDash(page);
      const counts = {
        banner: await page.getByRole('banner').count(),
        main: await page.getByRole('main').count(),
        heading: await page.getByRole('heading', { level: 1 }).count(),
        app: await page.getByRole('navigation', { name: 'App' }).filter({ visible: true }).count(),
        contentinfo: await page.getByRole('contentinfo').count(),
        siteLinks: await page.getByRole('contentinfo').getByRole('navigation', { name: 'Site links' }).count(),
      };
      const when = state === 'new' ? 'before setup ' : '';
      for (const [what, count] of Object.entries(counts)) check(count === 1, `${when}the page holds ${count} ${what}, not 1`);
      const key = await page.evaluate(() => {
        const element = document.querySelector('.dash-key-place .dash-key');
        return element ? { words: element.textContent.trim(), described: element.getAttribute('aria-describedby') } : null;
      });
      const wanted = state === 'new' ? 'Start setup' : 'Start watching';
      check(!!key && key.words === wanted, `${when}the key reads "${key ? key.words : 'nothing'}", not "${wanted}"`);
      check(!!key && key.described === 'dash-line', `${when}the key's aria-describedby is ${key ? key.described : 'not there'}, not dash-line`);
      const ways = await page.evaluate(() => {
        const heading = [...document.querySelectorAll('h2')].find((h) => h.textContent.trim() === 'Ways to watch');
        const list = heading ? heading.parentElement.querySelector('ul') : null;
        return {
          heading: !!heading,
          over: !!heading && !!list && Boolean(heading.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING),
          items: list ? [...list.children].map((item) => `${item.tagName.toLowerCase()} with ${item.querySelectorAll('a').length} links`) : [],
        };
      });
      check(ways.heading && ways.over, `${when}"Ways to watch" is ${ways.heading ? 'not over a list' : 'no level-2 heading'}`);
      check(ways.items.length === 4 && ways.items.every((item) => item === 'li with 1 links'), `${when}the list of ways holds ${ways.items.join(', ') || 'nothing'}`);
    }, { state });
  }

  // What the earlier dashboard showed is gone, with no word the page may not
  // carry, nothing over the page and nothing that clears or deletes.
  const GONE_WORDS = ['by SuperCloud', 'LOCAL-ONLY', 'Active Streams', 'Alerts Today', 'Queue Depth', 'Avg Response', '+ NEW', 'System Status', 'SafeOS Guardian v1.0', 'Monitoring Server', 'Quick Actions', 'Recent Alerts', 'CLEAR ALL'];
  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'dashboard, what leaves', width, look }, async (page, context, check) => {
        await openDash(page);
        const words = plain(await page.evaluate(() => document.body.innerText));
        for (const gone of GONE_WORDS) check(!words.includes(gone), `the page reads "${gone}"`);
        const banned = words.match(/babysitter|carer|security system|medical|identify|recogni[sz]e|nonprofit|donate/i);
        check(!banned, `the page reads "${banned ? banned[0] : ''}"`);
        const users = words.match(/\b\d[\d,]*\s+(users|people use)/i);
        check(!users, `the page reads "${users ? users[0] : ''}"`);
        check((await page.locator('[role="dialog"]').count()) === 0, 'an element has role="dialog"');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        check((await page.locator('[role="dialog"]').count()) === 0, 'after Escape an element has role="dialog"');
        const named = await page.evaluate(() => [...document.querySelectorAll('main.dash button, main.dash a')]
          .map((element) => (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim())
          .filter((name) => /clear|delete/i.test(name)));
        check(named.length === 0, `the dashboard holds ${named.map((name) => `"${name}"`).join(', ')}`);
      });
    }
  }

  // ----- The start key -----

  await open({ name: 'start watching', width: 390, look: 'dark' }, async (page, context, check) => {
    await openDash(page);
    await page.evaluate(() => { window.__camera.waitMs = 1500; });
    await startKey(page).click();
    const waits = await page.waitForFunction(() => (document.querySelector('.dash-key-place .dash-key')?.textContent || '').trim() === 'Starting the camera…', null, { timeout: 1_000 }).then(() => true, () => false);
    check(waits, `within a second of the press the key reads "${(await keyState(page)).words}", not "Starting the camera…"`);
    check(pathOf(page) === '/dashboard', `while the camera starts the address is ${pathOf(page)}, not /dashboard`);
    const asked = await cameraRequests(page);
    check(asked === 1, `while the camera starts it was asked for ${asked} times, not once`);
    await reaches(page, '/monitor', 20_000);
    check(pathOf(page) === '/monitor', `the press opened ${pathOf(page)}, not /monitor`);
    check(await watchRuns(page), '/monitor/ does not show Stop watching with no press of its own');
    const once = await cameraRequests(page);
    check(once === 1, `the watch asked for the camera ${once} times in all, not once`);
    const query = new URL(page.url()).search;
    check(query === '', `the address carries the query ${query}`);
    await back(page);
    await reaches(page, '/dashboard', 15_000);
    check(pathOf(page) === '/dashboard', `Back opened ${pathOf(page)}, not /dashboard`);
    check(await noCameraOn(page, 2_000), `two seconds after Back ${await camerasOn(page)} cameras are on`);
    await forward(page);
    await reaches(page, '/monitor', 15_000);
    const rests = await page.getByRole('button', { name: 'Start watching', exact: true }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
    check(rests, 'after Forward /monitor/ does not show Start watching');
    const still = await cameraRequests(page);
    check(still === 1, `after Forward the camera was asked for ${still} times in all, not once`);
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    const reloaded = await page.getByRole('button', { name: 'Start watching', exact: true }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
    check(reloaded, 'a reload of /monitor/ does not show Start watching');
    const fresh = await page.evaluate(() => window.__camera.requests);
    check(fresh === 0, `a reload of /monitor/ asked for the camera ${fresh} times`);
  }, { script: FAKE_CAMERA });

  for (const look of LOOKS) {
    await open({ name: 'start watching, waiting', width: 390, look }, async (page, context, check) => {
      await openDash(page);
      await page.evaluate(() => { window.__camera.waitMs = 3000; });
      await startKey(page).click();
      await page.waitForFunction(() => (document.querySelector('.dash-key-place .dash-key')?.textContent || '').trim() === 'Starting the camera…', null, { timeout: 2_000 }).catch(() => {});
      // The fill fades out over the key's own transition.
      await page.waitForTimeout(300);
      const key = await keyState(page);
      check(key.disabled === 'true', `the waiting key has aria-disabled ${key.disabled}, not true`);
      check(key.background === 'rgba(0, 0, 0, 0)', `the waiting key is filled ${key.background}`);
      for (const edge of key.edges) check(edge === `1px dashed ${LINE[look]}`, `the waiting key's edge is ${edge}, not 1px dashed ${LINE[look]}`);
      check(key.color === QUIET[look], `the waiting key's words are ${key.color}, not ${QUIET[look]}`);
      if (pathOf(page) === '/dashboard' && key.words === 'Starting the camera…') {
        await page.screenshot({ path: path.join(outDir, `dashboard-waiting-390-${look}.png`) });
      } else {
        check(false, `the waiting key was not pictured: the address is ${pathOf(page)} and the key reads "${key.words}"`);
      }
      // The waiting key takes the press and does nothing with it.
      await startKey(page).click({ force: true, timeout: 2_000 }).catch(() => {});
      const asked = await cameraRequests(page);
      check(asked === 1, `a second press asked for the camera again (${asked} requests)`);
      await reaches(page, '/monitor', 20_000);
      check(await watchRuns(page), '/monitor/ does not show Stop watching');
    }, { script: FAKE_CAMERA });
  }

  await open({ name: 'start watching, keyboard', width: 1280, look: 'dark' }, async (page, context, check) => {
    await openDash(page);
    let reached = null;
    for (let i = 0; i < 15 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      const at = await page.evaluate(stop);
      if (at && at.name === 'Start watching') reached = at;
    }
    check(!!reached, 'Tab from the top does not reach "Start watching" within 15 presses');
    if (!reached) return;
    check(reached.ring === `solid 2px ${ACCENT.dark}`, `"Start watching" is ringed ${reached.ring}, not solid 2px ${ACCENT.dark}`);
    await page.keyboard.press('Enter');
    await reaches(page, '/monitor', 20_000);
    check(pathOf(page) === '/monitor', `Enter opened ${pathOf(page)}, not /monitor`);
    check(await watchRuns(page), 'after Enter /monitor/ does not show Stop watching');
  }, { script: FAKE_CAMERA });

  for (const look of LOOKS) {
    await open({ name: 'start key, hover', width: 1280, look }, async (page, context, check) => {
      await openDash(page);
      await startKey(page).hover();
      await page.waitForTimeout(400);
      const key = await keyState(page);
      check(key.background === ACCENT_HOVER[look], `under the pointer the key is filled ${key.background}, not ${ACCENT_HOVER[look]}`);
    });
  }

  await open({ name: 'start watching, Lost and Found', width: 390, look: 'light' }, async (page, context, check) => {
    await withNew(page, '/dashboard/', { pets: [{ id: 'pet-mittens', name: 'Mittens' }] });
    const t0 = await page.evaluate(() => Date.now());
    await remember(page, { way: 'lost-found', pet: 'pet-mittens', session: { startedAt: t0 - 60_000, seenAt: t0 - 30_000, endedAt: t0 - 30_000 } });
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await stateShown(page);
    await dashRead(page);
    const ended = await clockAt(page, t0 - 30_000);
    const wanted = plain(`Start watching uses Lost and Found, for Mittens. The last watch ended at ${ended}.`);
    const line = await lineOf(page);
    check(line === wanted, `the line reads "${line}", not "${wanted}"`);
    const time = await page.evaluate(() => (document.querySelector('#dash-line .num')?.textContent || '').replace(/\s+/g, ' ').trim());
    check(time === plain(ended), `the time in the line's .num reads "${time}", not "${plain(ended)}"`);
    await startKey(page).click();
    await reaches(page, '/monitor', 20_000);
    check(pathOf(page) === '/monitor', `the press opened ${pathOf(page)}, not /monitor`);
    check(await watchRuns(page), '/monitor/ does not show Stop watching');
    // Watch for names the way the watch runs with.
    const lostAndFound = page.getByRole('radiogroup', { name: 'Watch for' }).getByRole('radio', { name: 'Lost and Found', exact: true });
    const chosen = (await lostAndFound.count()) === 1 && (await lostAndFound.isChecked());
    check(chosen, 'on /monitor/ Watch for does not show Lost and Found checked');
    const kept = await page.waitForFunction(() => localStorage.getItem('safeos-last-way') === '{"way":"lost-found","pet":"pet-mittens"}', null, { timeout: 10_000 }).then(() => true, () => false);
    check(kept, `safeos-last-way reads ${await page.evaluate(() => localStorage.getItem('safeos-last-way'))}, not {"way":"lost-found","pet":"pet-mittens"}`);
    await forgetPet(page, 'pet-mittens');
    await openDash(page);
    const after = await lineOf(page);
    check(after.startsWith(MOTION_LINE), `with Mittens deleted the line reads "${after}"`);
  }, { script: FAKE_CAMERA });

  await open({ name: 'start watching, People without the model', width: 1280, look: 'dark' }, async (page, context, check) => {
    await visit(page, '/dashboard/');
    await remember(page, { way: 'security' });
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await stateShown(page);
    await dashRead(page);
    const line = await lineOf(page);
    check(line.startsWith('Start watching uses People.'), `the line reads "${line}"`);
    await startKey(page).click();
    await reaches(page, '/security', 20_000);
    check(pathOf(page) === '/security', `the press opened ${pathOf(page)}, not /security`);
    const offered = await page.getByRole('button', { name: 'Download detection model', exact: true }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
    check(offered, '/security/ shows no button "Download detection model"');
    const asked = await cameraRequests(page);
    check(asked === 0, `the camera was asked for ${asked} times`);
  }, { script: FAKE_CAMERA });

  await open({ name: 'the last watch', width: 390, look: 'light' }, async (page, context, check) => {
    await visit(page, '/monitor/');
    await page.getByRole('button', { name: 'Start watching', exact: true }).click();
    await page.getByRole('button', { name: 'Stop watching', exact: true }).waitFor({ timeout: 20_000 });
    const noted = await page.evaluate(() => Date.now());
    await pressTo(page, dashboardLink(page, 390), '/dashboard');
    await stateShown(page);
    await dashRead(page);
    const times = [plain(await clockAt(page, noted)), plain(await clockAt(page, noted + 60_000))];
    const line = await lineOf(page);
    check(times.some((at) => line.endsWith(`The last watch ended at ${at}.`)), `the line reads "${line}", not ending "The last watch ended at ${times[0]}."`);
    const t0 = await page.evaluate(() => Date.now());
    await remember(page, { session: { startedAt: t0 - 180_000, seenAt: t0 - 60_000, endedAt: null } });
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await stateShown(page);
    await dashRead(page);
    const ran = plain(await clockAt(page, t0 - 60_000));
    const again = await lineOf(page);
    check(again.endsWith(`The last watch ran until at least ${ran}.`), `with no end written the line reads "${again}", not ending "The last watch ran until at least ${ran}."`);
    check(!again.includes('ended at'), `with no end written the line reads "${again}"`);
  }, { script: FAKE_CAMERA });

  for (const look of LOOKS) {
    await open({ name: 'dashboard, offline', width: 390, look }, async (page, context, check) => {
      await withNew(page, '/settings/', fourNew());
      await visitThenOffline(page, context);
      await page.reload({ waitUntil: 'load', timeout: 60_000 });
      await stateShown(page);
      await dashRead(page);
      check(await countReads(page, 4), `offline the first screen reads "${await wordsAt(page, 'p.dash-new')}", not "4 new alerts since you last looked."`);
      const seen = await page.evaluate(() => ({
        header: !!document.querySelector('header.app-header'),
        h1: (document.querySelector('main.dash h1')?.textContent || '').trim(),
        rows: document.querySelectorAll('section.since li.since__item').length,
        footer: !!document.querySelector('.app-shell__footer footer'),
      }));
      check(seen.header, 'offline the page has no header');
      check(seen.h1 === 'Not watching', `offline the heading reads "${seen.h1}"`);
      const line = await lineOf(page);
      check(line === MOTION_LINE, `offline the line reads "${line}"`);
      check(seen.rows === 3, `offline the part below lists ${seen.rows} rows, not 3`);
      checkHistory(check, await historyReads(page, 390, 'History 4'), 'History 4', 'History, 4 new alerts');
      check(seen.footer, 'offline the page has no footer');
      await startKey(page).click();
      await reaches(page, '/monitor', 20_000);
      check(pathOf(page) === '/monitor', `offline the press opened ${pathOf(page)}, not /monitor`);
      check(await watchRuns(page), 'offline /monitor/ does not show Stop watching');
    }, { script: FAKE_CAMERA });
  }

  // A watch in another tab: the heading says so, and the key asks first.
  const watchingElsewhere = async (page, context) => {
    await visit(page, '/monitor/');
    await page.getByRole('button', { name: 'Start watching', exact: true }).click();
    await page.getByRole('button', { name: 'Stop watching', exact: true }).waitFor({ timeout: 20_000 });
    const second = await context.newPage();
    await visit(second, '/dashboard/');
    await stateShown(second);
    await dashRead(second);
    return second;
  };
  const headingSays = (page, wanted, ms) => page.waitForFunction((w) => (document.querySelector('main.dash h1')?.textContent || '').trim() === w, wanted, { timeout: ms }).then(() => true, () => false);
  for (const look of LOOKS) {
    await open({ name: 'second tab, the dashboard', width: 1280, look }, async (page, context, check) => {
      const second = await watchingElsewhere(page, context);
      check(await headingSays(second, 'Watching in another tab', 2_000), `within 2 seconds the heading reads "${await wordsAt(second, 'main.dash h1')}", not "Watching in another tab"`);
      await startKey(second).click();
      const asked = await theQuestion(second).waitFor({ timeout: 5_000 }).then(() => true, () => false);
      check(asked, `a press showed no dialog named "${QUESTION}"`);
      if (!asked) return;
      const keys = (await theQuestion(second).getByRole('button').allTextContents()).map(plain);
      check(keys.join(' | ') === 'Watch here | Cancel', `the dialog's keys read ${keys.map((key) => `"${key}"`).join(', ')}, not "Watch here" then "Cancel"`);
      const first = await focusedOn(second);
      check(first === 'Cancel', `focus starts on "${first}", not Cancel`);
      const before = await cameraRequests(second);
      check(before === 0, `the dashboard asked for the camera ${before} times before the person chose`);
      await theQuestion(second).getByRole('button', { name: 'Cancel', exact: true }).click();
      check(await gone(theQuestion(second)), 'Cancel left the dialog open');
      const returned = await focusedOn(second);
      check(returned === 'Start watching', `after Cancel focus is on "${returned}", not Start watching`);
      check((await page.getByRole('button', { name: 'Stop watching', exact: true }).count()) === 1, 'after Cancel the first tab no longer reads Stop watching');
      const kept = await camerasOn(page);
      check(kept === 1, `after Cancel the first tab holds ${kept} live cameras, not 1`);
      await startKey(second).click();
      await theQuestion(second).waitFor({ timeout: 5_000 });
      await theQuestion(second).getByRole('button', { name: 'Watch here', exact: true }).click();
      const ended = await page.getByRole('button', { name: 'Start watching', exact: true }).waitFor({ timeout: 10_000 }).then(() => true, () => false);
      check(ended, 'after Watch here the first tab does not read Start watching');
      check(await noCameraOn(page, 5_000), `after Watch here the first tab holds ${await camerasOn(page)} live cameras`);
      await reaches(second, '/monitor', 20_000);
      check(pathOf(second) === '/monitor', `Watch here opened ${pathOf(second)}, not /monitor`);
      check(await watchRuns(second), 'after Watch here /monitor/ does not show Stop watching');
      const asks = await cameraRequests(second);
      check(asks === 1, `after Watch here the dashboard's tab asked for the camera ${asks} times, not once`);
      const both = (await camerasOn(page)) + (await camerasOn(second));
      check(both === 1, `the two tabs hold ${both} live cameras, not 1`);
    }, { script: FAKE_CAMERA });
  }

  // The dialog's two keys on one row at every phone width, and with larger
  // text a row that scrolls inside itself where the two do not fit.
  const dialogRow = (page) => page.evaluate(() => {
    const place = document.querySelector('[role="dialog"] .app-dialog__keys');
    if (!place) return null;
    const row = place.querySelector('.key-row__keys') ?? place;
    return {
      keys: [...row.querySelectorAll('button')].map((key) => {
        const box = key.getBoundingClientRect();
        return { name: key.textContent.trim(), top: box.top, height: box.height, whole: key.scrollWidth <= key.clientWidth + 0.5 };
      }),
      scrolls: row.scrollWidth > row.clientWidth + 0.5,
    };
  });
  const openTheQuestion = async (page, context) => {
    const second = await watchingElsewhere(page, context);
    await headingSays(second, 'Watching in another tab', 5_000);
    await startKey(second).click();
    await theQuestion(second).waitFor({ timeout: 5_000 });
    return second;
  };
  for (const width of ROW_WIDTHS) {
    await open({ name: "second tab, the dialog's row", width, look: 'light' }, async (page, context, check) => {
      const second = await openTheQuestion(page, context);
      const row = await dialogRow(second);
      if (!row) throw new Error('the dialog has no row of keys');
      const tops = row.keys.map((key) => key.top);
      check(row.keys.length === 2, `the row holds ${row.keys.length} keys, not 2`);
      check(Math.max(...tops) - Math.min(...tops) <= 0.5, `the keys' tops are ${tops.map((top) => top.toFixed(1)).join(' and ')} px`);
      for (const key of row.keys) {
        check(key.height >= 44, `"${key.name}" is ${key.height} px tall, under 44`);
        check(key.whole, `"${key.name}" is cut`);
      }
      const sideways = await sidewaysScroll(second);
      check(sideways <= 0, `the page scrolls ${sideways} px sideways`);
    }, { script: FAKE_CAMERA });
  }
  await open({ name: "second tab, the dialog's row", width: 390, look: 'light' }, async (page, context, check) => {
    const second = await openTheQuestion(page, context);
    await largerText(second);
    const row = await dialogRow(second);
    if (!row) throw new Error('with larger text the dialog has no row of keys');
    const tops = row.keys.map((key) => key.top);
    check(Math.max(...tops) - Math.min(...tops) <= 0.5, `with larger text the keys' tops are ${tops.map((top) => top.toFixed(1)).join(' and ')} px`);
    check(row.scrolls || row.keys.every((key) => key.whole), `with larger text the keys do not fit and the row does not scroll inside itself (${row.keys.filter((key) => !key.whole).map((key) => key.name).join(', ')} cut)`);
    if (row.scrolls) {
      await pressRowArrows(second, '[role="dialog"] .app-dialog__keys', check);
      // Focus goes round the dialog's keys, the arrows among them, and stays inside it.
      const buttons = await second.locator('[role="dialog"] button').count();
      for (let i = 0; i <= buttons; i += 1) {
        await second.keyboard.press('Tab');
        check(await second.evaluate(() => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement)), 'with larger text Tab left the dialog');
      }
    }
    const sideways = await sidewaysScroll(second);
    check(sideways <= 0, `with larger text the page scrolls ${sideways} px sideways`);
  }, { script: FAKE_CAMERA });

  // ----- The ways -----

  await open({ name: 'ways, presses', width: 390, look: 'dark' }, async (page, context, check) => {
    for (const [index, name] of WAY_ROWS.entries()) {
      await openDash(page);
      await pressTo(page, page.locator('section.ways a.way__link').nth(index), WAY_PATHS[index]);
      check(pathOf(page) === WAY_PATHS[index], `the ${name} row opened ${pathOf(page)}, not ${WAY_PATHS[index]}`);
      const heading = await firstHeading(page).catch(() => 'no heading');
      check(heading === name, `the ${name} row opened a page headed "${heading}"`);
    }
  });

  // The Lost and Found row: the pet's photo and name, or its glyph.
  const lostAndFoundRow = (page) => page.evaluate(() => {
    const rows = [...document.querySelectorAll('section.ways li.way')];
    const row = rows[1];
    const img = row ? row.querySelector('.way__glyph img') : null;
    const box = img ? img.getBoundingClientRect() : null;
    return {
      img: img ? { alt: img.getAttribute('alt'), width: box.width, height: box.height } : null,
      svg: !!row && !!row.querySelector('.way__glyph svg'),
      line: row ? (row.querySelector('.way__line')?.textContent || '').replace(/’/g, "'").trim() : '',
      lefts: rows.map((one) => one.querySelector('.way__name')?.getBoundingClientRect().left ?? null),
      words: (document.querySelector('main.dash')?.innerText || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim(),
    };
  });
  await open({ name: 'ways, a pet', width: 390, look: 'light' }, async (page, context, check) => {
    const t0 = Date.now();
    await withNew(page, '/dashboard/', { pets: [{ id: 'pet-mittens', name: 'Mittens', at: t0 - 60_000 }, { id: 'pet-rex', name: 'Rex', at: t0 }] });
    await stateShown(page);
    await dashRead(page);
    await page.locator('section.ways .way__glyph img').first().waitFor({ timeout: 10_000 }).catch(() => {});
    let seen = await lostAndFoundRow(page);
    check(!!seen.img && seen.img.alt === 'Photo of Rex', `the Lost and Found row shows ${seen.img ? `"${seen.img.alt}"` : 'no photo'}, not "Photo of Rex"`);
    check(!!seen.img && seen.img.width === 32 && seen.img.height === 32, `the photo is ${seen.img ? `${seen.img.width} by ${seen.img.height}` : 'not there'}, not 32 by 32 px`);
    const lefts = seen.lefts.filter((left) => left !== null);
    check(lefts.length === 4 && Math.max(...lefts) - Math.min(...lefts) <= 0.5, `the way names start at ${seen.lefts.join(', ')} px`);
    check(seen.line === "Watches for Rex's colours.", `the row's line reads "${seen.line}"`);

    await remember(page, { way: 'lost-found', pet: 'pet-mittens' });
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await dashRead(page);
    await page.locator('section.ways .way__glyph img[alt="Photo of Mittens"]').waitFor({ timeout: 10_000 }).catch(() => {});
    seen = await lostAndFoundRow(page);
    check(!!seen.img && seen.img.alt === 'Photo of Mittens', `with Mittens watched last the row shows ${seen.img ? `"${seen.img.alt}"` : 'no photo'}`);
    check(seen.line === "Watches for Mittens's colours.", `with Mittens watched last the row's line reads "${seen.line}"`);
    const words = seen.words;

    await changePet(page, 'pet-mittens', { referenceImages: ['data:image/png;base64,AAAA'] });
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await dashRead(page);
    await page.waitForFunction(() => !!document.querySelectorAll('section.ways li.way')[1]?.querySelector('.way__glyph svg'), null, { timeout: 10_000 }).catch(() => {});
    seen = await lostAndFoundRow(page);
    check(seen.svg && !seen.img, `with a photo that cannot be read the row shows ${seen.img ? 'an img' : 'no img'} and ${seen.svg ? 'its glyph' : 'no glyph'}`);
    check(seen.line === "Watches for Mittens's colours.", `with a photo that cannot be read the row's line reads "${seen.line}"`);
    check(seen.words === words, `with a photo that cannot be read the page's words change: "${seen.words}"`);
  });

  await open({ name: "ways, People's line", width: 1280, look: 'dark' }, async (page, context, check) => {
    for (const [allowed, wanted] of [[2, 'Alerts above 2 people in view.'], [1, 'Alerts above 1 person in view.']]) {
      await visit(page, '/security/');
      const range = page.getByText('Allowed Persons', { exact: true }).first().locator('xpath=../..').locator('input[type="range"]').first();
      await range.waitFor({ timeout: 20_000 });
      // The value as a drag of the range sets it: through the input's own
      // setter, then its input event, which the page's handler hears.
      await range.evaluate((input, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, String(allowed));
      await pressTo(page, dashboardLink(page, 1280), '/dashboard');
      await stateShown(page);
      await dashRead(page);
      const line = await page.evaluate(() => (document.querySelectorAll('section.ways .way__line')[2]?.textContent || '').trim());
      check(line === wanted, `with ${allowed} allowed People's line reads "${line}", not "${wanted}"`);
    }
  });

  await open({ name: 'ways, the square', width: 390, look: 'dark' }, async (page, context, check) => {
    await withNew(page, '/dashboard/', { pets: [{ id: 'pet-mittens', name: 'Mittens' }] });
    await remember(page, { way: 'lost-found', pet: 'pet-mittens' });
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await stateShown(page);
    await dashRead(page);
    const seen = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('section.ways li.way')];
      const square = rows[1]?.querySelector('.way__name')?.firstElementChild;
      const box = square ? square.getBoundingClientRect() : null;
      return {
        first: square ? `${square.tagName.toLowerCase()}.${[...square.classList].join('.')}` : 'nothing',
        size: box ? `${box.width} by ${box.height}` : 'nothing',
        fill: square ? getComputedStyle(square).backgroundColor : null,
        others: rows.filter((row, i) => i !== 1 && row.querySelector('.way__square')).length,
        name: rows[1]?.querySelector('a')?.getAttribute('aria-label') || '',
      };
    });
    check(seen.first === 'span.way__square', `the first child of Lost and Found's name is ${seen.first}`);
    check(seen.size === '8 by 8', `the square is ${seen.size} px, not 8 by 8`);
    check(seen.fill === ACCENT.dark, `the square is filled ${seen.fill}, not ${ACCENT.dark}`);
    check(seen.others === 0, `${seen.others} other rows hold a square`);
    check(seen.name.endsWith('Start watching uses this way'), `the row's link is named "${seen.name}"`);
  });

  for (const look of LOOKS) {
    await open({ name: 'ways, offline', width: 390, look }, async (page, context, check) => {
      await visitThenOffline(page, context);
      await page.reload({ waitUntil: 'load', timeout: 60_000 });
      await stateShown(page);
      await dashRead(page);
      await page.waitForFunction((w) => (document.querySelectorAll('section.ways .way__line')[2]?.textContent || '').trim() === w, NEEDS_CONNECTION, { timeout: 10_000 }).catch(() => {});
      const lines = await page.evaluate(() => [...document.querySelectorAll('section.ways .way__line')].map((line) => line.textContent.replace(/’/g, "'").trim()));
      const wanted = ['Alerts on movement or sound.', "Watches for your pet's colours.", NEEDS_CONNECTION, NEEDS_CONNECTION];
      check(lines.join(' | ') === wanted.join(' | '), `offline the rows' lines read ${lines.map((line) => `"${line}"`).join(', ')}`);
      await pressTo(page, page.locator('section.ways a.way__link').nth(0), '/monitor');
      const monitor = await firstHeading(page).catch(() => 'no heading');
      check(pathOf(page) === '/monitor' && monitor === 'Motion and sound', `offline Motion and sound opened ${pathOf(page)}, headed "${monitor}"`);
      await back(page);
      await reaches(page, '/dashboard', 15_000);
      await stateShown(page);
      await pressTo(page, page.locator('section.ways a.way__link').nth(1), '/lost-found');
      const lostFound = await firstHeading(page).catch(() => 'no heading');
      check(pathOf(page) === '/lost-found' && lostFound === 'Lost and Found', `offline Lost and Found opened ${pathOf(page)}, headed "${lostFound}"`);
    });
  }

  for (const reduced of [false, true]) {
    const motion = reduced ? { reducedMotion: 'reduce' } : {};
    await open({ name: 'ways, hover', width: 1280, look: 'dark', ...motion }, async (page, context, check) => {
      await openDash(page);
      const row = page.locator('section.ways a.way__link').nth(2);
      await row.hover();
      await page.waitForTimeout(400);
      const seen = await row.evaluate((link) => ({ ground: getComputedStyle(link).backgroundColor, duration: getComputedStyle(link).transitionDuration }));
      const said = reduced ? 'under reduced motion ' : '';
      check(seen.ground === RAISED.dark, `${said}under the pointer People's row is filled ${seen.ground}, not ${RAISED.dark}`);
      const wanted = reduced ? '0s' : '0.12s';
      check(seen.duration.split(',').every((duration) => duration.trim() === wanted), `${said}the row's transition takes ${seen.duration}, not ${wanted}`);
    });
  }

  await open({ name: 'ways, a long pet name', width: 320, look: 'light' }, async (page, context, check) => {
    await withNew(page, '/dashboard/', { pets: [{ id: 'pet-long', name: 'Bartholomew-Fitzwilliam-the-Third-of-Ely' }] });
    await stateShown(page);
    await dashRead(page);
    await page.locator('section.ways .way__glyph img').first().waitFor({ timeout: 10_000 }).catch(() => {});
    const seen = await page.evaluate(() => {
      const row = document.querySelectorAll('section.ways li.way')[1];
      const line = row ? row.querySelector('.way__line') : null;
      const img = row ? row.querySelector('.way__glyph img') : null;
      const box = img ? img.getBoundingClientRect() : null;
      return {
        height: line ? line.getBoundingClientRect().height : 0,
        inside: !!line && line.scrollWidth <= line.clientWidth + 0.5,
        photo: box ? `${box.width} by ${box.height}` : 'nothing',
      };
    });
    check(seen.height > 24, `the row's line is ${seen.height} px tall, one line`);
    check(seen.inside, "the row's line runs past its box");
    check(seen.photo === '32 by 32', `the photo is ${seen.photo} px, not 32 by 32`);
    const sideways = await sidewaysScroll(page);
    check(sideways <= 0, `the page scrolls ${sideways} px sideways`);
  });

  await open({ name: 'ways, a person saved', width: 1280, look: 'light' }, async (page, context, check) => {
    const at = Date.now() - 60_000;
    await withNew(page, '/dashboard/', {
      pets: [{ id: 'subject-sam', name: 'Sam', type: 'person' }],
      matches: [0, 1, 2].map((i) => ({ id: `match-sam-dash${i}`, pet: 'subject-sam', at: at + i * 2_000, confidence: 90, alerted: true })),
    });
    await remember(page, { way: 'lost-found', pet: 'subject-sam' });
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    await stateShown(page);
    await dashRead(page);
    const seen = await lostAndFoundRow(page);
    check(seen.svg && !seen.img, `the Lost and Found row shows ${seen.img ? `the photo "${seen.img.alt}"` : 'no glyph'}`);
    check(seen.line === "Watches for your pet's colours.", `the row's line reads "${seen.line}"`);
    const line = await lineOf(page);
    check(line.startsWith(MOTION_LINE), `the line reads "${line}"`);
    const shownWords = await page.evaluate(() => ({
      words: document.body.innerText,
      rows: [...document.querySelectorAll('section.ways li.way')].map((row) => `${row.textContent} ${row.querySelector('a')?.getAttribute('aria-label') || ''}`).join(' '),
    }));
    const named = (shownWords.words.match(/\bSam\b/g) || []).length;
    check(named === 0, `the page names Sam ${named} times`);
    const finding = shownWords.rows.match(/identif|recogni[sz]|match/i);
    check(!finding, `the rows read "${finding ? finding[0] : ''}"`);
  });

  for (const look of LOOKS) {
    await open({ name: 'ways, a page not stored', width: 390, look }, async (page, context, check) => {
      await visit(page, '/dashboard/');
      if (!(await installed(page))) throw new Error('the installed copy is not whole after a visit to /dashboard/');
      const removed = await page.evaluate(async () => {
        const name = (await caches.keys()).find((key) => key.startsWith('safeos-shell-'));
        const cache = await caches.open(name);
        return [await cache.delete('/wildlife/'), await cache.delete('/wildlife/index.txt')];
      });
      check(removed[0] && removed[1], `the installed copy ${removed[0] ? 'held' : 'did not hold'} /wildlife/ and ${removed[1] ? 'held' : 'did not hold'} /wildlife/index.txt`);
      // The worker asks the network for a file its copy does not hold. With
      // the window offline that request was still answered here, so the
      // worker's own requests are made to fail too, as they do on a device
      // with no connection.
      const worker = context.serviceWorkers().at(-1);
      if (!worker) throw new Error('the page has no worker whose requests can be stopped');
      await worker.evaluate(() => { self.fetch = () => Promise.reject(new TypeError('Failed to fetch')); });
      const answers = [];
      page.on('response', (response) => {
        if (new URL(response.url()).pathname === '/wildlife/index.txt') answers.push(`${response.status()}${response.fromServiceWorker() ? ' from the worker' : ''}`);
      });
      await context.setOffline(true);
      await page.reload({ waitUntil: 'load', timeout: 60_000 });
      await stateShown(page);
      await page.locator('section.ways a.way__link').nth(3).click();
      await page.waitForFunction((h1) => (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim() === h1, OFFLINE_H1, { timeout: 20_000 }).catch(() => {});
      const heading = await page.evaluate(() => (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim());
      check(heading === OFFLINE_H1, `offline, Wildlife with its files gone shows "${heading}", not "${OFFLINE_H1}"`);
      check(answers.some((answer) => answer.startsWith('503')), `Wildlife's route data answered ${answers.join(', ') || 'nothing'}, not 503`);
      await pressTo(page, page.getByRole('link', { name: 'Open dashboard', exact: true }), '/dashboard');
      check(pathOf(page) === '/dashboard', `"Open dashboard" opened ${pathOf(page)}, not /dashboard`);
    });
  }

  // ----- The alerts -----

  const emptyShown = (page, ms = 10_000) => waitWords(page, 'section.since .since__empty', NOTHING_NEW, ms);

  for (const look of LOOKS) {
    await open({ name: 'since, nothing new', width: 390, look }, async (page, context, check) => {
      await openDash(page);
      await emptyShown(page);
      const seen = await page.evaluate(() => {
        const since = document.querySelector('section.since');
        const order = since ? [...since.querySelectorAll('h2, p, svg.level-line, a')]
          .map((element) => (element.matches('svg.level-line') ? 'the level line' : `${element.tagName.toLowerCase()} "${(element.textContent || '').replace(/\s+/g, ' ').trim()}"`)) : [];
        return {
          order,
          mark: [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Mark all as seen'),
          count: !!document.querySelector('p.dash-new'),
        };
      });
      const wanted = ['h2 "Since you last looked"', `p "${NOTHING_NEW}"`, 'the level line', 'a "Open history"'];
      check(seen.order.join(' > ') === wanted.join(' > '), `the part below reads ${seen.order.join(' > ')}`);
      check(!seen.mark, 'a button reads "Mark all as seen"');
      check(!seen.count, 'the first screen shows p.dash-new');
      checkHistory(check, await historyReads(page, 390, 'History'), 'History');
    });
  }

  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'since, four ways', width, look }, async (page, context, check) => {
        const saved = await dashboardWith(page, fourNew());
        const counted = await countReads(page, 4);
        if (width === 390) {
          check(counted, `the first screen reads "${await wordsAt(page, 'p.dash-new')}", not "4 new alerts since you last looked."`);
          const sentence = await page.evaluate(() => {
            const p = document.querySelector('p.dash-new');
            return p ? { glyph: !!p.firstElementChild && p.firstElementChild.matches('svg.problem-mark'), controls: p.querySelectorAll('a, button').length } : null;
          });
          check(!!sentence && sentence.glyph, 'the sentence does not follow the problem glyph');
          check(!!sentence && sentence.controls === 0, `the sentence holds ${sentence ? sentence.controls : 0} links or buttons`);
          const at = page.url();
          await page.locator('p.dash-new').click();
          await page.waitForTimeout(500);
          check(page.url() === at, `a press on the sentence opened ${page.url()}`);
          checkHistory(check, await historyReads(page, 390, 'History 4'), 'History 4', 'History, 4 new alerts');
          const rows = await page.locator('section.since li.since__item').count();
          check(rows === 3, `the part below lists ${rows} rows, not 3`);
          const more = await wordsAt(page, 'section.since .since__ways-on a.link-row');
          check(more === 'Open history, and 1 more', `the link row reads "${more}", not "Open history, and 1 more"`);
        } else {
          const at = [saved.sightings[0].at, saved.people[0].at, saved.matches[0].at, saved.motion[0].at];
          const times = [];
          for (const one of at) times.push(plain(await clockAt(page, one)));
          const wanted = [`Looks like a bird at ${times[0]}`, `1 person in view at ${times[1]}`, `Colours like Mittens's at ${times[2]}`, `Movement at ${times[3]}`];
          const entries = await page.evaluate(() => [...document.querySelectorAll('section.since li.since__item')].map((item) => ({
            what: (item.querySelector('.since__what')?.textContent || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim(),
            way: (item.querySelector('.since__way')?.textContent || '').trim(),
            picture: !!item.querySelector('img'),
          })));
          check(entries.map((entry) => entry.what).join(' | ') === wanted.join(' | '), `the entries read ${entries.map((entry) => `"${entry.what}"`).join(', ')}`);
          const ways = entries.map((entry) => entry.way).join(', ');
          check(ways === 'Wildlife, People, Lost and Found, Motion and sound', `the entries name the ways ${ways}`);
          check(entries.length >= 3 && entries.slice(0, 3).every((entry) => entry.picture), `of the first three entries ${entries.slice(0, 3).filter((entry) => entry.picture).length} show a picture`);
        }
        await page.screenshot({ path: path.join(outDir, `dashboard-alerts-${width}-${look}.png`), fullPage: true });
        if (width === 1280) {
          await pressTo(page, page.locator('section.since li.since__item a').first(), '/history', 15_000);
          check(pathOf(page) === '/history', `a press on the sighting's entry opened ${pathOf(page)}, not /history`);
          await page.waitForTimeout(1_000);
          await back(page);
          await reaches(page, '/dashboard', 15_000);
          check(await emptyShown(page), `back on the dashboard the part below reads "${await wordsAt(page, 'section.since')}"`);
        }
      });
    }
  }

  await open({ name: 'since, mark all as seen', width: 390, look: 'light' }, async (page, context, check) => {
    await dashboardWith(page, fourNew());
    await countReads(page, 4);
    await page.getByRole('button', { name: 'Mark all as seen', exact: true }).click();
    check(await emptyShown(page), `after Mark all as seen the part below reads "${await wordsAt(page, 'section.since')}"`);
    check((await page.locator('p.dash-new').count()) === 0, 'after Mark all as seen the first screen shows p.dash-new');
    checkHistory(check, await historyReads(page, 390, 'History'), 'History');
    const focused = await page.locator('h2#since-label:focus').waitFor({ timeout: 5000 })
      .then(() => true, () => false);
    check(focused, 'after Mark all as seen focus did not reach the Since you last looked heading');
    await visit(page, '/history/');
    await localTimeline(page);
    await page.getByRole('checkbox', { name: 'Unacknowledged only' }).check();
    const none = await page.getByText('No local events yet', { exact: true }).waitFor({ timeout: 10_000 }).then(() => true, () => false);
    check(none, 'History lists alerts not acknowledged after Mark all as seen');
  });

  await open({ name: 'since, open history', width: 390, look: 'dark' }, async (page, context, check) => {
    await dashboardWith(page, { motion: motionAlerts(2) });
    await countReads(page, 2);
    await pressTo(page, page.locator('section.since').getByRole('link', { name: 'Open history', exact: true }), '/history', 15_000);
    check(pathOf(page) === '/history', `Open history opened ${pathOf(page)}, not /history`);
    await page.waitForTimeout(1_000);
    await back(page);
    await reaches(page, '/dashboard', 15_000);
    check(await emptyShown(page), `back on the dashboard the part below reads "${await wordsAt(page, 'section.since')}"`);
    checkHistory(check, await historyReads(page, 390, 'History'), 'History');
  });

  // The saved alerts cannot be read until the person asks again.
  const REFUSE_DATABASE = () => {
    const opening = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      if (window.__refuse !== false) throw new DOMException('refused', 'UnknownError');
      return opening.apply(this, args);
    };
  };
  for (const look of LOOKS) {
    await open({ name: 'since, could not be read', width: 390, look }, async (page, context, check) => {
      await openDash(page);
      await checkProblem(page, check, 'Alerts could not be read on this device.', 'section.since');
      const again = page.locator('section.since').getByRole('button', { name: 'Try again', exact: true });
      check((await again.count()) === 1, 'the part below has no button "Try again"');
      check((await page.locator('p.dash-new').count()) === 0, 'the first screen shows p.dash-new');
      if (!(await again.count())) return;
      await page.evaluate(() => { window.__refuse = false; });
      await again.click();
      check(await emptyShown(page, 15_000), `after Try again the part below reads "${await wordsAt(page, 'section.since')}"`);
    }, { script: REFUSE_DATABASE });
  }

  // A device with no room left for the alert just raised.
  // The database's own first write, made as it is created, goes through:
  // the device ran out of room after SafeOS first opened on it.
  const REFUSE_ROOM = () => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.mode === 'versionchange') return put.apply(this, args);
      throw new DOMException('full', 'QuotaExceededError');
    };
  };
  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'since, out of room', width, look }, async (page, context, check) => {
        await visit(page, '/settings/test-alerts/');
        await lowAlert(page).click();
        await page.waitForTimeout(1_000);
        await pressTo(page, dashboardLink(page, width), '/dashboard');
        await stateShown(page);
        await checkProblem(page, check, OUT_OF_ROOM, 'section.since');
        await pressTo(page, page.locator('section.since').getByRole('link', { name: 'Open settings', exact: true }), '/settings', 15_000);
        check(pathOf(page) === '/settings', `Open settings opened ${pathOf(page)}, not /settings`);
      }, { script: REFUSE_ROOM });
    }
  }

  // An alert raised in another tab arrives with no reload, and the focus
  // stays where it was.
  await open({ name: 'since, another tab', width: 390, look: 'light' }, async (page, context, check) => {
    await openDash(page);
    await emptyShown(page);
    await startKey(page).focus();
    const second = await context.newPage();
    await visit(second, '/settings/test-alerts/');
    const at = await second.evaluate(() => Date.now());
    await lowAlert(second).click();
    check(await waitWords(page, 'p.dash-new', '1 new alert since you last looked.', 5_000), `within 5 seconds the first screen reads "${await wordsAt(page, 'p.dash-new')}", not "1 new alert since you last looked."`);
    checkHistory(check, await historyReads(page, 390, 'History 1'), 'History 1', 'History, 1 new alert');
    const times = [plain(await clockAt(page, at)), plain(await clockAt(page, at + 60_000))];
    const row = await wordsAt(page, 'section.since li.since__item .since__what');
    check(times.some((time) => row === `Alert at ${time}`), `the row reads "${row}", not "Alert at ${times[0]}"`);
    const said = await wordsAt(page, '.app-shell > [role="status"]');
    check(said === '1 new alert', `the status region reads "${said}", not "1 new alert"`);
    const focused = await focusedOn(page);
    check(focused === 'Start watching', `focus moved to "${focused}"`);
  });

  for (const reduced of [false, true]) {
    const motion = reduced ? { reducedMotion: 'reduce' } : {};
    await open({ name: 'since, reduced motion', width: 390, look: 'dark', ...motion }, async (page, context, check) => {
      const said = reduced ? 'under reduced motion ' : '';
      await dashboardWith(page, { motion: motionAlerts(1) });
      await countReads(page, 1);
      const second = await context.newPage();
      await visit(second, '/settings/test-alerts/');
      await lowAlert(second).click();
      check(await countReads(page, 2), `${said}the second alert did not arrive: the first screen reads "${await wordsAt(page, 'p.dash-new')}"`);
      const rows = await page.evaluate(() => [...document.querySelectorAll('section.since li.since__item')].map((item) => ({
        arrived: item.classList.contains('since__item--arrived'),
        animation: getComputedStyle(item).animationName,
        what: (item.querySelector('.since__what')?.textContent || '').replace(/\s+/g, ' ').trim(),
      })));
      const arrived = rows.filter((row) => row.arrived);
      check(arrived.length === 1 && arrived[0].what.startsWith('Alert at '), `${said}the rows marked arrived read ${arrived.map((row) => `"${row.what}"`).join(', ') || 'nothing'}`);
      const wanted = reduced ? 'none' : 'since-in';
      if (arrived.length) check(arrived[0].animation === wanted, `${said}the arrived row's animation is ${arrived[0].animation}, not ${wanted}`);
    });
  }

  await open({ name: 'since, the clock set back', width: 390, look: 'light' }, async (page, context, check) => {
    const t0 = Date.now();
    await dashboardWith(page, {
      motion: [{ id: `motion-${t0}-seen`, at: t0, seen: true }, { id: `motion-${t0 - 3_600_000}-earlier`, at: t0 - 3_600_000 }],
      people: [{ id: 'intrusion-earlier', at: t0 - 3_590_000 }],
    });
    check(await countReads(page, 2), `the first screen reads "${await wordsAt(page, 'p.dash-new')}", not "2 new alerts since you last looked."`);
    checkHistory(check, await historyReads(page, 390, 'History 2'), 'History 2', 'History, 2 new alerts');
  });

  await open({ name: 'since, a run that goes on', width: 1280, look: 'light' }, async (page, context, check) => {
    const t0 = Date.now();
    await dashboardWith(page, {
      people: [{ id: 'intrusion-run-1', at: t0 - 60_000, seen: true }, { id: 'intrusion-run-2', at: t0 - 55_000 }, { id: 'intrusion-run-3', at: t0 - 50_000 }],
    });
    checkHistory(check, await historyReads(page, 1280, 'History'), 'History');
    await seedAlerts(page, { people: [{ id: 'intrusion-run-4', at: t0 - 10_000 }] });
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    checkHistory(check, await historyReads(page, 1280, 'History 1'), 'History 1', 'History, 1 new alert');
  });

  // Lost and Found's threshold, written once for this tab, so a later
  // value written by the walk stands after a reload.
  const THRESHOLD_95 = () => {
    if (sessionStorage.getItem('walk-threshold-written')) return;
    sessionStorage.setItem('walk-threshold-written', '1');
    localStorage.setItem('safeos-lost-found', '{"state":{"settings":{"minConfidenceForAlert":95}},"version":0}');
  };
  await open({ name: 'since, older frames and the threshold', width: 390, look: 'light' }, async (page, context, check) => {
    const t0 = Date.now();
    await dashboardWith(page, {
      pets: [{ id: 'pet-mittens', name: 'Mittens' }],
      matches: [{ id: 'match-older-1', pet: 'pet-mittens', at: t0 - 4_000, confidence: 80 }, { id: 'match-older-2', pet: 'pet-mittens', at: t0 - 2_000, confidence: 80 }],
    });
    check(await emptyShown(page), `at a threshold of 95 the part below reads "${await wordsAt(page, 'section.since')}"`);
    await page.evaluate(() => {
      const kept = JSON.parse(localStorage.getItem('safeos-lost-found') || '{"state":{},"version":0}');
      kept.state = kept.state || {};
      kept.state.settings = { ...(kept.state.settings || {}), minConfidenceForAlert: 70 };
      localStorage.setItem('safeos-lost-found', JSON.stringify(kept));
    });
    await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });
    check(await countReads(page, 1), `at a threshold of 70 the first screen reads "${await wordsAt(page, 'p.dash-new')}", not "1 new alert since you last looked."`);
  }, { script: THRESHOLD_95 });

  // ----- Before setup, the layouts, every width -----

  const checkBeforeSetup = async (page, check, when = '') => {
    await emptyShown(page);
    const seen = await page.evaluate(() => {
      const words = (el) => (el ? (el.textContent || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim() : null);
      const setup = [...document.querySelectorAll('main.dash a')].find((a) => words(a) === 'Start setup');
      return {
        h1: words(document.querySelector('main.dash h1')),
        line: words(document.getElementById('dash-line')),
        setup: setup ? setup.getAttribute('href') : null,
        statement: words(document.querySelector('.dash-statement')),
        rows: [...document.querySelectorAll('section.ways li.way')].map((li) => words(li.querySelector('.way__name'))),
        squares: document.querySelectorAll('section.ways .way__square').length,
        since: words(document.querySelector('section.since .since__empty')),
      };
    });
    check(seen.h1 === 'Not watching', `${when}the heading reads "${seen.h1}", not "Not watching"`);
    check(seen.line === BEFORE_SETUP, `${when}the line reads "${seen.line}", not "${BEFORE_SETUP}"`);
    check(seen.setup === '/setup/', `${when}Start setup ${seen.setup ? `leads to ${seen.setup}` : 'is not there'}`);
    check(seen.statement === plain(STATEMENT), `${when}the statement reads "${seen.statement}"`);
    check(seen.rows.join(', ') === WAY_ROWS.join(', '), `${when}the rows read ${seen.rows.join(', ')}`);
    check(seen.squares === 0, `${when}${seen.squares} rows hold a square`);
    check(seen.since === NOTHING_NEW, `${when}the part below reads "${seen.since}"`);
  };

  for (const look of LOOKS) {
    await open({ name: 'before setup', width: 390, look }, async (page, context, check) => {
      await openDash(page);
      await page.waitForTimeout(3_000);
      check(pathOf(page) === '/dashboard', `three seconds on the address is ${pathOf(page)}, not /dashboard`);
      await checkBeforeSetup(page, check);
      await page.screenshot({ path: path.join(outDir, `dashboard-new-390-${look}.png`) });
    }, { state: 'new' });
  }

  const DAMAGED_SETUP = () => { localStorage.setItem('safeos-onboarding', '{bad'); };
  for (const look of LOOKS) {
    await open({ name: 'before setup, a damaged record', width: 390, look }, async (page, context, check) => {
      await openDash(page);
      await checkBeforeSetup(page, check);
      await pressTo(page, setupKey(page), '/setup', 15_000);
      check(pathOf(page) === '/setup', `Start setup opened ${pathOf(page)}, not /setup`);
    }, { state: 'new', script: DAMAGED_SETUP });
  }

  for (const look of LOOKS) {
    await open({ name: 'before setup, offline', width: 390, look }, async (page, context, check) => {
      await visitThenOffline(page, context);
      await page.reload({ waitUntil: 'load', timeout: 60_000 });
      await stateShown(page);
      await dashRead(page);
      await checkBeforeSetup(page, check, 'offline ');
      await pressTo(page, setupKey(page), '/setup', 15_000);
      check(pathOf(page) === '/setup', `offline Start setup opened ${pathOf(page)}, not /setup`);
      const first = await heading(page, STEP1_H1).waitFor({ timeout: 15_000 }).then(() => true, () => false);
      check(first, `offline setup does not show "${STEP1_H1}" from the installed copy`);
    }, { state: 'new' });
  }

  for (const look of LOOKS) {
    await open({ name: 'before setup, script held', width: 390, look }, async (page, context, check) => {
      await context.route('**/_next/static/chunks/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        await route.continue().catch(() => {});
      });
      await page.goto(address('/dashboard/'), { waitUntil: 'commit', timeout: 60_000 });
      // The page's own styles have applied once the header stands fixed.
      await page.waitForFunction(() => {
        const header = document.querySelector('header.app-header');
        return !!header && !!document.querySelector('.dash-key-place') && getComputedStyle(header).position === 'fixed';
      }, null, { timeout: 30_000 });
      const frame = await opacityOf(page, 'section.dash-state .drawn-frame[data-loading="true"]');
      check(frame === 1, `while the script is held the drawn frame is ${frame === -1 ? 'not loading' : `drawn at opacity ${frame}`}`);
      const held = await page.evaluate(() => {
        const place = document.querySelector('.dash-key-place');
        const box = place.getBoundingClientRect();
        return { top: box.top, height: box.height, empty: place.children.length === 0 && !place.textContent.trim() };
      });
      check(Math.abs(held.height - 52) <= 0.5, `while the script is held the key's place is ${held.height} px tall, not 52`);
      check(held.empty, "while the script is held the key's place is not empty");
      const came = await page.locator('.dash-key-place').getByRole('link', { name: 'Start setup', exact: true }).waitFor({ timeout: 30_000 }).then(() => true, () => false);
      check(came, "Start setup did not come into the key's place");
      if (!came) return;
      const top = await page.evaluate(() => document.querySelector('.dash-key-place').getBoundingClientRect().top);
      check(Math.abs(top - held.top) <= 28, `the key's place moved ${Math.abs(top - held.top).toFixed(1)} px when Start setup came, more than one body line`);
    }, { state: 'new' });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup to the dashboard', width: 390, look }, async (page, context, check) => {
      await openDash(page);
      await pressTo(page, setupKey(page), '/setup', 15_000);
      check(pathOf(page) === '/setup', `Start setup opened ${pathOf(page)}, not /setup`);
      await throughSetup(page, 'A pet');
      const key = lastKey(page);
      const reads = plain(await key.innerText());
      if (reads !== 'Open dashboard') {
        check(false, `the last key reads "${reads}", not "Open dashboard"`);
        return;
      }
      check((await page.getByText('Launch Dashboard').count()) === 0, 'an element reads "Launch Dashboard"');
      await pressTo(page, key, '/dashboard');
      await stateShown(page);
      await dashRead(page);
      const heading = await wordsAt(page, 'main.dash h1');
      check(heading === 'Not watching', `after setup the heading reads "${heading}"`);
      const line = await lineOf(page);
      check(line === MOTION_LINE, `after setup the line reads "${line}", not "${MOTION_LINE}"`);
      await page.waitForTimeout(3_000);
      check((await page.locator('[role="dialog"]').count()) === 0, 'three seconds after setup an element has role="dialog"');
    }, { state: 'new' });
  }

  for (const look of LOOKS) {
    await open({ name: "setup from a way's row", width: 390, look }, async (page, context, check) => {
      await openDash(page);
      await page.locator('section.ways a.way__link').nth(1).click();
      await page.waitForURL((url) => url.pathname === '/setup/' && url.search === '?next=lost-found', { timeout: 15_000 }).catch(() => {});
      const at = new URL(page.url());
      check(at.pathname === '/setup/' && at.search === '?next=lost-found', `Lost and Found opened ${at.pathname}${at.search}, not /setup/?next=lost-found`);
      const step = page.locator('#main-content main');
      await heading(page, STEP1_H1).waitFor({ timeout: 20_000 });
      await step.getByRole('button', { name: 'Continue without the camera', exact: true }).click();
      await heading(page, STEP2_H1).waitFor({ timeout: 10_000 });
      // Lost and Found's row shows A lost pet chosen, with no press.
      const chosen = await step.getByRole('radio', { name: 'A lost pet', exact: true }).isChecked();
      check(chosen, 'setup opened from Lost and Found\'s row shows A lost pet not chosen');
      const key = lastKey(page);
      const reads = plain(await key.innerText());
      if (reads !== 'Open Lost and Found') {
        check(false, `the last key reads "${reads}", not "Open Lost and Found"`);
        return;
      }
      await pressTo(page, key, '/lost-found');
      check(pathOf(page) === '/lost-found', `the last key opened ${pathOf(page)}, not /lost-found`);
      await page.waitForTimeout(2_000);
      check(pathOf(page) === '/lost-found', `two seconds on the address is ${pathOf(page)}, not /lost-found`);
      await visit(page, '/setup/');
      await reaches(page, '/dashboard', 10_000);
      check(pathOf(page) === '/dashboard', `setup opened again ends on ${pathOf(page)}, not /dashboard`);
    }, { state: 'new' });
  }

  await open({ name: "setup, a use's watch", width: 390, look: 'light' }, async (page, context, check) => {
    await visit(page, '/setup/');
    await throughSetup(page, 'A baby');
    await pressTo(page, lastKey(page), '/dashboard');
    await stateShown(page);
    await dashRead(page);
    await pressTo(page, startKey(page), '/monitor');
    // A device set up through the two steps has not answered the notice about alert pictures.
    await noticeStart(page).click({ timeout: 20_000 });
    check(await watchRuns(page), '/monitor/ does not show Stop watching');
    const saved = await settingsOf(page);
    const motion = saved.globalSettings ? saved.globalSettings.motionSensitivity : undefined;
    check(saved.activePresetId === 'infant_sleep' && motion === 98, `the watch runs with ${saved.activePresetId} at ${motion}, not infant_sleep at 98`);
  }, { state: 'new', script: FAKE_CAMERA });

  // ---------------------------------------------------------------------------
  // Setup, the two steps
  // ---------------------------------------------------------------------------
  // Step 1 says what this device does and turns on the camera, naming every
  // failure with a way on; step 2 shows the place live with its two bars,
  // asks what the device is watching and ends on the key that opens the
  // dashboard, the way named or, for a lost pet, Lost and Found. A new
  // device's walk grants the browser nothing, so the camera reads as not asked.

  const NEW_DEVICE = { state: 'new', permissions: [] };
  // One init script from setup's stand-ins: the camera, its permission, a
  // browser with no camera request, the camera's settings and any more.
  const setupScript = ({ camera = true, status = null, noRequest = false, set = {}, more = '' } = {}) => [
    camera ? `(${FAKE_CAMERA})();` : '',
    status ? `(${CAMERA_STATUS})(${JSON.stringify(status)});` : '',
    noRequest ? `(${NO_CAMERA_REQUEST})();` : '',
    `if (window.__camera) Object.assign(window.__camera, ${JSON.stringify(set)});`,
    more,
  ].join('\n');
  const setupMain = (page) => page.locator('#main-content main.setup');
  const setupWords = async (page) => plain(await setupMain(page).innerText());
  const step1Shown = (page, ms = 20_000) => heading(page, STEP1_H1).waitFor({ timeout: ms }).then(() => true, () => false);
  const step2Shown = (page, ms = 10_000) => heading(page, STEP2_H1).waitFor({ timeout: ms }).then(() => true, () => false);
  const continueOn = async (page) => {
    await setupMain(page).getByRole('button', { name: 'Continue without the camera', exact: true }).click();
    return step2Shown(page);
  };
  const turnOn = async (page, wait = true) => {
    await setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true }).first().click();
    if (!wait) return true;
    return page.locator('.setup-picture[data-state="on"]').waitFor({ timeout: 10_000 }).then(() => true, () => false);
  };
  const choose = (page, name) => setupMain(page).getByRole('radio', { name, exact: true }).check();
  const isChosen = (page, name) => setupMain(page).getByRole('radio', { name, exact: true }).isChecked();
  const chosenNames = (page) => setupMain(page).evaluate((main) => [...main.querySelectorAll('input[type="radio"]')]
    .filter((radio) => radio.checked).map((radio) => radio.closest('label').textContent.trim()));
  const keyWords = async (page) => plain(await lastKey(page).innerText());
  const lineLeft = (page, meter) => page.evaluate((name) => {
    const track = document.querySelector(`[role="meter"][aria-label="${name}"]`);
    const line = track && track.querySelector('.setup-track__line');
    return track ? (line ? line.style.left : 'none') : 'no meter';
  }, meter);
  const BLOCKED_WORDS = "The camera is blocked for safeos.sh in this browser. Allow it in the site's settings, then press Try again.";
  const FAILURE_SENTENCES = {
    closed: "The browser's question closed without an answer. Press Try again to see it again.",
    inUse: 'The camera did not start. Another app or tab may be using it. Close it, then press Try again.',
    noCamera: 'No camera was found on this device. Connect one, then press Try again.',
    savedGone: 'The camera chosen on this device is not connected. Connect it, then press Try again.',
    unsupported: 'This browser cannot use a camera on this page.',
    other: 'The camera did not start. Check the device, then press Try again.',
  };
  const CAMERA_OFF = 'The camera is off. SafeOS cannot watch until you turn it on.';
  const STEP1_LEAD = 'SafeOS watches with the camera and microphone and sounds an alert here when something moves, makes a sound or, for a lost pet, when its colours come into view.';
  const STEP1_STATEMENT = STATEMENT;
  const UNSAVED = 'This browser did not save setup. SafeOS works for this visit and asks for setup again next time.';
  const USE_WORDS = {
    'A pet': 'SafeOS sounds an alert here when your pet moves. History lists each alert with its time, for when you get back.',
    'A baby': 'For a nap while you stay close enough to hear this device.',
    'An elderly relative': 'SafeOS sounds an alert here when they move or make a sound, and, if you set a time in Settings, when nothing moves for that long.',
    'An empty place': 'SafeOS sounds an alert here when anything moves in the picture or this device hears a sound. Point it at a room, a doorway or a yard.',
    'A lost pet': "SafeOS watches for your pet's colours near home and keeps a picture of each possible sighting. Add your pet's photos on the Lost and Found page, then press Start watching there.",
  };
  const USE_NAMES = Object.keys(USE_WORDS);
  const useWords = async (page) => plain(await page.locator('#setup-use-words').innerText());
  // Setup's words hold the sentence, read with a straight and a curly apostrophe as one.
  const says = (page, sentence, ms = 10_000) => page.waitForFunction((want) => (document.querySelector('main.setup')?.innerText || '')
    .replace(/\u2019/g, "'").replace(/\s+/g, ' ').includes(want), sentence, { timeout: ms }).then(() => true, () => false);

  for (const look of LOOKS) {
    await open({ name: 'setup, the frame', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      if (!(await step1Shown(page))) { check(false, `"${STEP1_H1}" does not show`); return; }
      check((await page.locator('nav.phone-bar').count()) === 0, 'setup shows the bar at the foot of the screen');
      const banner = page.getByRole('banner');
      check((await banner.getByRole('button').count()) === 0, 'the header holds a button');
      check((await banner.getByRole('link', { name: /Menu|Notifications/ }).count()) === 0, 'the header holds Menu or Notifications');
      const sizes = await page.evaluate(() => {
        const main = document.querySelector('main.setup').getBoundingClientRect();
        const head = document.querySelector('header').getBoundingClientRect();
        const lookRow = document.querySelector('.setup-look').getBoundingClientRect();
        return { main: main.height, head: head.height, look: lookRow.top + window.scrollY, foot: window.innerHeight };
      });
      check(sizes.main >= sizes.foot - sizes.head - 1, `setup's column is ${sizes.main} px tall, short of the screen less the header (${sizes.foot - sizes.head})`);
      check(sizes.look >= sizes.foot - 1, `the look row starts at ${sizes.look} px, inside the first screen of ${sizes.foot}`);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const other = OTHER[look];
      const row = page.locator('.setup-look').getByRole('button', { name: `Switch to the ${other} look`, exact: true });
      if (!(await row.count())) { check(false, `the look row holds no "Switch to the ${other} look"`); return; }
      const box = await row.boundingBox();
      check(box && box.height >= 44, `the look row is ${box ? box.height : 0} px tall, under 44`);
      const before = await page.evaluate(() => {
        const rowAt = document.querySelector('.setup-look');
        const foot = document.querySelector('footer, [role="contentinfo"]');
        return foot ? Boolean(rowAt.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
      });
      check(before, 'the look row does not stand before the footer');
      await row.click();
      const changed = await page.waitForFunction((want) => document.documentElement.classList.contains(want), other, { timeout: 5_000 }).then(() => true, () => false);
      check(changed, `a press on the look row leaves html without "${other}"`);
      await page.reload({ waitUntil: 'networkidle' });
      check(await page.evaluate((want) => document.documentElement.classList.contains(want), other), `a reload does not keep the ${other} look`);
    }, NEW_DEVICE);
  }

  await open({ name: 'setup, back and forward', width: 390, look: 'light' }, async (page, context, check) => {
    await visit(page, '/setup/');
    await step1Shown(page);
    if (!(await continueOn(page))) { check(false, 'Continue does not open step 2'); return; }
    await choose(page, 'A pet');
    await page.goBack();
    check(await step1Shown(page, 5_000), `the browser's back button does not show "${STEP1_H1}" within 5 s`);
    check(pathOf(page) === '/setup', `the browser's back button left ${pathOf(page)}, not /setup`);
    await page.goForward();
    check(await step2Shown(page, 5_000), `the browser's forward button does not show "${STEP2_H1}"`);
    check(await isChosen(page, 'A pet'), 'after back and forward A pet is not chosen');
    check((await setupWords(page)).includes(CAMERA_OFF), 'after back and forward the frame does not say the camera is off');
  }, NEW_DEVICE);

  await open({ name: 'setup, a reload on step 2', width: 390, look: 'light' }, async (page, context, check) => {
    await visit(page, '/setup/');
    await step1Shown(page);
    await continueOn(page);
    await page.reload({ waitUntil: 'networkidle' });
    check(await step1Shown(page), `a reload of step 2 does not show "${STEP1_H1}"`);
    check((await heading(page, STEP2_H1).count()) === 0, `a reload of step 2 shows "${STEP2_H1}"`);
  }, NEW_DEVICE);

  for (const look of LOOKS) {
    await open({ name: 'setup, Back on step 1', width: 390, look }, async (page, context, check) => {
      for (const [from, path] of [['/', '/'], ['/dashboard/', '/dashboard']]) {
        await visit(page, from);
        const start = page.locator('main').getByRole('link', { name: 'Start setup', exact: true }).first();
        if (!(await start.count())) { check(false, `${from} shows no Start setup`); continue; }
        await start.click();
        await step1Shown(page);
        await setupMain(page).getByRole('link', { name: 'Back', exact: true }).click();
        await reaches(page, path, 10_000);
        check(pathOf(page) === path, `Back on step 1 from ${from} opened ${pathOf(page)}, not ${path}`);
      }
      const second = await context.newPage();
      await visit(second, '/setup/');
      await step1Shown(second);
      await setupMain(second).getByRole('link', { name: 'Back', exact: true }).click();
      await reaches(second, '/', 10_000);
      check(pathOf(second) === '/', `Back on step 1 in a new tab opened ${pathOf(second)}, not /`);
    }, NEW_DEVICE);
  }

  for (const reducedMotion of ['no-preference', 'reduce']) {
    await open({ name: 'setup, focus between the steps', width: 390, look: 'light', reducedMotion }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await continueOn(page);
      const onTwo = await page.evaluate(() => ({ focused: (document.activeElement && document.activeElement.textContent || '').trim(), tag: document.activeElement && document.activeElement.tagName, animation: getComputedStyle(document.querySelector('.setup-step')).animationName }));
      check(onTwo.tag === 'H1' && plain(onTwo.focused) === STEP2_H1, `after Continue the focus is on ${onTwo.tag} "${onTwo.focused}", not the heading`);
      const want = reducedMotion === 'reduce' ? 'none' : 'setup-in';
      check(onTwo.animation === want, `with ${reducedMotion} motion the step's animation is ${onTwo.animation}, not ${want}`);
      await setupMain(page).getByRole('link', { name: 'Back', exact: true }).click();
      await step1Shown(page, 5_000);
      const onOne = await page.evaluate(() => ({ focused: (document.activeElement && document.activeElement.textContent || '').trim(), tag: document.activeElement && document.activeElement.tagName }));
      check(onOne.tag === 'H1' && plain(onOne.focused) === STEP1_H1, `after Back the focus is on ${onOne.tag} "${onOne.focused}", not the heading`);
    }, NEW_DEVICE);
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, the glyph', width: 390, look }, async (page, context, check) => {
      const glyph = () => page.evaluate(() => {
        const svg = document.querySelector('.setup-back-row svg.setup-progress');
        if (!svg) return null;
        const on = [...svg.querySelectorAll('rect.setup-progress__on')].map((rect) => getComputedStyle(rect).fill);
        const off = [...svg.querySelectorAll('rect.setup-progress__off')].map((rect) => getComputedStyle(rect).stroke);
        return { role: svg.getAttribute('role'), name: svg.getAttribute('aria-label'), on, off };
      });
      await visit(page, '/setup/');
      await step1Shown(page);
      const one = await glyph();
      check(one && one.role === 'img' && one.name === 'Step 1 of 2', `step 1's glyph is ${JSON.stringify(one)}`);
      check(one && one.on.length === 1 && one.on[0] === ACCENT[look], `step 1's filled segment is ${one && one.on.join(', ')}, not ${ACCENT[look]}`);
      check(one && one.off.length === 1 && one.off[0] === LINE[look], `step 1's open segment is stroked ${one && one.off.join(', ')}, not ${LINE[look]}`);
      await continueOn(page);
      const two = await glyph();
      check(two && two.name === 'Step 2 of 2' && two.on.length === 2 && two.off.length === 0, `step 2's glyph is ${JSON.stringify(two)}`);
    }, NEW_DEVICE);
  }

  for (const width of LAYOUT_WIDTHS) {
    for (const look of LOOKS) {
      await open({ name: 'setup, pictures', width, look }, async (page, context, check) => {
        await visit(page, '/setup/');
        await step1Shown(page);
        const on = await turnOn(page);
        check(on, 'Turn on the camera does not show the live picture');
        await step2Shown(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(outDir, `setup-step2-${width}-${look}.png`), fullPage: true });
        await visit(page, '/setup/');
        await step1Shown(page);
        await continueOn(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(outDir, `setup-off-${width}-${look}.png`), fullPage: true });
        console.log(`captured setup-step2-${width}-${look}.png and setup-off-${width}-${look}.png`);
      }, { ...NEW_DEVICE, script: FAKE_CAMERA });
    }
  }

  for (const width of ROW_WIDTHS) {
    await open({ name: 'setup, one row', width, look: 'light' }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      const row = await page.evaluate(() => {
        const back = document.querySelector('.setup-back').getBoundingClientRect();
        const glyph = document.querySelector('.setup-back-row svg.setup-progress').getBoundingClientRect();
        const rowEl = document.querySelector('.setup-back-row');
        return { back: back.top + back.height / 2, glyph: glyph.top + glyph.height / 2, scroll: rowEl.scrollWidth, room: rowEl.clientWidth };
      });
      check(Math.abs(row.back - row.glyph) <= 2, `Back's middle and the glyph's are ${Math.abs(row.back - row.glyph).toFixed(1)} px apart`);
      check(row.scroll <= row.room, `the Back row needs ${row.scroll} px in ${row.room}`);
      await turnOn(page);
      await step2Shown(page);
      const two = await page.evaluate(() => {
        const meters = [...document.querySelectorAll('.setup-meter')].map((meter) => meter.getBoundingClientRect().top);
        const names = [...document.querySelectorAll('.setup-use__name')].map((name) => {
          const range = document.createRange();
          range.selectNodeContents(name);
          return { name: name.textContent.trim(), lines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size };
        });
        return { meters, names };
      });
      check(two.meters.length === 2 && Math.abs(two.meters[0] - two.meters[1]) <= 0.5, `the two meters' tops are ${two.meters.join(' and ')}`);
      for (const name of two.names) check(name.lines === 1, `"${name.name}" takes ${name.lines} lines`);
      check((await sidewaysScroll(page)) <= 0, 'step 2 scrolls sideways');
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  const OLD_SETUP_WORDS = ['Lost & Found', 'Begin Setup', 'Important Disclaimers', 'Accept & Continue', 'I understand these limitations',
    'System Setup', 'Device Access', 'Grant Permissions', 'Pet Monitoring', 'Baby Monitoring', 'Elderly Care', 'Security Mode',
    'Select Monitoring Scenario', 'You can change this later in settings.', 'Setup Complete', 'Launch Dashboard', 'configured and ready',
    'Step 6 of 6', 'Skip to main content', 'Scenario', 'monitoring server (API)'];
  for (const width of [390, 1280]) {
    await open({ name: 'setup, words', width, look: 'light' }, async (page, context, check) => {
      const holdsNone = async (where) => {
        const all = plain(await page.locator('body').innerText());
        for (const old of OLD_SETUP_WORDS) check(!all.includes(old), `${where} reads "${old}"`);
        const own = await setupMain(page).count() ? await setupWords(page) : '';
        check(!/\bmonitor\b/i.test(own), `${where} setup reads "monitor"`);
        check(!/\bAI\b/.test(own), `${where} setup reads "AI"`);
        check(!/babysit|carer|security system|identif|recogni[sz]|nonprofit|charit|donat/i.test(own), `${where} setup reads a word no page carries: ${own}`);
        return own;
      };
      await visit(page, '/setup/');
      await step1Shown(page);
      await holdsNone('step 1');
      await continueOn(page);
      for (const name of USE_NAMES) {
        await choose(page, name);
        const own = await holdsNone(`step 2 with ${name}`);
        const health = own.replace(plain('SafeOS is not a medical device. It does not watch breathing or any vital sign and cannot detect or prevent SIDS. Follow safe-sleep guidance.'), '');
        check(!/breath|vital sign|SIDS|medical/i.test(health), `step 2 with ${name} reads a health word outside the baby statement`);
        if (name === 'A lost pet') {
          check(!/\bmatch(es|ed|ing)?\b|detected|confidence|%|intruder|threat/i.test(own), `step 2 with A lost pet reads a word that says a finding is certain: ${own}`);
        }
      }
      await choose(page, 'A pet');
      await pressTo(page, lastKey(page), '/dashboard');
      await stateShown(page);
      await holdsNone('the dashboard after setup');
    }, NEW_DEVICE);
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, a set-up device', width: 390, look }, async (page, context, check) => {
      await visit(page, '/');
      await visit(page, '/setup/');
      await reaches(page, '/dashboard', 5_000);
      check(pathOf(page) === '/dashboard', `/setup/ on a set-up device ends on ${pathOf(page)}, not /dashboard`);
      await page.goBack();
      await reaches(page, '/', 5_000);
      check(pathOf(page) === '/', `Back from the dashboard opened ${pathOf(page)}, not the page before setup`);
      await visit(page, '/setup/?next=lost-found');
      await reaches(page, '/lost-found', 5_000);
      check(pathOf(page) === '/lost-found', `/setup/?next=lost-found ends on ${pathOf(page)}, not /lost-found`);
      await page.goBack();
      await reaches(page, '/', 5_000);
      check(pathOf(page) === '/', `Back from Lost and Found opened ${pathOf(page)}, not the page before setup`);
      await visit(page, '/setup/?again=1');
      check(await step1Shown(page), `/setup/?again=1 does not show "${STEP1_H1}"`);
      await page.waitForTimeout(3_000);
      check(pathOf(page) === '/setup', `three seconds on, /setup/?again=1 is ${pathOf(page)}`);
    });
  }

  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'setup, step 1', width, look }, async (page, context, check) => {
        await visit(page, '/setup/');
        if (!(await step1Shown(page))) { check(false, `"${STEP1_H1}" does not show`); return; }
        const all = await setupWords(page);
        const order = ['Back', STEP1_H1, STEP1_LEAD, 'Turn on the camera', 'Your browser will ask you to allow the camera and microphone.',
          'Continue without the camera', STEP1_STATEMENT, 'The picture stays on this device.'];
        let at = -1;
        for (const part of order) {
          const found = all.indexOf(part, at + 1);
          check(found > at, `step 1 does not read "${part}" after the words before it`);
          if (found > at) at = found;
        }
        const placed = await page.evaluate(() => {
          const frame = document.querySelector('.setup-frame');
          const key = document.querySelector('.setup-key');
          const line = document.querySelector('#setup-frame-line');
          const skip = document.querySelector('.setup-skip');
          return {
            key: Boolean(frame && key && frame.contains(key)),
            line: Boolean(frame && line && frame.contains(line)),
            skip: Boolean(frame && skip && !frame.contains(skip) && (frame.compareDocumentPosition(skip) & Node.DOCUMENT_POSITION_FOLLOWING)),
          };
        });
        check(placed.key && placed.line, `the key and the line stand inside the camera's frame: ${JSON.stringify(placed)}`);
        check(placed.skip, 'Continue without the camera does not stand after the frame');
      }, NEW_DEVICE);
    }
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, without the camera', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      check(await continueOn(page), `Continue does not show "${STEP2_H1}"`);
      const all = await setupWords(page);
      check(all.includes(CAMERA_OFF), 'step 2 does not say the camera is off');
      check((await setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true }).count()) === 1, 'step 2 has no Turn on the camera');
      check((await page.locator('[role="meter"]').count()) === 0, 'step 2 with the camera off shows a meter');
      check((await cameraRequests(page)) === 0, 'Continue asked for the camera');
      const saved = await onboardingOf(page);
      check(saved.cameraPermissionGranted === false && saved.microphonePermissionGranted === false, `the record holds the camera ${saved.cameraPermissionGranted} and the microphone ${saved.microphonePermissionGranted}, not both false`);
      check(await turnOn(page), "step 2's Turn on the camera does not show the live picture");
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  await open({ name: 'setup, what a press writes', width: 390, look: 'light' }, async (page, context, check) => {
    await visit(page, '/setup/');
    await step1Shown(page);
    await continueOn(page);
    const saved = await onboardingOf(page);
    const flags = saved.acceptedDisclaimers || {};
    check(flags.main === true && flags.scenario === true, `Continue wrote the statement's flags as ${JSON.stringify(flags)}`);
    check(Number.isFinite(Date.parse(saved.disclaimerAcceptedAt || '')), `Continue wrote the time "${saved.disclaimerAcceptedAt}"`);
    await choose(page, 'A pet');
    await pressTo(page, lastKey(page), '/dashboard');
    await visit(page, '/setup/?again=1');
    await step1Shown(page);
    const before = JSON.stringify(await onboardingOf(page));
    await continueOn(page);
    await choose(page, 'A baby');
    check(JSON.stringify(await onboardingOf(page)) === before, 'a run again wrote the record before the last key');
    await pressTo(page, lastKey(page), '/dashboard');
    check((await onboardingOf(page)).selectedScenario === 'baby', 'the last key of a run again did not write A baby');
  }, NEW_DEVICE);

  for (const look of LOOKS) {
    await open({ name: 'setup, blocked', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      const frame = page.locator('.setup-frame[data-state="failed"]');
      if (!(await frame.waitFor({ timeout: 10_000 }).then(() => true, () => false))) { check(false, 'the camera blocked before any press is not named'); return; }
      const inside = await frame.evaluate((el) => ({
        words: el.innerText,
        mark: Boolean(el.querySelector('svg.problem-mark')),
        key: [...el.querySelectorAll('button')].map((b) => b.textContent.trim()),
        link: [...el.querySelectorAll('a')].map((a) => a.textContent.trim()),
        drawing: Boolean(el.querySelector('.setup-camera-drawing')),
        line: Boolean(document.querySelector('#setup-frame-line')),
      }));
      check(plain(inside.words).includes(BLOCKED_WORDS), `the frame reads "${plain(inside.words)}"`);
      check(inside.mark, 'the frame holds no problem glyph');
      check(inside.key.includes('Try again'), `the frame's keys are ${inside.key.join(', ')}`);
      check(inside.link.includes('How to allow the camera'), `the frame's links are ${inside.link.join(', ')}`);
      check(!inside.drawing && !inside.line, 'the blocked frame still draws the camera or its line');
      check((await cameraRequests(page)) === 0, 'the camera was asked for before any press');
      await frame.getByRole('button', { name: 'Try again', exact: true }).click();
      await page.waitForTimeout(1_000);
      check((await cameraRequests(page)) === 1, `Try again made ${await cameraRequests(page)} requests, not 1`);
      const said = plain(await page.locator('.setup-frame-says').innerText());
      check(said === BLOCKED_WORDS, `after Try again the status region reads "${said}"`);
      const focus = await page.evaluate(() => (document.activeElement && document.activeElement.textContent || '').trim());
      check(focus === 'Try again', `after Try again the focus is on "${focus}"`);
      await frame.getByRole('link', { name: 'How to allow the camera', exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/help/' && url.hash === '#camera', { timeout: 15_000 }).catch(() => {});
      const at = new URL(page.url());
      check(at.pathname === '/help/' && at.hash === '#camera', `How to allow the camera opened ${at.pathname}${at.hash}`);
      const shown = await page.getByRole('heading', { name: 'Camera not working', exact: true }).isVisible().catch(() => false);
      check(shown, 'Help does not show "Camera not working" in view');
    }, { ...NEW_DEVICE, script: setupScript({ status: 'denied', set: { answer: 'NotAllowedError' } }) });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, blocked after Continue and Back', width: 390, look }, async (page, context, check) => {
      const blockedAgain = async (how) => {
        const frame = page.locator('.setup-frame[data-state="failed"]');
        const named = await frame.waitFor({ timeout: 5_000 }).then(() => true, () => false);
        check(named, `after Continue and ${how} step 1 does not name the blocked camera`);
        if (!named) return;
        const words = plain(await frame.innerText());
        check(words.includes(BLOCKED_WORDS) && words.includes('Try again') && words.includes('How to allow the camera'), `after Continue and ${how} the frame reads "${words}"`);
        check((await page.locator('#setup-frame-line').count()) === 0, `after Continue and ${how} the frame's line shows`);
      };
      await visit(page, '/setup/');
      await step1Shown(page);
      await continueOn(page);
      const two = await setupWords(page);
      check(two.includes(CAMERA_OFF) && !two.includes(BLOCKED_WORDS), `step 2 reads "${two}"`);
      await setupMain(page).getByRole('link', { name: 'Back', exact: true }).click();
      await step1Shown(page, 5_000);
      await blockedAgain('Back');
      await continueOn(page);
      await page.goBack();
      await step1Shown(page, 5_000);
      await blockedAgain("the browser's back button");
      check((await cameraRequests(page)) === 0, 'the camera was asked for with no press');
      await page.evaluate(() => window.__setCameraState('granted'));
      check(await step2Shown(page, 5_000), 'once the site allows the camera, step 2 does not open by itself');
      check((await cameraRequests(page)) === 1, `the site's allowing made ${await cameraRequests(page)} requests, not 1`);
    }, { ...NEW_DEVICE, script: setupScript({ status: 'denied' }) });

    await open({ name: 'setup, blocked after Continue and Back', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await continueOn(page);
      await setupMain(page).getByRole('link', { name: 'Back', exact: true }).click();
      await step1Shown(page, 5_000);
      const all = await setupWords(page);
      check(all.includes(FAILURE_SENTENCES.unsupported), `with no camera request step 1 reads "${all}"`);
      check((await setupMain(page).getByRole('button', { name: /^(Turn on the camera|Try again)$/ }).count()) === 0, 'with no camera request step 1 offers the camera');
      check((await setupMain(page).getByRole('button', { name: 'Continue without the camera', exact: true }).count()) === 1, 'with no camera request step 1 has no Continue');
    }, { ...NEW_DEVICE, script: setupScript({ camera: false, noRequest: true }) });
  }

  for (const look of LOOKS) {
    await open({ name: "setup, allowed in the site's settings", width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      const named = await page.locator('.setup-frame[data-state="failed"]').waitFor({ timeout: 10_000 }).then(() => true, () => false);
      check(named, 'the blocked camera is not named');
      await page.evaluate(() => window.__setCameraState('granted'));
      check(await step2Shown(page, 5_000), 'step 2 does not open by itself once the site allows the camera');
      check((await cameraRequests(page)) === 1, `${await cameraRequests(page)} requests, not 1`);
      await choose(page, 'A pet');
      await pressTo(page, lastKey(page), '/dashboard');
      check(pathOf(page) === '/dashboard', `the last key opened ${pathOf(page)}`);
      const saved = await onboardingOf(page);
      const flags = saved.acceptedDisclaimers || {};
      check(flags.main === true && flags.scenario === true && saved.isComplete === true, `the record holds ${JSON.stringify({ flags, complete: saved.isComplete })}`);
    }, { ...NEW_DEVICE, script: setupScript({ status: 'denied' }) });
  }

  for (const look of LOOKS) {
    const failure = async (width, set, status, sentence, more = {}) => {
      await open({ name: 'setup, each failure', width, look }, async (page, context, check) => {
        await visit(page, '/setup/');
        await step1Shown(page);
        if (!more.noPress) await setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true }).click();
        const named = await says(page, sentence);
        check(named, `${more.what}: step 1 does not read "${sentence}"`);
        const skip = await setupMain(page).getByRole('button', { name: 'Continue without the camera', exact: true }).count();
        check(skip === 1, `${more.what}: no Continue without the camera`);
        if (more.noRetry) {
          check((await setupMain(page).getByRole('button', { name: 'Try again', exact: true }).count()) === 0, `${more.what}: Try again shows`);
        }
        if (more.again) {
          await setupMain(page).getByRole('button', { name: 'Try again', exact: true }).click();
          await page.waitForTimeout(1_000);
          check((await cameraRequests(page)) === 2, `${more.what}: Try again made ${await cameraRequests(page)} requests in all, not 2`);
        }
      }, { ...NEW_DEVICE, script: setupScript({ camera: !more.noRequest, status, noRequest: Boolean(more.noRequest), set }) });
    };
    await failure(390, { answer: 'NotAllowedError' }, 'prompt', FAILURE_SENTENCES.closed, { what: 'the question closed', again: true });
    await failure(390, { answer: 'NotReadableError' }, null, FAILURE_SENTENCES.inUse, { what: 'in use' });
    await failure(390, { answer: 'NotFoundError' }, null, FAILURE_SENTENCES.noCamera, { what: 'no camera' });
    await failure(1280, { answer: 'NotFoundError' }, null, FAILURE_SENTENCES.noCamera, { what: 'no camera' });
    await failure(390, { answer: 'TypeError' }, null, FAILURE_SENTENCES.other, { what: 'another failure' });
    await failure(390, {}, null, FAILURE_SENTENCES.unsupported, { what: 'no camera request', noPress: true, noRetry: true, noRequest: true });
  }

  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'setup, the uses', width, look }, async (page, context, check) => {
        await visit(page, '/setup/');
        await step1Shown(page);
        await continueOn(page);
        const radios = await setupMain(page).evaluate((main) => [...main.querySelectorAll('input[type="radio"]')]
          .map((radio) => ({ name: radio.closest('label').textContent.trim(), checked: radio.checked })));
        check(JSON.stringify(radios.map((r) => r.name)) === JSON.stringify(USE_NAMES), `the answers are ${radios.map((r) => r.name).join(', ')}`);
        check(radios.every((r) => !r.checked), 'an answer is chosen before any press');
        check((await useWords(page)) === '', `before a press the answer's words read "${await useWords(page)}"`);
        for (const name of USE_NAMES) {
          await choose(page, name);
          const said = await useWords(page);
          check(said.startsWith(USE_WORDS[name]), `with ${name} the words read "${said}"`);
          if (name === 'A pet') {
            const box = await page.evaluate(() => {
              const chosen = document.querySelector('.setup-use__box[data-chosen="true"]');
              const style = getComputedStyle(chosen);
              return { edge: style.borderTopColor, width: style.borderTopWidth, ground: style.backgroundColor, square: Boolean(chosen.querySelector('.setup-use__square')) };
            });
            check(box.edge === ACCENT[look] && box.width === '2px', `A pet's edge is ${box.width} ${box.edge}`);
            check(box.ground === TRACK[look], `A pet's background is ${box.ground}, not ${TRACK[look]}`);
            check(box.square, 'A pet shows no square');
            if (width === 390) {
              const lefts = await page.evaluate(() => [...document.querySelectorAll('.setup-use__name')].map((n) => n.getBoundingClientRect().left));
              check(Math.max(...lefts) - Math.min(...lefts) <= 0.5, `the five names start at ${lefts.join(', ')}`);
            }
          }
          if (name === 'A baby') {
            const parts = (await page.locator('#setup-use-words').evaluate((el) => [...el.querySelectorAll('p, a')].map((part) => part.textContent))).map(plain);
            const want = [USE_WORDS['A baby'], plain('SafeOS is not a medical device. It does not watch breathing or any vital sign and cannot detect or prevent SIDS. Follow safe-sleep guidance.'),
              'Safe-sleep guidance from the NIH, opens in a new tab', 'Keep this device and its cord at least 3 feet (1 metre) from the crib.', 'Cord safety from the CPSC, opens in a new tab'];
            check(JSON.stringify(parts) === JSON.stringify(want), `A baby's words read ${JSON.stringify(parts)}`);
            if (width === 390) {
              await page.screenshot({ path: path.join(outDir, `setup-baby-390-${look}.png`), fullPage: true });
              console.log(`captured setup-baby-390-${look}.png`);
            }
          }
          if (name === 'A lost pet') {
            const glyph = await page.evaluate(() => {
              const label = [...document.querySelectorAll('.setup-use')].find((l) => l.textContent.trim() === 'A lost pet');
              const svg = label && label.querySelector('svg.setup-use__glyph');
              return svg ? { width: svg.getBoundingClientRect().width, stroke: getComputedStyle(svg).stroke } : null;
            });
            check(glyph && Math.abs(glyph.width - 24) <= 0.5, `A lost pet's glyph is ${glyph ? glyph.width : 'not'} px wide`);
            check(glyph && glyph.stroke === INK[look], `A lost pet's glyph is stroked ${glyph && glyph.stroke}, not ${INK[look]}`);
            check((await keyWords(page)) === 'Open Lost and Found', `with A lost pet the last key reads "${await keyWords(page)}"`);
            await page.screenshot({ path: path.join(outDir, `setup-lost-pet-${width}-${look}.png`), fullPage: true });
            console.log(`captured setup-lost-pet-${width}-${look}.png`);
          }
        }
      }, NEW_DEVICE);
    }
  }

  const SEEDED = (state) => `localStorage.setItem('safeos-onboarding', JSON.stringify({ state: ${JSON.stringify(state)}, version: 0 }));`;
  const SET_UP_WITH = (use, lostFound = false) => SEEDED({
    isComplete: true, selectedScenario: use, lostFoundChosen: lostFound,
    acceptedDisclaimers: { main: true, scenario: true, privacy: true, terms: true },
  });
  for (const look of LOOKS) {
    await open({ name: 'setup, chosen on opening', width: 390, look }, async (page, context, check) => {
      for (const [next, want, key] of [['lost-found', ['A lost pet'], 'Open Lost and Found'], ['security', ['An empty place'], 'Open People'], ['monitor', [], null], ['wildlife', [], null], [null, [], null]]) {
        await visit(page, next ? `/setup/?next=${next}` : '/setup/');
        await step1Shown(page);
        await continueOn(page);
        const seen = await chosenNames(page);
        check(JSON.stringify(seen) === JSON.stringify(want), `at ${next || 'no way'} the chosen answer is ${seen.join(', ') || 'none'}, not ${want.join(', ') || 'none'}`);
        if (key) check((await keyWords(page)) === key, `at ${next} the last key reads "${await keyWords(page)}"`);
      }
    }, NEW_DEVICE);

    await open({ name: 'setup, chosen on opening', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/?next=security');
      await step1Shown(page);
      await continueOn(page);
      check(await isChosen(page, 'A pet'), 'a device holding the pet use does not show A pet chosen at ?next=security');
      check((await keyWords(page)) === 'Open People', `the last key reads "${await keyWords(page)}"`);
    }, { ...NEW_DEVICE, script: SEEDED({ selectedScenario: 'pet', isComplete: false }) });

    await open({ name: 'setup, chosen on opening', width: 390, look }, async (page, context, check) => {
      for (const [address, key] of [['/setup/?again=1&next=lost-found', 'Open Lost and Found'], ['/setup/?again=1&next=monitor', 'Open Motion and sound']]) {
        await visit(page, address);
        await step1Shown(page);
        await continueOn(page);
        check(await isChosen(page, 'A baby'), `a baby device at ${address} does not show A baby chosen`);
        check((await keyWords(page)) === key, `at ${address} the last key reads "${await keyWords(page)}"`);
      }
    }, { ...NEW_DEVICE, script: SET_UP_WITH('baby') });

    await open({ name: 'setup, chosen on opening', width: 390, look }, async (page, context, check) => {
      for (const address of ['/setup/?again=1', '/setup/?again=1&next=wildlife']) {
        await visit(page, address);
        await step1Shown(page);
        await continueOn(page);
        check(await isChosen(page, 'A lost pet') && !(await isChosen(page, 'A pet')), `a device whose choice is Lost and Found shows ${(await chosenNames(page)).join(', ')} at ${address}`);
        check((await keyWords(page)) === 'Open Lost and Found', `at ${address} the last key reads "${await keyWords(page)}"`);
      }
    }, { ...NEW_DEVICE, script: SET_UP_WITH('pet', true) });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, run again with a use saved', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/?again=1');
      await step1Shown(page);
      await continueOn(page);
      check(await isChosen(page, 'A baby'), 'a baby device run again does not show A baby chosen');
      check((await useWords(page)).startsWith(USE_WORDS['A baby']), "A baby's words do not show");
      await pressTo(page, lastKey(page), '/dashboard');
      check(pathOf(page) === '/dashboard', `the last key opened ${pathOf(page)}`);
    }, { ...NEW_DEVICE, script: SET_UP_WITH('baby') });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, no use chosen', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await continueOn(page);
      await lastKey(page).click();
      await page.waitForTimeout(1_000);
      check(pathOf(page) === '/setup', `the last key with no use opened ${pathOf(page)}`);
      const says = await page.evaluate(() => {
        const box = document.querySelector('.setup-use-says');
        const group = document.querySelector('.setup-uses');
        return { words: box ? box.textContent.trim() : '', mark: Boolean(box && box.querySelector('svg.problem-mark')), above: Boolean(box && group && (box.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING)) };
      });
      check(plain(says.words) === 'Choose what this device is watching.' && says.mark && says.above, `the missing answer reads ${JSON.stringify(says)}`);
      const focus = await page.evaluate(() => document.activeElement && document.activeElement.closest('label') && document.activeElement.closest('label').textContent.trim());
      check(focus === 'A pet', `the focus is on "${focus}", not A pet`);
    }, NEW_DEVICE);
  }

  await open({ name: 'setup, a run again left part way', width: 390, look: 'dark' }, async (page, context, check) => {
    await visit(page, '/setup/?again=1');
    await step1Shown(page);
    await continueOn(page);
    await choose(page, 'A baby');
    await setupMain(page).getByRole('link', { name: 'Back', exact: true }).click();
    await step1Shown(page, 5_000);
    await setupMain(page).getByRole('link', { name: 'Back', exact: true }).click();
    await page.waitForTimeout(1_000);
    check((await onboardingOf(page)).selectedScenario === 'pet', `leaving part way left the use ${(await onboardingOf(page)).selectedScenario}`);
    await visit(page, '/setup/?again=1');
    await step1Shown(page);
    await continueOn(page);
    await choose(page, 'A baby');
    await pressTo(page, lastKey(page), '/dashboard');
    check((await onboardingOf(page)).selectedScenario === 'baby', `the last key left the use ${(await onboardingOf(page)).selectedScenario}`);
  }, { ...NEW_DEVICE, script: SET_UP_WITH('pet') });

  for (const look of LOOKS) {
    await open({ name: 'setup, finished with the camera off', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await throughSetup(page, 'A pet');
      await pressTo(page, lastKey(page), '/dashboard');
      await stateShown(page);
      await dashRead(page);
      check((await cameraRequests(page)) === 0, 'setup asked for the camera');
      await startKey(page).click();
      await page.waitForTimeout(2_000);
      check((await cameraRequests(page)) === 1, `the dashboard's key made ${await cameraRequests(page)} requests, not 1`);
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  for (const look of ['dark', 'light']) {
    await open({ name: 'setup, Back and the last key end the camera', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await turnOn(page);
      await setupMain(page).getByRole('link', { name: 'Back', exact: true }).click();
      await step1Shown(page, 5_000);
      const off = await page.waitForFunction(() => window.__camera.live.filter((s) => s.getVideoTracks().some((t) => t.readyState === 'live')).length === 0, null, { timeout: 2_000 }).then(() => true, () => false);
      check(off, `Back on step 2 left ${await camerasOn(page)} cameras on`);
      await visit(page, '/setup/');
      await step1Shown(page);
      await turnOn(page);
      await choose(page, 'A pet');
      await lastKey(page).click();
      await stateShown(page);
      check((await camerasOn(page).catch(() => 0)) === 0, 'the camera is on when the dashboard shows');
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, a late answer', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true }).click();
      await continueOn(page);
      await page.waitForTimeout(3_000);
      check((await setupWords(page)).includes(CAMERA_OFF), 'three seconds after Continue the frame no longer says the camera is off');
      check((await camerasOn(page)) === 0, `a late answer left ${await camerasOn(page)} cameras on`);
      check((await onboardingOf(page)).cameraPermissionGranted === false, 'a late answer was written as the camera allowed');
    }, { ...NEW_DEVICE, script: setupScript({ set: { waitMs: 2000 } }) });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, storage refused', width: 390, look }, async (page, context, check) => {
      await context.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
      await visit(page, '/setup/');
      await step1Shown(page);
      check(await turnOn(page), 'with storage refused the camera does not turn on');
      await choose(page, 'A pet');
      check((await useWords(page)).startsWith(USE_WORDS['A pet']), "with storage refused A pet's words do not show");
      check((await lineLeft(page, 'Motion')) === '10%' && (await lineLeft(page, 'Sound')) === 'none', `with A pet the lines stand at ${await lineLeft(page, 'Motion')} and ${await lineLeft(page, 'Sound')}`);
      await lastKey(page).click();
      await page.waitForTimeout(1_000);
      check(pathOf(page) === '/setup', `the first press opened ${pathOf(page)}`);
      const says = plain(await page.locator('.setup-last-says').innerText());
      check(says === UNSAVED, `beside the key: "${says}"`);
      await pressTo(page, lastKey(page), '/dashboard');
      check(pathOf(page) === '/dashboard', `the second press opened ${pathOf(page)}`);
      await page.reload({ waitUntil: 'networkidle' });
      await stateShown(page);
      check((await setupKey(page).count()) === 1, 'after a reload the dashboard does not offer Start setup');
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, storage refused everywhere', width: 390, look }, async (page, context, check) => {
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message.split('\n')[0]));
      await visit(page, '/setup/');
      check(await step1Shown(page, 10_000), `"${STEP1_H1}" does not show within 10 s`);
      await continueOn(page);
      await choose(page, 'A pet');
      await lastKey(page).click();
      await page.waitForTimeout(1_000);
      const says = plain(await page.locator('.setup-last-says').innerText().catch(() => ''));
      check(says === UNSAVED, `beside the key: "${says}"; errors: ${errors.join(' | ') || 'none'}`);
      await pressTo(page, lastKey(page), '/dashboard');
      check(pathOf(page) === '/dashboard', `the second press opened ${pathOf(page)}; errors: ${errors.join(' | ') || 'none'}`);
    }, { ...NEW_DEVICE, script: () => {
      const refuse = () => { throw new DOMException('denied', 'SecurityError'); };
      Storage.prototype.getItem = refuse;
      Storage.prototype.setItem = refuse;
      Storage.prototype.removeItem = refuse;
    } });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, the camera stops', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await turnOn(page);
      await page.evaluate(() => {
        const track = window.__camera.live[window.__camera.live.length - 1].getVideoTracks()[0];
        track.stop();
        track.dispatchEvent(new Event('ended'));
      });
      const stopped = await page.getByText('The camera stopped. Check the device, then press Try again.', { exact: true }).waitFor({ timeout: 5_000 }).then(() => true, () => false);
      check(stopped, 'a camera that stops is not named');
      check((await page.locator('.setup-picture svg.problem-mark').count()) >= 1, 'the stopped camera has no problem glyph');
      await setupMain(page).getByRole('button', { name: 'Try again', exact: true }).click();
      check(await page.locator('.setup-picture[data-state="on"]').waitFor({ timeout: 10_000 }).then(() => true, () => false), 'Try again does not turn the picture on');
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, no microphone', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      check(await turnOn(page), 'a camera with no microphone does not turn on');
      const cell = await page.evaluate(() => ({
        flat: Boolean(document.querySelector('.setup-meter__flat')),
        meters: [...document.querySelectorAll('[role="meter"]')].map((m) => m.getAttribute('aria-label')),
        words: (document.querySelector('.setup-no-mic') || {}).textContent || '',
      }));
      check(cell.flat && !cell.meters.includes('Sound'), `the Sound cell is ${JSON.stringify(cell)}`);
      check(plain(cell.words) === 'No microphone found. SafeOS watches for movement only.', `the strip reads "${cell.words}"`);
      const asked = await page.evaluate(() => window.__camera.asked.map((a) => a.audio));
      check(asked.length === 2 && asked[1] === false, `the requests asked for sound as ${JSON.stringify(asked)}`);
    }, { ...NEW_DEVICE, script: setupScript({ set: { microphone: false } }) });
  }

  {
    await open({ name: 'setup, a phone turned to a tablet', width: 390, height: 844, look: 'light' }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await turnOn(page);
      await choose(page, 'A pet');
      await page.setViewportSize({ width: 820, height: 1180 });
      await page.waitForTimeout(1_000);
      const seen = await page.evaluate(() => {
        const bar = document.querySelector('.setup-last');
        const key = document.querySelector('.setup-last-key').getBoundingClientRect();
        const words = document.querySelector('#setup-use-words').getBoundingClientRect();
        return {
          position: getComputedStyle(bar).position, keyTop: key.top, wordsBottom: words.bottom,
          fixed: document.documentElement.classList.contains('setup-bar-fixed'),
          padding: getComputedStyle(document.documentElement).scrollPaddingBottom, body: getComputedStyle(document.body).paddingBottom,
        };
      });
      check(seen.position === 'static', `at 820 px the bar is ${seen.position}`);
      check(seen.keyTop >= seen.wordsBottom - 0.5, `at 820 px the key's top (${seen.keyTop}) is above the words' foot (${seen.wordsBottom})`);
      check(!seen.fixed && seen.padding === 'auto' && seen.body === '0px', `at 820 px the page keeps the bar's room: ${JSON.stringify(seen)}`);
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, the fixed bar', width: 390, height: 844, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await turnOn(page);
      await choose(page, 'A baby');
      const bar = await page.evaluate(() => {
        const el = document.querySelector('.setup-last');
        const box = el.getBoundingClientRect();
        return {
          position: getComputedStyle(el).position, bottom: box.bottom, height: box.height,
          fixed: document.documentElement.classList.contains('setup-bar-fixed'),
          padding: getComputedStyle(document.documentElement).scrollPaddingBottom, body: getComputedStyle(document.body).paddingBottom,
        };
      });
      check(bar.position === 'fixed' && Math.abs(bar.bottom - 844) <= 1 && Math.abs(bar.height - 76) <= 1, `the bar is ${bar.position}, its foot at ${bar.bottom}, ${bar.height} px tall`);
      check(bar.fixed && Math.abs(parseFloat(bar.padding) - bar.height) <= 1 && Math.abs(parseFloat(bar.body) - bar.height) <= 1, `the page keeps ${bar.padding} and ${bar.body} for a bar of ${bar.height}`);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
      const foot = await page.evaluate(() => {
        const links = [...document.querySelectorAll('footer a, [role="contentinfo"] a')];
        const last = links[links.length - 1];
        const barTop = document.querySelector('.setup-last').getBoundingClientRect().top;
        return last ? { bottom: last.getBoundingClientRect().bottom, barTop } : null;
      });
      check(foot && foot.bottom <= foot.barTop + 0.5, `scrolled to the end, the footer's last link ends at ${foot && foot.bottom}, under the bar's top ${foot && foot.barTop}`);
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, own server', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      const one = await setupWords(page);
      check(one.includes('This device sends the picture to your own server while it watches.'), 'with a server saved step 1 does not say the picture goes to it');
      check(!one.includes('The picture stays on this device.'), 'with a server saved step 1 says the picture stays on this device');
      await throughSetup(page, 'A pet');
      await pressTo(page, lastKey(page), '/dashboard');
      await visit(page, '/setup/?again=1');
      await step1Shown(page);
      check((await setupWords(page)).includes('The picture stays on this device.'), "after A pet's setting, step 1 does not say the picture stays on this device");
    }, { ...NEW_DEVICE, script: () => localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://server.example', wsUrl: '', ollamaUrl: '', configured: true })) });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, private window', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      const said = await page.locator('p.setup-limit').waitFor({ timeout: 5_000 }).then(() => page.locator('p.setup-limit').innerText(), () => '');
      check(plain(said) === FORGETS, `step 1's line reads "${plain(said)}"`);
      await throughSetup(page, 'A pet');
      await pressTo(page, lastKey(page), '/dashboard');
      await stateShown(page);
      await dashRead(page);
      check((await problemsOf(page)).some((p) => p.words === FORGETS), 'the dashboard after setup does not say the browser forgets SafeOS');
    }, { ...NEW_DEVICE, windowStorage: 'probe' });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, run again with the camera allowed', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/?again=1');
      await step1Shown(page);
      await page.waitForTimeout(500);
      check((await page.locator('#setup-frame-line').count()) === 0, "with the camera allowed the frame's line shows");
      check(await turnOn(page), 'Turn on the camera does not show the picture');
      check((await cameraRequests(page)) === 1, `${await cameraRequests(page)} requests, not 1`);
    }, { script: setupScript({ status: 'granted' }) });
  }

  await open({ name: 'setup, the camera asked for', width: 390, look: 'light', userAgent: IPHONE_SAFARI }, async (page, context, check) => {
    await visit(page, '/setup/');
    await step1Shown(page);
    await turnOn(page);
    const asked = await page.evaluate(() => window.__camera.asked[0]);
    check(asked && asked.video && asked.video.facingMode === 'environment' && asked.audio === true, `the first request asked ${JSON.stringify(asked)}`);
  }, { ...NEW_DEVICE, script: FAKE_CAMERA });

  await open({ name: 'setup, the camera asked for', width: 390, look: 'light', userAgent: IPHONE_SAFARI }, async (page, context, check) => {
    await visit(page, '/setup/');
    await step1Shown(page);
    await turnOn(page);
    const asked = await page.evaluate(() => window.__camera.asked[0]);
    check(asked && asked.video && asked.video.deviceId && asked.video.deviceId.exact === 'usb', `with a saved camera the first request asked ${JSON.stringify(asked)}`);
  }, { ...NEW_DEVICE, script: setupScript({ more: "localStorage.setItem('safeos-camera', JSON.stringify({ state: { deviceId: 'usb' }, version: 0 }));" }) });

  for (const [width, look] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']]) {
    await open({ name: 'setup, a lost pet', width, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await turnOn(page);
      await choose(page, 'A lost pet');
      check((await useWords(page)) === USE_WORDS['A lost pet'], `A lost pet's words read "${await useWords(page)}"`);
      check((await lineLeft(page, 'Motion')) === '10%', `Motion's line stands at ${await lineLeft(page, 'Motion')}`);
      check((await lineLeft(page, 'Sound')) === 'none', `Sound's line stands at ${await lineLeft(page, 'Sound')}`);
      check((await keyWords(page)) === 'Open Lost and Found', `the last key reads "${await keyWords(page)}"`);
      await lastKey(page).click();
      await reaches(page, '/lost-found', 20_000);
      check(pathOf(page) === '/lost-found', `the last key opened ${pathOf(page)}`);
      await page.waitForTimeout(2_000);
      check(pathOf(page) === '/lost-found', `two seconds on the address is ${pathOf(page)}`);
      const saved = await onboardingOf(page);
      check(saved.selectedScenario === 'pet' && saved.lostFoundChosen === true && saved.isComplete === true, `the record holds ${JSON.stringify({ use: saved.selectedScenario, lostFound: saved.lostFoundChosen, complete: saved.isComplete })}`);
      check((await settingsOf(page)).activePresetId === 'pet_sleep', `the setting is ${(await settingsOf(page)).activePresetId}`);
      const way = await page.evaluate(() => localStorage.getItem('safeos-last-way'));
      check(way === '{"way":"lost-found"}', `the way the dashboard starts reads ${way}`);

      await openDash(page);
      const line = await lineOf(page);
      check(line === "Start watching uses Lost and Found. Add your pet's photos first.", `with no pet saved the dashboard's line reads "${line}"`);
      const marked = await page.evaluate(() => [...document.querySelectorAll('section.ways a.way__link')]
        .filter((link) => link.querySelector('.way__square')).map((link) => link.getAttribute('aria-label') || ''));
      check(marked.length === 1 && /^Lost and Found/.test(marked[0]) && /Start watching uses this way$/.test(marked[0]), `the square stands before ${marked.join(', ') || 'no way'}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, `dashboard-after-lost-pet-${width}-${look}.png`), fullPage: true });
      console.log(`captured dashboard-after-lost-pet-${width}-${look}.png`);
      const asked = await cameraRequests(page);
      const reads = plain(await startKey(page).innerText());
      check(reads === 'Start watching', `the dashboard's key reads "${reads}"`);
      await startKey(page).click();
      await reaches(page, '/lost-found', 20_000);
      check(pathOf(page) === '/lost-found', `with no pet saved the key opened ${pathOf(page)}`);
      check((await cameraRequests(page)) === asked, 'with no pet saved the key asked for the camera');
      check((await page.getByRole('button', { name: 'Stop watching', exact: true }).count()) === 0, 'with no pet saved a watch started');

      if (width !== 390 || look !== 'light') return;
      await seedAlerts(page, { pets: [{ id: 'pet-mittens', name: 'Mittens' }] });
      await openDash(page);
      const named = await lineOf(page);
      check(named === 'Start watching uses Lost and Found, for Mittens.', `with Mittens saved the line reads "${named}"`);
      await startKey(page).click();
      await reaches(page, '/monitor', 20_000);
      check(pathOf(page) === '/monitor', `with Mittens saved the key opened ${pathOf(page)}`);
      await noticeStart(page).click({ timeout: 20_000 }).catch(() => check(false, 'the notice before the first watch does not show'));
      check(await watchRuns(page), 'the watch for Mittens does not run');
      check(await page.getByRole('radio', { name: 'Lost and Found', exact: true }).isChecked().catch(() => false), 'Watch for does not show Lost and Found chosen');
      const watched = await page.waitForFunction(() => localStorage.getItem('safeos-last-way') === '{"way":"lost-found","pet":"pet-mittens"}', null, { timeout: 10_000 }).then(() => true, () => false);
      check(watched, `the watch wrote the way ${await page.evaluate(() => localStorage.getItem('safeos-last-way'))}`);
      await page.getByRole('button', { name: 'Stop watching', exact: true }).click();
      await forgetPet(page, 'pet-mittens');
      await openDash(page);
      const after = await lineOf(page);
      check(after.startsWith(MOTION_LINE), `with Mittens deleted the line reads "${after}"`);
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  await open({ name: 'setup, a lost pet over another use', width: 390, look: 'light' }, async (page, context, check) => {
    await visit(page, '/setup/?again=1');
    await step1Shown(page);
    await continueOn(page);
    check(await isChosen(page, 'A lost pet') && !(await isChosen(page, 'A baby')), `the chosen answer is ${(await chosenNames(page)).join(', ')}`);
    const settingBefore = JSON.stringify(await settingsOf(page));
    await pressTo(page, lastKey(page), '/lost-found');
    const saved = await onboardingOf(page);
    check(saved.selectedScenario === 'baby' && saved.lostFoundChosen === true, `the record holds ${saved.selectedScenario} with Lost and Found ${saved.lostFoundChosen}`);
    check(JSON.stringify(await settingsOf(page)) === settingBefore, 'the last key changed the setting');
    await visit(page, '/setup/?again=1');
    await step1Shown(page);
    await continueOn(page);
    await choose(page, 'A baby');
    check((await keyWords(page)) === 'Open dashboard', `with A baby the key reads "${await keyWords(page)}"`);
    await pressTo(page, lastKey(page), '/dashboard');
    const after = await onboardingOf(page);
    check(after.selectedScenario === 'baby' && after.lostFoundChosen === false, `the record holds ${after.selectedScenario} with Lost and Found ${after.lostFoundChosen}`);
    const way = await page.evaluate(() => localStorage.getItem('safeos-last-way'));
    check(way === '{"way":"monitor"}', `the way the dashboard starts reads ${way}`);
    await stateShown(page);
    await dashRead(page);
    const line = await lineOf(page);
    check(line.startsWith(MOTION_LINE), `the dashboard's line reads "${line}"`);
  }, { ...NEW_DEVICE, script: SET_UP_WITH('baby', true) });

  // Where the focus stands, and its ring.
  const focusOf = (page) => page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      name: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim(),
      tag: el.tagName, type: el.getAttribute('type'), id: el.id,
      inFooter: Boolean(el.closest('footer, [role="contentinfo"]')), inBanner: Boolean(el.closest('header, [role="banner"]')),
      outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
      inside: box.top >= 0 && box.left >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth,
    };
  });

  for (const look of LOOKS) {
    await open({ name: 'setup, keyboard', width: 1280, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await page.keyboard.press('Tab');
      const first = await focusOf(page);
      check(first && first.name === 'Skip to content', `the first Tab focuses "${first && first.name}"`);
      const ring = `2px solid ${ACCENT[look]}`;
      const want = ['Back', 'Turn on the camera', 'Continue without the camera'];
      let seen = [];
      for (let i = 0; i < 30 && seen.length < want.length; i += 1) {
        await page.keyboard.press('Tab');
        const at = await focusOf(page);
        if (!at || at.inBanner) continue;
        seen.push(at.name);
        check(at.outline === ring && at.inside, `${at.name} is focused with ${at.outline}${at.inside ? '' : ', outside the screen'}`);
      }
      check(JSON.stringify(seen) === JSON.stringify(want), `Tab on step 1 focuses ${seen.join(', ')}`);
      await page.keyboard.press('Tab');
      const after = await focusOf(page);
      check(after && after.inFooter, `after Continue, Tab focuses "${after && after.name}", not a link in the footer`);
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Enter');
      await step2Shown(page);
      const heading2 = await focusOf(page);
      check(heading2 && heading2.tag === 'H1', `on step 2 the focus is on ${heading2 && heading2.tag} "${heading2 && heading2.name}"`);
      seen = [];
      for (const name of ['Turn on the camera', 'A pet', 'Open dashboard']) {
        await page.keyboard.press('Tab');
        const at = await focusOf(page);
        seen.push(at ? (at.type === 'radio' ? (await page.evaluate(() => document.activeElement.closest('label').textContent.trim())) : at.name) : 'nothing');
        if (at && name !== 'A pet') check(at.outline === ring, `${at.name} is focused with ${at.outline}`);
      }
      check(JSON.stringify(seen) === JSON.stringify(['Turn on the camera', 'A pet', 'Open dashboard']), `Tab on step 2 focuses ${seen.join(', ')}`);
      await page.keyboard.press('Tab');
      const foot = await focusOf(page);
      check(foot && foot.inFooter, `after the last key, Tab focuses "${foot && foot.name}"`);
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      const back1 = await focusOf(page);
      check(back1 && back1.name === 'Turn on the camera', `Shift+Tab back reaches "${back1 && back1.name}"`);
      await page.keyboard.press('Shift+Tab');
      const back2 = await focusOf(page);
      check(back2 && back2.name === 'Back', `Shift+Tab once more reaches "${back2 && back2.name}"`);
    }, NEW_DEVICE);
  }

  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'setup, skip link', width, look }, async (page, context, check) => {
        await visit(page, '/setup/');
        await step1Shown(page);
        await page.keyboard.press('Tab');
        const skip = await focusOf(page);
        check(skip && skip.name === 'Skip to content', `the first Tab focuses "${skip && skip.name}"`);
        const shownAbove = await page.evaluate(() => {
          const el = document.activeElement.getBoundingClientRect();
          return el.width > 1 && el.height > 1 && el.top >= 0;
        });
        check(shownAbove, 'the skip link does not show when focused');
        await page.keyboard.press('Enter');
        const landed = await page.evaluate(() => document.activeElement && document.activeElement.id);
        check(landed === 'main-content', `Enter on the skip link focuses #${landed}`);
        await page.keyboard.press('Tab');
        const next = await focusOf(page);
        check(next && next.name === 'Back', `the Tab after the skip link focuses "${next && next.name}"`);
        check((await page.getByText('Skip to main content', { exact: true }).count()) === 0, 'the page holds "Skip to main content"');
      }, NEW_DEVICE);
    }
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, names and roles', width: 390, look }, async (page, context, check) => {
      if (look === 'dark') {
        // The blocked state: one sentence in the frame's status, focus kept on Try again, a link to Help.
        await visit(page, '/setup/');
        await step1Shown(page);
        await page.locator('.setup-frame[data-state="failed"]').waitFor({ timeout: 10_000 });
        const said = plain(await page.locator('.setup-frame-says').innerText());
        check(said === BLOCKED_WORDS, `the frame's status reads "${said}"`);
        const again = setupMain(page).getByRole('button', { name: 'Try again', exact: true });
        await again.focus();
        await again.press('Enter');
        await page.waitForTimeout(800);
        const focus = await focusOf(page);
        check(focus && focus.name === 'Try again', `after Try again the focus is on "${focus && focus.name}"`);
        check((await setupMain(page).getByRole('link', { name: 'How to allow the camera', exact: true }).count()) === 1, 'How to allow the camera is not a link');
        return;
      }
      await visit(page, '/setup/');
      await step1Shown(page);
      check((await page.getByRole('heading', { level: 1 }).count()) === 1, 'step 1 holds more than one h1');
      check((await setupMain(page).getByRole('img', { name: 'Step 1 of 2', exact: true }).count()) >= 1, 'step 1 holds no image named "Step 1 of 2"');
      check((await setupMain(page).getByRole('link', { name: 'Back', exact: true }).count()) === 1, 'step 1 holds no link Back');
      const key = setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true });
      check((await key.getAttribute('aria-describedby')) === 'setup-frame-line', 'Turn on the camera is not described by the frame line');
      check((await setupMain(page).getByRole('button', { name: 'Continue without the camera', exact: true }).count()) === 1, 'step 1 holds no Continue');
      await turnOn(page);
      await step2Shown(page);
      const video = await page.evaluate(() => {
        const v = document.querySelector('video.setup-video');
        return v ? { name: v.getAttribute('aria-label'), muted: v.muted, controls: v.controls } : null;
      });
      check(video && video.name === 'Live picture from this device’s camera' && video.muted && !video.controls, `the video is ${JSON.stringify(video)}`);
      const meters = await page.evaluate(() => [...document.querySelectorAll('[role="meter"]')].map((m) => ({
        name: m.getAttribute('aria-label'), min: m.getAttribute('aria-valuemin'), max: m.getAttribute('aria-valuemax'), text: m.getAttribute('aria-valuetext'),
      })));
      check(meters.length === 2 && meters[0].name === 'Motion' && meters[1].name === 'Sound', `the meters are ${JSON.stringify(meters)}`);
      for (const meter of meters) {
        check(meter.min === '0' && meter.max === '100' && ['below its line', 'at its line or past it', 'no alert for this use'].includes(meter.text), `the ${meter.name} meter is ${JSON.stringify(meter)}`);
      }
      const group = setupMain(page).getByRole('radiogroup', { name: STEP2_H1, exact: true });
      check((await group.count()) === 1, `no radiogroup named "${STEP2_H1}"`);
      const radios = await group.getByRole('radio').count();
      check(radios === 5, `the group holds ${radios} radios`);
      await choose(page, 'A pet');
      const described = await page.evaluate(() => {
        const group = document.querySelector('[role="radiogroup"]');
        const id = group && group.getAttribute('aria-describedby');
        const words = id && document.getElementById(id);
        return words ? words.textContent.replace(/\s+/g, ' ').trim() : '';
      });
      check(plain(described).startsWith(USE_WORDS['A pet']), `the group is described by "${described}"`);
      check((await setupMain(page).getByRole('button', { name: 'Open dashboard', exact: true }).count()) === 1, 'step 2 holds no Open dashboard');
      const crossed = await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some((s) => s.textContent.trim() === 'Motion reached its line.'), null, { timeout: 8_000 }).then(() => true, () => false);
      check(crossed, 'Motion reaching its line is not said');
      await visit(page, '/setup/?next=lost-found');
      await step1Shown(page);
      await continueOn(page);
      check((await setupMain(page).getByRole('button', { name: 'Open Lost and Found', exact: true }).count()) === 1, 'from Lost and Found\'s row the key is not "Open Lost and Found"');
    }, { ...NEW_DEVICE, script: look === 'dark' ? setupScript({ status: 'denied', set: { answer: 'NotAllowedError' } }) : FAKE_CAMERA });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, waiting for the answer', width: 390, look }, async (page, context, check) => {
      const waits = async (selector, where) => {
        const seen = await page.evaluate((s) => {
          const key = document.querySelector(s);
          if (!key) return null;
          const style = getComputedStyle(key);
          return { words: key.textContent.trim(), busy: key.getAttribute('aria-busy'), ground: style.backgroundColor, edge: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`, ink: style.color };
        }, selector);
        check(seen && seen.words === 'Waiting for your answer…' && seen.busy === 'true', `${where} the key is ${JSON.stringify(seen)}`);
        check(seen && seen.ground === 'rgba(0, 0, 0, 0)' && seen.edge === `2px solid ${LINE[look]}` && seen.ink === QUIET[look], `${where} the waiting key is drawn ${JSON.stringify(seen)}`);
      };
      await visit(page, '/setup/');
      await step1Shown(page);
      await setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true }).click();
      await page.waitForTimeout(300);
      await waits('.setup-key', 'while the browser asks');
      await page.locator('.setup-key').click();
      check((await cameraRequests(page)) === 1, `a second press made ${await cameraRequests(page)} requests`);
      check(await setupMain(page).getByRole('button', { name: 'Continue without the camera', exact: true }).isEnabled(), 'Continue is not enabled while the browser asks');
      check(await step2Shown(page, 8_000), 'step 2 does not open once the browser answers');
      await visit(page, '/setup/');
      await step1Shown(page);
      await continueOn(page);
      await page.evaluate(() => { window.__camera.waitMs = 2000; });
      await setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true }).click();
      await page.waitForTimeout(300);
      await waits('.setup-again', 'on step 2');
    }, { ...NEW_DEVICE, script: setupScript({ set: { waitMs: 3000 } }) });

    await open({ name: 'setup, waiting for the answer', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true }).click();
      const closed = await says(page, FAILURE_SENTENCES.closed);
      check(closed, 'the question closed is not named');
      await page.evaluate(() => { window.__camera.waitMs = 2000; });
      await setupMain(page).getByRole('button', { name: 'Try again', exact: true }).click();
      await page.waitForTimeout(300);
      const key = plain(await page.locator('.setup-key').innerText());
      check(key === 'Waiting for your answer…', `while Try again waits the key reads "${key}"`);
      await page.locator('.setup-key').click();
      check((await cameraRequests(page)) === 2, `a second press made ${await cameraRequests(page)} requests in all, not 2`);
      check(await setupMain(page).getByRole('button', { name: 'Continue without the camera', exact: true }).isEnabled(), 'Continue is not enabled while Try again waits');
    }, { ...NEW_DEVICE, script: setupScript({ status: 'prompt', set: { answers: ['NotAllowedError'] } }) });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, allowed', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      const pressed = Date.now();
      await setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true }).click();
      await step2Shown(page);
      const starting = await page.evaluate(() => {
        const picture = document.querySelector('.setup-picture[data-state="starting"]');
        if (!picture) return null;
        const after = getComputedStyle(picture, '::after');
        const names = [...document.styleSheets].flatMap((sheet) => { try { return [...sheet.cssRules]; } catch (e) { return []; } })
          .filter((rule) => rule instanceof CSSKeyframesRule).map((rule) => rule.name);
        return { words: picture.innerText.replace(/\s+/g, ' ').trim(), animation: after.animationName, display: after.display, defined: names.includes(after.animationName) };
      });
      check(starting && starting.words.includes('Starting the camera…'), `while the camera starts the picture reads ${JSON.stringify(starting)}`);
      check(starting && starting.animation === 'setup-loading' && starting.defined && starting.display !== 'none', `the loading bar is ${JSON.stringify(starting)}`);
      const on = await page.locator('.setup-picture[data-state="on"]').waitFor({ timeout: 3_000 + 1_500 }).then(() => true, () => false);
      check(on && Date.now() - pressed <= 4_500, `the picture was on ${((Date.now() - pressed) / 1000).toFixed(1)} s after the press`);
    }, { ...NEW_DEVICE, script: setupScript({ set: { firstFrameMs: 1500 } }) });

    await open({ name: 'setup, allowed', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      const pressed = Date.now();
      await setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true }).click();
      const on = await page.locator('.setup-picture[data-state="on"]').waitFor({ timeout: 2_000 }).then(() => true, () => false);
      check(on, `the picture was not on within 2 s of the press (${((Date.now() - pressed) / 1000).toFixed(1)} s)`);
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, key states', width: 1280, look }, async (page, context, check) => {
      const keyLook = (locator) => locator.evaluate((el) => {
        const style = getComputedStyle(el);
        return { ground: style.backgroundColor, edge: style.borderTopColor, transform: style.transform, outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}` };
      });
      await visit(page, '/setup/');
      await step1Shown(page);
      const again = setupMain(page).getByRole('button', { name: 'Try again', exact: true });
      await again.waitFor({ timeout: 10_000 });
      await again.hover();
      await page.waitForTimeout(300);
      const hovered = await keyLook(again);
      check(hovered.ground === ACCENT_HOVER[look], `over Try again its background is ${hovered.ground}, not ${ACCENT_HOVER[look]}`);
      await page.mouse.move(0, 0);
      await again.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      const focused = await keyLook(again);
      check(focused.outline === `2px solid ${ACCENT[look]}`, `Try again focused by Tab has ${focused.outline}`);
      const box = await again.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(200);
      const held = await keyLook(again);
      await page.mouse.up();
      check(held.transform === 'matrix(1, 0, 0, 1, 0, 1)', `Try again held down is ${held.transform}`);
    }, { ...NEW_DEVICE, script: setupScript({ status: 'denied', set: { answer: 'NotAllowedError' } }) });

    await open({ name: 'setup, key states', width: 1280, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await continueOn(page);
      const key = setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true });
      await key.hover();
      await page.waitForTimeout(300);
      const seen = await key.evaluate((el) => ({ ground: getComputedStyle(el).backgroundColor, edge: getComputedStyle(el).borderTopColor }));
      check(seen.ground === PANEL[look] && seen.edge === INK[look], `over step 2's Turn on the camera it is ${JSON.stringify(seen)}`);
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  for (const [width, look] of [[390, 'light'], [390, 'dark'], [1280, 'light']]) {
    await open({ name: 'setup, the test', width, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await turnOn(page);
      const over = await page.waitForFunction(() => {
        const fill = document.querySelector('[role="meter"][aria-label="Motion"] .setup-track__fill');
        return fill && fill.getAttribute('data-over') === 'true';
      }, null, { timeout: 5_000 }).then(() => true, () => false);
      check(over, 'Motion does not reach its line within 5 s');
      if (over) {
        const drawn = await page.evaluate(() => {
          const meter = document.querySelector('[role="meter"][aria-label="Motion"]');
          const row = meter.closest('.setup-meter').querySelector('.setup-meter__label');
          return { fill: getComputedStyle(meter.querySelector('.setup-track__fill')).backgroundColor, mark: Boolean(row.querySelector('svg.problem-mark')), words: row.textContent };
        });
        check(drawn.fill === ALERT[look] && drawn.mark && drawn.words.includes('Alert'), `Motion past its line is drawn ${JSON.stringify(drawn)}`);
      }
      check(await page.evaluate(() => [...document.querySelectorAll('audio')].every((a) => a.paused)), 'an alert sound plays during the test');
      const loud = await page.waitForFunction(() => Number(document.querySelector('[role="meter"][aria-label="Sound"]').getAttribute('aria-valuenow')) >= 20, null, { timeout: 5_000 }).then(() => true, () => false);
      check(loud, 'Sound does not reach 20 within 5 s of noise');
      for (const [name, motion, sound] of [['A pet', '10%', 'none'], ['A baby', '2%', '5%'], ['An elderly relative', '20%', '20%'], ['An empty place', '60%', '40%'], ['A lost pet', '10%', 'none']]) {
        await choose(page, name);
        const seen = [await lineLeft(page, 'Motion'), await lineLeft(page, 'Sound')];
        check(seen[0] === motion && seen[1] === sound, `with ${name} the lines stand at ${seen.join(' and ')}, not ${motion} and ${sound}`);
        if (sound === 'none') {
          const row = await page.evaluate(() => {
            const meter = document.querySelector('[role="meter"][aria-label="Sound"]');
            return { words: meter.closest('.setup-meter').querySelector('.setup-meter__label').textContent, text: meter.getAttribute('aria-valuetext'), over: meter.querySelector('.setup-track__fill').getAttribute('data-over') };
          });
          check(row.words.includes('No alert') && row.text === 'no alert for this use' && row.over !== 'true', `with ${name} the Sound row is ${JSON.stringify(row)}`);
        }
      }
      if (width === 390) {
        await choose(page, 'A pet');
        await page.waitForFunction(() => document.querySelector('[role="meter"][aria-label="Motion"] .setup-track__fill').getAttribute('data-over') === 'true', null, { timeout: 5_000 }).catch(() => {});
        await page.screenshot({ path: path.join(outDir, `setup-alert-390-${look}.png`) });
        console.log(`captured setup-alert-390-${look}.png`);
      }
      const line = plain(await page.locator('.setup-test-line').innerText());
      check(line === "Prop this device where it sees the spot to watch, plugged in. Wave or clap to test it. While SafeOS watches, a bar past its line sounds an alert on this device.", `the test line reads "${line}"`);
    }, { ...NEW_DEVICE, script: setupScript({ set: { sound: 'noise' } }) });
  }

  await open({ name: 'setup, 320', width: 320, look: 'dark' }, async (page, context, check) => {
    await visit(page, '/setup/');
    await step1Shown(page);
    await turnOn(page);
    const seen = await page.evaluate(() => {
      const video = document.querySelector('.setup-video').getBoundingClientRect();
      const meters = [...document.querySelectorAll('.setup-meter')].map((m) => {
        const box = m.getBoundingClientRect();
        const label = m.querySelector('.setup-meter__label').getBoundingClientRect();
        const track = m.querySelector('.setup-track').getBoundingClientRect();
        return { top: box.top, width: box.width, labelAbove: label.bottom <= track.top + 0.5 };
      });
      const options = [...document.querySelectorAll('.setup-use__box')].map((o) => {
        const box = o.getBoundingClientRect();
        const name = o.querySelector('.setup-use__name');
        const range = document.createRange();
        range.selectNodeContents(name);
        return { height: box.height, width: box.width, lines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size, name: name.textContent };
      });
      return { video: video.width, meters, options };
    });
    check(Math.abs(seen.video - 288) <= 1, `the picture is ${seen.video} px wide, not 288`);
    check(seen.meters.length === 2 && Math.abs(seen.meters[0].top - seen.meters[1].top) <= 0.5, `the meters' tops are ${seen.meters.map((m) => m.top).join(', ')}`);
    for (const meter of seen.meters) check(Math.abs(meter.width - 136) <= 2 && meter.labelAbove, `a meter is ${meter.width} px wide${meter.labelAbove ? '' : ' with its label beside its track'}`);
    for (const option of seen.options) {
      check(option.height >= 56 && Math.abs(option.width - 288) <= 1 && option.lines === 1, `"${option.name}" is ${option.width} by ${option.height} px on ${option.lines} lines`);
    }
    check((await sidewaysScroll(page)) <= 0, 'step 2 at 320 px scrolls sideways');
  }, { ...NEW_DEVICE, script: FAKE_CAMERA });

  for (const look of LOOKS) {
    await open({ name: 'setup, the saved camera gone', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true }).click();
      const named = await says(page, FAILURE_SENTENCES.savedGone);
      check(named, 'the saved camera gone is not named');
      await page.evaluate(() => { window.__camera.answer = 'ok'; window.__camera.waitMs = 2000; });
      await setupMain(page).getByRole('button', { name: 'Use the default camera', exact: true }).click();
      await page.waitForTimeout(300);
      const waiting = plain(await page.locator('.setup-default').innerText().catch(() => ''));
      check(waiting === 'Waiting for your answer…', `Use the default camera reads "${waiting}" while it waits`);
      const again = await setupMain(page).getByRole('button', { name: 'Try again', exact: true }).getAttribute('aria-disabled').catch(() => null);
      check(again === 'true', `Try again's aria-disabled is ${again} while the default camera is asked for`);
      await step2Shown(page, 8_000);
      const last = await page.evaluate(() => window.__camera.asked[window.__camera.asked.length - 1]);
      check(last && last.video && last.video.facingMode === 'environment' && !last.video.deviceId, `the default camera was asked as ${JSON.stringify(last)}`);
      check((await cameraOf(page)).deviceId === '', `a first setup kept the saved camera ${(await cameraOf(page)).deviceId}`);
    }, { ...NEW_DEVICE, script: setupScript({ set: { answer: 'OverconstrainedError' }, more: "localStorage.setItem('safeos-camera', JSON.stringify({ state: { deviceId: 'usb' }, version: 0 }));" }) });
  }

  await open({ name: 'setup, the question closed three times', width: 1280, look: 'light' }, async (page, context, check) => {
    await visit(page, '/setup/');
    await step1Shown(page);
    for (let i = 0; i < 3; i += 1) {
      await setupMain(page).getByRole('button', { name: i === 0 ? 'Turn on the camera' : 'Try again', exact: true }).click();
      const named = await says(page, FAILURE_SENTENCES.closed);
      check(named, `closing ${i + 1} is not named`);
      check((await setupMain(page).getByRole('button', { name: 'Continue without the camera', exact: true }).count()) === 1, `after closing ${i + 1} there is no Continue`);
    }
    await page.evaluate(() => { window.__setCameraState('denied'); window.__camera.answers = ['NotAllowedError']; });
    await setupMain(page).getByRole('button', { name: 'Try again', exact: true }).click();
    const blocked = await says(page, BLOCKED_WORDS);
    check(blocked, 'a fourth refusal with the camera blocked is not named blocked');
    check((await setupMain(page).getByRole('button', { name: 'Continue without the camera', exact: true }).count()) === 1, 'the blocked state has no Continue');
  }, { ...NEW_DEVICE, script: setupScript({ status: 'prompt', set: { answers: ['NotAllowedError', 'NotAllowedError', 'NotAllowedError'] } }) });

  for (const look of LOOKS) {
    await open({ name: 'setup, opening', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await throughSetup(page, 'A pet');
      let routeData = 0;
      await page.route('**/dashboard/**', async (route) => {
        if (route.request().url().includes('index.txt')) routeData += 1;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        await route.continue().catch(() => {});
      });
      await lastKey(page).click();
      await page.waitForTimeout(400);
      const seen = await lastKey(page).evaluate((el) => {
        const style = getComputedStyle(el);
        return { words: el.textContent.trim(), busy: el.getAttribute('aria-busy'), ground: style.backgroundColor, edge: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}` };
      }).catch(() => null);
      check(seen && seen.words === 'Opening the dashboard…' && seen.busy === 'true', `while the dashboard opens the key is ${JSON.stringify(seen)}`);
      check(seen && seen.ground === 'rgba(0, 0, 0, 0)' && seen.edge === `2px solid ${LINE[look]}`, `the opening key is drawn ${JSON.stringify(seen)}`);
      await lastKey(page).click({ timeout: 1_000 }).catch(() => {});
      await page.locator('main.dash h1').waitFor({ timeout: 20_000 }).catch(() => {});
      check(routeData <= 1, `the dashboard's route data was asked for ${routeData} times`);
    }, NEW_DEVICE);
  }

  for (const look of LOOKS) {
    await open({ name: "setup, the phone's step 2", width: 390, height: 844, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await turnOn(page);
      const seen = await page.evaluate(() => {
        const bar = document.querySelector('.setup-last');
        const top = bar.getBoundingClientRect().top;
        const before = getComputedStyle(bar, '::before');
        const options = [...document.querySelectorAll('.setup-use')].map((o) => o.getBoundingClientRect());
        const across = options.filter((o) => o.top < top && o.bottom > top).length;
        const whole = options.filter((o) => o.bottom <= top);
        const lastWhole = whole.length ? whole[whole.length - 1].bottom : null;
        return { top, across, lastWhole, before: { display: before.display, height: before.height, content: before.content } };
      });
      check(seen.across === 1, `${seen.across} options stand across the bar's top line, not 1`);
      check(seen.before.content !== 'none' && seen.before.height === '24px', `the fade over the bar is ${JSON.stringify(seen.before)}`);
      check(seen.lastWhole !== null && seen.top - seen.lastWhole <= 32, `the last whole option ends ${seen.lastWhole === null ? 'nowhere' : seen.top - seen.lastWhole} px above the bar`);
      await choose(page, 'A baby');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
      const end = await page.evaluate(() => {
        const top = document.querySelector('.setup-last').getBoundingClientRect().top;
        const words = document.querySelector('#setup-use-words').getBoundingClientRect();
        const options = [...document.querySelectorAll('.setup-use')].map((o) => o.getBoundingClientRect().bottom);
        return { top, words: words.bottom, options: Math.max(...options) };
      });
      check(end.options <= end.top + 0.5 && end.words <= end.top + 0.5, `scrolled to the end, the options end at ${end.options} and the words at ${end.words}, under the bar at ${end.top}`);
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  await open({ name: 'setup, the uses by keyboard', width: 1280, look: 'light' }, async (page, context, check) => {
    await visit(page, '/setup/');
    await step1Shown(page);
    await turnOn(page);
    await step2Shown(page);
    await setupMain(page).getByRole('link', { name: 'Back', exact: true }).focus();
    const radio = async () => page.evaluate(() => {
      const el = document.activeElement;
      return el && el.type === 'radio' ? { name: el.closest('label').textContent.trim(), checked: el.checked } : { name: (el && el.textContent || '').trim(), checked: false };
    });
    await page.keyboard.press('Tab');
    let at = await radio();
    check(at.name === 'A pet', `one Tab from Back focuses "${at.name}"`);
    for (const name of ['A baby', 'An elderly relative', 'An empty place', 'A lost pet']) {
      await page.keyboard.press('ArrowDown');
      at = await radio();
      check(at.name === name && at.checked, `ArrowDown reaches ${at.name}${at.checked ? '' : ', not checked'}, not ${name}`);
    }
    check((await useWords(page)) === USE_WORDS['A lost pet'], 'A lost pet chosen by keyboard does not show its words');
    await page.keyboard.press('Tab');
    const key = await focusOf(page);
    check(key && key.name === 'Open Lost and Found', `Tab after the answers focuses "${key && key.name}"`);
  }, { ...NEW_DEVICE, script: FAKE_CAMERA });

  for (const look of LOOKS) {
    await open({ name: "setup, the baby's links", width: 390, look }, async (page, context, check) => {
      await context.route('https://safetosleep.nichd.nih.gov/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>NIH</title>' }));
      await context.route('https://www.cpsc.gov/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>CPSC</title>' }));
      await visit(page, '/setup/');
      await step1Shown(page);
      await continueOn(page);
      await choose(page, 'A baby');
      for (const [name, url] of [['Safe-sleep guidance from the NIH', 'https://safetosleep.nichd.nih.gov/reduce-risk/reduce'], ['Cord safety from the CPSC', 'https://www.cpsc.gov/content/baby-monitor-cords-have-strangled-children']]) {
        const [opened] = await Promise.all([
          context.waitForEvent('page', { timeout: 10_000 }),
          setupMain(page).getByRole('link', { name: `${name}, opens in a new tab`, exact: true }).click(),
        ]);
        await opened.waitForLoadState('domcontentloaded').catch(() => {});
        check(opened.url() === url, `${name} opened ${opened.url()}`);
        await opened.close();
        check(await isChosen(page, 'A baby'), `after ${name} A baby is not chosen`);
      }
    }, NEW_DEVICE);
  }

  await open({ name: 'setup, reduced motion', width: 390, look: 'light', reducedMotion: 'reduce' }, async (page, context, check) => {
    await visit(page, '/setup/');
    await step1Shown(page);
    await setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true }).click();
    await page.locator('.setup-picture[data-state="starting"]').waitFor({ timeout: 5_000 }).catch(() => {});
    const bar = await page.evaluate(() => {
      const picture = document.querySelector('.setup-picture[data-state="starting"]');
      return picture ? getComputedStyle(picture, '::after').display : 'not starting';
    });
    check(bar === 'none', `under reduced motion the loading bar's display is ${bar}`);
    await page.locator('.setup-picture[data-state="on"]').waitFor({ timeout: 10_000 });
    const duration = await page.evaluate(() => getComputedStyle(document.querySelector('.setup-track__fill')).transitionDuration);
    check(duration === '0s', `under reduced motion the bars move over ${duration}`);
    const values = [];
    for (let i = 0; i < 40; i += 1) {
      values.push(await page.evaluate(() => document.querySelector('[role="meter"][aria-label="Motion"]').getAttribute('aria-valuenow')));
      await page.waitForTimeout(50);
    }
    let changes = 0;
    for (let i = 1; i < values.length; i += 1) if (values[i] !== values[i - 1]) changes += 1;
    check(changes <= 9, `under reduced motion Motion changed ${changes} times in 2 s`);
  }, { ...NEW_DEVICE, script: setupScript({ set: { firstFrameMs: 1500 } }) });

  await open({ name: 'setup, a run again keeps a tuned setting', width: 390, look: 'light' }, async (page, context, check) => {
    await visit(page, '/setup/');
    await throughSetup(page, 'A baby');
    await pressTo(page, lastKey(page), '/dashboard');
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('safeos-settings'));
      saved.state.scenarioOverrides = { ...(saved.state.scenarioOverrides || {}), baby: { motionSensitivity: 60 } };
      localStorage.setItem('safeos-settings', JSON.stringify(saved));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await visit(page, '/setup/?again=1');
    await step1Shown(page);
    await turnOn(page);
    check((await lineLeft(page, 'Motion')) === '40%' && (await lineLeft(page, 'Sound')) === '5%', `with A baby tuned the lines stand at ${await lineLeft(page, 'Motion')} and ${await lineLeft(page, 'Sound')}`);
    await pressTo(page, lastKey(page), '/dashboard');
    let saved = await settingsOf(page);
    check(saved.activePresetId === 'infant_sleep' && saved.globalSettings.motionSensitivity === 98 && saved.scenarioOverrides.baby.motionSensitivity === 60, `after the last key the settings are ${saved.activePresetId}, ${saved.globalSettings.motionSensitivity}, ${JSON.stringify(saved.scenarioOverrides)}`);
    await visit(page, '/setup/?again=1');
    await step1Shown(page);
    await turnOn(page);
    await choose(page, 'A pet');
    check((await lineLeft(page, 'Motion')) === '10%', `with A pet the Motion line stands at ${await lineLeft(page, 'Motion')}`);
    await pressTo(page, lastKey(page), '/dashboard');
    saved = await settingsOf(page);
    check(saved.activePresetId === 'pet_sleep' && saved.globalSettings.motionSensitivity === 90 && saved.scenarioOverrides.baby.motionSensitivity === 60, `after A pet the settings are ${saved.activePresetId}, ${saved.globalSettings.motionSensitivity}, ${JSON.stringify(saved.scenarioOverrides)}`);
  }, { ...NEW_DEVICE, script: FAKE_CAMERA });

  for (const look of LOOKS) {
    await open({ name: 'setup, first screen counted', width: 390, height: 844, look }, async (page, context, check) => {
      const OPTIONS = { root: '#main-content', bar: '.setup-last', inside: '.key--solid, .corner-ticks, .setup-camera-drawing', drawn: 'svg.setup-progress' };
      await visit(page, '/setup/');
      await step1Shown(page);
      await page.waitForTimeout(500);
      const one = await firstScreen(page, OPTIONS);
      console.log(`counted setup step 1 at 390 by 844, ${look}: ${JSON.stringify(one)}`);
      check(JSON.stringify(one.controls.map(plain)) === JSON.stringify(['Back', 'Turn on the camera', 'Continue without the camera']), `step 1's first screen holds the controls ${one.controls.join(', ')}`);
      check(one.styles.length <= 6, `step 1 shows ${one.styles.length} text styles`);
      check(one.boxes.length <= 7, `step 1 shows ${one.boxes.length} rules and boxes`);
      check(one.colours.length <= 12, `step 1 shows ${one.colours.length} colours`);
      const picture = await page.evaluate(() => document.querySelector('.setup-picture-line').getBoundingClientRect().bottom);
      check(picture < 844, `the picture line ends at ${picture}, under 844`);
      await turnOn(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      const two = await firstScreen(page, OPTIONS);
      console.log(`counted setup step 2 at 390 by 844, ${look}: ${JSON.stringify(two)}`);
      check(two.controls.length <= 6, `step 2's first screen holds ${two.controls.length} controls`);
      check(two.styles.length <= 6, `step 2 shows ${two.styles.length} text styles`);
      check(two.boxes.length <= 11, `step 2 shows ${two.boxes.length} rules and boxes`);
      check(two.colours.length <= 9, `step 2 shows ${two.colours.length} colours`);
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup to watching, press by press', width: 390, look }, async (page, context, check) => {
      let presses = 0;
      const press = async (locator) => { await locator.click(); presses += 1; };
      await visit(page, '/setup/');
      await step1Shown(page);
      await press(setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true }));
      await step2Shown(page);
      await press(setupMain(page).getByRole('radio', { name: 'A pet', exact: true }));
      await press(lastKey(page));
      await stateShown(page);
      await dashRead(page);
      await press(startKey(page));
      await reaches(page, '/monitor', 20_000);
      await press(noticeStart(page));
      const runs = await watchRuns(page);
      check(runs && presses === 5, `the watch ${runs ? 'runs' : 'does not run'} after ${presses} presses`);
      if (!runs) return;
      await page.getByRole('button', { name: 'Stop watching', exact: true }).click();
      await openDash(page);
      await startKey(page).click();
      await reaches(page, '/monitor', 20_000);
      const again = await watchRuns(page);
      check(again && (await page.getByRole('dialog', { name: 'Each alert keeps a picture', exact: true }).count()) === 0, 'the second watch does not start with no notice');
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, script held', width: 390, look }, async (page, context, check) => {
      await context.route('**/_next/static/chunks/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        await route.continue().catch(() => {});
      });
      await page.goto(address('/setup/'), { waitUntil: 'commit', timeout: 60_000 });
      await page.waitForSelector('main.setup .setup-statement', { timeout: 10_000 });
      await page.waitForTimeout(1_000);
      const parts = ['.setup-back', '.setup-back-row svg.setup-progress', 'main.setup h1', '.setup-lead', '.setup-key', '.setup-skip', '.setup-statement'];
      const tops = {};
      for (const part of parts) {
        const opacity = await opacityOf(page, part);
        check(opacity === 1, `while the script is held ${part} is ${opacity === -1 ? 'not served' : `drawn at opacity ${opacity}`}`);
        tops[part] = await page.evaluate((s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect().top : null; }, part);
      }
      const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      check(ground === PAGE[look], `while the script is held the page is ${ground}, not ${PAGE[look]}`);
      const started = await page.waitForSelector('[data-app-started]', { state: 'attached', timeout: 30_000 }).then(() => true, () => false);
      check(started, 'the app did not start');
      await page.waitForTimeout(500);
      for (const part of parts) {
        const top = await page.evaluate((s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect().top : null; }, part);
        check(top !== null && tops[part] !== null && Math.abs(top - tops[part]) <= 0.5, `${part} moved from ${tops[part]} to ${top} when the script ran`);
      }
    }, NEW_DEVICE);
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, offline', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      if (!(await installed(page))) { check(false, 'the installed copy is not whole after a visit to setup'); return; }
      await context.setOffline(true);
      await page.reload({ waitUntil: 'load', timeout: 60_000 });
      check(await step1Shown(page), `offline, setup does not show "${STEP1_H1}"`);
      const one = await setupWords(page);
      for (const part of [STEP1_LEAD, 'Turn on the camera', 'Continue without the camera', STEP1_STATEMENT, 'The picture stays on this device.']) {
        check(one.includes(part), `offline, step 1 does not read "${part}"`);
      }
      await turnOn(page);
      check(await step2Shown(page), 'offline, Turn on the camera does not open step 2');
      const first = await page.evaluate(() => document.querySelector('[role="meter"][aria-label="Motion"]')?.getAttribute('aria-valuenow'));
      const moved = await page.waitForFunction((was) => document.querySelector('[role="meter"][aria-label="Motion"]')?.getAttribute('aria-valuenow') !== was, first, { timeout: 3_000 }).then(() => true, () => false);
      check(moved, 'offline, the Motion bar does not move');
      await choose(page, 'A baby');
      const [opened] = await Promise.all([
        context.waitForEvent('page', { timeout: 10_000 }).catch(() => null),
        setupMain(page).getByRole('link', { name: 'Safe-sleep guidance from the NIH, opens in a new tab', exact: true }).click(),
      ]);
      check(Boolean(opened), 'offline, the NIH link opened no new page');
      if (opened) await opened.close();
      check(await isChosen(page, 'A baby'), 'after the NIH link A baby is not chosen');
      await choose(page, 'A pet');
      await pressTo(page, lastKey(page), '/dashboard', 20_000);
      check(pathOf(page) === '/dashboard', `offline, the last key opened ${pathOf(page)}`);
      check((await onboardingOf(page)).isComplete === true, 'offline, setup was not marked done');
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, offline and blocked', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      if (!(await installed(page))) { check(false, 'the installed copy is not whole after a visit to setup'); return; }
      await visit(page, '/help/');
      await installed(page);
      await context.setOffline(true);
      await visit(page, '/setup/').catch(() => {});
      await step1Shown(page);
      check(await says(page, BLOCKED_WORDS), 'offline, the blocked camera is not named');
      await setupMain(page).getByRole('link', { name: 'How to allow the camera', exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/help/' && url.hash === '#camera', { timeout: 15_000 }).catch(() => {});
      const at = new URL(page.url());
      check(at.pathname === '/help/' && at.hash === '#camera', `offline, How to allow the camera opened ${at.pathname}${at.hash}`);
      const seen = await page.getByRole('heading', { name: 'Camera not working', exact: true }).isVisible().catch(() => false);
      check(seen, 'offline, Help does not show "Camera not working" in view');
    }, { ...NEW_DEVICE, script: setupScript({ status: 'denied', set: { answer: 'NotAllowedError' } }) });
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, a page not stored', width: 390, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      if (!(await installed(page))) { check(false, 'the installed copy is not whole after a visit to setup'); return; }
      await page.evaluate(async () => {
        const name = (await caches.keys()).find((key) => key.startsWith('safeos-shell-'));
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const at = new URL(request.url).pathname;
          if (at === '/setup/' || at === '/setup/index.txt' || at === '/setup') await cache.delete(request);
        }
      });
      await context.setOffline(true);
      await visit(page, '/setup/').catch(() => {});
      const offline = await heading(page, OFFLINE_H1).waitFor({ timeout: 15_000 }).then(() => true, () => false);
      check(offline, `offline with setup not stored the page does not read "${OFFLINE_H1}"`);
      check((await page.getByRole('button', { name: 'Try again', exact: true }).count()) === 1, 'the offline page has no Try again');
      check((await page.getByRole('link', { name: 'Open dashboard', exact: true }).count()) + (await page.getByRole('button', { name: 'Open dashboard', exact: true }).count()) >= 1, 'the offline page has no Open dashboard');
      await context.setOffline(false);
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      check(await step1Shown(page), `online again, Try again does not show "${STEP1_H1}"`);
    }, NEW_DEVICE);
  }

  for (const look of LOOKS) {
    await open({ name: 'setup, a new tab offline', width: 390, look }, async (page, context, check) => {
      await visit(page, '/');
      if (!(await installed(page))) { check(false, 'the installed copy is not whole after a visit to the home page'); return; }
      await visit(page, '/setup/');
      await installed(page);
      await context.setOffline(true);
      const second = await context.newPage();
      await visit(second, '/setup/').catch(() => {});
      check(await step1Shown(second), 'offline, a new tab does not open setup from the installed copy');
      await setupMain(second).getByRole('link', { name: 'Back', exact: true }).click();
      await reaches(second, '/', 10_000);
      check(pathOf(second) === '/', `offline, Back in a new tab opened ${pathOf(second)}`);
      await second.evaluate(async () => {
        const name = (await caches.keys()).find((key) => key.startsWith('safeos-shell-'));
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const at = new URL(request.url).pathname;
          if (at === '/' || at === '/index.txt' || at === '/index.html') await cache.delete(request);
        }
      });
      const third = await context.newPage();
      await visit(third, '/setup/').catch(() => {});
      await step1Shown(third);
      await setupMain(third).getByRole('link', { name: 'Back', exact: true }).click();
      const offline = await heading(third, OFFLINE_H1).waitFor({ timeout: 15_000 }).then(() => true, () => false);
      check(offline, `offline with the home page not stored, Back does not show "${OFFLINE_H1}"`);
    }, NEW_DEVICE);
  }

  for (const width of [820, 1280, 1920]) {
    for (const look of LOOKS) {
      await open({ name: 'setup, the header at each width', width, look }, async (page, context, check) => {
        await visit(page, '/setup/');
        await step1Shown(page);
        const row = await page.evaluate(() => {
          const header = document.querySelector('header.app-header');
          const box = header.getBoundingClientRect();
          const items = [...header.querySelectorAll('a[href], button')].filter((el) => {
            const b = el.getBoundingClientRect();
            return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden';
          }).map((el) => {
            const b = el.getBoundingClientRect();
            return { name: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim(), middle: b.top + b.height / 2, left: b.left, right: b.right };
          });
          const back = document.querySelector('.setup-back-row').getBoundingClientRect();
          const glyph = document.querySelector('.setup-back-row svg.setup-progress').getBoundingClientRect();
          const lookRow = document.querySelector('.setup-look');
          return { height: box.height, items, back: { left: back.left, right: back.right, width: back.width }, glyph: glyph.right,
            lookShown: Boolean(lookRow && lookRow.getBoundingClientRect().height > 0 && getComputedStyle(lookRow).display !== 'none'), page: window.innerWidth };
        });
        const middles = row.items.map((item) => item.middle);
        check(Math.max(...middles) - Math.min(...middles) <= 2, `the header's controls stand at ${middles.join(', ')}`);
        const names = row.items.map((item) => item.name);
        for (const want of rowNames(look)) {
          check(names.includes(want) || names.includes('More'), `the header does not hold "${want}": ${names.join(', ')}`);
        }
        check(Math.abs(row.glyph - row.back.right) <= 1, `the glyph ends at ${row.glyph}, not the Back row's right end ${row.back.right}`);
        if (width === 820) {
          check(Math.abs(row.height - 64) <= 1, `the header row is ${row.height} px tall, not 64`);
          check(!row.lookShown, 'at 820 px the look row shows in setup');
          check(row.back.width <= 704 + 1, `the Back row is ${row.back.width} px wide, wider than the 704 px column`);
        }
        if (width === 1280) check(Math.abs(row.back.width - 1200) <= 1, `the Back row is ${row.back.width} px wide, not 1200`);
        if (width === 1920) {
          const links = row.items.filter((item) => ['Dashboard', 'History', 'Settings', 'Help'].includes(item.name));
          const middle = links.length ? (links[0].left + links[links.length - 1].right) / 2 : 0;
          check(Math.abs(middle - row.page / 2) <= 2, `the four links' middle is ${middle}, not the page's ${row.page / 2}`);
        }
      }, NEW_DEVICE);
    }
  }

  if (partRuns("setup, Chromium's own camera")) try {
    const real = await browser.browserType().launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    try {
      const context = await real.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'light' });
      await context.grantPermissions(['camera', 'microphone'], { origin: new URL(baseUrl).origin });
      const page = await context.newPage();
      const what = (text) => `setup, Chromium's own camera at 390 px, light: ${text}`;
      try {
        await visit(page, '/setup/');
        await step1Shown(page);
        const on = await turnOn(page);
        expect(on, what('Turn on the camera does not show the picture'));
        const motion = new Set();
        const sound = new Set();
        for (let i = 0; i < 30; i += 1) {
          const now = await page.evaluate(() => ({
            motion: document.querySelector('[role="meter"][aria-label="Motion"]')?.getAttribute('aria-valuenow'),
            sound: document.querySelector('[role="meter"][aria-label="Sound"]')?.getAttribute('aria-valuenow'),
          }));
          motion.add(now.motion);
          sound.add(now.sound);
          await page.waitForTimeout(100);
        }
        expect(motion.size >= 2, what(`Motion took ${motion.size} values in 3 s`));
        expect(sound.size >= 2, what(`Sound took ${sound.size} values in 3 s`));
      } catch (err) {
        fail(what(err.message.split('\n')[0]));
      } finally {
        await context.close();
      }
    } finally {
      await real.close();
    }
  } catch (err) {
    fail(`setup, Chromium's own camera at 390 px, light: its browser did not start: ${err.message.split('\n')[0]}`);
  }

  await open({ name: "setup, a pet's alert in History", width: 390, look: 'light' }, async (page, context, check) => {
    await visit(page, '/setup/');
    await throughSetup(page, 'A pet');
    await pressTo(page, lastKey(page), '/dashboard');
    await stateShown(page);
    await dashRead(page);
    await pressTo(page, startKey(page), '/monitor');
    await noticeStart(page).click({ timeout: 20_000 }).catch(() => check(false, 'the notice before the first watch does not show'));
    if (!(await watchRuns(page))) { check(false, 'the watch does not run'); return; }
    const alerted = await page.waitForFunction(async () => {
      const db = await new Promise((resolve) => { const r = indexedDB.open('safeos-guardian'); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(null); });
      if (!db || !db.objectStoreNames.contains('alert_cache')) return false;
      const count = await new Promise((resolve) => { const r = db.transaction('alert_cache').objectStore('alert_cache').count(); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(0); });
      db.close();
      return count > 0;
    }, null, { timeout: 20_000, polling: 1_000 }).then(() => true, () => false);
    check(alerted, 'no alert within 20 s of watching');
    await page.getByRole('button', { name: 'Stop watching', exact: true }).click();
    await visit(page, '/history/');
    const listed = await page.locator('#main-content').getByText(/\d{1,2}:\d{2}/).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
    check(listed, 'History lists no alert with its time');
  }, { ...NEW_DEVICE, script: FAKE_CAMERA });

  const FIT_STATES = [
    ['blocked', { status: 'denied', set: { answer: 'NotAllowedError' } }, false],
    ['the question closed', { status: 'prompt', set: { answer: 'NotAllowedError' } }, true],
    ['in use', { set: { answer: 'NotReadableError' } }, true],
    ['no camera', { set: { answer: 'NotFoundError' } }, true],
    ['the saved camera gone', { set: { answer: 'OverconstrainedError' }, more: "localStorage.setItem('safeos-camera', JSON.stringify({ state: { deviceId: 'usb' }, version: 0 }));" }, true],
    ['no camera request', { camera: false, noRequest: true }, false],
    ['another failure', { set: { answer: 'TypeError' } }, true],
  ];
  const bottomOf = (page, selector) => page.evaluate((s) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect().bottom : null; }, selector);
  for (const look of LOOKS) {
    for (const height of [660, 844]) {
      await open({ name: "setup, the first screen's fit", width: 390, height, look }, async (page, context, check) => {
        await visit(page, '/setup/');
        await step1Shown(page);
        const key = await bottomOf(page, '.setup-key');
        const skip = await bottomOf(page, '.setup-skip');
        check(key !== null && key <= height && skip !== null && skip <= height, `at ${height} px the keys end at ${key} and ${skip}`);
        if (height === 660) {
          const statement = await page.evaluate(() => document.querySelector('.setup-statement').getBoundingClientRect().top);
          check(statement < 660, `at 660 px the statement starts at ${statement}`);
        } else {
          const line = await bottomOf(page, '.setup-picture-line');
          check(line !== null && line <= 844, `at 844 px the picture line ends at ${line}`);
        }
      }, NEW_DEVICE);
      for (const [state, made, press] of FIT_STATES) {
        await open({ name: "setup, the first screen's fit", width: 390, height, look }, async (page, context, check) => {
          await visit(page, '/setup/');
          await step1Shown(page);
          if (press) await setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true }).click();
          await page.locator('.setup-frame[data-state="failed"]').waitFor({ timeout: 10_000 }).catch(() => {});
          await page.waitForTimeout(300);
          const again = await bottomOf(page, '.setup-frame .setup-key');
          const skip = await bottomOf(page, '.setup-skip');
          check(again === null || again <= height, `${state}: at ${height} px Try again ends at ${again}`);
          check(skip !== null && skip <= height, `${state}: at ${height} px Continue ends at ${skip}`);
        }, { ...NEW_DEVICE, script: setupScript(made) });
      }
    }
  }

  // No two blocks of words of setup's column overlap.
  const overlaps = (page) => page.evaluate(() => {
    const blocks = [...document.querySelectorAll('main.setup p, main.setup h1, main.setup button, main.setup a, main.setup .setup-use__name, main.setup .setup-meter__label')]
      .filter((el) => el.offsetParent !== null && el.textContent.trim())
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0);
    const found = [];
    for (let i = 0; i < blocks.length; i += 1) {
      for (let j = i + 1; j < blocks.length; j += 1) {
        const a = blocks[i];
        const b = blocks[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const x = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
        const y = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
        if (x > 1 && y > 1) found.push(`${a.el.textContent.trim().slice(0, 24)} / ${b.el.textContent.trim().slice(0, 24)}`);
      }
    }
    return found;
  });
  const keysWhole = (page) => page.evaluate(() => [...document.querySelectorAll('main.setup button, main.setup a.key')]
    .filter((el) => el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim()));
  const optionsStacked = (page) => page.evaluate(() => {
    const lefts = [...document.querySelectorAll('.setup-use__box')].map((o) => o.getBoundingClientRect().left);
    return lefts.length > 0 && Math.max(...lefts) - Math.min(...lefts) <= 0.5;
  });
  for (const look of LOOKS) {
    await open({ name: 'setup, larger text', width: 320, look }, async (page, context, check) => {
      await visit(page, '/setup/');
      await step1Shown(page);
      await largerText(page);
      check((await sidewaysScroll(page)) <= 0, 'at 200 per cent text step 1 scrolls sideways');
      const glyphs = await page.evaluate(() => {
        const shown = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
        return { row: shown(document.querySelector('.setup-back-row svg.setup-progress')), under: shown(document.querySelector('svg.setup-progress--under')) };
      });
      check(!glyphs.row && glyphs.under, `at 200 per cent text the glyph stands ${glyphs.row ? 'in the Back row' : 'nowhere in the row'}${glyphs.under ? ' and under the heading' : ', not under the heading'}`);
      const cut = await keysWhole(page);
      check(cut.length === 0, `at 200 per cent text these keys cut their words: ${cut.join(', ')}`);
      const solid = await page.evaluate(() => document.querySelector('.setup-key').getBoundingClientRect().height);
      check(solid > 52, `at 200 per cent text the solid key is ${solid} px tall`);
      const over = await overlaps(page);
      check(over.length === 0, `at 200 per cent text these words overlap: ${over.join('; ')}`);
      await turnOn(page);
      await step2Shown(page);
      check(await optionsStacked(page), 'at 200 per cent text the options do not stand one under another');
      const cut2 = await keysWhole(page);
      check(cut2.length === 0, `at 200 per cent text on step 2 these keys cut their words: ${cut2.join(', ')}`);
      check((await sidewaysScroll(page)) <= 0, 'at 200 per cent text step 2 scrolls sideways');
    }, { ...NEW_DEVICE, script: FAKE_CAMERA });
  }
  await open({ name: 'setup, larger text', width: 1920, look: 'light' }, async (page, context, check) => {
    await visit(page, '/setup/');
    await step1Shown(page);
    await turnOn(page);
    await step2Shown(page);
    await largerText(page);
    check(await optionsStacked(page), 'at 200 per cent text at 1920 px the options do not stand one under another');
    const cut = await keysWhole(page);
    check(cut.length === 0, `at 200 per cent text at 1920 px these keys cut their words: ${cut.join(', ')}`);
  }, { ...NEW_DEVICE, script: FAKE_CAMERA });

  const boxOf = (page, selector) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
  }, selector);
  for (const width of [820, 1280, 1920]) {
    for (const look of LOOKS) {
      await open({ name: 'setup, layouts', width, look }, async (page, context, check) => {
        await visit(page, '/setup/');
        await step1Shown(page);
        const column = await boxOf(page, '.setup-step');
        const frame = await boxOf(page, '.setup-frame');
        const key = await boxOf(page, '.setup-key');
        const skip = await boxOf(page, '.setup-skip');
        const h1 = await boxOf(page, 'main.setup h1');
        check(skip.top >= frame.bottom - 0.5, `at ${width} px Continue stands at ${skip.top}, not under the frame (${frame.bottom})`);
        if (width === 820) {
          check(Math.abs(frame.width - column.width) <= 1, `at 820 px the frame is ${frame.width} px wide in a column of ${column.width}`);
          check(key.width <= 400, `at 820 px the key is ${key.width} px wide`);
        } else {
          check(frame.left > h1.left + column.width / 3, `at ${width} px the frame starts at ${frame.left}, not in the right columns`);
          check(Math.abs(frame.top - h1.top) <= 2, `at ${width} px the frame's top is ${frame.top}, not the heading's ${h1.top}`);
          if (width === 1280) check(skip.width <= 320, `at 1280 px Continue is ${skip.width} px wide`);
          if (width === 1920) {
            const lead = await page.evaluate(() => getComputedStyle(document.querySelector('.setup-lead')).fontSize);
            check(lead === '20px', `at 1920 px the lead is ${lead}`);
          }
        }
        await turnOn(page);
        await step2Shown(page);
        const picture = await boxOf(page, '.setup-picture');
        const answers = await boxOf(page, '.setup-uses');
        const lastBar = await page.evaluate(() => getComputedStyle(document.querySelector('.setup-last')).position);
        check(lastBar === 'static', `at ${width} px the last key's bar is ${lastBar}`);
        const columns = await page.evaluate(() => new Set([...document.querySelectorAll('.setup-use__box')].map((o) => Math.round(o.getBoundingClientRect().left))).size);
        const lastKeyBox = await boxOf(page, '.setup-last-key');
        if (width === 820) {
          check(Math.abs(picture.width / picture.height - 16 / 9) <= 0.05 || picture.height > picture.width * 9 / 16, `at 820 px the picture is ${picture.width} by ${picture.height}`);
          check(columns === 2, `at 820 px the options stand in ${columns} columns`);
          check(lastKeyBox.width <= 400, `at 820 px the last key is ${lastKeyBox.width} px wide`);
        } else {
          check(picture.right <= answers.left, `at ${width} px the picture (to ${picture.right}) and the answers (from ${answers.left}) overlap`);
          if (width === 1280) check(columns === 1, `at 1280 px the options stand in ${columns} columns`);
          if (width === 1920) {
            check(Math.abs(picture.width - 760) <= 12 && Math.abs(picture.height - 428) <= 12, `at 1920 px the picture is ${picture.width} by ${picture.height}, not about 760 by 428`);
            check(columns === 2, `at 1920 px the options stand in ${columns} columns`);
            check(lastKeyBox.height >= 56 - 0.5, `at 1920 px the last key is ${lastKeyBox.height} px tall`);
          }
        }
      }, { ...NEW_DEVICE, script: FAKE_CAMERA });

      await open({ name: 'setup, layouts', width, look }, async (page, context, check) => {
        await visit(page, '/setup/');
        await step1Shown(page);
        await page.locator('.setup-frame[data-state="failed"]').waitFor({ timeout: 10_000 }).catch(() => {});
        const inside = await page.evaluate(() => {
          const frame = document.querySelector('.setup-frame').getBoundingClientRect();
          const within = (s) => { const el = document.querySelector(s); if (!el) return false; const b = el.getBoundingClientRect(); return b.top >= frame.top - 0.5 && b.bottom <= frame.bottom + 0.5; };
          const skip = document.querySelector('.setup-skip').getBoundingClientRect();
          return { sentence: within('.setup-frame-says'), key: within('.setup-frame .setup-key'), under: skip.top >= frame.bottom - 0.5 };
        });
        check(inside.sentence && inside.key && inside.under, `at ${width} px the blocked state is laid out ${JSON.stringify(inside)}`);
      }, { ...NEW_DEVICE, script: setupScript({ status: 'denied', set: { answer: 'NotAllowedError' } }) });
    }
  }

  // The contrast of a glyph's or an edge's colour against the colour behind
  // it: the nearest ancestor with a background that is not see-through.
  const edgeContrast = (page, selector, property) => page.locator(selector).first().evaluate((el, prop) => {
    const parse = (value) => (value.match(/[\d.]+/g) || ['0', '0', '0']).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    let ground = el.parentElement;
    while (ground && getComputedStyle(ground).backgroundColor.replace(/\s/g, '').match(/rgba\(.*,0\)$|transparent/)) ground = ground.parentElement;
    const back = lum(parse(getComputedStyle(ground || document.body).backgroundColor));
    const fore = lum(parse(getComputedStyle(el)[prop]));
    return (Math.max(back, fore) + 0.05) / (Math.min(back, fore) + 0.05);
  }, property);

  // Setup's figures against the readable look: the type, every word's
  // contrast, the edges and glyphs, and the targets, in four states.
  const HEADING_SIZES = { 390: ['30px', '46px'], 820: ['40px', '60px'], 1280: ['48px', '72px'], 1920: ['48px', '72px'] };
  const READABLE_STATES = [
    ['step1', 'step 1 at rest', FAKE_CAMERA, async () => {}],
    ['blocked', 'step 1 blocked', setupScript({ status: 'denied', set: { answer: 'NotAllowedError' } }), async (page) => {
      await page.locator('.setup-frame[data-state="failed"]').waitFor({ timeout: 10_000 });
    }],
    ['baby', 'step 2 with the camera on and A baby chosen', FAKE_CAMERA, async (page) => {
      await turnOn(page);
      await choose(page, 'A baby');
    }],
    ['waiting', 'step 2 with the camera off while Turn on the camera waits', setupScript({ set: { waitMs: 30000 } }), async (page) => {
      await continueOn(page);
      await setupMain(page).getByRole('button', { name: 'Turn on the camera', exact: true }).click();
      await page.waitForTimeout(300);
    }],
  ];
  for (const width of LAYOUT_WIDTHS) {
    for (const look of LOOKS) {
      for (const [state, named, script, reach] of READABLE_STATES) {
        await open({ name: 'setup, readable', width, look }, async (page, context, check) => {
          await visit(page, '/setup/');
          await step1Shown(page);
          await reach(page);
          await page.waitForTimeout(400);
          const where = `${named}:`;
          const count = (selector) => page.locator(selector).count();
          const styleOf = (selector) => page.locator(selector).first().evaluate((el) => {
            const style = getComputedStyle(el);
            return { face: style.fontFamily.split(',')[0].replace(/["']/g, '').trim(), weight: style.fontWeight, size: style.fontSize, line: style.lineHeight };
          });
          const typed = async (selector, face, weight, size, line) => {
            if ((await count(selector)) === 0) { check(false, `${where} ${selector} not shown`); return; }
            const seen = await styleOf(selector);
            check(new RegExp(face, 'i').test(seen.face.replace(/_/g, ' ')) && seen.weight === weight && seen.size === size && (!line || seen.line === line),
              `${where} ${selector} is ${seen.face} ${seen.weight} at ${seen.size}/${seen.line}, not ${face} ${weight} at ${size}/${line || 'any'}`);
          };
          const [h1Size, h1Line] = HEADING_SIZES[width];
          await typed('main.setup h1', 'Space Grotesk', '700', h1Size, h1Line);
          const bodies = await page.evaluate(() => [...document.querySelectorAll('main.setup p.setup-body')]
            .filter((p) => p.offsetParent !== null && p.textContent.trim())
            .map((p) => { const s = getComputedStyle(p); return { words: p.textContent.trim().slice(0, 30), face: s.fontFamily, weight: s.fontWeight, size: s.fontSize, line: s.lineHeight }; }));
          const [bodySize, bodyLine] = width === 1920 ? ['20px', '30px'] : ['18px', '28px'];
          for (const body of bodies) {
            check(/Inter/i.test(body.face) && body.weight === '400' && body.size === bodySize && body.line === bodyLine, `${where} "${body.words}" is ${body.weight} at ${body.size}/${body.line}, not 400 at ${bodySize}/${bodyLine}`);
          }
          await typed('.setup-back', 'Inter', '700', '16px', '24px');
          if (state === 'step1' || state === 'blocked') {
            await typed('.setup-skip', 'Inter', '700', '16px', '24px');
            await typed('.setup-key', 'Inter', '700', '18px');
          }
          if (state === 'baby' || state === 'waiting') {
            await typed('.setup-use__name', 'Inter', '700', '16px', '24px');
            await typed('.setup-last-key', 'Inter', '700', '18px');
          }
          if (state === 'baby') await typed('.setup-meter__label', 'Inter', '700', '16px', '24px');

          const texts = await page.evaluate(measureText, await page.$('main.setup'));
          for (const text of texts) {
            check(text.size >= 16, `${where} "${text.words}" is ${text.size} px`);
            check(/Inter|Space.Grotesk/i.test(text.face), `${where} "${text.words}" is set in ${text.face}`);
            check(text.weight === '400' || text.weight === '700', `${where} "${text.words}" is at weight ${text.weight}`);
            check(!/mono/i.test(text.face), `${where} "${text.words}" is set in a monospaced face`);
            const need = text.body || text.tag === 'h1' ? 12 : 7;
            check(text.contrast >= need, `${where} "${text.words}" reads at ${text.contrast.toFixed(2)}:1, under ${need}:1`);
          }

          const edges = [['.corner-ticks > i', 'borderTopColor'], ['.setup-back svg', 'stroke']];
          if (state === 'step1') edges.push(['.setup-skip', 'borderTopColor'], ['.setup-camera-drawing', 'color'], ['rect.setup-progress__off', 'stroke']);
          if (state === 'blocked') edges.push(['.setup-skip', 'borderTopColor'], ['svg.problem-mark', 'fill'], ['rect.setup-progress__off', 'stroke']);
          if (state === 'baby') {
            edges.push(['.setup-use__box', 'borderTopColor'], ['.setup-track', 'borderTopColor']);
            if (width === 390) edges.push(['.setup-last', 'borderTopColor']);
          }
          if (state === 'waiting') {
            edges.push(['.setup-again', 'borderTopColor'], ['.setup-camera-drawing', 'color'], ['.setup-use__box', 'borderTopColor']);
            if (width === 390) edges.push(['.setup-last', 'borderTopColor']);
          }
          for (const [selector, property] of edges) {
            if ((await count(selector)) === 0) { check(false, `${where} ${selector} not shown`); continue; }
            const ratio = await edgeContrast(page, selector, property);
            check(ratio >= 4.5, `${where} ${selector}'s ${property} reads at ${ratio.toFixed(2)}:1, under 4.5:1`);
          }

          const ring = state === 'baby' || state === 'waiting' ? '.setup-last-key' : '.setup-key';
          if ((await count(ring)) > 0) {
            await page.locator(ring).first().focus();
            await page.keyboard.press('Shift+Tab');
            await page.keyboard.press('Tab');
            const ratio = await edgeContrast(page, ring, 'outlineColor');
            check(ratio >= 4.5, `${where} the focus ring on ${ring} reads at ${ratio.toFixed(2)}:1`);
            await page.evaluate(() => document.activeElement && document.activeElement.blur());
          }

          const tall = async (selector, least, what) => {
            if ((await count(selector)) === 0) { check(false, `${where} ${selector} not shown`); return; }
            const box = await page.locator(selector).first().boundingBox();
            check(box && box.height >= least - 0.5, `${where} ${what || selector} is ${box ? box.height : 0} px tall, under ${least}`);
          };
          const solid = width === 1920 ? 56 : 52;
          const back = await page.locator('.setup-back').boundingBox();
          check(back && back.height >= 44 && back.width >= 64, `${where} Back is ${back ? `${back.width} by ${back.height}` : 'not shown'}, under 64 by 44`);
          if (width === 390) await tall('.setup-look-row', 44, 'the look row');
          if (state === 'step1' || state === 'blocked') {
            await tall('.setup-key', solid);
            await tall('.setup-skip', 44);
          }
          if (state === 'blocked') await tall('.setup-frame a.link-row', 44, 'How to allow the camera');
          if (state === 'baby' || state === 'waiting') {
            await tall('.setup-use__box', 56, 'an option');
            await tall('.setup-last-key', solid);
          }
          if (state === 'baby') await tall('#setup-use-words a.link-row', 44, "the baby's links");
          if (state === 'waiting') await tall('.setup-again', 44);
          if ((await count('svg.problem-mark')) > 0) {
            const shapes = await page.locator('svg.problem-mark').first().evaluate((svg) => svg.children.length);
            check(shapes === 1, `${where} the problem glyph holds ${shapes} shapes`);
          }
          if (state === 'waiting') {
            const words = page.locator('.setup-again');
            const picture = await words.screenshot();
            const scratch = await context.newPage();
            const read = await scratch.evaluate(readStrokes, picture.toString('base64')).catch(() => null);
            await scratch.close();
            check(read !== null && read.strokes >= 7, `${where} the waiting key's words read at ${read ? read.strokes.toFixed(2) : 'nothing'}:1 on their strokes`);
          }
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(outDir, `setup-readable-${state}-${width}-${look}.png`), fullPage: true });
        }, { ...NEW_DEVICE, script });
      }
    }
  }

  // The pictures the look is judged on, at twice the pixels.
  const LOOK_STATES = [
    ['step1', FAKE_CAMERA, async () => {}],
    ['blocked', setupScript({ status: 'denied', set: { answer: 'NotAllowedError' } }), async (page) => {
      await page.locator('.setup-frame[data-state="failed"]').waitFor({ timeout: 10_000 });
    }],
    ['alert', setupScript({ set: { sound: 'noise' } }), async (page) => {
      await turnOn(page);
      await choose(page, 'A pet');
      await page.waitForFunction(() => document.querySelector('[role="meter"][aria-label="Motion"] .setup-track__fill')?.getAttribute('data-over') === 'true', null, { timeout: 5_000 }).catch(() => {});
    }],
    ['baby', FAKE_CAMERA, async (page) => {
      await turnOn(page);
      await choose(page, 'A baby');
    }],
    ['lost-pet', FAKE_CAMERA, async (page) => {
      await turnOn(page);
      await choose(page, 'A lost pet');
      await page.locator('.setup-uses').scrollIntoViewIfNeeded();
    }],
  ];
  for (const width of [390, 820, 1280, 1440, 1920]) {
    for (const look of LOOKS) {
      for (const [state, script, reach] of LOOK_STATES) {
        await open({ name: 'setup, the look', width, look, deviceScaleFactor: 2 }, async (page) => {
          await visit(page, '/setup/');
          await step1Shown(page);
          await reach(page);
          await page.waitForTimeout(400);
          if (width !== 390) await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(outDir, `setup-look-${state}-${width}-${look}.png`), fullPage: width !== 390 });
        }, { ...NEW_DEVICE, script });
      }
    }
  }

  // The three parts on the grid at each width, from the page's top.
  const layoutOf = (page) => page.evaluate(() => {
    const box = (element) => {
      if (!element) return null;
      const b = element.getBoundingClientRect();
      return { top: b.top + window.scrollY, bottom: b.bottom + window.scrollY, left: b.left, right: b.right, width: b.width, height: b.height };
    };
    const dash = document.querySelector('main.dash');
    const style = getComputedStyle(dash);
    const outer = dash.getBoundingClientRect();
    return {
      content: { left: outer.left + parseFloat(style.paddingLeft), right: outer.right - parseFloat(style.paddingRight) },
      state: box(document.querySelector('section.dash-state')),
      ways: box(document.querySelector('section.ways')),
      since: box(document.querySelector('section.since')),
      frame: box(document.querySelector('section.dash-state .drawn-frame')),
      key: box(document.querySelector('.dash-key-place .dash-key')),
      rows: [...document.querySelectorAll('section.ways li.way')].map(box),
      entries: [...document.querySelectorAll('section.since li.since__item')].map(box),
      markAll: box([...document.querySelectorAll('section.since button')].find((button) => button.textContent.trim() === 'Mark all as seen')),
      linkRow: box(document.querySelector('section.since .since__ways-on a.link-row')),
    };
  });
  const near = (a, b, within = 1) => Math.abs(a - b) <= within;
  const px = (n) => `${Math.round(n * 10) / 10} px`;
  const keyPlace = {};
  const checkLayout = (check, width, seen, setUp) => {
    const { state, ways, since, frame, key, rows, entries, markAll, linkRow, content } = seen;
    if (!state || !ways || !since) {
      check(false, `the page has ${[['the watching state', state], ['the ways', ways], ['since you last looked', since]].filter(([, b]) => !b).map(([name]) => `no ${name}`).join(', ')}`);
      return;
    }
    const sixteenNine = (what) => {
      check(!!frame && near(frame.width, what.width), `the drawn frame is ${frame ? px(frame.width) : 'not there'} wide, not across the ${px(what.width)} column`);
      if (frame) check(near(frame.height, frame.width * 9 / 16), `the drawn frame is ${px(frame.width)} by ${px(frame.height)}, not 16:9`);
    };
    if (width === 820) {
      for (const [name, part] of [['the watching state', state], ['the ways', ways], ['since you last looked', since]]) check(near(part.width, 704), `${name} is ${px(part.width)} wide, not 704`);
      sixteenNine(state);
      check(!!key && key.width <= 400.5, `the key is ${key ? px(key.width) : 'not there'} wide, over 400`);
      const lefts = [...new Set(rows.map((row) => Math.round(row.left)))];
      const tops = [...new Set(rows.map((row) => Math.round(row.top)))];
      check(rows.length === 4 && lefts.length === 2 && tops.length === 2, `the four ways stand in ${lefts.length} columns and ${tops.length} rows, not two by two`);
      if (setUp) {
        check(entries.length >= 1 && entries.length <= 4, `the part below lists ${entries.length} entries, not 1 to 4`);
        check(!!markAll && !!linkRow && near(markAll.top, linkRow.top, 2), `Mark all as seen and the link row stand at ${markAll ? px(markAll.top) : 'nothing'} and ${linkRow ? px(linkRow.top) : 'nothing'}`);
      }
    } else if (width === 1280) {
      check(near(state.width, 690) && near(state.left, content.left), `the watching state is ${px(state.width)} wide from ${px(state.left)}, not 690 from the row's left at ${px(content.left)}`);
      check(near(ways.width, 486) && near(ways.left, state.right + 24), `the ways are ${px(ways.width)} wide from ${px(ways.left)}, not 486 from ${px(state.right + 24)}`);
      const lefts = [...new Set(rows.map((row) => Math.round(row.left)))];
      check(rows.length === 4 && lefts.length === 1 && rows.every((row, i) => i === 0 || row.top >= rows[i - 1].bottom - 0.5), 'the four ways do not stand stacked');
      for (const [i, row] of rows.entries()) check(row.height >= 80, `the ${WAY_ROWS[i]} row is ${px(row.height)} tall, under 80`);
      check(since.top >= Math.max(state.bottom, ways.bottom) - 0.5, `since you last looked starts at ${px(since.top)}, above the foot of the parts over it`);
      check(near(since.width, 1200), `since you last looked is ${px(since.width)} wide, not 1200`);
      if (setUp) {
        const tops = entries.map((entry) => entry.top);
        check(entries.length === 5 && Math.max(...tops) - Math.min(...tops) <= 1, `the part below lists ${entries.length} entries${entries.length ? ` with tops ${tops.map(px).join(', ')}` : ''}, not 5 on one row`);
        check(!!markAll && !!linkRow && near(markAll.top, linkRow.top, 2), `Mark all as seen and the link row stand at ${markAll ? px(markAll.top) : 'nothing'} and ${linkRow ? px(linkRow.top) : 'nothing'}`);
      }
    } else {
      const wanted = width === 1440 ? [528, 416, 304] : [531, 419, 306];
      const parts = [state, ways, since];
      check(Math.max(...parts.map((part) => part.top)) - Math.min(...parts.map((part) => part.top)) <= 1, `the three parts start at ${parts.map((part) => px(part.top)).join(', ')}`);
      check(parts.every((part, i) => near(part.width, wanted[i])), `the three parts are ${parts.map((part) => px(part.width)).join(', ')} wide, not ${wanted.join(', ')} px`);
      sixteenNine(state);
      if (setUp) {
        const lefts = [...new Set(entries.map((entry) => Math.round(entry.left)))];
        check(entries.length >= 1 && entries.length <= 5 && lefts.length === 1, `the part below lists ${entries.length} entries in ${lefts.length} columns, not up to 5 stacked`);
        check(!!markAll && !!linkRow && markAll.bottom <= linkRow.top + 0.5, `Mark all as seen ends at ${markAll ? px(markAll.bottom) : 'nothing'}, not above the link row at ${linkRow ? px(linkRow.top) : 'nothing'}`);
      }
    }
    const met = meeting({ 'the watching state': state, 'the ways': ways, 'since you last looked': since });
    check(met.length === 0, `${met.join(', ')} meet`);
  };
  for (const width of [820, 1280, 1440, 1920]) {
    for (const look of LOOKS) {
      await open({ name: 'dashboard, layouts', width, look }, async (page, context, check) => {
        await dashboardWith(page, sixNew());
        await countReads(page, 6);
        await page.evaluate(() => document.fonts.ready);
        const seen = await layoutOf(page);
        checkLayout(check, width, seen, true);
        if (seen.key) keyPlace[`${width}-${look}`] = seen.key;
        await page.screenshot({ path: path.join(outDir, `dashboard-layout-${width}-${look}.png`), fullPage: true });
      });
    }
  }
  for (const width of [820, 1280, 1440]) {
    for (const look of LOOKS) {
      await open({ name: 'dashboard, layouts', width, look }, async (page, context, check) => {
        await openDash(page);
        await emptyShown(page);
        await page.evaluate(() => document.fonts.ready);
        const seen = await layoutOf(page);
        checkLayout((ok, what) => check(ok, `before setup ${what}`), width, seen, false);
        const setUpKey = keyPlace[`${width}-${look}`];
        if (width === 1440 && setUpKey && seen.key) {
          check(near(seen.key.left, setUpKey.left) && near(seen.key.width, setUpKey.width) && near(seen.key.height, setUpKey.height),
            `before setup Start setup stands ${px(seen.key.left)} from the left, ${px(seen.key.width)} by ${px(seen.key.height)}, not where Start watching stands (${px(setUpKey.left)}, ${px(setUpKey.width)} by ${px(setUpKey.height)})`);
        }
        await page.screenshot({ path: path.join(outDir, `dashboard-layout-new-${width}-${look}.png`), fullPage: true });
      }, { state: 'new' });
    }
  }

  // Nothing runs past its box or the screen at any width.
  const checkWhole = async (page, check) => {
    const sideways = await sidewaysScroll(page);
    check(sideways <= 0, `the page scrolls ${sideways} px sideways${sideways > 0 ? `: ${await widest(page)}` : ''}`);
    const cut = await cutIn(page);
    check(cut.length === 0, `words run past their box: ${cut.join('; ')}`);
    const met = meeting(await partsOf(page));
    check(met.length === 0, `${met.join(', ')} meet`);
  };
  for (const width of [320, 390, 820, 1280, 1440, 1920]) {
    for (const look of LOOKS) {
      await open({ name: 'dashboard, every width', width, look }, async (page, context, check) => {
        await dashboardWith(page, fourNew());
        await countReads(page, 4);
        await page.evaluate(() => document.fonts.ready);
        await checkWhole(page, check);
        await page.screenshot({ path: path.join(outDir, `dashboard-full-${width}-${look}.png`), fullPage: true });
      });
    }
  }

  await open({ name: 'dashboard, landscape', width: 844, height: 390, look: 'light', isMobile: true, hasTouch: true }, async (page, context, check) => {
    await dashboardWith(page, fourNew());
    await countReads(page, 4);
    await page.evaluate(() => document.fonts.ready);
    await checkWhole(page, check);
  });

  // Text at 200 per cent: the heading wraps where its words do not fit one
  // line, the key grows and nothing is cut; Mark all as seen and its link
  // row stand side by side where both fit and stack whole where they do not.
  // Side by side, the row centres the two, so they share a middle, and
  // their tops differ when one is taller than the other.
  for (const [state, width, look] of [['set-up', 390, 'light'], ['set-up', 1280, 'light'], ['set-up', 820, 'light'], ['new', 390, 'dark']]) {
    await open({ name: 'dashboard, larger text', width, look }, async (page, context, check) => {
      const when = state === 'new' ? 'before setup ' : '';
      if (state === 'new') await openDash(page);
      else {
        await dashboardWith(page, fourNew());
        await countReads(page, 4);
      }
      await largerText(page);
      const seen = await page.evaluate(() => {
        const h1 = document.querySelector('main.dash h1');
        const key = document.querySelector('.dash-key-place .dash-key');
        const keyBox = key ? key.getBoundingClientRect() : null;
        // The heading's words on one line: the width they take, and the width the heading has.
        const words = document.createRange();
        if (h1) words.selectNodeContents(h1);
        return {
          h1: h1 ? h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight) : 0,
          h1Words: h1 ? words.getBoundingClientRect().width : 0,
          h1Room: h1 ? h1.getBoundingClientRect().width : 0,
          key: key ? { whole: key.scrollWidth <= key.clientWidth + 0.5, height: keyBox.height } : null,
        };
      });
      const oneLineFits = seen.h1 > 0.5 && seen.h1 <= 1.5 && seen.h1Words <= seen.h1Room + 0.5;
      check(seen.h1 > 1.5 || oneLineFits, `${when}the heading takes ${seen.h1.toFixed(2)} lines with its words ${px(seen.h1Words)} wide in ${px(seen.h1Room)}, neither more than one line nor whole on one`);
      check(!!seen.key && seen.key.whole, `${when}the key's words run past it`);
      check(!!seen.key && seen.key.height > 52, `${when}the key is ${seen.key ? px(seen.key.height) : 'not there'} tall, not over 52`);
      const cut = await cutIn(page);
      check(cut.length === 0, `${when}words run past their box: ${cut.join('; ')}`);
      if (state === 'set-up' && width >= 768) {
        const pair = await page.evaluate(() => {
          const row = document.querySelector('section.since .since__ways-on');
          const mark = row ? [...row.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Mark all as seen') : null;
          const link = row ? row.querySelector('a.link-row') : null;
          if (!row || !mark || !link) return null;
          const a = mark.getBoundingClientRect();
          const b = link.getBoundingClientRect();
          return {
            side: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) <= 2 && b.left >= a.right - 0.5,
            stacked: b.top >= a.bottom - 0.5,
            markWhole: mark.scrollWidth <= mark.clientWidth + 0.5,
            linkWhole: link.scrollWidth <= link.clientWidth + 0.5,
            rowStill: row.scrollWidth <= row.clientWidth + 0.5,
          };
        });
        if (!pair) {
          check(false, 'the part below has no Mark all as seen and link row');
        } else {
          check(pair.side || pair.stacked, `Mark all as seen and the link row stand ${pair.side ? 'side by side' : pair.stacked ? 'stacked' : 'neither side by side nor stacked'}`);
          check(pair.markWhole && pair.linkWhole, `${pair.markWhole ? 'the link row' : 'Mark all as seen'} is cut, standing ${pair.side ? 'side by side' : pair.stacked ? 'stacked' : 'apart'}`);
          check(pair.rowStill, '.since__ways-on scrolls sideways');
        }
      }
      if (state === 'set-up') {
        const counted = await page.evaluate((selectors) => {
          for (const selector of selectors) {
            const link = document.querySelector(selector);
            if (!link || link.getBoundingClientRect().height === 0) continue;
            const number = link.querySelector('.new-count .num');
            const word = [...link.querySelectorAll('*'), link].flatMap((node) => [...node.childNodes])
              .find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.includes('History'));
            if (!number || !word) return { found: true, apart: null };
            const range = document.createRange();
            range.selectNodeContents(word);
            const wordTop = range.getClientRects()[0]?.top ?? null;
            range.selectNodeContents(number);
            const numberTop = range.getClientRects()[0]?.top ?? null;
            return { found: true, apart: wordTop === null || numberTop === null ? null : Math.abs(wordTop - numberTop) };
          }
          return { found: false, apart: null };
        }, [historyLink(width), headerLink('History')]);
        if (counted.found) check(counted.apart !== null && counted.apart <= 2, `History's count stands ${counted.apart === null ? 'apart from' : `${counted.apart.toFixed(1)} px from`} History's line`);
        else check(width >= 768, 'History is not shown');
      }
      const sideways = await sidewaysScroll(page);
      check(sideways <= 0, `${when}the page scrolls ${sideways} px sideways`);
    }, { state });
  }

  // Tab from the header's last stop runs through the dashboard in order.
  for (const [state, look] of [['new', 'light'], ['set-up', 'dark']]) {
    await open({ name: 'dashboard, focus', width: 1280, look }, async (page, context, check) => {
      const when = state === 'new' ? 'before setup ' : '';
      if (state === 'new') await openDash(page);
      else {
        await dashboardWith(page, fourNew());
        await countReads(page, 4);
      }
      await page.locator('header.app-header').getByRole('button', { name: `Switch to the ${OTHER[look]} look`, exact: true }).focus();
      const rows = WAY_ROWS.map((way) => (name) => name.startsWith(`${way}:`));
      const wanted = state === 'new'
        ? [(name) => name === 'Start setup', ...rows]
        : [(name) => name === 'Start watching', ...rows,
          ...['Looks like a bird at ', '1 person in view at ', "Colours like Mittens's at ", 'Movement at '].map((what) => (name) => name.startsWith(what)),
          (name) => name === 'Mark all as seen', (name) => name === 'Open history'];
      const order = [];
      for (let i = 0; i < wanted.length; i += 1) {
        await page.keyboard.press('Tab');
        order.push(await page.evaluate(stop));
      }
      const names = order.map((item) => (item ? item.name : 'nothing'));
      check(names.every((name, i) => wanted[i](name)), `${when}Tab from the header's last stop reaches ${names.map((name) => `"${name}"`).join(' > ')}`);
      for (const item of order.filter(Boolean)) check(item.ring === `solid 2px ${ACCENT[look]}`, `${when}"${item.name}" is ringed ${item.ring}, not solid 2px ${ACCENT[look]}`);
      if (state === 'set-up') {
        await page.keyboard.press('Shift+Tab');
        const on = await page.evaluate(stop);
        check(!!on && on.name === 'Mark all as seen', `Shift+Tab from Open history reaches "${on ? on.name : 'nothing'}"`);
        await page.keyboard.press('Enter');
        await emptyShown(page);
        const focused = await page.locator('h2#since-label:focus').waitFor({ timeout: 5000 })
          .then(() => true, () => false);
        check(focused, 'Enter on Mark all as seen did not focus the Since you last looked heading');
      }
    }, { state });
  }

  // A device cleared of its data installs its copy again, and offline the
  // dashboard shows a new device.
  await open({ name: 'cleared device offline', width: 390, look: 'light' }, async (page, context, check) => {
    await visit(page, '/settings/');
    if (!(await installed(page))) throw new Error('the installed copy is not whole after a visit to /settings/');
    await clearOnDataPage(page, { confirm: true });
    let whole = false;
    const until = Date.now() + 30_000;
    while (!whole && Date.now() < until) {
      whole = await installed(page).catch(() => false);
      if (!whole) await page.waitForTimeout(1_000);
    }
    check(whole, 'thirty seconds after the clear the installed copy is not whole');
    await context.setOffline(true);
    await page.goto(address('/dashboard/'), { waitUntil: 'load', timeout: 60_000 });
    await stateShown(page);
    await dashRead(page);
    const heading = await wordsAt(page, 'main.dash h1');
    check(heading === 'Not watching', `offline after the clear the heading reads "${heading}"`);
    const line = await lineOf(page);
    check(line === BEFORE_SETUP, `offline after the clear the line reads "${line}", not "${BEFORE_SETUP}"`);
  });

  // ---------------------------------------------------------------------------
  // Old addresses
  // ---------------------------------------------------------------------------
  // Four old addresses forward to the page that does their job now. With
  // script the page replaces itself, adding no entry to the history, so Back
  // returns to the page before it. Without script it says in one line where
  // the page went and links it. Each asks search engines not to index it, and
  // robots.txt and the sitemap name none of them. Nap Mode, the gallery and
  // the export keep their own pages, and Help holds no key to the tip walk.

  const FORWARDS = [
    { from: '/tutorial/', to: '/help/', line: 'Getting started is in Help.', link: 'Open help' },
    { from: '/analytics/', to: '/history/', line: 'Past alerts are in History.', link: 'Open history' },
    { from: '/profiles/', to: '/settings/detection/', line: 'Watch settings are in Detection.', link: 'Open Detection' },
    { from: '/donate/', to: '/about/', line: 'Read about SafeOS.', link: 'Open About SafeOS' },
  ];
  // The address a page shows, with its query.
  const whereIs = (page) => {
    const url = new URL(page.url());
    return `${url.pathname}${url.search}`;
  };
  const arrivesAt = (page, to, timeout) => page.waitForURL((url) => url.pathname === to && url.search === '', { timeout })
    .then(() => true, () => false);

  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await open({ name: 'forwards, each', width, look }, async (page, context, check) => {
        for (const { from, to } of FORWARDS) {
          await visit(page, '/settings/');
          await page.goto(address(from), { waitUntil: 'load', timeout: 60_000 });
          const reached = await arrivesAt(page, to, 5_000);
          check(reached, `${from} is kept at ${whereIs(page)} 5 seconds after it loads, not ${to}`);
          if (!reached) continue;
          await page.goBack({ waitUntil: 'commit', timeout: 15_000 }).catch(() => {});
          const back = await arrivesAt(page, '/settings/', 10_000);
          check(back, `Back from ${to}, where ${from} went, gives ${whereIs(page)}, not /settings/`);
        }
      });
    }
  }

  // Text at 200 per cent on a page with script off. The style goes in through
  // the walk's own call: a style tag added the usual way waits for the page
  // to hear the tag load, and a page with script off hears nothing, so that
  // wait never ends.
  const largerTextWithoutScript = async (page) => {
    await page.evaluate((css) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }, LARGER_TEXT);
    await page.waitForTimeout(300);
  };

  // Without script: the address stays, the line and the link are drawn at
  // full strength and whole with text at 200 per cent, the held link sits
  // 1 px lower (in place under reduced motion), and the press opens the
  // target.
  const scriptsOff = async (page, check, rows, reduced) => {
    for (const { from, to, line, link } of rows) {
      await visit(page, from);
      check(whereIs(page) === from, `${from} without script moves to ${whereIs(page)}`);
      const headings = await page.evaluate(() => [...document.querySelectorAll('h1')]
        .map((h1) => (h1.textContent || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim()));
      check(headings.length === 1 && headings[0] === line,
        `${from} without script is headed ${headings.map((words) => `"${words}"`).join(', ') || 'by nothing'}, not "${line}" alone`);
      const named = page.getByRole('link', { name: link, exact: true });
      const count = await named.count();
      check(count === 1, `${from} without script holds ${count} links named "${link}", not 1`);
      if (count !== 1) continue;
      for (const [what, selector] of [['the line', 'main.forward h1'], ['the link', 'main.forward a']]) {
        const opacity = await opacityOf(page, selector);
        check(opacity === 1, `on ${from} ${what} is ${opacity === -1 ? 'not in main.forward' : `drawn at opacity ${opacity}, not 1`}`);
      }
      await largerTextWithoutScript(page);
      const sideways = await sidewaysScroll(page);
      if (sideways > 0) check(false, `${from} with text at 200 per cent scrolls ${sideways} px sideways: ${await widest(page)}`);
      const cut = await page.evaluate(() => [['the line', 'main.forward h1'], ['the link', 'main.forward a']]
        .filter(([, selector]) => {
          const element = document.querySelector(selector);
          return !element || element.scrollWidth > element.clientWidth;
        })
        .map(([what]) => what));
      check(cut.length === 0, `on ${from} with text at 200 per cent ${cut.join(' and ')} is cut`);
      await named.hover({ timeout: 5_000 });
      await page.mouse.down();
      await page.waitForTimeout(300);
      const transform = await named.evaluate((a) => getComputedStyle(a).transform);
      const want = reduced ? 'none' : 'matrix(1, 0, 0, 1, 0, 1)';
      check(transform === want, `on ${from} the link held down is drawn with ${transform}, not ${want}${reduced ? ' under reduced motion' : ''}`);
      await page.mouse.up();
      const opened = await arrivesAt(page, to, 15_000);
      check(opened, `the press on "${link}" on ${from} opened ${whereIs(page)}, not ${to}`);
    }
  };
  for (const look of LOOKS) {
    await open({ name: 'forwards, scripts off', width: 390, look, javaScriptEnabled: false }, async (page, context, check) => {
      await scriptsOff(page, check, FORWARDS, false);
    });
  }
  await open({ name: 'forwards, scripts off', width: 390, look: 'light', javaScriptEnabled: false, reducedMotion: 'reduce' }, async (page, context, check) => {
    await scriptsOff(page, check, FORWARDS.filter(({ from }) => from === '/tutorial/' || from === '/donate/'), true);
  });

  // The forward's layout without script: a centred block 640 px wide at
  // 820 px, the line in the 12 columns' left 7 beside the link in the right 5
  // at 1280 px, the line at 20 on 30 px in the left 5 beside the link in the
  // middle 4 at 1440 px; words in the ink and the underline in the accent.
  for (const width of [820, 1280, 1440]) {
    for (const look of LOOKS) {
      await open({ name: 'forwards, layouts', width, look, javaScriptEnabled: false }, async (page, context, check) => {
        await visit(page, '/tutorial/');
        const seen = await page.evaluate(() => {
          const block = document.querySelector('main.forward');
          const line = block?.querySelector('.forward__line');
          const link = block?.querySelector('.forward__link');
          if (!block || !line || !link) return null;
          // The box of the first line of an element's words. The line and the
          // link share one face and one size, so the foot of each box stands
          // one descent below its baseline, and two feet level are two
          // baselines level.
          const firstLine = (element) => {
            const texts = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            for (let text = texts.nextNode(); text; text = texts.nextNode()) {
              if (!text.textContent.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(text);
              const box = [...range.getClientRects()].find((rect) => rect.width > 0);
              if (box) return box;
            }
            return null;
          };
          const box = block.getBoundingClientRect();
          const lineBox = line.getBoundingClientRect();
          const linkBox = link.getBoundingClientRect();
          const lineStyle = getComputedStyle(line);
          const linkStyle = getComputedStyle(link);
          return {
            width: box.width,
            centre: box.left + box.width / 2,
            screen: document.documentElement.clientWidth,
            rowLeft: box.left + parseFloat(getComputedStyle(block).paddingLeft),
            lineLeft: lineBox.left,
            lineBottom: lineBox.bottom,
            linkLeft: linkBox.left,
            linkTop: linkBox.top,
            lineFoot: firstLine(line)?.bottom ?? null,
            linkFoot: firstLine(link)?.bottom ?? null,
            size: `${lineStyle.fontSize}/${lineStyle.lineHeight}`,
            lineColour: lineStyle.color,
            linkColour: linkStyle.color,
            underline: linkStyle.textDecorationColor,
          };
        });
        if (!seen) throw new Error('/tutorial/ without script holds no main.forward with its line and its link');
        if (width === 820) {
          check(Math.abs(seen.width - 640) <= 0.5, `the block is ${seen.width} px wide, not 640`);
          check(Math.abs(seen.centre - seen.screen / 2) <= 2, `the block's centre is at ${seen.centre} px on a ${seen.screen} px screen`);
          check(seen.lineBottom <= seen.linkTop + 0.5, `the line ends at ${seen.lineBottom} px, below the link's top at ${seen.linkTop} px`);
        }
        if (width === 1280) {
          check(Math.abs(seen.lineLeft - seen.rowLeft) <= 0.5, `the line starts at ${seen.lineLeft} px, not at the row's left, ${seen.rowLeft} px`);
          check(Math.abs(seen.linkLeft - seen.lineLeft - 714) <= 1, `the link starts ${seen.linkLeft - seen.lineLeft} px from the line, not 714 (the eighth column)`);
        }
        if (width === 1440) {
          check(Math.abs(seen.linkLeft - seen.lineLeft - 560) <= 1, `the link starts ${seen.linkLeft - seen.lineLeft} px from the line, not 560 (the sixth column)`);
          check(seen.size === '20px/30px', `the line is set at ${seen.size}, not 20px/30px`);
        }
        if (width >= 1280) {
          check(seen.lineFoot !== null && seen.linkFoot !== null && Math.abs(seen.lineFoot - seen.linkFoot) <= 2,
            `the first lines of the line and the link are not level: their feet are at ${seen.lineFoot} and ${seen.linkFoot} px`);
        }
        check(seen.lineColour === INK[look], `the line is ${seen.lineColour}, not ${INK[look]}`);
        check(seen.linkColour === INK[look], `the link's words are ${seen.linkColour}, not ${INK[look]}`);
        check(seen.underline === ACCENT[look], `the link's underline is ${seen.underline}, not ${ACCENT[look]}`);
        await page.screenshot({ path: path.join(outDir, `forward-tutorial-${width}-${look}.png`), fullPage: true });
      });
    }
  }

  // Offline, the installed copy holds the forward and its target.
  for (const look of LOOKS) {
    await open({ name: 'forwards, offline', width: 390, look }, async (page, context, check) => {
      await visitThenOffline(page, context);
      await page.goto(address('/tutorial/'), { waitUntil: 'load', timeout: 30_000 });
      const reached = await arrivesAt(page, '/help/', 15_000);
      check(reached, `/tutorial/ opened offline is kept at ${whereIs(page)}, not /help/`);
      if (!reached) return;
      const headed = await page.waitForFunction(() => (document.querySelector('h1')?.textContent || '').trim() === 'Help & FAQ', null, { timeout: 15_000 })
        .then(() => true, () => false);
      const h1 = await page.evaluate(() => (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim());
      check(headed, `/help/ reached offline from /tutorial/ is headed "${h1}", not "Help & FAQ"`);
    });
  }

  // Each forward's own head, read without script so the page that is read is
  // the forward itself: with script it replaces itself, and the head becomes
  // its target's.
  await open({ name: 'forwards, heads', width: 1280, look: 'light', javaScriptEnabled: false }, async (page, context, check) => {
    for (const { from } of FORWARDS) {
      await visit(page, from);
      const robots = await page.evaluate(() => [...document.querySelectorAll('meta[name="robots"]')].map((tag) => tag.getAttribute('content') || '').join('; '));
      check(/\bnoindex\b/.test(robots), `${from} carries ${robots ? `the robots tag "${robots}"` : 'no robots tag'}, not one that holds noindex`);
    }
    const read = async (file) => {
      const response = await context.request.get(address(file), { timeout: 30_000 });
      if (!response.ok()) throw new Error(`${file} answers ${response.status()}`);
      return response.text();
    };
    // A Disallow line keeps a crawler from every address that starts with it.
    const kept = (await read('/robots.txt')).split('\n').map((line) => line.match(/^\s*Disallow:\s*(\S+)/i)?.[1]).filter(Boolean);
    for (const { from } of FORWARDS) {
      const rule = kept.find((start) => from.startsWith(start));
      check(!rule, `robots.txt keeps a crawler from ${from} with "Disallow: ${rule}", so its noindex tag is never read`);
    }
    const listed = [...(await read('/sitemap.xml')).matchAll(/<loc>([^<]+)<\/loc>/g)].map((entry) => new URL(entry[1].trim()).pathname);
    for (const { from } of FORWARDS) {
      const found = listed.filter((pathname) => pathname.startsWith(from));
      check(found.length === 0, `the sitemap lists ${found.join(', ')}`);
    }
  });

  // What keeps its own page: the gallery and the export, which History will
  // take in, and Nap Mode.
  await open({ name: 'forwards, what stays', width: 1280, look: 'light' }, async (page, context, check) => {
    for (const route of ['/lost-found/gallery/', '/export/', '/nap/']) {
      await visit(page, route);
      await page.waitForTimeout(3_000);
      const seen = await page.evaluate(() => ({ at: `${location.pathname}${location.search}`, forward: document.querySelector('main.forward') !== null }));
      check(seen.at === route, `${route} moves to ${seen.at} within 3 seconds of its load`);
      check(!seen.forward, `${route} holds a forward`);
    }
  });

  // Help holds no key to the tip walk in any section.
  const HELP_SECTIONS = ['Getting Started', 'FAQ', 'Keyboard Shortcuts', 'Troubleshooting', 'Contact Support'];
  for (const width of [390, 1280]) {
    await open({ name: 'help, no tip walk', width, look: 'light' }, async (page, context, check) => {
      await visit(page, '/help/');
      for (const section of HELP_SECTIONS) {
        await page.locator('#main-content').getByRole('button', { name: section, exact: true }).click({ timeout: 5_000 });
        await page.waitForTimeout(300);
        const seen = await page.evaluate(() => ({
          words: [...document.querySelectorAll('body *')]
            .filter((element) => !element.closest('script, style, template, noscript'))
            .some((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.includes('Start Interactive Tutorial'))),
          links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((href) => /^\/tutorial\/?(?:[?#]|$)/.test(href)),
        }));
        check(!seen.words, `with ${section} open, the page reads "Start Interactive Tutorial"`);
        check(seen.links.length === 0, `with ${section} open, the page links ${seen.links.join(', ')}`);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  // The list of settings pages and the pages built on its rows. Every value
  // saves the moment it moves and says Saved; no settings page asks through a
  // browser confirm box, so a dialog of any kind fails the walk.

  const openSettings = (options, run, more) => open(options, async (page, context, check) => {
    page.on('dialog', (dialog) => {
      check(false, `a browser ${dialog.type()} box opened: "${dialog.message()}"`);
      dialog.dismiss().catch(() => {});
    });
    await run(page, context, check);
  }, more);
  const SAVED = /^\s*Saved\s*$/;

  // Alert volume on Alert sounds: the keys move it, Saved shows for two
  // seconds, a reload keeps it, and its key plays the Alert tone.
  for (const [width, look] of [[390, 'dark'], [1280, 'light']]) {
    await openSettings({ name: 'alert volume, saved and played', width, look }, async (page, context, check) => {
      // Counts the tones the page starts, so Play is seen to play.
      await context.addInitScript(() => {
        window.settingsTones = 0;
        const start = OscillatorNode.prototype.start;
        OscillatorNode.prototype.start = function (...args) {
          window.settingsTones += 1;
          return start.apply(this, args);
        };
      });
      await visit(page, '/settings/sounds/');
      const slider = page.getByRole('slider', { name: 'Alert volume' });
      await slider.waitFor({ timeout: 15_000 });
      await slider.focus();
      await page.keyboard.press('End');
      for (let step = 0; step < 9; step += 1) await page.keyboard.press('ArrowLeft');
      const moved = await slider.inputValue();
      check(moved === '91', `End then nine ArrowLeft leave the slider at ${moved}, not 91`);
      check((await slider.getAttribute('aria-valuetext')) === '91 of 100', `the slider's words read "${await slider.getAttribute('aria-valuetext')}"`);
      const saved = page.locator('.set-saved').filter({ hasText: SAVED });
      check(await saved.isVisible(), '"Saved" does not show at the row after a change');
      await page.waitForTimeout(3_000);
      check(!(await saved.isVisible()), '"Saved" still shows 3 seconds after the change');
      await page.reload({ waitUntil: 'networkidle' });
      await slider.waitFor({ timeout: 15_000 });
      const kept = await slider.inputValue();
      check(kept === '91', `after a reload the slider reads ${kept}, not 91`);
      const play = page.getByRole('button', { name: 'Play Alert volume' });
      const before = await page.evaluate(() => window.settingsTones);
      await play.click();
      const started = await page.waitForFunction((count) => window.settingsTones > count, before, { timeout: 5_000 }).then(() => true, () => false);
      check(started, 'Play started no tone in 5 seconds');
      await play.waitFor({ timeout: 5_000 }).catch(() => check(false, 'the key still reads Stop 5 seconds after the tone began'));
      check(await page.getByText('Unanswered alerts get louder from here.').isVisible(), 'the line "Unanswered alerts get louder from here." is not shown');
    });
  }

  // Alert volume as drawn, in both looks at a phone's and a desktop's width:
  // the row stands on the page's own ground with no box, fill or shadow; a
  // 24 px knob in the ink inside a 44 px target; the filled part of the track
  // in the accent; the empty part in the track colour with an edge in the
  // line colour. Read from the slider's own pixels.
  const SLIDER_TRACK = { light: 'rgb(222, 226, 230)', dark: 'rgb(27, 40, 53)' };
  const rgbOf = (colour) => colour.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map((c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrastOf = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const nearRgb = (a, b, tolerance = 24) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
  const readPixels = async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const drawn = canvas.getContext('2d');
    drawn.drawImage(image, 0, 0);
    return { width: image.width, height: image.height, data: Array.from(drawn.getImageData(0, 0, image.width, image.height).data) };
  };
  const pixelAt = (picture, x, y) => {
    const at = (y * picture.width + x) * 4;
    return picture.data.slice(at, at + 3);
  };
  const columnOf = (picture, x) => Array.from({ length: picture.height }, (_, y) => pixelAt(picture, x, y));
  const rgbText = (rgb) => `rgb(${rgb.join(', ')})`;
  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await openSettings({ name: 'alert volume, drawn', width, look }, async (page, context, check) => {
        await visit(page, '/settings/sounds/');
        const slider = page.locator('#alert-volume');
        await slider.waitFor({ timeout: 15_000 });
        const boxes = await slider.evaluate((input) => {
          const out = [];
          const own = getComputedStyle(input);
          if (own.backgroundColor !== 'rgba(0, 0, 0, 0)' || own.backgroundImage !== 'none') out.push(`the slider itself is filled ${own.backgroundColor}`);
          for (let node = input.parentElement; node && node.tagName !== 'MAIN' && node !== document.body; node = node.parentElement) {
            const style = getComputedStyle(node);
            const name = `${node.tagName.toLowerCase()}${[...node.classList].map((c) => `.${c}`).join('')}`;
            if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none') out.push(`${name} is filled ${style.backgroundColor}`);
            if (style.boxShadow !== 'none') out.push(`${name} casts a shadow`);
            if (['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== 'none')) out.push(`${name} has a border`);
          }
          return out;
        });
        check(boxes.length === 0, `the Alert volume row stands in a box: ${boxes.join('; ')}`);
        const target = await slider.boundingBox();
        check(!!target && target.height >= 43.5, `the slider's target is ${target ? Math.round(target.height) : '?'} px tall, under 44`);
        const scratch = await context.newPage();
        const shot = async () => {
          await slider.evaluate((input) => input.blur());
          await page.mouse.move(0, 0);
          const picture = await slider.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
          return scratch.evaluate(readPixels, picture.toString('base64'));
        };
        const ink = rgbOf(INK[look]);
        const accent = rgbOf(ACCENT[look]);
        const track = rgbOf(SLIDER_TRACK[look]);
        const edge = rgbOf(LINE[look]);
        await slider.focus();
        await page.keyboard.press('End');
        const full = await shot();
        // The knob: every pixel of the ink, at the track's right end.
        let left = Infinity; let right = -1; let top = Infinity; let bottom = -1;
        for (let y = 0; y < full.height; y += 1) {
          for (let x = 0; x < full.width; x += 1) {
            if (!nearRgb(pixelAt(full, x, y), ink)) continue;
            left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
          }
        }
        const middle = Math.floor(full.height / 2);
        const knobAt = right >= 0 ? pixelAt(full, Math.floor((left + right) / 2), Math.floor((top + bottom) / 2)) : pixelAt(full, full.width - 12, middle);
        const ground = pixelAt(full, full.width - 12, 0);
        check(right >= 0, `at 100 the knob is ${rgbText(knobAt)}, not the ink ${INK[look]}`);
        if (right >= 0) {
          const across = right - left + 1;
          const tall = bottom - top + 1;
          check(across >= 22 && across <= 26 && tall >= 22 && tall <= 26, `the knob is ${across} by ${tall} px, not 24 by 24`);
          check(right >= full.width - 3, `at 100 the knob ends ${full.width - 1 - right} px short of the slider's right end`);
        }
        check(contrastOf(knobAt, ground) >= 4.5, `the knob ${rgbText(knobAt)} on the ground ${rgbText(ground)} is ${contrastOf(knobAt, ground).toFixed(2)}:1, under 4.5:1`);
        const fullFill = columnOf(full, Math.floor(full.width / 2)).filter((rgb) => nearRgb(rgb, accent)).length;
        check(fullFill >= 3, `at 100 the middle of the track holds ${fullFill} px of the accent ${ACCENT[look]}: ${[...new Set(columnOf(full, Math.floor(full.width / 2)).map(rgbText))].join(', ')}`);
        await slider.focus();
        await page.keyboard.press('Home');
        for (let step = 0; step < 5; step += 1) await page.keyboard.press('PageUp');
        check(await slider.inputValue() === '50', `Home then five Page Up leave the slider at ${await slider.inputValue()}, not 50`);
        const half = await shot();
        const filled = columnOf(half, Math.floor(half.width * 0.2)).filter((rgb) => nearRgb(rgb, accent)).length;
        check(filled >= 3, `at 50 the filled part holds ${filled} px of the accent ${ACCENT[look]}`);
        const empty = columnOf(half, Math.floor(half.width * 0.8));
        const emptyTrack = empty.filter((rgb) => nearRgb(rgb, track, 12)).length;
        const emptyEdge = empty.filter((rgb) => nearRgb(rgb, edge, 16)).length;
        check(emptyTrack >= 1 && emptyEdge >= 1,
          `at 50 the empty part holds ${emptyTrack} px of the track ${SLIDER_TRACK[look]} and ${emptyEdge} px of the edge ${LINE[look]}: ${[...new Set(empty.map(rgbText))].join(', ')}`);
        check(contrastOf(edge, track) >= 4.5, `the empty track's edge is ${contrastOf(edge, track).toFixed(2)}:1 on the track`);
        await scratch.close();
        await page.screenshot({ path: path.join(outDir, `settings-sounds-volume-${width}-${look}.png`) });
      });
    }
  }

  // The list of settings pages: every row in its group with its value, read
  // once the page has mounted (no row is left on its loading bar).
  const LIST_NAMES = ['Detection', 'Alert sounds', 'Quiet hours', 'Unanswered alerts', 'Notifications', 'Test alerts',
    'Detection zones', 'Detection model', 'Look and text', 'Data on this device'];
  const listRows = async (page) => {
    await page.waitForFunction(() => document.querySelector('nav[aria-label="Settings pages"]')
      && !document.querySelector('nav[aria-label="Settings pages"] .set-row__loading'), null, { timeout: 15_000 });
    return page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Settings pages"] a')].map((a) => {
      const text = (id) => (id ? (document.getElementById(id)?.textContent || '').replace(/\s+/g, ' ').trim() : '');
      const box = a.getBoundingClientRect();
      return { name: text(a.getAttribute('aria-labelledby')), value: text(a.getAttribute('aria-describedby')),
        href: a.getAttribute('href'), height: Math.round(box.height), current: a.getAttribute('aria-current') };
    }));
  };
  const AXE = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8').catch(() => null);
  // axe's violations inside the settings pages' own parts.
  const axeOn = async (page) => {
    if (!AXE) return ['axe-core could not be read from node_modules'];
    if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE });
    return page.evaluate(async () => {
      const include = ['.settings', '.settings-phone-rows'].filter((selector) => document.querySelector(selector)).map((selector) => [selector]);
      const result = await window.axe.run({ include }, { resultTypes: ['violations'] });
      return result.violations.map((v) => `${v.id} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join('; ')})`);
    });
  };
  const DEFAULT_VALUES = ['Standard, motion 80, sound 80', 'Volume 100', 'Off', 'Wait 30 s, louder after 30 s'];

  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await openSettings({ name: 'settings list, values', width, look }, async (page, context, check) => {
        await visit(page, '/settings/');
        const rows = await listRows(page);
        const names = rows.map((row) => row.name);
        check(names.join('|') === LIST_NAMES.join('|'), `the list's rows read ${names.join(', ')}`);
        DEFAULT_VALUES.forEach((value, i) => check(rows[i]?.value === value, `${LIST_NAMES[i]} reads "${rows[i]?.value}", not "${value}"`));
        check(rows[6]?.value === 'Whole picture', `Detection zones reads "${rows[6]?.value}"`);
        check(rows[9]?.value === 'Alerts, pictures, pets, sounds and settings', `Data on this device reads "${rows[9]?.value}"`);
        const heads = await page.locator('.set-group__heading').allInnerTexts();
        check(heads.map(plain).join('|') === 'Alerts|Camera picture|This device', `the group headings read ${heads.join(', ')}`);
        const tall = width < 768 ? 96 : 80;
        const short = rows.filter((row) => row.height < tall);
        check(short.length === 0, `rows under ${tall} px: ${short.map((row) => `${row.name} ${row.height} px`).join(', ')}`);
        check(await page.getByRole('button', { name: 'Save Changes' }).count() === 0, 'a Save Changes key is shown');
        check(await page.getByText('Your own server').count() === 0, '"Your own server" shows with no server address saved');
        check(await page.getByText('Kept on this device. A change saves the moment you make it.').isVisible(), 'the line under the heading is not shown');
        if (width >= 1024) {
          const column = await page.locator('.settings-page').evaluate((node) => {
            const box = node.getBoundingClientRect();
            return { width: Math.round(box.width), left: Math.round(box.left), right: Math.round(document.documentElement.clientWidth - box.right) };
          });
          check(column.width <= 640 && Math.abs(column.left - column.right) <= 2, `the list's column is ${column.width} px wide, ${column.left} px from the left and ${column.right} px from the right`);
        }
        const sideways = await sidewaysScroll(page);
        check(sideways <= 0, `the page scrolls ${sideways} px sideways (${await widest(page)})`);
        const violations = await axeOn(page);
        check(violations.length === 0, `axe finds ${violations.join(', ')}`);
        await page.screenshot({ path: path.join(outDir, `settings-list-${width}-${look}.png`), fullPage: true });
      });
    }
  }

  // The first screen at 390 by 844 in the dark look: these 10 controls; the
  // wordmark's two styles, the list's four (the heading, a row's name, a
  // value, which the line under the heading and the phone bar's places share,
  // and a group's heading) and the frame's look and Help rows, which keep
  // their own Inter 700 at 16 px; the two frame rows' edges, the one rule
  // above a group, the phone bar and its place mark, the rows' small pictures
  // counted as pictures; and five colours.
  const LIST_FIRST_CONTROLS = [(name) => name === githubName, /^Switch to the light look$/, /^Help$/, /^Detection/, /^Alert sounds/, /^Quiet hours/, /^Unanswered alerts/, /^Notifications/,
    (name) => name === 'Dashboard', (name) => name === 'History', (name) => name === 'Settings'];
  const styleOf = (face, weight, size, colour) => (style) => {
    const [family, ...rest] = style.split(' ');
    return family.replace(/["']/g, '').includes(face) && rest.join(' ') === `${weight} ${size} ${colour}`;
  };
  const LIST_FIRST_STYLES = [
    styleOf('Space_Grotesk', '700', '16px', INK.dark), styleOf('Space_Grotesk', '400', '16px', QUIET.dark),
    styleOf('Space_Grotesk', '600', '24px', INK.dark), styleOf('Inter', '400', '18px', INK.dark),
    styleOf('Inter', '400', '16px', QUIET.dark), styleOf('Inter', '600', '16px', QUIET.dark),
    styleOf('Inter', '700', '16px', INK.dark),
  ];
  const LIST_FIRST_BOXES = [/^button\.settings-row$/, /^a\.settings-row$/, /^section\.set-group\..*set-group--headed/,
    /^nav\.phone-bar\..*look-part/, /^a\.phone-bar__place.*::before$/];
  const LIST_FIRST_COLOURS = [PAGE.dark, INK.dark, QUIET.dark, LINE.dark, ACCENT.dark];
  await openSettings({ name: 'settings list, first screen counted', width: 390, height: 844, look: 'dark' }, async (page, context, check) => {
    await visit(page, '/settings/');
    await listRows(page);
    await page.evaluate(() => document.fonts.ready);
    const seen = await firstScreen(page);
    const left = [...seen.controls];
    const matched = LIST_FIRST_CONTROLS.every((want) => {
      const at = left.findIndex((item) => (typeof want === 'function' ? want(item) : want.test(item)));
      if (at === -1) return false;
      left.splice(at, 1);
      return true;
    });
    check(matched && left.length === 0,
      `the first screen holds ${seen.controls.length} controls, expected ${LIST_FIRST_CONTROLS.length}: ${seen.controls.map((name) => `"${name}"`).join(', ')}`);
    check(seen.styles.length === 7 && matchesAll(seen.styles, LIST_FIRST_STYLES),
      `the first screen holds ${seen.styles.length} text styles, not the 7 named: ${seen.styles.join(' | ')}`);
    check(seen.boxes.length === 5 && matchesAll(seen.boxes, LIST_FIRST_BOXES),
      `the first screen draws ${seen.boxes.length} rules and boxes, not the 5 named: ${seen.boxes.join(', ')}`);
    check(seen.colours.length === 5 && LIST_FIRST_COLOURS.every((colour) => seen.colours.includes(colour)),
      `the first screen holds ${seen.colours.length} colours, not the 5 named: ${seen.colours.join(', ')}`);
    // Each row of the first screen is whole above the phone bar: its name
    // and its value line, so every row there says how it is set.
    const whole = await page.evaluate(() => {
      const bar = document.querySelector('nav.phone-bar');
      const foot = bar ? bar.getBoundingClientRect().top : window.innerHeight;
      const ends = [...document.querySelectorAll('nav[aria-label="Settings pages"] a')].map((a) => {
        const part = (id) => (id ? document.getElementById(id) : null);
        const name = part(a.getAttribute('aria-labelledby'));
        const value = part(a.getAttribute('aria-describedby'));
        return { name: (name?.textContent || '').trim(), value: (value?.textContent || '').trim(),
          end: Math.max(name ? name.getBoundingClientRect().bottom : Infinity, value ? value.getBoundingClientRect().bottom : Infinity) };
      });
      return { foot, ends };
    });
    for (const name of ['Detection', 'Alert sounds', 'Quiet hours', 'Unanswered alerts', 'Notifications']) {
      const row = whole.ends.find((item) => item.name === name);
      check(!!row && row.end <= whole.foot, row
        ? `${name} and its value "${row.value}" end at ${Math.round(row.end)} px, under the phone bar at ${Math.round(whole.foot)} px`
        : `the first screen has no ${name} row`);
    }
  });

  // Lost and Found chosen in setup with a saved pet: the Detection row names
  // the pet and shows its photo.
  const chooseLostFound = (page) => page.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem('safeos-onboarding') || '{"state":{},"version":0}');
    kept.state = { ...kept.state, lostFoundChosen: true };
    localStorage.setItem('safeos-onboarding', JSON.stringify(kept));
  });
  const LONG_PET = 'Mrwhiskersthethird';
  // A pet's photo a person can see in the pictures (the shared picture is one clear pixel).
  const PET_PHOTO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#8a5a2b"/><circle cx="32" cy="38" r="18" fill="#e9c891"/><circle cx="20" cy="18" r="8" fill="#e9c891"/><circle cx="44" cy="18" r="8" fill="#e9c891"/></svg>')}`;
  for (const [name, width, look, pet] of [['settings list, Lost and Found', 390, 'light', 'Mittens'], ['settings list, a long pet name at 320 px', 320, 'dark', LONG_PET]]) {
    await openSettings({ name, width, look }, async (page, context, check) => {
      await visit(page, '/settings/');
      await listRows(page);
      await seedAlerts(page, { pets: [{ id: 'pet-1', name: pet, at: 1000, photo: PET_PHOTO }] });
      await chooseLostFound(page);
      await page.reload({ waitUntil: 'networkidle' });
      const rows = await listRows(page);
      const want = `Lost and Found for ${pet}, motion 80, sound 80`;
      check(rows[0]?.value === want, `Detection reads "${rows[0]?.value}", not "${want}"`);
      const photo = await page.locator('nav[aria-label="Settings pages"] a').first().locator('img.set-pic-pet').evaluate((img) => {
        const box = img.getBoundingClientRect();
        return { width: Math.round(box.width), height: Math.round(box.height), loaded: img.complete && img.naturalWidth > 0 };
      }).catch(() => null);
      check(photo && photo.width === 32 && photo.height === 32 && photo.loaded, `the pet's photo on the Detection row is ${photo ? `${photo.width} by ${photo.height} px${photo.loaded ? '' : ', not loaded'}` : 'not shown'}`);
      const sideways = await sidewaysScroll(page);
      check(sideways <= 0, `the page scrolls ${sideways} px sideways (${await widest(page)})`);
      const spill = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Settings pages"] a')]
        .filter((a) => a.scrollWidth > a.clientWidth + 0.5).map((a) => a.textContent.trim().slice(0, 30)));
      check(spill.length === 0, `rows wider than the column: ${spill.join(', ')}`);
      await page.screenshot({ path: path.join(outDir, `settings-list-lost-found-${width}-${look}.png`) });
    });
  }

  // Quiet hours from 10:00 PM to 7:00 AM, read at 23:00 and at 12:00 by the page's clock.
  await openSettings({ name: 'settings list, quiet now', width: 390, look: 'dark', timezoneId: 'UTC' }, async (page, context, check) => {
    await page.clock.setFixedTime(new Date(Date.UTC(2026, 10, 22, 23, 0, 0)));
    await visit(page, '/settings/');
    await page.evaluate(() => {
      localStorage.setItem('safeos-settings', JSON.stringify({ state: { quietHoursSettings: {
        enabled: true, startTime: '22:00', endTime: '07:00', days: [0, 1, 2, 3, 4, 5, 6], mode: 'reduced', reducedVolume: 30,
      } }, version: 0 }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    const late = await listRows(page);
    const at = (hhmm) => page.evaluate((t) => {
      const [h, m] = t.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
    }, hhmm);
    const quietNow = `Quiet now, until ${await at('07:00')}`;
    check(late[2]?.value === quietNow, `at 23:00 Quiet hours reads "${late[2]?.value}", not "${quietNow}"`);
    check(await page.locator('.set-pic-band__quiet').count() === 2, 'the band across the day does not shade two parts for hours across midnight');
    await page.clock.setFixedTime(new Date(Date.UTC(2026, 10, 22, 12, 0, 0)));
    await page.reload({ waitUntil: 'networkidle' });
    const noon = await listRows(page);
    const set = `${await at('22:00')} to ${await at('07:00')}, every day`;
    check(noon[2]?.value === set, `at 12:00 Quiet hours reads "${noon[2]?.value}", not "${set}"`);
    await page.screenshot({ path: path.join(outDir, 'settings-list-quiet-390-dark.png') });
  });

  // A server address saved: the group Your own server with its four rows.
  await openSettings({ name: 'settings list, a server', width: 1280, look: 'light' }, async (page, context, check) => {
    await visit(page, '/settings/');
    await page.evaluate(() => localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://watch.example.org', wsUrl: 'wss://watch.example.org/ws' })));
    await page.reload({ waitUntil: 'networkidle' });
    const rows = await listRows(page);
    const names = rows.slice(10).map((row) => row.name);
    check(names.join('|') === 'Server address|Your name on your server|Webhooks|Admin', `the server's rows read ${names.join(', ') || 'nothing'}`);
    check(rows[10]?.value === 'https://watch.example.org', `Server address reads "${rows[10]?.value}"`);
    await page.screenshot({ path: path.join(outDir, 'settings-list-server-1280-light.png'), fullPage: true });
    await page.evaluate(() => localStorage.removeItem('safeos_backend_config'));
    await page.reload({ waitUntil: 'networkidle' });
    const after = await listRows(page);
    check(after.length === 10, `with the address taken away the list holds ${after.length} rows`);
  });

  // Your own server's page with a server address saved, at a phone's and a
  // desktop's width in both looks: the address with its value, the name
  // field with its own Save, and the list's Webhooks and Admin rows.
  for (const width of [390, 1280]) {
    for (const look of LOOKS) {
      await openSettings({ name: 'your own server page', width, look }, async (page, context, check) => {
        await visit(page, '/settings/');
        await page.evaluate(() => localStorage.setItem('safeos_backend_config', JSON.stringify({ apiUrl: 'https://watch.example.org', wsUrl: 'wss://watch.example.org/ws' })));
        await visit(page, '/settings/server/');
        const address = page.getByRole('button', { name: 'Server address' });
        check(await address.waitFor({ timeout: 15_000 }).then(() => true, () => false), 'the page has no Server address row');
        check(((await page.locator('#server-address-value').textContent().catch(() => '')) || '').trim() === 'https://watch.example.org',
          'the Server address row does not read https://watch.example.org');
        check(await page.getByLabel('Your name on your server', { exact: true }).isVisible(), 'the page has no field named "Your name on your server"');
        check(await page.locator('#name').getByRole('button', { name: 'Save', exact: true }).isVisible(), 'the name field has no Save of its own');
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: path.join(outDir, `settings-server-${width}-${look}.png`), fullPage: true });
        const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(sideways <= 0, `the page scrolls ${sideways} px sideways (${await widest(page)})`);
        await visit(page, '/settings/');
        const rows = await listRows(page);
        const server = rows.slice(10);
        check(server.map((row) => row.name).join('|') === 'Server address|Your name on your server|Webhooks|Admin',
          `the list's server rows read ${server.map((row) => row.name).join(', ') || 'nothing'}`);
        check(server[2]?.href === '/webhooks/' && server[3]?.href === '/admin/', `Webhooks opens ${server[2]?.href} and Admin ${server[3]?.href}`);
      });
    }
  }

  // A browser that refuses storage: the line at the top, and every row opens its page.
  await openSettings({ name: 'settings list, storage refused', width: 390, look: 'light' }, async (page, context, check) => {
    await context.addInitScript(() => {
      Storage.prototype.setItem = function () { throw new DOMException('refused', 'SecurityError'); };
    });
    await visit(page, '/settings/');
    const line = page.getByText('This browser is not keeping settings. Changes last until you close this tab.');
    check(await line.waitFor({ timeout: 10_000 }).then(() => true, () => false), 'the line that says the browser is not keeping settings is not shown');
    const rows = await listRows(page);
    check(rows.length === 10, `the list holds ${rows.length} rows`);
    await page.screenshot({ path: path.join(outDir, 'settings-list-storage-refused-390-light.png') });
    await page.locator('nav[aria-label="Settings pages"] a').nth(9).click();
    await page.waitForURL(/\/settings\/data\/?$/, { timeout: 15_000 }).catch(() => check(false, `the Data on this device row opened ${page.url()}`));
  });

  // Tab from the top: the look row, the Help row, then each row in order,
  // each ringed and clear of the app's header and the phone bar; nothing scrolls sideways at 320
  // px, and at 200 per cent text every row is whole.
  for (const width of [320, 390]) {
    for (const look of LOOKS) {
      await openSettings({ name: 'settings list, focus', width, look }, async (page, context, check) => {
        await visit(page, '/settings/');
        await listRows(page);
        const order = [];
        for (let i = 0; i < 40 && order.length < 12; i += 1) {
          await page.keyboard.press('Tab');
          // The page scrolls smoothly to the focused row: read it once it stands still.
          await scrollSettled(page);
          const at = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || !el.closest('.settings, .settings-phone-rows')) return null;
            const box = el.getBoundingClientRect();
            const bar = document.querySelector('nav.phone-bar');
            const barTop = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : window.innerHeight;
            // A header fixed or stuck to the top of the screen covers what scrolls under it.
            const header = document.querySelector('header.app-header');
            const held = header && ['fixed', 'sticky'].includes(getComputedStyle(header).position);
            const headerFoot = held ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
            const style = getComputedStyle(el);
            const name = el.getAttribute('aria-labelledby') ? document.getElementById(el.getAttribute('aria-labelledby'))?.textContent : el.textContent;
            return { name: (name || '').replace(/\s+/g, ' ').trim(), ringed: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2,
              clear: box.bottom <= barTop + 0.5 && box.top >= headerFoot - 0.5,
              box: `${Math.round(box.top)} to ${Math.round(box.bottom)} px, the header to ${Math.round(headerFoot)} px, the bar from ${Math.round(barTop)} px` };
          });
          if (at && !order.some((seen) => seen.name === at.name)) order.push(at);
        }
        const names = order.map((at) => at.name);
        const want = [/^Switch to the (light|dark) look$/, /^Help$/, ...LIST_NAMES.map((name) => new RegExp(`^${name}$`))];
        check(want.every((re, i) => re.test(names[i] || '')), `Tab reaches ${names.join(', ')}`);
        const bare = order.filter((at) => !at.ringed);
        check(bare.length === 0, `focused with no ring: ${bare.map((at) => at.name).join(', ')}`);
        const hidden = order.filter((at) => !at.clear);
        check(hidden.length === 0, `focused under the header, under the phone bar or off screen: ${hidden.map((at) => `${at.name} (${at.box})`).join(', ')}`);
        if (width === 320) {
          const sideways = await sidewaysScroll(page);
          check(sideways <= 0, `the page scrolls ${sideways} px sideways (${await widest(page)})`);
        }
        await largerText(page);
        const cut = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Settings pages"] a, nav[aria-label="Settings pages"] a *')]
          .filter((el) => el.scrollWidth > el.clientWidth + 0.5 && el.clientWidth > 0 && getComputedStyle(el).overflow !== 'visible')
          .map((el) => (el.textContent || '').trim().slice(0, 30)));
        check(cut.length === 0, `at 200 per cent text rows are cut: ${cut.join(', ')}`);
        const sidewaysLarge = await sidewaysScroll(page);
        check(sidewaysLarge <= 0, `at 200 per cent text the page scrolls ${sidewaysLarge} px sideways (${await widest(page)})`);
      });
    }
  }

  // Reloaded offline from the installed copy, the list opens with every value.
  await openSettings({ name: 'settings list, offline', width: 390, look: 'dark' }, async (page, context, check) => {
    await visit(page, '/settings/');
    if (!(await installed(page))) throw new Error('the installed copy is not whole after a visit to /settings/');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load', timeout: 60_000 });
    const rows = await listRows(page);
    check(rows.length === 10 && rows.every((row) => row.value), `offline the list reads ${rows.map((row) => `${row.name}: ${row.value || 'no value'}`).join(', ')}`);
  });

  // Every control the settings pages hold: found by its role and name,
  // changed, read back from its store, and Saved where it says so. Each
  // control the hub held that has left is absent.
  const INVENTORY = JSON.parse(await readFile(new URL('./settings-inventory.json', import.meta.url), 'utf8'));
  await openSettings({ name: 'settings, every control', width: 1280, look: 'light' }, async (page, context, check) => {
    for (const row of INVENTORY.controls) {
      // The pull request's own build serves every page the file names.
      const served = await page.goto(address(row.page), { waitUntil: 'networkidle', timeout: 60_000 }).then((r) => r && r.ok()).catch(() => false);
      check(served, `${row.page} did not open, so "${row.name}" was not checked`);
      if (!served) continue;
      const control = page.getByRole(row.role, { name: row.name, exact: true });
      const found = await control.waitFor({ timeout: 15_000 }).then(() => true, () => false);
      check(found, `${row.page} holds no ${row.role} named "${row.name}"`);
      if (!found) continue;
      await control.focus();
      await page.keyboard.press(row.change);
      const value = await page.evaluate(({ store, path }) => {
        const kept = JSON.parse(localStorage.getItem(store) || 'null');
        return path.split('.').reduce((at, key) => (at == null ? at : at[key]), kept);
      }, row);
      check(JSON.stringify(value) === JSON.stringify(row.after), `${row.name} on ${row.page}: ${row.store} holds ${JSON.stringify(value)} after ${row.change}, not ${JSON.stringify(row.after)}`);
      if (row.saved) check(await page.locator('.set-saved').filter({ hasText: SAVED }).count() > 0, `${row.name} on ${row.page} does not say Saved`);
    }
    for (const gone of INVENTORY.absent) {
      await visit(page, gone.page);
      await page.waitForTimeout(500);
      const count = await page.getByRole(gone.role, { name: gone.name, exact: true }).count();
      check(count === 0, `${gone.page} still holds a ${gone.role} named "${gone.name}"`);
    }
  });

  for (const problem of problems) console.error(`failed app check: ${problem}`);
  return problems.length;
}
