/**
 * Client-Side Database
 *
 * Uses idb (IndexedDB wrapper) for browser-native offline-first data persistence.
 * This is a pure browser implementation with no Node.js dependencies.
 *
 * @module lib/client-db
 */

import {
  getLocalDataGeneration, isCurrentLocalData, learnClearGeneration, newClearValue, readLocalClearMarker,
  writeLocalClearMarker, type ClearStamp,
} from './local-data-generation';
import { openDB, type DBSchema, type IDBPDatabase, type IDBPObjectStore, type IDBPTransaction } from 'idb';

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
      producer: 'monitoring' | 'shared';
      savedBeforeUpgrade?: boolean;
      originalCreatedAt?: unknown;
      retentionClass: 'saved' | 'new';
      /** 0 is acknowledged, so acknowledged alerts sort first in the retention indexes. */
      acknowledgementOrder: 0 | 1;
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
    indexes: {
      'by-stream': string;
      'by-created': string;
      'by-producer-created': [string, string];
      'by-retention': [string, number, string];
      'by-producer-retention': [string, string, number, string];
    };
  };
  /** One record under the key 'current': a value that names the last clear of this browser's data. */
  clear_generation: { key: string; value: string };
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
const DB_VERSION = 7; // Alerts belong to the browser: producer indexes and the clear generation

const FRAME_BUFFER_MINUTES = 5;
const MAX_CACHED_ALERTS = 500;
export const MAX_MONITORING_ALERTS = 100;
const MAX_MATCH_FRAMES = 500;

// =============================================================================
// Database Instance
// =============================================================================

// The reload notices. Each says what is paused in this tab until the page is reloaded.
const BLOCKED_NOTICE = 'Close other SafeOS tabs, then reload this page to finish updating your saved history. Until you reload, new alerts in this tab are shown but not saved, and acknowledging, dismissing or clearing alerts is not saved. Everything already saved comes back as it was after you reload.';
const UPDATED_NOTICE = 'SafeOS has been updated in another tab. Reload this page to keep saving history. Until you reload, new alerts in this tab are shown but not saved, and acknowledging, dismissing or clearing alerts is not saved. Everything already saved comes back as it was after you reload.';
const FAILED_UPGRADE_NOTICE = 'SafeOS could not finish updating your saved history, so it is not shown in this tab. Nothing was deleted. Reload this page to try again; if it keeps failing, free some storage in this browser. Until you reload, new alerts in this tab are shown but not saved, and acknowledging, dismissing or clearing alerts is not saved.';

let dbPromise: Promise<IDBPDatabase<SafeOSDB>> | null = null;
let databaseNotice: string | null = null;
/** The version an upgrade in progress started from; 0 when none is running or the database is new. */
let upgradingFrom = 0;

export function getDatabaseNotice(): string | null {
  return databaseNotice;
}

function requestDatabaseReload(message: string): void {
  databaseNotice = message;
  window.dispatchEvent(new CustomEvent('safeos:database-status', { detail: message }));
}

