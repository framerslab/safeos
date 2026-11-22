/** @jest-environment jsdom */
/**
 * The camera between the dashboard and a way's page
 *
 * The dashboard's start key opens the camera and holds it, with the watch it
 * was opened for, until the way's page takes them. A camera no page takes is
 * closed, and the tab's claim on the watch goes with it.
 */

import { dropStart, holdStart, pageOfStart, takeHeldCamera, takeStart } from '@/lib/camera-handoff';

function standInCamera(videoState: MediaStreamTrackState = 'live') {
  const video = { kind: 'video', readyState: videoState, stop: jest.fn() };
  const audio = { kind: 'audio', readyState: 'live', stop: jest.fn() };
  const stream = {
    getTracks: () => [video, audio],
    getVideoTracks: () => [video],
    getAudioTracks: () => [audio],
  } as unknown as MediaStream;
  return {
    stream,
    stops: () => [video.stop.mock.calls.length, audio.stop.mock.calls.length],
  };
}

const NONE_STOPPED = [0, 0];
const ALL_STOPPED = [1, 1];

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  dropStart();
  jest.useRealTimers();
});

it('hands the open camera to the page its start was for, once', () => {
  const camera = standInCamera();
  holdStart({ way: 'monitor' }, camera.stream);

  expect(takeStart('monitor')).toEqual({ way: 'monitor' });
  expect(takeStart('monitor')).toBeNull();
  expect(takeHeldCamera()).toBe(camera.stream);
  expect(takeHeldCamera()).toBeNull();
  expect(camera.stops()).toEqual(NONE_STOPPED);
});

it("sends a Lost and Found start to Motion and sound's page, with the pet", () => {
  expect(pageOfStart('lost-found')).toBe('monitor');

  holdStart({ way: 'lost-found', pet: 'p1' }, standInCamera().stream);
  expect(takeStart('monitor')).toEqual({ way: 'lost-found', pet: 'p1' });
});

it('closes a camera no page took within ten seconds', () => {
  const camera = standInCamera();
  holdStart({ way: 'monitor' }, camera.stream);

  jest.advanceTimersByTime(9_999);
  expect(camera.stops()).toEqual(NONE_STOPPED);

  jest.advanceTimersByTime(1);
  expect(camera.stops()).toEqual(ALL_STOPPED);
  expect(takeStart('monitor')).toBeNull();
});

it('closes the camera when a page it was not opened for asks', () => {
  const camera = standInCamera();
  holdStart({ way: 'security' }, camera.stream);

  expect(takeStart('wildlife')).toBeNull();
  expect(camera.stops()).toEqual(ALL_STOPPED);
});

it("keeps the camera for the page that took the start until that page's feed takes it", () => {
  const camera = standInCamera();
  holdStart({ way: 'security' }, camera.stream);
  takeStart('security');

  jest.advanceTimersByTime(60_000);
  expect(camera.stops()).toEqual(NONE_STOPPED);

  dropStart();
  expect(camera.stops()).toEqual(ALL_STOPPED);
});

it("lets go of the tab's claim when a held camera is closed, and not when a feed takes it", () => {
  const untaken = jest.fn();
  holdStart({ way: 'monitor' }, standInCamera().stream, untaken);
  jest.advanceTimersByTime(10_000);
  expect(untaken).toHaveBeenCalledTimes(1);

  const taken = jest.fn();
  holdStart({ way: 'monitor' }, standInCamera().stream, taken);
  takeStart('monitor');
  takeHeldCamera();
  expect(taken).not.toHaveBeenCalled();

  const wrongPage = jest.fn();
  holdStart({ way: 'monitor' }, standInCamera().stream, wrongPage);
  takeStart('security');
  expect(wrongPage).toHaveBeenCalledTimes(1);

  const ended = jest.fn();
  holdStart({ way: 'monitor' }, standInCamera('ended').stream, ended);
  takeStart('monitor');
  takeHeldCamera();
  expect(ended).toHaveBeenCalledTimes(1);

  const dropped = jest.fn();
  holdStart({ way: 'monitor' }, standInCamera().stream, dropped);
  dropStart();
  expect(dropped).toHaveBeenCalledTimes(1);
  expect(taken).not.toHaveBeenCalled();
});

it('gives the camera to no feed before a page has taken the start', () => {
  const camera = standInCamera();
  holdStart({ way: 'monitor' }, camera.stream);

  expect(takeHeldCamera()).toBeNull();
  expect(camera.stops()).toEqual(NONE_STOPPED);
});

it('does not hand over a camera that has ended', () => {
  const camera = standInCamera('ended');
  holdStart({ way: 'monitor' }, camera.stream);
  takeStart('monitor');

  expect(takeHeldCamera()).toBeNull();
  expect(camera.stops()).toEqual(ALL_STOPPED);
});

it('a new start closes the one before it', () => {
  const first = standInCamera();
  const second = standInCamera();
  holdStart({ way: 'monitor' }, first.stream);
  holdStart({ way: 'security' }, second.stream);

  expect(first.stops()).toEqual(ALL_STOPPED);
  expect(second.stops()).toEqual(NONE_STOPPED);
});
