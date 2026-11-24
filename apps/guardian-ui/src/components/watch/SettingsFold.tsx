'use client';
/**
 * Settings for this watch
 *
 * The watch's settings, folded under one row: its heading and the key "Show
 * settings" ("Hide settings" while open), which stretches over the whole row
 * so a press anywhere along it opens or folds them. The choice is kept on
 * this device.
 *
 * @module components/watch/SettingsFold
 */

import type { ReactNode } from 'react';
import { useWatchView } from '../../lib/watch-view';
import { ChevronGlyph } from './Glyphs';

export function SettingsFold({ children }: { children: ReactNode }) {
  const [view, setView] = useWatchView();
  const open = view === 'settings';
  return (
    <section className="watch-fold" aria-labelledby="watch-settings-name">
      <div className="watch-disclosure" data-open={open}>
        <h2 id="watch-settings-name" className="watch-disclosure__name">
          Settings for this watch
        </h2>
        <button
          type="button"
          className="watch-disclosure__key"
          aria-expanded={open}
          aria-controls="watch-settings"
          onClick={() => setView(open ? 'watch' : 'settings')}
        >
          <span>{open ? 'Hide settings' : 'Show settings'}</span>
          <ChevronGlyph />
        </button>
      </div>
      {open && (
        <div id="watch-settings" className="watch-fold__panel">
          {children}
        </div>
      )}
    </section>
  );
}
