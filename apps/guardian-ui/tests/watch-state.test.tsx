/** @jest-environment jsdom */
/**
 * The watching state and the start key
 *
 * The dashboard's first part says whether this device is watching, names the
 * way Start watching uses and when the last watch ended, and gives one key.
 * A press opens the camera while the dashboard is on screen, so a refusal is
 * said here with its fix; the fixes that are owed (the camera, notifications)
 * stand above the key, and the statement of what SafeOS does not replace
 * stands under it. Before setup the one key is Start setup. The camera, the
 * other tabs and the browser's answers are stand-ins.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { WatchState, type WatchStateProps } from '@/components/dashboard/WatchState';
import { useCameraAsk, useNotificationAsk } from '@/lib/browser-asks';
import { dropStart } from '@/lib/camera-handoff';
import type { SubjectProfileDB } from '@/lib/client-db';
import { clockTime } from '@/lib/clock-time';
import { useStorageEnds } from '@/lib/short-lived-storage';
import { startWatch, type StartOutcome } from '@/lib/start-watch';
import { askOtherTabs, takeOverWatch, useOtherTabWatch } from '@/lib/tab-channel';
import { forgetVisit } from '@/lib/visit-store';
import { rememberWay, watchEnded, watchSeen, watchStarted } from '@/lib/watch-session';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { bare, words } from './helpers/served-html';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/tab-channel', () => ({
  ...jest.requireActual('@/lib/tab-channel'),
  useOtherTabWatch: jest.fn(),
  askOtherTabs: jest.fn(),
  takeOverWatch: jest.fn(),
}));

jest.mock('@/lib/browser-asks', () => ({
  useCameraAsk: jest.fn(),
  useNotificationAsk: jest.fn(),
}));

jest.mock('@/lib/short-lived-storage', () => ({
  ...jest.requireActual('@/lib/short-lived-storage'),
  useStorageEnds: jest.fn(),
}));

jest.mock('@/lib/start-watch', () => ({
  ...jest.requireActual('@/lib/start-watch'),
  startWatch: jest.fn(),
}));

jest.mock('@/lib/camera-handoff', () => ({
  ...jest.requireActual('@/lib/camera-handoff'),
  dropStart: jest.fn(),
}));

const STATEMENT =
  'SafeOS adds an alert. It does not replace a person nearby. A phone or a browser can sleep, lose power or drop the camera, so stay within reach.';
const BLOCKED = "The camera is blocked for safeos.sh in this browser. Allow it in the site's settings, then press Start watching.";
const IN_USE = 'The camera is in use by another tab or app. Close it, then press Start watching.';
const FAILED = 'The camera did not start. Press Start watching to try again.';
const NOTIFICATIONS_BLOCKED = 'Alerts show in this tab only. Notifications are blocked for safeos.sh in this browser.';
const FORGETS = 'This browser forgets SafeOS when the window closes. Your settings and alerts last for this visit.';
const BEFORE_SETUP = 'Set up this device first. Setup asks for the camera and the microphone.';
const QUESTION = 'Watch here instead? The other tab stops.';

function subject(id: string, name: string, type: SubjectProfileDB['type']): SubjectProfileDB {
  return {
    id,
    name,
    type,
    description: '',
    fingerprint: null,
    referenceImages: [],
    createdAt: new Date(0).toISOString(),
    lastActiveAt: null,
    matchCount: 0,
  };
}

const mittens = subject('pet-1', 'Mittens', 'pet');
const sam = subject('person-1', 'Sam', 'person');

const started = jest.mocked(startWatch);
const otherTabWatches = jest.mocked(useOtherTabWatch);
const asked = jest.mocked(askOtherTabs);
const tookOver = jest.mocked(takeOverWatch);
const cameraAsk = jest.mocked(useCameraAsk);
const notificationAsk = jest.mocked(useNotificationAsk);
const storageEnds = jest.mocked(useStorageEnds);
const dropped = jest.mocked(dropStart);

function shown(props: Partial<WatchStateProps> = {}) {
  return render(<WatchState setUp subjects={[]} newAlerts={0} {...props} />);
}

// An answer the case gives when it chooses.
function held<T>() {
  let answer!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    answer = resolve;
  });
  return { promise, answer };
}

async function press(element: HTMLElement) {
  fireEvent.click(element);
  await act(async () => {});
}

/** A time as the page writes it, read as a reader takes it. */
const time = (at: number) => clockTime(at).replace(/\s+/g, ' ');

