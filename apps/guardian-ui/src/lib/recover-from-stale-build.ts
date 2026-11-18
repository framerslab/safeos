/**
 * Recovering from a script file an older build named
 *
 * Each deploy replaces the site's script files. A tab opened before a deploy,
 * or a browser that keeps a page from before it, can then ask for a file the
 * new build no longer has. The app's error pages reload once to fetch the
 * newest build for that error, and remember the reload in this tab's session
 * storage for five minutes, so a file that is missing for another reason shows
 * the error page instead of reloading in a loop.
 *
 * @module lib/recover-from-stale-build
 */

const RELOAD_KEY = 'safeos-stale-build-reload';
const RELOAD_WINDOW_MS = 5 * 60_000;

/** True for the errors a browser gives when a script or style file of the app is missing. */
export function isMissingBuildFile(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  return /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
    .test(error.message);
}

interface ReloadOptions {
  now?: number;
  storage?: Storage;
  reload?: () => void;
}

/**
 * Reloads the page once for a missing build file. Returns true when it
 * reloads; false for any other error, for a second missing file within five
 * minutes, and where the tab cannot remember the reload.
 */
export function reloadForNewBuild(error: unknown, options: ReloadOptions = {}): boolean {
  if (!isMissingBuildFile(error)) return false;
  const now = options.now ?? Date.now();
  try {
    const storage = options.storage ?? window.sessionStorage;
    const last = Number(storage.getItem(RELOAD_KEY) || 0);
    if (now - last < RELOAD_WINDOW_MS) return false;
    storage.setItem(RELOAD_KEY, String(now));
  } catch (storageError) {
    console.warn('The page could not remember a reload, so it shows the error instead:', storageError);
    return false;
  }
  (options.reload ?? (() => window.location.reload()))();
  return true;
}
