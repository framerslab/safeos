/**
 * Client-Side Database
 *
 * Uses idb (IndexedDB wrapper) for browser-native offline-first data persistence.
 * This is a pure browser implementation with no Node.js dependencies.
 *
 * @module lib/client-db
 */

import { getLocalDataGeneration, isCurrentLocalData } from './local-data-generation';
import { openDB, type DBSchema, type IDBPDatabase, type IDBPObjectStore } from 'idb';

// =============================================================================
// Database Schema
// =============================================================================

interface SafeOSDB extends DBSchema {
  local_session: {
    key: string;
    value: {
      id: string;
      token: string;
      deviceId: string | null;
      profile: any;
      createdAt: string;
      expiresAt: string;
      syncedAt: string | null;
    };
  };
  profile_cache: {
    key: string;
    value: {
      id: string;
      displayName: string;
      avatarUrl: string | null;
      preferences: any;
      notificationSettings: any;
      updatedAt: string;
    };
  };
  stream_cache: {
    key: string;
    value: {
      id: string;
      name: string;
      scenario: string;
      status: string;
      preferences: any;
      createdAt: string;
      updatedAt: string;
      syncedAt: string;
    };
    indexes: { 'by-created': string };
  };
  alert_cache: {
    key: string;
    value: {
      id: string;
      monitoring?: boolean;
      ownerId?: string;
      cacheOwner: string;
      alertType?: string;
      thumbnailUrl?: string;
      timestamp?: string;
      streamId: string;
      severity: string;
      message: string;
      description: string;
      acknowledged: boolean;
      acknowledgedAt: string | null;
      createdAt: string;
      syncedAt: string;
    };
    indexes: { 'by-stream': string; 'by-created': string; 'by-owner-created': [string, string] };
  };
  frame_cache: {
    key: string;
    value: {
      id: string;
      streamId: string;
      frameData: string;
      motionScore: number;
      audioLevel: number;
      analyzed: boolean;
      createdAt: string;
    };
    indexes: { 'by-stream': string; 'by-created': string };
  };
  sync_queue: {
    key: string;
    value: {
      id: string;
      action: string;
      endpoint: string;
      method: string;
      body: any;
      createdAt: string;
      retries: number;
      lastError: string | null;
    };
    indexes: { 'by-created': string };
  };
  settings_cache: {
    key: string;
    value: {
      key: string;
      value: any;
      updatedAt: string;
    };
  };
  consent_log: {
    key: string;
    value: {
      id: string;
      consentType: string;
      accepted: boolean;
      version: string;
      userAgent: string | null;
      createdAt: string;
    };
    indexes: { 'by-type': string };
  };
  // Lost & Found stores
  subject_profile: {
    key: string;
    value: {
      id: string;
      name: string;
      type: 'pet' | 'person' | 'other';
      description: string;
      fingerprint: any;
      referenceImages: string[];
      createdAt: string;
      lastActiveAt: string | null;
      matchCount: number;
    };
    indexes: { 'by-type': string; 'by-created': string };
  };
  match_frame: {
    key: string;
    value: {
      id: string;
      subjectId: string;
      frameData: string;
      thumbnailData: string;
      confidence: number;
      timestamp: number;
      details: {
        colorMatch: number;
        dominantMatch: number;
        edgeMatch: number;
        sizeMatch: number;
      };
      region: {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null;
      acknowledged: boolean;
      notes: string;
      exported: boolean;
    };
    indexes: { 'by-subject': string; 'by-timestamp': number; 'by-confidence': number };
  };
  // Security/Intrusion detection stores
  intrusion_frame: {
    key: string;
    value: {
      id: string;
      frameData: string;
      thumbnailData: string;
      timestamp: number;
      personCount: number;
      allowedCount: number;
      detections: Array<{
        bbox: [number, number, number, number];
        confidence: number;
      }>;
      acknowledged: boolean;
      notes: string;
      exported: boolean;
    };
    indexes: { 'by-timestamp': number; 'by-personCount': number };
  };
  // Custom media for Lost & Found alerts
  custom_media: {
    key: string;
    value: {
      id: string;
      subjectId: string; // Links to subject_profile
      type: 'image' | 'audio';
      name: string;
      data: string; // base64
      mimeType: string;
      width?: number;
      height?: number;
      durationMs?: number;
      uploadedAt: number;
      order: number;
    };
    indexes: { 'by-subject': string; 'by-type': string; 'by-order': number };
  };
  // Animal detection history
  animal_detection: {
    key: string;
    value: {
      id: string;
      type: string;
      displayName: string;
      sizeCategory: 'small' | 'medium' | 'large';
      dangerLevel: 'none' | 'low' | 'medium' | 'high' | 'extreme';
      confidence: number;
      bbox: [number, number, number, number];
      timestamp: number;
      frameData?: string;
      acknowledged: boolean;
      notes: string;
    };
    indexes: { 'by-timestamp': number; 'by-type': string; 'by-danger': string };
  };
}

// =============================================================================
// Configuration
// =============================================================================

const DB_NAME = 'safeos-guardian';
const DB_VERSION = 5; // Add ownership and creation time to the alert index

const FRAME_BUFFER_MINUTES = 5;
const MAX_CACHED_ALERTS = 500;
export const MAX_MONITORING_ALERTS = 100;
export const ALERT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_MATCH_FRAMES = 500;

// =============================================================================
// Database Instance
// =============================================================================

let dbPromise: Promise<IDBPDatabase<SafeOSDB>> | null = null;

function getDB(): Promise<IDBPDatabase<SafeOSDB>> {
  if (typeof window === 'undefined') {
    // SSR - return a mock that does nothing
    return Promise.reject(new Error('IndexedDB not available on server'));
  }

  if (!dbPromise) {
    dbPromise = openDB<SafeOSDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        // Create stores
        if (!db.objectStoreNames.contains('local_session')) {
          db.createObjectStore('local_session', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('profile_cache')) {
          db.createObjectStore('profile_cache', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('stream_cache')) {
          const streamStore = db.createObjectStore('stream_cache', { keyPath: 'id' });
          streamStore.createIndex('by-created', 'createdAt');
        }

        if (!db.objectStoreNames.contains('alert_cache')) {
          const alertStore = db.createObjectStore('alert_cache', { keyPath: 'id' });
          alertStore.createIndex('by-stream', 'streamId');
          alertStore.createIndex('by-created', 'createdAt');
        }

        const alerts = transaction.objectStore('alert_cache');
        if (!alerts.indexNames.contains('by-owner-created')) {
          alerts.createIndex('by-owner-created', ['cacheOwner', 'createdAt']);
        }

        if (!db.objectStoreNames.contains('frame_cache')) {
          const frameStore = db.createObjectStore('frame_cache', { keyPath: 'id' });
          frameStore.createIndex('by-stream', 'streamId');
          frameStore.createIndex('by-created', 'createdAt');
        }

        if (!db.objectStoreNames.contains('sync_queue')) {
          const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
          syncStore.createIndex('by-created', 'createdAt');
        }

        if (!db.objectStoreNames.contains('settings_cache')) {
          db.createObjectStore('settings_cache', { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains('consent_log')) {
          const consentStore = db.createObjectStore('consent_log', { keyPath: 'id' });
          consentStore.createIndex('by-type', 'consentType');
        }

        // Lost & Found stores (added in v2)
        if (!db.objectStoreNames.contains('subject_profile')) {
          const subjectStore = db.createObjectStore('subject_profile', { keyPath: 'id' });
          subjectStore.createIndex('by-type', 'type');
          subjectStore.createIndex('by-created', 'createdAt');
        }

        if (!db.objectStoreNames.contains('match_frame')) {
          const matchStore = db.createObjectStore('match_frame', { keyPath: 'id' });
          matchStore.createIndex('by-subject', 'subjectId');
          matchStore.createIndex('by-timestamp', 'timestamp');
          matchStore.createIndex('by-confidence', 'confidence');
        }

        // Security/Intrusion detection stores (added in v3)
        if (!db.objectStoreNames.contains('intrusion_frame')) {
          const intrusionStore = db.createObjectStore('intrusion_frame', { keyPath: 'id' });
          intrusionStore.createIndex('by-timestamp', 'timestamp');
          intrusionStore.createIndex('by-personCount', 'personCount');
        }
        
        // Version 4: Custom media and animal detection
        if (!db.objectStoreNames.contains('custom_media')) {
          const mediaStore = db.createObjectStore('custom_media', { keyPath: 'id' });
          mediaStore.createIndex('by-subject', 'subjectId');
          mediaStore.createIndex('by-type', 'type');
          mediaStore.createIndex('by-order', 'order');
        }
        
        if (!db.objectStoreNames.contains('animal_detection')) {
          const animalStore = db.createObjectStore('animal_detection', { keyPath: 'id' });
          animalStore.createIndex('by-timestamp', 'timestamp');
          animalStore.createIndex('by-type', 'type');
          animalStore.createIndex('by-danger', 'dangerLevel');
        }

        if (oldVersion < 5) {
          let cursor = await alerts.openCursor();
          while (cursor) {
            const record = cursor.value;
            const rawDate = record.createdAt || record.syncedAt || new Date().toISOString();
            const timestamp = typeof rawDate === 'string' ? Date.parse(rawDate) : NaN;
            if (!Number.isFinite(timestamp)) {
              await cursor.delete();
            } else {
              await cursor.update({
                ...record,
                createdAt: new Date(Math.min(timestamp, Date.now())).toISOString(),
                cacheOwner: alertOwner(record),
              });
            }
            cursor = await cursor.continue();
          }
        }
      },
    }).then(async db => {
      const tx = db.transaction('alert_cache', 'readwrite');
      await pruneAllAlerts(tx.store);
      await tx.done;
      return db;
    });
  }

  return dbPromise;
}

// =============================================================================
// Cleanup Functions
// =============================================================================

async function cleanupOldFrames(): Promise<void> {
  try {
    const db = await getDB();
    const cutoff = new Date(Date.now() - FRAME_BUFFER_MINUTES * 60 * 1000).toISOString();

    const tx = db.transaction('frame_cache', 'readwrite');
    const index = tx.store.index('by-created');

    let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    await tx.done;
  } catch {
    // Ignore cleanup errors
  }
}

type AlertStore = IDBPObjectStore<SafeOSDB, ['alert_cache'], 'alert_cache', 'readwrite'>;

function alertOwner(alert: { monitoring?: boolean; ownerId?: string }): string {
  return alert.monitoring === true ? `monitoring:${alert.ownerId || ''}` : 'shared';
}

function ownerRange(owner: string): IDBKeyRange {
  return IDBKeyRange.bound([owner], [owner, []]);
}

/** Retain an owner's newest records without materializing the store. */
async function pruneOwnerAlerts(store: AlertStore, owner: string): Promise<void> {
  const index = store.index('by-owner-created');
  const cutoff = new Date(Date.now() - ALERT_MAX_AGE_MS).toISOString();
  let expired = await index.openCursor(IDBKeyRange.bound([owner], [owner, cutoff], false, true));
  while (expired) {
    await expired.delete();
    expired = await expired.continue();
  }
  const range = ownerRange(owner);
  const maximum = owner === 'shared' ? MAX_CACHED_ALERTS : MAX_MONITORING_ALERTS;
  let excess = (await index.count(range)) - maximum;
  let cursor = excess > 0 ? await index.openCursor(range) : null;
  while (cursor && excess-- > 0) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
}

/** Apply the overall age and count bounds in the same transaction as a write. */
async function pruneGlobalAlerts(store: AlertStore): Promise<void> {
  const index = store.index('by-created');
  const cutoff = new Date(Date.now() - ALERT_MAX_AGE_MS).toISOString();
  let expired = await index.openCursor(IDBKeyRange.upperBound(cutoff, true));
  while (expired) {
    await expired.delete();
    expired = await expired.continue();
  }
  let excess = (await store.count()) - MAX_CACHED_ALERTS;
  let cursor = excess > 0 ? await index.openCursor() : null;
  while (cursor && excess-- > 0) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
}

/** Opening also brings legacy records within every owner's bound. */
async function pruneAllAlerts(store: AlertStore): Promise<void> {
  const counts = new Map<string, number>();
  const cutoff = Date.now() - ALERT_MAX_AGE_MS;
  let cursor = await store.index('by-created').openCursor(null, 'prev');
  while (cursor) {
    const record = cursor.value;
    const createdAt = Date.parse(record.createdAt);
    if (!Number.isFinite(createdAt) || createdAt < cutoff) {
      await cursor.delete();
    } else {
      const owner = alertOwner(record);
      const count = (counts.get(owner) || 0) + 1;
      counts.set(owner, count);
      if (record.monitoring && count > MAX_MONITORING_ALERTS) await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await pruneGlobalAlerts(store);
}

export async function cleanupCaches(): Promise<void> {
  await cleanupOldFrames();
  try {
    const db = await getDB();
    const tx = db.transaction('alert_cache', 'readwrite');
    await pruneAllAlerts(tx.store);
    await tx.done;
  } catch {
    // Ignore cleanup errors
  }
}

// =============================================================================
// Session Management
// =============================================================================

export interface LocalSession {
  id: string;
  token: string;
  deviceId: string | null;
  profile: any;
  createdAt: string;
  expiresAt: string;
  syncedAt: string | null;
}

export async function saveLocalSession(session: LocalSession): Promise<void> {
  try {
    const db = await getDB();
    await db.put('local_session', session);
  } catch (error) {
    console.warn('[ClientDB] Failed to save session:', error);
  }
}

export async function getLocalSession(): Promise<LocalSession | null> {
  try {
    const db = await getDB();
    const sessions = await db.getAll('local_session');

    const now = new Date().toISOString();
    const validSession = sessions.find(s => s.expiresAt > now);

    return validSession || null;
  } catch (error) {
    console.warn('[ClientDB] Failed to get session:', error);
    return null;
  }
}

export async function clearLocalSession(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear('local_session');
  } catch {
    // Ignore
  }
}

// =============================================================================
// Profile Cache
// =============================================================================

export async function cacheProfile(profile: any): Promise<void> {
  try {
    const db = await getDB();
    await db.put('profile_cache', {
      id: profile.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      preferences: profile.preferences || {},
      notificationSettings: profile.notificationSettings || {},
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[ClientDB] Failed to cache profile:', error);
  }
}

export async function getCachedProfile(id: string): Promise<any | null> {
  try {
    const db = await getDB();
    const profile = await db.get('profile_cache', id);
    return profile || null;
  } catch {
    return null;
  }
}

// =============================================================================
// Stream Cache
// =============================================================================

export async function cacheStream(stream: any): Promise<void> {
  try {
    const db = await getDB();
    await db.put('stream_cache', {
      id: stream.id,
      name: stream.name,
      scenario: stream.scenario,
      status: stream.status,
      preferences: stream.preferences || {},
      createdAt: stream.createdAt,
      updatedAt: stream.updatedAt || new Date().toISOString(),
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[ClientDB] Failed to cache stream:', error);
  }
}

export async function getCachedStreams(): Promise<any[]> {
  try {
    const db = await getDB();
    return await db.getAll('stream_cache');
  } catch {
    return [];
  }
}

// =============================================================================
// Alert Cache
// =============================================================================

export async function cacheAlert(alert: any): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('alert_cache', 'readwrite');
    const previous = await tx.store.get(alert.id);
    // Partial acknowledgement responses do not carry browser ownership or media.
    // An explicit change of owner must not copy the previous owner's metadata.
    const sameOwner = alert.monitoring === undefined || alertOwner(alert) === alertOwner(previous || {});
    alert = {
      ...(sameOwner ? previous : {}),
      ...Object.fromEntries(Object.entries(alert).filter(([, value]) => value !== undefined)),
    };
    const createdAt = new Date(Math.min(new Date(alert.createdAt || alert.timestamp || Date.now()).getTime(), Date.now())).toISOString();
    const cacheOwner = alertOwner(alert);
    await tx.store.put({
      id: alert.id,
      monitoring: alert.monitoring === true,
      ownerId: alert.monitoring === true ? alert.ownerId || '' : undefined,
      cacheOwner,
      alertType: alert.alertType,
      thumbnailUrl: alert.thumbnailUrl,
      timestamp: alert.timestamp,
      streamId: alert.streamId,
      severity: alert.severity,
      message: alert.message,
      description: alert.description,
      acknowledged: Boolean(alert.acknowledged),
      acknowledgedAt: alert.acknowledgedAt,
      createdAt,
      syncedAt: new Date().toISOString(),
    });
    await pruneOwnerAlerts(tx.store, cacheOwner);
    await pruneGlobalAlerts(tx.store);
    await tx.done;
  } catch (error) {
    console.warn('[ClientDB] Failed to cache alert:', error);
  }
}

/** Shared history plus the explicitly selected owner's monitoring records. */
export async function getCachedAlerts(streamId?: string, ownerId = ''): Promise<any[]> {
  try {
    const db = await getDB();
    const tx = db.transaction('alert_cache', 'readwrite');
    await pruneGlobalAlerts(tx.store);
    const alerts: SafeOSDB['alert_cache']['value'][] = [];
    const maximum = streamId ? MAX_CACHED_ALERTS : MAX_MONITORING_ALERTS;
    for (const owner of ['shared', alertOwner({ monitoring: true, ownerId })]) {
      await pruneOwnerAlerts(tx.store, owner);
      let cursor = await tx.store.index('by-owner-created').openCursor(ownerRange(owner), 'prev');
      let count = 0;
      while (cursor && count < maximum) {
        if (!streamId || cursor.value.streamId === streamId) {
          alerts.push(cursor.value);
          count++;
        }
        cursor = await cursor.continue();
      }
    }
    await tx.done;
    return alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, maximum);
  } catch {
    return [];
  }
}

/** Unowned legacy history stays local; accounts read only their own index range. */
export async function getCachedMonitoringAlerts(ownerId = ''): Promise<any[]> {
  try {
    const db = await getDB();
    const owner = alertOwner({ monitoring: true, ownerId });
    const tx = db.transaction('alert_cache', 'readwrite');
    await pruneGlobalAlerts(tx.store);
    await pruneOwnerAlerts(tx.store, owner);
    const alerts: SafeOSDB['alert_cache']['value'][] = [];
    let cursor = await tx.store.index('by-owner-created').openCursor(ownerRange(owner), 'prev');
    while (cursor && alerts.length < MAX_MONITORING_ALERTS) {
      alerts.push(cursor.value);
      cursor = await cursor.continue();
    }
    await tx.done;
    return alerts;
  } catch {
    return [];
  }
}

export async function deleteCachedMonitoringAlert(id: string, ownerId = ''): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('alert_cache', 'readwrite');
  const alert = await tx.store.get(id);
  if (alert?.monitoring && (alert.ownerId || '') === ownerId) await tx.store.delete(id);
  await tx.done;
}

export async function clearCachedMonitoringAlerts(ownerId = ''): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('alert_cache', 'readwrite');
  const owner = alertOwner({ monitoring: true, ownerId });
  let cursor = await tx.store.index('by-owner-created').openCursor(ownerRange(owner));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// =============================================================================
// Offline Sync Queue
// =============================================================================

export interface SyncAction {
  id: string;
  action: string;
  endpoint: string;
  method: string;
  body: any;
  createdAt: string;
  retries: number;
  lastError: string | null;
}

export async function queueSyncAction(
  action: Omit<SyncAction, 'id' | 'createdAt' | 'retries' | 'lastError'>
): Promise<void> {
  try {
    const db = await getDB();
    const id = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    await db.put('sync_queue', {
      id,
      action: action.action,
      endpoint: action.endpoint,
      method: action.method,
      body: action.body,
      createdAt: new Date().toISOString(),
      retries: 0,
      lastError: null,
    });
  } catch (error) {
    console.warn('[ClientDB] Failed to queue sync action:', error);
  }
}

export async function getPendingSyncActions(): Promise<SyncAction[]> {
  try {
    const db = await getDB();
    return await db.getAllFromIndex('sync_queue', 'by-created');
  } catch {
    return [];
  }
}

export async function removeSyncAction(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('sync_queue', id);
  } catch {
    // Ignore
  }
}

export async function markSyncActionFailed(id: string, error: string): Promise<void> {
  try {
    const db = await getDB();
    const action = await db.get('sync_queue', id);
    if (action) {
      action.retries++;
      action.lastError = error;
      await db.put('sync_queue', action);
    }
  } catch {
    // Ignore
  }
}

// =============================================================================
// Settings
// =============================================================================

export async function saveSetting(key: string, value: any): Promise<void> {
  try {
    const db = await getDB();
    await db.put('settings_cache', {
      key,
      value,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[ClientDB] Failed to save setting:', error);
  }
}

export async function getSetting<T>(key: string): Promise<T | null> {
  try {
    const db = await getDB();
    const setting = await db.get('settings_cache', key);
    return setting?.value as T || null;
  } catch {
    return null;
  }
}

// =============================================================================
// Consent Tracking
// =============================================================================

export async function logConsent(type: string, accepted: boolean, version: string): Promise<void> {
  try {
    const db = await getDB();
    const id = `consent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    await db.put('consent_log', {
      id,
      consentType: type,
      accepted,
      version,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[ClientDB] Failed to log consent:', error);
  }
}

export async function hasAcceptedConsent(type: string): Promise<boolean> {
  try {
    const db = await getDB();
    const consents = await db.getAllFromIndex('consent_log', 'by-type', type);

    if (consents.length === 0) return false;

    // Get the most recent consent
    const sorted = consents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sorted[0]?.accepted || false;
  } catch {
    return false;
  }
}

// =============================================================================
// Storage Stats
// =============================================================================

export async function getStorageStats(): Promise<{
  frames: number;
  alerts: number;
  syncPending: number;
  subjects: number;
  matchFrames: number;
}> {
  try {
    const db = await getDB();

    const [frames, alerts, sync, subjects, matchFrames] = await Promise.all([
      db.count('frame_cache'),
      db.count('alert_cache'),
      db.count('sync_queue'),
      db.count('subject_profile'),
      db.count('match_frame'),
    ]);

    return { frames, alerts, syncPending: sync, subjects, matchFrames };
  } catch {
    return { frames: 0, alerts: 0, syncPending: 0, subjects: 0, matchFrames: 0 };
  }
}

// =============================================================================
// Lost & Found: Subject Profiles
// =============================================================================

export interface SubjectProfileDB {
  id: string;
  name: string;
  type: 'pet' | 'person' | 'other';
  description: string;
  fingerprint: any;
  referenceImages: string[];
  createdAt: string;
  lastActiveAt: string | null;
  matchCount: number;
}

export async function saveSubjectProfile(profile: SubjectProfileDB): Promise<void> {
  try {
    const db = await getDB();
    await db.put('subject_profile', profile);
  } catch (error) {
    console.warn('[ClientDB] Failed to save subject profile:', error);
  }
}

export async function getSubjectProfile(id: string): Promise<SubjectProfileDB | null> {
  try {
    const db = await getDB();
    const profile = await db.get('subject_profile', id);
    return profile || null;
  } catch {
    return null;
  }
}

export async function getAllSubjectProfiles(): Promise<SubjectProfileDB[]> {
  try {
    const db = await getDB();
    const profiles = await db.getAll('subject_profile');
    return profiles.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function getSubjectProfilesByType(type: 'pet' | 'person' | 'other'): Promise<SubjectProfileDB[]> {
  try {
    const db = await getDB();
    return await db.getAllFromIndex('subject_profile', 'by-type', type);
  } catch {
    return [];
  }
}

export async function deleteSubjectProfile(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('subject_profile', id);
    
    // Also delete associated match frames
    const matchFrames = await db.getAllFromIndex('match_frame', 'by-subject', id);
    const tx = db.transaction('match_frame', 'readwrite');
    for (const frame of matchFrames) {
      await tx.store.delete(frame.id);
    }
    await tx.done;
  } catch (error) {
    console.warn('[ClientDB] Failed to delete subject profile:', error);
  }
}

export async function updateSubjectMatchCount(id: string, increment: number = 1): Promise<void> {
  try {
    const db = await getDB();
    const profile = await db.get('subject_profile', id);
    if (profile) {
      profile.matchCount += increment;
      profile.lastActiveAt = new Date().toISOString();
      await db.put('subject_profile', profile);
    }
  } catch (error) {
    console.warn('[ClientDB] Failed to update subject match count:', error);
  }
}

// =============================================================================
// Lost & Found: Match Frames
// =============================================================================

export interface MatchFrameDB {
  id: string;
  subjectId: string;
  frameData: string;
  thumbnailData: string;
  confidence: number;
  timestamp: number;
  details: {
    colorMatch: number;
    dominantMatch: number;
    edgeMatch: number;
    sizeMatch: number;
  };
  region: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  acknowledged: boolean;
  notes: string;
  exported: boolean;
}

export async function saveMatchFrame(frame: MatchFrameDB, generation = getLocalDataGeneration()): Promise<void> {
  try {
    const db = await getDB();
    if (!isCurrentLocalData(generation)) return;
    await db.put('match_frame', frame);
    
    // Update subject match count
    if (!isCurrentLocalData(generation)) return;
    await updateSubjectMatchCount(frame.subjectId, 1);
    
    // Enforce max limit
    await cleanupExcessMatchFrames();
  } catch (error) {
    console.warn('[ClientDB] Failed to save match frame:', error);
  }
}

export async function getMatchFrame(id: string): Promise<MatchFrameDB | null> {
  try {
    const db = await getDB();
    const frame = await db.get('match_frame', id);
    return frame || null;
  } catch {
    return null;
  }
}

export async function getMatchFramesBySubject(subjectId: string): Promise<MatchFrameDB[]> {
  try {
    const db = await getDB();
    const frames = await db.getAllFromIndex('match_frame', 'by-subject', subjectId);
    return frames.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export async function getAllMatchFrames(limit?: number): Promise<MatchFrameDB[]> {
  try {
    const db = await getDB();
    const frames = await db.getAll('match_frame');
    const sorted = frames.sort((a, b) => b.timestamp - a.timestamp);
    return limit ? sorted.slice(0, limit) : sorted;
  } catch {
    return [];
  }
}

export async function getHighConfidenceMatches(minConfidence: number): Promise<MatchFrameDB[]> {
  try {
    const db = await getDB();
    const frames = await db.getAll('match_frame');
    return frames
      .filter(f => f.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  } catch {
    return [];
  }
}

export async function getUnacknowledgedMatches(): Promise<MatchFrameDB[]> {
  try {
    const db = await getDB();
    const frames = await db.getAll('match_frame');
    return frames
      .filter(f => !f.acknowledged)
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export async function acknowledgeMatchFrame(id: string): Promise<void> {
  try {
    const db = await getDB();
    const frame = await db.get('match_frame', id);
    if (frame) {
      frame.acknowledged = true;
      await db.put('match_frame', frame);
    }
  } catch (error) {
    console.warn('[ClientDB] Failed to acknowledge match frame:', error);
  }
}

export async function updateMatchFrameNotes(id: string, notes: string): Promise<void> {
  try {
    const db = await getDB();
    const frame = await db.get('match_frame', id);
    if (frame) {
      frame.notes = notes;
      await db.put('match_frame', frame);
    }
  } catch (error) {
    console.warn('[ClientDB] Failed to update match frame notes:', error);
  }
}

export async function markMatchFramesExported(ids: string[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('match_frame', 'readwrite');
    
    for (const id of ids) {
      const frame = await tx.store.get(id);
      if (frame) {
        frame.exported = true;
        await tx.store.put(frame);
      }
    }
    
    await tx.done;
  } catch (error) {
    console.warn('[ClientDB] Failed to mark match frames exported:', error);
  }
}

export async function deleteMatchFrame(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('match_frame', id);
  } catch (error) {
    console.warn('[ClientDB] Failed to delete match frame:', error);
  }
}

export async function deleteMatchFramesBySubject(subjectId: string): Promise<void> {
  try {
    const db = await getDB();
    const frames = await db.getAllFromIndex('match_frame', 'by-subject', subjectId);
    const tx = db.transaction('match_frame', 'readwrite');
    
    for (const frame of frames) {
      await tx.store.delete(frame.id);
    }
    
    await tx.done;
  } catch (error) {
    console.warn('[ClientDB] Failed to delete match frames by subject:', error);
  }
}

async function cleanupExcessMatchFrames(): Promise<void> {
  try {
    const db = await getDB();
    const count = await db.count('match_frame');
    
    if (count > MAX_MATCH_FRAMES) {
      // Get oldest frames that are acknowledged
      const frames = await db.getAll('match_frame');
      const sortedByTime = frames
        .filter(f => f.acknowledged)
        .sort((a, b) => a.timestamp - b.timestamp);
      
      const toDelete = sortedByTime.slice(0, count - MAX_MATCH_FRAMES);
      
      const tx = db.transaction('match_frame', 'readwrite');
      for (const frame of toDelete) {
        await tx.store.delete(frame.id);
      }
      await tx.done;
    }
  } catch {
    // Ignore cleanup errors
  }
}

export async function cleanupOldMatchFrames(olderThanDays: number): Promise<number> {
  try {
    const db = await getDB();
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    
    const frames = await db.getAll('match_frame');
    const toDelete = frames.filter(f => f.timestamp < cutoff && f.acknowledged);
    
    const tx = db.transaction('match_frame', 'readwrite');
    for (const frame of toDelete) {
      await tx.store.delete(frame.id);
    }
    await tx.done;
    
    return toDelete.length;
  } catch {
    return 0;
  }
}

// =============================================================================
// Export Match Frames to JSON/CSV
// =============================================================================

export interface MatchFrameExport {
  id: string;
  subjectId: string;
  subjectName?: string;
  confidence: number;
  timestamp: string;
  colorMatch: number;
  dominantMatch: number;
  edgeMatch: number;
  sizeMatch: number;
  notes: string;
}

export async function exportMatchFrames(
  subjectId?: string,
  format: 'json' | 'csv' = 'json',
  ids?: string[]
): Promise<{ data: string; filename: string }> {
  const frames = subjectId
    ? await getMatchFramesBySubject(subjectId)
    : await getAllMatchFrames();

  const selectedFrames = ids && ids.length > 0
    ? (() => {
        const idSet = new Set(ids);
        return frames.filter((f) => idSet.has(f.id));
      })()
    : frames;
  
  const profiles = await getAllSubjectProfiles();
  const profileMap = new Map(profiles.map(p => [p.id, p.name]));
  
  const exportData: MatchFrameExport[] = selectedFrames.map(f => ({
    id: f.id,
    subjectId: f.subjectId,
    subjectName: profileMap.get(f.subjectId),
    confidence: f.confidence,
    timestamp: new Date(f.timestamp).toISOString(),
    colorMatch: f.details.colorMatch,
    dominantMatch: f.details.dominantMatch,
    edgeMatch: f.details.edgeMatch,
    sizeMatch: f.details.sizeMatch,
    notes: f.notes,
  }));
  
  const date = new Date().toISOString().slice(0, 10);
  
  if (format === 'csv') {
    const headers = [
      'id',
      'subjectId',
      'subjectName',
      'confidence',
      'timestamp',
      'colorMatch',
      'dominantMatch',
      'edgeMatch',
      'sizeMatch',
      'notes',
    ].join(',');

    const rows = exportData.map(row =>
      [
        row.id,
        row.subjectId,
        row.subjectName ?? '',
        row.confidence,
        row.timestamp,
        row.colorMatch,
        row.dominantMatch,
        row.edgeMatch,
        row.sizeMatch,
        row.notes,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    );
    return {
      data: [headers, ...rows].join('\n'),
      filename: `safeos-matches-${date}.csv`,
    };
  }
  
  return {
    data: JSON.stringify(exportData, null, 2),
    filename: `safeos-matches-${date}.json`,
  };
}

// =============================================================================
// Intrusion Frame Management
// =============================================================================

const MAX_INTRUSION_FRAMES = 100;

export interface IntrusionFrameDB {
  id: string;
  frameData: string;
  thumbnailData: string;
  timestamp: number;
  personCount: number;
  allowedCount: number;
  detections: Array<{
    bbox: [number, number, number, number];
    confidence: number;
  }>;
  acknowledged: boolean;
  notes: string;
  exported: boolean;
}

export async function saveIntrusionFrame(frame: IntrusionFrameDB): Promise<void> {
  try {
    const db = await getDB();
    await db.put('intrusion_frame', frame);
    await cleanupExcessIntrusionFrames();
  } catch (error) {
    console.warn('[ClientDB] Failed to save intrusion frame:', error);
  }
}

export async function getIntrusionFrame(id: string): Promise<IntrusionFrameDB | null> {
  try {
    const db = await getDB();
    const frame = await db.get('intrusion_frame', id);
    return frame || null;
  } catch {
    return null;
  }
}

export async function getAllIntrusionFrames(limit?: number): Promise<IntrusionFrameDB[]> {
  try {
    const db = await getDB();
    const frames = await db.getAll('intrusion_frame');
    const sorted = frames.sort((a, b) => b.timestamp - a.timestamp);
    return limit ? sorted.slice(0, limit) : sorted;
  } catch {
    return [];
  }
}

export async function getRecentIntrusionFrames(limit: number = 20): Promise<IntrusionFrameDB[]> {
  return getAllIntrusionFrames(limit);
}

export async function getUnacknowledgedIntrusions(): Promise<IntrusionFrameDB[]> {
  try {
    const db = await getDB();
    const frames = await db.getAll('intrusion_frame');
    return frames
      .filter(f => !f.acknowledged)
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export async function getIntrusionsByTimeRange(
  startTime: number,
  endTime: number
): Promise<IntrusionFrameDB[]> {
  try {
    const db = await getDB();
    const frames = await db.getAll('intrusion_frame');
    return frames
      .filter(f => f.timestamp >= startTime && f.timestamp <= endTime)
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export async function acknowledgeIntrusionFrame(id: string): Promise<void> {
  try {
    const db = await getDB();
    const frame = await db.get('intrusion_frame', id);
    if (frame) {
      frame.acknowledged = true;
      await db.put('intrusion_frame', frame);
    }
  } catch (error) {
    console.warn('[ClientDB] Failed to acknowledge intrusion frame:', error);
  }
}

export async function updateIntrusionFrameNotes(id: string, notes: string): Promise<void> {
  try {
    const db = await getDB();
    const frame = await db.get('intrusion_frame', id);
    if (frame) {
      frame.notes = notes;
      await db.put('intrusion_frame', frame);
    }
  } catch (error) {
    console.warn('[ClientDB] Failed to update intrusion frame notes:', error);
  }
}

export async function markIntrusionFramesExported(ids: string[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('intrusion_frame', 'readwrite');
    
    for (const id of ids) {
      const frame = await tx.store.get(id);
      if (frame) {
        frame.exported = true;
        await tx.store.put(frame);
      }
    }
    
    await tx.done;
  } catch (error) {
    console.warn('[ClientDB] Failed to mark intrusion frames exported:', error);
  }
}

export async function deleteIntrusionFrame(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('intrusion_frame', id);
  } catch (error) {
    console.warn('[ClientDB] Failed to delete intrusion frame:', error);
  }
}

export async function clearAllIntrusionFrames(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear('intrusion_frame');
  } catch (error) {
    console.warn('[ClientDB] Failed to clear intrusion frames:', error);
  }
}

async function cleanupExcessIntrusionFrames(): Promise<void> {
  try {
    const db = await getDB();
    const count = await db.count('intrusion_frame');
    
    if (count > MAX_INTRUSION_FRAMES) {
      const frames = await db.getAllFromIndex('intrusion_frame', 'by-timestamp');
      const toDelete = frames
        .filter(f => f.acknowledged)
        .slice(0, count - MAX_INTRUSION_FRAMES);
      
      const tx = db.transaction('intrusion_frame', 'readwrite');
      for (const frame of toDelete) {
        await tx.store.delete(frame.id);
      }
      await tx.done;
    }
  } catch {
    // Ignore cleanup errors
  }
}

export async function cleanupOldIntrusionFrames(olderThanDays: number): Promise<number> {
  try {
    const db = await getDB();
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    
    const frames = await db.getAll('intrusion_frame');
    const toDelete = frames.filter(f => f.timestamp < cutoff && f.acknowledged);
    
    const tx = db.transaction('intrusion_frame', 'readwrite');
    for (const frame of toDelete) {
      await tx.store.delete(frame.id);
    }
    await tx.done;
    
    return toDelete.length;
  } catch {
    return 0;
  }
}

// =============================================================================
// Export Intrusion Frames
// =============================================================================

export interface IntrusionFrameExport {
  id: string;
  timestamp: string;
  personCount: number;
  allowedCount: number;
  excessCount: number;
  detectionCount: number;
  averageConfidence: number;
  notes: string;
}

export async function exportIntrusionFrames(
  format: 'json' | 'csv' = 'json',
  ids?: string[]
): Promise<{ data: string; filename: string }> {
  const frames = await getAllIntrusionFrames();

  const selectedFrames = ids && ids.length > 0
    ? (() => {
        const idSet = new Set(ids);
        return frames.filter((f) => idSet.has(f.id));
      })()
    : frames;
  
  const exportData: IntrusionFrameExport[] = selectedFrames.map(f => ({
    id: f.id,
    timestamp: new Date(f.timestamp).toISOString(),
    personCount: f.personCount,
    allowedCount: f.allowedCount,
    excessCount: Math.max(0, f.personCount - f.allowedCount),
    detectionCount: f.detections.length,
    averageConfidence: f.detections.length > 0
      ? f.detections.reduce((sum, d) => sum + d.confidence, 0) / f.detections.length
      : 0,
    notes: f.notes,
  }));
  
  const date = new Date().toISOString().slice(0, 10);
  
  if (format === 'csv') {
    const headers = [
      'id',
      'timestamp',
      'personCount',
      'allowedCount',
      'excessCount',
      'detectionCount',
      'averageConfidence',
      'notes',
    ].join(',');

    const rows = exportData.map(row =>
      [
        row.id,
        row.timestamp,
        row.personCount,
        row.allowedCount,
        row.excessCount,
        row.detectionCount,
        row.averageConfidence,
        row.notes,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    );
    return {
      data: [headers, ...rows].join('\n'),
      filename: `safeos-intrusions-${date}.csv`,
    };
  }
  
  return {
    data: JSON.stringify(exportData, null, 2),
    filename: `safeos-intrusions-${date}.json`,
  };
}

// =============================================================================
// Statistics
// =============================================================================

export async function getIntrusionStats(): Promise<{
  totalIntrusions: number;
  unacknowledged: number;
  last24Hours: number;
  last7Days: number;
  averagePersonCount: number;
}> {
  try {
    const frames = await getAllIntrusionFrames();
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    const last24h = frames.filter(f => f.timestamp >= oneDayAgo);
    const last7d = frames.filter(f => f.timestamp >= oneWeekAgo);
    const unack = frames.filter(f => !f.acknowledged);
    
    const avgCount = frames.length > 0
      ? frames.reduce((sum, f) => sum + f.personCount, 0) / frames.length
      : 0;
    
    return {
      totalIntrusions: frames.length,
      unacknowledged: unack.length,
      last24Hours: last24h.length,
      last7Days: last7d.length,
      averagePersonCount: Math.round(avgCount * 10) / 10,
    };
  } catch {
    return {
      totalIntrusions: 0,
      unacknowledged: 0,
      last24Hours: 0,
      last7Days: 0,
      averagePersonCount: 0,
    };
  }
}

// =============================================================================
// Custom Media CRUD
// =============================================================================

export type CustomMediaDB = SafeOSDB['custom_media']['value'];

const MAX_CUSTOM_MEDIA = 100;

export async function saveCustomMedia(media: CustomMediaDB): Promise<void> {
  try {
    const db = await getDB();
    await db.put('custom_media', media);
    await cleanupExcessCustomMedia(media.subjectId);
  } catch (error) {
    console.warn('[ClientDB] Failed to save custom media:', error);
  }
}

export async function getCustomMedia(id: string): Promise<CustomMediaDB | null> {
  try {
    const db = await getDB();
    const media = await db.get('custom_media', id);
    return media || null;
  } catch {
    return null;
  }
}

export async function getCustomMediaBySubject(subjectId: string): Promise<CustomMediaDB[]> {
  try {
    const db = await getDB();
    const media = await db.getAllFromIndex('custom_media', 'by-subject', subjectId);
    return media.sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}

export async function getCustomMediaByType(
  subjectId: string,
  type: 'image' | 'audio'
): Promise<CustomMediaDB[]> {
  try {
    const db = await getDB();
    const allMedia = await db.getAllFromIndex('custom_media', 'by-subject', subjectId);
    return allMedia
      .filter(m => m.type === type)
      .sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}

export async function deleteCustomMedia(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('custom_media', id);
  } catch (error) {
    console.warn('[ClientDB] Failed to delete custom media:', error);
  }
}

export async function deleteCustomMediaBySubject(subjectId: string): Promise<void> {
  try {
    const db = await getDB();
    const media = await db.getAllFromIndex('custom_media', 'by-subject', subjectId);
    const tx = db.transaction('custom_media', 'readwrite');
    for (const m of media) {
      await tx.store.delete(m.id);
    }
    await tx.done;
  } catch (error) {
    console.warn('[ClientDB] Failed to delete custom media for subject:', error);
  }
}

export async function reorderCustomMedia(
  subjectId: string,
  orderedIds: string[]
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('custom_media', 'readwrite');
    
    for (let i = 0; i < orderedIds.length; i++) {
      const media = await tx.store.get(orderedIds[i]);
      if (media && media.subjectId === subjectId) {
        media.order = i;
        await tx.store.put(media);
      }
    }
    
    await tx.done;
  } catch (error) {
    console.warn('[ClientDB] Failed to reorder custom media:', error);
  }
}

async function cleanupExcessCustomMedia(subjectId: string): Promise<void> {
  try {
    const db = await getDB();
    const media = await db.getAllFromIndex('custom_media', 'by-subject', subjectId);
    
    if (media.length > MAX_CUSTOM_MEDIA) {
      const sorted = media.sort((a, b) => a.uploadedAt - b.uploadedAt);
      const toDelete = sorted.slice(0, media.length - MAX_CUSTOM_MEDIA);
      
      const tx = db.transaction('custom_media', 'readwrite');
      for (const m of toDelete) {
        await tx.store.delete(m.id);
      }
      await tx.done;
    }
  } catch {
    // Ignore cleanup errors
  }
}

// =============================================================================
// Animal Detection CRUD
// =============================================================================

export type AnimalDetectionDB = SafeOSDB['animal_detection']['value'];

const MAX_ANIMAL_DETECTIONS = 500;

export async function saveAnimalDetection(detection: AnimalDetectionDB): Promise<void> {
  try {
    const db = await getDB();
    await db.put('animal_detection', detection);
    await cleanupExcessAnimalDetections();
  } catch (error) {
    console.warn('[ClientDB] Failed to save animal detection:', error);
  }
}

export async function getAnimalDetection(id: string): Promise<AnimalDetectionDB | null> {
  try {
    const db = await getDB();
    const detection = await db.get('animal_detection', id);
    return detection || null;
  } catch {
    return null;
  }
}

export async function getAllAnimalDetections(): Promise<AnimalDetectionDB[]> {
  try {
    const db = await getDB();
    const detections = await db.getAllFromIndex('animal_detection', 'by-timestamp');
    return detections.reverse(); // Newest first
  } catch {
    return [];
  }
}

export async function getAnimalDetectionsByType(type: string): Promise<AnimalDetectionDB[]> {
  try {
    const db = await getDB();
    const detections = await db.getAllFromIndex('animal_detection', 'by-type', type);
    return detections.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export async function getAnimalDetectionsByDanger(
  dangerLevel: 'none' | 'low' | 'medium' | 'high' | 'extreme'
): Promise<AnimalDetectionDB[]> {
  try {
    const db = await getDB();
    const detections = await db.getAllFromIndex('animal_detection', 'by-danger', dangerLevel);
    return detections.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export async function getDangerousAnimalDetections(): Promise<AnimalDetectionDB[]> {
  try {
    const db = await getDB();
    const all = await db.getAll('animal_detection');
    return all
      .filter(d => d.dangerLevel === 'high' || d.dangerLevel === 'extreme')
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export async function acknowledgeAnimalDetection(id: string): Promise<void> {
  try {
    const db = await getDB();
    const detection = await db.get('animal_detection', id);
    if (detection) {
      detection.acknowledged = true;
      await db.put('animal_detection', detection);
    }
  } catch (error) {
    console.warn('[ClientDB] Failed to acknowledge animal detection:', error);
  }
}

export async function updateAnimalDetectionNotes(id: string, notes: string): Promise<void> {
  try {
    const db = await getDB();
    const detection = await db.get('animal_detection', id);
    if (detection) {
      detection.notes = notes;
      await db.put('animal_detection', detection);
    }
  } catch (error) {
    console.warn('[ClientDB] Failed to update animal detection notes:', error);
  }
}

export async function deleteAnimalDetection(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('animal_detection', id);
  } catch (error) {
    console.warn('[ClientDB] Failed to delete animal detection:', error);
  }
}

export async function clearAllAnimalDetections(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear('animal_detection');
  } catch (error) {
    console.warn('[ClientDB] Failed to clear animal detections:', error);
  }
}

async function cleanupExcessAnimalDetections(): Promise<void> {
  try {
    const db = await getDB();
    const count = await db.count('animal_detection');
    
    if (count > MAX_ANIMAL_DETECTIONS) {
      const detections = await db.getAllFromIndex('animal_detection', 'by-timestamp');
      const toDelete = detections
        .filter(d => d.acknowledged)
        .slice(0, count - MAX_ANIMAL_DETECTIONS);
      
      const tx = db.transaction('animal_detection', 'readwrite');
      for (const d of toDelete) {
        await tx.store.delete(d.id);
      }
      await tx.done;
    }
  } catch {
    // Ignore cleanup errors
  }
}

export async function cleanupOldAnimalDetections(olderThanDays: number): Promise<number> {
  try {
    const db = await getDB();
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    
    const detections = await db.getAll('animal_detection');
    const toDelete = detections.filter(d => d.timestamp < cutoff && d.acknowledged);
    
    const tx = db.transaction('animal_detection', 'readwrite');
    for (const d of toDelete) {
      await tx.store.delete(d.id);
    }
    await tx.done;
    
    return toDelete.length;
  } catch {
    return 0;
  }
}

export async function getAnimalDetectionStats(): Promise<{
  total: number;
  unacknowledged: number;
  last24Hours: number;
  last7Days: number;
  largeAnimals: number;
  smallAnimals: number;
  dangerous: number;
}> {
  try {
    const detections = await getAllAnimalDetections();
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    const last24h = detections.filter(d => d.timestamp >= oneDayAgo);
    const last7d = detections.filter(d => d.timestamp >= oneWeekAgo);
    const unack = detections.filter(d => !d.acknowledged);
    const large = detections.filter(d => d.sizeCategory === 'large');
    const small = detections.filter(d => d.sizeCategory === 'small');
    const dangerous = detections.filter(
      d => d.dangerLevel === 'high' || d.dangerLevel === 'extreme'
    );
    
    return {
      total: detections.length,
      unacknowledged: unack.length,
      last24Hours: last24h.length,
      last7Days: last7d.length,
      largeAnimals: large.length,
      smallAnimals: small.length,
      dangerous: dangerous.length,
    };
  } catch {
    return {
      total: 0,
      unacknowledged: 0,
      last24Hours: 0,
      last7Days: 0,
      largeAnimals: 0,
      smallAnimals: 0,
      dangerous: 0,
    };
  }
}

/** Clear every local record in one transaction, including frames and profiles. */
export async function clearClientData(): Promise<void> {
  const db = await getDB();
  const names = Array.from(db.objectStoreNames);
  const tx = db.transaction(names, 'readwrite');
  await Promise.all(names.map((name) => tx.objectStore(name).clear()));
  await tx.done;
}
