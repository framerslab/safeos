/**
 * Camera Feed Component
 *
 * Displays camera feed with motion/audio detection.
 *
 * @module components/CameraFeed
 */

'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { detectMotion, detectMotionInZones, getThresholdForScenario } from '../lib/motion-detection';
import { getAudioLevel, detectCryingPattern, resetCryDetection, AUDIO_THRESHOLDS } from '../lib/audio-levels';
import { PixelDetectionEngine, type PixelDetectionResult } from '../lib/pixel-detection';
import type { DetectionZone as SettingsDetectionZone } from '../stores/settings-store';

// =============================================================================
// Types
// =============================================================================

interface PixelDetectionConfig {
  enabled: boolean;
  /** 0-100, higher = more sensitive */
  sensitivity: number;
  /** Absolute number of pixels (1-1000) to trigger */
  absolutePixelThreshold: number;
  /** If true, use absolute count instead of percentage */
  useAbsoluteThreshold: boolean;
  /** Skip expensive operations for minimal latency */
  instantLocalMode?: boolean;
  /** Downsample for performance (1 = full, 2 = half, etc.) */
  downsampleFactor?: number;
}

interface CameraFeedProps {
  onFrame?: (data: FrameData) => void;
  onMotion?: (score: number) => void;
  onMotionZones?: (zones: Array<{ id: string; name: string; score: number }>) => void;
  onAudio?: (level: number) => void;
  onPixel?: (result: PixelDetectionResult) => void;
  onVideoReady?: (video: HTMLVideoElement | null) => void;
  onError?: (error: Error) => void;
  scenario?: 'pet' | 'baby' | 'elderly' | 'security';
  enabled?: boolean;
  deviceId?: string;
  audioEnabled?: boolean;
  showDebug?: boolean;
  className?: string;
  showZonesOverlay?: boolean;
  /** Optional global detection zones (used for motion/pixel). */
  detectionZones?: SettingsDetectionZone[];
  /** Override capture gating thresholds (0-100). */
  frameCaptureThresholds?: { motion?: number; audio?: number };
  /** Override how often onFrame fires (ms). */
  frameIntervalMs?: number;
  pixelDetection?: PixelDetectionConfig;
}

export interface FrameData {
  imageData: string;
  motionScore: number;
  audioLevel: number;
  timestamp: number;
  hasCrying?: boolean;
  pixelChangePercent?: number;
  pixelChangedPixelCount?: number;
  pixelTriggeredBy?: PixelDetectionResult['triggeredBy'];
}

// =============================================================================
// Constants
// =============================================================================

const FRAME_INTERVAL = 1000; // Check every second
const MOTION_INTERVAL = 200; // Motion detection every 200ms
const AUDIO_INTERVAL = 100; // Audio level every 100ms

// =============================================================================
// CameraFeed Component
// =============================================================================

