'use client';

/**
 * Wildlife page
 * 
 * Main interface for animal/wildlife detection and monitoring.
 * Features dual alert controls for large and small animals.
 * 
 * @module app/wildlife/page
 */

import { animalAtTime, timeWords } from '@/lib/alert-pictures/words';
import { showBrowserNotification } from '@/lib/browser-notification';
import { useState, useEffect, useCallback, useRef, type MouseEvent } from 'react';
import Link from 'next/link';
import { ModelDownloadProgress } from '@/components/ModelDownloadProgress';
import { useDetectionModel } from '@/lib/detection-model';
import { CameraFeed } from '../../components/CameraFeed';
import { KeyRow } from '../../components/app/KeyRow';
import {
  IconShield,
  IconCamera,
  IconAlertTriangle,
  IconSettings,
  IconChevronLeft,
  IconVolume2,
  IconVolumeX,
  IconBell,
  IconBellOff,
  IconWildlife,
  IconBear,
  IconRodent,
  IconActivity,
} from '../../components/icons';
import { useAnimalAlertStore, shouldAlert, sortByPriority } from '../../stores/animal-alert-store';
import { 
  getAnimalDetector, 
  createAnimalAnnouncement,
  getDangerColor,
  getDangerBadgeColors,
  getDangerLabel,
  getSizeIcon,
  type AnimalDetection,
} from '../../lib/animal-detection';
import { getTTSManager } from '../../lib/tts-alerts';
import { getSoundManager } from '../../lib/sound-manager';
import { keepWatchTimes, rememberWay, watchEnded, watchStarted } from '../../lib/watch-session';
import { announceWatch } from '../../lib/tab-channel';
import { dropStart, takeStart, type StartRequest } from '../../lib/camera-handoff';
import { useStartGuard } from '../../lib/start-guard';

// =============================================================================
// Sub-Components
// =============================================================================

interface FlashOverlayProps {
  isActive: boolean;
  color: string;
}

function FlashOverlay({ isActive, color }: FlashOverlayProps) {
  if (!isActive) return null;
  return (
    <div
      className="fixed inset-0 z-40 pointer-events-none animate-pulse"
      style={{ backgroundColor: color, opacity: 0.2 }}
    />
  );
}

interface DetectionCardProps {
  detection: AnimalDetection;
  onAcknowledge?: () => void;
}

