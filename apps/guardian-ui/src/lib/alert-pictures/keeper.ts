/**
 * The keeper: every alert picture this tab shows, by its id.
 *
 * A picture raised by this tab's watch is registered the moment its alert
 * is raised and shows from memory as soon as it is drawn. A picture of an
 * alert read from the browser's database is read when a card first shows
 * it. A view's two pictures are object URLs of the set's Blobs, made while
 * a card shows them and revoked when none does.
 *
 * @module lib/alert-pictures/keeper
 */

import { useCallback, useSyncExternalStore } from 'react';

import { getAlertPicture, type AlertPictureDB } from '../client-db';
import { useMonitoringStore } from '../../stores/monitoring-store';
import type { PictureSet } from './capture';
import { scaleBox } from './rules';

export type PictureView =
  | { status: 'loading' }
  | { status: 'shown'; set: PictureSet; frameUrl: string; closeUpUrl: string | null; kept: 'memory' | 'saving' | 'saved' | 'failed' }
  | { status: 'none' }
  | { status: 'gone-person' }
  | { status: 'gone-age'; days: number }
  | { status: 'unreadable' };

type Kept = 'memory' | 'saving' | 'saved' | 'failed';

interface Entry {
  id: string;
  view: PictureView;
  /** The set and how it is kept, while it shows. */
  set: PictureSet | null;
  kept: Kept;
  /** True for a set that lives in this tab's memory alone: it is not read again from the database. */
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

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

function tell(): void {
  for (const listener of [...listeners]) listener();
}

function revoke(view: PictureView): void {
  if (view.status !== 'shown' || typeof URL.revokeObjectURL !== 'function') return;
  URL.revokeObjectURL(view.frameUrl);
  if (view.closeUpUrl) URL.revokeObjectURL(view.closeUpUrl);
}

function show(entry: Entry, set: PictureSet, kept: Kept): void {
  // A browser with no object URLs cannot show a Blob: the alert stands with no picture.
  if (typeof URL.createObjectURL !== 'function') return settle(entry, NONE);
  revoke(entry.view);
  entry.set = set;
  entry.kept = kept;
  entry.view = {
    status: 'shown',
    set,
    frameUrl: URL.createObjectURL(set.frame),
    closeUpUrl: set.closeUp ? URL.createObjectURL(set.closeUp) : null,
    kept,
  };
}

function settle(entry: Entry, view: PictureView): void {
  revoke(entry.view);
  entry.set = null;
  entry.view = view;
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

/**
 * Registers an alert's picture the moment the alert is raised: a tile stands
 * in its place at once and the pictures show when they are drawn. A picture
 * that cannot be drawn leaves the alert with none.
 */
export function holdPicture(promise: Promise<PictureSet>, id: string): void {
  const before = entries.get(id);
  if (before) drop(before);
  const entry: Entry = { id, view: LOADING, set: null, kept: 'memory', memory: true, holders: 0, unnamedSince: null, release: null };
  entries.set(id, entry);
  forgetUnnamed(Date.now());
  tell();
  promise.then(
    (set) => {
      if (entries.get(id) !== entry) return;
      show(entry, set, 'memory');
      tell();
    },
    () => {
      if (entries.get(id) !== entry) return;
      settle(entry, NONE);
      tell();
    },
  );
}

function hold(id: string, listener: () => void): () => void {
  listeners.add(listener);
  let entry = entries.get(id);
  if (!entry) {
    entry = { id, view: LOADING, set: null, kept: 'saved', memory: false, holders: 0, unnamedSince: null, release: null };
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
  const subscribe = useCallback(
    (listener: () => void) => (pictureId ? hold(pictureId, listener) : () => undefined),
    [pictureId],
  );
  const snapshot = useCallback(
    () => (pictureId ? entries.get(pictureId)?.view ?? LOADING : NONE),
    [pictureId],
  );
  const serverSnapshot = useCallback(() => (pictureId ? LOADING : NONE), [pictureId]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
