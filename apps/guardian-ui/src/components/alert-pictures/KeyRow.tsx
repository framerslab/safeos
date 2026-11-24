/**
 * A row of keys that stays one row. Where the keys do not fit (large text
 * on a narrow screen) the row scrolls inside itself, with a faded edge
 * where more keys stand and a previous and a next arrow key, each inactive
 * at its end.
 *
 * @module components/alert-pictures/KeyRow
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const PREVIOUS_KEYS = 'Previous keys';
export const NEXT_KEYS = 'Next keys';

interface KeyRowProps {
  className?: string;
  children: React.ReactNode;
}

export function KeyRow({ className = '', children }: KeyRowProps) {
  const frame = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ overflows: false, atStart: true, atEnd: true });

  const measure = useCallback(() => {
    const el = row.current;
    const outer = frame.current;
    if (!el || !outer) return;
    // Arrows take space inside the frame. Use its full content width for the fit decision.
    const { paddingLeft, paddingRight } = getComputedStyle(outer);
    const available = outer.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight);
    const overflows = el.scrollWidth > available + 1;
    const next = {
      overflows,
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    };
    setFit((now) => (now.overflows === next.overflows && now.atStart === next.atStart && now.atEnd === next.atEnd ? now : next));
  }, []);

  useEffect(() => {
    measure();
    const el = row.current;
    const outer = frame.current;
    if (!el || !outer || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure, children]);

  const move = (direction: 1 | -1) => {
    const el = row.current;
    if (!el) return;
    // No slide: the row moves at once, under any motion setting.
    el.scrollLeft += direction * Math.max(88, el.clientWidth * 0.8);
    measure();
  };

  return (
    <div ref={frame} className={`alert-pictures-keys ${className}`.trim()} data-overflows={fit.overflows ? '' : undefined}>
      {fit.overflows && (
        <button type="button" className="alert-pictures-keys__arrow" aria-label={PREVIOUS_KEYS} disabled={fit.atStart} onClick={() => move(-1)}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" focusable="false">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <div
        ref={row}
        className="alert-pictures-keys__row"
        data-more-before={fit.overflows && !fit.atStart ? '' : undefined}
        data-more-after={fit.overflows && !fit.atEnd ? '' : undefined}
        onScroll={measure}
      >
        {children}
      </div>
      {fit.overflows && (
        <button type="button" className="alert-pictures-keys__arrow" aria-label={NEXT_KEYS} disabled={fit.atEnd} onClick={() => move(1)}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" focusable="false">
            <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default KeyRow;