function getDB(): Promise<IDBPDatabase<SafeOSDB>> {
  if (typeof window === 'undefined') {
    // SSR - return a mock that does nothing
    return Promise.reject(new Error('IndexedDB not available on server'));
  }

  if (databaseNotice) return Promise.reject(new Error(databaseNotice));

  if (!dbPromise) {
    let rejectBlocked: (error: Error) => void;
    const blocked = new Promise<never>((_resolve, reject) => { rejectBlocked = reject; });
    const opening = openDB<SafeOSDB>(DB_NAME, DB_VERSION, {
      blocked() {
        requestDatabaseReload(BLOCKED_NOTICE);
        rejectBlocked(new Error(BLOCKED_NOTICE));
      },
      blocking(_currentVersion, _blockedVersion, event) {
        (event.target as IDBDatabase).close();
        dbPromise = null;
        requestDatabaseReload(UPDATED_NOTICE);
      },
      terminated() {
        dbPromise = null;
      },
      async upgrade(db, oldVersion, _newVersion, transaction) {
        upgradingFrom = oldVersion;
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
        // Builds that were never released indexed alerts by an owner.
        const unreleased = alerts as unknown as { indexNames: DOMStringList; deleteIndex(name: string): void };
        for (const name of ['by-owner-created', 'by-owner-retention']) {
          if (unreleased.indexNames.contains(name)) unreleased.deleteIndex(name);
        }
        if (!alerts.indexNames.contains('by-producer-created')) {
          alerts.createIndex('by-producer-created', ['producer', 'createdAt']);
        }
        if (!alerts.indexNames.contains('by-retention')) {
          alerts.createIndex('by-retention', ['retentionClass', 'acknowledgementOrder', 'createdAt']);
        }
        if (!alerts.indexNames.contains('by-producer-retention')) {
          alerts.createIndex('by-producer-retention', ['producer', 'retentionClass', 'acknowledgementOrder', 'createdAt']);
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

        try {
          // A browser that had no clear generation gets a new one, as a clear would write it.
          if (!db.objectStoreNames.contains('clear_generation')) {
            db.createObjectStore('clear_generation');
            await transaction.objectStore('clear_generation').put(newClearValue(), 'current');
          }

          if (oldVersion < 7) {
            // Every alert found here was saved before this version: mark it and delete none.
            let cursor = await alerts.openCursor();
            while (cursor) {
              // Only an unreleased build wrote the two owner fields.
              const { ownerId: _ownerId, cacheOwner: _cacheOwner, ...record } = cursor.value as Record<string, any>;
              const rawDate = record.createdAt || record.syncedAt || new Date().toISOString();
              const timestamp = typeof rawDate === 'string' ? Date.parse(rawDate) : NaN;
              const originalTimestamp = typeof record.createdAt === 'string' ? Date.parse(record.createdAt) : NaN;
              // Keep even undated history, including its original date value.
              await cursor.update({
                ...record,
                ...(!Number.isFinite(originalTimestamp) ? { originalCreatedAt: record.createdAt } : {}),
                createdAt: new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString(),
                producer: alertProducer(record),
                savedBeforeUpgrade: true,
                retentionClass: 'saved',
                acknowledgementOrder: record.acknowledged ? 0 : 1,
              } as SafeOSDB['alert_cache']['value']);
              cursor = await cursor.continue();
            }
          }
        } catch {
          // A half-rewritten store must never commit: the database keeps its old version, unchanged.
          try { transaction.abort(); } catch { /* A failed request has already aborted it. */ }
          transaction.done.catch(() => {});
        }
      },
    }).then(db => {
      upgradingFrom = 0;
      // A blocked request can finish after its caller has already been notified.
      if (databaseNotice) {
        db.close();
        throw new Error(databaseNotice);
      }
      return db;
    });
    dbPromise = Promise.race([opening, blocked]).catch(error => {
      dbPromise = null;
      // The stored database is newer than this tab's code: some tab ran a later version.
      if (error?.name === 'VersionError' && !databaseNotice) requestDatabaseReload(UPDATED_NOTICE);
      // An upgrade of an existing database could not finish; a new database is simply tried again.
      if (upgradingFrom > 0 && !databaseNotice) requestDatabaseReload(FAILED_UPGRADE_NOTICE);
      upgradingFrom = 0;
      throw error;
    });
  }

  return dbPromise;
}

// =============================================================================
// Cleanup Functions
// =============================================================================

/**
 * The failure path of a write: a request that fails aborts its transaction, and the transaction's
 * completion promise rejects too. This aborts the transaction when it is still active and consumes
 * that rejection, so a failed write leaves no unhandled rejection behind.
 */
async function abandonTransaction(tx: { abort(): void; done: Promise<void> } | undefined): Promise<void> {
  if (!tx) return;
  try { tx.abort(); } catch { /* A failed request has already aborted it. */ }
  await tx.done.catch(() => {});
}

async function cleanupOldFrames(): Promise<void> {
  let tx: IDBPTransaction<SafeOSDB, ['frame_cache'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    const cutoff = new Date(Date.now() - FRAME_BUFFER_MINUTES * 60 * 1000).toISOString();

    tx = db.transaction('frame_cache', 'readwrite');
    const index = tx.store.index('by-created');

    let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    await tx.done;
  } catch {
    // Ignore cleanup errors
    await abandonTransaction(tx);
  }
}

type AlertStores = Array<'alert_cache' | 'clear_generation'>;
type AlertStore<Stores extends AlertStores> = IDBPObjectStore<SafeOSDB, Stores, 'alert_cache', 'readwrite'>;

/** The monitoring store marks every alert it saves; the alert engine and the sync service share the rest. */
function alertProducer(record: { monitoring?: boolean }): 'monitoring' | 'shared' {
  return record.monitoring === true ? 'monitoring' : 'shared';
}

function producerRange(producer: string): IDBKeyRange {
  return IDBKeyRange.bound([producer], [producer, []]);
}

/** Only alerts saved after the upgrade count; acknowledged ones leave first, oldest first. */
async function pruneMonitoringAlerts<Stores extends AlertStores>(store: AlertStore<Stores>): Promise<void> {
  const index = store.index('by-producer-retention');
  const range = IDBKeyRange.bound(['monitoring', 'new'], ['monitoring', 'new', []]);
  let excess = (await index.count(range)) - MAX_MONITORING_ALERTS;
  let cursor = excess > 0 ? await index.openCursor(range) : null;
  while (cursor && excess-- > 0) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
}

/** The limit over every producer's alerts saved after the upgrade, in the same order. */
async function pruneNewAlerts<Stores extends AlertStores>(store: AlertStore<Stores>): Promise<void> {
  const index = store.index('by-retention');
  const range = IDBKeyRange.bound(['new'], ['new', []]);
  let excess = (await index.count(range)) - MAX_CACHED_ALERTS;
  let cursor = excess > 0 ? await index.openCursor(range) : null;
  while (cursor && excess-- > 0) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
}

export async function cleanupCaches(): Promise<void> {
  await cleanupOldFrames();
  let tx: IDBPTransaction<SafeOSDB, ['alert_cache'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction('alert_cache', 'readwrite');
    await pruneMonitoringAlerts(tx.store);
    await pruneNewAlerts(tx.store);
    await tx.done;
  } catch {
    // Ignore cleanup errors
    await abandonTransaction(tx);
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

/**
 * The first valid saved session, or null when the store was read and holds none. It rejects when
 * the database cannot be opened or read, so a failure is never taken for a browser with no session.
 */
export async function readLocalSession(): Promise<LocalSession | null> {
  const db = await getDB();
  const sessions = await db.getAll('local_session');
  const now = new Date().toISOString();
  return sessions.find(s => s.expiresAt > now) || null;
}

/** False while a reload notice is set or when the database cannot be opened. */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await getDB();
    return true;
  } catch {
    return false;
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

/**
 * Every write of an alert. One transaction reads the clear generation, then the stored record,
 * writes the merged record and applies both limits. With `stamp`, the write is the retry of a save
 * that failed earlier: it writes only when no clear came since. With `updateOnly`, it never creates
 * a record.
 */
async function writeAlert(
  alert: any, stamp: ClearStamp | undefined, updateOnly: boolean,
): Promise<'saved' | 'cancelled' | 'gone' | 'failed'> {
  let tx: IDBPTransaction<SafeOSDB, AlertStores, 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction(['alert_cache', 'clear_generation'], 'readwrite');
    const alerts = tx.objectStore('alert_cache');
    // A clear writes both stores too, so it runs wholly before or wholly after this transaction.
    const generation = (await tx.objectStore('clear_generation').get('current')) ?? '';
    learnClearGeneration(generation);
    if (stamp) {
      const current = stamp.generation !== null
        ? generation === stamp.generation
        : readLocalClearMarker() === stamp.marker;
      if (!current) {
        await tx.done;
        return 'cancelled';
      }
    }
    const previous = await alerts.get(alert.id);
    if (updateOnly && !previous) {
      await tx.done;
      return 'gone';
    }
    // A partial write, such as an acknowledgement, keeps the stored fields it does not carry.
    const merged: any = {
      ...previous,
      ...Object.fromEntries(Object.entries(alert).filter(([, value]) => value !== undefined)),
    };
    let createdAt: string;
    let originalCreatedAt = previous?.originalCreatedAt;
    if (previous && typeof previous.createdAt === 'string' && Number.isFinite(Date.parse(previous.createdAt))) {
      // A later write never changes a stored alert's creation time, also one in the future.
      createdAt = previous.createdAt;
    } else {
      const given = merged.createdAt || merged.timestamp;
      const time = typeof given === 'string' || typeof given === 'number' ? new Date(given).getTime() : NaN;
      createdAt = new Date(Number.isFinite(time) ? Math.min(time, Date.now()) : Date.now()).toISOString();
      // A date that cannot be read must not lose the alert: it is kept beside a usable one.
      if (!Number.isFinite(time) && given && originalCreatedAt === undefined) originalCreatedAt = given;
    }
    const producer = alertProducer(merged);
    const savedBeforeUpgrade = previous?.savedBeforeUpgrade === true;
    await alerts.put({
      id: merged.id,
      monitoring: merged.monitoring === true,
      producer,
      savedBeforeUpgrade,
      originalCreatedAt,
      retentionClass: savedBeforeUpgrade ? 'saved' : 'new',
      acknowledgementOrder: merged.acknowledged ? 0 : 1,
      alertType: merged.alertType,
      thumbnailUrl: merged.thumbnailUrl,
      timestamp: merged.timestamp,
      streamId: merged.streamId,
      severity: merged.severity,
      message: merged.message,
      description: merged.description,
      acknowledged: Boolean(merged.acknowledged),
      acknowledgedAt: merged.acknowledgedAt,
      createdAt,
      syncedAt: new Date().toISOString(),
    });
    if (producer === 'monitoring') await pruneMonitoringAlerts(alerts);
    await pruneNewAlerts(alerts);
    await tx.done;
    return 'saved';
  } catch (error) {
    console.warn('[ClientDB] Failed to cache alert:', error);
    // A request that failed after it was queued aborted the transaction, and rejected its `done`.
    await abandonTransaction(tx);
    return 'failed';
  }
}

/**
 * Saves a whole alert, creating or replacing its record. False means the write failed. True means
 * nothing is left to save: the record was saved, or a clear since the save was queued means it
 * must not be.
 */
export async function cacheAlert(alert: any, stamp?: ClearStamp): Promise<boolean> {
  return (await writeAlert(alert, stamp, false)) !== 'failed';
}

/** An acknowledgement or any other partial update. It never creates a record. */
export async function updateCachedAlert(alert: any, stamp?: ClearStamp): Promise<'updated' | 'gone' | 'failed'> {
  const result = await writeAlert(alert, stamp, true);
  if (result === 'saved') return 'updated';
  return result === 'failed' ? 'failed' : 'gone';
}

/** Every producer's alerts, newest first. */
export async function getCachedAlerts(streamId?: string): Promise<any[]> {
  try {
    const db = await getDB();
    const alerts = streamId
      ? await db.getAllFromIndex('alert_cache', 'by-stream', streamId)
      : await db.getAllFromIndex('alert_cache', 'by-created');
    return alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/** The monitoring store's alerts, newest first. It throws on failure, which is not an empty history. */
export async function getCachedMonitoringAlerts(): Promise<any[]> {
  const db = await getDB();
  const tx = db.transaction(['alert_cache', 'clear_generation'], 'readonly');
  // A history read is how a tab that has saved nothing learns the clear generation.
  learnClearGeneration((await tx.objectStore('clear_generation').get('current')) ?? '');
  const alerts: SafeOSDB['alert_cache']['value'][] = [];
  let cursor = await tx.objectStore('alert_cache').index('by-producer-created')
    .openCursor(producerRange('monitoring'), 'prev');
  while (cursor) {
    alerts.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return alerts;
}

export async function deleteCachedMonitoringAlert(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('alert_cache', 'readwrite');
  const alert = await tx.store.get(id);
  if (alert?.monitoring) await tx.store.delete(id);
  await tx.done;
}

/**
 * Clear all: deletes every monitoring alert and names the clear, in the database and in local
 * storage, so a failed save that waits in any tab is not written afterwards.
 */
export async function clearCachedMonitoringAlerts(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['alert_cache', 'clear_generation'], 'readwrite');
  try {
    let cursor = await tx.objectStore('alert_cache').index('by-producer-created').openCursor(producerRange('monitoring'));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.objectStore('clear_generation').put(newClearValue(), 'current');
    writeLocalClearMarker();
  } catch (error) {
    try { tx.abort(); } catch { /* A failed request has already aborted it. */ }
    await tx.done.catch(() => {});
    throw error;
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
  let tx: IDBPTransaction<SafeOSDB, ['match_frame'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    await db.delete('subject_profile', id);
    
    // Also delete associated match frames
    const matchFrames = await db.getAllFromIndex('match_frame', 'by-subject', id);
    tx = db.transaction('match_frame', 'readwrite');
    for (const frame of matchFrames) {
      await tx.store.delete(frame.id);
    }
    await tx.done;
  } catch (error) {
    console.warn('[ClientDB] Failed to delete subject profile:', error);
    await abandonTransaction(tx);
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
  let tx: IDBPTransaction<SafeOSDB, ['match_frame'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction('match_frame', 'readwrite');
    
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
    await abandonTransaction(tx);
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
  let tx: IDBPTransaction<SafeOSDB, ['match_frame'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    const frames = await db.getAllFromIndex('match_frame', 'by-subject', subjectId);
    tx = db.transaction('match_frame', 'readwrite');
    
    for (const frame of frames) {
      await tx.store.delete(frame.id);
    }
    
    await tx.done;
  } catch (error) {
    console.warn('[ClientDB] Failed to delete match frames by subject:', error);
    await abandonTransaction(tx);
  }
}

async function cleanupExcessMatchFrames(): Promise<void> {
  let tx: IDBPTransaction<SafeOSDB, ['match_frame'], 'readwrite'> | undefined;
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
      
      tx = db.transaction('match_frame', 'readwrite');
      for (const frame of toDelete) {
        await tx.store.delete(frame.id);
      }
      await tx.done;
    }
  } catch {
    // Ignore cleanup errors
    await abandonTransaction(tx);
  }
}

export async function cleanupOldMatchFrames(olderThanDays: number): Promise<number> {
  let tx: IDBPTransaction<SafeOSDB, ['match_frame'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    
    const frames = await db.getAll('match_frame');
    const toDelete = frames.filter(f => f.timestamp < cutoff && f.acknowledged);
    
    tx = db.transaction('match_frame', 'readwrite');
    for (const frame of toDelete) {
      await tx.store.delete(frame.id);
    }
    await tx.done;
    
    return toDelete.length;
  } catch {
    await abandonTransaction(tx);
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
  let tx: IDBPTransaction<SafeOSDB, ['intrusion_frame'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction('intrusion_frame', 'readwrite');
    
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
    await abandonTransaction(tx);
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
  let tx: IDBPTransaction<SafeOSDB, ['intrusion_frame'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    const count = await db.count('intrusion_frame');
    
    if (count > MAX_INTRUSION_FRAMES) {
      const frames = await db.getAllFromIndex('intrusion_frame', 'by-timestamp');
      const toDelete = frames
        .filter(f => f.acknowledged)
        .slice(0, count - MAX_INTRUSION_FRAMES);
      
      tx = db.transaction('intrusion_frame', 'readwrite');
      for (const frame of toDelete) {
        await tx.store.delete(frame.id);
      }
      await tx.done;
    }
  } catch {
    // Ignore cleanup errors
    await abandonTransaction(tx);
  }
}

export async function cleanupOldIntrusionFrames(olderThanDays: number): Promise<number> {
  let tx: IDBPTransaction<SafeOSDB, ['intrusion_frame'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    
    const frames = await db.getAll('intrusion_frame');
    const toDelete = frames.filter(f => f.timestamp < cutoff && f.acknowledged);
    
    tx = db.transaction('intrusion_frame', 'readwrite');
    for (const frame of toDelete) {
      await tx.store.delete(frame.id);
    }
    await tx.done;
    
    return toDelete.length;
  } catch {
    await abandonTransaction(tx);
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
  let tx: IDBPTransaction<SafeOSDB, ['custom_media'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    const media = await db.getAllFromIndex('custom_media', 'by-subject', subjectId);
    tx = db.transaction('custom_media', 'readwrite');
    for (const m of media) {
      await tx.store.delete(m.id);
    }
    await tx.done;
  } catch (error) {
    console.warn('[ClientDB] Failed to delete custom media for subject:', error);
    await abandonTransaction(tx);
  }
}

export async function reorderCustomMedia(
  subjectId: string,
  orderedIds: string[]
): Promise<void> {
  let tx: IDBPTransaction<SafeOSDB, ['custom_media'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction('custom_media', 'readwrite');
    
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
    await abandonTransaction(tx);
  }
}

async function cleanupExcessCustomMedia(subjectId: string): Promise<void> {
  let tx: IDBPTransaction<SafeOSDB, ['custom_media'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    const media = await db.getAllFromIndex('custom_media', 'by-subject', subjectId);
    
    if (media.length > MAX_CUSTOM_MEDIA) {
      const sorted = media.sort((a, b) => a.uploadedAt - b.uploadedAt);
      const toDelete = sorted.slice(0, media.length - MAX_CUSTOM_MEDIA);
      
      tx = db.transaction('custom_media', 'readwrite');
      for (const m of toDelete) {
        await tx.store.delete(m.id);
      }
      await tx.done;
    }
  } catch {
    // Ignore cleanup errors
    await abandonTransaction(tx);
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
  let tx: IDBPTransaction<SafeOSDB, ['animal_detection'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    const count = await db.count('animal_detection');
    
    if (count > MAX_ANIMAL_DETECTIONS) {
      const detections = await db.getAllFromIndex('animal_detection', 'by-timestamp');
      const toDelete = detections
        .filter(d => d.acknowledged)
        .slice(0, count - MAX_ANIMAL_DETECTIONS);
      
      tx = db.transaction('animal_detection', 'readwrite');
      for (const d of toDelete) {
        await tx.store.delete(d.id);
      }
      await tx.done;
    }
  } catch {
    // Ignore cleanup errors
    await abandonTransaction(tx);
  }
}

export async function cleanupOldAnimalDetections(olderThanDays: number): Promise<number> {
  let tx: IDBPTransaction<SafeOSDB, ['animal_detection'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    
    const detections = await db.getAll('animal_detection');
    const toDelete = detections.filter(d => d.timestamp < cutoff && d.acknowledged);
    
    tx = db.transaction('animal_detection', 'readwrite');
    for (const d of toDelete) {
      await tx.store.delete(d.id);
    }
    await tx.done;
    
    return toDelete.length;
  } catch {
    await abandonTransaction(tx);
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

/**
 * Clear every local record in one transaction, including frames and profiles. The clear names
 * itself in the database and, before it commits, in local storage, so a failed save that waits
 * in any tab is not written afterwards. If either cannot be written, nothing is cleared.
 */
export async function clearClientData(): Promise<void> {
  const db = await getDB();
  const names = Array.from(db.objectStoreNames);
  const tx = db.transaction(names, 'readwrite');
  try {
    await Promise.all([
      ...names.filter((name) => name !== 'clear_generation').map((name) => tx.objectStore(name).clear()),
      tx.objectStore('clear_generation').put(newClearValue(), 'current'),
    ]);
    writeLocalClearMarker();
  } catch (error) {
    try { tx.abort(); } catch { /* A failed request has already aborted it. */ }
    await tx.done.catch(() => {});
    throw error;
  }
  await tx.done;
}
