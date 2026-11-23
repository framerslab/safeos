'use client';

/**
 * The storage line on every settings page but the list, which holds its own
 * under its heading: a device too full to keep the settings, or a browser
 * that refuses this site's storage, is told so on the page where the change
 * was made.
 *
 * @module components/settings/PageStorageLine
 */

import { usePathname } from 'next/navigation';
import { StorageLine } from './StorageLine';

export function PageStorageLine() {
  const path = usePathname();
  if (path && path.replace(/\/+$/, '') === '/settings') return null;
  return (
    <div className="settings look-part set-storage-page">
      <div className="settings-page">
        <StorageLine />
      </div>
    </div>
  );
}

export default PageStorageLine;
