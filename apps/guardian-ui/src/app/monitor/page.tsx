'use client';

/**
 * Monitor Page
 *
 * Live monitoring interface with Lost & Found detection.
 *
 * @module app/monitor/page
 */

import { showBrowserNotification } from '@/lib/browser-notification';
import React, { useEffect, useCallback, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CameraFeed } from '../../components/CameraFeed';
import { AlertPanel } from '../../components/AlertPanel';
import { SubjectPreviewOverlay, SubjectPreview } from '../../components/SubjectPreview';
import { LostFoundMediaOverlay } from '../../components/LostFoundMediaOverlay';
import { QuickSettingsPanel } from '../../components/QuickSettingsPanel';
import { InlineSettingsPanel } from '../../components/monitor';
import { IconSearch, IconFingerprint, IconRadar, IconChevronDown, IconShield } from '../../components/icons';
import { useMonitoringStore } from '../../stores/monitoring-store';
import { useOnboardingStore } from '../../stores/onboarding-store';
import { useSettingsStore, DEFAULT_PRESETS, type PresetId, isSleepPreset } from '../../stores/settings-store';
import { useLostFoundStore, createMatchFrame, getMatcherSettings } from '../../stores/lost-found-store';
import { getSubjectMatcher, type MatchResult } from '../../lib/subject-matcher';
import { saveMatchFrame, type MatchFrameDB } from '../../lib/client-db';
import { useWebSocket, type WSMessage } from '../../lib/websocket';
import { getSoundManager } from '../../lib/sound-manager';
import type { PixelDetectionResult } from '../../lib/pixel-detection';
import { getNotificationManager } from '../../lib/notification-manager';
import { useBackendStatus } from '@/contexts/BackendStatusContext';

// =============================================================================
// Constants
// =============================================================================

const THUMBNAIL_WIDTH = 160;
const THUMBNAIL_HEIGHT = 120;
const THUMBNAIL_QUALITY = 0.3;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a compressed thumbnail from frame data
 * @param frameData - Base64 image data URL
 * @returns Promise resolving to compressed thumbnail data URL
 */
async function createThumbnail(frameData: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = THUMBNAIL_WIDTH;
      canvas.height = THUMBNAIL_HEIGHT;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw scaled-down image
        ctx.drawImage(img, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
        // Export as compressed JPEG
        resolve(canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY));
      } else {
        // Fallback to original if canvas fails
        resolve(frameData);
      }
    };
    img.onerror = () => {
      // Fallback to original on error
      resolve(frameData);
    };
    img.src = frameData;
  });
}

// =============================================================================
// Component
// =============================================================================

