/** @jest-environment node */
/**
 * The repository's star count: how it is read and how it is written
 *
 * scripts/read-github-stars.mjs asks GitHub once before the site is built and
 * hands the build two values. src/lib/github-stars.ts reads them, writes the
 * count cut down to a short form and names the link. A count that could not
 * be read, or a value that is not a count, leaves the link as its word alone.
 */

import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import type { AddressInfo } from 'net';
import {
  exactStars,
  githubLinkDescription,
  githubLinkName,
  longDay,
  parseStarCount,
  shortCount,
  starsSentence,
} from '@/lib/github-stars';

const SCRIPT = path.join(__dirname, '..', 'scripts', 'read-github-stars.mjs');

describe('the count as it is written', () => {
  it.each([
    [1, '1'],
    [58, '58'],
    [999, '999'],
    [1000, '1k'],
    [1049, '1k'],
    [1234, '1.2k'],
    [1999, '1.9k'],
    [12345, '12.3k'],
    [99999, '99.9k'],
    [100000, '100k'],
    [999999, '999k'],
    [1000000, '1M'],
    [1234567, '1.2M'],
  ])('writes %d as "%s", cut down and never rounded up', (count, short) => {
    expect(shortCount(count)).toBe(short);
  });

  it('gives the exact number in words, with its thousands separator', () => {
    expect(exactStars(1)).toBe('1 star');
    expect(exactStars(58)).toBe('58 stars');
    expect(exactStars(1234)).toBe('1,234 stars');
    expect(exactStars(1234567)).toBe('1,234,567 stars');
  });

  it('writes the day as a reader does', () => {
    expect(longDay('2026-11-18')).toBe('18 November 2026');
    expect(longDay('2027-01-02')).toBe('2 January 2027');
    expect(longDay('2026-02-30')).toBe('');
  });

  it('names the link by its word and its count, and describes it by the day', () => {
    expect(githubLinkName(null)).toBe('SafeOS on GitHub');
    expect(githubLinkName({ count: 1, day: '2026-11-18' })).toBe('SafeOS on GitHub 1 star');
    expect(githubLinkName({ count: 58, day: '2026-11-18' })).toBe('SafeOS on GitHub 58 stars');
    expect(githubLinkName({ count: 1234, day: '2026-11-18' })).toBe('SafeOS on GitHub 1.2k stars');
    expect(githubLinkDescription({ count: 58, day: '2026-11-18' })).toBe('Counted 18 November 2026.');
    expect(githubLinkDescription({ count: 999, day: '2026-11-18' })).toBe('Counted 18 November 2026.');
    expect(githubLinkDescription({ count: 1234, day: '2026-11-18' })).toBe('1,234 stars, counted 18 November 2026.');
  });

  it('says the count in a sentence for the footer', () => {
    expect(starsSentence({ count: 58, day: '2026-11-18' })).toBe('58 stars on GitHub, counted 18 November 2026.');
    expect(starsSentence({ count: 1, day: '2026-11-18' })).toBe('1 star on GitHub, counted 18 November 2026.');
    expect(starsSentence({ count: 1234, day: '2026-11-18' })).toBe('1,234 stars on GitHub, counted 18 November 2026.');
  });
});

describe('the two values the build is handed', () => {
  it('reads a whole number above zero beside a day that exists', () => {
    expect(parseStarCount('58', '2026-11-18')).toEqual({ count: 58, day: '2026-11-18' });
    expect(parseStarCount('1234567', '2028-02-29')).toEqual({ count: 1234567, day: '2028-02-29' });
  });

  it.each([
    ['no value', undefined, undefined],
    ['an empty value', '', ''],
    ['0', '0', '2026-11-18'],
    ['-3', '-3', '2026-11-18'],
    ['abc', 'abc', '2026-11-18'],
    ['58.5', '58.5', '2026-11-18'],
    ['1e3', '1e3', '2026-11-18'],
    ['058', '058', '2026-11-18'],
    ['a number with a space', '58 ', '2026-11-18'],
    ['a number of ten digits', '1234567890', '2026-11-18'],
    ['a count with no day', '58', undefined],
    ['a day written another way', '58', '18 November 2026'],
    ['a day that does not exist', '58', '2026-02-30'],
    ['a month that does not exist', '58', '2026-13-01'],
  ])('reads %s as no count', (_name, count, day) => {
    expect(parseStarCount(count, day)).toBeNull();
  });
});

