/**
 * SafeOS Guardian Service Worker
 *
 * Enables offline functionality and push notifications.
 */

const CACHE_NAME = 'safeos-v2';
const STATIC_ASSETS = [
  '/',
  '/monitor/',
  '/setup/',
  '/settings/',
  '/history/',
  '/profiles/',
  '/tutorial/',
  '/tutorials/',
  '/faq/',
  '/help/',
  '/lost-found/',
  '/security/',
  '/wildlife/',
  '/manifest.json',
  '/offline.html',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API requests (they should always be fresh)
  if (url.pathname.startsWith('/api/')) return;

  // Skip WebSocket connections
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // Skip range requests (partial content - cannot be cached)
  if (request.headers.get('Range')) return;

  // Skip media files that might trigger range requests
  const ext = url.pathname.split('.').pop()?.toLowerCase();
  if (['mp4', 'webm', 'mp3', 'wav', 'ogg', 'avi', 'mov'].includes(ext)) return;
  
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version, but update cache in background
        event.waitUntil(
          fetch(request).then((networkResponse) => {
            // Only cache full responses (status 200), not partial (206)
            if (networkResponse.ok && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse);
              });
            }
          }).catch(() => {
            // Network failed, that's okay - we have the cache
          })
        );
        return cachedResponse;
      }

      // Not in cache, fetch from network
      return fetch(request).then((networkResponse) => {
        // Cache successful full responses only (not partial 206)
        if (networkResponse.ok && networkResponse.status === 200 && url.origin === location.origin) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Network failed and not in cache - show offline page
        if (request.mode === 'navigate') {
          return caches.match('/offline.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
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




























