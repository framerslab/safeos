/**
 * The watching state and the start key
 *
 * The dashboard's first part: whether this device is watching, the way Start
 * watching uses and when the last watch ended, what stands in a watch's way
 * with its fix, one key, and the statement of what SafeOS does not replace.
 * Before setup the one key is Start setup. Until this device's setup record
 * and its saved subjects are read, the heading's and the key's places are
 * held, so nothing moves when the state appears. With Lost and Found chosen
 * in setup and no pet saved yet, the line says to add the pet's photos first
 * and the key opens the Lost and Found page; that key asks for no camera, so
 * the dashboard says nothing of the camera then.
 *
 * @module components/dashboard/WatchState
 */

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Brand } from '@/components/home/Brand';
import { Num } from '@/components/visitor/Num';
import { useCameraAsk, useNotificationAsk } from '@/lib/browser-asks';
import { dropStart } from '@/lib/camera-handoff';
import type { SubjectProfileDB } from '@/lib/client-db';
import { clockTime } from '@/lib/clock-time';
import { NEEDS_SCRIPT, hideUntilNeeded } from '@/lib/needs-script';
import { useStorageEnds } from '@/lib/short-lived-storage';
import { useStartGuard } from '@/lib/start-guard';
import { startAddress, startChoice, startLine, startWatch, type StartOutcome } from '@/lib/start-watch';
import { useOtherTabWatch } from '@/lib/tab-channel';
import { readLastWay, readWatchSession, type LastWay, type WatchSession } from '@/lib/watch-session';
import { CameraFrame, ProblemMark } from './Drawn';

export interface WatchStateProps {
  /** null until this device's setup record is read; false before setup. */
  setUp: boolean | null;
  /** Every saved Lost and Found subject; null until read. */
  subjects: SubjectProfileDB[] | null;
  /** How many alerts are new; the sentence shows above 0. */
  newAlerts: number;
}

type CameraProblem = 'blocked' | 'in-use' | 'failed';

const CAMERA_WORDS: Record<CameraProblem, string> = {
  blocked: 'The camera is blocked for safeos.sh in this browser. Allow it in the site’s settings, then press Start watching.',
  'in-use': 'The camera is in use by another tab or app. Close it, then press Start watching.',
  failed: 'The camera did not start. Press Start watching to try again.',
};

const NEEDS_SCRIPT_ID = 'dash-needs-script';

function Problem({ children }: { children: ReactNode }) {
  return (
    <p className="dash-problem">
      <ProblemMark />
      <span>{children}</span>
    </p>
  );
}

