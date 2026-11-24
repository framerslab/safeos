/** @jest-environment jsdom */
/**
 * Start watching
 *
 * The dashboard's key names the way it starts and opens the camera while the
 * dashboard is on screen, so it can say why the camera did not open. The
 * camera is held for the way's page, which takes it with no second request.
 * The tab holds the device's one watch from before the camera is asked for,
 * and lets it go when the start ends without a watch. jsdom has no
 * BroadcastChannel, so a stand-in carries the words between tabs
 * (tests/helpers/tab-channel-stand-in).
 */

import { openCamera } from '@/lib/camera-constraints';
import { dropStart, takeStart } from '@/lib/camera-handoff';
import type { SubjectProfileDB } from '@/lib/client-db';
import { modelOnDevice } from '@/lib/model-on-device';
import { startAddress, startChoice, startLine, startWatch } from '@/lib/start-watch';
import { useCameraStore } from '@/stores/camera-store';
import { installTabChannel } from './helpers/tab-channel-stand-in';

jest.mock('@/lib/camera-constraints', () => ({
  ...jest.requireActual('@/lib/camera-constraints'),
  openCamera: jest.fn(),
}));

jest.mock('@/lib/model-on-device', () => ({
  modelOnDevice: jest.fn(),
  useModelOnDevice: jest.fn(),
}));

const opened = jest.mocked(openCamera);
const modelHere = jest.mocked(modelOnDevice);

const { otherTab } = installTabChannel();
const other = otherTab();

function subject(id: string, name: string, type: SubjectProfileDB['type']): SubjectProfileDB {
  return {
    id,
    name,
    type,
    description: '',
    fingerprint: null,
    referenceImages: [],
    createdAt: new Date(0).toISOString(),
    lastActiveAt: null,
    matchCount: 0,
  };
}

const mittens = subject('pet-1', 'Mittens', 'pet');
const sam = subject('person-1', 'Sam', 'person');

function standInCamera() {
  const video = { kind: 'video', readyState: 'live', stop: jest.fn() };
  const audio = { kind: 'audio', readyState: 'live', stop: jest.fn() };
  const stream = {
    getTracks: () => [video, audio],
    getVideoTracks: () => [video],
    getAudioTracks: () => [audio],
  } as unknown as MediaStream;
  return { stream, stopped: () => video.stop.mock.calls.length === 1 && audio.stop.mock.calls.length === 1 };
}

const named = (name: string) => Object.assign(new Error(name), { name });

/** Lets every word already said between the tabs arrive. */
const arrive = () => new Promise((resolve) => setTimeout(resolve, 0));

const lastHeard = () => other.heard[other.heard.length - 1];

let go: jest.Mock;

beforeEach(async () => {
  await arrive();
  other.heard.length = 0;
  go = jest.fn();
  opened.mockReset();
  modelHere.mockReset().mockResolvedValue(true);
  useCameraStore.setState({ deviceId: 'camera-2' });
});

afterEach(async () => {
  dropStart();
  await arrive();
});

it('names Motion and sound before any watch on this device', () => {
  const choice = startChoice(null, [mittens]);
  expect(choice).toEqual({ way: 'monitor' });
  expect(startLine(choice)).toBe('Start watching uses Motion and sound.');
});

it('uses the way last watched', () => {
  expect(startLine(startChoice({ way: 'security' }, [mittens]))).toBe('Start watching uses People.');
  expect(startLine(startChoice({ way: 'wildlife' }, [mittens]))).toBe('Start watching uses Wildlife.');
  const lostFound = startChoice({ way: 'lost-found', pet: 'pet-1' }, [sam, mittens]);
  expect(lostFound).toEqual({ way: 'lost-found', pet: mittens });
  expect(startLine(lostFound)).toBe('Start watching uses Lost and Found, for Mittens.');
});

it('falls back to Motion and sound when the pet is gone, is a person, or was never named', () => {
  expect(startChoice({ way: 'lost-found', pet: 'pet-1' }, [])).toEqual({ way: 'monitor' });
  expect(startChoice({ way: 'lost-found', pet: 'pet-1' }, [{ ...mittens, type: 'person' }])).toEqual({ way: 'monitor' });
  expect(startChoice({ way: 'lost-found' }, [mittens])).toEqual({ way: 'monitor' });
  const person = startChoice({ way: 'lost-found', pet: sam.id }, [sam]);
  expect(person).toEqual({ way: 'monitor' });
  expect(startLine(person)).not.toContain('Sam');
});

it("opens Motion and sound's page for Motion and sound and for Lost and Found", () => {
  expect([
    startAddress({ way: 'monitor' }),
    startAddress({ way: 'lost-found', pet: mittens }),
    startAddress({ way: 'security' }),
    startAddress({ way: 'wildlife' }),
  ]).toEqual(['/monitor/', '/monitor/', '/security/', '/wildlife/']);
});

it("asks for the camera and the microphone once, holds them, and opens the way's page", async () => {
  opened.mockResolvedValue(standInCamera().stream);

  await expect(startWatch({ way: 'monitor' }, go)).resolves.toBe('opened');

  expect(opened.mock.calls).toEqual([[{ deviceId: 'camera-2', audio: true }]]);
  expect(go.mock.calls).toEqual([['/monitor/']]);
  expect(go.mock.invocationCallOrder[0]).toBeGreaterThan(opened.mock.invocationCallOrder[0]);
  expect(takeStart('monitor')).toEqual({ way: 'monitor' });
});

