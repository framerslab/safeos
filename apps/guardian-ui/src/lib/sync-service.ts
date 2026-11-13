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
  keepSyncResponse,
  queueSyncAction,
  updateCachedAlert,
  cacheStream,
} from './client-db';
import { isStaticMode, getApiUrl } from './env';

// =============================================================================
// Configuration
// =============================================================================

const MAX_RETRIES = 5;
const SYNC_INTERVAL_MS = 30000; // 30 seconds
const RETRY_DELAYS = [1000, 5000, 15000, 30000, 60000]; // Progressive backoff
/** The error kept on an action the server confirmed and the browser could not save. */
const UNSAVED_RESPONSE = 'The server confirmed the change, and the browser could not save it';

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
  if (isSyncing) {
    return { synced: 0, failed: 0, pending: 0 };
  }

  isSyncing = true;
  let synced = 0;
  let failed = 0;

  try {
    const actions = await getPendingSyncActions();

    // The server confirmed these actions and the browser could not save their answers. A kept answer
    // needs no server: it is applied even offline, the action is not sent again, and the retry
    // limit does not drop it.
    for (const action of actions) {
      if (action.response === undefined) continue;
      let applied = false;
      try {
        applied = await handleSyncResponse(action.action, action.response);
      } catch {
        // The action stays queued with its answer.
      }
      if (applied) {
        await removeSyncAction(action.id);
        synced++;
      } else {
        failed++;
      }
    }

    const apiUrl = getApiUrl();

    // Nothing is sent in static mode (GitHub Pages deployment) or while offline.
    if (isStaticMode() || !apiUrl || !isOnline) {
      return { synced, failed, pending: 0 };
    }

    for (const action of actions) {
      // Applied above.
      if (action.response !== undefined) continue;

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
          // The server's answer is applied to the browser's records before the action leaves the queue.
          let applied = true;
          let data: unknown;
          try {
            data = await response.json();
            applied = await handleSyncResponse(action.action, data);
          } catch {
            // No response body
          }

          if (applied) {
            await removeSyncAction(action.id);
            synced++;
          } else {
            // The browser could not save the confirmed change: the answer is kept on the action, which
            // is not sent again and counts no failed try. If the queue refuses that too, the action
            // stays as it was.
            await keepSyncResponse(action.id, data, UNSAVED_RESPONSE);
            failed++;
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

/**
 * Applies the server's answer to the browser's records. False means the alert update failed, and
 * the action stays queued with its answer; true means it may leave the queue.
 */
async function handleSyncResponse(action: string, data: any): Promise<boolean> {
  if (action === 'acknowledge_alert') {
    const alert = data?.alert || data?.data;
    if (!alert) return true;
    const result = await updateCachedAlert({
      ...alert,
      streamId: alert.streamId ?? alert.stream_id,
      alertType: alert.alertType ?? alert.alert_type,
      thumbnailUrl: alert.thumbnailUrl ?? alert.thumbnail_url,
      acknowledged: Boolean(alert.acknowledged),
      acknowledgedAt: alert.acknowledgedAt ?? alert.acknowledged_at,
      createdAt: alert.createdAt ?? alert.created_at,
    });
    return result !== 'failed';
  }
  if (!data?.data) return true;

  switch (action) {
    case 'create_stream':
    case 'update_stream':
      await cacheStream(data.data);
      break;

  }
  return true;
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

  // Set up interval. Offline, a pass applies only the answers the server already gave.
  syncInterval = setInterval(() => {
    syncPendingActions();
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



























