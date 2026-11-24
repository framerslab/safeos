import { readBrowserNotificationsOn } from './notification-choices';

/**
 * Prefer persistent notifications, which also work on mobile browsers. Shows
 * nothing while Send browser notifications is off on Notifications, whatever
 * the browser allows. `picture` is asked for as the browser takes the
 * notification, once its service worker is found: nothing then, and the
 * notification goes with its words alone.
 */
export async function showBrowserNotification(
  title: string,
  options: globalThis.NotificationOptions = {},
  picture?: () => string | undefined,
): Promise<Notification | null> {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return null;
  }
  if (!readBrowserNotificationsOn()) return null;
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, {
          ...withPicture(options, picture),
          data: { ...options.data, url: window.location.href, focusOnly: true },
        });
        return null;
      }
    }
    // Desktop fallback for installations without a service worker.
    return new Notification(title, withPicture(options, picture));
  } catch (error) {
    // Notification delivery must never interrupt the in-app alert or overlay.
    console.warn('Could not show browser notification:', error);
    return null;
  }
}

/** The options with the picture as `picture` gives it now; the options as they are without one. */
function withPicture(options: globalThis.NotificationOptions, picture?: () => string | undefined): globalThis.NotificationOptions {
  if (!picture) return options;
  const image = picture();
  return image ? { ...options, image } as globalThis.NotificationOptions : options;
}
