/**
 * What kind of camera failure an error is, and what the watch says about it
 *
 * The browser names a refused or failed camera by its error's name. The watch
 * shows the failure inside the camera's frame with the fix a person can make;
 * a browser with no camera request on this page is told so whatever it threw.
 * The microphone's two problems are named beside the Sound meter, and the
 * camera goes on without it.
 *
 * @module lib/camera-failure
 */

import { clockTime } from './clock-time';

export type CameraFailure = 'blocked' | 'in-use' | 'missing' | 'gone' | 'no-request' | 'other';

export type MicrophoneProblem = 'missing' | 'blocked';

const FAILURE_BY_NAME: Record<string, CameraFailure> = {
  NotAllowedError: 'blocked',
  SecurityError: 'blocked',
  PermissionDeniedError: 'blocked',
  NotReadableError: 'in-use',
  AbortError: 'in-use',
  TrackStartError: 'in-use',
  NotFoundError: 'missing',
  DevicesNotFoundError: 'missing',
  OverconstrainedError: 'gone',
  ConstraintNotSatisfiedError: 'gone',
};

/** The failure an error from the camera's request stands for. */
export function cameraFailureOf(error: unknown, hasCameraRequest: boolean): CameraFailure {
  if (!hasCameraRequest) return 'no-request';
  if (typeof error !== 'object' || error === null) return 'other';
  const name = (error as { name?: unknown }).name;
  if (typeof name !== 'string') return 'other';
  return Object.prototype.hasOwnProperty.call(FAILURE_BY_NAME, name) ? FAILURE_BY_NAME[name] : 'other';
}

export const CAMERA_FAILURE_WORDS: Record<CameraFailure, string> = {
  blocked:
    'The browser blocked the camera for this site. To allow it, open the site settings from the address bar, set Camera to Allow, then press Try again.',
  'in-use': 'The camera did not start. Another app or tab may be using it. Close it, then press Try again.',
  missing: 'No camera was found on this device. Connect a camera, then press Try again.',
  gone: 'The selected camera is unavailable. Choose another camera.',
  'no-request':
    'This browser cannot use a camera on this page. Open SafeOS in a current version of Chrome, Edge, Firefox or Safari.',
  other: 'Unable to access the camera or microphone. Check the device and try again.',
};

export const MICROPHONE_WORDS: Record<MicrophoneProblem, string> = {
  missing: 'No microphone found. Sound alerts are off. Connect a microphone, then stop and start watching.',
  blocked:
    'The browser blocked the microphone for this site. To allow it, open the site settings from the address bar, set Microphone to Allow, then stop and start watching.',
};

/** What the frame says when a camera that was watching stopped. */
export function cameraStoppedLine(at: number): string {
  return `The camera stopped at ${clockTime(at)}. Press Start watching to start again.`;
}
