/**
 * How SafeOS asks the browser for the camera
 *
 * One request shape for the camera feed and for the dashboard's start key, so
 * the camera the key opens is the camera the way's page would have opened.
 *
 * @module lib/camera-constraints
 */

export function cameraConstraints(deviceId: string, audio: boolean): MediaStreamConstraints {
  return {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }),
    },
    audio,
  };
}

/** Opens the camera, and the microphone where asked. A device with no microphone gives its camera all the same. */
export async function openCamera({ deviceId, audio }: { deviceId: string; audio: boolean }): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId, audio));
  } catch (error) {
    if (!audio || !(error instanceof Error) || error.name !== 'NotFoundError') throw error;
    return navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId, false));
  }
}

export type CameraProblem = 'blocked' | 'in-use' | 'failed';

/** What a failed request means, by the browser's own name for the error. */
export function cameraProblem(error: unknown): CameraProblem {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'in-use';
  return 'failed';
}