export function CameraFeed({
  onFrame,
  onMotion,
  onMotionZones,
  onAudio,
  onPixel,
  onVideoReady,
  onError,
  scenario = 'baby',
  enabled = true,
  deviceId = '',
  audioEnabled = true,
  showDebug = false,
  className,
  showZonesOverlay = false,
  detectionZones,
  frameCaptureThresholds,
  frameIntervalMs,
  pixelDetection,
}: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousFrameRef = useRef<ImageData | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef(0);
  const removeTrackListenersRef = useRef<(() => void) | null>(null);
  const enabledRef = useRef(enabled);
  const videoPausedRef = useRef(false);
  const videoReadyRef = useRef(false);
  const pixelEngineRef = useRef<PixelDetectionEngine | null>(null);
  const lastPixelResultRef = useRef<PixelDetectionResult | null>(null);

  // Refs for callbacks to avoid recreating intervals
  const onErrorRef = useRef(onError);
  const onMotionRef = useRef(onMotion);
  const onMotionZonesRef = useRef(onMotionZones);
  const onAudioRef = useRef(onAudio);
  const onFrameRef = useRef(onFrame);
  const onPixelRef = useRef(onPixel);
  const onVideoReadyRef = useRef(onVideoReady);
  const detectionZonesRef = useRef(detectionZones);
  const frameCaptureThresholdsRef = useRef(frameCaptureThresholds);

  // Keep refs up to date
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onMotionRef.current = onMotion; }, [onMotion]);
  useEffect(() => { onMotionZonesRef.current = onMotionZones; }, [onMotionZones]);
  useEffect(() => { onAudioRef.current = onAudio; }, [onAudio]);
  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);
  useEffect(() => { onPixelRef.current = onPixel; }, [onPixel]);
  useEffect(() => { onVideoReadyRef.current = onVideoReady; }, [onVideoReady]);
  useEffect(() => { detectionZonesRef.current = detectionZones; }, [detectionZones]);
  useEffect(() => { frameCaptureThresholdsRef.current = frameCaptureThresholds; }, [frameCaptureThresholds]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [motionScore, setMotionScore] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [hasCrying, setHasCrying] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [microphoneUnavailable, setMicrophoneUnavailable] = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);
  const [pixelChangePercent, setPixelChangePercent] = useState(0);
  const [pixelChangedPixels, setPixelChangedPixels] = useState(0);
  const motionScoreRef = useRef(0);
  const audioLevelRef = useRef(0);
  const hasCryingRef = useRef(false);

  // Motion threshold for this scenario
  const motionThreshold = getThresholdForScenario(scenario);
  const audioThreshold = AUDIO_THRESHOLDS[scenario]?.ambient || 15;

  // Pixel detection config (stable deps)
  const pixelEnabled = pixelDetection?.enabled ?? false;
  const pixelSensitivity = pixelDetection?.sensitivity ?? 50;
  const pixelAbsoluteThreshold = pixelDetection?.absolutePixelThreshold ?? 100;
  const pixelUseAbsoluteThreshold = pixelDetection?.useAbsoluteThreshold ?? false;
  const pixelInstantLocalMode = pixelDetection?.instantLocalMode ?? false;
  const pixelDownsampleFactor = pixelDetection?.downsampleFactor ?? 1;

  // Initialize/reset pixel engine when config changes
  useEffect(() => {
    if (!pixelEnabled) {
      pixelEngineRef.current = null;
      lastPixelResultRef.current = null;
      return;
    }

    pixelEngineRef.current = new PixelDetectionEngine({
      threshold: pixelSensitivity,
      absolutePixelThreshold: pixelAbsoluteThreshold,
      useAbsoluteThreshold: pixelUseAbsoluteThreshold,
      instantLocalMode: pixelInstantLocalMode,
      downsampleFactor: pixelDownsampleFactor,
    });
    pixelEngineRef.current.reset();
    lastPixelResultRef.current = null;
  }, [
    pixelEnabled,
    pixelSensitivity,
    pixelAbsoluteThreshold,
    pixelUseAbsoluteThreshold,
    pixelInstantLocalMode,
    pixelDownsampleFactor,
  ]);

  // Keep pixel engine zones in sync with global detection zones (optional)
  useEffect(() => {
    if (!pixelEnabled || !pixelEngineRef.current) return;

    const zones = (detectionZones || []).filter((z) => z.enabled);
    const fullEnabled = zones.some((z) => z.x === 0 && z.y === 0 && z.width === 100 && z.height === 100);

    pixelEngineRef.current.setOptions({
      zones: fullEnabled
        ? undefined
        : zones.map((z) => ({ id: z.id, x: z.x, y: z.y, width: z.width, height: z.height })),
    });
  }, [pixelEnabled, detectionZones]);

  // Invalidating a request also covers permission prompts and pending video.play().
  const stopCamera = useCallback(() => {
    requestRef.current++;
    removeTrackListenersRef.current?.();
    removeTrackListenersRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    previousFrameRef.current = null;
    lastPixelResultRef.current = null;
    pixelEngineRef.current?.reset();
    motionScoreRef.current = 0;
    audioLevelRef.current = 0;
    hasCryingRef.current = false;
    setMotionScore(0);
    setAudioLevel(0);
    setHasCrying(false);
    resetCryDetection();
    videoPausedRef.current = false;
    videoReadyRef.current = false;
    onVideoReadyRef.current?.(null);
    setCameraActive(false);
    setMicrophoneUnavailable(false);
    setVideoPaused(false);
    setIsLoading(false);
  }, []);

  const initCamera = useCallback(async () => {
    if (!enabledRef.current) return;
    stopCamera();
    const request = ++requestRef.current;
    const isCurrent = () => requestRef.current === request && enabledRef.current;
    let acquired: MediaStream | null = null;
    try {
      setIsLoading(true);
      setError(null);
      const constraints = (audio: boolean): MediaStreamConstraints => ({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }),
        },
        audio,
      });
      try {
        acquired = await navigator.mediaDevices.getUserMedia(constraints(audioEnabled));
      } catch (err) {
        // A camera without a microphone still monitors video; a missing camera fails again below.
        if (!audioEnabled || !isCurrent() || !(err instanceof Error) || err.name !== 'NotFoundError') throw err;
        acquired = await navigator.mediaDevices.getUserMedia(constraints(false));
      }
      if (!isCurrent()) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = acquired;
      const tracks = acquired.getVideoTracks();
      const audioTracks = acquired.getAudioTracks();
      const lost = () => {
        if (!isCurrent()) return;
        stopCamera();
        const error = new Error('Camera connection lost. Check the device and start monitoring again.');
        setError(error.message);
        onErrorRef.current?.(error);
      };
      // A muted track is a temporary interruption: not live while it lasts, live again on unmute.
      const paused = () => {
        if (!isCurrent() || videoPausedRef.current) return;
        videoPausedRef.current = true;
        previousFrameRef.current = null;
        setVideoPaused(true);
        if (videoReadyRef.current) onVideoReadyRef.current?.(null);
      };
      const resumed = () => {
        if (!isCurrent() || !videoPausedRef.current || tracks.some(track => track.muted)) return;
        videoPausedRef.current = false;
        previousFrameRef.current = null;
        setVideoPaused(false);
        if (videoReadyRef.current && videoRef.current) onVideoReadyRef.current?.(videoRef.current);
      };
      for (const track of tracks) {
        track.addEventListener('ended', lost);
        track.addEventListener('mute', paused);
        track.addEventListener('unmute', resumed);
      }
      const audioLost = () => {
        if (!isCurrent()) return;
        analyserRef.current = null;
        if (audioContextRef.current) {
          void audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        audioLevelRef.current = 0;
        hasCryingRef.current = false;
        setAudioLevel(0);
        setHasCrying(false);
        resetCryDetection();
        onAudioRef.current?.(0);
        setMicrophoneUnavailable(true);
      };
      for (const track of audioTracks) {
        track.addEventListener('ended', audioLost);
        track.addEventListener('mute', audioLost);
      }
      removeTrackListenersRef.current = () => {
        for (const track of audioTracks) {
          track.removeEventListener('ended', audioLost);
          track.removeEventListener('mute', audioLost);
        }
        for (const track of tracks) {
          track.removeEventListener('ended', lost);
          track.removeEventListener('mute', paused);
          track.removeEventListener('unmute', resumed);
        }
      };
      if (!tracks.length || tracks.some(track => track.readyState === 'ended')) {
        lost();
        return;
      }
      if (tracks.some(track => track.muted)) paused();
      const video = videoRef.current;
      if (!video) throw new Error('Camera preview is unavailable');
      video.srcObject = acquired;
      await video.play();
      if (!isCurrent()) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      const audioAvailable = audioTracks.some(track => track.readyState === 'live' && !track.muted);
      if (audioEnabled && audioAvailable) {
        audioContextRef.current = new AudioContext();
        const source = audioContextRef.current.createMediaStreamSource(acquired);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        source.connect(analyserRef.current);
      } else if (audioEnabled) {
        audioLost();
      }
      setCameraActive(true);
      setIsLoading(false);
      videoReadyRef.current = true;
      if (!videoPausedRef.current) onVideoReadyRef.current?.(video);
    } catch (err) {
      if (!isCurrent()) return;
      stopCamera();
      const message = (err instanceof Error && err.message.trim()) ||
        (err instanceof Error && err.name === 'OverconstrainedError'
          ? 'The selected camera is unavailable. Choose another camera.'
          : 'Failed to access camera. Check the device and browser permissions.');
      const error = new Error(message);
      setError(error.message);
      onErrorRef.current?.(error);
    }
  }, [audioEnabled, deviceId, stopCamera]);

  useEffect(() => {
    // Updated here rather than during render, so only committed props guard capture.
    enabledRef.current = enabled;
    if (enabled) void initCamera();
    else setIsLoading(false);
    return stopCamera;
  }, [enabled, initCamera, stopCamera]);

  // Motion detection loop
  useEffect(() => {
    if (!cameraActive || !canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const interval = setInterval(() => {
      if (!videoRef.current || videoPausedRef.current) return;

      // Draw current frame
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      ctx.drawImage(videoRef.current, 0, 0);

      // Get current frame data
      const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Pixel detection (optional)
      if (pixelEnabled && pixelEngineRef.current) {
        const result = pixelEngineRef.current.analyzeImageData(currentFrame);
        lastPixelResultRef.current = result;
        setPixelChangePercent(result.difference);
        setPixelChangedPixels(result.changedPixelCount);
        onPixelRef.current?.(result);
      }

      // Compare with previous frame
      if (previousFrameRef.current) {
        const zones = (detectionZonesRef.current || []).filter((z) => z.enabled);
        const fullZone = zones.find((z) => z.x === 0 && z.y === 0 && z.width === 100 && z.height === 100);

        let motionPercent = 0;
        let zoneScores: Array<{ id: string; name: string; score: number }> = [];

        if (!fullZone && zones.length > 0) {
          const results = detectMotionInZones(
            previousFrameRef.current,
            currentFrame,
            zones.map((z) => ({ id: z.id, name: z.name, x: z.x, y: z.y, width: z.width, height: z.height }))
          );
          zoneScores = results.map((r) => ({
            id: r.zone.id || 'zone',
            name: r.zone.name || 'Zone',
            score: Math.round(r.score * 100),
          }));
          motionPercent = zoneScores.reduce((max, z) => Math.max(max, z.score), 0);
        } else {
          const score = detectMotion(previousFrameRef.current, currentFrame);
          motionPercent = Math.round(score * 100);
          if (fullZone) {
            zoneScores = [{ id: fullZone.id, name: fullZone.name, score: motionPercent }];
          } else if (zones.length === 0) {
            zoneScores = [{ id: 'full', name: 'Full Screen', score: motionPercent }];
          }
        }

        setMotionScore(motionPercent);
        motionScoreRef.current = motionPercent;
        onMotionRef.current?.(motionPercent);
        onMotionZonesRef.current?.(zoneScores);
      }

      // Store current frame for next comparison
      previousFrameRef.current = currentFrame;
    }, MOTION_INTERVAL);

    return () => clearInterval(interval);
  }, [cameraActive, pixelEnabled]);

  // Audio analysis loop
  useEffect(() => {
    if (!cameraActive || !audioEnabled || !analyserRef.current) return;

    const interval = setInterval(() => {
      if (!analyserRef.current) return;

      const level = getAudioLevel(analyserRef.current);
      const audioPercent = Math.round(level * 100);
      setAudioLevel(audioPercent);
      audioLevelRef.current = audioPercent;
      onAudioRef.current?.(audioPercent);

      // Detect crying for baby monitoring
      if (scenario === 'baby' && analyserRef.current) {
        const crying = detectCryingPattern(analyserRef.current);
        setHasCrying(crying);
        hasCryingRef.current = crying;
      }
    }, AUDIO_INTERVAL);

    return () => clearInterval(interval);
  }, [cameraActive, scenario, audioEnabled]);

  // Reset cry detection when leaving baby scenario
  useEffect(() => {
    if (scenario !== 'baby') {
      setHasCrying(false);
      hasCryingRef.current = false;
    }
  }, [scenario]);

  // Frame capture for analysis
  useEffect(() => {
    if (!cameraActive || !canvasRef.current) return;

    const intervalMs = Math.max(250, frameIntervalMs ?? FRAME_INTERVAL);
    const interval = setInterval(() => {
      if (videoPausedRef.current) return;
      const pixelTriggered = lastPixelResultRef.current?.changed ?? false;
      const motion = motionScoreRef.current;
      const audio = audioLevelRef.current;
      const crying = hasCryingRef.current;
      const gate = frameCaptureThresholdsRef.current;
      const motionGateThreshold = gate?.motion ?? motionThreshold;
      const audioGateThreshold = gate?.audio ?? audioThreshold;

      // Only send frames when there's significant activity
      if (motion < motionGateThreshold && audio < audioGateThreshold && !pixelTriggered) {
        return;
      }

      // Capture and send frame
      if (canvasRef.current && onFrameRef.current) {
        const imageData = canvasRef.current.toDataURL('image/jpeg', 0.7);
        onFrameRef.current({
          imageData,
          motionScore: motion,
          audioLevel: audio,
          timestamp: Date.now(),
          hasCrying: crying,
          pixelChangePercent: lastPixelResultRef.current?.difference,
          pixelChangedPixelCount: lastPixelResultRef.current?.changedPixelCount,
          pixelTriggeredBy: lastPixelResultRef.current?.triggeredBy,
        });
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [cameraActive, motionThreshold, audioThreshold, frameIntervalMs]);

  return (
    <div className={`relative w-full aspect-video bg-slate-900 rounded-xl overflow-hidden ${className || ''}`}>
      {/* Video feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />

      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Detection zones overlay (read-only) */}
      {showZonesOverlay && (detectionZones || []).some((z) => z.enabled && !(z.x === 0 && z.y === 0 && z.width === 100 && z.height === 100)) && (
        <div className="absolute inset-0 pointer-events-none">
          {(detectionZones || [])
            .filter((z) => z.enabled && !(z.x === 0 && z.y === 0 && z.width === 100 && z.height === 100))
            .map((z) => (
              <div
                key={z.id}
                className="absolute border border-emerald-400/60 bg-emerald-400/10"
                style={{
                  left: `${z.x}%`,
                  top: `${z.y}%`,
                  width: `${z.width}%`,
                  height: `${z.height}%`,
                }}
              >
                <div className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-900/70 text-emerald-200 border border-emerald-500/20">
                  {z.name}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Loading overlay */}
      {enabled && isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-slate-600 border-t-emerald-500 rounded-full animate-spin mx-auto" />
            <p className="text-slate-400 mt-4 text-sm">Initializing camera...</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
          <div className="text-center px-4">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
              <span className="text-2xl">📷</span>
            </div>
            <p className="text-red-400 mt-4 text-sm font-medium">Camera Error</p>
            <p className="text-slate-500 mt-1 text-xs max-w-xs">{error}</p>
            {enabled && <button
              onClick={initCamera}
              className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
            >
              Retry
            </button>}
          </div>
        </div>
      )}

      {cameraActive && videoPaused && !error && (
        <p role="status" className="absolute top-4 left-4 right-4 rounded-lg bg-slate-900/90 p-3 text-sm text-amber-300">
          Camera paused: the device is not sending video. Monitoring resumes when video returns.
        </p>
      )}

      {cameraActive && microphoneUnavailable && (
        <p role="status" className="absolute bottom-4 left-4 right-4 rounded-lg bg-slate-900/90 p-3 text-sm text-amber-300">
          Microphone unavailable. Video monitoring continues.
        </p>
      )}

      {/* Status indicators */}
      {cameraActive && !videoPaused && !error && (
        <>
          {/* Recording indicator */}
          <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 rounded-full backdrop-blur-sm">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-white">LIVE</span>
          </div>

          {/* Motion indicator */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <MotionIndicator score={motionScore} threshold={motionThreshold} />
            <AudioIndicator level={audioLevel} threshold={audioThreshold} hasCrying={hasCrying} />
          </div>

          {/* Debug overlay */}
          {showDebug && (
            <div className="absolute bottom-4 left-4 right-4 p-3 bg-slate-900/80 rounded-lg backdrop-blur-sm">
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-500">Motion:</span>
                  <span className="text-white ml-2">{motionScore}%</span>
                </div>
                <div>
                  <span className="text-slate-500">Audio:</span>
                  <span className="text-white ml-2">{audioLevel}%</span>
                </div>
                <div>
                  <span className="text-slate-500">Threshold:</span>
                  <span className="text-white ml-2">{motionThreshold}%</span>
                </div>
                {scenario === 'baby' && (
                  <div className="col-span-3">
                    <span className="text-slate-500">Cry Detection:</span>
                    <span className={`ml-2 ${hasCrying ? 'text-red-400' : 'text-slate-300'}`}>
                      {hasCrying ? 'DETECTED' : 'None'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface MotionIndicatorProps {
  score: number;
  threshold: number;
}

function MotionIndicator({ score, threshold }: MotionIndicatorProps) {
  const isActive = score >= threshold;
  const color = isActive
    ? 'bg-orange-500/80'
    : score > threshold / 2
      ? 'bg-yellow-500/80'
      : 'bg-slate-700/80';

  return (
    <div
      className={`px-3 py-1.5 ${color} rounded-full backdrop-blur-sm flex items-center gap-2`}
      role="status"
      aria-label={`Motion level ${Math.round(score)}%${isActive ? ', motion detected' : ''}`}
    >
      <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <div className="w-16 h-1.5 bg-slate-600 rounded-full overflow-hidden">
        <div
          className={`h-full ${isActive ? 'bg-orange-400' : 'bg-emerald-400'} transition-all duration-200`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
    </div>
  );
}

interface AudioIndicatorProps {
  level: number;
  threshold: number;
  hasCrying: boolean;
}

function AudioIndicator({ level, threshold, hasCrying }: AudioIndicatorProps) {
  const isActive = level >= threshold || hasCrying;
  const color = hasCrying
    ? 'bg-red-500/80 animate-pulse'
    : isActive
      ? 'bg-orange-500/80'
      : 'bg-slate-700/80';

  return (
    <div
      className={`px-3 py-1.5 ${color} rounded-full backdrop-blur-sm flex items-center gap-2`}
      role="status"
      aria-label={hasCrying ? 'Crying detected!' : `Audio level ${Math.round(level)}%${isActive ? ', audio detected' : ''}`}
    >
      {hasCrying ? (
        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 15h8" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
          <path d="M8 9v2" />
          <path d="M16 9v2" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      )}
      <div className="w-12 h-1.5 bg-slate-600 rounded-full overflow-hidden">
        <div
          className={`h-full ${hasCrying ? 'bg-red-400' : isActive ? 'bg-orange-400' : 'bg-emerald-400'} transition-all duration-100`}
          style={{ width: `${Math.min(level, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default CameraFeed;
