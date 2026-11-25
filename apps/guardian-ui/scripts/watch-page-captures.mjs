// Take the same inputs through the base and the head builds. The fixture graph
// supplies boxes and scores. The watch still handles motion, sightings and
// notifications itself.
import path from 'node:path';

const modelDirectory = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/';
const enlargedText = 'html { font-size: 200% !important; } * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }';

async function supplyModel(context, classes) {
  const scores = classes.flatMap((id) => Array.from({ length: 90 }, (_, i) => i + 1 === id ? 0.82 : 0));
  const boxes = classes.flatMap((_, i) => [0.2, 0.15 + i * 0.45, 0.8, 0.35 + i * 0.45]);
  const weights = [
    { name: 'fixture_scores', shape: [1, classes.length, 90], dtype: 'float32' },
    { name: 'fixture_boxes', shape: [1, classes.length, 1, 4], dtype: 'float32' },
  ];
  const manifest = {
    format: 'graph-model',
    modelTopology: {
      versions: { producer: 1, minConsumer: 0 },
      node: [
        { name: 'image_tensor', op: 'Placeholder', attr: { dtype: { type: 'DT_INT32' } } },
        ...weights.map(({ name }) => ({ name, op: 'Const', attr: { dtype: { type: 'DT_FLOAT' } } })),
        ...weights.map(({ name }, i) => ({
          name: i === 0 ? 'scores' : 'boxes', op: 'Identity',
          input: [name, '^image_tensor'], attr: { T: { type: 'DT_FLOAT' } },
        })),
      ],
    },
    weightsManifest: [{ paths: ['watch-fixture.bin'], weights }],
  };
  const bytes = Buffer.alloc((scores.length + boxes.length) * 4);
  [...scores, ...boxes].forEach((value, i) => bytes.writeFloatLE(value, i * 4));
  const headers = { 'access-control-allow-origin': '*' };
  await context.route(modelDirectory + 'model.json', (route) => route.fulfill({ json: manifest, headers }));
  await context.route(modelDirectory + 'watch-fixture.bin', (route) => route.fulfill({ body: bytes, headers }));
}

function standInCamera(way) {
  localStorage.setItem('safeos-detection-model-consent', '1');
  if (way === 'security') {
    localStorage.setItem('safeos-security', JSON.stringify({ version: 0, state: { settings: {
      allowedPersons: 1, armingCountdown: 1, alertMode: 'extreme', detectionInterval: 500,
      confidenceThreshold: 0.5, motionThreshold: 0, triggerCooldown: 5000, maxStoredFrames: 100,
      alerts: { flashEnabled: false, sirenEnabled: false, notificationEnabled: true, tts: { enabled: false } },
      customMessages: [],
    } } }));
  } else {
    localStorage.setItem('safeos-animal-alerts', JSON.stringify({ version: 0, state: { settings: {
      alertMode: 'silent', flashScreen: false, browserNotifications: true, confidenceThreshold: 0.5,
      largeAnimalAlertEnabled: true, cautionAlertEnabled: true, motionThreshold: 0.01,
      captureFrames: false, maxStoredFrames: 100,
    } } }));
  }
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const draw = canvas.getContext('2d');
    let next = false;
    const frame = () => {
      next = !next;
      draw.fillStyle = next ? '#142431' : '#526578';
      draw.fillRect(0, 0, 320, 240);
    };
    frame();
    setInterval(frame, 170);
    return canvas.captureStream(12);
  } });
  window.watchNotice = null;
  window.Notification = class {
    static permission = 'granted';
    constructor(title, { body, tag }) {
      if (tag === 'intrusion-alert' || tag === 'wildlife-alert') window.watchNotice ??= { title, body };
    }
  };
}

