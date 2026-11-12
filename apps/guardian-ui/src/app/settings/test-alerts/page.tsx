/**
 * Test Alerts Page
 *
 * Validation interface for testing alert system functionality:
 * - Simulate alerts at each severity level
 * - Test emergency mode (safe dismissal)
 * - Test browser notifications
 * - Test detection algorithms
 * - Performance metrics
 *
 * @module app/settings/test-alerts/page
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../../stores/auth-store';
import { useMonitoringStore } from '../../../stores/monitoring-store';
import { useSettingsStore } from '../../../stores/settings-store';
import { useSoundManager, SoundType } from '../../../lib/sound-manager';
import { useNotifications } from '../../../lib/notification-manager';
import { BackButton } from '@/components/BackButton';
import { useBackendStatus } from '@/contexts/BackendStatusContext';
import {
  getPixelDetectionEngine,
  PixelDetectionResult,
  resetPixelDetectionEngine
} from '../../../lib/pixel-detection';
import {
  IconChevronLeft,
  IconPlay,
  IconCheck,
  IconX,
  IconBell,
  IconAlertTriangle,
  IconCamera,
  IconMicrophone,
  IconVolume2,
  IconShield,
  IconRefresh,
} from '../../../components/icons';
import type { Alert } from '../../../components/AlertPanel';

// =============================================================================
// Test Alerts Page
// =============================================================================

export default function TestAlertsPage() {
  const [mounted, setMounted] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [pixelTestResult, setPixelTestResult] = useState<PixelDetectionResult | null>(null);
  const [showEmergencyTest, setShowEmergencyTest] = useState(false);
  const [serverTestMessage, setServerTestMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [serverTestChannel, setServerTestChannel] = useState<null | 'webhook' | 'push' | 'sms' | 'telegram'>(null);

  const { sessionToken } = useAuthStore();

  // Stores and hooks
  const addAlert = useMonitoringStore((state) => state.addAlert);
  const clearAlerts = useMonitoringStore((state) => state.clearAlerts);
  const alerts = useMonitoringStore((state) => state.alerts);
  const { globalSettings, emergencyModeActive, activateEmergencyMode, deactivateEmergencyMode } = useSettingsStore();
  const { status: backendStatus, config: backendConfig } = useBackendStatus();

  const soundManager = useSoundManager();
  const notifications = useNotifications();

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  // ==========================================================================
  // Test Functions
  // ==========================================================================

  const createTestAlert = (severity: Alert['severity'], message?: string): Alert => ({
    id: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    streamId: 'test-stream',
    alertType: 'test',
    severity,
    message: message || `Test ${severity} alert created at ${new Date().toLocaleTimeString()}`,
    createdAt: new Date().toISOString(),
    acknowledged: false,
  });

  const runSoundTest = async (type: SoundType): Promise<TestResult> => {
    const startTime = performance.now();
    try {
      soundManager.test(type);
      return {
        name: `Sound: ${type}`,
        status: 'success',
        duration: performance.now() - startTime,
        message: 'Sound played successfully',
      };
    } catch (error) {
      return {
        name: `Sound: ${type}`,
        status: 'error',
        duration: performance.now() - startTime,
        message: String(error),
      };
    }
  };

  const runNotificationTest = async (): Promise<TestResult> => {
    const startTime = performance.now();
    try {
      if (!notifications.isGranted) {
        const permission = await notifications.requestPermission();
        if (permission !== 'granted') {
          return {
            name: 'Browser Notification',
            status: 'warning',
            duration: performance.now() - startTime,
            message: 'Permission not granted',
          };
        }
      }

      await notifications.notify('Test Notification', 'This is a test notification from SafeOS Guardian', {
        tag: 'test-notification',
      });

      return {
        name: 'Browser Notification',
        status: 'success',
        duration: performance.now() - startTime,
        message: 'Notification sent successfully',
      };
    } catch (error) {
      return {
        name: 'Browser Notification',
        status: 'error',
        duration: performance.now() - startTime,
        message: String(error),
      };
    }
  };

  const runAlertTest = async (severity: Alert['severity']): Promise<TestResult> => {
    const startTime = performance.now();
    try {
      const alert = createTestAlert(severity);
      addAlert(alert);

      return {
        name: `Alert: ${severity}`,
        status: 'success',
        duration: performance.now() - startTime,
        message: `Alert created with ID: ${alert.id.substring(0, 8)}...`,
      };
    } catch (error) {
      return {
        name: `Alert: ${severity}`,
        status: 'error',
        duration: performance.now() - startTime,
        message: String(error),
      };
    }
  };

  const runPixelDetectionTest = async (): Promise<TestResult> => {
    const startTime = performance.now();
    try {
      // Create test canvas with random noise
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      // Draw first frame (black)
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const engine = getPixelDetectionEngine({
        threshold: globalSettings.pixelThreshold,
      });
      engine.reset();

      // Analyze first frame
      engine.analyzeCanvas(canvas);

      // Draw second frame (with changes)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(50, 50, 100, 100);

      // Analyze second frame
      const result = engine.analyzeCanvas(canvas);
      setPixelTestResult(result);

      return {
        name: 'Pixel Detection',
        status: result.changed ? 'success' : 'warning',
        duration: performance.now() - startTime,
        message: `Detected ${result.difference.toFixed(2)}% change, ${result.hotspots.length} hotspots`,
      };
    } catch (error) {
      return {
        name: 'Pixel Detection',
        status: 'error',
        duration: performance.now() - startTime,
        message: String(error),
      };
    }
  };

  const runAllTests = async () => {
    setIsRunningTests(true);
    setTestResults([]);

    const results: TestResult[] = [];

    // Sound tests
    for (const type of ['notification', 'alert', 'warning', 'alarm'] as SoundType[]) {
      results.push(await runSoundTest(type));
      setTestResults([...results]);
      await new Promise((r) => setTimeout(r, 500));
    }

    // Alert tests
    for (const severity of ['low', 'medium', 'high', 'critical'] as Alert['severity'][]) {
      results.push(await runAlertTest(severity));
      setTestResults([...results]);
      await new Promise((r) => setTimeout(r, 300));
    }

    // Notification test
    results.push(await runNotificationTest());
    setTestResults([...results]);

    // Pixel detection test
    results.push(await runPixelDetectionTest());
    setTestResults([...results]);

    setIsRunningTests(false);
  };

  const testEmergencyMode = () => {
    setShowEmergencyTest(true);
    activateEmergencyMode('test-emergency');
    soundManager.startEmergency();

    // Auto-stop after 5 seconds if not manually stopped
    setTimeout(() => {
      stopEmergencyTest();
    }, 5000);
  };

  const stopEmergencyTest = () => {
    setShowEmergencyTest(false);
    deactivateEmergencyMode();
    soundManager.stopEmergency();
  };

  const sendMonitoringServerTest = async (channel: 'webhook' | 'push' | 'sms' | 'telegram') => {
    if (!backendConfig.apiUrl) return;

    setServerTestChannel(channel);
    setServerTestMessage({ type: 'info', text: 'Sending test request…' });

    try {
      const res = await fetch(`${backendConfig.apiUrl}/api/notifications/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken || '' },
        body: JSON.stringify({ channel }),
      });

      const data = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;

      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setServerTestMessage({ type: 'success', text: data?.message || 'Test request sent.' });
    } catch (err) {
      setServerTestMessage({ type: 'error', text: err instanceof Error ? err.message : 'Test failed.' });
    } finally {
      setServerTestChannel(null);
      window.setTimeout(() => setServerTestMessage(null), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Emergency Test Overlay */}
      {showEmergencyTest && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center animate-emergency-flash">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
              <IconAlertTriangle size={48} className="text-red-500" />
            </div>
            <h1 className="text-3xl font-bold text-red-500 mb-4 animate-pulse">
              EMERGENCY TEST
            </h1>
            <p className="text-slate-400 mb-6">
              Testing emergency mode. Will auto-stop in 5 seconds.
            </p>
            <button
              onClick={stopEmergencyTest}
              className="px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
            >
              Stop Test Now
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="p-4 sm:p-6 border-b border-slate-700/50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BackButton
              fallbackHref="/settings"
              ariaLabel="Back to settings"
              className="bg-slate-800/50 hover:bg-slate-700/60 text-slate-400 hover:text-white"
            >
              <IconChevronLeft size={20} aria-hidden="true" />
            </BackButton>
            <h1 className="text-xl font-bold text-white">Alert System Testing</h1>
          </div>
          <button
            onClick={runAllTests}
            disabled={isRunningTests}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isRunningTests ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Running...
              </>
            ) : (
              <>
                <IconPlay size={16} />
                Run All Tests
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
	      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
	        {/* Quick Actions */}
	        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <TestButton
            icon={<IconVolume2 size={20} />}
            label="Test Sounds"
            onClick={async () => {
              for (const type of ['notification', 'alert', 'warning', 'alarm'] as SoundType[]) {
                soundManager.test(type);
                await new Promise((r) => setTimeout(r, 800));
              }
            }}
          />
          <TestButton
            icon={<IconBell size={20} />}
            label="Test Alert"
            onClick={() => {
              const alert = createTestAlert('medium');
              addAlert(alert);
            }}
          />
          <TestButton
            icon={<IconBell size={20} />}
            label="Test Notification"
            onClick={() => {
              notifications.notify('Test', 'This is a test browser notification');
            }}
          />
          <TestButton
            icon={<IconAlertTriangle size={20} />}
            label="Test Emergency"
            onClick={testEmergencyMode}
            variant="danger"
	          />
	        </div>

          {/* Monitoring Server Tests */}
          <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Monitoring Server Tests</h2>
            <p className="text-sm text-slate-400 mb-4">
              Local/offline tests run on this device. Remote channels (webhooks/SMS/Telegram) send via the optional monitoring server.
            </p>

            {backendStatus.api === 'connected' && backendConfig.apiUrl ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(['webhook', 'push', 'sms', 'telegram'] as const).map((channel) => (
                    <button
                      key={channel}
                      onClick={() => sendMonitoringServerTest(channel)}
                      disabled={serverTestChannel !== null}
                      className="px-3 py-2 bg-slate-900/50 hover:bg-slate-900 border border-slate-700 rounded-lg text-sm text-white transition-colors disabled:opacity-60"
                    >
                      {serverTestChannel === channel ? 'Sending…' : `Test ${channel.toUpperCase()}`}
                    </button>
                  ))}
                </div>

                {serverTestMessage && (
                  <div
                    className={`p-3 rounded-lg border ${
                      serverTestMessage.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : serverTestMessage.type === 'error'
                        ? 'bg-red-500/10 border-red-500/30 text-red-300'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                    }`}
                  >
                    <p className="text-sm">{serverTestMessage.text}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                <p className="text-sm text-slate-300">
                  No monitoring server (API) is online right now. SafeOS continues running fully local/offline on this device.
                </p>
              </div>
            )}
          </section>
	
	        {/* Enhanced Sound Tests */}
	        <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Sound Tests</h2>

          {/* Volume Preview Control */}
          <div className="mb-6 p-4 bg-slate-900/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-300">
                Preview Volume: {globalSettings.alertVolume}%
              </label>
              <span className="text-xs text-slate-500">
                Current setting from preferences
              </span>
            </div>
            <div className="flex items-center gap-4">
              <IconVolume2 size={18} className="text-slate-400" />
              <input
                type="range"
                min="0"
                max="100"
                value={globalSettings.alertVolume}
                onChange={(e) => {
                  // Preview volume (doesn't save)
                  soundManager.updateVolume(Number(e.target.value) / 100);
                }}
                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-sm text-white font-mono w-12 text-right">
                {globalSettings.alertVolume}%
              </span>
            </div>
          </div>

          {/* Sound Type Buttons with Latency */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(['notification', 'alert', 'warning', 'alarm', 'emergency'] as SoundType[]).map((type) => (
              <SoundTestButton
                key={type}
                type={type}
                onPlay={() => {
                  const start = performance.now();
                  soundManager.test(type);
                  return start;
                }}
              />
            ))}
          </div>

          {/* Latency Info */}
          <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-xs text-blue-300">
              <strong>Audio Latency:</strong> Click each sound to test. Low latency (&lt;50ms) is important for emergency alerts to be heard immediately.
            </p>
          </div>
        </section>

        {/* Alert Simulation */}
        <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Alert Simulation</h2>
            <button
              onClick={clearAlerts}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            {(['info', 'low', 'medium', 'high', 'critical'] as Alert['severity'][]).map((severity) => (
              <button
                key={severity}
                onClick={() => {
                  const alert = createTestAlert(severity);
                  addAlert(alert);
                }}
                className={`p-3 rounded-lg transition-colors ${SEVERITY_CLASSES[severity]}`}
              >
                <span className="text-sm font-medium capitalize block text-center">{severity}</span>
              </button>
            ))}
          </div>

          {/* Active Alerts Display */}
          <div className="mt-4 p-3 bg-slate-900/50 rounded-lg">
            <p className="text-sm text-slate-400 mb-2">
              Active alerts: <span className="text-white font-semibold">{alerts?.length || 0}</span>
            </p>
            {alerts && alerts.length > 0 && (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {alerts.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between text-sm">
                    <span className={`capitalize ${SEVERITY_TEXT_CLASSES[alert.severity]}`}>
                      {alert.severity}
                    </span>
                    <span className="text-slate-500 text-xs">{alert.id.substring(0, 12)}...</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Pixel Detection Test */}
        <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Pixel Detection Test</h2>

          <div className="flex items-start gap-6">
            <div className="flex-1">
              <p className="text-sm text-slate-400 mb-4">
                Tests the pixel detection algorithm by comparing frames with artificial changes.
              </p>
              <button
                onClick={runPixelDetectionTest}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
              >
                <IconShield size={18} />
                Run Pixel Detection Test
              </button>
            </div>

            {pixelTestResult && (
              <div className="bg-slate-900/50 rounded-lg p-4 min-w-[200px]">
                <h3 className="text-sm font-medium text-white mb-2">Results</h3>
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="text-slate-400">Changed: </span>
                    <span className={pixelTestResult.changed ? 'text-emerald-400' : 'text-slate-400'}>
                      {pixelTestResult.changed ? 'Yes' : 'No'}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-400">Difference: </span>
                    <span className="text-white">{pixelTestResult.difference.toFixed(2)}%</span>
                  </p>
                  <p>
                    <span className="text-slate-400">Hotspots: </span>
                    <span className="text-white">{pixelTestResult.hotspots.length}</span>
                  </p>
                  <p>
                    <span className="text-slate-400">Pixels: </span>
                    <span className="text-white">{pixelTestResult.changedPixelCount}/{pixelTestResult.totalPixels}</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Test Results */}
        {testResults.length > 0 && (
          <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Test Results</h2>
              <button
                onClick={() => setTestResults([])}
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                Clear
              </button>
            </div>

            <div className="space-y-2">
              {testResults.map((result, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-3 rounded-lg ${result.status === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                    : result.status === 'warning'
                      ? 'bg-yellow-500/10 border border-yellow-500/30'
                      : 'bg-red-500/10 border border-red-500/30'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    {result.status === 'success' ? (
                      <IconCheck size={18} className="text-emerald-500" />
                    ) : result.status === 'warning' ? (
                      <IconAlertTriangle size={18} className="text-yellow-500" />
                    ) : (
                      <IconX size={18} className="text-red-500" />
                    )}
                    <div>
                      <span className="text-white font-medium">{result.name}</span>
                      <p className="text-xs text-slate-400">{result.message}</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">{result.duration.toFixed(0)}ms</span>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">
                  Total: {testResults.length} tests
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-emerald-400">
                    {testResults.filter((r) => r.status === 'success').length} passed
                  </span>
                  <span className="text-yellow-400">
                    {testResults.filter((r) => r.status === 'warning').length} warnings
                  </span>
                  <span className="text-red-400">
                    {testResults.filter((r) => r.status === 'error').length} failed
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Current Settings Display */}
        <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Current Settings</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <SettingDisplay label="Motion Sensitivity" value={`${globalSettings.motionSensitivity}%`} />
            <SettingDisplay label="Audio Sensitivity" value={`${globalSettings.audioSensitivity}%`} />
            <SettingDisplay label="Pixel Threshold" value={`${globalSettings.pixelThreshold}%`} />
            <SettingDisplay label="Alert Volume" value={`${globalSettings.alertVolume}%`} />
            <SettingDisplay label="Analysis Interval" value={`${globalSettings.analysisInterval}s`} />
            <SettingDisplay label="Alert Delay" value={`${globalSettings.alertDelay}s`} />
            <SettingDisplay
              label="Emergency Mode"
              value={globalSettings.emergencyMode ? 'Enabled' : 'Disabled'}
              highlight={globalSettings.emergencyMode}
            />
            <SettingDisplay
              label="Pixel Detection"
              value={globalSettings.pixelDetectionEnabled ? 'Enabled' : 'Disabled'}
              highlight={globalSettings.pixelDetectionEnabled}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

// =============================================================================
// Types
// =============================================================================

interface TestResult {
  name: string;
  status: 'success' | 'warning' | 'error';
  duration: number;
  message: string;
}

// =============================================================================
// Sub-components
// =============================================================================

interface TestButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

function TestButton({ icon, label, onClick, variant = 'default' }: TestButtonProps) {
  const classes = variant === 'danger'
    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/30'
    : 'bg-slate-700/30 text-slate-300 hover:bg-slate-700/50 border-slate-600/30';

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${classes}`}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

interface SoundTestButtonProps {
  type: SoundType;
  onPlay: () => number;
}

function SoundTestButton({ type, onPlay }: SoundTestButtonProps) {
  const [lastLatency, setLastLatency] = React.useState<number | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);

  const handleClick = () => {
    const start = onPlay();
    setIsPlaying(true);

    // Measure approximate latency (time until audio API call completes)
    requestAnimationFrame(() => {
      const latency = performance.now() - start;
      setLastLatency(Math.round(latency));
      setTimeout(() => setIsPlaying(false), 500);
    });
  };

  return (
    <button
      onClick={handleClick}
      className={`p-3 rounded-lg transition-all group ${isPlaying
          ? 'bg-emerald-500/20 border border-emerald-500/30 scale-95'
          : 'bg-slate-700/30 hover:bg-slate-700/50 border border-transparent'
        }`}
    >
      <IconPlay size={18} className={`mx-auto mb-2 transition-transform ${isPlaying ? 'text-emerald-400 scale-110' : 'text-emerald-500 group-hover:scale-110'
        }`} />
      <span className="text-sm text-white capitalize block text-center">{type}</span>
      {lastLatency !== null && (
        <span className={`text-xs block text-center mt-1 ${lastLatency < 50 ? 'text-emerald-400' : lastLatency < 100 ? 'text-yellow-400' : 'text-red-400'
          }`}>
          {lastLatency}ms
        </span>
      )}
    </button>
  );
}

interface SettingDisplayProps {
  label: string;
  value: string;
  highlight?: boolean;
}

function SettingDisplay({ label, value, highlight }: SettingDisplayProps) {
  return (
    <div className="p-3 bg-slate-900/50 rounded-lg">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`font-medium ${highlight ? 'text-emerald-400' : 'text-white'}`}>{value}</p>
    </div>
  );
}

// =============================================================================
// Constants
// =============================================================================

const SEVERITY_CLASSES: Record<Alert['severity'], string> = {
  info: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
  low: 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
  high: 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30',
  critical: 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
};

const SEVERITY_TEXT_CLASSES: Record<Alert['severity'], string> = {
  info: 'text-blue-400',
  low: 'text-emerald-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
};
