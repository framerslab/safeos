/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { CameraFeed } from '@/components/CameraFeed';
import { installCameraBrowser } from './helpers/camera-browser';

let browser: ReturnType<typeof installCameraBrowser>;
beforeEach(() => { browser = installCameraBrowser(); });
afterEach(() => { cleanup(); jest.restoreAllMocks(); });

it.each(['disabled', 'unmounted'])('releases a late permission result after capture is %s', async (action) => {
  let grant!: (stream: MediaStream) => void;
  browser.getUserMedia.mockReturnValue(new Promise(resolve => { grant = resolve; }));
  const ready = jest.fn();
  const view = render(<CameraFeed enabled onVideoReady={ready} />);
  if (action === 'disabled') view.rerender(<CameraFeed enabled={false} onVideoReady={ready} />);
  else view.unmount();
  await act(async () => { grant(browser.stream); });
  expect(browser.video.stop).toHaveBeenCalled();
  expect(browser.audio.stop).toHaveBeenCalled();
  expect(ready.mock.calls.filter(([video]) => video !== null)).toEqual([]);
  expect(screen.queryByText('LIVE')).toBeNull();
});

it('removes LIVE and releases capture when the video track ends', async () => {
  const error = jest.fn();
  render(<CameraFeed onError={error} />);
  await act(async () => {});
  expect(screen.getByText('LIVE')).toBeTruthy();
  act(() => browser.video.end());
  expect(screen.queryByText('LIVE')).toBeNull();
  expect(error).toHaveBeenCalledWith(expect.any(Error));
  expect(browser.audio.stop).toHaveBeenCalled();
});

it('removes LIVE while the video track is muted and resumes when it unmutes', async () => {
  const error = jest.fn();
  const ready = jest.fn();
  render(<CameraFeed onError={error} onVideoReady={ready} />);
  await act(async () => {});
  act(() => browser.video.mute());
  expect(screen.queryByText('LIVE')).toBeNull();
  expect(screen.getByText(/Camera paused/)).toBeTruthy();
  expect(ready).toHaveBeenLastCalledWith(null);
  expect(browser.video.stop).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  act(() => browser.video.unmute());
  expect(screen.getByText('LIVE')).toBeTruthy();
  expect(screen.queryByText(/Camera paused/)).toBeNull();
  expect(ready).toHaveBeenLastCalledWith(expect.any(HTMLVideoElement));
});

it('monitors video alone when the device has no microphone', async () => {
  const videoOnly = {
    getTracks: () => [browser.video],
    getVideoTracks: () => [browser.video],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
  browser.getUserMedia.mockImplementation(async (constraints: MediaStreamConstraints) => {
    if (constraints.audio) throw new DOMException('Requested device not found', 'NotFoundError');
    return videoOnly;
  });
  const error = jest.fn();
  render(<CameraFeed onError={error} />);
  expect(await screen.findByText('LIVE')).toBeTruthy();
  expect(screen.getByText('Microphone unavailable. Video monitoring continues.')).toBeTruthy();
  expect(error).not.toHaveBeenCalled();
});


it.each(['mute', 'end'] as const)('keeps video monitoring while reporting microphone %s', async (event) => {
  const error = jest.fn();
  render(<CameraFeed onError={error} />);
  await act(async () => {});
  act(() => browser.audio[event]());
  expect(screen.getByText('LIVE')).toBeTruthy();
  expect(screen.getByText('Microphone unavailable. Video monitoring continues.')).toBeTruthy();
  expect(browser.video.stop).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});
