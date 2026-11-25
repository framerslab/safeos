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
  deleteSubjectProfile,
  getAlertPicture,
  goneAlertPicture,
  goneAllAlertPictures,
  goneExpiredAlertPictures,
  probeAlertPictureStore,
  saveAlertPicture,
  sweepUnheldAlertPictures,
  type AlertPictureDB,
} from '../client-db';
import { ACCOUNT_CLEAR_MARKER_KEY, LOCAL_CLEAR_MARKER_KEY, pictureStampNow, readAccountClearMarker } from '../local-data-generation';
import { useMonitoringStore } from '../../stores/monitoring-store';
import { ALERT_PICTURES_KEY, heardChoiceAt, useAlertPicturesStore, type DeleteAfterDays } from '../../stores/alert-pictures-store';
import type { PictureSet } from './capture';
import { onPictureNews, postPictureNews, type PictureNews } from './channel';
import { closePicture, openedNow } from './opened';
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
  /** Moves on with each read of the row and each delete: a read that answers after either shows nothing. */
  turn: number;
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
/** How many times this tab has let go of every picture. A read or a drawing begun before shows nothing. */
let forgets = 0;

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
function rowOf(set: PictureSet, subjectId?: string): AlertPictureDB {
  return {
    id: set.id,
    state: 'kept',
    kind: set.kind,
    takenAt: set.takenAt,
    ...(subjectId ? { subjectId } : {}),
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
  const since = forgets;
  const turn = ++entry.turn;
  const stale = () => since !== forgets || entries.get(entry.id) !== entry || entry.memory || entry.turn !== turn;
  void getAlertPicture(entry.id).then(
    (row) => {
      if (stale()) return;
      viewOfRow(entry, row);
      tell();
    },
    () => {
      if (stale()) return;
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

/** Lets go of a picture in memory that no card shows once no alert of the watch has named it for `UNNAMED_MS`. */
function forgetWhenUnnamed(entry: Entry): void {
  entry.release = setTimeout(() => {
    entry.release = null;
    if (entries.get(entry.id) !== entry || entry.holders > 0 || !entry.memory) return;
    const named = useMonitoringStore.getState().alerts.some((alert) => alert.pictureId === entry.id);
    if (named) forgetWhenUnnamed(entry);
    else drop(entry);
  }, UNNAMED_MS);
}

/** A picture that went: its view says why, in this tab. */
function gone(ids: readonly string[], reason: 'person' | 'age' | 'with-alert', days?: number): void {
  for (const id of ids) {
    const entry = entries.get(id);
    if (!entry) continue;
    entry.memory = false;
    // A read of the row from before the delete shows nothing when it answers.
    entry.turn += 1;
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
 * with none. `subjectId` is the pet a sighting's picture was taken for: it is
 * not kept once the pet is deleted.
 */
export function holdPicture(promise: Promise<PictureSet>, id: string, subjectId?: string): void {
  const before = entries.get(id);
  if (before) drop(before);
  const entry: Entry = { id, view: LOADING, memory: true, holders: 0, unnamedSince: null, release: null, turn: 0 };
  entries.set(id, entry);
  forgetUnnamed(Date.now());

  const choice = useAlertPicturesStore.getState();
  const keeps = noticeAnswered() && (heardKeep ?? choice.keep) && storeState === 'usable';
  // The clear markers as they stand at the alert: a save is written only while none has moved.
  const stamp = keeps ? pictureStampNow() : null;
  const since = forgets;
  tell();

  promise.then(
    (set) => {
      if (since !== forgets || entries.get(id) !== entry) return;
      if (!stamp) {
        show(entry, set, 'memory');
        tell();
        return;
      }
      show(entry, set, 'saving');
      tell();
      void saveAlertPicture(rowOf(set, subjectId), stamp).then((answer) => {
        if (since !== forgets || entries.get(id) !== entry) return;
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
          // The person deleted the pictures or the pet, or cleared the alerts, while this one was saved.
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
      if (since !== forgets || entries.get(id) !== entry) return;
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

/**
 * Deletes a Lost and Found pet with its saved pictures: each set kept for its sightings leaves, in
 * every tab; the alerts' words stay.
 */
export async function deletePet(subjectId: string): Promise<'deleted' | 'failed'> {
  const answer = await deleteSubjectProfile(subjectId);
  if (answer.result === 'failed') return 'failed';
  if (answer.pictureIds.length > 0) {
    gone(answer.pictureIds, 'person');
    postPictureNews({ type: 'gone', ids: answer.pictureIds, reason: 'person' });
    tell();
    await readCount();
  }
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
 * tab's saved choice may not hold yet; without it, the newest age this tab
 * knows of, its own or one another tab saved or told it of.
 */
export async function sweepPicturesByAge(now: number = Date.now(), chosen?: DeleteAfterDays): Promise<void> {
  const days = chosen === undefined ? newestAge() : chosen;
  if (days === null) return;
  // A sweep that waits for the store deletes by its age only while no longer age, and not "Until I
  // delete them", has been chosen since: the check is made inside the sweep's own transaction.
  const ids = await goneExpiredAlertPictures(days, now, () => {
    const age = newestAge();
    return age !== null && age <= days;
  });
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

/**
 * Forgets every picture this tab holds, revokes its URLs and closes the open picture: Clear All
 * Local Data and sign-out, in this tab or another. A read or a drawing begun before shows nothing,
 * and the count is read again by `recountPictures` once the clear is done.
 */
export function forgetAllPictures(): void {
  forgets += 1;
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
  // The clear takes the answer to the notice with it.
  heardNoticeAnswered = false;
  // A count read before the clear is not the count after it.
  countReads += 1;
  tell();
  closePicture();
}

/**
 * Lets go of the pictures this tab read from the database, after Clear all in another tab deleted
 * them with their alerts: a card that still stands says no picture was kept, a read from before
 * shows nothing, and their open picture closes. The pictures of this tab's own watch, held in its
 * memory, stay with the alerts it shows.
 */
function forgetStoredPictures(): void {
  const open = openedNow();
  const openStored = open !== null && !(open.alert.pictureId && entries.get(open.alert.pictureId)?.memory);
  for (const entry of [...entries.values()]) {
    if (entry.memory) continue;
    entry.turn += 1;
    if (entry.holders === 0) drop(entry);
    else settle(entry, NONE);
  }
  tell();
  if (openStored) closePicture();
}

/** Reads the count of kept pictures again, once a clear of all local data is done. */
export function recountPictures(): Promise<void> {
  return readCount();
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
    // News sent before a clear of all local data, in any tab, answers nothing after it.
    if (news.cleared !== undefined && news.cleared !== readAccountClearMarker()) return;
    // An answer to the notice holds whenever it was given: the device has answered it.
    if (news.noticeAnswered) heardNoticeAnswered = true;
    // A choice this tab makes after hearing of this one is the later one, even in the same millisecond.
    if (news.at !== undefined) heardChoiceAt(news.at);
    // Choices made before the ones this tab holds, heard late, change nothing here and delete
    // nothing; so do choices made in the same millisecond, where this tab's own stands.
    if (news.at !== undefined && news.at <= useAlertPicturesStore.getState().chosenAt) return;
    if (news.at !== undefined) {
      // The other tab's choices are this tab's from now, with the time they were made: a change of
      // another choice here keeps them, and news of an older choice, heard later, changes nothing.
      const heard: Partial<Pick<ReturnType<typeof useAlertPicturesStore.getState>, 'keep' | 'deleteAfterDays' | 'inNotifications' | 'chosenAt'>> = { chosenAt: news.at };
      if (news.keep !== undefined) heard.keep = news.keep;
      if (news.inNotifications !== undefined) heard.inNotifications = news.inNotifications;
      if (news.deleteAfterDays !== undefined) heard.deleteAfterDays = news.deleteAfterDays;
      useAlertPicturesStore.setState(heard);
    } else {
      // News with no time: its choices hold here until this tab reads them from the browser.
      if (news.keep !== undefined) heardKeep = news.keep;
      if (news.inNotifications !== undefined) heardInNotifications = news.inNotifications;
      if (news.deleteAfterDays !== undefined) heardAge = { at: Date.now(), days: news.deleteAfterDays };
    }
    void sweepPicturesByAge(Date.now(), news.deleteAfterDays);
  } else if (news.type === 'saved') {
    // A card that read this picture before it was saved found none: it reads it again.
    const entry = entries.get(news.id);
    if (entry && !entry.memory && entry.view.status !== 'shown') read(entry);
  }
  void readCount();
}

/**
 * Keep alert pictures as another tab just chose it, until this tab's store
 * reads the saved choices again (or this tab changes them); null till then.
 */
let heardKeep: boolean | null = null;

/** Show the picture in alert notifications as another tab just chose it; null till then, as `heardKeep`. */
let heardInNotifications: boolean | null = null;

/**
 * Whether another tab told this one that the device answered the notice about alert pictures. It
 * holds until all local data is cleared: a tab whose browser keeps no choices never reads the answer.
 */
let heardNoticeAnswered = false;

/** Whether this device has answered the notice: in this tab's store, or as another tab told it. */
export function noticeAnswered(): boolean {
  return heardNoticeAnswered || useAlertPicturesStore.getState().noticeAnswered;
}

/**
 * Whether an alert's notification carries its picture: this tab's choice, or a later one another
 * tab made that this tab's store has not read yet.
 */
export function picturesInNotifications(): boolean {
  return heardInNotifications ?? useAlertPicturesStore.getState().inNotifications;
}

/** Delete pictures after as another tab chose it, with when; null till one is heard. */
let heardAge: { at: number; days: DeleteAfterDays } | null = null;

/**
 * The newest Delete pictures after this tab knows of: its own choice, one another tab made later
 * and told it of, or one another tab saved later that this tab's store has not read yet.
 */
function newestAge(): DeleteAfterDays {
  const choice = useAlertPicturesStore.getState();
  let newest: { at: number; days: DeleteAfterDays } = { at: choice.chosenAt, days: choice.deleteAfterDays };
  if (heardAge && heardAge.at > newest.at) newest = heardAge;
  const saved = savedAge();
  if (saved && saved.at > newest.at) newest = saved;
  return newest.days;
}

/** Delete pictures after as the browser holds it for every tab, with when it was chosen; null when it cannot be read. */
function savedAge(): { at: number; days: DeleteAfterDays } | null {
  try {
    const raw = localStorage.getItem(ALERT_PICTURES_KEY);
    if (!raw) return null;
    const state = (JSON.parse(raw) as { state?: { deleteAfterDays?: unknown; chosenAt?: unknown } } | null)?.state;
    if (!state || typeof state.chosenAt !== 'number') return null;
    const days = state.deleteAfterDays;
    if (days !== null && typeof days !== 'number') return null;
    return { at: state.chosenAt, days: days as DeleteAfterDays };
  } catch {
    return null;
  }
}

let listening = false;
function listenToOtherTabs(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  onPictureNews(hear);
  useAlertPicturesStore.subscribe(() => {
    heardKeep = null;
    heardInNotifications = null;
  });
  // Clear all data on this device or a sign-out in another tab writes the account marker as its clear
  // commits: this tab lets go of every picture it shows, and counts again after that clear.
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === ACCOUNT_CLEAR_MARKER_KEY) {
      forgetAllPictures();
      void readCount();
    } else if (event.key === LOCAL_CLEAR_MARKER_KEY) {
      // Clear all in another tab deleted every watch alert and every stored picture.
      forgetStoredPictures();
      void readCount();
    }
  });
}

// =============================================================================
// For the components
// =============================================================================

function hold(id: string, listener: () => void): () => void {
  listeners.add(listener);
  listenToOtherTabs();
  let entry = entries.get(id);
  if (!entry) {
    entry = { id, view: LOADING, memory: false, holders: 0, unnamedSince: null, release: null, turn: 0 };
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
    if (held.holders > 0 || held.release) return;
    if (held.memory) {
      // A picture in this tab's memory alone that no card shows: once no alert names it (a repeat
      // put a newer picture on its card), it is let go after a while, though no picture is taken
      // after it.
      forgetWhenUnnamed(held);
      return;
    }
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
