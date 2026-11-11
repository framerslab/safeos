/** Prefer persistent notifications, which also work on mobile browsers. */
export async function showBrowserNotification(
  title: string,
  options: globalThis.NotificationOptions = {}
): Promise<Notification | null> {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return null;
  }
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, {
          ...options,
          data: { ...options.data, url: window.location.href, focusOnly: true },
        });
        return null;
      }
    }
    // Desktop fallback for installations without a service worker.
    return new Notification(title, options);
  } catch (error) {
    // Notification delivery must never interrupt the in-app alert or overlay.
    console.warn('Could not show browser notification:', error);
    return null;
  }
}
