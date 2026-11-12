/**
 * Sync Service
 *
 * Handles offline data synchronization with the backend.
 * Uses the sync queue from client-db to track pending actions.
 *
 * @module lib/sync-service
 */

import {
  getPendingSyncActions,
  removeSyncAction,
  markSyncActionFailed,
  queueSyncAction,
  cacheAlert,
  cacheStream,
} from './client-db';
import { isStaticMode, getApiUrl } from './env';

// =============================================================================
// Configuration
// =============================================================================

const MAX_RETRIES = 5;
const SYNC_INTERVAL_MS = 30000; // 30 seconds
const RETRY_DELAYS = [1000, 5000, 15000, 30000, 60000]; // Progressive backoff

// =============================================================================
// State
// =============================================================================

let syncInterval: NodeJS.Timeout | null = null;
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let isSyncing = false;
let isInitialized = false;

// =============================================================================
// Event Handlers (named for proper cleanup)
// =============================================================================

function handleOnline(): void {
  console.log('[Sync] Back online');
  isOnline = true;
  syncPendingActions();
}

function handleOffline(): void {
  console.log('[Sync] Went offline');
  isOnline = false;
}

// =============================================================================
// Initialization & Cleanup
// =============================================================================

/**
 * Initialize sync service - call once on app mount
 */
export function initSyncService(): void {
  if (isInitialized || typeof window === 'undefined') return;

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  isInitialized = true;

  console.log('[Sync] Service initialized');
}

/**
 * Cleanup sync service - call on app unmount
 */
export function cleanupSyncService(): void {
  if (!isInitialized || typeof window === 'undefined') return;

  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  stopPeriodicSync();
  isInitialized = false;

  console.log('[Sync] Service cleaned up');
}

// =============================================================================
// Main Sync Function
// =============================================================================

/**
 * Process all pending sync actions
 */
export async function syncPendingActions(): Promise<{
  synced: number;
  failed: number;
  pending: number;
}> {
  const apiUrl = getApiUrl();

  // Skip sync in static mode (GitHub Pages deployment)
  if (isStaticMode() || !apiUrl) {
    return { synced: 0, failed: 0, pending: 0 };
  }

  if (!isOnline || isSyncing) {
    return { synced: 0, failed: 0, pending: 0 };
  }

  isSyncing = true;
  let synced = 0;
  let failed = 0;

  try {
    const actions = await getPendingSyncActions();

    for (const action of actions) {
      // Skip if max retries exceeded
      if (action.retries >= MAX_RETRIES) {
        console.warn(`[Sync] Max retries exceeded for action ${action.id}`);
        await removeSyncAction(action.id);
        failed++;
        continue;
      }

      try {
        const response = await fetch(`${apiUrl}${action.endpoint}`, {
          method: action.method,
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': getSessionToken(),
          },
          body: action.body ? JSON.stringify(action.body) : undefined,
        });

        if (response.ok) {
          await removeSyncAction(action.id);
          synced++;

          // Handle response data (cache updates from server)
          try {
            const data = await response.json();
            await handleSyncResponse(action.action, data);
          } catch {
            // No response body
          }
        } else {
          const errorText = await response.text();
          await markSyncActionFailed(action.id, `${response.status}: ${errorText}`);
          failed++;
        }
      } catch (error) {
        await markSyncActionFailed(action.id, String(error));
        failed++;
      }
    }

    const pending = (await getPendingSyncActions()).length;

    return { synced, failed, pending };
  } finally {
    isSyncing = false;
  }
}

// =============================================================================
// Handle Sync Responses
// =============================================================================

async function handleSyncResponse(action: string, data: any): Promise<void> {
  if (action === 'acknowledge_alert') {
    const alert = data?.alert || data?.data;
    if (alert) await cacheAlert({
      ...alert,
      streamId: alert.streamId ?? alert.stream_id,
      alertType: alert.alertType ?? alert.alert_type,
      acknowledged: Boolean(alert.acknowledged),
      acknowledgedAt: alert.acknowledgedAt ?? alert.acknowledged_at,
      createdAt: alert.createdAt ?? alert.created_at,
    });
    return;
  }
  if (!data?.data) return;

  switch (action) {
    case 'create_stream':
    case 'update_stream':
      await cacheStream(data.data);
      break;

  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function getSessionToken(): string {
  if (typeof localStorage === 'undefined') return '';
  
  try {
    const stored = localStorage.getItem('safeos-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.state?.sessionToken || '';
    }
  } catch {
    // Ignore
  }
  
  return '';
}

// =============================================================================
// Queue Actions
// =============================================================================

/**
 * Queue a stream creation for sync
 */
export async function queueCreateStream(stream: any): Promise<void> {
  await queueSyncAction({
    action: 'create_stream',
    endpoint: '/api/streams',
    method: 'POST',
    body: stream,
  });
}

/**
 * Queue a stream update for sync
 */
export async function queueUpdateStream(streamId: string, updates: any): Promise<void> {
  await queueSyncAction({
    action: 'update_stream',
    endpoint: `/api/streams/${streamId}`,
    method: 'PATCH',
    body: updates,
  });
}

/**
 * Queue an alert acknowledgment for sync
 */
export async function queueAcknowledgeAlert(alertId: string): Promise<void> {
  await queueSyncAction({
    action: 'acknowledge_alert',
    endpoint: `/api/alerts/${alertId}/acknowledge`,
    method: 'POST',
    body: {},
  });
}

/**
 * Queue a profile update for sync
 */
export async function queueUpdateProfile(updates: any): Promise<void> {
  await queueSyncAction({
    action: 'update_profile',
    endpoint: '/api/auth/profile',
    method: 'PATCH',
    body: updates,
  });
}

// =============================================================================
// Sync Control
// =============================================================================

/**
 * Start periodic sync
 */
export function startPeriodicSync(): void {
  if (syncInterval) return;

  console.log('[Sync] Starting periodic sync');

  // Initial sync
  syncPendingActions();

  // Set up interval
  syncInterval = setInterval(() => {
    if (isOnline) {
      syncPendingActions();
    }
  }, SYNC_INTERVAL_MS);
}

/**
 * Stop periodic sync
 */
export function stopPeriodicSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[Sync] Stopped periodic sync');
  }
}

/**
 * Check if online
 */
export function isOnlineStatus(): boolean {
  return isOnline;
}

/**
 * Force sync now
 */
export async function forceSyncNow(): Promise<{
  synced: number;
  failed: number;
  pending: number;
}> {
  return syncPendingActions();
}



























