/**
 * The watch's view, kept on this device
 *
 * The watch shows its settings folded ("watch") or open ("settings"). The
 * choice is read after the page mounts, so the served page and the first
 * render agree, and kept in this site's storage; a browser that refuses the
 * storage keeps it for the visit.
 *
 * @module lib/watch-view
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { readKept, writeKept } from './visit-store';

export type WatchView = 'watch' | 'settings';

export const WATCH_VIEW_KEY = 'safeos-watch-view';

const viewOf = (value: string | null): WatchView => (value === 'settings' ? 'settings' : 'watch');

export function useWatchView(): [WatchView, (view: WatchView) => void] {
  const [view, setView] = useState<WatchView>('watch');

  useEffect(() => {
    setView(viewOf(readKept(WATCH_VIEW_KEY)));
  }, []);

  const choose = useCallback((next: WatchView) => {
    setView(next);
    writeKept(WATCH_VIEW_KEY, next);
  }, []);

  return [view, choose];
}
