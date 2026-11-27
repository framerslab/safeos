/** @jest-environment jsdom */
/**
 * The four ways to watch
 *
 * The dashboard's list of the four ways, each row a link named by its name
 * and its line. Once this device is read, Lost and Found shows the pet it
 * watches for and never a person, People's line follows the number of people
 * allowed, and a square stands before the name of the way Start watching
 * uses. Before setup each row opens setup with its way named. Offline, a way
 * whose detection model is not on this device says it needs a connection.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { WaysToWatch, peopleLine, type WaysToWatchProps } from '@/components/dashboard/WaysToWatch';
import type { SubjectProfileDB } from '@/lib/client-db';
import { useModelOnDevice } from '@/lib/model-on-device';
import { forgetVisit } from '@/lib/visit-store';
import { rememberWay } from '@/lib/watch-session';
import { DEFAULT_SECURITY_SETTINGS, useSecurityStore } from '@/stores/security-store';

// The served-html helpers load jsdom themselves, which this environment
// cannot, so their two readers are written here as they are there: an
// element's words as a reader takes them, with a straight and a curly
// apostrophe as one; an address without its closing slash, which next/link
// drops outside a build.
const words = (element: Element | null | undefined) =>
  (element?.textContent || '').replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const bare = (address: string | null | undefined) => (address || '').replace(/(?<=[^/])\/(?=$|[?#])/, '');

jest.mock('@/lib/model-on-device', () => ({
  ...jest.requireActual('@/lib/model-on-device'),
  useModelOnDevice: jest.fn(),
}));

const modelHere = jest.mocked(useModelOnDevice);

function subject(id: string, name: string, type: SubjectProfileDB['type'], createdAt: string): SubjectProfileDB {
  return {
    id,
    name,
    type,
    description: '',
    fingerprint: null,
    referenceImages: [`data:image/png;base64,${id}`],
    createdAt,
    lastActiveAt: null,
    matchCount: 0,
  };
}

const mittens = subject('pet-1', 'Mittens', 'pet', '2026-11-01T10:00:00.000Z');
const rex = subject('pet-2', 'Rex', 'pet', '2026-11-02T10:00:00.000Z');
// Saved last of the three, so a row that took the newest subject of any kind would show Sam.
const sam = subject('person-1', 'Sam', 'person', '2026-11-03T10:00:00.000Z');

async function shown(props: Partial<WaysToWatchProps> = {}) {
  const view = render(<WaysToWatch setUp subjects={[]} {...props} />);
  await act(async () => {});
  return view;
}

/** Leaves the dashboard and opens it again, as a return from a way's page does. */
async function again(props: Partial<WaysToWatchProps> = {}) {
  cleanup();
  return shown(props);
}

const section = () => document.querySelector('section.ways') as HTMLElement;
const rows = () => within(section()).getAllByRole('link');
const row = (name: string) => rows().find((link) => words(link.querySelector('.way__name')) === name) as HTMLElement;
const lineOf = (name: string) => words(row(name).querySelector('.way__line'));
const names = () => rows().map((link) => link.getAttribute('aria-label'));
const squared = () => rows().filter((link) => link.querySelector('.way__square')).map((link) => words(link.querySelector('.way__name')));

const ALL_LINES = [
  'Alerts on movement or sound.',
  "Watches for your pet's colours.",
  'Alerts when someone is in view.',
  'Alerts when an animal is in view.',
];

const NO_FINDING = /identif|recogni[sz]|match|person's|people's colours/i;

