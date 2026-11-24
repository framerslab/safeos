'use client';

/**
 * A row that opens a page: its name, its value line and a chevron, the whole
 * row the link. The link is named by the page's name and described by its
 * value; a value still being read (null) is a short bar along the row's foot,
 * never a default, and a row with no value (undefined) shows its name alone. The page being read carries aria-current and a 2 px bar at the
 * row's left edge.
 *
 * @module components/settings/LinkRow
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronGlyph } from './glyphs';

export function LinkRow({
  href,
  name,
  value,
  valueId,
  picture,
  lead,
  current,
  onClick,
}: {
  href: string;
  name: string;
  value?: string | null;
  valueId: string;
  /** A small picture at the row's right, aria-hidden beside the value's words. */
  picture?: ReactNode;
  /** A small picture at the row's left (the pet's photo). */
  lead?: ReactNode;
  current?: boolean;
  onClick?: () => void;
}) {
  const nameId = `${valueId}-name`;
  return (
    <Link
      href={href}
      className="set-row set-link"
      aria-labelledby={nameId}
      aria-describedby={typeof value === 'string' ? valueId : undefined}
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
    >
      {lead ? (
        <span className="set-link__lead" aria-hidden="true">
          {lead}
        </span>
      ) : null}
      <span className="set-link__words">
        <span id={nameId} className="set-row__name">
          {name}
        </span>
        {value === null ? (
          <span className="set-row__loading" aria-hidden="true" />
        ) : typeof value === 'string' ? (
          <span id={valueId} className="set-row__value">
            {value}
          </span>
        ) : null}
      </span>
      {picture ? (
        <span className="set-link__picture" aria-hidden="true">
          {picture}
        </span>
      ) : null}
      <ChevronGlyph />
    </Link>
  );
}

export default LinkRow;
