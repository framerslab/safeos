/**
 * The keeper: every alert picture this tab shows, by its id, and the one
 * place a picture is saved or deleted.
 *
 * A picture raised by this tab's watch is registered the moment its alert
 * is raised. It is saved only on a device that has answered the notice,
 * with Keep alert pictures on, in a store that can be written; the choice
 * and the clear markers are read at the alert, so a delete or a clear that
 * comes while the picture is drawn leaves it unwritten. A picture of an
 * alert read from the browser's database is read when a card first shows
 * it. A view's two pictures are object URLs of the set's Blobs, made while
 * a card shows them and revoked when none does.
 *
 * Nothing here sends a picture anywhere: no request, no socket message, no
 * log line.
 *
 * @module lib/alert-pictures/keeper
 */

import { useCallback, useSyncExternalStore } from 'react';

import {
  countKeptAlertPictures,
  getAlertPicture,
  goneAlertPicture,
  goneAllAlertPictures,
  goneExpiredAlertPictures,
  probeAlertPictureStore,
  saveAlertPicture,
  sweepUnheldAlertPictures,
  type AlertPictureDB,
} from '../client-db';
import { pictureStampNow } from '../local-data-generation';
import { useMonitoringStore } from '../../stores/monitoring-store';
import { useAlertPicturesStore, type DeleteAfterDays } from '../../stores/alert-pictures-store';
import type { PictureSet } from './capture';
import { onPictureNews, postPictureNews, type PictureNews } from './channel';
import { scaleBox, type AlertKind } from './rules';

type Kept = 'memory' | 'saving' | 'saved' | 'failed';

export type PictureView =
  | { status: 'loading' }
  | { status: 'shown'; set: PictureSet; frameUrl: string; closeUpUrl: string | null; kept: Kept }
  | { status: 'none' }
  | { status: 'gone-person' }
  | { status: 'gone-age'; days: number }
  | { status: 'unreadable' };

/** What the alert list says once about a device that cannot keep pictures. */
export type ListLine = 'ran-out' | 'out-of-room' | 'window' | null;

/** Whether this tab can write the picture store: read when a watch starts. */
export type StoreState = 'usable' | 'unusable' | 'database-notice';

interface Entry {
  id: string;
  view: PictureView;
  /** True for a set that lives in this tab's memory: it is not read again from the database. */
  memory: boolean;
  /** How many cards show it. */
  holders: number;
  /** When no alert of the watch named it any more, or null while one does. */
  unnamedSince: number | null;
  release: ReturnType<typeof setTimeout> | null;
}

const LOADING: PictureView = { status: 'loading' };
const NONE: PictureView = { status: 'none' };
const GONE_PERSON: PictureView = { status: 'gone-person' };
const UNREADABLE: PictureView = { status: 'unreadable' };

/** A picture no card shows is let go after this long, so a card that moves in the list finds it at once. */
const RELEASE_MS = 5_000;
/** A picture in memory that no alert names is forgotten after this long. */
const UNNAMED_MS = 120_000;
/** A stored row no alert holds is deleted once it is this old: a set whose card left before it was saved. */
const UNHELD_MS = 600_000;
/** Pictures past their age are deleted this often while a watch runs. */
const AGE_SWEEP_MS = 60_000;

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

let listLine: ListLine = null;
let storeState: StoreState = 'usable';
/** The count of kept pictures; null until the store is read. */
let keptCount: number | null = null;
let countReads = 0;

function tell(): void {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  listenToOtherTabs();
  return () => {
    listeners.delete(listener);
  };
}

// =============================================================================
// Views
// =============================================================================

function revoke(view: PictureView): void {
  if (view.status !== 'shown' || typeof URL.revokeObjectURL !== 'function') return;
  URL.revokeObjectURL(view.frameUrl);
  if (view.closeUpUrl) URL.revokeObjectURL(view.closeUpUrl);
}

function settle(entry: Entry, view: PictureView): void {
  revoke(entry.view);
  entry.view = view;
}

function show(entry: Entry, set: PictureSet, kept: Kept): void {
  // A browser with no object URLs cannot show a Blob: the alert stands with no picture.
  if (typeof URL.createObjectURL !== 'function') return settle(entry, NONE);
  revoke(entry.view);
  entry.view = {
    status: 'shown',
    set,
    frameUrl: URL.createObjectURL(set.frame),
    closeUpUrl: set.closeUp ? URL.createObjectURL(set.closeUp) : null,
    kept,
  };
}

/** The same pictures, kept another way: the URLs stay, so the card's pictures do not blink. */
function keptAs(entry: Entry, kept: Kept): void {
  if (entry.view.status === 'shown') entry.view = { ...entry.view, kept };
}

