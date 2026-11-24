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

/** A pending deletion and the last one that committed when it began. */
type PicturesClearMarker = { pending: string; before: string };

/** Delete all pictures publishes this marker so a picture can take its stamp synchronously. */
export const PICTURES_CLEAR_MARKER_KEY = 'safeos_alert_pictures_cleared';
function readPicturesClearMarker(): PicturesClearMarker | null {
  try {
    const stored = localStorage.getItem(PICTURES_CLEAR_MARKER_KEY);
    const marker = stored ? JSON.parse(stored) as Partial<PicturesClearMarker> : null;
    return typeof marker?.pending === 'string' && typeof marker.before === 'string'
      ? { pending: marker.pending, before: marker.before }
      : null;
  } catch {
    return null;
  }
}

/** Throws when local storage refuses the marker, so the caller aborts the deletion. */
export function writePicturesClearMarker(pending: string, before: string): void {
  localStorage.setItem(PICTURES_CLEAR_MARKER_KEY, JSON.stringify({ pending, before }));
}

/** The database says whether the stamped deletion committed or left the previous one in place. */
export function picturesMarkerHolds(stamped: PicturesClearMarker | null, committed: string): boolean {
  return stamped ? committed === stamped.pending || committed === stamped.before : committed === '';
}

/** What a picture save carries from its alert: the clear boundary and the pictures marker then. */
export type PictureStamp = {
  clearMarker: string;
  clearGeneration: string | null;
  picturesMarker: PicturesClearMarker | null;
};
export function pictureStampNow(): PictureStamp {
  const clearMarker = readLocalClearMarker();
  return { clearMarker, clearGeneration: pendingClearStamp(clearMarker).generation, picturesMarker: readPicturesClearMarker() };
}
