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

// A page is stored under its path with a closing slash and no query, so
// /monitor, /monitor/ and /monitor/?source=shortcut are one stored page.
function storedPage(url) {
  const last = url.pathname.split('/').pop();
  if (last.includes('.')) return url.origin + url.pathname;
  return url.origin + (url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`);
}

// "Clear All Local Data" removes the installed copy while this worker stays
// active, and a worker installs again only for a new build. So a load that
// reaches the network and finds the copy empty stores the build's files again.
// A file that meets a passing error (a 503, a dropped connection) fails the
// whole store, so it is tried again after 2, 8 and 30 seconds while the
// device has a connection; a store that succeeds is not tried again.
const REFILL_WAITS_MS = [2_000, 8_000, 30_000];
let refilling = null;
function refillIfEmpty(cache) {
  if (!refilling) {
    refilling = (async () => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          if ((await cache.keys()).length === 0) {
            await cache.addAll(manifest.urls);
            // This build is the one running: a later build keeps it for its pages.
            await cache.put(TAKEN_OVER, new Response(String(Date.now())));
          }
          return;
        } catch (error) {
          if (attempt >= REFILL_WAITS_MS.length || self.navigator?.onLine === false) throw error;
          await new Promise((resolve) => setTimeout(resolve, REFILL_WAITS_MS[attempt]));
        }
      }
    })().catch(() => {}).finally(() => { refilling = null; });
  }
  return refilling;
}

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
    // The new build takes over once it is stored whole, so a returning visitor
    // gets it on the load after the one that found it, not after closing every
    // tab. A page already open keeps the scripts it loaded; one that then asks
    // for a file the new build replaced reloads once onto it (the app's error
    // page, once for each build).
    await self.skipWaiting();
  })());
});

// When a build's worker took over, kept in that build's own cache, so the next
// build can tell which earlier build ran last.
const TAKEN_OVER = '/__safeos-taken-over';

/** When a stored build's worker took over; 0 for a build stored before the time was kept. */
async function takenOver(name) {
  try {
    const answer = await (await caches.open(name)).match(TAKEN_OVER);
    return answer ? Number(await answer.text()) || 0 : 0;
  } catch {
    return 0;
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const older = names.filter(name => (name.startsWith('safeos-shell-') || /^safeos-v\d+$/.test(name)) && name !== CACHE_NAME);
    // The build that ran last stays, since a page loaded from it may still ask
    // for its own scripts; every build before it goes. A worker with no build
    // list keeps none.
    let kept = null;
    if (!UNBUILT && older.length) {
      const times = await Promise.all(older.map(takenOver));
      kept = older[times.indexOf(Math.max(...times))];
    }
    await Promise.all(older.filter(name => name !== kept).map(name => caches.delete(name)));
    if (!UNBUILT) await (await caches.open(CACHE_NAME)).put(TAKEN_OVER, new Response(String(Date.now())));
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
    // A page is looked up by its path, with the closing slash added and the
    // query left out.
    const cached = await cache.match(request) ||
      (request.mode === 'navigate' ? await cache.match(storedPage(url)) : undefined) ||
      (url.pathname.endsWith('.txt') ? await cache.match(url.origin + url.pathname) : undefined) ||
      // A page loaded from the build before this one may still ask for its own
      // scripts and styles, which this build replaced: that build's files stay
      // until the next build takes over.
      (request.mode !== 'navigate' && url.pathname.startsWith('/_next/') ? await caches.match(request) : undefined);
    if (cached) return cached;
    try {
      const answer = await fetch(request);
      if (request.mode === 'navigate') event.waitUntil(refillIfEmpty(cache));
      return answer;
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
      const sameOriginClients = windowClients.filter(
        (client) => new URL(client.url).origin === self.location.origin
      );
      const client = sameOriginClients.find((candidate) => candidate.url === urlToOpen) || sameOriginClients[0];
      if (client) {
        // Local alerts should not reload a page that may be using a camera.
        if (!event.notification.data?.focusOnly && new URL(urlToOpen, self.location.origin).href !== client.url) {
          return client.navigate(urlToOpen).then(() => client.focus());
        }
        return client.focus();
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
