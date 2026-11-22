/** @jest-environment jsdom */
/**
 * The list of settings pages
 *
 * Settings opens on one list of its pages in four groups. Each row is a link
 * named by its page and described by its value, read from this device's own
 * stores: the setting and its two values (or the pet the next watch looks
 * for), the alert volume, quiet hours, and each other page's value. Before the
 * page has mounted each value is a loading bar, never a default. The group
 * "Your own server" shows only while a server address is saved.
 */

import fs from 'fs';
import path from 'path';
import { act, render, screen, within } from '@testing-library/react';
import './helpers/browser-data';
import { SettingsList } from '@/components/settings/SettingsList';
import { readBrowserNotificationsOn, writeNotificationChoices } from '@/lib/notification-choices';
import { petForWatch } from '@/lib/next-way';
import { clockTimeOf } from '@/lib/settings-values';
import { saveSubjectProfile, type SubjectProfileDB } from '@/lib/client-db';
import { useSettingsStore } from '@/stores/settings-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useLostFoundStore } from '@/stores/lost-found-store';

let mockApiUrl = '';
/** An address without its trailing slash: next/link drops it outside a build. */
const bare = (address: string | null | undefined) => (address || '').replace(/(?<=[^/])\/(?=$|[?#])/, '');

jest.mock('@/contexts/BackendStatusContext', () => ({
  useBackendStatus: () => ({ status: { api: 'disconnected' }, config: { apiUrl: mockApiUrl } }),
}));
jest.mock('next/navigation', () => ({
  usePathname: () => '/settings/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/** The words an element's aria-describedby names. */
function descriptionOf(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
}

function pet(id: string, name: string, createdAt: string, type: SubjectProfileDB['type'] = 'pet'): SubjectProfileDB {
  return {
    id,
    name,
    type,
    description: '',
    fingerprint: null,
    referenceImages: [],
    createdAt,
    lastActiveAt: null,
    matchCount: 0,
  };
}

function rows() {
  return within(screen.getByRole('navigation', { name: 'Settings pages' })).getAllByRole('link');
}

/** True once the values read from this device's database (the pets, the sounds) are in their rows. */
function databaseRead(): boolean {
  return ['Detection', 'Alert sounds'].every((name) => {
    const link = screen.queryByRole('link', { name });
    return !!link && descriptionOf(link) !== '';
  });
}

/** Lets the list mount and read the database: its first open takes several turns of the event loop. */
async function settle() {
  for (let turn = 0; turn < 200; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    if (databaseRead()) return;
  }
}

beforeEach(() => {
  mockApiUrl = '';
  localStorage.clear();
  useSettingsStore.getState().resetToDefaults();
  useOnboardingStore.setState({ lostFoundChosen: false, selectedScenario: null });
  useLostFoundStore.setState({ chosenPetId: null });
  delete (window as { Notification?: unknown }).Notification;
});

afterEach(() => {
  jest.useRealTimers();
});

it('lists every settings page in four groups with its value on a device that changed nothing', async () => {
  render(<SettingsList />);
  await settle();
  const links = rows();
  expect(links.map((l) => bare(l.getAttribute('href')))).toEqual([
    '/settings/detection',
    '/settings/sounds',
    '/settings/schedule',
    '/settings/escalation',
    '/settings/notifications',
    '/settings/test-alerts',
    '/settings/zones',
    '/settings/models',
    '/settings/appearance',
    '/settings/data',
  ]);
  expect(screen.getByRole('link', { name: 'Detection' })).toBe(links[0]);
  expect(descriptionOf(links[0])).toBe('Standard, motion 80, sound 80');
  expect(descriptionOf(links[1])).toBe('Volume 100');
  expect(descriptionOf(links[2])).toBe('Off');
  expect(descriptionOf(links[3])).toBe('Wait 30 s, louder after 30 s');
  expect(descriptionOf(links[4])).toBe('Browser notifications off');
  expect(descriptionOf(links[5])).toBe('Play each sound and try an alert');
  expect(descriptionOf(links[6])).toBe('Whole picture');
  expect(descriptionOf(links[8])).toBe('Same as this device');
  expect(descriptionOf(links[9])).toBe('Alerts, pictures, pets, sounds and settings');
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
    'Alerts',
    'Camera picture',
    'This device',
  ]);
  // Each group is a list named by its heading.
  expect(screen.getByRole('list', { name: 'Alerts' })).toBeTruthy();
  expect(screen.queryByText('Your own server')).toBeNull();
});

it('names the pet the next watch looks for', async () => {
  useOnboardingStore.setState({ lostFoundChosen: true });
  const first = render(<SettingsList />);
  await settle();
  // Lost and Found with no pet saved runs as Motion and sound: the row names the setting.
  expect(descriptionOf(rows()[0])).toBe('Standard, motion 80, sound 80');
  first.unmount();

  await saveSubjectProfile(pet('pet-1', 'Mittens', new Date(1000).toISOString()));
  render(<SettingsList />);
  await settle();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(descriptionOf(rows()[0])).toBe('Lost and Found for Mittens, motion 80, sound 80');
});

it('takes the chosen pet, else the newest saved pet, for the next watch', () => {
  const older = pet('pet-1', 'Mittens', new Date(1000).toISOString());
  const newer = pet('pet-2', 'Biscuit', new Date(2000).toISOString());
  const thing = pet('thing-1', 'Keys', new Date(3000).toISOString(), 'other');
  // readSavedPets gives them newest first.
  const saved = [thing, newer, older];
  expect(petForWatch(saved, 'pet-1')?.name).toBe('Mittens');
  expect(petForWatch(saved, null)?.name).toBe('Biscuit');
  expect(petForWatch(saved, 'gone')?.name).toBe('Biscuit');
  expect(petForWatch([], null)).toBeNull();
});

it('follows the browser notifications choice when it changes in this tab', async () => {
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    writable: true,
    value: { permission: 'granted', requestPermission: async () => 'granted' },
  });
  expect(readBrowserNotificationsOn()).toBe(true);
  render(<SettingsList />);
  await settle();
  const notifications = screen.getByRole('link', { name: 'Notifications' });
  expect(descriptionOf(notifications)).toBe('Browser notifications on');
  act(() => {
    writeNotificationChoices({ browserPush: false });
  });
  expect(descriptionOf(screen.getByRole('link', { name: 'Notifications' }))).toBe('Browser notifications off');
  expect(JSON.parse(localStorage.getItem('safeos_notifications_settings') ?? '{}').browserPush).toBe(false);
  expect(readBrowserNotificationsOn()).toBe(false);
});

it('lists Your own server while a server address is saved', async () => {
  mockApiUrl = 'https://watch.example.org';
  const shown = render(<SettingsList />);
  await settle();
  const group = screen.getByRole('list', { name: 'Your own server' });
  const links = within(group).getAllByRole('link');
  expect(links.map((l) => document.getElementById(l.getAttribute('aria-labelledby') ?? '')?.textContent)).toEqual([
    'Server address',
    'Your name on your server',
    'Webhooks',
    'Admin',
  ]);
  expect(links.map((l) => bare(l.getAttribute('href')))).toEqual([
    '/settings/server#address',
    '/settings/server#name',
    '/webhooks',
    '/admin',
  ]);
  expect(descriptionOf(links[0])).toBe('https://watch.example.org');
  shown.unmount();

  mockApiUrl = '';
  render(<SettingsList />);
  await settle();
  expect(screen.queryByRole('list', { name: 'Your own server' })).toBeNull();
  expect(screen.queryByText('Server address')).toBeNull();
});

it('names you on your server by the name this device keeps when the profile holds none', async () => {
  mockApiUrl = 'https://watch.example.org';
  localStorage.setItem('safeos_user_settings', JSON.stringify({ displayName: 'Robin' }));
  render(<SettingsList />);
  await settle();
  expect(descriptionOf(screen.getByRole('link', { name: 'Your name on your server' }))).toBe('Robin');
});

it('reads quiet hours as quiet now inside them', async () => {
  useSettingsStore.getState().updateQuietHoursSettings({ enabled: true, startTime: '22:00', endTime: '07:00', days: [0, 1, 2, 3, 4, 5, 6] });
  jest.useFakeTimers({
    now: new Date(2026, 10, 22, 23, 0, 0),
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'queueMicrotask'],
  });
  const late = render(<SettingsList />);
  await settle();
  expect(descriptionOf(screen.getByRole('link', { name: 'Quiet hours' }))).toBe(`Quiet now, until ${clockTimeOf('07:00')}`);
  late.unmount();

  jest.setSystemTime(new Date(2026, 10, 22, 12, 0, 0));
  render(<SettingsList />);
  await settle();
  expect(descriptionOf(screen.getByRole('link', { name: 'Quiet hours' }))).toBe(
    `${clockTimeOf('22:00')} to ${clockTimeOf('07:00')}, every day`
  );
});

it("holds a loading bar in each value's place before the page has mounted", () => {
  // The served page: React renders the list once with no effect run.
  const { renderToStaticMarkup } = jest.requireActual('react-dom/server.node') as typeof import('react-dom/server');
  const html = renderToStaticMarkup(<SettingsList />);
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
  expect(doc.querySelectorAll('.set-row__loading')).toHaveLength(10);
  expect(doc.querySelectorAll('.set-row__value')).toHaveLength(0);
  for (const words of ['Standard', 'Volume', 'Off', 'Wait', 'Whole picture', 'Browser notifications']) {
    expect(doc.body.textContent).not.toContain(words);
  }
  // Every row is a working link before script runs.
  expect(Array.from(doc.querySelectorAll('nav a')).map((a) => bare(a.getAttribute('href')))).toHaveLength(10);
});

it('wraps a long pet name inside its row', async () => {
  useOnboardingStore.setState({ lostFoundChosen: true });
  await saveSubjectProfile(pet('pet-9', 'Mrwhiskersthethird', new Date(5000).toISOString()));
  useLostFoundStore.setState({ chosenPetId: 'pet-9' });
  render(<SettingsList />);
  await settle();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const detection = screen.getByRole('link', { name: 'Detection' });
  expect(descriptionOf(detection)).toBe('Lost and Found for Mrwhiskersthethird, motion 80, sound 80');
  const value = document.getElementById(detection.getAttribute('aria-describedby') ?? '');
  expect(value?.className).toContain('set-row__value');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', 'settings.css'), 'utf8');
  expect(css).toMatch(/\.set-row__value\s*\{[^}]*overflow-wrap:\s*anywhere/);
  expect(css).toMatch(/\.set-link__words\s*\{[^}]*min-width:\s*0/);
});
