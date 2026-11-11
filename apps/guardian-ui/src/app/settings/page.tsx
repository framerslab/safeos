/**
 * Settings Page
 *
 * User preferences and notification settings.
 *
 * @module app/settings/page
 */

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { hydrateSavedSettings } from '@/lib/settings-hydration';
import { useSettingsStore } from '@/stores/settings-store';
import { useAuthStore } from '../../stores/auth-store';
import { useBackendStatus } from '@/contexts/BackendStatusContext';
import { clearLocalData } from '@/lib/local-data';
import { FeatureDisabledBadge } from '@/components/StatusBanner';

// =============================================================================
// Types
// =============================================================================

interface SettingsSection {
  id: string;
  title: string;
  icon: React.ReactNode;
}

// =============================================================================
// Component
// =============================================================================

export default function SettingsPage() {
  const { profile, updateProfile, sessionToken } = useAuthStore();
  const { globalSettings, quietHoursSettings, updateGlobalSettings, updateQuietHoursSettings } = useSettingsStore();
  const { status: backendStatus, config: backendConfig } = useBackendStatus();
  const [activeSection, setActiveSection] = useState('general');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [notificationServerStatus, setNotificationServerStatus] = useState<{
    pushSubscriptions: number;
    telegramChats: number;
    smsEnabled: boolean;
    telegramEnabled: boolean;
  } | null>(null);
  const [notificationServerStatusLoading, setNotificationServerStatusLoading] = useState(false);
  const [notificationServerStatusError, setNotificationServerStatusError] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [motionSensitivity, setMotionSensitivity] = useState(globalSettings.motionSensitivity);
  const [audioSensitivity, setAudioSensitivity] = useState(globalSettings.audioSensitivity);
  const [alertVolume, setAlertVolume] = useState(globalSettings.alertVolume);
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');

  // Notification settings
  const [browserPush, setBrowserPush] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(quietHoursSettings.enabled);
  const [quietHoursStart, setQuietHoursStart] = useState(quietHoursSettings.startTime);
  const [quietHoursEnd, setQuietHoursEnd] = useState(quietHoursSettings.endTime);

  useEffect(() => { hydrateSavedSettings(profile); }, [profile]);

  useEffect(() => {
    // Hydrate from profile first (if available)
    if (profile?.preferences) {
      setDisplayName(profile.displayName || '');
      setTheme(profile.preferences.theme || 'dark');
    }

    if (profile?.notificationSettings) {
      setBrowserPush(profile.notificationSettings.browserPush ?? true);
      setSmsEnabled(profile.notificationSettings.sms ?? false);
      setTelegramEnabled(profile.notificationSettings.telegram ?? false);
    }
  }, [profile]);

  useEffect(() => {
    // Fallback: hydrate from localStorage (works fully offline)
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('safeos_user_settings');
      if (!stored) return;

      const parsed = JSON.parse(stored) as {
        displayName?: string;
        preferences?: {
          defaultScenario?: 'pet' | 'baby' | 'elderly' | 'security';
          motionSensitivity?: number;
          audioSensitivity?: number;
          alertVolume?: number;
          theme?: 'dark' | 'light' | 'system';
        };
        notificationSettings?: {
          browserPush?: boolean;
          sms?: boolean;
          telegram?: boolean;
          emailDigest?: boolean;
          quietHoursStart?: string | null;
          quietHoursEnd?: string | null;
        };
      };

      if (typeof parsed.displayName === 'string' && parsed.displayName.length > 0) {
        setDisplayName(parsed.displayName);
      }

      if (parsed.preferences) {
        if (parsed.preferences.theme) {
          setTheme(parsed.preferences.theme);
        }
      }

      if (parsed.notificationSettings) {
        if (typeof parsed.notificationSettings.browserPush === 'boolean') {
          setBrowserPush(parsed.notificationSettings.browserPush);
        }
        if (typeof parsed.notificationSettings.sms === 'boolean') {
          setSmsEnabled(parsed.notificationSettings.sms);
        }
        if (typeof parsed.notificationSettings.telegram === 'boolean') {
          setTelegramEnabled(parsed.notificationSettings.telegram);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (backendStatus.api !== 'connected' || !backendConfig.apiUrl || !sessionToken) {
      setNotificationServerStatus(null);
      setNotificationServerStatusLoading(false);
      setNotificationServerStatusError(null);
      return;
    }

    const controller = new AbortController();
    setNotificationServerStatusLoading(true);
    setNotificationServerStatusError(null);

    fetch(`${backendConfig.apiUrl}/api/notifications/status`, { signal: controller.signal, headers: { 'X-Session-Token': sessionToken || '' } })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          status?: {
            pushSubscriptions?: number;
            telegramChats?: number;
            smsEnabled?: boolean;
            telegramEnabled?: boolean;
          };
        };

        const status = data.status;
        if (!status) {
          throw new Error('Unexpected response');
        }

        setNotificationServerStatus({
          pushSubscriptions: status.pushSubscriptions ?? 0,
          telegramChats: status.telegramChats ?? 0,
          smsEnabled: !!status.smsEnabled,
          telegramEnabled: !!status.telegramEnabled,
        });
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setNotificationServerStatus(null);
        setNotificationServerStatusError('Unable to fetch monitoring server notification status.');
      })
      .finally(() => setNotificationServerStatusLoading(false));

    return () => controller.abort();
  }, [backendStatus.api, backendConfig.apiUrl, sessionToken]);

  const openMonitoringServerSettings = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('safeos:open-backend-settings'));
    }
  };

  const sections: SettingsSection[] = [
    {
      id: 'general',
      title: 'General',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      id: 'detection',
      title: 'Detection',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      ),
    },
    {
      id: 'ai-models',
      title: 'AI Models',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
    {
      id: 'detection-zones',
      title: 'Detection Zones',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
      ),
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
    {
      id: 'alerts',
      title: 'Alerts',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      id: 'escalation',
      title: 'Escalation',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      id: 'privacy',
      title: 'Privacy',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
    },
    {
      id: 'appearance',
      title: 'Appearance',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ),
    },
    {
      id: 'schedule',
      title: 'Schedule',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'sounds',
      title: 'Sounds',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
      ),
    },
  ];

  useEffect(() => {
    setMotionSensitivity(globalSettings.motionSensitivity);
    setAudioSensitivity(globalSettings.audioSensitivity);
    setAlertVolume(globalSettings.alertVolume);
  }, [globalSettings]);

  useEffect(() => {
    setQuietHoursEnabled(quietHoursSettings.enabled);
    setQuietHoursStart(quietHoursSettings.startTime);
    setQuietHoursEnd(quietHoursSettings.endTime);
  }, [quietHoursSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      // Save to localStorage as fallback (works offline)
      const settingsData = {
        displayName,
        preferences: {
          defaultScenario: profile?.preferences?.defaultScenario || 'pet',
          motionSensitivity: motionSensitivity / 100,
          audioSensitivity: audioSensitivity / 100,
          alertVolume: alertVolume / 100,
          theme,
        },
        notificationSettings: {
          browserPush,
          sms: smsEnabled,
          telegram: telegramEnabled,
          emailDigest: profile?.notificationSettings?.emailDigest ?? false,
          quietHoursStart: quietHoursEnabled ? quietHoursStart : null,
          quietHoursEnd: quietHoursEnabled ? quietHoursEnd : null,
        },
      };

      updateGlobalSettings({ motionSensitivity, audioSensitivity, alertVolume });
      updateQuietHoursSettings({ enabled: quietHoursEnabled, startTime: quietHoursStart, endTime: quietHoursEnd });

      // Keep the account profile compatible with server preferences.
      if (typeof window !== 'undefined') {
        localStorage.setItem('safeos_user_settings', JSON.stringify(settingsData));
      }

      // Update auth profile (offline-safe; will sync to server if connected)
      await updateProfile({
        displayName: settingsData.displayName,
        preferences: settingsData.preferences,
        notificationSettings: settingsData.notificationSettings,
      });

      setSaveMessage({ type: 'success', text: 'Settings saved!' });
    } catch {
      setSaveMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-x-hidden">
      {/* Header */}
      <header className="p-4 sm:p-6 border-b border-slate-700/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors" aria-label="Go back to dashboard">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-white">Settings</h1>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Changes
              </>
            )}
          </button>
        </div>
      </header>

      {/* Save Message */}
      {saveMessage && (
        <div className={`
          fixed top-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50
          ${saveMessage.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}
          text-white
        `}>
          {saveMessage.text}
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-24 md:pb-6 overflow-y-auto">
        <div className="flex flex-col md:flex-row gap-4 md:gap-6 min-h-0">
          {/* Sidebar - Horizontal scroll on mobile */}
          <nav className="md:w-56 flex-shrink-0 -mx-4 px-4 md:mx-0 md:px-0">
            <ul className="flex md:flex-col gap-2 md:gap-1 overflow-x-auto md:overflow-x-visible pb-4 md:pb-0 scrollbar-hide snap-x snap-mandatory md:snap-none">
              {sections.map((section) => (
                <li key={section.id} className="snap-start flex-shrink-0">
                  {['ai-models', 'detection-zones', 'escalation', 'detection', 'appearance', 'schedule', 'sounds', 'notifications'].includes(section.id) ? (
                    <Link
                      href={
                        section.id === 'ai-models' ? '/settings/models' :
                          section.id === 'detection-zones' ? '/settings/zones' :
                            section.id === 'detection' ? '/settings/detection' :
                              section.id === 'appearance' ? '/settings/appearance' :
                                section.id === 'schedule' ? '/settings/schedule' :
                                  section.id === 'sounds' ? '/settings/sounds' :
                                    section.id === 'notifications' ? '/settings/notifications' :
                                      '/settings/escalation'
                      }
                      className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-3 rounded-full md:rounded-lg transition-colors text-slate-400 hover:text-white hover:bg-slate-800 whitespace-nowrap text-sm md:text-base bg-slate-800/50 md:bg-transparent border border-slate-700 md:border-transparent cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                    >
                      {section.icon}
                      <span>{section.title}</span>
                      <svg className="w-4 h-4 ml-auto hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ) : (
                    <button
                      onClick={() => setActiveSection(section.id)}
                      className={`
                        flex items-center gap-2 px-3 py-2 md:px-4 md:py-3 rounded-full md:rounded-lg transition-colors whitespace-nowrap text-sm md:text-base cursor-pointer
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
                        ${activeSection === section.id
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 md:bg-slate-700 md:text-white md:border-transparent'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700 md:bg-transparent md:border-transparent hover:text-white hover:bg-slate-800'
                        }
                      `}
                    >
                      {section.icon}
                      <span>{section.title}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* Content */}
          <div className="flex-1 min-h-[50vh] md:min-h-0 bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 sm:p-6">
            {activeSection === 'general' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-white">General Settings</h2>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full max-w-md px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Theme
                  </label>
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as 'dark' | 'light' | 'system')}
                    className="w-full max-w-md px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="system">System</option>
                  </select>
                </div>
              </div>
            )}

            {activeSection === 'detection' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-white">Detection Settings</h2>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Motion Sensitivity: {motionSensitivity}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={motionSensitivity}
                    onChange={(e) => setMotionSensitivity(Number(e.target.value))}
                    className="w-full max-w-md h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Lower = more sensitive. Higher = less false alerts.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Audio Sensitivity: {audioSensitivity}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={audioSensitivity}
                    onChange={(e) => setAudioSensitivity(Number(e.target.value))}
                    className="w-full max-w-md h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Adjust for background noise levels.
                  </p>
                </div>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-white">Notification Settings</h2>

                <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4">
                  <p className="text-sm font-medium text-white mb-1">
                    {backendStatus.api === 'connected' ? 'Monitoring Server Online' : 'No Monitoring Server (API) Online'}
                  </p>
                  <p className="text-sm text-slate-400">
                    {backendStatus.api === 'connected' ? (
                      <>
                        Browser notifications work on <span className="text-slate-200">this device</span>. Remote channels (SMS/Telegram/email) require provider credentials on your monitoring server.
                      </>
                    ) : (
                      <>
                        {backendConfig.apiUrl
                          ? 'Your monitoring server is currently unreachable. '
                          : 'No monitoring server is configured. '}
                        SafeOS Guardian is running fully local/offline AI on <span className="text-slate-200">this device</span>. Browser notifications work here while the app is running.
                        Remote channels (SMS/Telegram/email) are optional and require a monitoring server (API) plus provider credentials.
                      </>
                    )}
                  </p>
                  {backendStatus.api === 'connected' && (
                    <div className="mt-3 rounded-lg border border-slate-700/40 bg-slate-800/30 p-3">
                      <p className="text-xs font-medium text-slate-300 mb-2">Server notification channels</p>
                      {notificationServerStatusLoading ? (
                        <p className="text-xs text-slate-400">Checking configuration…</p>
                      ) : notificationServerStatus ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-400">
                          <div className="flex items-center justify-between gap-3">
                            <span>SMS provider configured</span>
                            <span className={`px-2 py-0.5 rounded-full ${notificationServerStatus.smsEnabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/40 text-slate-300'}`}>
                              {notificationServerStatus.smsEnabled ? 'Yes' : 'No'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Telegram bot configured</span>
                            <span className={`px-2 py-0.5 rounded-full ${notificationServerStatus.telegramEnabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/40 text-slate-300'}`}>
                              {notificationServerStatus.telegramEnabled ? 'Yes' : 'No'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Registered Telegram chats</span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300">
                              {notificationServerStatus.telegramChats}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Saved push subscriptions</span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300">
                              {notificationServerStatus.pushSubscriptions}
                            </span>
                          </div>
                        </div>
                      ) : notificationServerStatusError ? (
                        <p className="text-xs text-amber-300">{notificationServerStatusError}</p>
                      ) : null}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    <Link href="/settings/test-alerts" className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline">
                      Test notifications
                    </Link>
                    <Link href="/history" className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline">
                      Offline export (History)
                    </Link>
                    <Link href="/webhooks" className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline">
                      Webhooks (monitoring server required)
                    </Link>
                    <button
                      type="button"
                      onClick={openMonitoringServerSettings}
                      className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline"
                    >
                      Monitoring server settings
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={browserPush}
                      onChange={(e) => setBrowserPush(e.target.checked)}
                      className="w-5 h-5 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="text-white">Browser Notifications (this device)</p>
                      <p className="text-xs text-slate-500">Shows alerts while your browser/app is running (even in the background)</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer" title="Requires a monitoring server (API) + SMS provider credentials (e.g. Twilio).">
                    <input
                      type="checkbox"
                      checked={smsEnabled}
                      onChange={(e) => setSmsEnabled(e.target.checked)}
                      className="w-5 h-5 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-white">SMS Notifications</p>
                        <FeatureDisabledBadge feature="sms-alerts" />
                      </div>
                      <p className="text-xs text-slate-500">
                        {backendStatus.api === 'connected' ? (
                          notificationServerStatusLoading ? (
                            'Checking monitoring server configuration…'
                          ) : notificationServerStatus && !notificationServerStatus.smsEnabled ? (
                            'Monitoring server online, but SMS provider keys are not configured yet.'
                          ) : notificationServerStatus && notificationServerStatus.smsEnabled ? (
                            'Monitoring server is configured for SMS delivery.'
                          ) : (
                            'Requires provider credentials on your monitoring server (e.g. Twilio).'
                          )
                        ) : (
                          'Saved locally; activates when a monitoring server + provider credentials are configured.'
                        )}
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer" title="Requires a monitoring server (API) + Telegram bot credentials.">
                    <input
                      type="checkbox"
                      checked={telegramEnabled}
                      onChange={(e) => setTelegramEnabled(e.target.checked)}
                      className="w-5 h-5 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-white">Telegram Notifications</p>
                        <FeatureDisabledBadge feature="telegram-alerts" />
                      </div>
                      <p className="text-xs text-slate-500">
                        {backendStatus.api === 'connected' ? (
                          notificationServerStatusLoading ? (
                            'Checking monitoring server configuration…'
                          ) : notificationServerStatus && !notificationServerStatus.telegramEnabled ? (
                            'Monitoring server online, but Telegram bot credentials are not configured yet.'
                          ) : notificationServerStatus && notificationServerStatus.telegramEnabled ? (
                            'Monitoring server is configured for Telegram delivery.'
                          ) : (
                            'Requires bot credentials on your monitoring server (bot token + chat ID).'
                          )
                        ) : (
                          'Saved locally; activates when a monitoring server + bot credentials are configured.'
                        )}
                      </p>
                    </div>
                  </label>
                </div>

                <hr className="border-slate-700" />

                <div>
                  <label className="flex items-center gap-3 cursor-pointer mb-4">
                    <input
                      type="checkbox"
                      checked={quietHoursEnabled}
                      onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                      className="w-5 h-5 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="text-white">Quiet Hours</p>
                      <p className="text-xs text-slate-500">Mute non-critical alerts during set times</p>
                    </div>
                  </label>

                  {quietHoursEnabled && (
                    <div className="flex items-center gap-4 ml-8">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Start</label>
                        <input
                          type="time"
                          value={quietHoursStart}
                          onChange={(e) => setQuietHoursStart(e.target.value)}
                          className="px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white"
                        />
                      </div>
                      <span className="text-slate-500 mt-5">to</span>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">End</label>
                        <input
                          type="time"
                          value={quietHoursEnd}
                          onChange={(e) => setQuietHoursEnd(e.target.value)}
                          className="px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeSection === 'alerts' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-white">Alert Settings</h2>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Alert Volume: {alertVolume}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={alertVolume}
                    onChange={(e) => setAlertVolume(Number(e.target.value))}
                    className="w-full max-w-md h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Initial volume for alerts (escalates over time if unacknowledged)
                  </p>
                </div>

                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <h3 className="text-amber-400 font-medium mb-2">Alert Escalation</h3>
                  <p className="text-sm text-slate-300">
                    Unacknowledged alerts automatically increase in volume over time:
                  </p>
                  <ul className="text-sm text-slate-400 mt-2 space-y-1">
                    <li>• Level 1: Gentle chime (your set volume)</li>
                    <li>• Level 2: Repeated tone (+50% volume)</li>
                    <li>• Level 3: Urgent alarm (max volume)</li>
                    <li>• Level 4: Push notifications sent</li>
                  </ul>
                </div>
              </div>
            )}

            {activeSection === 'privacy' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-white">Privacy & Data</h2>

                <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                  <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Your Privacy Matters
                  </h3>
                  <ul className="text-sm text-slate-300 space-y-2">
                    <li>• All video processing happens locally in your browser</li>
                    <li>• Frames are only kept for 5-10 minutes (rolling buffer)</li>
                    <li>• No video data is stored on servers unless flagged</li>
                    <li>• Flagged content is anonymized before human review</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-white font-medium mb-2">Data Storage</h3>
                  <p className="text-sm text-slate-400 mb-4">
                    Preferences use localStorage. Frames, profiles and recorded sounds use IndexedDB.
                    Clearing local data removes all of these and the SafeOS offline cache.
                  </p>
                  <button
                    onClick={async () => {
                      if (confirm('This will delete all local data. Are you sure?')) {
                        try {
                          await clearLocalData();
                          window.location.reload();
                        } catch {
                          setSaveMessage({ type: 'error', text: 'Could not clear all local data. Please try again.' });
                        }
                      }
                    }}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg transition-colors"
                  >
                    Clear All Local Data
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