export default function MonitorPage() {
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

  const { selectedScenario } = useOnboardingStore();

  const {
    activeSubject,
    isWatching: isLostFoundWatching,
    settings: lostFoundSettings,
    updateCurrentConfidence,
    updateConsecutiveMatches,
    addMatchFrame: addMatchFrameToStore,
    addRecentMatch,
    recordAlert: recordLostFoundAlert,
  } = useLostFoundStore();

  const [showLostFoundPanel, setShowLostFoundPanel] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);

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
  const { activePresetId, setActivePreset, activeSleepPreset, globalSettings, updateGlobalSettings, globalMute, toggleGlobalMute, timingSettings, getCooldownForSeverity } = useSettingsStore();
  const detectionFeatureSettings = useSettingsStore((state) => state.detectionFeatureSettings);
  const detectionZones = useSettingsStore((state) => state.detectionZones);
  const currentPreset = globalSettings; // Use globalSettings to reflect slider overrides
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

  // Process frames for Lost & Found matching
  const processLostFoundFrame = useCallback((video: HTMLVideoElement) => {
    if (!isLostFoundWatching || !activeSubject) return;

    const matcher = matcherRef.current;
    const result = matcher.processFrame(video);

    if (result) {
      // Update UI
      updateCurrentConfidence(result.confidence);
      updateConsecutiveMatches(matcher.getState().consecutiveMatches);
      addRecentMatch(result);

      // Check if should record
      if (matcher.shouldRecord() && result.frameData) {
        // Create match frame and save to IndexedDB (async thumbnail creation)
        const frameData = result.frameData;
        createThumbnail(frameData).then((thumbnailData) => {
          const matchFrame: MatchFrameDB = {
            id: result.id,
            subjectId: activeSubject.id,
            frameData: frameData,
            thumbnailData: thumbnailData,
            confidence: result.confidence,
            timestamp: result.timestamp,
            details: result.details,
            region: result.region || null,
            acknowledged: false,
            notes: '',
            exported: false,
          };

          saveMatchFrame(matchFrame);
        });
        addMatchFrameToStore(createMatchFrame(activeSubject.id, result));
      }

      // Check if should alert
      if (matcher.shouldAlert()) {
        recordLostFoundAlert();

        // Play sound if enabled (only if custom media is disabled, else CustomMediaPlayer handles it)
        if (lostFoundSettings.alertSound && !lostFoundSettings.customMediaEnabled) {
          getSoundManager().play('alert');
        }

        // Show notification if enabled
        if (lostFoundSettings.alertNotification && 'Notification' in window && Notification.permission === 'granted') {
          void showBrowserNotification('Potential Match Detected!', {
            body: `${activeSubject.name} - ${result.confidence}% confidence`,
            icon: activeSubject.referenceImages[0],
          });
        }

        // Show full-screen media overlay if custom media is enabled
        if (lostFoundSettings.customMediaEnabled && activeSubject.referenceImages.length > 0) {
          setMediaOverlayData({
            subjectName: activeSubject.name,
            confidence: result.confidence,
            images: activeSubject.referenceImages,
          });
          setShowMediaOverlay(true);
        }
      }
    } else {
      // Reset confidence when no match
      updateCurrentConfidence(0);
    }
  }, [
    isLostFoundWatching,
    activeSubject,
    lostFoundSettings,
    updateCurrentConfidence,
    updateConsecutiveMatches,
    addRecentMatch,
    addMatchFrameToStore,
    recordLostFoundAlert,
  ]);

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
          setStreaming(true);
          setStreamId(message.payload?.streamId);
          break;
        case 'stream-stopped':
          setStreaming(false);
          setStreamId(null);
          break;
        case 'alert':
          addAlert({
            id: message.payload?.id || Date.now().toString(),
            streamId: message.payload?.streamId || '',
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

  const startStream = () => {
    if (wsConnected) {
      sendMessage({
        type: 'start-stream',
        payload: { scenario: selectedScenario || scenario },
      });
      return;
    }

    // Local/offline mode: run monitoring entirely in-browser.
    setStreaming(true);
    setStreamId(streamId || `local-${Date.now()}`);
  };

  const stopStream = () => {
    if (wsConnected) {
      sendMessage({ type: 'stop-stream' });
      return;
    }

    setStreaming(false);
    setStreamId(null);
  };

  const handleFrame = (data: { imageData: string; motionScore: number; audioLevel: number }) => {
    if (!isStreaming) return;

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

  const motionAboveSinceRef = useRef<number | null>(null);
  const audioAboveSinceRef = useRef<number | null>(null);
  const pixelAboveSinceRef = useRef<number | null>(null);
  const motionLatchedRef = useRef(false);
  const audioLatchedRef = useRef(false);
  const pixelLatchedRef = useRef(false);

  const lastMotionAlertRef = useRef<number>(0);
  const lastAudioAlertRef = useRef<number>(0);
  const lastPixelAlertRef = useRef<number>(0);

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

  const maybeNotify = async (
    title: string,
    body: string,
    severity: 'low' | 'medium' | 'high' | 'critical'
  ) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    // Avoid spamming notifications for low severity
    const requireInteraction = severity === 'high' || severity === 'critical';
    await getNotificationManager().show(title, {
      body,
      tag: `safeos-${severity}-${title}`,
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

  const handleMotion = useCallback((score: number) => {
    setMotionScore(score);
  }, [setMotionScore]);

  const handleMotionZones = useCallback((zones: Array<{ id: string; name: string; score: number }>) => {
    if (!currentPreset.motionDetectionEnabled) return;
    if (!isStreaming) {
      motionAboveSinceRef.current = null;
      motionLatchedRef.current = false;
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

    if (!best) {
      motionAboveSinceRef.current = null;
      motionLatchedRef.current = false;
      return;
    }

    if (motionLatchedRef.current) return;

    if (!motionAboveSinceRef.current) {
      motionAboveSinceRef.current = now;
      return;
    }

    // Require sustained motion to avoid single-frame spikes / lighting flicker
    if (now - motionAboveSinceRef.current < timingSettings.minimumMotionDuration) {
      return;
    }

    // Mark activity for inactivity monitoring (even if we end up throttled by cooldown)
    lastActivityRef.current = now;
    inactivityAlertedRef.current = false;

    const severity = classifyDeltaSeverity(best.score, best.threshold);
    const cooldownMs = (getCooldownForSeverity(severity) ?? 10) * 1000;
    if (cooldownMs > 0 && now - lastMotionAlertRef.current < cooldownMs) return;

    lastMotionAlertRef.current = now;
    motionLatchedRef.current = true;
    motionAboveSinceRef.current = null;

    addAlert({
      id: `motion-${now}`,
      streamId: streamId || 'local',
      severity,
      message: `Motion detected: ${best.score}% (threshold: ${best.threshold}% · zone: ${best.name})`,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    });

    getSoundManager().playForTrigger('motion_detected');
    getSoundManager().playForSeverity(severity, { loop: false });
    maybeHaptic(severity);
    maybeNotify('Motion Detected', `${best.score}% (threshold ${best.threshold}%) · ${best.name}`, severity);
  }, [
    addAlert,
    isStreaming,
    currentPreset.motionDetectionEnabled,
    currentPreset.motionSensitivity,
    detectionZones,
    getCooldownForSeverity,
    streamId,
    timingSettings.minimumMotionDuration,
  ]);

  const handleAudio = useCallback((level: number) => {
    setAudioLevel(level);

    if (!isStreaming) {
      audioAboveSinceRef.current = null;
      audioLatchedRef.current = false;
      return;
    }

    if (!currentPreset.audioDetectionEnabled) return;

    const audioThreshold = sensitivityToThreshold(currentPreset.audioSensitivity);
    const now = Date.now();

    if (level < audioThreshold) {
      audioAboveSinceRef.current = null;
      audioLatchedRef.current = false;
      return;
    }

    if (audioLatchedRef.current) return;

    if (!audioAboveSinceRef.current) {
      audioAboveSinceRef.current = now;
      return;
    }

    // Require sustained audio to avoid one-sample spikes
    if (now - audioAboveSinceRef.current < Math.max(200, timingSettings.minimumMotionDuration)) {
      return;
    }

    const severity = classifyDeltaSeverity(level, audioThreshold);
    const cooldownMs = (getCooldownForSeverity(severity) ?? 10) * 1000;
    if (cooldownMs > 0 && now - lastAudioAlertRef.current < cooldownMs) return;

    lastAudioAlertRef.current = now;
    audioLatchedRef.current = true;
    audioAboveSinceRef.current = null;

      // Add alert
      addAlert({
        id: `audio-${now}`,
        streamId: streamId || 'local',
        severity,
        message: `Audio detected: ${level}% (threshold: ${audioThreshold}% · sensitivity: ${currentPreset.audioSensitivity}%)`,
        timestamp: new Date().toISOString(),
        acknowledged: false,
      });

      // Play sound (unless muted)
      getSoundManager().playForTrigger('audio_detected');
      getSoundManager().playForSeverity(severity === 'critical' ? 'critical' : severity, { loop: false });
      maybeHaptic(severity);
      maybeNotify('Audio Detected', `${level}% (threshold ${audioThreshold}%)`, severity);
  }, [addAlert, isStreaming, streamId, currentPreset.audioDetectionEnabled, currentPreset.audioSensitivity, getCooldownForSeverity, timingSettings.minimumMotionDuration]);

  const handlePixel = useCallback((result: PixelDetectionResult) => {
    setPixelChangePercent(result.difference);
    setPixelChangedPixels(result.changedPixelCount);
    pixelChangedPixelsRef.current = result.changedPixelCount;

    if (!isStreaming) {
      pixelAboveSinceRef.current = null;
      pixelLatchedRef.current = false;
      return;
    }

    if (!currentPreset.pixelDetectionEnabled) return;

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

    if (!triggered) {
      pixelAboveSinceRef.current = null;
      pixelLatchedRef.current = false;
      return;
    }

    if (pixelLatchedRef.current) return;

    if (!pixelAboveSinceRef.current) {
      pixelAboveSinceRef.current = now;
      return;
    }

    // Require sustained pixel change (especially for very low thresholds)
    if (now - pixelAboveSinceRef.current < Math.max(150, timingSettings.minimumMotionDuration / 2)) {
      return;
    }

    // Mark activity for inactivity monitoring (pixel is a proxy for motion)
    lastActivityRef.current = now;
    inactivityAlertedRef.current = false;

    const severity: 'low' | 'medium' | 'high' | 'critical' =
      ratioNow >= 10 ? 'critical' : ratioNow >= 5 ? 'high' : ratioNow >= 2 ? 'medium' : 'low';

    const cooldownMs = (getCooldownForSeverity(severity) ?? 10) * 1000;
    if (cooldownMs > 0 && now - lastPixelAlertRef.current < cooldownMs) return;

    lastPixelAlertRef.current = now;
    pixelLatchedRef.current = true;
    pixelAboveSinceRef.current = null;

    addAlert({
      id: `pixel-${now}`,
      streamId: streamId || 'local',
      severity,
      message: `Pixel movement detected${chosenZoneName ? ` in ${chosenZoneName}` : ''}: ${chosenChangedPx}px (threshold: ${chosenThresholdPx}px)`,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    });

    getSoundManager().playForTrigger('motion_detected');
    getSoundManager().playForSeverity(severity === 'critical' ? 'critical' : severity, { loop: false });
    maybeHaptic(severity);
    maybeNotify('Pixel Movement', `${chosenChangedPx}px (threshold ${chosenThresholdPx}px)`, severity);
  }, [
    addAlert,
    isStreaming,
    currentPreset.absolutePixelThreshold,
    currentPreset.pixelDetectionEnabled,
    currentPreset.useAbsoluteThreshold,
    detectionZones,
    getCooldownForSeverity,
    streamId,
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
        id: `inactivity-${now}`,
        streamId: streamId || 'local',
        severity,
        message: `Inactivity: no motion detected for ${minutes} minute${minutes === 1 ? '' : 's'}`,
        timestamp: new Date().toISOString(),
        acknowledged: false,
      });

      getSoundManager().playForTrigger('inactivity_alert');
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
              <h1 className="text-xl font-bold text-white">Live Monitor</h1>
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

              {/* Lost & Found toggle */}
              <button
                onClick={() => setShowLostFoundPanel(!showLostFoundPanel)}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-colors ${isLostFoundWatching
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                aria-label="Lost & Found Mode"
                aria-expanded={showLostFoundPanel}
                aria-pressed={isLostFoundWatching}
              >
                <IconRadar size={18} />
                <span className="hidden sm:inline">
                  {isLostFoundWatching ? 'Watching' : 'Lost & Found'}
                </span>
                {isLostFoundWatching && (
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                )}
              </button>

              {!isStreaming && (
                <button
                  onClick={startStream}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  Start Monitoring
                </button>
              )}

              {isStreaming && (
                <button
                  onClick={stopStream}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Stop Monitoring
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Camera Feed */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden relative">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="font-semibold text-white">Camera Feed</h2>
                {isLostFoundWatching && activeSubject && (
                  <div className="flex items-center gap-2 text-sm text-purple-400">
                    <IconFingerprint size={16} />
                    <span>Matching: {activeSubject.name}</span>
                  </div>
                )}
              </div>

              {/* Subject preview overlay */}
              {isLostFoundWatching && <SubjectPreviewOverlay />}

              <CameraFeed
                scenario={selectedScenario || scenario || undefined}
                onFrame={handleFrame}
                onMotion={handleMotion}
                onMotionZones={handleMotionZones}
                onAudio={handleAudio}
                onPixel={handlePixel}
                onVideoReady={(video) => {
                  videoRef.current = video;
                }}
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
                value={isStreaming ? 'Active' : 'Inactive'}
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
                    Override until preset changes
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
                      onChange={(e) => updateGlobalSettings({ motionSensitivity: Number(e.target.value) })}
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
                      onChange={(e) => updateGlobalSettings({ audioSensitivity: Number(e.target.value) })}
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
                      onChange={(e) => updateGlobalSettings({ absolutePixelThreshold: Number(e.target.value) })}
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
                      onChange={(e) => updateGlobalSettings({ analysisInterval: Number(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer
                                 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                                 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-amber-500
                                 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                  </div>

                  {/* Reset to Preset Defaults */}
                  <button
                    onClick={() => setActivePreset(activePresetId)}
                    className="w-full py-2 text-xs text-gray-400 hover:text-white
                               bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Reset to {DEFAULT_PRESETS[activePresetId].name} Defaults
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Alert Panel or Lost & Found Panel */}
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden min-h-[400px]">
            {showLostFoundPanel ? (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-white flex items-center gap-2">
                    <IconSearch size={18} />
                    Lost & Found
                  </h2>
                  <button
                    onClick={() => setShowLostFoundPanel(false)}
                    className="text-sm text-gray-400 hover:text-white"
                  >
                    Show Alerts
                  </button>
                </div>

                {activeSubject ? (
                  <SubjectPreview mode="full" showClose={false} />
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-4">
                      <IconSearch size={32} className="text-gray-500" />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-2">
                      No Subject Set
                    </h3>
                    <p className="text-gray-400 text-sm mb-4">
                      Add a lost pet or person to watch for
                    </p>
                    <Link
                      href="/lost-found"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
                    >
                      <IconFingerprint size={16} />
                      Set Up Lost & Found
                    </Link>
                  </div>
                )}

                {activeSubject && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <Link
                      href="/lost-found/gallery"
                      className="block w-full text-center px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                      View Match History
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <AlertPanel />
            )}
          </div>
        </div>

        {/* Inline Settings Panel */}
        <InlineSettingsPanel defaultExpanded={['detection']} />
      </main>

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
                  updateGlobalSettings({
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
