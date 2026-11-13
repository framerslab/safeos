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
