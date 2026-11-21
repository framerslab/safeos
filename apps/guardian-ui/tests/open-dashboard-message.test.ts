/** @jest-environment node */
/**
 * The pictures script (scripts/capture-pictures.mjs) opens the dashboard and
 * waits for either of its two screens. When neither shows, the line it prints
 * names why each wait ended (a timeout, a closed page), not only that both
 * did. The script runs on import, so its openDashboard is read from the file
 * and run against a stand-in page whose waits time out.
 */
import fs from 'fs';
import path from 'path';

type OpenDashboard = (page: unknown, baseUrl: string) => Promise<unknown>;

function readOpenDashboard(): OpenDashboard {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'scripts', 'capture-pictures.mjs'), 'utf8');
  const start = source.indexOf('async function openDashboard(');
  const end = source.indexOf('\n}\n', start);
  if (start < 0 || end < 0) throw new Error('capture-pictures.mjs has no openDashboard');
  return new Function(`${source.slice(start, end + 2)}\nreturn openDashboard;`)() as OpenDashboard;
}

interface StandInLocator {
  waitFor: () => Promise<void>;
  count: () => Promise<number>;
  filter: () => StandInLocator;
}

function timesOut(what: string): StandInLocator {
  const locator: StandInLocator = {
    waitFor: async () => {
      throw new Error(`locator.waitFor: Timeout 20000ms exceeded.\nCall log:\n  - waiting for ${what}`);
    },
    count: async () => 0,
    filter: () => locator,
  };
  return locator;
}

it('names why each wait ended when the dashboard shows neither screen', async () => {
  const page = {
    goto: async () => null,
    getByRole: () => timesOut('the watching state'),
    locator: () => timesOut('Quick Actions'),
  };
  const opened = readOpenDashboard()(page, 'http://127.0.0.1:9/');
  await expect(opened).rejects.toThrow(/Timeout 20000ms exceeded/);
});
