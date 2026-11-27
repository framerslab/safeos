/**
 * Setup's camera request on the page
 *
 * A press asks the browser once and waits for its answer; a second press
 * while it waits asks nothing more. A yes keeps the stream open for step 2.
 * A request is the newest while the hook's counter holds the number it took
 * and the page has not left: drop, close and leaving the page each raise the
 * counter, so an answer that arrives after the page let go of its request
 * closes what it opened, shows no failure and moves nothing. A refusal is
 * named by the camera's permission read after it. A camera blocked before
 * any press is named at once, and once the site's setting allows it the
 * request is made by itself. A failure the person went on from is forgotten.
 *
 * @module lib/use-camera-request
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cameraAskNow, useCameraAsk, type Ask } from './browser-asks';
import { closeCamera } from './camera-handoff';
import { askForCamera, cameraFailure, canAskForCamera, type CameraFailure } from './setup-camera';

export type Asking = 'turn-on' | 'try-again' | 'default';

export interface CameraRequest {
  ask: Ask;
  stream: MediaStream | null;
  microphone: boolean;
  asking: Asking | null;
  failure: CameraFailure | null;
  /** Asks for the camera `deviceId` names ('' the default); 'default' always asks for the default camera. */
  request: (which: Asking) => Promise<'allowed' | 'failed' | 'dropped'>;
  drop: () => void;
  close: () => void;
  /**
   * Step 1 shown again: names a camera that reads blocked, or a browser with no
   * camera request, as on opening, and watches again for the site's setting to
   * allow the camera. Asks nothing, opens nothing, leaves the counter as it is.
   */
  readAgain: () => void;
}

/** `deviceId` is the camera to ask for, read at each request. */
export function useCameraRequest(deviceId: string): CameraRequest {
  const ask = useCameraAsk();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [microphone, setMicrophone] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [failure, setFailure] = useState<CameraFailure | null>(null);

  const device = useRef(deviceId);
  device.current = deviceId;
  const counter = useRef(0);
  const waiting = useRef(false);
  const live = useRef(true);
  const open = useRef<MediaStream | null>(null);
  const askRef = useRef(ask);
  askRef.current = ask;
  // A request made, or a failure gone on from, in this page's life.
  const requested = useRef(false);

  const request = useCallback(async (which: Asking): Promise<'allowed' | 'failed' | 'dropped'> => {
    if (waiting.current) return 'dropped';
    const camera = which === 'default' ? '' : device.current;
    if (!canAskForCamera()) {
      requested.current = true;
      setFailure('unsupported');
      return 'failed';
    }
    requested.current = true;
    counter.current += 1;
    const mine = counter.current;
    const newest = (taken: number) => counter.current === taken && live.current;
    waiting.current = true;
    setAsking(which);
    try {
      const answer = await askForCamera(camera, () => newest(mine));
      if (!answer) return 'dropped';
      if (!newest(mine)) {
        closeCamera(answer.stream);
        return 'dropped';
      }
      open.current = answer.stream;
      setStream(answer.stream);
      setMicrophone(answer.microphone);
      setFailure(null);
      setAsking(null);
      waiting.current = false;
      return 'allowed';
    } catch (error) {
      if (!newest(mine)) return 'dropped';
      const now = await cameraAskNow();
      if (!newest(mine)) return 'dropped';
      setFailure(cameraFailure(error, now, camera !== ''));
      setAsking(null);
      waiting.current = false;
      return 'failed';
    }
  }, []);

  const drop = useCallback(() => {
    counter.current += 1;
    waiting.current = false;
    requested.current = true;
    setAsking(null);
    setFailure(null);
  }, []);

  const close = useCallback(() => {
    counter.current += 1;
    waiting.current = false;
    requested.current = true;
    setAsking(null);
    setFailure(null);
    closeCamera(open.current);
    open.current = null;
    setStream(null);
    setMicrophone(false);
  }, []);

  const readAgain = useCallback(() => {
    requested.current = false;
    if (!canAskForCamera()) setFailure('unsupported');
    else if (askRef.current === 'blocked') setFailure('blocked');
    else setFailure(null);
  }, []);

  // A browser with no camera request is named as soon as the step opens.
  useEffect(() => {
    if (!canAskForCamera()) setFailure('unsupported');
  }, []);

  // A camera blocked before any press is named at once.
  useEffect(() => {
    if (!requested.current && !waiting.current && ask === 'blocked') setFailure((now) => now ?? 'blocked');
  }, [ask]);

  // Once the site's setting allows a blocked camera, the step moves on by itself.
  useEffect(() => {
    if (failure === 'blocked' && ask === 'granted' && !waiting.current) void request('try-again');
  }, [ask, failure, request]);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      counter.current += 1;
      waiting.current = false;
      closeCamera(open.current);
      open.current = null;
    };
  }, []);

  return { ask, stream, microphone, asking, failure, request, drop, close, readAgain };
}
