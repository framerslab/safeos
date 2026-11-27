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
  picturesMarkerHolds, writeAccountClearMarker, writeLocalClearMarker, writePicturesClearMarker,
  type ClearStamp, type PictureStamp,
} from './local-data-generation';
import { openDB, type DBSchema, type IDBPDatabase, type IDBPObjectStore, type IDBPTransaction } from 'idb';
import { isCurrentFingerprint } from './visual-fingerprint';
import { expiredPictureIds, type AlertKind, type Box } from './alert-pictures/rules';
import { alertsChanged } from './tab-channel';
import { noteStorageFull } from './storage-full';
import { matchFrameAlerted, recordTime, seenAfterRemoval } from './alert-groups';

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
      /** How many times a monitor event alerted again after its card was made. */
      repeats?: number;
      /** The kind of picture the alert keeps; alerts saved before pictures have none. */
      kind?: AlertKind;
      /** The id of the alert's picture set in alert_picture. */
      pictureId?: string;
      /** The name of the zone that set the alert off, where zones are set. */
      zone?: string;
      /** A Lost and Found sighting's pet. */
      subjectId?: string;
      subjectName?: string;
      details?: AlertDetails;
      exportedPictureId?: string;
    };
    indexes: {
      'by-stream': string;
      'by-created': string;
      'by-producer-created': [string, string];
      'by-retention': [string, number, string];
      'by-producer-retention': [string, string, number, string];
    };
  };
  /**
   * 'current' names the last clear of browser data. 'pictures' names the last committed Delete all
   * pictures. `deletedPetKey` names a pet that was deleted.
   */
  clear_generation: { key: string; value: string };
  /**
   * Each alert's picture set: the frame of the moment, the box round what set the alert off and its
   * close-up. A deleted set leaves a row with no pictures that says why it went.
   */
  alert_picture: {
    key: string;
    value: AlertPictureDB;
    indexes: { 'by-state-taken': [string, number] };
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
      /** The server's answer to the action, kept when the browser could not save it. */
      response?: unknown;
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
      /**
       * True when the check that saved this frame raised the alert, false when it
       * only recorded it. A frame saved before this field existed has none.
       */
      alerted?: boolean;
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

/** A Lost and Found sighting's four scores, kept as data. */
export interface AlertDetails {
  colorMatch: number;
  dominantMatch: number;
  edgeMatch: number;
  sizeMatch: number;
}

/** An alert's picture set as the browser's database keeps it. */
export interface AlertPictureDB {
  id: string;
  state: 'kept' | 'gone';
  kind: AlertKind;
  takenAt: number;
  /** The pet a sighting's picture was taken for. */
  subjectId?: string;
  frame?: Blob;
  frameWidth?: number;
  frameHeight?: number;
  /** The box in the kept frame's pixels. */
  box?: Box | null;
  /** The camera frame's own size, which the close-up was cut from. */
  sourceWidth?: number;
  sourceHeight?: number;
  closeUp?: Blob | null;
  closeUpWidth?: number;
  closeUpHeight?: number;
  dark?: boolean;
  /** Why a set went: its age, or the person deleted it. */
  gone?: 'age' | 'person';
  goneAfterDays?: number;
}

// =============================================================================
// Configuration
// =============================================================================

const DB_NAME = 'safeos-guardian';
const DB_VERSION = 8; // Each alert's picture set, in alert_picture

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

        // Version 8: each alert's picture set.
        if (!db.objectStoreNames.contains('alert_picture')) {
          const pictureStore = db.createObjectStore('alert_picture', { keyPath: 'id' });
          pictureStore.createIndex('by-state-taken', ['state', 'takenAt']);
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

type AlertStores = Array<'alert_cache' | 'clear_generation' | 'alert_picture'>;
type AlertStore<Stores extends AlertStores> = IDBPObjectStore<SafeOSDB, Stores, 'alert_cache', 'readwrite'>;
type PictureStore<Stores extends AlertStores> = IDBPObjectStore<SafeOSDB, Stores, 'alert_picture', 'readwrite'>;

/** The monitoring store marks every alert it saves; the alert engine and the sync service share the rest. */
function alertProducer(record: { monitoring?: boolean }): 'monitoring' | 'shared' {
  return record.monitoring === true ? 'monitoring' : 'shared';
}

function producerRange(producer: string): IDBKeyRange {
  return IDBKeyRange.bound([producer], [producer, []]);
}

/**
 * Only alerts saved after the upgrade count; acknowledged ones leave first, oldest first. Each alert
 * that leaves takes its picture set with it, in the same transaction.
 */
async function pruneMonitoringAlerts<Stores extends AlertStores>(store: AlertStore<Stores>, pictures: PictureStore<Stores>): Promise<void> {
  const index = store.index('by-producer-retention');
  const range = IDBKeyRange.bound(['monitoring', 'new'], ['monitoring', 'new', []]);
  let excess = (await index.count(range)) - MAX_MONITORING_ALERTS;
  let cursor = excess > 0 ? await index.openCursor(range) : null;
  while (cursor && excess-- > 0) {
    const pictureId = cursor.value.pictureId;
    await cursor.delete();
    if (pictureId) await pictures.delete(pictureId);
    cursor = await cursor.continue();
  }
}

/** The limit over every producer's alerts saved after the upgrade, in the same order, with their pictures. */
async function pruneNewAlerts<Stores extends AlertStores>(store: AlertStore<Stores>, pictures: PictureStore<Stores>): Promise<void> {
  const index = store.index('by-retention');
  const range = IDBKeyRange.bound(['new'], ['new', []]);
  let excess = (await index.count(range)) - MAX_CACHED_ALERTS;
  let cursor = excess > 0 ? await index.openCursor(range) : null;
  while (cursor && excess-- > 0) {
    const pictureId = cursor.value.pictureId;
    await cursor.delete();
    if (pictureId) await pictures.delete(pictureId);
    cursor = await cursor.continue();
  }
}

export async function cleanupCaches(): Promise<void> {
  await cleanupOldFrames();
  let tx: IDBPTransaction<SafeOSDB, Array<'alert_cache' | 'alert_picture'>, 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction(['alert_cache', 'alert_picture'], 'readwrite');
    await pruneMonitoringAlerts(tx.objectStore('alert_cache'), tx.objectStore('alert_picture'));
    await pruneNewAlerts(tx.objectStore('alert_cache'), tx.objectStore('alert_picture'));
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

/**
 * Saves a session row. With `current`, the row is written only while `current()` holds, read inside
 * this write's own transaction after its first request: a clear that was in progress when the write
 * was asked for has committed by then. The answer is true when the row was written; a failed write is
 * logged.
 */
export async function saveLocalSession(session: LocalSession, current?: () => boolean): Promise<boolean> {
  let tx: IDBPTransaction<SafeOSDB, ['local_session'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction('local_session', 'readwrite');
    await tx.store.get(session.id);
    if (current && !current()) {
      await tx.done;
      return false;
    }
    await tx.store.put(session);
    await tx.done;
    return true;
  } catch (error) {
    console.warn('[ClientDB] Failed to save session:', error);
    await abandonTransaction(tx);
    return false;
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
 * The saved session to restore: the row of `preferredId` (the session this browser last used) when it
 * is there and valid, otherwise the first valid row in key order; null when the store was read and
 * holds none. It rejects when the database cannot be opened or read, so a failure is never taken for
 * a browser with no session.
 */
export async function readLocalSession(preferredId: string | null = null): Promise<LocalSession | null> {
  const db = await getDB();
  const sessions = await db.getAll('local_session');
  const now = new Date().toISOString();
  const valid = sessions.filter(s => s.expiresAt > now);
  return valid.find(s => s.id === preferredId) || valid[0] || null;
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

/** Deletes one saved session by its id. It rejects when the database cannot be opened or written. */
export async function deleteLocalSession(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('local_session', id);
}

// =============================================================================
// Profile Cache
// =============================================================================

/**
 * Writes the profile to the profile cache. With `current`, the profile is written only while
 * `current()` holds, read inside this write's own transaction after its first request, so a write
 * queued behind a clear in progress is cancelled once that clear has committed. A failed write is
 * logged.
 */
export async function cacheProfile(profile: any, current?: () => boolean): Promise<'saved' | 'cancelled' | 'failed'> {
  let tx: IDBPTransaction<SafeOSDB, ['profile_cache'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction('profile_cache', 'readwrite');
    await tx.store.get(profile.id);
    if (current && !current()) {
      await tx.done;
      return 'cancelled';
    }
    await tx.store.put({
      id: profile.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      preferences: profile.preferences || {},
      notificationSettings: profile.notificationSettings || {},
      updatedAt: new Date().toISOString(),
    });
    await tx.done;
    return 'saved';
  } catch (error) {
    console.warn('[ClientDB] Failed to cache profile:', error);
    await abandonTransaction(tx);
    return 'failed';
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
 * that failed earlier: it writes only when no clear came since. `update` never creates a record.
 * `repeat` writes only while the record is stored and not acknowledged, and otherwise answers
 * `stale` with the stored record in `found`. With `whilePicture`, an `update` writes only while the
 * stored record names that picture.
 */
async function writeAlert(
  alert: any, stamp: ClearStamp | undefined, mode: 'save' | 'update' | 'repeat',
  found?: { stored: any | null; generation?: string; repeats?: number },
  repeats = 1,
  whilePicture?: string,
): Promise<'saved' | 'cancelled' | 'gone' | 'stale' | 'failed'> {
  let tx: IDBPTransaction<SafeOSDB, AlertStores, 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction(['alert_cache', 'clear_generation', 'alert_picture'], 'readwrite');
    const alerts = tx.objectStore('alert_cache');
    const pictures = tx.objectStore('alert_picture');
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
    if (mode === 'update' && (!previous || (whilePicture !== undefined && previous.pictureId !== whilePicture))) {
      await tx.done;
      return 'gone';
    }
    // Another tab may have cleared, removed or acknowledged the card a repeat was for.
    if (mode === 'repeat' && (!previous || previous.acknowledged)) {
      if (found) {
        found.stored = previous ?? null;
        // A save made for this repeat afterwards is cancelled by a clear that comes between.
        found.generation = generation;
      }
      await tx.done;
      return 'stale';
    }
    // A partial write, such as an acknowledgement, keeps the stored fields it does not carry.
    const merged: any = {
      ...previous,
      ...Object.fromEntries(Object.entries(alert).filter(([, value]) => value !== undefined)),
    };
    // A repeat counts onto the stored card in the order repeats are saved: `repeats` of them, when
    // the saves of earlier repeats failed and wait with this one.
    if (mode === 'repeat') {
      const counted = previous?.repeats;
      merged.repeats = (typeof counted === 'number' ? counted : 0) + repeats;
      if (found) found.repeats = merged.repeats;
      // A repeat names its own picture and zone, or none: the card's earlier ones go with it.
      merged.pictureId = alert.pictureId;
      merged.zone = alert.zone;
    }
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
      ...(typeof merged.repeats === 'number' && merged.repeats > 0 ? { repeats: merged.repeats } : {}),
      ...(merged.kind ? { kind: merged.kind } : {}),
      ...(merged.pictureId ? { pictureId: merged.pictureId } : {}),
      ...(merged.zone ? { zone: merged.zone } : {}),
      ...(merged.subjectId ? { subjectId: merged.subjectId } : {}),
      ...(merged.subjectName ? { subjectName: merged.subjectName } : {}),
      ...(merged.details ? { details: merged.details } : {}),
      ...(merged.exportedPictureId ? { exportedPictureId: merged.exportedPictureId } : {}),
    });
    // A card takes one picture set: a repeat's newer set replaces the one the card had.
    if (previous?.pictureId && previous.pictureId !== merged.pictureId) await pictures.delete(previous.pictureId);
    if (producer === 'monitoring') await pruneMonitoringAlerts(alerts, pictures);
    await pruneNewAlerts(alerts, pictures);
    await tx.done;
    // Every tab of this device hears when an alert is saved, marked as seen or
    // deleted, and reads its alerts again.
    alertsChanged();
    return 'saved';
  } catch (error) {
    noteStorageFull(error);
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
export async function cacheAlert(alert: any, stamp?: ClearStamp, outcome?: { result?: string }): Promise<boolean> {
  const result = await writeAlert(alert, stamp, 'save');
  // `cancelled`: a clear came after the stamp, and nothing was written.
  if (outcome) outcome.result = result;
  return result !== 'failed';
}

/**
 * An acknowledgement or any other partial update. It never creates a record. With `whilePicture`, it
 * is for the alert as it shows with that picture: a card a repeat gave another picture is left as it is.
 */
export async function updateCachedAlert(alert: any, stamp?: ClearStamp, whilePicture?: string): Promise<'updated' | 'gone' | 'failed'> {
  const result = await writeAlert(alert, stamp, 'update', undefined, undefined, whilePicture);
  if (result === 'saved') return 'updated';
  return result === 'failed' ? 'failed' : 'gone';
}

/**
 * A repeat of an event's alert, written onto the event's card. The card is read in the same
 * transaction as the write, and its count of repeats is the stored count plus `repeats` (one, or
 * more when the saves of earlier repeats failed and are written with this one), so repeats
 * count in the order they are saved. It is written only while it is stored and not acknowledged: another
 * tab may have cleared, removed or acknowledged it. `stale` carries the stored card, or null when
 * it is gone, and the clear generation read with it. `cancelled`: a clear came after a failed save's stamp, and nothing is left to save.
 */
export async function repeatCachedAlert(alert: any, stamp?: ClearStamp, repeats = 1): Promise<
  | { kind: 'updated'; repeats: number }
  | { kind: 'cancelled' | 'failed' }
  | { kind: 'stale'; stored: any | null; generation: string }
> {
  const found: { stored: any | null; generation?: string; repeats?: number } = { stored: null };
  const result = await writeAlert(alert, stamp, 'repeat', found, repeats);
  if (result === 'stale') return { kind: 'stale', stored: found.stored, generation: found.generation ?? '' };
  if (result === 'saved') return { kind: 'updated', repeats: found.repeats ?? 1 };
  return { kind: result === 'failed' ? 'failed' : 'cancelled' };
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
  const tx = db.transaction(['alert_cache', 'alert_picture'], 'readwrite');
  const alerts = tx.objectStore('alert_cache');
  const alert = await alerts.get(id);
  if (alert?.monitoring) {
    await alerts.delete(id);
    // The alert's picture set goes with it.
    if (alert.pictureId) await tx.objectStore('alert_picture').delete(alert.pictureId);
  }
  await tx.done;
  alertsChanged();
}

/**
 * Clear all: deletes every monitoring alert and names the clear, in the database and in local
 * storage, so a failed save that waits in any tab is not written afterwards.
 */
export async function clearCachedMonitoringAlerts(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['alert_cache', 'clear_generation', 'alert_picture'], 'readwrite');
  try {
    let cursor = await tx.objectStore('alert_cache').index('by-producer-created').openCursor(producerRange('monitoring'));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    // Every picture set belongs to a watch's alert: they go with the alerts.
    await tx.objectStore('alert_picture').clear();
    await tx.objectStore('clear_generation').put(newClearValue(), 'current');
    writeLocalClearMarker();
  } catch (error) {
    try { tx.abort(); } catch { /* A failed request has already aborted it. */ }
    await tx.done.catch(() => {});
    throw error;
  }
  await tx.done;
  alertsChanged();
}

// =============================================================================
// Alert pictures
// =============================================================================

const KEPT_RANGE = (): IDBKeyRange => IDBKeyRange.bound(['kept'], ['kept', []]);

/** A transaction a failed write abandons. */
type Abandonable = { abort(): void; done: Promise<void>; error: DOMException | null };

function isQuotaError(error: unknown): boolean {
  return (error as { name?: string } | null | undefined)?.name === 'QuotaExceededError';
}

/** The row a deleted picture set leaves: no pictures, and why it went. */
function goneRow(row: AlertPictureDB, gone: 'age' | 'person', days?: number): AlertPictureDB {
  return { id: row.id, state: 'gone', kind: row.kind, takenAt: row.takenAt, gone, ...(gone === 'age' ? { goneAfterDays: days } : {}) };
}

/**
 * Saves an alert's picture set. It is written only while no clear came since `stamp` was taken at
 * the alert: not Clear all, Clear all data on this device or sign-out (the clear generation, or the clear
 * marker when this tab had read none), and not Delete all pictures (the pictures marker); and not
 * over the row that says the set was deleted, which another tab writes for a set it cannot read; and not
 * for a pet that was deleted. Out of
 * room, the oldest kept sets make way one at a time, each try its own transaction that deletes
 * them and writes the new set together; when the new set finds no room even with every older set
 * gone, nothing is deleted and the answer is `out-of-room`, which is noted for the visit so the dashboard says the device is
 * out of room (lib/storage-full). A save that made room by deleting older sets notes nothing.
 */
export async function saveAlertPicture(record: AlertPictureDB, stamp: PictureStamp): Promise<
  { result: 'saved'; deleted: string[] } | { result: 'dropped' | 'out-of-room' | 'failed' }
> {
  let db: IDBPDatabase<SafeOSDB>;
  try {
    db = await getDB();
  } catch {
    return { result: 'failed' };
  }
  // The browser's last refusal for lack of room.
  let refused: unknown = null;
  for (let take = 0; ; take++) {
    let tx: Abandonable | undefined;
    try {
      const write = db.transaction(['alert_picture', 'clear_generation'], 'readwrite');
      tx = write;
      // A clear writes the clear generation too, so it runs wholly before or wholly after this.
      const generations = write.objectStore('clear_generation');
      const generation = (await generations.get('current')) ?? '';
      const current = stamp.clearGeneration !== null
        ? generation === stamp.clearGeneration
        : readLocalClearMarker() === stamp.clearMarker;
      const picturesGeneration = (await generations.get('pictures')) ?? '';
      if (!current || !picturesMarkerHolds(stamp.picturesMarker, picturesGeneration)) {
        await write.done;
        return { result: 'dropped' };
      }
      const pictures = write.objectStore('alert_picture');
      // A tab that could not read the set deleted it before it was written: it stays deleted. So does
      // the picture of a pet that was deleted meanwhile.
      const petDeleted = record.subjectId !== undefined && (await generations.get(deletedPetKey(record.subjectId))) !== undefined;
      if (petDeleted || (await pictures.get(record.id))?.state === 'gone') {
        await write.done;
        return { result: 'dropped' };
      }
      const deleted: string[] = [];
      if (take > 0) {
        // The oldest kept sets taken before this one, never this one.
        const older = IDBKeyRange.bound(['kept'], ['kept', record.takenAt], false, true);
        let cursor = await pictures.index('by-state-taken').openCursor(older);
        while (cursor && deleted.length < take) {
          if (cursor.value.id !== record.id) {
            deleted.push(cursor.value.id);
            await cursor.delete();
          }
          cursor = await cursor.continue();
        }
        if (deleted.length < take) {
          await abandonTransaction(write);
          noteStorageFull(refused);
          return { result: 'out-of-room' };
        }
      }
      await pictures.put(record);
      await write.done;
      return { result: 'saved', deleted };
    } catch (error) {
      const quota = isQuotaError(error) ? error : isQuotaError(tx?.error) ? tx?.error : null;
      await abandonTransaction(tx);
      if (quota) {
        refused = quota;
        continue;
      }
      return { result: 'failed' };
    }
  }
}

/** An alert's picture set, or null when none is stored. It throws on a failed read, which is not "none". */
export async function getAlertPicture(id: string): Promise<AlertPictureDB | null> {
  const db = await getDB();
  return (await db.get('alert_picture', id)) ?? null;
}

/**
 * Deletes one kept picture set, leaving the row that says the person deleted it. A set that
 * cannot be read is cleared without reading it, from what the alert itself says of it (`known`):
 * the row that says it went takes its place.
 */
export async function goneAlertPicture(
  id: string,
  reason: 'person',
  known?: { kind: AlertKind; takenAt: number },
): Promise<'deleted' | 'failed'> {
  let tx: Abandonable | undefined;
  try {
    const db = await getDB();
    const write = db.transaction(['alert_picture'], 'readwrite');
    tx = write;
    const pictures = write.objectStore('alert_picture');
    const row = await pictures.get(id);
    if (row && row.state === 'kept') await pictures.put(goneRow(row, reason));
    // A set whose save waits (for room, or behind another write) has no row yet: the row that
    // says it was deleted stands in its place, so that save writes nothing.
    else if (!row && known) await pictures.put(goneRow({ id, state: 'gone', kind: known.kind, takenAt: known.takenAt }, reason));
    await tx.done;
    return 'deleted';
  } catch {
    await abandonTransaction(tx);
  }
  if (!known) return 'failed';
  let blind: Abandonable | undefined;
  try {
    const db = await getDB();
    const write = db.transaction(['alert_picture'], 'readwrite');
    blind = write;
    await write.objectStore('alert_picture').put({ id, state: 'gone', kind: known.kind, takenAt: known.takenAt, gone: reason });
    await blind.done;
    return 'deleted';
  } catch {
    await abandonTransaction(blind);
    return 'failed';
  }
}

/**
 * Delete all pictures leaves a deleted row for each kept set and commits the pictures
 * generation in the same transaction. A waiting save reads that generation, so an abort
 * leaves its stamp valid even while the pending marker is visible in other tabs.
 */
export async function goneAllAlertPictures(): Promise<{ result: 'deleted'; ids: string[] } | { result: 'failed' }> {
  let tx: Abandonable | undefined;
  try {
    const db = await getDB();
    const write = db.transaction(['alert_picture', 'clear_generation'], 'readwrite');
    tx = write;
    const pictures = write.objectStore('alert_picture');
    const generations = write.objectStore('clear_generation');
    const before = (await generations.get('pictures')) ?? '';
    const pending = newClearValue();
    const ids: string[] = [];
    let cursor = await pictures.index('by-state-taken').openCursor(KEPT_RANGE());
    while (cursor) {
      ids.push(cursor.value.id);
      await cursor.update(goneRow(cursor.value, 'person'));
      cursor = await cursor.continue();
    }
    await generations.put(pending, 'pictures');
    writePicturesClearMarker(pending, before);
    await tx.done;
    return { result: 'deleted', ids };
  } catch {
    await abandonTransaction(tx);
    return { result: 'failed' };
  }
}

/**
 * Deletes the kept sets at or past `days` old, leaving rows that say after how long. Answers their
 * ids. `stillChosen` is asked inside the transaction, once the kept sets are read and again once
 * their rows are written, before it commits: false deletes nothing.
 */
export async function goneExpiredAlertPictures(days: number, now: number, stillChosen: () => boolean = () => true): Promise<string[]> {
  let tx: Abandonable | undefined;
  try {
    const db = await getDB();
    const write = db.transaction(['alert_picture'], 'readwrite');
    tx = write;
    const pictures = write.objectStore('alert_picture');
    const kept: Array<{ id: string; takenAt: number }> = [];
    let cursor = await pictures.index('by-state-taken').openCursor(KEPT_RANGE());
    while (cursor) {
      kept.push({ id: cursor.value.id, takenAt: cursor.value.takenAt });
      cursor = await cursor.continue();
    }
    // The age may have changed while the sweep waited for the store: then it deletes nothing.
    if (!stillChosen()) {
      await abandonTransaction(tx);
      return [];
    }
    const expired = expiredPictureIds(kept, now, days);
    for (const id of expired) {
      const row = await pictures.get(id);
      if (row) await pictures.put(goneRow(row, 'age', days));
    }
    // Asked again once the rows are written, before the transaction commits: a longer age chosen
    // while they were written undoes them.
    if (expired.length > 0 && !stillChosen()) {
      await abandonTransaction(tx);
      return [];
    }
    await tx.done;
    return expired;
  } catch {
    await abandonTransaction(tx);
    return [];
  }
}

/** How many picture sets are kept on this device. It throws on a failed read. */
export async function countKeptAlertPictures(): Promise<number> {
  const db = await getDB();
  return db.countFromIndex('alert_picture', 'by-state-taken', KEPT_RANGE());
}

/**
 * Deletes the rows no alert holds, taken before `olderThan`: a set whose card left before it was
 * saved. The saved alerts are read in the same transaction, so a read that fails deletes nothing,
 * and every saved alert's picture is held, whoever saved it; `held` adds the pictures this tab
 * shows that are not saved.
 */
export async function sweepUnheldAlertPictures(held: ReadonlySet<string>, olderThan: number): Promise<void> {
  let tx: Abandonable | undefined;
  try {
    const db = await getDB();
    const write = db.transaction(['alert_cache', 'alert_picture'], 'readwrite');
    tx = write;
    const holding = new Set(held);
    let saved = await write.objectStore('alert_cache').openCursor();
    while (saved) {
      const pictureId = (saved.value as { pictureId?: unknown }).pictureId;
      if (typeof pictureId === 'string') holding.add(pictureId);
      saved = await saved.continue();
    }
    let cursor = await write.objectStore('alert_picture').openCursor();
    while (cursor) {
      if (!holding.has(cursor.value.id) && cursor.value.takenAt < olderThan) await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  } catch {
    await abandonTransaction(tx);
  }
}

/**
 * Whether this tab can keep pictures: `database-notice` while a reload notice holds the database,
 * else a row written and deleted in one transaction says `usable`, and any failure `unusable`.
 */
export async function probeAlertPictureStore(): Promise<'usable' | 'unusable' | 'database-notice'> {
  if (getDatabaseNotice()) return 'database-notice';
  let tx: Abandonable | undefined;
  try {
    const db = await getDB();
    const write = db.transaction(['alert_picture'], 'readwrite');
    tx = write;
    const pictures = write.objectStore('alert_picture');
    await pictures.put({ id: 'probe', state: 'gone', kind: 'motion', takenAt: 0 });
    await pictures.delete('probe');
    await tx.done;
    return 'usable';
  } catch {
    await abandonTransaction(tx);
    return getDatabaseNotice() ? 'database-notice' : 'unusable';
  }
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
  /**
   * The server's answer, kept when the server confirmed the action and the browser could not save
   * it. An action that carries one is not sent again: its answer is applied at the next sync.
   */
  response?: unknown;
}

export async function queueSyncAction(
  action: Omit<SyncAction, 'id' | 'createdAt' | 'retries' | 'lastError' | 'response'>
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

/**
 * Keeps the server's answer on a queued action whose record update failed, with no new try
 * counted. False means the queue could not be written, and the action is as it was. The read and
 * the write share one transaction, so a clear in another tab cannot fall between them and have
 * the emptied entry written back.
 */
export async function keepSyncResponse(id: string, response: unknown, error: string): Promise<boolean> {
  let tx: IDBPTransaction<SafeOSDB, ['sync_queue'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction('sync_queue', 'readwrite');
    const action = await tx.store.get(id);
    if (!action) {
      await tx.done;
      return false;
    }
    await tx.store.put({ ...action, response, lastError: error });
    await tx.done;
    return true;
  } catch {
    await abandonTransaction(tx);
    return false;
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

/**
 * What this device keeps, counted for Settings, Data on this device: alerts
 * (the alert records and the wildlife sightings), saved pictures (Lost and
 * Found's and People's frames, and the alert pictures kept, not the rows that
 * say a picture went) and pets (every saved subject but a person). A read that
 * fails throws.
 */
export async function countKeptRecords(): Promise<{ alerts: number; pictures: number; pets: number }> {
  const db = await getDB();
  const [alerts, sightings, matches, intrusions, alertPictures, subjects] = await Promise.all([
    db.count('alert_cache'),
    db.count('animal_detection'),
    db.count('match_frame'),
    db.count('intrusion_frame'),
    db.countFromIndex('alert_picture', 'by-state-taken', KEPT_RANGE()),
    db.getAll('subject_profile'),
  ]);
  return {
    alerts: alerts + sightings,
    pictures: matches + intrusions + alertPictures,
    pets: subjects.filter((subject) => subject.type !== 'person').length,
  };
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

/**
 * Saves a subject. With `current`, it is written only while `current()` holds, read inside this
 * write's own transaction after its first request, so a save queued behind a clear of all local
 * data in progress is cancelled once that clear has committed. A failed write is logged. A pet
 * that was deleted and is saved again keeps its pictures again.
 */
export async function saveSubjectProfile(
  profile: SubjectProfileDB,
  current?: () => boolean
): Promise<'saved' | 'cancelled' | 'failed'> {
  let tx: IDBPTransaction<SafeOSDB, ['subject_profile', 'clear_generation'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction(['subject_profile', 'clear_generation'], 'readwrite');
    const subjects = tx.objectStore('subject_profile');
    await subjects.get(profile.id);
    if (current && !current()) {
      await tx.done;
      return 'cancelled';
    }
    await Promise.all([
      subjects.put(profile),
      tx.objectStore('clear_generation').delete(deletedPetKey(profile.id)),
    ]);
    await tx.done;
    return 'saved';
  } catch (error) {
    console.warn('[ClientDB] Failed to save subject profile:', error);
    await abandonTransaction(tx);
    return 'failed';
  }
}

/**
 * Save the fingerprint a saved subject was rebuilt into. `snapshot` is the
 * subject as it was when the rebuild began; only its id is read. In one
 * transaction the saved subject is read and only its fingerprint replaced,
 * so photos, matches and activity saved meanwhile stay. Nothing is written
 * when the subject was deleted meanwhile or its saved fingerprint is already
 * in the current form (a photo added on its page rebuilds it too).
 */
export async function saveUpgradedSubjectFingerprint(
  snapshot: SubjectProfileDB,
  fingerprint: SubjectProfileDB['fingerprint']
): Promise<void> {
  let tx: IDBPTransaction<SafeOSDB, ['subject_profile'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction('subject_profile', 'readwrite');
    const saved = await tx.store.get(snapshot.id);
    if (saved && !isCurrentFingerprint(saved.fingerprint)) {
      await tx.store.put({ ...saved, fingerprint });
    }
    await tx.done;
  } catch (error) {
    console.warn('[ClientDB] Failed to save rebuilt subject fingerprint:', error);
    await abandonTransaction(tx);
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

/**
 * The pets saved on this device for Lost and Found, and the things saved
 * there as objects, newest first, for the watch's Watch for, which takes the
 * newest pet until one is chosen. A subject an earlier version saved as a
 * person is left out. Unlike getAllSubjectProfiles, a read that fails throws,
 * so the watch can say the saved pets could not be read.
 */
export async function readSavedPets(): Promise<SubjectProfileDB[]> {
  const db = await getDB();
  const profiles = await db.getAll('subject_profile');
  return profiles
    .filter((profile) => profile.type !== 'person')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSubjectProfilesByType(type: 'pet' | 'person' | 'other'): Promise<SubjectProfileDB[]> {
  try {
    const db = await getDB();
    return await db.getAllFromIndex('subject_profile', 'by-type', type);
  } catch {
    return [];
  }
}

/** Under this key in `clear_generation`, the note that a pet was deleted keeps its pictures out that are saved later. */
const deletedPetKey = (id: string): string => `deleted-pet:${id}`;
const DELETED_PETS = () => IDBKeyRange.bound(deletedPetKey(''), deletedPetKey('\uffff'));

/** A picture an alert names that has no row may be drawn or saved for this long; after that none was kept. */
const PICTURE_ON_ITS_WAY_MS = 60_000;

/**
 * Deletes a pet with its saved pictures, in one transaction: the frames an earlier version saved
 * for it, and the pictures kept for its sightings, whose alerts keep their words. A picture of it
 * that is on its way finds the note that it was deleted and is not kept, in any tab. Answers the
 * ids of the sightings' pictures that went; `failed` deleted nothing.
 */
export async function deleteSubjectProfile(
  id: string,
): Promise<{ result: 'deleted'; pictureIds: string[] } | { result: 'failed' }> {
  let tx: Abandonable | undefined;
  try {
    const db = await getDB();
    const write = db.transaction(
      ['subject_profile', 'match_frame', 'alert_cache', 'alert_picture', 'clear_generation'], 'readwrite',
    );
    tx = write;
    const frames = write.objectStore('match_frame');
    const pictures = write.objectStore('alert_picture');
    const [earlierIds, alerts] = await Promise.all([
      frames.index('by-subject').getAllKeys(id),
      write.objectStore('alert_cache').index('by-producer-created').getAll(producerRange('monitoring')),
    ]);
    const pictureIds: string[] = [];
    const now = Date.now();
    for (const alert of alerts) {
      if (alert.kind !== 'sighting' || alert.subjectId !== id || !alert.pictureId) continue;
      const picture = await pictures.get(alert.pictureId);
      const takenAt = picture?.takenAt ?? recordTime({ id: alert.pictureId }) ?? recordTime(alert) ?? 0;
      // With no row, a picture on its way gets the mark that keeps its save out; one that was never
      // kept gets none, so its alert does not say the person deleted it.
      if (picture ? picture.state === 'gone' : now - takenAt > PICTURE_ON_ITS_WAY_MS) continue;
      await pictures.put({ id: alert.pictureId, state: 'gone', kind: 'sighting', gone: 'person', takenAt });
      pictureIds.push(alert.pictureId);
    }
    // A picture can be kept before its alert is saved: it says itself whose it is.
    let cursor = await pictures.index('by-state-taken').openCursor(KEPT_RANGE());
    while (cursor) {
      if (cursor.value.subjectId === id) {
        pictureIds.push(cursor.value.id);
        await cursor.update(goneRow(cursor.value, 'person'));
      }
      cursor = await cursor.continue();
    }
    await Promise.all([
      write.objectStore('subject_profile').delete(id),
      write.objectStore('clear_generation').put(newClearValue(), deletedPetKey(id)),
      ...earlierIds.map((frameId) => frames.delete(frameId)),
    ]);
    await write.done;
    alertsChanged();
    return { result: 'deleted', pictureIds };
  } catch (error) {
    console.warn('[ClientDB] Failed to delete subject profile:', error);
    await abandonTransaction(tx);
    return { result: 'failed' };
  }
}

export async function updateSubjectMatchCount(id: string, increment: number = 1): Promise<void> {
  let tx: IDBPTransaction<SafeOSDB, ['subject_profile'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    // The count is read and written in one transaction, so a fingerprint or
    // photos saved meanwhile (a rebuild, a photo added) are kept.
    tx = db.transaction('subject_profile', 'readwrite');
    const profile = await tx.store.get(id);
    if (profile) {
      await tx.store.put({ ...profile, matchCount: profile.matchCount + increment, lastActiveAt: new Date().toISOString() });
    }
    await tx.done;
  } catch (error) {
    console.warn('[ClientDB] Failed to update subject match count:', error);
    await abandonTransaction(tx);
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
  /**
   * True when the check that saved this frame raised the alert, false when it
   * only recorded it. A frame saved before this field existed has none.
   */
  alerted?: boolean;
}

/**
 * Saves a match of the comparison. Nothing is written once this tab has cleared all local data
 * since `generation`. With `current`, the match is written only while `current()` holds, read
 * inside this write's own transaction after its first request, so a save queued behind another
 * tab's clear of all local data in progress is cancelled once that clear has committed.
 */
export async function saveMatchFrame(
  frame: MatchFrameDB,
  generation = getLocalDataGeneration(),
  current?: () => boolean
): Promise<void> {
  let tx: IDBPTransaction<SafeOSDB, ['match_frame'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    if (!isCurrentLocalData(generation)) return;
    if (current) {
      tx = db.transaction('match_frame', 'readwrite');
      await tx.store.get(frame.id);
      if (!current()) {
        await tx.done;
        return;
      }
      await tx.store.put(frame);
      await tx.done;
      tx = undefined;
    } else {
      await db.put('match_frame', frame);
    }
    alertsChanged();

    // Update subject match count
    if (!isCurrentLocalData(generation) || (current && !current())) return;
    await updateSubjectMatchCount(frame.subjectId, 1);

    // Enforce max limit
    await cleanupExcessMatchFrames();
  } catch (error) {
    noteStorageFull(error);
    console.warn('[ClientDB] Failed to save match frame:', error);
    await abandonTransaction(tx);
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

/** A kept picture and the sighting whose words it belongs to. */
export interface KeptSightingPicture {
  id: string;
  alertId: string;
  subjectId: string;
  subjectName?: string;
  timestamp: number;
  acknowledged: boolean;
  exported: boolean;
  details?: AlertDetails;
}

type LostFoundPictureStores = ['alert_cache', 'alert_picture', 'match_frame'];

/** Read the alert and picture indexes together, without loading the picture Blobs. */
async function readKeptSightingPictures(
  tx: IDBPTransaction<SafeOSDB, LostFoundPictureStores, 'readonly'>,
  subjectId?: string,
): Promise<KeptSightingPicture[]> {
  const [alerts, pictureIds] = await Promise.all([
    tx.objectStore('alert_cache').index('by-producer-created').getAll(producerRange('monitoring')),
    tx.objectStore('alert_picture').index('by-state-taken').getAllKeys(KEPT_RANGE()),
  ]);
  const kept = new Set(pictureIds);
  return alerts.flatMap((alert) => {
    const { subjectId: pet, pictureId } = alert;
    if (alert.kind !== 'sighting' || !pet || !pictureId || !kept.has(pictureId)) return [];
    if (subjectId !== undefined && pet !== subjectId) return [];
    return [{
      id: pictureId,
      alertId: alert.id,
      subjectId: pet,
      subjectName: alert.subjectName,
      timestamp: recordTime({ id: pictureId }) ?? recordTime(alert) ?? 0,
      acknowledged: alert.acknowledged,
      exported: alert.exportedPictureId === pictureId,
      details: alert.details,
    }];
  });
}

/** Every picture kept for Lost and Found, including frames from earlier versions. */
export async function getSavedSightingPictures(subjectId?: string): Promise<(MatchFrameDB | KeptSightingPicture)[]> {
  const db = await getDB();
  const tx = db.transaction(['alert_cache', 'alert_picture', 'match_frame'], 'readonly');
  const frames = tx.objectStore('match_frame');
  const [earlier, sightings] = await Promise.all([
    subjectId === undefined ? frames.getAll() : frames.index('by-subject').getAll(subjectId),
    readKeptSightingPictures(tx, subjectId),
    tx.done,
  ]);
  return [...earlier, ...sightings];
}

/** Counts pictures that are still kept. A failed read leaves the count unknown. */
export async function countMatchFramesBySubject(subjectIds: string[]): Promise<Record<string, number> | null> {
  if (subjectIds.length === 0) return {};
  try {
    const db = await getDB();
    const tx = db.transaction(['alert_cache', 'alert_picture', 'match_frame'], 'readonly');
    const index = tx.objectStore('match_frame').index('by-subject');
    const [earlier, sightings] = await Promise.all([
      Promise.all(subjectIds.map((id) => index.count(id))),
      readKeptSightingPictures(tx),
      tx.done,
    ]);
    const counts = new Map(subjectIds.map((id, index) => [id, earlier[index]]));
    for (const sighting of sightings) {
      const count = counts.get(sighting.subjectId);
      if (count !== undefined) counts.set(sighting.subjectId, count + 1);
    }
    return Object.fromEntries(counts);
  } catch {
    return null;
  }
}

/** Every Lost and Found frame, newest first. Unlike getAllMatchFrames, a read that fails throws. */
export async function readAllMatchFrames(): Promise<MatchFrameDB[]> {
  const db = await getDB();
  const frames = await db.getAll('match_frame');
  return frames.sort((a, b) => b.timestamp - a.timestamp);
}

/** The newest Lost and Found frames, at most `limit`. Unlike getAllMatchFrames, a read that fails throws. */
export async function readNewestMatchFrames(limit: number): Promise<MatchFrameDB[]> {
  return (await readAllMatchFrames()).slice(0, limit);
}

export async function getAllMatchFrames(limit?: number): Promise<MatchFrameDB[]> {
  try {
    const sorted = await readAllMatchFrames();
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
      alertsChanged();
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

export async function markMatchFramesExported(ids: string[]): Promise<'updated' | 'failed'> {
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
    return 'updated';
  } catch (error) {
    console.warn('[ClientDB] Failed to mark match frames exported:', error);
    await abandonTransaction(tx);
    return 'failed';
  }
}

/** Marks these frames as seen in one transaction. */
export async function acknowledgeMatchFrames(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  let tx: IDBPTransaction<SafeOSDB, ['match_frame'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction('match_frame', 'readwrite');

    for (const id of ids) {
      const frame = await tx.store.get(id);
      if (frame) {
        frame.acknowledged = true;
        await tx.store.put(frame);
      }
    }

    await tx.done;
    alertsChanged();
  } catch (error) {
    // A device out of room says so on the dashboard.
    noteStorageFull(error);
    console.warn('[ClientDB] Failed to acknowledge match frames:', error);
    await abandonTransaction(tx);
  }
}

export async function deleteMatchFrame(id: string): Promise<'deleted' | 'failed'> {
  try {
    const db = await getDB();
    await db.delete('match_frame', id);
    alertsChanged();
    return 'deleted';
  } catch (error) {
    console.warn('[ClientDB] Failed to delete match frame:', error);
    return 'failed';
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
    alertsChanged();
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
      // An alert is made of the frames that raised it, as History counts them, so a
      // frame under the alert threshold neither joins a run nor takes the mark.
      const { useLostFoundStore } = await import('../stores/lost-found-store');
      const alertThreshold = useLostFoundStore.getState().settings.minConfidenceForAlert;

      // The frames are read in the write that removes and marks them, so a
      // picture deleted in the meantime is neither kept nor written back.
      tx = db.transaction('match_frame', 'readwrite');
      const frames = await tx.store.getAll();
      if (frames.length <= MAX_MATCH_FRAMES) {
        await tx.done;
        return;
      }
      // Get oldest frames that are acknowledged
      const sortedByTime = frames
        .filter(f => f.acknowledged)
        .sort((a, b) => a.timestamp - b.timestamp);
      
      const toDelete = sortedByTime.slice(0, frames.length - MAX_MATCH_FRAMES);
      // An alert whose only seen frames go stays seen: its first kept frame is marked.
      const removed = new Set(toDelete.map((frame) => frame.id));
      const bySubject = new Map<string, MatchFrameDB[]>();
      for (const frame of frames) {
        if (!matchFrameAlerted(frame, alertThreshold)) continue;
        const group = bySubject.get(frame.subjectId);
        if (group) group.push(frame);
        else bySubject.set(frame.subjectId, [frame]);
      }
      const toMark = Array.from(bySubject.values()).flatMap((group) => seenAfterRemoval(group, removed));
      
      for (const frame of toDelete) {
        await tx.store.delete(frame.id);
      }
      for (const frame of toMark) {
        await tx.store.put({ ...frame, acknowledged: true });
      }
      await tx.done;
      // The other tabs hear of the frames the limit removed.
      if (toDelete.length > 0) alertsChanged();
    }
  } catch {
    // Ignore cleanup errors
    await abandonTransaction(tx);
  }
}

// =============================================================================
// Export Match Frames to JSON/CSV
// =============================================================================

export interface MatchFrameExport {
  id: string;
  subjectId: string;
  subjectName?: string;
  confidence?: number;
  timestamp: string;
  colorMatch?: number;
  dominantMatch?: number;
  edgeMatch?: number;
  sizeMatch?: number;
  notes?: string;
}

export async function exportMatchFrames(
  subjectId?: string,
  format: 'json' | 'csv' = 'json',
  ids?: string[],
  keptSightings: KeptSightingPicture[] = [],
): Promise<{ data: string; filename: string }> {
  const frames = subjectId
    ? await getMatchFramesBySubject(subjectId)
    : await getAllMatchFrames();

  const selectedFrames = ids !== undefined
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
  
  for (const sighting of keptSightings) {
    exportData.push({
      id: sighting.id,
      subjectId: sighting.subjectId,
      subjectName: sighting.subjectName ?? profileMap.get(sighting.subjectId),
      timestamp: new Date(sighting.timestamp).toISOString(),
      ...sighting.details,
    });
  }

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
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
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

type IntrusionFrameStore = IDBPObjectStore<SafeOSDB, ['intrusion_frame'], 'intrusion_frame', 'readwrite'>;

export async function saveIntrusionFrame(frame: IntrusionFrameDB): Promise<void> {
  let tx: IDBPTransaction<SafeOSDB, ['intrusion_frame'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction('intrusion_frame', 'readwrite');
    await tx.store.put(frame);
    if (await tx.store.count() > MAX_INTRUSION_FRAMES) {
      await pruneIntrusionFrames(tx.store, await tx.store.getAll());
    }
    await tx.done;
    alertsChanged();
  } catch (error) {
    await abandonTransaction(tx);
    noteStorageFull(error);
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

/** Every People frame, newest first. Unlike getAllIntrusionFrames, a read that fails throws. */
export async function readAllIntrusionFrames(): Promise<IntrusionFrameDB[]> {
  const db = await getDB();
  let frames = await db.getAll('intrusion_frame');
  if (frames.length > MAX_INTRUSION_FRAMES) {
    // Older builds could leave an oversized library. Read it again inside
    // the write transaction so a save or an acknowledgement in another tab holds.
    const tx = db.transaction('intrusion_frame', 'readwrite');
    try {
      const current = await tx.store.getAll();
      const kept = await pruneIntrusionFrames(tx.store, current);
      await tx.done;
      frames = kept;
      if (kept.length < current.length) alertsChanged();
    } catch (error) {
      await abandonTransaction(tx);
      noteStorageFull(error);
      console.warn('[ClientDB] Failed to trim saved People pictures:', error);
    }
  }
  return frames.sort((a, b) => b.timestamp - a.timestamp);
}

/** The newest People frames, at most `limit`. Unlike getAllIntrusionFrames, a read that fails throws. */
export async function readNewestIntrusionFrames(limit: number): Promise<IntrusionFrameDB[]> {
  return (await readAllIntrusionFrames()).slice(0, limit);
}

export async function getAllIntrusionFrames(limit?: number): Promise<IntrusionFrameDB[]> {
  try {
    const sorted = await readAllIntrusionFrames();
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

async function updateIntrusionFrame(
  id: string, updates: Partial<Pick<IntrusionFrameDB, 'acknowledged' | 'notes'>>,
): Promise<boolean> {
  const db = await getDB();
  const tx = db.transaction('intrusion_frame', 'readwrite');
  try {
    const frame = await tx.store.get(id);
    if (frame) await tx.store.put({ ...frame, ...updates });
    await tx.done;
    return Boolean(frame);
  } catch (error) {
    await abandonTransaction(tx);
    throw error;
  }
}

export async function acknowledgeIntrusionFrame(id: string): Promise<void> {
  try {
    if (await updateIntrusionFrame(id, { acknowledged: true })) alertsChanged();
  } catch (error) {
    console.warn('[ClientDB] Failed to acknowledge intrusion frame:', error);
  }
}

export async function updateIntrusionFrameNotes(id: string, notes: string): Promise<void> {
  try {
    await updateIntrusionFrame(id, { notes });
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

/** Marks these frames as seen in one transaction. */
export async function acknowledgeIntrusionFrames(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  let tx: IDBPTransaction<SafeOSDB, ['intrusion_frame'], 'readwrite'> | undefined;
  try {
    const db = await getDB();
    tx = db.transaction('intrusion_frame', 'readwrite');

    for (const id of ids) {
      const frame = await tx.store.get(id);
      if (frame) {
        frame.acknowledged = true;
        await tx.store.put(frame);
      }
    }

    await tx.done;
    alertsChanged();
  } catch (error) {
    // A device out of room says so on the dashboard.
    noteStorageFull(error);
    console.warn('[ClientDB] Failed to acknowledge intrusion frames:', error);
    await abandonTransaction(tx);
  }
}

export async function deleteIntrusionFrame(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('intrusion_frame', id);
    alertsChanged();
  } catch (error) {
    console.warn('[ClientDB] Failed to delete intrusion frame:', error);
  }
}

export async function clearAllIntrusionFrames(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear('intrusion_frame');
    alertsChanged();
  } catch (error) {
    console.warn('[ClientDB] Failed to clear intrusion frames:', error);
  }
}

async function pruneIntrusionFrames(
  store: IntrusionFrameStore, frames: IntrusionFrameDB[],
): Promise<IntrusionFrameDB[]> {
  const excess = frames.length - MAX_INTRUSION_FRAMES;
  if (excess <= 0) return frames;

  frames.sort((a, b) => (recordTime(a) ?? Infinity) - (recordTime(b) ?? Infinity));
  const toDelete = [
    ...frames.filter((frame) => frame.acknowledged),
    ...frames.filter((frame) => !frame.acknowledged),
  ].slice(0, excess);

  const removed = new Set(toDelete.map((frame) => frame.id));
  // An alert whose only seen frames go stays seen.
  const toMark = seenAfterRemoval(frames, removed);
  for (const frame of toDelete) await store.delete(frame.id);
  for (const frame of toMark) {
    frame.acknowledged = true;
    await store.put(frame);
  }
  return frames.filter((frame) => !removed.has(frame.id));
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
 * itself in the database and, before it commits, in local storage (the clear marker, and the account
 * marker that session work and profile saves read), so a failed save that waits in any tab is not
 * written afterwards. If any of them cannot be written, nothing is cleared.
 */
export async function clearClientData(): Promise<void> {
  const db = await getDB();
  const names = Array.from(db.objectStoreNames);
  const tx = db.transaction(names, 'readwrite');
  try {
    await Promise.all([
      ...names.filter((name) => name !== 'clear_generation').map((name) => tx.objectStore(name).clear()),
      tx.objectStore('clear_generation').put(newClearValue(), 'current'),
      // Every save of before the clear is refused by it, a deleted pet's among them.
      tx.objectStore('clear_generation').delete(DELETED_PETS()),
    ]);
    writeLocalClearMarker();
    writeAccountClearMarker();
  } catch (error) {
    try { tx.abort(); } catch { /* A failed request has already aborted it. */ }
    await tx.done.catch(() => {});
    throw error;
  }
  await tx.done;
}
