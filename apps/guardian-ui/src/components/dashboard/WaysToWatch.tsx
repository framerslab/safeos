/**
 * The four ways to watch
 *
 * The dashboard's list of the four ways in one fixed order, each a link to
 * its page named by its name and its line. The served page holds the four
 * rows with their glyphs and their own lines, so they work before this
 * device is read. Once it is read, Lost and Found shows the pet it watches
 * for (never a person), People's line follows the number of people allowed,
 * and a square stands before the name of the way Start watching uses. Before
 * setup, and before the device is read, each row opens setup with its way
 * named; setup sends a device already set up on to that way. Offline, People and
 * Wildlife say they need a connection until their detection model is on this
 * device.
 *
 * @module components/dashboard/WaysToWatch
 */

'use client';

import Link from 'next/link';
import { cloneElement, useEffect, useState } from 'react';
import { IconActivity, IconPaw, IconPerson, IconWildlife } from '@/components/icons';
import { StartArrow } from '@/components/visitor/StartLink';
import { WAYS, type Way, type WayId } from '@/lib/app-routes';
import type { SubjectProfileDB } from '@/lib/client-db';
import { useModelOnDevice } from '@/lib/model-on-device';
import { rowPet, startChoice } from '@/lib/start-watch';
import { onTabMessage } from '@/lib/tab-channel';
import { readLastWay, type LastWay } from '@/lib/watch-session';
import { useSecurityStore } from '@/stores/security-store';

export interface WaysToWatchProps {
  /** null until read; false before setup. Until it reads true a row opens setup with its way named. */
  setUp: boolean | null;
  /** Every saved Lost and Found subject; null until read. */
  subjects: SubjectProfileDB[] | null;
}

const NEEDS_CONNECTION = 'Needs a connection the first time.';

/** "Alerts when someone is in view." at 0; "Alerts above 1 person in view."; "Alerts above 3 people in view.". */
export function peopleLine(allowed: number): string {
  if (!(allowed >= 1)) return 'Alerts when someone is in view.';
  return allowed === 1 ? 'Alerts above 1 person in view.' : `Alerts above ${allowed} people in view.`;
}

const GLYPHS: Record<WayId, (props: { size?: number }) => JSX.Element> = {
  monitor: IconActivity,
  'lost-found': IconPaw,
  security: IconPerson,
  wildlife: IconWildlife,
};

/** A way's glyph at 32 px, hidden from assistive technology: the words beside it name the way. */
export function WayGlyph({ way }: { way: WayId }) {
  return cloneElement(GLYPHS[way]({ size: 32 }), { 'aria-hidden': 'true', focusable: 'false' });
}

/** Words for a name read aloud, with each curly apostrophe written straight. */
const plain = (text: string) => text.replace(/’/g, "'");

/** Whether the browser says it is online, followed through its online and offline events; true until read. */
function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const read = () => setOnline(navigator.onLine !== false);
    read();
    window.addEventListener('online', read);
    window.addEventListener('offline', read);
    return () => {
      window.removeEventListener('online', read);
      window.removeEventListener('offline', read);
    };
  }, []);
  return online;
}

/**
 * The way this device last watched with, read after the part mounts, so the
 * served page and the first render are alike; read again when a watch in
 * another tab starts or ends, as the watching state reads it.
 */
function useLastWay(): { last: LastWay | null; read: boolean } {
  const [kept, setKept] = useState<{ last: LastWay | null; read: boolean }>({ last: null, read: false });
  useEffect(() => {
    const read = () => setKept({ last: readLastWay(), read: true });
    read();
    return onTabMessage((message) => {
      if (message.type === 'watch-started' || message.type === 'watch-ended') read();
    });
  }, []);
  return kept;
}

export function WaysToWatch({ setUp, subjects }: WaysToWatchProps) {
  const { last, read } = useLastWay();
  const online = useOnline();
  const modelHere = useModelOnDevice();
  const allowed = useSecurityStore((state) => state.settings.allowedPersons);
  // The address of a pet's photo the browser could not read.
  const [unreadable, setUnreadable] = useState<string | null>(null);

  const pet = read && subjects ? rowPet(last, subjects) : null;
  const photo = pet?.referenceImages?.[0];
  const using: WayId | null = read && setUp === true && subjects !== null ? startChoice(last, subjects).way : null;

  const line = (way: Way): string => {
    if (way.id === 'lost-found' && pet) return `Watches for ${pet.name}’s colours.`;
    if ((way.id === 'security' || way.id === 'wildlife') && !online && modelHere === false) return NEEDS_CONNECTION;
    if (way.id === 'security') return peopleLine(allowed);
    return way.line;
  };

  const picture = (way: Way) => {
    if (way.id === 'lost-found' && pet && photo && photo !== unreadable) {
      return (
        // A saved photo is a data address on this device, which the image optimiser cannot serve.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={`Photo of ${pet.name}`}
          width={32}
          height={32}
          className="way__photo"
          onError={() => setUnreadable(photo)}
        />
      );
    }
    return <WayGlyph way={way.id} />;
  };

  return (
    <section className="ways" aria-labelledby="ways-label">
      <h2 id="ways-label" className="dash-label">
        Ways to watch
      </h2>
      <ul className="ways__list">
        {WAYS.map((way) => {
          const uses = using === way.id;
          const words = line(way);
          return (
            <li key={way.id} className="way">
              <Link
                href={setUp === true ? way.href : `/setup/?next=${way.id}`}
                className="way__link"
                aria-label={`${way.name}: ${plain(words)}${uses ? ' Start watching uses this way' : ''}`}
              >
                <span className="way__glyph">{picture(way)}</span>
                <span className="way__words">
                  <span className="way__name">
                    {uses && <span className="way__square" aria-hidden="true" />}
                    {way.name}
                  </span>
                  <span className="way__line">{words}</span>
                </span>
                <StartArrow />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default WaysToWatch;