const section = () => document.querySelector('section.dash-state') as HTMLElement;
const line = () => document.getElementById('dash-line');
const key = (name = 'Start watching') => screen.getByRole('button', { name });
const problems = () => section().querySelector('.dash-problems') as HTMLElement;
const problemWords = () => Array.from(problems().querySelectorAll('p.dash-problem'), (sentence) => words(sentence));
const firstHeadings = () => screen.getAllByRole('heading', { level: 1 }).map((heading) => words(heading));
const follows = (first: Node, second: Node) => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

beforeEach(() => {
  localStorage.clear();
  forgetVisit();
  useOnboardingStore.setState({ selectedScenario: null });
  mockPush.mockReset();
  dropped.mockReset();
  started.mockReset();
  otherTabWatches.mockReset().mockReturnValue(false);
  asked.mockReset().mockResolvedValue({ watching: false });
  tookOver.mockReset().mockResolvedValue(true);
  cameraAsk.mockReset().mockReturnValue('granted');
  notificationAsk.mockReset().mockReturnValue({ ask: 'granted', request: jest.fn(async () => {}) });
  storageEnds.mockReset().mockReturnValue(false);
});

afterEach(cleanup);

it('says it is not watching and gives one key, with the statement under it', () => {
  shown();

  expect(firstHeadings()).toEqual(['Not watching']);
  expect(words(line())).toBe('Start watching uses Motion and sound.');
  const buttons = within(section()).getAllByRole('button');
  expect(buttons.map((button) => words(button))).toEqual(['Start watching']);
  expect(buttons[0].getAttribute('aria-describedby')).toBe('dash-line');
  const statement = section().querySelector('p.dash-statement') as HTMLElement;
  expect(words(statement)).toBe(STATEMENT);
  expect(statement.querySelector('[translate="no"]')?.textContent).toBe('SafeOS');
  expect(follows(buttons[0], statement)).toBe(true);
  expect(within(section()).queryAllByRole('link')).toEqual([]);
});

it('names Motion and sound whichever use setup stored', () => {
  for (const use of ['baby', 'security'] as const) {
    useOnboardingStore.setState({ selectedScenario: use });
    shown();
    expect(words(line())).toBe('Start watching uses Motion and sound.');
    cleanup();
  }
});

it('names the way and the pet last watched, and when the last watch ended', () => {
  rememberWay('lost-found', 'pet-1');
  watchStarted(1000);
  watchEnded(2000);

  shown({ subjects: [sam, mittens] });

  expect(words(line())).toBe(`Start watching uses Lost and Found, for Mittens. The last watch ended at ${time(2000)}.`);
  expect(words(line()?.querySelector('.num'))).toBe(time(2000));
});

it('says how long a watch is known to have run when it wrote no end', () => {
  watchStarted(1000);
  watchSeen(61_000);

  shown();

  expect(words(line())).toBe(`Start watching uses Motion and sound. The last watch ran until at least ${time(61_000)}.`);
  expect(words(line())).not.toContain('ended at');
  expect(words(line()?.querySelector('.num'))).toBe(time(61_000));
});

it('a press starts the watch once and waits', async () => {
  started.mockReturnValue(held<StartOutcome>().promise);
  shown();

  await press(key());

  const waiting = key('Starting the camera…');
  expect(waiting.getAttribute('aria-disabled')).toBe('true');
  expect(waiting.classList.contains('key--waiting')).toBe(true);
  expect(waiting.classList.contains('key--solid')).toBe(false);
  await press(waiting);
  expect(started).toHaveBeenCalledTimes(1);
  expect(started.mock.calls[0][0]).toEqual({ way: 'monitor' });
});

it('a camera that opens after the dashboard was left opens nothing and is closed', async () => {
  // The function each press handed to the start, in the order of the presses.
  const given: ((address: string) => void)[] = [];
  started.mockImplementation((_choice, go) => {
    given.push(go);
    return held<StartOutcome>().promise;
  });

  // While the dashboard is on screen the way's page opens.
  shown();
  await press(key());
  expect(given).toHaveLength(1);
  act(() => given[0]('/monitor/'));
  expect(mockPush.mock.calls).toEqual([['/monitor/']]);
  expect(dropped).not.toHaveBeenCalled();
  cleanup();

  // Once it was left, nothing opens and the held camera is closed.
  const { unmount } = shown();
  await press(key());
  expect(given).toHaveLength(2);
  unmount();
  given[1]('/monitor/');
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(dropped).toHaveBeenCalledTimes(1);
});

