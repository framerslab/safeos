/**
 * SafeOS Guardian Service Worker
 *
 * Enables offline functionality and push notifications.
 */

// The static-export build prepends the complete, content-versioned asset list.
const manifest = self.__SAFEOS_PRECACHE;
// Without that list (next dev, or a build that skipped the postbuild step) the
// worker stores nothing and leaves every request to the network. It takes over
// at once, so a worker an earlier build left on this origin stops serving its
// cached pages.
const UNBUILT = !manifest;
const CACHE_NAME = `safeos-shell-${manifest?.version || 'unbuilt'}`;

self.addEventListener('install', (event) => {
  if (UNBUILT) {
    self.skipWaiting();
    return;
  }
  event.waitUntil((async () => {
    if (!manifest?.urls?.length) throw new Error('Offline asset manifest is missing.');
    const cache = await caches.open(CACHE_NAME);
    // Installation succeeds only when HTML, scripts, styles and lazy chunks exist.
    await cache.addAll(manifest.urls);
  })());
  // Let an existing worker finish serving its build until its tabs close.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => (name.startsWith('safeos-shell-') || /^safeos-v\d+$/.test(name)) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (UNBUILT) return;
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || request.headers.get('Range')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Use this build's files together. Never replace old HTML with new HTML
    // while leaving its scripts behind, and never mix model and page caches.
    // The router asks for route data as index.txt?_rsc=<id>; a static host
    // ignores the query, so the installed file is the same response.
    const cached = await cache.match(request) ||
      (url.pathname.endsWith('.txt') ? await cache.match(url.origin + url.pathname) : undefined);
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch {
      if (request.mode === 'navigate') {
        const fallback = await cache.match('/offline.html');
        if (fallback) return fallback;
      }
      return new Response('Offline', { status: 503 });
    }
  })());
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  let data = { title: 'SafeOS Alert', body: 'You have a new alert' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'safeos-alert',
    renotify: true,
    requireInteraction: data.severity === 'critical' || data.severity === 'high',
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    data: {
      url: data.url || '/history',
      alertId: data.alertId,
      streamId: data.streamId,
    },
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there's already a SafeOS tab open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      // No existing tab, open a new one
      return clients.openWindow(urlToOpen);
    })
  );
});

// Background sync event
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-alerts') {
    event.waitUntil(syncAlerts());
  } else if (event.tag === 'sync-profile') {
    event.waitUntil(syncProfile());
  }
});

// Sync alerts with server
async function syncAlerts() {
  try {
    // Get pending alerts from IndexedDB and sync
    console.log('[SW] Syncing alerts...');
  } catch (error) {
    console.error('[SW] Alert sync failed:', error);
  }
}

// Sync profile with server
async function syncProfile() {
  try {
    console.log('[SW] Syncing profile...');
  } catch (error) {
    console.error('[SW] Profile sync failed:', error);
  }
}

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-status') {
    event.waitUntil(checkSystemStatus());
  }
});

async function checkSystemStatus() {
  try {
    const response = await fetch('/api/status');
    const status = await response.json();
    
    // Show notification if there are pending alerts
    if (status.stats?.pendingAlerts > 0) {
      self.registration.showNotification('SafeOS Alert', {
        body: `You have ${status.stats.pendingAlerts} pending alerts`,
        icon: '/icons/icon-192.png',
        tag: 'pending-alerts',
      });
    }
  } catch (error) {
    console.error('[SW] Status check failed:', error);
  }
}

console.log('[SW] Service worker loaded');
