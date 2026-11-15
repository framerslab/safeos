/** @jest-environment node */
/**
 * The home page as it is served
 *
 * Renders the home page to the HTML a browser gets before any script runs
 * and reads it part by part: what the page says before script, the headline
 * and the lead, the start key, the statement and the closing block, the
 * capture, the five uses, how it works, what sets off an alert, free and open
 * source and the questions. Counts and sizes on the page are held to the code
 * they describe.
 */

import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '@/app/page';
import clip from '../public/home/sample-clip.json';
import { SETUP_CAMERA_STEP, SETUP_STEPS, SETUP_STEP_COUNT } from '@/lib/setup-steps';
import { COCO_ANIMAL_CLASSES } from '@/lib/animal-kinds';
import * as detector from '@/lib/animal-detection';
import { MODEL_BYTES, MODEL_MANIFEST_BYTES, MODEL_SIZE_MB, MODEL_URL, MODEL_WEIGHTS_BYTES } from '@/lib/detection-model-facts';
import { STILLNESS_ALERT_MAX_MINUTES, STILLNESS_ALERT_MIN_MINUTES } from '@/lib/stillness-bounds';
import { captureSizes, type CaptureCropName } from '@/lib/home-captures';
import { CAPTURE_PRELOAD_SCRIPT } from '@/lib/capture-preload';
import { bare, served, words } from './helpers/served-html';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const APP_ROOT = path.resolve(__dirname, '..');
const source = (...parts: string[]) => fs.readFileSync(path.join(APP_ROOT, ...parts), 'utf8');

const html = renderToStaticMarkup(<HomePage />);
const page = served(html);
const all = (selector: string) => Array.from(page.querySelectorAll(selector));
const one = (selector: string) => page.querySelector(selector);
const pageWords = words(page.body);
const count = (needle: string) => pageWords.split(needle).length - 1;

describe('the page reads before any script runs and asks for nothing', () => {
  it('has one main landmark and one H1, with every part\'s heading in the served HTML', () => {
    expect(all('main')).toHaveLength(1);
    expect(all('h1')).toHaveLength(1);
    expect(all('main h2').map(words)).toEqual([
      'What people set it up for',
      'One device does the watching and the alerting',
      'Four things set off an alert',
      'Free on safeos.sh, with the code in the open',
      'Questions people ask first',
      'Start with the device you have',
    ]);
  });

  it('shows the line for a page whose script did not start, under the statement, until the app marks itself started', () => {
    const line = one('#home-needs-script');
    expect(words(line)).toBe('Setup needs JavaScript. The rest of this page reads without it.');
    expect(line?.hasAttribute('hidden')).toBe(false);
    expect(line?.previousElementSibling).toBe(one('.home-statement'));
    // One mechanism hides it: an inline script that waits for the app's own mark.
    const script = line?.nextElementSibling;
    expect(script?.tagName).toBe('SCRIPT');
    expect(script?.textContent).toContain("getAttribute('data-app-started')==='true'");
    expect(script?.textContent).toContain('line.hidden=true');
    // The shell sets that mark once its script has started.
    expect(source('src', 'components', 'layout', 'SiteShell.tsx')).toContain("setAttribute('data-app-started', 'true')");
  });

  describe('the line\'s own script, run in a page', () => {
    // Runs the script served beside the line in a page of its own. The page's
    // timers are held so a test can say when the wait for the app has ended.
    function runLineScript() {
      const script = one('#home-needs-script')?.nextElementSibling?.textContent || '';
      const timers: (() => void)[] = [];
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { JSDOM } = require('jsdom') as {
        JSDOM: new (html: string, options: { runScripts: string; beforeParse: (window: { setTimeout: unknown }) => void }) => { window: { document: Document } };
      };
      const dom = new JSDOM(
        `<!doctype html><html><body><p id="home-needs-script">Setup needs JavaScript.</p><script>${script}</script></body></html>`,
        {
          runScripts: 'dangerously',
          beforeParse(window) {
            window.setTimeout = (callback: () => void) => {
              timers.push(callback);
              return timers.length;
            };
          },
        }
      );
      const document = dom.window.document;
      return { document, line: document.getElementById('home-needs-script') as HTMLElement, endWait: () => timers.splice(0).forEach((callback) => callback()) };
    }

    it('hides the line at once, since a script that runs proves scripts are on', () => {
      const { line } = runLineScript();
      expect(line.hidden).toBe(true);
    });

    it('shows it again when the app has not marked itself started by the end of the wait', () => {
      const { line, endWait } = runLineScript();
      endWait();
      expect(line.hidden).toBe(false);
    });

    it('keeps it hidden once the app has marked itself started', async () => {
      const { document, line, endWait } = runLineScript();
      document.documentElement.setAttribute('data-app-started', 'true');
      await new Promise((resolve) => setImmediate(resolve));
      endWait();
      expect(line.hidden).toBe(true);
    });
  });

  it('holds no wrapper that waits for script before the page is shown', () => {
    expect(source('src', 'components', 'ThemeProvider.tsx')).not.toMatch(/opacity-0/);
    expect(html).not.toMatch(/opacity-0/);
  });

  it('asks nothing of another company: every picture, script and preload is the site\'s own', () => {
    const addresses = [
      ...all('img').map((image) => image.getAttribute('src')),
      ...all('source').map((item) => item.getAttribute('srcset')),
      ...all('link').map((link) => link.getAttribute('href')),
      ...all('script[src]').map((script) => script.getAttribute('src')),
    ];
    expect(addresses.length).toBeGreaterThan(12);
    for (const address of addresses) expect(address).toMatch(/^\/(?!\/)/);
  });

  it('gives every picture its width and height, so nothing moves when it loads', () => {
    for (const image of all('img')) {
      expect(Number(image.getAttribute('width'))).toBeGreaterThan(0);
      expect(Number(image.getAttribute('height'))).toBeGreaterThan(0);
    }
  });
});

