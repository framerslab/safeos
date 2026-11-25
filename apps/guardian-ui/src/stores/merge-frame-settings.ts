/** Restore the saved settings while dropping the old, unused age setting. */
export function mergeFrameSettings<State extends { settings: object }>(
  persisted: unknown,
  current: State,
): State {
  const saved = persisted as Partial<State> | undefined;
  const settings = { ...current.settings, ...saved?.settings };
  delete (settings as { autoDeleteDays?: number }).autoDeleteDays;
  return { ...current, ...saved, settings };
}