function drop(entry: Entry): void {
  if (entry.release) clearTimeout(entry.release);
  revoke(entry.view);
  if (entries.get(entry.id) === entry) entries.delete(entry.id);
}

/** The set a stored row holds, or null for a row with no frame. */
function setOf(row: AlertPictureDB): PictureSet | null {
  if (!row.frame || !row.frameWidth || !row.frameHeight) return null;
  const sourceWidth = row.sourceWidth || row.frameWidth;
  const sourceHeight = row.sourceHeight || row.frameHeight;
  const box = row.box ?? null;
  return {
    id: row.id,
    kind: row.kind,
    takenAt: row.takenAt,
    frame: row.frame,
    frameWidth: row.frameWidth,
    frameHeight: row.frameHeight,
    box,
    sourceWidth,
    sourceHeight,
    sourceBox: box ? scaleBox(box, sourceWidth / row.frameWidth) : null,
    closeUp: row.closeUp ?? null,
    closeUpWidth: row.closeUp ? row.closeUpWidth ?? 0 : 0,
    closeUpHeight: row.closeUp ? row.closeUpHeight ?? 0 : 0,
    dark: row.dark === true,
  };
}

/** The row a set is saved as. */
function rowOf(set: PictureSet): AlertPictureDB {
  return {
    id: set.id,
    state: 'kept',
    kind: set.kind,
    takenAt: set.takenAt,
    frame: set.frame,
    frameWidth: set.frameWidth,
    frameHeight: set.frameHeight,
    box: set.box,
    sourceWidth: set.sourceWidth,
    sourceHeight: set.sourceHeight,
    closeUp: set.closeUp,
    closeUpWidth: set.closeUpWidth,
    closeUpHeight: set.closeUpHeight,
    dark: set.dark,
  };
}

function viewOfRow(entry: Entry, row: AlertPictureDB | null): void {
  if (!row) return settle(entry, NONE);
  if (row.state === 'gone') {
    return settle(entry, row.gone === 'age' && row.goneAfterDays ? { status: 'gone-age', days: row.goneAfterDays } : GONE_PERSON);
  }
  const set = setOf(row);
  if (!set) return settle(entry, NONE);
  show(entry, set, 'saved');
}

function read(entry: Entry): void {
  void getAlertPicture(entry.id).then(
    (row) => {
      if (entries.get(entry.id) !== entry || entry.memory) return;
      viewOfRow(entry, row);
      tell();
    },
    () => {
      if (entries.get(entry.id) !== entry || entry.memory) return;
      settle(entry, UNREADABLE);
      tell();
    },
  );
}

/** Forgets the pictures in memory that no alert of the watch has named for a while and no card shows. */
function forgetUnnamed(now: number): void {
  const named = new Set<string>();
  for (const alert of useMonitoringStore.getState().alerts) if (alert.pictureId) named.add(alert.pictureId);
  for (const entry of [...entries.values()]) {
    if (!entry.memory) continue;
    if (named.has(entry.id) || entry.holders > 0) {
      entry.unnamedSince = null;
    } else if (entry.unnamedSince === null) {
      entry.unnamedSince = now;
    } else if (now - entry.unnamedSince >= UNNAMED_MS) {
      drop(entry);
    }
  }
}

/** A picture that went: its view says why, in this tab. */
function gone(ids: readonly string[], reason: 'person' | 'age' | 'with-alert', days?: number): void {
  for (const id of ids) {
    const entry = entries.get(id);
    if (!entry) continue;
    entry.memory = false;
    // A view no card shows is dropped: the next card to show it reads the row, which says why it went.
    if (entry.holders === 0) drop(entry);
    else settle(entry, reason === 'person' ? GONE_PERSON : reason === 'age' && days ? { status: 'gone-age', days } : NONE);
  }
}

// =============================================================================
// The save boundary
// =============================================================================

/**
 * Registers an alert's picture the moment the alert is raised: a tile stands
 * in its place at once and the pictures show when they are drawn and, where
 * they are kept, saved. Whether it is kept is decided here, at the alert: on
 * a device that has answered the notice, with Keep alert pictures on, in a
 * store that can be written. A picture that cannot be drawn leaves the alert
 * with none.
 */
