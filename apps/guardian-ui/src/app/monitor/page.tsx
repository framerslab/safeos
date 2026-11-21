'use client';

/**
 * Monitor Page
 *
 * Live monitoring interface with Lost & Found detection.
 *
 * @module app/monitor/page
 */

import { newAlertId } from '@/lib/alert-id';
import { newDetectorEvent, endDetectorEvent, freshCardFor, keepsNotificationUp, readDetector, type AlertSeverity, type DetectorEvent } from '@/lib/alert-event';
import React, { useEffect, useCallback, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CameraPicker } from '../../components/CameraPicker';
import { useCameraStore } from '../../stores/camera-store';
import { CameraFeed, type CheckFrames } from '../../components/CameraFeed';
import { AlertPanel } from '../../components/AlertPanel';
import { SubjectPreviewOverlay, SubjectPreview } from '../../components/SubjectPreview';
import { LostFoundMediaOverlay } from '../../components/LostFoundMediaOverlay';
import { QuickSettingsPanel } from '../../components/QuickSettingsPanel';
import { InlineSettingsPanel } from '../../components/monitor';
import { WatchForChooser, WatchForPet, useWatchFor, useWideWatch, NO_PET_FRAME_LINE } from '../../components/monitor/WatchFor';
import { IconSearch, IconChevronDown, IconShield } from '../../components/icons';
import { useMonitoringStore } from '../../stores/monitoring-store';
import { useOnboardingStore } from '../../stores/onboarding-store';
import { useSettingsStore, DEFAULT_PRESETS, type PresetId, isSleepPreset } from '../../stores/settings-store';
import { useWatchSettings } from '../../stores/watch-settings';
import { useLostFoundStore, getMatcherSettings } from '../../stores/lost-found-store';
import { getSubjectMatcher, type MatchResult } from '../../lib/subject-matcher';
import { saveUpgradedSubjectFingerprint, updateSubjectMatchCount } from '../../lib/client-db';
import { generateFingerprint, isCurrentFingerprint, upgradeFingerprint } from '../../lib/visual-fingerprint';
import { useWebSocket, type WSMessage } from '../../lib/websocket';
import { getSoundManager } from '../../lib/sound-manager';
import { keepNap, napTimeIsUp, readKeptNap, takeNapHandoff, type Nap } from '../../lib/nap-session';
import type { PixelDetectionResult } from '../../lib/pixel-detection';
import { detectRegionalMotion } from '../../lib/motion-detection';
import { LIVE_BOX_MS, NOTIFICATION_WAIT_MS, alertBox, boxFromCells, boxFromHotspots, boxFromRegion, type AlertKind, type Box, type PercentZone } from '../../lib/alert-pictures/rules';
import { OPEN_IN_HISTORY, notificationBody, notificationTitle, plateLine, sightingNotificationBody, sightingPlate, sightingQuestion } from '../../lib/alert-pictures/words';
import { useAlertPicturesStore } from '../../stores/alert-pictures-store';
import type { LiveAlertBox } from '../../components/alert-pictures/LiveBox';
import { capturePictureSet, newPictureId, notificationCopy, showsNotificationPictures, type PictureSet } from '../../lib/alert-pictures/capture';
import { holdPicture, startPictureWatch, stopPictureWatch } from '../../lib/alert-pictures/keeper';
import { useNoticeGate } from '../../components/alert-pictures/PicturesNotice';
import { getNotificationManager } from '../../lib/notification-manager';
import { useBackendStatus } from '@/contexts/BackendStatusContext';

// =============================================================================
// Constants
// =============================================================================

/** The kind of picture each detector's alert keeps. */
/** What raises an alert on the watch: its three detectors, and Lost and Found's comparison. */
type AlertSource = 'motion' | 'audio' | 'pixel' | 'sighting';

const KIND_OF_SOURCE: Record<AlertSource, AlertKind> = {
  motion: 'motion',
  audio: 'sound',
  pixel: 'picture-change',
  sighting: 'sighting',
};

/** A sighting's run ends after this long with no check at or over the alert line. */
const SIGHTING_RUN_ENDS_MS = 30_000;

/** True for a zone that covers the whole frame, which names no part of it. */
const isWholeFrame = (zone: { x: number; y: number; width: number; height: number }) =>
  zone.x === 0 && zone.y === 0 && zone.width === 100 && zone.height === 100;

// =============================================================================
// Helper Functions
// =============================================================================


// =============================================================================
// Component
// =============================================================================

