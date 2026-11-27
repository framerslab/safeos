/**
 * Setup's step 2: the place and its test
 *
 * The live picture from the stream step 1 opened, with a Motion bar and a
 * Sound bar drawn against the lines where the watch will alert. A bar at or
 * past its line says Alert and is announced, at most once in 5 seconds for
 * each bar. The camera off, stopped or failed each say so in the picture's
 * frame with the way on. The test line stands under the picture in every
 * state. The part closes no camera: the flow does.
 *
 * @module components/setup/PlaceCheck
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { CornerTicks, ProblemMark } from '../dashboard/Drawn';
import type { AlertLines } from '@/lib/alert-lines';
import { useLiveLevels } from '@/lib/live-levels';
import type { CameraFailure } from '@/lib/setup-camera';
import type { Asking } from '@/lib/use-camera-request';
import { useSettingsStore } from '@/stores/settings-store';
import { CameraDrawing } from './drawings';

export interface PlaceCheckProps {
  stream: MediaStream | null;
  microphone: boolean;
  /** The camera stopped during the check. */
  stopped: boolean;
  failure: CameraFailure | null;
  asking: Asking | null;
  lines: AlertLines;
  savedCamera: boolean;
  onStopped: () => void;
  onTurnOn: () => void;
  onDefaultCamera: () => void;
}

export const TEST_LINE =
  'Prop this device where it sees the spot to watch, plugged in. Wave or clap to test it. While SafeOS watches, a bar past its line sounds an alert on this device.';
const OFF = 'The camera is off. SafeOS cannot watch until you turn it on.';
const STOPPED = 'The camera stopped. Check the device, then press Try again.';
const ANNOUNCE_GAP = 5000;
const MUTED_FOR = 2000;

type PictureState = 'starting' | 'on' | 'off' | 'stopped' | 'failed';

function Meter({ label, level, line }: { label: 'Motion' | 'Sound'; level: number; line: number | null }) {
  const over = line !== null && level >= line;
  const text = line === null ? 'no alert for this use' : over ? 'at its line or past it' : 'below its line';
  return (
    <div className="setup-meter">
      <div className="setup-meter__label">
        <span>{label}</span>
        {over ? (
          <span className="setup-meter__state">
            <ProblemMark />
            Alert
          </span>
        ) : line === null ? (
          <span className="setup-meter__state">No alert</span>
        ) : null}
      </div>
      <div
        className="setup-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={level}
        aria-valuetext={text}
      >
        <span className="setup-track__fill" style={{ width: `${level}%` }} data-over={over ? 'true' : undefined} />
        {line !== null ? <span className="setup-track__line" style={{ left: `${line}%` }} /> : null}
      </div>
    </div>
  );
}

/** The key that turns the camera on again: inactive, with its waiting words, while the browser asks. */
export function AgainKey({ asking, words, onPress }: { asking: Asking | null; words: string; onPress: () => void }) {
  const waiting = asking !== null;
  return (
    <button
      type="button"
      className={waiting ? 'key key--outline setup-again setup-key--waiting' : 'key key--outline setup-again'}
      aria-busy={waiting ? 'true' : undefined}
      aria-disabled={waiting ? 'true' : undefined}
      onClick={() => {
        if (!waiting) onPress();
      }}
    >
      {waiting ? 'Waiting for your answer…' : words}
    </button>
  );
}

