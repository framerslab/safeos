/**
 * Setup's live measures
 *
 * Setup measures the open stream as the watch does, with the watch's own
 * functions, intervals and rules: motion from frames every 200 ms, scored on
 * the parts of the picture the device watches, each against its own line;
 * sound every 100 ms on the pitches set on Detection. Nothing is recorded,
 * kept or sent.
 *
 * @module lib/live-levels
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { detectMotion, detectMotionInZones } from './motion-detection';
import { ANALYSER_SIZE, analyserSizeFor, getAudioLevel, pitchRangeOf } from './audio-levels';
import { useSettingsStore, type DetectionZone } from '@/stores/settings-store';

export interface LiveLevels {
  /** 0 to 100, the watch's motion score; null before two frames are drawn. */
  motion: number | null;
  /** Where the motion alert starts for that score, 0 to 100: the line of the part of the picture it came from; null while motion is null. */
  motionLine: number | null;
  /** 0 to 100, the watch's sound level; null while the stream has no live microphone track. */
  sound: number | null;
}

/** The parts of the picture the device watches, and the motion line where a part sets none of its own. */
export interface Watched {
  zones: readonly DetectionZone[];
  line: number;
}

const MOTION_EVERY = 200;
const SOUND_EVERY = 100;

/**
 * Motion on two frames as the watch scores it: the whole picture where no
 * detection zone is on or the whole-picture zone is on, otherwise each zone
 * that is on. A zone's line is its own motion sensitivity's where it sets one,
 * otherwise `line`. Answers the score and the line of the zone furthest past
 * its line, or nearest under it.
 */
export function watchMotion(previous: ImageData, current: ImageData, watched: Watched): { score: number; line: number } {
  const { zones, line } = watched;
  const on = zones.filter((zone) => zone.enabled);
  const whole = on.find((zone) => zone.x === 0 && zone.y === 0 && zone.width === 100 && zone.height === 100);
  let scores: Array<{ id: string; score: number }>;
  if (whole || on.length === 0) {
    scores = [{ id: whole ? whole.id : 'full', score: Math.round(detectMotion(previous, current) * 100) }];
  } else {
    scores = detectMotionInZones(
      previous,
      current,
      on.map((zone) => ({ id: zone.id, name: zone.name, x: zone.x, y: zone.y, width: zone.width, height: zone.height }))
    ).map((result) => ({ id: result.zone.id || 'zone', score: Math.round(result.score * 100) }));
  }
  let best: { score: number; line: number } | null = null;
  for (const { id, score } of scores) {
    const own = zones.find((zone) => zone.id === id)?.sensitivityOverride?.motion;
    const its = typeof own === 'number' ? Math.max(0, Math.min(100, 100 - own)) : line;
    if (!best || score - its > best.score - best.line) best = { score, line: its };
  }
  return best ?? { score: 0, line };
}

/**
 * Measures the stream as the watch does: motion from frames of `video` every
 * 200 ms through watchMotion, sound every 100 ms on the pitches set on
 * Detection. The levels are published every `everyMs`. `watched` is read at
 * each measure, so a new line or new zones take effect without starting the
 * measure again. Everything stops, and the audio context closes, when the
 * stream or the video changes or the part leaves.
 */
export function useLiveLevels(stream: MediaStream | null, video: HTMLVideoElement | null, watched: Watched, everyMs = 100): LiveLevels {
  const [levels, setLevels] = useState<LiveLevels>({ motion: null, motionLine: null, sound: null });
  const watchedRef = useRef(watched);
  watchedRef.current = watched;

  useEffect(() => {
    setLevels({ motion: null, motionLine: null, sound: null });
    if (!stream || !video) return;

    const motion: { current: { score: number; line: number } | null } = { current: null };
    const sound: { current: number | null } = { current: null };
    const timers: ReturnType<typeof setInterval>[] = [];

    const canvas = document.createElement('canvas');
    const drawing = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
    let previous: ImageData | null = null;
    if (drawing) {
      timers.push(
        setInterval(() => {
          if (video.readyState < 2) return;
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          drawing.drawImage(video, 0, 0, canvas.width, canvas.height);
          const current = drawing.getImageData(0, 0, canvas.width, canvas.height);
          if (previous) motion.current = watchMotion(previous, current, watchedRef.current);
          previous = current;
        }, MOTION_EVERY)
      );
    }

    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    const listening = stream.getAudioTracks().some((track) => track.readyState === 'live');
    if (listening && typeof AudioContext !== 'undefined') {
      try {
        context = new AudioContext();
        source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = ANALYSER_SIZE;
        source.connect(analyser);
        void context.resume?.();
        timers.push(
          setInterval(() => {
            const range = pitchRangeOf(useSettingsStore.getState().audioSettings);
            const size = analyserSizeFor(range);
            if (analyser.fftSize !== size) analyser.fftSize = size;
            sound.current = Math.round(getAudioLevel(analyser, range) * 100);
          }, SOUND_EVERY)
        );
      } catch {
        // No sound measure in this browser: the Sound bar stays at rest.
      }
    }

    timers.push(
      setInterval(() => {
        setLevels({
          motion: motion.current ? motion.current.score : null,
          motionLine: motion.current ? motion.current.line : null,
          sound: sound.current,
        });
      }, everyMs)
    );

    return () => {
      timers.forEach((timer) => clearInterval(timer));
      try {
        source?.disconnect();
      } catch {
        // Already disconnected.
      }
      void context?.close().catch(() => undefined);
    };
  }, [stream, video, everyMs]);

  return levels;
}
