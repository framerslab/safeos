/**
 * Recovering from a script file an older build named
 *
 * Each deploy replaces the site's script files. A tab opened before a deploy,
 * or a browser that keeps a page from before it, can then ask for a file the
 * new build no longer has. The app's error pages reload once to fetch the
 * newest build for that error, and remember the reload in this tab's session
 * storage for five minutes with the build the page came from, so a file that
 * is missing for another reason shows the error page instead of reloading in a
 * loop. A newer build that replaces the files again within those five minutes
 * gets its own reload: each build reloads once.
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
  /** The build the page came from; read from the page when not given. */
  build?: string;
}

/**
 * The build this page came from: the address of its script runtime, which a
 * deploy renames whenever it changes a script file. Empty where the page has
 * none.
 */
export function pageBuild(): string {
  try {
    return document.querySelector('script[src*="/_next/static/chunks/webpack-"]')?.getAttribute('src') ?? '';
  } catch {
    return '';
  }
}

/** The last reload this tab remembers: when, and for which build. An earlier version kept the time alone. */
function lastReload(saved: string | null): { at: number; build: string } {
  if (!saved) return { at: 0, build: '' };
  try {
    const parsed = JSON.parse(saved) as unknown;
    if (typeof parsed === 'number') return { at: parsed, build: '' };
    if (parsed && typeof parsed === 'object') {
      const { at, build } = parsed as { at?: unknown; build?: unknown };
      return { at: typeof at === 'number' ? at : 0, build: typeof build === 'string' ? build : '' };
    }
  } catch {
    // Not one this code wrote: no reload is remembered.
  }
  return { at: 0, build: '' };
}

/**
 * Reloads the page once for a missing build file. Returns true when it
 * reloads; false for any other error, for a second missing file from the same
 * build within five minutes, and where the tab cannot remember the reload.
 */
export function reloadForNewBuild(error: unknown, options: ReloadOptions = {}): boolean {
  if (!isMissingBuildFile(error)) return false;
  const now = options.now ?? Date.now();
  const build = options.build ?? pageBuild();
  try {
    const storage = options.storage ?? window.sessionStorage;
    const last = lastReload(storage.getItem(RELOAD_KEY));
    if (now - last.at < RELOAD_WINDOW_MS && last.build === build) return false;
    storage.setItem(RELOAD_KEY, JSON.stringify({ at: now, build }));
  } catch (storageError) {
    console.warn('The page could not remember a reload, so it shows the error instead:', storageError);
    return false;
  }
  (options.reload ?? (() => window.location.reload()))();
  return true;
}
