/**
 * Start link
 *
 * The link that takes a visitor to setup. It reads "Start setup" in the
 * served HTML and before script runs; once script has read that setup is done
 * on this device it reads "Open dashboard" and opens the dashboard.
 *
 * @module components/visitor/StartLink
 */

'use client';

import Link from 'next/link';
import { useSetupDone } from '@/lib/use-setup-done';

interface StartLinkProps {
  className?: string;
  /** Shows the decorative arrow of the first screen's and the closing block's key. */
  arrow?: boolean;
  onClick?: () => void;
}

export function StartArrow() {
  return (
    <svg className="key__arrow" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4 10h11M11 5.5 15.5 10 11 14.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StartLink({ className, arrow = false, onClick }: StartLinkProps) {
  const done = useSetupDone();
  return (
    <Link href={done ? '/dashboard/' : '/setup/'} className={className} onClick={onClick}>
      <span>{done ? 'Open dashboard' : 'Start setup'}</span>
      {arrow && <StartArrow />}
    </Link>
  );
}

export default StartLink;
