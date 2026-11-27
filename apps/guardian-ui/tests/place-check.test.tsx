/** @jest-environment jsdom */
/**
 * Setup's step 2: the place and its test
 *
 * The live picture shows the place, with a Motion bar and a Sound bar each
 * drawn against the line where the watch will alert; a bar at or past its
 * line says Alert and is announced, at most once in 5 seconds; the camera off,
 * stopped or ended before its first frame each say so with the way on; the
 * test line stands under the picture in every state.
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PlaceCheck, type PlaceCheckProps } from '@/components/setup/PlaceCheck';
import { useLiveLevels, type LiveLevels } from '@/lib/live-levels';
import { installCameraBrowser } from './helpers/camera-browser';

jest.mock('@/lib/live-levels', () => ({
  ...jest.requireActual('@/lib/live-levels'),
  useLiveLevels: jest.fn(),
}));

const liveLevels = useLiveLevels as jest.Mock;
const levels = (values: Partial<LiveLevels>): LiveLevels => ({ motion: null, motionLine: null, sound: null, ...values });

const words = (element: Element | null | undefined) =>
  (element?.textContent || '').replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

const TEST_LINE =
  'Prop this device where it sees the spot to watch, plugged in. Wave or clap to test it. While SafeOS watches, a bar past its line sounds an alert on this device.';
const VIDEO_NAME = 'Live picture from this device’s camera';

type Browser = ReturnType<typeof installCameraBrowser>;
let browser: Browser;
let onStopped: jest.Mock;
let onTurnOn: jest.Mock;

function element(props: Partial<PlaceCheckProps> = {}) {
  return (
    <PlaceCheck
      stream={browser.stream}
      microphone
      stopped={false}
      failure={null}
      asking={null}
      lines={{ motion: 20, sound: 40 }}
      savedCamera={false}
      onStopped={onStopped}
      onTurnOn={onTurnOn}
      onDefaultCamera={jest.fn()}
      {...props}
    />
  );
}
const place = (props: Partial<PlaceCheckProps> = {}) => render(element(props));

function shown() {
  act(() => {
    fireEvent(screen.getByLabelText(VIDEO_NAME), new Event('loadeddata'));
  });
}

const meter = (label: 'Motion' | 'Sound') => screen.getByRole('meter', { name: label });
const labelRow = (container: HTMLElement, label: 'Motion' | 'Sound') =>
  Array.from(container.querySelectorAll('.setup-meter__label')).find((row) => words(row).startsWith(label)) as HTMLElement;
const meterCell = (container: HTMLElement, label: 'Motion' | 'Sound') => labelRow(container, label).closest('.setup-meter') as HTMLElement;

beforeEach(() => {
  browser = installCameraBrowser();
  onStopped = jest.fn();
  onTurnOn = jest.fn();
  liveLevels.mockReturnValue(levels({ motion: 0, sound: 0 }));
  window.matchMedia = jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() });
});
const ownMatchMedia = window.matchMedia;
afterEach(() => {
  cleanup();
  jest.useRealTimers();
  jest.restoreAllMocks();
  window.matchMedia = ownMatchMedia;
});

describe("setup's step 2, the place and its test", () => {
  it('shows the picture loading until its first frame', () => {
    liveLevels.mockReturnValue(levels({ motion: 50, sound: 50 }));
    const { container } = place();
    const picture = container.querySelector('.setup-picture') as HTMLElement;
    expect(picture.getAttribute('data-state')).toBe('starting');
    expect(words(picture)).toContain('Starting the camera…');
    for (const label of ['Motion', 'Sound'] as const) {
      expect(meter(label).getAttribute('aria-valuenow')).toBe('0');
      expect((meter(label).querySelector('.setup-track__fill') as HTMLElement).style.width).toBe('0%');
    }
    shown();
    expect(picture.getAttribute('data-state')).toBe('on');
    expect(meter('Motion').getAttribute('aria-valuenow')).toBe('50');
    expect(meter('Sound').getAttribute('aria-valuenow')).toBe('50');
    const video = screen.getByLabelText(VIDEO_NAME) as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.hasAttribute('controls')).toBe(false);
  });

  it("draws each bar's line where the setting puts it", () => {
    place();
    shown();
    expect((meter('Motion').querySelector('.setup-track__line') as HTMLElement).style.left).toBe('20%');
    expect((meter('Sound').querySelector('.setup-track__line') as HTMLElement).style.left).toBe('40%');
  });

  it('says Alert beside a bar at or past its line', () => {
    liveLevels.mockReturnValue(levels({ motion: 25, sound: 10 }));
    const { container } = place();
    shown();
    const motion = labelRow(container, 'Motion');
    expect(motion.querySelector('svg.problem-mark')).not.toBeNull();
    expect(words(motion)).toContain('Alert');
    expect(meter('Motion').getAttribute('aria-valuetext')).toBe('at its line or past it');
    expect(meter('Motion').querySelector('.setup-track__fill')?.getAttribute('data-over')).toBe('true');
    expect(meter('Sound').getAttribute('aria-valuetext')).toBe('below its line');
    expect(words(labelRow(container, 'Sound'))).not.toContain('Alert');
  });

  it('draws the Motion line at the line of the part of the picture the watch alerts on', () => {
    liveLevels.mockReturnValue(levels({ motion: 25, motionLine: 50, sound: 10 }));
    const { container } = place();
    shown();
    expect((meter('Motion').querySelector('.setup-track__line') as HTMLElement).style.left).toBe('50%');
    expect(meter('Motion').getAttribute('aria-valuetext')).toBe('below its line');
    expect(words(labelRow(container, 'Motion'))).not.toContain('Alert');
  });

  it('shows a sound level with no line and No alert where the setting raises no sound alert', () => {
    liveLevels.mockReturnValue(levels({ motion: 0, sound: 80 }));
    const { container } = place({ lines: { motion: 10, sound: null } });
    shown();
    const row = labelRow(container, 'Sound');
    expect(words(row)).toContain('Sound');
    expect(words(row)).toContain('No alert');
    expect(meter('Sound').getAttribute('aria-valuenow')).toBe('80');
    expect(meter('Sound').querySelector('.setup-track__line')).toBeNull();
    expect(meter('Sound').getAttribute('aria-valuetext')).toBe('no alert for this use');
    expect(meter('Sound').querySelector('.setup-track__fill')?.hasAttribute('data-over')).toBe(false);
  });

  it('says the camera is off, with Turn on the camera', () => {
    const { container } = place({ stream: null });
    const picture = container.querySelector('.setup-picture') as HTMLElement;
    expect(picture.querySelector('.setup-camera-drawing')).not.toBeNull();
    expect(words(picture)).toContain('The camera is off. SafeOS cannot watch until you turn it on.');
    const key = screen.getByRole('button', { name: 'Turn on the camera' });
    expect(key.classList.contains('key--outline')).toBe(true);
    fireEvent.click(key);
    expect(onTurnOn).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole('meter')).toHaveLength(0);
  });

  it("calls onStopped when the camera's track ends, and shows Try again once stopped", () => {
    place();
    act(() => browser.video.end());
    expect(onStopped).toHaveBeenCalledTimes(1);
    cleanup();
    const { container } = place({ stream: null, stopped: true });
    const picture = container.querySelector('.setup-picture') as HTMLElement;
    expect(words(picture)).toContain('The camera stopped. Check the device, then press Try again.');
    expect(picture.querySelector('svg.problem-mark')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('calls onStopped for a track muted over 2 seconds, and not for a shorter pause', () => {
    jest.useFakeTimers();
    place();
    act(() => browser.video.mute());
    act(() => jest.advanceTimersByTime(1900));
    act(() => browser.video.unmute());
    expect(onStopped).not.toHaveBeenCalled();
    act(() => browser.video.mute());
    act(() => jest.advanceTimersByTime(2100));
    expect(onStopped).toHaveBeenCalledTimes(1);
  });

  it('calls onStopped for a track muted before the part mounts, unless it unmutes within 2 seconds', () => {
    jest.useFakeTimers();
    browser.video.muted = true;
    const first = place();
    act(() => jest.advanceTimersByTime(2100));
    expect(onStopped).toHaveBeenCalledTimes(1);
    first.unmount();
    onStopped.mockClear();
    browser.video.muted = true;
    place();
    act(() => jest.advanceTimersByTime(1000));
    act(() => browser.video.unmute());
    act(() => jest.advanceTimersByTime(3000));
    expect(onStopped).not.toHaveBeenCalled();
  });

  it('a camera that ends before its first frame shows the stopped state', () => {
    place();
    act(() => browser.video.end());
    expect(onStopped).toHaveBeenCalled();
  });

  it('says when the device has no microphone, and draws the sound bar flat', () => {
    const { container } = place({ microphone: false });
    shown();
    const cell = meterCell(container, 'Sound');
    expect(cell.querySelector('.setup-meter__flat')).not.toBeNull();
    expect(cell.querySelector('[role="meter"]')).toBeNull();
    const line = container.querySelector('.setup-strip .setup-no-mic') as HTMLElement;
    expect(words(line)).toBe('No microphone found. SafeOS watches for movement only.');
    expect(line.querySelector('svg.problem-mark')).not.toBeNull();
  });

  it('announces a bar reaching its line at most once in 5 seconds', () => {
    jest.useFakeTimers();
    const { container, rerender } = place();
    shown();
    const region = () => container.querySelectorAll('span.sr-only[role="status"]')[1] as HTMLElement;
    let heard = 0;
    let last = '';
    const listen = () => {
      const now = words(region());
      if (now === 'Motion reached its line.' && last !== now) heard += 1;
      last = now;
    };
    const step = (motion: number) => {
      liveLevels.mockReturnValue(levels({ motion, sound: 0 }));
      rerender(element());
      listen();
      act(() => jest.advanceTimersByTime(500));
      listen();
    };
    step(0);
    step(30);
    step(0);
    step(30);
    expect(heard).toBe(1);
    act(() => jest.advanceTimersByTime(5000));
    listen();
    step(0);
    step(30);
    expect(heard).toBe(2);
  });

  it('waits with the key inactive while the browser asks', () => {
    const { container } = place({ stream: null, asking: 'turn-on' });
    const key = container.querySelector('.setup-again') as HTMLElement;
    expect(words(key)).toBe('Waiting for your answer…');
    expect(key.getAttribute('aria-busy')).toBe('true');
    expect(key.classList.contains('setup-key--waiting')).toBe(true);
    fireEvent.click(key);
    expect(onTurnOn).not.toHaveBeenCalled();
  });

  it('keeps the test line under the picture in every state', () => {
    for (const props of [{}, { stream: null }, { stream: null, stopped: true }]) {
      const { container } = place(props);
      const line = container.querySelector('p.setup-test-line') as HTMLElement;
      expect(words(line)).toBe(TEST_LINE);
      const picture = container.querySelector('.setup-picture') as HTMLElement;
      expect(picture.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      cleanup();
    }
  });

  it('ends no track of its own, and closes nothing it did not open', () => {
    const { unmount } = place();
    unmount();
    expect(browser.video.stop).not.toHaveBeenCalled();
    expect(browser.audio.stop).not.toHaveBeenCalled();
  });
});

describe('step 2 when the camera does not turn on', () => {
  it('draws a failure on step 2 inside the frame, with Try again as an outlined key', () => {
    const { container } = place({ stream: null, failure: 'blocked' });
    const off = container.querySelector('.setup-picture[data-state="failed"] .setup-off') as HTMLElement;
    expect(off).not.toBeNull();
    expect(off.querySelector('svg.problem-mark')).not.toBeNull();
    expect(words(off)).toContain("The camera is blocked for safeos.sh in this browser. Allow it in the site's settings, then press Try again.");
    const again = screen.getByRole('button', { name: 'Try again' });
    expect(off.contains(again)).toBe(true);
    expect(again.classList.contains('key--outline')).toBe(true);
    expect(off.contains(screen.getByRole('link', { name: 'How to allow the camera' }))).toBe(true);
  });

  it('keeps Use the default camera on step 2 while its request is out', () => {
    const { container } = place({ stream: null, failure: 'saved-gone', savedCamera: false, asking: 'default' });
    const off = container.querySelector('.setup-off') as HTMLElement;
    const waiting = off.querySelector('button.setup-default') as HTMLElement;
    expect(words(waiting)).toBe('Waiting for your answer…');
    expect(waiting.getAttribute('aria-busy')).toBe('true');
    const again = off.querySelector('.setup-again') as HTMLElement;
    expect(words(again)).toBe('Try again');
    expect(again.getAttribute('aria-disabled')).toBe('true');
    expect(again.hasAttribute('aria-busy')).toBe(false);
  });
});