describe('headline and lead', () => {
  it('says what a visitor gets in one H1 and one lead', () => {
    expect(words(one('h1'))).toBe('Free motion and sound alerts from an old phone or laptop');
    expect(words(one('.home-lead'))).toBe(
      'SafeOS Guardian runs in your browser. The device watching the room sounds the alert when something moves or gets loud.'
    );
    // The H1 comes first in the main content.
    expect(one('main h1, main h2, main h3')).toBe(one('h1'));
  });

  it('leads with no absence claim and none of the old page\'s words', () => {
    for (const text of [words(one('h1')), words(one('.home-lead'))]) {
      expect(text).not.toMatch(/no account|nothing|never|private|stays/i);
    }
    for (const gone of ['Experimental Supplemental Monitoring Tool', 'lo-tech', 'tech-savvy']) expect(pageWords).not.toContain(gone);
  });
});

describe('start action and the limit statement', () => {
  it('serves one key in the first screen, a plain link to setup that reads "Start setup"', () => {
    const keys = all('.home-first a, .home-first button');
    expect(keys).toHaveLength(1);
    expect(words(keys[0])).toBe('Start setup');
    expect(bare(keys[0].getAttribute('href'))).toBe('/setup');
    // The arrow is decoration.
    expect(keys[0].querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('says once, directly under the key, that SafeOS adds an alert and does not replace a person nearby', () => {
    expect(words(one('.home-statement'))).toBe(
      'SafeOS adds an alert. It does not replace a person nearby. A phone or a browser can sleep, lose power or drop the camera, so stay within reach.'
    );
    expect(one('.home-statement')?.parentElement).toBe(one('.home-first a.key')?.closest('.home-first__start'));
    expect(count('It does not replace a person nearby.')).toBe(1);
    for (const gone of ['supplemental', 'supplementary', 'NOT a replacement', 'babysitter', 'carer', 'security system', 'Takes less than 2 minutes']) {
      expect(pageWords.toLowerCase()).not.toContain(gone.toLowerCase());
    }
  });

  it('closes with the heading, the step count and the camera step read from setup\'s own list, and the start key again', () => {
    expect(SETUP_STEPS).toEqual(['welcome', 'disclaimer', 'scenario', 'permissions', 'notifications', 'complete']);
    expect(SETUP_STEP_COUNT).toBe(6);
    expect(SETUP_CAMERA_STEP).toBe(4);
    expect(all('.home-closing h2, .home-closing p, .home-closing a').map(words)).toEqual([
      'Start with the device you have',
      `Setup has ${SETUP_STEP_COUNT} short steps and asks for the camera at step ${SETUP_CAMERA_STEP}.`,
      'Start setup',
    ]);
    expect(bare(one('.home-closing a')?.getAttribute('href'))).toBe('/setup');
    // The setup page walks the same list.
    expect(source('src', 'app', 'setup', 'page.tsx')).toMatch(/const STEPS: Step\[\] = SETUP_STEPS;/);
  });
});

describe('a real capture of SafeOS watching a recorded clip', () => {
  const sizes = captureSizes();

  it('shows the capture in a figure whose caption says what it is', () => {
    const figure = one('figure.home-capture');
    expect(words(figure?.querySelector('figcaption'))).toBe('SafeOS watching a recorded clip of a kitten. Captured from the app while it ran.');
    expect(words(figure?.querySelector('figcaption'))).toBe(clip.words.captureCaption);
    // Four corner ticks frame it; they are decoration.
    expect(figure?.querySelectorAll('.corner-ticks i')).toHaveLength(4);
    expect(figure?.querySelector('.corner-ticks')?.getAttribute('aria-hidden')).toBe('true');
  });

  const crops: [CaptureCropName, string][] = [
    ['phone', clip.words.captureAlt.phone],
    ['landscape', clip.words.captureAlt.landscape],
    ['portrait', clip.words.captureAlt.portrait],
  ];

  it.each(crops)('serves the %s crop in both looks as a .webp with a .png beside it, with the record\'s text equivalent', (crop, alt) => {
    for (const look of ['dark', 'light']) {
      const picture = one(`.capture__slot--${crop} .capture__pic--${look} picture`);
      expect(picture?.querySelector('source')?.getAttribute('srcset')).toBe(`/home/capture-${crop}-${look}.webp`);
      expect(picture?.querySelector('source')?.getAttribute('type')).toBe('image/webp');
      const image = picture?.querySelector('img');
      expect(image?.getAttribute('src')).toBe(`/home/capture-${crop}-${look}.png`);
      expect(image?.getAttribute('alt')).toBe(alt);
      expect(Number(image?.getAttribute('width'))).toBe(sizes[crop].width);
      expect(Number(image?.getAttribute('height'))).toBe(sizes[crop].height);
    }
  });

  it('asks early for the capture of the look that is on, with the device\'s own look when scripts are off', () => {
    // The page's script asks for the crop for the width in the look that is on.
    expect(html).toContain(CAPTURE_PRELOAD_SCRIPT);
    // With scripts off, the device's own look, in each crop's widths.
    const preloads = all('link[rel="preload"][as="image"]');
    for (const link of preloads) expect(link.closest('noscript')).not.toBeNull();
    expect(preloads.map((link) => link.getAttribute('href')).sort()).toEqual(
      ['phone', 'landscape', 'portrait'].flatMap((crop) => ['dark', 'light'].map((look) => `/home/capture-${crop}-${look}.webp`)).sort()
    );
    for (const link of preloads) {
      expect(link.getAttribute('media')).toContain(`prefers-color-scheme: ${link.getAttribute('href')?.includes('-dark') ? 'dark' : 'light'}`);
      expect(link.getAttribute('fetchpriority')).toBe('high');
    }
  });

  it('shows no picture that is drawn or generated: the only pictures are the capture and the QR code', () => {
    const pictures = all('img').map((image) => image.getAttribute('src') || '');
    expect(pictures.filter((address) => !address.startsWith('/home/capture-'))).toEqual(['/home/site-qr.svg']);
  });
});

describe('what people set it up for', () => {
  const entries = all('#uses ul.home-uses > li');

  it('names five situations in order, each with its anchor on its H3', () => {
    expect(words(one('#uses h2'))).toBe('What people set it up for');
    expect(entries.map((entry) => `${entry.querySelector('h3')?.id}: ${words(entry.querySelector('h3'))}`)).toEqual([
      "baby-nap: A baby's nap",
      'pet-out: A pet while you are out',
      'elderly-parent: An elderly parent',
      'lost-pet: A lost pet near home',
      'wildlife: Backyard wildlife',
    ]);
  });

  it('says what SafeOS does in each situation and where it stops', () => {
    const body = (index: number) => Array.from(entries[index].querySelectorAll('p')).map(words);
    expect(body(0)).toEqual([
      'Motion and loud-sound alerts for a short nap while you are close by. It reacts to movement and noise in the room.',
      'SafeOS is not a medical device: it does not monitor breathing and cannot prevent SIDS. Safe-sleep guidance (NIH)',
    ]);
    expect(body(1)).toEqual([
      'Leave it watching for a short while. It can play a sound you recorded when it sees motion, and History lists each alert for when you are back.',
    ]);
    expect(body(2)).toEqual([
      'Set it up together, with their agreement. It alerts in the room on motion, a loud sound or a set time of stillness. It cannot tell why nothing has moved or whether someone needs help. Reaching your own phone takes a server you run.',
    ]);
    expect(body(3)).toEqual([
      "Point a camera at the yard or the porch. SafeOS compares what it sees with the colours in your pet's photos and alerts on a likely match. It cannot tell your pet from a look-alike, so post an alert on PawBoost or Petco Love Lost too.",
    ]);
    expect(body(4)).toEqual([
      `The Wildlife page uses an object-detection model to spot ${COCO_ANIMAL_CLASSES.length} kinds of animal, birds, cats and dogs among them. It saves a picture of each sighting in your browser.`,
    ]);
  });

  it('carries the not-a-medical-device sentence once, under the baby entry, with its NIH link in a new tab', () => {
    const sentence = 'SafeOS is not a medical device: it does not monitor breathing and cannot prevent SIDS.';
    expect(count(sentence)).toBe(1);
    const link = entries[0].querySelector('a');
    expect(words(link)).toBe('Safe-sleep guidance (NIH)');
    expect(link?.getAttribute('href')).toBe('https://safetosleep.nichd.nih.gov/reduce-risk/reduce');
    expect(link?.getAttribute('target')).toBe('_blank');
    for (const health of ['medical', 'breathing', 'SIDS']) expect(count(health)).toBe(1);
    for (const gone of ['vital', 'falls', 'babysitter', 'carer', 'identify']) expect(pageWords.toLowerCase()).not.toContain(gone);
    // It is the one link on the page that opens a new tab.
    expect(all('a[target]')).toHaveLength(1);
  });

  it('links PawBoost and Petco Love Lost by name, each on its own row, with no logo', () => {
    const links = Array.from(entries[3].querySelectorAll('a'));
    expect(links.map((link) => `${words(link)} ${link.getAttribute('href')}`)).toEqual([
      'PawBoost https://www.pawboost.com/',
      'Petco Love Lost https://lost.petcolove.org/',
    ]);
    for (const link of links) {
      expect(link.className).toContain('link-row');
      expect(link.querySelector('img, svg')).toBeNull();
      expect(link.closest('p')).toBeNull();
    }
  });

  it('carries no badge, no line in capitals and no quick-start key', () => {
    const section = words(one('#uses'));
    expect(section).not.toMatch(/FREE|Quick Start|SUPPLEMENTARY/);
    expect(all('#uses button')).toHaveLength(0);
  });
});

describe('how it works', () => {
  it('gives three numbered steps, with the step count and the camera step read from setup\'s list', () => {
    expect(words(one('#how-it-works h2'))).toBe('One device does the watching and the alerting');
    const steps = all('#how-it-works ol.home-steps > li');
    expect(steps.map((step) => [words(step.querySelector('h3')), words(step.querySelector('p'))])).toEqual([
      [
        'Open safeos.sh on the device that will watch.',
        'An old phone, a tablet or a laptop works. Plug it in and set its screen to stay on, because a device that sleeps stops watching.',
      ],
      [
        'Go through setup.',
        `It has ${SETUP_STEP_COUNT} short steps. You say what you are watching, and at step ${SETUP_CAMERA_STEP} the browser asks for the camera and microphone.`,
      ],
      [
        'Stay within earshot.',
        'When something moves or gets loud, the device plays an alert sound, shows a notification and lists the alert in History.',
      ],
    ]);
    const section = words(one('#how-it-works'));
    for (const device of ['phone', 'tablet', 'laptop']) expect(section).toContain(device);
  });

  it('shows a QR code of the site\'s address that loads as it nears the screen, with its caption', () => {
    const code = one('#how-it-works .home-qr img');
    expect(code?.getAttribute('alt')).toBe('QR code for https://safeos.sh/');
    expect(code?.getAttribute('loading')).toBe('lazy');
    expect(words(one('#how-it-works .home-qr figcaption'))).toBe('Scan to open safeos.sh on the phone or tablet that will watch.');
  });

  it('says what a visitor\'s own server adds and links the server guide', () => {
    expect(words(one('.home-how__note p'))).toBe(
      'Want the alert on another phone? Email, text and Telegram alerts need a server you run yourself.'
    );
    const link = one('.home-how__note a');
    expect(words(link)).toBe('Read the server guide on GitHub');
    expect(link?.getAttribute('href')).toBe(
      'https://github.com/framerslab/safeos/blob/master/docs/DEPLOYMENT.md#option-b-full-stack-deployment'
    );
  });
});

describe('what sets off an alert', () => {
  const entries = all('#alerts .home-alerts__list > li');

  it('names four things in plain words, always shown', () => {
    expect(words(one('#alerts h2'))).toBe('Four things set off an alert');
    expect(entries.map((entry) => words(entry.querySelector('h3')))).toEqual(['Motion', 'A loud sound', 'Stillness', 'A person or an animal']);
    expect(words(entries[0].querySelector('p'))).toBe('The camera picture changes by more than the amount you set.');
    expect(words(entries[1].querySelector('p'))).toBe('The microphone level stays above the level you set.');
    expect(all('#alerts details, #alerts button')).toHaveLength(0);
  });

  it('reads the stillness range from the setting\'s own bounds', () => {
    expect(words(entries[2].querySelector('p'))).toBe(
      `Nothing has moved for a time you set, from ${STILLNESS_ALERT_MIN_MINUTES} to ${STILLNESS_ALERT_MAX_MINUTES} minutes.`
    );
    expect([STILLNESS_ALERT_MIN_MINUTES, STILLNESS_ALERT_MAX_MINUTES]).toEqual([1, 60]);
    const panel = source('src', 'components', 'monitor', 'InlineSettingsPanel.tsx');
    expect(panel).toContain('min={STILLNESS_ALERT_MIN_MINUTES}');
    expect(panel).toContain('max={STILLNESS_ALERT_MAX_MINUTES}');
  });

  it('prints the animal kinds from the detector\'s own list', () => {
    expect(detector.COCO_ANIMAL_CLASSES).toBe(COCO_ANIMAL_CLASSES);
    expect(COCO_ANIMAL_CLASSES).toEqual(['dog', 'cat', 'bird', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe']);
    expect(Array.from(entries[3].querySelectorAll('p')).map(words)[0]).toBe(
      'The Security and Wildlife pages run an object-detection model in your browser. It finds people and 10 kinds of animal: dog, cat, bird, horse, sheep, cow, elephant, bear, zebra and giraffe.'
    );
  });

  it('prints the model\'s size from the one constant kept beside its address', () => {
    expect(MODEL_URL).toBe('https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json');
    expect([MODEL_MANIFEST_BYTES, MODEL_WEIGHTS_BYTES, MODEL_BYTES]).toEqual([527_315, 18_034_528, 18_561_843]);
    expect(MODEL_SIZE_MB).toBe('18.6');
    expect(Array.from(entries[3].querySelectorAll('p')).map(words)[1]).toBe(
      "That model is 18.6 MB, downloaded from Google's storage. The download starts only after you agree, and Google sees your IP address when it does."
    );
    // A number and its unit are not parted at a line's end.
    expect(entries[3].textContent).toContain('18.6 MB');
    // No other size for the model appears on the page, and the loader fetches the same address.
    expect(pageWords.match(/\d+(\.\d+)? MB/g)).toEqual(['18.6 MB']);
    expect(source('src', 'lib', 'detection-model.ts')).toContain("import { MODEL_URL } from './detection-model-facts';");
  });

  it('says what the everyday monitor does and links the detection code', () => {
    expect(words(one('.home-alerts__aside p'))).toBe(
      'The everyday monitor compares each camera frame with the one before and measures how loud the room is.'
    );
    const link = one('.home-alerts__aside a');
    expect(words(link)).toBe('Read the detection code on GitHub');
    expect(link?.getAttribute('href')).toBe('https://github.com/framerslab/safeos/tree/master/apps/guardian-ui/src/lib');
    expect(pageWords).not.toMatch(/\bAI\b/);
    for (const gone of ['Deep learning', 'cosine', 'Sobel', 'Blurred', 'COCO-SSD']) expect(pageWords).not.toContain(gone);
  });
});

describe('free and open source', () => {
  it('says SafeOS is free on this site, who builds it, its licence and that it is experimental', () => {
    expect(words(one('#free h2'))).toBe('Free on safeos.sh, with the code in the open');
    expect(all('#free .home-free__words p').map(words)).toEqual([
      'SafeOS at safeos.sh is free, and this site has no paid tier or subscription. Frame builds SafeOS and pays for it.',
      'The code is MIT-licensed, so anyone can read it, change it and run it.',
      'SafeOS is experimental software, provided as is.',
    ]);
  });

  it('gives four links to check each of those, as a list', () => {
    expect(all('#free ul.home-free__links > li > a').map((link) => `${words(link)} ${bare(link.getAttribute('href'))}`)).toEqual([
      'Read the code on GitHub https://github.com/framerslab/safeos',
      'The MIT License https://github.com/framerslab/safeos/blob/master/LICENSE',
      'The offline check that runs before each deploy https://github.com/framerslab/safeos/blob/master/apps/guardian-ui/scripts/check-offline-start.mjs',
      'How SafeOS works, in detail /blog/how-safeos-guardian-works',
    ]);
    for (const target of ['LICENSE', path.join('apps', 'guardian-ui', 'scripts', 'check-offline-start.mjs')]) {
      expect(fs.existsSync(path.join(APP_ROOT, '..', '..', target))).toBe(true);
    }
  });

  it('makes no promise it cannot stand behind and asks for no money', () => {
    for (const gone of ['humanitarian', 'always be free', 'never charge', 'Ever.', 'Future optional service']) expect(pageWords).not.toContain(gone);
    expect(pageWords).not.toMatch(/non-?profit|charit|donat|tax-exempt|tax-deductible|sponsor/i);
    // No count of stars, users or downloads, and no testimonial.
    expect(pageWords).not.toMatch(/\bstars?\b|\busers\b|downloads\b|testimonial/i);
  });
});

describe('questions people ask first', () => {
  const questions = all('#questions details');

  it('asks six questions, all closed at the start, built on the browser\'s own details element', () => {
    expect(words(one('#questions h2'))).toBe('Questions people ask first');
    expect(questions.map((question) => words(question.querySelector('summary')))).toEqual([
      'Can an old phone be the camera?',
      'Where does the alert go?',
      'Can I see the camera from another device?',
      'Does it work without internet?',
      'Do I need an account?',
      'Where are my pictures kept?',
    ]);
    for (const question of questions) expect(question.hasAttribute('open')).toBe(false);
  });

  it('answers each in a few true sentences', () => {
    expect(questions.map((question) => words(question.querySelector('.home-q__answer p')))).toEqual([
      'Yes. SafeOS runs in the browser on phones, tablets and computers. Plug the device in and set its screen to stay on, because a device that sleeps stops watching. The FAQ lists the browsers.',
      'To the device that is watching. It plays a sound, shows a notification and lists the alert in History. Email, text and Telegram alerts need a server you run yourself.',
      'No. safeos.sh shows the camera only on the device that is watching.',
      "Yes, after your browser has saved the app's files on a visit online. Motion and sound alerts then work with no connection. The Security and Wildlife pages also need their model saved first.",
      'No. Open safeos.sh on the device that will watch and go through setup.',
      'In the browser on the device that watches. Saved frames, photos and alerts are kept in its storage, and they go to a server only if you connect one of your own.',
    ]);
  });

  it('links the browser list, the privacy page and the full FAQ', () => {
    const link = (element: Element | null) => `${words(element)} ${bare(element?.getAttribute('href'))}`;
    expect(link(questions[0].querySelector('a'))).toBe('See the browser list in the FAQ /faq');
    expect(link(questions[5].querySelector('a'))).toBe('Read the privacy page /privacy');
    expect(link(one('#questions a.home-questions__all'))).toBe('All questions and answers /faq');
    // The link to the full FAQ comes after the questions in reading order.
    expect(all('#questions a').pop()).toBe(one('#questions a.home-questions__all'));
  });

  it('says once that no account is needed, and carries none of the claims that left the page', () => {
    expect(count('account')).toBe(1);
    for (const gone of ["Your camera's pictures stay in your browser", 'never leaves', '100% local', 'No telemetry', 'Who can see my camera?', 'What does it cost?']) {
      expect(pageWords).not.toContain(gone);
    }
  });

  it('adds no FAQ structured data', () => {
    const blocks = all('script[type="application/ld+json"]').map((script) => JSON.parse(script.textContent || '{}') as { '@type': string });
    expect(blocks.map((block) => block['@type'])).not.toContain('FAQPage');
  });
});

describe('the page as a whole', () => {
  it('plays nothing: it holds no video, no sound and no key that plays one', () => {
    expect(pageWords).not.toMatch(/sample clip|Try it on|Play the/i);
    expect(all('video, audio')).toHaveLength(0);
  });

  it('opens every link in the same tab but the one inside the not-a-medical-device sentence', () => {
    for (const link of all('a')) {
      if (link.getAttribute('target')) expect(link.getAttribute('href')).toBe('https://safetosleep.nichd.nih.gov/reduce-risk/reduce');
    }
  });

  it('keeps names as they are in a translated page', () => {
    const kept = all('[translate="no"]').map(words);
    for (const name of ['SafeOS Guardian', 'SafeOS', 'Frame', 'GitHub', 'PawBoost', 'Petco Love Lost']) expect(kept).toContain(name);
  });
});
