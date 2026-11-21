/** @jest-environment node */
/**
 * The watching state as it is served
 *
 * Renders the dashboard's first part to the HTML a browser gets before any
 * script runs, before this device is read. A page whose script did not start
 * still reads: its heading, the statement and the line that says SafeOS needs
 * JavaScript, with no key that would do nothing.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WatchState } from '@/components/dashboard/WatchState';
import { served, words } from './helpers/served-html';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const NEEDS_SCRIPT = 'SafeOS needs JavaScript to watch. Turn it on for safeos.sh, then reload this page.';
const STATEMENT =
  'SafeOS adds an alert. It does not replace a person nearby. A phone or a browser can sleep, lose power or drop the camera, so stay within reach.';

const page = served(renderToStaticMarkup(<WatchState setUp={null} subjects={null} newAlerts={0} />));
const one = (selector: string) => page.querySelector(selector);
const follows = (first: Node, second: Node) => (first.compareDocumentPosition(second) & 4) !== 0; // DOCUMENT_POSITION_FOLLOWING

it('serves the heading, the statement and the line for a page whose script did not start', () => {
  const headings = Array.from(page.querySelectorAll('h1'));
  expect(headings.map((heading) => words(heading))).toEqual(['Not watching']);

  const line = one('#dash-needs-script') as Element;
  expect(words(line)).toBe(NEEDS_SCRIPT);
  expect(follows(headings[0], line)).toBe(true);
  const place = one('.dash-key-place') as Element;
  expect(place).not.toBeNull();
  expect(follows(line, place)).toBe(true);

  const script = line.nextElementSibling;
  expect(script?.tagName).toBe('SCRIPT');
  expect(script?.textContent).toContain('dash-needs-script');
  expect(script?.textContent).toContain('data-app-started');

  expect(words(one('p.dash-statement'))).toBe(STATEMENT);
  expect(page.querySelectorAll('button')).toHaveLength(0);
});

// Runs the script served beside the line in a page of its own. The page's
// timers are held so a case can say when the wait for the app has ended.
function runLineScript() {
  const script = one('#dash-needs-script')?.nextElementSibling?.textContent || '';
  const timers: { callback: () => void; ms: number }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM } = require('jsdom') as {
    JSDOM: new (html: string, options: { runScripts: string; beforeParse: (window: { setTimeout: unknown }) => void }) => { window: { document: Document } };
  };
  const dom = new JSDOM(
    `<!doctype html><html><body><p id="dash-needs-script">${NEEDS_SCRIPT}</p><script>${script}</script></body></html>`,
    {
      runScripts: 'dangerously',
      beforeParse(window) {
        window.setTimeout = (callback: () => void, ms: number) => {
          timers.push({ callback, ms });
          return timers.length;
        };
      },
    }
  );
  const document = dom.window.document;
  return {
    document,
    line: document.getElementById('dash-needs-script') as HTMLElement,
    waits: () => timers.map((timer) => timer.ms),
    endWait: () => timers.splice(0).forEach((timer) => timer.callback()),
  };
}

it("the line's script hides it at once and shows it again when the app has not started", async () => {
  const notStarted = runLineScript();
  expect(notStarted.line.hidden).toBe(true);
  expect(notStarted.waits()).toEqual([5000]);
  notStarted.endWait();
  expect(notStarted.line.hidden).toBe(false);

  const started = runLineScript();
  expect(started.line.hidden).toBe(true);
  started.document.documentElement.setAttribute('data-app-started', 'true');
  await new Promise((resolve) => setImmediate(resolve));
  started.endWait();
  expect(started.line.hidden).toBe(true);
});
