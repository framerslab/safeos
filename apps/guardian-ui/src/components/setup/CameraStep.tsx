/**
 * Setup's step 1: turn on the camera
 *
 * Says what this device will do, offers the camera in a drawn frame with the
 * line that says the browser will ask, waits for the answer with its key
 * inactive, always offers Continue without the camera, and closes on the
 * statement and where the picture goes.
 *
 * @module components/setup/CameraStep
 */

'use client';

import { useEffect, useRef } from 'react';
import { CornerTicks } from '../dashboard/Drawn';
import { useMicrophoneAsk, type Ask } from '@/lib/browser-asks';
import type { CameraFailure } from '@/lib/setup-camera';
import type { Asking } from '@/lib/use-camera-request';
import { hideUntilNeeded, NEEDS_SCRIPT } from '@/lib/needs-script';
import { StepHeading } from './StepFrame';
import { CameraDrawing } from './drawings';
import { FailureSentence, FailureWays } from './FailureWays';

export interface CameraStepProps {
  ask: Ask;
  asking: Asking | null;
  failure: CameraFailure | null;
  savedCamera: boolean;
  serverSaved: boolean;
  storageEnds: boolean;
  focus: boolean;
  onTurnOn: () => void;
  onDefaultCamera: () => void;
  onContinue: () => void;
}

export const STEP1_LEAD =
  'SafeOS watches with the camera and microphone and sounds an alert here when something moves, makes a sound or, for a lost pet, when its colours come into view.';
export const WINDOW_LINE = 'This browser forgets SafeOS when the window closes. Your settings and alerts last for this visit.';
const FRAME_LINE = 'Your browser will ask you to allow the camera and microphone.';

export function CameraStep({
  ask,
  asking,
  failure,
  savedCamera,
  serverSaved,
  storageEnds,
  focus,
  onTurnOn,
  onDefaultCamera,
  onContinue,
}: CameraStepProps) {
  const microphone = useMicrophoneAsk();
  const waiting = asking === 'turn-on' || asking === 'try-again';
  const state = failure ? 'failed' : waiting ? 'asking' : 'rest';
  const showLine = state !== 'failed' && !(ask === 'granted' && microphone === 'granted');
  const keyFocused = useRef(false);
  const skip = useRef<HTMLButtonElement>(null);
  const key = useRef<HTMLButtonElement>(null);

  // Which element holds focus, kept past the key's leaving the page.
  useEffect(() => {
    const moved = (event: FocusEvent) => {
      keyFocused.current = event.target === key.current;
    };
    document.addEventListener('focusin', moved);
    return () => document.removeEventListener('focusin', moved);
  }, []);

  // A browser that cannot use a camera leaves no key in the frame: focus goes on to Continue.
  useEffect(() => {
    const lost = !document.activeElement || document.activeElement === document.body;
    if (failure === 'unsupported' && keyFocused.current && lost) {
      keyFocused.current = false;
      skip.current?.focus();
    }
  }, [failure]);

  return (
    <div className="setup-step--1">
      <StepHeading step={1} id="setup-step1-heading" focus={focus}>
        Use this device to watch a place
      </StepHeading>
      <p className="setup-body setup-lead">
        <span translate="no">SafeOS</span>
        {STEP1_LEAD.slice('SafeOS'.length)}
      </p>
      <p className="setup-body setup-limit" role="status" aria-live="polite">
        {storageEnds ? WINDOW_LINE : ''}
      </p>
      <p id="setup-needs-script" className="needs-script">
        {NEEDS_SCRIPT}
      </p>
      <script dangerouslySetInnerHTML={{ __html: hideUntilNeeded('setup-needs-script') }} />
      <div className="setup-camera">
        <div className="setup-frame" data-state={state}>
          <CornerTicks />
          {state !== 'failed' ? <CameraDrawing /> : null}
          <div className="setup-frame-says" role="status" aria-live="polite">
            {failure ? <FailureSentence failure={failure} /> : null}
          </div>
          {failure !== 'unsupported' ? (
            <button
              type="button"
              className={waiting ? 'key key--solid key--start setup-key setup-key--waiting' : 'key key--solid key--start setup-key'}
              aria-describedby={showLine ? 'setup-frame-line' : undefined}
              aria-busy={waiting ? 'true' : undefined}
              aria-disabled={asking !== null ? 'true' : undefined}
              ref={key}
              onClick={() => {
                if (asking === null) onTurnOn();
              }}
            >
              {waiting ? 'Waiting for your answer…' : failure ? 'Try again' : 'Turn on the camera'}
            </button>
          ) : null}
          {showLine ? (
            <p id="setup-frame-line" className="setup-body setup-frame-line">
              {FRAME_LINE}
            </p>
          ) : null}
          <FailureWays failure={failure} savedCamera={savedCamera} asking={asking} onDefaultCamera={onDefaultCamera} />
        </div>
        <button ref={skip} type="button" className="key key--outline setup-skip" onClick={onContinue}>
          Continue without the camera
        </button>
      </div>
      <p className="setup-body setup-statement">
        <span translate="no">SafeOS</span> adds an alert. It does not replace a person nearby. A phone or a browser can sleep, lose
        power or drop the camera, so stay within reach.
      </p>
      <p className="setup-body setup-picture-line">
        {serverSaved ? 'This device sends the picture to your own server while it watches.' : 'The picture stays on this device.'}
      </p>
    </div>
  );
}

export default CameraStep;
