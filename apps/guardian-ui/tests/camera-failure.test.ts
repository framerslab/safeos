/** @jest-environment jsdom */
/**
 * What kind of camera failure an error is, and what the watch says about it
 *
 * The browser's own error names the failure; the watch names it inside the
 * camera's frame with its fix. A browser with no camera request at all is
 * told so, whatever it threw.
 */

import {
  CAMERA_FAILURE_WORDS,
  MICROPHONE_WORDS,
  cameraFailureOf,
  cameraStoppedLine,
} from '@/lib/camera-failure';
import { clockTime } from '@/lib/clock-time';

it.each([
  ['NotAllowedError', 'blocked'],
  ['SecurityError', 'blocked'],
  ['PermissionDeniedError', 'blocked'],
  ['NotReadableError', 'in-use'],
  ['AbortError', 'in-use'],
  ['TrackStartError', 'in-use'],
  ['NotFoundError', 'missing'],
  ['DevicesNotFoundError', 'missing'],
  ['OverconstrainedError', 'gone'],
  ['ConstraintNotSatisfiedError', 'gone'],
  ['TypeError', 'other'],
])('reads %s as %s', (name, kind) => {
  expect(cameraFailureOf(new DOMException('', name), true)).toBe(kind);
});

it('reads a browser with no camera request as no-request', () => {
  expect(cameraFailureOf(new Error('x'), false)).toBe('no-request');
  expect(cameraFailureOf(new DOMException('', 'NotAllowedError'), false)).toBe('no-request');
});

it('reads a thrown string as other', () => {
  expect(cameraFailureOf('the camera broke', true)).toBe('other');
  expect(cameraFailureOf(undefined, true)).toBe('other');
});

it('names each failure with its fix', () => {
  expect(CAMERA_FAILURE_WORDS).toEqual({
    blocked:
      'The browser blocked the camera for this site. To allow it, open the site settings from the address bar, set Camera to Allow, then press Try again.',
    'in-use': 'The camera did not start. Another app or tab may be using it. Close it, then press Try again.',
    missing: 'No camera was found on this device. Connect a camera, then press Try again.',
    gone: 'The selected camera is unavailable. Choose another camera.',
    'no-request':
      'This browser cannot use a camera on this page. Open SafeOS in a current version of Chrome, Edge, Firefox or Safari.',
    other: 'Unable to access the camera or microphone. Check the device and try again.',
  });
});

it("names the microphone's two problems with their fix", () => {
  expect(MICROPHONE_WORDS).toEqual({
    missing: 'No microphone found. Sound alerts are off. Connect a microphone, then stop and start watching.',
    blocked:
      'The browser blocked the microphone for this site. To allow it, open the site settings from the address bar, set Microphone to Allow, then stop and start watching.',
  });
});

it('says when a camera that was watching stopped', () => {
  const at = new Date(2026, 10, 21, 21, 42, 10).getTime();
  expect(cameraStoppedLine(at)).toBe(`The camera stopped at ${clockTime(at)}. Press Start watching to start again.`);
});
