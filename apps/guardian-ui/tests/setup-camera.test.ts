/** @jest-environment jsdom */
/**
 * Setup's camera request
 *
 * Setup asks for the camera and the microphone in one request, as the watch
 * asks; takes the camera alone on a device with no microphone; asks nothing
 * more and closes what opened once the person has left the request; and names
 * each way the camera can fail to turn on.
 */

import { askForCamera, cameraFailure, canAskForCamera, FAILURE_WORDS } from '@/lib/setup-camera';
import { cameraConstraints } from '@/lib/camera-constraints';
import type { Ask } from '@/lib/browser-asks';
import { installCameraBrowser } from './helpers/camera-browser';

type Browser = ReturnType<typeof installCameraBrowser>;
let browser: Browser;

const named = (name: string) => Object.assign(new Error(name), { name });

beforeEach(() => {
  browser = installCameraBrowser();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("setup's camera request", () => {
  it('asks for the camera and the microphone in one request, as the watch asks', async () => {
    const answer = await askForCamera('', () => true);
    expect(answer).toEqual({ stream: browser.stream, microphone: true });
    expect(browser.getUserMedia).toHaveBeenCalledTimes(1);
    expect(browser.getUserMedia).toHaveBeenCalledWith(cameraConstraints('', true));
    const asked = browser.getUserMedia.mock.calls[0][0];
    expect(asked.video).toEqual(expect.objectContaining({ facingMode: 'environment' }));
    expect(asked.audio).toBe(true);
  });

  it('asks for the camera saved on this device by its id', async () => {
    await askForCamera('usb', () => true);
    const asked = browser.getUserMedia.mock.calls[0][0];
    expect(asked.video).toEqual(expect.objectContaining({ deviceId: { exact: 'usb' } }));
    expect(asked.video).not.toHaveProperty('facingMode');
  });

  it('takes the camera alone on a device with no microphone', async () => {
    browser.getUserMedia.mockImplementation(async (asked: MediaStreamConstraints) => {
      if (asked.audio) throw named('NotFoundError');
      return browser.stream;
    });
    const answer = await askForCamera('', () => true);
    expect(answer?.microphone).toBe(false);
    expect(browser.getUserMedia).toHaveBeenCalledTimes(2);
    expect(browser.getUserMedia.mock.calls[1][0].audio).toBe(false);
  });

  it('asks nothing more for a request left behind before its second try', async () => {
    browser.getUserMedia.mockRejectedValueOnce(named('NotFoundError'));
    const answer = await askForCamera('', () => false);
    expect(answer).toBeNull();
    expect(browser.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('closes a camera that answers after its request was left', async () => {
    const answer = await askForCamera('', () => false);
    expect(answer).toBeNull();
    expect(browser.video.stop).toHaveBeenCalled();
    expect(browser.audio.stop).toHaveBeenCalled();
  });

  it('knows a browser with no camera request', () => {
    expect(canAskForCamera()).toBe(true);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    expect(canAskForCamera()).toBe(false);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
    expect(canAskForCamera()).toBe(false);
  });

  it.each([
    ['NotAllowedError', 'blocked', false, 'blocked'],
    ['SecurityError', 'blocked', false, 'blocked'],
    ['NotAllowedError', 'not-asked', false, 'closed'],
    ['NotAllowedError', 'unknown', false, 'blocked'],
    ['NotAllowedError', 'granted', false, 'other'],
    ['NotReadableError', 'granted', false, 'in-use'],
    ['AbortError', 'granted', false, 'in-use'],
    ['TrackStartError', 'granted', false, 'in-use'],
    ['NotFoundError', 'not-asked', false, 'no-camera'],
    ['NotFoundError', 'granted', true, 'saved-gone'],
    ['OverconstrainedError', 'granted', true, 'saved-gone'],
    ['OverconstrainedError', 'granted', false, 'other'],
    ['TypeError', 'granted', false, 'other'],
    ['undefined', 'granted', false, 'other'],
  ] as const)('names a failure: %s with the permission %s and a saved camera %s gives %s', (error, ask, saved, failure) => {
    const thrown = error === 'undefined' ? undefined : error === 'TypeError' ? new TypeError('no') : named(error);
    expect(cameraFailure(thrown, ask as Ask, saved)).toBe(failure);
  });

  it('words each failure as setup shows it', () => {
    expect(FAILURE_WORDS).toEqual({
      blocked: 'The camera is blocked for safeos.sh in this browser. Allow it in the site’s settings, then press Try again.',
      closed: 'The browser’s question closed without an answer. Press Try again to see it again.',
      'in-use': 'The camera did not start. Another app or tab may be using it. Close it, then press Try again.',
      'no-camera': 'No camera was found on this device. Connect one, then press Try again.',
      'saved-gone': 'The camera chosen on this device is not connected. Connect it, then press Try again.',
      unsupported: 'This browser cannot use a camera on this page.',
      other: 'The camera did not start. Check the device, then press Try again.',
    });
  });
});
