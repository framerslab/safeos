/**
 * Settings Panel Component
 *
 * Comprehensive settings panel for user preferences.
 *
 * @module components/SettingsPanel
 */

'use client';

import React, { useState } from 'react';
import { useAuthStore } from '../stores/auth-store';

// =============================================================================
// Types
// =============================================================================

type TabId = 'general' | 'notifications' | 'privacy' | 'advanced';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

// =============================================================================
// Tabs
// =============================================================================

const tabs: Tab[] = [
  {
    id: 'general',
    label: 'General',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
];

// =============================================================================
// Component
// =============================================================================

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const { profile, updatePreferences, updateNotificationSettings } = useAuthStore();
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Runs a profile save from a control, and says so when it was not taken. */
  const save = (change: Promise<void>) => {
    setSaveError(null);
    change.catch(() => setSaveError('The change was not saved. Try again.'));
  };

  const preferences = profile?.preferences || {
    defaultScenario: 'pet',
    motionSensitivity: 0.5,
    audioSensitivity: 0.5,
    alertVolume: 0.7,
    theme: 'dark',
  };

  const notificationSettings = profile?.notificationSettings || {
    browserPush: true,
    sms: false,
    telegram: false,
    emailDigest: false,
    quietHoursStart: null,
    quietHoursEnd: null,
  };

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors
              ${activeTab === tab.id
                ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-700/30'
                : 'text-slate-400 hover:text-white'
              }
            `}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        {saveError && (
          <p role="alert" className="mb-4 text-sm text-red-400">{saveError}</p>
        )}
        {/* General Settings */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-white mb-4">General Settings</h3>

              {/* Default Scenario */}
              <div className="mb-6">
                <label className="block text-sm text-slate-400 mb-2">Default Monitoring Profile</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(['pet', 'baby', 'elderly'] as const).map((scenario) => (
                    <button
                      key={scenario}
                      onClick={() => save(updatePreferences({ defaultScenario: scenario }))}
                      className={`
                        px-4 py-3 rounded-lg text-center transition-all
                        ${preferences.defaultScenario === scenario
                          ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400'
                          : 'bg-slate-700/50 border-2 border-slate-600 text-slate-300 hover:border-slate-500'
                        }
                      `}
                    >
                      <span className="text-2xl block mb-1">
                        {scenario === 'pet' ? (
                          <svg className="w-6 h-6 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <circle cx="11" cy="4" r="2" />
                            <circle cx="18" cy="8" r="2" />
                            <circle cx="20" cy="16" r="2" />
                            <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
                          </svg>
                        ) : scenario === 'baby' ? (
                          <svg className="w-6 h-6 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <circle cx="12" cy="8" r="4" />
                            <path d="M20 21a8 8 0 1 0-16 0" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <circle cx="12" cy="5" r="3" />
                            <path d="M12 8v4m0 0-2 8m2-8 2 8" />
                            <path d="M6 13h4m4 0h4" />
                          </svg>
                        )}
                      </span>
                      <span className="text-sm capitalize">{scenario}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Motion Sensitivity */}
              <div className="mb-6">
                <label className="block text-sm text-slate-400 mb-2">
                  Motion Sensitivity: {Math.round(preferences.motionSensitivity * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={preferences.motionSensitivity * 100}
                  onChange={(e) => save(updatePreferences({ motionSensitivity: parseInt(e.target.value) / 100 }))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>

              {/* Audio Sensitivity */}
              <div className="mb-6">
                <label className="block text-sm text-slate-400 mb-2">
                  Audio Sensitivity: {Math.round(preferences.audioSensitivity * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={preferences.audioSensitivity * 100}
                  onChange={(e) => save(updatePreferences({ audioSensitivity: parseInt(e.target.value) / 100 }))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>

              {/* Alert Volume */}
              <div className="mb-6">
                <label className="block text-sm text-slate-400 mb-2">
                  Alert Volume: {Math.round(preferences.alertVolume * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={preferences.alertVolume * 100}
                  onChange={(e) => save(updatePreferences({ alertVolume: parseInt(e.target.value) / 100 }))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              {/* Theme */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Theme</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(['dark', 'light', 'system'] as const).map((theme) => (
                    <button
                      key={theme}
                      onClick={() => save(updatePreferences({ theme }))}
                      className={`
                        px-4 py-2 rounded-lg text-sm capitalize transition-all
                        ${preferences.theme === theme
                          ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400'
                          : 'bg-slate-700/50 border-2 border-slate-600 text-slate-300 hover:border-slate-500'
                        }
                      `}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notification Settings */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-white mb-4">Notification Channels</h3>

            <div className="space-y-4">
              {/* Browser Notifications */}
              <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">Browser Notifications</p>
                    <p className="text-sm text-slate-400">Alerts on this device while your browser/app is running</p>
                  </div>
                </div>
                <div className="min-w-[44px] min-h-[44px] flex items-center justify-end">
                  <button
                    onClick={() => save(updateNotificationSettings({ browserPush: !notificationSettings.browserPush }))}
                    className={`
                      relative w-12 h-6 rounded-full transition-colors
                      ${notificationSettings.browserPush ? 'bg-emerald-500' : 'bg-slate-600'}
                    `}
                  >
                    <span
                      className={`
                        absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform
                        ${notificationSettings.browserPush ? 'left-6' : 'left-0.5'}
                      `}
                    />
                  </button>
                </div>
              </div>

              {/* SMS */}
              <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">SMS Alerts</p>
                    <p className="text-sm text-slate-400">Optional (requires monitoring server + provider credentials)</p>
                  </div>
                </div>
                <div className="min-w-[44px] min-h-[44px] flex items-center justify-end">
                  <button
                    onClick={() => save(updateNotificationSettings({ sms: !notificationSettings.sms }))}
                    title="Requires a monitoring server (API) + SMS provider credentials (e.g. Twilio)."
                    className={`
                      relative w-12 h-6 rounded-full transition-colors
                      ${notificationSettings.sms ? 'bg-emerald-500' : 'bg-slate-600'}
                    `}
                  >
                    <span
                      className={`
                        absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform
                        ${notificationSettings.sms ? 'left-6' : 'left-0.5'}
                      `}
                    />
                  </button>
                </div>
              </div>

              {/* Telegram */}
              <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.442-.751-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.12.099.153.231.168.366.015.106.023.339.008.525z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">Telegram</p>
                    <p className="text-sm text-slate-400">Optional (requires monitoring server + bot credentials)</p>
                  </div>
                </div>
                <div className="min-w-[44px] min-h-[44px] flex items-center justify-end">
                  <button
                    onClick={() => save(updateNotificationSettings({ telegram: !notificationSettings.telegram }))}
                    title="Requires a monitoring server (API) + Telegram bot credentials."
                    className={`
                      relative w-12 h-6 rounded-full transition-colors
                      ${notificationSettings.telegram ? 'bg-emerald-500' : 'bg-slate-600'}
                    `}
                  >
                    <span
                      className={`
                        absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform
                        ${notificationSettings.telegram ? 'left-6' : 'left-0.5'}
                      `}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Privacy Settings */}
        {activeTab === 'privacy' && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-white mb-4">Privacy & Data</h3>

            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <h4 className="text-emerald-400 font-medium mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Privacy First
              </h4>
              <p className="text-sm text-slate-300">
                SafeOS is designed with privacy at its core:
              </p>
              <ul className="text-sm text-slate-400 mt-2 space-y-1">
                <li>• Video frames are processed locally and discarded</li>
                <li>• Only 5-10 minutes of data in rolling buffer</li>
                <li>• No cloud storage of video or audio</li>
                <li>• All data stored in your browser&apos;s IndexedDB</li>
              </ul>
            </div>

            <div className="space-y-4">
              <button className="w-full flex items-center justify-between p-4 bg-slate-700/30 rounded-lg text-left hover:bg-slate-700/50 transition-colors">
                <div>
                  <p className="text-white font-medium">Export My Data</p>
                  <p className="text-sm text-slate-400">Download all your data</p>
                </div>
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>

              <button className="w-full flex items-center justify-between p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-left hover:bg-red-500/20 transition-colors">
                <div>
                  <p className="text-red-400 font-medium">Delete All Data</p>
                  <p className="text-sm text-slate-400">Clear all local data</p>
                </div>
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Advanced Settings */}
        {activeTab === 'advanced' && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-white mb-4">Advanced Settings</h3>

            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg" role="alert">
              <p className="text-sm text-amber-400 flex items-start gap-2">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>These settings are for advanced users. Changing them may affect performance.</span>
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-700/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white font-medium">Analysis Interval</p>
                  <span className="text-sm text-slate-400">5 seconds</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="30"
                  defaultValue="5"
                  className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>1s (fast)</span>
                  <span>30s (battery saver)</span>
                </div>
              </div>

              <div className="p-4 bg-slate-700/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white font-medium">Cloud Fallback</p>
                  <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded">Enabled</span>
                </div>
                <p className="text-sm text-slate-400">
                  Use cloud AI when local analysis fails or is too slow.
                </p>
              </div>

              <div className="p-4 bg-slate-700/30 rounded-lg">
                <p className="text-white font-medium mb-2">API Endpoint</p>
                <input
                  type="text"
                  defaultValue="http://localhost:3001"
                  className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-sm text-white"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsPanel;


























