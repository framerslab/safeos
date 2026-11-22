/** Async producers retain their generation so clearing can invalidate old work. */
let generation = 0;
export const getLocalDataGeneration = (): number => generation;
export function invalidatePendingLocalData(): void {
  generation += 1;
}
export const isCurrentLocalData = (value: number): boolean => value === generation;

/** A value that is new on every call. The clear generation and the clear marker each take their own. */
export const newClearValue = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

/** The clear marker: in local storage, shared by every tab of the origin. */
export const LOCAL_CLEAR_MARKER_KEY = 'safeos_local_data_cleared';
export function readLocalClearMarker(): string {
  try { return localStorage.getItem(LOCAL_CLEAR_MARKER_KEY) ?? ''; } catch { return ''; }
}
/** Throws when local storage refuses the write; the caller then aborts its clear. */
export function writeLocalClearMarker(): void {
  localStorage.setItem(LOCAL_CLEAR_MARKER_KEY, newClearValue());
}

/**
 * The account marker: in local storage, shared by every tab, and written only by a clear of all local
 * data (sign-out and Clear All Local Data), beside the clear marker. Session work and profile saves
 * read it, so clearing the alert history alone does not cancel them.
 */
export const ACCOUNT_CLEAR_MARKER_KEY = 'safeos_account_data_cleared';
export function readAccountClearMarker(): string {
  try { return localStorage.getItem(ACCOUNT_CLEAR_MARKER_KEY) ?? ''; } catch { return ''; }
}
/** Throws when local storage refuses the write; the caller then aborts its clear. */
export function writeAccountClearMarker(): void {
  localStorage.setItem(ACCOUNT_CLEAR_MARKER_KEY, newClearValue());
}

/** What a pending save carries. `generation` is null when the tab had read none under `marker`. */
export type ClearStamp = { marker: string; generation: string | null };

/** The clear generation this tab last read in the database, and the marker it read inside that same transaction. */
let knownClear: { generation: string; marker: string } | null = null;
export function learnClearGeneration(generation: string): void {
  knownClear = { generation, marker: readLocalClearMarker() };
}
/** The stamp of a save that was queued under `marker` and has just failed. */
export function pendingClearStamp(marker: string): ClearStamp {
  return { marker, generation: knownClear !== null && knownClear.marker === marker ? knownClear.generation : null };
}

/**
 * The pictures marker: in local storage, shared by every tab, and written by Delete all pictures
 * inside its transaction. A picture save that waits in any tab reads it, so a set taken before the
 * deletion is never written after it.
 */
export const PICTURES_CLEAR_MARKER_KEY = 'safeos_alert_pictures_cleared';
export function readPicturesClearMarker(): string {
  try { return localStorage.getItem(PICTURES_CLEAR_MARKER_KEY) ?? ''; } catch { return ''; }
}
/**
 * Writes a new pictures marker and answers it with the one it replaced ('' for none). Throws when
 * local storage refuses the write; the caller then aborts its deletion.
 */
export function writePicturesClearMarker(): { written: string; before: string } {
  const before = readPicturesClearMarker();
  const written = newClearValue();
  localStorage.setItem(PICTURES_CLEAR_MARKER_KEY, written);
  return { written, before };
}
/**
 * A deletion that did not commit leaves a marker that names the last deletion that did and every
 * marker written since by deletions that did not, so a save stamped under any of them is written
 * as if those deletions never came. A marker another deletion wrote since stays.
 */
const ABORTED = 'aborted:';
function readAborted(marker: string): { committed: string; aborted: string[] } | null {
  if (!marker.startsWith(ABORTED)) return null;
  try {
    const read = JSON.parse(marker.slice(ABORTED.length)) as { committed?: unknown; aborted?: unknown };
    if (typeof read.committed !== 'string' || !Array.isArray(read.aborted)) return null;
    return { committed: read.committed, aborted: read.aborted.filter((one): one is string => typeof one === 'string') };
  } catch {
    return null;
  }
}
export function restorePicturesClearMarker({ written, before }: { written: string; before: string }): void {
  try {
    if (localStorage.getItem(PICTURES_CLEAR_MARKER_KEY) !== written) return;
    const earlier = readAborted(before);
    const committed = earlier ? earlier.committed : before;
    const aborted = [...(earlier ? earlier.aborted : []), written];
    localStorage.setItem(PICTURES_CLEAR_MARKER_KEY, `${ABORTED}${JSON.stringify({ committed, aborted })}`);
  } catch {
    // The new marker stays: a save that waits is then not written, as after a deletion.
  }
}
/**
 * Whether a save stamped under the pictures marker `stamped` may be written now that it reads
 * `now`: no deletion has committed since the stamp. A marker written by a deletion that then did
 * not commit counts as the last committed one.
 */
export function picturesMarkerHolds(stamped: string, now: string): boolean {
  if (stamped === now) return true;
  const after = readAborted(now);
  if (!after) return false;
  const before = readAborted(stamped);
  return (before ? before.committed : stamped) === after.committed || after.aborted.includes(stamped);
}

/** What a picture save carries from its alert: the clear boundary and the pictures marker then. */
export type PictureStamp = { clearMarker: string; clearGeneration: string | null; picturesMarker: string };
export function pictureStampNow(): PictureStamp {
  const clearMarker = readLocalClearMarker();
  return { clearMarker, clearGeneration: pendingClearStamp(clearMarker).generation, picturesMarker: readPicturesClearMarker() };
}
