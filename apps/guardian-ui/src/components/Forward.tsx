/**
 * An old address that forwards
 *
 * The page at an old address replaces itself with the page that does its job
 * now, adding no entry to the history, so Back returns to the page before it.
 * Its one line and its link are in the served HTML, so a browser without
 * script reads where the page went and follows the link.
 *
 * @module components/Forward
 */

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export interface ForwardProps {
  /** The page that does the job now, with its closing slash. */
  to: string;
  /** The page's one line, its h1. */
  line: string;
  /** The link row's words. */
  link: string;
}

export function Forward({ to, line, link }: ForwardProps) {
  const router = useRouter();

  useEffect(() => {
    router.replace(to);
  }, [router, to]);

  return (
    <main className="forward">
      <h1 className="forward__line">{line}</h1>
      <Link href={to} className="link-row forward__link">
        {link}
      </Link>
    </main>
  );
}

export default Forward;
