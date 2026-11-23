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

/** True when the browser reads the camera as allowed for this site. */
export async function cameraAllowed(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: 'camera' as PermissionName });
    return status?.state === 'granted';
  } catch {
    return false;
  }
}

/** Why a camera opened with sound asked for came without it. */
export type MicrophoneLeftOut = 'missing' | 'blocked';

const leftOut = new WeakMap<MediaStream, MicrophoneLeftOut>();

/** Why `openCamera` opened this camera without the microphone it asked for, or null. */
export function microphoneLeftOut(camera: MediaStream): MicrophoneLeftOut | null {
  return leftOut.get(camera) ?? null;
}

/**
 * Opens the camera, and the microphone where asked. A device with no
 * microphone gives its camera all the same, and so does a browser that
 * allows the camera and blocks the microphone: a refusal while the camera
 * reads as allowed was the microphone's, so the camera is asked for once
 * more without sound. Any other refusal is the camera's, and the person is
 * not asked twice.
 */
export async function openCamera({ deviceId, audio }: { deviceId: string; audio: boolean }): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId, audio));
  } catch (error) {
    if (!audio || !(error instanceof Error)) throw error;
    let reason: MicrophoneLeftOut;
    if (error.name === 'NotFoundError') reason = 'missing';
    else if (error.name === 'NotAllowedError' && (await cameraAllowed())) reason = 'blocked';
    else throw error;
    const camera = await navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId, false));
    leftOut.set(camera, reason);
    return camera;
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
