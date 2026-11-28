/**
 * Setup's camera request
 *
 * Setup asks for the camera as the watch asks for it (the saved camera,
 * otherwise the back camera), with the microphone in the same request, and
 * takes the camera alone on a device with no microphone. A request the person
 * has left asks the browser nothing more and closes what its answer opened.
 * Each way the camera can fail to turn on has its own sentence, with the way
 * on.
 *
 * @module lib/setup-camera
 */

import type { Ask } from './browser-asks';
import { cameraConstraints } from './camera-constraints';
import { closeCamera } from './camera-handoff';

export type CameraFailure = 'blocked' | 'not-allowed' | 'closed' | 'in-use' | 'no-camera' | 'saved-gone' | 'unsupported' | 'other';

/** False in a browser with no camera request on this page (no navigator.mediaDevices.getUserMedia). */
export function canAskForCamera(): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
  } catch {
    return false;
  }
}

/**
 * One request for the camera and the microphone, the camera as the watch asks
 * for it (cameraConstraints: the saved camera, otherwise the back camera),
 * and a second for the camera alone on a device with no microphone.
 * `stillWanted` is read before that second request and after each answer:
 * when it answers false, every track that opened is stopped and the result is null.
 */
export async function askForCamera(
  deviceId: string,
  stillWanted: () => boolean,
): Promise<{ stream: MediaStream; microphone: boolean } | null> {
  let stream: MediaStream;
  let microphone = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId, true));
  } catch (error) {
    // A camera with no microphone is enough: the watch then alerts on movement alone.
    if (!(error instanceof Error) || error.name !== 'NotFoundError') throw error;
    // A request the person has left asks the browser nothing more.
    if (!stillWanted()) return null;
    stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId, false));
    microphone = false;
  }
  if (!stillWanted()) {
    closeCamera(stream);
    return null;
  }
  return { stream, microphone: microphone && stream.getAudioTracks().some((track) => track.readyState === 'live') };
}

function errorName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof (error as { name: unknown }).name === 'string') {
    return (error as { name: string }).name;
  }
  return '';
}

/**
 * What a failed request means, by the browser's error, the camera's permission
 * read after it, and whether a camera is saved. A refusal with the permission
 * unread ('unknown': the query rejects with a TypeError for a permission name
 * the browser does not support,
 * https://developer.mozilla.org/en-US/docs/Web/API/Permissions/query) may be
 * a question closed or a camera blocked, so it has words of its own that hold
 * for both.
 */
export function cameraFailure(error: unknown, ask: Ask, savedCamera: boolean): CameraFailure {
  switch (errorName(error)) {
    case 'NotAllowedError':
    case 'SecurityError':
      if (ask === 'not-asked') return 'closed';
      if (ask === 'granted') return 'other';
      if (ask === 'unknown') return 'not-allowed';
      return 'blocked';
    case 'NotReadableError':
    case 'AbortError':
    case 'TrackStartError':
      return 'in-use';
    case 'NotFoundError':
      return savedCamera ? 'saved-gone' : 'no-camera';
    case 'OverconstrainedError':
      return savedCamera ? 'saved-gone' : 'other';
    default:
      return 'other';
  }
}

/** The sentence setup shows for each failure. */
export const FAILURE_WORDS: Readonly<Record<CameraFailure, string>> = {
  blocked: 'The camera is blocked for safeos.sh in this browser. Allow it in the site’s settings, then press Try again.',
  'not-allowed':
    'The camera did not open. Press Try again, then Allow when the browser asks. If it does not ask, the camera is blocked for safeos.sh: allow it in the site’s settings, then press Try again.',
  closed: 'The browser’s question closed without an answer. Press Try again to see it again.',
  'in-use': 'The camera did not start. Another app or tab may be using it. Close it, then press Try again.',
  'no-camera': 'No camera was found on this device. Connect one, then press Try again.',
  'saved-gone': 'The camera chosen on this device is not connected. Connect it, then press Try again.',
  unsupported: 'This browser cannot use a camera on this page.',
  other: 'The camera did not start. Check the device, then press Try again.',
};