export function holdPicture(promise: Promise<PictureSet>, id: string): void {
  const before = entries.get(id);
  if (before) drop(before);
  const entry: Entry = { id, view: LOADING, memory: true, holders: 0, unnamedSince: null, release: null };
  entries.set(id, entry);
  forgetUnnamed(Date.now());

  const choice = useAlertPicturesStore.getState();
  const keeps = choice.noticeAnswered && choice.keep && storeState === 'usable';
  // The clear markers as they stand at the alert: a save is written only while none has moved.
  const stamp = keeps ? pictureStampNow() : null;
  tell();

  promise.then(
    (set) => {
      if (entries.get(id) !== entry) return;
      if (!stamp) {
        show(entry, set, 'memory');
        tell();
        return;
      }
      show(entry, set, 'saving');
      tell();
      void saveAlertPicture(rowOf(set), stamp).then((answer) => {
        if (entries.get(id) !== entry) return;
        if (answer.result === 'saved') {
          keptAs(entry, 'saved');
          if (answer.deleted.length > 0) {
            // Out of room: the oldest made way in the transaction that saved this one.
            gone(answer.deleted, 'with-alert');
            listLine = 'ran-out';
            postPictureNews({ type: 'gone', ids: answer.deleted, reason: 'with-alert' });
          }
          postPictureNews({ type: 'saved', id });
        } else if (answer.result === 'dropped') {
          // The person deleted the pictures, or cleared the alerts, while this one was saved.
          entry.memory = false;
          settle(entry, GONE_PERSON);
        } else {
          keptAs(entry, 'failed');
          if (answer.result === 'out-of-room') listLine = 'out-of-room';
        }
        tell();
        void readCount();
      });
    },
    () => {
      if (entries.get(id) !== entry) return;
      entry.memory = false;
      settle(entry, NONE);
      tell();
    },
  );
}

// =============================================================================
// Deletes and sweeps
// =============================================================================

/**
 * Delete picture: one set leaves, in every tab; the alert's words stay. A
 * set that lives in this tab's memory alone (keeping off, or a save that
 * failed) is forgotten here and nothing is written. A kept set leaves the
 * row that says the person deleted it; one that cannot be read is cleared
 * from what its alert says of it (`known`), without a read.
 */
export async function deletePicture(id: string, known: { kind: AlertKind; takenAt: number }): Promise<'deleted' | 'failed'> {
  const entry = entries.get(id);
  const inMemoryAlone = entry?.view.status === 'shown' && (entry.view.kept === 'memory' || entry.view.kept === 'failed');
  if (entry && inMemoryAlone) {
    // It stays this tab's own answer: nothing is stored, so nothing is read again.
    settle(entry, GONE_PERSON);
    tell();
    return 'deleted';
  }
  if ((await goneAlertPicture(id, 'person', known)) === 'failed') return 'failed';
  gone([id], 'person');
  postPictureNews({ type: 'gone', ids: [id], reason: 'person' });
  tell();
  await readCount();
  return 'deleted';
}

/** Delete all pictures: every kept set leaves, in every tab; the alerts' words stay. */
export async function deleteAllPictures(): Promise<'deleted' | 'failed'> {
  const answer = await goneAllAlertPictures();
  if (answer.result === 'failed') return 'failed';
  gone(answer.ids, 'person');
  // A set that is being saved now is refused by the pictures marker; its view follows from its save.
  postPictureNews({ type: 'gone', ids: answer.ids, reason: 'person' });
  tell();
  await readCount();
  return 'deleted';
}

/**
 * Deletes the kept pictures past the chosen age; nothing while the choice is
 * "Until I delete them". `chosen` is an age another tab chose, which this
 * tab's saved choice may not hold yet; without it, this tab's choice.
 */
export async function sweepPicturesByAge(now: number = Date.now(), chosen?: DeleteAfterDays): Promise<void> {
  const days = chosen === undefined ? useAlertPicturesStore.getState().deleteAfterDays : chosen;
  if (days === null) return;
  const ids = await goneExpiredAlertPictures(days, now);
  if (ids.length === 0) return;
  gone(ids, 'age', days);
  postPictureNews({ type: 'gone', ids, reason: 'age' });
  tell();
  await readCount();
}

/** Deletes the stored rows that no saved alert and no alert this tab shows holds, once they are ten minutes old. */
async function sweepUnheld(): Promise<void> {
  // The saved alerts' pictures are read by the sweep itself, in its own transaction: a read that
  // fails deletes nothing. These are the pictures this tab holds that may not be saved yet.
  const held = new Set<string>();
  for (const alert of useMonitoringStore.getState().alerts) if (alert.pictureId) held.add(alert.pictureId);
  for (const id of entries.keys()) held.add(id);
  await sweepUnheldAlertPictures(held, Date.now() - UNHELD_MS);
}

/** Tries the store and keeps what it found: a window that keeps nothing says so once. */
export async function checkPictureStore(): Promise<StoreState> {
  const state = await probeAlertPictureStore();
  storeState = state;
  // A tab that waits for a reload has its own notice and names no window.
  if (state === 'unusable') listLine = 'window';
  else if (listLine === 'window') listLine = null;
  tell();
  return state;
}

let ageSweep: ReturnType<typeof setInterval> | null = null;

/**
 * A watch starts: the store is tried, pictures past their age are deleted
 * now and every minute while it runs, and rows no alert holds are swept.
 */
