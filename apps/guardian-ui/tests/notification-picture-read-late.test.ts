/** @jest-environment jsdom */
/**
 * The picture of an alert's notification, read as the browser takes it
 *
 * An alert's notification asks for its picture once the browser has found
 * the service worker that shows it. Show the picture in alert notifications
 * turned off while the browser looks sends the notification with its words
 * alone; left on, the picture goes with it.
 */

import { getNotificationManager } from '@/lib/notification-manager';

class StandInNotification {
  static permission = 'granted';
  static requestPermission = async () => 'granted';
}

const showNotification = jest.fn(async (_title: string, _options: NotificationOptions & { image?: string }) => {});
// The browser's search for its service worker answers when the test says so.
let found: ((registration: { showNotification: typeof showNotification }) => void) | null = null;

beforeAll(() => {
  Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: StandInNotification });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: () => new Promise((resolve) => { found = resolve; }) },
  });
});

beforeEach(() => {
  localStorage.clear();
  showNotification.mockClear();
  found = null;
});

const PICTURE = 'data:image/jpeg;base64,picture';

async function notify(pictureOn: { on: boolean }, whileTheBrowserLooks: () => void) {
  const showing = getNotificationManager().show('Motion alert', {
    body: 'Motion at 21:42:40',
    tag: 'safeos-motion-alert-1',
    image: () => (pictureOn.on ? PICTURE : undefined),
  });
  expect(found).not.toBeNull();
  whileTheBrowserLooks();
  found!({ showNotification });
  await showing;
  expect(showNotification).toHaveBeenCalledTimes(1);
  return showNotification.mock.calls[0][1];
}

it('sends the picture with the notification while the switch stays on', async () => {
  const options = await notify({ on: true }, () => {});
  expect(options.image).toBe(PICTURE);
  expect(options.body).toBe('Motion at 21:42:40');
});

it('sends the words alone when the switch is turned off while the browser finds its service worker', async () => {
  const picture = { on: true };
  const options = await notify(picture, () => { picture.on = false; });
  expect(options.image).toBeUndefined();
  expect(options.body).toBe('Motion at 21:42:40');
});