export function PlaceCheck({ stream, microphone, stopped, failure, asking, lines, onStopped, onTurnOn }: PlaceCheckProps) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const zones = useSettingsStore((state) => state.detectionZones);
  const levels = useLiveLevels(stream, video, { zones, line: lines.motion }, reducedMotion ? 250 : 100);
  const stoppedRef = useRef(onStopped);
  stoppedRef.current = onStopped;

  const state: PictureState = stream ? (drawn ? 'on' : 'starting') : failure ? 'failed' : stopped ? 'stopped' : 'off';

  useEffect(() => {
    try {
      setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      setReducedMotion(false);
    }
  }, []);

  // The picture shows the stream; its first frame turns the state on.
  useEffect(() => {
    setDrawn(false);
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play()?.catch?.(() => undefined);
  }, [video, stream]);

  // The camera's track, by its state as well as its events.
  useEffect(() => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const ended = () => {
      clear();
      stoppedRef.current();
    };
    const muted = () => {
      clear();
      timer = setTimeout(() => {
        timer = null;
        stoppedRef.current();
      }, MUTED_FOR);
    };
    track.addEventListener('ended', ended);
    track.addEventListener('mute', muted);
    track.addEventListener('unmute', clear);
    if (track.readyState === 'ended') ended();
    else if (track.muted) muted();
    return () => {
      clear();
      track.removeEventListener('ended', ended);
      track.removeEventListener('mute', muted);
      track.removeEventListener('unmute', clear);
    };
  }, [stream]);

  const motion = state === 'on' ? levels.motion ?? 0 : 0;
  const sound = state === 'on' ? levels.sound ?? 0 : 0;
  const motionLine = levels.motionLine ?? lines.motion;

  // The frame's sentence, said once the state becomes off, stopped or failed.
  const [frameSaid, setFrameSaid] = useState('');
  useEffect(() => {
    setFrameSaid(state === 'off' ? OFF : state === 'stopped' ? STOPPED : '');
  }, [state]);

  // A bar reaching its line, said at most once in 5 seconds for each bar.
  const [barSaid, setBarSaid] = useState('');
  const wasOver = useRef({ motion: false, sound: false });
  const lastSaid = useRef({ motion: -Infinity, sound: -Infinity });
  const clearSaid = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionOver = state === 'on' && motion >= motionLine;
  const soundOver = state === 'on' && microphone && lines.sound !== null && sound >= lines.sound;
  useEffect(() => {
    const now = Date.now();
    const say = (bar: 'motion' | 'sound', over: boolean, sentence: string) => {
      if (over && !wasOver.current[bar] && now - lastSaid.current[bar] >= ANNOUNCE_GAP) {
        lastSaid.current[bar] = now;
        setBarSaid(sentence);
        if (clearSaid.current) clearTimeout(clearSaid.current);
        clearSaid.current = setTimeout(() => setBarSaid(''), 1000);
      }
      wasOver.current[bar] = over;
    };
    say('motion', motionOver, 'Motion reached its line.');
    say('sound', soundOver, 'Sound reached its line.');
  }, [motionOver, soundOver]);
  useEffect(
    () => () => {
      if (clearSaid.current) clearTimeout(clearSaid.current);
    },
    []
  );

  return (
    <div className="setup-place">
      <div className="setup-picture" data-state={state}>
        <CornerTicks />
        {stream ? (
          <>
            <video
              ref={setVideo}
              className="setup-video"
              muted
              playsInline
              autoPlay
              aria-label="Live picture from this device’s camera"
              onLoadedData={() => setDrawn(true)}
            />
            {state === 'starting' ? <p className="setup-body setup-starting">Starting the camera…</p> : null}
            <div className="setup-strip">
              <Meter label="Motion" level={motion} line={motionLine} />
              {microphone ? (
                <Meter label="Sound" level={sound} line={lines.sound} />
              ) : (
                <>
                  <div className="setup-meter">
                    <div className="setup-meter__label">
                      <span>Sound</span>
                    </div>
                    <span className="setup-meter__flat" aria-hidden="true" />
                  </div>
                  <p className="setup-body setup-no-mic">
                    <ProblemMark />
                    <span>No microphone found. SafeOS watches for movement only.</span>
                  </p>
                </>
              )}
            </div>
          </>
        ) : state === 'stopped' ? (
          <div className="setup-off">
            <p className="setup-body setup-problem">
              <ProblemMark />
              <span>{STOPPED}</span>
            </p>
            <AgainKey asking={asking} words="Try again" onPress={onTurnOn} />
          </div>
        ) : state === 'off' ? (
          <div className="setup-off">
            <CameraDrawing />
            <p className="setup-body">{OFF}</p>
            <AgainKey asking={asking} words="Turn on the camera" onPress={onTurnOn} />
          </div>
        ) : null}
      </div>
      <p className="setup-body setup-test-line">{TEST_LINE}</p>
      <span className="sr-only" role="status" aria-live="polite">
        {frameSaid}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {barSaid}
      </span>
    </div>
  );
}

export default PlaceCheck;