it('says the camera is blocked, with the way to allow it, and gives the key back', async () => {
  started.mockResolvedValue('blocked');
  shown();

  await press(key());

  const status = problems();
  expect(status.getAttribute('role')).toBe('status');
  expect(status.getAttribute('aria-live')).toBe('polite');
  const sentence = status.querySelector('p.dash-problem') as HTMLElement;
  expect(words(sentence)).toBe(BLOCKED);
  expect(sentence.firstElementChild?.matches('svg.problem-mark')).toBe(true);
  const link = screen.getByRole('link', { name: 'How to allow the camera' });
  expect(bare(link.getAttribute('href'))).toBe(bare('/help/#camera'));
  expect(key().hasAttribute('aria-disabled')).toBe(false);
});

it('shows the blocked sentence at rest when the browser already says so', () => {
  cameraAsk.mockReturnValue('blocked');
  shown();

  expect(problemWords()).toEqual([BLOCKED]);
  const link = screen.getByRole('link', { name: 'How to allow the camera' });
  expect(bare(link.getAttribute('href'))).toBe(bare('/help/#camera'));
  expect(started).not.toHaveBeenCalled();
});

async function saysAfterAPress(outcome: StartOutcome, sentence: string) {
  started.mockResolvedValue(outcome);
  shown();

  await press(key());

  expect(problemWords()).toEqual([sentence]);
  expect(screen.queryByRole('link', { name: 'How to allow the camera' })).toBeNull();
  expect(key().hasAttribute('aria-disabled')).toBe(false);

  // A new press clears the sentence while it waits.
  started.mockReturnValue(held<StartOutcome>().promise);
  await press(key());
  expect(key('Starting the camera…')).toBeTruthy();
  expect(problemWords()).toEqual([]);
}

it('says the camera is in use', async () => {
  await saysAfterAPress('in-use', IN_USE);
});

it('says the camera did not start', async () => {
  await saysAfterAPress('failed', FAILED);
});

it('asks about notifications from one row, above the key', async () => {
  const request = jest.fn(async () => {});
  notificationAsk.mockReturnValue({ ask: 'not-asked', request });
  shown();

  const row = screen.getByRole('button', { name: 'Show alerts outside this tab' });
  expect(follows(row, key())).toBe(true);
  await press(row);
  expect(request).toHaveBeenCalledTimes(1);
  cleanup();

  notificationAsk.mockReturnValue({ ask: 'granted', request });
  shown();
  expect(screen.queryByRole('button', { name: 'Show alerts outside this tab' })).toBeNull();
});

it('says alerts stay in this tab while notifications are blocked', () => {
  notificationAsk.mockReturnValue({ ask: 'blocked', request: jest.fn(async () => {}) });
  shown();

  expect(problemWords()).toEqual([NOTIFICATIONS_BLOCKED]);
  const link = screen.getByRole('link', { name: 'How to turn on notifications' });
  expect(bare(link.getAttribute('href'))).toBe(bare('/help/#notifications'));
  expect(screen.queryByRole('button', { name: 'Show alerts outside this tab' })).toBeNull();
});

it('says when the browser forgets SafeOS', () => {
  storageEnds.mockReturnValue(true);
  shown();

  expect(problemWords()).toEqual([FORGETS]);
  expect(key()).toBeTruthy();
});

it('a start another tab took over gives the key back with no sentence', async () => {
  started.mockResolvedValue('stopped');
  shown();

  await press(key());

  expect(key().hasAttribute('aria-disabled')).toBe(false);
  expect(problems().querySelectorAll('p.dash-problem')).toHaveLength(0);
});

