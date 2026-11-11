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

it.each(['end', 'mute'] as const)('removes LIVE and releases capture when the video track signals %s', async (event) => {
  const error = jest.fn();
  render(<CameraFeed onError={error} />);
  await act(async () => {});
  expect(screen.getByText('LIVE')).toBeTruthy();
  act(() => browser.video[event]());
  expect(screen.queryByText('LIVE')).toBeNull();
  expect(error).toHaveBeenCalledWith(expect.any(Error));
  expect(browser.audio.stop).toHaveBeenCalled();
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