export function WatchState({ setUp, subjects, newAlerts }: WatchStateProps) {
  const read = setUp !== null && subjects !== null;
  const router = useRouter();
  const otherWatching = useOtherTabWatch();
  const cameraAsk = useCameraAsk();
  const { ask: notifications, request } = useNotificationAsk();
  const forgets = useStorageEnds();
  const { guard, dialog } = useStartGuard();

  // What this device remembers of its last watch, read after the page has
  // mounted, so the served page and the first render are alike; read again
  // when a watch in another tab ends.
  const [kept, setKept] = useState<{ last: LastWay | null; session: WatchSession | null }>({ last: null, session: null });
  useEffect(() => {
    setKept({ last: readLastWay(), session: readWatchSession() });
  }, [otherWatching]);

  const [starting, setStarting] = useState(false);
  const [outcome, setOutcome] = useState<CameraProblem | null>(null);
  const asking = useRef(false);

  // A camera that opens after the dashboard was left opens no page: the held
  // camera is closed.
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);
  const go = (address: string) => {
    if (shown.current) router.push(address);
    else dropStart();
  };

  const choice = startChoice(kept.last, subjects ?? []);
  const opensPage = choice.way === 'lost-found' && !choice.pet;

  const start = async () => {
    setOutcome(null);
    setStarting(true);
    let result: StartOutcome;
    try {
      result = await startWatch(choice, go);
    } catch {
      result = 'failed';
    }
    if (!shown.current) return;
    if (result === 'blocked' || result === 'in-use' || result === 'failed') {
      setStarting(false);
      setOutcome(result);
    } else if (result === 'stopped') {
      // Another tab took the watch over while the camera was asked for: its
      // word sets the heading, and the key is given back.
      setStarting(false);
    }
    // Opened: the way's page replaces this one, and the key waits until then.
  };

  const press = async (event: MouseEvent<HTMLButtonElement>) => {
    if (starting || asking.current) return;
    // No pet saved yet: the Lost and Found page, where the photos are added; no camera, no question to the other tabs.
    if (opensPage) {
      go(startAddress(choice));
      return;
    }
    asking.current = true;
    try {
      await guard(start, event.currentTarget);
    } finally {
      asking.current = false;
    }
  };

  // The camera's sentence: the last press's outcome, or the browser's own
  // answer at rest. It asks for a press of Start watching, so it shows on a
  // set-up device, not while a press waits, and not while the key opens the
  // Lost and Found page, which asks for no camera.
  const camera: CameraProblem | null =
    setUp && !starting && !opensPage ? (outcome ?? (cameraAsk === 'blocked' ? 'blocked' : null)) : null;

  const problems: ReactNode[] = [];
  if (camera) problems.push(<Problem key="camera">{CAMERA_WORDS[camera]}</Problem>);
  if (setUp && notifications === 'blocked') {
    problems.push(<Problem key="notifications">Alerts show in this tab only. Notifications are blocked for safeos.sh in this browser.</Problem>);
  }
  if (forgets) {
    problems.push(
      <Problem key="forgets">
        This browser forgets <Brand>SafeOS</Brand> when the window closes. Your settings and alerts last for this visit.
      </Problem>
    );
  }

  const fixes: ReactNode[] = [];
  if (setUp) {
    if (camera === 'blocked') {
      fixes.push(<Link key="camera" href="/help/#camera" className="link-row">How to allow the camera</Link>);
    }
    if (notifications === 'not-asked') {
      fixes.push(
        <button key="ask" type="button" className="link-row link-row--button" onClick={() => void request()}>
          Show alerts outside this tab
        </button>
      );
    }
    if (notifications === 'blocked') {
      fixes.push(<Link key="notifications" href="/help/#notifications" className="link-row">How to turn on notifications</Link>);
    }
  }

  const session = kept.session;

  return (
    <section className="dash-state" data-read={read ? 'yes' : 'no'}>
      <div className="dash-state__head">
        <CameraFrame loading={!read} />
        <h1 className="dash-heading">{setUp && otherWatching ? 'Watching in another tab' : 'Not watching'}</h1>
        {!read && <p className="dash-loading">Loading the dashboard…</p>}
      </div>
      <p id={NEEDS_SCRIPT_ID} className="needs-script">
        <Brand>SafeOS</Brand>
        {NEEDS_SCRIPT.slice('SafeOS'.length)}
      </p>
      <script dangerouslySetInnerHTML={{ __html: hideUntilNeeded(NEEDS_SCRIPT_ID) }} />
      {newAlerts > 0 && (
        <p className="dash-new">
          <ProblemMark />
          <span>
            {newAlerts === 1 ? (
              <>
                <Num>1</Num> new alert since you last looked.
              </>
            ) : (
              <>
                <Num>{newAlerts}</Num> new alerts since you last looked.
              </>
            )}
          </span>
        </p>
      )}
      {/* The line's place is held before the read by one no-break space, so
          the key's place does not move when a one-line line arrives. */}
      <p id="dash-line" className="dash-line">
        {!read && '\u00a0'}
        {read && (setUp ? startLine(choice) : 'Set up this device first. Setup asks for the camera and the microphone.')}
        {read && setUp && session && (
          session.endedAt !== null ? (
            <>
              {' '}The last watch ended at <Num>{clockTime(session.endedAt)}</Num>.
            </>
          ) : (
            <>
              {' '}The last watch ran until at least <Num>{clockTime(session.seenAt)}</Num>.
            </>
          )
        )}
      </p>
      <div className="dash-problems" role="status" aria-live="polite">
        {read && problems}
      </div>
      {read && fixes.length > 0 && <div className="dash-fixes">{fixes}</div>}
      <div className="dash-key-place">
        {read && setUp && (
          <button
            type="button"
            className={starting ? 'key key--start key--waiting dash-key' : 'key key--solid key--start dash-key'}
            aria-describedby="dash-line"
            aria-disabled={starting ? 'true' : undefined}
            onClick={(event) => void press(event)}
          >
            {starting ? 'Starting the camera…' : 'Start watching'}
          </button>
        )}
        {read && !setUp && (
          <Link href="/setup/" className="key key--solid key--start dash-key" aria-describedby="dash-line">
            Start setup
          </Link>
        )}
      </div>
      <p className="dash-statement">
        <Brand>SafeOS</Brand> adds an alert. It does not replace a person nearby. A phone or a browser can sleep, lose power or drop the camera, so stay within reach.
      </p>
      {dialog}
    </section>
  );
}

export default WatchState;
