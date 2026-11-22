'use client';
/**
 * The camera's frame on the watch
 *
 * The panel colour at 16:9 inside four corner ticks. The picture slot is
 * always mounted, so the camera never restarts; over it, until the picture
 * is live, the drawn panel says where the watch stands: Start watching with
 * what the browser will ask, the inactive key while the camera starts, a
 * failure named with its fix and Try again, or the time a camera stopped.
 *
 * @module components/watch/WatchFrame
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { CornerTicks, ProblemMark } from '../dashboard/Drawn';
import { CameraGlyph } from './Glyphs';
import { CAMERA_FAILURE_WORDS, cameraStoppedLine, type CameraFailure } from '../../lib/camera-failure';
import { NO_PET_FRAME_LINE } from '../monitor/WatchFor';

export type FramePhase = 'off' | 'starting' | 'live' | 'failed' | 'stopped';

export interface WatchFrameProps {
  phase: FramePhase;
  /** What failed, while `phase` is `failed`. */
  failure: CameraFailure | null;
  /** When a camera that was watching stopped, while `phase` is `stopped`. */
  stoppedAt: number | null;
  /** Another tab of this browser watches. */
  otherTab: boolean;
  /** The browser has not allowed the camera yet. */
  askLine: boolean;
  /** Lost and Found is chosen and no pet is saved. */
  noPetLine: boolean;
  onStart: (key: HTMLButtonElement) => void;
  onTryAgain: () => void;
  /** The bare camera feed and what stands over the live picture. */
  children: ReactNode;
  /** The meters' strip along the picture's foot, inside the ticks. */
  strip?: ReactNode;
}

export const STARTING_WORDS = 'Starting the camera…';
export const ASK_LINE = 'Your browser will ask you to allow the camera and microphone.';
export const OTHER_TAB_LINE = 'Watching in another tab';

/** The inactive key while the camera starts: a second press does nothing. */
function StartingKey() {
  return (
    <button type="button" className="key key--start key--waiting watch-start" aria-disabled="true">
      {STARTING_WORDS}
    </button>
  );
}

export function WatchFrame({
  phase,
  failure,
  stoppedAt,
  otherTab,
  askLine,
  noPetLine,
  onStart,
  onTryAgain,
  children,
  strip,
}: WatchFrameProps) {
  const drawnRef = useRef<HTMLDivElement>(null);
  const previous = useRef<FramePhase>(phase);

  // Focus goes back to the frame's key when a start fails or a watch stops,
  // so it is never lost with the key that held it.
  useEffect(() => {
    const was = previous.current;
    previous.current = phase;
    if (was !== 'starting' && was !== 'live') return;
    if (phase !== 'off' && phase !== 'failed' && phase !== 'stopped') return;
    drawnRef.current?.querySelector<HTMLButtonElement>('button:not([aria-disabled="true"])')?.focus();
  }, [phase]);

  const canTryAgain = failure !== null && failure !== 'gone' && failure !== 'no-request';

  const startKey = (
    <button
      type="button"
      className="key key--solid key--start watch-start"
      onClick={(event) => onStart(event.currentTarget)}
    >
      Start watching
    </button>
  );

  return (
    <div className="watch-frame" data-phase={phase}>
      <div className="watch-frame__screen">
        <div className="watch-frame__picture">{children}</div>
        {phase !== 'live' && (
          <div ref={drawnRef} className="watch-frame__drawn">
            {(phase === 'off' || phase === 'starting') && (
              <>
                <CameraGlyph />
                {otherTab && phase === 'off' && (
                  <p role="status" aria-live="polite" className="watch-frame__line">
                    {OTHER_TAB_LINE}
                  </p>
                )}
                {phase === 'off' ? startKey : <StartingKey />}
                {noPetLine && <p className="watch-frame__line">{NO_PET_FRAME_LINE}</p>}
                {askLine && <p className="watch-frame__line">{ASK_LINE}</p>}
              </>
            )}
            {phase === 'failed' && failure && (
              <>
                <p role="status" aria-live="polite" className="watch-frame__line watch-frame__problem">
                  <ProblemMark />
                  <span>{CAMERA_FAILURE_WORDS[failure]}</span>
                </p>
                {canTryAgain && (
                  <button
                    type="button"
                    className="key key--outline watch-try"
                    onClick={onTryAgain}
                  >
                    Try again
                  </button>
                )}
              </>
            )}
            {phase === 'stopped' && stoppedAt !== null && (
              <>
                <p role="status" aria-live="polite" className="watch-frame__line">
                  {cameraStoppedLine(stoppedAt)}
                </p>
                {startKey}
              </>
            )}
          </div>
        )}
        {phase === 'starting' && <span className="watch-frame__starting" aria-hidden="true" />}
      </div>
      {strip}
      <CornerTicks />
      <p role="status" aria-live="polite" className="sr-only">
        {phase === 'starting' ? STARTING_WORDS : ''}
      </p>
    </div>
  );
}