it('reads Watching in another tab and asks before a second watch', async () => {
  otherTabWatches.mockReturnValue(true);
  asked.mockResolvedValue({ watching: true, way: 'monitor' });
  tookOver.mockResolvedValue(true);
  started.mockReturnValue(held<StartOutcome>().promise);
  shown();

  expect(firstHeadings()).toEqual(['Watching in another tab']);
  await press(key());
  const dialog = screen.getByRole('dialog', { name: QUESTION });
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(started).not.toHaveBeenCalled();

  await press(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(key());

  await press(key());
  await press(within(screen.getByRole('dialog', { name: QUESTION })).getByRole('button', { name: 'Watch here' }));
  expect(tookOver).toHaveBeenCalledTimes(1);
  expect(started).toHaveBeenCalledTimes(1);
  expect(tookOver.mock.invocationCallOrder[0]).toBeLessThan(started.mock.invocationCallOrder[0]);
});

it('shows the new-alerts sentence as text beside the problem glyph', () => {
  shown({ newAlerts: 4 });

  const sentence = section().querySelector('p.dash-new') as HTMLElement;
  expect(words(sentence)).toBe('4 new alerts since you last looked.');
  const glyph = sentence.firstElementChild;
  expect(glyph?.matches('svg.problem-mark')).toBe(true);
  expect(glyph?.getAttribute('aria-hidden')).toBe('true');
  expect(words(sentence.querySelector('.num'))).toBe('4');
  expect(sentence.querySelectorAll('a, button')).toHaveLength(0);
  expect(problems().contains(sentence)).toBe(false);
  expect(sentence.closest('[aria-live], [role="status"]')).toBeNull();
  cleanup();

  shown({ newAlerts: 1 });
  expect(words(section().querySelector('p.dash-new'))).toBe('1 new alert since you last looked.');
  cleanup();

  shown({ newAlerts: 0 });
  expect(section().querySelector('p.dash-new')).toBeNull();
});

it('before setup gives Start setup as its one key', () => {
  watchStarted(1000);
  watchEnded(2000);
  notificationAsk.mockReturnValue({ ask: 'not-asked', request: jest.fn(async () => {}) });
  // The camera's sentence asks for a press of Start watching, which this
  // state does not offer: setup asks for the camera itself.
  cameraAsk.mockReturnValue('blocked');
  shown({ setUp: false });

  expect(firstHeadings()).toEqual(['Not watching']);
  expect(words(line())).toBe(BEFORE_SETUP);
  const links = within(section()).getAllByRole('link');
  expect(links.map((link) => words(link))).toEqual(['Start setup']);
  expect(bare(links[0].getAttribute('href'))).toBe('/setup');
  expect(links[0].getAttribute('aria-describedby')).toBe('dash-line');
  expect(words(section().querySelector('p.dash-statement'))).toBe(STATEMENT);
  expect(within(section()).queryAllByRole('button')).toEqual([]);
  expect(words(section())).not.toContain('The last watch');
  expect(problemWords()).toEqual([]);
});

it('before setup says when the browser forgets SafeOS', () => {
  storageEnds.mockReturnValue(true);
  shown({ setUp: false });

  expect(problemWords()).toEqual([FORGETS]);
  const sentence = problems().querySelector('p.dash-problem') as HTMLElement;
  expect(follows(line() as HTMLElement, sentence)).toBe(true);
});

it("holds the heading's and the key's place until this device is read", () => {
  const { rerender } = render(<WatchState setUp={null} subjects={[]} newAlerts={0} />);
  const waitsForTheRead = () => {
    expect(section().getAttribute('data-read')).toBe('no');
    expect(words(section().querySelector('p.dash-loading'))).toBe('Loading the dashboard…');
    const place = section().querySelector('.dash-key-place');
    expect(place).not.toBeNull();
    expect(place?.querySelectorAll('a, button')).toHaveLength(0);
  };
  waitsForTheRead();

  rerender(<WatchState setUp subjects={null} newAlerts={0} />);
  waitsForTheRead();

  rerender(<WatchState setUp subjects={[]} newAlerts={0} />);
  expect(section().getAttribute('data-read')).toBe('yes');
  expect(section().querySelector('p.dash-loading')).toBeNull();
  expect(words(section())).not.toContain('Loading the dashboard');
});

it('carries no word the page may not carry', async () => {
  const said: string[] = [];
  const read = () => said.push(words(document.body));
  const states: [Partial<WatchStateProps>, () => void][] = [
    [{}, () => {}],
    [{ newAlerts: 3 }, () => {}],
    [{ setUp: false }, () => storageEnds.mockReturnValue(true)],
    [{ setUp: null, subjects: null }, () => {}],
    [{}, () => cameraAsk.mockReturnValue('blocked')],
    [{}, () => notificationAsk.mockReturnValue({ ask: 'not-asked', request: jest.fn(async () => {}) })],
    [{}, () => notificationAsk.mockReturnValue({ ask: 'blocked', request: jest.fn(async () => {}) })],
    [{}, () => storageEnds.mockReturnValue(true)],
  ];
  for (const [props, given] of states) {
    given();
    shown(props);
    read();
    cleanup();
  }
  for (const outcome of ['in-use', 'failed'] as const) {
    started.mockResolvedValue(outcome);
    shown();
    await press(key());
    read();
    cleanup();
  }
  otherTabWatches.mockReturnValue(true);
  asked.mockResolvedValue({ watching: true, way: 'monitor' });
  shown();
  await press(key());
  read();

  expect(said).toHaveLength(11);
  for (const text of said) expect(text).not.toMatch(/babysitter|carer|security system|medical|identify|recogni[sz]e|nonprofit|donate/i);
});
