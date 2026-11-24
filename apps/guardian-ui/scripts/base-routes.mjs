// Which 404s the picture run's base capture may skip.
//
// The base commit of a pull request that adds a page has no such page, so
// its build answers 404 for it. That one case is noted and skipped: the
// capture runs in the base commit's own checkout (PICTURE_VERSION=before),
// and the route has no page file there. A 404 for a page the base commit
// holds is a regression and fails, as does any 404 in the pull request's
// own build or in a run with no PICTURE_VERSION.

import { existsSync } from 'node:fs';
import path from 'node:path';

const PAGE_FILES = ['page.tsx', 'page.ts', 'page.jsx', 'page.js', 'page.mdx'];

/** True when the checkout at appDir has a page for the route. */
export function hasPage(route, appDir) {
  const parts = route.split(/[?#]/)[0].split('/').filter(Boolean);
  const folder = path.join(appDir, 'src', 'app', ...parts);
  return PAGE_FILES.some((file) => existsSync(path.join(folder, file)));
}

/** True when the base capture skips this answer as a page the base commit lacks. */
export function skipsInBase({ route, status, version, appDir }) {
  return version === 'before' && status === 404 && !hasPage(route, appDir);
}
