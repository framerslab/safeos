import { SETUP_DONE } from './home-checks.mjs';
import { starsHanded } from './public-chrome-checks.mjs';

const REPOSITORY = 'https://github.com/framerslab/safeos';
const LARGER_TEXT = 'html { font-size: 200% !important; } * { letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }';

async function enlarge(page) {
  await page.addStyleTag({ content: LARGER_TEXT });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(250);
}

export async function checkHeaders(browser, baseUrl) {
  const stars = starsHanded();
  const iconName = stars ? `SafeOS on GitHub, ${stars.exact}` : 'SafeOS on GitHub';
  let failures = 0;
  const check = (ok, message) => {
    if (!ok) {
      failures += 1;
      console.error(`Header and row checks: ${message}`);
    }
  };

  for (const look of ['light', 'dark']) {
    const context = await browser.newContext({ colorScheme: look, reducedMotion: 'reduce' });
    await context.addInitScript(SETUP_DONE);
    const page = await context.newPage();
    page.setDefaultTimeout(4_000);
    const walk = async (route, width, name, run) => {
      try {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(new URL(route, baseUrl).href, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await page.locator('html[data-app-started="true"]').waitFor({ state: 'attached' });
        // The header measures its row again once the page's face has come.
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        await page.waitForTimeout(150);
        await run();
      } catch (error) {
        check(false, `${name}, ${width} px, ${look}: ${error.message.split('\n')[0]}`);
      }
    };

    try {
      for (const [route, selector] of [['/', '.site-header__bar'], ['/dashboard/', '.app-header__bar']]) {
        for (const width of [320, 360, 390, 430, 480, 768, 1440]) {
          await walk(route, width, 'GitHub in the header', async () => {
            const header = page.locator(selector);
            const name = route === '/' && width >= 1024 ? stars?.name ?? iconName : iconName;
            for (const size of [100, 200]) {
              if (size === 200) await enlarge(page);
              const at = `${route}, ${width} px, ${size}% text, ${look}`;
              const link = header.getByRole('link', { name, exact: true });
              // At large text the public header can fold its count into the icon.
              const shown = await link.isVisible() ? link : header.getByRole('link', { name: iconName, exact: true });
              const present = await shown.isVisible();
              check(present, `${at}: missing the header link named "${name}"`);
              if (present) {
                const box = await shown.boundingBox();
                check(await shown.getAttribute('href') === REPOSITORY, `${at}: GitHub points outside the repository`);
                check(box.width >= 43.5 && box.height >= 43.5, `${at}: GitHub target is smaller than 44 px`);
                check(box.x >= -0.5 && box.x + box.width <= width + 0.5, `${at}: GitHub runs outside the header`);
                if (width < 1024 || route !== '/') {
                  const mark = await shown.locator('svg').first().isVisible();
                  check(mark, `${at}: GitHub has no visible mark`);
                  if (mark) {
                    const ratio = await shown.evaluate((anchor) => {
                      const glyph = anchor.querySelector('svg path');
                      let ground = anchor;
                      while (ground && getComputedStyle(ground).backgroundColor === 'rgba(0, 0, 0, 0)') ground = ground.parentElement;
                      const luminance = (rgb) => rgb.match(/[\d.]+/g).slice(0, 3).map(Number)
                        .map((value) => value / 255)
                        .map((s, i) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i])
                        .reduce((a, b) => a + b, 0);
                      const fill = glyph && getComputedStyle(glyph).fill;
                      if (!ground || !fill || fill === 'none') return 0;
                      const tones = [fill, getComputedStyle(ground).backgroundColor].map(luminance);
                      return (Math.max(...tones) + 0.05) / (Math.min(...tones) + 0.05);
                    });
                    check(ratio >= 4.5, `${at}: GitHub mark contrast is ${ratio.toFixed(2)}:1`);
                  }
                }
              }
              const row = await header.evaluate((bar) => {
                const controls = [...bar.querySelectorAll('a, button, .site-header__brand, .app-header__brand')]
                  .filter((control) => control.getClientRects().length)
                  .map((control) => control.getBoundingClientRect());
                return {
                  one: Math.max(...controls.map((box) => box.top)) < Math.min(...controls.map((box) => box.bottom)),
                  right: Math.max(...controls.map((box) => box.right)),
                };
              });
              check(row.one, `${at}: the header wraps`);
              check(row.right <= width + 0.5, `${at}: a control ends at ${Math.round(row.right)} px`);
            }
          });
        }
      }

      for (const [route, selector] of [
        ['/wildlife/', '.way-head__keys'],
        ['/dashboard/', '.phone-bar'],
        ['/404.html', 'main .key-row'],
      ]) {
        await walk(route, 320, 'Sideways arrows', async () => {
          await enlarge(page);
          const row = page.locator(selector);
          const right = row.getByRole('button', { name: 'Scroll right', exact: true });
          const left = row.getByRole('button', { name: 'Scroll left', exact: true });
          const arrows = await left.isVisible() && await right.isVisible();
          check(arrows, `${route}, ${look}: missing the pair of scroll buttons`);
          if (!arrows) return;
          const scroller = row.locator('.key-row__keys');
          check(await left.isDisabled() && await right.isEnabled(), `${route}, ${look}: wrong scroll buttons at the start`);
          const before = await scroller.evaluate((el) => el.scrollLeft);
          await right.click();
          check(await scroller.evaluate((el) => el.scrollLeft) > before, `${route}, ${look}: Scroll right did not move the row`);
          if (await left.isEnabled()) {
            await left.click();
            check(await scroller.evaluate((el) => el.scrollLeft) < before + 2, `${route}, ${look}: Scroll left did not return the row`);
          }
        });
      }

      // The arrows come and go with the words' own width, so a row at any text
      // size settles on one answer.
      for (const [width, size] of [[320, 125], [360, 150], [390, 150], [480, 200]]) {
        await walk('/dashboard/', width, `Phone navigation at ${size}% text`, async () => {
          await page.addStyleTag({ content: `html { font-size: ${size}% !important; }` });
          await page.evaluate(() => window.dispatchEvent(new Event('resize')));
          await page.waitForTimeout(400);
          const changes = await page.locator('.phone-bar .key-row').evaluate(async (row) => {
            let seen = 0;
            const observer = new MutationObserver((records) => { seen += records.length; });
            observer.observe(row, { attributes: true, attributeFilter: ['data-more'], childList: true });
            await new Promise((resolve) => setTimeout(resolve, 1_000));
            observer.disconnect();
            return seen;
          });
          check(changes === 0, `Phone navigation, ${width} px, ${size}% text, ${look}: the arrows came and went ${changes} times in a second`);
        });
      }

      await walk('/dashboard/', 390, 'One App navigation', async () => {
        const count = await page.getByRole('navigation', { name: 'App', exact: true }).filter({ visible: true }).count();
        check(count === 1, `390 px, ${look}: the page shows ${count} navigations named "App"`);
      });

      for (const width of [320, 1024, 1280]) {
        await walk('/wildlife/', width, 'Wildlife sighting', async () => {
          await page.evaluate(() => localStorage.setItem('safeos-animal-alerts', JSON.stringify({ version: 0, state: {
            detectionHistory: [{
              id: 'bear-1', type: 'bear', displayName: 'Bear', confidence: 0.82, sizeCategory: 'large', dangerLevel: 'extreme',
              bbox: [0, 0, 40, 40], timestamp: Date.now(), acknowledged: false,
            }],
          } })));
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.getByText('EXTREME DANGER', { exact: true }).waitFor();
          const lines = await page.evaluate(() => {
            const read = (words) => {
              const node = [...document.querySelectorAll('main div')].find((one) => one.childElementCount === 0 && one.textContent.trim() === words);
              if (!node) return null;
              const range = document.createRange();
              range.selectNodeContents(node);
              return new Set([...range.getClientRects()].map((box) => Math.round(box.top))).size;
            };
            return { name: read('Bear'), badge: read('EXTREME DANGER') };
          });
          check(lines.name === 1, `Wildlife, ${width} px, ${look}: "Bear" is broken over ${lines.name} lines`);
          check(lines.badge !== null && lines.badge <= 2, `Wildlife, ${width} px, ${look}: "EXTREME DANGER" is broken over ${lines.badge} lines`);
          await page.evaluate(() => localStorage.removeItem('safeos-animal-alerts'));
        });
      }

      await walk('/history/', 1920, 'Focus when Help folds', async () => {
        await enlarge(page);
        const help = page.locator('.app-header__links').getByRole('link', { name: 'Help', exact: true });
        await help.focus();
        await page.setViewportSize({ width: 820, height: 844 });
        const more = page.locator('.app-header__more');
        await more.waitFor();
        check(await more.evaluate((key) => key === document.activeElement), `Help, ${look}: focus did not move to More after narrowing`);
        // Wide again, More leaves the row with focus on it: Help has it back.
        await page.setViewportSize({ width: 1920, height: 844 });
        await more.waitFor({ state: 'detached' });
        check(await help.evaluate((link) => link === document.activeElement), `Help, ${look}: focus did not return to Help after widening`);
      });

      await walk('/', 390, 'Tab out of Menu', async () => {
        await page.getByRole('button', { name: 'Menu', exact: true }).click();
        const panel = page.locator('#site-menu');
        await panel.getByRole('link').last().focus();
        await page.keyboard.press('Tab');
        check(await panel.evaluate((menu) => menu.hidden || menu.contains(document.activeElement)), `Menu, ${look}: focus left the open panel`);
      });

      await walk('/', 390, 'A press between the rows of Menu', async () => {
        await page.getByRole('button', { name: 'Menu', exact: true }).click();
        const panel = page.locator('#site-menu');
        await panel.waitFor();
        const box = await panel.boundingBox();
        const start = await panel.locator('.site-menu__start').boundingBox();
        await page.mouse.click(box.x + box.width / 2, start.y + start.height + 4);
        await page.waitForTimeout(200);
        check(await panel.isVisible(), `Menu, ${look}: a press on the panel's own ground closed it`);
      });
    } finally {
      await context.close();
    }
  }
  return failures;
}
