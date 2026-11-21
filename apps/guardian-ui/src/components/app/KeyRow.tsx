/**
 * The keys of a way's page, on one line
 *
 * On a phone the row never makes the page wider than the screen. When its
 * keys are wider than their place it scrolls inside itself, and while keys lie
 * past its right edge it carries data-overflow, and the stylesheet fades that
 * edge by it.
 *
 * @module components/app/KeyRow
 */

'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function KeyRow({ children }: { children: ReactNode }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  // Measured on arrival, on each scroll of the row, and whenever the row or a
  // key changes size (the text size, a font that arrives, a key's words).
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => setOverflow(row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
    measure();
    row.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (observer) {
      observer.observe(row);
      Array.from(row.children).forEach((key) => observer.observe(key));
    }
    document.fonts?.ready?.then(measure).catch(() => undefined);
    return () => {
      row.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);

  return (
    <div ref={rowRef} className="way-head__keys key-row" data-overflow={overflow ? '' : undefined}>
      {children}
    </div>
  );
}
