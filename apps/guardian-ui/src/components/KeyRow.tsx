'use client';

/**
 * A row of keys
 *
 * Keys side by side share one row, each at its own width. When they are wider
 * than the row's place (a narrow screen or larger text) the row scrolls inside
 * itself, with a faded edge on the side that holds more and two arrow keys,
 * Scroll left and Scroll right; it never wraps. An arrow key at its end stays
 * in the order and is inactive. A press moves the row by most of its width,
 * smoothly unless the person asked for reduced motion.
 *
 * @module components/KeyRow
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

type More = 'none' | 'start' | 'end' | 'both';

function Chevron({ to }: { to: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={to === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  );
}

export function KeyRow({ children, className }: { children: ReactNode; className?: string }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<More>('none');

  // Which sides hold keys out of view. The keys are measured against the
  // row's whole place, not the part the arrow keys leave them, so arrow keys
  // shown once (larger text, or before the page's face has come) go again
  // once the keys fit.
  const read = useCallback(() => {
    const row = rowRef.current;
    const keys = keysRef.current;
    if (!row || !keys) return;
    if (keys.scrollWidth <= row.clientWidth + 0.5) {
      setMore('none');
      return;
    }
    const before = keys.scrollLeft > 1;
    const after = keys.scrollLeft + keys.clientWidth < keys.scrollWidth - 1;
    setMore(before && after ? 'both' : before ? 'start' : 'end');
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    const keys = keysRef.current;
    if (!row || !keys) return;
    read();
    keys.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', read);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    observer?.observe(row);
    observer?.observe(keys);
    document.fonts?.ready?.then(read).catch(() => undefined);
    return () => {
      keys.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
      observer?.disconnect();
    };
  }, [read]);

  const move = (way: -1 | 1) => {
    const keys = keysRef.current;
    if (!keys) return;
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    keys.scrollBy?.({ left: way * Math.max(keys.clientWidth * 0.8, 44), behavior: still ? 'auto' : 'smooth' });
  };

  const scrolls = more !== 'none';
  const atStart = more === 'none' || more === 'end';
  const atEnd = more === 'none' || more === 'start';
  return (
    <div ref={rowRef} className={className ? `key-row ${className}` : 'key-row'} data-more={scrolls ? more : undefined}>
      {scrolls && (
        <button
          type="button"
          className="key--icon key-row__arrow"
          aria-label="Scroll left"
          aria-disabled={atStart ? 'true' : undefined}
          onClick={() => { if (!atStart) move(-1); }}
        >
          <Chevron to="left" />
        </button>
      )}
      <div ref={keysRef} className="key-row__keys">
        {children}
      </div>
      {scrolls && (
        <button
          type="button"
          className="key--icon key-row__arrow"
          aria-label="Scroll right"
          aria-disabled={atEnd ? 'true' : undefined}
          onClick={() => { if (!atEnd) move(1); }}
        >
          <Chevron to="right" />
        </button>
      )}
    </div>
  );
}
