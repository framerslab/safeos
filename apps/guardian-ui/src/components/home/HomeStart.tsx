/**
 * The first screen's start action
 *
 * One key takes a visitor to setup. Once setup is done on this device the key
 * opens the dashboard, a link row runs setup again and a line says setup is
 * done. Before script runs, and when the stored setup state cannot be read,
 * the key reads "Start setup".
 *
 * @module components/home/HomeStart
 */

'use client';

import Link from 'next/link';
import { useSetupDone } from '@/lib/use-setup-done';
import { StartArrow } from '@/components/visitor/StartLink';

export function HomeStart() {
  const done = useSetupDone();
  return (
    <>
      <div className="home-start__keys">
        <Link href={done ? '/dashboard/' : '/setup/'} className="key key--solid key--start">
          <span>{done ? 'Open dashboard' : 'Start setup'}</span>
          <StartArrow />
        </Link>
        {done && (
          <Link href="/setup/?again=1" className="link-row">
            Run setup again
          </Link>
        )}
      </div>
      {done && <p className="home-start__done">Setup is done on this device.</p>}
    </>
  );
}

export default HomeStart;
