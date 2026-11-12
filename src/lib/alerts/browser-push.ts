/**
 * Browser Push Notifications
 *
 * Web Push notification service.
 *
 * @module lib/alerts/browser-push
 */

import webpush from 'web-push';
import { resolvePushDestination, pushDestinationAgent } from './push-destination.js';

// =============================================================================
// Types
// =============================================================================

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, any>;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

// =============================================================================
// Setup
// =============================================================================

let vapidConfigured = false;

function setupVapid(): void {
  if (vapidConfigured) return;

  const publicKey = process.env['VAPID_PUBLIC_KEY'];
  const privateKey = process.env['VAPID_PRIVATE_KEY'];
  const email = process.env['VAPID_EMAIL'] || 'mailto:admin@safeos.app';

  if (publicKey && privateKey) {
    webpush.setVapidDetails(email, publicKey, privateKey);
    vapidConfigured = true;
    console.log('VAPID configured for push notifications');
  }
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Send browser push notification
 */
export async function sendBrowserPushNotification(
  subscription: PushSubscription,
  payload: PushPayload
): Promise<void> {
  const destination = await resolvePushDestination(subscription.endpoint);
  setupVapid();

  if (!vapidConfigured) {
    throw new Error('VAPID not configured');
  }

  const pushPayload = JSON.stringify({
    title: payload.title,
    options: {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      data: payload.data,
      actions: payload.actions,
      requireInteraction: true,
      vibrate: [200, 100, 200],
    },
  });

  const agent = pushDestinationAgent(destination);
  try {
    // web-push uses https.request directly and does not follow redirects.
    const response = await webpush.sendNotification(
      { ...subscription, endpoint: destination.url.href }, pushPayload, { agent, timeout: 10000 }
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error('Push service did not accept the notification');
    }
  } finally { agent.destroy(); }
}

/**
 * Subscribe to browser push
 */
export function subscribeBrowserPush(
  subscription: PushSubscription,
  userId: string
): void {
  // Store subscription - would typically go to database
  console.log(`Push subscription registered for user: ${userId}`);
}

/**
 * Check if VAPID is configured
 */
export function isVapidConfigured(): boolean {
  return !!(
    process.env['VAPID_PUBLIC_KEY'] && process.env['VAPID_PRIVATE_KEY']
  );
}

/**
 * Generate VAPID keys (for setup)
 */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}

export default {
  sendBrowserPushNotification,
  subscribeBrowserPush,
  isVapidConfigured,
  generateVapidKeys,
};