export async function startPictureWatch(): Promise<void> {
  if (!ageSweep && typeof window !== 'undefined') {
    ageSweep = setInterval(() => { void sweepPicturesByAge(); }, AGE_SWEEP_MS);
  }
  const state = await checkPictureStore();
  if (state !== 'usable') return;
  await sweepPicturesByAge();
  await sweepUnheld();
  await readCount();
}

/** The watch stopped: the minute's sweep stops with it. */
export function stopPictureWatch(): void {
  if (ageSweep) clearInterval(ageSweep);
  ageSweep = null;
}

/** Forgets every picture this tab holds and revokes its URLs: Clear All Local Data and sign-out. */
export function forgetAllPictures(): void {
  for (const entry of [...entries.values()]) {
    if (entry.release) clearTimeout(entry.release);
    revoke(entry.view);
    // A card that still stands shows that its picture went; nothing is read again.
    entry.memory = false;
    entry.view = NONE;
  }
  for (const entry of [...entries.values()]) if (entry.holders === 0) entries.delete(entry.id);
  listLine = null;
  keptCount = null;
  tell();
  void readCount();
}

// =============================================================================
// The count and the other tabs
// =============================================================================

async function readCount(): Promise<void> {
  const reading = ++countReads;
  try {
    const count = await countKeptAlertPictures();
    if (reading !== countReads) return;
    keptCount = count;
  } catch {
    if (reading !== countReads) return;
    // A store that cannot be read holds no picture this tab can count.
    keptCount = 0;
  }
  tell();
}

function hear(news: PictureNews): void {
  if (news.type === 'gone') {
    if (news.reason === 'age') {
      // The row says after how many days.
      for (const id of news.ids) {
        const entry = entries.get(id);
        if (!entry) continue;
        entry.memory = false;
        read(entry);
      }
    } else {
      gone(news.ids, news.reason);
    }
    tell();
  } else if (news.type === 'settings') {
    // By the age the other tab chose, which this tab may read from the browser only later.
    void sweepPicturesByAge(Date.now(), news.deleteAfterDays);
  } else if (news.type === 'saved') {
    // A card that read this picture before it was saved found none: it reads it again.
    const entry = entries.get(news.id);
    if (entry && !entry.memory && entry.view.status !== 'shown') read(entry);
  }
  void readCount();
}

let listening = false;
function listenToOtherTabs(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  onPictureNews(hear);
}

// =============================================================================
// For the components
// =============================================================================

function hold(id: string, listener: () => void): () => void {
  listeners.add(listener);
  listenToOtherTabs();
  let entry = entries.get(id);
  if (!entry) {
    entry = { id, view: LOADING, memory: false, holders: 0, unnamedSince: null, release: null };
    entries.set(id, entry);
    read(entry);
  }
  const held = entry;
  held.holders += 1;
  if (held.release) {
    clearTimeout(held.release);
    held.release = null;
  }
  return () => {
    listeners.delete(listener);
    held.holders = Math.max(0, held.holders - 1);
    if (held.holders > 0 || held.memory || held.release) return;
    // A stored picture no card shows is let go; the next card to show it reads it again.
    held.release = setTimeout(() => {
      held.release = null;
      if (held.holders === 0 && !held.memory) drop(held);
    }, RELEASE_MS);
  };
}

/**
 * An alert's picture for a card: from memory when this tab raised it, else
 * read from the browser's database. An alert with no picture id has none.
 */
export function usePicture(pictureId: string | undefined): PictureView {
  const subscribeTo = useCallback(
    (listener: () => void) => (pictureId ? hold(pictureId, listener) : () => undefined),
    [pictureId],
  );
  const snapshot = useCallback(
    () => (pictureId ? entries.get(pictureId)?.view ?? LOADING : NONE),
    [pictureId],
  );
  const serverSnapshot = useCallback(() => (pictureId ? LOADING : NONE), [pictureId]);
  return useSyncExternalStore(subscribeTo, snapshot, serverSnapshot);
}

const noCount = (): number | null => null;
const noLine = (): ListLine => null;
const usable = (): StoreState => 'usable';

/** How many pictures are kept on this device; null while the store is read. */
export function useKeptCount(): number | null {
  const subscribeToCount = useCallback((listener: () => void) => {
    const stop = subscribe(listener);
    void readCount();
    return stop;
  }, []);
  return useSyncExternalStore(subscribeToCount, () => keptCount, noCount);
}

/** The alert list's one line about a device that cannot keep pictures, or null. */
export function useListLine(): ListLine {
  return useSyncExternalStore(subscribe, () => listLine, noLine);
}

/** Whether this tab can write the picture store, as the last watch start found it. */
export function usePictureStoreState(): StoreState {
  return useSyncExternalStore(subscribe, () => storeState, usable);
}
