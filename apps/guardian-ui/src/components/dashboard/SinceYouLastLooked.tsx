/**
 * Since you last looked
 *
 * The dashboard's list of the alerts that came in since the person last
 * looked, from all four ways, newest first: as many rows as the layout shows
 * (3 on a phone, 4 on a tablet, 5 from the desktop width), each a link to
 * History named by its words, its time and its way, then Mark all as seen
 * and the way to History. It says when nothing is new, when the alerts could
 * not be read and when the device is out of room, and it holds no key that
 * deletes.
 *
 * @module components/dashboard/SinceYouLastLooked
 */

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Brand } from '@/components/home/Brand';
import { Num } from '@/components/visitor/Num';
import { alertLine, type DeviceAlert } from '@/lib/alert-groups';
import { WAYS } from '@/lib/app-routes';
import { clockTime } from '@/lib/clock-time';
import { useDeviceAlerts } from '@/lib/device-alerts';
import { CameraFrame, LevelLine, ProblemMark } from './Drawn';
import { WayGlyph } from './WaysToWatch';

const TABLET = '(min-width: 48em)';
const DESKTOP = '(min-width: 64em)';

/** Calls `listener` on each change of a media query; an older browser offers only addListener. */
function follow(list: MediaQueryList, listener: () => void): () => void {
  if (typeof list.addEventListener === 'function') {
    list.addEventListener('change', listener);
    return () => list.removeEventListener('change', listener);
  }
  list.addListener(listener);
  return () => list.removeListener(listener);
}

/** How many alert rows the layout shows: 3 under 48em, 4 from 48em, 5 from 64em. Follows the window. */
export function useRowLimit(): number {
  const [limit, setLimit] = useState(3);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const desktop = window.matchMedia(DESKTOP);
    const tablet = window.matchMedia(TABLET);
    const read = () => setLimit(desktop.matches ? 5 : tablet.matches ? 4 : 3);
    read();
    const offDesktop = follow(desktop, read);
    const offTablet = follow(tablet, read);
    return () => {
      offDesktop();
      offTablet();
    };
  }, []);
  return limit;
}

const wayName = (alert: DeviceAlert) => WAYS.find((way) => way.id === alert.way)?.name ?? '';

/** Words for a name read aloud, with each curly apostrophe written straight. */
const plain = (text: string) => text.replace(/’/g, "'");

function Problem({ children }: { children: ReactNode }) {
  return (
    <p className="dash-problem">
      <ProblemMark />
      <span>{children}</span>
    </p>
  );
}

/** Reads this device's alerts through useDeviceAlerts(). */
export function SinceYouLastLooked() {
  const { status, newAlerts, storageFull, markAllSeen, readAgain } = useDeviceAlerts();
  const limit = useRowLimit();
  const labelRef = useRef<HTMLHeadingElement>(null);

  // The alerts listed at the first ready render. A row not among them came
  // in while the dashboard was open, and slides in.
  const firstListed = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (status === 'ready' && firstListed.current === null) {
      firstListed.current = new Set(newAlerts.map((alert) => alert.id));
    }
  }, [status, newAlerts]);
  const arrived = (alert: DeviceAlert) => firstListed.current !== null && !firstListed.current.has(alert.id);

  // Focus moves to the label once the alerts are marked, so it never falls
  // to the top of the page when the key leaves.
  const markAll = async () => {
    try {
      await markAllSeen();
    } catch {
      // The list stays as it was, and the next read says what is new.
    }
    labelRef.current?.focus();
  };

  const rows = newAlerts.slice(0, limit);
  const more = newAlerts.length - rows.length;

  return (
    <section className="since" aria-labelledby="since-label">
      <div className="tick-rule since__rule" aria-hidden="true" />
      <h2 id="since-label" ref={labelRef} tabIndex={-1} className="dash-label">
        Since you last looked
      </h2>

      {status === 'reading' && (
        <div className="since__drawing">
          <CameraFrame loading />
        </div>
      )}

      {status === 'failed' && (
        <>
          <div className="since__drawing">
            <LevelLine broken />
          </div>
          <div role="status">
            <Problem>Alerts could not be read on this device.</Problem>
          </div>
          <div className="since__ways-on">
            <button type="button" className="key key--outline" onClick={readAgain}>
              Try again
            </button>
          </div>
        </>
      )}

      {status === 'ready' && storageFull && (
        <>
          <div role="status">
            <Problem>
              This device is out of room, so new alerts and pictures cannot be saved. Free room on the device, or clear{' '}
              <Brand>SafeOS</Brand>’s saved data in Settings.
            </Problem>
          </div>
          <Link href="/settings/" className="link-row">
            Open settings
          </Link>
        </>
      )}

      {status === 'ready' && newAlerts.length === 0 && (
        <>
          <p className="since__empty">Nothing new since you last looked.</p>
          <div className="since__drawing">
            <LevelLine />
          </div>
          <Link href="/history/" className="link-row">
            Open history
          </Link>
        </>
      )}

      {status === 'ready' && newAlerts.length > 0 && (
        <>
          <ul className="since__list">
            {rows.map((alert) => {
              const name = `${plain(alertLine(alert, clockTime))}, from ${wayName(alert)}`;
              return (
                <li key={alert.id} className={arrived(alert) ? 'since__item since__item--arrived' : 'since__item'}>
                  <Link href="/history/" className="since__row" aria-label={name}>
                    <span className="since__picture">
                      {alert.picture ? (
                        // A saved picture is a data address on this device, which the image optimiser cannot serve.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={alert.picture} alt={name} width={64} height={48} loading="lazy" />
                      ) : (
                        <WayGlyph way={alert.way} />
                      )}
                    </span>
                    <span className="since__words">
                      <span className="since__what">
                        {alert.what} at <Num>{clockTime(alert.at)}</Num>
                      </span>
                      <span className="since__way">{wayName(alert)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="since__ways-on">
            <button type="button" className="key key--outline" onClick={() => void markAll()}>
              Mark all as seen
            </button>
            <Link href="/history/" className="link-row">
              {more > 0 ? (
                // One span: the link is a flex row, where a run of words
                // directly inside it would lose the space at its edge.
                <span>
                  Open history, and <Num>{more}</Num> more
                </span>
              ) : (
                'Open history'
              )}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

export default SinceYouLastLooked;