function DetectionCard({ detection, onAcknowledge }: DetectionCardProps) {
  const dangerColor = getDangerColor(detection.dangerLevel);
  
  return (
    <div
      className="p-3 rounded-lg border transition-all"
      style={{ borderColor: dangerColor, backgroundColor: `${dangerColor}10` }}
    >
      {/* A badge that leaves no room for the name stands under it, so neither breaks inside a word. */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-2xl">{getSizeIcon(detection.sizeCategory)}</span>
        <div className="min-w-0 flex-[1_1_10ch]">
          <div className="font-semibold text-white">{detection.displayName}</div>
          <div className="text-xs text-slate-400">
            {timeWords(detection.timestamp)}
          </div>
        </div>
        <div
          className="px-2 py-1 rounded text-base font-bold"
          style={getDangerBadgeColors(detection.dangerLevel)}
        >
          {getDangerLabel(detection.dangerLevel)}
        </div>
      </div>
      {onAcknowledge && (
        <button
          onClick={onAcknowledge}
          className="mt-2 w-full py-1 text-xs text-slate-400 hover:text-white border border-slate-700 rounded"
        >
          Acknowledge
        </button>
      )}
    </div>
  );
}

interface StatsCardProps {
  label: string;
  value: number | string;
  color: string;
  icon?: React.ReactNode;
}

function StatsCard({ label, value, color, icon }: StatsCardProps) {
  return (
    <div className={`p-4 rounded-lg border bg-slate-800/50`} style={{ borderColor: color }}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-slate-400 uppercase">{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

interface AlertToggleProps {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  icon: React.ReactNode;
  color: string;
}

function AlertToggle({ label, description, enabled, onChange, icon, color }: AlertToggleProps) {
  return (
    <button
      type="button"
      className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
        enabled ? 'bg-slate-800/50' : 'bg-slate-900/30 opacity-60'
      }`}
      style={{ borderColor: enabled ? color : '#374151' }}
      onClick={() => onChange(!enabled)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: enabled ? color : '#374151' }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-[1_1_10ch]">
          <div className="font-medium text-white">{label}</div>
          <div className="text-xs text-slate-400">{description}</div>
        </div>
        <div
          className={`ml-auto w-12 h-6 shrink-0 rounded-full p-1 transition-colors ${
            enabled ? 'bg-emerald-500' : 'bg-slate-600'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </div>
      </div>
    </button>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function WildlifePage() {
  const {
    settings,
    isMonitoring,
    currentDetections,
    detectionHistory,
    setMonitoring,
    addDetections,
    clearCurrentDetections,
    acknowledgeDetection,
    updateSettings,
    getLargeAnimalCount,
    getSmallAnimalCount,
    getDangerousCount,
  } = useAnimalAlertStore();

  const download = useDetectionModel();
  const [detectorReady, setDetectorReady] = useState(false);
  // The animal check could not start on this device (its model files are
  // stored, but the browser could not run them).
  const [detectorFailed, setDetectorFailed] = useState(false);
  const modelStatus = !download.setupComplete
    ? 'idle'
    : download.status === 'ready' && detectorFailed
      ? 'error'
      : download.status === 'ready' && !detectorReady ? 'loading' : download.status;
  const [showSettings, setShowSettings] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [flashColor, setFlashColor] = useState('#ef4444');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectionLoopBusyRef = useRef(false);
  const detectorRef = useRef(getAnimalDetector({
    confidenceThreshold: settings.confidenceThreshold,
    motionThreshold: settings.motionThreshold,
  }));

  // Keep detector config in sync with settings
  useEffect(() => {
    detectorRef.current.updateConfig({
      confidenceThreshold: settings.confidenceThreshold,
      motionThreshold: settings.motionThreshold,
      enableLargeAnimalAlerts: settings.largeAnimalAlertEnabled,
      enableSmallAnimalAlerts: settings.smallAnimalAlertEnabled,
      captureFrames: settings.captureFrames,
    });
  }, [
    settings.confidenceThreshold,
    settings.motionThreshold,
    settings.largeAnimalAlertEnabled,
    settings.smallAnimalAlertEnabled,
    settings.captureFrames,
  ]);

  // Initialize frame processing only after the agreed model is ready.
  useEffect(() => {
    if (download.status !== 'ready' || !download.setupComplete) return;
    let cancelled = false;
    const detector = detectorRef.current;
    setDetectorFailed(false);
    void detector.initialize().then(() => {
      if (!cancelled) setDetectorReady(true);
    }).catch(() => {
      if (cancelled) return;
      setDetectorReady(false);
      setDetectorFailed(true);
    });
    return () => {
      cancelled = true;
      detector.dispose();
    };
  }, [download.status, download.setupComplete]);

  // Initialize TTS
  useEffect(() => {
    if (settings.alertMode === 'voice' || settings.alertMode === 'both') {
      const tts = getTTSManager();
      tts.initialize().catch(console.error);
    }
  }, [settings.alertMode]);

  // Handle detections
  const handleDetections = useCallback((detections: AnimalDetection[]) => {
    if (detections.length === 0) return;

    // Filter based on settings
    const alertableDetections = detections.filter(d => shouldAlert(d, settings));
    if (alertableDetections.length === 0) return;

    // Add to store
    addDetections(alertableDetections);

    // Sort by priority for announcements
    const sorted = sortByPriority(alertableDetections);
    const primary = sorted[0];

    // Play alerts
    if (settings.alertMode === 'voice' || settings.alertMode === 'both') {
      const tts = getTTSManager();
      const announcement = createAnimalAnnouncement(primary);
      tts.speak(announcement);
    }

    if (settings.alertMode === 'sound' || settings.alertMode === 'both') {
      const severity =
        primary.dangerLevel === 'extreme'
          ? 'critical'
          : primary.dangerLevel === 'high'
            ? 'high'
            : primary.dangerLevel === 'medium'
              ? 'medium'
              : 'low';
      getSoundManager().playForSeverity(severity, { loop: false });
    }

    // Browser notification
    if (settings.browserNotifications && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        const isDangerous = primary.dangerLevel === 'high' || primary.dangerLevel === 'extreme';
        void showBrowserNotification(
          isDangerous ? 'Wildlife warning' : 'Wildlife alert',
          {
            body: `${animalAtTime(primary.displayName, primary.timestamp)}.`,
            icon: '/icons/icon-192.png',
            tag: 'wildlife-alert',
            requireInteraction: isDangerous,
          }
        );
      }
    }

    // Optional screen flash for immediate attention
    if (settings.flashScreen) {
      const color = getDangerColor(primary.dangerLevel);
      setFlashColor(color);
      setIsFlashing(true);
      window.setTimeout(() => setIsFlashing(false), 900);
    }
  }, [settings, addDetections]);

  // Detection loop (processes the camera's <video> directly)
  useEffect(() => {
    if (!isMonitoring || modelStatus !== 'ready') return;

    const intervalMs = 1000;
    let cancelled = false;

    const id = window.setInterval(async () => {
      if (cancelled) return;
      if (detectionLoopBusyRef.current) return;
      const video = videoRef.current;
      if (!video) return;

      detectionLoopBusyRef.current = true;
      try {
        const result = await detectorRef.current.processFrame(video);
        // A sighting that lands after its run ended counts for nothing.
        if (cancelled) return;
        if (result && result.animals.length > 0) {
          handleDetections(result.animals);
        }
      } finally {
        detectionLoopBusyRef.current = false;
      }
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isMonitoring, modelStatus, handleDetections]);

  // While another tab watches, the start key asks first; Stop stops at once.
  const { guard, dialog } = useStartGuard();
  const toggleMonitoring = (event: MouseEvent<HTMLButtonElement>) => {
    if (isMonitoring) {
      setMonitoring(false);
      clearCurrentDetections();
    } else {
      void guard(() => setMonitoring(true), event.currentTarget);
    }
  };

  // A start the dashboard's key asked for: the watch starts with the camera
  // the key opened. The start is kept in a ref, so a mount effect run twice,
  // as React runs it in development, starts the watch all the same.
  const startAsked = useRef<StartRequest | null>(null);
  useEffect(() => {
    startAsked.current = startAsked.current ?? takeStart('wildlife');
    if (startAsked.current) useAnimalAlertStore.getState().setMonitoring(true);
  }, []);

  // A watch whose animal check cannot start ends: its camera closes, and the
  // other tabs hear that nothing watches here.
  useEffect(() => {
    if (isMonitoring && detectorFailed) useAnimalAlertStore.getState().setMonitoring(false);
  }, [isMonitoring, detectorFailed]);

  // The watch runs from its start until it stops, and the other tabs hear of
  // it from the start. This effect's end is the watch's one end, whatever
  // stopped it: the page's key, another tab, or leaving the page.
  useEffect(() => {
    if (!isMonitoring) return;
    rememberWay('wildlife');
    watchStarted();
    const endTimes = keepWatchTimes();
    const endAnnounce = announceWatch('wildlife', () => useAnimalAlertStore.getState().setMonitoring(false));
    return () => {
      endTimes();
      watchEnded();
      endAnnounce();
      dropStart();
      useAnimalAlertStore.getState().clearCurrentDetections();
      getTTSManager().stop();
    };
  }, [isMonitoring]);

  // Leaving the page ends its watch: the store keeps no running watch for the
  // next time the page opens. A camera held for a start the page never took
  // is closed.
  useEffect(() => () => {
    const store = useAnimalAlertStore.getState();
    store.setMonitoring(false);
    store.clearCurrentDetections();
    getTTSManager().stop();
    dropStart();
  }, []);

  const recentDetections = detectionHistory.slice(0, 5);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <FlashOverlay isActive={isFlashing} color={flashColor} />
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm relative z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="way-head">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-slate-400 hover:text-white"
              >
                <IconChevronLeft size={20} />
                <span className="hidden sm:inline">Back</span>
              </Link>
              <div className="flex items-center gap-2">
                <IconWildlife size={22} className="text-emerald-400" />
                <h1 className="text-xl font-bold text-white">Wildlife</h1>
              </div>
            </div>

            <KeyRow>
              {/* Model Status */}
              <div
                className={`px-2 py-1 rounded text-xs font-medium ${
                  modelStatus === 'ready'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : modelStatus === 'loading'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                AI: {modelStatus === 'ready' ? 'Ready' : modelStatus === 'loading' ? 'Loading...' : modelStatus === 'error' ? 'Error' : 'Not downloaded'}
              </div>

              {/* Settings Toggle */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 ${
                  showSettings
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <IconSettings size={16} />
                Settings
              </button>

              {/* Start/Stop Button */}
              <button
                onClick={toggleMonitoring}
                disabled={!isMonitoring && modelStatus !== 'ready'}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isMonitoring
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {isMonitoring ? 'Stop' : 'Start'} Monitoring
              </button>
            </KeyRow>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 [overflow-wrap:anywhere]">
        <ModelDownloadProgress className="mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Camera Feed */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <IconCamera size={18} />
                  Camera Feed
                </h2>
                {isMonitoring && (
                  <span className="flex items-center gap-2 text-emerald-400 text-sm">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    Monitoring Active
                  </span>
                )}
              </div>
              {detectorFailed && (
                <p role="alert" className="p-4 text-sm text-amber-200 border-b border-slate-700">
                  Wildlife could not start its animal check in this browser. Reload the page to try again.
                </p>
              )}
              <CameraFeed
                scenario="pet"
                enabled={isMonitoring && modelStatus === 'ready'}
                audioEnabled={false}
                onError={() => {
                  // A camera that fails or is lost ends the watch; Start Monitoring starts it again.
                  const store = useAnimalAlertStore.getState();
                  store.setMonitoring(false);
                  store.clearCurrentDetections();
                }}
                onVideoReady={(video) => {
                  videoRef.current = video;
                }}
                className="aspect-video"
              />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-4">
              <StatsCard
                label="Large Animals"
                value={getLargeAnimalCount()}
                color="#f59e0b"
                icon={<IconBear size={16} className="text-amber-400" />}
              />
              <StatsCard
                label="Small Animals"
                value={getSmallAnimalCount()}
                color="#22c55e"
                icon={<IconRodent size={16} className="text-emerald-400" />}
              />
              <StatsCard
                label="Dangerous"
                value={getDangerousCount()}
                color="#ef4444"
                icon={<IconAlertTriangle size={16} className="text-red-400" />}
              />
              <StatsCard
                label="Total"
                value={detectionHistory.length}
                color="#3b82f6"
                icon={<IconActivity size={16} className="text-blue-400" />}
              />
            </div>

            {/* Alert Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <AlertToggle
                label="Large Animal Alerts"
                description="Bears, deer, coyotes, wolves"
                enabled={settings.largeAnimalAlertEnabled}
                onChange={(enabled) => updateSettings({ largeAnimalAlertEnabled: enabled })}
                icon={<IconBear size={20} className="text-amber-400" />}
                color="#f59e0b"
              />
              <AlertToggle
                label="Small Animal Alerts"
                description="Rodents, rabbits, squirrels"
                enabled={settings.smallAnimalAlertEnabled}
                onChange={(enabled) => updateSettings({ smallAnimalAlertEnabled: enabled })}
                icon={<IconRodent size={20} className="text-emerald-400" />}
                color="#22c55e"
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Sightings kept until Clear All or the watch's end */}
            {currentDetections.length > 0 && (
              <div className="bg-slate-900 border border-red-500/50 rounded-xl p-4">
                <h3 className="font-semibold text-red-400 mb-3 flex items-center gap-2">
                  <IconAlertTriangle size={18} />
                  Sightings to clear
                </h3>
                <div className="space-y-2">
                  {currentDetections.slice(0, 3).map((detection) => (
                    <DetectionCard key={detection.id} detection={detection} />
                  ))}
                </div>
                <button
                  onClick={clearCurrentDetections}
                  className="mt-3 w-full py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg"
                >
                  Clear All
                </button>
              </div>
            )}

            {/* Recent History */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <h3 className="font-semibold text-white mb-3">Recent sightings</h3>
              {recentDetections.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  Sightings show here while this device watches.
                </p>
              ) : (
                <div className="space-y-2">
                  {recentDetections.map((detection) => (
                    <DetectionCard
                      key={detection.id}
                      detection={detection}
                      onAcknowledge={() => acknowledgeDetection(detection.id)}
                    />
                  ))}
                </div>
              )}
              {detectionHistory.length > 5 && (
                <Link
                  href="/history/"
                  className="block mt-3 text-center text-sm text-emerald-400 hover:text-emerald-300"
                >
                  View All ({detectionHistory.length})
                </Link>
              )}
            </div>

            {/* Voice/Sound Controls */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <h3 className="font-semibold text-white mb-3">Alert Mode</h3>
              <div className="grid grid-cols-2 gap-2">
                {(['voice', 'sound', 'both', 'silent'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => updateSettings({ alertMode: mode })}
                    className={`p-3 rounded-lg text-sm font-medium capitalize transition-colors ${
                      settings.alertMode === mode
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {mode === 'voice' && <IconVolume2 size={16} className="inline mr-1" />}
                    {mode === 'sound' && <IconBell size={16} className="inline mr-1" />}
                    {mode === 'silent' && <IconVolumeX size={16} className="inline mr-1" />}
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Settings Panel */}
      {showSettings && (
        <div
          className="fixed inset-0 z-[110] bg-black/50"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="absolute right-0 top-0 h-full w-full max-w-md bg-slate-900 border-l border-slate-700 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Wildlife Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-6">
              {/* Detection Settings */}
              <div>
                <h3 className="font-medium text-white mb-3">Detection</h3>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="wildlife-alert-line" className="text-sm text-slate-400">Alert line</label>
                    <input
                      type="range"
                      id="wildlife-alert-line"
                      min={10}
                      max={90}
                      value={settings.confidenceThreshold * 100}
                      onChange={(e) => updateSettings({ 
                        confidenceThreshold: parseInt(e.target.value) / 100 
                      })}
                      className="w-full mt-1"
                    />
                    <div className="text-right text-xs text-slate-500">
                      {Math.round(settings.confidenceThreshold * 100)}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="wildlife-movement" className="text-sm text-slate-300">Movement to start the check</label>
                    <p id="wildlife-movement-help" className="text-sm text-slate-400">
                      The check reads a grid. It starts when the average change in any one part of the picture reaches this line.
                    </p>
                    <input
                      type="range"
                      id="wildlife-movement"
                      aria-describedby="wildlife-movement-help"
                      min={5}
                      max={50}
                      value={settings.motionThreshold}
                      onChange={(e) => updateSettings({ 
                        motionThreshold: parseInt(e.target.value) 
                      })}
                      className="w-full mt-1"
                    />
                    <div className="text-right text-xs text-slate-500">
                      {settings.motionThreshold}
                    </div>
                  </div>
                </div>
              </div>

              {/* Alert Volume */}
              <div>
                <h3 className="font-medium text-white mb-3">Alert Volume</h3>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.alertVolume}
                  onChange={(e) => updateSettings({ 
                    alertVolume: parseInt(e.target.value) 
                  })}
                  className="w-full"
                />
                <div className="text-right text-xs text-slate-500">
                  {settings.alertVolume}%
                </div>
              </div>

              {/* Danger Alerts */}
              <div>
                <h3 className="font-medium text-white mb-3">Danger Level Alerts</h3>
                <label className="flex items-center gap-3 mb-2">
                  <input
                    type="checkbox"
                    checked={settings.dangerAlertEnabled}
                    onChange={(e) => updateSettings({ dangerAlertEnabled: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-slate-300">High/Extreme Danger</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.cautionAlertEnabled}
                    onChange={(e) => updateSettings({ cautionAlertEnabled: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-slate-300">Medium (Caution)</span>
                </label>
              </div>

              {/* Notifications */}
              <div>
                <h3 className="font-medium text-white mb-3">Notifications</h3>
                <label className="flex items-center gap-3 mb-2">
                  <input
                    type="checkbox"
                    checked={settings.browserNotifications}
                    onChange={(e) => updateSettings({ browserNotifications: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-slate-300">Browser Notifications</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.flashScreen}
                    onChange={(e) => updateSettings({ flashScreen: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-slate-300">Flash Screen</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {dialog}
    </div>
  );
}

























