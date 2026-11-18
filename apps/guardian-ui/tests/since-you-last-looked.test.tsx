/** @jest-environment jsdom */
/**
 * Since you last looked
 *
 * The dashboard's list of the alerts that came in since the person last
 * looked, from all four ways, newest first: as many rows as the layout shows,
 * each a link to History named by its words, its time and its way, then Mark
 * all as seen and the way to History. It says when nothing is new, when the
 * alerts could not be read and when the device is out of room, and it holds
 * no key that deletes. The device's alerts and the window's width are
 * stand-ins.
 */

import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { SinceYouLastLooked } from '@/components/dashboard/SinceYouLastLooked';
import type { DeviceAlert } from '@/lib/alert-groups';
import type { WayId } from '@/lib/app-routes';
import { clockTime } from '@/lib/clock-time';
import { useDeviceAlerts, type DeviceAlerts } from '@/lib/device-alerts';

// The served-html helpers load jsdom themselves, which this environment
// cannot, so their two readers are written here as they are there: an
// element's words as a reader takes them, with a straight and a curly
// apostrophe as one; an address without its closing slash, which next/link
// drops outside a build.
const words = (element: Element | null | undefined) =>
  (element?.textContent || '').replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const bare = (address: string | null | undefined) => (address || '').replace(/(?<=[^/])\/(?=$|[?#])/, '');

jest.mock('@/lib/device-alerts', () => ({
  useDeviceAlerts: jest.fn(),
}));

const deviceAlerts = jest.mocked(useDeviceAlerts);
const markAllSeen = jest.fn(async (): Promise<void> => undefined);
const readAgain = jest.fn((): void => undefined);

// The window's width, as the two layout queries answer it.
const TABLET = '(min-width: 48em)';
const DESKTOP = '(min-width: 64em)';
let widths: { tablet: boolean; desktop: boolean };
let changes: Set<() => void>;

function installWidths() {
  widths = { tablet: false, desktop: false };
  changes = new Set();
  window.matchMedia = ((query: string) => ({
    media: query,
    get matches() {
      return query === DESKTOP ? widths.desktop : query === TABLET ? widths.tablet : false;
    },
    onchange: null,
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'change') changes.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) => {
      changes.delete(listener);
    },
    addListener: (listener: () => void) => changes.add(listener),
    removeListener: (listener: () => void) => changes.delete(listener),
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
}

function widen(next: { tablet: boolean; desktop: boolean }) {
  act(() => {
    widths = next;
    changes.forEach((listener) => listener());
  });
}

const minute = (n: number) => new Date(2026, 10, 18, 14, n).getTime();

function anAlert(id: string, way: WayId, what: string, at: number, picture?: string): DeviceAlert {
  return { id, way, at, recordIds: [id], seen: false, what, picture };
}

// One alert of each way, newest first.
const bird = anAlert('animal-1', 'wildlife', 'Looks like a bird', minute(40), 'data:image/jpeg;base64,bird');
const person = anAlert('intrusion-1', 'security', '1 person in view', minute(30), 'data:image/jpeg;base64,person');
const mittens = anAlert('match-1', 'lost-found', 'Colours like Mittens’s', minute(20), 'data:image/jpeg;base64,mittens');
const movement = anAlert('alert-1', 'monitor', 'Movement', minute(10));
const alerts = [bird, person, mittens, movement];

const movements = (count: number) =>
  Array.from({ length: count }, (_, index) => anAlert(`alert-${index + 10}`, 'monitor', 'Movement', minute(50 - index)));

function state(partial: Partial<DeviceAlerts> = {}): DeviceAlerts {
  return { status: 'ready', newAlerts: [], storageFull: false, markAllSeen, readAgain, ...partial };
}

function shown(partial: Partial<DeviceAlerts> = {}) {
  deviceAlerts.mockReturnValue(state(partial));
  return render(<SinceYouLastLooked />);
}

// An answer the case gives when it chooses.
function held<T>() {
  let answer!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    answer = resolve;
  });
  return { promise, answer };
}

/** A time as the page writes it, read as a reader takes it. */
const time = (at: number) => clockTime(at).replace(/\s+/g, ' ');

const section = () => document.querySelector('section.since') as HTMLElement;
const label = () => section().querySelector('h2') as HTMLElement;
const items = () => Array.from(section().querySelectorAll('ul.since__list > li'));
const rowLinks = () => items().map((item) => item.querySelector('a') as HTMLAnchorElement);
const named = (element: Element) => (element.getAttribute('aria-label') || '').replace(/\s+/g, ' ');
const linkRow = () => section().querySelector('.since__ways-on a');
const follows = (first: Node, second: Node) => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

const OUT_OF_ROOM =
  "This device is out of room, so new alerts and pictures cannot be saved. Free room on the device, or clear SafeOS's saved data in Settings.";

beforeEach(() => {
  installWidths();
  markAllSeen.mockReset();
  markAllSeen.mockResolvedValue(undefined);
  readAgain.mockReset();
});

it('says nothing is new over the drawn line, with the way to History', () => {
  shown();

  expect(Array.from(section().querySelectorAll('h2'), (heading) => words(heading))).toEqual(['Since you last looked']);
  const empty = section().querySelector('p.since__empty') as HTMLElement;
  expect(words(empty)).toBe('Nothing new since you last looked.');
  const line = section().querySelector('svg.level-line') as SVGElement;
  expect(line).not.toBeNull();
  expect(line.getAttribute('aria-hidden')).toBe('true');
  expect(follows(empty, line)).toBe(true);
  const history = within(section()).getByRole('link', { name: 'Open history' });
  expect(bare(history.getAttribute('href'))).toBe('/history');
  expect(within(section()).queryAllByRole('button')).toHaveLength(0);
});

it('lists the newest alerts on a phone, each a link to History named by its words, its time and its way', () => {
  shown({ newAlerts: alerts });

  expect(items()).toHaveLength(3);
  for (const link of rowLinks()) expect(bare(link.getAttribute('href'))).toBe('/history');
  expect(rowLinks().map(named)).toEqual([
    `Looks like a bird at ${time(bird.at)}, from Wildlife`,
    `1 person in view at ${time(person.at)}, from People`,
    `Colours like Mittens's at ${time(mittens.at)}, from Lost and Found`,
  ]);
  const shownRows = [
    [bird, 'Looks like a bird', 'Wildlife'],
    [person, '1 person in view', 'People'],
    [mittens, "Colours like Mittens's", 'Lost and Found'],
  ] as const;
  rowLinks().forEach((link, index) => {
    const [one, what, way] = shownRows[index];
    const said = link.querySelector('.since__what') as HTMLElement;
    const from = link.querySelector('.since__way') as HTMLElement;
    expect(words(said)).toBe(`${what} at ${time(one.at)}`);
    expect(words(said.querySelector('.num'))).toBe(time(one.at));
    expect(words(from)).toBe(way);
    expect(follows(said, from)).toBe(true);
  });
  expect(words(linkRow())).toBe('Open history, and 1 more');
  expect(words(linkRow()?.querySelector('.num'))).toBe('1');
  expect(bare(linkRow()?.getAttribute('href'))).toBe('/history');
});

it("shows the saved picture of a way that keeps one, and the way's glyph for Motion and sound", () => {
  const view = shown({ newAlerts: alerts });
  rowLinks().forEach((link, index) => {
    const picture = link.querySelector('.since__picture img') as HTMLImageElement;
    expect(picture).not.toBeNull();
    expect(picture.getAttribute('src')).toBe(alerts[index].picture);
    expect(picture.getAttribute('alt')).toBe(named(link));
    expect(picture.getAttribute('width')).toBe('64');
    expect(picture.getAttribute('height')).toBe('48');
    expect(picture.getAttribute('loading')).toBe('lazy');
  });
  view.unmount();

  shown({ newAlerts: movements(5) });
  expect(items()).toHaveLength(3);
  for (const link of rowLinks()) {
    expect(link.querySelector('img')).toBeNull();
    const glyph = link.querySelector('.since__picture svg');
    expect(glyph).not.toBeNull();
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
  }
});

it('shows four rows from the tablet width and five from the desktop width', () => {
  shown({ newAlerts: movements(6) });
  expect(items()).toHaveLength(3);
  expect(words(linkRow())).toBe('Open history, and 3 more');

  widen({ tablet: true, desktop: false });
  expect(items()).toHaveLength(4);
  expect(words(linkRow())).toBe('Open history, and 2 more');

  widen({ tablet: true, desktop: true });
  expect(items()).toHaveLength(5);
  expect(words(linkRow())).toBe('Open history, and 1 more');

  widen({ tablet: false, desktop: false });
  expect(items()).toHaveLength(3);
});

it('reads Open history alone when every new alert shows', () => {
  shown({ newAlerts: [bird, person] });

  expect(items()).toHaveLength(2);
  expect(words(linkRow())).toBe('Open history');
});

it('Mark all as seen marks them and moves focus to the label', async () => {
  const marked = held<void>();
  markAllSeen.mockReturnValueOnce(marked.promise);
  shown({ newAlerts: alerts });

  const key = within(section()).getByRole('button', { name: 'Mark all as seen' });
  key.focus();
  fireEvent.click(key);
  expect(markAllSeen).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(key);

  await act(async () => {
    marked.answer();
  });
  expect(document.activeElement).toBe(label());
  expect(label().tagName).toBe('H2');
});

it('shows its label and the loading drawing until the alerts are read', () => {
  shown({ status: 'reading' });

  expect(words(label())).toBe('Since you last looked');
  expect(section().querySelectorAll('.drawn-frame[data-loading="true"]')).toHaveLength(1);
  expect(section().querySelectorAll('p')).toHaveLength(0);
  expect(within(section()).queryAllByRole('button')).toHaveLength(0);
  expect(within(section()).queryAllByRole('link')).toHaveLength(0);
});

it('says the alerts could not be read, with Try again', () => {
  shown({ status: 'failed', newAlerts: alerts });

  const sentence = section().querySelector('p.dash-problem') as HTMLElement;
  expect(words(sentence)).toBe('Alerts could not be read on this device.');
  expect(sentence.firstElementChild?.matches('svg.problem-mark')).toBe(true);
  expect(sentence.closest('[role="status"]')).not.toBeNull();

  fireEvent.click(within(section()).getByRole('button', { name: 'Try again' }));
  expect(readAgain).toHaveBeenCalledTimes(1);
  expect(items()).toHaveLength(0);
  expect(within(section()).queryByRole('button', { name: 'Mark all as seen' })).toBeNull();
});

it('says the device is out of room, with the way to Settings, and keeps the list', () => {
  shown({ storageFull: true, newAlerts: alerts });

  const sentence = section().querySelector('p.dash-problem') as HTMLElement;
  expect(words(sentence)).toBe(OUT_OF_ROOM);
  expect(sentence.firstElementChild?.matches('svg.problem-mark')).toBe(true);
  expect(sentence.closest('[role="status"]')).not.toBeNull();
  const settings = within(section()).getByRole('link', { name: 'Open settings' });
  expect(bare(settings.getAttribute('href'))).toBe('/settings');
  expect(items()).toHaveLength(3);
  expect(follows(settings, items()[0])).toBe(true);
});

it('marks a row that arrives after the first as arrived', () => {
  const view = shown({ newAlerts: [person, mittens] });
  expect(items().some((item) => item.classList.contains('since__item--arrived'))).toBe(false);

  deviceAlerts.mockReturnValue(state({ newAlerts: [bird, person, mittens] }));
  view.rerender(<SinceYouLastLooked />);

  expect(items().map((item) => item.classList.contains('since__item--arrived'))).toEqual([true, false, false]);
});

it('holds no key that deletes', () => {
  const states: Partial<DeviceAlerts>[] = [
    {},
    { newAlerts: alerts },
    { newAlerts: movements(6) },
    { status: 'reading' },
    { status: 'failed' },
    { storageFull: true },
    { storageFull: true, newAlerts: alerts },
  ];
  for (const one of states) {
    const view = shown(one);
    expect(screen.queryAllByRole('button', { name: /clear|delete/i })).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: /clear|delete/i })).toHaveLength(0);
    view.unmount();
  }
});
