/**
 * Setup's last key
 *
 * The key names the page it opens and, while that page opens, says so and
 * waits. A refused write is said above it from its status region. On a phone
 * the key stands in a bar fixed to the foot of the screen, and the page's
 * foot is kept clear of the bar; from 48em the key stands in the flow.
 *
 * @module components/setup/LastKey
 */

'use client';

import { useEffect, useRef } from 'react';
import { ProblemMark } from '@/components/dashboard/Drawn';
import type { Way } from '@/lib/app-routes';
import type { LastKeyState } from '@/lib/use-finish';

export interface LastKeyProps {
  way: Way | null;
  state: LastKeyState;
  onPress: () => void;
}

/** "Open dashboard" or "Open {way}"; while the destination opens, "Opening the dashboard…" or "Opening {way}…". */
export function lastKeyWords(way: Way | null, opening: boolean): string {
  if (opening) return way ? `Opening ${way.name}…` : 'Opening the dashboard…';
  return way ? `Open ${way.name}` : 'Open dashboard';
}

export function LastKey({ way, state, onPress }: LastKeyProps) {
  const bar = useRef<HTMLDivElement>(null);
  const opening = state === 'opening';

  // On a phone the bar is fixed to the foot: the page's foot is kept clear of it.
  useEffect(() => {
    const root = document.documentElement;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      root.style.setProperty('--setup-bar', `${bar.current?.getBoundingClientRect().height ?? 0}px`);
    };
    const leave = () => {
      observer?.disconnect();
      observer = null;
      root.classList.remove('setup-bar-fixed');
      root.style.removeProperty('--setup-bar');
    };
    let query: MediaQueryList | null = null;
    try {
      query = window.matchMedia('(min-width: 48em)');
    } catch {
      query = null;
    }
    const follow = () => {
      if (query?.matches) {
        leave();
        return;
      }
      root.classList.add('setup-bar-fixed');
      measure();
      if (!observer && typeof ResizeObserver === 'function' && bar.current) {
        observer = new ResizeObserver(measure);
        observer.observe(bar.current);
      }
    };
    follow();
    // In older browsers a media query list is no event target and has only
    // addListener and removeListener, kept for a 'change' listener
    // (https://developer.mozilla.org/en-US/docs/Web/API/MediaQueryList/addListener):
    // such a list is followed through those.
    const modern = typeof query?.addEventListener === 'function';
    if (modern) query?.addEventListener('change', follow);
    else query?.addListener?.(follow);
    return () => {
      if (modern) query?.removeEventListener('change', follow);
      else query?.removeListener?.(follow);
      leave();
    };
  }, []);

  return (
    <div className="setup-last" data-state={state} ref={bar}>
      <div className="setup-last-says" role="status" aria-live="polite">
        {state === 'unsaved' ? (
          <p className="setup-body setup-unsaved">
            <ProblemMark />
            <span>
              This browser did not save setup. <span translate="no">SafeOS</span> works for this visit and asks for setup again
              next time.
            </span>
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className={opening ? 'key key--solid key--start setup-last-key setup-key--waiting' : 'key key--solid key--start setup-last-key'}
        aria-busy={opening ? 'true' : undefined}
        aria-disabled={opening ? 'true' : undefined}
        onClick={() => {
          if (!opening) onPress();
        }}
      >
        {lastKeyWords(way, opening)}
      </button>
    </div>
  );
}

export default LastKey;
