/** @jest-environment jsdom */
/**
 * Setup's live measures
 *
 * Setup measures the open stream as the watch does: motion on frames every
 * 200 ms, scored on the parts of the picture the device watches and measured
 * against each part's own line, and sound every 100 ms on the pitches set on
 * Detection. Nothing is kept, and everything stops when the part leaves.
 */

import React, { useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useLiveLevels, watchMotion } from '@/lib/live-levels';
import { PITCH_RANGE_ANALYSER_SIZE } from '@/lib/audio-levels';
import { DEFAULT_DETECTION_ZONES, useSettingsStore, type DetectionZone } from '@/stores/settings-store';
import { installCameraBrowser } from './helpers/camera-browser';

function frame(changed: (x: number, y: number) => boolean): ImageData {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const at = (y * 16 + x) * 4;
      const value = changed(x, y) ? 255 : 0;
      data[at] = value;
      data[at + 1] = value;
      data[at + 2] = value;
      data[at + 3] = 255;
    }
  }
  return new ImageData(data, 16, 16);
}

const black = frame(() => false);
const leftEdge = frame((x) => x < 4);

function zones(changes: Record<string, Partial<DetectionZone>>): DetectionZone[] {
  return DEFAULT_DETECTION_ZONES.map((zone) => ({ ...zone, ...(changes[zone.id] ?? {}) }));
}

describe("the watch's motion rule, on setup's frames", () => {
  it('scores the whole picture where the watch does', () => {
    expect(watchMotion(black, leftEdge, { zones: DEFAULT_DETECTION_ZONES, line: 10 })).toEqual({ score: 25, line: 10 });
    expect(watchMotion(black, leftEdge, { zones: zones({ full: { enabled: false } }), line: 10 })).toEqual({ score: 25, line: 10 });
  });

  it('scores only the parts of the picture the device watches', () => {
    expect(watchMotion(black, leftEdge, { zones: zones({ full: { enabled: false }, center: { enabled: true } }), line: 10 })).toEqual({
      score: 0,
      line: 10,
    });
  });

  it('measures a part against its own line where it sets one', () => {
    expect(watchMotion(black, leftEdge, { zones: zones({ full: { sensitivityOverride: { motion: 50 } } }), line: 10 })).toEqual({
      score: 25,
      line: 50,
    });
    expect(
      watchMotion(black, leftEdge, {
        zones: zones({
          full: { enabled: false },
          left: { enabled: true, sensitivityOverride: { motion: 90 } },
          center: { enabled: true },
        }),
        line: 30,
      })
    ).toEqual({ score: 50, line: 10 });
  });
});

type Browser = ReturnType<typeof installCameraBrowser>;
let browser: Browser;

function Levels({ stream, line, everyMs }: { stream: MediaStream; line: number; everyMs?: number }) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const levels = useLiveLevels(stream, video, { zones: DEFAULT_DETECTION_ZONES, line }, everyMs);
  return (
    <>
      <video
        ref={(element) => {
          if (element && element !== video) {
            Object.defineProperty(element, 'readyState', { configurable: true, value: 4 });
            setVideo(element);
          }
        }}
      />
      <p data-testid="motion">{String(levels.motion)}</p>
      <p data-testid="line">{String(levels.motionLine)}</p>
      <p data-testid="sound">{String(levels.sound)}</p>
    </>
  );
}

const reads = (id: string) => screen.getByTestId(id).textContent;
const pass = (ms: number) => act(() => jest.advanceTimersByTime(ms));

describe("setup's live measures on the stream", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    browser = installCameraBrowser();
  });
  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    jest.restoreAllMocks();
    useSettingsStore.getState().resetToDefaults();
  });

  it('measures motion as the watch does', () => {
    const { rerender } = render(<Levels stream={browser.stream} line={10} />);
    pass(500);
    expect(reads('motion')).toBe('100');
    expect(reads('line')).toBe('10');
    rerender(<Levels stream={browser.stream} line={30} />);
    pass(200);
    expect(reads('line')).toBe('30');
    expect(browser.closeAudio).not.toHaveBeenCalled();
  });

  it('measures sound as the watch does', () => {
    const loud = jest
      .spyOn(AudioContext.prototype, 'createAnalyser')
      .mockReturnValue({ fftSize: 256, frequencyBinCount: 128, getByteFrequencyData: (data: Uint8Array) => data.fill(255) } as unknown as AnalyserNode);
    const first = render(<Levels stream={browser.stream} line={10} />);
    pass(200);
    expect(reads('sound')).toBe('100');
    first.unmount();
    loud.mockRestore();
    render(<Levels stream={browser.stream} line={10} />);
    pass(200);
    expect(reads('sound')).toBe('0');
  });

  it('reads the pitches set on Detection, as the watch does', () => {
    useSettingsStore.setState({
      audioSettings: { ...useSettingsStore.getState().audioSettings, frequencyRange: 'custom', backgroundNoiseFilter: true, customLowFreq: 300, customHighFreq: 600 },
    });
    const kept = { context: { sampleRate: 48000 }, fftSize: 256, frequencyBinCount: 1024, getByteFrequencyData: (data: Uint8Array) => data.fill(0) };
    jest.spyOn(AudioContext.prototype, 'createAnalyser').mockReturnValue(kept as unknown as AnalyserNode);
    const first = render(<Levels stream={browser.stream} line={10} />);
    pass(200);
    expect(kept.fftSize).toBe(PITCH_RANGE_ANALYSER_SIZE);
    first.unmount();

    useSettingsStore.setState({ audioSettings: { ...useSettingsStore.getState().audioSettings, frequencyRange: 'all' } });
    kept.fftSize = 256;
    render(<Levels stream={browser.stream} line={10} />);
    pass(200);
    expect(kept.fftSize).toBe(256);
  });

  it('gives no sound level without a microphone track', () => {
    const analyser = jest.spyOn(AudioContext.prototype, 'createAnalyser');
    const silent = { ...browser.stream, getAudioTracks: () => [], getVideoTracks: browser.stream.getVideoTracks, getTracks: browser.stream.getVideoTracks } as unknown as MediaStream;
    render(<Levels stream={silent} line={10} />);
    pass(300);
    expect(reads('sound')).toBe('null');
    expect(analyser).not.toHaveBeenCalled();
  });

  it('publishes in quarter-second steps under reduced motion', () => {
    render(<Levels stream={browser.stream} line={10} everyMs={250} />);
    pass(490);
    expect(reads('motion')).toBe('null');
    pass(20);
    expect(reads('motion')).toBe('100');
  });

  it('stops measuring and closes its audio when it leaves', () => {
    const { unmount } = render(<Levels stream={browser.stream} line={10} />);
    pass(300);
    unmount();
    expect(browser.closeAudio).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