beforeEach(() => {
  localStorage.clear();
  forgetVisit();
  useSecurityStore.setState({ settings: DEFAULT_SECURITY_SETTINGS });
  modelHere.mockReturnValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('names each row by its name and its line', async () => {
  await shown({ setUp: true, subjects: [] });

  expect(names()).toEqual([
    'Motion and sound: Alerts on movement or sound. Start watching uses this way',
    "Lost and Found: Watches for your pet's colours.",
    'People: Alerts when someone is in view.',
    'Wildlife: Alerts when an animal is in view.',
  ]);
  const lists = section().querySelectorAll('ul');
  expect(lists).toHaveLength(1);
  const items = within(lists[0]).getAllByRole('listitem');
  expect(items).toHaveLength(4);
  rows().forEach((link, index) => expect(link.closest('li')).toBe(items[index]));
});

it("shows the pet's photo in the glyph's place and names the pet", async () => {
  await shown({ subjects: [mittens] });

  const photo = row('Lost and Found').querySelector('img') as HTMLImageElement;
  expect(photo).not.toBeNull();
  expect(photo.getAttribute('alt')).toBe('Photo of Mittens');
  expect(photo.getAttribute('src')).toBe(mittens.referenceImages[0]);
  expect(photo.getAttribute('width')).toBe('32');
  expect(photo.getAttribute('height')).toBe('32');
  expect(photo.parentElement?.classList.contains('way__glyph')).toBe(true);
  expect(row('Lost and Found').querySelector('.way__glyph svg')).toBeNull();
  expect(lineOf('Lost and Found')).toBe("Watches for Mittens's colours.");
});

it('shows the pet last watched, and before any Lost and Found watch the one saved most recently', async () => {
  await shown({ subjects: [mittens, rex] });
  expect(row('Lost and Found').querySelector('img')?.getAttribute('alt')).toBe('Photo of Rex');
  expect(lineOf('Lost and Found')).toBe("Watches for Rex's colours.");

  rememberWay('lost-found', mittens.id);
  await again({ subjects: [mittens, rex] });
  expect(row('Lost and Found').querySelector('img')?.getAttribute('alt')).toBe('Photo of Mittens');
  expect(lineOf('Lost and Found')).toBe("Watches for Mittens's colours.");
});

it('never names or pictures a person', async () => {
  await shown({ subjects: [sam] });
  expect(row('Lost and Found').querySelector('img')).toBeNull();
  expect(lineOf('Lost and Found')).toBe("Watches for your pet's colours.");
  expect(words(section())).not.toContain('Sam');

  // Not when a Lost and Found watch last looked for that person either.
  rememberWay('lost-found', sam.id);
  await again({ subjects: [sam] });
  expect(row('Lost and Found').querySelector('img')).toBeNull();
  expect(words(section())).not.toContain('Sam');

  await again({ subjects: [sam, mittens] });
  expect(row('Lost and Found').querySelector('img')?.getAttribute('alt')).toBe('Photo of Mittens');
  expect(lineOf('Lost and Found')).toBe("Watches for Mittens's colours.");
});

it("keeps the glyph and the pet's name when the photo cannot be read", async () => {
  await shown({ subjects: [mittens] });

  fireEvent.error(row('Lost and Found').querySelector('img') as HTMLImageElement);

  const glyph = row('Lost and Found').querySelector('.way__glyph') as HTMLElement;
  expect(glyph.querySelector('img')).toBeNull();
  expect(glyph.querySelectorAll('svg')).toHaveLength(1);
  expect(glyph.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  expect(lineOf('Lost and Found')).toBe("Watches for Mittens's colours.");
});

it("People's line follows the number of people allowed", async () => {
  await shown();

  act(() => useSecurityStore.getState().setAllowedPersons(2));
  expect(lineOf('People')).toBe('Alerts above 2 people in view.');
  act(() => useSecurityStore.getState().setAllowedPersons(1));
  expect(lineOf('People')).toBe('Alerts above 1 person in view.');
  act(() => useSecurityStore.getState().setAllowedPersons(0));
  expect(lineOf('People')).toBe('Alerts when someone is in view.');
  expect(peopleLine(3)).toBe('Alerts above 3 people in view.');
});

it('marks the way Start watching uses with a square before its name', async () => {
  await shown({ subjects: [mittens] });
  expect(squared()).toEqual(['Motion and sound']);
  const name = row('Motion and sound').querySelector('.way__name') as HTMLElement;
  expect(name.firstElementChild?.classList.contains('way__square')).toBe(true);
  expect(name.firstElementChild?.getAttribute('aria-hidden')).toBe('true');

  rememberWay('lost-found', mittens.id);
  await again({ subjects: [mittens] });
  expect(squared()).toEqual(['Lost and Found']);
  expect(row('Lost and Found').querySelector('.way__name')?.firstElementChild?.classList.contains('way__square')).toBe(true);
  expect(row('Lost and Found').getAttribute('aria-label')).toMatch(/Start watching uses this way$/);
  expect(row('Motion and sound').getAttribute('aria-label')).not.toMatch(/Start watching uses this way/);

  rememberWay('lost-found', 'gone');
  await again({ subjects: [mittens] });
  expect(squared()).toEqual(['Motion and sound']);
});

it('marks Lost and Found as the way Start watching uses once setup chose a lost pet', async () => {
  rememberWay('lost-found');
  await shown({ subjects: [mittens] });
  expect(squared()).toEqual(['Lost and Found']);
  expect(row('Lost and Found').getAttribute('aria-label')).toMatch(/Start watching uses this way$/);
  await again({ subjects: [] });
  expect(squared()).toEqual(['Lost and Found']);
  expect(lineOf('Lost and Found')).toBe("Watches for your pet's colours.");
});

it('before setup each row opens setup with its way named, and none carries the square', async () => {
  await shown({ setUp: false });

  expect(rows().map((link) => bare(link.getAttribute('href')))).toEqual([
    '/setup?next=monitor',
    '/setup?next=lost-found',
    '/setup?next=security',
    '/setup?next=wildlife',
  ]);
  expect(section().querySelectorAll('.way__square')).toHaveLength(0);
  expect(names().some((name) => /Start watching uses this way/.test(name ?? ''))).toBe(false);
});

it('says a way needs a connection the first time, offline', async () => {
  const online = jest.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
  modelHere.mockReturnValue(false);
  await shown();
  expect(lineOf('People')).toBe('Needs a connection the first time.');
  expect(lineOf('Wildlife')).toBe('Needs a connection the first time.');
  expect(lineOf('Motion and sound')).toBe('Alerts on movement or sound.');
  expect(lineOf('Lost and Found')).toBe("Watches for your pet's colours.");

  online.mockReturnValue(true);
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
  expect(lineOf('People')).toBe('Alerts when someone is in view.');
  expect(lineOf('Wildlife')).toBe('Alerts when an animal is in view.');

  online.mockReturnValue(false);
  modelHere.mockReturnValue(true);
  await again();
  expect(lineOf('People')).toBe('Alerts when someone is in view.');
  expect(lineOf('Wildlife')).toBe('Alerts when an animal is in view.');
});

it("holds every line at rest to 33 characters without a pet's name", async () => {
  await shown();

  const lines = rows().map((link) => words(link.querySelector('.way__line')));
  expect(lines).toEqual(ALL_LINES);
  for (const line of [...lines, peopleLine(1), peopleLine(9)]) {
    expect(line.length).toBeLessThanOrEqual(33);
  }
});

it("speaks of a pet's colours and claims no finding", async () => {
  const seen: string[] = [];
  const read = () => seen.push(words(section()), ...names().map((name) => name ?? ''));

  await shown({ subjects: [] });
  read();
  await again({ subjects: [mittens, rex] });
  read();
  fireEvent.error(row('Lost and Found').querySelector('img') as HTMLImageElement);
  read();
  await again({ subjects: [sam] });
  read();
  await again({ setUp: false, subjects: [mittens] });
  read();
  act(() => useSecurityStore.getState().setAllowedPersons(2));
  read();
  jest.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
  modelHere.mockReturnValue(false);
  await again();
  read();

  expect(seen.length).toBeGreaterThan(0);
  for (const said of seen) {
    expect(said).not.toMatch(NO_FINDING);
  }
});
