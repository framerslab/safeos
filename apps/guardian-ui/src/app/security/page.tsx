'use client';

/**
 * Security Mode Page
 * 
 * Main interface for the anti-theft/intruder detection system.
 * Combines live camera feed, person detection, and alert controls.
 * 
 * @module app/security/page
 */

import { showBrowserNotification } from '@/lib/browser-notification';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { SecurityPanel } from '../../components/SecurityPanel';
import { IntrusionGallery } from '../../components/IntrusionGallery';
import { CameraFeed } from '../../components/CameraFeed';
import {
  IconShield,
  IconCamera,
  IconAlertTriangle,
  IconSettings,
  IconChevronLeft,
} from '../../components/icons';
import { useSecurityStore, createIntrusionFrame } from '../../stores/security-store';
import { getPersonDetector, PersonDetectionResult, calculatePersonChange } from '../../lib/person-detection';
import { startSecurityAlert, stopSecurityAlert } from '../../lib/tts-alerts';
import { saveIntrusionFrame, type IntrusionFrameDB } from '../../lib/client-db';

// =============================================================================
// Flash Overlay Component
// =============================================================================

interface FlashOverlayProps {
  isActive: boolean;
  color?: string;
}

function FlashOverlay({ isActive, color = '#ff0000' }: FlashOverlayProps) {
  if (!isActive) return null;

  return (
    <div
      className="fixed inset-0 z-40 pointer-events-none animate-pulse"
      style={{
        backgroundColor: color,
        opacity: 0.3,
      }}
    />
  );
}

// =============================================================================
// Audio Player Component
// =============================================================================

interface SirenPlayerProps {
  isActive: boolean;
  volume: number;
}

function SirenPlayer({ isActive, volume }: SirenPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (isActive) {
      // Create audio context for siren sound
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextClass();
        }
        
        const ctx = audioContextRef.current;
        
        // Create oscillator for siren effect
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = 800;
        gain.gain.value = volume / 100;
        
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        
        oscillator.start();
        oscillatorRef.current = oscillator;
        gainRef.current = gain;
        
        // Modulate frequency for siren effect
        const modulate = () => {
          if (!oscillatorRef.current) return;
          const now = ctx.currentTime;
          oscillatorRef.current.frequency.setValueAtTime(800, now);
          oscillatorRef.current.frequency.linearRampToValueAtTime(1200, now + 0.5);
          oscillatorRef.current.frequency.linearRampToValueAtTime(800, now + 1);
        };
        
        modulate();
        const intervalId = setInterval(modulate, 1000);
        
        return () => {
          clearInterval(intervalId);
          oscillator.stop();
          oscillator.disconnect();
          gain.disconnect();
          oscillatorRef.current = null;
          gainRef.current = null;
        };
      } catch (error) {
        console.error('[SirenPlayer] Failed to create audio:', error);
      }
    } else {
      // Stop oscillator
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.stop();
          oscillatorRef.current.disconnect();
        } catch {}
        oscillatorRef.current = null;
      }
    }
  }, [isActive, volume]);

  return null;
}

// =============================================================================
// Person Count Display
// =============================================================================

interface PersonCountDisplayProps {
  count: number;
  allowed: number;
  isArmed: boolean;
}

