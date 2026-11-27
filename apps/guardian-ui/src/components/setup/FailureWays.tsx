/**
 * The ways on from a camera that did not turn on
 *
 * The failure's sentence beside the problem glyph, then Help's entry for a
 * blocked camera, or Use the default camera where the camera chosen on this
 * device is not connected. Use the default camera stays the same element
 * while its own request waits, so focus stays on it until the answer.
 *
 * @module components/setup/FailureWays
 */

'use client';

import Link from 'next/link';
import { ProblemMark } from '../dashboard/Drawn';
import { FAILURE_WORDS, type CameraFailure } from '@/lib/setup-camera';
import type { Asking } from '@/lib/use-camera-request';

export function FailureSentence({ failure }: { failure: CameraFailure }) {
  return (
    <p className="setup-body setup-failure">
      <ProblemMark />
      <span>{FAILURE_WORDS[failure]}</span>
    </p>
  );
}

/** The link to Help for a blocked camera; Use the default camera for a saved camera gone, kept while its request waits. */
export function FailureWays({
  failure,
  savedCamera,
  asking,
  onDefaultCamera,
}: {
  failure: CameraFailure | null;
  savedCamera: boolean;
  asking: Asking | null;
  onDefaultCamera: () => void;
}) {
  const showDefault = (failure === 'saved-gone' && savedCamera) || asking === 'default';
  const waiting = asking === 'default';
  return (
    <>
      {failure === 'blocked' && !showDefault ? (
        <Link href="/help/#camera" className="link-row">
          How to allow the camera
        </Link>
      ) : null}
      {showDefault ? (
        <button
          type="button"
          className="key key--outline setup-default"
          aria-busy={waiting ? 'true' : undefined}
          aria-disabled={asking !== null ? 'true' : undefined}
          onClick={() => {
            if (asking === null) onDefaultCamera();
          }}
        >
          {waiting ? 'Waiting for your answer…' : 'Use the default camera'}
        </button>
      ) : null}
    </>
  );
}