export default function MonitorPage() {
  useEffect(() => {
    void useMonitoringStore.getState().hydrateAlerts();
  }, []);

  const {
    isConnected,
    isStreaming,
    streamId,
    scenario,
    motionScore,
    audioLevel,
    setConnected,
    setStreaming,
    setStreamId,
    setMotionScore,
    setAudioLevel,
    addAlert,
  } = useMonitoringStore();

  const { config: backendConfig } = useBackendStatus();
  const deviceId = useCameraStore(state => state.deviceId);

  const { selectedScenario } = useOnboardingStore();

  const {
    activeSubject,
    isWatching: isLostFoundWatching,
    settings: lostFoundSettings,
    updateCurrentConfidence,
    updateConsecutiveMatches,
    addRecentMatch,
    recordAlert: recordLostFoundAlert,
    updateSubject,
  } = useLostFoundStore();

  const [captureRequested, setCaptureRequested] = useState(false);
  // True once this capture request has shown video; a later pause keeps it true.
  const [videoSeen, setVideoSeen] = useState(false);
  const captureRequestedRef = useRef(false);
  const serverRequestedRef = useRef(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  // Watch for: Motion and sound, or Lost and Found with the pet it compares
  // with. It compares while the watch runs; from 1024 px the pet's card
  // heads the right column.
  const watchFor = useWatchFor(captureRequested);
  const petsMarker = watchFor.petsMarker;
  const wide = useWideWatch();
  const petCard = wide && watchFor.way === 'lost_found';

  // Media overlay state for Lost & Found alerts
  const [showMediaOverlay, setShowMediaOverlay] = useState(false);
  const [mediaOverlayData, setMediaOverlayData] = useState<{
    subjectName: string;
    confidence: number;
    images: string[];
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const matcherRef = useRef(getSubjectMatcher());
  const modeDropdownRef = useRef<HTMLDivElement | null>(null);

  // Settings store for security modes/presets
  const { activePresetId, setActivePreset, activeSleepPreset, globalSettings, globalMute, toggleGlobalMute, timingSettings, getCooldownForSeverity } = useSettingsStore();
  const detectionFeatureSettings = useSettingsStore((state) => state.detectionFeatureSettings);
  const detectionZones = useSettingsStore((state) => state.detectionZones);
  // The watch runs at the preset, with the Motion and Audio set for this use on Settings > Detection laid over it.
  const { watchSettings: currentPreset, keptForUse, tuneWatch, resetWatch } = useWatchSettings();
  const keptNames = keptForUse.map((field) => (field === 'motionSensitivity' ? 'Motion' : 'Audio')).join(' and ');
  const [showOverrides, setShowOverrides] = useState(false);

  // URL parameter handling is done via PresetInitializer component below

  // Close mode dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(event.target as Node)) {
        setShowModeDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ---------------------------------------------------------------------------
  // Lost & Found Integration
  // ---------------------------------------------------------------------------

  // A subject saved by an earlier version is rebuilt once from its saved
  // photos, so its edges are read on the scale the camera's regions are read
  // on and each photo counts once. Until then, or when it has no photos or
  // they cannot be read, the matcher reads its edges on that version's scale.
  useEffect(() => {
    if (!activeSubject || isCurrentFingerprint(activeSubject.fingerprint) || activeSubject.referenceImages.length === 0) {
      return;
    }
    let cancelled = false;
    const subject = activeSubject;
    void upgradeFingerprint(subject.fingerprint, subject.referenceImages, (photo) =>
      generateFingerprint(photo, subject.name)
    ).then(async (fingerprint) => {
      if (cancelled || !isCurrentFingerprint(fingerprint)) return;
      updateSubject(subject.id, { fingerprint });
      await saveUpgradedSubjectFingerprint(
        {
          id: subject.id,
          name: subject.name,
          type: subject.type,
          description: subject.description,
          fingerprint: subject.fingerprint,
          referenceImages: subject.referenceImages,
          createdAt: subject.createdAt,
          lastActiveAt: subject.lastActiveAt,
          matchCount: subject.matchCount,
        },
        fingerprint
      );
    });
    return () => {
      cancelled = true;
    };
  }, [activeSubject, updateSubject]);

  // Update matcher when settings change
  useEffect(() => {
    if (activeSubject && isLostFoundWatching) {
      const matcher = matcherRef.current;
      matcher.setFingerprint(activeSubject.fingerprint);
      matcher.setSettings(getMatcherSettings(lostFoundSettings));
      matcher.setActive(true);
    } else {
      matcherRef.current.setActive(false);
    }
  }, [activeSubject, isLostFoundWatching, lostFoundSettings]);

  // The person's own sounds for Lost Item Found that the last match started.
  // `round` moves on when they are let go, so a start on its way when
  // the watch stops starts nothing. Each sound is held from its start. When
  // Lost & Found ends and monitoring goes on, letting go stops a sound unless
  // another alert's trigger plays it too; when the watch stops, it stops.
  // `shared` keeps each sound that was let go and plays on for another alert,
  // so the watch's stop reaches it after Lost & Found has ended.
  const ownLostFoundSoundRef = useRef<{ starting: boolean; ids: string[]; shared: Set<string>; round: number }>(
    { starting: false, ids: [], shared: new Set(), round: 0 }
  );
  const stopOwnLostFoundSounds = useCallback((watchStops = false) => {
    const own = ownLostFoundSoundRef.current;
    own.round += 1;
    if (watchStops) {
      own.ids.forEach((id) => getSoundManager().stop(id, 0));
      own.shared.forEach((id) => getSoundManager().stop(id, 0));
      own.shared.clear();
    } else {
      own.ids.forEach((id) => {
        const manager = getSoundManager();
        manager.release(id, 'object_found');
        if (manager.isActive(id)) own.shared.add(id);
      });
    }
    own.ids = [];
  }, []);

  // A sighting's run: a check at or over the alert line starts it, it alerts
  // again after the Cooldown Period while such checks go on, and it ends after
  // 30 seconds with none. One entry a run.
  const sightingEventRef = useRef<DetectorEvent>(newDetectorEvent());
  // Raises a sighting's alert; set further down, where the card, the picture, the live box and
  // the notification are made.
  const raiseSightingRef = useRef<((result: MatchResult, now: number, repeat: boolean) => void) | null>(null);

  // Process frames for Lost & Found matching
  const processLostFoundFrame = useCallback((video: HTMLVideoElement) => {
    if (!isLostFoundWatching || !activeSubject) return;

    const matcher = matcherRef.current;
    const result = matcher.processFrame(video);
    const now = Date.now();

    // A check at or over the alert line counts for the run; any other check counts against it.
    const outcome = readDetector(sightingEventRef.current, now, result && matcher.shouldAlert() ? 'medium' : null, {
      severitySeconds: 0,
      cooldownPeriodSeconds: timingSettings.cooldownPeriod,
      sustainedMs: 0,
      endSustainedMs: SIGHTING_RUN_ENDS_MS,
    });

    if (result) {
      // Update UI
      updateCurrentConfidence(result.confidence);
      updateConsecutiveMatches(matcher.getState().consecutiveMatches);
      addRecentMatch(result);

      // The run's alert: its entry, picture, sound and notification come here, never with every check.
      if (outcome.kind === 'alert') raiseSightingRef.current?.(result, now, outcome.repeat);
    } else {
      // Reset confidence when no match
      updateCurrentConfidence(0);
    }
  }, [
    isLostFoundWatching,
    activeSubject,
    timingSettings.cooldownPeriod,
    updateCurrentConfidence,
    updateConsecutiveMatches,
    addRecentMatch,
  ]);

  // A run ends with the comparison: when the Lost & Found watch stops or its pet changes.
  useEffect(() => {
    endDetectorEvent(sightingEventRef.current);
  }, [isLostFoundWatching, activeSubject?.id]);

  // The person's own Lost & Found sounds stop when the Lost & Found watch ends,
  // its pet changes or the page closes (and with the camera, in stopStream).
  useEffect(() => () => stopOwnLostFoundSounds(), [isLostFoundWatching, activeSubject?.id, stopOwnLostFoundSounds]);

  // Drive Lost & Found matching on a lightweight interval (avoids relying on websocket frames)
  useEffect(() => {
    if (!isLostFoundWatching || !activeSubject) return;

    const intervalMs = Math.max(250, Math.min(1500, lostFoundSettings.processingMode === 'local' ? 500 : 900));
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (video) {
        processLostFoundFrame(video);
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isLostFoundWatching, activeSubject, lostFoundSettings.processingMode, processLostFoundFrame]);

  // ---------------------------------------------------------------------------
  // WebSocket
  // ---------------------------------------------------------------------------

  const handleMessage = useCallback(
    (message: WSMessage) => {
      switch (message.type) {
        case 'stream-started':
          if (useSettingsStore.getState().globalSettings.processingMode === 'local' || !captureRequestedRef.current || !videoRef.current) break;
          setStreaming(true);
          setStreamId(message.payload?.streamId);
          break;
        case 'stream-stopped':
          // Server acknowledgements do not own the local camera request.
          setStreamId(captureRequestedRef.current ? `local-${Date.now()}` : null);
          break;
        case 'alert':
          addAlert({
            id: message.payload?.id || newAlertId('server'),
            streamId: message.payload?.streamId || '',
            alertType: message.payload?.alertType,
            thumbnailUrl: message.payload?.thumbnailUrl,
            severity: message.payload?.severity || 'medium',
            message: message.payload?.message || 'Alert detected',
            timestamp: message.payload?.timestamp || new Date().toISOString(),
            acknowledged: false,
          });
          break;
        case 'pong':
          // Heartbeat received
          break;
      }
    },
    [setStreaming, setStreamId, addAlert]
  );

  const { sendMessage, isConnected: wsConnected, connect: reconnect } = useWebSocket(
    backendConfig.wsUrl,
    {
      onMessage: handleMessage,
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
    }
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  // Every start of a watch goes through the notice about alert pictures: a device that has not
  // answered it gets it before the camera starts, and keeps no picture before it has.
  const { askBeforeStart, notice: picturesNotice } = useNoticeGate();

  const beginCapture = () => {
    captureRequestedRef.current = true;
    setCaptureRequested(true);
    setVideoSeen(false);
  };

  const startStream = (onBack?: () => void) => {
    // A click here turns the sound on in a browser that keeps it off until a tap.
    getSoundManager().unlockAudio();
    askBeforeStart(beginCapture, onBack);
  };

  const stopStream = () => {
    stopOwnLostFoundSounds(true);
    captureRequestedRef.current = false;
    setCaptureRequested(false);
    setVideoSeen(false);
    setStreaming(false);
    setStreamId(null);
    if (serverRequestedRef.current) sendMessage({ type: 'stop-stream' });
    serverRequestedRef.current = false;
  };

  // The nap Start Nap Mode handed to this watch, kept in this history entry:
  // it belongs to this watch, survives a reload and ends with it.
  const [nap, setNap] = useState<Nap | null>(null);

  // The sound of a movement alert. In a nap it is the alarm, as the nap page
  // says and its check plays, however small the movement: the Nap preset's
  // pixel check stops counting at its threshold, so its alerts all read as low.
  const napRef = useRef<Nap | null>(null);
  useEffect(() => { napRef.current = nap; }, [nap]);
  const playMovementSound = useCallback((severity: AlertSeverity) => {
    if (napRef.current) {
      // At the effective volume for the alert's level as it plays: the sound
      // manager's copy of the volume follows quiet hours only every 30 seconds.
      getSoundManager().playForSeverity('critical', {
        loop: false,
        volume: useSettingsStore.getState().getEffectiveVolume(severity),
        critical: severity === 'critical',
      });
      return;
    }
    getSoundManager().playForSeverity(severity, { loop: false });
  }, []);

  // Ending a nap: the Nap preset gives way, as I'm Awake did on the nap screen,
  // while it is the setting in use; a setting the person chose during the nap
  // stays.
  const endNap = () => {
    setNap(null);
    setNapWaitsForTap(false);
    keepNap(null);
    const settings = useSettingsStore.getState();
    if (settings.activePresetId === 'infant_sleep') settings.deactivateSleepMode();
  };

  // The person's Stop, which ends a nap with the watch. A camera failure stops
  // the watch without ending the nap: its reminder goes on, and End nap ends it.
  const stopWatching = () => {
    if (nap) endNap();
    stopStream();
  };

  // A watch opened from Nap Mode takes the one-use hand-off, keeps the nap in
  // this history entry and starts: the person's click on Start Nap Mode, in
  // this same page, has turned the sound on. A reload or Back finds the kept
  // nap and waits for a tap: a browser keeps a new page's sound off until one,
  // so the nap's alarm and reminder could not sound. Resume nap is that tap.
  // The ref keeps this mount's reading, so React's Strict Mode, which runs the
  // effect again after the unmount cleanup below has cleared
  // captureRequestedRef, requests the capture again.
  const [napWaitsForTap, setNapWaitsForTap] = useState(false);
  const napArrivalRef = useRef<{ nap: Nap; restored: boolean } | null | undefined>(undefined);
  useEffect(() => {
    if (napArrivalRef.current === undefined) {
      const minutes = takeNapHandoff();
      if (minutes === null) {
        const kept = readKeptNap();
        napArrivalRef.current = kept ? { nap: kept, restored: true } : null;
      } else {
        const fresh = { startedAt: Date.now(), minutes };
        keepNap(fresh);
        napArrivalRef.current = { nap: fresh, restored: false };
      }
    }
    const arrival = napArrivalRef.current;
    if (!arrival) return;
    setNap(arrival.nap);
    if (arrival.restored) {
      setNapWaitsForTap(true);
      return;
    }
    // On a device that has not answered the notice, it opens before the camera; Go back leaves
    // the nap waiting for Resume nap.
    askBeforeStart(beginCapture, () => setNapWaitsForTap(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the arrival is read once, on this mount
  }, []);
  useEffect(() => { if (captureRequested) setNapWaitsForTap(false); }, [captureRequested]);
  // At each start the picture store is tried and pictures past their age are deleted, then
  // every minute while the watch runs.
  useEffect(() => {
    if (!captureRequested) return;
    void startPictureWatch();
    return stopPictureWatch;
  }, [captureRequested]);
  const resumeNap = () => {
    setNapWaitsForTap(false);
    startStream(() => setNapWaitsForTap(true));
  };

  // Once the nap's planned minutes have passed, the warning plays every 30
  // seconds until the nap ends, as the nap screen did, whether or not the
  // camera is running, at the effective volume the watch's alerts use.
  useEffect(() => {
    if (!nap) return;
    const interval = window.setInterval(() => {
      if (!napTimeIsUp(nap, Date.now())) return;
      getSoundManager().play('warning', { volume: useSettingsStore.getState().getEffectiveVolume() });
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [nap]);

  const handleVideoReady = (video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (!video) {
      setStreaming(false);
      setStreamId(null);
      return;
    }
    if (!captureRequestedRef.current) return;
    setVideoSeen(true);
    setStreaming(true);
    setStreamId(`local-${Date.now()}`);
  };

  useEffect(() => {
    if (!isStreaming || !wsConnected || globalSettings.processingMode === 'local') return;
    serverRequestedRef.current = true;
    sendMessage({ type: 'start-stream', payload: { scenario: selectedScenario || scenario } });
    return () => {
      if (serverRequestedRef.current) sendMessage({ type: 'stop-stream' });
      serverRequestedRef.current = false;
    };
  }, [isStreaming, wsConnected, globalSettings.processingMode, selectedScenario, scenario, sendMessage]);

  useEffect(() => () => {
    captureRequestedRef.current = false;
    useMonitoringStore.getState().setStreaming(false);
    useMonitoringStore.getState().setStreamId(null);
  }, []);

  const handleFrame = (data: { imageData: string; motionScore: number; audioLevel: number }) => {
    if (!isStreaming || !captureRequestedRef.current || !serverRequestedRef.current || !wsConnected ||
      useSettingsStore.getState().globalSettings.processingMode === 'local') return;

    sendMessage({
      type: 'frame',
      payload: {
        frame: data.imageData,
        motionScore: data.motionScore,
        audioLevel: data.audioLevel,
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Local Alerting (Motion/Audio/Pixel) - sustained detection + per-severity cooldown
  // ---------------------------------------------------------------------------

  // Each detector's event: when its reading went over or under the line, the
  // time and severity of its last alert, and the card the event updates.
  const motionEventRef = useRef<DetectorEvent>(newDetectorEvent());
  const audioEventRef = useRef<DetectorEvent>(newDetectorEvent());
  const pixelEventRef = useRef<DetectorEvent>(newDetectorEvent());

  // An event ends when monitoring stops or starts, so a new session's first
  // reading starts a new event with its own sustained window and card.
  useEffect(() => {
    endDetectorEvent(motionEventRef.current);
    endDetectorEvent(audioEventRef.current);
    endDetectorEvent(pixelEventRef.current);
  }, [isStreaming]);

  // An event also ends when its detector is turned off or on. While pixel
  // detection is off the camera hands the page no pixel readings, so the
  // handler's own check never runs; the switch has to end the event.
  useEffect(() => {
    endDetectorEvent(motionEventRef.current);
  }, [currentPreset.motionDetectionEnabled]);
  useEffect(() => {
    endDetectorEvent(audioEventRef.current);
  }, [currentPreset.audioDetectionEnabled]);
  useEffect(() => {
    endDetectorEvent(pixelEventRef.current);
  }, [currentPreset.pixelDetectionEnabled]);

  const [pixelChangePercent, setPixelChangePercent] = useState(0);
  const [pixelChangedPixels, setPixelChangedPixels] = useState(0);
  const [pixelZoneStatus, setPixelZoneStatus] = useState<null | {
    zoneName: string | null;
    changedPx: number;
    thresholdPx: number;
    ratio: number;
    triggered: boolean;
  }>(null);
  const pixelChangedPixelsRef = useRef(0);
  const lastActivityRef = useRef<number>(Date.now());
  const inactivityAlertedRef = useRef(false);

  // Calibration (local-only baseline tuning)
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [calibrationRunning, setCalibrationRunning] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationResult, setCalibrationResult] = useState<null | {
    motionSensitivity: number;
    audioSensitivity: number;
    absolutePixelThreshold: number;
    baselineMotionP95: number;
    baselineAudioP95: number;
    baselinePixelP95: number;
  }>(null);
  const calibrationSamplesRef = useRef<{ motion: number[]; audio: number[]; pixel: number[] }>({
    motion: [],
    audio: [],
    pixel: [],
  });
  const calibrationTimersRef = useRef<{ intervalId: number | null; timeoutId: number | null }>({
    intervalId: null,
    timeoutId: null,
  });

  const sensitivityToThreshold = (sensitivity: number) => Math.max(0, Math.min(100, 100 - sensitivity));

  const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const percentile = (values: number[], p: number) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = clampNumber(Math.round((p / 100) * (sorted.length - 1)), 0, sorted.length - 1);
    return sorted[idx];
  };

  const stopCalibration = useCallback(() => {
    if (calibrationTimersRef.current.intervalId !== null) {
      window.clearInterval(calibrationTimersRef.current.intervalId);
    }
    if (calibrationTimersRef.current.timeoutId !== null) {
      window.clearTimeout(calibrationTimersRef.current.timeoutId);
    }
    calibrationTimersRef.current = { intervalId: null, timeoutId: null };
    setCalibrationRunning(false);
  }, []);

  const startCalibration = useCallback(() => {
    if (calibrationRunning) return;

    setCalibrationResult(null);
    setCalibrationProgress(0);
    setCalibrationRunning(true);

    calibrationSamplesRef.current = { motion: [], audio: [], pixel: [] };

    const durationMs = 10_000;
    const sampleIntervalMs = 250;
    const startedAt = Date.now();

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const { motionScore: latestMotion, audioLevel: latestAudio } = useMonitoringStore.getState();

      calibrationSamplesRef.current.motion.push(latestMotion);
      calibrationSamplesRef.current.audio.push(latestAudio);
      calibrationSamplesRef.current.pixel.push(pixelChangedPixelsRef.current);

      const progress = clampNumber(((now - startedAt) / durationMs) * 100, 0, 100);
      setCalibrationProgress(progress);
    }, sampleIntervalMs);

    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
      calibrationTimersRef.current.intervalId = null;
      calibrationTimersRef.current.timeoutId = null;

      const baselineMotionP95 = percentile(calibrationSamplesRef.current.motion, 95);
      const baselineAudioP95 = percentile(calibrationSamplesRef.current.audio, 95);
      const baselinePixelP95 = percentile(calibrationSamplesRef.current.pixel, 95);

      const motionThreshold = clampNumber(Math.round(baselineMotionP95 + 3), 0, 100);
      const audioThreshold = clampNumber(Math.round(baselineAudioP95 + 3), 0, 100);

      const motionSensitivity = clampNumber(100 - motionThreshold, 0, 100);
      const audioSensitivity = clampNumber(100 - audioThreshold, 0, 100);

      const absolutePixelThreshold = clampNumber(
        Math.round(Math.max(5, baselinePixelP95 * 1.25 + 5)),
        1,
        1000
      );

      setCalibrationResult({
        motionSensitivity,
        audioSensitivity,
        absolutePixelThreshold,
        baselineMotionP95,
        baselineAudioP95,
        baselinePixelP95,
      });

      setCalibrationProgress(100);
      setCalibrationRunning(false);
    }, durationMs);

    calibrationTimersRef.current = { intervalId, timeoutId };
  }, [calibrationRunning]);

  useEffect(() => {
    return () => stopCalibration();
  }, [stopCalibration]);

  const classifyDeltaSeverity = (value: number, threshold: number): 'low' | 'medium' | 'high' | 'critical' => {
    const delta = value - threshold;
    if (delta >= 40) return 'critical';
    if (delta >= 25) return 'high';
    if (delta >= 10) return 'medium';
    return 'low';
  };

  /**
   * Asks the browser for an alert's notification: its title and body carry
   * every word. Where the person turned on Show the picture in alert
   * notifications, in a browser that shows a notification's picture, a Motion,
   * Picture change or Lost and Found alert's notification carries the camera's
   * picture with its box drawn in; it waits for that picture at most 300 ms
   * from the alert and then goes with its words alone. A Sound alert's
   * notification never carries a picture, and a picture that cannot be drawn
   * leaves the words.
   */
  const maybeNotify = async (note: {
    kind: AlertKind;
    title: string;
    body: string;
    severity: AlertSeverity | 'info';
    at: number;
    event?: DetectorEvent;
    picture?: Promise<PictureSet>;
  }) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const { title, body, severity, event } = note;

    let image: string | undefined;
    if (
      note.picture && note.kind !== 'sound' &&
      useAlertPicturesStore.getState().inNotifications && showsNotificationPictures()
    ) {
      const left = Math.max(0, NOTIFICATION_WAIT_MS - (Date.now() - note.at));
      image = await Promise.race([
        note.picture.then(notificationCopy).catch(() => undefined),
        new Promise<undefined>((resolve) => { window.setTimeout(() => resolve(undefined), left); }),
      ]);
    }

    // High and critical notifications stay up until dismissed; so do the
    // notifications of an event that has alerted at high or critical, since
    // each replaces the one before it.
    const requireInteraction = event ? keepsNotificationUp(event) : severity === 'high' || severity === 'critical';
    await getNotificationManager().show(title, {
      image,
      body,
      // One tag an event, whatever its severity: a repeat, or a rise in severity,
      // replaces the event's notification in place of standing beside it, and a
      // new event's notification stands beside an earlier one that is kept up.
      tag: event?.notifyTag ? `safeos-${title}-${event.notifyTag}` : `safeos-${title}`,
      // A repeat replaces the earlier notification with the same tag; renotify
      // makes it alert again. Without it the replacement is silent:
      // https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification
      renotify: true,
      requireInteraction,
      data: { title, severity },
      vibrate: severity === 'critical' ? [250, 100, 250, 100, 250] : severity === 'high' ? [200, 80, 200] : undefined,
    });
  };

  const maybeHaptic = (severity: 'low' | 'medium' | 'high' | 'critical') => {
    if (!('vibrate' in navigator)) return;
    if (severity === 'critical') navigator.vibrate([250, 100, 250, 100, 250]);
    else if (severity === 'high') navigator.vibrate([200, 80, 200]);
  };

  /**
   * Shows a detector's alert on its event's card. The event's first alert
   * makes the card; each repeat updates it in place with the new severity,
   * message and time and counts the repeat, while the card is in the list and
   * not acknowledged. The card keeps the event's start as its creation time,
   * so escalation runs once per event. An acknowledged card is left as it is
   * and the next repeat makes a new one. Another tab may have cleared,
   * removed or acknowledged the card: the store checks the saved card as it
   * writes the repeat, and then the repeat goes on a fresh card, which
   * becomes the event's card.
   */
  const showDetectorAlert = useCallback((
    event: DetectorEvent,
    source: AlertSource,
    now: number,
    repeat: boolean,
    severity: AlertSeverity | 'info',
    message: string,
    picture?: { pictureId?: string; zone?: string },
    sighting?: { subjectId: string; subjectName: string; details: MatchResult['details'] },
  ) => {
    const card = event.alertId
      ? useMonitoringStore.getState().alerts.find((a) => a.id === event.alertId)
      : undefined;
    let id = event.alertId;
    let startedAt = event.startedAt;
    const updatesCard = Boolean(repeat && card && !card.acknowledged && id && startedAt);
    if (!updatesCard || !id || !startedAt) {
      id = newAlertId(source, now);
      startedAt = new Date(now).toISOString();
      event.repeats = 0;
    } else {
      // The card's own count, which a repeat queued behind a stale card may have moved on.
      event.repeats = (card?.repeats ?? 0) + 1;
    }
    event.alertId = id;
    event.startedAt = startedAt;
    // The event's notifications keep one identity until it ends, also when its alerts go on a
    // new card; random like an alert id, so two tabs never share it.
    if (!repeat || !event.notifyTag) event.notifyTag = newAlertId(source, now);
    addAlert({
      id,
      streamId: streamId || 'local',
      severity,
      message,
      createdAt: startedAt,
      timestamp: new Date(now).toISOString(),
      acknowledged: false,
      repeats: event.repeats > 0 ? event.repeats : undefined,
      // The card shows the kind, the time and the alert's picture; the message keeps the numbers as data.
      kind: KIND_OF_SOURCE[source],
      pictureId: picture?.pictureId,
      zone: picture?.zone,
      // A sighting's pet and its four scores are kept as data; its card shows none of the scores.
      ...(sighting ?? {}),
    }, updatesCard ? { fresh: freshCardFor(event, () => newAlertId(source, now), now) } : undefined);
  }, [addAlert, streamId]);

  /**
   * Takes an alert's picture in the tick that raises it: the source is copied
   * before anything waits, so the picture is the frame that set the alert off,
   * whatever the camera does next. Answers the picture's id for the alert's
   * record, or nothing when there is no frame to take.
   */
  const takePicture = useCallback((
    kind: AlertKind,
    at: number,
    source: ImageData | CanvasImageSource | null | undefined,
    width: number,
    height: number,
    box: Box | null,
  ): { pictureId: string; picture: Promise<PictureSet> } | undefined => {
    if (!source || !(width > 0) || !(height > 0)) return undefined;
    const pictureId = newPictureId(at);
    const picture = capturePictureSet({ id: pictureId, kind, at, source, sourceWidth: width, sourceHeight: height, sourceBox: box });
    holdPicture(picture, pictureId);
    return { pictureId, picture };
  }, []);

  // The live picture's box: where the newest Motion or Picture change alert's change was, for
  // 10 seconds from the alert. One box at a time: a newer alert's box takes its place and
  // starts its own 10 seconds; an alert with no box (a Sound alert, a change with no region)
  // leaves the box that stands.
  const [liveBox, setLiveBox] = useState<LiveAlertBox | null>(null);
  const liveBoxRef = useRef<{ at: number; timer: number | null }>({ at: 0, timer: null });
  const showLiveBox = useCallback((
    kind: AlertKind,
    at: number,
    taken: { pictureId: string; picture: Promise<PictureSet> } | undefined,
    lines: [string] | [string, string] = [plateLine(kind, at)],
  ) => {
    if (!taken) return;
    void taken.picture.then((set) => {
      const left = LIVE_BOX_MS - (Date.now() - at);
      if (!set.sourceBox || left <= 0 || at < liveBoxRef.current.at) return;
      if (liveBoxRef.current.timer !== null) window.clearTimeout(liveBoxRef.current.timer);
      liveBoxRef.current.at = at;
      setLiveBox({ key: taken.pictureId, box: set.sourceBox, frameWidth: set.sourceWidth, frameHeight: set.sourceHeight, lines });
      liveBoxRef.current.timer = window.setTimeout(() => {
        liveBoxRef.current.timer = null;
        setLiveBox((now) => (now?.key === taken.pictureId ? null : now));
      }, left);
    }, () => undefined);
  }, []);
  const clearLiveBox = useCallback(() => {
    if (liveBoxRef.current.timer !== null) window.clearTimeout(liveBoxRef.current.timer);
    liveBoxRef.current = { at: 0, timer: null };
    setLiveBox(null);
  }, []);
  useEffect(() => clearLiveBox, [clearLiveBox]);
  // The live picture's box belongs to the watch that raised it: it leaves when the watch stops.
  useEffect(() => {
    if (!captureRequested) clearLiveBox();
  }, [captureRequested, clearLiveBox]);

  // A sighting's alert, in the check that raised it. The picture is cut from the comparison's own
  // frame of that check, before any JPEG is made of it, with the region as its box; a region
  // that is missing, empty or outside the frame leaves the picture alone. The entry, the live
  // box, the pet's sound, the notification and the overlay come with each of the run's alerts,
  // never with every check, and nothing is kept for a check under the alert line.
  raiseSightingRef.current = (result: MatchResult, now: number, repeat: boolean) => {
    const subject = activeSubject;
    if (!subject) return;
    const event = sightingEventRef.current;
    const canvas = matcherRef.current.frameCanvas();
    const [width, height] = canvas ? [canvas.width, canvas.height] : [0, 0];
    const taken = canvas
      ? takePicture('sighting', now, canvas, width, height, alertBox('sighting', boxFromRegion(result.region, width, height), width, height))
      : undefined;

    showDetectorAlert(
      event, 'sighting', now, repeat, 'info', sightingQuestion(subject.name),
      { pictureId: taken?.pictureId },
      { subjectId: subject.id, subjectName: subject.name, details: result.details },
    );
    showLiveBox('sighting', now, taken, [sightingPlate(subject.name)]);
    recordLostFoundAlert();
    // The pet's count of sightings goes up once a run.
    if (!repeat) void updateSubjectMatchCount(subject.id, 1);

    // The person's own sounds saved for Lost Item Found, and the built-in alert unless custom
    // media is on (the CustomMediaPlayer plays that). A sound of the person's own that plays
    // on from the run's last alert is not started again over itself.
    if (lostFoundSettings.alertSound) {
      const manager = getSoundManager();
      const own = ownLostFoundSoundRef.current;
      if (!own.starting && !own.ids.some((id) => manager.isActive(id))) {
        own.starting = true;
        own.ids = [];
        const round = own.round;
        void manager.playForTrigger('object_found', {
          cancelled: () => round !== own.round,
          onStart: (id) => {
            if (round === own.round) own.ids.push(id);
            else manager.release(id, 'object_found');
          },
        }).finally(() => { own.starting = false; });
      }
      if (!lostFoundSettings.customMediaEnabled) manager.play('alert');
    }

    // The question and the time; the camera's picture by the person's choice, never the pet's photo.
    if (lostFoundSettings.alertNotification) {
      void maybeNotify({
        kind: 'sighting', title: sightingQuestion(subject.name), body: sightingNotificationBody(subject.name, now),
        severity: 'info', at: now, event, picture: taken?.picture,
      });
    }

    // The full-screen media overlay, where custom media is on.
    if (lostFoundSettings.customMediaEnabled && subject.referenceImages.length > 0) {
      setMediaOverlayData({
        subjectName: subject.name,
        confidence: result.confidence,
        images: subject.referenceImages,
      });
      setShowMediaOverlay(true);
    }
  };

  const handleMotion = useCallback((score: number) => {
    setMotionScore(score);
  }, [setMotionScore]);

  const handleMotionZones = useCallback((zones: Array<{ id: string; name: string; score: number }>, frames?: CheckFrames) => {
    if (!currentPreset.motionDetectionEnabled || !isStreaming) {
      endDetectorEvent(motionEventRef.current);
      return;
    }

    const globalThreshold = sensitivityToThreshold(currentPreset.motionSensitivity);
    const now = Date.now();

    let best: { id: string; name: string; score: number; threshold: number; delta: number } | null = null;
    for (const z of zones) {
      const override = detectionZones.find((dz) => dz.id === z.id)?.sensitivityOverride?.motion;
      const threshold = override !== undefined ? sensitivityToThreshold(override) : globalThreshold;
      const delta = z.score - threshold;
      if (delta >= 0 && (!best || delta > best.delta)) {
        best = { id: z.id, name: z.name, score: z.score, threshold, delta };
      }
    }

    const severity = best ? classifyDeltaSeverity(best.score, best.threshold) : null;
    const outcome = readDetector(motionEventRef.current, now, severity, {
      severitySeconds: severity ? getCooldownForSeverity(severity) : undefined,
      cooldownPeriodSeconds: timingSettings.cooldownPeriod,
      sustainedMs: timingSettings.minimumMotionDuration,
    });
    if (outcome.kind === 'quiet' || !best || !severity) return;

    // Mark activity for inactivity monitoring (even if we end up throttled by cooldown)
    lastActivityRef.current = now;
    inactivityAlertedRef.current = false;

    if (outcome.kind !== 'alert') return;

    // The box goes round the cells that changed between the check's two frames, inside the zone
    // that set the alert off where zones are set.
    const bestId = best.id;
    const bestZone = detectionZones.find((dz) => dz.id === bestId);
    const zone: PercentZone | null = bestZone && !isWholeFrame(bestZone)
      ? { x: bestZone.x, y: bestZone.y, width: bestZone.width, height: bestZone.height }
      : null;
    const frame = frames?.current;
    const taken = frame && takePicture('motion', now, frame, frame.width, frame.height, alertBox(
      'motion',
      frames?.previous ? boxFromCells(detectRegionalMotion(frames.previous, frame), frame.width, frame.height, zone) : null,
      frame.width,
      frame.height,
    ));

    showDetectorAlert(
      motionEventRef.current, 'motion', now, outcome.repeat, severity,
      `Motion detected: ${best.score}% (threshold: ${best.threshold}% · zone: ${best.name})`,
      { pictureId: taken?.pictureId, zone: zone ? best.name : undefined },
    );
    showLiveBox('motion', now, taken || undefined);

    getSoundManager().playForTrigger('motion_detected', { critical: severity === 'critical' });
    playMovementSound(severity);
    maybeHaptic(severity);
    void maybeNotify({
      kind: 'motion', title: notificationTitle('motion'), body: notificationBody(severity, now),
      severity, at: now, event: motionEventRef.current, picture: taken?.picture,
    });
  }, [
    isStreaming,
    currentPreset.motionDetectionEnabled,
    currentPreset.motionSensitivity,
    detectionZones,
    getCooldownForSeverity,
    playMovementSound,
    showDetectorAlert,
    showLiveBox,
    takePicture,
    timingSettings.cooldownPeriod,
    timingSettings.minimumMotionDuration,
  ]);

  const handleAudio = useCallback((level: number) => {
    setAudioLevel(level);

    if (!isStreaming || !currentPreset.audioDetectionEnabled) {
      endDetectorEvent(audioEventRef.current);
      return;
    }

    const audioThreshold = sensitivityToThreshold(currentPreset.audioSensitivity);
    const now = Date.now();

    const severity = level < audioThreshold ? null : classifyDeltaSeverity(level, audioThreshold);
    const outcome = readDetector(audioEventRef.current, now, severity, {
      severitySeconds: severity ? getCooldownForSeverity(severity) : undefined,
      cooldownPeriodSeconds: timingSettings.cooldownPeriod,
      // Require sustained audio to avoid one-sample spikes
      sustainedMs: Math.max(200, timingSettings.minimumMotionDuration),
    });
    if (outcome.kind !== 'alert' || !severity) return;

    // What the camera saw when the sound came: the live picture as it stands, with no box.
    const video = videoRef.current;
    const taken = video ? takePicture('sound', now, video, video.videoWidth, video.videoHeight, null) : undefined;

    showDetectorAlert(
      audioEventRef.current, 'audio', now, outcome.repeat, severity,
      `Audio detected: ${level}% (threshold: ${audioThreshold}% · sensitivity: ${currentPreset.audioSensitivity}%)`,
      { pictureId: taken?.pictureId },
    );

    // Play sound (unless muted)
    getSoundManager().playForTrigger('audio_detected', { critical: severity === 'critical' });
    getSoundManager().playForSeverity(severity, { loop: false });
    maybeHaptic(severity);
    void maybeNotify({
      kind: 'sound', title: notificationTitle('sound'), body: notificationBody(severity, now),
      severity, at: now, event: audioEventRef.current,
    });
  }, [isStreaming, currentPreset.audioDetectionEnabled, currentPreset.audioSensitivity, getCooldownForSeverity, showDetectorAlert, takePicture, timingSettings.cooldownPeriod, timingSettings.minimumMotionDuration]);

  const handlePixel = useCallback((result: PixelDetectionResult, frames?: CheckFrames) => {
    setPixelChangePercent(result.difference);
    setPixelChangedPixels(result.changedPixelCount);
    pixelChangedPixelsRef.current = result.changedPixelCount;

    if (!isStreaming || !currentPreset.pixelDetectionEnabled) {
      endDetectorEvent(pixelEventRef.current);
      return;
    }

    const now = Date.now();
    const thresholdPx = Math.max(1, currentPreset.absolutePixelThreshold);

    // Per-zone pixel thresholds (absolute mode only)
    const enabledZones = detectionZones.filter((z) => z.enabled);
    const fullZone = enabledZones.find((z) => z.x === 0 && z.y === 0 && z.width === 100 && z.height === 100);

    let triggered = result.changed;
    let chosenThresholdPx = thresholdPx;
    let chosenChangedPx = result.changedPixelCount;
    let chosenZoneName: string | null = null;

    if (currentPreset.useAbsoluteThreshold && !fullZone && enabledZones.length > 0 && result.zoneStats && result.zoneStats.length > 0) {
      const statsById = new Map(result.zoneStats.filter((s) => s.id).map((s) => [s.id as string, s]));

      let bestRatio = -Infinity;
      for (const zone of enabledZones) {
        const stat = statsById.get(zone.id);
        const changedPx = stat?.changedPixelCount ?? 0;
        const zoneThresholdPx = Math.max(1, zone.sensitivityOverride?.pixel ?? thresholdPx);
        const ratio = zoneThresholdPx > 0 ? changedPx / zoneThresholdPx : 0;

        if (ratio > bestRatio) {
          bestRatio = ratio;
          chosenThresholdPx = zoneThresholdPx;
          chosenChangedPx = changedPx;
          chosenZoneName = zone.name;
          triggered = changedPx >= zoneThresholdPx;
        }
      }
    }

    const ratioNow = chosenThresholdPx > 0 ? chosenChangedPx / chosenThresholdPx : 0;
    setPixelZoneStatus({
      zoneName: chosenZoneName ?? fullZone?.name ?? (enabledZones.length === 0 ? 'Full Screen' : null),
      changedPx: chosenChangedPx,
      thresholdPx: chosenThresholdPx,
      ratio: ratioNow,
      triggered,
    });

    const severity: AlertSeverity | null = !triggered
      ? null
      : ratioNow >= 10 ? 'critical' : ratioNow >= 5 ? 'high' : ratioNow >= 2 ? 'medium' : 'low';
    const outcome = readDetector(pixelEventRef.current, now, severity, {
      severitySeconds: severity ? getCooldownForSeverity(severity) : undefined,
      cooldownPeriodSeconds: timingSettings.cooldownPeriod,
      // Require sustained pixel change (especially for very low thresholds)
      sustainedMs: Math.max(150, timingSettings.minimumMotionDuration / 2),
    });
    if (outcome.kind === 'quiet' || !severity) return;

    // Mark activity for inactivity monitoring (pixel is a proxy for motion)
    lastActivityRef.current = now;
    inactivityAlertedRef.current = false;

    if (outcome.kind !== 'alert') return;

    // The box goes round the parts of the picture that changed; a change over more than half of
    // the frame, or one with no part to name, keeps the picture alone.
    const frame = frames?.current;
    const taken = frame && takePicture('picture-change', now, frame, frame.width, frame.height, alertBox(
      'picture-change',
      boxFromHotspots(result.hotspots ?? [], frame.width, frame.height),
      frame.width,
      frame.height,
    ));

    showDetectorAlert(
      pixelEventRef.current, 'pixel', now, outcome.repeat, severity,
      `Pixel movement detected${chosenZoneName ? ` in ${chosenZoneName}` : ''}: ${chosenChangedPx}px (threshold: ${chosenThresholdPx}px)`,
      { pictureId: taken?.pictureId, zone: chosenZoneName ?? undefined },
    );
    showLiveBox('picture-change', now, taken || undefined);

    getSoundManager().playForTrigger('motion_detected', { critical: severity === 'critical' });
    playMovementSound(severity);
    maybeHaptic(severity);
    void maybeNotify({
      kind: 'picture-change', title: notificationTitle('picture-change'), body: notificationBody(severity, now),
      severity, at: now, event: pixelEventRef.current, picture: taken?.picture,
    });
  }, [
    isStreaming,
    currentPreset.absolutePixelThreshold,
    currentPreset.pixelDetectionEnabled,
    currentPreset.useAbsoluteThreshold,
    detectionZones,
    getCooldownForSeverity,
    playMovementSound,
    showDetectorAlert,
    showLiveBox,
    takePicture,
    timingSettings.cooldownPeriod,
    timingSettings.minimumMotionDuration,
  ]);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Reset pixel UI when pixel detection is disabled
  useEffect(() => {
    if (currentPreset.pixelDetectionEnabled) return;
    setPixelChangePercent(0);
    setPixelChangedPixels(0);
    pixelChangedPixelsRef.current = 0;
    setPixelZoneStatus(null);
  }, [currentPreset.pixelDetectionEnabled]);

  // Inactivity monitoring (local-only)
  useEffect(() => {
    if (!isStreaming) return;
    if (!detectionFeatureSettings.inactivityMonitoringEnabled) return;
    const minutes = detectionFeatureSettings.inactivityAlertMinutes;
    if (!minutes || minutes <= 0) return;
    if (!currentPreset.motionDetectionEnabled && !currentPreset.pixelDetectionEnabled) return;

    const thresholdMs = minutes * 60_000;
    const checkIntervalMs = 15_000;

    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      if (elapsed < thresholdMs) return;
      if (inactivityAlertedRef.current) return;

      inactivityAlertedRef.current = true;
      const severity = detectionFeatureSettings.inactivitySeverity;
      const soundSeverity = severity === 'info' ? 'low' : severity;

      addAlert({
        id: newAlertId('inactivity', now),
        streamId: streamId || 'local',
        severity,
        message: `Inactivity: no motion detected for ${minutes} minute${minutes === 1 ? '' : 's'}`,
        timestamp: new Date().toISOString(),
        acknowledged: false,
      });

      getSoundManager().playForTrigger('inactivity_alert', { critical: soundSeverity === 'critical' });
      getSoundManager().playForSeverity(soundSeverity, { loop: false });

      if ('vibrate' in navigator && (severity === 'high' || severity === 'critical')) {
        navigator.vibrate(severity === 'critical' ? [250, 100, 250, 100, 250] : [200, 80, 200]);
      }

      if ('Notification' in window && Notification.permission === 'granted') {
        getNotificationManager().show('Inactivity Alert', {
          body: `No motion detected for ${minutes} minute${minutes === 1 ? '' : 's'}`,
          tag: `safeos-inactivity-${now}`,
          requireInteraction: severity === 'high' || severity === 'critical',
          vibrate: severity === 'critical' ? [250, 100, 250, 100, 250] : severity === 'high' ? [200, 80, 200] : undefined,
          data: { severity, minutes },
        });
      }
    }, checkIntervalMs);

    return () => window.clearInterval(interval);
  }, [
    isStreaming,
    detectionFeatureSettings.inactivityMonitoringEnabled,
    detectionFeatureSettings.inactivityAlertMinutes,
    detectionFeatureSettings.inactivitySeverity,
    currentPreset.motionDetectionEnabled,
    currentPreset.pixelDetectionEnabled,
    addAlert,
    streamId,
  ]);

  // Heartbeat
  useEffect(() => {
    if (!wsConnected) return;

    const interval = setInterval(() => {
      sendMessage({ type: 'ping' });
    }, 30000);

    return () => clearInterval(interval);
  }, [wsConnected, sendMessage]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                aria-label="SafeOS home"
                className="text-emerald-400 hover:text-emerald-300 hover:scale-110 transition-all"
              >
                <IconShield size={28} />
              </Link>
            </div>

            <div className="flex items-center gap-4">
              {/* Volume Mute Toggle */}
              <button
                onClick={toggleGlobalMute}
                className={`p-2 rounded-lg transition-colors ${globalMute
                  ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                aria-label={globalMute ? 'Unmute Alerts' : 'Mute Alerts'}
                title={globalMute ? 'Unmute Alerts (click to enable sounds)' : 'Mute Alerts (click to silence)'}
              >
                {globalMute ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
              </button>

              {/* Security Mode Selector */}
              <div ref={modeDropdownRef} className="relative">
                <button
                  onClick={() => setShowModeDropdown(!showModeDropdown)}
                  className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-colors ${isSleepPreset(activePresetId)
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                    : currentPreset.emergencyMode
                      ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  aria-label="Select Security Mode"
                  aria-expanded={showModeDropdown}
                  aria-haspopup="listbox"
                >
                  <IconShield size={18} />
                  <span className="hidden sm:inline max-w-[120px] truncate">
                    {currentPreset.name}
                  </span>
                  <IconChevronDown size={14} className={`transition-transform ${showModeDropdown ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {showModeDropdown && (
                  <div className="absolute right-0 mt-2 w-72 bg-gray-800 rounded-xl border border-gray-700 shadow-xl z-50 overflow-hidden">
                    <div className="p-2 border-b border-gray-700">
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Security Modes</p>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {/* Sleep Presets */}
                      <div className="p-2 border-b border-gray-700/50">
                        <p className="text-[10px] text-blue-400 font-medium uppercase tracking-wider px-2 py-1">Sleep Monitoring</p>
                        {(['infant_sleep', 'pet_sleep', 'deep_sleep_minimal'] as const).map((presetId) => {
                          const preset = DEFAULT_PRESETS[presetId];
                          const isActive = activePresetId === presetId;
                          return (
                            <button
                              key={presetId}
                              onClick={() => {
                                setActivePreset(presetId);
                                setShowModeDropdown(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${isActive
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'text-gray-300 hover:bg-gray-700'
                                }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">{preset.name}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                                  {preset.absolutePixelThreshold}px
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{preset.description}</p>
                            </button>
                          );
                        })}
                      </div>

                      {/* General Presets */}
                      <div className="p-2">
                        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider px-2 py-1">General Modes</p>
                        {(['silent', 'night', 'maximum', 'ultimate'] as const).map((presetId) => {
                          const preset = DEFAULT_PRESETS[presetId];
                          const isActive = activePresetId === presetId;
                          return (
                            <button
                              key={presetId}
                              onClick={() => {
                                setActivePreset(presetId);
                                setShowModeDropdown(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${isActive
                                ? preset.emergencyMode
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-emerald-500/20 text-emerald-400'
                                : 'text-gray-300 hover:bg-gray-700'
                                }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">{preset.name}</span>
                                {preset.emergencyMode && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                                    EMERGENCY
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{preset.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {!captureRequested && nap && (
                <button
                  onClick={endNap}
                  className="px-4 py-2 border border-slate-500 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  End nap
                </button>
              )}

              {!captureRequested && (
                <button
                  onClick={() => startStream()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  Start Monitoring
                </button>
              )}

              {captureRequested && (
                <button
                  onClick={stopWatching}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  {isStreaming || videoSeen ? 'Stop Monitoring' : 'Cancel Starting'}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <WatchForChooser watchFor={watchFor} watching={captureRequested} wide={wide} />

        {nap && napWaitsForTap && !captureRequested && (
          <div role="status" className="mb-6 rounded-xl border border-indigo-400/50 bg-indigo-500/15 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-base text-indigo-50 flex-1">
              This nap stopped watching when the page reloaded, and the browser keeps its sound off until you tap. Resume nap turns the sound on and starts the camera again.
            </p>
            <button
              onClick={resumeNap}
              className="min-h-[44px] px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors"
            >
              Resume nap
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Camera Feed */}
          <div className={`lg:col-span-8${petCard ? ' min-[1440px]:col-span-7' : ''}`}>
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden relative">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="font-semibold text-white">Camera Feed</h2>
              </div>
              {watchFor.way === 'lost_found' && watchFor.petsRead === 'ready' && !watchFor.pet && (
                <p className="px-4 pt-3 text-base text-[var(--color-steel-50)]">{NO_PET_FRAME_LINE}</p>
              )}

              {/* Subject preview overlay */}
              {isLostFoundWatching && <SubjectPreviewOverlay />}

              <CameraPicker refreshKey={isStreaming} />
              <CameraFeed
                deviceId={deviceId}
                enabled={captureRequested}
                scenario={selectedScenario || scenario || undefined}
                onFrame={handleFrame}
                onMotion={handleMotion}
                onMotionZones={handleMotionZones}
                onAudio={handleAudio}
                onPixel={handlePixel}
                alertBox={liveBox}
                onVideoReady={handleVideoReady}
                onError={stopStream}
                showDebug={true}
                showZonesOverlay={true}
                className="aspect-video"
                detectionZones={detectionZones}
                frameCaptureThresholds={{
                  motion: sensitivityToThreshold(currentPreset.motionSensitivity),
                  audio: sensitivityToThreshold(currentPreset.audioSensitivity),
                }}
                frameIntervalMs={Math.max(250, currentPreset.analysisInterval * 1000)}
                pixelDetection={{
                  enabled: currentPreset.pixelDetectionEnabled,
                  sensitivity: Math.max(0, Math.min(100, 100 - currentPreset.pixelThreshold)),
                  absolutePixelThreshold: currentPreset.absolutePixelThreshold,
                  useAbsoluteThreshold: currentPreset.useAbsoluteThreshold,
                  instantLocalMode: isSleepPreset(activePresetId),
                  downsampleFactor: isSleepPreset(activePresetId) ? 2 : 1,
                }}
              />
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
              <StatCard
                label="Motion"
                value={motionScore.toFixed(1)}
                unit="%"
                color={motionScore > 30 ? 'yellow' : 'green'}
              />
              <StatCard
                label="Audio"
                value={audioLevel.toFixed(1)}
                unit="%"
                color={audioLevel > 30 ? 'yellow' : 'green'}
              />
              <StatCard
                label="Pixel"
                value={(pixelZoneStatus?.changedPx ?? pixelChangedPixels).toFixed(0)}
                unit="px"
                color={
                  pixelZoneStatus
                    ? pixelZoneStatus.ratio >= 5
                      ? 'red'
                      : pixelZoneStatus.ratio >= 1
                        ? 'yellow'
                        : 'green'
                    : pixelChangedPixels >= currentPreset.absolutePixelThreshold
                      ? 'yellow'
                      : 'green'
                }
                subtext={
                  pixelZoneStatus
                    ? `${pixelZoneStatus.zoneName ?? 'All Zones'} • threshold ${pixelZoneStatus.thresholdPx}px`
                    : `Threshold ${currentPreset.absolutePixelThreshold}px`
                }
              />
              <StatCard
                label="Stream"
                value={isStreaming ? 'Active' : captureRequested ? (videoSeen ? 'Paused' : 'Starting') : 'Inactive'}
                color={isStreaming ? 'green' : 'gray'}
              />
              <StatCard
                label="Mode"
                value={currentPreset.name}
                color={isSleepPreset(activePresetId) ? 'blue' : currentPreset.emergencyMode ? 'red' : 'green'}
              />
            </div>

            {/* Active Mode Info Panel */}
            <div
              key={activePresetId}
              className="mt-4 p-4 bg-gray-800/50 border border-gray-700 rounded-xl animate-fade-in"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full animate-pulse ${currentPreset.emergencyMode ? 'bg-red-500' : 'bg-emerald-500'
                    }`} />
                  {currentPreset.name}
                </h3>
                <span className={`text-xs px-2 py-1 rounded-full ${currentPreset.processingMode === 'local'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-blue-500/20 text-blue-400'
                  }`}>
                  {currentPreset.processingMode === 'local' ? 'Local Processing' : 'Cloud AI'}
                </span>
              </div>

              <p className="text-xs text-gray-400 mb-4">{currentPreset.description}</p>

              {/* Mode Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center p-2 bg-gray-900/50 rounded-lg">
                  <div className="text-lg font-bold text-emerald-500">
                    {currentPreset.absolutePixelThreshold}px
                  </div>
                  <div className="text-xs sm:text-[10px] text-gray-500 uppercase">Pixel Threshold</div>
                </div>
                <div className="text-center p-2 bg-gray-900/50 rounded-lg">
                  <div className="text-lg font-bold text-blue-400">
                    {currentPreset.motionSensitivity}%
                  </div>
                  <div className="text-xs sm:text-[10px] text-gray-500 uppercase">Motion</div>
                </div>
                <div className="text-center p-2 bg-gray-900/50 rounded-lg">
                  <div className="text-lg font-bold text-purple-400">
                    {currentPreset.audioSensitivity}%
                  </div>
                  <div className="text-xs sm:text-[10px] text-gray-500 uppercase">Audio</div>
                </div>
                <div className="text-center p-2 bg-gray-900/50 rounded-lg">
                  <div className="text-lg font-bold text-amber-400">
                    {currentPreset.analysisInterval}s
                  </div>
                  <div className="text-xs sm:text-[10px] text-gray-500 uppercase">Interval</div>
                </div>
              </div>

              {/* Emergency Mode Badge */}
              {currentPreset.emergencyMode && (
                <div className="mt-3 flex items-center gap-2 text-xs text-red-400">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Emergency Mode Active - Instant escalation enabled
                </div>
              )}

              {/* Sleep Mode Info */}
              {isSleepPreset(activePresetId) && (
                <div className="mt-3 flex items-center gap-2 text-xs text-blue-400">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  Nap Mode - Pixel detection for sleeping subject
                </div>
              )}

              {/* Override Sliders Toggle */}
              <button
                onClick={() => setCalibrationOpen(true)}
                className="w-full mt-3 py-2 text-xs text-emerald-400 hover:text-emerald-300
                           border border-emerald-500/20 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/15 transition-colors"
                type="button"
              >
                Calibrate Baseline (10s)
              </button>

              <button
                onClick={() => setShowOverrides(!showOverrides)}
                className="w-full mt-3 py-2 text-xs text-gray-400 hover:text-white
                           flex items-center justify-center gap-1 border-t border-gray-700/50"
              >
                {showOverrides ? '▲ Hide Fine-Tuning' : '▼ Fine-Tune Settings'}
              </button>

              {showOverrides && (
                <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-4 animate-fade-in">
                  <p className="text-xs sm:text-[10px] text-gray-500 uppercase tracking-wider">
                    {keptNames
                      ? `${keptNames} kept for this use until Reset · the rest until the preset changes`
                      : 'Override until preset changes'}
                  </p>

                  {/* Motion Sensitivity Slider */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">Motion Sensitivity</span>
                      <span className="text-blue-400 font-medium">{currentPreset.motionSensitivity}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={currentPreset.motionSensitivity}
                      onChange={(e) => tuneWatch({ motionSensitivity: Number(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer
                                 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                                 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500
                                 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                  </div>

                  {/* Audio Sensitivity Slider */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">Audio Sensitivity</span>
                      <span className="text-purple-400 font-medium">{currentPreset.audioSensitivity}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={currentPreset.audioSensitivity}
                      onChange={(e) => tuneWatch({ audioSensitivity: Number(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer
                                 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                                 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-purple-500
                                 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                  </div>

                  {/* Pixel Threshold Slider */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">Pixel Threshold</span>
                      <span className="text-emerald-400 font-medium">{currentPreset.absolutePixelThreshold}px</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={currentPreset.absolutePixelThreshold}
                      onChange={(e) => tuneWatch({ absolutePixelThreshold: Number(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer
                                 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                                 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-emerald-500
                                 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                  </div>

                  {/* Analysis Interval Slider */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">Analysis Interval</span>
                      <span className="text-amber-400 font-medium">{currentPreset.analysisInterval}s</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={60}
                      value={currentPreset.analysisInterval}
                      onChange={(e) => tuneWatch({ analysisInterval: Number(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer
                                 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                                 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-amber-500
                                 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                  </div>

                  {/* Reset to Preset Defaults */}
                  <button
                    onClick={resetWatch}
                    className="w-full py-2 text-xs text-gray-400 hover:text-white
                               bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Reset to {DEFAULT_PRESETS[activePresetId].name} Defaults
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* The pet's card, the alerts and, while the watch compares, the pet's matches */}
          <div className={`lg:col-span-4${petCard ? ' min-[1440px]:col-span-5' : ''} flex flex-col gap-6`}>
            {petCard && <WatchForPet watchFor={watchFor} layout="card" />}

            <div className="flex-1 bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden min-h-[400px]">
              <AlertPanel />
            </div>

            {watchFor.comparing && activeSubject && (
              <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden p-4">
                <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
                  <IconSearch size={18} />
                  Lost and Found
                </h2>
                <SubjectPreview mode="full" showClose={false} onPhotosSaved={watchFor.photosSaved} savedUnder={petsMarker} />
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <Link
                    href="/history/"
                    className="block w-full text-center px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    {OPEN_IN_HISTORY}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Inline Settings Panel */}
        <InlineSettingsPanel defaultExpanded={['detection']} />
      </main>

      {/* The notice before the first watch on this device */}
      {picturesNotice}

      {/* Quick Settings Panel - floating bottom-right (mobile fallback) */}
      <div className="lg:hidden">
        <QuickSettingsPanel />
      </div>

      {/* Preset Initializer - handles URL params */}
      <Suspense fallback={null}>
        <PresetInitializer />
      </Suspense>

      {/* Calibration Modal */}
      {calibrationOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Calibration"
          onClick={() => {
            stopCalibration();
            setCalibrationOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Calibration</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Samples your camera/mic baseline for 10 seconds and suggests thresholds (local-only).
                </p>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 text-sm text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg"
                onClick={() => {
                  stopCalibration();
                  setCalibrationOpen(false);
                }}
              >
                Close
              </button>
            </div>

            {/* Progress */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                <span>{calibrationRunning ? 'Calibrating…' : calibrationResult ? 'Complete' : 'Ready'}</span>
                <span>{Math.round(calibrationProgress)}%</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.round(calibrationProgress)}%` }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={startCalibration}
                disabled={calibrationRunning}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  calibrationRunning
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {calibrationRunning ? 'Calibrating…' : 'Start Calibration'}
              </button>

              <button
                type="button"
                disabled={!calibrationResult || calibrationRunning}
                onClick={() => {
                  if (!calibrationResult) return;
                  tuneWatch({
                    motionSensitivity: calibrationResult.motionSensitivity,
                    audioSensitivity: calibrationResult.audioSensitivity,
                    absolutePixelThreshold: calibrationResult.absolutePixelThreshold,
                  });
                  setCalibrationOpen(false);
                }}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  !calibrationResult || calibrationRunning
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                Apply Suggestions
              </button>
            </div>

            {calibrationResult && (
              <div className="mt-4 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                <div className="text-xs text-gray-400 mb-3">Suggested values</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-gray-900/50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Motion Sensitivity</div>
                    <div className="text-lg font-semibold text-blue-400">{calibrationResult.motionSensitivity}%</div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      baseline P95: {calibrationResult.baselineMotionP95.toFixed(1)}%
                    </div>
                  </div>
                  <div className="p-3 bg-gray-900/50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Audio Sensitivity</div>
                    <div className="text-lg font-semibold text-purple-400">{calibrationResult.audioSensitivity}%</div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      baseline P95: {calibrationResult.baselineAudioP95.toFixed(1)}%
                    </div>
                  </div>
                  <div className="p-3 bg-gray-900/50 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Pixel Threshold</div>
                    <div className="text-lg font-semibold text-emerald-400">
                      {calibrationResult.absolutePixelThreshold}px
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      baseline P95: {calibrationResult.baselinePixelP95.toFixed(0)}px
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-gray-500">
                  Tip: Calibrate with your camera mounted and the room in its normal lighting. Re-run after changing
                  placement, lighting, or zoom.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lost & Found Media Overlay */}
      {showMediaOverlay && mediaOverlayData && (
        <LostFoundMediaOverlay
          isOpen={showMediaOverlay}
          onClose={() => {
            setShowMediaOverlay(false);
            setMediaOverlayData(null);
          }}
          subjectName={mediaOverlayData.subjectName}
          confidence={mediaOverlayData.confidence}
          images={mediaOverlayData.images}
        />
      )}
    </div>
  );
}

// =============================================================================
// Preset Initializer Component (for URL params)
// =============================================================================

function PresetInitializer() {
  const searchParams = useSearchParams();
  const { setActivePreset } = useSettingsStore();
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (applied) return;

    const presetParam = searchParams.get('preset');
    const scenarioParam = searchParams.get('scenario');

    if (presetParam && presetParam in DEFAULT_PRESETS) {
      setActivePreset(presetParam as PresetId);
      setApplied(true);
    }

    if (scenarioParam) {
      console.log(`[Monitor] Quick start for scenario: ${scenarioParam}`);
    }
  }, [searchParams, setActivePreset, applied]);

  return null; // This component only handles side effects
}

// =============================================================================
// Sub-Components
// =============================================================================

function StatCard({
  label,
  value,
  unit,
  color,
  subtext,
}: {
  label: string;
  value: string;
  unit?: string;
  color: 'green' | 'yellow' | 'red' | 'blue' | 'gray';
  subtext?: string;
}) {
  const colorClasses = {
    green: 'bg-green-500/20 text-green-400',
    yellow: 'bg-yellow-500/20 text-yellow-400',
    red: 'bg-red-500/20 text-red-400',
    blue: 'bg-blue-500/20 text-blue-400',
    gray: 'bg-gray-500/20 text-gray-400',
  };

  return (
    <div
      className={`p-4 rounded-lg ${colorClasses[color]} border border-current/20`}
    >
      <div className="text-xs uppercase mb-1">{label}</div>
      <div className="text-xl font-bold capitalize">
        {value}
        {unit && <span className="text-sm ml-1">{unit}</span>}
      </div>
      {subtext && (
        <div className="mt-1 text-[11px] leading-tight text-current/80 truncate">
          {subtext}
        </div>
      )}
    </div>
  );
}
