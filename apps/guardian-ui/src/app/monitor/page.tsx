'use client';

/**
 * Motion and sound page
 *
 * The watch for motion and sound, which also runs Lost and Found's check.
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
import { KeyRow } from '../../components/KeyRow';
import { MuteAlerts, MutedLine } from '../../components/watch/MuteAlerts';
import { AlertPanel } from '../../components/AlertPanel';
import { LostFoundMediaOverlay } from '../../components/LostFoundMediaOverlay';
import { InlineSettingsPanel } from '../../components/monitor';
import { WatchForChooser, WatchForPet, useWatchFor, useWideWatch, usePhoneWatch, NO_PET_FRAME_LINE } from '../../components/monitor/WatchFor';
import { useMonitoringStore } from '../../stores/monitoring-store';
import { useOnboardingStore } from '../../stores/onboarding-store';
import { useSettingsStore, DEFAULT_PRESETS, type PresetId, isSleepPreset } from '../../stores/settings-store';
import { useWatchSettings } from '../../stores/watch-settings';
import { useLostFoundStore, getMatcherSettings } from '../../stores/lost-found-store';
import { getSubjectMatcher, type MatchResult } from '../../lib/subject-matcher';
import { getSubjectProfile, saveUpgradedSubjectFingerprint, updateSubjectMatchCount } from '../../lib/client-db';
import { generateFingerprint, isCurrentFingerprint, upgradeFingerprint } from '../../lib/visual-fingerprint';
import { useWebSocket, type WSMessage } from '../../lib/websocket';
import { getSoundManager } from '../../lib/sound-manager';
import { keepNap, napTimeIsUp, readKeptNap, takeNapHandoff, type Nap } from '../../lib/nap-session';
import { forgetRaised } from '../../lib/watch-sound';
import { keepWatchTimes, rememberWay, watchEnded, watchStarted } from '../../lib/watch-session';
import { announceWatch, useOtherTabWatch } from '../../lib/tab-channel';
import { useCameraAsk } from '../../lib/browser-asks';
import { cameraFailureOf, type CameraFailure, type MicrophoneProblem } from '../../lib/camera-failure';
import { WatchFrame, type FramePhase } from '../../components/watch/WatchFrame';
import { Meters, type MeterRow } from '../../components/watch/Meters';
import { SettingsFold } from '../../components/watch/SettingsFold';
import { levelMeter, pictureChangeMeter, pictureChangeRatio } from '../../lib/watch-meters';
import { dropStart, startHeld, takeStart, type StartRequest } from '../../lib/camera-handoff';
import { useStartGuard } from '../../lib/start-guard';
import { Brand } from '../../components/home/Brand';
import type { PixelDetectionResult } from '../../lib/pixel-detection';
import { detectRegionalMotion } from '../../lib/motion-detection';
import { LIVE_BOX_MS, NOTIFICATION_WAIT_MS, alertBox, askNote, forgetOldNotes, showInTurn, boxFromCells, boxFromHotspots, boxFromRegion, type AlertKind, type Box, type PercentZone } from '../../lib/alert-pictures/rules';
import { LOCAL_TIMELINE_HREF } from '../../lib/app-routes';
import { OPEN_IN_HISTORY, notificationBody, notificationTitle, plateLine, sightingNotificationBody, sightingPlate, sightingQuestion } from '../../lib/alert-pictures/words';
import type { LiveAlertBox } from '../../components/alert-pictures/LiveBox';
import { capturePictureSet, newPictureId, notificationCopy, showsNotificationPictures, type PictureSet } from '../../lib/alert-pictures/capture';
import { holdPicture, noticeAnswered, picturesInNotifications, startPictureWatch, stopPictureWatch } from '../../lib/alert-pictures/keeper';
import { readAccountClearMarker } from '../../lib/local-data-generation';
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

/** The triggers whose saved sounds this page's watch plays. */
const WATCH_TRIGGERS = ['motion_detected', 'audio_detected', 'inactivity_alert', 'object_found'] as const;

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

  const { config: backendConfig, isConnected: serverAnswers, status: backendStatus } = useBackendStatus();
  // This device's own server, as the interval's controls show it. A check of
  // the server marks it as connecting while it waits for an answer; the
  // controls keep their state through the check, so one in use stays.
  const [serverConnected, setServerConnected] = useState(serverAnswers);
  if (backendStatus?.api !== 'connecting' && serverConnected !== serverAnswers) setServerConnected(serverAnswers);
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
  // Which of Motion and Sound has given a reading since the watch started or
  // its camera changed; a meter stands empty until its first one.
  const [heard, setHeard] = useState({ motion: false, sound: false });
  // A reading the camera feed hands the page marks its meter as heard (a
  // measured zero included); so does any other change of the level in the
  // monitoring store.
  useEffect(() => useMonitoringStore.subscribe((state, before) => {
    const motion = state.motionScore !== before.motionScore;
    const sound = state.audioLevel !== before.audioLevel;
    if (!motion && !sound) return;
    setHeard((was) => ((was.motion || !motion) && (was.sound || !sound)
      ? was
      : { motion: was.motion || motion, sound: was.sound || sound }));
  }), []);
  // What the camera's frame shows when no picture is live: the failure of
  // the last start, or when a camera that was watching stopped.
  const [cameraFailure, setCameraFailure] = useState<CameraFailure | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [microphone, setMicrophone] = useState<MicrophoneProblem | null>(null);
  const otherTab = useOtherTabWatch();
  const cameraAsk = useCameraAsk();
  const captureRequestedRef = useRef(false);
  const serverRequestedRef = useRef(false);

  // Watch for: Motion and sound, or Lost and Found with the pet it compares
  // with. It compares while the watch runs; from 1024 px the pet's card
  // heads the right column.
  const watchFor = useWatchFor(captureRequested);
  const petsMarker = watchFor.petsMarker;
  const wide = useWideWatch();
  const phone = usePhoneWatch();
  const petCard = wide && watchFor.way === 'lost_found';

  // Media overlay state for Lost & Found alerts
  const [showMediaOverlay, setShowMediaOverlay] = useState(false);
  const [mediaOverlayData, setMediaOverlayData] = useState<{
    subjectName: string;
    images: string[];
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const matcherRef = useRef(getSubjectMatcher());

  // Settings store for security modes/presets
  const { activePresetId, activeSleepPreset, globalSettings, globalMute, toggleGlobalMute, timingSettings, getCooldownForSeverity } = useSettingsStore();
  const detectionFeatureSettings = useSettingsStore((state) => state.detectionFeatureSettings);
  const detectionZones = useSettingsStore((state) => state.detectionZones);
  // The watch runs at the preset, with the Motion and Audio set for this use on Settings > Detection laid over it.
  const { watchSettings: currentPreset, keptForUse, tuneWatch, resetWatch } = useWatchSettings();
  const keptNames = keptForUse.map((field) => (field === 'motionSensitivity' ? 'Motion' : 'Audio')).join(' and ');
  const [showOverrides, setShowOverrides] = useState(false);

  // URL parameter handling is done via PresetInitializer component below

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
        case 'alert': {
          // Only the running watch's own alerts sound: a late alert of a watch that has ended is
          // listed, new and silent.
          const streamId = message.payload?.streamId || '';
          const raised = captureRequestedRef.current && streamId !== '' && streamId === useMonitoringStore.getState().streamId;
          addAlert({
            id: message.payload?.id || newAlertId('server'),
            streamId,
            alertType: message.payload?.alertType,
            thumbnailUrl: message.payload?.thumbnailUrl,
            severity: message.payload?.severity || 'medium',
            message: message.payload?.message || 'Alert detected',
            timestamp: message.payload?.timestamp || new Date().toISOString(),
            acknowledged: false,
          }, { raised });
          break;
        }
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
    setCameraFailure(null);
    setStoppedAt(null);
    setMicrophone(null);
    captureRequestedRef.current = true;
    setCaptureRequested(true);
    setVideoSeen(false);
    forgetReadings();
  };

  // A new watch's meters start from its own camera's readings, never from
  // the last watch's.
  const forgetReadings = () => {
    setMotionZone(null);
    setPixelZoneStatus(null);
    setMotionScore(0);
    setAudioLevel(0);
    setHeard({ motion: false, sound: false });
  };

  // Start watching on the notice asks the other tabs again: one may have started a watch while
  // the notice stood open, and this tab then asks whether to watch here. With the notice answered
  // the watch starts at once.
  const startAfterNotice = () => (noticeAnswered() ? beginCapture : () => { void guard(beginCapture); });

  const startStream = (onBack?: () => void) => {
    // A click here turns the sound on in a browser that keeps it off until a tap.
    getSoundManager().unlockAudio();
    askBeforeStart(startAfterNotice(), onBack);
  };

  const stopStream = () => {
    stopOwnLostFoundSounds(true);
    forgetReadings();
    captureRequestedRef.current = false;
    setCaptureRequested(false);
    setVideoSeen(false);
    setStreaming(false);
    setStreamId(null);
    if (serverRequestedRef.current) sendMessage({ type: 'stop-stream' });
    serverRequestedRef.current = false;
  };

  // A failed start is named in the frame with its fix; a camera that was
  // watching and is lost says when it stopped.
  const handleCameraError = (error: Error & { cause?: unknown }) => {
    // A camera lost before its first picture never watched: its start failed.
    const lost = error.name === 'CameraLostError' && videoSeen;
    stopStream();
    if (lost) {
      setCameraFailure(null);
      setStoppedAt(Date.now());
    } else {
      setStoppedAt(null);
      setCameraFailure(cameraFailureOf(error.cause ?? error, Boolean(navigator.mediaDevices?.getUserMedia)));
    }
  };

  // A watch whose camera sends no picture (a muted camera, or another camera
  // chosen while it starts) is not shown as live: no picture is read then.
  const framePhase: FramePhase = captureRequested
    ? (!videoSeen ? 'starting' : isStreaming ? 'live' : 'paused')
    : cameraFailure ? 'failed' : stoppedAt !== null ? 'stopped' : 'off';

  // On a phone while watching, Stop watching is followed by the alert list and
  // the camera menu stands under the list.
  const cameraAfterList = phone && (framePhase === 'live' || framePhase === 'paused');

  // Another camera chosen after a failure is the way out of it: the frame
  // offers Start watching again. One chosen while watching starts its meters
  // from its own readings, never from the last camera's.
  const forgetReadingsRef = useRef(forgetReadings);
  forgetReadingsRef.current = forgetReadings;
  useEffect(() => {
    if (!captureRequestedRef.current) setCameraFailure(null);
    else forgetReadingsRef.current();
  }, [deviceId]);

  // The chosen camera that was unavailable and is connected again is the
  // other way out: once the browser lists it, the frame offers Start watching.
  useEffect(() => {
    if (cameraFailure !== 'gone') return;
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices || !media.addEventListener) return;
    let live = true;
    // Only the newest read of the devices counts: an older one that lands
    // after it lists what the browser had before.
    let reads = 0;
    const listed = async () => {
      const read = ++reads;
      try {
        const devices = await media.enumerateDevices();
        if (read !== reads) return;
        const cameras = devices.filter((device) => device.kind === 'videoinput');
        const back = deviceId ? cameras.some((device) => device.deviceId === deviceId) : cameras.length > 0;
        if (live && back && !captureRequestedRef.current) setCameraFailure(null);
      } catch {
        // A list the browser refuses leaves the failure named.
      }
    };
    media.addEventListener('devicechange', listed);
    return () => {
      live = false;
      media.removeEventListener('devicechange', listed);
    };
  }, [cameraFailure, deviceId]);

  const stopStreamRef = useRef(stopStream);
  stopStreamRef.current = stopStream;

  // While another tab watches, a start key here asks first; its second key
  // keeps the other tab.
  const { guard, dialog } = useStartGuard({ keep: 'Keep the other tab' });
  // The press turns the sound on before the other tabs answer: a browser that
  // keeps a page's sound off until a tap turns it on only inside the tap.
  const pressStart = (start: () => unknown) => (key: HTMLButtonElement) => {
    getSoundManager().unlockAudio();
    void guard(start, key);
  };

  // A start the dashboard's key asked for: the camera is open already, so the
  // watch starts with no second press. For Lost and Found the pet is chosen
  // first; a pet that is gone leaves a Motion and sound watch.
  const pendingStart = useRef<StartRequest | null>(null);
  useEffect(() => {
    pendingStart.current = pendingStart.current ?? takeStart('monitor');
    const start = pendingStart.current;
    if (!start) return;
    let live = true;
    void (async () => {
      let lostFound = false;
      if (start.way === 'lost-found' && start.pet) {
        const pet = await getSubjectProfile(start.pet);
        // Another tab that took over meanwhile dropped the start: nothing starts.
        if (!live || !startHeld(start)) return;
        if (pet && pet.type !== 'person') {
          lostFound = true;
          useLostFoundStore.getState().setActiveSubject(pet);
          useLostFoundStore.getState().startWatching();
        }
      }
      if (!live || !startHeld(start)) {
        if (lostFound) useLostFoundStore.getState().stopWatching();
        return;
      }
      // Watch for runs the way the dashboard's key named.
      useOnboardingStore.getState().setLostFoundChosen(lostFound);
      pendingStart.current = null;
      // On a device that has not answered the notice about alert pictures it opens first; Go
      // back closes the camera the dashboard opened for this start, and ends the pet's watch
      // this start began.
      startStream(() => {
        dropStart();
        if (lostFound) useLostFoundStore.getState().stopWatching();
      });
    })();
    return () => {
      live = false;
    };
    // Runs when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A camera held for this page and never taken is closed when the page is left.
  useEffect(() => dropStart, []);
  // The pet the watch compares with, as Watch for has it from the render that
  // starts the watch, so the other tabs and the dashboard hear of a Lost and
  // Found watch from its press.
  const watchedPet = watchFor.comparing && watchFor.pet ? watchFor.pet.id : undefined;

  // The other tabs hear of this watch from the press, before the camera is
  // asked for, so a press in another tab meanwhile asks first. This effect's
  // end is the watch's one end, whatever ended it: Stop Monitoring, Cancel
  // Starting, a camera that failed, another tab, or leaving the page.
  useEffect(() => {
    if (!captureRequested) return;
    const endAnnounce = announceWatch(watchedPet ? 'lost-found' : 'monitor', () => stopStreamRef.current());
    return () => {
      endAnnounce();
      dropStart();
    };
    // A change of pet is the same watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureRequested]);

  // A watch's times run from the moment this capture request first showed a
  // picture until it is stopped. A camera the browser holds back for a moment
  // and gives back is the same watch.
  const watching = captureRequested && videoSeen;
  useEffect(() => {
    if (!watching) return;
    forgetRaised();
    watchStarted();
    const endTimes = keepWatchTimes();
    return () => {
      endTimes();
      watchEnded();
      forgetRaised();
    };
  }, [watching]);

  useEffect(() => {
    if (watching) rememberWay(watchedPet ? 'lost-found' : 'monitor', watchedPet);
  }, [watching, watchedPet]);

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
    // A Resume nap still waiting for the other tabs' answer starts nothing.
    napRef.current = null;
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
  // this same page, has turned the sound on. While another tab watches it asks
  // first, as a start key does; the nap stands whatever the answer, so after
  // Cancel, End nap and Start Monitoring show. A reload or Back finds the kept
  // nap and waits for a tap: a browser keeps a new page's sound off until one,
  // so the nap's alarm and reminder could not sound. Resume nap is that tap.
  // The refs keep this mount's reading and its one question: React's Strict
  // Mode runs the effect twice, and the start comes with the answer, after
  // the unmount cleanup below has cleared captureRequestedRef.
  const [napWaitsForTap, setNapWaitsForTap] = useState(false);
  const napArrivalRef = useRef<{ nap: Nap; restored: boolean } | null | undefined>(undefined);
  const napAskedRef = useRef(false);
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
    if (napAskedRef.current) return;
    napAskedRef.current = true;
    // While another tab watches it asks first. Then, on a device that has not answered the
    // notice about alert pictures, the notice opens before the camera; Go back leaves the nap
    // waiting for Resume nap.
    void guard(() => askBeforeStart(startAfterNotice(), () => setNapWaitsForTap(true)));
    // Runs when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (captureRequested) setNapWaitsForTap(false); }, [captureRequested]);
  // At each start the picture store is tried and pictures past their age are deleted, then
  // every minute while the watch runs.
  useEffect(() => {
    if (!captureRequested) return;
    void startPictureWatch();
    return stopPictureWatch;
  }, [captureRequested]);
  // Resume nap resumes the nap it was pressed for: End nap while the other
  // tabs answer leaves that press with nothing to start.
  const resumeNap = (pressed: Nap | null) => () => {
    if (!pressed || napRef.current !== pressed) return false;
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

  // Leaving the page ends the watch with its sounds: Lost & Found's own and
  // every saved sound the watch's alerts played, a loop included.
  useEffect(() => () => {
    captureRequestedRef.current = false;
    useMonitoringStore.getState().setStreaming(false);
    useMonitoringStore.getState().setStreamId(null);
    useLostFoundStore.getState().stopWatching();
    stopOwnLostFoundSounds(true);
    getSoundManager().stopTriggers(WATCH_TRIGGERS);
  }, [stopOwnLostFoundSounds]);

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
  const [, setPixelChangedPixels] = useState(0);
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

  // The newest alert that asked for a notification, by tag, and each tag's last turn to show one.
  const notesAsked = useRef(new Map<string, number>());
  const noteTurns = useRef(new Map<string, Promise<void>>());

  /**
   * Asks the browser for an alert's notification: its title and body carry
   * every word. Where the person turned on Show the picture in alert
   * notifications, in a browser that shows a notification's picture, a Motion,
   * Picture change or Lost and Found alert's notification carries the camera's
   * picture with its box drawn in; it waits for that picture at most 300 ms
   * from the alert and then goes with its words alone. A Sound alert's
   * notification never carries a picture, and a picture that cannot be drawn
   * leaves the words. A notification ready after a newer alert of its event
   * asked for its own does not go: the newer one stands, a higher level's too.
   * The switch turned off before a notification goes, while its picture is
   * drawn or while it waits its turn, sends it with its words alone.
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

    // The event's identity is read at the alert: the event can end (Stop, a quiet spell) while
    // the picture is drawn. High and critical notifications stay up until dismissed; so do the
    // notifications of an event that has alerted at high or critical, since each replaces the
    // one before it. One tag an event, whatever its severity: a repeat, or a rise in severity,
    // replaces the event's notification in place of standing beside it, and a new event's
    // notification stands beside an earlier one that is kept up.
    const requireInteraction = event ? keepsNotificationUp(event) : severity === 'high' || severity === 'critical';
    const tag = event?.notifyTag ? `safeos-${title}-${event.notifyTag}` : `safeos-${title}`;
    const wantsPicture = () => picturesInNotifications() && showsNotificationPictures();
    forgetOldNotes(notesAsked.current, noteTurns.current, note.at);
    askNote(notesAsked.current, tag, note.at);

    let image: string | undefined;
    if (note.picture && note.kind !== 'sound' && wantsPicture()) {
      const left = Math.max(0, NOTIFICATION_WAIT_MS - (Date.now() - note.at));
      image = await Promise.race([
        note.picture.then(notificationCopy).catch(() => undefined),
        new Promise<undefined>((resolve) => { window.setTimeout(() => resolve(undefined), left); }),
      ]);
      // The person may have turned the picture off while it was drawn: the words go alone.
      if (!wantsPicture()) image = undefined;
    }

    const picture = image;
    // An event's notifications go to the browser one after another, in the order they are ready:
    // one a newer alert of the event asked for while this one waited does not go, so the newer
    // one stands, and a slower answer from the browser never puts an earlier one over a later one.
    await showInTurn(noteTurns.current, notesAsked.current, tag, note.at, () => getNotificationManager().show(title, {
      // The person may have turned the picture off while this waited its turn, or while the
      // browser finds the service worker that shows it: the words go alone. The picture is asked
      // for as the browser takes the notification.
      image: picture ? () => (wantsPicture() ? picture : undefined) : undefined,
      body,
      tag,
      // A repeat replaces the earlier notification with the same tag; renotify
      // makes it alert again. Without it the replacement is silent:
      // https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification
      renotify: true,
      requireInteraction,
      data: { title, severity },
      vibrate: severity === 'critical' ? [250, 100, 250, 100, 250] : severity === 'high' ? [200, 80, 200] : undefined,
    }));
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
   * record, or nothing when there is no frame to take. A sighting's picture is of `subjectId`, its pet.
   */
  const takePicture = useCallback((
    kind: AlertKind,
    at: number,
    source: ImageData | CanvasImageSource | null | undefined,
    width: number,
    height: number,
    box: Box | null,
    subjectId?: string,
  ): { pictureId: string; picture: Promise<PictureSet> } | undefined => {
    if (!source || !(width > 0) || !(height > 0)) return undefined;
    const pictureId = newPictureId(at);
    const picture = capturePictureSet({ id: pictureId, kind, at, source, sourceWidth: width, sourceHeight: height, sourceBox: box });
    holdPicture(picture, pictureId, subjectId);
    return { pictureId, picture };
  }, []);

  // The live picture's box: where the newest Motion or Picture change alert's change was, for
  // 10 seconds from the alert. One box at a time: a newer alert's box takes its place and
  // starts its own 10 seconds; an alert with no box (a Sound alert, a change with no region)
  // leaves the box that stands.
  const [liveBox, setLiveBox] = useState<LiveAlertBox | null>(null);
  // `watch` moves on each time the box is cleared (the watch stopped): a picture that comes after
  // that belongs to an earlier watch and draws no box.
  const liveBoxRef = useRef<{ at: number; timer: number | null; watch: number }>({ at: 0, timer: null, watch: 0 });
  const showLiveBox = useCallback((
    kind: AlertKind,
    at: number,
    taken: { pictureId: string; picture: Promise<PictureSet> } | undefined,
    lines: [string] | [string, string] = [plateLine(kind, at)],
  ) => {
    if (!taken) return;
    const watch = liveBoxRef.current.watch;
    void taken.picture.then((set) => {
      if (watch !== liveBoxRef.current.watch) return;
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
    liveBoxRef.current = { at: 0, timer: null, watch: liveBoxRef.current.watch + 1 };
    setLiveBox(null);
  }, []);
  useEffect(() => clearLiveBox, [clearLiveBox]);
  // The live picture's box belongs to the watch and the camera that raised it: it leaves when the
  // watch stops or another camera is chosen, and a picture still drawn from the camera before draws none.
  useEffect(() => {
    if (!captureRequested) clearLiveBox();
  }, [captureRequested, clearLiveBox]);
  const boxCamera = useRef(deviceId);
  useEffect(() => {
    if (boxCamera.current === deviceId) return;
    boxCamera.current = deviceId;
    clearLiveBox();
  }, [deviceId, clearLiveBox]);

  // A sighting's alert, in the check that raised it. The picture is cut from the comparison's own
  // frame of that check, before any JPEG is made of it, with the region as its box; a region
  // that is missing, empty or outside the frame leaves the picture alone. The entry, the live
  // box, the pet's sound, the notification and the overlay come with each of the run's alerts,
  // never with every check, and nothing is kept for a check under the alert line. A pet that a
  // clear of all local data in another tab took away, before this tab heard of it, raises nothing:
  // the watch read it under the account marker that clear replaced.
  raiseSightingRef.current = (result: MatchResult, now: number, repeat: boolean) => {
    const subject = activeSubject;
    if (!subject) return;
    if (readAccountClearMarker() !== petsMarker()) return;
    const event = sightingEventRef.current;
    const canvas = matcherRef.current.frameCanvas();
    const [width, height] = canvas ? [canvas.width, canvas.height] : [0, 0];
    const taken = canvas
      ? takePicture('sighting', now, canvas, width, height, alertBox('sighting', boxFromRegion(result.region, width, height), width, height), subject.id)
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
        images: subject.referenceImages,
      });
      setShowMediaOverlay(true);
    }
  };

  const handleMotion = useCallback((score: number) => {
    setMotionScore(score);
    setHeard((was) => (was.motion ? was : { ...was, motion: true }));
  }, [setMotionScore]);

  // The Motion meter reads the zone whose reading stands highest over its own
  // line, a full-screen zone with its own sensitivity included: the zone and
  // the line an alert reads.
  const [motionZone, setMotionZone] = useState<{ score: number; threshold: number } | null>(null);

  const handleMotionZones = useCallback((zones: Array<{ id: string; name: string; score: number }>, frames?: CheckFrames) => {
    if (!currentPreset.motionDetectionEnabled || !isStreaming) {
      endDetectorEvent(motionEventRef.current);
      return;
    }

    const globalThreshold = sensitivityToThreshold(currentPreset.motionSensitivity);
    const now = Date.now();

    let best: { id: string; name: string; score: number; threshold: number; delta: number } | null = null;
    let highest: { score: number; threshold: number; delta: number } | null = null;
    for (const z of zones) {
      const override = detectionZones.find((dz) => dz.id === z.id)?.sensitivityOverride?.motion;
      const threshold = override !== undefined ? sensitivityToThreshold(override) : globalThreshold;
      const delta = z.score - threshold;
      if (!highest || delta > highest.delta) highest = { score: z.score, threshold, delta };
      if (delta >= 0 && (!best || delta > best.delta)) {
        best = { id: z.id, name: z.name, score: z.score, threshold, delta };
      }
    }
    setMotionZone(highest ? { score: highest.score, threshold: highest.threshold } : null);

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
      // A cell counts at the line that raised the alert, up to the detector's own 10 per cent, so a
      // change spread thin over the picture keeps its box.
      frames?.previous
        ? boxFromCells(detectRegionalMotion(frames.previous, frame, Math.max(0.001, Math.min(0.1, best.threshold / 100))), frame.width, frame.height, zone)
        : null,
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
    setHeard((was) => (was.sound ? was : { ...was, sound: true }));

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
    // The parts that changed: across the picture, or inside the zone that raised the alert.
    let chosenHotspots = result.hotspots ?? [];

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
          chosenHotspots = stat?.hotspots ?? [];
          triggered = changedPx >= zoneThresholdPx;
        }
      }
    }

    const ratioNow = pictureChangeRatio({
      useAbsoluteThreshold: currentPreset.useAbsoluteThreshold,
      changedPx: chosenChangedPx,
      thresholdPx: chosenThresholdPx,
      difference: result.difference,
    });
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

    // The box goes round the parts of the picture that changed, inside the zone that raised the
    // alert where one did; a change over more than half of the frame, or one with no part to name,
    // keeps the picture alone.
    const frame = frames?.current;
    const taken = frame && takePicture('picture-change', now, frame, frame.width, frame.height, alertBox(
      'picture-change',
      boxFromHotspots(chosenHotspots, frame.width, frame.height),
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
  // The meters: each level waits for the camera's first picture after a press
  // ---------------------------------------------------------------------------

  const metersLive = framePhase === 'live';
  const motionByZone = metersLive && motionZone !== null;
  const meterRows: MeterRow[] = [
    {
      kind: 'motion',
      reading: levelMeter(
        metersLive && (heard.motion || motionByZone) ? (motionByZone ? motionZone!.score : motionScore) : null,
        motionByZone ? motionZone!.threshold : sensitivityToThreshold(currentPreset.motionSensitivity),
        currentPreset.motionDetectionEnabled,
      ),
    },
    {
      kind: 'sound',
      reading: levelMeter(
        metersLive && heard.sound ? audioLevel : null,
        sensitivityToThreshold(currentPreset.audioSensitivity),
        currentPreset.audioDetectionEnabled,
      ),
    },
  ];
  const pictureChange = pictureChangeMeter(
    metersLive && pixelZoneStatus ? { ratio: pixelZoneStatus.ratio, triggered: pixelZoneStatus.triggered } : null,
    currentPreset.pixelDetectionEnabled,
  );
  if (pictureChange) meterRows.push({ kind: 'picture-change', reading: pictureChange });
  const meterPet = watchFor.comparing && watchFor.pet
    ? { name: watchFor.pet.name, photo: watchFor.pet.referenceImages?.[0] ?? null }
    : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main
      className={`watch look-part watch-grid${cameraAfterList ? ' watch-grid--camera-after' : ''}`}
      onFocus={(event) => {
        const control = event.target;
        if (!phone || !event.currentTarget.contains(control) || control.closest('dialog, [role="dialog"], [role="alertdialog"]')) return;
        // Let the browser scroll on focus before clearing the fixed phone bar.
        requestAnimationFrame(() => {
          if (document.activeElement !== control) return;
          const bar = document.querySelector('nav.phone-bar');
          if (!bar) return;
          const overlap = control.getBoundingClientRect().bottom - bar.getBoundingClientRect().top;
          if (overlap >= 0) window.scrollBy({ top: overlap + 8, behavior: 'instant' });
        });
      }}
    >
      <h1 className="sr-only">Motion and sound</h1>

      <div className="watch-grid__bar">
        <WatchForChooser
          watchFor={watchFor}
          watching={captureRequested}
          wide={wide}
          end={<MuteAlerts muted={globalMute} onToggle={toggleGlobalMute} />}
          afterBar={<MutedLine muted={globalMute} />}
        />
      </div>

      {!captureRequested && nap && (
        <div className="watch-grid__nap watch-nap">
          {napWaitsForTap && (
            <p role="status" className="watch-nap__line">
              This nap stopped watching when the page reloaded, and the browser keeps its sound off until you tap. Resume nap turns the sound on and starts the camera again.
            </p>
          )}
          <KeyRow className="watch-nap__keys">
            {napWaitsForTap && (
              <button type="button" className="key key--outline" onClick={(event) => pressStart(resumeNap(nap))(event.currentTarget)}>
                Resume nap
              </button>
            )}
            <button type="button" className="key key--outline" onClick={endNap}>
              End nap
            </button>
          </KeyRow>
        </div>
      )}

      <div className="watch-grid__frame">
        <WatchFrame
          phase={framePhase}
          failure={cameraFailure}
          stoppedAt={stoppedAt}
          otherTab={otherTab}
          askLine={cameraAsk !== 'granted'}
          noPetLine={watchFor.way === 'lost_found' && watchFor.petsRead === 'ready' && !watchFor.pet}
          onStart={pressStart(startStream)}
          onTryAgain={pressStart(startStream)}
          strip={(framePhase === 'starting' || framePhase === 'live' || framePhase === 'paused') && (
            <Meters rows={meterRows} pet={meterPet} microphone={microphone} />
          )}
        >
          <CameraFeed
            bare
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
            onError={handleCameraError}
            onMicrophone={setMicrophone}
            className="watch-frame__video"
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
        </WatchFrame>
      </div>

      <div className="watch-grid__controls watch-controls">
        {framePhase === 'starting' && (
          <button type="button" className="key key--outline watch-stop" onClick={stopWatching}>
            Cancel
          </button>
        )}
        {(framePhase === 'live' || framePhase === 'paused') && (
          <button type="button" className="key key--outline watch-stop" onClick={stopWatching}>
            Stop watching
          </button>
        )}
        {!cameraAfterList && <CameraPicker refreshKey={isStreaming} className="watch-camera" />}
      </div>

      {/* The list, on a phone the camera menu while watching, and the
          statement come before the settings in the page, as they stand on
          screen, so Tab reaches them in that order. */}
      <div className="watch-grid__side">
        {petCard && <WatchForPet watchFor={watchFor} layout="card" />}
        <AlertPanel showMute={false} />
        {watchFor.comparing && (
          <Link href={LOCAL_TIMELINE_HREF} className="link-row">{OPEN_IN_HISTORY}</Link>
        )}
      </div>

      {cameraAfterList && (
        <div className="watch-grid__camera">
          <CameraPicker refreshKey={isStreaming} className="watch-camera" />
        </div>
      )}

      <p className="watch-grid__statement watch-statement">
        <Brand>SafeOS</Brand> adds an alert. It does not replace a person nearby. A phone or a browser can sleep, lose power or drop the camera, so stay within reach.
      </p>

      <div className="watch-grid__settings">
        <SettingsFold>
          <Link href="/nap/" className="link-row">Nap Mode</Link>
          <div>
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
                {/* How often frames go to this device's own server: shown only while one is connected. */}
                {serverConnected && (
                  <div className="text-center p-2 bg-gray-900/50 rounded-lg">
                    <div className="text-lg font-bold text-amber-400">
                      {currentPreset.analysisInterval}s
                    </div>
                    <div className="text-xs sm:text-[10px] text-gray-500 uppercase">Interval</div>
                  </div>
                )}
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

                  {/* How often frames go to this device's own server: shown only while one is connected. */}
                  {serverConnected && (
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
                  )}

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

          <InlineSettingsPanel defaultExpanded={['detection']} serverConnected={serverConnected} />
        </SettingsFold>
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
          images={mediaOverlayData.images}
        />
      )}

      {picturesNotice}
      {dialog}
    </main>
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