// The contrast of each element's words against the grounds behind them, the
// translucent ones laid over one another down to the page's.
function readContrast(elements) {
  const parse = (value) => {
    const [r, g, b, a = 1] = value.match(/[\d.]+/g).map(Number);
    return { rgb: [r, g, b], a };
  };
  const over = (top, under) => top.rgb.map((channel, i) => channel * top.a + under[i] * (1 - top.a));
  const luminance = (rgb) => rgb
    .map((value) => value / 255)
    .map((s, i) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i])
    .reduce((a, b) => a + b, 0);
  return elements.map((element) => {
    const grounds = [];
    for (let node = element; node; node = node.parentElement) {
      const ground = parse(getComputedStyle(node).backgroundColor);
      grounds.unshift(ground);
      if (ground.a === 1) break;
    }
    const page = document.documentElement.classList.contains('light') ? [255, 255, 255] : [15, 23, 42];
    const ground = grounds.reduce((under, top) => over(top, under), page);
    const [a, b] = [over(parse(getComputedStyle(element).color), ground), ground].map(luminance);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

async function captureNotice(page, notice, file) {
  await page.evaluate(({ title, body }) => {
    const card = document.createElement('section');
    card.setAttribute('data-captured-notification', '');
    card.style.cssText = 'position:fixed;z-index:1000;inset:24px 24px auto auto;width:360px;padding:20px;border:1px solid #758290;border-radius:12px;background:#f8f9fa;color:#0f1215;font:16px/1.5 system-ui;box-shadow:0 4px 16px #0004';
    const heading = document.createElement('strong');
    heading.textContent = title;
    const line = document.createElement('p');
    line.textContent = body;
    card.append(heading, line);
    document.body.append(card);
  }, notice);
  await page.locator('[data-captured-notification]').screenshot({ path: file });
}

export async function captureWatchPages(browser, baseUrl, outDir, routes, openContext) {
  const after = process.env.PICTURE_VERSION === 'after';
  let failures = 0;
  const capture = async (route, look, width, run) => {
    if (!routes.includes(route)) return;
    const context = await openContext(browser, {
      viewport: { width, height: width === 320 ? 844 : 900 }, colorScheme: look,
      isMobile: width === 320, hasTouch: width === 320, serviceWorkers: 'block', reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      await run(context, page, new URL(route, baseUrl).href);
    } catch (error) {
      failures++;
      console.error(`failed watch capture for ${route}, ${width} px, ${look}: ${error.message}`);
    } finally {
      await context.close();
    }
  };

  for (const look of ['light', 'dark']) {
    for (const [route, name, classes, start] of [
      ['/security/', 'people', [1, 1], 'ARM SYSTEM'],
      ['/wildlife/', 'wildlife', [24], 'Start Monitoring'],
    ]) {
      await capture(route, look, 1280, async (context, page, address) => {
        await supplyModel(context, classes);
        await context.addInitScript(standInCamera, route.split('/')[1]);
        await page.goto(address);
        await page.getByRole('button', { name: start, exact: true }).click({ timeout: 30_000 });
        const notice = await page.waitForFunction(() => window.watchNotice, null, { timeout: 20_000 });
        const suffix = `1280-${look}.png`;
        const sighting = name === 'people'
          ? page.getByRole('button', { name: 'DISARM', exact: true }).locator('xpath=../..')
          : page.getByText('Caution', { exact: true }).first().locator('xpath=..');
        await sighting.screenshot({ path: path.join(outDir, `${name}-sighting-${suffix}`) });
        if (after && name === 'people') {
          const ratios = await page.getByText('More than this watch allows.', { exact: true }).evaluateAll(readContrast);
          if (ratios.length !== 2 || ratios.some((ratio) => ratio < 4.5)) {
            throw new Error(`the words of the People alert stand at ${ratios.map((ratio) => ratio.toFixed(2)).join(' and ')}:1 in the ${look} look`);
          }
        }
        if (name === 'wildlife') {
          const badge = page.getByText('Caution', { exact: true }).first();
          const size = await badge.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
          if (after && size < 16) throw new Error(`Caution badge text is ${size} px`);
          await badge.screenshot({ path: path.join(outDir, `wildlife-caution-${suffix}`) });
        }
        // System notifications sit outside the page in Chromium. Capture the
        // exact title and body the watch handed the browser in a small preview.
        await captureNotice(page, await notice.jsonValue(), path.join(outDir, `${name}-notification-${suffix}`));
      });
    }
  }

  for (const [route, name, selector] of [
    ['/wildlife/', 'wildlife-keys', '.way-head__keys'],
    ['/dashboard/', 'phone-keys', 'nav.phone-bar'],
    ['/404.html', 'not-found-keys', 'main .key-row'],
  ]) {
    await capture(route, 'light', 320, async (_context, page, address) => {
      await page.goto(address, { waitUntil: 'networkidle' });
      await page.addStyleTag({ content: enlargedText });
      await page.evaluate(async () => {
        await document.fonts.ready;
        window.dispatchEvent(new Event('resize'));
      });
      const row = page.locator(selector);
      if (after) await row.getByRole('button', { name: 'Scroll right', exact: true }).waitFor({ timeout: 5_000 });
      await row.screenshot({ path: path.join(outDir, `${name}-320-light.png`) });
    });
  }
  return failures;
}
