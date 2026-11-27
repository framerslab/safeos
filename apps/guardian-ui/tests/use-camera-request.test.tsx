/** @jest-environment jsdom */
/**
 * Setup's camera request on the page
 *
 * A press waits for the browser's answer and a second press asks nothing
 * more; a yes keeps the stream open for the next step; a request the page has
 * let go of (dropped, closed or left) closes what its late answer opens and
 * shows nothing; a refusal is named by the permission read after it.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useCameraRequest, type Asking } from '@/lib/use-camera-request';
import { cameraAskNow, useCameraAsk } from '@/lib/browser-asks';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { installCameraBrowser } from './helpers/camera-browser';

jest.mock('@/lib/browser-asks', () => ({
  useCameraAsk: jest.fn(() => 'not-asked'),
  cameraAskNow: jest.fn(async () => 'not-asked'),
}));

const askNow = cameraAskNow as jest.Mock;
const askHook = useCameraAsk as jest.Mock;

type Browser = ReturnType<typeof installCameraBrowser>;
let browser: Browser;
let answers: string[];

const named = (name: string) => Object.assign(new Error(name), { name });

function Request() {
  const camera = useCameraRequest('');
  const press = (which: Asking) => {
    void camera.request(which).then((answer) => answers.push(answer));
  };
  return (
    <>
      <p data-testid="asking">{camera.asking ?? ''}</p>
      <p data-testid="failure">{camera.failure ?? ''}</p>
      <p data-testid="stream">{camera.stream ? 'open' : ''}</p>
      <p data-testid="microphone">{String(camera.microphone)}</p>
      <button type="button" onClick={() => press('turn-on')}>
        Turn on
      </button>
      <button type="button" onClick={camera.drop}>
        Drop
      </button>
      <button type="button" onClick={camera.close}>
        Close
      </button>
    </>
  );
}

const reads = (id: string) => screen.getByTestId(id).textContent;
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const settle = () => act(async () => {});

function held() {
  let resolve: (stream: MediaStream) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<MediaStream>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  browser.getUserMedia.mockReturnValueOnce(promise);
  return { resolve, reject };
}

function heldRead() {
  let resolve: (ask: string) => void = () => undefined;
  askNow.mockReturnValueOnce(new Promise((yes) => (resolve = yes)));
  return { resolve: (ask: string) => resolve(ask) };
}

beforeEach(() => {
  browser = installCameraBrowser();
  answers = [];
  askNow.mockReset();
  askNow.mockImplementation(async () => 'not-asked');
  askHook.mockReturnValue('not-asked');
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe("setup's camera request on the page", () => {
  it("waits for the browser's answer, and a second press asks nothing more", async () => {
    held();
    render(<Request />);
    press('Turn on');
    press('Turn on');
    await settle();
    expect(reads('asking')).toBe('turn-on');
    expect(browser.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('keeps the stream a yes opens', async () => {
    const answer = held();
    render(<Request />);
    press('Turn on');
    await act(async () => answer.resolve(browser.stream));
    expect(reads('stream')).toBe('open');
    expect(reads('microphone')).toBe('true');
    expect(reads('asking')).toBe('');
    expect(answers).toEqual(['allowed']);
  });

  it('drops a waiting request and closes the camera that answers late', async () => {
    const answer = held();
    render(<Request />);
    press('Turn on');
    press('Drop');
    await act(async () => answer.resolve(browser.stream));
    expect(reads('stream')).toBe('');
    expect(reads('asking')).toBe('');
    expect(browser.video.stop).toHaveBeenCalled();
    expect(browser.audio.stop).toHaveBeenCalled();
    expect(answers).toEqual(['dropped']);
  });

  it('a camera allowed after the person left setup is closed and nothing is saved', async () => {
    const before = useOnboardingStore.getState().cameraPermissionGranted;
    const answer = held();
    const { unmount } = render(<Request />);
    press('Turn on');
    unmount();
    await act(async () => answer.resolve(browser.stream));
    expect(browser.video.stop).toHaveBeenCalled();
    expect(browser.audio.stop).toHaveBeenCalled();
    expect(useOnboardingStore.getState().cameraPermissionGranted).toBe(before);
    expect(browser.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('names a failure with the permission read after the answer', async () => {
    browser.getUserMedia.mockRejectedValue(named('NotAllowedError'));
    render(<Request />);
    askNow.mockResolvedValueOnce('not-asked');
    press('Turn on');
    await settle();
    expect(reads('failure')).toBe('closed');

    askNow.mockResolvedValueOnce('blocked');
    press('Turn on');
    await settle();
    expect(reads('failure')).toBe('blocked');
  });

  it('says the browser cannot use a camera, and asks nothing', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    render(<Request />);
    press('Turn on');
    await settle();
    expect(reads('failure')).toBe('unsupported');
    expect(reads('asking')).toBe('');
  });

  it('ends every track of the open stream on close', async () => {
    render(<Request />);
    press('Turn on');
    await settle();
    expect(reads('stream')).toBe('open');
    press('Close');
    await settle();
    expect(browser.video.stop).toHaveBeenCalled();
    expect(browser.audio.stop).toHaveBeenCalled();
    expect(reads('stream')).toBe('');
  });

  it('closes a camera that answers after close, and asks again on the next press', async () => {
    const answer = held();
    render(<Request />);
    press('Turn on');
    press('Close');
    await act(async () => answer.resolve(browser.stream));
    expect(browser.video.stop).toHaveBeenCalled();
    expect(browser.audio.stop).toHaveBeenCalled();
    expect(reads('stream')).toBe('');
    expect(reads('asking')).toBe('');
    expect(answers).toEqual(['dropped']);
    press('Turn on');
    await settle();
    expect(browser.getUserMedia).toHaveBeenCalledTimes(2);
  });

  it.each(['drop', 'close', 'unmount'] as const)('shows no failure for a refusal whose permission read ends after %s', async (leave) => {
    browser.getUserMedia.mockRejectedValue(named('NotAllowedError'));
    const read = heldRead();
    const { unmount } = render(<Request />);
    press('Turn on');
    await settle();
    expect(askNow).toHaveBeenCalled();
    if (leave === 'drop') press('Drop');
    else if (leave === 'close') press('Close');
    else unmount();
    await act(async () => read.resolve('blocked'));
    expect(answers).toEqual(['dropped']);
    if (leave !== 'unmount') {
      expect(reads('failure')).toBe('');
      expect(reads('asking')).toBe('');
    }
  });
});
