/** @jest-environment jsdom */
/**
 * The capture asked for early
 *
 * The home page asks early for the capture the first screen will show: the
 * crop for the width and the look that is on, which is the look the visitor
 * chose with the look switch when they chose one, and the device's look
 * otherwise. A small script in the page picks it before the picture is
 * reached; with scripts off the page asks for the device's look.
 */

import { CAPTURE_PRELOAD_SCRIPT } from '@/lib/capture-preload';

function device({ dark, width }: { dark: boolean; width: number }) {
  const em = width / 16;
  window.matchMedia = ((query: string) => {
    let matches = false;
    if (query === '(prefers-color-scheme: dark)') matches = dark;
    else if (query === '(prefers-color-scheme: light)') matches = !dark;
    else {
      const max = query.match(/max-width: ([\d.]+)em/);
      const min = query.match(/min-width: ([\d.]+)em/);
      matches = (!max || em <= Number(max[1])) && (!min || em >= Number(min[1]));
    }
    return { matches, media: query, addEventListener: () => {}, removeEventListener: () => {} };
  }) as unknown as typeof window.matchMedia;
}

function asked(): string[] {
  // The script as the page carries it, run in this document.
  new Function(CAPTURE_PRELOAD_SCRIPT)();
  return Array.from(document.head.querySelectorAll('link[rel="preload"][as="image"]')).map(
    (link) => `${link.getAttribute('href')} ${link.getAttribute('fetchpriority')}`
  );
}

const before = window.matchMedia;
afterEach(() => {
  window.matchMedia = before;
  document.head.innerHTML = '';
  document.documentElement.className = '';
});

it('asks for the light capture when the visitor chose the light look on a dark device', () => {
  device({ dark: true, width: 390 });
  document.documentElement.className = 'light';
  expect(asked()).toEqual(['/home/capture-phone-light.webp high']);
});

it('asks for the dark capture when the visitor chose the dark look on a light device', () => {
  device({ dark: false, width: 1280 });
  document.documentElement.className = 'dark';
  expect(asked()).toEqual(['/home/capture-portrait-dark.webp high']);
});

it('asks for the device\'s look when no look is set on the page, in the crop for each width', () => {
  for (const [width, crop] of [
    [320, 'phone'],
    [820, 'landscape'],
    [1024, 'portrait'],
    [1440, 'landscape'],
    [1920, 'landscape'],
  ] as const) {
    device({ dark: false, width });
    document.head.innerHTML = '';
    expect(asked()).toEqual([`/home/capture-${crop}-light.webp high`]);
  }
});
