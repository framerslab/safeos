/** @jest-environment jsdom */
/**
 * Send browser notifications
 *
 * The Notifications page's switch, which the list's Notifications row reads,
 * decides whether an alert reaches the browser as a notification. Turned off,
 * a granted browser shows none; on, or never set, it shows them. Driven
 * through the notification manager the watch's alerts go through.
 */

import { writeNotificationChoices } from '@/lib/notification-choices';
import { getNotificationManager } from '@/lib/notification-manager';

const shown: string[] = [];

class StandInNotification {
  static permission = 'granted';
  static requestPermission = async () => 'granted';
  onclick: unknown = null;
  onclose: unknown = null;
  onerror: unknown = null;
  constructor(title: string) {
    shown.push(title);
  }
  close() {}
}

beforeAll(() => {
  Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: StandInNotification });
});

beforeEach(() => {
  shown.length = 0;
  localStorage.clear();
});

it('shows no browser notification for an alert once Send browser notifications is off', async () => {
  writeNotificationChoices({ browserPush: false });
  await getNotificationManager().show('Motion', { body: 'Movement at the front door', tag: 'safeos-motion' });
  expect(shown).toEqual([]);
});

it('shows the browser notification while Send browser notifications is on or was never set', async () => {
  await getNotificationManager().show('Motion', { body: 'Movement at the front door', tag: 'safeos-motion-1' });
  writeNotificationChoices({ browserPush: true });
  await getNotificationManager().show('Sound', { body: 'A sound at the front door', tag: 'safeos-sound-1' });
  expect(shown).toEqual(['Motion', 'Sound']);
});
