/**
 * A settings page's head: the back link to Settings (a chevron and the word),
 * the page's heading and its line.
 *
 * @module components/settings/PageHead
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronGlyph } from './glyphs';

export function PageHead({
  title,
  lead,
  level = 1,
  back = true,
}: {
  title: string;
  lead?: ReactNode;
  level?: 1 | 2;
  back?: boolean;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div className="set-head">
      {back ? (
        <Link href="/settings/" className="set-back">
          <ChevronGlyph to="left" className="set-glyph set-glyph--back" />
          Settings
        </Link>
      ) : null}
      <Heading className="set-heading">{title}</Heading>
      {lead ? <div className="set-lead">{lead}</div> : null}
    </div>
  );
}

export default PageHead;
