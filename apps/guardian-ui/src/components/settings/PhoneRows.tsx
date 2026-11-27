/**
 * Settings' first two rows on a phone
 *
 * A phone's top bar holds the brand alone, so the look switch and the way to
 * Help stand here, above the page's own sections. From the tablet width the
 * header row carries both and these rows are not shown.
 *
 * @module components/settings/PhoneRows
 */

'use client';

import Link from 'next/link';
import { LookRow } from '../app/LookRow';
import { StartArrow } from '../visitor/StartLink';

export function PhoneRows() {
  return (
    <div className="settings-phone-rows look-part">
      <LookRow rowClass="settings-row" />
      <Link href="/help/" className="settings-row">
        <span>Help</span>
        <StartArrow />
      </Link>
    </div>
  );
}

export default PhoneRows;