function PersonCountDisplay({ count, allowed, isArmed }: PersonCountDisplayProps) {
  const isExcess = count > allowed;

  return (
    <div
      className={`p-6 rounded-xl border-2 transition-all ${
        isExcess && isArmed
          ? 'border-red-500 bg-red-500/10 animate-pulse'
          : isArmed
          ? 'border-emerald-500 bg-emerald-500/10'
          : 'border-slate-700 bg-slate-800/50'
      }`}
    >
      <div className="text-center">
        <div
          className={`text-6xl font-bold ${
            isExcess && isArmed ? 'text-red-500' : 'text-slate-300'
          }`}
        >
          {count}
        </div>
        <div className="text-sm text-slate-500 mt-2">
          Persons Detected
        </div>
        {isExcess && isArmed && (
          <div className="mt-3 px-3 py-1 bg-red-500 text-white text-sm font-bold rounded-full inline-block animate-bounce">
            +{count - allowed} INTRUDER{count - allowed > 1 ? 'S' : ''}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function SecurityPage() {
  const {
    armingState,
    settings,
    currentPersonCount,
    triggerIntrusion,
    setCurrentPersonCount,
    recordDetection,
    lastTriggerTime,
    disarm,
  } = useSecurityStore();

  const [showSettings, setShowSettings] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isSirenPlaying, setIsSirenPlaying] = useState(false);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [lastDetection, setLastDetection] = useState<PersonDetectionResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectionLoopBusyRef = useRef(false);
  const lastForceDetectionRef = useRef(0);
  const detectorRef = useRef(getPersonDetector({
    confidenceThreshold: settings.confidenceThreshold,
    motionThreshold: settings.motionThreshold,
  }));
  const previousCountRef = useRef(0);
  const alertActiveRef = useRef(false);

  // Keep detector config in sync with settings
  useEffect(() => {
    detectorRef.current.updateConfig({
      confidenceThreshold: settings.confidenceThreshold,
      motionThreshold: settings.motionThreshold,
      minDetectionInterval: settings.detectionInterval,
      captureFrames: true,
    });
  }, [settings.confidenceThreshold, settings.motionThreshold, settings.detectionInterval]);

  // Initialize detector
  useEffect(() => {
    const init = async () => {
      try {
        await detectorRef.current.initialize();
        setModelStatus('ready');
      } catch (error) {
        console.error('[SecurityPage] Failed to initialize detector:', error);
        setModelStatus('error');
      }
    };
    init();

    return () => {
      detectorRef.current.dispose();
    };
  }, []);

  // Handle intrusion trigger
  const handleIntrusion = useCallback(async (result: PersonDetectionResult) => {
    const { exceeded, isNewIntrusion } = calculatePersonChange(
      result.personCount,
      previousCountRef.current,
      settings.allowedPersons
    );

    if (!exceeded) {
      // No longer exceeded - stop alerts
      if (alertActiveRef.current) {
        alertActiveRef.current = false;
        setIsFlashing(false);
        setIsSirenPlaying(false);
        stopSecurityAlert();
      }
      return;
    }

    // If we're still exceeded, avoid repeatedly saving frames when within cooldown
    const now = Date.now();
    if (!isNewIntrusion && lastTriggerTime && now - lastTriggerTime < settings.triggerCooldown) {
      return;
    }

    // Create intrusion frame
    const intrusionFrame = createIntrusionFrame(
      result.frameData || '',
      result.personCount,
      settings.allowedPersons,
      result.detections.map(d => ({
        bbox: d.bbox,
        confidence: d.confidence,
      }))
    );

    // Save to IndexedDB
    const frameDB: IntrusionFrameDB = {
      id: intrusionFrame.id,
      frameData: intrusionFrame.frameData,
      thumbnailData: intrusionFrame.thumbnailData,
      timestamp: intrusionFrame.timestamp,
      personCount: intrusionFrame.personCount,
      allowedCount: intrusionFrame.allowedCount,
      detections: intrusionFrame.detections,
      acknowledged: false,
      notes: '',
      exported: false,
    };
    await saveIntrusionFrame(frameDB);

    // Trigger intrusion in store
    triggerIntrusion(intrusionFrame);

    // Activate alerts based on mode
    if (settings.alertMode === 'extreme' && !alertActiveRef.current) {
      alertActiveRef.current = true;

      // Flash
      if (settings.alerts.flashEnabled) {
        setIsFlashing(true);
      }

      // Siren
      if (settings.alerts.sirenEnabled) {
        setIsSirenPlaying(true);
      }

      // TTS
      if (settings.alerts.tts.enabled) {
        startSecurityAlert('mixed', {
          volume: settings.alerts.tts.volume,
          rate: settings.alerts.tts.rate,
        });
      }

      // Browser notification
      if (settings.alerts.notificationEnabled && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          void showBrowserNotification('INTRUDER ALERT!', {
            body: `${result.personCount} person(s) detected. ${result.personCount - settings.allowedPersons} unauthorized.`,
            icon: '/icons/icon-192.png',
            tag: 'intrusion-alert',
            requireInteraction: true,
          });
        }
      }
    }
  }, [settings, lastTriggerTime, triggerIntrusion]);

  // Stop alerts when disarmed
  useEffect(() => {
    if (armingState === 'disarmed') {
      alertActiveRef.current = false;
      setIsFlashing(false);
      setIsSirenPlaying(false);
      stopSecurityAlert();
      previousCountRef.current = 0;
    }
  }, [armingState]);

  const isArmed = armingState === 'armed' || armingState === 'triggered';

  // Detection loop (uses video element directly; avoids relying on CameraFeed's gated onFrame)
  useEffect(() => {
    if (!isArmed) return;

    const intervalMs = Math.max(250, settings.detectionInterval);
    let cancelled = false;

    const id = window.setInterval(async () => {
      if (cancelled) return;
      if (detectionLoopBusyRef.current) return;

      const video = videoRef.current;
      if (!video) return;

      detectionLoopBusyRef.current = true;
      try {
        const now = Date.now();
        const shouldForce =
          (armingState === 'triggered' || alertActiveRef.current) &&
          now - lastForceDetectionRef.current >= 5000;

        const result = shouldForce
          ? await detectorRef.current.forceDetection(video)
          : await detectorRef.current.processFrame(video);

        if (!result) return;
        if (shouldForce) lastForceDetectionRef.current = now;

        setLastDetection(result);
        setCurrentPersonCount(result.personCount);
        recordDetection(result.personCount);

        // Check for intrusion
        if (result.personCount > settings.allowedPersons) {
          await handleIntrusion(result);
        } else {
          // Clear alerts if no longer exceeded
          if (alertActiveRef.current) {
            alertActiveRef.current = false;
            setIsFlashing(false);
            setIsSirenPlaying(false);
            stopSecurityAlert();
          }
        }

        previousCountRef.current = result.personCount;
      } finally {
        detectionLoopBusyRef.current = false;
      }
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isArmed, armingState, settings.detectionInterval, settings.allowedPersons, handleIntrusion, setCurrentPersonCount, recordDetection]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Flash Overlay */}
      <FlashOverlay
        isActive={isFlashing && armingState === 'triggered'}
        color={settings.alerts.flashColor}
      />

      {/* Siren Audio */}
      <SirenPlayer
        isActive={isSirenPlaying && armingState === 'triggered'}
        volume={settings.alerts.sirenVolume}
      />

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-slate-400 hover:text-white"
              >
                <IconChevronLeft size={20} />
                <span className="hidden sm:inline">Back</span>
              </Link>
              <div className="flex items-center gap-2">
                <IconShield size={24} className="text-emerald-400" />
                <h1 className="text-xl font-bold text-white">Security Mode</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
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
                AI: {modelStatus === 'ready' ? 'Ready' : modelStatus === 'loading' ? 'Loading...' : 'Error'}
              </div>

              {/* Gallery Toggle */}
              <button
                onClick={() => setShowGallery(!showGallery)}
                className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 ${
                  showGallery
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <IconAlertTriangle size={16} />
                History
              </button>

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
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {showGallery ? (
          /* Intrusion History Gallery */
          <IntrusionGallery className="mb-6" />
        ) : (
          /* Live Monitoring View */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Camera Feed */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                  <h2 className="font-semibold text-white flex items-center gap-2">
                    <IconCamera size={18} />
                    Live Camera
                  </h2>
                  {lastDetection && (
                    <span className="text-xs text-slate-500">
                      {lastDetection.processingTimeMs.toFixed(0)}ms
                    </span>
                  )}
                </div>
                <CameraFeed
                  scenario="security"
                  showDebug={true}
                  enabled={isArmed}
                  audioEnabled={false}
                  onVideoReady={(video) => {
                    videoRef.current = video;
                  }}
                  className="aspect-video"
                />
              </div>

              {/* Person Count Display */}
              <PersonCountDisplay
                count={currentPersonCount}
                allowed={settings.allowedPersons}
                isArmed={isArmed}
              />

              {/* Quick Status */}
              {armingState === 'triggered' && (
                <div className="p-4 bg-red-500/20 border border-red-500 rounded-xl animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <IconAlertTriangle size={24} className="text-red-500" />
                      <div>
                        <div className="font-bold text-red-400">INTRUDER DETECTED!</div>
                        <div className="text-sm text-red-300">
                          {currentPersonCount - settings.allowedPersons} unauthorized person(s)
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={disarm}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold"
                    >
                      DISARM
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Security Panel */}
            <div>
              <SecurityPanel
                onTrigger={() => {
                  // Additional trigger handling if needed
                }}
              />
            </div>
          </div>
        )}

        {/* Settings Panel (Slide-over) */}
        {showSettings && (
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setShowSettings(false)}
          >
            <div
              className="absolute right-0 top-0 h-full w-full max-w-md bg-slate-900 border-l border-slate-700 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Settings</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="p-4">
                <SecurityPanel />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