describe('the script that asks GitHub before the build', () => {
  type Answer = (request: http.IncomingMessage, response: http.ServerResponse) => void;
  let server: http.Server;
  let answer: Answer = (_request, response) => response.end();
  let asked: http.IncomingMessage[] = [];
  let dir = '';
  const timers: NodeJS.Timeout[] = [];

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      asked.push(request);
      answer(request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  afterAll(async () => {
    timers.forEach(clearTimeout);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    asked = [];
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'safeos-stars-'));
    fs.writeFileSync(path.join(dir, 'env'), '');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const json = (status: number, body: unknown): Answer => (_request, response) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };

  /** Runs the script as a workflow step would, against the test's server. */
  function run(env: Record<string, string> = {}) {
    const { port } = server.address() as AddressInfo;
    // Only what a workflow step would hand it: nothing of this process's own.
    const stepEnv = {
      PATH: process.env.PATH || '',
      SAFEOS_STARS_URL: `http://127.0.0.1:${port}/repos/framerslab/safeos`,
      GITHUB_ENV: path.join(dir, 'env'),
      ...env,
    } as unknown as NodeJS.ProcessEnv;
    return new Promise<{ status: number | string; out: string; err: string; handed: string }>((resolve) => {
      execFile(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8', timeout: 20_000, env: stepEnv }, (error: (Error & { code?: number | string | null }) | null, out: string, err: string) => {
        const status = error ? (error.code ?? 1) : 0;
        resolve({ status, out, err, handed: fs.readFileSync(path.join(dir, 'env'), 'utf8') });
      });
    });
  }

  const today = () => new Date().toISOString().slice(0, 10);

  it('writes the count and today\'s date when GitHub answers with 58', async () => {
    answer = json(200, { full_name: 'framerslab/safeos', stargazers_count: 58 });
    const before = today();
    const result = await run();
    const days = [before, today()];
    expect(result.status).toBe(0);
    expect(result.err).toBe('');
    expect(days.map((day) => `NEXT_PUBLIC_GITHUB_STARS=58\nNEXT_PUBLIC_GITHUB_STARS_DATE=${day}\n`)).toContain(result.handed);
    expect(days.map((day) => `58 stars on framerslab/safeos, counted ${day}.\n`)).toContain(result.out);
    // What it wrote is what the pages read.
    const [count, day] = result.handed.trim().split('\n').map((line) => line.split('=')[1]);
    expect(parseStarCount(count, day)).toEqual({ count: 58, day });
    expect(asked).toHaveLength(1);
    expect(asked[0].url).toBe('/repos/framerslab/safeos');
    expect(asked[0].headers.authorization).toBeUndefined();
  });

  it('prints the two values when no workflow is there to take them', async () => {
    answer = json(200, { stargazers_count: 1 });
    const result = await run({ GITHUB_ENV: '' });
    expect(result.status).toBe(0);
    expect(result.out).toMatch(/^NEXT_PUBLIC_GITHUB_STARS=1\nNEXT_PUBLIC_GITHUB_STARS_DATE=\d{4}-\d{2}-\d{2}\n1 star on framerslab\/safeos, counted \d{4}-\d{2}-\d{2}\.\n$/);
    expect(result.handed).toBe('');
  });

  it('sends the workflow\'s token when it has one and never prints it', async () => {
    answer = json(200, { stargazers_count: 58 });
    const token = 'a-token-made-up-for-this-test';
    const result = await run({ GITHUB_TOKEN: token });
    expect(result.status).toBe(0);
    expect(asked[0].headers.authorization).toBe(`Bearer ${token}`);
    expect(result.out + result.err + result.handed).not.toContain(token);
  });

  it.each([
    ['answers 403', json(403, { message: 'API rate limit exceeded' }), /GitHub answered 403/],
    ['answers 404', json(404, { message: 'Not Found' }), /GitHub answered 404/],
    ['answers with no stargazers_count', json(200, { full_name: 'framerslab/safeos' }), /no whole number of stars/],
    ['answers with a count that is words', json(200, { stargazers_count: 'many' }), /no whole number of stars/],
    ['answers with a count that is a fraction', json(200, { stargazers_count: 58.5 }), /no whole number of stars/],
    ['answers with a count below zero', json(200, { stargazers_count: -3 }), /no whole number of stars/],
    ['answers with a count of 0', json(200, { stargazers_count: 0 }), /has no star/],
    ['answers with something that is not JSON', ((_request, response) => response.end('<html>')) as Answer, /not JSON/],
  ])('warns, writes no value and ends with success when GitHub %s', async (_name, how, warning) => {
    answer = how;
    const result = await run({ GITHUB_TOKEN: 'a-token-made-up-for-this-test' });
    expect(result.status).toBe(0);
    expect(result.handed).toBe('');
    expect(result.out).toBe('');
    expect(result.err).toMatch(/^Warning: The star count was not read: /);
    expect(result.err).toMatch(warning);
    expect(result.err).not.toContain('a-token-made-up-for-this-test');
  });

  it('warns, writes no value and ends with success when GitHub cannot be reached', async () => {
    const result = await run({ SAFEOS_STARS_URL: 'http://127.0.0.1:9/repos/framerslab/safeos' });
    expect(result.status).toBe(0);
    expect(result.handed).toBe('');
    expect(result.err).toMatch(/GitHub could not be reached/);
  });

  it('writes the warning as an annotation on a workflow run', async () => {
    answer = json(403, {});
    const result = await run({ GITHUB_ACTIONS: 'true' });
    expect(result.status).toBe(0);
    expect(result.err).toMatch(/^::warning title=GitHub star count::The star count was not read: GitHub answered 403\./);
  });

  it('gives up after ten seconds when GitHub answers after eleven, with a warning and no value', async () => {
    answer = (_request, response) => {
      timers.push(setTimeout(() => json(200, { stargazers_count: 58 })(_request, response), 11_000));
    };
    const started = Date.now();
    const result = await run();
    const took = Date.now() - started;
    expect(result.status).toBe(0);
    expect(result.handed).toBe('');
    expect(result.out).toBe('');
    expect(result.err).toMatch(/GitHub did not answer within 10 seconds/);
    // It waited the ten seconds out: it did not give up at once.
    expect(took).toBeGreaterThanOrEqual(9_500);
  }, 25_000);
});