it("hands Lost and Found's pet with the camera", async () => {
  opened.mockResolvedValue(standInCamera().stream);

  await expect(startWatch({ way: 'lost-found', pet: mittens }, go)).resolves.toBe('opened');

  expect(go.mock.calls).toEqual([['/monitor/']]);
  expect(takeStart('monitor')).toEqual({ way: 'lost-found', pet: 'pet-1' });
});

it('asks for no microphone where the way does not listen', async () => {
  for (const way of ['security', 'wildlife'] as const) {
    opened.mockReset().mockResolvedValue(standInCamera().stream);
    await expect(startWatch({ way }, go)).resolves.toBe('opened');
    expect(opened.mock.calls).toEqual([[{ deviceId: '', audio: false }]]);
    expect(takeStart(way)).toEqual({ way });
    dropStart();
  }
});

it('opens People or Wildlife at their own question when the model is not on this device, and asks for no camera', async () => {
  modelHere.mockResolvedValue(false);

  await expect(startWatch({ way: 'security' }, go)).resolves.toBe('needs-model');
  await expect(startWatch({ way: 'wildlife' }, go)).resolves.toBe('needs-model');

  expect(go.mock.calls).toEqual([['/security/'], ['/wildlife/']]);
  expect(opened).not.toHaveBeenCalled();
  expect(takeStart('security')).toBeNull();
  expect(takeStart('wildlife')).toBeNull();
  await arrive();
  expect(other.heard).toEqual([]);
});

it('says why the camera did not open and holds nothing', async () => {
  const answers: [string, string][] = [
    ['NotAllowedError', 'blocked'],
    ['NotReadableError', 'in-use'],
    ['AbortError', 'failed'],
  ];
  for (const [error, outcome] of answers) {
    opened.mockReset().mockRejectedValue(named(error));
    await expect(startWatch({ way: 'monitor' }, go)).resolves.toBe(outcome);
    expect(go).not.toHaveBeenCalled();
    expect(takeStart('monitor')).toBeNull();
  }
});

it('says the camera did not start where the browser has no camera request', async () => {
  // What a browser without navigator.mediaDevices gives: an address not
  // served over https, an in-app browser, an old browser.
  opened.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'getUserMedia')"));

  await expect(startWatch({ way: 'monitor' }, go)).resolves.toBe('failed');

  expect(go).not.toHaveBeenCalled();
  expect(takeStart('monitor')).toBeNull();
});

it('tells the other tabs it watches before it asks for the camera, and lets go when the camera is refused', async () => {
  let heardWhenAsked: unknown[] = [];
  opened.mockImplementation(async () => {
    // The channel carries a word later than the post, as a browser's does:
    // what was said before this request has arrived by the next turn.
    await Promise.resolve();
    heardWhenAsked = [...other.heard];
    throw named('NotAllowedError');
  });

  await expect(startWatch({ way: 'monitor' }, go)).resolves.toBe('blocked');
  await arrive();

  expect(heardWhenAsked).toContainEqual({ type: 'watch-started', way: 'monitor' });
  expect(lastHeard()).toEqual({ type: 'watch-ended' });
});

it("answers another tab while the camera is held for the way's page", async () => {
  opened.mockResolvedValue(standInCamera().stream);
  await expect(startWatch({ way: 'monitor' }, go)).resolves.toBe('opened');
  await arrive();

  other.say({ type: 'watch-ask' });
  await arrive();
  expect(lastHeard()).toEqual({ type: 'watch-answer', way: 'monitor' });

  dropStart();
  await arrive();
  expect(lastHeard()).toEqual({ type: 'watch-ended' });
});

it('a start another tab takes over closes its camera and opens nothing', async () => {
  const camera = standInCamera();
  let give!: (stream: MediaStream) => void;
  opened.mockReturnValue(new Promise<MediaStream>((resolve) => {
    give = resolve;
  }));

  const outcome = startWatch({ way: 'monitor' }, go);
  await arrive();
  other.say({ type: 'watch-stop' });
  await arrive();
  give(camera.stream);

  await expect(outcome).resolves.toBe('stopped');
  await arrive();
  expect(camera.stopped()).toBe(true);
  expect(go).not.toHaveBeenCalled();
  expect(takeStart('monitor')).toBeNull();
  expect(other.heard).toContainEqual({ type: 'watch-ended' });
  expect(lastHeard()).toEqual({ type: 'watch-ended' });
});

it('asks for the camera no second time once another tab took over while the browser said whether the camera is allowed', async () => {
  const actual = jest.requireActual<{ openCamera: typeof openCamera }>('@/lib/camera-constraints');
  opened.mockImplementation(actual.openCamera);
  const camera = standInCamera();
  // The request with sound is refused; the browser's answer on the camera is held.
  const getUserMedia = jest.fn()
    .mockRejectedValueOnce(named('NotAllowedError'))
    .mockResolvedValue(camera.stream);
  let answer!: (status: { state: PermissionState }) => void;
  const query = jest.fn(() => new Promise<{ state: PermissionState }>((resolve) => { answer = resolve; }));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } });
  try {
    const outcome = startWatch({ way: 'monitor' }, go);
    await arrive();
    expect(query).toHaveBeenCalledTimes(1);
    other.say({ type: 'watch-stop' });
    await arrive();
    answer({ state: 'granted' });

    await expect(outcome).resolves.toBe('stopped');
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
    expect(takeStart('monitor')).toBeNull();
  } finally {
    delete (navigator as { mediaDevices?: unknown }).mediaDevices;
    delete (navigator as { permissions?: unknown }).permissions;
  }
});
