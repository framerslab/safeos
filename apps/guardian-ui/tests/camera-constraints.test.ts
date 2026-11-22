/** @jest-environment jsdom */
/**
 * How SafeOS asks the browser for the camera
 *
 * One request shape for the camera feed and the dashboard's start key, a
 * camera that opens on a device with no microphone, and what a failed request
 * means by the browser's own name for the error.
 */

import { cameraConstraints, cameraProblem, openCamera } from '@/lib/camera-constraints';

const named = (name: string) => Object.assign(new Error(name), { name });
const camera = {} as MediaStream;

function browserAnswers(getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>) {
  const request = jest.fn(getUserMedia);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: request } });
  return request;
}

afterEach(() => {
  delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
});

it('asks for the camera the feed asks for', () => {
  expect(cameraConstraints('', true)).toEqual({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
    audio: true,
  });

  const chosen = cameraConstraints('cam-2', false);
  expect(chosen.video).toMatchObject({ deviceId: { exact: 'cam-2' } });
  expect(chosen.video).not.toHaveProperty('facingMode');
  expect(chosen.audio).toBe(false);
});

it('opens the camera without a microphone on a device that has none', async () => {
  const request = browserAnswers((constraints) =>
    constraints.audio ? Promise.reject(named('NotFoundError')) : Promise.resolve(camera),
  );

  await expect(openCamera({ deviceId: '', audio: true })).resolves.toBe(camera);
  expect(request).toHaveBeenCalledTimes(2);
});

function cameraPermission(state: PermissionState | null) {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: state === null ? undefined : { query: jest.fn().mockResolvedValue({ state }) },
  });
}

it('opens the camera without the microphone when only the microphone is refused', async () => {
  cameraPermission('granted');
  const request = browserAnswers((constraints) =>
    constraints.audio ? Promise.reject(named('NotAllowedError')) : Promise.resolve(camera),
  );

  await expect(openCamera({ deviceId: '', audio: true })).resolves.toBe(camera);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ audio: false }));
  cameraPermission(null);
});

it('asks once when the camera is refused', async () => {
  cameraPermission('prompt');
  const request = browserAnswers(() => Promise.reject(named('NotAllowedError')));

  await expect(openCamera({ deviceId: '', audio: true })).rejects.toMatchObject({ name: 'NotAllowedError' });
  expect(request).toHaveBeenCalledTimes(1);
  cameraPermission(null);
});

it("names what went wrong by the browser's own error", () => {
  for (const name of ['NotAllowedError', 'SecurityError']) expect(cameraProblem(named(name))).toBe('blocked');
  for (const name of ['NotReadableError', 'TrackStartError']) expect(cameraProblem(named(name))).toBe('in-use');
  for (const name of ['AbortError', 'NotFoundError', 'OverconstrainedError']) {
    expect(cameraProblem(named(name))).toBe('failed');
  }
  expect(cameraProblem(new Error('Something else went wrong.'))).toBe('failed');
  expect(cameraProblem(undefined)).toBe('failed');
});
