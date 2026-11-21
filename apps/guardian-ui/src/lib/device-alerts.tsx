'use client';

/**
 * The device's alerts
 *
 * One read of this device's four stores for every app page: Motion and
 * sound's records, Lost and Found's and People's frames, and Wildlife's
 * sightings. It says which alerts are new, marks them as seen, and reads
 * again when any tab says the alerts changed.
 *
 * @module lib/device-alerts
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { WayId } from './app-routes';
import { groupAlerts, onlyNew, unseenIds, type DeviceAlert, type SavedRecords } from './alert-groups';
import {
  acknowledgeIntrusionFrames, acknowledgeMatchFrames, getCachedMonitoringAlerts, readAllIntrusionFrames,
  readAllMatchFrames, readSavedPets,
} from './client-db';
import { heldAtFirstRun } from './history-seen';
import { onStorageFull, storageIsFull } from './storage-full';
import { onTabMessage } from './tab-channel';
import { useAnimalAlertStore } from '../stores/animal-alert-store';
import { useLostFoundStore } from '../stores/lost-found-store';
import { useMonitoringStore } from '../stores/monitoring-store';
import { useSecurityStore } from '../stores/security-store';

export type AlertsStatus = 'reading' | 'ready' | 'failed';

export interface DeviceAlerts {
  status: AlertsStatus;
  /** The new alerts of all four ways, newest first. Empty until read and when the read failed. */
  newAlerts: DeviceAlert[];
  /** True once a save failed in this visit because the browser's storage is full. */
  storageFull: boolean;
  /** Marks every new alert of every way as seen in its own store, with every frame of its run. */
  markAllSeen: () => Promise<void>;
  /** Reads this device's alerts again. */
  readAgain: () => void;
}

/** The shortest time between two reads that words from the tabs start. */
const READ_GAP_MS = 2000;

/** Reads the four stores. Throws when the browser will not open the saved alerts. */
export async function readSavedRecords(): Promise<SavedRecords> {
  // Each read throws when the browser will not read its store, so a store
  // that cannot be read is never taken for an empty one. Of the saved
  // subjects only pets and things count for an alert.
  const alerts = await getCachedMonitoringAlerts();
  const [matchFrames, intrusionFrames, subjects] = await Promise.all([
    readAllMatchFrames(), readAllIntrusionFrames(), readSavedPets(),
  ]);
  // Another tab may have written Wildlife's list since this tab read it. Once
  // a save failed for lack of room, this tab's list holds sightings storage
  // could not take, and a read from storage would drop them: zustand's persist
  // merges what it reads over the store's state, list for list.
  if (!storageIsFull()) await useAnimalAlertStore.persist.rehydrate();
  return {
    alerts, matchFrames, intrusionFrames, subjects,
    sightings: useAnimalAlertStore.getState().detectionHistory,
    alertThreshold: useLostFoundStore.getState().settings.minConfidenceForAlert,
  };
}

/** Marks every record of these alerts as seen, each in its own store, and resolves once the marks are saved. */
export async function markSeen(alerts: DeviceAlert[]): Promise<void> {
  const of = (way: WayId) => alerts.filter((alert) => alert.way === way).flatMap((alert) => alert.recordIds);
  const monitoring = useMonitoringStore.getState();
  // The store marks only an alert its list holds.
  await monitoring.hydrateAlerts();
  for (const id of of('monitor')) monitoring.acknowledgeAlert(id);
  await Promise.all([acknowledgeMatchFrames(of('lost-found')), acknowledgeIntrusionFrames(of('security'))]);
  for (const id of of('security')) useSecurityStore.getState().acknowledgeFrame(id);
  if (of('wildlife').length > 0) useAnimalAlertStore.getState().acknowledgeDetections(of('wildlife'));
  // Resolves once the marks queued above are saved: this read waits for the store's writes.
  await useMonitoringStore.getState().hydrateAlerts();
}

/**
 * Calls `run` when this device's alerts changed, in this tab or another: at
 * most once every two seconds, never while the page is hidden, and once when
 * the page comes back into view. Returns the function that ends it.
 */
export function onAlertsChanged(run: () => void): () => void {
  let lastRun = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let missed = false;
  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

  const go = () => {
    timer = null;
    if (hidden()) {
      missed = true;
      return;
    }
    missed = false;
    lastRun = Date.now();
    run();
  };
  const heard = () => {
    if (hidden()) {
      missed = true;
      return;
    }
    if (timer !== null) return;
    const since = Date.now() - lastRun;
    if (since >= READ_GAP_MS) go();
    else timer = setTimeout(go, READ_GAP_MS - since);
  };
  // Back in view, the page reads once, and a word missed while hidden is taken then.
  const shown = () => {
    if (hidden()) return;
    if (missed || timer === null) heard();
  };

  const off = onTabMessage((message) => {
    if (message.type === 'alerts-changed') heard();
  });
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', shown);
  return () => {
    off();
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', shown);
  };
}

const OUTSIDE: DeviceAlerts = {
  status: 'reading',
  newAlerts: [],
  storageFull: false,
  markAllSeen: async () => undefined,
  readAgain: () => undefined,
};

const DeviceAlertsContext = createContext<DeviceAlerts>(OUTSIDE);

export function DeviceAlertsProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AlertsStatus>('reading');
  const [newAlerts, setNewAlerts] = useState<DeviceAlert[]>([]);
  const [storageFull, setStorageFull] = useState(false);
  const live = useRef(true);
  const reads = useRef(0);
  const readOnce = useRef(false);
  const statusNow = useRef<AlertsStatus>('reading');
  const newNow = useRef<DeviceAlert[]>([]);

  const show = useCallback((next: AlertsStatus, alerts: DeviceAlert[]) => {
    statusNow.current = next;
    newNow.current = alerts;
    setStatus(next);
    setNewAlerts(alerts);
  }, []);

  const read = useCallback(async () => {
    const mine = ++reads.current;
    try {
      const records = await readSavedRecords();
      if (!live.current || mine !== reads.current) return;
      const held = heldAtFirstRun(() => unseenIds(records));
      readOnce.current = true;
      show('ready', onlyNew(groupAlerts(records), held));
    } catch (error) {
      if (!live.current || mine !== reads.current) return;
      // A later read that fails keeps the list a read gave before.
      if (readOnce.current) return;
      console.warn('[Alerts] Could not read the alerts saved on this device:', error);
      show('failed', []);
    }
  }, [show]);

  useEffect(() => {
    live.current = true;
    setStorageFull(storageIsFull());
    const offFull = onStorageFull(() => setStorageFull(true));
    void read();
    const offChanged = onAlertsChanged(() => {
      void read();
    });
    // Whatever the page's visibility, the store takes a mark made in another
    // tab, so the alert panel of a watching tab stops its sound.
    const offWord = onTabMessage((message) => {
      if (message.type === 'alerts-changed') void useMonitoringStore.getState().hydrateAlerts();
    });
    return () => {
      live.current = false;
      offFull();
      offChanged();
      offWord();
    };
  }, [read]);

  const markAllSeen = useCallback(async () => {
    await markSeen(newNow.current);
    await read();
  }, [read]);

  const readAgain = useCallback(() => {
    if (statusNow.current === 'failed') show('reading', []);
    void read();
  }, [read, show]);

  return (
    <DeviceAlertsContext.Provider value={{ status, newAlerts, storageFull, markAllSeen, readAgain }}>
      {children}
    </DeviceAlertsContext.Provider>
  );
}

/** Outside a provider: `reading`, no alerts, and two functions that do nothing. */
export function useDeviceAlerts(): DeviceAlerts {
  return useContext(DeviceAlertsContext);
}
